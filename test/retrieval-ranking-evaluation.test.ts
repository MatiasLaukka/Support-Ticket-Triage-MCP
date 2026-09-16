import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runRankingEvaluation } from "../scripts/evaluate-ranking.js";
import { createRankingCapture, hashCanonicalRankingCapture } from "../src/retrieval/ranking-capture.js";
import { rankRetrieval } from "../src/retrieval/ranking.js";
import { ReadinessCaseSchema } from "../src/retrieval/readiness-cases.js";
import type { RankingCaptureCase } from "../src/retrieval/ranking-capture.js";
import type { RankingInput, RankingOutputLimits } from "../src/retrieval/ranking-types.js";
import type { ReadinessCase, ReadinessManifest } from "../src/retrieval/readiness-cases.js";
import type { RetrievalResult } from "../src/retrieval/types.js";
import * as retrievalSearch from "../src/retrieval/search.js";

const outputLimits: RankingOutputLimits = {
  "knowledge-article": 5,
  "known-cause": 5,
  "diagnostic-playbook": 5,
  "resolved-ticket": 5,
};
const retrievalLimits = {
  "knowledge-article": { lexical: 5, semantic: 5 },
  "known-cause": { lexical: 5, semantic: 5 },
  "diagnostic-playbook": { lexical: 5, semantic: 5 },
  "resolved-ticket": { lexical: 5, semantic: 5 },
} as const;

async function rankingFixture() {
  const root = await mkdtemp(join(tmpdir(), "b4-ranking-evaluation-"));
  const manifest = JSON.parse(await readFile("data/evaluation/knowledge-readiness/manifest.json", "utf8")) as ReadinessManifest;
  const development = [structuredClone(JSON.parse(await readFile("data/evaluation/knowledge-readiness/development.json", "utf8"))[0]) as ReadinessCase];
  development[0]!.expectation.labelsComplete = false;
  const holdout = [{ ...structuredClone(development[0]!), id: "test-holdout", split: "holdout" as const, scenarioGroup: "test-holdout-group" }];
  ReadinessCaseSchema.parse(development[0]);
  ReadinessCaseSchema.parse(holdout[0]);
  const developmentBytes = JSON.stringify(development);
  const holdoutBytes = JSON.stringify(holdout);
  manifest.development.path = "development.json";
  manifest.holdout.path = "holdout.json";
  manifest.development.sha256 = createHash("sha256").update(developmentBytes).digest("hex");
  manifest.holdout.sha256 = createHash("sha256").update(holdoutBytes).digest("hex");
  const manifestBytes = JSON.stringify(manifest);
  await writeFile(join(root, "development.json"), developmentBytes);
  await writeFile(join(root, "holdout.json"), holdoutBytes);
  await writeFile(join(root, "manifest.json"), manifestBytes);

  const section = development[0]!.supportingSections[0]!;
  const retrieval: RetrievalResult = {
    metadata: { schemaVersion: 2, representationVersion: 3, generation: 7, lexicalGeneration: 7, semanticGeneration: 0, corpusHash: manifest.corpusHash, state: "ready" },
    lexical: { status: "used" },
    semantic: { status: "unavailable", reason: "provider-not-configured" },
    candidates: [{
      resourceKey: section.resourceKey,
      resourceType: "knowledge-article",
      lexical: { bestRank: 1, bestBm25Score: -1, matches: [{ representationId: section.representationIds[0]!, resourceKey: section.resourceKey, score: -1, rank: 1 }] },
      deterministicReferences: [{ resourceKey: section.resourceKey, channel: "deterministic-reference", sourceId: "fixture-reference", reason: "classifier-association" }],
      knownCauseReferences: [],
    }],
    referenceDiagnostics: [],
  };
  const labelHash = hashCanonicalRankingCapture(development.map(({ id, expectation, supportingSections }) => ({ id, expectation, supportingSections })));
  const basis: RankingInput["queryBasis"] = { queryHash: "1".repeat(64), ticketId: development[0]!.id, ticketRevision: 1, customerReplyWatermark: "seed" };
  const ranking = rankRetrieval({ contractVersion: 1, queryBasis: basis, retrieval, outputLimits }, { id: "lexical-only-v1", kind: "lexical-only" });
  const captureCase: RankingCaptureCase = {
    caseId: development[0]!.id,
    split: "development",
    caseSetHash: manifest.development.sha256,
    labelHash,
    manifestHash: createHash("sha256").update(manifestBytes).digest("hex"),
    corpusHash: manifest.corpusHash,
    contentSourceRevision: manifest.sourceRevision,
    queryFormatIdentity: { kind: "plain-query-v1", template: "query-text-v1" },
    providerKind: "none",
    model: null,
    representationVersion: 3,
    retrievalLimits,
    indexIdentity: ranking.retrievalIdentity,
    queryBasis: basis,
    retrieval,
    rankingProvenance: { contractVersion: 1, inputHash: ranking.inputHash, retrievalIdentity: ranking.retrievalIdentity, outputLimits, tieBreak: "ordinal-resource-key" },
    timingsMs: { retrieval: 2, provider: 0, ranking: null },
    traceTruncated: false,
  };
  const capturePath = join(root, "capture.json");
  await writeFile(capturePath, `${JSON.stringify(createRankingCapture({
    evaluatorSourceRevision: "evaluator-revision",
    identity: {
      split: "development",
      caseSetHash: manifest.development.sha256,
      labelHash,
      manifestHash: captureCase.manifestHash,
      caseIds: [captureCase.caseId],
      reviewStatus: "approved",
      sourceCutoff: manifest.cutoff,
      contentSourceRevision: manifest.sourceRevision,
      corpusHash: manifest.corpusHash,
      queryFormatIdentity: captureCase.queryFormatIdentity,
      providerKind: "none",
      model: null,
      representationVersion: 3,
      retrievalLimits,
      outputLimits,
      indexIdentity: ranking.retrievalIdentity,
    },
    cases: [captureCase],
  }))}\n`);
  return { root, caseSetPath: join(root, "manifest.json"), capturePath, development, manifest };
}

describe("B4 development ranking comparison", () => {
  it("rejects comparison outputs outside or physically escaping an injected B4 artifact root", async () => {
    const fixture = await rankingFixture();
    const artifactRootParent = await mkdtemp(join(tmpdir(), "b4-ranking-artifact-root-"));
    const artifactRoot = join(artifactRootParent, "approved");
    const outsideRoot = await mkdtemp(join(tmpdir(), "b4-ranking-artifact-outside-"));
    const escaped = join(artifactRoot, "escape");
    try {
      await mkdir(artifactRoot);
      await symlink(outsideRoot, escaped, "junction");
      const baseArgs = ["compare-development", "--capture", fixture.capturePath, "--case-set", fixture.caseSetPath, "--output-dir"];

      await expect(runRankingEvaluation([...baseArgs, join(artifactRootParent, "outside")], { artifactRoot })).rejects.toThrow(/B4 artifact root/i);
      await expect(runRankingEvaluation([...baseArgs, join(escaped, "comparison")], { artifactRoot })).rejects.toThrow(/B4 artifact root/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(artifactRootParent, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("replays five policies from one capture without reaching retrieval or providers", async () => {
    const fixture = await rankingFixture();
    const outputParent = await mkdtemp(join(tmpdir(), "b4-ranking-output-"));
    const outputDir = join(outputParent, "comparison");
    const retrieve = vi.spyOn(retrievalSearch, "retrieve");
    try {
      const report = await runRankingEvaluation(["compare-development", "--capture", fixture.capturePath, "--case-set", fixture.caseSetPath, "--output-dir", outputDir], { artifactRoot: outputParent });
      expect(retrieve).not.toHaveBeenCalled();
      expect(report.policies).toHaveLength(5);
      expect(report.policies.map((policy: any) => policy.policyKey)).toEqual([
        "lexical-only-v1", "semantic-only-v1", "rrf-equal-v1:10", "rrf-equal-v1:30", "rrf-equal-v1:60",
      ]);
      expect(new Set(report.policies.map((policy: any) => policy.captureHash))).toEqual(new Set([report.captureHash]));
      expect(report.policies.every((policy: any) => policy.caseInputHashes[0] === report.caseInputHashes[0])).toBe(true);
      expect(report.candidatePoolMetrics).toMatchObject({ eligibleCases: 1, requiredCoverage: expect.any(Object) });
      expect(report.policies[0].perTypeMetrics["knowledge-article"]).toMatchObject({ eligibleCases: 1, recallAt1: expect.any(Number), recallAt5: expect.any(Number), precisionAt1: null, precisionAt5: null, precisionEligibleCases: 0 });
      expect(report.policies[0].perTypeMetrics["resolved-ticket"]).toMatchObject({ eligibleCases: 0, qualityStatus: "unavailable-no-eligible-cases", recallAt1: null, recallAt5: null });
      expect(report.referenceMetrics).toMatchObject({ casesWithReferences: 1, membershipCount: 1 });
      expect(report.caseComparisons[0]).toMatchObject({ caseId: fixture.development[0]!.id, families: fixture.development[0]!.families, policyResults: expect.any(Object) });
      expect(report.policies[0]).toMatchObject({ sectionVisibility: { top1: { lexical: expect.any(Object), semantic: expect.any(Object) }, top5: expect.any(Object) }, rankingTimingMs: expect.any(Object) });

      const json = JSON.parse(await readFile(join(outputDir, "evaluation.json"), "utf8"));
      const markdown = await readFile(join(outputDir, "evaluation.md"), "utf8");
      expect(json).toEqual(report);
      expect(markdown).toContain(report.captureHash);
      expect(markdown).toContain("rrf-equal-v1:10");
      await expect(runRankingEvaluation(["compare-development", "--capture", fixture.capturePath, "--case-set", fixture.caseSetPath, "--output-dir", outputDir], { artifactRoot: outputParent })).rejects.toThrow(/existing|overwrite/i);
    } finally {
      retrieve.mockRestore();
      await rm(fixture.root, { recursive: true, force: true });
      await rm(outputParent, { recursive: true, force: true });
    }
  });

  it("refuses to write a comparison below the readiness case-set directory", async () => {
    const fixture = await rankingFixture();
    try {
      await expect(runRankingEvaluation(["compare-development", "--capture", fixture.capturePath, "--case-set", fixture.caseSetPath, "--output-dir", join(dirname(fixture.caseSetPath), "nested-output")], { artifactRoot: fixture.root })).rejects.toThrow(/readiness|case-set|experiment/i);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("accepts a valid development file through a symlinked case-set root", async () => {
    const fixture = await rankingFixture();
    const aliasParent = await mkdtemp(join(tmpdir(), "b4-ranking-case-set-alias-"));
    const outputParent = await mkdtemp(join(tmpdir(), "b4-ranking-case-set-output-"));
    const symlinkedRoot = join(aliasParent, "case-set");
    try {
      await symlink(fixture.root, symlinkedRoot, "junction");
      await expect(runRankingEvaluation([
        "compare-development", "--capture", fixture.capturePath,
        "--case-set", join(symlinkedRoot, "manifest.json"),
        "--output-dir", join(outputParent, "comparison"),
      ], { artifactRoot: outputParent })).resolves.toMatchObject({ evaluatedSplit: "development" });
    } finally {
      await rm(aliasParent, { recursive: true, force: true });
      await rm(fixture.root, { recursive: true, force: true });
      await rm(outputParent, { recursive: true, force: true });
    }
  });

  it("rejects an output directory under a symlinked case-set root by physical containment", async () => {
    const fixture = await rankingFixture();
    const aliasParent = await mkdtemp(join(tmpdir(), "b4-ranking-output-alias-"));
    const symlinkedRoot = join(aliasParent, "case-set");
    const outputDir = join(symlinkedRoot, "comparison-output");
    try {
      await symlink(fixture.root, symlinkedRoot, "junction");
      await expect(runRankingEvaluation([
        "compare-development", "--capture", fixture.capturePath,
        "--case-set", join(symlinkedRoot, "manifest.json"),
        "--output-dir", outputDir,
      ], { artifactRoot: symlinkedRoot })).rejects.toThrow(/readiness|case-set|inside|boundary/i);
      expect(existsSync(outputDir)).toBe(false);
    } finally {
      await rm(aliasParent, { recursive: true, force: true });
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects a development case file whose symlink target escapes the case-set directory", async () => {
    const fixture = await rankingFixture();
    const externalRoot = await mkdtemp(join(tmpdir(), "b4-ranking-external-"));
    const outputParent = await mkdtemp(join(tmpdir(), "b4-ranking-symlink-output-"));
    const linkPath = join(fixture.root, "linked-development.json");
    const externalPath = join(externalRoot, "development.json");
    try {
      const developmentBytes = await readFile(join(fixture.root, "development.json"));
      await writeFile(externalPath, developmentBytes);
      await rm(join(fixture.root, "development.json"));
      await symlink(externalPath, linkPath, "file");
      const manifest = JSON.parse(await readFile(fixture.caseSetPath, "utf8")) as ReadinessManifest;
      manifest.development.path = "linked-development.json";
      const manifestBytes = JSON.stringify(manifest);
      await writeFile(fixture.caseSetPath, manifestBytes);
      const capture = JSON.parse(await readFile(fixture.capturePath, "utf8")) as any;
      const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
      capture.identity.manifestHash = manifestHash;
      for (const captureCase of capture.cases) captureCase.manifestHash = manifestHash;
      capture.captureHash = hashCanonicalRankingCapture({ ...capture, captureHash: undefined });
      await writeFile(fixture.capturePath, `${JSON.stringify(capture)}\n`);

      await expect(runRankingEvaluation([
        "compare-development", "--capture", fixture.capturePath, "--case-set", fixture.caseSetPath,
        "--output-dir", join(outputParent, "comparison"),
      ], { artifactRoot: outputParent })).rejects.toThrow(/case-set|inside|boundary|canonical/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(externalRoot, { recursive: true, force: true });
      await rm(outputParent, { recursive: true, force: true });
    }
  });
});
