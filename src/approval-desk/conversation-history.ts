import type {
  AuditEvent,
  Ticket,
  TriageRecommendation,
} from "../domain.js";
import { compareIsoInstants } from "../iso-instant.js";
import {
  isCanonicalConversationEventPair,
  type OperationalEvent,
  type OperationalWorkflowSnapshot,
} from "../operational/domain.js";
import { operationalCausalPositions } from "./workflow-causal-context.js";

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
      kind: "diagnosis";
      timestamp: string;
      actor: string;
      summary: string;
      confidence?: string;
      owner?: string;
      causeType?: string;
    }
  | {
      kind: "fix";
      timestamp: string;
      actor: string;
      summary: string;
    }
  | {
      kind: "recommendation-event";
      timestamp: string;
      actor: string;
      action: AuditEvent["action"];
      summary: string;
      recommendationId?: string;
    };

/** @deprecated File-backed audit adapter only until operational cutover. */
export function buildConversationHistory(
  audits: readonly AuditEvent[],
): ConversationHistoryItem[] {
  return audits
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

/**
 * Canonical operational conversation history. Bodies are deliberately absent
 * from the event spine and are joined only by timeline message rendering.
 */
export function buildConversationHistoryFromSnapshot(
  snapshot: OperationalWorkflowSnapshot,
): ConversationHistoryItem[] {
  return operationalCausalPositions(snapshot).map(({ event }) => {
    const recommendationId = recommendationIdForOperationalEvent(snapshot, event.id);
    return {
      timestamp: event.occurredAt,
      actor: event.actor,
      action: event.action,
      summary: summarizeOperationalEvent(event),
      ...(recommendationId === undefined ? {} : { recommendationId }),
    };
  });
}

/** @deprecated File-backed audit adapter only until operational cutover. */
export function buildConversationTimeline(input: {
  ticket: Ticket;
  audits: readonly AuditEvent[];
  recommendations: readonly TriageRecommendation[];
}): ConversationTimelineItem[] {
  const persistedItems: ConversationTimelineItem[] = [
    {
      kind: "original-ticket",
      timestamp: input.ticket.createdAt,
      actor: input.ticket.requester?.name ?? input.ticket.customer.name,
      title: input.ticket.subject,
      body: input.ticket.description,
    },
    ...input.audits.map((event) => buildTimelineAuditItem(event)),
  ];
  const legacyRecommendationItems = input.recommendations
    .filter(
      (recommendation) =>
        !input.audits.some(
          (event) =>
            event.recommendationId === recommendation.id &&
            event.action === "recommendation-submitted",
        ),
    )
    .sort((left, right) => compareIsoInstants(left.createdAt, right.createdAt))
    .map((recommendation) => buildRecommendationTimelineItem(recommendation));

  // Audit append order is the causal workflow order. Timestamps are retained
  // for display only; they can be backdated, offset-form, or sub-millisecond.
  // A legacy recommendation has no persisted submission audit, so it may be
  // placed by its timestamp without ever reordering persisted audit items.
  for (const legacy of legacyRecommendationItems) {
    const insertionIndex = persistedItems.findIndex(
      (item, index) =>
        index > 0 && compareIsoInstants(legacy.timestamp, item.timestamp) < 0,
    );
    persistedItems.splice(
      insertionIndex < 0 ? persistedItems.length : insertionIndex,
      0,
      legacy,
    );
  }
  return persistedItems;
}

/** Canonical operational timeline ordered strictly by ticket event sequence. */
export function buildConversationTimelineFromSnapshot(
  snapshot: OperationalWorkflowSnapshot,
): ConversationTimelineItem[] {
  const persistedItems: ConversationTimelineItem[] = [
    originalTicketTimelineItem(snapshot.ticket),
    ...operationalCausalPositions(snapshot).map(({ event }) =>
      buildTimelineOperationalItem(snapshot, event)),
  ];
  const revisionRecommendationIds = new Set(
    snapshot.recommendationRevisions.map(({ recommendation }) => recommendation.id),
  );
  const importedWithoutRevision = snapshot.recommendations
    .filter(({ id }) => !revisionRecommendationIds.has(id))
    .sort((left, right) => compareIsoInstants(left.createdAt, right.createdAt))
    .map(buildRecommendationTimelineItem);
  for (const legacy of importedWithoutRevision) {
    const insertionIndex = persistedItems.findIndex(
      (item, index) =>
        index > 0 && compareIsoInstants(legacy.timestamp, item.timestamp) < 0,
    );
    persistedItems.splice(
      insertionIndex < 0 ? persistedItems.length : insertionIndex,
      0,
      legacy,
    );
  }
  return persistedItems;
}

function originalTicketTimelineItem(ticket: Ticket): ConversationTimelineItem {
  return {
    kind: "original-ticket",
    timestamp: ticket.createdAt,
    actor: ticket.requester?.name ?? ticket.customer.name,
    title: ticket.subject,
    body: ticket.description,
  };
}

function buildTimelineOperationalItem(
  snapshot: OperationalWorkflowSnapshot,
  event: OperationalEvent,
): ConversationTimelineItem {
  const message = snapshot.messages.find(
    (candidate) => isCanonicalConversationEventPair(event, candidate),
  );
  if (
    event.action === "customer-response-sent"
    && message?.kind === "support"
    && message.recommendationId !== undefined
  ) {
    return {
      kind: "support-response-sent",
      timestamp: message.createdAt,
      actor: event.actor,
      recommendationId: message.recommendationId,
      body: message.body,
    };
  }
  if (event.action === "customer-reply-received" && message?.kind === "customer") {
    return {
      kind: "customer-reply",
      timestamp: message.createdAt,
      actor: event.actor,
      body: message.body,
    };
  }
  const diagnosis = snapshot.diagnoses.find(
    ({ operationalEventId }) => operationalEventId === event.id,
  )?.diagnosis;
  if (event.action === "diagnosis-completed" && diagnosis !== undefined) {
    return {
      kind: "diagnosis",
      timestamp: event.occurredAt,
      actor: event.actor,
      summary: diagnosis.problem,
      owner: diagnosis.ownerTeam,
    };
  }
  const recommendationId = recommendationIdForOperationalEvent(snapshot, event.id);
  return {
    kind: "recommendation-event",
    timestamp: event.occurredAt,
    actor: event.actor,
    action: event.action,
    summary: summarizeOperationalEvent(event),
    ...(recommendationId === undefined ? {} : { recommendationId }),
  };
}

function recommendationIdForOperationalEvent(
  snapshot: OperationalWorkflowSnapshot,
  operationalEventId: string,
): string | undefined {
  return snapshot.recommendationRevisions.find(
    (revision) => revision.operationalEventId === operationalEventId,
  )?.recommendation.id ?? snapshot.messages.find(
    (message) => message.operationalEventId === operationalEventId,
  )?.recommendationId;
}

function summarizeOperationalEvent(event: OperationalEvent): string {
  return summarizeAuditEvent({
    id: event.id,
    timestamp: event.occurredAt,
    actor: event.actor,
    action: event.action,
    ticketId: event.ticketId,
    before: {},
    after: {},
    rationale: operationalEventRationale(event.action),
    knowledgeArticleIds: [],
    result: "success",
  });
}

function operationalEventRationale(action: AuditEvent["action"]): string {
  if (action === "recommendation-rejected") return "the recorded decision";
  if (action === "recommendation-canceled") return "the recorded decision";
  if (action === "recommendation-superseded") return "a newer causal event";
  if (action === "approval-rejected") return "the recorded gate";
  return "Operational event persisted.";
}

function buildRecommendationTimelineItem(
  recommendation: TriageRecommendation,
): ConversationTimelineItem {
  return {
    kind: "recommendation-event",
    timestamp: recommendation.createdAt,
    actor: "approval-desk",
    action: "recommendation-submitted",
    summary: `Recommendation version is ${recommendation.resolution}.`,
    recommendationId: recommendation.id,
  };
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

  if (
    event.action === "diagnosis-completed" &&
    typeof event.after.diagnosis === "object" &&
    event.after.diagnosis !== null &&
    "customerSafeSummary" in event.after.diagnosis &&
    typeof event.after.diagnosis.customerSafeSummary === "string"
  ) {
    const diagnosis = event.after.diagnosis as Record<string, unknown>;
    return {
      kind: "diagnosis",
      timestamp: event.timestamp,
      actor: event.actor,
      summary: event.after.diagnosis.customerSafeSummary,
      ...(typeof diagnosis.confidence === "string"
        ? { confidence: diagnosis.confidence }
        : {}),
      ...(typeof diagnosis.owner === "string" ? { owner: diagnosis.owner } : {}),
      ...(typeof diagnosis.causeType === "string"
        ? { causeType: diagnosis.causeType }
        : {}),
    };
  }

  if (
    event.action === "fix-available" &&
    typeof event.after.fix === "object" &&
    event.after.fix !== null &&
    "customerSafeSummary" in event.after.fix &&
    typeof event.after.fix.customerSafeSummary === "string"
  ) {
    return {
      kind: "fix",
      timestamp: event.timestamp,
      actor: event.actor,
      summary: event.after.fix.customerSafeSummary,
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
    case "diagnosis-completed":
      return "Diagnosis was completed for the ticket.";
    case "diagnosis-reviewed":
      return "Diagnosis review was recorded without replacing the original diagnosis.";
    case "diagnosis-invalidated":
      return `Diagnosis was invalidated: ${event.rationale}`;
    case "diagnostic-escalated":
      return "Diagnostic ambiguity was escalated for specialist review.";
    case "fix-available":
      return "Fix or mitigation is available for customer verification.";
    case "platform-mitigation-available":
      return "Platform mitigation was recorded and is ready for the next governed evaluation.";
    case "fix-ineffective":
      return `Fix verification did not succeed: ${event.rationale}`;
    case "ticket-updated":
      return "Ticket fields were updated.";
    case "approval-rejected":
      return `Approval attempt was blocked: ${event.rationale}`;
    case "learning-capture-failed":
      return "Learning capture failed; the operational ticket result was retained.";
  }
}
