import { describe, expect, it } from "vitest";
import { TicketSchema } from "../src/domain.js";
import { buildApprovalDeskRecommendationInput } from "../src/approval-desk/recommendation-builder.js";
import type { ReusableKnowledgeResult } from "../src/knowledge-evolution/reusable-context.js";

const ticket = TicketSchema.parse({
  id: "TKT-1001",
  revision: 0,
  subject: "Token fault blocks the controlled path",
  description: "The exact token fault applies to this request.",
  category: "integration",
  priority: "P2",
  team: "integrations",
  tags: [],
  status: "triage",
  createdAt: "2026-08-07T11:00:00.000Z",
  updatedAt: "2026-08-07T11:00:00.000Z",
  customer: { name: "Example customer", plan: "Growth", region: "FI", vip: false },
  sla: { responseDueAt: "2026-08-08T11:00:00.000Z", breached: false },
});

const outcome = {
  ticketId: ticket.id,
  category: "integration" as const,
  acceptablePriorities: ["P2" as const],
  team: "integrations" as const,
  requiredEscalations: [],
  knowledgeArticleIds: [],
};

describe("exact reusable knowledge provenance", () => {
  it("only applies an approved object supplied by the reusable context and persists its exact version reference", () => {
    const learned = buildApprovalDeskRecommendationInput({
      ticket,
      outcome,
      actor: "approval-desk",
      reusableKnowledge: reusableKnowledge("none-required", 1),
    });
    const baseline = buildApprovalDeskRecommendationInput({ ticket, outcome, actor: "approval-desk" });

    expect(learned).toMatchObject({
      supportState: "known-cause",
      knownCause: "token-fault",
      knownCauseRef: { objectId: "token-fault", version: 1 },
      learnedContext: { status: "available", issues: [] },
    });
    expect(baseline.knownCause).not.toBe("token-fault");
    expect(baseline.knownCauseRef).toBeUndefined();
  });

  it("keeps learned causes with required evidence in needs-information and exposes unavailable-ledger fallback", () => {
    const required = buildApprovalDeskRecommendationInput({
      ticket,
      outcome,
      actor: "approval-desk",
      reusableKnowledge: reusableKnowledge("required", 1),
    });
    const unavailable = buildApprovalDeskRecommendationInput({
      ticket,
      outcome,
      actor: "approval-desk",
      reusableKnowledge: {
        status: "ledger-unavailable",
        contexts: [],
        issues: [{ scope: "snapshot", code: "ledger-read-failed" }],
      },
    });

    expect(required).toMatchObject({
      supportState: "needs-information",
      knownCause: "token-fault",
      knownCauseRef: { objectId: "token-fault", version: 1 },
    });
    expect(unavailable).toMatchObject({
      supportState: "diagnosing",
      learnedContext: {
        status: "ledger-unavailable",
        issues: [{ scope: "snapshot", code: "ledger-read-failed" }],
      },
    });
    expect(unavailable.knownCauseRef).toBeUndefined();
  });
});

function reusableKnowledge(
  mode: "none-required" | "required",
  version: number,
): ReusableKnowledgeResult {
  return {
    status: "available",
    contexts: [{
      object: {
        id: "token-fault",
        version,
        learningGovernance: "ledger",
        kind: "known-cause",
        name: "Token fault",
        summary: "Controlled token fault guidance.",
        triggerPatterns: ["token fault"],
        evidencePolicy: mode === "required"
          ? { mode, evidenceIds: ["request-id"] }
          : { mode, rationale: "No additional evidence is required for this controlled support path." },
        timeConstraints: [],
        diagnosticSteps: ["Confirm the token fault."],
        fixSteps: ["Apply the controlled fix."],
        verificationSteps: ["Verify recovery."],
        customerSafeExplanation: "We can apply the documented token-fault path.",
        operatorRationale: "Approved for exact-version reuse.",
        owner: "integrations",
        supportingDiagnosisIds: ["diagnosis-001"],
        supportingTicketIds: [ticket.id],
        provenance: { source: "test", recordedAt: "2026-08-07T10:00:00.000Z" },
        status: "approved",
        approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T10:00:00.000Z" },
      },
      version,
      learning: { maturity: "promoted", health: "active", eligibleForReuse: true },
      eligibilitySource: "ledger-active",
    }],
    issues: [],
  };
}
