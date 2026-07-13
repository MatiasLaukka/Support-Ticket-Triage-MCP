import type { AuditEvent } from "../domain.js";

export interface ConversationHistoryItem {
  timestamp: string;
  actor: string;
  action: AuditEvent["action"];
  summary: string;
  recommendationId?: string;
}

export function buildConversationHistory(
  audits: readonly AuditEvent[],
): ConversationHistoryItem[] {
  return [...audits]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .map((event) => ({
      timestamp: event.timestamp,
      actor: event.actor,
      action: event.action,
      summary: summarizeAuditEvent(event),
      ...(event.recommendationId === undefined
        ? {}
        : { recommendationId: event.recommendationId }),
    }));
}

function summarizeAuditEvent(event: AuditEvent): string {
  switch (event.action) {
    case "recommendation-submitted":
      return "Recommendation prepared for review.";
    case "recommendation-approved":
      return "Reviewer approved selected recommendation fields.";
    case "recommendation-rejected":
      return `Reviewer rejected the recommendation: ${event.rationale}`;
    case "recommendation-canceled":
      return `Approved recommendation was canceled: ${event.rationale}`;
    case "ticket-updated":
      return "Ticket fields were updated.";
    case "approval-rejected":
      return `Approval attempt was blocked: ${event.rationale}`;
  }
}
