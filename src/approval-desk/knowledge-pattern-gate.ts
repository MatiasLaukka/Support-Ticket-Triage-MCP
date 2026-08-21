import type { KnowledgeCandidate } from "../knowledge-evolution/domain.js";
import type { KnowledgeAuditEvent } from "../knowledge-evolution/knowledge-audit-repository.js";

export type KnowledgePatternGate = {
  state: "none" | "pending" | "approved" | "rejected" | "deferred";
  actionable: boolean;
  candidateId?: string;
  reason?: string;
};

export function knowledgePatternGate(input: {
  ticketId: string;
  currentDiagnosisId?: string;
  candidates: readonly KnowledgeCandidate[];
  audits: readonly KnowledgeAuditEvent[];
}): KnowledgePatternGate {
  if (input.currentDiagnosisId === undefined) {
    return { state: "none", actionable: false };
  }

  const candidate = input.candidates
    .filter((item) =>
      item.supportingTicketIds.includes(input.ticketId) &&
      item.supportingDiagnosisIds.includes(input.currentDiagnosisId!) &&
      item.discovery?.meetsAlertThreshold === true,
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (candidate === undefined) {
    return { state: "none", actionable: false };
  }

  const review = input.audits
    .filter((event) => event.candidateId === candidate.id)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
  const state = review?.action === "approved" || review?.action === "rejected"
    ? review.action
    : review?.action === "deferred"
      ? "deferred"
      : "pending";
  return {
    state,
    actionable: state === "pending" || state === "deferred",
    candidateId: candidate.id,
    reason: state === "deferred"
      ? "Pattern review was deferred and remains available as a secondary knowledge action."
      : "Review the actionable knowledge pattern as a secondary knowledge action.",
  };
}
