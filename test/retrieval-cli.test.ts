import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRetrievalIndex } from "../scripts/retrieval-index.js";
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
      representationVersion: 1,
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
  });

  it("requires an explicit complete provider tuple for live evaluation", () => {
    expect(providerForEvaluation([], {})).toBeUndefined();
    expect(() => providerForEvaluation(["--live-embeddings"], { TRIAGE_EMBEDDING_MODEL: "model-only" })).toThrow(/complete .* tuple/i);
    expect(() => providerForEvaluation(["--unexpected"], {})).toThrow(/Unknown retrieval evaluation option/);
  });
});
