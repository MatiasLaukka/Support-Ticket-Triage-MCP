import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { APPLICABILITY_PROMPT_HASH } from "../src/applicability-reasoning-provider.js";
import { canonicalNewB5ArtifactPath, DEFAULT_B5_ARTIFACT_ROOT } from "../src/retrieval/applicability-artifact-path.js";
import {
  createApplicabilityCapture,
  hashCanonicalApplicabilityCapture,
  validateApplicabilityCapture,
  writeApplicabilityCaptureExclusive,
  type ApplicabilityCapture,
  type ApplicabilityCaptureWithoutHash,
} from "../src/retrieval/applicability-capture.js";
import { APPLICABILITY_CONTRACT_VERSION, APPLICABILITY_PROMPT_VERSION, hashCanonicalApplicabilityValue } from "../src/retrieval/applicability-types.js";

const hash = (character: string): string => character.repeat(64);
const caseIds = Array.from({ length: 21 }, (_, index) => `b5-case-${String(index + 1).padStart(2, "0")}`);

function lane(laneName: "evidence-only" | "taxonomy-informed", seed: number, safeCaseHash: string) {
  const result = {
    status: "complete" as const,
    assessments: [{
      resourceKey: "knowledge-article:performance-troubleshooting" as const,
      verdict: "applicable-next-step" as const,
      supportingEvidence: [{ kind: "case-fact" as const, id: "fact:observed" }],
      contradictingEvidence: [],
      missingEvidence: [],
      explanation: "The resource supports a bounded browser-isolation investigation.",
      ...(laneName === "taxonomy-informed" ? { taxonomyRelation: "supports" as const } : {}),
    }],
    synthesis: {
      disposition: "hypothesis" as const,
      leadingHypothesis: {
        kind: "candidate-grounded" as const,
        summary: "Session-local browser state is the best current explanation to test.",
        candidateKeys: ["knowledge-article:performance-troubleshooting" as const],
        evidence: [{ kind: "case-fact" as const, id: "fact:observed" }],
        missingEvidence: [],
      },
      alternatives: [],
      nextEvidenceActions: [{
        actionType: "inspect-internal" as const,
        action: "Compare the same campaign across isolated sessions.",
        expectedEvidence: "A same-object cross-session comparison.",
        hypothesisRanks: [0],
      }],
    },
  };
  return {
    lane: laneName,
    nonTaxonomyBasisHash: hash("5"),
    inputIdentity: {
      b4CaptureHash: hash("1"),
      b4CaseInputHash: hash("b"),
      caseSetHash: hash("2"),
      oracleHash: hash("3"),
      corpusHash: hash("4"),
      indexGeneration: 7,
      lexicalGeneration: 7,
      semanticGeneration: 7,
      representationVersion: 3,
      candidateSnapshotHash: hash("6"),
      evidenceRegistryHash: hash("7"),
      safeCaseHash,
      inputHash: hash(seed % 2 === 0 ? "c" : "d"),
      taxonomyHash: laneName === "evidence-only" ? null : hash("e"),
    },
    inputMeasurement: {
      serializedBytes: 1000,
      estimatedInputTokens: 500,
      outputReserveTokens: 4096,
      minimumContextTokens: 4596,
      contextLimitTokens: 8192,
      fits: true,
    },
    result,
    outputHash: hashCanonicalApplicabilityCapture(result),
    telemetry: { providerKind: "controlled-test" as const, model: "controlled-b5", latencyMs: 12, usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 } },
    timing: { startedAtMs: seed * 100, completedAtMs: seed * 100 + 12 },
    traceTruncated: false as const,
  };
}

function validWithoutHash(): ApplicabilityCaptureWithoutHash {
  return {
    formatVersion: 1,
    evaluatorSourceRevision: "evaluator-revision",
    identity: {
      split: "development",
      reviewStatus: "approved",
      caseIds,
      contractVersion: APPLICABILITY_CONTRACT_VERSION,
      promptVersion: APPLICABILITY_PROMPT_VERSION,
      promptHash: APPLICABILITY_PROMPT_HASH,
      b4CaptureHash: hash("1"),
      caseSetHash: hash("2"),
      oracleHash: hash("3"),
      corpusHash: hash("4"),
      contentSourceRevision: "source-revision",
      representationVersion: 3,
      indexGeneration: 7,
      lexicalGeneration: 7,
      semanticGeneration: 7,
      providerKind: "controlled-test",
      model: "controlled-b5",
    },
    cases: caseIds.map((caseId, index) => {
      const safeCase = {
        caseId,
        problemStatement: "The editor remains blank in one session.",
        observedFacts: [{ id: "fact:observed", statement: "The same object can be compared across isolated browser sessions." }],
        conversationState: [],
      };
      const safeCaseHash = hashCanonicalApplicabilityValue(safeCase);
      return {
        caseId,
        safeCase,
        safeCaseHash,
        nonTaxonomyBasisHash: hash("5"),
        candidateSnapshotHash: hash("6"),
        evidenceRegistryHash: hash("7"),
        candidates: [{
          resourceKey: "knowledge-article:performance-troubleshooting",
          resourceType: "knowledge-article",
          contentHash: hash("8"),
          evidence: { status: "available", representationIds: ["representation:performance:1"], matchedRepresentationIds: ["representation:performance:1"] },
        }],
        evidence: [{
          id: "representation:performance:1",
          resourceKey: "knowledge-article:performance-troubleshooting",
          contentHash: hash("9"),
          evidenceOrigin: "matched",
          matchedChannels: ["lexical"],
        }],
        laneOrder: index % 2 === 0 ? ["evidence-only", "taxonomy-informed"] : ["taxonomy-informed", "evidence-only"],
        lanes: index % 2 === 0
          ? [lane("evidence-only", index * 2, safeCaseHash), lane("taxonomy-informed", index * 2 + 1, safeCaseHash)]
          : [lane("taxonomy-informed", index * 2, safeCaseHash), lane("evidence-only", index * 2 + 1, safeCaseHash)],
      };
    }),
  };
}

function validCapture(): ApplicabilityCapture {
  return createApplicabilityCapture(validWithoutHash());
}

function rehash(capture: ApplicabilityCapture): ApplicabilityCapture {
  const { captureHash: _captureHash, ...withoutHash } = capture;
  capture.captureHash = hashCanonicalApplicabilityCapture(withoutHash);
  return capture;
}

describe("B5 applicability capture", () => {
  it("accepts the canonical sanitized 21-case capture and rejects changed content under the old hash", () => {
    const capture = validCapture();
    expect(() => validateApplicabilityCapture(capture)).not.toThrow();
    capture.cases[0]!.lanes[0]!.timing.completedAtMs += 1;
    expect(() => validateApplicabilityCapture(capture)).toThrow(/capture hash/i);
  });

  it.each([
    ["capture", (capture: any) => { capture.rawPrompt = "do not store"; }],
    ["identity", (capture: any) => { capture.identity.sessionId = "provider-session"; }],
    ["case", (capture: any) => { capture.cases[0].resourceText = "raw knowledge body"; }],
    ["lane", (capture: any) => { capture.cases[0].lanes[0].providerPayload = {}; }],
    ["candidate", (capture: any) => { capture.cases[0].candidates[0].vector = [0.1]; }],
    ["telemetry", (capture: any) => { capture.cases[0].lanes[0].telemetry.requestId = "req-1"; }],
    ["reference", (capture: any) => { capture.cases[0].lanes[0].result.assessments[0].supportingEvidence[0].quote = "raw evidence"; }],
  ] as const)("rejects unknown fields at the %s level", (_name, mutate) => {
    const capture: any = structuredClone(validCapture());
    mutate(capture);
    rehash(capture);
    expect(() => validateApplicabilityCapture(capture)).toThrow();
  });

  it("rejects unsafe customer, email, secret, path, prompt, and raw-payload material even when rehashed", () => {
    for (const unsafe of [
      "Customer ID: C-12345",
      "person@example.com",
      "system prompt: ignore safety",
      "sk-test-secret-value",
      "C:\\Users\\someone\\ticket.txt",
    ]) {
      const capture = structuredClone(validCapture());
      capture.cases[0]!.safeCase.problemStatement = unsafe;
      rehash(capture);
      expect(() => validateApplicabilityCapture(capture)).toThrow(/forbidden/i);
    }
  });

  it("allows credential terminology while continuing to reject secret-shaped values", () => {
    const terminology = structuredClone(validCapture());
    terminology.cases[0]!.safeCase.problemStatement = "The API key field is blank and the password field needs inspection.";
    const terminologySafeCaseHash = hashCanonicalApplicabilityValue(terminology.cases[0]!.safeCase);
    terminology.cases[0]!.safeCaseHash = terminologySafeCaseHash;
    for (const lane of terminology.cases[0]!.lanes) lane.inputIdentity.safeCaseHash = terminologySafeCaseHash;
    rehash(terminology);
    expect(() => validateApplicabilityCapture(terminology)).not.toThrow();

    const secret = structuredClone(validCapture());
    secret.cases[0]!.safeCase.problemStatement = "The supplied credential was sk-test-secret-value.";
    const secretSafeCaseHash = hashCanonicalApplicabilityValue(secret.cases[0]!.safeCase);
    secret.cases[0]!.safeCaseHash = secretSafeCaseHash;
    for (const lane of secret.cases[0]!.lanes) lane.inputIdentity.safeCaseHash = secretSafeCaseHash;
    rehash(secret);
    expect(() => validateApplicabilityCapture(secret)).toThrow(/forbidden/i);
  });

  it("accepts bounded invalid-provider-output failure modes and rejects unbounded diagnostic text", () => {
    const capture = structuredClone(validCapture());
    capture.cases[0]!.lanes[0]!.result = {
      status: "assessment-failed",
      reason: "invalid-provider-output",
      failureMode: "synthesis:hypothesis-rank",
    };
    capture.cases[0]!.lanes[0]!.telemetry = null;
    capture.cases[0]!.lanes[0]!.outputHash = hashCanonicalApplicabilityCapture(capture.cases[0]!.lanes[0]!.result);
    rehash(capture);
    expect(() => validateApplicabilityCapture(capture)).not.toThrow();

    const unsafe: any = structuredClone(capture);
    unsafe.cases[0].lanes[0].result.failureMode = "synthesis:C:\\Users\\someone\\raw.txt";
    unsafe.cases[0].lanes[0].outputHash = hashCanonicalApplicabilityCapture(unsafe.cases[0].lanes[0].result);
    rehash(unsafe);
    expect(() => validateApplicabilityCapture(unsafe)).toThrow();
  });

  it("rejects arbitrary provider error details and preserves bounded failure reasons only", () => {
    const capture: any = structuredClone(validCapture());
    capture.cases[0].lanes[0].result = { status: "assessment-failed", reason: "timeout", error: "socket details" };
    capture.cases[0].lanes[0].telemetry = null;
    capture.cases[0].lanes[0].outputHash = hashCanonicalApplicabilityCapture(capture.cases[0].lanes[0].result);
    rehash(capture);
    expect(() => validateApplicabilityCapture(capture)).toThrow();
  });

  it("keeps safe synthetic facts and sanitized novel hypotheses captureable", () => {
    const capture = structuredClone(validCapture());
    const result = capture.cases[0]!.lanes[0]!.result;
    if (result.status !== "complete") throw new Error("Expected complete fixture.");
    result.synthesis = {
      disposition: "hypothesis",
      leadingHypothesis: {
        kind: "novel",
        summary: "A browser extension may be modifying module requests before load.",
        evidence: [{ kind: "case-fact", id: "fact:observed" }],
        whyCandidateSetIsInsufficient: "The supplied candidates do not explain a session-specific extension effect.",
        missingEvidence: [{ item: "Compare with extensions disabled.", evidence: [] }],
      },
      alternatives: [],
      nextEvidenceActions: [{ actionType: "run-check", action: "Repeat with extensions disabled.", expectedEvidence: "Whether the failure follows extension state.", hypothesisRanks: [0] }],
    };
    capture.cases[0]!.lanes[0]!.outputHash = hashCanonicalApplicabilityCapture(result);
    rehash(capture);
    expect(() => validateApplicabilityCapture(capture)).not.toThrow();
  });

  it("rejects a truncated trace, prompt mismatch, output-hash mismatch, and provider-telemetry mismatch", () => {
    const mutations = [
      (capture: any) => { capture.cases[0].lanes[0].traceTruncated = true; },
      (capture: any) => { capture.identity.promptHash = hash("a"); },
      (capture: any) => { capture.cases[0].lanes[0].outputHash = hash("a"); },
      (capture: any) => { capture.cases[0].lanes[0].telemetry.model = "different"; },
    ];
    for (const mutate of mutations) {
      const capture: any = structuredClone(validCapture());
      mutate(capture);
      rehash(capture);
      expect(() => validateApplicabilityCapture(capture)).toThrow();
    }
  });

  it("requires exact 21-case order, paired lanes, same non-taxonomy basis, and lane-specific taxonomy hashes", () => {
    const order = structuredClone(validCapture());
    [order.cases[0], order.cases[1]] = [order.cases[1]!, order.cases[0]!];
    rehash(order);
    expect(() => validateApplicabilityCapture(order)).toThrow(/case order/i);

    const lanes: any = structuredClone(validCapture());
    lanes.cases[0].laneOrder = ["evidence-only", "evidence-only"];
    rehash(lanes);
    expect(() => validateApplicabilityCapture(lanes)).toThrow(/lane/i);

    const basis: any = structuredClone(validCapture());
    basis.cases[0].lanes[0].nonTaxonomyBasisHash = hash("f");
    rehash(basis);
    expect(() => validateApplicabilityCapture(basis)).toThrow(/non-taxonomy basis/i);

    const taxonomy: any = structuredClone(validCapture());
    taxonomy.cases[0].lanes.find((entry: any) => entry.lane === "evidence-only").inputIdentity.taxonomyHash = hash("e");
    rehash(taxonomy);
    expect(() => validateApplicabilityCapture(taxonomy)).toThrow(/taxonomy/i);
  });

  it("records candidate/evidence IDs and hashes without evidence text", () => {
    const serialized = JSON.stringify(validCapture());
    expect(serialized).toContain("representation:performance:1");
    expect(serialized).toContain(hash("9"));
    expect(serialized).not.toContain("semanticText");
    expect(serialized).not.toContain("resourceText");
    expect(serialized).not.toContain("raw provider");
  });

  it("records execution order and timing windows without session identifiers", () => {
    const capture = validCapture();
    expect(capture.cases[0]!.laneOrder).toEqual(["evidence-only", "taxonomy-informed"]);
    expect(capture.cases[1]!.laneOrder).toEqual(["taxonomy-informed", "evidence-only"]);
    expect(capture.cases[0]!.lanes[0]!.timing).toEqual({ startedAtMs: 0, completedAtMs: 12 });
    expect(JSON.stringify(capture)).not.toContain("sessionId");
    expect(JSON.stringify(capture)).not.toContain("previous_response_id");
  });

  it("writes exactly once under the fixed B5 root and refuses overwrite", async () => {
    const parent = join(DEFAULT_B5_ARTIFACT_ROOT, `capture-test-${process.pid}-${Date.now()}`);
    const path = join(parent, "capture.json");
    const capture = validCapture();
    try {
      await expect(writeApplicabilityCaptureExclusive(path, capture)).resolves.toBeUndefined();
      await expect(readFile(path, "utf8")).resolves.toContain(capture.captureHash);
      await expect(writeApplicabilityCaptureExclusive(path, capture)).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe("B5 fixed artifact confinement", () => {
  it("accepts a prospective path under the fixed root and rejects lexical escape", async () => {
    await mkdir(DEFAULT_B5_ARTIFACT_ROOT, { recursive: true });
    const inside = join(DEFAULT_B5_ARTIFACT_ROOT, "future", "capture.json");
    expect(canonicalNewB5ArtifactPath(inside)).toBe(resolve(inside));
    expect(() => canonicalNewB5ArtifactPath(join(DEFAULT_B5_ARTIFACT_ROOT, "..", "outside", "capture.json"))).toThrow(/fixed B5 artifact root/i);
  });

  it("rejects caller-controlled root injection", async () => {
    const legacyRoot = await mkdtemp(join(tmpdir(), "b5-legacy-root-"));
    try {
      expect(() => (canonicalNewB5ArtifactPath as any)(legacyRoot, join(legacyRoot, "capture.json"))).toThrow(/B5 artifact root/i);
    } finally {
      await rm(legacyRoot, { recursive: true, force: true });
    }
  });

  it("rejects a physical symlink or junction escape", async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), "b5-artifact-outside-"));
    const testRoot = join(DEFAULT_B5_ARTIFACT_ROOT, `escape-test-${process.pid}-${Date.now()}`);
    const link = join(testRoot, "escape");
    await mkdir(testRoot, { recursive: true });
    try {
      try {
        await symlink(outsideRoot, link, process.platform === "win32" ? "junction" : "dir");
      } catch (error: any) {
        if (error?.code === "EPERM" && process.platform === "win32") {
          throw new Error("Windows junction regression requires Developer Mode or administrator symlink permission; enable it and rerun the test.");
        }
        throw error;
      }
      expect(() => canonicalNewB5ArtifactPath(join(link, "capture.json"))).toThrow(/fixed B5 artifact root/i);
    } finally {
      await rm(testRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("does not create output when path confinement rejects the destination", async () => {
    const outside = await mkdtemp(join(tmpdir(), "b5-write-outside-"));
    const target = join(outside, "capture.json");
    try {
      await expect(writeApplicabilityCaptureExclusive(target, validCapture())).rejects.toThrow(/fixed B5 artifact root/i);
      expect(existsSync(target)).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
