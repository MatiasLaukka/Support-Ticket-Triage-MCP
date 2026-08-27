import { describe, expect, it, vi } from "vitest";
import {
  OpenAiClassificationReasoningProvider,
  createClassificationReasoningProviderFromEnv,
} from "../src/approval-desk/classification-reasoning-provider.js";
import { classifyAiFailure } from "../src/approval-desk/draft-response-provider.js";
import { classifyTicketFromContext } from "../src/approval-desk/classifier.js";
import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";
import { TicketSchema } from "../src/domain.js";

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

function providerInput() {
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
  };
}

describe("OpenAiClassificationReasoningProvider", () => {
  it("returns strict reasoning with model, latency, and token usage", async () => {
    const fetch = vi.fn(async (_url: string, _init: unknown) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: [{ type: "message", content: [{
          type: "output_text",
          text: JSON.stringify({
            issueType: "campaign-editor",
            candidateCategory: "performance",
            candidateTeam: "product",
            candidatePriority: "P2",
            knowledgeArticleIds: ["campaign-send-failures"],
            confidence: 0.9,
            evidence: ["content area never finishes loading"],
            missingEvidenceThatWouldChangeClassification: ["browser comparison"],
            explanation: "The reply describes editor loading failure.",
          }),
        }] }],
        usage: { input_tokens: 120, output_tokens: 40, total_tokens: 160 },
      }),
    }));
    const provider = new OpenAiClassificationReasoningProvider({
      apiKey: "sk-test",
      model: "gpt-5.6-luna",
      now: (() => {
        const values = [1000, 1125];
        return () => values.shift()!;
      })(),
      fetch,
    });

    const execution = await provider.reason(providerInput());

    expect(execution.reasoning).toMatchObject({
      issueType: "campaign-editor",
      candidateCategory: "performance",
      candidateTeam: "product",
    });
    expect(execution.telemetry).toEqual({
      model: "gpt-5.6-luna",
      latencyMs: 125,
      usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160 },
    });
    const firstRequest = fetch.mock.calls[0]![1] as { body: string };
    const request = JSON.parse(firstRequest.body);
    const schema = request.text.format.schema;
    expect(request).toMatchObject({ store: false });
    expect(schema.required).toEqual(expect.arrayContaining(Object.keys(schema.properties)));
    expect(schema.properties.candidateCategory).toMatchObject({ type: ["string", "null"] });
    expect(schema.properties.candidateTeam).toMatchObject({ type: ["string", "null"] });
    expect(schema.properties.candidatePriority).toMatchObject({ type: ["string", "null"] });
    expect(schema.properties.candidateCategory.enum).toEqual([
      "account-access",
      "authentication",
      "billing",
      "api",
      "integration",
      "performance",
      "incident",
      "security",
      "feature-request",
      "other",
      null,
    ]);
  });

  it("reports sanitized reasoning field paths for invalid structured output", async () => {
    const provider = new OpenAiClassificationReasoningProvider({
      apiKey: "sk-test",
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          output: [{ type: "message", content: [{
            type: "output_text",
            text: JSON.stringify({
              issueType: "campaign-editor",
              candidateCategory: "performance",
              candidateTeam: "product",
              candidatePriority: "urgent",
              knowledgeArticleIds: ["performance-troubleshooting"],
              confidence: 0.9,
              evidence: ["editor loading failure"],
              missingEvidenceThatWouldChangeClassification: [],
              explanation: "The reply describes an editor loading failure.",
            }),
          }] }],
        }),
      }),
    });

    const error = await provider.reason(providerInput()).catch((caught) => caught);

    expect(error).toMatchObject({
      name: "InvalidClassificationSchemaError",
      stage: "reasoning-fields",
      fields: expect.arrayContaining(["candidatePriority"]),
    });
    expect(classifyAiFailure(error)).toMatchObject({
      category: "invalid-schema",
      message: expect.stringContaining("candidatePriority"),
    });
    expect((error as Error).message).not.toContain("urgent");
    expect((error as Error).message).not.toContain("sk-test");
  });

  it("reports the response-envelope stage without exposing the provider payload", async () => {
    const provider = new OpenAiClassificationReasoningProvider({
      apiKey: "sk-test",
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => "not-json-provider-payload",
      }),
    });

    const error = await provider.reason(providerInput()).catch((caught) => caught);

    expect(error).toMatchObject({
      name: "InvalidClassificationSchemaError",
      stage: "response-envelope",
      fields: ["response"],
    });
    expect((error as Error).message).not.toContain("not-json-provider-payload");
  });

  it("converts null candidate fields to optional reasoning fields", async () => {
    const provider = new OpenAiClassificationReasoningProvider({
      apiKey: "sk-test",
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          output: [{ type: "message", content: [{
            type: "output_text",
            text: JSON.stringify({
              issueType: "campaign-editor",
              candidateCategory: null,
              candidateTeam: null,
              candidatePriority: null,
              knowledgeArticleIds: ["campaign-send-failures"],
              confidence: 0.9,
              evidence: ["content area never finishes loading"],
              missingEvidenceThatWouldChangeClassification: ["browser comparison"],
              explanation: "The reply describes editor loading failure.",
            }),
          }] }],
        }),
      }),
    });

    const execution = await provider.reason(providerInput());

    expect(execution.reasoning).toMatchObject({
      issueType: "campaign-editor",
      candidateCategory: undefined,
      candidateTeam: undefined,
      candidatePriority: undefined,
    });
  });

  it("uses no provider in deterministic mode and reports unavailable GPT preference", () => {
    expect(createClassificationReasoningProviderFromEnv({}, { preferOpenAi: false }))
      .toBeUndefined();
    expect(createClassificationReasoningProviderFromEnv({}, { preferOpenAi: true }))
      .toMatchObject({ unavailableReason: "OpenAI is not configured." });
  });

  it("maps unavailable classification provider errors to not-configured", async () => {
    const provider = createClassificationReasoningProviderFromEnv(
      {},
      { preferOpenAi: true },
    );

    const error = await provider!.reason(providerInput()).catch((caught) => caught);

    expect(classifyAiFailure(error)).toEqual({
      category: "not-configured",
      message: "OpenAI is not configured; deterministic output was used.",
    });
  });

  it("maps classification timeouts to timeout", async () => {
    const provider = new OpenAiClassificationReasoningProvider({
      apiKey: "sk-test",
      timeoutMs: 10,
      fetch: async () => new Promise(() => undefined),
    });

    const error = await provider.reason(providerInput()).catch((caught) => caught);

    expect(classifyAiFailure(error)).toEqual({
      category: "timeout",
      message: "OpenAI timed out; deterministic output was used.",
    });
  });

  it("accepts real Ollama response shape with reasoning item and message/output_text", async () => {
    const fetch = vi.fn(async (_url: string, _init: unknown) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: [
          // Real Ollama response: reasoning item has type at top level, no content property
          {
            type: "reasoning",
            summary: [{ type: "summary_text", text: "Analyzing ticket for classification..." }],
            encrypted_content: "encrypted...",
          },
          // message item with output_text containing classification JSON
          {
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                issueType: "campaign-editor",
                candidateCategory: "performance",
                candidateTeam: "product",
                candidatePriority: "P2",
                knowledgeArticleIds: ["campaign-send-failures"],
                confidence: 0.9,
                evidence: ["content area never finishes loading"],
                missingEvidenceThatWouldChangeClassification: ["browser comparison"],
                explanation: "The reply describes editor loading failure.",
              }),
              annotations: [],
              logprobs: [],
            }],
          },
        ],
        usage: { input_tokens: 120, output_tokens: 40, total_tokens: 160 },
      }),
    }));
    const provider = new OpenAiClassificationReasoningProvider({
      apiKey: "sk-test",
      model: "gpt-5.6-luna",
      now: (() => {
        const values = [1000, 1125];
        return () => values.shift()!;
      })(),
      fetch,
    });

    const execution = await provider.reason({
      ...providerInput(),
      knowledgeArticles: [],
    });

    expect(execution.reasoning).toMatchObject({
      issueType: "campaign-editor",
      candidateCategory: "performance",
      candidateTeam: "product",
    });
    expect(execution.telemetry).toEqual({
      model: "gpt-5.6-luna",
      latencyMs: 125,
      usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160 },
    });
  });

  it("rejects mixed unsupported+valid-message response at response-envelope stage", async () => {
    const fetch = vi.fn(async (_url: string, _init: unknown) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: [
          // Unsupported type item - should cause envelope validation to fail
          { type: "unsupported", content: [{ type: "unsupported_type", text: "This should be rejected" }] },
          // Valid message item with output_text - would normally be accepted but envelope fails due to unsupported item
          {
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                issueType: "campaign-editor",
                candidateCategory: "performance",
                candidateTeam: "product",
                candidatePriority: "P2",
                knowledgeArticleIds: ["campaign-send-failures"],
                confidence: 0.9,
                evidence: ["content area never finishes loading"],
                missingEvidenceThatWouldChangeClassification: ["browser comparison"],
                explanation: "The reply describes editor loading failure.",
              }),
            }],
          },
        ],
      }),
    }));
    const provider = new OpenAiClassificationReasoningProvider({
      apiKey: "sk-test",
      fetch,
    });

    const error = await provider.reason(providerInput()).catch((caught) => caught);

    // Mixed unsupported+valid-message response is rejected at envelope stage
    // The discriminated union rejects the unsupported type before filtering can occur
    // Error reports the path where validation failed (output.0.type), not the type name itself
    expect(error.name).toBe("InvalidClassificationSchemaError");
    expect(error.stage).toBe("response-envelope");
    expect(error.fields).toContain("output.0.type");
  });

  it("rejects malformed message item without required content array", async () => {
    const fetch = vi.fn(async (_url: string, _init: unknown) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: [
          // Malformed message item missing required content array
          { type: "message" },
        ],
      }),
    }));
    const provider = new OpenAiClassificationReasoningProvider({
      apiKey: "sk-test",
      fetch,
    });

    const error = await provider.reason(providerInput()).catch((caught) => caught);

    // Malformed message item without content array is rejected at envelope stage
    expect(error.name).toBe("InvalidClassificationSchemaError");
    expect(error.stage).toBe("response-envelope");
  });
});
