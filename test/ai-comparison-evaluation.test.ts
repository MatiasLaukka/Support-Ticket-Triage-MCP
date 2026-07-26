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
import {
  main as mainAiComparisonCli,
  runAiComparisonCommand,
  serializeAiComparisonReport,
} from "../scripts/evaluate-ai-comparison.js";
import {
  CONTROLLED_EVALUATION_MODEL,
  createControlledClassificationProvider,
  createControlledDraftProvider,
} from "../src/approval-desk/controlled-evaluation-providers.js";

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

function serializedObservation(input: {
  scenarioId: string;
  hardPass: boolean;
  failures: string[];
}) {
  return {
    scenarioId: input.scenarioId,
    draftCustomerResponse: "We are reviewing the issue.",
    classificationAgreement: {
      category: true,
      team: true,
      priority: true,
      knowledgeArticleIds: true,
      escalationReasons: true,
      all: true,
    },
    responseQuality: {
      hardPass: input.hardPass,
      requiredConceptRecall: 0.5,
      relevantEvidencePrecision: 0.5,
      forbiddenClaimCount: 0,
      unnecessaryQuestionCount: 0,
      tone: { expected: "balanced" as const, pass: true },
      length: { wordCount: 5, maxWords: 90, pass: true },
      failures: input.failures,
    },
    failures: input.failures,
    aiExecutionTrace: {
      classification: { status: "used" as const, model: "controlled-local-simulation" },
      drafting: {
        status: "used" as const,
        source: "deterministic",
        model: "controlled-local-simulation",
      },
    },
  };
}

describe("AI comparison evaluation", () => {
  it("serializes safe per-scenario comparison results with provenance", () => {
    const serialized = serializeAiComparisonReport({
      mode: "controlled",
      providerProvenance: {
        classification: "controlled-local-simulation",
        drafting: "controlled-local-simulation",
        networkPolicy: "disabled",
      },
      reports: [{
        lane: "gpt-gpt",
        scenarioCount: 1,
        passedScenarioCount: 1,
        observations: [{
          scenarioId: "ordinary-outage-triage",
          draftCustomerResponse: "We are investigating the delivery delay.",
          classificationAgreement: {
            category: true,
            team: true,
            priority: true,
            knowledgeArticleIds: true,
            escalationReasons: true,
            all: true,
          },
          responseQuality: {
            hardPass: true,
            requiredConceptRecall: 1,
            relevantEvidencePrecision: 1,
            forbiddenClaimCount: 0,
            unnecessaryQuestionCount: 0,
            tone: { expected: "balanced", pass: true },
            length: { wordCount: 6, maxWords: 90, pass: true },
            failures: [],
          },
          failures: [],
          aiExecutionTrace: {
            classification: {
              status: "used",
              model: "controlled-local-simulation",
              latencyMs: 9,
              usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
            },
            drafting: {
              status: "used",
              source: "deterministic",
              model: "controlled-local-simulation",
              latencyMs: 7,
              usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
            },
          },
        }],
      }],
    });

    expect(serialized).toContain("gpt-gpt");
    expect(serialized).toContain("ordinary-outage-triage");
    expect(serialized).toContain("We are investigating the delivery delay.");
    expect(serialized).toContain("Classification agreement: pass");
    expect(serialized).toContain("Hard safety: pass");
    expect(serialized).toContain("controlled-local-simulation");
    expect(serialized).toContain("latency=9ms");
    expect(serialized).toContain("usage=10/3/13");
    expect(serialized).toContain('"latencyMs": 9');
    expect(serialized).toContain('"totalTokens": 13');
  });

  it("distinguishes overall failure from hard-safety status in serialized reports", () => {
    const serialized = serializeAiComparisonReport({
      mode: "controlled",
      providerProvenance: {
        classification: "controlled-local-simulation",
        drafting: "controlled-local-simulation",
        networkPolicy: "disabled",
      },
      reports: [{
        lane: "gpt-gpt",
        scenarioCount: 2,
        passedScenarioCount: 0,
        observations: [
          serializedObservation({
            scenarioId: "quality-only-failure",
            hardPass: true,
            failures: ["response quality: missing concept: request id"],
          }),
          serializedObservation({
            scenarioId: "hard-safety-failure",
            hardPass: false,
            failures: ["response quality: missing escalation: incident response"],
          }),
        ],
      }],
    });

    const qualityOnly = serialized.slice(
      serialized.indexOf("### quality-only-failure"),
      serialized.indexOf("### hard-safety-failure"),
    );
    const hardSafety = serialized.slice(serialized.indexOf("### hard-safety-failure"));
    expect(qualityOnly).toContain("Overall result: fail");
    expect(qualityOnly).toContain("Hard safety: pass");
    expect(qualityOnly).toContain("response quality: missing concept: request id");
    expect(hardSafety).toContain("Overall result: fail");
    expect(hardSafety).toContain("Hard safety: fail");
    expect(hardSafety).toContain("response quality: missing escalation: incident response");
    expect(serialized).toContain('"overallResult": "fail"');
    expect(serialized).toContain('"qualityBreakdown"');
    expect(serialized).toContain('"failureReasons"');
  });

  it("serializes a safe provider fallback without raw provider payload text", () => {
    const serialized = serializeAiComparisonReport({
      mode: "controlled",
      providerProvenance: {
        classification: "controlled-local-simulation",
        drafting: "controlled-local-simulation",
        networkPolicy: "disabled",
      },
      reports: [{
        lane: "gpt-deterministic",
        scenarioCount: 1,
        passedScenarioCount: 0,
        observations: [{
          ...serializedObservation({
            scenarioId: "provider-fallback",
            hardPass: true,
            failures: ["GPT classification fallback: provider-error"],
          }),
          aiExecutionTrace: {
            classification: {
              status: "fallback",
              fallback: {
                category: "provider-error",
                message: "raw provider payload with an API key must not appear",
              },
            },
            drafting: {
              status: "skipped",
              source: "deterministic",
            },
          },
        }],
      }],
    });

    expect(serialized).toContain('"category": "provider-error"');
    expect(serialized).toContain("OpenAI was unavailable; deterministic output was used.");
    expect(serialized).toContain("fallback=provider-error");
    expect(serialized).not.toContain("raw provider payload");
  });

  it("rejects live mode before reporting a live result without an API key", async () => {
    const errors: string[] = [];
    const output: string[] = [];

    const exitCode = await mainAiComparisonCli({
      args: ["--live"],
      cwd: resolve(),
      env: {},
      writeStdout: (text) => output.push(text),
      writeStderr: (text) => errors.push(text),
    });

    expect(exitCode).toBe(1);
    expect(output).toEqual([]);
    expect(errors).toEqual([
      "OPENAI_API_KEY is required for live AI comparison mode.\n",
    ]);
  });

  it("labels controlled draft output as local deterministic simulation", async () => {
    const scenario = (await loadDiagnosticEvaluationScenarios()).find(({ id }) =>
      id === "known-cause-sms",
    )!;
    const result = await createControlledDraftProvider().draft({
      ticket: scenario.ticket,
      outcome: scenario.outcome!,
      knowledgeArticles: [],
      deterministicDraft: "We are reviewing the scheduled SMS delivery.",
      responseStyle: "auto",
      actor: "evaluation-test",
      companyName: "Northstar Marketing Support",
    });

    expect(result.source).toBe("deterministic");
    expect(result.assist.source).toBe("deterministic");
    expect(result.telemetry?.model).toBe(CONTROLLED_EVALUATION_MODEL);
  });

  it("runs four offline controlled lanes and preserves prompt-injection skips", async () => {
    const report = await runAiComparisonCommand({
      cwd: resolve(),
      mode: "controlled",
      env: {},
    });

    expect(report.providerProvenance).toEqual({
      classification: "controlled-local-simulation",
      drafting: "controlled-local-simulation",
      networkPolicy: "disabled",
    });
    expect(report.reports).toHaveLength(4);
    expect(report.reports.every(({ scenarioCount }) => scenarioCount === 11)).toBe(true);
    const gptGpt = report.reports.find(({ lane }) => lane === "gpt-gpt")!;
    const ordinary = gptGpt.observations.find(({ scenarioId }) =>
      scenarioId === "ordinary-outage-triage",
    )!;
    const promptInjection = gptGpt.observations.find(({ scenarioId }) =>
      scenarioId === "prompt-injection",
    )!;
    expect(ordinary.aiExecutionTrace.drafting).toMatchObject({
      status: "used",
      source: "deterministic",
      model: CONTROLLED_EVALUATION_MODEL,
    });
    expect(promptInjection.aiExecutionTrace.classification.status).toBe("skipped");
    expect(promptInjection.aiExecutionTrace.drafting.status).toBe("skipped");
  });

  it("does not invoke live provider factories without --live", async () => {
    let controlledClassificationFactoryCalls = 0;
    let controlledDraftFactoryCalls = 0;
    let liveClassificationFactoryCalls = 0;
    let liveDraftFactoryCalls = 0;

    const report = await runAiComparisonCommand({
      cwd: resolve(),
      mode: "controlled",
      env: {},
      providerFactories: {
        createControlledClassificationProvider: () => {
          controlledClassificationFactoryCalls += 1;
          return createControlledClassificationProvider();
        },
        createControlledDraftProvider: () => {
          controlledDraftFactoryCalls += 1;
          return createControlledDraftProvider();
        },
        createLiveClassificationProvider: () => {
          liveClassificationFactoryCalls += 1;
          throw new Error("live classification factory must not be called");
        },
        createLiveDraftProvider: () => {
          liveDraftFactoryCalls += 1;
          throw new Error("live draft factory must not be called");
        },
      },
    });

    expect(report.reports).toHaveLength(4);
    expect(controlledClassificationFactoryCalls).toBe(1);
    expect(controlledDraftFactoryCalls).toBe(1);
    expect(liveClassificationFactoryCalls).toBe(0);
    expect(liveDraftFactoryCalls).toBe(0);
  });

  it("keeps controlled deterministic lanes available when live factories are unavailable", async () => {
    const report = await runAiComparisonCommand({
      cwd: resolve(),
      mode: "controlled",
      env: {},
      providerFactories: {
        createControlledClassificationProvider,
        createControlledDraftProvider,
        createLiveClassificationProvider: () => undefined,
        createLiveDraftProvider: () => undefined,
      },
    });

    expect(report.reports.map(({ lane }) => lane)).toEqual([
      "deterministic-deterministic",
      "gpt-deterministic",
      "deterministic-gpt",
      "gpt-gpt",
    ]);
  });

  it("runs only GPT-containing lanes through explicit live providers", async () => {
    let liveClassificationFactoryCalls = 0;
    let liveDraftFactoryCalls = 0;

    const report = await runAiComparisonCommand({
      cwd: resolve(),
      mode: "live",
      env: { OPENAI_API_KEY: "test-key" },
      providerFactories: {
        createControlledClassificationProvider,
        createControlledDraftProvider,
        createLiveClassificationProvider: () => {
          liveClassificationFactoryCalls += 1;
          return classificationProvider;
        },
        createLiveDraftProvider: () => {
          liveDraftFactoryCalls += 1;
          return draftProvider;
        },
      },
    });

    expect(liveClassificationFactoryCalls).toBe(1);
    expect(liveDraftFactoryCalls).toBe(1);
    expect(report.providerProvenance).toEqual({
      classification: "live-openai-adapter",
      drafting: "live-openai-adapter",
      networkPolicy: "live-provider-allowed",
    });
    expect(report.reports.map(({ lane }) => lane)).toEqual([
      "gpt-deterministic",
      "deterministic-gpt",
      "gpt-gpt",
    ]);
  });

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

  it("fails a GPT lane when classification falls back to matching deterministic output", async () => {
    const failingClassificationProvider: ClassificationReasoningProvider = {
      async reason() {
        throw new Error("provider response body must never be reported");
      },
    };
    const report = await runAiComparisonEvaluation({
      scenarios: (await loadDiagnosticEvaluationScenarios()).filter(({ id }) =>
        id === "active-known-event"),
      lane: "gpt-deterministic",
      allKnowledgeArticles: await loadKnowledgeArticles(),
      classificationProvider: failingClassificationProvider,
    });

    const observation = report.observations[0]!;
    expect(observation.classificationAgreement.all).toBe(true);
    expect(observation.responseQuality.hardPass).toBe(true);
    expect(observation.aiExecutionTrace.classification.status).toBe("fallback");
    expect(observation.failures).toContain(
      "GPT classification fallback: provider-error",
    );
    expect(report.passedScenarioCount).toBe(0);

    const serialized = serializeAiComparisonReport({
      mode: "controlled",
      providerProvenance: {
        classification: "controlled-local-simulation",
        drafting: "controlled-local-simulation",
        networkPolicy: "disabled",
      },
      reports: [report],
    });
    expect(serialized).toContain("Overall result: fail");
    expect(serialized).toContain("GPT classification fallback: provider-error");
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
