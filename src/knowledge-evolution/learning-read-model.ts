import type { LearningEvent, LearningHealth, LearningMaturity } from "./learning-ledger.js";

export interface KnowledgeLearningSummary {
  candidateId: string;
  objectId?: string;
  maturity: LearningMaturity;
  health: LearningHealth;
  signalWeight: number;
  eligibleForReuse: boolean;
  supportingEventIds: string[];
  staleReasons: string[];
  contradictionReasons: string[];
}

const maturityRank: Record<LearningMaturity, number> = {
  observed: 0,
  "diagnosis-supported": 1,
  "outcome-verified": 2,
  "reuse-validated": 3,
  promoted: 4,
};
const maturityWeight: Record<LearningMaturity, number> = {
  observed: 0,
  "diagnosis-supported": 0.25,
  "outcome-verified": 0.75,
  "reuse-validated": 1,
  promoted: 0.9,
};

export function projectKnowledgeLearning(
  events: readonly LearningEvent[],
  input: { candidateId: string; objectId?: string; asOf?: string },
): KnowledgeLearningSummary {
  const relevant = events
    .filter((event) => event.candidateId === input.candidateId || (input.objectId !== undefined && event.objectId === input.objectId))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  let maturity: LearningMaturity = "observed";
  let health: LearningHealth = "active";
  let staleAt: string | undefined;
  const staleReasons: string[] = [];
  const contradictionReasons: string[] = [];
  const supportingEventIds: string[] = [];
  let hasSuccessfulReuse = false;

  for (const event of relevant) {
    supportingEventIds.push(event.id);
    switch (event.eventType) {
      case "candidate-created":
        maturity = maxMaturity(maturity, event.payload.maturity);
        break;
      case "diagnosis-recorded":
      case "diagnosis-approved":
        maturity = maxMaturity(maturity, "diagnosis-supported");
        break;
      case "outcome-verified":
        maturity = maxMaturity(maturity, "outcome-verified");
        break;
      case "knowledge-reused":
        hasSuccessfulReuse = true;
        maturity = "reuse-validated";
        break;
      case "candidate-promoted":
        maturity = maxMaturity(maturity, "promoted");
        if (staleAt === undefined || event.occurredAt > staleAt) health = "active";
        break;
      case "knowledge-marked-stale":
        if (staleAt === undefined || event.occurredAt >= staleAt) {
          health = "stale";
          staleAt = event.occurredAt;
        }
        staleReasons.push(...event.payload.staleReasons.filter((reason) => !staleReasons.includes(reason)));
        break;
      case "knowledge-reuse-failed":
        health = "contradicted";
        contradictionReasons.push(event.payload.failureReason);
        break;
      case "knowledge-deprecated":
        health = "deprecated";
        break;
      default:
        break;
    }
  }

  if (hasSuccessfulReuse) maturity = "reuse-validated";

  const asOf = input.asOf ?? new Date().toISOString();
  let signalWeight = maturityWeight[maturity];
  if (health === "stale" && staleAt !== undefined) {
    const ageDays = Math.max(0, (Date.parse(asOf) - Date.parse(staleAt)) / 86_400_000);
    signalWeight *= Math.max(0.1, Math.exp(-ageDays / 30));
  }
  if (health === "contradicted" || health === "deprecated" || (health as LearningHealth) === "superseded") signalWeight = 0;
  signalWeight = Math.round(signalWeight * 10_000) / 10_000;

  return {
    candidateId: input.candidateId,
    ...(input.objectId === undefined ? {} : { objectId: input.objectId }),
    maturity,
    health,
    signalWeight,
    eligibleForReuse: health === "active" && (maturity === "promoted" || maturity === "reuse-validated"),
    supportingEventIds: [...new Set(supportingEventIds)],
    staleReasons: [...new Set(staleReasons)],
    contradictionReasons: [...new Set(contradictionReasons)],
  };
}

function maxMaturity(left: LearningMaturity, right: LearningMaturity): LearningMaturity {
  return maturityRank[right] > maturityRank[left] ? right : left;
}
