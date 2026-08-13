import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OperationalSqliteStore,
  OperationalStoreError,
} from "../src/operational/sqlite-store.js";

const requiredTables = [
  "command_idempotency",
  "conversation_messages",
  "decision_trace_events",
  "diagnoses",
  "learning_capture_outbox",
  "operational_events",
  "operational_import_resolutions",
  "operational_metadata",
  "recommendation_revisions",
  "recommendations",
  "schema_migrations",
  "ticket_revisions",
  "tickets",
] as const;

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryDatabasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "operational-store-"));
  temporaryRoots.push(root);
  return join(root, "nested", "operational.sqlite");
}

describe("OperationalSqliteStore migrations and transaction boundary", () => {
  it("initializes the complete versioned schema and enforces deferred foreign keys", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path);
    store.initialize();

    const inspector = new Database(path, { readonly: true });
    const tableNames = (inspector.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>).map(({ name }) => name);
    const migrations = inspector.prepare(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    ).all();
    const metadata = inspector.prepare(
      "SELECT key, value FROM operational_metadata ORDER BY key",
    ).all();
    inspector.close();

    expect(tableNames).toEqual([...requiredTables].sort());
    expect(migrations).toEqual([
      { version: 1, name: "initial-operational-schema" },
      { version: 2, name: "immutable-diagnosis-review-payload" },
    ]);
    expect(metadata).toEqual([
      { key: "import_state", value: "empty" },
      { key: "schema_version", value: "2" },
    ]);

    expect(() => store.transaction((unit) => {
      unit.appendTicketRevision({
        ticketId: "TKT-0001",
        revision: 0,
        ticket: ticket(),
        operationalEventId: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-08-10T10:00:00.000Z",
      });
    })).toThrowError(OperationalStoreError);
    store.close();
  });

  it("fails closed for newer and structurally corrupt schemas without overwriting them", () => {
    const newerPath = temporaryDatabasePath();
    const newer = OperationalSqliteStore.open(newerPath);
    newer.initialize();
    newer.close();
    const newerRaw = new Database(newerPath);
    newerRaw.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (999, 'future', ?)")
      .run("2026-08-10T10:00:00.000Z");
    newerRaw.close();

    const reopenedNewer = OperationalSqliteStore.open(newerPath);
    expect(() => reopenedNewer.initialize()).toThrow(/newer schema version/i);
    reopenedNewer.close();
    const newerInspector = new Database(newerPath, { readonly: true });
    expect(newerInspector.prepare("SELECT MAX(version) AS version FROM schema_migrations").get())
      .toEqual({ version: 999 });
    newerInspector.close();

    const corruptPath = temporaryDatabasePath();
    mkdirSync(dirname(corruptPath), { recursive: true });
    const corruptRaw = new Database(corruptPath);
    corruptRaw.exec(`
      CREATE TABLE schema_migrations(version TEXT NOT NULL);
      CREATE TABLE preserve_me(value TEXT NOT NULL);
      INSERT INTO preserve_me(value) VALUES ('untouched');
    `);
    corruptRaw.close();

    const corrupt = OperationalSqliteStore.open(corruptPath);
    expect(() => corrupt.initialize()).toThrow(/corrupt operational schema/i);
    corrupt.close();
    const corruptInspector = new Database(corruptPath, { readonly: true });
    expect(corruptInspector.prepare("SELECT value FROM preserve_me").get())
      .toEqual({ value: "untouched" });
    corruptInspector.close();
  });

  it("fails migration explicitly when legacy diagnosis rows cannot gain an original audit losslessly", () => {
    const path = temporaryDatabasePath();
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.transaction((unit) => {
      unit.insertTicket(ticket());
      unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent({
        id: "11111111-1111-4111-8111-111111111111",
        ticketId: "TKT-0001",
        sequence: 1,
        occurredAt: "2026-08-10T10:02:00.000Z",
        actor: "support-lead",
        action: "diagnosis-completed",
        commandId: "33333333-3333-4333-8333-333333333333",
        facts: { diagnosisOutcome: "completed" },
      });
    });
    initialized.close();

    const legacy = new Database(path);
    legacy.prepare("DELETE FROM schema_migrations WHERE version > 1").run();
    legacy.prepare("UPDATE operational_metadata SET value = '1' WHERE key = 'schema_version'").run();
    const oldRecord = {
      diagnosis: {
        id: "diagnosis-11111111-1111-4111-8111-111111111111",
        ticketId: "TKT-0001",
        problem: "Credential rotation left requests unauthorized.",
        symptoms: ["Requests return 401."],
        evidenceUsed: ["Request req-123 returned 401."],
        evidenceReferences: [],
        ownerTeam: "api-platform",
        fixSteps: ["Refresh the deployment credential."],
        verificationSteps: ["Confirm a new request succeeds."],
        completedAt: "2026-08-10T10:02:00.000Z",
      },
      operationalEventId: "11111111-1111-4111-8111-111111111111",
    };
    legacy.prepare(`
      INSERT INTO diagnoses(id, ticket_id, operational_event_id, completed_at, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      oldRecord.diagnosis.id,
      oldRecord.diagnosis.ticketId,
      oldRecord.operationalEventId,
      oldRecord.diagnosis.completedAt,
      JSON.stringify(oldRecord),
    );
    legacy.close();

    const reopened = OperationalSqliteStore.open(path);
    let migrationError: unknown;
    try {
      reopened.initialize();
    } catch (error) {
      migrationError = error;
    } finally {
      reopened.close();
    }
    expect(migrationError).toMatchObject({
      code: "SCHEMA_ERROR",
      message: expect.stringMatching(/cannot be upgraded losslessly/i),
    });

    const inspector = new Database(path, { readonly: true });
    expect(inspector.prepare("SELECT payload_json FROM diagnoses").get())
      .toEqual({ payload_json: JSON.stringify(oldRecord) });
    inspector.close();
  });

  it("fails closed when required columns, indexes, or append-only triggers are missing without repairing the database", () => {
    const path = temporaryDatabasePath();
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.transaction((unit) => unit.insertTicket(ticket()));
    initialized.close();

    const corruptRaw = new Database(path);
    corruptRaw.exec(`
      ALTER TABLE tickets RENAME COLUMN updated_at TO modified_at;
      DROP INDEX operational_events_command_idx;
      DROP TRIGGER operational_events_no_update;
    `);
    corruptRaw.close();

    const corrupt = OperationalSqliteStore.open(path);
    expect(() => corrupt.initialize()).toThrow(/corrupt operational schema/i);
    corrupt.close();

    const inspector = new Database(path, { readonly: true });
    expect(inspector.prepare("SELECT COUNT(*) AS count FROM tickets").get()).toEqual({ count: 1 });
    expect((inspector.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>).map(({ name }) => name))
      .toEqual(["id", "revision", "modified_at", "payload_json"]);
    expect(inspector.prepare(`
      SELECT type, name FROM sqlite_master
      WHERE name IN ('operational_events_command_idx', 'operational_events_no_update')
      ORDER BY name
    `).all()).toEqual([]);
    inspector.close();
  });

  it("fails closed when foreign_key_check finds persisted orphan records", () => {
    const path = temporaryDatabasePath();
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.close();

    const corruptRaw = new Database(path);
    corruptRaw.pragma("foreign_keys = OFF");
    const orphan = {
      id: "11111111-1111-4111-8111-111111111111",
      ticketId: "TKT-9999",
      sequence: 1,
      occurredAt: "2026-08-10T10:00:00.000Z",
      actor: "support-lead",
      action: "ticket-updated",
      commandId: "33333333-3333-4333-8333-333333333333",
      facts: {},
    };
    corruptRaw.prepare(`
      INSERT INTO operational_events(
        id, ticket_id, sequence, occurred_at, actor, action, command_id, facts_json, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orphan.id,
      orphan.ticketId,
      orphan.sequence,
      orphan.occurredAt,
      orphan.actor,
      orphan.action,
      orphan.commandId,
      JSON.stringify(orphan.facts),
      JSON.stringify(orphan),
    );
    corruptRaw.close();

    const corrupt = OperationalSqliteStore.open(path);
    expect(() => corrupt.initialize()).toThrow(/foreign-key violations/i);
    corrupt.close();
    const inspector = new Database(path, { readonly: true });
    expect(inspector.prepare("SELECT ticket_id FROM operational_events").all())
      .toEqual([{ ticket_id: "TKT-9999" }]);
    inspector.close();
  });

  it("rolls back synchronous failures and rejects async callbacks before invoking them", () => {
    const store = OperationalSqliteStore.open(temporaryDatabasePath());
    store.initialize();

    expect(() => store.transaction((unit) => {
      unit.insertTicket(ticket());
      throw new Error("injected failure");
    })).toThrow("injected failure");
    expect(() => store.readTicket("TKT-0001")).toThrow(/not found/i);

    let asyncCallbackRan = false;
    expect(() => store.transaction(async () => {
      asyncCallbackRan = true;
      return "not allowed";
    })).toThrow(/synchronous/i);
    expect(asyncCallbackRan).toBe(false);

    expect(() => store.transaction(() => Promise.resolve("also not allowed")))
      .toThrow(/promise/i);
    store.close();
  });

  it("uses a bounded busy timeout and makes close idempotent", () => {
    const path = temporaryDatabasePath();
    const first = OperationalSqliteStore.open(path, { busyTimeoutMs: 80 });
    const second = OperationalSqliteStore.open(path, { busyTimeoutMs: 80 });
    first.initialize();
    second.initialize();

    const locker = new Database(path);
    locker.exec("BEGIN IMMEDIATE");
    const startedAt = Date.now();
    expect(() => second.transaction(() => undefined)).toThrow(/busy|locked/i);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    locker.exec("ROLLBACK");
    locker.close();

    first.close();
    first.close();
    second.close();
    const reopened = OperationalSqliteStore.open(path);
    reopened.initialize();
    reopened.close();
  });
});

function ticket() {
  return {
    id: "TKT-0001" as const,
    createdAt: "2026-08-10T09:00:00.000Z",
    updatedAt: "2026-08-10T09:00:00.000Z",
    customer: { name: "Ada", plan: "Pro", region: "EU", vip: false },
    subject: "Requests fail",
    description: "Requests return 401 after credential rotation.",
    status: "triage" as const,
    tags: [],
    sla: { responseDueAt: "2026-08-10T11:00:00.000Z", breached: false },
    relatedTicketIds: [],
    revision: 0,
  };
}
