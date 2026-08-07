import { describe, expect, it } from "vitest";
import {
  KnowledgeCandidateReadSchema,
  KnowledgeCandidateWriteSchema,
  KnowledgeObjectReadSchema,
  KnowledgeObjectWriteSchema,
} from "../src/knowledge-evolution/domain.js";

const approvedObject = {
  id: "known-cause-api-delay",
  kind: "known-cause",
  name: "API platform processing delay",
  summary: "A healthy API request can be delayed while the platform recovers.",
  triggerPatterns: ["Requests remain pending after a service recovery."],
  evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
  timeConstraints: ["Applies during the documented recovery window."],
  diagnosticSteps: ["Check the request ID against the service event timeline."],
  fixSteps: ["Wait for the recovery window to complete before retrying."],
  verificationSteps: ["Confirm the request completes after the recovery window."],
  customerSafeExplanation: "We are monitoring a short platform recovery period.",
  operatorRationale: "The request evidence matches the documented recovery delay.",
  owner: "api-platform",
  version: 1,
  status: "approved" as const,
  supportingDiagnosisIds: ["diagnosis-001"],
  supportingTicketIds: ["TKT-1001"],
  provenance: { source: "completed-diagnoses", recordedAt: "2026-08-07T10:00:00.000Z" },
  approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T10:01:00.000Z" },
};

describe("knowledge version provenance contract", () => {
  it("requires ledger governance for a newly approved knowledge-object write while normalizing legacy reads", () => {
    expect(KnowledgeObjectWriteSchema.safeParse(approvedObject).success).toBe(false);
    expect(KnowledgeObjectWriteSchema.safeParse({ ...approvedObject, learningGovernance: "ledger" }).success).toBe(true);
    expect(KnowledgeObjectReadSchema.parse(approvedObject)).toMatchObject({ learningGovernance: "legacy" });
  });

  it("requires revision lineage for new candidate writes while normalizing legacy candidates to their own object", () => {
    const candidate = {
      ...approvedObject,
      status: "candidate" as const,
      evidencePolicy: { mode: "undecided" as const },
      deterministicScores: { confidence: 0.8, support: 1 },
      deterministicReasons: ["One approved diagnosis has a matching recovery signature."],
      contradictions: [],
      validationStatus: "pending" as const,
    };
    const { approval: _approval, ...candidateWithoutApproval } = candidate;

    expect(KnowledgeCandidateWriteSchema.safeParse(candidateWithoutApproval).success).toBe(false);
    expect(KnowledgeCandidateWriteSchema.safeParse({
      ...candidateWithoutApproval,
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
    }).success).toBe(true);
    expect(KnowledgeCandidateReadSchema.parse(candidateWithoutApproval)).toMatchObject({
      objectId: "known-cause-api-delay",
      sourceVersion: 1,
    });
  });
});
