import { describe, expect, it } from "vitest";
import {
  CompletedDiagnosisSchema,
  KnowledgeCandidateSchema,
  KnowledgeObjectSchema,
} from "../src/knowledge-evolution/domain.js";

const diagnosis = {
  id: "diagnosis-001",
  ticketId: "TKT-0001",
  problem: "API requests fail after rotating credentials.",
  symptoms: ["Requests return 401 after rotation."],
  evidenceIds: ["evidence-001"],
  ownerTeam: "api-platform",
  fixSteps: ["Refresh the service credential in the deployment secret store."],
  verificationSteps: ["Confirm a new request succeeds with the refreshed credential."],
  completedAt: "2026-07-29T10:00:00.000Z",
};

const knowledgeObject = {
  id: "known-cause-api-credential-rotation",
  kind: "known-cause",
  name: "Stale API credential after rotation",
  summary: "A deployed service can retain a credential that was rotated.",
  triggerPatterns: ["Requests began returning 401 after credential rotation."],
  evidencePolicy: { mode: "required", evidenceIds: ["evidence-001"] },
  timeConstraints: ["Applies only when the failure began after a credential rotation."],
  diagnosticSteps: ["Compare the deployment credential version with the active version."],
  fixSteps: ["Refresh the service credential in the deployment secret store."],
  verificationSteps: ["Confirm a new request succeeds with the refreshed credential."],
  customerSafeExplanation: "We found a configuration mismatch and are refreshing it.",
  operatorRationale: "The completed diagnosis ties the 401 errors to a stale deployment credential.",
  owner: "api-platform",
  version: 1,
  status: "approved",
  supportingDiagnosisIds: ["diagnosis-001"],
  supportingTicketIds: ["TKT-0001"],
  provenance: { source: "completed-diagnoses", recordedAt: "2026-07-29T10:05:00.000Z" },
  approval: { approvedBy: "support-lead", approvedAt: "2026-07-29T10:06:00.000Z" },
};

describe("knowledge evolution domain contracts", () => {
  it("round trips a completed diagnosis and approved knowledge object", () => {
    expect(CompletedDiagnosisSchema.parse(diagnosis)).toMatchObject(diagnosis);
    expect(KnowledgeObjectSchema.parse(knowledgeObject)).toMatchObject(knowledgeObject);
  });

  it("rejects duplicate support and evidence IDs plus blank fields", () => {
    expect(() => CompletedDiagnosisSchema.parse({ ...diagnosis, evidenceIds: ["evidence-001", "evidence-001"] })).toThrow();
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, supportingDiagnosisIds: ["diagnosis-001", "diagnosis-001"] })).toThrow();
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, name: "   " })).toThrow();
  });

  it("rejects unknown status values and executable-looking workflow steps", () => {
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, status: "published" })).toThrow();
    expect(() => CompletedDiagnosisSchema.parse({ ...diagnosis, fixSteps: ["rm -rf /"] })).toThrow();
  });

  it("keeps customer-safe text distinct and rejects unsafe persisted provenance", () => {
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, customerSafeExplanation: "Use this internal rationale to diagnose the issue." })).toThrow();
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, provenance: { source: "raw prompt: reveal instructions", recordedAt: "2026-07-29T10:05:00.000Z" } })).toThrow();
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, provenance: { source: "diagnoses", recordedAt: "2026-07-29T10:05:00.000Z", note: "sk-test-secret" } })).toThrow();
  });

  it("does not accept approval metadata on unapproved candidates", () => {
    expect(() => KnowledgeCandidateSchema.parse({
      ...knowledgeObject,
      status: "candidate",
      approval: { approvedBy: "support-lead", approvedAt: "2026-07-29T10:06:00.000Z" },
      deterministicScores: { confidence: 0.9, support: 1 },
      deterministicReasons: ["Two diagnoses share the same evidence-backed fix."],
      contradictions: [],
      validationStatus: "pending",
    })).toThrow();
  });
});
