import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runKnowledgeEvolutionShowcase } from "../scripts/demo-knowledge-evolution.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("learning ledger showcase", () => {
  it("proves verified outcome, promotion, reuse, contradiction, stale decay, and immutable history", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "learning-ledger-showcase-"));
    roots.push(dataRoot);
    const report = await runKnowledgeEvolutionShowcase({ root: resolve("."), dataRoot, mode: "controlled", verbose: true });

    expect(report.learning).toEqual({
      maturityBeforeStale: "reuse-validated",
      healthBeforeStale: "active",
      healthAfterStale: "stale",
      verifiedOutcomeCount: 1,
      failedReuseRecorded: true,
      historicalRecommendationUnchanged: true,
    });
    expect(report.output).toContain("## Learning ledger");
    expect(report.output).toContain("Failed reuse retained: true");
    expect(report.output).toContain("Historical recommendation: byte-for-byte unchanged");
  });
});
