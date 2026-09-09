import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketSchema, type Ticket } from "../src/domain.js";
import type { LearningCaptureEnvelope, OperationalOutboxRow } from "../src/operational/domain.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import type { DeliveryScheduler } from "../src/operational/learning-delivery-runner.js";
import { canonicalLearningJson } from "../src/knowledge-evolution/learning-ledger.js";

const roots: string[] = [];
const runtimes: Array<Awaited<ReturnType<typeof createRuntimeDependencies>>> = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("production runtime learning delivery", () => {
  it("delivers a new operational learning event during the runtime session", async () => {
    const root = await mkdtemp(join(tmpdir(), "runtime-learning-delivery-"));
    roots.push(root);
    const database = join(root, "operational.sqlite");
    resetOperationalDemoState({
      dataRoot: root,
      seedFile: resolve("data/seed/tickets.json"),
      operationalDatabase: database,
    });
    const store = OperationalSqliteStore.open(database);
    store.initialize();
    const ticket = seedTicket();
    const scheduler = new FakeScheduler();
    const runtime = await createRuntimeDependencies({
      operationalStore: store,
      scheduler,
      now: () => scheduler.now(),
      env: runtimeEnv(root, database),
    });
    runtimes.push(runtime);

    expect(runtime.learningDeliveryRunner).toBeDefined();
    expect(await runtime.knowledgeEvolution.ledger.list()).toEqual([]);
    const recordedDiagnosis = await runtime.service.recordDiagnosis({
      ticketId: ticket.id,
      actor: "runtime-test",
      diagnosedAt: "2026-09-09T00:00:01.000Z",
      diagnosis: {
        status: "completed",
        causeType: "platform-delay",
        customerSafeSummary: "The event-processing delay is understood.",
        evidenceUsed: ["request trace"],
        confidence: "confirmed",
        owner: "engineering",
        recommendedNextAction: "Apply the governed mitigation.",
        doNotSay: [],
      },
      knowledgeArticleIds: ["api-reference"],
    }, { commandId: "97000000-0000-4000-8000-000000000001" });

    await scheduler.advanceBy(1_000);

    await expect(runtime.knowledgeEvolution.ledger.list()).resolves.toMatchObject([{
      eventType: "diagnosis-recorded",
      ticketId: ticket.id,
      diagnosisId: recordedDiagnosis.id,
    }]);
  });

  it("keeps operational runtime mutations available when learning is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "runtime-learning-unavailable-"));
    roots.push(root);
    const database = join(root, "operational.sqlite");
    const badLedger = join(root, "learning.sqlite");
    resetOperationalDemoState({
      dataRoot: root,
      seedFile: resolve("data/seed/tickets.json"),
      operationalDatabase: database,
    });
    await writeFile(badLedger, "not a sqlite database\n", "utf8");
    const runtime = await createRuntimeDependencies({
      env: {
        ...runtimeEnv(root, database),
        TRIAGE_LEARNING_LEDGER_PATH: badLedger,
      },
    });
    runtimes.push(runtime);

    expect(runtime.learningAvailability.status).toBe("unavailable");
    expect(runtime.learningDeliveryRunner).toBeUndefined();
    await expect(runtime.service.addCustomerReply({
      ticketId: "TKT-1001",
      actor: "runtime-test",
      body: "Operational state remains available.",
      receivedAt: "2026-09-09T00:00:00.000Z",
      source: "runtime-test",
    }, { commandId: "97000000-0000-4000-8000-000000000002" })).resolves.toMatchObject({ action: "customer-reply-received" });
  });

  it("recovers a pending expired claim when a runtime restarts", async () => {
    const root = await mkdtemp(join(tmpdir(), "runtime-learning-restart-"));
    roots.push(root);
    const database = join(root, "operational.sqlite");
    resetOperationalDemoState({
      dataRoot: root,
      seedFile: resolve("data/seed/tickets.json"),
      operationalDatabase: database,
    });
    const store = OperationalSqliteStore.open(database);
    store.initialize();
    const ticket = seedTicket();
    const firstRuntime = await createRuntimeDependencies({
      operationalStore: store,
      scheduler: new FakeScheduler(),
      now: () => new Date("2026-09-09T00:00:00.000Z"),
      env: runtimeEnv(root, database),
    });
    runtimes.push(firstRuntime);
    await firstRuntime.close();

    const restartedStore = OperationalSqliteStore.open(database);
    restartedStore.initialize();
    appendLearningRow(restartedStore, ticket);
    const pendingBeforeUpgrade = restartedStore.readOutbox("98000000-0000-4000-8000-000000000001")!;
    const originalEnvelopeHash = createHash("sha256")
      .update(canonicalLearningJson(pendingBeforeUpgrade.envelope))
      .digest("hex");
    restartedStore.close();
    downgradeToV3(database);
    const migratedStore = OperationalSqliteStore.open(database);
    migratedStore.initialize();
    const pendingAfterUpgrade = migratedStore.readOutbox("98000000-0000-4000-8000-000000000001")!;
    expect(pendingAfterUpgrade).toEqual(pendingBeforeUpgrade);
    expect(createHash("sha256").update(canonicalLearningJson(pendingAfterUpgrade.envelope)).digest("hex"))
      .toBe(originalEnvelopeHash);
    expect(migratedStore.transaction((unit) => unit.claimPendingOutbox(
      "98000000-0000-4000-8000-000000000001",
      "expired-runtime-claim",
      "2026-09-09T00:00:00.000Z",
    ))).toBe(true);
    migratedStore.close();

    const scheduler = new FakeScheduler();
    scheduler.time = Date.parse("2026-09-09T00:10:00.000Z");
    const runtime = await createRuntimeDependencies({
      scheduler,
      now: () => scheduler.now(),
      env: runtimeEnv(root, database),
    });
    runtimes.push(runtime);

    await expect(runtime.knowledgeEvolution.ledger.list()).resolves.toMatchObject([{
      eventType: "diagnosis-recorded",
      diagnosisId: "diagnosis-runtime-delivery",
    }]);
    expect((runtime.operationalStore as OperationalSqliteStore).readOutbox("98000000-0000-4000-8000-000000000001"))
      .toMatchObject({
        status: "delivered",
        attempts: 2,
        deliveryKey: "99000000-0000-4000-8000-000000000002",
        envelope: {
          deliveryKey: "99000000-0000-4000-8000-000000000002",
          operationalEventId: "99000000-0000-4000-8000-000000000001",
          diagnosisId: "diagnosis-runtime-delivery",
        },
      });
    expect(runtime.knowledgeEvolution.ledger.getDatabase().prepare(
      "SELECT delivery_key, envelope_hash, event_id FROM learning_deliveries WHERE delivery_key = ?",
    ).get("99000000-0000-4000-8000-000000000002")).toEqual({
      delivery_key: "99000000-0000-4000-8000-000000000002",
      envelope_hash: originalEnvelopeHash,
      event_id: "99000000-0000-4000-8000-000000000002",
    });
  });

  it("waits for active delivery before closing its stores and joins repeated close calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "runtime-learning-close-"));
    roots.push(root);
    const database = join(root, "operational.sqlite");
    resetOperationalDemoState({
      dataRoot: root,
      seedFile: resolve("data/seed/tickets.json"),
      operationalDatabase: database,
    });
    const store = OperationalSqliteStore.open(database);
    store.initialize();
    const ticket = seedTicket();
    const scheduler = new FakeScheduler();
    const runtime = await createRuntimeDependencies({
      operationalStore: store,
      scheduler,
      now: () => scheduler.now(),
      env: runtimeEnv(root, database),
    });
    runtimes.push(runtime);

    let releaseDelivery!: () => void;
    let deliveryStarted = false;
    const deliveryBarrier = new Promise<void>((resolveBarrier) => {
      releaseDelivery = resolveBarrier;
    });
    const appendDelivery = vi.spyOn(runtime.knowledgeEvolution.ledger, "appendDelivery")
      .mockImplementation(async () => {
        deliveryStarted = true;
        await deliveryBarrier;
        return "delivered";
      });
    const storeClose = vi.spyOn(store, "close");
    const ledgerClose = vi.spyOn(runtime.knowledgeEvolution.ledger, "close");
    await runtime.service.recordDiagnosis({
      ticketId: ticket.id,
      actor: "runtime-test",
      diagnosedAt: "2026-09-09T00:00:01.000Z",
      diagnosis: {
        status: "completed",
        causeType: "platform-delay",
        customerSafeSummary: "The event-processing delay is understood.",
        evidenceUsed: ["request trace"],
        confidence: "confirmed",
        owner: "engineering",
        recommendedNextAction: "Apply the governed mitigation.",
        doNotSay: [],
      },
      knowledgeArticleIds: ["api-reference"],
    }, { commandId: "97000000-0000-4000-8000-000000000003" });

    const advancing = scheduler.advanceBy(1_000);
    for (let attempt = 0; attempt < 20 && !deliveryStarted; attempt += 1) {
      await Promise.resolve();
    }
    expect(deliveryStarted).toBe(true);

    const closing = Promise.all([runtime.close(), runtime.close()]);
    await Promise.resolve();
    expect(storeClose).not.toHaveBeenCalled();
    expect(ledgerClose).not.toHaveBeenCalled();

    releaseDelivery();
    await advancing;
    await closing;
    expect(storeClose).toHaveBeenCalledTimes(1);
    expect(ledgerClose).toHaveBeenCalledTimes(1);
  });
});

class FakeScheduler implements DeliveryScheduler {
  time = Date.parse("2026-09-09T00:00:00.000Z");
  private nextId = 1;
  private readonly jobs = new Map<number, { due: number; callback: () => void }>();

  now(): Date {
    return new Date(this.time);
  }

  schedule(delayMs: number, callback: () => void): { cancel(): void } {
    const id = this.nextId++;
    this.jobs.set(id, { due: this.time + delayMs, callback });
    return { cancel: () => this.jobs.delete(id) };
  }

  async advanceBy(milliseconds: number): Promise<void> {
    const target = this.time + milliseconds;
    while (true) {
      const next = [...this.jobs.entries()]
        .filter(([, job]) => job.due <= target)
        .sort(([, left], [, right]) => left.due - right.due)[0];
      if (next === undefined) {
        this.time = target;
        return;
      }
      const [id, job] = next;
      this.jobs.delete(id);
      this.time = job.due;
      job.callback();
      await Promise.resolve();
      await Promise.resolve();
    }
  }
}

function runtimeEnv(root: string, database: string): NodeJS.ProcessEnv {
  return {
    TRIAGE_DATA_ROOT: root,
    TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
    TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
    OPERATIONAL_DB_PATH: database,
    TRIAGE_LEARNING_LEDGER_PATH: join(root, "learning.sqlite"),
  };
}

function seedTicket(): Ticket {
  const tickets = TicketSchema.array().parse(JSON.parse(
    readFileSync(resolve("data/seed/tickets.json"), "utf8"),
  ));
  return tickets.find((ticket) => ticket.id === "TKT-1001")!;
}

function appendLearningRow(store: OperationalSqliteStore, ticket: Ticket): void {
  const envelope: LearningCaptureEnvelope = {
    operationalEventId: "99000000-0000-4000-8000-000000000001",
    deliveryKey: "99000000-0000-4000-8000-000000000002",
    eventType: "diagnosis-recorded",
    occurredAt: "2026-09-09T00:00:01.000Z",
    actor: "runtime-test",
    ticketId: ticket.id,
    diagnosisId: "diagnosis-runtime-delivery",
    evidenceIds: ["request-trace"],
    knowledgeArticleIds: ["api-reference"],
    provenance: "Sanitized runtime delivery test outcome.",
  };
  const row: OperationalOutboxRow = {
    id: "98000000-0000-4000-8000-000000000001",
    operationalEventId: envelope.operationalEventId,
    deliveryKey: envelope.deliveryKey,
    envelope,
    status: "pending",
    attempts: 0,
    createdAt: envelope.occurredAt,
  };
  store.transaction((unit) => {
    const [sequence] = unit.allocateEventSequences(ticket.id, 1);
    unit.appendEvent({
      id: envelope.operationalEventId,
      ticketId: ticket.id,
      sequence: sequence!,
      occurredAt: envelope.occurredAt,
      actor: envelope.actor,
      action: "diagnosis-completed",
      commandId: "97000000-0000-4000-8000-000000000001",
      facts: { diagnosisOutcome: "completed" },
    });
    unit.appendLearningCaptureOutbox(row);
  });
}

function downgradeToV3(databasePath: string): void {
  const database = new Database(databasePath);
  try {
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
    database.prepare("UPDATE operational_metadata SET value = '3' WHERE key = 'schema_version'").run();
  } finally {
    database.close();
  }
}
