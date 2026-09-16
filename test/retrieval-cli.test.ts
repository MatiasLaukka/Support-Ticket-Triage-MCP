import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRetrievalIndex } from "../scripts/retrieval-index.js";
import * as retrievalEvaluation from "../scripts/evaluate-retrieval.js";
import { evaluateRetrieval, evaluationOptionsFor, formatQwen3RetrievalQuery, markdownReport, providerForEvaluation, QWEN3_RETRIEVAL_QUERY_FORMAT, QWEN3_RETRIEVAL_QUERY_INSTRUCTION } from "../scripts/evaluate-retrieval.js";
import { IndexManager } from "../src/retrieval/index-manager.js";
import { loadRetrievalV2Fixture } from "./retrieval-fixtures.js";
import { hashRepresentation, hashResource, REPRESENTATION_VERSION } from "../src/retrieval/representations.js";
import { RetrievalStore, RetrievalUpgradeSourceUnavailableError } from "../src/retrieval/sqlite-store.js";
import * as embeddingProviders from "../src/retrieval/embedding-provider.js";
import type { ReadinessCase, ReadinessManifest } from "../src/retrieval/readiness-cases.js";
import * as retrievalSearch from "../src/retrieval/search.js";

async function readinessFixture(mutate?: (manifest: ReadinessManifest, development: ReadinessCase[], holdout: ReadinessCase[]) => void) {
  const root = await mkdtemp(join(tmpdir(), "readiness-cli-"));
  const manifest = JSON.parse(await readFile("data/evaluation/knowledge-readiness/manifest.json", "utf8")) as ReadinessManifest;
  const development = JSON.parse(await readFile("data/evaluation/knowledge-readiness/development.json", "utf8")) as ReadinessCase[];
  // Synthetic test-only holdout: never inspect or rank the frozen held-out scenarios.
  const holdout: ReadinessCase[] = [{ ...structuredClone(development[0]!), id: "test-holdout", split: "holdout", scenarioGroup: "test-holdout-group", provenance: { kind: "synthetic", basis: ["test"], derivedFrom: [] }, ticket: { ...development[0]!.ticket, subject: "DO-NOT-PRINT-HELD-OUT-QUERY", description: "DO-NOT-PRINT-HELD-OUT-QUERY" } }];
  mutate?.(manifest, development, holdout);
  for (const [split, cases] of [["development", development], ["holdout", holdout]] as const) {
    const bytes = JSON.stringify(cases);
    manifest[split].sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(root, `${split}.json`), bytes);
  }
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  return { root, caseSetPath: join(root, "manifest.json"), development };
}

describe("readiness evaluation CLI", () => {
  it.each(["index", "query"] as const)("surfaces semantic %s failures instead of reporting a degraded run as measured", async (stage) => {
    const fixture = await readinessFixture();
    try {
      const provider = { model: { id: "fake", revision: "1", dimensions: 1 }, embed: async (texts: readonly string[]) => {
        if (stage === "index" || texts.length === 1) throw new embeddingProviders.EmbeddingProviderError("PROVIDER_TIMEOUT", "private provider detail");
        return texts.map(() => [1]);
      } };
      const outcome = await evaluateRetrieval({ caseSetPath: fixture.caseSetPath, provider }).then(() => "resolved", (error: Error) => error.message);
      expect(outcome).toMatch(/semantic.*PROVIDER_TIMEOUT/i);
      expect(outcome).not.toContain("private provider detail");
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("writes identical JSON/Markdown identities to a fresh output and refuses reuse", async () => {
    const fixture = await readinessFixture();
    const outputDir = join(fixture.root, "offline-run");
    const args = ["--case-set", fixture.caseSetPath, "--output-dir", outputDir];
    try {
      await (retrievalEvaluation as any).runRetrievalEvaluation(args, {});
      const json = await readFile(join(outputDir, "evaluation.json"), "utf8");
      const markdown = await readFile(join(outputDir, "evaluation.md"), "utf8");
      expect(markdown).toBe(markdownReport(JSON.parse(json)));
      expect(json).not.toContain("DO-NOT-PRINT");
      await expect((retrievalEvaluation as any).runRetrievalEvaluation(args, {})).rejects.toThrow(/existing|historical/i);
      expect(await readFile(join(outputDir, "evaluation.json"), "utf8")).toBe(json);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("captures each development retrieval once into a complete sanitized B4 input", async () => {
    const fixture = await readinessFixture((_manifest, development) => { development.splice(1); });
    const outputDir = join(fixture.root, "offline-run");
    const capturePath = join(fixture.root, "ranking-capture.json");
    const retrieve = vi.spyOn(retrievalSearch, "retrieve");
    try {
      await retrievalEvaluation.runRetrievalEvaluation([
        "--case-set", fixture.caseSetPath,
        "--output-dir", outputDir,
        "--ranking-capture-output", capturePath,
      ], {});
      const capture = JSON.parse(await readFile(capturePath, "utf8")) as any;
      expect(capture).toMatchObject({
        formatVersion: 1,
        captureHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        identity: { split: "development", reviewStatus: "approved", caseIds: [fixture.development[0]!.id] },
        cases: [expect.objectContaining({ caseId: fixture.development[0]!.id, split: "development", traceTruncated: false })],
      });
      expect(capture.cases).toHaveLength(1);
      expect(retrieve).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(capture)).not.toContain("queryText");
    } finally {
      retrieve.mockRestore();
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not advertise a capture when development evaluation fails partway", async () => {
    const fixture = await readinessFixture((_manifest, development) => { development.splice(1); });
    const capturePath = join(fixture.root, "ranking-capture.json");
    const embed = vi.fn(async () => { throw new embeddingProviders.EmbeddingProviderError("PROVIDER_TIMEOUT", "private provider detail"); });
    try {
      await expect(retrievalEvaluation.evaluateRetrieval({
        caseSetPath: fixture.caseSetPath,
        provider: { model: { id: "fake", revision: "1", dimensions: 1 }, embed },
        rankingCaptureOutput: capturePath,
      } as any)).rejects.toThrow(/PROVIDER_TIMEOUT/i);
      await expect(readFile(capturePath, "utf8")).rejects.toThrow();
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("keeps any supporting match out of the best-section numerator and scores family/topic R@1 and R@5", async () => {
    const fixture = await readinessFixture((_m, development) => { development.splice(1); });
    const first = fixture.development[0]!;
    const key = first.supportingSections[0]!.resourceKey;
    const supporting = first.supportingSections[0]!.representationIds[0]!;
    const retrieve = vi.spyOn(retrievalSearch, "retrieve").mockResolvedValue({
      metadata: { schemaVersion: 1, representationVersion: 3, generation: 1, lexicalGeneration: 1, semanticGeneration: 0, corpusHash: "fixture", state: "ready" },
      lexical: { status: "used" }, semantic: { status: "unavailable" }, referenceDiagnostics: [],
      candidates: [{ resourceKey: key, resourceType: "knowledge-article", deterministicReferences: [], knownCauseReferences: [], lexical: { bestRank: 1, bestBm25Score: -2, matches: [{ representationId: `${key}:wrong`, resourceKey: key, score: -2, rank: 1 }, { representationId: supporting, resourceKey: key, score: -1, rank: 2 }] } }],
    });
    try {
      const report = await evaluateRetrieval({ caseSetPath: fixture.caseSetPath });
      expect(report.sectionSummary).toMatchObject({ lexical: { judged: 1, supportingBestMatch: 0, wrongBestSection: 1, supportingBestMatchRate: 0, lowerSupportingMatch: 1, anySupportingMatch: 1 }, semantic: { judged: 0, supportingBestMatchRate: null } });
      expect((report.perTopicMetrics as any)[first.topic]).toMatchObject({ perTypeMetrics: { "knowledge-article": { lexical: { recallAt1: expect.any(Number), recallAt5: expect.any(Number) } } } });
      expect((report.perFamilyMetrics as any)[first.families[0]!]).toMatchObject({ perTypeMetrics: { "knowledge-article": { lexical: { recallAt1: expect.any(Number), recallAt5: expect.any(Number) } } } });
      expect(report.developmentDisagreements).toEqual([]);
    } finally { retrieve.mockRestore(); await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("rejects holdout selection before constructing a configured provider", () => {
    const construct = vi.spyOn(embeddingProviders, "embeddingProviderFromEnv");
    try {
      expect(() => evaluationOptionsFor(["--case-set", "missing.json", "--split", "holdout", "--live-embeddings"], {})).toThrow(/holdout/i);
      expect(construct).not.toHaveBeenCalled();
    } finally { construct.mockRestore(); }
  });

  it.each([
    [["--case-set"], /requires.*path/i],
    [["--case-set", "missing.json"], /explicit.*output-dir/i],
    [["--case-set", "missing.json", "--output-dir", "reports/retrieval"], /historical|existing/i],
    [["--split", "development"], /requires.*case-set/i],
    [["--validate-cases-only"], /requires.*case-set/i],
    [["--live-embeddings", "--live-embeddings"], /duplicate/i],
    [["--split", "development", "--split", "holdout"], /duplicate|holdout/i],
    [["--case-set", "missing.json", "--validate-cases-only", "--live-embeddings", "--output-dir", "new-readiness-run"], /conflict|validation-only/i],
    [["--ranking-capture-output", "capture.json"], /case-set/i],
  ] as const)("rejects invalid readiness options %j", (args, expected) => {
    expect(() => evaluationOptionsFor(args, {})).toThrow(expected);
  });

  it("rejects ranking capture output in validation-only mode", async () => {
    const fixture = await readinessFixture();
    try {
      expect(() => evaluationOptionsFor([
        "--case-set", fixture.caseSetPath,
        "--validate-cases-only",
        "--ranking-capture-output", join(fixture.root, "capture.json"),
        "--output-dir", join(fixture.root, "validation"),
      ], {})).toThrow(/capture|validation-only/i);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("validates both files without retrieval, provider construction, query output, or holdout labels", async () => {
    const fixture = await readinessFixture();
    const embed = vi.fn(async (texts: readonly string[]) => texts.map(() => [1]));
    const construct = vi.spyOn(embeddingProviders, "embeddingProviderFromEnv");
    const refresh = vi.spyOn(IndexManager.prototype, "refresh");
    try {
      const options = evaluationOptionsFor(["--case-set", fixture.caseSetPath, "--validate-cases-only", "--output-dir", join(fixture.root, "validation")], {});
      const report = await evaluateRetrieval({ ...options, provider: { model: { id: "fake", revision: "1", dimensions: 1 }, embed } });
      expect(report).toMatchObject({ mode: "readiness-validation-only", validation: { developmentCount: fixture.development.length, holdoutCount: 1 }, evaluatedSplit: null, holdoutExecuted: false });
      expect(report.candidatePools).toBeUndefined();
      expect(JSON.stringify(report)).not.toContain("test-holdout");
      expect(markdownReport(report)).not.toContain("DO-NOT-PRINT");
      expect(construct).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
    } finally { construct.mockRestore(); refresh.mockRestore(); await rm(fixture.root, { recursive: true, force: true }); }
  });

  it.each([
    ["pending review", (_m: ReadinessManifest, d: ReadinessCase[]) => { d[0]!.review = { status: "pending" }; }, /approved review/i],
    ["wrong representation version", (m: ReadinessManifest) => { (m as any).representationVersion = 2; }, /representation version/i],
    ["corpus mismatch", (m: ReadinessManifest) => { m.corpusHash = "0".repeat(64); }, /corpus.*hash/i],
    ["stale section binding", (_m: ReadinessManifest, d: ReadinessCase[]) => { d[0]!.supportingSections[0]!.sourceHash = "0".repeat(64); }, /source hash/i],
    ["unsafe case ID", (_m: ReadinessManifest, d: ReadinessCase[]) => { d[0]!.id = "unsafe | query\ntext"; }, /safe.*case.*id/i],
    ["traversal", (m: ReadinessManifest) => { m.development.path = "../development.json"; }, /case-set directory/i],
    ["absolute manifest path", (m: ReadinessManifest) => { m.development.path = "C:/outside/development.json"; }, /case-set directory/i],
  ] as const)("rejects %s before any embedding call", async (_name, mutate, expected) => {
    const fixture = await readinessFixture(mutate);
    const embed = vi.fn(async (texts: readonly string[]) => texts.map(() => [1]));
    try {
      await expect(evaluateRetrieval({ caseSetPath: fixture.caseSetPath, provider: { model: { id: "fake", revision: "1", dimensions: 1 }, embed } })).rejects.toThrow(expected);
      expect(embed).not.toHaveBeenCalled();
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("checks case byte hashes before parsing scored inputs", async () => {
    const fixture = await readinessFixture();
    const embed = vi.fn(async (texts: readonly string[]) => texts.map(() => [1]));
    try {
      await writeFile(join(fixture.root, "development.json"), "invalid json");
      await expect(evaluateRetrieval({ caseSetPath: fixture.caseSetPath, provider: { model: { id: "fake", revision: "1", dimensions: 1 }, embed } })).rejects.toThrow(/development.*hash/i);
      expect(embed).not.toHaveBeenCalled();
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("scores only development through shared retrieval with section denominators and distinct source identities", async () => {
    const fixture = await readinessFixture((manifest) => { manifest.sourceRevision = "frozen-content-revision"; });
    const embedded: string[] = [];
    try {
      const report = await evaluateRetrieval({ caseSetPath: fixture.caseSetPath, semanticQueryFormat: QWEN3_RETRIEVAL_QUERY_FORMAT, provider: { model: { id: "fake", revision: "1", dimensions: 1 }, embed: async (texts) => { embedded.push(...texts); return texts.map(() => [1]); } } });
      expect(report).toMatchObject({ evaluatedSplit: "development", holdoutExecuted: false, contentSourceRevision: "frozen-content-revision", sourceCommit: expect.stringMatching(/^[0-9a-f]{40}$/), scenarioCount: fixture.development.length, sectionSummary: { lexical: { judged: expect.any(Number), excluded: expect.any(Object), supportingBestMatch: expect.any(Number), lowerSupportingMatch: expect.any(Number) }, semantic: expect.any(Object) }, developmentDisagreements: expect.any(Array), articleSizes: expect.any(Array), perTopicMetrics: expect.any(Object) });
      const pools = report.candidatePools as any[];
      expect(pools.map((pool) => pool.ticketId)).toEqual(fixture.development.map((entry) => entry.id));
      expect(pools[0]).toMatchObject({ sectionDiagnostics: expect.any(Array), labelsComplete: expect.any(Boolean) });
      expect(embedded.some((text) => text.startsWith("Instruct:"))).toBe(true);
      expect(embedded.join("\n")).not.toContain("DO-NOT-PRINT");
      const markdown = markdownReport(report);
      expect(markdown).toContain(String(report.contentSourceRevision));
      expect(markdown).toContain(String(report.corpusHash));
      expect(markdown).toContain("## Section evidence");
      expect(markdown).toContain(JSON.stringify(report.sectionSummary));
      expect(markdown).not.toContain("DO-NOT-PRINT");
      expect(JSON.stringify(report)).not.toContain(fixture.development[0]!.ticket.subject);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });
});

describe("retrieval maintenance CLI", () => {
  it.each(["learned-known-cause", "resolved-ticket"] as const)("retains cached %s rows when static-only CLI rebuild refuses their unavailable source", async (family) => {
    const root = await mkdtemp(join(tmpdir(), "retrieval-cli-cache-"));
    const store = RetrievalStore.open(join(root, "retrieval.sqlite"));
    const type = family === "resolved-ticket" ? "resolved-ticket" : "known-cause";
    const key = `${type}:cached` as const;
    const resource = { key, type, sourceId: "cached", family, linkedResourceKeys: [] } as const;
    const representation = { id: `${key}:canonical:0`, resourceKey: key, kind: "canonical", ordinal: 0, title: "Cached source", keywords: [], lexicalText: "Cached source", semanticText: "Cached source" };
    const representations = [{ ...representation, contentHash: hashRepresentation(representation) }];
    try {
      store.initialize();
      store.reconcile({ resources: [{ resource: { ...resource, contentHash: hashResource(resource, representations) }, representations }], unavailableFamilies: [] });
      const before = store.readSnapshot("");
      await expect(runRetrievalIndex(["rebuild"], root)).rejects.toBeInstanceOf(RetrievalUpgradeSourceUnavailableError);
      expect(store.readSnapshot("")).toEqual(before);
    } finally { store.close(); await rm(root, { recursive: true, force: true }); }
  });

  it("reports upgrade-required status and only upgrades v2 through explicit static-source rebuild", async () => {
    const root = await mkdtemp(join(tmpdir(), "retrieval-v2-cli-"));
    loadRetrievalV2Fixture(join(root, "retrieval.sqlite")).close();
    try {
      await expect(runRetrievalIndex(["status"], root)).resolves.toMatchObject({ status: "upgrade-required", code: "INDEX_UPGRADE_REQUIRED", instruction: expect.stringContaining("npm run retrieval:index -- rebuild") });
      await expect(runRetrievalIndex(["refresh"], root)).rejects.toMatchObject({ code: "INDEX_UPGRADE_REQUIRED" });
      await expect(runRetrievalIndex(["validate"], root)).rejects.toMatchObject({ code: "INDEX_UPGRADE_REQUIRED" });
      await expect(runRetrievalIndex(["rebuild"], root)).resolves.toMatchObject({ status: "refreshed", sourceScope: "static-only", unavailableFamilies: ["learned-known-cause", "resolved-ticket"], metadata: { representationVersion: 3, semanticGeneration: 0 } });
      const store = RetrievalStore.open(join(root, "retrieval.sqlite"));
      try { expect(() => store.validate()).not.toThrow(); } finally { store.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("reports absent status without creating a database and rejects unknown commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "retrieval-cli-"));
    try {
      await expect(runRetrievalIndex(["status"], root)).resolves.toMatchObject({ status: "absent" });
      await expect(runRetrievalIndex(["unknown"], root)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("closes the index manager when refresh fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "retrieval-cli-failure-"));
    const refresh = vi.spyOn(IndexManager.prototype, "refresh").mockRejectedValueOnce(new Error("refresh failed"));
    const close = vi.spyOn(IndexManager.prototype, "close");
    try {
      await expect(runRetrievalIndex(["refresh"], root)).rejects.toThrow("refresh failed");
      expect(close).toHaveBeenCalledOnce();
    } finally {
      refresh.mockRestore();
      close.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns a frozen, channel-complete offline evaluation report", async () => {
    const report = await evaluateRetrieval();
    const markdown = markdownReport(report);
    expect(report).toMatchObject({
      mode: "offline-lexical-only",
      semanticEvidence: "outstanding",
      representationVersion: REPRESENTATION_VERSION,
      indexGeneration: expect.any(Number),
      lexicalGeneration: expect.any(Number),
      semanticGeneration: expect.any(Number),
      ftsTokenization: expect.any(String),
      oracleHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      corpusHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      candidatePools: expect.arrayContaining([
        expect.objectContaining({ ticketId: "TKT-1017", channelStatuses: { lexical: "used", semantic: "unavailable" } }),
      ]),
      perTypeMetrics: expect.objectContaining({
        "knowledge-article": expect.any(Object),
        "known-cause": expect.any(Object),
        "diagnostic-playbook": expect.any(Object),
        "resolved-ticket": expect.any(Object),
      }),
      excludedCounts: expect.objectContaining({
        incompletePrecision: expect.any(Number),
        semanticUnavailable: expect.any(Number),
      }),
      reviewedContrastFamilies: expect.arrayContaining(["webhook rotation/latency", "editor session/platform loading"]),
    });
    expect(markdown).toContain("Index generation:");
    expect(JSON.stringify(report)).not.toContain("Webhook deliveries delayed by ten minutes");
    expect(markdown).toContain("## Per-type metrics");
    expect(markdown).toContain("## Per-family metrics");
    expect(markdown).toContain("Per-representation provenance");
    expect(markdown).toContain("Baseline comparison");
    expect(markdown).toContain("Unjudged hits");
    expect(report).toMatchObject({
      referenceChannelMetrics: expect.objectContaining({ deterministic: expect.any(Object), knownCause: expect.any(Object) }),
      gapBreakdown: expect.objectContaining({ retrievalMisses: expect.any(Array), corpusGaps: expect.any(Array), oracleReviewCandidates: expect.any(Array) }),
      approvedContrastCoverage: expect.objectContaining({ "webhook rotation/latency": expect.objectContaining({ status: "covered" }), "editor session/platform loading": expect.objectContaining({ status: "covered", syntheticFixtureIds: ["synthetic-editor-browser-session"] }) }),
      resolvedCaseEvaluation: expect.objectContaining({ status: "corpus-gap" }),
      candidatePools: expect.arrayContaining([expect.objectContaining({ referencePools: expect.objectContaining({ deterministic: expect.any(Object), knownCause: expect.any(Object) }) })]),
    });
    expect(markdown).toContain("## Reference channel pools");
  });

  it("requires an explicit complete provider tuple for live evaluation", () => {
    expect(providerForEvaluation([], {})).toBeUndefined();
    expect(() => providerForEvaluation(["--live-embeddings"], { TRIAGE_EMBEDDING_MODEL: "model-only" })).toThrow(/complete .* tuple/i);
    expect(() => providerForEvaluation(["--unexpected"], {})).toThrow(/Unknown retrieval evaluation option/);
  });

  it("records the explicit Qwen query-only instruction and isolates a requested output directory", () => {
    const options = evaluationOptionsFor([
      "--live-embeddings",
      "--qwen3-retrieval-instruction",
      "--output-dir",
      "reports/retrieval/semantic-qwen",
    ], {
      TRIAGE_EMBEDDING_ENDPOINT: "http://localhost:11434/v1/embeddings",
      TRIAGE_EMBEDDING_MODEL: "qwen3-embedding:0.6b",
      TRIAGE_EMBEDDING_REVISION: "ac6da0dfba84",
      TRIAGE_EMBEDDING_DIMENSIONS: "1024",
    });
    expect(options.semanticQueryFormat).toEqual({
      kind: "qwen3-retrieval-instruction-v1",
      instruction: QWEN3_RETRIEVAL_QUERY_INSTRUCTION,
      template: "Instruct: {instruction}\n Query:{query}",
    });
    expect(options.outputDir).toBe("reports/retrieval/semantic-qwen");
    expect(() => evaluationOptionsFor(["--qwen3-retrieval-instruction"], {})).toThrow(/requires --live-embeddings/i);
  });

  it("rejects the Qwen-specific instruction for a non-Qwen embedding model", () => {
    expect(() => evaluationOptionsFor(["--live-embeddings", "--qwen3-retrieval-instruction"], {
      TRIAGE_EMBEDDING_ENDPOINT: "http://localhost:11434/v1/embeddings",
      TRIAGE_EMBEDDING_MODEL: "text-embedding-3-small",
      TRIAGE_EMBEDDING_REVISION: "r1",
      TRIAGE_EMBEDDING_DIMENSIONS: "1024",
    })).toThrow(/requires a qwen3-embedding model/i);
  });

  it("records the newline-bearing template that it sends to Qwen", () => {
    expect(QWEN3_RETRIEVAL_QUERY_FORMAT.template).toBe("Instruct: {instruction}\n Query:{query}");
    expect(formatQwen3RetrievalQuery("webhook secret")).toBe(
      QWEN3_RETRIEVAL_QUERY_FORMAT.template
        .replace("{instruction}", QWEN3_RETRIEVAL_QUERY_FORMAT.instruction)
        .replace("{query}", "webhook secret"),
    );
  });

  it("formats only semantic evaluation queries and records the configured format", async () => {
    const inputs: string[][] = [];
    const report = await evaluateRetrieval({
      provider: {
        model: { id: "fixture", revision: "1", dimensions: 1 },
        embed: async (texts) => { inputs.push([...texts]); return texts.map(() => [1]); },
      },
      semanticQueryFormat: QWEN3_RETRIEVAL_QUERY_FORMAT,
    });

    expect(inputs.filter((texts) => texts.length === 1).map(([text]) => text))
      .toEqual(expect.arrayContaining([expect.stringMatching(/^Instruct: Given a support ticket, retrieve relevant support resources\.\n Query:/)]));
    expect(inputs.filter((texts) => texts.length > 1).flat()).not.toContainEqual(expect.stringMatching(/^Instruct:/));
    expect(report).toMatchObject({
      semanticQueryFormatting: QWEN3_RETRIEVAL_QUERY_FORMAT,
      timingsMs: expect.objectContaining({ embeddingCalls: expect.any(Number), embeddingInputs: expect.any(Number) }),
    });
  });

  it("scores each retrieval channel in its own rank order and excludes null metrics from averages", () => {
    const candidates = [
      { resourceKey: "known-cause:rotation", resourceType: "known-cause", lexical: { bestRank: 2, bestBm25Score: -2, matches: [] }, deterministicReferences: [], knownCauseReferences: [] },
      { resourceKey: "knowledge-article:webhook", resourceType: "knowledge-article", lexical: { bestRank: 1, bestBm25Score: -1, matches: [] }, deterministicReferences: [], knownCauseReferences: [] },
    ];
    expect((retrievalEvaluation as any).rankedCandidateKeys(candidates, "lexical"))
      .toEqual(["knowledge-article:webhook", "known-cause:rotation"]);
    expect((retrievalEvaluation as any).averageApplicable([null, 0.5, 1])).toBe(0.75);
  });

  it("uses only article requirements as the deterministic baseline denominator", () => {
    expect((retrievalEvaluation as any).deterministicArticleRequiredCoverage(
      ["knowledge-article:rotation"],
      ["knowledge-article:rotation", "known-cause:webhook-delivery-latency"],
    )).toBe(1);
    expect((retrievalEvaluation as any).deterministicArticleRequiredCoverage(
      ["knowledge-article:rotation"],
      ["known-cause:webhook-delivery-latency"],
    )).toBeNull();
  });

  it("rejects retrieval labels absent from the frozen corpus", () => {
    expect(() => (retrievalEvaluation as any).validateLabelsAgainstCorpus([
      { ticketId: "TKT-0001", retrieval: { requiredResourceKeys: ["knowledge-article:missing"], relevantResourceKeys: ["knowledge-article:missing"], hardNegativeResourceKeys: [], labelsComplete: true, resourceCoverage: {} } },
    ], new Set(["knowledge-article:present"]))).toThrow(/not present in the frozen corpus/i);
  });

  it("excludes resolved-case snapshots created after the frozen evaluation cutoff", () => {
    const snapshots = [
      { ticket: { id: "TKT-PAST", updatedAt: "2026-09-12T23:59:59.999Z" } },
      { ticket: { id: "TKT-FUTURE", updatedAt: "2026-09-13T00:00:00.000Z" } },
    ];

    expect((retrievalEvaluation as any).snapshotsAtOrBeforeCutoff(snapshots).map((snapshot: any) => snapshot.ticket.id))
      .toEqual(["TKT-PAST"]);
  });
});
