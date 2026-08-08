import { describe, expect, it } from "vitest";
import {
  knowledgeHoldoutFixtures,
  type KnowledgeHoldoutFixture,
} from "../src/knowledge-evolution/holdout-fixtures.js";
import { evaluateKnowledgeHoldoutFixture } from "../src/knowledge-evolution/holdout-evaluation.js";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";
import { KnowledgeObjectWriteSchema } from "../src/knowledge-evolution/domain.js";

describe("production-path knowledge holdout fixtures", () => {
  it("defines seven fixed classes with immutable complete conversation snapshots", () => {
    const fixtures = knowledgeHoldoutFixtures();

    expect(fixtures.map(({ id }) => id)).toEqual([
      "sufficient-evidence-true-positive",
      "missing-evidence-then-supplied",
      "near-miss",
      "unrelated",
      "stale-version",
      "contradicted-version",
      "replacement-and-draft-isolation",
    ]);

    for (const fixture of fixtures) {
      assertFixtureIsSnapshotBased(fixture);
      expect(fixture.expectedEvidenceIds).toEqual(expect.any(Array));
    }
  });

  it("runs baseline and learned turns through the production boundary without mutating state", async () => {
    const fixture = knowledgeHoldoutFixtures()[0]!;
    const events = [{
      id: "00000000-0000-4000-8000-000000000001",
      occurredAt: "2026-08-08T08:00:00.000Z",
      actor: "support-lead",
      correlationId: "10000000-0000-4000-8000-000000000001",
      candidateId: "candidate-credential-rotation",
      objectId: "credential-rotation",
      sourceVersion: 1,
      eventType: "candidate-promoted" as const,
      payload: { maturity: "promoted" as const, health: "active" as const, provenance: "fixed holdout setup" },
    }];
    const object = KnowledgeObjectWriteSchema.parse({
      id: "credential-rotation", version: 1, learningGovernance: "ledger", kind: "known-cause",
      name: "Credential rotation request failure", summary: "A credential rotation can reject the next API request.",
      triggerPatterns: ["Credential rotation request fails"], evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
      timeConstraints: ["Apply when the request failure matches the known condition."],
      diagnosticSteps: ["Review the request identifier."], fixSteps: ["Refresh the credential."], verificationSteps: ["Verify the next request."],
      customerSafeExplanation: "We found a recurring credential condition and will review the safe correction.",
      operatorRationale: "The approved version requires a request identifier.", owner: "api-platform",
      supportingDiagnosisIds: ["diagnosis-credential-rotation"], supportingTicketIds: [fixture.initialTicket.id],
      provenance: { source: "fixed-holdout", recordedAt: "2026-08-08T08:00:00.000Z" }, status: "approved",
      approval: { approvedBy: "support-lead", approvedAt: "2026-08-08T08:00:00.000Z" },
    });
    let reusableReads = 0;
    const service = new KnowledgeEvolutionService({
      objects: { async snapshotForReuse() { reusableReads += 1; return { versions: [object], heads: new Map([[object.id, 1]]), events }; } },
    } as never);
    const state = {
      ticketRevisions: [{ ticketId: fixture.initialTicket.id, revision: fixture.initialTicket.revision }],
      recommendationCount: 0, operationalAuditCount: 0, learningEventIds: events.map(({ id }) => id),
      candidateIds: ["candidate-credential-rotation"], versionIds: ["credential-rotation:1"],
      heads: [{ objectId: "credential-rotation", headVersion: 1 }],
    };

    const result = await evaluateKnowledgeHoldoutFixture({
      fixture, knowledgeEvolution: service, allKnowledgeArticles: [], asOf: "2026-08-08T12:00:00.000Z",
      actor: "holdout-evaluator", snapshot: async () => structuredClone(state),
    });

    expect(result.learned.targetReached).toBe(true);
    expect(result.learned.turns[0]).toMatchObject({
      knownCauseRef: { objectId: "credential-rotation", version: 1 },
      requestedEvidenceIds: ["request-id"], providedEvidenceIds: ["request-id"], missingEvidenceIds: [],
      correctionStatus: "correct", unsafeLifecycleViolations: [],
    });
    expect(result.baseline.targetReached).toBe(false);
    expect(result.baseline.unsafeLifecycleChanges).toContain("target-not-reached");
    expect(result.learned.before).toEqual(result.learned.after);

    for (const fixtureCase of knowledgeHoldoutFixtures().slice(1)) {
      const lane = await evaluateKnowledgeHoldoutFixture({
        fixture: fixtureCase, knowledgeEvolution: service, allKnowledgeArticles: [], asOf: "2026-08-08T12:00:00.000Z",
        actor: "holdout-evaluator", snapshot: async () => structuredClone(state),
      });
      expect(lane.baseline.turns).toHaveLength(fixtureCase.turns.length);
      expect(lane.learned.turns).toHaveLength(fixtureCase.turns.length);
      expect(lane.learned.before).toEqual(lane.learned.after);
    }
    expect(reusableReads).toBe(7);
  });
});

function assertFixtureIsSnapshotBased(fixture: KnowledgeHoldoutFixture): void {
  expect(fixture.turns.length).toBeGreaterThan(0);
  let priorReplyIds: readonly string[] = [];
  for (const turn of fixture.turns) {
    expect(Object.isFrozen(turn.customerReplies)).toBe(true);
    expect(turn.customerReplies.map(({ id }) => id)).toEqual(expect.arrayContaining([...priorReplyIds]));
    priorReplyIds = turn.customerReplies.map(({ id }) => id);
  }
}
