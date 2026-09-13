import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRetrievalIndex } from "../scripts/retrieval-index.js";
import * as retrievalEvaluation from "../scripts/evaluate-retrieval.js";
import { evaluateRetrieval, markdownReport, providerForEvaluation } from "../scripts/evaluate-retrieval.js";
import { IndexManager } from "../src/retrieval/index-manager.js";

describe("retrieval maintenance CLI", () => {
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
      representationVersion: 2,
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
    expect(JSON.stringify(report)).not.toContain("Webhook deliveries delayed by ten minutes");
    expect(markdown).toContain("## Per-type metrics");
    expect(markdown).toContain("## Per-family metrics");
    expect(markdown).toContain("Per-representation provenance");
    expect(markdown).toContain("Baseline comparison");
    expect(markdown).toContain("Unjudged hits");
    expect(report).toMatchObject({
      referenceChannelMetrics: expect.objectContaining({ deterministic: expect.any(Object), knownCause: expect.any(Object) }),
      gapBreakdown: expect.objectContaining({ retrievalMisses: expect.any(Array), corpusGaps: expect.any(Array), oracleReviewCandidates: expect.any(Array) }),
      approvedContrastCoverage: expect.objectContaining({ "webhook rotation/latency": expect.objectContaining({ status: "covered" }), "editor session/platform loading": expect.objectContaining({ status: "missing-counterpart" }) }),
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

  it("scores each retrieval channel in its own rank order and excludes null metrics from averages", () => {
    const candidates = [
      { resourceKey: "known-cause:rotation", resourceType: "known-cause", lexical: { bestRank: 2, bestBm25Score: -2, matches: [] }, deterministicReferences: [], knownCauseReferences: [] },
      { resourceKey: "knowledge-article:webhook", resourceType: "knowledge-article", lexical: { bestRank: 1, bestBm25Score: -1, matches: [] }, deterministicReferences: [], knownCauseReferences: [] },
    ];
    expect((retrievalEvaluation as any).rankedCandidateKeys(candidates, "lexical"))
      .toEqual(["knowledge-article:webhook", "known-cause:rotation"]);
    expect((retrievalEvaluation as any).averageApplicable([null, 0.5, 1])).toBe(0.75);
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
