import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { TicketSchema } from "../src/domain.js";
import { LearningCaptureService } from "../src/knowledge-evolution/learning-capture.js";
import {
  canonicalLearningJson,
  LearningLedgerError,
} from "../src/knowledge-evolution/learning-ledger.js";
import { SqliteLearningLedger } from "../src/knowledge-evolution/sqlite-learning-ledger.js";
import type {
  LearningCaptureEnvelope,
  OperationalOutboxRow,
} from "../src/operational/domain.js";
import { OperationalOutboxRowSchema } from "../src/operational/domain.js";
import {
  LearningOutboxWorker,
  type OperationalLearningOutboxStore,
} from "../src/operational/learning-outbox.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import type { OperationalUnitOfWork } from "../src/operational/unit-of-work.js";
import { OperationalStoreError } from "../src/operational/unit-of-work.js";
import { createRuntimeDependencies } from "../src/runtime.js";

const ticketId = "TKT-4501" as const;
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("durable operational learning outbox", () => {
  it("selects a bounded deferred set in deterministic order", () => {
    const harness = openHarness();
    try {
      const envelopes = manyCaptureEnvelopes(26);
      appendRows(harness.store, envelopes);

      const due = harness.store.listDueOutbox({
        now: "2026-08-11T15:00:00.000+02:00",
        staleBefore: "2026-08-11T14:59:00.000+02:00",
        limit: 25,
        deferredUntil: { [outboxId(envelopes[0]!.operationalEventId)]: "2026-08-11T15:01:00.000+02:00" },
      });

      expect(due).toHaveLength(25);
      expect(due.map((row) => row.id)).toEqual(
        envelopes.slice(1).map((envelope) => outboxId(envelope.operationalEventId)),
      );
      for (const limit of [0, -1, 1.5, 26]) {
        expect(() => harness.store.listDueOutbox({
          now: "2026-08-11T13:00:00.000Z",
          staleBefore: "2026-08-11T12:59:00.000Z",
          limit,
          deferredUntil: {},
        })).toThrow(/limit/i);
      }
      expect(() => harness.store.listDueOutbox({
        now: "2026-08-11T13:00:00.000Z",
        staleBefore: "2026-08-11T13:01:00.000Z",
        limit: 25,
        deferredUntil: {},
      })).toThrow(/later than the current timestamp/i);
    } finally {
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("applies the SQL bound before parsing a later payload", () => {
    const harness = openHarness();
    try {
      const envelopes = manyCaptureEnvelopes(26);
      appendRows(harness.store, envelopes);
      const raw = new Database(join(harness.root, "operational.sqlite"));
      try {
        raw.prepare("UPDATE learning_capture_outbox SET envelope_json = ? WHERE id = ?")
          .run("{malformed", outboxId(envelopes[25]!.operationalEventId));
      } finally {
        raw.close();
      }

      const due = harness.store.listDueOutbox({
        now: "2026-08-11T13:00:00.000Z",
        staleBefore: "2026-08-11T12:59:00.000Z",
        limit: 25,
        deferredUntil: {},
      });

      expect(due.map((row) => row.id)).toEqual(
        envelopes.slice(0, 25).map((envelope) => outboxId(envelope.operationalEventId)),
      );
    } finally {
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("propagates corruption in a selected payload before claiming it", async () => {
    const harness = openHarness();
    try {
      const [envelope] = manyCaptureEnvelopes(1);
      appendRows(harness.store, [envelope!]);
      const raw = new Database(join(harness.root, "operational.sqlite"));
      try {
        raw.prepare("UPDATE learning_capture_outbox SET envelope_json = ? WHERE id = ?")
          .run("{malformed", outboxId(envelope!.operationalEventId));
      } finally {
        raw.close();
      }
      let deliveryCalls = 0;
      const worker = new LearningOutboxWorker({
        store: harness.store,
        delivery: {
          async deliverEnvelope() {
            deliveryCalls += 1;
            return "delivered" as const;
          },
        },
      });

      await expect(worker.drainDue({
        now: "2026-08-11T13:00:00.000Z",
        staleBefore: "2026-08-11T12:59:00.000Z",
        limit: 25,
        deferredUntil: {},
      })).rejects.toMatchObject({ code: "PERSISTENCE_ERROR" });
      expect(deliveryCalls).toBe(0);
      const inspection = new Database(join(harness.root, "operational.sqlite"));
      try {
        expect(inspection.prepare("SELECT claimed_by FROM learning_capture_outbox WHERE id = ?")
          .get(outboxId(envelope!.operationalEventId))).toMatchObject({ claimed_by: null });
      } finally {
        inspection.close();
      }
    } finally {
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("excludes fresh claims and includes expired claims", () => {
    const harness = openHarness();
    try {
      const envelopes = manyCaptureEnvelopes(3);
      appendRows(harness.store, envelopes);
      expect(harness.store.transaction((unit) => unit.claimPendingOutbox(
        outboxId(envelopes[0]!.operationalEventId),
        "fresh-worker",
        "2026-08-11T12:59:30.000Z",
      ))).toBe(true);
      expect(harness.store.transaction((unit) => unit.claimPendingOutbox(
        outboxId(envelopes[1]!.operationalEventId),
        "expired-worker",
        "2026-08-11T12:58:00.000Z",
      ))).toBe(true);

      const due = harness.store.listDueOutbox({
        now: "2026-08-11T13:00:00.000Z",
        staleBefore: "2026-08-11T12:59:00.000Z",
        limit: 25,
        deferredUntil: {},
      });

      expect(due.map((row) => row.id)).toEqual([
        outboxId(envelopes[1]!.operationalEventId),
        outboxId(envelopes[2]!.operationalEventId),
      ]);
    } finally {
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("returns an outcome for every due row and continues after retryable failure", async () => {
    const harness = openHarness();
    try {
      const envelopes = manyCaptureEnvelopes(3);
      appendRows(harness.store, envelopes);
      const worker = new LearningOutboxWorker({
        store: harness.store,
        delivery: {
          async deliverEnvelope(envelope) {
            if (envelope.operationalEventId === envelopes[0]!.operationalEventId) {
              throw new LearningLedgerError("temporary ledger failure", "PERSISTENCE_ERROR");
            }
            if (envelope.operationalEventId === envelopes[2]!.operationalEventId) {
              throw new LearningLedgerError("invalid immutable payload", "INVALID_EVENT");
            }
            return "delivered" as const;
          },
        },
        now: () => new Date("2026-08-11T13:00:00.000Z"),
        claimToken: (() => {
          let index = 0;
          return () => `worker-${++index}`;
        })(),
      });

      await expect(worker.drainDue({
        now: "2026-08-11T13:00:00.000Z",
        staleBefore: "2026-08-11T12:59:00.000Z",
        limit: 25,
        deferredUntil: {},
      })).resolves.toEqual([
        { id: outboxId(envelopes[0]!.operationalEventId), outcome: "retryable" },
        { id: outboxId(envelopes[1]!.operationalEventId), outcome: "delivered" },
        { id: outboxId(envelopes[2]!.operationalEventId), outcome: "dead-letter" },
      ]);
      expect(harness.store.readOutbox(outboxId(envelopes[0]!.operationalEventId))).toMatchObject({
        status: "pending",
        attempts: 1,
      });
      expect(harness.store.readOutbox(outboxId(envelopes[1]!.operationalEventId))).toMatchObject({
        status: "delivered",
        attempts: 1,
      });
      expect(harness.store.readOutbox(outboxId(envelopes[2]!.operationalEventId))).toMatchObject({
        status: "dead-letter",
        attempts: 1,
      });
    } finally {
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("reports a candidate that loses its claim before delivery", async () => {
    const harness = openHarness();
    const secondStore = OperationalSqliteStore.open(join(harness.root, "operational.sqlite"));
    secondStore.initialize();
    try {
      const [envelope] = manyCaptureEnvelopes(1);
      appendRows(harness.store, [envelope!]);
      let deliveryCalls = 0;
      const worker = new LearningOutboxWorker({
        store: harness.store,
        delivery: {
          async deliverEnvelope() {
            deliveryCalls += 1;
            return "delivered" as const;
          },
        },
        claimToken: () => {
          expect(secondStore.transaction((unit) => unit.claimPendingOutbox(
            outboxId(envelope!.operationalEventId),
            "other-worker",
            "2026-08-11T13:00:00.000Z",
          ))).toBe(true);
          return "this-worker";
        },
      });

      await expect(worker.drainDue({
        now: "2026-08-11T13:00:00.000Z",
        staleBefore: "2026-08-11T12:59:00.000Z",
        limit: 25,
        deferredUntil: {},
      })).resolves.toEqual([{
        id: outboxId(envelope!.operationalEventId),
        outcome: "not-claimed",
      }]);
      expect(deliveryCalls).toBe(0);
    } finally {
      secondStore.close();
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("leaves a recoverable claim when acknowledgement fails after delivery", async () => {
    const harness = openHarness();
    try {
      const [envelope] = manyCaptureEnvelopes(1);
      appendRows(harness.store, [envelope!]);
      let transactionCount = 0;
      const store: OperationalLearningOutboxStore = {
        transaction<T>(work: (unit: OperationalUnitOfWork) => T): T {
          transactionCount += 1;
          return harness.store.transaction((unit) => {
            if (transactionCount !== 2) return work(unit);
            const wrapped = new Proxy(unit, {
              get(target, property, receiver) {
                if (property !== "markOutboxDelivered") return Reflect.get(target, property, receiver);
                return (...args: Parameters<OperationalUnitOfWork["markOutboxDelivered"]>) => {
                  target.markOutboxDelivered(...args);
                  throw new OperationalStoreError(
                    "acknowledgement connection lost",
                    "PERSISTENCE_ERROR",
                    { cause: { code: "SQLITE_LOCKED" } },
                  );
                };
              },
            }) as OperationalUnitOfWork;
            return work(wrapped);
          });
        },
        readOutbox: harness.store.readOutbox.bind(harness.store),
        listPendingOutbox: harness.store.listPendingOutbox.bind(harness.store),
        listDueOutbox: harness.store.listDueOutbox.bind(harness.store),
      };
      const worker = new LearningOutboxWorker({
        store,
        delivery: {
          async deliverEnvelope() {
            return "delivered" as const;
          },
        },
        now: () => new Date("2026-08-11T13:00:00.000Z"),
        claimToken: () => "ack-worker",
      });

      await expect(worker.drainDue({
        now: "2026-08-11T13:00:00.000Z",
        staleBefore: "2026-08-11T12:59:00.000Z",
        limit: 25,
        deferredUntil: {},
      })).resolves.toEqual([{
        id: outboxId(envelope!.operationalEventId),
        outcome: "retryable",
      }]);
      expect(harness.store.readOutbox(outboxId(envelope!.operationalEventId))).toMatchObject({
        status: "pending",
        claimedBy: "ack-worker",
        attempts: 1,
      });
    } finally {
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("continues to later due rows after a normalized transient claim failure", async () => {
    const harness = openHarness();
    try {
      const envelopes = manyCaptureEnvelopes(2);
      appendRows(harness.store, envelopes);
      let transactionCount = 0;
      const store: OperationalLearningOutboxStore = {
        transaction<T>(work: (unit: OperationalUnitOfWork) => T): T {
          transactionCount += 1;
          if (transactionCount === 1) {
            throw new OperationalStoreError(
              "temporary SQLite lock",
              "PERSISTENCE_ERROR",
              { cause: { code: "SQLITE_BUSY" } },
            );
          }
          return harness.store.transaction(work);
        },
        readOutbox: harness.store.readOutbox.bind(harness.store),
        listPendingOutbox: harness.store.listPendingOutbox.bind(harness.store),
        listDueOutbox: harness.store.listDueOutbox.bind(harness.store),
      };
      const worker = new LearningOutboxWorker({
        store,
        delivery: {
          async deliverEnvelope() {
            return "delivered" as const;
          },
        },
        now: () => new Date("2026-08-11T13:00:00.000Z"),
        claimToken: (() => {
          let index = 0;
          return () => `lock-worker-${++index}`;
        })(),
      });

      await expect(worker.drainDue({
        now: "2026-08-11T13:00:00.000Z",
        staleBefore: "2026-08-11T12:59:00.000Z",
        limit: 25,
        deferredUntil: {},
      })).resolves.toEqual([
        { id: outboxId(envelopes[0]!.operationalEventId), outcome: "retryable" },
        { id: outboxId(envelopes[1]!.operationalEventId), outcome: "delivered" },
      ]);
    } finally {
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("rejects inconsistent claim, retry, delivery, and dead-letter row states", () => {
    const [envelope] = captureEnvelopes();
    const pending = outboxRow(envelope!);
    expect(OperationalOutboxRowSchema.safeParse({
      ...pending,
      claimedBy: "worker-one",
    }).success).toBe(false);
    expect(OperationalOutboxRowSchema.safeParse({
      ...pending,
      deliveredAt: "2026-08-11T13:00:00.000Z",
    }).success).toBe(false);
    expect(OperationalOutboxRowSchema.safeParse({
      ...pending,
      status: "delivered",
      deliveredAt: "2026-08-11T13:00:00.000Z",
      claimedBy: "worker-one",
      claimedAt: "2026-08-11T12:59:00.000Z",
    }).success).toBe(false);
    expect(OperationalOutboxRowSchema.safeParse({
      ...pending,
      status: "dead-letter",
    }).success).toBe(false);
    expect(OperationalOutboxRowSchema.safeParse({
      ...pending,
      errorCode: "raw provider said secret=unsafe",
    }).success).toBe(false);
  });

  it("delivers each immutable capture variant to exactly one learning event", async () => {
    const harness = openHarness();
    try {
      const envelopes = captureEnvelopes();
      appendRows(harness.store, envelopes);
      await harness.ledger.initialize();

      const worker = new LearningOutboxWorker({
        store: harness.store,
        delivery: new LearningCaptureService(harness.ledger),
        now: () => new Date("2026-08-11T13:00:00.000Z"),
        claimToken: () => "worker-one",
      });

      await expect(worker.drainPending()).resolves.toMatchObject({
        claimed: 4,
        delivered: 4,
        duplicate: 0,
        retryable: 0,
        deadLetter: 0,
      });
      await expect(harness.ledger.list()).resolves.toMatchObject([
        {
          id: eventId(1),
          correlationId: eventId(1),
          eventType: "diagnosis-recorded",
          diagnosisId: "diagnosis-4501",
          payload: {
            evidenceIds: ["request-trace"],
            knowledgeArticleIds: ["api-reference"],
          },
        },
        {
          id: eventId(2),
          correlationId: eventId(2),
          eventType: "diagnosis-approved",
          diagnosisId: "diagnosis-4501",
        },
        {
          id: eventId(3),
          correlationId: eventId(3),
          eventType: "fix-available",
          diagnosisId: "diagnosis-4501",
          payload: { outcomeStatus: "available" },
        },
        {
          id: eventId(4),
          correlationId: eventId(4),
          eventType: "outcome-verified",
          diagnosisId: "diagnosis-4501",
          payload: {
            verificationType: "customer-confirmed",
            outcomeStatus: "resolved",
          },
        },
      ]);
      expect(await harness.ledger.list()).toHaveLength(4);
      expect(envelopes.map((envelope) => harness.store.readOutbox(outboxId(envelope.operationalEventId))))
        .toMatchObject(envelopes.map(() => ({ status: "delivered", attempts: 1 })));
    } finally {
      harness.ledger.close();
      harness.store.close();
    }
  });

  it("rejects nested envelope mutation after hashing and preserves hash-to-event content", async () => {
    const harness = openHarness();
    const [envelope] = captureEnvelopes();
    appendRows(harness.store, [envelope!]);
    await harness.ledger.initialize();
    const capture = new LearningCaptureService(harness.ledger);
    const row = harness.store.readOutbox(outboxId(envelope!.operationalEventId))!;
    const expectedHash = createHash("sha256")
      .update(canonicalLearningJson(row.envelope))
      .digest("hex");
    let observedHash: string | undefined;
    let rejectedMutations = 0;
    const worker = new LearningOutboxWorker({
      store: harness.store,
      delivery: {
        async deliverEnvelope(deliveryEnvelope, envelopeHash) {
          observedHash = envelopeHash;
          if (deliveryEnvelope.eventType !== "diagnosis-recorded") {
            throw new Error("expected diagnosis capture envelope");
          }
          for (const collection of [
            deliveryEnvelope.evidenceIds,
            deliveryEnvelope.knowledgeArticleIds,
          ]) {
            try {
              (collection as string[]).push("late-mutation");
            } catch (error) {
              if (error instanceof TypeError) rejectedMutations += 1;
            }
          }
          return capture.deliverEnvelope(deliveryEnvelope, envelopeHash);
        },
      },
    });

    await expect(worker.deliverOutboxRow(row)).resolves.toEqual({ status: "delivered" });
    expect(rejectedMutations).toBe(2);
    expect(observedHash).toBe(expectedHash);
    await expect(harness.ledger.list()).resolves.toMatchObject([{
      eventType: "diagnosis-recorded",
      payload: {
        evidenceIds: ["request-trace"],
        knowledgeArticleIds: ["api-reference"],
      },
    }]);
    harness.ledger.close();
    harness.store.close();
  });

  it("keeps a retryable failure pending and delivers it after an operational restart", async () => {
    const harness = openHarness();
    const [envelope] = captureEnvelopes();
    appendRows(harness.store, [envelope!]);
    const failing = new LearningOutboxWorker({
      store: harness.store,
      delivery: {
        async deliverEnvelope() {
          throw new LearningLedgerError("ledger unavailable", "PERSISTENCE_ERROR");
        },
      },
      now: () => new Date("2026-08-11T13:00:00.000Z"),
      claimToken: () => "failed-worker",
    });

    await expect(failing.drainPending()).resolves.toMatchObject({ claimed: 1, retryable: 1 });
    expect(harness.store.readOutbox(outboxId(envelope!.operationalEventId))).toMatchObject({
      status: "pending",
      attempts: 1,
      errorCode: "PERSISTENCE_ERROR",
    });
    expect(harness.store.readOutbox(outboxId(envelope!.operationalEventId))?.claimedBy).toBeUndefined();
    harness.store.close();

    const reopened = OperationalSqliteStore.open(join(harness.root, "operational.sqlite"));
    reopened.initialize();
    await harness.ledger.initialize();
    const restarted = new LearningOutboxWorker({
      store: reopened,
      delivery: new LearningCaptureService(harness.ledger),
      now: () => new Date("2026-08-11T13:01:00.000Z"),
      claimToken: () => "restart-worker",
    });
    await expect(restarted.drainPending()).resolves.toMatchObject({ claimed: 1, delivered: 1 });
    expect(reopened.readOutbox(outboxId(envelope!.operationalEventId))).toMatchObject({
      status: "delivered",
      attempts: 2,
    });
    await expect(harness.ledger.list()).resolves.toHaveLength(1);
    harness.ledger.close();
    reopened.close();
  });

  it("safely retries a stale claim after learning committed but acknowledgement crashed", async () => {
    const harness = openHarness();
    const [envelope] = captureEnvelopes();
    appendRows(harness.store, [envelope!]);
    await harness.ledger.initialize();
    const delivery = new LearningCaptureService(harness.ledger);
    expect(harness.store.transaction((unit) => unit.claimPendingOutbox(
      outboxId(envelope!.operationalEventId),
      "crashed-worker",
      "2026-08-11T13:00:00.000Z",
    ))).toBe(true);
    const claimed = harness.store.readOutbox(outboxId(envelope!.operationalEventId))!;
    const crashedWorker = new LearningOutboxWorker({ store: harness.store, delivery });
    await expect(crashedWorker.deliverOutboxRow(claimed)).resolves.toEqual({ status: "delivered" });
    expect(harness.store.readOutbox(claimed.id)).toMatchObject({ status: "pending", claimedBy: "crashed-worker" });
    harness.store.close();

    const reopened = OperationalSqliteStore.open(join(harness.root, "operational.sqlite"));
    reopened.initialize();
    const restarted = new LearningOutboxWorker({
      store: reopened,
      delivery,
      now: () => new Date("2026-08-11T13:10:00.000Z"),
      claimToken: () => "recovery-worker",
      claimLeaseMs: 60_000,
    });
    await expect(restarted.drainPending()).resolves.toMatchObject({
      claimed: 1,
      delivered: 0,
      duplicate: 1,
    });
    expect(reopened.readOutbox(claimed.id)).toMatchObject({ status: "delivered", attempts: 2 });
    await expect(harness.ledger.list()).resolves.toHaveLength(1);
    harness.ledger.close();
    reopened.close();
  });

  it("rejects one delivery key with a different immutable envelope", async () => {
    const harness = openHarness();
    const [envelope] = captureEnvelopes();
    appendRows(harness.store, [envelope!]);
    await harness.ledger.initialize();
    const worker = new LearningOutboxWorker({
      store: harness.store,
      delivery: new LearningCaptureService(harness.ledger),
    });
    const row = harness.store.readOutbox(outboxId(envelope!.operationalEventId))!;
    await expect(worker.deliverOutboxRow(row)).resolves.toEqual({ status: "delivered" });
    const conflicting: OperationalOutboxRow = {
      ...row,
      envelope: { ...row.envelope, actor: "different-operator" },
    };
    await expect(worker.deliverOutboxRow(conflicting)).rejects.toMatchObject({ code: "EVENT_CONFLICT" });
    await expect(harness.ledger.list()).resolves.toHaveLength(1);
    harness.ledger.close();
    harness.store.close();
  });

  it("dead-letters explicitly non-retryable delivery errors", async () => {
    const harness = openHarness();
    const [envelope] = captureEnvelopes();
    appendRows(harness.store, [envelope!]);
    const worker = new LearningOutboxWorker({
      store: harness.store,
      delivery: {
        async deliverEnvelope() {
          throw new LearningLedgerError("invalid immutable payload", "INVALID_EVENT");
        },
      },
      now: () => new Date("2026-08-11T13:00:00.000Z"),
      claimToken: () => "invalid-worker",
    });
    await expect(worker.drainPending()).resolves.toMatchObject({ claimed: 1, deadLetter: 1 });
    expect(harness.store.readOutbox(outboxId(envelope!.operationalEventId))).toMatchObject({
      status: "dead-letter",
      attempts: 1,
      errorCode: "INVALID_EVENT",
    });
    harness.ledger.close();
    harness.store.close();
  });

  it("lets only one worker claim and deliver a pending row", async () => {
    const harness = openHarness();
    const [envelope] = captureEnvelopes();
    appendRows(harness.store, [envelope!]);
    let deliveries = 0;
    let releaseDelivery!: () => void;
    const deliveryGate = new Promise<void>((resolve) => { releaseDelivery = resolve; });
    const delivery = {
      async deliverEnvelope() {
        deliveries += 1;
        await deliveryGate;
        return "delivered" as const;
      },
    };
    const first = new LearningOutboxWorker({
      store: harness.store,
      delivery,
      claimToken: () => "worker-one",
    });
    const secondStore = OperationalSqliteStore.open(join(harness.root, "operational.sqlite"));
    secondStore.initialize();
    const second = new LearningOutboxWorker({
      store: secondStore,
      delivery,
      claimToken: () => "worker-two",
    });
    const firstDrain = first.drainPending();
    await Promise.resolve();
    const secondDrain = second.drainPending();
    await expect(secondDrain).resolves.toMatchObject({ claimed: 0, delivered: 0 });
    expect(deliveries).toBe(1);
    releaseDelivery();
    await expect(firstDrain).resolves.toMatchObject({ claimed: 1, delivered: 1 });
    expect(harness.store.readOutbox(outboxId(envelope!.operationalEventId))).toMatchObject({
      status: "delivered",
      attempts: 1,
    });
    secondStore.close();
    harness.ledger.close();
    harness.store.close();
  });

  it("rolls back outbox intent with its causal operational event and rejects stale claim tokens", () => {
    const harness = openHarness();
    const [envelope] = captureEnvelopes();
    expect(() => harness.store.transaction((unit) => {
      const [sequence] = unit.allocateEventSequences(ticketId, 1);
      unit.appendEvent({
        id: envelope!.operationalEventId,
        ticketId,
        sequence: sequence!,
        occurredAt: envelope!.occurredAt,
        actor: envelope!.actor,
        action: "diagnosis-completed",
        commandId: commandId(90),
        facts: { diagnosisOutcome: "completed" },
      });
      unit.appendLearningCaptureOutbox(outboxRow(envelope!));
      throw new Error("injected failure after outbox intent");
    })).toThrow("injected failure after outbox intent");
    expect(harness.store.readWorkflowSnapshot(ticketId).events).toEqual([]);
    expect(harness.store.readOutbox(outboxId(envelope!.operationalEventId))).toBeUndefined();

    appendRows(harness.store, [envelope!]);
    expect(harness.store.transaction((unit) => unit.claimPendingOutbox(
      outboxId(envelope!.operationalEventId),
      "owner-token",
      "2026-08-11T13:00:00.000Z",
    ))).toBe(true);
    expect(() => harness.store.transaction((unit) =>
      unit.markOutboxDelivered(
        outboxId(envelope!.operationalEventId),
        "stale-token",
        "2026-08-11T13:01:00.000Z",
      ))).toThrow("claim is stale");
    expect(harness.store.readOutbox(outboxId(envelope!.operationalEventId))).toMatchObject({
      status: "pending",
      claimedBy: "owner-token",
    });
    harness.ledger.close();
    harness.store.close();
  });

  it("drains pending learning intent during runtime startup when the operational store is configured", async () => {
    const harness = openHarness();
    const [envelope] = captureEnvelopes();
    appendRows(harness.store, [envelope!]);
    const dataRoot = join(harness.root, "runtime-data");
    const deps = await createRuntimeDependencies({
      legacyFixtureRepositories: true,
      operationalStore: harness.store,
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: join(process.cwd(), "data", "seed", "tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: join(process.cwd(), "data", "knowledge"),
      },
      now: () => new Date("2026-08-11T13:00:00.000Z"),
    });
    try {
      expect(deps.learningOutbox).toBeDefined();
      expect(harness.store.readOutbox(outboxId(envelope!.operationalEventId))).toMatchObject({
        status: "delivered",
        attempts: 1,
      });
      await expect(deps.knowledgeEvolution.ledger.list()).resolves.toMatchObject([{
        id: envelope!.deliveryKey,
        eventType: "diagnosis-recorded",
      }]);
    } finally {
      deps.knowledgeEvolution.ledger.close();
      harness.ledger.close();
      harness.store.close();
    }
  });
});

function openHarness() {
  const root = mkdtempSync(join(tmpdir(), "triage-operational-outbox-"));
  temporaryRoots.push(root);
  const store = OperationalSqliteStore.open(join(root, "operational.sqlite"));
  store.initialize();
  store.transaction((unit) => unit.insertTicket(TicketSchema.parse({
    id: ticketId,
    revision: 0,
    customer: { name: "Northstar", plan: "enterprise", region: "eu", vip: false },
    subject: "API requests fail",
    description: "Requests return a server error.",
    status: "triage",
    category: "api",
    priority: "P2",
    team: "api-platform",
    assignee: "operator@example.test",
    tags: ["api"],
    relatedTicketIds: [],
    sla: { responseDueAt: "2026-08-12T00:00:00.000Z", breached: false },
    createdAt: "2026-08-10T06:00:00.000Z",
    updatedAt: "2026-08-10T06:00:00.000Z",
  })));
  const ledger = new SqliteLearningLedger(join(root, "learning.sqlite"));
  return { root, store, ledger };
}

function appendRows(
  store: OperationalSqliteStore,
  envelopes: readonly LearningCaptureEnvelope[],
): void {
  store.transaction((unit) => {
    const sequences = unit.allocateEventSequences(ticketId, envelopes.length);
    envelopes.forEach((envelope, index) => {
      unit.appendEvent({
        id: envelope.operationalEventId,
        ticketId,
        sequence: sequences[index]!,
        occurredAt: envelope.occurredAt,
        actor: envelope.actor,
        action: operationalAction(envelope.eventType),
        commandId: commandId(index + 1),
        facts: eventFacts(envelope.eventType),
      });
      unit.appendLearningCaptureOutbox(outboxRow(envelope));
    });
  });
}

function captureEnvelopes(): LearningCaptureEnvelope[] {
  const base = (index: number) => ({
    operationalEventId: eventId(index),
    deliveryKey: eventId(index),
    occurredAt: `2026-08-11T12:0${index}:00.000Z`,
    actor: "operator",
    ticketId,
  });
  return [
    {
      ...base(1),
      eventType: "diagnosis-recorded",
      diagnosisId: "diagnosis-4501",
      evidenceIds: ["request-trace"],
      knowledgeArticleIds: ["api-reference"],
      provenance: "Sanitized operational outcome: diagnosis-completed.",
    },
    {
      ...base(2),
      eventType: "diagnosis-approved",
      diagnosisId: "diagnosis-4501",
      evidenceIds: ["request-trace"],
      knowledgeArticleIds: ["api-reference"],
      provenance: "Sanitized operational outcome: diagnosis-reviewed.",
    },
    {
      ...base(3),
      eventType: "fix-available",
      diagnosisId: "diagnosis-4501",
      outcomeStatus: "available",
      provenance: "Sanitized operational outcome: fix-available.",
    },
    {
      ...base(4),
      eventType: "outcome-verified",
      diagnosisId: "diagnosis-4501",
      evidenceIds: ["request-trace"],
      verificationType: "customer-confirmed",
      outcomeStatus: "resolved",
      provenance: "Sanitized operational outcome: ticket-updated.",
    },
  ];
}

function manyCaptureEnvelopes(count: number): LearningCaptureEnvelope[] {
  const templates = captureEnvelopes();
  return Array.from({ length: count }, (_, index) => {
    const template = templates[index % templates.length]!;
    const id = eventId(index + 1);
    return {
      ...template,
      operationalEventId: id,
      deliveryKey: id,
      occurredAt: `2026-08-11T12:${String(index).padStart(2, "0")}:00.000Z`,
    };
  });
}

function outboxRow(envelope: LearningCaptureEnvelope): OperationalOutboxRow {
  return {
    id: outboxId(envelope.operationalEventId),
    operationalEventId: envelope.operationalEventId,
    deliveryKey: envelope.deliveryKey,
    envelope,
    status: "pending",
    attempts: 0,
    createdAt: envelope.occurredAt,
  };
}

function operationalAction(eventType: LearningCaptureEnvelope["eventType"]) {
  switch (eventType) {
    case "diagnosis-recorded": return "diagnosis-completed" as const;
    case "diagnosis-approved": return "diagnosis-reviewed" as const;
    case "fix-available": return "fix-available" as const;
    case "outcome-verified": return "ticket-updated" as const;
  }
}

function eventFacts(eventType: LearningCaptureEnvelope["eventType"]): Record<string, unknown> {
  switch (eventType) {
    case "diagnosis-recorded": return { diagnosisOutcome: "completed" };
    case "diagnosis-approved": return { diagnosisOutcome: "approve" };
    case "fix-available": return { outcome: "available" };
    case "outcome-verified": return { status: "resolved", verificationType: "customer-confirmed" };
  }
}

function eventId(index: number): string {
  return `45000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function outboxId(operationalEventId: string): string {
  return operationalEventId.replace(/^45000000/, "46000000");
}

function commandId(index: number): string {
  return `47000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
