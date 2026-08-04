import type {
  Category,
  ClassificationConfidence,
  ClassificationUncertaintyReason,
} from "./domain.js";

export const CLASSIFICATION_CONFIDENCE_METHOD = "uncertainty-aware-v1" as const;

export interface ClassificationConfidenceInput {
  category: Category | string;
  categoryScore: number;
  runnerUpScore: number;
  independentRuleIds: readonly string[];
  disagreementCount: number;
}

export interface ClassificationConfidenceResult {
  confidence: number;
  details: ClassificationConfidence;
}

export function confidenceBand(
  confidence: number,
): ClassificationConfidence["band"] {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.75) return "medium";
  return "low";
}

export function calculateClassificationConfidence(
  input: ClassificationConfidenceInput,
): ClassificationConfidenceResult {
  const categoryScore = finiteNonnegative(input.categoryScore);
  const runnerUpScore = finiteNonnegative(input.runnerUpScore);
  const categoryMargin = Math.max(0, categoryScore - runnerUpScore);
  const independentSignalCount = eligibleIndependentRuleIds(
    input.independentRuleIds,
  ).length;
  const disagreementCount = Math.max(
    0,
    Math.min(3, Math.trunc(input.disagreementCount)),
  );

  if (input.category === "other") {
    const confidence = 0.5;
    return {
      confidence,
      details: {
        method: CLASSIFICATION_CONFIDENCE_METHOD,
        band: confidenceBand(confidence),
        categoryScore,
        runnerUpScore,
        categoryMargin,
        independentSignalCount,
        disagreementCount,
        uncertaintyReasons: ["no-actionable-category"],
      },
    };
  }

  const supportFactor = Math.min(1, categoryScore / 10);
  const marginFactor = Math.min(1, categoryMargin / 10);
  const diversityFactor = Math.min(1, independentSignalCount / 3);
  const disagreementFactor = Math.min(1, disagreementCount / 2);
  const raw = 0.45
    + 0.25 * supportFactor
    + 0.2 * marginFactor
    + 0.1 * diversityFactor
    - 0.15 * disagreementFactor;
  const confidence = round4(Math.min(0.95, Math.max(0.35, raw)));
  const uncertaintyReasons: ClassificationUncertaintyReason[] = [];
  if (categoryScore < 5) uncertaintyReasons.push("weak-category-support");
  if (categoryMargin < 3) uncertaintyReasons.push("close-category-competition");
  if (independentSignalCount < 2) uncertaintyReasons.push("low-signal-diversity");
  if (disagreementCount > 0) uncertaintyReasons.push("metadata-disagreement");

  return {
    confidence,
    details: {
      method: CLASSIFICATION_CONFIDENCE_METHOD,
      band: confidenceBand(confidence),
      categoryScore,
      runnerUpScore,
      categoryMargin,
      independentSignalCount,
      disagreementCount,
      uncertaintyReasons,
    },
  };
}

export function eligibleIndependentRuleIds(
  ruleIds: readonly string[],
): string[] {
  return [...new Set(ruleIds.filter(isEligibleIndependentRuleId))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function isEligibleIndependentRuleId(ruleId: string): boolean {
  return !(
    ruleId.startsWith("metadata-")
    || ruleId.startsWith("disagreement-")
    || ruleId.startsWith("known-cause-")
    || ruleId.startsWith("known-event-")
    || ruleId.startsWith("duplicate-")
    || ruleId.startsWith("gpt-advisory-")
  );
}

function finiteNonnegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
