import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ClassificationReasoningProvider,
} from "../src/approval-desk/classification-reasoning-provider.js";
import {
  type CustomerResponseDraftProvider,
} from "../src/approval-desk/draft-response-provider.js";
import {
  runAiComparisonEvaluation,
} from "../src/approval-desk/ai-comparison-evaluation.js";
import { loadDiagnosticEvaluationScenarios } from "../src/approval-desk/diagnostic-evaluation-scenarios.js";
import { KnowledgeRepository } from "../src/knowledge-repository.js";

const classificationProvider: ClassificationReasoningProvider = {
  async reason() {
    return {
      reasoning: {
        issueType: "webhook-delivery",
        candidateCategory: "integration",
        candidateTeam: "integrations",
        candidatePriority: "P1",
        knowledgeArticleIds: ["webhook-delivery-guide"],
        confidence: 0.8,
        evidence: ["The customer reported a webhook delivery issue."],
        missingEvidenceThatWouldChangeClassification: [],
        explanation: "The advisory is bounded to approved integration routing.",
      },
      telemetry: { model: "comparison-fake", latencyMs: 1 },
    };
  },
};

const draftProvider: CustomerResponseDraftProvider = {
  async draft(input) {
    return {
      source: "openai",
      response: input.deterministicDraft,
      assist: {
        source: "openai",
        missingInfoSuggestions: [],
        investigationSteps: [],
        tone: input.responseStyle === "auto" ? "balanced" : input.responseStyle,
        recommendedTone: "balanced",
        selectedTone: "balanced",
        toneReason: "The deterministic draft already reflects the approved policy.",
        audience: "merchant-admin",
        checks: [],
      },
    };
  },
};

describe("AI comparison evaluation", () => {
  it("keeps the deterministic lane provider-free", async () => {
    const report = await runAiComparisonEvaluation({
      scenarios: await loadDiagnosticEvaluationScenarios(),
      lane: "deterministic-deterministic",
      allKnowledgeArticles: await loadKnowledgeArticles(),
    });

    expect(report.observations.every(({ aiExecutionTrace }) =>
      aiExecutionTrace.classification.status === "skipped" &&
      aiExecutionTrace.drafting.status === "skipped",
    )).toBe(true);
  });

  it("accepts any priority allowed by the expected outcome contract", async () => {
    const outageScenario = (await loadDiagnosticEvaluationScenarios()).find(({ id }) =>
      id === "ordinary-outage-triage")!;
    const report = await runAiComparisonEvaluation({
      scenarios: [{
        ...outageScenario,
        outcome: {
          ...outageScenario.outcome!,
          acceptablePriorities: ["P2", "P1"],
        },
      }],
      lane: "deterministic-deterministic",
      allKnowledgeArticles: await loadKnowledgeArticles(),
    });

    const observation = report.observations[0]!;
    expect(observation.finalRecommendation.priority).toBe("P1");
    expect(observation.classificationAgreement.priority).toBe(true);
  });

  it("uses injected GPT classification advice without a GPT draft", async () => {
    const report = await runAiComparisonEvaluation({
      scenarios: (await loadDiagnosticEvaluationScenarios()).filter(({ id }) =>
        id === "ordinary-outage-triage"),
      lane: "gpt-deterministic",
      allKnowledgeArticles: await loadKnowledgeArticles(),
      classificationProvider,
    });

    const observation = report.observations[0]!;
    expect(observation.aiExecutionTrace.classification.status).toBe("used");
    expect(observation.aiExecutionTrace.drafting.status).toBe("skipped");
    expect(observation.baselineAgreement).toMatchObject({
      category: true,
      team: true,
      priority: true,
      knowledgeArticleIds: true,
      escalationReasons: true,
      all: true,
    });
    expect(observation.classificationAgreement).toMatchObject({
      category: true,
      team: true,
      priority: true,
      knowledgeArticleIds: true,
      escalationReasons: true,
      all: true,
    });
    expect(observation.aiExecutionTrace.classification.candidate).toMatchObject({
      category: "integration",
      team: "integrations",
      priority: "P1",
      knowledgeArticleIds: [],
    });
    expect(observation.aiExecutionTrace.classification.rejectedAdvice).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "knowledge:webhook-delivery-guide" }),
      ]),
    );
    expect(observation.finalRecommendation.escalationRequired).toBe(true);
    expect(observation.finalRecommendation.escalationReasons).toEqual(["outage", "sla"]);
    expect(observation.aiExecutionTrace.classification.deterministicOverrides).toContain(
      "Deterministic outage policy retained incident routing.",
    );
  });

  it("uses an injected GPT draft without GPT classification", async () => {
    const report = await runAiComparisonEvaluation({
      scenarios: (await loadDiagnosticEvaluationScenarios()).filter(({ id }) =>
        id === "ordinary-outage-triage"),
      lane: "deterministic-gpt",
      allKnowledgeArticles: await loadKnowledgeArticles(),
      draftProvider,
    });

    const observation = report.observations[0]!;
    expect(observation.aiExecutionTrace.classification.status).toBe("fallback");
    expect(observation.aiExecutionTrace.drafting.status).toBe("used");
    expect(observation.draftCustomerResponseSource).toBe("openai");
  });

  it("runs both injected GPT stages and preserves provider provenance", async () => {
    let classificationCalls = 0;
    let draftCalls = 0;
    const gptClassificationProvider: ClassificationReasoningProvider = {
      async reason() {
        classificationCalls += 1;
        return {
          reasoning: {
            issueType: "webhook-delivery",
            candidateCategory: "integration",
            candidateTeam: "integrations",
            candidatePriority: "P2",
            knowledgeArticleIds: ["webhook-signature-validation"],
            confidence: 0.8,
            evidence: ["The customer reported delayed webhook delivery."],
            missingEvidenceThatWouldChangeClassification: [],
            explanation: "The advisory stays within the approved integration policy.",
          },
          telemetry: { model: "comparison-classification-fake", latencyMs: 3 },
        };
      },
    };
    const gptDraftProvider: CustomerResponseDraftProvider = {
      async draft(input) {
        draftCalls += 1;
        return {
          source: "openai",
          response: input.deterministicDraft,
          assist: {
            source: "openai",
            missingInfoSuggestions: ["Share the affected delivery ID."],
            investigationSteps: ["Compare the event and delivery timestamps."],
            tone: "technical",
            recommendedTone: "technical",
            selectedTone: "technical",
            toneReason: "Webhook delivery context calls for a technical update.",
            audience: "developer",
            checks: [],
          },
          telemetry: { model: "comparison-draft-fake", latencyMs: 4 },
        };
      },
    };
    const report = await runAiComparisonEvaluation({
      scenarios: (await loadDiagnosticEvaluationScenarios()).filter(({ id }) =>
        id === "active-known-event"),
      lane: "gpt-gpt",
      allKnowledgeArticles: await loadKnowledgeArticles(),
      classificationProvider: gptClassificationProvider,
      draftProvider: gptDraftProvider,
    });

    const observation = report.observations[0]!;
    expect(classificationCalls).toBe(1);
    expect(draftCalls).toBe(1);
    expect(observation.aiExecutionTrace.classification.status).toBe("used");
    expect(observation.aiExecutionTrace.classification.model).toBe("comparison-classification-fake");
    expect(observation.aiExecutionTrace.drafting.status).toBe("used");
    expect(observation.aiExecutionTrace.drafting.source).toBe("openai");
    expect(observation.aiExecutionTrace.drafting.model).toBe("comparison-draft-fake");
    expect(observation.draftCustomerResponseSource).toBe("openai");
    expect(observation.baselineAgreement.all).toBe(true);
  });

  it("skips both GPT stages for prompt injection", async () => {
    const throwingProvider: ClassificationReasoningProvider = {
      async reason() {
        throw new Error("classification provider must not be called");
      },
    };
    const throwingDraftProvider: CustomerResponseDraftProvider = {
      async draft() {
        throw new Error("draft provider must not be called");
      },
    };
    const report = await runAiComparisonEvaluation({
      scenarios: (await loadDiagnosticEvaluationScenarios()).filter(({ id }) =>
        id === "prompt-injection"),
      lane: "gpt-gpt",
      allKnowledgeArticles: await loadKnowledgeArticles(),
      classificationProvider: throwingProvider,
      draftProvider: throwingDraftProvider,
    });

    const observation = report.observations[0]!;
    expect(observation.aiExecutionTrace.classification.status).toBe("skipped");
    expect(observation.aiExecutionTrace.drafting.status).toBe("skipped");
    expect(observation.finalRecommendation.category).toBe("integration");
  });
});

async function loadKnowledgeArticles() {
  return new KnowledgeRepository(resolve("data/knowledge")).list();
}
