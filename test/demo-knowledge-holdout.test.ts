import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runControlledKnowledgeHoldout } from "../scripts/evaluate-knowledge-holdout.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("controlled knowledge holdout CLI", () => {
  it("writes a deterministic allowlisted report for every fixture without private evaluation data", async () => {
    const reportDirectory = await mkdtemp(join(tmpdir(), "knowledge-holdout-report-"));
    roots.push(reportDirectory);

    const report = await runControlledKnowledgeHoldout({ reportDirectory });
    const json = await readFile(join(reportDirectory, "controlled-latest.json"), "utf8");
    const markdown = await readFile(join(reportDirectory, "controlled-latest.md"), "utf8");

    expect(report.run).toEqual({
      mode: "controlled-synthetic",
      asOf: "2026-08-08T12:00:00.000Z",
      clock: "2026-08-08T12:00:00.000Z",
      provider: "not-constructed",
    });
    expect(report.cases).toHaveLength(8);
    expect(report.cases.map(({ fixtureId }) => fixtureId)).toEqual(expect.arrayContaining([
      "sufficient-evidence-true-positive",
      "stale-version",
      "replacement-and-draft-isolation",
    ]));
    expect(report.cases[0]).toMatchObject({
      reusableKnowledge: { status: "available", issues: [] },
      readOnly: { baseline: true, learned: true },
      baseline: { lane: "baseline", turns: [expect.objectContaining({ turnIndex: 1 })] },
      learned: { lane: "learned", classificationContractPassed: expect.any(Boolean) },
      delta: expect.objectContaining({ unsafeLifecycleChanges: 0 }),
    });
    expect(report.scorecard).toEqual(expect.objectContaining({
      efficacy: expect.any(Object), governance: expect.any(Object), version: expect.any(Object),
    }));
    expect(report.limitation).toMatch(/synthetic\/controlled/i);
    expect(report.limitation).toMatch(/no human-time claim/i);
    expect(markdown).toContain("Controlled Knowledge Holdout Evaluation");

    expect(json).not.toMatch(/draftCustomerResponse|rationale|classificationSignals|conversation|customerReplies|previousSupportResponse|prompt|body|expectedOutcome/i);
    expect(markdown).not.toMatch(/draftCustomerResponse|rationale|classificationSignals|customerReplies|previousSupportResponse|prompt|Request ID:/i);
  });
});
