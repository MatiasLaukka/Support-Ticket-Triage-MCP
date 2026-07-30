import type { AuditEvent, TriageRecommendation } from "../domain.js";
import { compareIsoInstants } from "../iso-instant.js";

/**
 * Returns whether a customer reply was persisted after a recommendation was
 * submitted. Persisted audit order is the causal boundary; exact ISO instant
 * comparison is reserved for legacy recommendations without that audit.
 */
export function hasCustomerReplyAfterRecommendation(
  audits: readonly AuditEvent[],
  recommendation: Pick<TriageRecommendation, "id" | "createdAt">,
): boolean {
  let latestSubmissionIndex: number | undefined;
  audits.forEach((event, index) => {
    if (
      event.action === "recommendation-submitted" &&
      event.recommendationId === recommendation.id
    ) {
      latestSubmissionIndex = index;
    }
  });
  const submissionIndex = latestSubmissionIndex;
  if (submissionIndex !== undefined) {
    return audits.some(
      (event, index) =>
        event.action === "customer-reply-received" &&
        index > submissionIndex,
    );
  }
  return audits.some(
    (event) =>
      event.action === "customer-reply-received" &&
      compareIsoInstants(event.timestamp, recommendation.createdAt) > 0,
  );
}
