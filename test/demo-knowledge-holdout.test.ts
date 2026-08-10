import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { knowledgeHoldoutFixtures } from "../src/knowledge-evolution/holdout-fixtures.js";
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
    expect(report.cases).toHaveLength(knowledgeHoldoutFixtures().length);
    expect(report.cases.map(({ fixtureId }) => fixtureId)).toEqual([
      "sufficient-evidence-true-positive",
      "missing-evidence-then-supplied",
      "near-miss",
      "unrelated",
      "stale-version",
      "contradicted-version",
      "draft-version-isolation",
      "replacement-and-draft-isolation",
    ]);
    const fixtureById = new Map(knowledgeHoldoutFixtures().map((fixture) => [fixture.id, fixture]));
    for (const entry of report.cases) {
      const fixture = fixtureById.get(entry.fixtureId);
      expect(fixture).toBeDefined();
      expect(entry.reusableKnowledge.status).toMatch(/^(available|ledger-unavailable)$/);
      expect(entry.reusableKnowledge.issues).toEqual(expect.any(Array));
      expect(entry.readOnly).toEqual({ baseline: true, learned: true });
      expect(entry.evidencePolicy).toEqual({
        requiredIds: fixture!.evidencePolicy.requiredIds,
        reasonCode: fixture!.evidencePolicy.reasonCode,
      });
      for (const [laneName, lane] of [["baseline", entry.baseline], ["learned", entry.learned]] as const) {
        expect(lane.lane).toBe(laneName);
        expect(typeof lane.classificationContractPassed).toBe("boolean");
        expect(lane.turns).toHaveLength(fixture!.turns.length);
        expect(typeof lane.targetReached).toBe("boolean");
        expect(lane.turnsToExpectedTarget === null || typeof lane.turnsToExpectedTarget === "number").toBe(true);
        for (const turn of lane.turns) {
          expect(turn).toEqual(expect.objectContaining({
            turnIndex: expect.any(Number), category: expect.any(String), priority: expect.any(String),
            team: expect.any(String), supportState: expect.any(String), requestedEvidenceIds: expect.any(Array),
            providedEvidenceIds: expect.any(Array), missingEvidenceIds: expect.any(Array),
            unsafeLifecycleViolations: expect.any(Array), correctionRequired: expect.any(Boolean),
          }));
        }
      }
      expect(entry.delta).toEqual(expect.objectContaining({
        learnedMatchedExpectedKnowledge: expect.any(Boolean), baselineUnnecessaryEvidence: expect.any(Number),
        learnedUnnecessaryEvidence: expect.any(Number), unnecessaryEvidenceDelta: expect.any(Number),
        baselineMissingNecessaryEvidence: expect.any(Number), learnedMissingNecessaryEvidence: expect.any(Number),
        missingNecessaryEvidenceDelta: expect.any(Number), repeatedEvidenceRequestCount: expect.any(Number),
        unsafeLifecycleChanges: expect.any(Number), correctionRequired: expect.any(Boolean),
      }));
      expect(entry.comparison).toMatch(/^(benefited|unchanged|regressed)$/);
    }
    expect(report.cases.find(({ fixtureId }) => fixtureId === "stale-version")?.reusableKnowledge.issues).toEqual([
      { scope: "version", objectId: "credential-rotation", version: 1, code: "unhealthy-version" },
    ]);
    expect(report.cases.find(({ fixtureId }) => fixtureId === "contradicted-version")?.reusableKnowledge.issues).toEqual([
      { scope: "version", objectId: "credential-rotation", version: 1, code: "unhealthy-version" },
    ]);
    expect(report.cases.find(({ fixtureId }) => fixtureId === "draft-version-isolation")?.learned.turns.at(-1)?.knownCauseRef).toEqual({ objectId: "credential-rotation", version: 1 });
    expect(report.cases.find(({ fixtureId }) => fixtureId === "replacement-and-draft-isolation")?.learned.turns.at(-1)?.knownCauseRef).toEqual({ objectId: "credential-rotation", version: 2 });
    expect(report.scorecard).toEqual(expect.objectContaining({
      efficacy: expect.objectContaining({ baseline: expect.any(Object), learned: expect.any(Object), knowledgeMatchPrecision: expect.any(Number), knowledgeMatchRecall: expect.any(Number) }),
      governance: expect.objectContaining({ staleFalsePositiveRate: expect.any(Number), contradictedFalsePositiveRate: expect.any(Number), unsafeLifecycleChanges: expect.any(Number) }),
      version: expect.objectContaining({ wrongVersionReuse: expect.any(Number), replacementCorrectnessRate: expect.any(Number), versionPinningRate: expect.any(Number) }),
    }));
    expect(report.limitation).toMatch(/synthetic\/controlled/i);
    expect(report.limitation).toMatch(/no human-time claim/i);
    expect(markdown).toContain("Controlled Knowledge Holdout Evaluation");
    expect(markdown).toContain("Evidence policy");
    expect(markdown).toContain("approved-known-cause-required");
    expect(markdown).toContain("request-id");

    expect(json).not.toMatch(/draftCustomerResponse|rationale|classificationSignals|conversation|customerReplies|previousSupportResponse|prompt|body|expectedOutcome|req_holdout_001/i);
    expect(markdown).not.toMatch(/draftCustomerResponse|rationale|classificationSignals|customerReplies|previousSupportResponse|prompt|Request ID:/i);
  });
});
