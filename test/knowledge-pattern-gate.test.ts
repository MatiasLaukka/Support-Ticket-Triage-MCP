import { describe, expect, it } from "vitest";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";
import type { KnowledgeCandidate } from "../src/knowledge-evolution/domain.js";
import { knowledgePatternGate } from "../src/approval-desk/knowledge-pattern-gate.js";

function candidate(overrides: Partial<KnowledgeCandidate> = {}): KnowledgeCandidate {
  return {
    id: "candidate-1",
    kind: "known-cause",
    name: "Recurring event delay",
    summary: "The same event processing delay recurs.",
    triggerPatterns: ["event delay"],
    evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
    timeConstraints: ["Use when the cited event evidence is present."],
    diagnosticSteps: ["Compare the event evidence with the prior diagnosis."],
    fixSteps: ["Apply the governed mitigation."],
    verificationSteps: ["Ask the customer to retry the affected event."],
    customerSafeExplanation: "We identified a recurring issue and are reviewing the next safe step.",
    operatorRationale: "The candidate is supported by a completed diagnosis.",
    owner: "api-platform",
    version: 1,
    supportingDiagnosisIds: ["diagnosis-1002"],
    supportingTicketIds: ["TKT-1002"],
    provenance: {
      source: "test",
      recordedAt: "2026-08-04T10:00:00.000Z",
    },
    status: "candidate",
    deterministicScores: { confidence: 0.9, support: 2 },
    deterministicReasons: ["The completed diagnosis repeats."],
    discovery: {
      score: 0.9,
      reasons: ["The completed diagnosis repeats."],
      support: [{
        source: "completed-diagnosis",
        diagnosisId: "diagnosis-1002",
        ticketId: "TKT-1002",
        score: 1,
        reasons: ["Same diagnosis"],
      }],
      supportCount: 2,
      contradictions: [],
      meetsAlertThreshold: true,
    },
    contradictions: [],
    validationStatus: "valid",
    evidencePolicyMetadata: {
      derivedEvidenceIds: ["request-id"],
      operatorAddedEvidenceIds: [],
    },
    ...overrides,
  };
}

function knowledgeAudit(overrides: Partial<KnowledgeAuditEvent> = {}): KnowledgeAuditEvent {
  return {
    id: "audit-1",
    candidateId: "candidate-1",
    action: "candidate-created",
    actor: "support-lead",
    timestamp: "2026-08-04T10:01:00.000Z",
    supportIds: ["diagnosis-1002", "TKT-1002"],
    reviewedFields: [],
    result: "candidate-created",
    ...overrides,
  };
}

describe("knowledge pattern gate", () => {
  it("blocks when the candidate supports this ticket's current diagnosis", () => {
    const gate = knowledgePatternGate({
      ticketId: "TKT-1002",
      currentDiagnosisId: "diagnosis-1002",
      candidates: [candidate()],
      audits: [],
    });

    expect(gate).toMatchObject({ state: "pending", actionable: true, candidateId: "candidate-1" });
  });

  it("does not gate on open-ticket corroboration alone", () => {
    const gate = knowledgePatternGate({
      ticketId: "TKT-1010",
      currentDiagnosisId: undefined,
      candidates: [candidate({
        supportingTicketIds: ["TKT-1010"],
        supportingDiagnosisIds: [],
        discovery: {
          score: 0.8,
          reasons: ["Open ticket language is similar."],
          support: [{ source: "open-ticket", ticketId: "TKT-1010", score: 0.8, reasons: ["Similar wording"] }],
          supportCount: 1,
          contradictions: [],
          meetsAlertThreshold: true,
        },
      })],
      audits: [],
    });

    expect(gate).toMatchObject({ state: "none", actionable: false });
  });

  it.each(["approved", "rejected"] as const)("releases the gate after %s", (action) => {
    const gate = knowledgePatternGate({
      ticketId: "TKT-1002",
      currentDiagnosisId: "diagnosis-1002",
      candidates: [candidate()],
      audits: [knowledgeAudit({ action })],
    });

    expect(gate.actionable).toBe(false);
    expect(gate.state).toBe(action);
  });

  it("keeps a deferred candidate as a hard gate", () => {
    const gate = knowledgePatternGate({
      ticketId: "TKT-1002",
      currentDiagnosisId: "diagnosis-1002",
      candidates: [candidate()],
      audits: [knowledgeAudit({ action: "deferred" })],
    });

    expect(gate).toMatchObject({ state: "deferred", actionable: true });
  });
});
