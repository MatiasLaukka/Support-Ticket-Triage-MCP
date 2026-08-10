import { describe, expect, it } from "vitest";
import {
  knowledgeHoldoutFixtures,
} from "../src/knowledge-evolution/holdout-fixtures.js";
import {
  findEvidenceRequirement,
  type EvidenceRequirementId,
} from "../src/evidence-catalog.js";

const expectedEvidence = {
  "sufficient-evidence-true-positive": ["request-id"],
  "missing-evidence-then-supplied": ["request-id"],
  "near-miss": [],
  unrelated: [
    "invoice-number", "billing-account", "plan-or-promotion",
    "failure-timestamp", "error-banner",
  ],
  "stale-version": [
    "endpoint-url", "request-id", "api-response-status",
    "sample-payload", "failure-timestamp",
  ],
  "contradicted-version": [
    "endpoint-url", "request-id", "api-response-status",
    "sample-payload", "failure-timestamp",
  ],
  "draft-version-isolation": ["request-id"],
  "replacement-and-draft-isolation": ["request-id"],
} as const satisfies Record<string, readonly EvidenceRequirementId[]>;

const expectedSources = {
  "sufficient-evidence-true-positive": { kind: "approved-known-cause", objectId: "credential-rotation", version: 1 },
  "missing-evidence-then-supplied": { kind: "approved-known-cause", objectId: "credential-rotation", version: 1 },
  "near-miss": { kind: "successful-near-miss" },
  unrelated: { kind: "knowledge-article", articleId: "billing-and-invoices" },
  "stale-version": { kind: "knowledge-article", articleId: "api-reference" },
  "contradicted-version": { kind: "knowledge-article", articleId: "api-reference" },
  "draft-version-isolation": { kind: "approved-known-cause", objectId: "credential-rotation", version: 1 },
  "replacement-and-draft-isolation": { kind: "approved-known-cause", objectId: "credential-rotation", version: 2 },
} as const;

describe("knowledge holdout evidence policy", () => {
  it("registers immutable policy-backed evidence expectations for every fixture", () => {
    const fixtures = knowledgeHoldoutFixtures();

    expect(Object.keys(expectedEvidence)).toEqual(fixtures.map(({ id }) => id));
    for (const fixture of fixtures) {
      const requiredIds = expectedEvidence[fixture.id as keyof typeof expectedEvidence];

      expect(fixture.evidencePolicy.requiredIds).toEqual(requiredIds);
      expect(fixture.evidencePolicy.policySource).toEqual(expectedSources[fixture.id as keyof typeof expectedSources]);
      expect(fixture.expectedEvidenceIds).toEqual(requiredIds);
      expect(fixture.evidencePolicy.rationale.trim()).not.toBe("");
      expect(Object.isFrozen(fixture.evidencePolicy)).toBe(true);
      expect(Object.isFrozen(fixture.evidencePolicy.requiredIds)).toBe(true);
      expect(Object.isFrozen(fixture.evidencePolicy.policySource)).toBe(true);
      if (fixture.evidencePolicy.policySource.kind === "approved-known-cause") {
        expect(fixture.expectedTarget.knownCauseRef).toEqual({ objectId: fixture.evidencePolicy.policySource.objectId, version: fixture.evidencePolicy.policySource.version });
      }
      if (fixture.evidencePolicy.policySource.kind === "knowledge-article") {
        expect(fixture.expectedOutcome.knowledgeArticleIds).toContain(fixture.evidencePolicy.policySource.articleId);
      }
      if (fixture.evidencePolicy.policySource.kind === "successful-near-miss") {
        expect(fixture.scorecard.efficacyScenario).toBe("near-miss");
        expect(fixture.evidencePolicy.requiredIds).toEqual([]);
      }
      for (const id of fixture.evidencePolicy.requiredIds) {
        expect(findEvidenceRequirement(id)).toBeDefined();
      }
    }
  });
});
