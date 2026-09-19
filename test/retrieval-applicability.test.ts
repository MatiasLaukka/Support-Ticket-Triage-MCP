import { describe, expect, it, vi } from "vitest";

import {
  APPLICABILITY_CONTRACT_VERSION,
  APPLICABILITY_PROMPT_VERSION,
  ApplicabilityProviderUnavailableError,
  hashCanonicalApplicabilityValue,
  validateApplicabilityInput,
  validateApplicabilityProviderOutput,
} from "../src/retrieval/applicability-types.js";
import type {
  ApplicabilityProviderFailureReason,
  ApplicabilityProviderOutput,
  ApplicabilityReasoningInput,
  ApplicabilityReasoningProvider,
} from "../src/retrieval/applicability-types.js";
import type { ApplicabilityInputMeasurement } from "../src/retrieval/applicability-evidence.js";
import { assessApplicabilityCase } from "../src/retrieval/applicability.js";

const hash = (character: string): string => character.repeat(64);

function validApplicabilityInput(lane: "evidence-only" | "taxonomy-informed"): ApplicabilityReasoningInput {
  const input = {
    contractVersion: APPLICABILITY_CONTRACT_VERSION,
    lane,
    case: {
      caseId: "B5-CASE-1",
      problemStatement: "The campaign editor remains blank after a chunk loading error.",
      observedFacts: [{ id: "fact:chunkload", statement: "A ChunkLoadError was observed." }],
      conversationState: [{ id: "state:waiting", statement: "The requester is waiting for investigation steps." }],
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
        references: [{ resourceKey: "knowledge-article:performance-troubleshooting", channel: "deterministic-reference", sourceId: "performance-troubleshooting", reason: "classifier-association" }],
      },
    }, {
      resourceKey: "known-cause:reference-only",
      resourceType: "known-cause",
      sourceId: "reference-only",
      contentHash: hash("b"),
      evidence: {
        status: "unavailable",
        reasons: ["representation-unavailable"],
        references: [{ resourceKey: "known-cause:reference-only", channel: "known-cause-reference", sourceId: "reference-only", reason: "known-cause-link" }],
      },
    }],
    evidenceRegistry: [{
      id: "representation:performance:section:1",
      resourceKey: "knowledge-article:performance-troubleshooting",
      kind: "section",
      title: "Performance troubleshooting",
      heading: "Chunk loading",
      contentHash: hash("a"),
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
          basis: { source: "customer-evidence", evidenceIds: ["fact:chunkload"], knowledgeArticleIds: [], playbookIds: [], knownCauseIds: [], explanation: "The observed editor error supports a campaign context." },
        },
        candidateMetadata: [{ resourceKey: "knowledge-article:performance-troubleshooting", taxonomy: { productSurfaces: ["messaging/campaigns"], problemClasses: ["defect"] } }],
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

function validProviderOutput(input: ApplicabilityReasoningInput): ApplicabilityProviderOutput {
  return {
    candidateAssessments: input.candidates
      .filter((candidate) => candidate.evidence.status === "available")
      .map((candidate) => ({
        resourceKey: candidate.resourceKey,
        verdict: "applicable-next-step" as const,
        supportingEvidence: [{ kind: "case-fact" as const, id: "fact:chunkload" }],
        contradictingEvidence: [],
        missingEvidence: [],
        explanation: "The resource gives a bounded next investigation step for the observed error.",
        ...(input.lane === "taxonomy-informed" ? { taxonomyRelation: "supports" as const } : {}),
      })),
    synthesis: {
      disposition: "hypothesis" as const,
      summary: "The editor investigation path is supported by the observed chunk loading error.",
      supportingCandidateKeys: ["knowledge-article:performance-troubleshooting"],
      supportingEvidence: [{ kind: "case-fact" as const, id: "fact:chunkload" }],
      alternatives: [],
      discriminatingQuestions: [],
    },
  } as ApplicabilityProviderOutput;
}

describe("B5 applicability contracts", () => {
  it("validates canonical identities and the four closed verdicts", () => {
    const input = validApplicabilityInput("evidence-only");
    expect(input.identity.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(["applicable-next-step", "contradicted", "insufficient-evidence", "irrelevant"]).toHaveLength(4);
    const output = validProviderOutput(input);
    (output.candidateAssessments[0] as Record<string, unknown>).verdict = "unsupported";
    expect(() => validateApplicabilityProviderOutput(input, output)).toThrow();
  });

  it("keeps evidence-only input free of all taxonomy fields", () => {
    const input = validApplicabilityInput("evidence-only");
    expect(JSON.stringify(input)).not.toContain("taxonomy");
  });

  it("requires canonical candidates and unique stable fact, candidate, and representation identities", () => {
    const input = validApplicabilityInput("evidence-only");
    expect(input.candidates.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:performance-troubleshooting",
      "known-cause:reference-only",
    ]);
    const duplicate = structuredClone(input);
    duplicate.case.observedFacts.push({ ...duplicate.case.observedFacts[0]! });
    expect(() => validateApplicabilityInput(duplicate)).toThrow(/unique/i);
  });

  it("rejects strict unknown fields at nested contract levels", () => {
    const input = validApplicabilityInput("evidence-only");
    (input.candidates[0]!.evidence as Record<string, unknown>).unknown = true;
    expect(() => validateApplicabilityInput(input)).toThrow(/unknown|unrecognized/i);
  });

  it("keeps frozen resource and representation hashes independently bound", () => {
    const input = validApplicabilityInput("evidence-only");
    input.evidenceRegistry[0]!.contentHash = hash("9");

    expect(() => validateApplicabilityInput(input)).not.toThrow();
  });

  it("accepts a taxonomy-informed canonical taxonomy context", () => {
    const input = validApplicabilityInput("taxonomy-informed");
    if (input.lane !== "taxonomy-informed") throw new Error("Expected taxonomy-informed input.");
    expect(input.taxonomy.case.primaryProductSurface).toEqual({ domain: "messaging", area: "campaigns" });
  });

  it("rejects a provider response that omits an assessable candidate", () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.candidateAssessments = [];

    expect(() => validateApplicabilityProviderOutput(input, output))
      .toThrow(/every assessable candidate/i);
  });

  it("rejects unknown, duplicate, and unresolved provider references", () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.candidateAssessments[0]!.resourceKey = "knowledge-article:unknown";
    expect(() => validateApplicabilityProviderOutput(input, output)).toThrow();

    const duplicate = validProviderOutput(input);
    duplicate.candidateAssessments.push(structuredClone(duplicate.candidateAssessments[0]!));
    expect(() => validateApplicabilityProviderOutput(input, duplicate)).toThrow();

    const unresolved = validProviderOutput(input);
    unresolved.candidateAssessments[0]!.supportingEvidence = [{ kind: "case-fact", id: "fact:unknown" }];
    expect(() => validateApplicabilityProviderOutput(input, unresolved)).toThrow(/evidence/i);
  });

  it("requires abstention without an applicable-next-step candidate", () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.candidateAssessments[0]!.verdict = "insufficient-evidence";
    expect(() => validateApplicabilityProviderOutput(input, output)).toThrow(/abstain/i);
  });

  it("rejects contradicted or irrelevant hypothesis support and unqualified insufficient evidence", () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.candidateAssessments[0]!.verdict = "contradicted";
    expect(() => validateApplicabilityProviderOutput(input, output)).toThrow(/abstain/i);

    const alternative = validProviderOutput(input);
    alternative.candidateAssessments[0]!.verdict = "insufficient-evidence";
    alternative.candidateAssessments[0]!.missingEvidence = [{ item: "The browser console trace is still required.", evidence: [] }];
    alternative.synthesis = { disposition: "abstain", summary: "No candidate is yet supported as a next step.", coverageGaps: ["A browser console trace is required."], alternatives: [], discriminatingQuestions: [] };
    (alternative.synthesis as Extract<ApplicabilityProviderOutput["synthesis"], { disposition: "abstain" }>).alternatives = [{ summary: "A plausible alternative.", candidateKeys: ["knowledge-article:performance-troubleshooting"], evidence: [], qualified: false }];
    expect(() => validateApplicabilityProviderOutput(input, alternative)).toThrow(/qualified/i);
  });

  it("requires every insufficient-evidence assessment to appear as a qualified alternative", () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.candidateAssessments[0]!.verdict = "insufficient-evidence";
    output.candidateAssessments[0]!.missingEvidence = [{ item: "A browser console trace is required.", evidence: [] }];
    output.synthesis = { disposition: "abstain", summary: "No candidate is yet supported as a next step.", coverageGaps: ["A browser console trace is required."], alternatives: [], discriminatingQuestions: [] };

    expect(() => validateApplicabilityProviderOutput(input, output)).toThrow(/insufficient-evidence.*alternative/i);
  });

  it("requires taxonomyRelation only in the taxonomy-informed lane", () => {
    const evidenceOnly = validApplicabilityInput("evidence-only");
    const evidenceOnlyOutput = validProviderOutput(evidenceOnly);
    (evidenceOnlyOutput.candidateAssessments[0] as Record<string, unknown>).taxonomyRelation = "supports";
    expect(() => validateApplicabilityProviderOutput(evidenceOnly, evidenceOnlyOutput)).toThrow(/taxonomyRelation/i);

    const taxonomy = validApplicabilityInput("taxonomy-informed");
    const taxonomyOutput = validProviderOutput(taxonomy);
    delete (taxonomyOutput.candidateAssessments[0] as Partial<{ taxonomyRelation: string }>).taxonomyRelation;
    expect(() => validateApplicabilityProviderOutput(taxonomy, taxonomyOutput)).toThrow(/taxonomyRelation/i);
  });

  it("hashes input permutations with canonical object keys and candidate ordering", () => {
    const first = validApplicabilityInput("evidence-only");
    const second = structuredClone(first);
    second.candidates.reverse();
    second.evidenceRegistry.reverse();
    expect(hashCanonicalApplicabilityValue(first)).toBe(hashCanonicalApplicabilityValue(second));
  });

  it("canonicalizes every semantic taxonomy set and matched channel order", () => {
    const canonical = validApplicabilityInput("taxonomy-informed");
    if (canonical.lane !== "taxonomy-informed") throw new Error("Expected taxonomy-informed input.");
    canonical.evidenceRegistry[0]!.matchedChannels = ["lexical", "semantic"];
    canonical.taxonomy.case.secondaryProductSurfaces = [
      { domain: "automation", area: "flows" },
      { domain: "messaging", area: "email" },
    ];
    canonical.taxonomy.case.problemClasses = ["defect", "security"];
    canonical.taxonomy.case.basis.evidenceIds = ["fact:chunkload", "state:waiting"];
    canonical.taxonomy.case.basis.knowledgeArticleIds = ["knowledge-b", "knowledge-a"];
    canonical.taxonomy.case.basis.playbookIds = ["playbook-b", "playbook-a"];
    canonical.taxonomy.case.basis.knownCauseIds = ["cause-b", "cause-a"];
    canonical.taxonomy.candidateMetadata = [
      { resourceKey: "knowledge-article:performance-troubleshooting", taxonomy: { productSurfaces: ["messaging/campaigns", "automation/flows"], problemClasses: ["defect", "security"] } },
      { resourceKey: "known-cause:reference-only", taxonomy: { productSurfaces: ["security/audit-log", "messaging/campaigns"], problemClasses: ["security", "defect"] } },
    ];

    const permuted = structuredClone(canonical);
    if (permuted.lane !== "taxonomy-informed") throw new Error("Expected taxonomy-informed input.");
    permuted.evidenceRegistry[0]!.matchedChannels.reverse();
    permuted.taxonomy.case.secondaryProductSurfaces.reverse();
    permuted.taxonomy.case.problemClasses.reverse();
    permuted.taxonomy.case.basis.evidenceIds.reverse();
    permuted.taxonomy.case.basis.knowledgeArticleIds.reverse();
    permuted.taxonomy.case.basis.playbookIds.reverse();
    permuted.taxonomy.case.basis.knownCauseIds.reverse();
    permuted.taxonomy.candidateMetadata.reverse();
    for (const metadata of permuted.taxonomy.candidateMetadata) {
      metadata.taxonomy?.productSurfaces.reverse();
      metadata.taxonomy?.problemClasses.reverse();
    }

    expect(() => validateApplicabilityInput(permuted)).not.toThrow();
    expect(hashCanonicalApplicabilityValue(permuted)).toBe(hashCanonicalApplicabilityValue(canonical));
  });
});

describe("B5 applicability orchestration", () => {
  function validMeasurement(
    fits: boolean | null = true,
  ): ApplicabilityInputMeasurement {
    return {
      serializedBytes: 1_000,
      estimatedInputTokens: 500,
      outputReserveTokens: 4_096,
      minimumContextTokens: 4_596,
      contextLimitTokens: fits === null ? null : fits ? 8_192 : 4_000,
      fits,
    };
  }

  function providerReturning(
    input: ApplicabilityReasoningInput,
  ): ApplicabilityReasoningProvider {
    return {
      assess: vi.fn(async () => ({
        output: validProviderOutput(input),
        telemetry: {
          providerKind: "controlled-test" as const,
          model: "controlled-test",
          latencyMs: 1,
        },
      })),
    };
  }

  it("calls the provider exactly once for a complete assessment", async () => {
    const input = validApplicabilityInput("evidence-only");
    input.candidates = [input.candidates[0]!];

    const provider = providerReturning(input);

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(),
      promptInjectionDetected: false,
    });

    expect(provider.assess).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("complete");
  });

  it("returns partial-assessment when unavailable candidates coexist with valid assessments", async () => {
    const input = validApplicabilityInput("evidence-only");
    const provider = providerReturning(input);

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(),
      promptInjectionDetected: false,
    });

    expect(provider.assess).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "partial-assessment",
      unavailableCandidates: [{
        resourceKey: "known-cause:reference-only",
        reasons: ["representation-unavailable"],
      }],
    });

    if (result.status !== "partial-assessment") {
      throw new Error("Expected a partial assessment.");
    }

    expect(
      result.assessments.some(
        ({ resourceKey }) => resourceKey === "known-cause:reference-only",
      ),
    ).toBe(false);
  });

  it("skips without a provider call when no candidate is assessable", async () => {
    const input = validApplicabilityInput("evidence-only");

    input.candidates[0]!.evidence = {
      status: "unavailable",
      reasons: ["representation-unavailable"],
      references: input.candidates[0]!.evidence.references,
    };

    const provider = providerReturning(input);

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(),
      promptInjectionDetected: false,
    });

    expect(provider.assess).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "assessment-skipped",
      reason: "no-assessable-candidates",
    });
  });

  it("skips prompt injection without a provider call", async () => {
    const input = validApplicabilityInput("evidence-only");
    const provider = providerReturning(input);

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(),
      promptInjectionDetected: true,
    });

    expect(provider.assess).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "assessment-skipped",
      reason: "prompt-injection-detected",
    });
  });

  it("does not call a provider when complete input exceeds the declared budget", async () => {
    const input = validApplicabilityInput("evidence-only");
    const provider = providerReturning(input);

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(false),
      promptInjectionDetected: false,
    });

    expect(provider.assess).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "assessment-skipped",
      reason: "input-too-large",
    });
  });

  it.each([
    "not-configured",
    "transport",
    "http",
    "response-body",
    "timeout",
    "context-exhausted",
  ] satisfies ApplicabilityProviderFailureReason[])(
    "maps provider failure %s to a bounded assessment-failed result",
    async (reason) => {
      const input = validApplicabilityInput("evidence-only");

      const provider: ApplicabilityReasoningProvider = {
        assess: vi.fn(async () => {
          throw new ApplicabilityProviderUnavailableError(reason);
        }),
      };

      const result = await assessApplicabilityCase({
        input,
        provider,
        measurement: validMeasurement(),
        promptInjectionDetected: false,
      });

      expect(provider.assess).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: "assessment-failed",
        reason,
      });
    },
  );

  it("maps invalid provider output to invalid-provider-output without retry", async () => {
    const input = validApplicabilityInput("evidence-only");

    const invalid = validProviderOutput(input);
    invalid.candidateAssessments = [];

    const provider: ApplicabilityReasoningProvider = {
      assess: vi.fn(async () => ({
        output: invalid,
        telemetry: {
          providerKind: "controlled-test" as const,
          model: "controlled-test",
          latencyMs: 1,
        },
      })),
    };

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(),
      promptInjectionDetected: false,
    });

    expect(provider.assess).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "assessment-failed",
      reason: "invalid-provider-output",
    });
  });

  it("enforces synthesis consistency after provider output", async () => {
    const input = validApplicabilityInput("evidence-only");

    const invalid = validProviderOutput(input);
    invalid.candidateAssessments[0]!.verdict = "irrelevant";

    const provider: ApplicabilityReasoningProvider = {
      assess: vi.fn(async () => ({
        output: invalid,
        telemetry: {
          providerKind: "controlled-test" as const,
          model: "controlled-test",
          latencyMs: 1,
        },
      })),
    };

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(),
      promptInjectionDetected: false,
    });

    expect(provider.assess).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "assessment-failed",
      reason: "invalid-provider-output",
    });
  });

  it("propagates unexpected programming errors and does not retry", async () => {
    const input = validApplicabilityInput("evidence-only");
    const unexpected = new Error("programming failure");

    const provider: ApplicabilityReasoningProvider = {
      assess: vi.fn(async () => {
        throw unexpected;
      }),
    };

    await expect(
      assessApplicabilityCase({
        input,
        provider,
        measurement: validMeasurement(),
        promptInjectionDetected: false,
      }),
    ).rejects.toBe(unexpected);

    expect(provider.assess).toHaveBeenCalledTimes(1);
  });
});
