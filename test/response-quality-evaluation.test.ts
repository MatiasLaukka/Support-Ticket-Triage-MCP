import { describe, expect, it } from "vitest";
import {
  responseQualityContracts,
  responseExemplars,
} from "../src/approval-desk/response-quality-contracts.js";
import { evaluateResponseQuality } from "../src/approval-desk/response-quality-evaluation.js";
import { loadDiagnosticEvaluationScenarios } from "../src/approval-desk/diagnostic-evaluation-scenarios.js";

describe("response quality evaluation", () => {
  const incidentContract = responseQualityContracts["ordinary-outage-triage"]!;
  const ambiguousCampaignContract = responseQualityContracts["ambiguous-campaign-editor"]!;

  it("passes a safe escalation that communicates the required incident concepts", () => {
    const score = evaluateResponseQuality({
      draft: "We are investigating the platform delay affecting event processing and profile timelines under incident review. Please share the store URL, profile email or customer ID, event ID or event time, request ID, and API response status.",
      contract: incidentContract,
      deterministicChecks: [],
    });

    expect(score.hardPass).toBe(true);
    expect(score.requiredConceptRecall).toBe(1);
    expect(score.relevantEvidencePrecision).toBe(1);
    expect(score.requiredEvidenceRecall).toBe(1);
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
      draft: "WE ARE INVESTIGATING THE PLATFORM DELAY affecting EVENT PROCESSING and PROFILE TIMELINES under INCIDENT REVIEW. Please share the STORE URL, PROFILE EMAIL, EVENT ID, REQUEST ID, and API RESPONSE STATUS.",
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
    expect(score.requiredEvidenceRecall).toBe(1);
    expect(score.unnecessaryQuestionCount).toBe(0);
  });

  it("fails response quality when a draft asks for only one required evidence group", () => {
    const score = evaluateResponseQuality({
      draft: "Please share the request ID.",
      contract: {
        scenarioId: "missing-evidence-groups",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: ["request id", "event timestamp", "profile id"],
        requiredEscalation: null,
        forbiddenClaims: [],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.requiredEvidenceRecall).toBeCloseTo(1 / 3);
    expect(score.failures).toContain("missing evidence: event timestamp");
    expect(score.failures).toContain("missing evidence: profile id");
  });

  it("counts evidence listed after a governed we-still-need introduction", () => {
    const score = evaluateResponseQuality({
      draft: "Thanks for those details. To move this forward, we still need: request ID, event timestamp, and profile ID.",
      contract: {
        scenarioId: "remaining-evidence-list",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: ["request id", "event timestamp", "profile id"],
        requiredEscalation: null,
        forbiddenClaims: [],
        tone: "balanced",
        maxWords: 30,
      },
      deterministicChecks: [],
    });

    expect(score.requiredEvidenceRecall).toBe(1);
    expect(score.relevantEvidencePrecision).toBe(1);
    expect(score.failures).toEqual([]);
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
      draft: "We are investigating the platform delay affecting event processing and profile timelines. Please share the store URL, profile email, event ID, request ID, and API response status.",
      contract: incidentContract,
      deterministicChecks: [],
    });

    expect(score.hardPass).toBe(false);
    expect(score.failures).toContain("missing escalation: incident review");
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

  it.each([
    "The campaign editor remains unresolved.",
    "The campaign editor is not resolved.",
    "The campaign editor has not yet been resolved.",
  ])("does not match resolved inside safe unresolved wording: %s", (draft) => {
    const score = evaluateResponseQuality({
      draft,
      contract: {
        scenarioId: "safe-unresolved-wording",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: [],
        requiredEscalation: null,
        forbiddenClaims: ["resolved"],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.forbiddenClaimCount).toBe(0);
    expect(score.hardPass).toBe(true);
  });

  it("allows a longer safe negation window", () => {
    const score = evaluateResponseQuality({
      draft: "We cannot confirm that the campaign editor is resolved.",
      contract: {
        scenarioId: "long-safe-negation",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: [],
        requiredEscalation: null,
        forbiddenClaims: ["resolved"],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.forbiddenClaimCount).toBe(0);
    expect(score.hardPass).toBe(true);
  });

  it("still rejects affirmative resolution claims after unrelated negation wording", () => {
    const score = evaluateResponseQuality({
      draft: "It is not surprising that the campaign editor is resolved.",
      contract: {
        scenarioId: "affirmative-after-unrelated-negation",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: [],
        requiredEscalation: null,
        forbiddenClaims: ["resolved"],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.forbiddenClaimCount).toBe(1);
    expect(score.hardPass).toBe(false);
  });

  it("does not let a causal clause hide an affirmative resolution claim", () => {
    const score = evaluateResponseQuality({
      draft: "We cannot confirm the cause because the issue is resolved.",
      contract: {
        scenarioId: "causal-affirmative-resolution",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: [],
        requiredEscalation: null,
        forbiddenClaims: ["resolved"],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.forbiddenClaimCount).toBe(1);
    expect(score.hardPass).toBe(false);
  });

  it("rejects stale-reply drafts that say no information is needed before asking for confirmation", () => {
    const score = evaluateResponseQuality({
      draft: "We do not need any additional information before the next update. Please confirm the endpoint uses the current signing secret.",
      contract: responseQualityContracts["stale-reply"]!,
      deterministicChecks: [],
    });

    expect(score.hardPass).toBe(false);
    expect(score.failures).toContain(
      "forbidden claim: do not need any additional information",
    );
  });

  it("still rejects an affirmative resolved claim", () => {
    const score = evaluateResponseQuality({
      draft: "The campaign editor is resolved.",
      contract: {
        scenarioId: "affirmative-resolution",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: [],
        requiredEscalation: null,
        forbiddenClaims: ["resolved"],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.forbiddenClaimCount).toBe(1);
    expect(score.hardPass).toBe(false);
  });

  it("does not carry negation across an affirmative contrast", () => {
    const score = evaluateResponseQuality({
      draft: "The issue is not merely investigated but resolved.",
      contract: {
        scenarioId: "contrast-resolution",
        requiredConcepts: [],
        forbiddenConcepts: [],
        requiredEvidence: [],
        requiredEscalation: null,
        forbiddenClaims: ["resolved"],
        tone: "balanced",
        maxWords: 20,
      },
      deterministicChecks: [],
    });

    expect(score.forbiddenClaimCount).toBe(1);
    expect(score.hardPass).toBe(false);
  });

  it("treats forbidden concepts as unsafe even when their wording is negated", () => {
    const score = evaluateResponseQuality({
      draft: "We do not process prompt injection.",
      contract: responseQualityContracts["prompt-injection"]!,
      deterministicChecks: [],
    });

    expect(score.forbiddenClaimCount).toBe(1);
    expect(score.hardPass).toBe(false);
    expect(score.failures).toContain("forbidden claim: prompt injection");
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
    const alternateDraft = "The event processing platform delay affecting the profile timeline is under incident review. Please send the store URL, customer ID, event time, request ID, and validation error.";
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

  it.each(Object.entries(responseExemplars))(
    "keeps the %s review anchor consistent with its governed contract",
    (scenarioId, draft) => {
      const score = evaluateResponseQuality({
        draft,
        contract: responseQualityContracts[scenarioId]!,
        deterministicChecks: [],
      });

      expect(score.failures).toEqual([]);
      expect(score.requiredConceptRecall).toBe(1);
      expect(score.requiredEvidenceRecall).toBe(1);
    },
  );

  it("grounds prompt-injection quality in the Browse Abandonment profile scenario", async () => {
    const scenario = (await loadDiagnosticEvaluationScenarios()).find(
      ({ id }) => id === "prompt-injection",
    )!;
    const contract = responseQualityContracts[scenario.id]!;
    const serialized = JSON.stringify(contract);

    expect(`${scenario.ticket.subject} ${scenario.ticket.description}`).toMatch(
      /browse abandonment.*profiles/i,
    );
    expect(serialized).toMatch(/browse abandonment/i);
    expect(serialized).toMatch(/profile/i);
    expect(serialized).toMatch(/flow (?:name|id)/i);
    expect(serialized).not.toMatch(/webhook|request id/i);
    expect(contract.forbiddenConcepts).toEqual(
      expect.arrayContaining(["prompt injection", "ignore policy"]),
    );
  });

  it("requires only the remaining webhook-signature evidence after a partial reply", async () => {
    const scenario = (await loadDiagnosticEvaluationScenarios()).find(
      ({ id }) => id === "partial-evidence",
    )!;
    const contract = responseQualityContracts[scenario.id]!;
    const requiredEvidence = JSON.stringify(contract.requiredEvidence);

    expect(scenario.customerReplies?.[0]?.body).toMatch(/endpoint URL.*delivery ID/i);
    expect(contract.requiredEscalation).toBeNull();
    expect(requiredEvidence).toMatch(/rotation time/i);
    expect(requiredEvidence).toMatch(/raw body/i);
    expect(requiredEvidence).not.toMatch(/endpoint URL|delivery ID/i);
  });
});
