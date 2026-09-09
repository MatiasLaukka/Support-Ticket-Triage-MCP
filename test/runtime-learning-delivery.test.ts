import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketSchema, type Ticket } from "../src/domain.js";
import type { LearningCaptureEnvelope, OperationalOutboxRow } from "../src/operational/domain.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import type { DeliveryScheduler } from "../src/operational/learning-delivery-runner.js";

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
    const store = OperationalSqliteStore.open(database);
    store.initialize();
    const ticket = seedTicket();
    store.transaction((unit) => unit.insertTicket(ticket));
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
    appendLearningRow(store, ticket);

    await scheduler.advanceBy(1_000);

    await expect(runtime.knowledgeEvolution.ledger.list()).resolves.toMatchObject([{
      eventType: "diagnosis-recorded",
      ticketId: ticket.id,
      diagnosisId: "diagnosis-runtime-delivery",
    }]);
  });

  it("keeps operational runtime mutations available when learning is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "runtime-learning-unavailable-"));
    roots.push(root);
    const badLedger = join(root, "learning.sqlite");
    await writeFile(badLedger, "not a sqlite database\n", "utf8");
    const runtime = await createRuntimeDependencies({
      legacyFixtureRepositories: true,
      env: {
        ...runtimeEnv(root, join(root, "unused.sqlite")),
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
    })).resolves.toMatchObject({ action: "customer-reply-received" });
  });

  it("waits for active delivery before closing its stores and joins repeated close calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "runtime-learning-close-"));
    roots.push(root);
    const database = join(root, "operational.sqlite");
    const store = OperationalSqliteStore.open(database);
    store.initialize();
    const ticket = seedTicket();
    store.transaction((unit) => unit.insertTicket(ticket));
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
    appendLearningRow(store, ticket);

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
