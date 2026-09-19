import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { APPLICABILITY_PROMPT_HASH, createApplicabilityReasoningProviderFromEnv } from "../src/applicability-reasoning-provider.js";
import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { unavailableReusableKnowledge } from "../src/knowledge-evolution/reusable-context.js";
import { assessApplicabilityCase } from "../src/retrieval/applicability.js";
import { canonicalNewB5ArtifactPath } from "../src/retrieval/applicability-artifact-path.js";
import {
  captureCandidates,
  captureEvidence,
  captureMeasurement,
  createApplicabilityCapture,
  hashCanonicalApplicabilityCapture,
  sanitizeApplicabilityResult,
  writeApplicabilityCaptureExclusive,
  type ApplicabilityCapture,
  type ApplicabilityCaseCapture,
  type ApplicabilityCaptureWithoutHash,
  type ApplicabilityLaneCapture,
} from "../src/retrieval/applicability-capture.js";
import {
  loadApplicabilityDevelopment,
  selectApplicabilityDevelopmentForExecution,
  validateApplicabilityDevelopment,
  type ApplicabilityDevelopmentCase,
  type LoadedApplicabilityDevelopment,
} from "../src/retrieval/applicability-cases.js";
import {
  buildApplicabilityInput,
  measureApplicabilityInput,
  resolveApplicabilityBasis,
  type ApplicabilityCaseBasis,
  type ApplicabilityInputMeasurement,
} from "../src/retrieval/applicability-evidence.js";
import { renderApplicabilityMarkdown, scoreApplicabilityCapture, type ApplicabilityEvaluationReport } from "../src/retrieval/applicability-evaluation.js";
import type { ApplicabilityCaseResult, ApplicabilityLane, ApplicabilityReasoningInput, ApplicabilityReasoningProvider } from "../src/retrieval/applicability-types.js";
import { APPLICABILITY_CONTRACT_VERSION } from "../src/retrieval/applicability-types.js";
import { validateRankingCapture, type RankingCapture } from "../src/retrieval/ranking-capture.js";
import { ReadinessCaseSchema, type ReadinessCase } from "../src/retrieval/readiness-cases.js";
import { hashText } from "../src/retrieval/representations.js";
import { loadRetrievalSources } from "../src/retrieval/sources.js";
import type { SourceSnapshot } from "../src/retrieval/types.js";

const B5_CASE_ROOT = resolve("data/evaluation/applicability-v1");
const READINESS_DEVELOPMENT_PATH = resolve("data/evaluation/knowledge-readiness/development.json");
const B4_CAPTURE_PATH = resolve("reports/retrieval/b4-ranking/development-20260916-22590b22-timeout120s/capture.json");

export type ApplicabilityValidationReport = {
  formatVersion: 1;
  mode: "development-applicability-validation";
  evaluatedSplit: "development";
  holdoutExecuted: false;
  b4CaptureHash: string;
  caseSetHash: string;
  oracleHash: string;
  corpusHash: string;
  sourceRevision: string;
  promptVersion: string;
  promptHash: string;
  caseCount: 21;
  cases: readonly {
    caseId: string;
    candidateCount: number;
    evidenceRepresentationCount: number;
    promptInjectionDetected: boolean;
    lanes: Record<ApplicabilityLane, ApplicabilityInputMeasurement>;
  }[];
};

type PreparedCase = {
  oracle: ApplicabilityDevelopmentCase;
  basis: ApplicabilityCaseBasis;
  inputs: Record<ApplicabilityLane, ApplicabilityReasoningInput>;
  measurements: Record<ApplicabilityLane, ApplicabilityInputMeasurement>;
};
type PreparedDevelopment = {
  loaded: LoadedApplicabilityDevelopment;
  capture: RankingCapture;
  sourceSnapshot: SourceSnapshot;
  approvedCases: ApplicabilityDevelopmentCase[];
  preparedCases: PreparedCase[];
};

type CompareOptions = {
  providerKind: "openai-responses";
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  contextLimitTokens: number;
  authorizationReference: string;
  outputDir: string;
};

type ProviderFactory = (env: NodeJS.ProcessEnv, options: CompareOptions) => ApplicabilityReasoningProvider;
let providerFactoryForTests: ProviderFactory | undefined;

/** @internal Test-only provider seam. Filesystem authority remains fixed in this module. */
export function setApplicabilityEvaluationProviderFactoryForTests(factory: ProviderFactory | undefined): void {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") throw new Error("The B5 provider test seam is available only under tests.");
  providerFactoryForTests = factory;
}

function sha256(bytes: Buffer | string): string { return createHash("sha256").update(bytes).digest("hex"); }
function sourceCommit(): string {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() || "unknown"; }
  catch { return "unknown"; }
}
function projectedCorpusHash(snapshot: SourceSnapshot): string {
  return hashText(JSON.stringify(snapshot.resources.map(({ resource }) => [resource.key, resource.contentHash]).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)));
}
function readB4Capture(): RankingCapture {
  const raw = JSON.parse(readFileSync(B4_CAPTURE_PATH, "utf8")) as unknown;
  validateRankingCapture(raw);
  return raw;
}
function readReadinessDevelopment(expectedHash: string): { cases: ReadinessCase[]; hash: string } {
  const bytes = readFileSync(READINESS_DEVELOPMENT_PATH);
  const hash = sha256(bytes);
  if (hash !== expectedHash) throw new Error("B5 source readiness development hash mismatch.");
  let raw: unknown;
  try { raw = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("B5 source readiness development JSON is invalid."); }
  const cases = ReadinessCaseSchema.array().parse(raw);
  if (cases.some(({ split }) => split !== "development")) throw new Error("B5 source readiness input must contain development cases only.");
  return { cases, hash };
}
async function loadStaticSourceSnapshot(): Promise<SourceSnapshot> {
  const articles = await new KnowledgeRepository(resolve("data/knowledge")).list();
  return loadRetrievalSources({ articles, reusable: unavailableReusableKnowledge() });
}
async function prepareDevelopment(budget?: { contextLimitTokens: number; outputReserveTokens: number }): Promise<PreparedDevelopment> {
  const loaded = loadApplicabilityDevelopment(B5_CASE_ROOT);
  const capture = readB4Capture();
  const readiness = readReadinessDevelopment(loaded.manifest.sourceReadinessDevelopmentHash);
  const sourceSnapshot = await loadStaticSourceSnapshot();
  if (projectedCorpusHash(sourceSnapshot) !== loaded.manifest.corpusHash) throw new Error("B5 static source corpus hash mismatch.");
  validateApplicabilityDevelopment(loaded.manifest, loaded.cases, {
    capture,
    sourceReadinessCases: readiness.cases,
    sourceReadinessDevelopmentHash: readiness.hash,
    sourceSnapshot,
  });
  const approvedCases = selectApplicabilityDevelopmentForExecution(loaded.cases);
  const captureById = new Map(capture.cases.map((entry) => [entry.caseId, entry]));
  const preparedCases = approvedCases.map((oracle) => {
    const captureCase = captureById.get(oracle.id);
    if (!captureCase) throw new Error(`B5 case ${oracle.id} is absent from the frozen B4 capture.`);
    const basis = resolveApplicabilityBasis({
      captureHash: capture.captureHash,
      captureCase,
      safeCase: oracle.safeCase,
      taxonomy: oracle.taxonomy,
      sourceSnapshot,
      caseSetHash: loaded.manifest.sourceReadinessDevelopmentHash,
      oracleHash: loaded.developmentHash,
    });
    const evidenceOnly = buildApplicabilityInput(basis, "evidence-only");
    const taxonomyInformed = buildApplicabilityInput(basis, "taxonomy-informed");
    return {
      oracle,
      basis,
      inputs: { "evidence-only": evidenceOnly, "taxonomy-informed": taxonomyInformed },
      measurements: {
        "evidence-only": measureApplicabilityInput(evidenceOnly, budget),
        "taxonomy-informed": measureApplicabilityInput(taxonomyInformed, budget),
      },
    };
  });
  return { loaded, capture, sourceSnapshot, approvedCases, preparedCases };
}

function validationReport(prepared: PreparedDevelopment): ApplicabilityValidationReport {
  return {
    formatVersion: 1,
    mode: "development-applicability-validation",
    evaluatedSplit: "development",
    holdoutExecuted: false,
    b4CaptureHash: prepared.capture.captureHash,
    caseSetHash: prepared.loaded.manifest.sourceReadinessDevelopmentHash,
    oracleHash: prepared.loaded.developmentHash,
    corpusHash: prepared.loaded.manifest.corpusHash,
    sourceRevision: prepared.loaded.manifest.sourceRevision,
    promptVersion: prepared.loaded.manifest.promptVersion,
    promptHash: APPLICABILITY_PROMPT_HASH,
    caseCount: 21,
    cases: prepared.preparedCases.map(({ oracle, basis, measurements }) => ({
      caseId: oracle.id,
      candidateCount: basis.candidates.length,
      evidenceRepresentationCount: basis.evidenceRegistry.length,
      promptInjectionDetected: basis.promptInjectionRuleIds.length > 0,
      lanes: measurements,
    })),
  };
}

function parsePositiveInteger(label: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!value || !Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} requires a positive integer.`);
  return parsed;
}
function outputDirectory(requested: string): string {
  const canonical = canonicalNewB5ArtifactPath(requested);
  if (existsSync(canonical)) throw new Error("B5 output directory must be new; existing evidence cannot be overwritten.");
  return canonical;
}
function parseCompareOptions(args: readonly string[]): CompareOptions {
  let providerKind: string | undefined; let model: string | undefined; let timeout: string | undefined;
  let maxOutput: string | undefined; let contextLimit: string | undefined; let authorizationReference: string | undefined; let outputDir: string | undefined;
  const seen = new Set<string>();
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index]!;
    if (!option.startsWith("--")) throw new Error(`Unknown B5 argument: ${option}.`);
    if (seen.has(option)) throw new Error(`Duplicate B5 option: ${option}.`);
    seen.add(option);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
    if (option === "--provider") providerKind = value;
    else if (option === "--model") model = value;
    else if (option === "--timeout-ms") timeout = value;
    else if (option === "--max-output-tokens") maxOutput = value;
    else if (option === "--context-limit-tokens") contextLimit = value;
    else if (option === "--authorization-ref") authorizationReference = value;
    else if (option === "--output-dir") outputDir = value;
    else throw new Error(`Unknown B5 option: ${option}. Holdout and split execution are not supported.`);
  }
  if (providerKind !== "openai-responses") throw new Error("compare-development requires --provider openai-responses.");
  if (!model?.trim()) throw new Error("compare-development requires an explicit --model.");
  if (!authorizationReference?.trim()) throw new Error("compare-development requires an explicit --authorization-ref.");
  if (!outputDir?.trim()) throw new Error("compare-development requires an explicit --output-dir.");
  return {
    providerKind,
    model: model.trim(),
    timeoutMs: parsePositiveInteger("--timeout-ms", timeout),
    maxOutputTokens: parsePositiveInteger("--max-output-tokens", maxOutput),
    contextLimitTokens: parsePositiveInteger("--context-limit-tokens", contextLimit),
    authorizationReference: authorizationReference.trim(),
    outputDir: outputDirectory(outputDir),
  };
}
function parseValidationOutput(args: readonly string[]): string | undefined {
  if (args.length === 1) return undefined;
  if (args.length === 3 && args[1] === "--output-dir" && args[2] && !args[2].startsWith("--")) return outputDirectory(args[2]);
  throw new Error("validate-development accepts only optional --output-dir. Holdout and split execution are not supported.");
}
function buildProvider(env: NodeJS.ProcessEnv, options: CompareOptions): ApplicabilityReasoningProvider {
  if (providerFactoryForTests) return providerFactoryForTests(env, options);
  const provider = createApplicabilityReasoningProviderFromEnv(env, { enabled: true, model: options.model, timeoutMs: options.timeoutMs, maxOutputTokens: options.maxOutputTokens });
  if (!provider) throw new Error("B5 applicability provider is not configured.");
  return provider;
}

function telemetryFor(result: ApplicabilityCaseResult): ApplicabilityLaneCapture["telemetry"] {
  if (result.status !== "complete" && result.status !== "partial-assessment") return null;
  return {
    providerKind: result.telemetry.providerKind,
    model: result.telemetry.model,
    latencyMs: result.telemetry.latencyMs,
    ...(result.telemetry.usage === undefined ? {} : { usage: result.telemetry.usage }),
  };
}
function inputIdentityFor(input: ApplicabilityReasoningInput): ApplicabilityLaneCapture["inputIdentity"] {
  return {
    b4CaptureHash: input.identity.b4CaptureHash,
    b4CaseInputHash: input.identity.b4CaseInputHash,
    caseSetHash: input.identity.caseSetHash,
    oracleHash: input.identity.oracleHash,
    corpusHash: input.identity.corpusHash,
    indexGeneration: input.identity.indexGeneration,
    lexicalGeneration: input.identity.lexicalGeneration,
    semanticGeneration: input.identity.semanticGeneration,
    representationVersion: input.identity.representationVersion,
    candidateSnapshotHash: input.identity.candidateSnapshotHash,
    evidenceRegistryHash: input.identity.evidenceRegistryHash,
    safeCaseHash: input.identity.safeCaseHash,
    inputHash: input.identity.inputHash,
    taxonomyHash: input.lane === "taxonomy-informed" ? input.identity.taxonomyHash : null,
  };
}
async function executeLane(input: {
  lane: ApplicabilityLane;
  prepared: PreparedCase;
  provider: ApplicabilityReasoningProvider;
}): Promise<ApplicabilityLaneCapture> {
  const reasoningInput = input.prepared.inputs[input.lane];
  const measurement = input.prepared.measurements[input.lane];
  const startedAtMs = Date.now();
  const result = await assessApplicabilityCase({
    input: reasoningInput,
    provider: input.provider,
    measurement,
    promptInjectionDetected: input.prepared.basis.promptInjectionRuleIds.length > 0,
  });
  const completedAtMs = Date.now();
  const sanitized = sanitizeApplicabilityResult(result);
  return {
    lane: input.lane,
    nonTaxonomyBasisHash: input.prepared.basis.nonTaxonomyBasisHash,
    inputIdentity: inputIdentityFor(reasoningInput),
    inputMeasurement: captureMeasurement(measurement),
    result: sanitized,
    outputHash: hashCanonicalApplicabilityCapture(sanitized),
    telemetry: telemetryFor(result),
    timing: { startedAtMs, completedAtMs },
    traceTruncated: false,
  };
}

async function pairedCapture(prepared: PreparedDevelopment, provider: ApplicabilityReasoningProvider, options: CompareOptions): Promise<ApplicabilityCapture> {
  const cases: ApplicabilityCaseCapture[] = [];
  for (let index = 0; index < prepared.preparedCases.length; index += 1) {
    const item = prepared.preparedCases[index]!;
    const laneOrder: [ApplicabilityLane, ApplicabilityLane] = index % 2 === 0
      ? ["evidence-only", "taxonomy-informed"]
      : ["taxonomy-informed", "evidence-only"];
    const lanes: ApplicabilityLaneCapture[] = [];
    for (const lane of laneOrder) lanes.push(await executeLane({ lane, prepared: item, provider }));
    cases.push({
      caseId: item.oracle.id,
      safeCase: item.oracle.safeCase,
      safeCaseHash: item.basis.sharedIdentity.safeCaseHash,
      nonTaxonomyBasisHash: item.basis.nonTaxonomyBasisHash,
      candidateSnapshotHash: item.basis.sharedIdentity.candidateSnapshotHash,
      evidenceRegistryHash: item.basis.sharedIdentity.evidenceRegistryHash,
      candidates: captureCandidates(item.inputs["evidence-only"]),
      evidence: captureEvidence(item.inputs["evidence-only"]),
      laneOrder,
      lanes,
    });
  }
  const first = prepared.preparedCases[0]!.basis.sharedIdentity;
  const withoutHash: ApplicabilityCaptureWithoutHash = {
    formatVersion: 1,
    evaluatorSourceRevision: sourceCommit(),
    identity: {
      split: "development",
      reviewStatus: "approved",
      caseIds: prepared.approvedCases.map(({ id }) => id),
      contractVersion: APPLICABILITY_CONTRACT_VERSION,
      promptVersion: prepared.loaded.manifest.promptVersion,
      promptHash: APPLICABILITY_PROMPT_HASH,
      b4CaptureHash: prepared.capture.captureHash,
      caseSetHash: prepared.loaded.manifest.sourceReadinessDevelopmentHash,
      oracleHash: prepared.loaded.developmentHash,
      corpusHash: prepared.loaded.manifest.corpusHash,
      contentSourceRevision: prepared.loaded.manifest.sourceRevision,
      representationVersion: prepared.loaded.manifest.representationVersion,
      indexGeneration: first.indexGeneration,
      lexicalGeneration: first.lexicalGeneration,
      semanticGeneration: first.semanticGeneration,
      providerKind: options.providerKind,
      model: options.model,
    },
    cases,
  };
  return createApplicabilityCapture(withoutHash);
}

async function writeValidation(outputDir: string, report: ApplicabilityValidationReport): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "validation.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await writeFile(join(outputDir, "validation.md"), ["# B5 applicability development validation", "", `- Cases: ${report.caseCount}`, `- B4 capture: ${report.b4CaptureHash}`, `- Oracle: ${report.oracleHash}`, `- Holdout executed: ${report.holdoutExecuted}`, ""].join("\n"), { encoding: "utf8", flag: "wx" });
}

export async function runApplicabilityEvaluation(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<ApplicabilityEvaluationReport | ApplicabilityValidationReport> {
  const command = args[0];
  if (command === "validate-development") {
    const outputDir = parseValidationOutput(args);
    const prepared = await prepareDevelopment();
    const report = validationReport(prepared);
    if (outputDir) await writeValidation(outputDir, report);
    return report;
  }
  if (command !== "compare-development") throw new Error("B5 applicability evaluation supports only validate-development and compare-development.");

  const options = parseCompareOptions(args);
  const prepared = await prepareDevelopment({ contextLimitTokens: options.contextLimitTokens, outputReserveTokens: options.maxOutputTokens });
  const oversized = prepared.preparedCases.flatMap(({ oracle, measurements }) => (["evidence-only", "taxonomy-informed"] as const)
    .filter((lane) => measurements[lane].fits !== true)
    .map((lane) => `${oracle.id}:${lane}`));
  if (oversized.length > 0) throw new Error(`B5 context limit is insufficient for complete inputs: ${oversized.join(", ")}.`);
  // Authorization, frozen identities, source evidence, review status, context sizes, and output path all passed before provider construction.
  const provider = buildProvider(env, options);
  const capture = await pairedCapture(prepared, provider, options);
  const report = scoreApplicabilityCapture({ capture, cases: prepared.approvedCases });
  const outputDir = options.outputDir;
  await mkdir(outputDir, { recursive: true });
  await writeApplicabilityCaptureExclusive(join(outputDir, "capture.json"), capture);
  const publishedReport: ApplicabilityEvaluationReport = { ...report, authorizationReference: options.authorizationReference };
  await writeFile(join(outputDir, "evaluation.json"), `${JSON.stringify(publishedReport, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await writeFile(join(outputDir, "evaluation.md"), renderApplicabilityMarkdown(publishedReport), { encoding: "utf8", flag: "wx" });
  return publishedReport;
}

async function main(): Promise<void> {
  const report = await runApplicabilityEvaluation(process.argv.slice(2), process.env);
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
