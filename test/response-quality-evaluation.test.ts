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

  it("matches required concepts without regard to case", () => {
    const score = evaluateResponseQuality({
      draft: "WE ARE INVESTIGATING THE EU EVENT DELAY and have ESCALATED it to INCIDENT RESPONSE. Please share TIMESTAMPS and REQUEST IDS.",
      contract: incidentContract,
      deterministicChecks: [],
    });

    expect(score.requiredConceptRecall).toBe(1);
    expect(score.hardPass).toBe(true);
  });

  it("recognizes relevant evidence in a normal question", () => {
    const score = evaluateResponseQuality({
      draft: "Could you share the request ID?",
      contract: {
        scenarioId: "question-evidence",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: ["request id"],
        requiredEscalation: null,
        forbiddenClaims: [],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.relevantEvidencePrecision).toBe(1);
    expect(score.unnecessaryQuestionCount).toBe(0);
  });

  it("counts unrelated questions separately from relevant evidence", () => {
    const score = evaluateResponseQuality({
      draft: "Could you share the request ID? Could you describe your preferred color?",
      contract: {
        scenarioId: "mixed-questions",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: ["request id"],
        requiredEscalation: null,
        forbiddenClaims: [],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.relevantEvidencePrecision).toBe(0.5);
    expect(score.unnecessaryQuestionCount).toBe(1);
    expect(score.failures).toContain("unnecessary question");
  });

  it("reports a tone mismatch and excessive length", () => {
    const score = evaluateResponseQuality({
      draft: "We are investigating this issue with the platform team today.",
      contract: {
        scenarioId: "technical-length",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: [],
        requiredEscalation: null,
        forbiddenClaims: [],
        tone: "technical",
        maxWords: 4,
      },
      deterministicChecks: [],
    });

    expect(score.tone.pass).toBe(false);
    expect(score.length.pass).toBe(false);
    expect(score.failures).toContain("tone mismatch: technical");
    expect(score.failures).toContain("length exceeds maximum: 10/4");
  });

  it("treats a missing required escalation as a hard failure", () => {
    const score = evaluateResponseQuality({
      draft: "We are investigating the EU event delay. Please share event timestamps and request IDs.",
      contract: incidentContract,
      deterministicChecks: [],
    });

    expect(score.hardPass).toBe(false);
    expect(score.failures).toContain("missing escalation: escalated");
  });

  it("does not treat a negated fix claim as a forbidden positive claim", () => {
    const score = evaluateResponseQuality({
      draft: "The campaign editor is not fixed. We are investigating it. Please try a private window and share any browser console error.",
      contract: ambiguousCampaignContract,
      deterministicChecks: [],
    });

    expect(score.forbiddenClaimCount).toBe(0);
    expect(score.hardPass).toBe(true);
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
