import { resolve } from "node:path";
import process from "node:process";
import {
  type AiComparisonAgreement,
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
import type { AiUsage } from "../src/domain.js";
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
      draftCustomerResponse: string;
      classificationAgreement: AiComparisonAgreement;
      responseQuality: ResponseQualityScore;
      failures: readonly string[];
      aiExecutionTrace: {
        classification: {
          status: "skipped" | "used" | "fallback";
          model?: string;
          latencyMs?: number;
          usage?: AiUsage;
        };
        drafting: {
          status: "skipped" | "used" | "fallback";
          source: string;
          model?: string;
          latencyMs?: number;
          usage?: AiUsage;
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
        actualDraft: observation.draftCustomerResponse,
        overallResult: observation.failures.length === 0 ? "pass" : "fail",
        classificationAgreement: observation.classificationAgreement,
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
        `- Classification agreement: ${observation.classificationAgreement.all ? "pass" : "fail"}.`,
        `- Hard safety: ${observation.responseQuality.hardPass ? "pass" : "fail"}.`,
        `- Quality breakdown: ${formatQualityBreakdown(observation.responseQuality)}.`,
        ...formatFailureReasons(observation.failures),
        `- Provider provenance: ${formatStageProvenance(observation)}.`,
        "- Actual draft:",
        ...quoteMarkdown(observation.draftCustomerResponse),
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
      model: observation.aiExecutionTrace.classification.model ?? "not-used",
      ...(observation.aiExecutionTrace.classification.latencyMs === undefined
        ? {}
        : { latencyMs: observation.aiExecutionTrace.classification.latencyMs }),
      ...(observation.aiExecutionTrace.classification.usage === undefined
        ? {}
        : { usage: observation.aiExecutionTrace.classification.usage }),
    },
    drafting: {
      status: observation.aiExecutionTrace.drafting.status,
      source: observation.aiExecutionTrace.drafting.source,
      model: observation.aiExecutionTrace.drafting.model ?? "not-used",
      ...(observation.aiExecutionTrace.drafting.latencyMs === undefined
        ? {}
        : { latencyMs: observation.aiExecutionTrace.drafting.latencyMs }),
      ...(observation.aiExecutionTrace.drafting.usage === undefined
        ? {}
        : { usage: observation.aiExecutionTrace.drafting.usage }),
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
  source?: string;
}): string {
  const stage = [input.status, ...(input.source === undefined ? [] : [input.source]), input.model];
  const metadata = [
    ...(input.latencyMs === undefined ? [] : [`latency=${input.latencyMs}ms`]),
    ...(input.usage === undefined
      ? []
      : [`usage=${input.usage.inputTokens}/${input.usage.outputTokens}/${input.usage.totalTokens}`]),
  ];
  return [...stage, ...metadata].join("/");
}

function quoteMarkdown(text: string): string[] {
  return text.split("\n").map((line) => `> ${line}`);
}

function qualityBreakdown(responseQuality: ResponseQualityScore) {
  return {
    requiredConceptRecall: responseQuality.requiredConceptRecall,
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
    `evidence precision=${formatRatio(responseQuality.relevantEvidencePrecision)}`,
    `forbidden claims=${responseQuality.forbiddenClaimCount}`,
    `unnecessary questions=${responseQuality.unnecessaryQuestionCount}`,
    `tone=${responseQuality.tone.pass ? "pass" : "fail"}`,
    `length=${responseQuality.length.wordCount}/${responseQuality.length.maxWords} (${responseQuality.length.pass ? "pass" : "fail"})`,
  ].join("; ");
}

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
