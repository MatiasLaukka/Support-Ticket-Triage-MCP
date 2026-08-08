import { describe, expect, it } from "vitest";
import {
  knowledgeHoldoutFixtures,
  type KnowledgeHoldoutFixture,
} from "../src/knowledge-evolution/holdout-fixtures.js";
import { evaluateKnowledgeHoldoutFixture } from "../src/knowledge-evolution/holdout-evaluation.js";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";
import { KnowledgeObjectWriteSchema } from "../src/knowledge-evolution/domain.js";
import type { LearningEvent } from "../src/knowledge-evolution/learning-ledger.js";

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
      expect(fixture.lifecycle).toBeDefined();
      for (const turn of fixture.turns) {
        expect(turn.expected?.requiredEscalations).toEqual(expect.any(Array));
      }
    }
    expect(fixtures.find(({ id }) => id === "stale-version")?.lifecycle).toBe("stale");
    expect(fixtures.find(({ id }) => id === "contradicted-version")?.lifecycle).toBe("contradicted");
    expect(fixtures.find(({ id }) => id === "replacement-and-draft-isolation")?.lifecycle).toBe("replacement-draft");
  });

  it("runs each fixture against its own setup-complete lifecycle state", async () => {
    for (const fixture of knowledgeHoldoutFixtures()) {
      const lane = createLane(fixture);
      const reusable = await lane.service.listReusableApproved({ asOf: asOf });
      const result = await evaluateKnowledgeHoldoutFixture({
        fixture, knowledgeEvolution: lane.service, allKnowledgeArticles: [], asOf, actor: "holdout-evaluator",
        snapshot: lane.snapshot, createIsolatedLane: async () => lane,
      });
      expect(result.baseline.turns).toHaveLength(fixture.turns.length);
      expect(result.learned.turns).toHaveLength(fixture.turns.length);
      expect(result.learned.before).toEqual(result.learned.after);

      if (fixture.lifecycle === "stale" || fixture.lifecycle === "contradicted") {
        expect(reusable.contexts).toEqual([]);
        expect(result.learned.finalRecommendation.knownCause).not.toBe("credential-rotation");
      }
      if (fixture.lifecycle === "replacement-draft") {
        expect(reusable.contexts.map(({ version }) => version)).toEqual([2]);
        expect(result.learned.finalRecommendation.knownCauseRef).toEqual({ objectId: "credential-rotation", version: 2 });
        expect(lane.state.candidateIds).toContain("draft-credential-rotation-v3");
        expect(lane.state.versionIds).not.toContain("credential-rotation:3");
      }
    }
  });

  it.each([
    "ticket", "recommendation", "audit", "learning", "candidate", "version", "head",
  ] as const)("rejects a %s state mutation after setup", async (mutation) => {
    const fixture = knowledgeHoldoutFixtures()[0]!;
    const lane = createLane(fixture);
    let reads = 0;
    await expect(evaluateKnowledgeHoldoutFixture({
      fixture, knowledgeEvolution: lane.service, allKnowledgeArticles: [], asOf, actor: "holdout-evaluator",
      snapshot: async () => {
        if (reads++ > 0) mutate(lane.state, mutation);
        return lane.snapshot();
      },
    })).rejects.toThrow("mutated isolated production state");
  });

  it("records an intermediate escalation mismatch as a lifecycle violation", async () => {
    const source = knowledgeHoldoutFixtures().find(({ id }) => id === "unrelated")!;
    const fixture: KnowledgeHoldoutFixture = {
      ...source,
      turns: [{
        ...source.turns[0]!,
        expected: { ...source.turns[0]!.expected!, requiredEscalations: ["outage"] },
      }],
    };
    const lane = createLane(fixture);
    const result = await evaluateKnowledgeHoldoutFixture({
      fixture, knowledgeEvolution: lane.service, allKnowledgeArticles: [], asOf, actor: "holdout-evaluator", snapshot: lane.snapshot,
    });
    expect(result.learned.turns[0]!.requiredEscalations).toEqual([]);
    expect(result.learned.turns[0]!.unsafeLifecycleViolations).toEqual(expect.arrayContaining([
      { code: "unexpected-escalations", turn: 1 },
    ]));
    expect(result.learned.turns[0]!.correctionStatus).toBe("incorrect");
  });
});

const asOf = "2026-08-08T12:00:00.000Z";

function createLane(fixture: KnowledgeHoldoutFixture) {
  const v1 = object(fixture, 1);
  const v2 = object(fixture, 2);
  const state = {
    ticketRevisions: [{ ticketId: fixture.initialTicket.id, revision: fixture.initialTicket.revision }],
    recommendationCount: 0, operationalAuditCount: 0,
    learningEventIds: [] as string[], candidateIds: [] as string[], versionIds: [] as string[],
    heads: [] as { objectId: string; headVersion: number }[], versions: [] as typeof v1[],
    events: [] as LearningEvent[],
  };
  if (fixture.lifecycle !== "none") {
    state.versions.push(v1); state.versionIds.push("credential-rotation:1"); state.heads.push({ objectId: "credential-rotation", headVersion: 1 });
    state.events.push(promoted(1));
  }
  if (fixture.lifecycle === "stale") state.events.push(stale());
  if (fixture.lifecycle === "contradicted") state.events.push(contradicted(fixture.initialTicket.id));
  if (fixture.lifecycle === "replacement-draft") {
    state.versions.push(v2); state.versionIds.push("credential-rotation:2"); state.heads[0] = { objectId: "credential-rotation", headVersion: 2 };
    state.candidateIds.push("draft-credential-rotation-v3");
    state.events.push(superseded(), promoted(2));
  }
  state.learningEventIds.push(...state.events.map(({ id }) => id));
  const service = new KnowledgeEvolutionService({
    objects: { async snapshotForReuse() { return { versions: state.versions, heads: new Map(state.heads.map(({ objectId, headVersion }) => [objectId, headVersion])), events: state.events }; } },
  } as never);
  return { state, service, knowledgeEvolution: service, snapshot: async () => ({
    ticketRevisions: structuredClone(state.ticketRevisions), recommendationCount: state.recommendationCount,
    operationalAuditCount: state.operationalAuditCount, learningEventIds: [...state.learningEventIds], candidateIds: [...state.candidateIds],
    versionIds: [...state.versionIds], heads: structuredClone(state.heads),
  }) };
}

function object(fixture: KnowledgeHoldoutFixture, version: number) {
  return KnowledgeObjectWriteSchema.parse({
    id: "credential-rotation", version, learningGovernance: "ledger", kind: "known-cause",
    name: "Credential rotation request failure", summary: `Approved credential rotation guidance version ${version}.`,
    triggerPatterns: ["Credential rotation request fails"], evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
    timeConstraints: ["Apply when the request failure matches the known condition."], diagnosticSteps: ["Review the request identifier."],
    fixSteps: ["Refresh the credential."], verificationSteps: ["Verify the next request."],
    customerSafeExplanation: "We found a recurring credential condition and will review the safe correction.",
    operatorRationale: "The approved version requires a request identifier.", owner: "api-platform", supportingDiagnosisIds: ["diagnosis-credential-rotation"],
    supportingTicketIds: [fixture.initialTicket.id], provenance: { source: "fixed-holdout", recordedAt: "2026-08-08T08:00:00.000Z" },
    status: "approved", approval: { approvedBy: "support-lead", approvedAt: "2026-08-08T08:00:00.000Z" },
  });
}

function eventBase(sourceVersion: number) { return { id: `00000000-0000-4000-8000-${String(sourceVersion).padStart(12, "0")}`, occurredAt: "2026-08-08T08:00:00.000Z", actor: "support-lead", correlationId: `10000000-0000-4000-8000-${String(sourceVersion).padStart(12, "0")}`, objectId: "credential-rotation", sourceVersion }; }
function promoted(version: number): LearningEvent { return { ...eventBase(version), id: `00000000-0000-4000-8001-${String(version).padStart(12, "0")}`, candidateId: `candidate-credential-rotation-v${version}`, eventType: "candidate-promoted", payload: { maturity: "promoted", health: "active", provenance: "fixed holdout promotion" } }; }
function stale(): LearningEvent { return { ...eventBase(1), id: "00000000-0000-4000-8002-000000000001", eventType: "knowledge-marked-stale", payload: { health: "stale", staleReasons: ["Fixed holdout stale signal."], provenance: "fixed holdout stale" } }; }
function contradicted(ticketId: string): LearningEvent { return { ...eventBase(1), id: "00000000-0000-4000-8003-000000000001", ticketId, eventType: "knowledge-reuse-failed", payload: { matchReasons: ["same symptom"], failureReason: "Fixed holdout correction rejected reuse.", provenance: "fixed holdout correction" } }; }
function superseded(): LearningEvent { return { ...eventBase(1), id: "00000000-0000-4000-8004-000000000001", eventType: "knowledge-version-superseded", payload: { health: "superseded", replacementVersion: 2, provenance: "fixed holdout replacement" } }; }

function mutate(state: ReturnType<typeof createLane>["state"], kind: "ticket" | "recommendation" | "audit" | "learning" | "candidate" | "version" | "head") {
  if (kind === "ticket") state.ticketRevisions[0]!.revision += 1;
  if (kind === "recommendation") state.recommendationCount += 1;
  if (kind === "audit") state.operationalAuditCount += 1;
  if (kind === "learning") state.learningEventIds.push("mutation-event");
  if (kind === "candidate") state.candidateIds.push("mutation-candidate");
  if (kind === "version") state.versionIds.push("credential-rotation:99");
  if (kind === "head") state.heads[0] = { objectId: "credential-rotation", headVersion: 99 };
}

function assertFixtureIsSnapshotBased(fixture: KnowledgeHoldoutFixture): void {
  expect(fixture.turns.length).toBeGreaterThan(0);
  let priorReplyIds: readonly string[] = [];
  for (const turn of fixture.turns) {
    expect(Object.isFrozen(turn.customerReplies)).toBe(true);
    expect(turn.customerReplies.map(({ id }) => id)).toEqual(expect.arrayContaining([...priorReplyIds]));
    priorReplyIds = turn.customerReplies.map(({ id }) => id);
  }
}
