import type { KnowledgeArticle, SupportState } from "../domain.js";
import { evaluateTicketWithAi, type CustomerReply, type PreviousSupportResponse } from "../approval-desk/ai-evaluation.js";
import type { KnowledgeEvolutionService } from "./service.js";
import type { KnowledgeReference, ReusableKnowledgeResult } from "./reusable-context.js";
import type { HoldoutTurn, KnowledgeHoldoutFixture } from "./holdout-fixtures.js";

type EvaluationRecommendation = Awaited<ReturnType<typeof evaluateTicketWithAi>>;

export type HoldoutStateSnapshot = {
  ticketRevisions: readonly { ticketId: string; revision: number }[];
  recommendationCount: number;
  operationalAuditCount: number;
  learningEventIds: readonly string[];
  candidateIds: readonly string[];
  versionIds: readonly string[];
  heads: readonly { objectId: string; headVersion: number }[];
};

export type UnsafeLifecycleViolation = {
  code: "evidence-gate-bypassed" | "unexpected-support-state" | "wrong-known-cause-version" | "unexpected-known-event" | "target-not-reached";
  turn: number;
};

export type HoldoutTurnResult = {
  turn: number;
  recommendation: EvaluationRecommendation;
  knownCauseRef?: KnowledgeReference;
  requestedEvidenceIds: readonly string[];
  providedEvidenceIds: readonly string[];
  missingEvidenceIds: readonly string[];
  supportState?: SupportState;
  targetMatched: boolean;
  correctionStatus: "not-required" | "correct" | "incorrect";
  unsafeLifecycleViolations: readonly UnsafeLifecycleViolation[];
};

export type HoldoutLaneResult = {
  turns: readonly HoldoutTurnResult[];
  finalRecommendation: EvaluationRecommendation;
  targetReached: boolean;
  turnsToExpectedTarget: number | null;
  outcomeMatched: boolean;
  unsafeLifecycleViolations: readonly UnsafeLifecycleViolation[];
  unsafeLifecycleChanges: readonly string[];
  before: HoldoutStateSnapshot;
  after: HoldoutStateSnapshot;
};

export type KnowledgeHoldoutEvaluation = { baseline: HoldoutLaneResult; learned: HoldoutLaneResult };

export async function evaluateKnowledgeHoldoutFixture(input: {
  fixture: KnowledgeHoldoutFixture;
  knowledgeEvolution: Pick<KnowledgeEvolutionService, "listReusableApproved">;
  allKnowledgeArticles: readonly KnowledgeArticle[];
  asOf: string;
  actor: string;
  snapshot: () => Promise<HoldoutStateSnapshot>;
  responseStyle?: "auto" | "balanced" | "concise" | "empathetic" | "technical" | "executive-update";
}): Promise<KnowledgeHoldoutEvaluation> {
  // Setup is intentionally complete before this snapshot. Everything below is read-only.
  const before = await input.snapshot();
  const learned = await input.knowledgeEvolution.listReusableApproved({ asOf: input.asOf });
  const baseline = await evaluateLane({ ...input, before, reusableKnowledge: undefined });
  const learnedLane = await evaluateLane({ ...input, before, reusableKnowledge: learned });
  return { baseline, learned: learnedLane };
}

async function evaluateLane(input: {
  fixture: KnowledgeHoldoutFixture;
  allKnowledgeArticles: readonly KnowledgeArticle[];
  asOf: string;
  actor: string;
  before: HoldoutStateSnapshot;
  snapshot: () => Promise<HoldoutStateSnapshot>;
  responseStyle?: "auto" | "balanced" | "concise" | "empathetic" | "technical" | "executive-update";
  reusableKnowledge: ReusableKnowledgeResult | undefined;
}): Promise<HoldoutLaneResult> {
  const turns: HoldoutTurnResult[] = [];
  for (const [index, turn] of input.fixture.turns.entries()) {
    // expectedOutcome is deliberately absent: it remains a scorer oracle, never a production shortcut.
    const recommendation = await evaluateTicketWithAi({
      ticket: input.fixture.initialTicket,
      actor: input.actor,
      allKnowledgeArticles: input.allKnowledgeArticles,
      ...(input.reusableKnowledge === undefined ? {} : { reusableKnowledge: input.reusableKnowledge }),
      customerReplies: cloneReplies(turn.customerReplies),
      ...(turn.previousSupportResponse === undefined ? {} : { previousSupportResponse: { ...turn.previousSupportResponse } }),
      aiPreference: "deterministic",
      responseStyle: input.responseStyle ?? "balanced",
    });
    turns.push(scoreTurn(input.fixture, turn, index + 1, recommendation));
  }
  const after = await input.snapshot();
  assertReadOnly(input.before, after);
  const finalRecommendation = turns.at(-1)!.recommendation;
  const targetTurn = turns.find((turn) => turn.targetMatched);
  const violations = turns.flatMap((turn) => turn.unsafeLifecycleViolations);
  return {
    turns,
    finalRecommendation,
    targetReached: targetTurn !== undefined,
    turnsToExpectedTarget: targetTurn?.turn ?? null,
    outcomeMatched: scoreOutcome(input.fixture, finalRecommendation),
    unsafeLifecycleViolations: violations,
    unsafeLifecycleChanges: [...new Set(violations.map(({ code }) => code))],
    before: input.before,
    after,
  };
}

function scoreTurn(fixture: KnowledgeHoldoutFixture, expectedTurn: HoldoutTurn, turn: number, recommendation: EvaluationRecommendation): HoldoutTurnResult {
  const requestedEvidenceIds = (recommendation.requiredEvidence ?? []).map(({ id }) => id).sort();
  const providedEvidenceIds = (recommendation.providedEvidence ?? []).map(({ id }) => id).sort();
  const missingEvidenceIds = (recommendation.missingEvidence ?? []).map(({ id }) => id).sort();
  const evidenceSatisfied = fixture.expectedEvidenceIds.every((id) => !missingEvidenceIds.includes(id));
  const contract = expectedTurn.expected;
  const violations: UnsafeLifecycleViolation[] = [];
  if (contract?.requiredEvidenceSatisfied === false && recommendation.supportState === "known-cause") {
    violations.push({ code: "evidence-gate-bypassed", turn });
  }
  if (contract?.supportState !== undefined && recommendation.supportState !== contract.supportState) {
    violations.push({ code: "unexpected-support-state", turn });
  }
  if (contract?.knownCauseRef !== undefined && !sameReference(recommendation.knownCauseRef, contract.knownCauseRef)) {
    violations.push({ code: "wrong-known-cause-version", turn });
  }
  if (contract?.knownEventId !== undefined && recommendation.knownEventId !== contract.knownEventId) {
    violations.push({ code: "unexpected-known-event", turn });
  }
  const targetMatched = matchesTarget(fixture, recommendation, evidenceSatisfied);
  if (turn === fixture.turns.length && !targetMatched) violations.push({ code: "target-not-reached", turn });
  return {
    turn,
    recommendation,
    ...(recommendation.knownCauseRef === undefined ? {} : { knownCauseRef: recommendation.knownCauseRef }),
    requestedEvidenceIds,
    providedEvidenceIds,
    missingEvidenceIds,
    ...(recommendation.supportState === undefined ? {} : { supportState: recommendation.supportState }),
    targetMatched,
    correctionStatus: contract === undefined ? "not-required" : violations.length === 0 ? "correct" : "incorrect",
    unsafeLifecycleViolations: violations,
  };
}

function matchesTarget(fixture: KnowledgeHoldoutFixture, recommendation: EvaluationRecommendation, evidenceSatisfied: boolean): boolean {
  const target = fixture.expectedTarget;
  return recommendation.supportState === target.supportState
    && (target.knownCauseRef === undefined || sameReference(recommendation.knownCauseRef, target.knownCauseRef))
    && (target.knownEventId === undefined || recommendation.knownEventId === target.knownEventId)
    && (target.requiredEvidenceSatisfied === undefined || evidenceSatisfied === target.requiredEvidenceSatisfied);
}

function scoreOutcome(fixture: KnowledgeHoldoutFixture, recommendation: EvaluationRecommendation): boolean {
  const expected = fixture.expectedOutcome;
  return recommendation.category === expected.category
    && expected.acceptablePriorities.includes(recommendation.priority)
    && recommendation.team === expected.team
    && sameSet(recommendation.escalationReasons ?? [], expected.requiredEscalations)
    && sameSet(recommendation.knowledgeArticleIds, expected.knowledgeArticleIds);
}

function assertReadOnly(before: HoldoutStateSnapshot, after: HoldoutStateSnapshot): void {
  if (JSON.stringify(normalizeSnapshot(before)) !== JSON.stringify(normalizeSnapshot(after))) {
    throw new Error("Knowledge holdout evaluation mutated isolated production state.");
  }
}

function normalizeSnapshot(snapshot: HoldoutStateSnapshot): HoldoutStateSnapshot {
  return {
    ticketRevisions: [...snapshot.ticketRevisions].sort((a, b) => a.ticketId.localeCompare(b.ticketId)),
    recommendationCount: snapshot.recommendationCount,
    operationalAuditCount: snapshot.operationalAuditCount,
    learningEventIds: [...snapshot.learningEventIds].sort(),
    candidateIds: [...snapshot.candidateIds].sort(),
    versionIds: [...snapshot.versionIds].sort(),
    heads: [...snapshot.heads].sort((a, b) => a.objectId.localeCompare(b.objectId)),
  };
}

function cloneReplies(replies: readonly CustomerReply[]): CustomerReply[] { return replies.map((reply) => ({ ...reply })); }
function sameReference(actual: KnowledgeReference | undefined, expected: KnowledgeReference): boolean { return actual?.objectId === expected.objectId && actual.version === expected.version; }
function sameSet(actual: readonly string[], expected: readonly string[]): boolean { return actual.length === expected.length && actual.every((value) => expected.includes(value)); }
