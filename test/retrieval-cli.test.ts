import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRetrievalIndex } from "../scripts/retrieval-index.js";
import * as retrievalEvaluation from "../scripts/evaluate-retrieval.js";
import { evaluateRetrieval, evaluationOptionsFor, formatQwen3RetrievalQuery, markdownReport, providerForEvaluation, QWEN3_RETRIEVAL_QUERY_FORMAT, QWEN3_RETRIEVAL_QUERY_INSTRUCTION } from "../scripts/evaluate-retrieval.js";
import { IndexManager } from "../src/retrieval/index-manager.js";
import { loadRetrievalV2Fixture } from "./retrieval-fixtures.js";
import { hashRepresentation, hashResource, REPRESENTATION_VERSION } from "../src/retrieval/representations.js";
import { RetrievalStore, RetrievalUpgradeSourceUnavailableError } from "../src/retrieval/sqlite-store.js";

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
