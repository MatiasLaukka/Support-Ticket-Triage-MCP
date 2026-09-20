import { describe, expect, it, vi } from "vitest";

import {
  APPLICABILITY_PROMPT_HASH,
  APPLICABILITY_REASONING_INSTRUCTIONS,
  createApplicabilityReasoningProviderFromEnv,
  OpenAiApplicabilityReasoningProvider,
} from "../src/applicability-reasoning-provider.js";
import {
  APPLICABILITY_CONTRACT_VERSION,
  APPLICABILITY_PROMPT_VERSION,
  ApplicabilityProviderUnavailableError,
  InvalidApplicabilitySchemaError,
  validateApplicabilityInput,
  type ApplicabilityProviderOutput,
  type ApplicabilityReasoningInput,
} from "../src/retrieval/applicability-types.js";

const hash = (character: string): string => character.repeat(64);

function validInput(lane: "evidence-only" | "taxonomy-informed"): ApplicabilityReasoningInput {
  const input = {
    contractVersion: APPLICABILITY_CONTRACT_VERSION,
    lane,
    case: {
      caseId: "B5-CASE-PROVIDER",
      problemStatement: "The campaign editor remains blank after a chunk loading error.",
      observedFacts: [{ id: "fact:chunkload", statement: "A ChunkLoadError was observed." }],
      conversationState: [{ id: "state:waiting", statement: "Investigation steps are still required." }],
    },
    candidates: [{
      resourceKey: "knowledge-article:performance-troubleshooting",
      resourceType: "knowledge-article",
      sourceId: "performance-troubleshooting",
      sourceVersion: "v1",
      contentHash: hash("a"),
      evidence: {
        status: "available",
        representationIds: ["representation:performance:section:1"],
        matchedRepresentationIds: ["representation:performance:section:1"],
        references: [{
          resourceKey: "knowledge-article:performance-troubleshooting",
          channel: "deterministic-reference",
          sourceId: "performance-troubleshooting",
          reason: "classifier-association",
        }],
      },
    }, {
      resourceKey: "known-cause:reference-only",
      resourceType: "known-cause",
      sourceId: "reference-only",
      contentHash: hash("b"),
      evidence: {
        status: "unavailable",
        reasons: ["representation-unavailable"],
        references: [{
          resourceKey: "known-cause:reference-only",
          channel: "known-cause-reference",
          sourceId: "reference-only",
          reason: "known-cause-link",
        }],
      },
    }],
    evidenceRegistry: [{
      id: "representation:performance:section:1",
      resourceKey: "knowledge-article:performance-troubleshooting",
      kind: "section",
      title: "Performance troubleshooting",
      heading: "Chunk loading",
      contentHash: hash("9"),
      evidenceOrigin: "matched",
      matchedChannels: ["lexical"],
      text: "Compare the browser error and isolation controls before selecting a cause.",
    }],
    ...(lane === "taxonomy-informed" ? {
      taxonomy: {
        case: {
          primaryProductSurface: { domain: "messaging", area: "campaigns" },
          secondaryProductSurfaces: [],
          problemClasses: ["defect"],
          support: { productSurface: "supported", problemClass: "tentative" },
          basis: {
            source: "customer-evidence",
            evidenceIds: ["fact:chunkload"],
            knowledgeArticleIds: [],
            playbookIds: [],
            knownCauseIds: [],
            explanation: "The observed editor error supports a campaign context.",
          },
        },
        candidateMetadata: [{
          resourceKey: "knowledge-article:performance-troubleshooting",
          taxonomy: { productSurfaces: ["messaging/campaigns"], problemClasses: ["defect"] },
        }],
      },
    } : {}),
    identity: {
      contractVersion: APPLICABILITY_CONTRACT_VERSION,
      promptVersion: APPLICABILITY_PROMPT_VERSION,
      b4CaptureHash: hash("c"),
      b4CaseInputHash: hash("d"),
      caseSetHash: hash("e"),
      oracleHash: hash("f"),
      corpusHash: hash("0"),
      indexGeneration: 7,
      lexicalGeneration: 7,
      semanticGeneration: 7,
      representationVersion: 3,
      candidateSnapshotHash: hash("1"),
      evidenceRegistryHash: hash("2"),
      safeCaseHash: hash("3"),
      ...(lane === "taxonomy-informed" ? { taxonomyHash: hash("4") } : {}),
      inputHash: hash("5"),
    },
  };

  validateApplicabilityInput(input);
  return input as ApplicabilityReasoningInput;
}

function validOutput(input: ApplicabilityReasoningInput): ApplicabilityProviderOutput {
  return {
    candidateAssessments: [{
      resourceKey: "knowledge-article:performance-troubleshooting",
      verdict: "applicable-next-step",
      supportingEvidence: [{ kind: "case-fact", id: "fact:chunkload" }],
      contradictingEvidence: [],
      missingEvidence: [],
      explanation: "The resource gives a bounded next investigation step for the observed error.",
      ...(input.lane === "taxonomy-informed" ? { taxonomyRelation: "supports" as const } : {}),
    }],
    synthesis: {
      disposition: "hypothesis",
      leadingHypothesis: {
        kind: "candidate-grounded",
        summary: "A campaign-editor loading path is the leading investigation hypothesis.",
        candidateKeys: ["knowledge-article:performance-troubleshooting"],
        evidence: [{ kind: "case-fact", id: "fact:chunkload" }],
        missingEvidence: [],
      },
      alternatives: [],
      nextEvidenceActions: [{
        actionType: "inspect-internal",
        action: "Inspect the first loading error and compare the affected session with an isolated session.",
        expectedEvidence: "An aligned loading trace and isolation comparison for the same campaign.",
        hypothesisRanks: [0],
      }],
    },
  };
}

function responseBody(input: ApplicabilityReasoningInput, usage = false): string {
  return JSON.stringify({
    output: [{
      content: [{ type: "output_text", text: JSON.stringify(validOutput(input)) }],
    }],
    ...(usage ? {
      usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 },
    } : {}),
  });
}

function parseProviderInput(value: string): unknown {
  const lines = value.split("\n");
  expect(lines[0]).toBe("BEGIN_UNTRUSTED_APPLICABILITY_EVIDENCE");
  expect(lines.at(-1)).toBe("END_UNTRUSTED_APPLICABILITY_EVIDENCE");
  return JSON.parse(lines.slice(1, -1).join("\n"));
}

describe("OpenAiApplicabilityReasoningProvider", () => {
  it("requires explicit enabled configuration and does not read credentials while disabled", () => {
    const unreadableEnv = new Proxy({}, {
      get() { throw new Error("credentials were read"); },
    }) as NodeJS.ProcessEnv;

    expect(createApplicabilityReasoningProviderFromEnv(unreadableEnv, {
      enabled: false,
      model: undefined,
      timeoutMs: 20_000,
      maxOutputTokens: 4_096,
    })).toBeUndefined();

    expect(() => createApplicabilityReasoningProviderFromEnv({}, {
      enabled: true,
      model: "gpt-test",
      timeoutMs: 20_000,
      maxOutputTokens: 4_096,
    })).toThrow(/OPENAI_API_KEY/);

    expect(() => createApplicabilityReasoningProviderFromEnv({ OPENAI_API_KEY: "sk-test" }, {
      enabled: true,
      model: undefined,
      timeoutMs: 20_000,
      maxOutputTokens: 4_096,
    })).toThrow(/explicit.*model/i);
  });

  it("rejects invalid timeout, output limit, and base URL configuration", () => {
    const env = { OPENAI_API_KEY: "sk-test" };
    expect(() => createApplicabilityReasoningProviderFromEnv(env, {
      enabled: true, model: "gpt-test", timeoutMs: 0, maxOutputTokens: 4_096,
    })).toThrow(/timeoutMs.*positive integer/);
    expect(() => createApplicabilityReasoningProviderFromEnv(env, {
      enabled: true, model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: -1,
    })).toThrow(/maxOutputTokens.*positive integer/);
    expect(() => createApplicabilityReasoningProviderFromEnv({ ...env, TRIAGE_OPENAI_BASE_URL: "not a url" }, {
      enabled: true, model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: 4_096,
    })).toThrow(/valid absolute URL/);
  });

  it("requires falsifiable best-first hypotheses instead of generic troubleshooting labels", () => {
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/falsifiable explanatory claim|bounded mechanism/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/known-cause candidate.*may lead.*insufficient-evidence/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/candidate assessments are the authoritative source of missing evidence/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/playbooks and articles.*evidence collection/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/do not ask the requester to restate the problem/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/hypothesisRanks is zero-based.*rank 0 is the leading hypothesis/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/at least one next evidence action.*contains 0/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/rank must not repeat within one action/i);
  });

  it("uses one stateless Responses API call with strict dynamic schema", async () => {
    const input = validInput("evidence-only");
    const fetch = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 200, text: async () => responseBody(input) }));
    const provider = new OpenAiApplicabilityReasoningProvider({
      apiKey: "sk-test", model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: 4_096, fetch,
    });

    await provider.assess(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("https://api.openai.com/v1/responses");

    const request = JSON.parse((fetch.mock.calls[0]![1] as { body: string }).body);
    expect(request).toMatchObject({
      model: "gpt-test",
      store: false,
      max_output_tokens: 4_096,
      text: { format: { type: "json_schema", name: "b5_applicability", strict: true } },
    });
    expect(request).not.toHaveProperty("previous_response_id");

    const serializedSchema = JSON.stringify(request.text.format.schema);
    expect(serializedSchema).not.toContain('"uniqueItems"');
    expect(serializedSchema).not.toContain('"minLength"');
    expect(serializedSchema).not.toContain('"maxLength"');
    expect(serializedSchema).toContain('"pattern"');

    const assessment = request.text.format.schema.properties.candidateAssessments;
    expect(assessment.minItems).toBe(1);
    expect(assessment.maxItems).toBe(1);
    expect(assessment.items.anyOf).toHaveLength(1);
    const scopedAssessment = assessment.items.anyOf[0];
    expect(scopedAssessment.properties.resourceKey.enum).toEqual([
      input.candidates.find((candidate) => candidate.evidence.status === "available")!.resourceKey,
    ]);
    const expectedRepresentationIds = input.candidates.find((candidate) => candidate.evidence.status === "available")!.evidence;
    if (expectedRepresentationIds.status !== "available") throw new Error("Expected available candidate.");
    expect(scopedAssessment.properties.supportingEvidence.items.anyOf[1].properties.id.enum)
      .toEqual(expectedRepresentationIds.representationIds);

    const candidateGrounded = request.text.format.schema.properties.synthesis.anyOf[0]
      .properties.leadingHypothesis.anyOf[0];
    expect(candidateGrounded.properties).not.toHaveProperty("missingEvidence");
    expect(candidateGrounded.required).not.toContain("missingEvidence");
    expect(assessment.items.anyOf[0].properties.resourceKey.enum).toEqual([
      "knowledge-article:performance-troubleshooting",
    ]);
    expect(assessment.items.anyOf[0].properties).not.toHaveProperty("taxonomyRelation");
    const synthesis = request.text.format.schema.properties.synthesis;
    const hypothesis = synthesis.anyOf.find((item: { properties?: { disposition?: { enum?: string[] } } }) => item.properties?.disposition?.enum?.includes("hypothesis"));
    expect(hypothesis.properties).toHaveProperty("leadingHypothesis");
    expect(hypothesis.properties).toHaveProperty("alternatives");
    expect(hypothesis.properties).toHaveProperty("nextEvidenceActions");
    expect(hypothesis.properties).not.toHaveProperty("discriminatingQuestions");
  });

  it("uses only the blind evidence projection and explicit untrusted-data delimiters", async () => {
    const input = validInput("evidence-only");
    const fetch = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 200, text: async () => responseBody(input) }));
    await new OpenAiApplicabilityReasoningProvider({
      apiKey: "sk-test", model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: 4_096, fetch,
    }).assess(input);

    const request = JSON.parse((fetch.mock.calls[0]![1] as { body: string }).body);
    const projected = parseProviderInput(request.input) as Record<string, unknown>;
    expect(projected).not.toHaveProperty("taxonomy");
    const serialized = JSON.stringify(projected);
    for (const forbidden of [
      "deterministicDiagnosis", "causeFamily", "recommendation", "selectedKnowledgeArticleIds",
      "customer", "requester", "ticketId", "priorProviderResult", "previous_response_id",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("adds only the approved taxonomy projection in the taxonomy-informed lane", async () => {
    const input = validInput("taxonomy-informed");
    const fetch = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 200, text: async () => responseBody(input) }));
    await new OpenAiApplicabilityReasoningProvider({
      apiKey: "sk-test", model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: 4_096, fetch,
    }).assess(input);

    const request = JSON.parse((fetch.mock.calls[0]![1] as { body: string }).body);
    const projected = parseProviderInput(request.input) as ApplicabilityReasoningInput;
    if (input.lane !== "taxonomy-informed" || projected.lane !== "taxonomy-informed") throw new Error("Expected taxonomy lane.");
    expect(projected.taxonomy).toEqual(input.taxonomy);

    const assessment = request.text.format.schema.properties.candidateAssessments.items.anyOf[0];
    expect(assessment.properties.taxonomyRelation.enum).toEqual(["supports", "conflicts", "neutral", "unavailable"]);
    expect(assessment.required).toContain("taxonomyRelation");
  });

  it("normalizes an explicitly configured OpenAI-compatible base URL without fallback", async () => {
    const input = validInput("evidence-only");
    const fetch = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 200, text: async () => responseBody(input) }));
    await new OpenAiApplicabilityReasoningProvider({
      apiKey: "local-key", model: "local-model", timeoutMs: 20_000, maxOutputTokens: 4_096,
      baseUrl: "http://localhost:11434/v1/", fetch,
    }).assess(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("http://localhost:11434/v1/responses");
  });

  it("maps transport, HTTP, response-body, and timeout failures to bounded reasons without retry", async () => {
    const input = validInput("evidence-only");
    const cases = [
      {
        reason: "transport",
        fetch: vi.fn(async () => { throw new Error("secret transport detail"); }),
      },
      {
        reason: "http",
        fetch: vi.fn(async () => ({ ok: false, status: 502, text: async () => "secret body" })),
      },
      {
        reason: "response-body",
        fetch: vi.fn(async () => ({ ok: true, status: 200, text: async () => { throw new Error("secret body"); } })),
      },
    ] as const;

    for (const item of cases) {
      const error = await new OpenAiApplicabilityReasoningProvider({
        apiKey: "sk-test", model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: 4_096, fetch: item.fetch,
      }).assess(input).catch((caught) => caught);
      expect(error).toBeInstanceOf(ApplicabilityProviderUnavailableError);
      expect(error).toMatchObject({ reason: item.reason });
      expect((error as Error).message).not.toMatch(/secret|sk-test/);
      expect(item.fetch).toHaveBeenCalledTimes(1);
    }

    const timeoutFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => await new Promise<string>((resolve) => setTimeout(() => resolve(responseBody(input)), 40)),
    }));
    const timeoutError = await new OpenAiApplicabilityReasoningProvider({
      apiKey: "sk-test", model: "gpt-test", timeoutMs: 5, maxOutputTokens: 4_096, fetch: timeoutFetch,
    }).assess(input).catch((caught) => caught);
    expect(timeoutError).toMatchObject({ name: "ApplicabilityProviderUnavailableError", reason: "timeout" });
    expect(timeoutFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed envelopes, malformed JSON, and invalid provider fields without leaking content", async () => {
    const input = validInput("evidence-only");
    const invalidOutput = validOutput(input) as Record<string, unknown>;
    invalidOutput.secretUnexpectedField = "provider-secret";
    const bodies = [
      "{",
      JSON.stringify({ output: [] }),
      JSON.stringify({ output: [{ content: [{ type: "output_text", text: "{" }] }] }),
      JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(invalidOutput) }] }] }),
    ];

    for (const body of bodies) {
      const error = await new OpenAiApplicabilityReasoningProvider({
        apiKey: "sk-test", model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: 4_096,
        fetch: async () => ({ ok: true, status: 200, text: async () => body }),
      }).assess(input).catch((caught) => caught);
      expect(error).toBeInstanceOf(InvalidApplicabilitySchemaError);
      expect((error as Error).message).not.toMatch(/provider-secret|sk-test/);
    }
  });

  it("returns bounded telemetry and valid usage without retaining the raw envelope", async () => {
    const input = validInput("evidence-only");
    const fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => responseBody(input, true) }));
    const times = [1_000, 1_125];
    const result = await new OpenAiApplicabilityReasoningProvider({
      apiKey: "sk-test", model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: 4_096,
      fetch, now: () => times.shift()!,
    }).assess(input);
    expect(result.telemetry).toEqual({
      providerKind: "openai-responses",
      model: "gpt-test",
      latencyMs: 125,
      usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 },
    });
    expect(result).not.toHaveProperty("rawResponse");
  });

  it("propagates unexpected local serialization errors before fetch", async () => {
    const input = validInput("evidence-only");
    const fetch = vi.fn();
    const unexpected = new Error("local serialization failed");
    const stringify = vi.spyOn(JSON, "stringify").mockImplementationOnce(() => { throw unexpected; });
    try {
      await expect(new OpenAiApplicabilityReasoningProvider({
        apiKey: "sk-test", model: "gpt-test", timeoutMs: 20_000, maxOutputTokens: 4_096, fetch,
      }).assess(input)).rejects.toBe(unexpected);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  });

  it("exports a stable hashed prompt that states the evidence-safety boundary", () => {
    expect(APPLICABILITY_PROMPT_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/untrusted evidence data/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/not a confirmed cause/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/taxonomy is advisory/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/leading diagnostic hypothesis/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/novel hypothesis/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/concrete next evidence actions/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/do not ask the requester to restate the problem/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/hypothesisRanks is zero-based.*rank 0 is the leading hypothesis/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/at least one next evidence action.*contains 0/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/rank must not repeat within one action/i);
    expect(APPLICABILITY_REASONING_INSTRUCTIONS).toMatch(/do not infer lifecycle, recommendation, routing, remediation execution/i);
  });
});
