import { describe, expect, it } from "vitest";
import {
  buildDraftObligations,
  validateDraftContract,
} from "../src/approval-desk/draft-contract.js";
import {
  draftCustomerResponseWithFallback,
  type CustomerResponseDraftInput,
} from "../src/approval-desk/draft-response-provider.js";

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

  it("does not let internal assist text satisfy a public escalation obligation", async () => {
    const result = await draftCustomerResponseWithFallback({
      provider: {
        draft: async () => ({
          source: "openai" as const,
          response: "The event-ingestion delay is under review.",
          assist: {
            source: "openai" as const,
            missingInfoSuggestions: ["The issue is under incident review."],
            investigationSteps: ["Continue incident review."],
            tone: "technical" as const,
            recommendedTone: "technical" as const,
            selectedTone: "technical" as const,
            toneReason: "Technical issue.",
            audience: "developer" as const,
            checks: [],
          },
        }),
      },
      draftInput: activeKnownEventInput,
    });

    expect(result).toMatchObject({
      source: "fallback",
      fallback: { category: "guardrail-rejected" },
    });
    expect(result.response).toContain("incident review");
  });

  it("accepts declared aliases after normalizing punctuation and whitespace", () => {
    expect(validateDraftContract({
      input: partialEvidenceInput,
      response: "We are reviewing the signature-validation mismatch. Please share the rotation time.",
      assistText: "",
    }).failedObligationIds).toEqual([]);
  });

  it("keeps the webhook-signature obligation when no known event is represented by null", () => {
    const noKnownEventInput: CustomerResponseDraftInput = {
      ...partialEvidenceInput,
      evidenceReadiness: {
        ...partialEvidenceInput.evidenceReadiness!,
        knownEventId: null,
      },
    };

    expect(buildDraftObligations(noKnownEventInput)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "concept:webhook-signature", hard: true }),
    ]));
  });

  it("maps customer-safe escalation reasons and keeps internal routing reasons undisclosed", () => {
    const escalationInput: CustomerResponseDraftInput = {
      ...baseInput,
      outcome: {
        ...baseInput.outcome,
        requiredEscalations: [
          "security",
          "outage",
          "low-confidence",
          "sla",
          "missing-information",
          "diagnostic-ambiguity",
          "policy-conflict",
        ],
      },
    };

    expect(buildDraftObligations(escalationInput)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "escalation:security-review", hard: true }),
      expect.objectContaining({ id: "escalation:incident-review", hard: true }),
    ]));
    expect(buildDraftObligations(escalationInput)).not.toContainEqual(
      expect.objectContaining({ id: "escalation:missing-information" }),
    );
    expect(buildDraftObligations(escalationInput)).not.toContainEqual(
      expect.objectContaining({ id: "escalation:specialist-review" }),
    );
  });

  it("returns a bounded security-review fallback after a non-contract rejection", async () => {
    const result = await draftCustomerResponseWithFallback({
      draftInput: {
        ...baseInput,
        outcome: {
          ...baseInput.outcome,
          requiredEscalations: ["security"],
        },
        deterministicDraft: "We guarantee this issue is fixed.",
      },
    });

    expect(result).toMatchObject({
      source: "fallback",
      fallback: { category: "guardrail-rejected" },
    });
    expect(result.response).toContain("specialist security review");
  });

  it("preserves combined security and incident-review obligations in the bounded fallback", async () => {
    const result = await draftCustomerResponseWithFallback({
      draftInput: {
        ...baseInput,
        outcome: {
          ...baseInput.outcome,
          requiredEscalations: ["security", "outage"],
        },
        deterministicDraft: "We guarantee this issue is fixed.",
      },
    });

    expect(result).toMatchObject({ source: "fallback" });
    expect(result.response).toContain("specialist security review");
    expect(result.response).toContain("incident review");
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
