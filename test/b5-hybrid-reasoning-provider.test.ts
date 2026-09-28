import { describe, expect, it, vi } from "vitest";
import { OpenAiApplicabilityReasoningProvider } from "../src/applicability-reasoning-provider.js";
import {
  B5TaxonomyInformedHybridReasoningProvider,
} from "../src/reasoning/b5-hybrid-reasoning-provider.js";
import { HybridReasoningProviderError } from "../src/reasoning/hybrid-shadow-runner.js";
import type { ApplicabilityTaxonomyInformedSemanticReasoningInput } from "../src/retrieval/applicability-types.js";
import {
  hybridReasoningInput,
  taxonomyInformedSemanticInput,
  validB5Output,
} from "./fixtures/hybrid-reasoning.js";

function requestSemanticInput(body: string): ApplicabilityTaxonomyInformedSemanticReasoningInput {
  const request = JSON.parse(body) as { input: string };
  const serialized = request.input.split("\n")[1]!;
  return JSON.parse(serialized) as ApplicabilityTaxonomyInformedSemanticReasoningInput;
}

function responseFor(output: unknown): string {
  return JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
  });
}

function createAdapter(fetch: (url: string, init: { body: string }) => Promise<unknown>) {
  const b5 = new OpenAiApplicabilityReasoningProvider({
    apiKey: "unit-test-key",
    model: "b5-test-model",
    timeoutMs: 20_000,
    maxOutputTokens: 4_096,
    fetch: fetch as never,
  });
  return new B5TaxonomyInformedHybridReasoningProvider(b5, {
    providerKind: "openai-responses",
    model: "b5-test-model",
  });
}

describe("taxonomy-informed B5 hybrid reasoning adapter", () => {
  it("uses the frozen H5b0 taxonomy, evidence text, hashes, and provenance at the real B5 semantic boundary", async () => {
    const input = hybridReasoningInput();
    const before = structuredClone(input);
    const fetch = vi.fn(async (_url: string, init: { body: string }) => {
      const semanticInput = requestSemanticInput(init.body);
      return { ok: true, status: 200, text: async () => responseFor(validB5Output(semanticInput)) };
    });

    const result = await createAdapter(fetch).reason(input);
    const sent = requestSemanticInput(fetch.mock.calls[0]![1].body);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sent).toEqual(input.applicability);
    expect(sent.lane).toBe("taxonomy-informed");
    expect(sent.taxonomy).toEqual(input.applicability.taxonomy);
    expect(sent.evidenceRegistry.map(({ id, contentHash, text, resourceKey }) => ({ id, contentHash, text, resourceKey }))).toEqual([
      {
        id: "representation:retry-saturation",
        contentHash: "c".repeat(64),
        text: "A growing retry queue can delay later webhook attempts.",
        resourceKey: "known-cause:retry-saturation",
      },
      {
        id: "representation:webhook-delay",
        contentHash: "d".repeat(64),
        text: "Compare delivery-attempt timestamps with the configured retry interval.",
        resourceKey: "knowledge-article:webhook-delay",
      },
    ]);
    expect(JSON.stringify(sent)).not.toContain("identity");
    expect(JSON.stringify(sent)).not.toContain("caseId");
    expect(input).toEqual(before);
    expect(result.basis).toEqual(input.basis);
    expect(result.mode).toBe("evaluation");
    expect(result.hypotheses.map(({ statement, rank }) => ({ statement, rank }))).toEqual([
      { statement: "A growing retry queue is delaying webhook delivery.", rank: 1 },
      { statement: "The configured retry interval is longer than expected.", rank: 2 },
    ]);
  });

  it("maps catalog-backed missing evidence, one-based ordinal ranks, and hypothesis-linked actions without confidence", async () => {
    const input = hybridReasoningInput();
    const fetch = vi.fn(async (_url: string, init: { body: string }) => {
      const semanticInput = requestSemanticInput(init.body);
      return { ok: true, status: 200, text: async () => responseFor(validB5Output(semanticInput)) };
    });

    const result = await createAdapter(fetch).reason(input);

    expect(result.evidenceRequirements).toEqual([{
      id: "request-id",
      label: "Request ID",
      customerQuestion: "request ID if available",
      aliases: ["request id", "api request"],
      source: "knowledge",
    }]);
    expect(result.hypotheses).toEqual([
      {
        id: "b5-taxonomy-informed-v1-hypothesis-1",
        statement: "A growing retry queue is delaying webhook delivery.",
        rank: 1,
        evidenceRequirementIds: ["request-id"],
      },
      {
        id: "b5-taxonomy-informed-v1-hypothesis-2",
        statement: "The configured retry interval is longer than expected.",
        rank: 2,
      },
    ]);
    expect(result.actions).toEqual([
      {
        id: "b5-taxonomy-informed-v1-action-1",
        description: "[inspect-internal] Compare retry queue depth across delivery attempts. Expected evidence: Queue depth and attempt timestamps for the same request.",
        hypothesisIds: ["b5-taxonomy-informed-v1-hypothesis-1"],
      },
      {
        id: "b5-taxonomy-informed-v1-action-2",
        description: "[run-check] Compare configured retry interval with observed delivery timing. Expected evidence: The effective retry interval and event timestamps.",
        hypothesisIds: ["b5-taxonomy-informed-v1-hypothesis-1", "b5-taxonomy-informed-v1-hypothesis-2"],
      },
    ]);
    expect(result.relationships).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("confidence");
    expect(result).not.toHaveProperty("disposition");
  });

  it("does not turn free-text missing evidence into synthetic catalog requirements", async () => {
    const input = hybridReasoningInput();
    const fetch = vi.fn(async (_url: string, init: { body: string }) => {
      const semanticInput = requestSemanticInput(init.body);
      return {
        ok: true,
        status: 200,
        text: async () => responseFor(validB5Output(semanticInput, "Ask the operator to compare the queue timestamps.")),
      };
    });

    const result = await createAdapter(fetch).reason(input);

    expect(result.evidenceRequirements).toEqual([]);
    expect(result.hypotheses[0]).not.toHaveProperty("evidenceRequirementIds");
  });

  it("rejects diagnosis mode before invoking the B5 reasoning provider", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => responseFor({}) }));
    const provider = createAdapter(fetch);

    await expect(provider.reason(hybridReasoningInput(taxonomyInformedSemanticInput(), "diagnosis")))
      .rejects.toMatchObject({ code: "UNSUPPORTED_MODE" } satisfies Partial<HybridReasoningProviderError>);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps malformed B5 schema output to the safe invalid-output provider failure", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => responseFor({ candidateAssessments: [] }) }));

    await expect(createAdapter(fetch).reason(hybridReasoningInput()))
      .rejects.toMatchObject({ code: "INVALID_OUTPUT" } satisfies Partial<HybridReasoningProviderError>);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("maps transport failures to a bounded unavailable provider failure", async () => {
    const fetch = vi.fn(async () => { throw new Error("raw network secret"); });

    await expect(createAdapter(fetch).reason(hybridReasoningInput()))
      .rejects.toMatchObject({ code: "UNAVAILABLE" } satisfies Partial<HybridReasoningProviderError>);
  });

  it("exposes the taxonomy-informed contract identity used by H5a", () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => responseFor({}) }));

    expect(createAdapter(fetch).semanticContractId).toBe("b5-taxonomy-informed-v1");
  });
});
