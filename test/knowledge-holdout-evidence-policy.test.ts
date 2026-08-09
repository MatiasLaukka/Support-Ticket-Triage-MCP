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

describe("knowledge holdout evidence policy", () => {
  it("registers immutable policy-backed evidence expectations for every fixture", () => {
    const fixtures = knowledgeHoldoutFixtures();

    expect(Object.keys(expectedEvidence)).toEqual(fixtures.map(({ id }) => id));
    for (const fixture of fixtures) {
      const requiredIds = expectedEvidence[fixture.id as keyof typeof expectedEvidence];

      expect(fixture.evidencePolicy.requiredIds).toEqual(requiredIds);
      expect(fixture.expectedEvidenceIds).toEqual(requiredIds);
      expect(fixture.evidencePolicy.rationale.trim()).not.toBe("");
      expect(Object.isFrozen(fixture.evidencePolicy.requiredIds)).toBe(true);
      for (const id of fixture.evidencePolicy.requiredIds) {
        expect(findEvidenceRequirement(id)).toBeDefined();
      }
    }
  });
});
