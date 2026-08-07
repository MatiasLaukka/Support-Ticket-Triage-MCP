import { describe, expect, it } from "vitest";
import type { LearningEvent, LearningLedger } from "../src/knowledge-evolution/learning-ledger.js";
import { LearningLedgerError } from "../src/knowledge-evolution/learning-ledger.js";
import { InMemoryLearningLedger } from "../src/knowledge-evolution/in-memory-learning-ledger.js";
import { SqliteLearningLedger } from "../src/knowledge-evolution/sqlite-learning-ledger.js";

const diagnosisEvent = (id: string, occurredAt: string, ticketId = "TKT-1001"): LearningEvent => ({
  id,
  occurredAt,
  actor: "support-lead",
  correlationId: "22222222-2222-4222-8222-222222222222",
  ticketId,
  diagnosisId: "diagnosis-001",
  eventType: "diagnosis-approved",
  payload: {
    evidenceIds: ["request-id"],
    knowledgeArticleIds: ["event-tracking-debugging"],
    provenance: "operator-reviewed diagnosis record",
  },
});

const promotedEvent = (id: string): LearningEvent => ({
  id,
  occurredAt: "2026-08-07T10:01:00.000Z",
  actor: "support-lead",
  correlationId: "22222222-2222-4222-8222-222222222222",
  candidateId: "candidate-001",
  objectId: "known-cause-api-delay",
  sourceVersion: 1,
  eventType: "candidate-promoted",
  payload: { maturity: "promoted", health: "active", provenance: "operator approved" },
});

export function runLearningLedgerContract(createLedger: () => LearningLedger | Promise<LearningLedger>): void {
  describe("LearningLedger adapter contract", () => {
    it("initializes, appends, batches, and lists chronologically", async () => {
      const ledger = await createLedger();
      await ledger.initialize();
      await ledger.append(diagnosisEvent("11111111-1111-4111-8111-111111111111", "2026-08-07T10:02:00.000Z"));
      await ledger.appendBatch([
        promotedEvent("33333333-3333-4333-8333-333333333333"),
        diagnosisEvent("44444444-4444-4444-8444-444444444444", "2026-08-07T10:01:00.000Z", "TKT-1002"),
      ]);

      await expect(ledger.list()).resolves.toEqual([
        expect.objectContaining({ id: "33333333-3333-4333-8333-333333333333" }),
        expect.objectContaining({ id: "44444444-4444-4444-8444-444444444444" }),
        expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111" }),
      ]);
    });

    it("filters by event type, ticket, and object references", async () => {
      const ledger = await createLedger();
      await ledger.initialize();
      await ledger.append(diagnosisEvent("11111111-1111-4111-8111-111111111111", "2026-08-07T10:02:00.000Z"));
      await ledger.append(promotedEvent("33333333-3333-4333-8333-333333333333"));

      await expect(ledger.list({ eventType: "candidate-promoted" })).resolves.toHaveLength(1);
      await expect(ledger.list({ ticketId: "TKT-1001" })).resolves.toHaveLength(1);
      await expect(ledger.list({ objectId: "known-cause-api-delay" })).resolves.toHaveLength(1);
    });

    it("treats identical retries as no-ops and conflicting IDs as errors", async () => {
      const ledger = await createLedger();
      await ledger.initialize();
      const event = diagnosisEvent("11111111-1111-4111-8111-111111111111", "2026-08-07T10:02:00.000Z");
      await ledger.append(event);
      await ledger.append(event);
      await expect(ledger.has(event.id)).resolves.toBe(true);
      const conflicting = diagnosisEvent(event.id, event.occurredAt);
      conflicting.actor = "another-operator";
      await expect(ledger.append(conflicting)).rejects.toMatchObject({ code: "EVENT_CONFLICT" });
    });

    it("rolls back a batch when any event conflicts", async () => {
      const ledger = await createLedger();
      await ledger.initialize();
      const existing = diagnosisEvent("11111111-1111-4111-8111-111111111111", "2026-08-07T10:02:00.000Z");
      await ledger.append(existing);
      const conflicting = diagnosisEvent(existing.id, existing.occurredAt);
      conflicting.actor = "another-operator";
      await expect(ledger.appendBatch([
        promotedEvent("33333333-3333-4333-8333-333333333333"),
        conflicting,
      ])).rejects.toMatchObject({ code: "EVENT_CONFLICT" });
      await expect(ledger.list()).resolves.toHaveLength(1);
    });

    it("returns defensive copies", async () => {
      const ledger = await createLedger();
      await ledger.initialize();
      const event = diagnosisEvent("11111111-1111-4111-8111-111111111111", "2026-08-07T10:02:00.000Z");
      await ledger.append(event);
      const listed = await ledger.list();
      (listed[0]!.payload as { provenance: string }).provenance = "mutated locally";
      await expect(ledger.list()).resolves.toMatchObject([{ payload: { provenance: "operator-reviewed diagnosis record" } }]);
    });

    it("returns a defensive, chronologically stable snapshot after an atomic batch", async () => {
      const ledger = await createLedger();
      await ledger.initialize();
      await ledger.append(diagnosisEvent("11111111-1111-4111-8111-111111111111", "2026-08-07T10:02:00.000Z"));
      await ledger.appendBatch([
        promotedEvent("33333333-3333-4333-8333-333333333333"),
        diagnosisEvent("44444444-4444-4444-8444-444444444444", "2026-08-07T10:01:00.000Z", "TKT-1002"),
      ]);

      const snapshot = await (ledger as LearningLedger & { snapshot(): Promise<readonly LearningEvent[]> }).snapshot();
      const repeated = await (ledger as LearningLedger & { snapshot(): Promise<readonly LearningEvent[]> }).snapshot();
      expect(snapshot).toEqual(repeated);
      expect(snapshot.map((event) => event.id)).toEqual([
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
        "11111111-1111-4111-8111-111111111111",
      ]);

      (snapshot[0]!.payload as { provenance: string }).provenance = "mutated locally";
      const subsequentSnapshot = await (ledger as LearningLedger & { snapshot(): Promise<readonly LearningEvent[]> }).snapshot();
      expect(subsequentSnapshot[0]).toMatchObject({ payload: { provenance: "operator approved" } });
    });

    it("does not expose a prefix while a batch append is in flight", async () => {
      const ledger = await createLedger();
      await ledger.initialize();

      const batch = ledger.appendBatch([
        promotedEvent("33333333-3333-4333-8333-333333333333"),
        diagnosisEvent("44444444-4444-4444-8444-444444444444", "2026-08-07T10:02:00.000Z", "TKT-1002"),
      ]);
      const concurrentSnapshot = ledger.snapshot();
      const [, observed] = await Promise.all([batch, concurrentSnapshot]);

      expect(observed.map((event) => event.id)).toEqual([
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
      ]);
    });
  });
}

runLearningLedgerContract(() => new InMemoryLearningLedger());
runLearningLedgerContract(() => new SqliteLearningLedger(":memory:"));
