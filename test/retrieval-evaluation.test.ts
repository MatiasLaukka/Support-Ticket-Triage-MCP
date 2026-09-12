import { describe, expect, it } from "vitest";
import { RetrievalExpectationSchema, scorePool, scoreRanked } from "../src/retrieval/evaluation.js";

describe("retrieval evaluation", () => {
  it("scores pool coverage and leaves incomplete precision unscored", () => {
    const oracle = RetrievalExpectationSchema.parse({ requiredResourceKeys: ["knowledge-article:a"], relevantResourceKeys: ["knowledge-article:a", "knowledge-article:b"], hardNegativeResourceKeys: ["knowledge-article:c"], labelsComplete: false, resourceCoverage: { "knowledge-article": "adequate", "known-cause": "not-expected", "diagnostic-playbook": "missing", "resolved-ticket": "not-expected" } });
    expect(scorePool(["knowledge-article:a"], oracle).candidateRecall).toBe(0.5);
    expect(scorePool(["knowledge-article:a"], oracle).requiredCoverage).toBe(1);
    expect(scoreRanked(["knowledge-article:a"], oracle, 5).precisionAtK).toBeNull();
  });

  it("rejects required keys outside relevant and overlapping hard negatives", () => {
    expect(() => RetrievalExpectationSchema.parse({ requiredResourceKeys: ["knowledge-article:a"], relevantResourceKeys: [], hardNegativeResourceKeys: [], labelsComplete: true, resourceCoverage: { "knowledge-article": "adequate", "known-cause": "missing", "diagnostic-playbook": "missing", "resolved-ticket": "missing" } })).toThrow();
  });

  it("accepts the namespaced learned-cause resource identity", () => {
    const parsed = RetrievalExpectationSchema.parse({
      requiredResourceKeys: ["known-cause:learned/sms-quiet-hours"],
      relevantResourceKeys: ["known-cause:learned/sms-quiet-hours"],
      hardNegativeResourceKeys: [],
      labelsComplete: true,
      resourceCoverage: { "knowledge-article": "missing", "known-cause": "adequate", "diagnostic-playbook": "missing", "resolved-ticket": "not-expected" },
    });
    expect(parsed.requiredResourceKeys[0]).toContain("learned/");
  });
});
