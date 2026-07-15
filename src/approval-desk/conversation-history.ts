import type {
  AuditEvent,
  Ticket,
  TriageRecommendation,
} from "../domain.js";

export interface ConversationHistoryItem {
  timestamp: string;
  actor: string;
  action: AuditEvent["action"];
  summary: string;
  recommendationId?: string;
}

export type ConversationTimelineItem =
  | {
      kind: "original-ticket";
      timestamp: string;
      actor: string;
      title: string;
      body: string;
    }
  | {
      kind: "support-response-sent";
      timestamp: string;
      actor: string;
      recommendationId: string;
      body: string;
    }
  | {
      kind: "customer-reply";
      timestamp: string;
      actor: string;
      body: string;
    }
  | {
      kind: "recommendation-event";
      timestamp: string;
      actor: string;
      action: AuditEvent["action"];
      summary: string;
      recommendationId?: string;
    };

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

export function buildConversationTimeline(input: {
  ticket: Ticket;
  audits: readonly AuditEvent[];
  recommendations: readonly TriageRecommendation[];
}): ConversationTimelineItem[] {
  const items: ConversationTimelineItem[] = [
    {
      kind: "original-ticket",
      timestamp: input.ticket.createdAt,
      actor: input.ticket.requester?.name ?? input.ticket.customer.name,
      title: input.ticket.subject,
      body: input.ticket.description,
    },
    ...input.audits.map((event) => buildTimelineAuditItem(event)),
  ];

  return items.sort((left, right) => {
    const timestampOrder = left.timestamp.localeCompare(right.timestamp);
    if (timestampOrder !== 0) {
      return timestampOrder;
    }

    return left.kind === "original-ticket" ? -1 : right.kind === "original-ticket" ? 1 : 0;
  });
}

function buildTimelineAuditItem(event: AuditEvent): ConversationTimelineItem {
  if (
    event.action === "customer-response-sent" &&
    typeof event.after.customerResponse === "string" &&
    event.recommendationId !== undefined
  ) {
    return {
      kind: "support-response-sent",
      timestamp: event.timestamp,
      actor: event.actor,
      recommendationId: event.recommendationId,
      body: event.after.customerResponse,
    };
  }

  if (
    event.action === "customer-reply-received" &&
    typeof event.after.body === "string"
  ) {
    return {
      kind: "customer-reply",
      timestamp: event.timestamp,
      actor: event.actor,
      body: event.after.body,
    };
  }

  return {
    kind: "recommendation-event",
    timestamp: event.timestamp,
    actor: event.actor,
    action: event.action,
    summary: summarizeAuditEvent(event),
    ...(event.recommendationId === undefined
      ? {}
      : { recommendationId: event.recommendationId }),
  };
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
    case "recommendation-superseded":
      return `Recommendation was superseded: ${event.rationale}`;
    case "customer-response-sent":
      return "Approved customer response was sent.";
    case "customer-reply-received":
      return "Customer reply was added to the ticket conversation.";
    case "ticket-updated":
      return "Ticket fields were updated.";
    case "approval-rejected":
      return `Approval attempt was blocked: ${event.rationale}`;
  }
}
