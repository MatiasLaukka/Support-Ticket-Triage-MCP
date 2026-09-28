import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicabilityProviderUnavailableError, type ApplicabilityReasoningInput, type ApplicabilityReasoningProvider } from "../src/retrieval/applicability-types.js";
import { renderApplicabilityMarkdown, scoreApplicabilityCapture } from "../src/retrieval/applicability-evaluation.js";
import {
  runApplicabilityEvaluation,
  setApplicabilityEvaluationProviderFactoryForTests,
} from "../scripts/evaluate-applicability.js";

const roots: string[] = [];
afterEach(async () => {
  setApplicabilityEvaluationProviderFactoryForTests(undefined);
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function metricFixture(): { capture: any; cases: any[] } {
  const facts = [{ id: "fact:1", statement: "A bounded synthetic fact." }];
  const keys = ["knowledge-article:a", "knowledge-article:b", "knowledge-article:c", "knowledge-article:d", "knowledge-article:e", "knowledge-article:f"];
  const candidates = keys.map((resourceKey, index) => ({
    resourceKey,
    resourceType: "knowledge-article",
    contentHash: String(index + 1).repeat(64).slice(0, 64),
    evidence: index === 5 ? { status: "unavailable", reasons: ["resource-unavailable"] } : { status: "available", representationIds: [`rep:${index}`], matchedRepresentationIds: [`rep:${index}`] },
  }));
  const evidence = keys.slice(0, 5).map((resourceKey, index) => ({ id: `rep:${index}`, resourceKey, contentHash: String(index + 1).repeat(64).slice(0, 64), evidenceOrigin: "matched", matchedChannels: ["lexical"] }));
  const assessments = [
    [keys[0], "applicable-next-step"],
    [keys[1], "applicable-next-step"],
    [keys[2], "insufficient-evidence"],
    [keys[3], "irrelevant"],
    [keys[4], "irrelevant"],
  ].map(([resourceKey, verdict], index) => ({
    resourceKey,
    verdict,
    supportingEvidence: verdict === "irrelevant" ? [] : [{ kind: "case-fact", id: "fact:1" }],
    contradictingEvidence: [],
    missingEvidence: verdict === "insufficient-evidence" ? [{ item: "Need the bounded check.", evidence: [] }] : [],
    explanation: "Synthetic assessment.",
  }));
  const taxonomyAssessments = structuredClone(assessments) as Array<Record<string, any>>;
  taxonomyAssessments[1].verdict = "contradicted";
  taxonomyAssessments[1].supportingEvidence = [];
  taxonomyAssessments[1].contradictingEvidence = [{ kind: "case-fact", id: "fact:1" }];
  for (const assessment of taxonomyAssessments) (assessment as any).taxonomyRelation = "neutral";
  const synthesis = {
    disposition: "hypothesis",
    leadingHypothesis: { kind: "candidate-grounded", summary: "Candidate A mechanism", candidateKeys: [keys[0]], evidence: [{ kind: "case-fact", id: "fact:1" }], missingEvidence: [] },
    alternatives: [{ kind: "candidate-grounded", summary: "Candidate C mechanism", candidateKeys: [keys[2]], evidence: [{ kind: "case-fact", id: "fact:1" }], missingEvidence: [{ item: "Need the bounded check.", evidence: [] }] }],
    nextEvidenceActions: [{ actionType: "inspect-internal", action: "Inspect bounded check", expectedEvidence: "bounded check", hypothesisRanks: [0, 1] }],
  };
  const lane = (name: string, laneAssessments: any[]) => ({
    lane: name,
    nonTaxonomyBasisHash: "a".repeat(64),
    inputIdentity: {},
    inputMeasurement: { serializedBytes: 100, estimatedInputTokens: 50, outputReserveTokens: 20, minimumContextTokens: 70, contextLimitTokens: 1000, fits: true },
    result: { status: "complete", assessments: laneAssessments, synthesis },
    outputHash: "b".repeat(64), telemetry: null, timing: { startedAtMs: 1, completedAtMs: 2 }, traceTruncated: false,
  });
  const capture = {
    captureHash: "c".repeat(64), identity: { providerKind: "controlled-test", model: "fixture", contractVersion: 2, promptVersion: "b5-applicability-v2" },
    cases: [{ caseId: "case-1", safeCase: { caseId: "case-1", problemStatement: "Synthetic.", observedFacts: facts, conversationState: [] }, candidates, evidence, lanes: [lane("evidence-only", assessments), lane("taxonomy-informed", taxonomyAssessments)] }],
  };
  const judgments = [
    [keys[0], "applicable-next-step"],
    [keys[1], "contradicted"],
    [keys[2], "insufficient-evidence"],
    [keys[3], "irrelevant"],
    [keys[4], "irrelevant"],
    [keys[5], "applicable-next-step"],
  ].map(([resourceKey, verdict]) => ({ resourceKey, verdict, supportingEvidence: verdict === "irrelevant" ? [] : [{ kind: "case-fact", id: "fact:1" }], contradictingEvidence: verdict === "contradicted" ? [{ kind: "case-fact", id: "fact:1" }] : [], missingEvidence: verdict === "insufficient-evidence" ? [{ item: "Need the bounded check.", evidence: [] }] : [], rationale: "fixture" }));
  const cases = [{
    id: "case-1", judgments, unjudgedCandidateKeys: ["knowledge-article:u1", "knowledge-article:u2"],
    synthesisOracle: {
      disposition: "hypothesis",
      acceptableLeadingHypotheses: [{ id: "h0", candidateKeyPool: [keys[0]], minimumCandidateMatches: 1, requiredConcepts: ["candidate", "mechanism"] }],
      orderedAlternativeHypotheses: [{ id: "h1", candidateKeyPool: [keys[2]], minimumCandidateMatches: 1, requiredConcepts: ["candidate", "mechanism"] }],
      evidenceActionIntents: [{ id: "a0", targetRanks: [0, 1], allowedActionTypes: ["inspect-internal"], requiredConcepts: ["bounded", "check"] }],
      novelHypothesisPolicy: "allowed-requires-review", forbiddenClaims: [],
    },
  }];
  return { capture, cases };
}

function fakeProvider(model: string, failFirst = false, unsafeFirst = false): { provider: ApplicabilityReasoningProvider; calls: ReturnType<typeof vi.fn> } {
  let callIndex = 0;
  const calls = vi.fn();
  const provider: ApplicabilityReasoningProvider = {
    assess: async (input: ApplicabilityReasoningInput) => {
      calls(input);
      callIndex += 1;
      if (failFirst && callIndex === 1) throw new ApplicabilityProviderUnavailableError("timeout");
      const firstFact = input.case.observedFacts[0] ?? input.case.conversationState[0];
      if (!firstFact) throw new Error("Fixture requires a case fact.");
      const available = input.candidates.filter((candidate) => candidate.evidence.status === "available");
      const assessments = available.map((candidate) => ({
        resourceKey: candidate.resourceKey,
        verdict: "applicable-next-step" as const,
        supportingEvidence: [{ kind: "case-fact" as const, id: firstFact.id }, { kind: "resource-representation" as const, id: candidate.evidence.status === "available" ? candidate.evidence.representationIds[0]! : "never" }],
        contradictingEvidence: [],
        missingEvidence: [],
        explanation: unsafeFirst && callIndex === 1
          ? "Inspect C:\\Users\\someone\\ticket.txt before continuing."
          : "The candidate supports a bounded synthetic investigation.",
        ...(input.lane === "taxonomy-informed" ? { taxonomyRelation: "neutral" as const } : {}),
      }));
      const lead = available[0];
      if (!lead || lead.evidence.status !== "available") throw new Error("Fixture requires an available candidate.");
      return {
        output: {
          candidateAssessments: assessments,
          synthesis: {
            disposition: "hypothesis" as const,
            leadingHypothesis: { kind: "candidate-grounded" as const, summary: "A bounded candidate mechanism is the first hypothesis.", candidateKeys: [lead.resourceKey], evidence: [{ kind: "case-fact" as const, id: firstFact.id }], missingEvidence: [] },
            alternatives: [],
            nextEvidenceActions: [{ actionType: "inspect-internal" as const, action: "Inspect the bounded internal evidence for the leading mechanism.", expectedEvidence: "Evidence supporting or contradicting the leading mechanism.", hypothesisRanks: [0] }],
          },
        },
        telemetry: { providerKind: "openai-responses" as const, model, latencyMs: 1, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      };
    },
  };
  return { provider, calls };
}

function outputPath(name: string): string {
  const path = resolve(`reports/retrieval/b5-applicability/${name}-${process.pid}-${Date.now()}`);
  roots.push(path);
  return path;
}

function compareArgs(outputDir: string): string[] {
  return ["compare-development", "--provider", "openai-responses", "--model", "fake-model", "--timeout-ms", "1000", "--max-output-tokens", "4096", "--context-limit-tokens", "2000000", "--authorization-ref", "task8-test-authorization", "--output-dir", outputDir];
}

describe("B5 applicability evaluation", () => {
  it("scores exact candidate metrics and excludes unjudged and unavailable pairs", () => {
    const report = scoreApplicabilityCapture(metricFixture() as any);
    expect(report.lanes["evidence-only"].dangerousFalsePositive).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(report.lanes["evidence-only"].insufficientEvidenceRecognition).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].hypothesisAccuracy).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].alternativeCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].evidenceActionCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.exclusions.unjudgedPairs).toBe(2);
    expect(report.exclusions.unavailablePairs).toBe(1);
    expect(report.taxonomyDelta).toMatchObject({ beneficial: 1, harmful: 0 });
  });

  it("marks a comparison inconclusive when either lane contains a failed result", () => {
    const fixture = metricFixture();
    fixture.capture.cases[0].lanes[0].result = {
      status: "assessment-failed",
      reason: "invalid-provider-output",
      failureMode: "synthesis:missing-evidence",
    };
    const report = scoreApplicabilityCapture(fixture as any);
    expect(report.classification).toBe("inconclusive");
  });

  it("recognizes controlled semantic aliases without requiring oracle phrases verbatim", () => {
    const fixture = metricFixture() as any;
    fixture.cases[0].synthesisOracle.acceptableLeadingHypotheses = [{
      id: "semantic-alias",
      candidateKeyPool: ["knowledge-article:a"],
      minimumCandidateMatches: 1,
      requiredConcepts: ["campaign editor", "chunk loading", "cross-session"],
    }];
    fixture.cases[0].synthesisOracle.orderedAlternativeHypotheses = [];
    fixture.cases[0].synthesisOracle.evidenceActionIntents = [];
    for (const lane of fixture.capture.cases[0].lanes) {
      lane.result.synthesis.leadingHypothesis.summary =
        "The campaign editor fails across isolated sessions with a repeated ChunkLoadError.";
      lane.result.synthesis.alternatives = [];
    }

    const report = scoreApplicabilityCapture(fixture);
    expect(report.lanes["evidence-only"].hypothesisAccuracy).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["taxonomy-informed"].hypothesisAccuracy).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].leadingCandidateAccuracy).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].leadingMechanismConceptCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["taxonomy-informed"].leadingCandidateAccuracy).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["taxonomy-informed"].leadingMechanismConceptCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
  });

  it("scores one evidence intent across multiple actions that collectively cover its ranks and concepts", () => {
    const fixture = metricFixture() as any;
    fixture.cases[0].synthesisOracle.evidenceActionIntents = [{
      id: "joint-webhook-discriminator",
      targetRanks: [0, 1],
      allowedActionTypes: ["inspect-internal", "run-check"],
      requiredConcepts: ["raw signed body", "signed headers", "verifier input", "rotation timing"],
    }];
    for (const lane of fixture.capture.cases[0].lanes) {
      lane.result.synthesis.nextEvidenceActions = [
        {
          actionType: "inspect-internal",
          action: "Inspect the receiver key-version metadata against the sender post-rotation signing version.",
          expectedEvidence: "A post-rotation mismatch or matching key usage.",
          hypothesisRanks: [0],
        },
        {
          actionType: "run-check",
          action: "Compare the exact raw request body and signed headers against the verifier input for the same delivery.",
          expectedEvidence: "Byte and header equality or a verifier-input difference.",
          hypothesisRanks: [1],
        },
      ];
    }

    const report = scoreApplicabilityCapture(fixture);
    expect(report.lanes["evidence-only"].evidenceActionCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["taxonomy-informed"].evidenceActionCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].actionRankCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].actionConceptCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["taxonomy-informed"].actionRankCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["taxonomy-informed"].actionConceptCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
  });

  it("keeps correct leading candidate structure separate from unmatched mechanism wording", () => {
    const fixture = metricFixture() as any;
    fixture.cases[0].synthesisOracle.acceptableLeadingHypotheses = [{
      id: "structure-only",
      candidateKeyPool: ["knowledge-article:a"],
      minimumCandidateMatches: 1,
      requiredConcepts: ["deliberately absent mechanism phrase"],
    }];
    fixture.cases[0].synthesisOracle.orderedAlternativeHypotheses = [];
    fixture.cases[0].synthesisOracle.evidenceActionIntents = [];
    for (const lane of fixture.capture.cases[0].lanes) {
      lane.result.synthesis.leadingHypothesis.summary = "A bounded candidate mechanism is the first hypothesis.";
      lane.result.synthesis.alternatives = [];
    }

    const report = scoreApplicabilityCapture(fixture);
    expect(report.lanes["evidence-only"].leadingCandidateAccuracy).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].leadingMechanismConceptCoverage).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(report.lanes["evidence-only"].hypothesisAccuracy).toEqual({ numerator: 0, denominator: 1, rate: 0 });
  });

  it("keeps correct action rank structure separate from unmatched discriminator wording", () => {
    const fixture = metricFixture() as any;
    fixture.cases[0].synthesisOracle.evidenceActionIntents = [{
      id: "structure-only-action",
      targetRanks: [0],
      allowedActionTypes: ["inspect-internal"],
      requiredConcepts: ["deliberately absent discriminator phrase"],
    }];
    for (const lane of fixture.capture.cases[0].lanes) {
      lane.result.synthesis.nextEvidenceActions = [{
        actionType: "inspect-internal",
        action: "Inspect the bounded internal evidence for the leading mechanism.",
        expectedEvidence: "Evidence supporting or contradicting the leading mechanism.",
        hypothesisRanks: [0],
      }];
    }

    const report = scoreApplicabilityCapture(fixture);
    expect(report.lanes["evidence-only"].actionRankCoverage).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.lanes["evidence-only"].actionConceptCoverage).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(report.lanes["evidence-only"].evidenceActionCoverage).toEqual({ numerator: 0, denominator: 1, rate: 0 });
  });

  it("records the synthesis metric and concept matcher versions in every scored report", () => {
    const report = scoreApplicabilityCapture(metricFixture() as any);
    expect(report.evaluationIdentity).toEqual({
      metricVersion: "b5-synthesis-metrics-v2",
      conceptMatcherVersion: "controlled-alias-v1",
    });
  });

  it("renders deterministic Markdown from a scored report", () => {
    const report = scoreApplicabilityCapture(metricFixture() as any);
    expect(renderApplicabilityMarkdown(report)).toBe(renderApplicabilityMarkdown(structuredClone(report)));
    expect(renderApplicabilityMarkdown(report)).toContain("B5 applicability development comparison");
  });

  it("validates the frozen development inputs without constructing or calling a provider", async () => {
    const factory = vi.fn(() => { throw new Error("provider must not be constructed"); });
    setApplicabilityEvaluationProviderFactoryForTests(factory as any);
    const report = await runApplicabilityEvaluation(["validate-development"], {});
    expect(report).toMatchObject({ mode: "development-applicability-validation", caseCount: 21, holdoutExecuted: false });
    expect(factory).not.toHaveBeenCalled();
  });

  it("reports provider-free input sizes for both complete lanes", async () => {
    const report = await runApplicabilityEvaluation(["validate-development"], {}) as any;
    expect(report.cases).toHaveLength(21);
    expect(report.cases.every((entry: any) => entry.lanes["evidence-only"].minimumContextTokens > 0 && entry.lanes["taxonomy-informed"].minimumContextTokens > 0)).toBe(true);
  });

  it.each([
    ["missing authorization", ["compare-development", "--provider", "openai-responses", "--model", "fake", "--timeout-ms", "1000", "--max-output-tokens", "4096", "--context-limit-tokens", "2000000", "--output-dir", "reports/retrieval/b5-applicability/no-auth"]],
    ["holdout option", ["compare-development", "--provider", "openai-responses", "--model", "fake", "--timeout-ms", "1000", "--max-output-tokens", "4096", "--context-limit-tokens", "2000000", "--authorization-ref", "auth", "--split", "holdout", "--output-dir", "reports/retrieval/b5-applicability/no-holdout"]],
  ])("rejects %s before provider construction", async (_name, args) => {
    const factory = vi.fn(() => { throw new Error("provider must not be constructed"); });
    setApplicabilityEvaluationProviderFactoryForTests(factory as any);
    await expect(runApplicabilityEvaluation(args as string[], {})).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects output paths outside the fixed B5 root", async () => {
    const factory = vi.fn(() => { throw new Error("provider must not be constructed"); });
    setApplicabilityEvaluationProviderFactoryForTests(factory as any);
    const args = compareArgs(resolve("outside-b5-task8"));
    await expect(runApplicabilityEvaluation(args, {})).rejects.toThrow(/B5 artifact root/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it("runs one fresh paired request per lane with deterministic counterbalancing and writes exact reports", async () => {
    const outputDir = outputPath("task8-full");
    const fake = fakeProvider("fake-model");
    setApplicabilityEvaluationProviderFactoryForTests(() => fake.provider);
    const report = await runApplicabilityEvaluation(compareArgs(outputDir), {}) as any;
    expect(fake.calls).toHaveBeenCalledTimes(42);
    expect(report.holdoutExecuted).toBe(false);
    const capture = JSON.parse(await readFile(resolve(outputDir, "capture.json"), "utf8"));
    expect(capture.cases[0].laneOrder).toEqual(["evidence-only", "taxonomy-informed"]);
    expect(capture.cases[1].laneOrder).toEqual(["taxonomy-informed", "evidence-only"]);
    expect(capture.cases.every((entry: any) => entry.lanes.length === 2)).toBe(true);
    const saved = JSON.parse(await readFile(resolve(outputDir, "evaluation.json"), "utf8"));
    const markdown = await readFile(resolve(outputDir, "evaluation.md"), "utf8");
    expect(saved).toEqual(report);
    expect(markdown).toBe(renderApplicabilityMarkdown(saved));
    expect(existsSync(resolve(outputDir, "capture.json"))).toBe(true);
  }, 30_000);

  it("records one expected lane failure without retrying that lane", async () => {
    const outputDir = outputPath("task8-failure");
    const fake = fakeProvider("fake-model", true);
    setApplicabilityEvaluationProviderFactoryForTests(() => fake.provider);
    const report = await runApplicabilityEvaluation(compareArgs(outputDir), {}) as any;
    expect(fake.calls).toHaveBeenCalledTimes(42);
    expect(report.exclusions.failedCases).toHaveLength(1);
    expect(report.exclusions.failedCases[0]).toMatchObject({ reason: "timeout", failureMode: "provider:timeout" });
    expect(report.exclusions.failureModeCounts).toEqual({ "provider:timeout": 1 });
  }, 30_000);

  it("bounds capture-unsafe provider narrative as an invalid-provider-output lane without aborting the paid run", async () => {
    const outputDir = outputPath("task8-privacy-failure");
    const fake = fakeProvider("fake-model", false, true);
    setApplicabilityEvaluationProviderFactoryForTests(() => fake.provider);
    const report = await runApplicabilityEvaluation(compareArgs(outputDir), {}) as any;
    expect(fake.calls).toHaveBeenCalledTimes(42);
    expect(report.exclusions.failedCases).toHaveLength(1);
    expect(report.exclusions.failedCases[0]).toMatchObject({
      reason: "invalid-provider-output",
      failureMode: "capture-privacy:path",
    });
    expect(report.exclusions.failureModeCounts).toEqual({ "capture-privacy:path": 1 });
    const serializedCapture = await readFile(resolve(outputDir, "capture.json"), "utf8");
    expect(serializedCapture).not.toContain("C:\\Users\\someone\\ticket.txt");
    expect(JSON.parse(serializedCapture).cases.flatMap((entry: any) => entry.lanes)
      .filter((lane: any) => lane.result.status === "assessment-failed"
        && lane.result.reason === "invalid-provider-output"
        && lane.result.failureMode === "capture-privacy:path")).toHaveLength(1);
  }, 30_000);

  it("never overwrites an existing output directory", async () => {
    const outputDir = outputPath("task8-existing");
    const fake = fakeProvider("fake-model");
    setApplicabilityEvaluationProviderFactoryForTests(() => fake.provider);
    await runApplicabilityEvaluation(compareArgs(outputDir), {});
    await expect(runApplicabilityEvaluation(compareArgs(outputDir), {})).rejects.toThrow(/existing|new/i);
  }, 30_000);
});
