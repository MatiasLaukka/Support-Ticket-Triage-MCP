import { describe, expect, it } from "vitest";
import {
  responseQualityContracts,
  responseExemplars,
} from "../src/approval-desk/response-quality-contracts.js";
import { evaluateResponseQuality } from "../src/approval-desk/response-quality-evaluation.js";

describe("response quality evaluation", () => {
  const incidentContract = responseQualityContracts["ordinary-outage-triage"]!;
  const ambiguousCampaignContract = responseQualityContracts["ambiguous-campaign-editor"]!;

  it("passes a safe escalation that communicates the required incident concepts", () => {
    const score = evaluateResponseQuality({
      draft: "We are investigating the EU event delay and have escalated it to our incident response team. Please share event timestamps and request IDs.",
      contract: incidentContract,
      deterministicChecks: [],
    });

    expect(score.hardPass).toBe(true);
    expect(score.requiredConceptRecall).toBe(1);
    expect(score.relevantEvidencePrecision).toBe(1);
  });

  it("rejects an ambiguous diagnosis that claims a fix", () => {
    const score = evaluateResponseQuality({
      draft: "The campaign editor issue is fixed. Nothing else is needed.",
      contract: ambiguousCampaignContract,
      deterministicChecks: [],
    });

    expect(score.hardPass).toBe(false);
    expect(score.failures).toContain("forbidden claim: fixed");
  });

  it("treats non-passing deterministic checks as hard safety failures", () => {
    const score = evaluateResponseQuality({
      draft: "We are investigating the campaign editor and will provide an update.",
      contract: ambiguousCampaignContract,
      deterministicChecks: [{
        id: "internal-details",
        label: "No internal details",
        status: "warn",
        message: "Contains internal details.",
      }],
    });

    expect(score.hardPass).toBe(false);
    expect(score.failures).toContain("deterministic check: internal-details");
  });

  it("scores valid wording without comparing it to the review exemplar", () => {
    const alternateDraft = "The EU delay is under investigation. Incident response has been escalated. Please send timestamps and request IDs.";
    const score = evaluateResponseQuality({
      draft: alternateDraft,
      contract: incidentContract,
      deterministicChecks: [],
    });

    expect(alternateDraft).not.toBe(responseExemplars["ordinary-outage-triage"]);
    expect(score.hardPass).toBe(true);
    expect(score.requiredConceptRecall).toBe(1);
  });

  it("provides a separate review anchor and complete contract catalog", () => {
    expect(Object.keys(responseQualityContracts)).toHaveLength(11);
    expect(Object.keys(responseExemplars)).toEqual(Object.keys(responseQualityContracts));
  });
});
