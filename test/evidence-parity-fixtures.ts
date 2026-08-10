import { KnowledgeObjectWriteSchema, type KnowledgeObject } from "../src/knowledge-evolution/domain.js";
import type { LearningEvent } from "../src/knowledge-evolution/learning-ledger.js";

export const EVIDENCE_PARITY = {
  securityAudit: {
    ticketId: "TKT-1004",
    baseDescription: "A private API key may have been pasted into a shared integration log bundle. We do not know whether it was used or which profiles were accessed.",
    replyId: "reply-security-holdout-001",
    createdAt: "2026-06-10T09:00:00.000Z",
    body: "The audit source shown is IP 198.51.100.24. The affected scope appears to be 12 profiles in the latest export.",
  },
  ordinaryApi: {
    ticketId: "TKT-1010",
    baseSubject: "Problem",
    baseDescription: "It does not work.",
    replyId: "reply-request-id-holdout-001",
    createdAt: "2026-06-10T09:00:00.000Z",
    body: "API request is failing. Request ID: req_holdout_001.",
  },
  approvedRequestIdCause: {
    ticketId: "TKT-1010",
    baseSubject: "Problem",
    baseDescription: "It does not work.",
    objectId: "request-id-holdout",
    version: 1,
    triggerPattern: "problem",
    replyId: "reply-request-id-holdout-001",
    createdAt: "2026-06-10T09:00:00.000Z",
    body: "Request ID: req_holdout_001.",
  },
} as const;

export function requestIdKnowledgeObject(): KnowledgeObject {
  return KnowledgeObjectWriteSchema.parse({
    id: EVIDENCE_PARITY.approvedRequestIdCause.objectId,
    version: EVIDENCE_PARITY.approvedRequestIdCause.version,
    learningGovernance: "ledger",
    kind: "known-cause",
    name: "Request ID confirmation path",
    summary: "An approved support path requiring only a request identifier.",
    triggerPatterns: [EVIDENCE_PARITY.approvedRequestIdCause.triggerPattern],
    evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
    timeConstraints: ["Apply when the documented problem pattern is present."],
    diagnosticSteps: ["Review the request identifier."],
    fixSteps: ["Apply the documented correction."],
    verificationSteps: ["Verify the next request."],
    customerSafeExplanation: "We will review the documented support path.",
    operatorRationale: "This controlled path requires a request identifier.",
    owner: "api-platform",
    supportingDiagnosisIds: ["diagnosis-request-id-holdout"],
    supportingTicketIds: [EVIDENCE_PARITY.approvedRequestIdCause.ticketId],
    provenance: { source: "test", recordedAt: "2026-08-08T08:00:00.000Z" },
    status: "approved",
    approval: { approvedBy: "support-lead", approvedAt: "2026-08-08T08:00:00.000Z" },
  });
}

export function requestIdKnowledgePromotionEvent(): LearningEvent {
  const object = EVIDENCE_PARITY.approvedRequestIdCause;
  return {
    id: "00000000-0000-4000-8000-000000000102",
    occurredAt: "2026-08-08T08:00:00.000Z",
    actor: "support-lead",
    correlationId: "10000000-0000-4000-8000-000000000102",
    candidateId: "candidate-request-id-holdout",
    objectId: object.objectId,
    sourceVersion: object.version,
    eventType: "candidate-promoted",
    payload: { maturity: "promoted", health: "active", provenance: "test promotion" },
  };
}
