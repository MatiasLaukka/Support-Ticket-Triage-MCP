import { describe, expect, it } from "vitest";
import {
  LearningEventSchema,
  LearningEventTypeSchema,
} from "../src/knowledge-evolution/learning-ledger.js";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  occurredAt: "2026-08-07T10:00:00.000Z",
  actor: "support-lead",
  correlationId: "22222222-2222-4222-8222-222222222222",
  ticketId: "TKT-1001",
  diagnosisId: "diagnosis-001",
};

describe("learning ledger event contract", () => {
  it("declares every governed event type", () => {
    expect(LearningEventTypeSchema.options).toEqual([
      "diagnosis-recorded",
      "diagnosis-approved",
      "fix-available",
      "outcome-verified",
      "candidate-created",
      "candidate-deferred",
      "candidate-rejected",
      "candidate-promoted",
      "knowledge-reused",
      "knowledge-reuse-failed",
      "knowledge-marked-stale",
      "knowledge-deprecated",
      "knowledge-version-superseded",
      "knowledge-version-reactivated",
      "evaluation-recorded",
    ]);
  });

  it("accepts a sanitized operator-approved diagnosis event", () => {
    const result = LearningEventSchema.safeParse({
      ...base,
      eventType: "diagnosis-approved",
      payload: {
        evidenceIds: ["request-id"],
        knowledgeArticleIds: ["event-tracking-debugging"],
        provenance: "operator-reviewed diagnosis record",
      },
    });

    expect(result.success).toBe(true);
  });

  it("requires verification type and evidence for verified outcomes", () => {
    const result = LearningEventSchema.safeParse({
      ...base,
      eventType: "outcome-verified",
      payload: {
        verificationType: "customer-confirmed",
        outcomeStatus: "resolved",
        evidenceIds: ["request-id"],
        provenance: "customer confirmed the governed correction",
      },
    });

    expect(result.success).toBe(true);
    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "outcome-verified",
      payload: { outcomeStatus: "resolved", provenance: "missing verification" },
    }).success).toBe(false);
  });

  it("requires references appropriate to candidate promotion and reuse", () => {
    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "candidate-promoted",
      candidateId: "candidate-001",
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
      payload: { maturity: "promoted", health: "active", provenance: "operator approved" },
    }).success).toBe(true);

    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "knowledge-reused",
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
      payload: { matchReasons: ["shared evidence and timing"], evidenceIds: ["request-id"], provenance: "deterministic reuse match" },
    }).success).toBe(true);

    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "candidate-promoted",
      payload: { maturity: "promoted", health: "active", provenance: "operator approved" },
    }).success).toBe(false);
  });

  it("validates exact-version supersession and reactivation transitions", () => {
    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "knowledge-version-superseded",
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
      payload: {
        health: "superseded",
        replacementVersion: 2,
        provenance: "Operator approved the replacement version.",
      },
    }).success).toBe(true);

    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "knowledge-version-reactivated",
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
      payload: {
        health: "active",
        reactivatedVersion: 1,
        provenance: "Operator explicitly reactivated the historical version.",
      },
    }).success).toBe(true);

    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "knowledge-version-superseded",
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
      payload: { health: "superseded", provenance: "Replacement was approved." },
    }).success).toBe(false);

    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "knowledge-version-superseded",
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
      payload: { health: "superseded", replacementVersion: 1, provenance: "A version cannot replace itself." },
    }).success).toBe(false);

    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "knowledge-version-reactivated",
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
      payload: { health: "active", reactivatedVersion: 2, provenance: "The wrong version was named." },
    }).success).toBe(false);
  });

  it("rejects missing identity fields and unsafe persisted text", () => {
    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "diagnosis-recorded",
      payload: { knowledgeArticleIds: [], provenance: "recorded" },
    }).success).toBe(false);

    expect(LearningEventSchema.safeParse({
      ...base,
      actor: "",
      eventType: "diagnosis-recorded",
      payload: { evidenceIds: ["request-id"], knowledgeArticleIds: [], provenance: "recorded" },
    }).success).toBe(false);

    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "diagnosis-recorded",
      payload: { evidenceIds: ["request-id"], knowledgeArticleIds: [], provenance: "apiKey=sk-proj-secret" },
    }).success).toBe(false);

    expect(LearningEventSchema.safeParse({
      ...base,
      eventType: "diagnosis-recorded",
      payload: { evidenceIds: ["request-id"], knowledgeArticleIds: [], provenance: "C:\\Users\\matia\\secret.txt" },
    }).success).toBe(false);
  });
});
