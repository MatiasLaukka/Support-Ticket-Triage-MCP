import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";
import { classifyTicketFromContext } from "../src/approval-desk/classifier.js";
import { TicketSchema, type Ticket } from "../src/domain.js";
import { TaxonomyInferenceCandidateSchema } from "../src/taxonomy-inference.js";
import {
  InvalidTaxonomySchemaError,
  TaxonomyReasoningProviderUnavailableError,
  type TaxonomyReasoningProvider,
} from "../src/taxonomy-reasoning-provider.js";
import { runTaxonomyStage } from "../src/taxonomy-stage.js";

async function loadTicket(ticketId = "TKT-1030"): Promise<Ticket> {
  const tickets = TicketSchema.array().parse(
    JSON.parse(await readFile(resolve("data/seed/tickets.json"), "utf8")),
  );
  return tickets.find(({ id }) => id === ticketId)!;
}

async function stageInput(
  overrides: Partial<Parameters<typeof runTaxonomyStage>[0]> = {},
  ticketId = "TKT-1030",
) {
  const ticket = await loadTicket(ticketId);
  const conversation = buildConversationContextForTicket({
    ticket,
    customerReplies: [],
    previousSupportResponses: [],
  });
  const classification = classifyTicketFromContext(conversation);
  return {
    ticket,
    conversationText: conversation.classificationText,
    deterministicClassification: {
      category: classification.category,
      team: classification.team,
      priority: classification.priority,
    },
    preference: "gpt-preferred" as const,
    promptInjectionDetected: false,
    ...overrides,
  };
}

const gptCandidate = TaxonomyInferenceCandidateSchema.parse({
  primaryProductSurface: { domain: "messaging", area: "sms" },
  secondaryProductSurfaces: [],
  problemClasses: ["expected-behavior"],
});

describe("runTaxonomyStage", () => {
  it("always runs deterministic inference and uses a valid GPT candidate when allowed", async () => {
    let calls = 0;
    const provider: TaxonomyReasoningProvider = {
      async reason() {
        calls += 1;
        return {
          candidate: gptCandidate,
          rationale: "The conversation directly identifies the messaging surface.",
          telemetry: { model: "local-model", latencyMs: 3 },
        };
      },
    };
    const result = await runTaxonomyStage(await stageInput({ provider }));
    expect(calls).toBe(1);
    expect(result.trace.status).toBe("used");
    expect(result.trace.canonicalSource).toBe("gpt");
    expect(result.context.primaryProductSurface).toEqual(gptCandidate.primaryProductSurface);
    expect(result.context.support.productSurface).not.toBe("established");
  });

  it("falls back on missing provider, timeout, and invalid taxonomy schema", async () => {
    const missing = await runTaxonomyStage(await stageInput({ provider: undefined }));
    expect(missing.trace).toMatchObject({ status: "fallback", fallback: { category: "not-configured" } });

    const timeout = await runTaxonomyStage(await stageInput({
      provider: { async reason() { throw new TaxonomyReasoningProviderUnavailableError("timeout", null); } },
    }));
    expect(timeout.trace).toMatchObject({ status: "fallback", fallback: { category: "timeout" } });

    const invalid = await runTaxonomyStage(await stageInput({
      provider: { async reason() { throw new InvalidTaxonomySchemaError("reasoning-fields", ["problemClasses"]); } },
    }));
    expect(invalid.trace).toMatchObject({ status: "fallback", fallback: { category: "invalid-schema" } });
  });

  it("skips GPT for deterministic preference and prompt injection", async () => {
    let calls = 0;
    const provider: TaxonomyReasoningProvider = { async reason() { calls += 1; throw new Error("must not run"); } };
    const deterministic = await runTaxonomyStage(await stageInput({ preference: "deterministic", provider }));
    expect(deterministic.trace).toMatchObject({ status: "skipped", suppression: { reason: "deterministic-preference" } });
    const injected = await runTaxonomyStage(await stageInput({ promptInjectionDetected: true, provider }));
    expect(injected.trace).toMatchObject({ status: "skipped", suppression: { reason: "prompt-injection" } });
    expect(calls).toBe(0);
  });

  it("rethrows unexpected provider errors", async () => {
    await expect(runTaxonomyStage(await stageInput({
      provider: { async reason() { throw new Error("programming failure"); } },
    }))).rejects.toThrow("programming failure");
  });

  it("derives initial support and fixed empty basis without established support", async () => {
    const result = await runTaxonomyStage(await stageInput({ preference: "deterministic" }, "TKT-1010"));
    expect(result.context.support.productSurface).toBe("tentative");
    expect(result.context.support.problemClass).toBe("tentative");
    expect(result.context.basis).toEqual({
      source: "initial-classification",
      evidenceIds: [],
      knowledgeArticleIds: [],
      playbookIds: [],
      knownCauseIds: [],
      explanation: "Derived from the ticket and current conversation during evaluation.",
    });
    expect(result.trace.gptCandidate).toBeUndefined();
  });
});
