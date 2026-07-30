import type { AuditEvent, TriageRecommendation } from "../domain.js";
import { compareIsoInstants } from "../iso-instant.js";

/** A persisted audit event and its append position in the ticket journal. */
export interface AuditCausalPosition {
  event: AuditEvent;
  index: number;
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
