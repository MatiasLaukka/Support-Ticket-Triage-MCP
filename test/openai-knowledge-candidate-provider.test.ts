import { describe, expect, it } from "vitest";
import {
  OpenAiKnowledgeCandidateDraftProvider,
  UnavailableOpenAiKnowledgeCandidateDraftProvider,
  type FetchLike,
} from "../src/knowledge-evolution/openai-candidate-draft-provider.js";
import type { CandidateDraftProviderInput } from "../src/knowledge-evolution/candidate-draft-provider.js";

const input: CandidateDraftProviderInput = {
  discovery: [{
    id: "diagnosis-001",
    score: 0.9,
    reasons: ["shared-evidence: request-id"],
    support: [{
      source: "completed-diagnosis",
      diagnosisId: "diagnosis-001",
      ticketId: "TKT-1001",
      score: 0.9,
      reasons: ["evidence: request-id"],
    }],
    supportCount: 1,
    contradictions: [],
    highValue: false,
    meetsAlertThreshold: false,
  }],
  allowedEvidenceIds: ["request-id"],
  allowedKnowledgeArticleIds: ["webhook-signature-validation"],
};

function responseFor(outputText: string) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      output: [{ content: [{ type: "output_text", text: outputText }] }],
    }),
  };
}

const candidate = JSON.stringify({
  kind: "known-cause",
  name: "Stale webhook signing key after rotation",
  summary: "Webhook validation can fail after a signing-key rotation when the integration retains a prior key.",
  triggerPatterns: ["Webhook signature validation fails after signing-key rotation."],
  evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
  knowledgeArticleIds: ["webhook-signature-validation"],
  timeConstraints: ["Applies after a signing-key rotation."],
  diagnosticSteps: ["Compare the integration signing-key version with the active version."],
  fixSteps: ["Refresh the signing key in the webhook integration."],
  verificationSteps: ["Confirm a newly delivered webhook is accepted."],
  customerSafeExplanation: "We found a configuration mismatch and are refreshing it.",
  operatorRationale: "Advisory draft based on completed diagnosis support.",
  confidence: 0.9,
  rationale: "Completed diagnoses show the same rotation-related failure pattern.",
  supportingDiagnosisIds: ["diagnosis-001"],
  supportingTicketIds: ["TKT-1001"],
  contradictions: [],
});

describe("OpenAI knowledge candidate provider", () => {
  it("sends sanitized input with strict JSON output and returns bounded provenance", async () => {
    let request: { url: string; init: { body: string; headers: Record<string, string> } } | undefined;
    const provider = new OpenAiKnowledgeCandidateDraftProvider({
      apiKey: "test-key",
      model: "gpt-test",
      fetch: async (url: string, init: Parameters<FetchLike>[1]) => {
        request = { url, init };
        return responseFor(candidate);
      },
      now: () => 1_000,
    });

    await expect(provider.draft(input)).resolves.toMatchObject({
      outputText: candidate,
      provenance: { provider: "openai", model: "gpt-test", promptVersion: "knowledge-candidate-v1" },
    });
    expect(request?.url).toBe("https://api.openai.com/v1/responses");
    expect(request?.init.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(request!.init.body) as {
      model: string;
      store: boolean;
      text: { format: { type: string; strict: boolean; schema: { properties: { evidencePolicy: { anyOf?: Array<{ properties?: Record<string, unknown> }> } } } } };
      input: string;
    };
    expect(body).toMatchObject({ model: "gpt-test", store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(body.text.format.schema.properties.evidencePolicy.anyOf).toEqual([
      { type: "object", additionalProperties: false, properties: { mode: { type: "string", enum: ["none-required"] } }, required: ["mode", "rationale"] },
      { type: "object", additionalProperties: false, properties: { mode: { type: "string", enum: ["undecided"] } }, required: ["mode"] },
      { type: "object", additionalProperties: false, properties: { mode: { type: "string", enum: ["required"] }, evidenceIds: { type: "array", items: { type: "string" }, minItems: 1 } }, required: ["mode", "evidenceIds"] },
    ]);
    expect(JSON.parse(body.input)).toEqual(input);
  });

  it("throws a bounded error for non-OK responses", async () => {
    const provider = new OpenAiKnowledgeCandidateDraftProvider({
      apiKey: "test-key",
      fetch: async () => ({ ok: false, status: 500, text: async () => "raw provider secret" }),
    });
    await expect(provider.draft(input)).rejects.toThrow("OpenAI knowledge candidate request failed.");
    await expect(provider.draft(input)).rejects.not.toThrow("raw provider secret");
  });

  it("throws for malformed output envelopes", async () => {
    const provider = new OpenAiKnowledgeCandidateDraftProvider({
      apiKey: "test-key",
      fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ output: [] }) }),
    });
    await expect(provider.draft(input)).rejects.toThrow("OpenAI knowledge candidate response was malformed.");
  });

  it("uses the established default model and enforces the timeout", async () => {
    let requestBody = "";
    const provider = new OpenAiKnowledgeCandidateDraftProvider({
      apiKey: "test-key",
      timeoutMs: 1,
      fetch: async (_url, init) => {
        requestBody = init.body;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return responseFor(candidate);
      },
    });
    await expect(provider.draft(input)).rejects.toThrow("timed out");
    expect(JSON.parse(requestBody)).toMatchObject({ model: "gpt-5.6-luna" });
  });

  it("provides an unavailable provider when credentials are absent", async () => {
    const provider = new UnavailableOpenAiKnowledgeCandidateDraftProvider();
    await expect(provider.draft(input)).rejects.toThrow("OpenAI knowledge candidate drafting is not configured.");
  });
});
