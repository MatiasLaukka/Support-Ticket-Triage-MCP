import { describe, expect, it } from "vitest";
import {
  InvalidDiagnosisSchemaError,
  OpenAiDiagnosisReasoningProvider,
} from "../src/approval-desk/diagnosis-reasoning-provider.js";
import { TicketSchema, TriageRecommendationSchema } from "../src/domain.js";
import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";

const ticket = TicketSchema.parse({
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

const recommendation = TriageRecommendationSchema.parse({
  id: "10000000-0000-4000-8000-000000001013",
  ticketId: ticket.id,
  sourceRevision: ticket.revision,
  category: "performance",
  priority: "P2",
  team: "product",
  tags: ticket.tags,
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
  escalationRequired: false,
  escalationReasons: [],
  resolution: "pending",
  createdAt: "2026-06-10T10:00:00.000Z",
});

function providerInput() {
  return {
    ticket,
    conversationContext: buildConversationContextForTicket({ ticket, customerReplies: [] }),
    recommendation,
    deterministicDiagnosis: {
      status: "completed" as const,
      causeType: "performance" as const,
      customerSafeSummary: "The evidence points to a sending-domain deliverability degradation.",
      evidenceUsed: ["sending-domain change"],
      confidence: "likely" as const,
      owner: "engineering" as const,
      recommendedNextAction: "Compare the sending-domain baseline.",
      doNotSay: ["Do not claim a fix."],
    },
    knowledgeArticles: [{
      id: "email-deliverability",
      title: "Email Deliverability",
      tags: ["email", "bounces"],
      body: "Compare bounce type, suppression growth, domain alignment, and recipient domains.",
    }],
  };
}

describe("OpenAiDiagnosisReasoningProvider", () => {
  it("returns a structured advisory diagnosis and trusted telemetry", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OpenAiDiagnosisReasoningProvider({
      apiKey: "sk-test",
      model: "gpt-5.6-luna",
      now: (() => {
        const values = [1000, 1125];
        return () => values.shift()!;
      })(),
      fetch: async (_url, init) => {
        requestBody = JSON.parse(init.body) as Record<string, unknown>;
        return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          output: [{ content: [{
            type: "output_text",
            text: JSON.stringify({
              causeType: "performance",
              customerSafeSummary: "The sending-domain change is associated with a deliverability degradation.",
              confidence: "likely",
              owner: "engineering",
              recommendedNextAction: "Compare bounce and suppression patterns with the prior baseline.",
              evidenceUsed: ["sending-domain change", "bounce increase"],
              missingEvidenceThatWouldChangeDiagnosis: ["bounce samples"],
              knowledgeArticleIds: ["email-deliverability"],
              explanation: "The ticket and approved article describe a deliverability pattern.",
            }),
          }] }],
        }),
        };
      },
    });

    const result = await provider.reason(providerInput());

    expect(result.reasoning).toMatchObject({ causeType: "performance", confidence: "likely" });
    expect(result.telemetry).toEqual({ model: "gpt-5.6-luna", latencyMs: 125 });
    expect(requestBody?.max_output_tokens).toBe(1400);
    expect(requestBody?.instructions).toEqual(expect.stringContaining("one concise"));
    const text = requestBody?.text as { format: { schema: { properties: Record<string, { maxLength?: number }> } } };
    expect(text.format.schema.properties.customerSafeSummary.maxLength).toBe(220);
    expect(text.format.schema.properties.recommendedNextAction.maxLength).toBe(180);
    expect(text.format.schema.properties.explanation.maxLength).toBe(160);
  });

  it("rejects schema output without exposing provider payload text", async () => {
    const provider = new OpenAiDiagnosisReasoningProvider({
      apiKey: "sk-test",
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          output: [{ content: [{
            type: "output_text",
            text: JSON.stringify({
              causeType: "not-a-cause",
              customerSafeSummary: "bad",
              confidence: "confirmed",
              owner: "engineering",
              recommendedNextAction: "bad",
              evidenceUsed: [],
              missingEvidenceThatWouldChangeDiagnosis: [],
              knowledgeArticleIds: [],
              explanation: "bad",
              raw: "provider-secret-payload",
            }),
          }] }],
        }),
      }),
    });

    const error = await provider.reason(providerInput()).catch((caught) => caught);

    expect(error).toBeInstanceOf(InvalidDiagnosisSchemaError);
    expect((error as Error).message).not.toContain("provider-secret-payload");
  });
});
