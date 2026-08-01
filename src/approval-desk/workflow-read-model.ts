import type { AuditEvent, Ticket, TriageRecommendation } from "../domain.js";
import { compareIsoInstants } from "../iso-instant.js";
import {
  buildConversationHistory,
  buildConversationTimeline,
} from "./conversation-history.js";
import {
  auditCausalPositions,
  compareAuditCausalOrder,
  latestAuditPosition,
  type AuditCausalPosition,
} from "./workflow-causal-context.js";
import { buildOperatorGuidance } from "./workflow-guidance.js";

export type RecommendationWorkflowState =
  | "active"
  | "draft-ready"
  | "waiting"
  | "customer-replied"
  | "resolved";

export interface CustomerReplyContext {
  id: string;
  ticketId: string;
  createdAt: string;
  body: string;
}

export interface PreviousSupportResponseContext {
  sentAt: string;
  body: string;
}

export function buildTicketWorkflowReadModel(input: {
  ticket: Ticket;
  recommendations: readonly TriageRecommendation[];
  audits: readonly AuditEvent[];
}) {
  const recommendation = summarizeRecommendationsForTicket(
    input.ticket,
    input.recommendations,
    input.audits,
  );
  return {
    ticket: input.ticket,
    conversationHistory: buildConversationHistory(input.audits),
    conversationTimeline: buildConversationTimeline({
      ticket: input.ticket,
      audits: input.audits,
      recommendations: recommendation.history,
    }),
    recommendationHistory: recommendation.history,
    recommendationSummary: recommendation.summary,
    latestRecommendation: recommendation.latest,
    operatorGuidance: buildOperatorGuidance(input),
  };
}

export function summarizeRecommendationsForTicket(
  ticket: Ticket,
  recommendations: readonly TriageRecommendation[],
  audits: readonly AuditEvent[],
): {
  summary: {
    latestRecommendationId?: string;
    latestResolution?: TriageRecommendation["resolution"];
    hasPendingRecommendation: boolean;
    hasApprovedRecommendation: boolean;
    workflowState: RecommendationWorkflowState;
    outageRisk?: TriageRecommendation["outageRisk"];
    securityRisk?: TriageRecommendation["securityRisk"];
    slaRisk?: TriageRecommendation["slaRisk"];
    priority?: TriageRecommendation["priority"];
    hasSentResponse: boolean;
    hasCustomerReply: boolean;
    latestSentAt?: string;
    latestCustomerReplyAt?: string;
  };
  latest?: TriageRecommendation;
  history: TriageRecommendation[];
} {
  const related = recommendations
    .filter((recommendation) => recommendation.ticketId === ticket.id)
    .sort(compareRecommendationsNewestFirst(audits));
  const currentRelated = related.filter((recommendation) =>
    ["pending", "approved"].includes(recommendation.resolution),
  );
  const latest = currentRelated[0];
  const ticketAudits = audits.filter((event) => event.ticketId === ticket.id);
  const latestSent = latestAuditPosition(
    ticketAudits,
    (event) => event.action === "customer-response-sent",
  );
  const latestCustomerReply = latestAuditPosition(
    ticketAudits,
    (event) => event.action === "customer-reply-received",
  );
  const latestSentAt = auditOccurredAt(latestSent);
  const latestCustomerReplyAt = auditOccurredAt(latestCustomerReply);
  const submissionPositions = submittedAuditPositionsByRecommendation(audits);

  return {
    summary: {
      latestRecommendationId: latest?.id,
      latestResolution: latest?.resolution,
      hasPendingRecommendation: currentRelated.some(
        (recommendation) => recommendation.resolution === "pending",
      ),
      hasApprovedRecommendation: currentRelated.some(
        (recommendation) => recommendation.resolution === "approved",
      ),
      workflowState: conversationWorkflowState({
        ticket,
        latest,
        latestSent,
        latestCustomerReply,
        latestRecommendationSubmission: latest === undefined
          ? undefined
          : submissionPositions.get(latest.id),
      }),
      outageRisk: latest?.outageRisk,
      securityRisk: latest?.securityRisk,
      slaRisk: latest?.slaRisk,
      priority: latest?.priority,
      hasSentResponse: latestSentAt !== undefined,
      hasCustomerReply: latestCustomerReplyAt !== undefined,
      latestSentAt,
      latestCustomerReplyAt,
    },
    latest,
    history: related,
  };
}

export function customerRepliesFromAudits(
  ticketId: string,
  audits: readonly AuditEvent[],
): CustomerReplyContext[] {
  return audits
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.ticketId === ticketId &&
        event.action === "customer-reply-received" &&
        typeof event.after.body === "string",
    )
    .sort(compareAuditCausalOrder)
    .map(({ event }) => ({
      id: event.id,
      ticketId,
      createdAt: event.timestamp,
      body: event.after.body as string,
    }));
}

export function latestSupportResponseFromAudits(
  ticketId: string,
  audits: readonly AuditEvent[],
): PreviousSupportResponseContext | undefined {
  const latest = latestAuditPosition(
    audits,
    (event) =>
      event.ticketId === ticketId &&
      event.action === "customer-response-sent" &&
      typeof event.after.customerResponse === "string",
  );
  if (latest === undefined) return undefined;
  return {
    sentAt: auditOccurredAt(latest) ?? latest.event.timestamp,
    body: latest.event.after.customerResponse as string,
  };
}

export function latestSentAtForRecommendation(
  audits: readonly AuditEvent[],
  recommendationId: string,
): string | undefined {
  return auditOccurredAt(latestAuditPosition(
    audits,
    (event) =>
      event.action === "customer-response-sent" &&
      event.recommendationId === recommendationId,
  ));
}

/** Select the latest persisted approval for a recommendation by causal audit order. */
export function latestRecommendationApprovalAudit(
  audits: readonly AuditEvent[],
  recommendationId: string,
): AuditEvent | undefined {
  return latestAuditPosition(
    audits,
    (event) =>
      event.action === "recommendation-approved" &&
      event.recommendationId === recommendationId,
  )?.event;
}

function compareRecommendationsNewestFirst(
  audits: readonly AuditEvent[],
): (left: TriageRecommendation, right: TriageRecommendation) => number {
  const submittedPositions = submittedAuditPositionsByRecommendation(audits);
  return (left, right) => {
    const leftSubmission = submittedPositions.get(left.id);
    const rightSubmission = submittedPositions.get(right.id);
    if (leftSubmission !== undefined && rightSubmission !== undefined) {
      const causalOrder = compareAuditCausalOrder(rightSubmission, leftSubmission);
      if (causalOrder !== 0) return causalOrder;
    }
    return compareIsoInstants(right.createdAt, left.createdAt) ||
      right.id.localeCompare(left.id);
  };
}

function submittedAuditPositionsByRecommendation(
  audits: readonly AuditEvent[],
): Map<string, AuditCausalPosition> {
  const positions = new Map<string, AuditCausalPosition>();
  auditCausalPositions(audits).forEach(({ event, index }) => {
    if (
      event.action === "recommendation-submitted" &&
      event.recommendationId !== undefined
    ) {
      const current = positions.get(event.recommendationId);
      const candidate = { event, index };
      if (
        current === undefined ||
        compareAuditCausalOrder(candidate, current) > 0
      ) {
        positions.set(event.recommendationId, candidate);
      }
    }
  });
  return positions;
}

function conversationWorkflowState(input: {
  ticket: Ticket;
  latest?: TriageRecommendation;
  latestSent?: AuditCausalPosition;
  latestCustomerReply?: AuditCausalPosition;
  latestRecommendationSubmission?: AuditCausalPosition;
}): RecommendationWorkflowState {
  if (input.ticket.status === "resolved") {
    return "resolved";
  }

  if (
    input.latest?.resolution === "approved" &&
    input.latestSent !== undefined &&
    isAuditAtOrAfterRecommendation(
      input.latestSent,
      input.latest,
      input.latestRecommendationSubmission,
    )
  ) {
    return input.latestCustomerReply !== undefined &&
      compareAuditCausalOrder(input.latestCustomerReply, input.latestSent) > 0
      ? "customer-replied"
      : "waiting";
  }

  if (input.latest !== undefined) {
    return input.latestCustomerReply !== undefined &&
      isAuditAfterRecommendation(
        input.latestCustomerReply,
        input.latest,
        input.latestRecommendationSubmission,
      )
      ? "customer-replied"
      : "draft-ready";
  }

  if (
    input.latestCustomerReply !== undefined &&
    (input.latestSent === undefined ||
      compareAuditCausalOrder(input.latestCustomerReply, input.latestSent) > 0)
  ) {
    return "customer-replied";
  }

  return input.latestSent === undefined ? "active" : "waiting";
}

function auditOccurredAt(position: AuditCausalPosition | undefined): string | undefined {
  if (position === undefined) return undefined;
  return position.event.action === "customer-response-sent" &&
    typeof position.event.after.sentAt === "string"
    ? position.event.after.sentAt
    : position.event.timestamp;
}

function isAuditAtOrAfterRecommendation(
  audit: AuditCausalPosition,
  recommendation: TriageRecommendation,
  submission: AuditCausalPosition | undefined,
): boolean {
  return submission === undefined
    ? compareIsoInstants(audit.event.timestamp, recommendation.createdAt) >= 0
    : compareAuditCausalOrder(audit, submission) >= 0;
}

function isAuditAfterRecommendation(
  audit: AuditCausalPosition,
  recommendation: TriageRecommendation,
  submission: AuditCausalPosition | undefined,
): boolean {
  return submission === undefined
    ? compareIsoInstants(audit.event.timestamp, recommendation.createdAt) > 0
    : compareAuditCausalOrder(audit, submission) > 0;
}
