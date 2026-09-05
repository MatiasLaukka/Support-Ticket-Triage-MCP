import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
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
  "diagnostic_taxonomy_revisions",
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
  function downgradeToV2(databasePath: string): void {
    const database = new Database(databasePath);
    database.exec("DROP INDEX IF EXISTS diagnostic_taxonomy_revisions_event_idx");
    database.exec("DROP TABLE IF EXISTS diagnostic_taxonomy_revisions");
    database.exec(`
      ALTER TABLE command_idempotency RENAME TO command_idempotency_current;
      CREATE TABLE command_idempotency (
        command_id TEXT PRIMARY KEY NOT NULL,
        operation TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO command_idempotency(command_id, operation, request_hash, result_json, created_at)
      SELECT command_id, operation, request_hash, result_json, created_at
      FROM command_idempotency_current;
      DROP TABLE command_idempotency_current;
      CREATE INDEX command_idempotency_operation_idx ON command_idempotency(operation, command_id);
    `);
    database.prepare("DELETE FROM schema_migrations WHERE version > 2").run();
    database.prepare(
      "UPDATE operational_metadata SET value = '2' WHERE key = 'schema_version'",
    ).run();
    database.close();
  }

  function downgradeToV3(databasePath: string): void {
    const database = new Database(databasePath);
    database.exec(`
      ALTER TABLE command_idempotency RENAME TO command_idempotency_v4;
      CREATE TABLE command_idempotency (
        command_id TEXT PRIMARY KEY NOT NULL,
        operation TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO command_idempotency(command_id, operation, request_hash, result_json, created_at)
      SELECT command_id, operation, request_hash, result_json, created_at
      FROM command_idempotency_v4;
      DROP TABLE command_idempotency_v4;
      CREATE INDEX command_idempotency_operation_idx ON command_idempotency(operation, command_id);
    `);
    database.prepare("DELETE FROM schema_migrations WHERE version > 3").run();
    database.prepare(
      "UPDATE operational_metadata SET value = '3' WHERE key = 'schema_version'",
    ).run();
    database.close();
  }

  it("migrates an authentic v2 database to v4 without fabricating taxonomy revisions", () => {
    const path = temporaryDatabasePath();
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.close();
    downgradeToV2(path);

    const migrated = OperationalSqliteStore.open(path);
    migrated.initialize();
    migrated.close();

    const inspector = new Database(path, { readonly: true });
    try {
      expect(inspector.prepare(
        "SELECT version, name FROM schema_migrations ORDER BY version",
      ).all()).toEqual([
        { version: 1, name: "initial-operational-schema" },
        { version: 2, name: "immutable-diagnosis-review-payload" },
        { version: 3, name: "diagnostic-taxonomy-revisions" },
        { version: 4, name: "versioned-command-request-identity" },
      ]);
      expect(inspector.prepare(
        "SELECT value FROM operational_metadata WHERE key = 'schema_version'",
      ).get()).toEqual({ value: "4" });
      expect(inspector.prepare(
        "SELECT COUNT(*) AS count FROM diagnostic_taxonomy_revisions",
      ).get()).toEqual({ count: 0 });
    } finally {
      inspector.close();
    }
  });

  it("rejects a tampered v2 physical schema before applying the v3 migration", () => {
    const path = temporaryDatabasePath();
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.close();
    downgradeToV2(path);

    const tampered = new Database(path);
    tampered.exec("DROP INDEX operational_events_command_idx");
    tampered.close();

    const reopened = OperationalSqliteStore.open(path);
    expect(() => reopened.initialize()).toThrow(/corrupt operational schema/i);
    reopened.close();

    const inspector = new Database(path, { readonly: true });
    expect(inspector.prepare(
      "SELECT version FROM schema_migrations ORDER BY version",
    ).all()).toEqual([{ version: 1 }, { version: 2 }]);
    expect(inspector.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'diagnostic_taxonomy_revisions'",
    ).get()).toBeUndefined();
    inspector.close();
  });

  it("initializes a fresh database at v4 and validates the v4 physical schema", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path);
    store.initialize();
    store.close();

    const reopened = OperationalSqliteStore.open(path);
    expect(() => reopened.initialize()).not.toThrow();
    reopened.close();

    const inspector = new Database(path, { readonly: true });
    try {
      expect(inspector.prepare(
        "SELECT value FROM operational_metadata WHERE key = 'schema_version'",
      ).get()).toEqual({ value: "4" });
      expect(inspector.prepare(
        "SELECT COUNT(*) AS count FROM diagnostic_taxonomy_revisions",
      ).get()).toEqual({ count: 0 });
    } finally {
      inspector.close();
    }
  });

  it("migrates v3 receipts additively and preserves legacy receipt bytes", () => {
    const path = temporaryDatabasePath();
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.close();

    const before = new Database(path);
    before.prepare(`
      INSERT INTO command_idempotency(command_id, operation, request_hash, result_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      "33333333-3333-4333-8333-333333333333",
      "ticket-update",
      "a".repeat(64),
      JSON.stringify({ operation: "ticket-update", tickets: [{
        ticketId: "TKT-0001", operationalEventIds: [], resultingRevision: null,
      }] }),
      "2026-09-05T10:00:00.000Z",
    );
    const beforeRow = before.prepare(
      "SELECT command_id, operation, request_hash, result_json, created_at FROM command_idempotency",
    ).get();
    before.close();
    downgradeToV3(path);

    const migrated = OperationalSqliteStore.open(path);
    migrated.initialize();
    migrated.close();

    const inspector = new Database(path, { readonly: true });
    try {
      expect(inspector.prepare(
        "SELECT command_id, operation, request_hash, result_json, created_at FROM command_idempotency",
      ).get()).toEqual(beforeRow);
      expect(inspector.prepare(
        "SELECT request_hash_version FROM command_idempotency WHERE command_id = ?",
      ).get("33333333-3333-4333-8333-333333333333")).toEqual({ request_hash_version: 1 });
      expect(inspector.prepare(
        "SELECT version, name FROM schema_migrations ORDER BY version",
      ).all()).toEqual([
        { version: 1, name: "initial-operational-schema" },
        { version: 2, name: "immutable-diagnosis-review-payload" },
        { version: 3, name: "diagnostic-taxonomy-revisions" },
        { version: 4, name: "versioned-command-request-identity" },
      ]);
      expect(inspector.prepare(
        "SELECT value FROM operational_metadata WHERE key = 'schema_version'",
      ).get()).toEqual({ value: "4" });
    } finally {
      inspector.close();
    }
  });

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
      { version: 3, name: "diagnostic-taxonomy-revisions" },
      { version: 4, name: "versioned-command-request-identity" },
    ]);
    expect(metadata).toEqual([
      { key: "import_state", value: "empty" },
      { key: "schema_version", value: "4" },
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
    downgradeToV2(path);

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

  it.each([
    ["index", "DROP INDEX operational_events_command_idx"],
    ["trigger", "DROP TRIGGER operational_events_no_update"],
  ])("validates every legacy schema %s before recording the v2 migration", (_kind, corruption) => {
    const path = temporaryDatabasePath();
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.close();
    downgradeToV2(path);

    const legacy = new Database(path);
    legacy.prepare("DELETE FROM schema_migrations WHERE version = 2").run();
    legacy.prepare("UPDATE operational_metadata SET value = '1' WHERE key = 'schema_version'").run();
    legacy.exec(corruption);
    legacy.close();
    const beforeMigrationAttempt = readFileSync(path);

    const reopened = OperationalSqliteStore.open(path);
    expect(() => reopened.initialize()).toThrow(/corrupt operational schema/i);
    reopened.close();

    const inspector = new Database(path, { readonly: true });
    const migrations = inspector.prepare(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    ).all();
    const metadata = inspector.prepare(
      "SELECT value FROM operational_metadata WHERE key = 'schema_version'",
    ).get();
    inspector.close();
    expect(migrations).toEqual([{ version: 1, name: "initial-operational-schema" }]);
    expect(metadata).toEqual({ value: "1" });
    expect(readFileSync(path)).toEqual(beforeMigrationAttempt);
  });

  it("holds the v1 migration write lock before checking for legacy diagnosis rows", async () => {
    const path = temporaryDatabasePath();
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.transaction((unit) => {
      unit.insertTicket(ticket());
      const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent({
        id: "11111111-1111-4111-8111-111111111111",
        ticketId: "TKT-0001",
        sequence: sequence!,
        occurredAt: "2026-08-10T10:02:00.000Z",
        actor: "support-lead",
        action: "diagnosis-completed",
        commandId: "33333333-3333-4333-8333-333333333333",
        facts: { diagnosisOutcome: "completed" },
      });
    });
    initialized.close();
    downgradeToV2(path);

    const legacy = new Database(path);
    legacy.prepare("DELETE FROM schema_migrations WHERE version = 2").run();
    legacy.prepare("UPDATE operational_metadata SET value = '1' WHERE key = 'schema_version'").run();
    legacy.exec("BEGIN IMMEDIATE");
    legacy.prepare(`
      INSERT INTO diagnoses(id, ticket_id, operational_event_id, completed_at, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      "diagnosis-11111111-1111-4111-8111-111111111111",
      "TKT-0001",
      "11111111-1111-4111-8111-111111111111",
      "2026-08-10T10:02:00.000Z",
      JSON.stringify({ legacy: "diagnosis-without-original-audit" }),
    );

    const worker = new Worker(LEGACY_MIGRATION_WORKER, {
      eval: true,
      workerData: {
        databasePath: path,
        moduleUrl: pathToFileURL(resolve("dist/src/operational/sqlite-store.js")).href,
      },
    });
    try {
      await workerMessage(worker, "initializing");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      legacy.exec("COMMIT");
      const result = await workerMessage(worker, "result") as {
        status: "initialized" | "rejected";
        code?: string;
      };
      expect(result).toMatchObject({ status: "rejected", code: "SCHEMA_ERROR" });
    } finally {
      if (legacy.inTransaction) legacy.exec("ROLLBACK");
      legacy.close();
      await worker.terminate();
    }

    const inspector = new Database(path, { readonly: true });
    const migrations = inspector.prepare(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    ).all();
    const metadata = inspector.prepare(
      "SELECT value FROM operational_metadata WHERE key = 'schema_version'",
    ).get();
    inspector.close();
    expect(migrations).toEqual([{ version: 1, name: "initial-operational-schema" }]);
    expect(metadata).toEqual({ value: "1" });
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

  it("classifies a corrupt persisted import state as an operational persistence failure", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path);
    store.initialize();
    const raw = new Database(path);
    raw.prepare("UPDATE operational_metadata SET value = ? WHERE key = 'import_state'")
      .run("impossible-state");
    raw.close();

    expect(() => store.readImportState()).toThrowError(
      expect.objectContaining({ code: "PERSISTENCE_ERROR" }),
    );
    store.close();
  });

  it("classifies an impossible persisted request hash version as an operational persistence failure", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path);
    store.initialize();
    const commandId = "33333333-3333-4333-8333-333333333334";
    const raw = new Database(path);
    raw.prepare(`
      INSERT INTO command_idempotency(
        command_id, operation, request_hash, request_hash_version, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      commandId,
      "ticket-update",
      "a".repeat(64),
      1,
      JSON.stringify({
        operation: "ticket-update",
        tickets: [{
          ticketId: "TKT-0001",
          operationalEventIds: ["33333333-3333-4333-8333-333333333336"],
          resultingRevision: null,
        }],
      }),
      "2026-09-05T10:00:00.000Z",
    );
    raw.pragma("ignore_check_constraints = ON");
    raw.prepare("UPDATE command_idempotency SET request_hash_version = 99 WHERE command_id = ?")
      .run(commandId);
    raw.close();

    expect(() => store.readCommandReceipt(commandId)).toThrowError(
      expect.objectContaining({ code: "PERSISTENCE_ERROR" }),
    );
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

  it("normalizes only deferred-read SQLite lock failures and preserves projection failures", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path, { busyTimeoutMs: 80 });
    store.initialize();
    const commandId = "33333333-3333-4333-8333-333333333335";
    const raw = new Database(path);
    raw.prepare(`
      INSERT INTO command_idempotency(
        command_id, operation, request_hash, request_hash_version, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      commandId,
      "ticket-update",
      "b".repeat(64),
      2,
      JSON.stringify({
        operation: "ticket-update",
        tickets: [{
          ticketId: "TKT-0001",
          operationalEventIds: ["33333333-3333-4333-8333-333333333337"],
          resultingRevision: null,
        }],
      }),
      "2026-09-05T10:00:00.000Z",
    );
    raw.exec("BEGIN EXCLUSIVE");
    try {
      expect(() => store.readCommandOutcome(commandId, () => "projected"))
        .toThrowError(expect.objectContaining({ code: "PERSISTENCE_ERROR" }));
    } finally {
      raw.exec("ROLLBACK");
      raw.close();
    }

    expect(() => store.readCommandOutcome(commandId, () => {
      throw new Error("replay projection failed");
    })).toThrow("replay projection failed");
    store.close();
  });

  it("stores taxonomy revision identity as single-column unique keys in schema v3", () => {
    const path = temporaryDatabasePath();

    const store = OperationalSqliteStore.open(path);
    store.initialize();
    store.close();

    const database = new Database(path, { readonly: true });

    try {
      const columns = database
        .prepare("PRAGMA table_info(diagnostic_taxonomy_revisions)")
        .all() as Array<{ name: string }>;

      const indexes = database
        .prepare("PRAGMA index_list(diagnostic_taxonomy_revisions)")
        .all() as Array<{
          name: string;
          unique: number;
        }>;

      const uniqueSingleColumnIndexes = indexes
        .filter(({ unique }) => unique === 1)
        .flatMap(({ name }) => {
          const indexedColumns = database
            .prepare(`PRAGMA index_info("${name}")`)
            .all() as Array<{ name: string }>;

          return indexedColumns.length === 1
            ? [indexedColumns[0]!.name]
            : [];
        })
        .sort();

      expect({
        hasIdColumn: columns.some(({ name }) => name === "id"),
        uniqueSingleColumnIndexes,
      }).toEqual({
        hasIdColumn: true,
        uniqueSingleColumnIndexes: [
          "id",
          "operational_event_id",
        ],
      });
    } finally {
      database.close();
    }
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

function workerMessage(worker: Worker, expectedType: string): Promise<unknown> {
  return new Promise((resolveMessage, rejectMessage) => {
    const onMessage = (message: { type?: string }) => {
      if (message.type !== expectedType) return;
      cleanup();
      resolveMessage(message);
    };
    const onError = (error: Error) => {
      cleanup();
      rejectMessage(error);
    };
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
  });
}

const LEGACY_MIGRATION_WORKER = String.raw`
  const { parentPort, workerData } = require("node:worker_threads");

  void (async () => {
    let store;
    try {
      const { OperationalSqliteStore } = await import(workerData.moduleUrl);
      store = OperationalSqliteStore.open(workerData.databasePath, { busyTimeoutMs: 2000 });
      parentPort.postMessage({ type: "initializing" });
      try {
        store.initialize();
        parentPort.postMessage({ type: "result", status: "initialized" });
      } catch (error) {
        parentPort.postMessage({
          type: "result",
          status: "rejected",
          code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      parentPort.postMessage({ type: "result", status: "fatal", message: String(error) });
    } finally {
      store?.close();
    }
  })();
`;
