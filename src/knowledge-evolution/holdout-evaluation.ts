import type { KnowledgeArticle, RequiredEscalation, SupportState } from "../domain.js";
import { evaluateTicketWithAi, type CustomerReply, type PreviousSupportResponse } from "../approval-desk/ai-evaluation.js";
import type { KnowledgeEvolutionService } from "./service.js";
import type { KnowledgeReference, ReusableKnowledgeResult } from "./reusable-context.js";
import type { HoldoutEfficacyScenario, HoldoutTurn, KnowledgeHoldoutFixture } from "./holdout-fixtures.js";

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
  code: "evidence-gate-bypassed" | "unexpected-support-state" | "wrong-known-cause-version" | "unexpected-known-event" | "unexpected-escalations" | "target-not-reached";
  turn: number;
};

export type HoldoutTurnResult = {
  turn: number;
  recommendation: EvaluationRecommendation;
  knownCauseRef?: KnowledgeReference;
  requestedEvidenceIds: readonly string[];
  providedEvidenceIds: readonly string[];
  missingEvidenceIds: readonly string[];
  requiredEscalations: readonly RequiredEscalation[];
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

export type HoldoutCaseDelta = {
  learnedMatchedExpectedKnowledge: boolean;
  baselineUnnecessaryEvidence: number;
  learnedUnnecessaryEvidence: number;
  unnecessaryEvidenceDelta: number;
  baselineMissingNecessaryEvidence: number;
  learnedMissingNecessaryEvidence: number;
  missingNecessaryEvidenceDelta: number;
  diagnosticTurnsSaved: number | null;
  repeatedEvidenceRequestCount: number;
  unsafeLifecycleChanges: number;
  correctionRequired: boolean;
};

export type HoldoutEfficacyLaneScore = {
  knowledgeMatchPrecision: number | null;
  knowledgeMatchRecall: number | null;
  evidencePrecision: number | null;
  missingEvidenceRate: number | null;
  unnecessaryEvidenceTotal: number;
  missingNecessaryEvidenceTotal: number;
  correctionRequiredRate: number | null;
  byScenario: Record<"truePositive" | "nearMiss" | "unrelated", Pick<HoldoutEfficacyLaneScore, "knowledgeMatchPrecision" | "knowledgeMatchRecall">>;
};

export type HoldoutScorecard = {
  efficacy: {
    baseline: HoldoutEfficacyLaneScore;
    learned: HoldoutEfficacyLaneScore;
    knowledgeMatchPrecision: number | null;
    knowledgeMatchRecall: number | null;
    evidencePrecision: number | null;
    missingEvidenceRate: number | null;
    unnecessaryEvidenceTotal: number;
    missingNecessaryEvidenceTotal: number;
    diagnosticTurnsSavedTotal: number | null;
    correctionRequiredRate: number | null;
    benefited: number;
    unchanged: number;
    regressed: number;
  };
  governance: {
    staleFalsePositiveRate: number | null;
    contradictedFalsePositiveRate: number | null;
    unhealthyFalsePositiveRate: number | null;
    unsafeLifecycleChanges: number;
    evidenceGateBypass: number;
  };
  version: {
    wrongVersionReuse: number;
    replacementCorrectnessRate: number | null;
    versionPinningRate: number | null;
  };
};

export type HoldoutCaseScore = {
  fixtureId: string;
  baselineClassificationContractMatched: boolean;
  learnedClassificationContractMatched: boolean;
  delta: HoldoutCaseDelta;
  comparison: "benefited" | "unchanged" | "regressed";
};

export type KnowledgeHoldoutScorecard = HoldoutScorecard & { cases: readonly HoldoutCaseScore[] };
export type HoldoutScoringInput = { fixture: KnowledgeHoldoutFixture; baseline: HoldoutLaneResult; learned: HoldoutLaneResult };

/** Pure scorer over retained production-path lane results. It performs no evaluation or persistence. */
export function scoreKnowledgeHoldoutResults(results: readonly HoldoutScoringInput[]): KnowledgeHoldoutScorecard {
  const cases = results.map(scoreCase);
  const efficacy = results.filter(({ fixture }) => fixture.scorecard.cohort === "efficacy");
  const governance = results.filter(({ fixture }) => fixture.scorecard.cohort === "governance");
  const version = results.filter(({ fixture }) => fixture.scorecard.cohort === "version");
  const efficacyCases = cases.filter(({ fixtureId }) => efficacy.some(({ fixture }) => fixture.id === fixtureId));
  const baseline = scoreEfficacyLane(efficacy, "baseline");
  const learned = scoreEfficacyLane(efficacy, "learned");
  const comparableTurns = cases
    .filter(({ fixtureId }) => efficacy.some(({ fixture }) => fixture.id === fixtureId))
    .map(({ delta }) => delta.diagnosticTurnsSaved)
    .filter((saved): saved is number => saved !== null);
  const stale = governance.filter(({ fixture }) => fixture.lifecycle === "stale");
  const contradicted = governance.filter(({ fixture }) => fixture.lifecycle === "contradicted");
  const reuseForbidden = (entries: readonly HoldoutScoringInput[]) => entries.filter(({ fixture, learned: lane }) => {
    const forbidden = fixture.scorecard.forbiddenKnowledgeRef;
    return forbidden !== undefined && sameReference(lane.finalRecommendation.knownCauseRef, forbidden);
  }).length;
  const replacement = version.filter(({ fixture }) => fixture.scorecard.versionScenario === "replacement");
  const pinning = version.filter(({ fixture }) => fixture.scorecard.versionScenario === "pinning");
  const matchesExpectedVersion = ({ fixture, learned: lane }: HoldoutScoringInput) => fixture.expectedTarget.knownCauseRef !== undefined
    && sameReference(lane.finalRecommendation.knownCauseRef, fixture.expectedTarget.knownCauseRef);

  return {
    cases,
    efficacy: {
      baseline,
      learned,
      knowledgeMatchPrecision: learned.knowledgeMatchPrecision,
      knowledgeMatchRecall: learned.knowledgeMatchRecall,
      evidencePrecision: learned.evidencePrecision,
      missingEvidenceRate: learned.missingEvidenceRate,
      unnecessaryEvidenceTotal: learned.unnecessaryEvidenceTotal,
      missingNecessaryEvidenceTotal: learned.missingNecessaryEvidenceTotal,
      diagnosticTurnsSavedTotal: comparableTurns.length === 0 ? null : comparableTurns.reduce((total, saved) => total + saved, 0),
      correctionRequiredRate: learned.correctionRequiredRate,
      benefited: efficacyCases.filter(({ comparison }) => comparison === "benefited").length,
      unchanged: efficacyCases.filter(({ comparison }) => comparison === "unchanged").length,
      regressed: efficacyCases.filter(({ comparison }) => comparison === "regressed").length,
    },
    governance: {
      staleFalsePositiveRate: rate(reuseForbidden(stale), stale.length),
      contradictedFalsePositiveRate: rate(reuseForbidden(contradicted), contradicted.length),
      unhealthyFalsePositiveRate: rate(reuseForbidden([...stale, ...contradicted]), stale.length + contradicted.length),
      // Safety counts span every retained turn/lane; stale and contradicted rates remain their own cohort.
      unsafeLifecycleChanges: results.reduce((total, { learned: lane }) => total + lane.unsafeLifecycleChanges.length, 0),
      evidenceGateBypass: results.reduce((total, { learned: lane }) => total + lane.unsafeLifecycleChanges.filter((code) => code === "evidence-gate-bypassed").length, 0),
    },
    version: {
      wrongVersionReuse: version.filter(({ fixture, learned: lane }) => fixture.expectedTarget.knownCauseRef !== undefined
        && lane.finalRecommendation.knownCauseRef !== undefined
        && !sameReference(lane.finalRecommendation.knownCauseRef, fixture.expectedTarget.knownCauseRef)).length,
      replacementCorrectnessRate: rate(replacement.filter(matchesExpectedVersion).length, replacement.length),
      versionPinningRate: rate(pinning.filter(matchesExpectedVersion).length, pinning.length),
    },
  };
}

function scoreCase({ fixture, baseline, learned }: HoldoutScoringInput): HoldoutCaseScore {
  const baselineEvidence = evidenceAccounting(fixture, baseline);
  const learnedEvidence = evidenceAccounting(fixture, learned);
  const learnedMatchedExpectedKnowledge = matchesExpectedKnowledge(fixture, learned);
  const diagnosticTurnsSaved = baseline.targetReached && learned.targetReached
    && baseline.turnsToExpectedTarget !== null && learned.turnsToExpectedTarget !== null
    ? baseline.turnsToExpectedTarget - learned.turnsToExpectedTarget
    : null;
  const baselineCorrectionRequired = requiresCorrection(baseline);
  const correctionRequired = requiresCorrection(learned);
  const learnedUnsafe = learned.unsafeLifecycleChanges.length > 0;
  const baselineUnsafe = baseline.unsafeLifecycleChanges.length > 0;
  const wrongVersion = fixture.expectedTarget.knownCauseRef !== undefined
    && learned.finalRecommendation.knownCauseRef !== undefined
    && !sameReference(learned.finalRecommendation.knownCauseRef, fixture.expectedTarget.knownCauseRef);
  const regression = (learnedUnsafe && !baselineUnsafe)
    || wrongVersion
    || (learnedEvidence.missingNecessaryEvidence > baselineEvidence.missingNecessaryEvidence && baselineEvidence.missingNecessaryEvidence === 0)
    || (correctionRequired && !baselineCorrectionRequired);
  const benefit = !regression && (learnedMatchedExpectedKnowledge && !matchesExpectedKnowledge(fixture, baseline)
    || learnedEvidence.unnecessaryEvidence < baselineEvidence.unnecessaryEvidence
    || (diagnosticTurnsSaved !== null && diagnosticTurnsSaved > 0)
    || (!baseline.targetReached && learned.targetReached));
  return {
    fixtureId: fixture.id,
    baselineClassificationContractMatched: baseline.outcomeMatched,
    learnedClassificationContractMatched: learned.outcomeMatched,
    delta: {
      learnedMatchedExpectedKnowledge,
      baselineUnnecessaryEvidence: baselineEvidence.unnecessaryEvidence,
      learnedUnnecessaryEvidence: learnedEvidence.unnecessaryEvidence,
      unnecessaryEvidenceDelta: learnedEvidence.unnecessaryEvidence - baselineEvidence.unnecessaryEvidence,
      baselineMissingNecessaryEvidence: baselineEvidence.missingNecessaryEvidence,
      learnedMissingNecessaryEvidence: learnedEvidence.missingNecessaryEvidence,
      missingNecessaryEvidenceDelta: learnedEvidence.missingNecessaryEvidence - baselineEvidence.missingNecessaryEvidence,
      diagnosticTurnsSaved,
      repeatedEvidenceRequestCount: learnedEvidence.repeatedEvidenceRequestCount,
      unsafeLifecycleChanges: learned.unsafeLifecycleChanges.length,
      correctionRequired,
    },
    comparison: regression ? "regressed" : benefit ? "benefited" : "unchanged",
  };
}

function scoreEfficacyLane(results: readonly HoldoutScoringInput[], laneName: "baseline" | "learned"): HoldoutEfficacyLaneScore {
  const accounting = results.map(({ fixture, [laneName]: lane }) => ({ fixture, lane, evidence: evidenceAccounting(fixture, lane) }));
  const matchScore = scoreKnowledgeMatches(accounting);
  const byScenario = {
    truePositive: scoreKnowledgeMatches(accounting.filter(({ fixture }) => fixture.scorecard.efficacyScenario === "true-positive")),
    nearMiss: scoreKnowledgeMatches(accounting.filter(({ fixture }) => fixture.scorecard.efficacyScenario === "near-miss")),
    unrelated: scoreKnowledgeMatches(accounting.filter(({ fixture }) => fixture.scorecard.efficacyScenario === "unrelated")),
  };
  const requested = accounting.reduce((total, value) => total + value.evidence.requested.length, 0);
  const necessaryRequested = accounting.reduce((total, value) => total + value.evidence.necessaryRequested, 0);
  const expected = accounting.reduce((total, { fixture }) => total + new Set(fixture.expectedEvidenceIds).size, 0);
  const missing = accounting.reduce((total, value) => total + value.evidence.missingNecessaryEvidence, 0);
  const correctionRequired = accounting.filter(({ lane }) => requiresCorrection(lane)).length;
  return {
    ...matchScore,
    evidencePrecision: rate(necessaryRequested, requested),
    missingEvidenceRate: rate(missing, expected),
    unnecessaryEvidenceTotal: accounting.reduce((total, value) => total + value.evidence.unnecessaryEvidence, 0),
    missingNecessaryEvidenceTotal: missing,
    correctionRequiredRate: rate(correctionRequired, accounting.length),
    byScenario,
  };
}

function scoreKnowledgeMatches(entries: readonly { fixture: KnowledgeHoldoutFixture; lane: HoldoutLaneResult }[]) {
  const matched = entries.filter(({ fixture, lane }) => matchesExpectedKnowledge(fixture, lane)).length;
  const actualMatches = entries.filter(({ lane }) => lane.finalRecommendation.knownCauseRef !== undefined).length;
  const expectedMatches = entries.filter(({ fixture }) => fixture.expectedTarget.knownCauseRef !== undefined).length;
  return { knowledgeMatchPrecision: rate(matched, actualMatches), knowledgeMatchRecall: rate(matched, expectedMatches) };
}

function evidenceAccounting(fixture: KnowledgeHoldoutFixture, lane: HoldoutLaneResult) {
  const requested = [...new Set(lane.turns.flatMap((turn) => turn.requestedEvidenceIds))];
  const expected = new Set(fixture.expectedEvidenceIds);
  const allRequested = lane.turns.flatMap((turn) => turn.requestedEvidenceIds);
  return {
    requested,
    unnecessaryEvidence: requested.filter((id) => !expected.has(id)).length,
    missingNecessaryEvidence: [...expected].filter((id) => !requested.includes(id)).length,
    necessaryRequested: requested.filter((id) => expected.has(id)).length,
    repeatedEvidenceRequestCount: allRequested.length - requested.length,
  };
}

function matchesExpectedKnowledge(fixture: KnowledgeHoldoutFixture, lane: HoldoutLaneResult): boolean {
  return fixture.expectedTarget.knownCauseRef !== undefined
    && sameReference(lane.finalRecommendation.knownCauseRef, fixture.expectedTarget.knownCauseRef);
}

function requiresCorrection(lane: HoldoutLaneResult): boolean {
  return !lane.outcomeMatched || lane.turns.some((turn) => turn.correctionStatus === "incorrect");
}

function rate(numerator: number, denominator: number): number | null { return denominator === 0 ? null : numerator / denominator; }

/** A fixture-specific isolated state source. Setup must finish before this is returned. */
export type IsolatedHoldoutLane = {
  knowledgeEvolution: Pick<KnowledgeEvolutionService, "listReusableApproved">;
  snapshot: () => Promise<HoldoutStateSnapshot>;
};

export async function evaluateKnowledgeHoldoutFixture(input: {
  fixture: KnowledgeHoldoutFixture;
  knowledgeEvolution: Pick<KnowledgeEvolutionService, "listReusableApproved">;
  allKnowledgeArticles: readonly KnowledgeArticle[];
  asOf: string;
  actor: string;
  snapshot: () => Promise<HoldoutStateSnapshot>;
  createIsolatedLane?: (fixture: KnowledgeHoldoutFixture) => Promise<IsolatedHoldoutLane>;
  responseStyle?: "auto" | "balanced" | "concise" | "empathetic" | "technical" | "executive-update";
}): Promise<KnowledgeHoldoutEvaluation> {
  const isolated = input.createIsolatedLane === undefined
    ? { knowledgeEvolution: input.knowledgeEvolution, snapshot: input.snapshot }
    : await input.createIsolatedLane(input.fixture);
  // Setup is intentionally complete before this snapshot. Everything below is read-only.
  const before = await isolated.snapshot();
  const learned = await isolated.knowledgeEvolution.listReusableApproved({ asOf: input.asOf });
  const baseline = await evaluateLane({ ...input, before, snapshot: isolated.snapshot, reusableKnowledge: undefined });
  const learnedLane = await evaluateLane({ ...input, before, snapshot: isolated.snapshot, reusableKnowledge: learned });
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
  const requiredEscalations = [...(recommendation.escalationReasons ?? [])].sort();
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
  if (contract?.requiredEscalations !== undefined && !sameSet(requiredEscalations, contract.requiredEscalations)) {
    violations.push({ code: "unexpected-escalations", turn });
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
    requiredEscalations,
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
