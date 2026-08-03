import { describe, expect, it } from "vitest";
import { TicketSchema, type Ticket } from "../src/domain.js";
import type { CompletedDiagnosis, KnowledgeObject } from "../src/knowledge-evolution/domain.js";
import { discoverCandidates } from "../src/knowledge-evolution/discovery.js";

const completed = (id: string, ticketId: Ticket["id"], overrides: Partial<CompletedDiagnosis> = {}): CompletedDiagnosis => ({
  id,
  ticketId,
  problem: "Webhook deliveries fail after signing-key rotation.",
  symptoms: ["Webhook requests return signature validation errors."],
  evidenceReferences: [{
    id: "request-id",
    labelAtDiagnosis: "Webhook request ID",
    source: "ticket",
    sourceRef: ticketId,
  }],
  ownerTeam: "integrations",
  fixSteps: ["Refresh the signing key in the webhook integration."],
  verificationSteps: ["Verify a newly delivered webhook is accepted."],
  completedAt: "2026-07-29T10:00:00.000Z",
  ...overrides,
});

describe("knowledge evolution discovery", () => {
  it("explains a strong completed-diagnosis match", () => {
    const result = discoverCandidates({
      ticket: ticket("TKT-1001", "Webhook signature failures after rotation"),
      diagnoses: [completed("diagnosis-001", "TKT-1001"), completed("diagnosis-002", "TKT-1002")],
      tickets: [],
      approved: [],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      supportCount: 2,
      contradictions: [],
      meetsAlertThreshold: true,
    });
    expect(result.candidates[0]?.reasons).toEqual(expect.arrayContaining([
      "shared-evidence: request-id",
      "diagnosis-similarity: 1.000",
    ]));
    expect(result.candidates[0]?.support.map((record) => record.diagnosisId)).toEqual(["diagnosis-001", "diagnosis-002"]);
  });

  it("marks two independent completed diagnoses as a high-value candidate", () => {
    const result = discoverCandidates({
      diagnoses: [completed("diagnosis-001", "TKT-1001"), completed("diagnosis-002", "TKT-1002")],
      tickets: [],
      approved: [],
    });

    expect(result.candidates[0]).toMatchObject({ highValue: true, meetsAlertThreshold: true, supportCount: 2 });
  });

  it("uses open tickets as corroboration without promotion eligibility", () => {
    const result = discoverCandidates({
      diagnoses: [completed("diagnosis-001", "TKT-1001")],
      tickets: [ticket("TKT-1002", "Webhook signature failure after signing key rotation")],
      approved: [],
    });

    expect(result.candidates[0]).toMatchObject({ supportCount: 1, highValue: false, meetsAlertThreshold: false });
    expect(result.candidates[0]?.support).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: "TKT-1002", source: "open-ticket" }),
    ]));
  });

  it("treats additional evidence as corroboration rather than a contradiction", () => {
    const result = discoverCandidates({
      diagnoses: [
        completed("diagnosis-001", "TKT-1001"),
        completed("diagnosis-002", "TKT-1002", {
          evidenceReferences: [
            { id: "request-id", labelAtDiagnosis: "Webhook request ID", source: "ticket", sourceRef: "TKT-1002" },
            { id: "signing-secret-rotation-time", labelAtDiagnosis: "Signing key rotation time", source: "ticket", sourceRef: "TKT-1002" },
          ],
        }),
      ],
      tickets: [],
      approved: [],
    });

    expect(result.candidates[0]).toMatchObject({ meetsAlertThreshold: true, contradictions: [] });
  });

  it("does not treat unrelated catalog-backed evidence as corroboration", () => {
    const result = discoverCandidates({
      diagnoses: [
        completed("diagnosis-001", "TKT-1001"),
        completed("diagnosis-002", "TKT-1002", {
          problem: "Billing invoice exports are unavailable.",
          symptoms: ["The billing export page returns an error."],
          evidenceReferences: [{ id: "invoice-number", labelAtDiagnosis: "Invoice number", source: "ticket", sourceRef: "TKT-1002" }],
          ownerTeam: "billing",
        }),
      ],
      tickets: [],
      approved: [],
    });

    expect(result.candidates[0]).toMatchObject({ meetsAlertThreshold: false, contradictions: [] });
  });

  it("orders equal-scoring candidates deterministically", () => {
    const result = discoverCandidates({
      diagnoses: [
        completed("diagnosis-003", "TKT-1003", { problem: "Billing export is delayed.", symptoms: ["Export queue remains pending."], evidenceReferences: [{ id: "invoice-number", labelAtDiagnosis: "Invoice number", source: "ticket", sourceRef: "TKT-1003" }], ownerTeam: "billing" }),
        completed("diagnosis-002", "TKT-1002"),
        completed("diagnosis-001", "TKT-1001"),
      ],
      tickets: [],
      approved: [],
    });

    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["diagnosis-001", "diagnosis-003"]);
  });

  it("suppresses suggestions that duplicate approved knowledge objects", () => {
    const approved = knowledgeObject();
    const result = discoverCandidates({
      diagnoses: [completed("diagnosis-001", "TKT-1001"), completed("diagnosis-002", "TKT-1002")],
      tickets: [],
      approved: [approved],
    });

    expect(result.candidates).toEqual([]);
    expect(result.suppressed).toEqual([{ candidateId: "diagnosis-001", approvedObjectId: approved.id }]);
  });

  it("suppresses a singleton diagnosis that matches approved structured knowledge", () => {
    const approved = knowledgeObject();
    const result = discoverCandidates({
      diagnoses: [completed("diagnosis-001", "TKT-1001")],
      tickets: [ticket("TKT-1001", "Webhook signature failures after rotation", ["event-eu-7", "knowledge-webhook-signature", "time-after-rotation"])],
      approved: [approved],
    });

    expect(result.candidates).toEqual([]);
    expect(result.suppressed).toEqual([{ candidateId: "diagnosis-001", approvedObjectId: approved.id }]);
  });

  it("scores identifiers, knowledge, time, and ticket language after diagnosis terms", () => {
    const result = discoverCandidates({
      diagnoses: [
        completed("diagnosis-001", "TKT-1001", { problem: "Webhook callback error after rotation.", symptoms: ["Signature validation fails."] }),
        completed("diagnosis-002", "TKT-1002", { problem: "Callback signature rejected after key change.", symptoms: ["Webhook validation error."] }),
      ],
      tickets: [
        ticket("TKT-1001", "Webhook callback error after rotation", ["event-eu-7", "knowledge-webhook-signature", "time-after-rotation"]),
        ticket("TKT-1002", "Callback signature rejected after key change", ["event-eu-7", "knowledge-webhook-signature", "time-after-rotation"]),
      ],
      approved: [],
    });

    expect(result.candidates[0]?.reasons).toEqual(expect.arrayContaining([
      "shared-event: event-eu-7",
      "shared-knowledge: knowledge-webhook-signature",
      "shared-time-constraint: time-after-rotation",
      expect.stringMatching(/^ticket-language-similarity: /),
    ]));
  });

  it("bounds all diagnosis and ticket support records to the deterministic top five", () => {
    const diagnoses = [1, 2, 3, 4, 5, 6].map((number) => completed(`diagnosis-00${number}`, `TKT-100${number}` as Ticket["id"]));
    const result = discoverCandidates({ diagnoses, tickets: [], approved: [] });

    expect(result.candidates[0]?.supportCount).toBe(6);
    expect(result.candidates[0]?.support).toHaveLength(5);
    expect(result.candidates[0]?.support.map((record) => record.diagnosisId)).toEqual([
      "diagnosis-001", "diagnosis-002", "diagnosis-003", "diagnosis-004", "diagnosis-005",
    ]);
  });
});

function ticket(id: Ticket["id"], text: string, tags = ["webhook", "signing-key"]): Ticket {
  return TicketSchema.parse({ id, createdAt: "2026-07-29T09:00:00.000Z", updatedAt: "2026-07-29T09:00:00.000Z", customer: { name: "Example", plan: "starter", region: "eu", vip: false }, subject: text, description: text, status: "triage", tags, sla: { responseDueAt: "2026-07-29T12:00:00.000Z", breached: false }, revision: 0 });
}

function knowledgeObject(): KnowledgeObject {
  return {
    id: "known-cause-webhook-key-rotation", kind: "known-cause", name: "Webhook signing key not refreshed", summary: "Webhook delivery can fail when its signing key remains stale after rotation.", triggerPatterns: ["Webhook signature failures after signing-key rotation."], evidencePolicy: { mode: "required", evidenceIds: ["request-id"] }, timeConstraints: ["After a signing-key rotation."], diagnosticSteps: ["Compare webhook signing key versions."], fixSteps: ["Refresh the signing key in the webhook integration."], verificationSteps: ["Verify a newly delivered webhook is accepted."], customerSafeExplanation: "We found a configuration mismatch and are refreshing it.", operatorRationale: "Completed diagnoses share the same key rotation evidence.", owner: "integrations", version: 1, status: "approved", supportingDiagnosisIds: ["diagnosis-001"], supportingTicketIds: ["TKT-1001"], provenance: { source: "completed-diagnoses", recordedAt: "2026-07-29T10:05:00.000Z" }, approval: { approvedBy: "support-lead", approvedAt: "2026-07-29T10:06:00.000Z" },
  };
}
