import { describe, expect, it } from "vitest";
import {
  buildDraftObligations,
  validateDraftContract,
} from "../src/approval-desk/draft-contract.js";
import type { CustomerResponseDraftInput } from "../src/approval-desk/draft-response-provider.js";

const ticket = {
  id: "TKT-contract",
  createdAt: "2026-07-26T08:00:00.000Z",
  updatedAt: "2026-07-26T08:00:00.000Z",
  customer: { name: "Juniper", plan: "enterprise", region: "eu", vip: false },
  requester: {
    name: "Avery",
    role: "Developer",
    department: "Engineering",
    technicalLevel: "developer" as const,
    seniority: "individual-contributor" as const,
  },
  subject: "Webhook signature validation fails",
  description: "Webhook signature validation fails after a rotation.",
  status: "triage" as const,
  tags: ["webhook"],
  sla: { responseDueAt: "2026-07-26T10:00:00.000Z", breached: false },
  relatedTicketIds: [],
  revision: 0,
};

const baseInput: CustomerResponseDraftInput = {
  ticket,
  outcome: {
    ticketId: ticket.id,
    category: "integration",
    acceptablePriorities: ["P2"],
    team: "integrations",
    requiredEscalations: [],
    knowledgeArticleIds: ["webhook-signature-validation"],
  },
  knowledgeArticles: [],
  deterministicDraft: "Webhook signature validation needs review.",
  responseStyle: "technical",
  actor: "approval-desk",
  companyName: "Northstar Marketing Support",
};

const partialEvidenceInput: CustomerResponseDraftInput = {
  ...baseInput,
  evidenceReadiness: {
    supportState: "needs-information",
    knownCause: null,
    requiredEvidence: [],
    providedEvidence: [],
    missingEvidence: [{
      id: "signing-secret-rotation-time",
      label: "Signing secret rotation time",
      customerQuestion: "when the signing secret was rotated, without its value",
      aliases: ["signing secret rotation time", "rotation time"],
      source: "policy",
    }],
    nextInvestigationSteps: [],
  },
};

const activeKnownEventInput: CustomerResponseDraftInput = {
  ...baseInput,
  outcome: { ...baseInput.outcome, requiredEscalations: ["outage"] },
  evidenceReadiness: {
    supportState: "waiting-on-platform-fix",
    knownCause: null,
    knownEventId: "EVT-2026-07-26-WEBHOOK-LATENCY",
    requiredEvidence: [],
    providedEvidence: [],
    missingEvidence: [],
    nextInvestigationSteps: [],
  },
};

describe("draft contract", () => {
  it("builds concept and missing-evidence obligations from authoritative state", () => {
    expect(buildDraftObligations(partialEvidenceInput)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "concept:webhook-signature", hard: true }),
        expect.objectContaining({ id: "evidence:signing-secret-rotation-time" }),
      ]),
    );
  });

  it("requires explicit incident review for an active known event", () => {
    expect(validateDraftContract({
      input: activeKnownEventInput,
      response: "The event-ingestion delay is under review.",
      assistText: "",
    })).toMatchObject({
      failedObligationIds: ["escalation:incident-review"],
    });
  });

  it("accepts declared aliases after normalizing punctuation and whitespace", () => {
    expect(validateDraftContract({
      input: partialEvidenceInput,
      response: "We are reviewing the signature-validation mismatch. Please share the rotation time.",
      assistText: "",
    }).failedObligationIds).toEqual([]);
  });

  it("rejects a stale reply that requests evidence already provided", () => {
    const staleInput: CustomerResponseDraftInput = {
      ...baseInput,
      evidenceReadiness: {
        supportState: "information-received",
        knownCause: null,
        requiredEvidence: [],
        providedEvidence: [{
          id: "request-id",
          label: "Request ID",
          customerQuestion: "request ID",
          aliases: ["request id"],
          source: "policy",
        }],
        missingEvidence: [],
        nextInvestigationSteps: [],
      },
      conversationContext: {
        turnType: "status-follow-up",
        hasCustomerReply: true,
        recognizedEvidenceProgress: true,
      },
    };

    expect(validateDraftContract({
      input: staleInput,
      response: "Please share the request ID again.",
      assistText: "",
    }).failedObligationIds).toContain("evidence:no-repeat:request-id");
  });

  it.each(["Glad to hear that resolved it.", "Glad to hear it is working again."])(
    "accepts customer-confirmation closure wording: %s",
    (response) => {
      const closureInput: CustomerResponseDraftInput = {
        ...baseInput,
        evidenceReadiness: {
          supportState: "ready-for-close",
          knownCause: null,
          requiredEvidence: [],
          providedEvidence: [],
          missingEvidence: [],
          nextInvestigationSteps: [],
        },
        conversationContext: {
          turnType: "customer-confirmed",
          hasCustomerReply: true,
          recognizedEvidenceProgress: true,
        },
      };
      expect(validateDraftContract({ input: closureInput, response, assistText: "" })
        .failedObligationIds).toEqual([]);
    },
  );
});
