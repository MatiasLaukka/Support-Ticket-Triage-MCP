import { describe, expect, it } from "vitest";
import type { LearningEvent } from "../src/knowledge-evolution/learning-ledger.js";
import { projectKnowledgeLearning } from "../src/knowledge-evolution/learning-read-model.js";

const base = {
  occurredAt: "2026-08-07T10:00:00.000Z",
  actor: "support-lead",
  correlationId: "22222222-2222-4222-8222-222222222222",
  candidateId: "candidate-001",
  objectId: "known-cause-api-delay",
  sourceVersion: 1,
};

function event(id: string, value: Partial<LearningEvent>): LearningEvent {
  return {
    ...base,
    id,
    eventType: "candidate-created",
    payload: { maturity: "diagnosis-supported", supportingEventIds: [], provenance: "deterministic discovery" },
    ...value,
  } as LearningEvent;
}

describe("knowledge learning read model", () => {
  it("projects observed through diagnosis-supported, verified, reuse, and promotion maturity", () => {
    const summary = projectKnowledgeLearning([
      event("11111111-1111-4111-8111-111111111111", { eventType: "candidate-created", payload: { maturity: "observed", supportingEventIds: [], provenance: "first observation" } }),
      event("33333333-3333-4333-8333-333333333333", { eventType: "candidate-promoted", payload: { maturity: "promoted", health: "active", provenance: "operator approved" } }),
      event("44444444-4444-4444-8444-444444444444", { eventType: "knowledge-reused", ticketId: "TKT-1002", payload: { matchReasons: ["shared evidence"], evidenceIds: ["request-id"], provenance: "later ticket reuse" } }),
    ], { candidateId: "candidate-001", objectId: "known-cause-api-delay" });

    expect(summary).toMatchObject({
      candidateId: "candidate-001",
      maturity: "reuse-validated",
      health: "active",
      eligibleForReuse: true,
      supportingEventIds: ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
    });
    expect(summary.signalWeight).toBeGreaterThan(0);
  });

  it("keeps stale knowledge queryable but decays its signal and blocks reuse", () => {
    const summary = projectKnowledgeLearning([
      event("33333333-3333-4333-8333-333333333333", { occurredAt: "2026-06-01T10:00:00.000Z", eventType: "candidate-promoted", payload: { maturity: "promoted", health: "active", provenance: "operator approved" } }),
      event("55555555-5555-4555-8555-555555555555", { occurredAt: "2026-07-01T10:00:00.000Z", eventType: "knowledge-marked-stale", payload: { health: "stale", staleReasons: ["No matching recurrence after the incident window."], provenance: "stale review" } }),
    ], { candidateId: "candidate-001", objectId: "known-cause-api-delay", asOf: "2026-08-07T10:00:00.000Z" });

    expect(summary).toMatchObject({ health: "stale", eligibleForReuse: false, staleReasons: ["No matching recurrence after the incident window."] });
    expect(summary.signalWeight).toBeGreaterThan(0);
    expect(summary.signalWeight).toBeLessThan(1);
  });

  it("records contradiction without deleting history", () => {
    const summary = projectKnowledgeLearning([
      event("33333333-3333-4333-8333-333333333333", { eventType: "candidate-promoted", payload: { maturity: "promoted", health: "active", provenance: "operator approved" } }),
      event("66666666-6666-4666-8666-666666666666", { eventType: "knowledge-reuse-failed", ticketId: "TKT-1003", payload: { matchReasons: ["similar wording"], failureReason: "Operator rejected the proposed reuse after review.", provenance: "operator correction" } }),
    ], { candidateId: "candidate-001", objectId: "known-cause-api-delay" });

    expect(summary).toMatchObject({ health: "contradicted", eligibleForReuse: false, contradictionReasons: ["Operator rejected the proposed reuse after review."] });
    expect(summary.supportingEventIds).toHaveLength(2);
  });
});
