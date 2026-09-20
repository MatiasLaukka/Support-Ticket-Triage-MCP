import type { ApplicabilityCapture, ApplicabilityCaseCapture, ApplicabilityLaneCapture } from "./applicability-capture.js";
import type { ApplicabilityDevelopmentCase, ApplicabilityOracleJudgment } from "./applicability-cases.js";
import type { ApplicabilityVerdict, DiagnosticHypothesis, EvidenceReference } from "./applicability-types.js";

const VERDICTS = ["applicable-next-step", "contradicted", "insufficient-evidence", "irrelevant"] as const satisfies readonly ApplicabilityVerdict[];

type Rate = { numerator: number; denominator: number; rate: number | null };
type VerdictMetric = { support: number; precision: number | null; recall: number | null; f1: number | null };
type ConfusionMatrix = Record<ApplicabilityVerdict, Record<ApplicabilityVerdict, number>>;

export type ApplicabilityLaneEvaluation = {
  confusionMatrix: ConfusionMatrix;
  perVerdict: Record<ApplicabilityVerdict, VerdictMetric>;
  macroF1: number | null;
  applicablePrecision: Rate;
  applicableRecall: Rate;
  dangerousFalsePositive: Rate;
  insufficientEvidenceRecognition: Rate;
  structuralEvidenceReferences: Rate;
  semanticallyCorrectCitations: Rate;
  hypothesisAccuracy: Rate;
  hypothesisCoverage: Rate;
  abstentionPrecision: Rate;
  abstentionRecall: Rate;
  alternativeCoverage: Rate;
  evidenceActionCoverage: Rate;
  novelHypothesesRequiringReview: readonly string[];
  unsupportedClaimCount: number;
  hallucinatedReferenceCount: number;
  taxonomyRelations: { supports: number; conflicts: number; neutral: number; unavailable: number };
  outcomes: { complete: number; partial: number; skipped: number; failed: number };
  inputSizing: {
    serializedBytes: readonly number[];
    estimatedInputTokens: readonly number[];
    minimumContextTokens: readonly number[];
  };
};

export type ApplicabilityEvaluationReport = {
  formatVersion: 1;
  mode: "development-applicability-comparison";
  evaluatedSplit: "development";
  holdoutExecuted: false;
  captureHash: string;
  identity: ApplicabilityCapture["identity"];
  baseline: ApplicabilityLaneEvaluation;
  lanes: Record<"evidence-only" | "taxonomy-informed", ApplicabilityLaneEvaluation>;
  taxonomyDelta: {
    beneficial: number;
    harmful: number;
    neutral: number;
    addedDangerousFalsePositives: readonly { caseId: string; resourceKey: string }[];
    correctedDangerousFalsePositives: readonly { caseId: string; resourceKey: string }[];
    abstentionChanges: readonly { caseId: string; oracle: "hypothesis" | "abstain"; evidenceOnly: "hypothesis" | "abstain" | "unavailable"; taxonomyInformed: "hypothesis" | "abstain" | "unavailable" }[];
    evidenceChallengesTaxonomy: readonly { caseId: string; resourceKey: string; verdict: ApplicabilityVerdict }[];
  };
  exclusions: {
    unjudgedPairs: number;
    unavailablePairs: number;
    skippedCases: readonly { caseId: string; lane: string; reason: string }[];
    failedCases: readonly { caseId: string; lane: string; reason: string; failureMode?: string }[];
    failureModeCounts: Readonly<Record<string, number>>;
    novelHypothesisCases: readonly { caseId: string; lane: string }[];
  };
  classification: "promising" | "regressive" | "inconclusive";
  authorizationReference?: string;
};

function zeroMatrix(): ConfusionMatrix {
  return Object.fromEntries(VERDICTS.map((actual) => [actual, Object.fromEntries(VERDICTS.map((predicted) => [predicted, 0]))])) as ConfusionMatrix;
}
function rate(numerator: number, denominator: number): Rate { return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator }; }
function safeF1(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null) return null;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}
function verdictMetrics(matrix: ConfusionMatrix): Record<ApplicabilityVerdict, VerdictMetric> {
  return Object.fromEntries(VERDICTS.map((label) => {
    const support = VERDICTS.reduce((sum, predicted) => sum + matrix[label][predicted], 0);
    const tp = matrix[label][label];
    const predicted = VERDICTS.reduce((sum, actual) => sum + matrix[actual][label], 0);
    const precision = predicted === 0 ? null : tp / predicted;
    const recall = support === 0 ? null : tp / support;
    return [label, { support, precision, recall, f1: support === 0 ? null : safeF1(precision, recall) }];
  })) as Record<ApplicabilityVerdict, VerdictMetric>;
}
function macroF1(metrics: Record<ApplicabilityVerdict, VerdictMetric>): number | null {
  const values = VERDICTS.map((label) => metrics[label].f1).filter((value): value is number => value !== null);
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}
function refKey(reference: EvidenceReference): string { return `${reference.kind}:${reference.id}`; }
function textIncludesConcepts(text: string, concepts: readonly string[]): boolean {
  const normalized = text.toLocaleLowerCase();
  return concepts.every((concept) => normalized.includes(concept.toLocaleLowerCase()));
}
function hypothesisMatches(hypothesis: DiagnosticHypothesis, oracle: ApplicabilityDevelopmentCase["synthesisOracle"]["acceptableLeadingHypotheses"][number]): boolean {
  if (hypothesis.kind !== "candidate-grounded") return false;
  const pool = new Set<string>(oracle.candidateKeyPool);
  const matches = hypothesis.candidateKeys.filter((key) => pool.has(key)).length;
  return matches >= oracle.minimumCandidateMatches && textIncludesConcepts(hypothesis.summary, oracle.requiredConcepts);
}
function actionText(action: { action: string; expectedEvidence: string }): string { return `${action.action} ${action.expectedEvidence}`; }
function actionIntentCovered(
  synthesis: any,
  intent: ApplicabilityDevelopmentCase["synthesisOracle"]["evidenceActionIntents"][number],
): boolean {
  const actions = synthesis.nextEvidenceActions as Array<any>;
  return actions.some((action) => {
    if (!intent.allowedActionTypes.includes(action.actionType)) return false;
    if (synthesis.disposition === "hypothesis") {
      const ranks = Array.isArray(action.hypothesisRanks) ? action.hypothesisRanks : [];
      if (!intent.targetRanks.every((rank) => ranks.includes(rank))) return false;
    } else if (intent.targetRanks.length !== 0) return false;
    return textIncludesConcepts(actionText(action), intent.requiredConcepts);
  });
}
function oracleByCase(cases: readonly ApplicabilityDevelopmentCase[]): Map<string, ApplicabilityDevelopmentCase> {
  return new Map(cases.map((entry) => [entry.id, entry]));
}
function capturedCaseById(capture: ApplicabilityCapture): Map<string, ApplicabilityCaseCapture> {
  return new Map(capture.cases.map((entry) => [entry.caseId, entry]));
}
function assessmentMap(lane: ApplicabilityLaneCapture): Map<string, any> {
  if (lane.result.status !== "complete" && lane.result.status !== "partial-assessment") return new Map();
  return new Map(lane.result.assessments.map((assessment) => [assessment.resourceKey, assessment]));
}
function availableSet(captureCase: ApplicabilityCaseCapture): Set<string> {
  return new Set(captureCase.candidates.filter((candidate) => candidate.evidence.status === "available").map((candidate) => candidate.resourceKey));
}
function structurallyValidReference(captureCase: ApplicabilityCaseCapture, reference: EvidenceReference): boolean {
  if (reference.kind === "case-fact") return [...captureCase.safeCase.observedFacts, ...captureCase.safeCase.conversationState].some(({ id }) => id === reference.id);
  return captureCase.evidence.some(({ id }) => id === reference.id);
}
function semanticallyCorrectReferences(judgment: ApplicabilityOracleJudgment, assessment: any): Rate {
  const expectedSupporting = new Set(judgment.supportingEvidence.map(refKey));
  const expectedContradicting = new Set(judgment.contradictingEvidence.map(refKey));
  const suppliedSupporting = (assessment.supportingEvidence as EvidenceReference[]) ?? [];
  const suppliedContradicting = (assessment.contradictingEvidence as EvidenceReference[]) ?? [];
  const denominator = suppliedSupporting.length + suppliedContradicting.length;
  const numerator = suppliedSupporting.filter((reference) => expectedSupporting.has(refKey(reference))).length
    + suppliedContradicting.filter((reference) => expectedContradicting.has(refKey(reference))).length;
  return rate(numerator, denominator);
}

function emptyLaneEvaluation(): ApplicabilityLaneEvaluation {
  const matrix = zeroMatrix();
  const metrics = verdictMetrics(matrix);
  return {
    confusionMatrix: matrix, perVerdict: metrics, macroF1: null,
    applicablePrecision: rate(0, 0), applicableRecall: rate(0, 0), dangerousFalsePositive: rate(0, 0), insufficientEvidenceRecognition: rate(0, 0),
    structuralEvidenceReferences: rate(0, 0), semanticallyCorrectCitations: rate(0, 0), hypothesisAccuracy: rate(0, 0), hypothesisCoverage: rate(0, 0),
    abstentionPrecision: rate(0, 0), abstentionRecall: rate(0, 0), alternativeCoverage: rate(0, 0), evidenceActionCoverage: rate(0, 0),
    novelHypothesesRequiringReview: [], unsupportedClaimCount: 0, hallucinatedReferenceCount: 0, taxonomyRelations: { supports: 0, conflicts: 0, neutral: 0, unavailable: 0 },
    outcomes: { complete: 0, partial: 0, skipped: 0, failed: 0 },
    inputSizing: { serializedBytes: [], estimatedInputTokens: [], minimumContextTokens: [] },
  };
}

function scoreLane(
  capture: ApplicabilityCapture,
  cases: readonly ApplicabilityDevelopmentCase[],
  laneName: "evidence-only" | "taxonomy-informed",
): ApplicabilityLaneEvaluation {
  const matrix = zeroMatrix();
  let structuralNumerator = 0; let structuralDenominator = 0;
  let semanticNumerator = 0; let semanticDenominator = 0;
  let hypothesisCorrect = 0; let hypothesisEligible = 0; let hypothesisCovered = 0; let hypothesisCoverageEligible = 0;
  let abstainPredicted = 0; let abstainCorrect = 0; let abstainExpected = 0;
  let alternativeNumerator = 0; let alternativeDenominator = 0;
  let actionNumerator = 0; let actionDenominator = 0;
  const novelCases: string[] = [];
  let hallucinatedReferenceCount = 0;
  let unsupportedClaimCount = 0;
  const taxonomyRelations = { supports: 0, conflicts: 0, neutral: 0, unavailable: 0 };
  const outcomes = { complete: 0, partial: 0, skipped: 0, failed: 0 };
  const sizing = { serializedBytes: [] as number[], estimatedInputTokens: [] as number[], minimumContextTokens: [] as number[] };
  const byCase = oracleByCase(cases);

  for (const capturedCase of capture.cases) {
    const oracle = byCase.get(capturedCase.caseId);
    if (!oracle) continue;
    const lane = capturedCase.lanes.find((entry) => entry.lane === laneName)!;
    sizing.serializedBytes.push(lane.inputMeasurement.serializedBytes);
    sizing.estimatedInputTokens.push(lane.inputMeasurement.estimatedInputTokens);
    sizing.minimumContextTokens.push(lane.inputMeasurement.minimumContextTokens);
    if (lane.result.status === "complete") outcomes.complete += 1;
    else if (lane.result.status === "partial-assessment") outcomes.partial += 1;
    else if (lane.result.status === "assessment-skipped") outcomes.skipped += 1;
    else outcomes.failed += 1;

    const assessments = assessmentMap(lane);
    const available = availableSet(capturedCase);
    for (const judgment of oracle.judgments) {
      if (!available.has(judgment.resourceKey)) continue;
      const assessment = assessments.get(judgment.resourceKey);
      if (!assessment) continue;
      matrix[judgment.verdict][assessment.verdict as ApplicabilityVerdict] += 1;
      const allReferences: EvidenceReference[] = [
        ...(assessment.supportingEvidence ?? []), ...(assessment.contradictingEvidence ?? []),
        ...((assessment.missingEvidence ?? []) as any[]).flatMap((item) => item.evidence ?? []),
      ];
      for (const reference of allReferences) {
        structuralDenominator += 1;
        if (structurallyValidReference(capturedCase, reference)) structuralNumerator += 1;
        else hallucinatedReferenceCount += 1;
      }
      const semantic = semanticallyCorrectReferences(judgment, assessment);
      semanticNumerator += semantic.numerator; semanticDenominator += semantic.denominator;
      if (assessment.taxonomyRelation && assessment.taxonomyRelation in taxonomyRelations) {
        taxonomyRelations[assessment.taxonomyRelation as keyof typeof taxonomyRelations] += 1;
      }
    }

    if (lane.result.status !== "complete" && lane.result.status !== "partial-assessment") continue;
    const synthesis = lane.result.synthesis;
    const synthesisText = JSON.stringify(synthesis).toLocaleLowerCase();
    for (const forbidden of oracle.synthesisOracle.forbiddenClaims) {
      const phrase = forbidden.toLocaleLowerCase().replace(/^do not\s+(?:claim|infer|treat|assign|attribute|equate|make|turn|select)\s+/, "").replace(/[.]+$/, "").trim();
      if (phrase.length >= 12 && synthesisText.includes(phrase)) unsupportedClaimCount += 1;
    }
    if (oracle.synthesisOracle.disposition === "abstain") abstainExpected += 1;
    if (synthesis.disposition === "abstain") {
      abstainPredicted += 1;
      if (oracle.synthesisOracle.disposition === "abstain") abstainCorrect += 1;
    }
    if (oracle.synthesisOracle.disposition === "hypothesis") {
      hypothesisCoverageEligible += 1;
      if (synthesis.disposition === "hypothesis") hypothesisCovered += 1;
      if (synthesis.disposition === "hypothesis" && synthesis.leadingHypothesis.kind === "novel") {
        novelCases.push(capturedCase.caseId);
      } else if (synthesis.disposition === "hypothesis") {
        hypothesisEligible += 1;
        if (oracle.synthesisOracle.acceptableLeadingHypotheses.some((expected) => hypothesisMatches(synthesis.leadingHypothesis, expected))) hypothesisCorrect += 1;
      }
      if (synthesis.disposition === "hypothesis") {
        oracle.synthesisOracle.orderedAlternativeHypotheses.forEach((expected, index) => {
          alternativeDenominator += 1;
          const actual = synthesis.alternatives[index];
          if (actual !== undefined && hypothesisMatches(actual, expected)) alternativeNumerator += 1;
        });
      } else alternativeDenominator += oracle.synthesisOracle.orderedAlternativeHypotheses.length;
    }
    for (const intent of oracle.synthesisOracle.evidenceActionIntents) {
      actionDenominator += 1;
      if (actionIntentCovered(synthesis, intent)) actionNumerator += 1;
    }
  }

  const metrics = verdictMetrics(matrix);
  const applicableTp = matrix["applicable-next-step"]["applicable-next-step"];
  const applicablePredicted = VERDICTS.reduce((sum, actual) => sum + matrix[actual]["applicable-next-step"], 0);
  const applicableActual = VERDICTS.reduce((sum, predicted) => sum + matrix["applicable-next-step"][predicted], 0);
  const dangerousDenominator = VERDICTS.reduce((sum, predicted) => sum + matrix.contradicted[predicted] + matrix.irrelevant[predicted], 0);
  const dangerousNumerator = matrix.contradicted["applicable-next-step"] + matrix.irrelevant["applicable-next-step"];
  const insufficientActual = VERDICTS.reduce((sum, predicted) => sum + matrix["insufficient-evidence"][predicted], 0);
  return {
    confusionMatrix: matrix,
    perVerdict: metrics,
    macroF1: macroF1(metrics),
    applicablePrecision: rate(applicableTp, applicablePredicted),
    applicableRecall: rate(applicableTp, applicableActual),
    dangerousFalsePositive: rate(dangerousNumerator, dangerousDenominator),
    insufficientEvidenceRecognition: rate(matrix["insufficient-evidence"]["insufficient-evidence"], insufficientActual),
    structuralEvidenceReferences: rate(structuralNumerator, structuralDenominator),
    semanticallyCorrectCitations: rate(semanticNumerator, semanticDenominator),
    hypothesisAccuracy: rate(hypothesisCorrect, hypothesisEligible),
    hypothesisCoverage: rate(hypothesisCovered, hypothesisCoverageEligible),
    abstentionPrecision: rate(abstainCorrect, abstainPredicted),
    abstentionRecall: rate(abstainCorrect, abstainExpected),
    alternativeCoverage: rate(alternativeNumerator, alternativeDenominator),
    evidenceActionCoverage: rate(actionNumerator, actionDenominator),
    novelHypothesesRequiringReview: novelCases,
    unsupportedClaimCount,
    hallucinatedReferenceCount,
    taxonomyRelations,
    outcomes,
    inputSizing: sizing,
  };
}

function scoreBaseline(capture: ApplicabilityCapture, cases: readonly ApplicabilityDevelopmentCase[]): ApplicabilityLaneEvaluation {
  const result = emptyLaneEvaluation();
  const byCase = oracleByCase(cases);
  for (const capturedCase of capture.cases) {
    const oracle = byCase.get(capturedCase.caseId); if (!oracle) continue;
    const available = availableSet(capturedCase);
    for (const judgment of oracle.judgments) {
      if (!available.has(judgment.resourceKey)) continue;
      result.confusionMatrix[judgment.verdict]["applicable-next-step"] += 1;
    }
  }
  result.perVerdict = verdictMetrics(result.confusionMatrix);
  result.macroF1 = macroF1(result.perVerdict);
  const tp = result.confusionMatrix["applicable-next-step"]["applicable-next-step"];
  const predicted = VERDICTS.reduce((sum, actual) => sum + result.confusionMatrix[actual]["applicable-next-step"], 0);
  const actual = VERDICTS.reduce((sum, pred) => sum + result.confusionMatrix["applicable-next-step"][pred], 0);
  const dangerDen = VERDICTS.reduce((sum, pred) => sum + result.confusionMatrix.contradicted[pred] + result.confusionMatrix.irrelevant[pred], 0);
  result.applicablePrecision = rate(tp, predicted);
  result.applicableRecall = rate(tp, actual);
  result.dangerousFalsePositive = rate(result.confusionMatrix.contradicted["applicable-next-step"] + result.confusionMatrix.irrelevant["applicable-next-step"], dangerDen);
  const insuff = VERDICTS.reduce((sum, pred) => sum + result.confusionMatrix["insufficient-evidence"][pred], 0);
  result.insufficientEvidenceRecognition = rate(result.confusionMatrix["insufficient-evidence"]["insufficient-evidence"], insuff);
  return result;
}

function verdictCorrect(expected: ApplicabilityVerdict, actual: ApplicabilityVerdict | undefined): boolean { return actual === expected; }
function taxonomyDelta(capture: ApplicabilityCapture, cases: readonly ApplicabilityDevelopmentCase[]) {
  let beneficial = 0; let harmful = 0; let neutral = 0;
  const addedDangerousFalsePositives: { caseId: string; resourceKey: string }[] = [];
  const correctedDangerousFalsePositives: { caseId: string; resourceKey: string }[] = [];
  const abstentionChanges: { caseId: string; oracle: "hypothesis" | "abstain"; evidenceOnly: "hypothesis" | "abstain" | "unavailable"; taxonomyInformed: "hypothesis" | "abstain" | "unavailable" }[] = [];
  const evidenceChallengesTaxonomy: { caseId: string; resourceKey: string; verdict: ApplicabilityVerdict }[] = [];
  const byCase = oracleByCase(cases);
  for (const capturedCase of capture.cases) {
    const oracle = byCase.get(capturedCase.caseId); if (!oracle) continue;
    const evidenceLane = capturedCase.lanes.find((entry) => entry.lane === "evidence-only")!;
    const taxonomyLane = capturedCase.lanes.find((entry) => entry.lane === "taxonomy-informed")!;
    const evidence = assessmentMap(evidenceLane);
    const taxonomy = assessmentMap(taxonomyLane);
    const disposition = (lane: ApplicabilityLaneCapture): "hypothesis" | "abstain" | "unavailable" =>
      lane.result.status === "complete" || lane.result.status === "partial-assessment" ? lane.result.synthesis.disposition : "unavailable";
    const evidenceDisposition = disposition(evidenceLane); const taxonomyDisposition = disposition(taxonomyLane);
    if (evidenceDisposition !== taxonomyDisposition) abstentionChanges.push({ caseId: capturedCase.caseId, oracle: oracle.synthesisOracle.disposition, evidenceOnly: evidenceDisposition, taxonomyInformed: taxonomyDisposition });
    const available = availableSet(capturedCase);
    for (const judgment of oracle.judgments) {
      if (!available.has(judgment.resourceKey)) continue;
      const first = evidence.get(judgment.resourceKey)?.verdict as ApplicabilityVerdict | undefined;
      const second = taxonomy.get(judgment.resourceKey)?.verdict as ApplicabilityVerdict | undefined;
      const firstCorrect = verdictCorrect(judgment.verdict, first); const secondCorrect = verdictCorrect(judgment.verdict, second);
      if (!firstCorrect && secondCorrect) beneficial += 1;
      else if (firstCorrect && !secondCorrect) harmful += 1;
      else neutral += 1;
      const dangerousOracle = judgment.verdict === "contradicted" || judgment.verdict === "irrelevant";
      if (dangerousOracle && first !== "applicable-next-step" && second === "applicable-next-step") addedDangerousFalsePositives.push({ caseId: capturedCase.caseId, resourceKey: judgment.resourceKey });
      if (dangerousOracle && first === "applicable-next-step" && second !== "applicable-next-step") correctedDangerousFalsePositives.push({ caseId: capturedCase.caseId, resourceKey: judgment.resourceKey });
      const taxonomyAssessment = taxonomy.get(judgment.resourceKey);
      if (taxonomyAssessment?.taxonomyRelation === "conflicts" && (second === "applicable-next-step" || second === "insufficient-evidence")) {
        evidenceChallengesTaxonomy.push({ caseId: capturedCase.caseId, resourceKey: judgment.resourceKey, verdict: second });
      }
    }
  }
  return { beneficial, harmful, neutral, addedDangerousFalsePositives, correctedDangerousFalsePositives, abstentionChanges, evidenceChallengesTaxonomy };
}

function exclusions(capture: ApplicabilityCapture, cases: readonly ApplicabilityDevelopmentCase[]) {
  const byCase = oracleByCase(cases);
  let unjudgedPairs = 0; let unavailablePairs = 0;
  const skippedCases: { caseId: string; lane: string; reason: string }[] = [];
  const failedCases: { caseId: string; lane: string; reason: string; failureMode?: string }[] = [];
  const failureModeCounts: Record<string, number> = {};
  const novelHypothesisCases: { caseId: string; lane: string }[] = [];
  for (const capturedCase of capture.cases) {
    const oracle = byCase.get(capturedCase.caseId); if (!oracle) continue;
    unjudgedPairs += oracle.unjudgedCandidateKeys.length;
    const judged = new Set(oracle.judgments.map((item) => item.resourceKey));
    unavailablePairs += capturedCase.candidates.filter((candidate) => judged.has(candidate.resourceKey) && candidate.evidence.status === "unavailable").length;
    for (const lane of capturedCase.lanes) {
      if (lane.result.status === "assessment-skipped") skippedCases.push({ caseId: capturedCase.caseId, lane: lane.lane, reason: lane.result.reason });
      if (lane.result.status === "assessment-failed") {
        const failureMode = lane.result.reason === "invalid-provider-output"
          ? lane.result.failureMode ?? "invalid-provider-output:unknown"
          : `provider:${lane.result.reason}`;
        failedCases.push({ caseId: capturedCase.caseId, lane: lane.lane, reason: lane.result.reason, failureMode });
        failureModeCounts[failureMode] = (failureModeCounts[failureMode] ?? 0) + 1;
      }
      if ((lane.result.status === "complete" || lane.result.status === "partial-assessment") && lane.result.synthesis.disposition === "hypothesis" && lane.result.synthesis.leadingHypothesis.kind === "novel") novelHypothesisCases.push({ caseId: capturedCase.caseId, lane: lane.lane });
    }
  }
  return { unjudgedPairs, unavailablePairs, skippedCases, failedCases, failureModeCounts, novelHypothesisCases };
}

function primaryMetricValues(lane: ApplicabilityLaneEvaluation): readonly (number | null)[] {
  return [lane.macroF1, lane.applicablePrecision.rate, lane.applicableRecall.rate, lane.hypothesisAccuracy.rate, lane.hypothesisCoverage.rate, lane.abstentionRecall.rate, lane.alternativeCoverage.rate, lane.evidenceActionCoverage.rate];
}
function classify(evidence: ApplicabilityLaneEvaluation, taxonomy: ApplicabilityLaneEvaluation, delta: ReturnType<typeof taxonomyDelta>): "promising" | "regressive" | "inconclusive" {
  if (evidence.outcomes.failed > 0 || taxonomy.outcomes.failed > 0 || evidence.outcomes.skipped > 0 || taxonomy.outcomes.skipped > 0) {
    return "inconclusive";
  }
  if (delta.addedDangerousFalsePositives.length > 0) return "regressive";
  const firstDanger = evidence.dangerousFalsePositive.rate; const secondDanger = taxonomy.dangerousFalsePositive.rate;
  if (firstDanger !== null && secondDanger !== null && secondDanger > firstDanger) return "regressive";
  const first = primaryMetricValues(evidence); const second = primaryMetricValues(taxonomy);
  let improved = false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] === null || second[index] === null) continue;
    if (second[index]! < first[index]!) return "inconclusive";
    if (second[index]! > first[index]!) improved = true;
  }
  return improved ? "promising" : "inconclusive";
}

export function scoreApplicabilityCapture(input: { capture: ApplicabilityCapture; cases: readonly ApplicabilityDevelopmentCase[] }): ApplicabilityEvaluationReport {
  const evidence = scoreLane(input.capture, input.cases, "evidence-only");
  const taxonomy = scoreLane(input.capture, input.cases, "taxonomy-informed");
  const delta = taxonomyDelta(input.capture, input.cases);
  return {
    formatVersion: 1,
    mode: "development-applicability-comparison",
    evaluatedSplit: "development",
    holdoutExecuted: false,
    captureHash: input.capture.captureHash,
    identity: input.capture.identity,
    baseline: scoreBaseline(input.capture, input.cases),
    lanes: { "evidence-only": evidence, "taxonomy-informed": taxonomy },
    taxonomyDelta: delta,
    exclusions: exclusions(input.capture, input.cases),
    classification: classify(evidence, taxonomy, delta),
  };
}

function metric(value: number | null): string { return value === null ? "n/a" : value.toFixed(4); }
export function renderApplicabilityMarkdown(report: ApplicabilityEvaluationReport): string {
  const laneRows = (["evidence-only", "taxonomy-informed"] as const).map((lane) => {
    const item = report.lanes[lane];
    return `| ${lane} | ${metric(item.macroF1)} | ${metric(item.applicablePrecision.rate)} | ${metric(item.applicableRecall.rate)} | ${metric(item.dangerousFalsePositive.rate)} | ${metric(item.hypothesisAccuracy.rate)} | ${metric(item.evidenceActionCoverage.rate)} |`;
  });
  const confusion = (lane: "evidence-only" | "taxonomy-informed") => VERDICTS.map((actual) => `| ${actual} | ${VERDICTS.map((predicted) => report.lanes[lane].confusionMatrix[actual][predicted]).join(" | ")} |`);
  return [
    "# B5 applicability development comparison", "",
    `- Capture: ${report.captureHash}`,
    `- Classification: ${report.classification}`,
    `- Holdout executed: ${report.holdoutExecuted}`,
    `- Provider/model: ${report.identity.providerKind} / ${report.identity.model}`,
    `- Contract/prompt: ${report.identity.contractVersion} / ${report.identity.promptVersion}`,
    ...(report.authorizationReference ? [`- Authorization: ${report.authorizationReference}`] : []),
    "", "## Lane summary", "",
    "| Lane | Macro F1 | Applicable precision | Applicable recall | Dangerous FP | Hypothesis accuracy | Evidence-action coverage |",
    "|---|---:|---:|---:|---:|---:|---:|", ...laneRows,
    "", "## Evidence-only confusion matrix", "",
    `| Actual \\ Predicted | ${VERDICTS.join(" | ")} |`, `|---|${VERDICTS.map(() => "---:").join("|")}|`, ...confusion("evidence-only"),
    "", "## Taxonomy-informed confusion matrix", "",
    `| Actual \\ Predicted | ${VERDICTS.join(" | ")} |`, `|---|${VERDICTS.map(() => "---:").join("|")}|`, ...confusion("taxonomy-informed"),
    "", "## Taxonomy delta", "",
    `- Beneficial candidate changes: ${report.taxonomyDelta.beneficial}`,
    `- Harmful candidate changes: ${report.taxonomyDelta.harmful}`,
    `- Neutral candidate changes: ${report.taxonomyDelta.neutral}`,
    `- Added dangerous false positives: ${report.taxonomyDelta.addedDangerousFalsePositives.length}`,
    `- Corrected dangerous false positives: ${report.taxonomyDelta.correctedDangerousFalsePositives.length}`,
    `- Abstention changes: ${report.taxonomyDelta.abstentionChanges.length}`,
    `- Evidence-challenges-taxonomy cases: ${report.taxonomyDelta.evidenceChallengesTaxonomy.length}`,
    "", "## Exclusions", "",
    `- Unjudged pairs: ${report.exclusions.unjudgedPairs}`,
    `- Unavailable judged pairs: ${report.exclusions.unavailablePairs}`,
    `- Skipped cases: ${report.exclusions.skippedCases.length}`,
    `- Failed cases: ${report.exclusions.failedCases.length}`,
    ...Object.entries(report.exclusions.failureModeCounts)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([mode, count]) => `- Failure mode ${mode}: ${count}`),
    `- Novel leading hypotheses requiring review: ${report.exclusions.novelHypothesisCases.length}`,
    "", "A single paired development run is preliminary evidence. This classification does not select a provider or authorize runtime integration.", "",
  ].join("\n");
}
