import type { AuditEvent, TriageRecommendation } from "../domain.js";
import { compareIsoInstants } from "../iso-instant.js";
import type {
  ConversationMessage,
  OperationalEvent,
  OperationalWorkflowSnapshot,
} from "../operational/domain.js";

/** @deprecated File-backed audit position retained only until operational cutover. */
export interface AuditCausalPosition {
  event: AuditEvent;
  index: number;
}

/** A canonical operational event whose ticket-wide sequence is causal authority. */
export interface OperationalCausalPosition {
  event: OperationalEvent;
}

export interface OperationalMessageCausalPosition extends OperationalCausalPosition {
  message: ConversationMessage;
}

export function compareOperationalCausalOrder(
  left: OperationalCausalPosition,
  right: OperationalCausalPosition,
): number {
  return left.event.sequence - right.event.sequence;
}

export function operationalCausalPositions(
  snapshot: OperationalWorkflowSnapshot,
): OperationalCausalPosition[] {
  return snapshot.events
    .map((event) => ({ event }))
    .sort(compareOperationalCausalOrder);
}

export function operationalPositionForEventId(
  snapshot: OperationalWorkflowSnapshot,
  operationalEventId: string,
): OperationalCausalPosition | undefined {
  const event = snapshot.events.find((candidate) => candidate.id === operationalEventId);
  return event === undefined ? undefined : { event };
}

export function latestOperationalPosition(
  snapshot: OperationalWorkflowSnapshot,
  matches: (event: OperationalEvent) => boolean,
): OperationalCausalPosition | undefined {
  return operationalCausalPositions(snapshot)
    .filter(({ event }) => matches(event))
    .at(-1);
}

export function operationalMessageCausalPositions(
  snapshot: OperationalWorkflowSnapshot,
  kind?: ConversationMessage["kind"],
): OperationalMessageCausalPosition[] {
  return snapshot.messages
    .filter((message) => kind === undefined || message.kind === kind)
    .map((message) => ({
      message,
      event: snapshot.events.find(({ id }) => id === message.operationalEventId),
    }))
    .filter((entry): entry is OperationalMessageCausalPosition => entry.event !== undefined)
    .sort(compareOperationalCausalOrder);
}

/**
 * Persisted audit position is the workflow authority. ISO instant ordering is
 * only a deterministic tie-breaker for malformed/equivalent journal input.
 */
export function compareAuditCausalOrder(
  left: AuditCausalPosition,
  right: AuditCausalPosition,
): number {
  return left.index - right.index ||
    compareIsoInstants(left.event.timestamp, right.event.timestamp) ||
    left.event.id.localeCompare(right.event.id);
}

export function auditCausalPositions(
  audits: readonly AuditEvent[],
): AuditCausalPosition[] {
  return audits.map((event, index) => ({ event, index }));
}

export function latestAuditPosition(
  audits: readonly AuditEvent[],
  matches: (event: AuditEvent) => boolean,
): AuditCausalPosition | undefined {
  return auditCausalPositions(audits)
    .filter(({ event }) => matches(event))
    .sort((left, right) => compareAuditCausalOrder(right, left))[0];
}

export function auditPositionForEvent(
  audits: readonly AuditEvent[],
  event: AuditEvent,
): AuditCausalPosition | undefined {
  const index = audits.findIndex((candidate) => candidate.id === event.id);
  return index < 0 ? undefined : { event: audits[index]!, index };
}

export function latestRecommendationSubmissionPosition(
  audits: readonly AuditEvent[],
  recommendationId: string,
): AuditCausalPosition | undefined {
  return latestAuditPosition(
    audits,
    (event) =>
      event.action === "recommendation-submitted" &&
      event.recommendationId === recommendationId,
  );
}

/**
 * Returns whether a customer reply was persisted after a recommendation was
 * submitted. Persisted audit order is the causal boundary; exact ISO instant
 * comparison is reserved for legacy recommendations without that audit.
 */
export function hasCustomerReplyAfterRecommendation(
  audits: readonly AuditEvent[],
  recommendation: Pick<TriageRecommendation, "id" | "createdAt">,
): boolean {
  const submission = latestRecommendationSubmissionPosition(
    audits,
    recommendation.id,
  );
  if (submission !== undefined) {
    const reply = latestAuditPosition(
      audits,
      (event) => event.action === "customer-reply-received",
    );
    return reply !== undefined && compareAuditCausalOrder(reply, submission) > 0;
  }
  return audits.some(
    (event) =>
      event.action === "customer-reply-received" &&
      compareIsoInstants(event.timestamp, recommendation.createdAt) > 0,
  );
}

/**
 * Canonical operational variant. Event sequence is authoritative; timestamp
 * comparison exists only for imported recommendations without a revision event.
 */
export function hasCustomerReplyAfterRecommendationFromSnapshot(
  snapshot: OperationalWorkflowSnapshot,
  recommendation: Pick<TriageRecommendation, "id" | "createdAt">,
): boolean {
  const latestReply = operationalMessageCausalPositions(snapshot, "customer").at(-1);
  if (latestReply === undefined) return false;
  const latestRevision = snapshot.recommendationRevisions
    .filter(({ recommendation: candidate }) => candidate.id === recommendation.id)
    .map((revision) => ({
      revision,
      position: operationalPositionForEventId(snapshot, revision.operationalEventId),
    }))
    .filter((entry): entry is typeof entry & { position: OperationalCausalPosition } =>
      entry.position !== undefined)
    .sort((left, right) => compareOperationalCausalOrder(left.position, right.position))
    .at(-1);
  return latestRevision === undefined
    ? compareIsoInstants(latestReply.message.createdAt, recommendation.createdAt) > 0
    : compareOperationalCausalOrder(latestReply, latestRevision.position) > 0;
}
