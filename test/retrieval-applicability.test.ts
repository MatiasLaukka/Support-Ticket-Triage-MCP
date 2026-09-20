import { describe, expect, it, vi } from "vitest";

import {
  APPLICABILITY_CONTRACT_VERSION,
  APPLICABILITY_PROMPT_VERSION,
  hashCanonicalApplicabilityValue,
  validateApplicabilityInput,
  validateApplicabilityProviderOutput,
} from "../src/retrieval/applicability-types.js";
import type { ApplicabilityProviderOutput, ApplicabilityReasoningInput } from "../src/retrieval/applicability-types.js";
import { ApplicabilityProviderUnavailableError } from "../src/retrieval/applicability-types.js";
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
      leadingHypothesis: {
        kind: "candidate-grounded" as const,
        summary: "A campaign-editor loading path is the leading investigation hypothesis.",
        candidateKeys: ["knowledge-article:performance-troubleshooting"],
        evidence: [{ kind: "case-fact" as const, id: "fact:chunkload" }],
        missingEvidence: [],
      },
      alternatives: [],
      nextEvidenceActions: [{
        actionType: "inspect-internal" as const,
        action: "Inspect the first loading error and compare the affected session with an isolated session.",
        expectedEvidence: "An aligned loading trace and isolation comparison for the same campaign.",
        hypothesisRanks: [0],
      }],
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

  it("allows an insufficient-evidence candidate to lead when its missing evidence is preserved", () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    const missing = { item: "The browser console trace is still required.", evidence: [] };
    output.candidateAssessments[0]!.verdict = "insufficient-evidence";
    output.candidateAssessments[0]!.missingEvidence = [missing];
    if (output.synthesis.disposition !== "hypothesis" || output.synthesis.leadingHypothesis.kind !== "candidate-grounded") throw new Error("Expected candidate-grounded hypothesis.");
    output.synthesis.leadingHypothesis.missingEvidence = [missing];

    expect(() => validateApplicabilityProviderOutput(input, output)).not.toThrow();
  });

  it("rejects contradicted or irrelevant candidates as grounded hypotheses and enforces evidence polarity", () => {
    const input = validApplicabilityInput("evidence-only");
    const contradicted = validProviderOutput(input);
    contradicted.candidateAssessments[0]!.verdict = "contradicted";
    contradicted.candidateAssessments[0]!.contradictingEvidence = [{ kind: "case-fact", id: "fact:chunkload" }];
    contradicted.candidateAssessments[0]!.supportingEvidence = [];
    expect(() => validateApplicabilityProviderOutput(input, contradicted)).toThrow(/hypothesis-candidate|synthesis/i);

    const irrelevant = validProviderOutput(input);
    irrelevant.candidateAssessments[0]!.verdict = "irrelevant";
    expect(() => validateApplicabilityProviderOutput(input, irrelevant)).toThrow(/evidence-polarity|provider-output/i);

    const duplicatePolarity = validProviderOutput(input);
    duplicatePolarity.candidateAssessments[0]!.contradictingEvidence = [{ kind: "case-fact", id: "fact:chunkload" }];
    expect(() => validateApplicabilityProviderOutput(input, duplicatePolarity)).toThrow(/evidence-polarity|provider-output/i);
  });

  it("rejects candidate-grounded hypotheses that cite another candidate or repeat the same fallback", () => {
    const input = validApplicabilityInput("evidence-only");
    input.evidenceRegistry.push({
      id: "representation:z-reference-only",
      resourceKey: "known-cause:reference-only",
      kind: "canonical",
      title: "Reference-only candidate",
      contentHash: hash("6"),
      evidenceOrigin: "reference-grounded",
      matchedChannels: [],
      text: "A separate candidate representation.",
    });
    const crossCandidate = validProviderOutput(input);
    if (crossCandidate.synthesis.disposition !== "hypothesis" || crossCandidate.synthesis.leadingHypothesis.kind !== "candidate-grounded") throw new Error("Expected candidate-grounded hypothesis.");
    crossCandidate.synthesis.leadingHypothesis.evidence.push({ kind: "resource-representation", id: "representation:z-reference-only" });
    expect(() => validateApplicabilityProviderOutput(input, crossCandidate)).toThrow(/hypothesis-candidate|synthesis/i);

    const duplicateFallback = validProviderOutput(input);
    if (duplicateFallback.synthesis.disposition !== "hypothesis") throw new Error("Expected hypothesis synthesis.");
    duplicateFallback.synthesis.alternatives = [structuredClone(duplicateFallback.synthesis.leadingHypothesis)];
    expect(() => validateApplicabilityProviderOutput(input, duplicateFallback)).toThrow(/hypothesis-candidate|synthesis/i);
  });

  it("rejects duplicate hypothesis ranks with the named semantic error", () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    if (output.synthesis.disposition !== "hypothesis") throw new Error("Expected hypothesis synthesis.");
    output.synthesis.nextEvidenceActions[0]!.hypothesisRanks = [0, 0];

    expect(() => validateApplicabilityProviderOutput(input, output)).toThrow(/hypothesis-rank|synthesis/i);
  });

  it("allows a grounded novel hypothesis but requires case-fact grounding and a concrete leading evidence action", () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.synthesis = {
      disposition: "hypothesis",
      leadingHypothesis: {
        kind: "novel",
        summary: "A deployment-specific asset mismatch may explain the loading failure.",
        evidence: [{ kind: "case-fact", id: "fact:chunkload" }],
        whyCandidateSetIsInsufficient: "The retrieved resources describe investigation paths but do not name this deployment-specific explanation.",
        missingEvidence: [],
      },
      alternatives: [],
      nextEvidenceActions: [{
        actionType: "run-check",
        action: "Compare the deployed asset manifest with the asset requested by the failing session.",
        expectedEvidence: "Whether the requested chunk exists in the deployed manifest.",
        hypothesisRanks: [0],
      }],
    };
    expect(() => validateApplicabilityProviderOutput(input, output)).not.toThrow();

    output.synthesis.leadingHypothesis.evidence = [{ kind: "resource-representation", id: "representation:performance:section:1" }];
    expect(() => validateApplicabilityProviderOutput(input, output)).toThrow(/novel-hypothesis|synthesis/i);
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
  const validMeasurement = (fits: boolean | null = true): ApplicabilityInputMeasurement => ({
    serializedBytes: 1_024,
    estimatedInputTokens: 512,
    outputReserveTokens: 4_096,
    minimumContextTokens: 4_608,
    contextLimitTokens: fits === null ? null : 32_768,
    fits,
  });

  const telemetry = {
    providerKind: "controlled-test" as const,
    model: "controlled-test-model",
    latencyMs: 3,
  };

  it("calls the provider exactly once for a complete assessment", async () => {
    const input = validApplicabilityInput("evidence-only");
    input.candidates = [input.candidates[0]!];
    const provider = { assess: vi.fn(async () => ({ output: validProviderOutput(input), telemetry })) };

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(),
      promptInjectionDetected: false,
    });

    expect(provider.assess).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "complete", assessments: [{ resourceKey: "knowledge-article:performance-troubleshooting" }] });
  });

  it("returns partial-assessment when system-owned unavailable candidates remain", async () => {
    const input = validApplicabilityInput("evidence-only");
    const provider = { assess: vi.fn(async () => ({ output: validProviderOutput(input), telemetry })) };

    const result = await assessApplicabilityCase({
      input,
      provider,
      measurement: validMeasurement(),
      promptInjectionDetected: false,
    });

    expect(provider.assess).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "partial-assessment",
      unavailableCandidates: [{ resourceKey: "known-cause:reference-only", reasons: ["representation-unavailable"] }],
    });
  });

  it("skips a case with no assessable candidates without a provider call", async () => {
    const input = validApplicabilityInput("evidence-only");
    input.candidates = [input.candidates[1]!];
    input.evidenceRegistry = [];
    const provider = { assess: vi.fn() };

    const result = await assessApplicabilityCase({ input, provider, measurement: validMeasurement(), promptInjectionDetected: false });

    expect(provider.assess).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "assessment-skipped", reason: "no-assessable-candidates" });
  });

  it("skips prompt injection before any provider call", async () => {
    const input = validApplicabilityInput("evidence-only");
    const provider = { assess: vi.fn() };

    const result = await assessApplicabilityCase({ input, provider, measurement: validMeasurement(), promptInjectionDetected: true });

    expect(provider.assess).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "assessment-skipped", reason: "prompt-injection-detected" });
  });

  it("does not call a provider when complete input exceeds the declared budget", async () => {
    const input = validApplicabilityInput("evidence-only");
    const provider = { assess: vi.fn() };

    const result = await assessApplicabilityCase({ input, provider, measurement: validMeasurement(false), promptInjectionDetected: false });

    expect(provider.assess).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "assessment-skipped", reason: "input-too-large" });
  });

  it("allows an undeclared context limit to proceed", async () => {
    const input = validApplicabilityInput("evidence-only");
    const provider = { assess: vi.fn(async () => ({ output: validProviderOutput(input), telemetry })) };

    await assessApplicabilityCase({ input, provider, measurement: validMeasurement(null), promptInjectionDetected: false });

    expect(provider.assess).toHaveBeenCalledTimes(1);
  });

  it("maps bounded provider failures without retrying", async () => {
    const reasons = ["not-configured", "transport", "http", "response-body", "timeout", "context-exhausted"] as const;
    for (const reason of reasons) {
      const input = validApplicabilityInput("evidence-only");
      const provider = { assess: vi.fn(async () => { throw new ApplicabilityProviderUnavailableError(reason, reason === "http" ? 503 : null); }) };

      const result = await assessApplicabilityCase({ input, provider, measurement: validMeasurement(), promptInjectionDetected: false });

      expect(provider.assess).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: "assessment-failed", reason });
    }
  });

  it("maps missing candidate verdicts to invalid-provider-output", async () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.candidateAssessments = [];
    const provider = { assess: vi.fn(async () => ({ output, telemetry })) };

    const result = await assessApplicabilityCase({ input, provider, measurement: validMeasurement(), promptInjectionDetected: false });

    expect(provider.assess).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "assessment-failed", reason: "invalid-provider-output", failureMode: "candidate-coverage" });
  });

  it("rejects a provider verdict for a system-owned unavailable candidate", async () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.candidateAssessments.push({
      ...structuredClone(output.candidateAssessments[0]!),
      resourceKey: "known-cause:reference-only",
    });
    const provider = { assess: vi.fn(async () => ({ output, telemetry })) };

    const result = await assessApplicabilityCase({ input, provider, measurement: validMeasurement(), promptInjectionDetected: false });

    expect(result).toEqual({ status: "assessment-failed", reason: "invalid-provider-output", failureMode: "candidate-coverage" });
  });

  it("enforces synthesis consistency after provider output", async () => {
    const input = validApplicabilityInput("evidence-only");
    const output = validProviderOutput(input);
    output.candidateAssessments[0]!.verdict = "insufficient-evidence";
    output.candidateAssessments[0]!.missingEvidence = [{ item: "A browser console trace is required.", evidence: [] }];
    const provider = { assess: vi.fn(async () => ({ output, telemetry })) };

    const result = await assessApplicabilityCase({ input, provider, measurement: validMeasurement(), promptInjectionDetected: false });

    expect(result).toEqual({ status: "assessment-failed", reason: "invalid-provider-output", failureMode: "synthesis:missing-evidence" });
  });

  it("propagates unexpected programming errors", async () => {
    const input = validApplicabilityInput("evidence-only");
    const unexpected = new Error("programming bug");
    const provider = { assess: vi.fn(async () => { throw unexpected; }) };

    await expect(assessApplicabilityCase({ input, provider, measurement: validMeasurement(), promptInjectionDetected: false }))
      .rejects.toBe(unexpected);
    expect(provider.assess).toHaveBeenCalledTimes(1);
  });

  it("validates the input before calling the provider", async () => {
    const input = validApplicabilityInput("evidence-only");
    input.candidates.reverse();
    const provider = { assess: vi.fn() };

    await expect(assessApplicabilityCase({ input, provider, measurement: validMeasurement(), promptInjectionDetected: false }))
      .rejects.toThrow(/candidate-order|invalid applicability schema/i);
    expect(provider.assess).not.toHaveBeenCalled();
  });
});
