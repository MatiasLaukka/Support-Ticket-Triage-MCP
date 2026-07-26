import { resolve } from "node:path";
import process from "node:process";
import {
  type AiComparisonAgreement,
  type AiComparisonClassification,
  type AiComparisonLane,
  type AiComparisonReport,
  runAiComparisonEvaluation,
} from "../src/approval-desk/ai-comparison-evaluation.js";
import {
  createControlledClassificationProvider,
  createControlledDraftProvider,
} from "../src/approval-desk/controlled-evaluation-providers.js";
import {
  createClassificationReasoningProviderFromEnv,
  type ClassificationReasoningProvider,
} from "../src/approval-desk/classification-reasoning-provider.js";
import {
  createCustomerResponseDraftProviderFromEnv,
  type CustomerResponseDraftProvider,
} from "../src/approval-desk/draft-response-provider.js";
import { loadDiagnosticEvaluationScenarios } from "../src/approval-desk/diagnostic-evaluation-scenarios.js";
import type { ResponseQualityScore } from "../src/approval-desk/response-quality-evaluation.js";
import type {
  AiExecutionTrace,
  AiFallbackCategory,
  AiUsage,
} from "../src/domain.js";
import { KnowledgeRepository } from "../src/knowledge-repository.js";

const LANES: readonly AiComparisonLane[] = [
  "deterministic-deterministic",
  "gpt-deterministic",
  "deterministic-gpt",
  "gpt-gpt",
];

export type AiComparisonEvaluationMode = "controlled" | "live";

export interface AiComparisonProviderProvenance {
  classification: "controlled-local-simulation" | "live-openai-adapter";
  drafting: "controlled-local-simulation" | "live-openai-adapter";
  networkPolicy: "disabled" | "live-provider-allowed";
}

export interface AiComparisonSerializationInput {
  mode: AiComparisonEvaluationMode;
  providerProvenance: AiComparisonProviderProvenance;
  reports: ReadonlyArray<{
    lane: AiComparisonLane;
    scenarioCount: number;
    passedScenarioCount: number;
    observations: ReadonlyArray<{
      scenarioId: string;
      operatorStage: string;
      draftCustomerResponse: string;
      baselineClassification: AiComparisonClassification;
      classificationAgreement: AiComparisonAgreement;
      baselineAgreement: AiComparisonAgreement;
      responseQuality: ResponseQualityScore;
      failures: readonly string[];
      aiExecutionTrace: {
        classification: {
          status: "skipped" | "used" | "fallback";
          model?: string;
          latencyMs?: number;
          usage?: AiUsage;
          fallback?: {
            category: AiFallbackCategory;
            message: string;
          };
          candidate?: AiExecutionTrace["classification"]["candidate"];
          acceptedSignals?: AiExecutionTrace["classification"]["acceptedSignals"];
          rejectedAdvice?: AiExecutionTrace["classification"]["rejectedAdvice"];
          deterministicOverrides?: AiExecutionTrace["classification"]["deterministicOverrides"];
          finalOutcome?: AiExecutionTrace["classification"]["finalOutcome"];
        };
        drafting: {
          status: "skipped" | "used" | "fallback";
          source: string;
          model?: string;
          latencyMs?: number;
          usage?: AiUsage;
          fallback?: {
            category: AiFallbackCategory;
            message: string;
          };
        };
      };
    }>;
  }>;
}

export interface AiComparisonCliOptions {
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
}

export interface AiComparisonProviderFactories {
  createControlledClassificationProvider: () => ClassificationReasoningProvider;
  createControlledDraftProvider: () => CustomerResponseDraftProvider;
  createLiveClassificationProvider: (
    env: NodeJS.ProcessEnv,
  ) => ClassificationReasoningProvider | undefined;
  createLiveDraftProvider: (
    env: NodeJS.ProcessEnv,
  ) => CustomerResponseDraftProvider | undefined;
}

const defaultProviderFactories: AiComparisonProviderFactories = {
  createControlledClassificationProvider,
  createControlledDraftProvider,
  createLiveClassificationProvider: (env) =>
    createClassificationReasoningProviderFromEnv(env, { preferOpenAi: true }),
  createLiveDraftProvider: (env) =>
    createCustomerResponseDraftProviderFromEnv(env, {
      responseStyle: "auto",
      preferOpenAi: true,
    }),
};

export function parseAiComparisonArgs(
  args: readonly string[],
): AiComparisonEvaluationMode {
  if (args.length === 0) return "controlled";
  if (args.length === 1 && args[0] === "--live") return "live";
  throw new Error("Unknown AI comparison argument. Use no flags or --live.");
}

export async function runAiComparisonCommand(input: {
  cwd: string;
  mode: AiComparisonEvaluationMode;
  env?: NodeJS.ProcessEnv;
  providerFactories?: AiComparisonProviderFactories;
}): Promise<{
  mode: AiComparisonEvaluationMode;
  providerProvenance: AiComparisonProviderProvenance;
  reports: AiComparisonReport[];
}> {
  const env = input.env ?? process.env;
  requireLiveConfiguration(input.mode, env);
  const scenarios = await loadDiagnosticEvaluationScenarios();
  const allKnowledgeArticles = await new KnowledgeRepository(
    resolve(input.cwd, "data/knowledge"),
  ).list();
  const providers = providersForMode(
    input.mode,
    env,
    input.providerFactories ?? defaultProviderFactories,
  );
  const reports: AiComparisonReport[] = [];

  for (const lane of lanesForMode(input.mode)) {
    reports.push(await runAiComparisonEvaluation({
      scenarios,
      lane,
      allKnowledgeArticles,
      classificationProvider: providers.classificationProvider,
      draftProvider: providers.draftProvider,
    }));
  }

  return {
    mode: input.mode,
    providerProvenance: providerProvenanceForMode(input.mode),
    reports,
  };
}

export function serializeAiComparisonReport(
  report: AiComparisonSerializationInput,
): string {
  const safeReport = {
    mode: report.mode,
    providerProvenance: report.providerProvenance,
    lanes: report.reports.map((lane) => ({
      lane: lane.lane,
      scenarioCount: lane.scenarioCount,
      passedScenarioCount: lane.passedScenarioCount,
      scenarios: lane.observations.map((observation) => ({
        scenarioId: observation.scenarioId,
        operatorStage: observation.operatorStage,
        actualDraft: safeCustomerDraft(observation.draftCustomerResponse),
        overallResult: observation.failures.length === 0 ? "pass" : "fail",
        classificationAgreement: observation.classificationAgreement,
        classificationDelta: classificationDelta(observation),
        hardSafety: observation.responseQuality.hardPass,
        failureReasons: safeFailureReasons(observation.failures),
        qualityBreakdown: qualityBreakdown(observation.responseQuality),
        providerProvenance: stageProvenance(observation),
      })),
    })),
  };
  const lines = [
    "# AI Comparison Evaluation",
    "",
    `- Mode: ${report.mode}`,
    `- Provider provenance: classification=${report.providerProvenance.classification}; drafting=${report.providerProvenance.drafting}; network=${report.providerProvenance.networkPolicy}.`,
    ...(report.mode === "controlled"
      ? ["- Controlled local simulation only; no network calls are made."]
      : ["- Live OpenAI provider adapters selected from the environment."]),
    "",
    ...report.reports.flatMap((lane) => [
      `## ${lane.lane}`,
      "",
      `- Scenarios: ${lane.scenarioCount}; passed: ${lane.passedScenarioCount}.`,
      "",
      ...lane.observations.flatMap((observation) => [
        `### ${observation.scenarioId}`,
        "",
        `- Overall result: ${observation.failures.length === 0 ? "pass" : "fail"}.`,
        `- Operator stage: ${observation.operatorStage}.`,
        `- Classification agreement: ${observation.classificationAgreement.all ? "pass" : "fail"}.`,
        `- Classification delta: ${formatClassificationDelta(observation)}.`,
        `- Hard safety: ${observation.responseQuality.hardPass ? "pass" : "fail"}.`,
        `- Quality breakdown: ${formatQualityBreakdown(observation.responseQuality)}.`,
        ...formatFailureReasons(observation.failures),
        `- Provider provenance: ${formatStageProvenance(observation)}.`,
        "- Actual draft:",
        ...quoteMarkdown(safeCustomerDraft(observation.draftCustomerResponse)),
        "",
      ]),
    ]),
    "## JSON",
    "",
    "```json",
    JSON.stringify(safeReport, null, 2),
    "```",
    "",
  ];
  return lines.join("\n");
}

export async function runAiComparisonCli(
  options: AiComparisonCliOptions,
): Promise<void> {
  const env = options.env ?? process.env;
  const mode = parseAiComparisonArgs(options.args);
  const report = await runAiComparisonCommand({
    cwd: options.cwd,
    mode,
    env,
  });
  (options.writeStdout ?? ((text) => process.stdout.write(text)))(
    `${serializeAiComparisonReport(report)}\n`,
  );
}

export async function main(options: AiComparisonCliOptions): Promise<number> {
  try {
    await runAiComparisonCli(options);
    return 0;
  } catch (error) {
    (options.writeStderr ?? ((text) => process.stderr.write(text)))(
      `${safeCliErrorMessage(error)}\n`,
    );
    return 1;
  }
}

function providersForMode(
  mode: AiComparisonEvaluationMode,
  env: NodeJS.ProcessEnv,
  factories: AiComparisonProviderFactories,
) {
  if (mode === "controlled") {
    return {
      classificationProvider: factories.createControlledClassificationProvider(),
      draftProvider: factories.createControlledDraftProvider(),
    };
  }
  const classificationProvider = factories.createLiveClassificationProvider(env);
  const draftProvider = factories.createLiveDraftProvider(env);
  if (classificationProvider === undefined || draftProvider === undefined) {
    throw new Error("Live AI comparison providers are unavailable.");
  }
  return { classificationProvider, draftProvider };
}

function lanesForMode(mode: AiComparisonEvaluationMode): readonly AiComparisonLane[] {
  return mode === "controlled"
    ? LANES
    : LANES.filter((lane) => lane !== "deterministic-deterministic");
}

function providerProvenanceForMode(
  mode: AiComparisonEvaluationMode,
): AiComparisonProviderProvenance {
  return mode === "controlled"
    ? {
        classification: "controlled-local-simulation",
        drafting: "controlled-local-simulation",
        networkPolicy: "disabled",
      }
    : {
        classification: "live-openai-adapter",
        drafting: "live-openai-adapter",
        networkPolicy: "live-provider-allowed",
      };
}

function stageProvenance(
  observation: AiComparisonSerializationInput["reports"][number]["observations"][number],
) {
  return {
    classification: {
      status: observation.aiExecutionTrace.classification.status,
      model: safeTraceIdentifier(observation.aiExecutionTrace.classification.model ?? "not-used"),
      ...(observation.aiExecutionTrace.classification.latencyMs === undefined
        ? {}
        : { latencyMs: observation.aiExecutionTrace.classification.latencyMs }),
      ...(observation.aiExecutionTrace.classification.usage === undefined
        ? {}
        : { usage: observation.aiExecutionTrace.classification.usage }),
      ...(observation.aiExecutionTrace.classification.fallback === undefined
        ? {}
        : { fallback: safeFallback(observation.aiExecutionTrace.classification.fallback) }),
    },
    drafting: {
      status: observation.aiExecutionTrace.drafting.status,
      source: observation.aiExecutionTrace.drafting.source,
      model: safeTraceIdentifier(observation.aiExecutionTrace.drafting.model ?? "not-used"),
      ...(observation.aiExecutionTrace.drafting.latencyMs === undefined
        ? {}
        : { latencyMs: observation.aiExecutionTrace.drafting.latencyMs }),
      ...(observation.aiExecutionTrace.drafting.usage === undefined
        ? {}
        : { usage: observation.aiExecutionTrace.drafting.usage }),
      ...(observation.aiExecutionTrace.drafting.fallback === undefined
        ? {}
        : { fallback: safeFallback(observation.aiExecutionTrace.drafting.fallback) }),
    },
  };
}

function formatStageProvenance(
  observation: AiComparisonSerializationInput["reports"][number]["observations"][number],
): string {
  const provenance = stageProvenance(observation);
  return `classification=${formatProviderStage(provenance.classification)}; drafting=${formatProviderStage(provenance.drafting)}`;
}

function formatProviderStage(input: {
  status: "skipped" | "used" | "fallback";
  model: string;
  latencyMs?: number;
  usage?: AiUsage;
  fallback?: {
    category: AiFallbackCategory;
    message: string;
  };
  source?: string;
}): string {
  const stage = [input.status, ...(input.source === undefined ? [] : [input.source]), input.model];
  const metadata = [
    ...(input.latencyMs === undefined ? [] : [`latency=${input.latencyMs}ms`]),
    ...(input.usage === undefined
      ? []
      : [`usage=${input.usage.inputTokens}/${input.usage.outputTokens}/${input.usage.totalTokens}`]),
    ...(input.fallback === undefined
      ? []
      : [`fallback=${input.fallback.category}/${input.fallback.message}`]),
  ];
  return [...stage, ...metadata].join("/");
}

function safeFallback(input: {
  category: AiFallbackCategory;
  message: string;
}): { category: AiFallbackCategory; message: string } {
  const message = safeFallbackMessages[input.category];
  return {
    category: input.category,
    message: knownSafeFallbackMessages.has(input.message) ? input.message : message,
  };
}

const safeFallbackMessages: Record<AiFallbackCategory, string> = {
  "not-configured": "OpenAI is not configured; deterministic output was used.",
  timeout: "OpenAI timed out; deterministic output was used.",
  "provider-error": "OpenAI was unavailable; deterministic output was used.",
  "invalid-schema": "OpenAI returned invalid structured output; deterministic output was used.",
  "guardrail-rejected": "OpenAI output did not pass response guardrails; deterministic output was used.",
};

const knownSafeFallbackMessages = new Set([
  ...Object.values(safeFallbackMessages),
  "Local deterministic draft did not pass response guardrails; bounded local fallback was used.",
]);

function quoteMarkdown(text: string): string[] {
  return text.split("\n").map((line) => `> ${line}`);
}

function qualityBreakdown(responseQuality: ResponseQualityScore) {
  return {
    requiredConceptRecall: responseQuality.requiredConceptRecall,
    requiredEvidenceRecall: responseQuality.requiredEvidenceRecall,
    relevantEvidencePrecision: responseQuality.relevantEvidencePrecision,
    forbiddenClaimCount: responseQuality.forbiddenClaimCount,
    unnecessaryQuestionCount: responseQuality.unnecessaryQuestionCount,
    tone: responseQuality.tone,
    length: responseQuality.length,
    failures: safeFailureReasons(responseQuality.failures),
  };
}

function formatQualityBreakdown(responseQuality: ResponseQualityScore): string {
  return [
    `required concepts=${formatRatio(responseQuality.requiredConceptRecall)}`,
    `required evidence=${formatRatio(responseQuality.requiredEvidenceRecall)}`,
    `evidence precision=${formatRatio(responseQuality.relevantEvidencePrecision)}`,
    `forbidden claims=${responseQuality.forbiddenClaimCount}`,
    `unnecessary questions=${responseQuality.unnecessaryQuestionCount}`,
    `tone=${responseQuality.tone.pass ? "pass" : "fail"}`,
    `length=${responseQuality.length.wordCount}/${responseQuality.length.maxWords} (${responseQuality.length.pass ? "pass" : "fail"})`,
  ].join("; ");
}

function classificationDelta(
  observation: AiComparisonSerializationInput["reports"][number]["observations"][number],
) {
  const classification = observation.aiExecutionTrace.classification;
  return {
    baseline: sanitizeClassification(observation.baselineClassification),
    baselineAgreement: observation.baselineAgreement,
    ...(classification.candidate === undefined
      ? {}
      : { candidate: sanitizeCandidate(classification.candidate) }),
    acceptedSignals: (classification.acceptedSignals ?? []).map((signal) => ({
      ruleId: safeTraceIdentifier(signal.ruleId),
      target: safeTraceIdentifier(signal.target),
      weight: signal.weight,
      reason: safeTraceMessage(signal.reason),
    })),
    rejectedAdvice: (classification.rejectedAdvice ?? []).map((advice) => ({
      target: safeTraceIdentifier(advice.target),
      reason: safeTraceMessage(advice.reason),
    })),
    deterministicOverrides: (classification.deterministicOverrides ?? []).map(
      safeTraceMessage,
    ),
    final: classification.finalOutcome === undefined
      ? sanitizeClassification(observation.baselineClassification)
      : sanitizeFinalClassification(classification.finalOutcome),
  };
}

function formatClassificationDelta(
  observation: AiComparisonSerializationInput["reports"][number]["observations"][number],
): string {
  const delta = classificationDelta(observation);
  return [
    `baseline=${JSON.stringify(delta.baseline)}`,
    `candidate=${JSON.stringify(delta.candidate ?? null)}`,
    `accepted=${JSON.stringify(delta.acceptedSignals)}`,
    `rejected=${JSON.stringify(delta.rejectedAdvice)}`,
    `overrides=${JSON.stringify(delta.deterministicOverrides)}`,
    `final=${JSON.stringify(delta.final)}`,
  ].join("; ");
}

function sanitizeClassification(
  classification: AiComparisonClassification,
) {
  return {
    category: classification.category,
    team: classification.team,
    priority: classification.priority,
    knowledgeArticleIds: classification.knowledgeArticleIds.map(safeTraceIdentifier),
    escalationReasons: [...classification.escalationReasons],
  };
}

function sanitizeFinalClassification(
  classification: AiExecutionTrace["classification"]["finalOutcome"],
) {
  return {
    category: classification.category,
    team: classification.team,
    priority: classification.priority,
    knowledgeArticleIds: classification.knowledgeArticleIds.map(safeTraceIdentifier),
    confidence: classification.confidence,
    escalationReasons: [...classification.escalationReasons],
  };
}

function sanitizeCandidate(
  candidate: NonNullable<AiExecutionTrace["classification"]["candidate"]>,
) {
  return {
    issueType: safeTraceIdentifier(candidate.issueType),
    ...(candidate.category === undefined ? {} : { category: candidate.category }),
    ...(candidate.team === undefined ? {} : { team: candidate.team }),
    ...(candidate.priority === undefined ? {} : { priority: candidate.priority }),
    knowledgeArticleIds: candidate.knowledgeArticleIds.map(safeTraceIdentifier),
    confidence: candidate.confidence,
    explanation: safeTraceMessage(candidate.explanation),
  };
}

function safeTraceIdentifier(value: string): string {
  const normalized = safeFailureReason(value);
  return unsafeTraceText.test(normalized) ? "redacted" : normalized;
}

function safeTraceMessage(value: string): string {
  const normalized = safeFailureReason(value);
  return unsafeTraceText.test(normalized) ? "[redacted]" : normalized;
}

function safeCustomerDraft(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/sk-[A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/\b(?:api[-_ ]?key|access[-_ ]?token)\s*[=:]\s*\S+/gi, "[redacted]")
    .replace(/\bauthorization\s*:\s*\S+/gi, "[redacted]")
    .replace(/\bbearer\s+\S+/gi, "[redacted]");
}

const unsafeTraceText =
  /sk-[A-Za-z0-9_-]+|\b(?:api[-_ ]?key|access[-_ ]?token)\s*[=:]\s*\S+|authorization|bearer\s+|raw\s+(?:provider|model)\s+(?:payload|response)|\b(?:provider|model)\s+(?:payload|response)\s*:/i;

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatFailureReasons(failures: readonly string[]): string[] {
  const reasons = safeFailureReasons(failures);
  return reasons.length === 0
    ? ["- Failure reasons: none."]
    : ["- Failure reasons:", ...reasons.map((reason) => `  - ${reason}`)];
}

function safeFailureReasons(failures: readonly string[]): string[] {
  return [...new Set(failures.map(safeFailureReason).filter((reason) => reason !== ""))];
}

function safeFailureReason(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function requireLiveConfiguration(
  mode: AiComparisonEvaluationMode,
  env: NodeJS.ProcessEnv,
): void {
  if (mode === "live" && !env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for live AI comparison mode.");
  }
}

function safeCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const fixedMessages = new Set([
    "OPENAI_API_KEY is required for live AI comparison mode.",
    "Unknown AI comparison argument. Use no flags or --live.",
    "Live AI comparison providers are unavailable.",
  ]);
  return fixedMessages.has(message) ? message : "AI comparison evaluation failed.";
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  void main({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
