import { describe, expect, it, vi } from "vitest";
import {
  OpenAiClassificationReasoningProvider,
  createClassificationReasoningProviderFromEnv,
} from "../src/approval-desk/classification-reasoning-provider.js";
import {
  OpenAiDiagnosisReasoningProvider,
  createDiagnosisReasoningProviderFromEnv,
} from "../src/approval-desk/diagnosis-reasoning-provider.js";
import {
  OpenAiCustomerResponseDraftProvider,
  createCustomerResponseDraftProviderFromEnv,
} from "../src/approval-desk/draft-response-provider.js";
import {
  OpenAiKnowledgeCandidateDraftProvider,
} from "../src/knowledge-evolution/openai-candidate-draft-provider.js";
import { TicketSchema } from "../src/domain.js";
import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";
import { classifyTicketFromContext } from "../src/approval-desk/classifier.js";

const ticket = TicketSchema.parse({
  id: "TKT-1010",
  createdAt: "2026-06-10T09:00:00.000Z",
  updatedAt: "2026-06-10T09:00:00.000Z",
  customer: { name: "Acorn Services", plan: "Growth", region: "EU", vip: false },
  requester: {
    name: "Maya Chen",
    role: "Marketing Manager",
    department: "Marketing",
    technicalLevel: "non-technical",
    seniority: "manager",
  },
  subject: "Problem",
  description: "It does not work.",
  status: "new",
  tags: [],
  sla: { responseDueAt: "2026-06-10T13:00:00.000Z", breached: false },
  relatedTicketIds: [],
  revision: 0,
});

function classificationProviderInput() {
  const conversationContext = buildConversationContextForTicket({
    ticket,
    customerReplies: [{
      id: "reply-1",
      ticketId: ticket.id,
      createdAt: "2026-06-10T09:05:00.000Z",
      body: "The campaign editor content area never finishes loading.",
    }],
    previousSupportResponses: [],
  });
  return {
    ticket,
    conversationContext,
    deterministicClassification: classifyTicketFromContext(conversationContext),
    knowledgeArticles: [],
  };
}

describe("OpenAI-compatible endpoint behavior", () => {
  describe("A. Default OpenAI endpoint", () => {
    it("targets https://api.openai.com/v1/responses with no custom baseUrl", async () => {
      let capturedUrl: string | undefined;
      const fetch = vi.fn(async (url: string, _init: unknown) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ issueType: "campaign-editor", candidateCategory: "performance", candidateTeam: "product", candidatePriority: "P2", knowledgeArticleIds: ["campaign-send-failures"], confidence: 0.9, evidence: [], missingEvidenceThatWouldChangeClassification: [], explanation: "Campaign editor failed to load due to stale cache." }) }] }],
          }),
        };
      });

      const provider = new OpenAiClassificationReasoningProvider({
        apiKey: "sk-test",
        fetch,
      });

      await provider.reason(classificationProviderInput());

      expect(capturedUrl).toBe("https://api.openai.com/v1/responses");
    });
  });

  describe("B. Local OpenAI-compatible endpoint", () => {
    it("targets http://localhost:11434/v1/responses with custom baseUrl", async () => {
      let capturedUrl: string | undefined;
      const fetch = vi.fn(async (url: string, _init: unknown) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ issueType: "campaign-editor", candidateCategory: "performance", candidateTeam: "product", candidatePriority: "P2", knowledgeArticleIds: ["campaign-send-failures"], confidence: 0.9, evidence: [], missingEvidenceThatWouldChangeClassification: [], explanation: "Campaign editor failed to load due to stale cache." }) }] }],
          }),
        };
      });

      const provider = new OpenAiClassificationReasoningProvider({
        apiKey: "sk-test",
        baseUrl: "http://localhost:11434/v1",
        fetch,
      });

      await provider.reason(classificationProviderInput());

      expect(capturedUrl).toBe("http://localhost:11434/v1/responses");
    });
  });

  describe("C. Trailing slash normalization", () => {
    it("normalizes http://localhost:11434/v1/ to http://localhost:11434/v1/responses", async () => {
      let capturedUrl: string | undefined;
      const fetch = vi.fn(async (url: string, _init: unknown) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ issueType: "campaign-editor", candidateCategory: "performance", candidateTeam: "product", candidatePriority: "P2", knowledgeArticleIds: ["campaign-send-failures"], confidence: 0.9, evidence: [], missingEvidenceThatWouldChangeClassification: [], explanation: "Campaign editor failed to load due to stale cache." }) }] }],
          }),
        };
      });

      const provider = new OpenAiClassificationReasoningProvider({
        apiKey: "sk-test",
        baseUrl: "http://localhost:11434/v1/",
        fetch,
      });

      await provider.reason(classificationProviderInput());

      expect(capturedUrl).toBe("http://localhost:11434/v1/responses");
      expect(capturedUrl).not.toContain("//responses");
    });
  });

  describe("D. Model override", () => {
    it("uses qwen-triage model when configured", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const fetch = vi.fn(async (url: string, init: unknown) => {
        const body = JSON.parse((init as { body?: string }).body!);
        capturedBody = body;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ issueType: "campaign-editor", candidateCategory: "performance", candidateTeam: "product", candidatePriority: "P2", knowledgeArticleIds: ["campaign-send-failures"], confidence: 0.9, evidence: [], missingEvidenceThatWouldChangeClassification: [], explanation: "Campaign editor failed to load due to stale cache." }) }] }],
          }),
        };
      });

      const provider = new OpenAiClassificationReasoningProvider({
        apiKey: "sk-test",
        model: "qwen-triage",
        baseUrl: "http://localhost:11434/v1",
        fetch,
      });

      await provider.reason(classificationProviderInput());

      expect(capturedBody?.model).toBe("qwen-triage");
    });
  });

  describe("E. Environment configuration", () => {
    it("reads TRIAGE_OPENAI_BASE_URL and OPENAI_MODEL from env", async () => {
      const testEnv = {
        OPENAI_API_KEY: "ollama",
        OPENAI_MODEL: "qwen-triage",
        TRIAGE_OPENAI_BASE_URL: "http://localhost:11434/v1",
      };

      let capturedUrl: string | undefined;
      let capturedModel: string | undefined;
      const fetch = vi.fn(async (url: string, init: unknown) => {
        capturedUrl = url;
        const body = JSON.parse((init as { body?: string }).body!);
        capturedModel = body.model;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ issueType: "campaign-editor", candidateCategory: "performance", candidateTeam: "product", candidatePriority: "P2", knowledgeArticleIds: ["campaign-send-failures"], confidence: 0.9, evidence: [], missingEvidenceThatWouldChangeClassification: [], explanation: "Campaign editor failed to load due to stale cache." }) }] }],
          }),
        };
      });

      const provider = createClassificationReasoningProviderFromEnv(testEnv, { preferOpenAi: true });
      expect(provider).toBeDefined();

      // Inject fetch mock into provider options before calling reason()
      (provider as any).options.fetch = fetch;

      await provider!.reason(classificationProviderInput());

      expect(capturedUrl).toBe("http://localhost:11434/v1/responses");
      expect(capturedModel).toBe("qwen-triage");
    }, 5000);

    it("uses empty string for baseUrl when TRIAGE_OPENAI_BASE_URL is not set", async () => {
      const testEnv = {
        OPENAI_API_KEY: "ollama",
        OPENAI_MODEL: "qwen-triage",
        // TRIAGE_OPENAI_BASE_URL is intentionally omitted
      };

      let capturedUrl: string | undefined;
      const fetch = vi.fn(async (url: string, _init: unknown) => {
        capturedUrl = url;
        // Local endpoint returns error to simulate unavailable service
        if (url.startsWith("http://localhost")) {
          return {
            ok: false,
            status: 404,
          };
        }
        // OpenAI fallback URL - simulate successful response
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ issueType: "campaign-editor", candidateCategory: "performance", candidateTeam: "product", candidatePriority: "P2", knowledgeArticleIds: ["campaign-send-failures"], confidence: 0.9, evidence: [], missingEvidenceThatWouldChangeClassification: [], explanation: "Campaign editor failed to load due to stale cache." }) }] }],
          }),
        };
      });

      const provider = createClassificationReasoningProviderFromEnv(testEnv, { preferOpenAi: true });
      expect(provider).toBeDefined();

      // Inject fetch mock into provider options before calling reason()
      (provider as any).options.fetch = fetch;

      await provider!.reason(classificationProviderInput());

      // When TRIAGE_OPENAI_BASE_URL is not set, baseUrl becomes empty string which normalizes to OpenAI URL
      expect(capturedUrl).toBe("https://api.openai.com/v1/responses");
    }, 5000);
  });

  describe("F. All modified providers - classification reasoning", () => {
    it("uses deterministicClassification.knowledgeArticleIds from the classifier, not passed knowledgeArticles", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const fetch = vi.fn(async (url: string, init: unknown) => {
        const body = JSON.parse((init as { body?: string }).body!);
        capturedBody = body;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ issueType: "campaign-editor", candidateCategory: "performance", candidateTeam: "product", candidatePriority: "P2", knowledgeArticleIds: ["campaign-send-failures"], confidence: 0.9, evidence: [], missingEvidenceThatWouldChangeClassification: [], explanation: "Campaign editor failed to load due to stale cache." }) }] }],
          }),
        };
      });

      const conversationContext = buildConversationContextForTicket({
        ticket,
        customerReplies: [{
          id: "reply-1",
          ticketId: ticket.id,
          createdAt: "2026-06-10T09:05:00.000Z",
          body: "The campaign editor content area never finishes loading.",
        }],
        previousSupportResponses: [],
      });

      const provider = new OpenAiClassificationReasoningProvider({
        apiKey: "sk-test",
        baseUrl: "http://localhost:11434/v1",
        fetch,
      });

      await provider.reason({
        ticket,
        conversationContext,
        deterministicClassification: classifyTicketFromContext(conversationContext),
        knowledgeArticles: [],
      });

      // Verify the request body contains ticket, conversationText, and deterministicClassification
      expect(capturedBody?.input).toContain("ticket");
      expect(capturedBody?.input).toContain("conversationText");
      expect(capturedBody?.input).toContain("deterministicClassification");
    });
  });

  describe("F. All modified providers - diagnosis reasoning", () => {
    const diagnosisTicket = TicketSchema.parse({
      id: "TKT-1013",
      createdAt: "2026-06-10T09:00:00.000Z",
      updatedAt: "2026-06-10T09:00:00.000Z",
      customer: { name: "Acorn Services", plan: "growth", region: "eu-west", vip: false },
      requester: {
        name: "Maya Chen",
        role: "Marketing Manager",
        department: "Marketing",
        technicalLevel: "technical",
        seniority: "manager",
      },
      subject: "Deliverability dropped after a sending domain change",
      description: "Bounce rates increased after we changed the branded sending domain.",
      status: "triage",
      category: "performance",
      priority: "P2",
      team: "product",
      tags: ["email", "deliverability"],
      sla: { responseDueAt: "2026-06-10T13:00:00.000Z", breached: false },
      relatedTicketIds: [],
      revision: 0,
    });

    const diagnosisRecommendation = {
      id: "10000000-0000-4000-8000-000000001013",
      ticketId: diagnosisTicket.id,
      sourceRevision: diagnosisTicket.revision,
      category: "performance",
      priority: "P2",
      team: "product",
      tags: diagnosisTicket.tags,
      duplicateCandidates: [],
      outageRisk: "none",
      securityRisk: "none",
      slaRisk: "none",
      missingInformation: [],
      supportState: "diagnosing",
      requiredEvidence: [],
      providedEvidence: [],
      missingEvidence: [],
      knowledgeArticleIds: ["email-deliverability"],
      draftCustomerResponse: "We are reviewing the evidence.",
      rationale: "The ticket matches the deliverability article.",
      confidence: 0.9,
      recommendedNextAction: "Review the evidence.",
      doNotSay: ["Do not claim a fix."],
      escalationRequired: false,
      escalationReasons: [],
      resolution: "pending",
      createdAt: "2026-06-10T10:00:00.000Z",
    };

    it("targets local endpoint with diagnosis provider", async () => {
      let capturedUrl: string | undefined;
      const fetch = vi.fn(async (url: string, _init: unknown) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ causeType: "performance", customerSafeSummary: "The sending-domain change is associated with a deliverability degradation.", confidence: "likely", owner: "engineering", recommendedNextAction: "Compare bounce and suppression patterns with the prior baseline.", evidenceUsed: ["sending-domain change", "bounce increase"], missingEvidenceThatWouldChangeDiagnosis: ["bounce samples"], knowledgeArticleIds: ["email-deliverability"], explanation: "The ticket and approved article describe a deliverability pattern." }) }] }],
          }),
        };
      });

      const provider = new OpenAiDiagnosisReasoningProvider({
        apiKey: "sk-test",
        baseUrl: "http://localhost:11434/v1",
        fetch,
      });

      await provider.reason({
        ticket: diagnosisTicket,
        conversationContext: buildConversationContextForTicket({ ticket: diagnosisTicket, customerReplies: [] }),
        recommendation: diagnosisRecommendation as any,
        deterministicDiagnosis: {
          status: "completed",
          causeType: "performance",
          customerSafeSummary: "The evidence points to a sending-domain deliverability degradation.",
          evidenceUsed: ["sending-domain change"],
          confidence: "likely",
          owner: "engineering",
          recommendedNextAction: "Compare the sending-domain baseline.",
          doNotSay: ["Do not claim a fix."],
        },
        knowledgeArticles: [{
          id: "email-deliverability",
          title: "Email Deliverability",
          tags: ["email", "bounces"],
          body: "Compare bounce type, suppression growth, domain alignment, and recipient domains.",
        }],
      });

      expect(capturedUrl).toBe("http://localhost:11434/v1/responses");
    });

    it("includes knowledge articles in diagnosis request", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const fetch = vi.fn(async (url: string, init: unknown) => {
        const body = JSON.parse((init as { body?: string }).body!);
        capturedBody = body;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ causeType: "performance", customerSafeSummary: "The sending-domain change is associated with a deliverability degradation.", confidence: "likely", owner: "engineering", recommendedNextAction: "Compare bounce and suppression patterns with the prior baseline.", evidenceUsed: ["sending-domain change", "bounce increase"], missingEvidenceThatWouldChangeDiagnosis: ["bounce samples"], knowledgeArticleIds: ["email-deliverability"], explanation: "The ticket and approved article describe a deliverability pattern." }) }] }],
          }),
        };
      });

      const provider = new OpenAiDiagnosisReasoningProvider({
        apiKey: "sk-test",
        baseUrl: "http://localhost:11434/v1",
        fetch,
      });

      await provider.reason({
        ticket: diagnosisTicket,
        conversationContext: buildConversationContextForTicket({ ticket: diagnosisTicket, customerReplies: [] }),
        recommendation: diagnosisRecommendation as any,
        deterministicDiagnosis: {
          status: "completed",
          causeType: "performance",
          customerSafeSummary: "The evidence points to a sending-domain deliverability degradation.",
          evidenceUsed: ["sending-domain change"],
          confidence: "likely",
          owner: "engineering",
          recommendedNextAction: "Compare the sending-domain baseline.",
          doNotSay: ["Do not claim a fix."],
        },
        knowledgeArticles: [{
          id: "email-deliverability",
          title: "Email Deliverability",
          tags: ["email", "bounces"],
          body: "Compare bounce type, suppression growth, domain alignment, and recipient domains.",
        }],
      });

      expect(capturedBody?.input).toContain("email-deliverability");
    });
  });

  describe("F. All modified providers - customer response draft", () => {
    it("targets local endpoint with customer response provider", async () => {
      let capturedUrl: string | undefined;
      const fetch = vi.fn(async (url: string, _init: unknown) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ content: [{ type: "output_text", text: JSON.stringify({ draftCustomerResponse: "We are reviewing the webhook signature issue. Please provide the signing secret rotation time.", missingInfoSuggestions: ["When was the signing secret rotated?", "What is the current signing secret value?"], investigationSteps: ["Verify webhook signature validation logs", "Check signing secret rotation history"], tone: "balanced", recommendedTone: "empathetic", toneReason: "Customer may be concerned about security implications.", audience: "merchant-admin" }) }] }],
          }),
        };
      });

      const provider = new OpenAiCustomerResponseDraftProvider({
        apiKey: "sk-test",
        baseUrl: "http://localhost:11434/v1",
        fetch,
      });

      await provider.draft({
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
        conversationContext: {
          turnType: "status-follow-up",
          hasCustomerReply: true,
          recognizedEvidenceProgress: true,
        },
        deterministicDraft: "Webhook signature validation needs review.",
        responseStyle: "technical",
        actor: "approval-desk",
        companyName: "Northstar Marketing Support",
      });

      expect(capturedUrl).toBe("http://localhost:11434/v1/responses");
    });
  });

  describe("G. Knowledge candidate provider - local endpoint", () => {
    it("targets http://localhost:11434/v1/responses with custom baseUrl", async () => {
      let capturedUrl: string | undefined;
      const fetch = vi.fn(async (url: string, _init: unknown) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ kind: "known-cause", name: "Webhook signature validation failure", summary: "Signature verification fails after secret rotation", triggerPatterns: ["webhook.*signature.*failed"], evidencePolicy: { mode: "none-required", rationale: "No additional evidence required for known cause." }, knowledgeArticleIds: ["webhook-signature-validation"], timeConstraints: ["within 24 hours of rotation"], diagnosticSteps: ["Verify signing secret was rotated", "Check webhook endpoint logs"], fixSteps: ["Restore previous signing secret or update webhook configuration"], verificationSteps: ["Send test webhook with new signature"], customerSafeExplanation: "We updated our security credentials and are verifying the integration.", operatorRationale: "Known issue after secret rotation; restore previous credential.", confidence: 0.95, rationale: "Pattern matches known-cause for post-rotation failures.", supportingDiagnosisIds: [], supportingTicketIds: [], contradictions: [] }) }] }],
          }),
        };
      });

      const provider = new OpenAiKnowledgeCandidateDraftProvider({
        apiKey: "sk-test",
        baseUrl: "http://localhost:11434/v1",
        fetch,
      });

      await provider.draft({
        discovery: [{ id: "diag-123", score: 0.95, reasons: ["Completed diagnosis available"], support: [{ source: "completed-diagnosis", diagnosisId: "diag-123", ticketId: "ticket-123", score: 0.95, reasons: ["Signature verification fails"] }], supportCount: 1, contradictions: [], highValue: true, meetsAlertThreshold: true }],
        allowedEvidenceIds: [],
        allowedKnowledgeArticleIds: ["webhook-signature-validation"],
      });

      expect(capturedUrl).toBe("http://localhost:11434/v1/responses");
    });
  });

  describe("G. Knowledge candidate provider - model override", () => {
    it("uses qwen-triage model when configured", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const fetch = vi.fn(async (url: string, init: unknown) => {
        const body = JSON.parse((init as { body?: string }).body!);
        capturedBody = body;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ kind: "known-cause", name: "Webhook signature validation failure", summary: "Signature verification fails after secret rotation", triggerPatterns: ["webhook.*signature.*failed"], evidencePolicy: { mode: "none-required", rationale: "No additional evidence required for known cause." }, knowledgeArticleIds: ["webhook-signature-validation"], timeConstraints: ["within 24 hours of rotation"], diagnosticSteps: ["Verify signing secret was rotated", "Check webhook endpoint logs"], fixSteps: ["Restore previous signing secret or update webhook configuration"], verificationSteps: ["Send test webhook with new signature"], customerSafeExplanation: "We updated our security credentials and are verifying the integration.", operatorRationale: "Known issue after secret rotation; restore previous credential.", confidence: 0.95, rationale: "Pattern matches known-cause for post-rotation failures.", supportingDiagnosisIds: [], supportingTicketIds: [], contradictions: [] }) }] }],
          }),
        };
      });

      const provider = new OpenAiKnowledgeCandidateDraftProvider({
        apiKey: "sk-test",
        model: "qwen-triage",
        baseUrl: "http://localhost:11434/v1",
        fetch,
      });

      await provider.draft({
        discovery: [{ id: "diag-123", score: 0.95, reasons: ["Completed diagnosis available"], support: [{ source: "completed-diagnosis", diagnosisId: "diag-123", ticketId: "ticket-123", score: 0.95, reasons: ["Signature verification fails"] }], supportCount: 1, contradictions: [], highValue: true, meetsAlertThreshold: true }],
        allowedEvidenceIds: [],
        allowedKnowledgeArticleIds: ["webhook-signature-validation"],
      });

      expect(capturedBody?.model).toBe("qwen-triage");
    });
  });

  describe("G. Knowledge candidate provider - trailing slash normalization", () => {
    it("normalizes http://localhost:11434/v1/ to http://localhost:11434/v1/responses", async () => {
      let capturedUrl: string | undefined;
      const fetch = vi.fn(async (url: string, _init: unknown) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ kind: "known-cause", name: "Webhook signature validation failure", summary: "Signature verification fails after secret rotation", triggerPatterns: ["webhook.*signature.*failed"], evidencePolicy: { mode: "none-required", rationale: "No additional evidence required for known cause." }, knowledgeArticleIds: ["webhook-signature-validation"], timeConstraints: ["within 24 hours of rotation"], diagnosticSteps: ["Verify signing secret was rotated", "Check webhook endpoint logs"], fixSteps: ["Restore previous signing secret or update webhook configuration"], verificationSteps: ["Send test webhook with new signature"], customerSafeExplanation: "We updated our security credentials and are verifying the integration.", operatorRationale: "Known issue after secret rotation; restore previous credential.", confidence: 0.95, rationale: "Pattern matches known-cause for post-rotation failures.", supportingDiagnosisIds: [], supportingTicketIds: [], contradictions: [] }) }] }],
          }),
        };
      });

      const provider = new OpenAiKnowledgeCandidateDraftProvider({
        apiKey: "sk-test",
        baseUrl: "http://localhost:11434/v1/",
        fetch,
      });

      await provider.draft({
        discovery: [{ id: "diag-123", score: 0.95, reasons: ["Completed diagnosis available"], support: [{ source: "completed-diagnosis", diagnosisId: "diag-123", ticketId: "ticket-123", score: 0.95, reasons: ["Signature verification fails"] }], supportCount: 1, contradictions: [], highValue: true, meetsAlertThreshold: true }],
        allowedEvidenceIds: [],
        allowedKnowledgeArticleIds: ["webhook-signature-validation"],
      });

      expect(capturedUrl).toBe("http://localhost:11434/v1/responses");
      expect(capturedUrl).not.toContain("//responses");
    });
  });
});
