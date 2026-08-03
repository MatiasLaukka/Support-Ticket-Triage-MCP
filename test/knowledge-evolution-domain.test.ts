import { describe, expect, it } from "vitest";
import {
  CompletedDiagnosisSchema,
  ApprovedEvidencePolicySchema,
  CandidateEvidencePolicySchema,
  EvidencePolicySchema,
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

  it("loads legacy completed diagnosis JSON with empty evidence references", () => {
    expect(CompletedDiagnosisSchema.parse(diagnosis)).toMatchObject({
      ...diagnosis,
      evidenceUsed: [],
      evidenceReferences: [],
    });
  });

  it("retains readable evidence alongside its catalog-backed diagnosis reference", () => {
    expect(CompletedDiagnosisSchema.parse({
      ...diagnosis,
      evidenceUsed: ["The customer supplied request ID req-123."],
      evidenceReferences: [{
        id: "request-id",
        labelAtDiagnosis: "Customer request ID",
        source: "reply",
        sourceRef: "reply-001",
      }],
    })).toMatchObject({
      evidenceUsed: ["The customer supplied request ID req-123."],
      evidenceReferences: [{
        id: "request-id",
        labelAtDiagnosis: "Customer request ID",
        source: "reply",
        sourceRef: "reply-001",
      }],
    });
  });

  it("rejects duplicate support and evidence IDs plus blank fields", () => {
    expect(() => CompletedDiagnosisSchema.parse({ ...diagnosis, evidenceIds: ["evidence-001", "evidence-001"] })).toThrow();
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, supportingDiagnosisIds: ["diagnosis-001", "diagnosis-001"] })).toThrow();
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, supportingTicketIds: ["TKT-0001", "TKT-0001"] })).toThrow();
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
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, provenance: { source: "C:\\support\\case-notes", recordedAt: "2026-07-29T10:05:00.000Z" } })).toThrow();
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, provenance: { source: "hidden reasoning: the diagnosis was inferred", recordedAt: "2026-07-29T10:05:00.000Z" } })).toThrow();
    expect(() => KnowledgeObjectSchema.parse({ ...knowledgeObject, provenance: { source: "provider payload: { answer: true }", recordedAt: "2026-07-29T10:05:00.000Z" } })).toThrow();
  });

  it("requires evidence IDs only when the evidence policy requires evidence", () => {
    expect(EvidencePolicySchema.parse({ mode: "none-required", rationale: "Authoritative event evidence is sufficient." })).toEqual({ mode: "none-required", rationale: "Authoritative event evidence is sufficient." });
    expect(() => EvidencePolicySchema.parse({ mode: "required", evidenceIds: [] })).toThrow();
  });

  it("allows incomplete candidate policies but never incomplete approved policies", () => {
    expect(CandidateEvidencePolicySchema.parse({ mode: "undecided" })).toEqual({ mode: "undecided" });
    expect(CandidateEvidencePolicySchema.parse({ mode: "none-required", rationale: "The workflow has an authoritative event signal." })).toEqual({
      mode: "none-required",
      rationale: "The workflow has an authoritative event signal.",
    });
    expect(() => CandidateEvidencePolicySchema.parse({ mode: "none-required" })).toThrow();
    expect(() => ApprovedEvidencePolicySchema.parse({ mode: "undecided" })).toThrow();
    expect(() => ApprovedEvidencePolicySchema.parse({ mode: "none-required" })).toThrow();
  });

  it("loads pre-policy candidates as undecided without making them promotable", () => {
    const { approval: _approval, ...candidateFields } = knowledgeObject;
    const legacyCandidate = {
      ...candidateFields,
      status: "candidate" as const,
      evidencePolicy: { mode: "none-required" },
      deterministicScores: { confidence: 0.9, support: 1 },
      deterministicReasons: ["Two diagnoses share the same evidence-backed fix."],
      contradictions: [],
      validationStatus: "invalid" as const,
    };
    expect(KnowledgeCandidateSchema.parse(legacyCandidate)).toMatchObject({
      evidencePolicy: { mode: "undecided" },
      validationStatus: "invalid",
    });
  });

  it("keeps pre-policy approved objects readable with an explicit migration rationale", () => {
    expect(KnowledgeObjectSchema.parse({ ...knowledgeObject, evidencePolicy: { mode: "none-required" } })).toMatchObject({
      evidencePolicy: { mode: "none-required", rationale: "Legacy approved policy; rationale was not recorded." },
    });
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
