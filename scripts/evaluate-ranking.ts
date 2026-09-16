import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

import { evaluateSectionEvidence, type SectionEvidenceResult } from "../src/retrieval/section-evidence.js";
import { ReadinessCaseSchema, ReadinessManifestSchema, selectReadinessDevelopment, type ReadinessCase, type ReadinessManifest } from "../src/retrieval/readiness-cases.js";
import { scorePool, scoreRanked, type RetrievalExpectation } from "../src/retrieval/evaluation.js";
import { hashCanonicalRankingCapture, validateRankingCapture, type RankingCapture, type RankingCaptureCase } from "../src/retrieval/ranking-capture.js";
import { rankRetrieval } from "../src/retrieval/ranking.js";
import type { RankedMembership, RankingPolicy, RankingResult } from "../src/retrieval/ranking-types.js";
import type { Reference, ResourceKey, ResourceType } from "../src/retrieval/types.js";

const RESOURCE_TYPES = [
  "knowledge-article",
  "known-cause",
  "diagnostic-playbook",
  "resolved-ticket",
] as const satisfies readonly ResourceType[];

const FIVE_POLICIES: readonly RankingPolicy[] = [
  { id: "lexical-only-v1", kind: "lexical-only" },
  { id: "semantic-only-v1", kind: "semantic-only" },
  { id: "rrf-equal-v1", kind: "rrf-equal", constant: 10 },
  { id: "rrf-equal-v1", kind: "rrf-equal", constant: 30 },
  { id: "rrf-equal-v1", kind: "rrf-equal", constant: 60 },
];

const POLICY_OUTPUT_LIMITS = { top1: 1, top5: 5 } as const;

type ComparisonOptions = {
  capturePath: string;
  caseSetPath: string;
  caseSetDirectory: string;
};

export type RankingTypeMetrics = {
  eligibleCases: number;
  recallAt1: number | null;
  recallAt5: number | null;
  precisionAt1: number | null;
  precisionAt5: number | null;
  precisionEligibleCases: number;
  precisionExcludedIncompleteLabels: number;
  qualityStatus: "measured" | "unavailable-no-eligible-cases";
};

type SectionSummary = {
  judged: number;
  supportingBestMatch: number;
  wrongBestSection: number;
  supportingBestMatchRate: number | null;
  lowerSupportingMatch: number;
  anySupportingMatch: number;
  excluded: Record<string, number>;
};

type SectionVisibility = {
  top1: { lexical: SectionSummary; semantic: SectionSummary };
  top5: { lexical: SectionSummary; semantic: SectionSummary };
};

type PolicyCaseOutcome = {
  caseId: string;
  families: readonly ReadinessCase["families"][number][];
  topic: ReadinessCase["topic"];
  recallAt1ByType: Record<ResourceType, number | null>;
  recallAt5ByType: Record<ResourceType, number | null>;
};

type CaseDelta = { resourceType: ResourceType; metric: "recallAt1" | "recallAt5"; delta: number };

type CaseComparison = {
  caseId: string;
  families: readonly ReadinessCase["families"][number][];
  topic: ReadinessCase["topic"];
  policyResults: Record<string, {
    recallAt1ByType: Record<ResourceType, number | null>;
    recallAt5ByType: Record<ResourceType, number | null>;
    gainsVsLexical: readonly CaseDelta[];
    lossesVsLexical: readonly CaseDelta[];
  }>;
};

type PolicyReport = {
  policyKey: string;
  policy: RankingPolicy;
  captureHash: string;
  caseInputHashes: readonly string[];
  perTypeMetrics: Record<ResourceType, RankingTypeMetrics>;
  sectionVisibility: SectionVisibility;
  rankingTimingMs: { total: number; perCase: readonly number[] };
  capturedTimingsMs: { retrieval: number; provider: number };
  caseOutcomes: readonly PolicyCaseOutcome[];
};

export type RankingComparisonReport = {
  formatVersion: 1;
  mode: "development-ranking-comparison";
  evaluatedSplit: "development";
  holdoutExecuted: false;
  evaluatorSourceRevision: string;
  captureHash: string;
  caseInputHashes: readonly string[];
  inputIdentity: RankingCapture["identity"];
  policyOutputLimits: typeof POLICY_OUTPUT_LIMITS;
  policies: readonly PolicyReport[];
  perTypeMetricsByPolicy: Readonly<Record<string, Record<ResourceType, RankingTypeMetrics>>>;
  candidatePoolMetrics: {
    unchangedAcrossPolicies: true;
    eligibleCases: number;
    candidateRecall: { value: number | null; eligibleCases: number };
    requiredCoverage: { value: number | null; eligibleCases: number };
    unjudgedResourceCount: number;
    hardNegativeHitCount: number;
  };
  referenceMetrics: {
    casesWithReferences: number;
    membershipCount: number;
    missingReferenceDiagnosticCount: number;
    byChannel: { deterministic: number; knownCause: number };
  };
  caseComparisons: readonly CaseComparison[];
  corpusLimitations: {
    resolvedTicketQuality: "unavailable-no-eligible-cases" | "measured";
    note: string;
  };
};

type LoadedDevelopment = {
  manifest: ReadinessManifest;
  manifestHash: string;
  development: readonly ReadinessCase[];
  caseSetDirectory: string;
};

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message: string): never {
  throw new Error(`Invalid B4 ranking comparison: ${message}`);
}

function same(left: unknown, right: unknown): boolean {
  return hashCanonicalRankingCapture(left) === hashCanonicalRankingCapture(right);
}

function isWithin(directory: string, candidate: string): boolean {
  const child = relative(directory, candidate);
  return child === "" || (child !== ".." && !child.startsWith("../") && !child.startsWith("..\\") && !isAbsolute(child));
}

function developmentCasePath(directory: string, path: string): string {
  if (isAbsolute(path)) fail("development case paths must remain relative to the manifest directory.");
  const candidate = resolve(directory, path);
  if (!isWithin(directory, candidate)) fail("development case paths must remain inside the case-set directory.");
  const canonical = realpathSync(candidate);
  if (!isWithin(directory, canonical)) fail("development case paths must remain inside the case-set directory.");
  return canonical;
}

function canonicalDestinationPath(path: string): string {
  const resolved = resolve(path);
  const missing: string[] = [];
  let existing = resolved;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) fail("comparison output path cannot be resolved.");
    missing.unshift(basename(existing));
    existing = parent;
  }
  return missing.reduce((current, component) => join(current, component), realpathSync(existing));
}

async function loadDevelopmentCaseSet(caseSetPath: string, caseSetDirectory: string): Promise<LoadedDevelopment> {
  const manifestPath = resolve(caseSetPath);
  const manifestBytes = await readFile(manifestPath);
  let rawManifest: unknown;
  try { rawManifest = JSON.parse(manifestBytes.toString("utf8")); } catch { fail("case-set manifest is not valid JSON."); }
  const parsedManifest = ReadinessManifestSchema.safeParse(rawManifest);
  if (!parsedManifest.success) fail("case-set manifest is invalid.");
  const manifest = parsedManifest.data;
  const developmentBytes = await readFile(developmentCasePath(caseSetDirectory, manifest.development.path));
  if (sha256(developmentBytes) !== manifest.development.sha256) fail("development case-set hash does not match its manifest.");
  let rawDevelopment: unknown;
  try { rawDevelopment = JSON.parse(developmentBytes.toString("utf8")); } catch { fail("development case-set is not valid JSON."); }
  let development: ReadinessCase[];
  try { development = selectReadinessDevelopment(ReadinessCaseSchema.array().parse(rawDevelopment)); }
  catch { fail("development case-set must contain only approved development cases."); }
  return { manifest, manifestHash: sha256(manifestBytes), development, caseSetDirectory };
}

function labelHash(cases: readonly ReadinessCase[]): string {
  return hashCanonicalRankingCapture(cases.map(({ id, expectation, supportingSections }) => ({ id, expectation, supportingSections })));
}

function policyKey(policy: RankingPolicy): string {
  return policy.kind === "rrf-equal" ? `${policy.id}:${policy.constant}` : policy.id;
}

function assertFrozenInputs(capture: RankingCapture, loaded: LoadedDevelopment): void {
  const { manifest, manifestHash: expectedManifestHash, development } = loaded;
  const expectedCaseIds = development.map(({ id }) => id);
  const expectedLabelHash = labelHash(development);
  const checks: readonly [string, unknown, unknown][] = [
    ["case-set hash", capture.identity.caseSetHash, manifest.development.sha256],
    ["label hash", capture.identity.labelHash, expectedLabelHash],
    ["manifest hash", capture.identity.manifestHash, expectedManifestHash],
    ["case IDs", capture.identity.caseIds, expectedCaseIds],
    ["corpus hash", capture.identity.corpusHash, manifest.corpusHash],
    ["content source revision", capture.identity.contentSourceRevision, manifest.sourceRevision],
    ["source cutoff", capture.identity.sourceCutoff, manifest.cutoff],
    ["representation version", capture.identity.representationVersion, manifest.representationVersion],
  ];
  for (const [name, actual, expected] of checks) if (!same(actual, expected)) fail(`${name} does not match the frozen development case set.`);
  const casesById = new Map(development.map((entry) => [entry.id, entry]));
  for (const captureCase of capture.cases) if (!casesById.has(captureCase.caseId)) fail(`capture contains a case absent from the development case set: ${captureCase.caseId}.`);
}

function typedExpectation(expectation: RetrievalExpectation, resourceType: ResourceType): RetrievalExpectation {
  return {
    ...expectation,
    requiredResourceKeys: expectation.requiredResourceKeys.filter((key) => key.startsWith(`${resourceType}:`)),
    relevantResourceKeys: expectation.relevantResourceKeys.filter((key) => key.startsWith(`${resourceType}:`)),
    hardNegativeResourceKeys: expectation.hardNegativeResourceKeys.filter((key) => key.startsWith(`${resourceType}:`)),
  };
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metricsForType(
  pairs: readonly { readinessCase: ReadinessCase; captureCase: RankingCaptureCase; ranking: RankingResult }[],
  resourceType: ResourceType,
): RankingTypeMetrics {
  const rows = pairs.map(({ readinessCase, ranking }) => {
    const expectation = typedExpectation(readinessCase.expectation, resourceType);
    const keys = ranking.byType[resourceType].memberships.map(({ resourceKey }) => resourceKey as ResourceKey);
    return { expectation, at1: scoreRanked(keys, expectation, 1), at5: scoreRanked(keys, expectation, 5) };
  });
  const eligible = rows.filter(({ expectation }) => expectation.relevantResourceKeys.length > 0);
  const precisionEligible = eligible.filter(({ expectation }) => expectation.labelsComplete);
  const precisionAt1 = precisionEligible.map(({ at1 }) => at1.precisionAtK).filter((value): value is number => value !== null);
  const precisionAt5 = precisionEligible.map(({ at5 }) => at5.precisionAtK).filter((value): value is number => value !== null);
  return {
    eligibleCases: eligible.length,
    recallAt1: average(eligible.map(({ at1 }) => at1.recallAtK).filter((value): value is number => value !== null)),
    recallAt5: average(eligible.map(({ at5 }) => at5.recallAtK).filter((value): value is number => value !== null)),
    precisionAt1: average(precisionAt1),
    precisionAt5: average(precisionAt5),
    precisionEligibleCases: precisionEligible.length,
    precisionExcludedIncompleteLabels: eligible.length - precisionEligible.length,
    qualityStatus: eligible.length === 0 ? "unavailable-no-eligible-cases" : "measured",
  };
}

function sectionSummary(rows: readonly SectionEvidenceResult[]): SectionSummary {
  const supportingBestMatch = rows.filter(({ status }) => status === "supporting-best-match").length;
  const wrongBestSection = rows.filter(({ status }) => status === "right-article-wrong-best-section").length;
  const judged = supportingBestMatch + wrongBestSection;
  return {
    judged,
    supportingBestMatch,
    wrongBestSection,
    supportingBestMatchRate: judged === 0 ? null : supportingBestMatch / judged,
    lowerSupportingMatch: rows.filter(({ status, supportingMatchPresent }) => status === "right-article-wrong-best-section" && supportingMatchPresent).length,
    anySupportingMatch: rows.filter(({ supportingMatchPresent }) => supportingMatchPresent === true).length,
    excluded: Object.fromEntries(([
      "resource-missing", "channel-unavailable", "unjudged-section",
    ] as const).map((status) => [status, rows.filter((row) => row.status === status).length])),
  };
}

function selectedMemberships(ranking: RankingResult, top: 1 | 5): readonly RankedMembership[] {
  return RESOURCE_TYPES.flatMap((resourceType) => ranking.byType[resourceType].memberships.slice(0, top));
}

function sectionVisibility(
  pairs: readonly { readinessCase: ReadinessCase; captureCase: RankingCaptureCase; ranking: RankingResult }[],
): SectionVisibility {
  const result = {} as SectionVisibility;
  for (const top of [1, 5] as const) {
    const rows = { lexical: [] as SectionEvidenceResult[], semantic: [] as SectionEvidenceResult[] };
    for (const { readinessCase, captureCase, ranking } of pairs) {
      for (const membership of selectedMemberships(ranking, top)) {
        const candidate = captureCase.retrieval.candidates.find(({ resourceKey }) => resourceKey === membership.resourceKey);
        for (const channel of ["lexical", "semantic"] as const) {
          const state = captureCase.retrieval[channel];
          rows[channel].push(evaluateSectionEvidence({
            candidate,
            channel,
            channelAvailable: state.status === "used" || (channel === "semantic" && state.status === "stale" && state.reason === "pending-vectors"),
            bindings: readinessCase.supportingSections,
          }));
        }
      }
    }
    result[`top${top}`] = { lexical: sectionSummary(rows.lexical), semantic: sectionSummary(rows.semantic) };
  }
  return result;
}

function caseOutcomes(
  pairs: readonly { readinessCase: ReadinessCase; captureCase: RankingCaptureCase; ranking: RankingResult }[],
): readonly PolicyCaseOutcome[] {
  return pairs.map(({ readinessCase, ranking }) => ({
    caseId: readinessCase.id,
    families: readinessCase.families,
    topic: readinessCase.topic,
    recallAt1ByType: Object.fromEntries(RESOURCE_TYPES.map((resourceType) => [resourceType, scoreRanked(ranking.byType[resourceType].memberships.slice(0, 1).map(({ resourceKey }) => resourceKey as ResourceKey), typedExpectation(readinessCase.expectation, resourceType), 1).recallAtK])) as Record<ResourceType, number | null>,
    recallAt5ByType: Object.fromEntries(RESOURCE_TYPES.map((resourceType) => [resourceType, scoreRanked(ranking.byType[resourceType].memberships.slice(0, 5).map(({ resourceKey }) => resourceKey as ResourceKey), typedExpectation(readinessCase.expectation, resourceType), 5).recallAtK])) as Record<ResourceType, number | null>,
  }));
}

function compareCaseOutcomes(policyReports: readonly PolicyReport[], cases: readonly ReadinessCase[]): readonly CaseComparison[] {
  const byCase = new Map<string, Map<string, PolicyCaseOutcome>>();
  for (const report of policyReports) for (const outcome of report.caseOutcomes) {
    const policies = byCase.get(outcome.caseId) ?? new Map<string, PolicyCaseOutcome>();
    policies.set(report.policyKey, outcome);
    byCase.set(outcome.caseId, policies);
  }
  const lexicalKey = policyKey(FIVE_POLICIES[0]!);
  return cases.map((readinessCase) => {
    const outcomes = byCase.get(readinessCase.id) ?? new Map<string, PolicyCaseOutcome>();
    const lexical = outcomes.get(lexicalKey);
    const policyResults: CaseComparison["policyResults"] = {};
    for (const report of policyReports) {
      const outcome = outcomes.get(report.policyKey);
      if (!outcome) continue;
      const gainsVsLexical: CaseDelta[] = [];
      const lossesVsLexical: CaseDelta[] = [];
      for (const resourceType of RESOURCE_TYPES) for (const [metric, current, baseline] of [
        ["recallAt1", outcome.recallAt1ByType[resourceType], lexical?.recallAt1ByType[resourceType]],
        ["recallAt5", outcome.recallAt5ByType[resourceType], lexical?.recallAt5ByType[resourceType]],
      ] as const) {
        if (typeof current !== "number" || typeof baseline !== "number") continue;
        const delta = current - baseline;
        if (delta > 0) gainsVsLexical.push({ resourceType, metric, delta });
        if (delta < 0) lossesVsLexical.push({ resourceType, metric, delta });
      }
      policyResults[report.policyKey] = { recallAt1ByType: outcome.recallAt1ByType, recallAt5ByType: outcome.recallAt5ByType, gainsVsLexical, lossesVsLexical };
    }
    return { caseId: readinessCase.id, families: readinessCase.families, topic: readinessCase.topic, policyResults };
  });
}

function candidatePoolMetrics(capture: RankingCapture, casesById: ReadonlyMap<string, ReadinessCase>): RankingComparisonReport["candidatePoolMetrics"] {
  const rows = capture.cases.map((captureCase) => {
    const readinessCase = casesById.get(captureCase.caseId)!;
    return scorePool(captureCase.retrieval.candidates.map(({ resourceKey }) => resourceKey), readinessCase.expectation);
  });
  const candidateRecall = rows.map(({ candidateRecall }) => candidateRecall).filter((value): value is number => value !== null);
  const requiredCoverage = rows.map(({ requiredCoverage }) => requiredCoverage).filter((value): value is number => value !== null);
  return {
    unchangedAcrossPolicies: true,
    eligibleCases: candidateRecall.length,
    candidateRecall: { value: average(candidateRecall), eligibleCases: candidateRecall.length },
    requiredCoverage: { value: average(requiredCoverage), eligibleCases: requiredCoverage.length },
    unjudgedResourceCount: rows.reduce((sum, row) => sum + row.unjudgedKeys.length, 0),
    hardNegativeHitCount: rows.reduce((sum, row) => sum + row.hardNegativeHits.length, 0),
  };
}

function referenceMetrics(capture: RankingCapture): RankingComparisonReport["referenceMetrics"] {
  const references: Reference[] = [];
  for (const captureCase of capture.cases) {
    const byResource = new Map<string, Map<string, Reference>>();
    for (const candidate of captureCase.retrieval.candidates) {
      const provenance = byResource.get(candidate.resourceKey) ?? new Map<string, Reference>();
      for (const reference of [...candidate.deterministicReferences, ...candidate.knownCauseReferences]) provenance.set(hashCanonicalRankingCapture(reference), reference);
      byResource.set(candidate.resourceKey, provenance);
    }
    references.push(...[...byResource.values()].flatMap((provenance) => [...provenance.values()]));
  }
  return {
    casesWithReferences: capture.cases.filter(({ retrieval }) => retrieval.candidates.some(({ deterministicReferences, knownCauseReferences }) => deterministicReferences.length > 0 || knownCauseReferences.length > 0)).length,
    membershipCount: references.length,
    missingReferenceDiagnosticCount: capture.cases.reduce((sum, { retrieval }) => sum + retrieval.referenceDiagnostics.length, 0),
    byChannel: {
      deterministic: references.filter(({ channel }) => channel === "deterministic-reference").length,
      knownCause: references.filter(({ channel }) => channel === "known-cause-reference").length,
    },
  };
}

function capturePairs(capture: RankingCapture, casesById: ReadonlyMap<string, ReadinessCase>, policy: RankingPolicy) {
  return capture.cases.map((captureCase) => {
    const readinessCase = casesById.get(captureCase.caseId);
    if (!readinessCase) fail(`capture case ${captureCase.caseId} is absent from the development case set.`);
    const ranking = rankRetrieval({ contractVersion: 1, queryBasis: captureCase.queryBasis, retrieval: captureCase.retrieval, outputLimits: captureCase.rankingProvenance.outputLimits }, policy);
    return { readinessCase, captureCase, ranking };
  });
}

export async function compareDevelopment(options: ComparisonOptions): Promise<RankingComparisonReport> {
  const captureRaw = JSON.parse(await readFile(resolve(options.capturePath), "utf8")) as unknown;
  validateRankingCapture(captureRaw);
  const capture = captureRaw;
  const loaded = await loadDevelopmentCaseSet(options.caseSetPath, options.caseSetDirectory);
  assertFrozenInputs(capture, loaded);
  for (const resourceType of RESOURCE_TYPES) if (capture.identity.outputLimits[resourceType] < 5) fail(`capture output limit for ${resourceType} must be at least five for top-N comparison.`);
  const casesById = new Map(loaded.development.map((readinessCase) => [readinessCase.id, readinessCase]));
  const policyReports: PolicyReport[] = [];
  for (const policy of FIVE_POLICIES) {
    const startedAt = performance.now();
    const pairs = capturePairs(capture, casesById, policy);
    const duration = performance.now() - startedAt;
    const timings = capture.cases.reduce((result, captureCase) => ({ retrieval: result.retrieval + captureCase.timingsMs.retrieval, provider: result.provider + captureCase.timingsMs.provider }), { retrieval: 0, provider: 0 });
    policyReports.push({
      policyKey: policyKey(policy),
      policy,
      captureHash: capture.captureHash,
      caseInputHashes: capture.cases.map(({ rankingProvenance }) => rankingProvenance.inputHash),
      perTypeMetrics: Object.fromEntries(RESOURCE_TYPES.map((resourceType) => [resourceType, metricsForType(pairs, resourceType)])) as Record<ResourceType, RankingTypeMetrics>,
      sectionVisibility: sectionVisibility(pairs),
      rankingTimingMs: { total: duration, perCase: pairs.map(() => duration / Math.max(1, pairs.length)) },
      capturedTimingsMs: timings,
      caseOutcomes: caseOutcomes(pairs),
    });
  }
  const report: RankingComparisonReport = {
    formatVersion: 1,
    mode: "development-ranking-comparison",
    evaluatedSplit: "development",
    holdoutExecuted: false,
    evaluatorSourceRevision: capture.evaluatorSourceRevision,
    captureHash: capture.captureHash,
    caseInputHashes: capture.cases.map(({ rankingProvenance }) => rankingProvenance.inputHash),
    inputIdentity: capture.identity,
    policyOutputLimits: POLICY_OUTPUT_LIMITS,
    policies: policyReports,
    perTypeMetricsByPolicy: Object.fromEntries(policyReports.map((policy) => [policy.policyKey, policy.perTypeMetrics])),
    candidatePoolMetrics: candidatePoolMetrics(capture, casesById),
    referenceMetrics: referenceMetrics(capture),
    caseComparisons: compareCaseOutcomes(policyReports, loaded.development),
    corpusLimitations: {
      resolvedTicketQuality: policyReports[0]!.perTypeMetrics["resolved-ticket"].qualityStatus,
      note: policyReports[0]!.perTypeMetrics["resolved-ticket"].eligibleCases === 0 ? "No eligible resolved-ticket examples exist in the frozen development corpus; no resolved-ticket quality claim is made." : "Eligible resolved-ticket examples are present in the frozen development corpus.",
    },
  };
  return report;
}

export function markdownReport(report: RankingComparisonReport): string {
  return [
    "# B4 development ranking comparison",
    "",
    `- Capture hash: ${report.captureHash}`,
    `- Evaluated split: ${report.evaluatedSplit}`,
    `- Holdout executed: ${report.holdoutExecuted}`,
    `- Candidate-pool metrics unchanged across policies: ${report.candidatePoolMetrics.unchangedAcrossPolicies}`,
    "",
    "## Policies",
    "",
    ...report.policies.map((policy) => `- ${policy.policyKey}: ${JSON.stringify(policy.perTypeMetrics)}`),
    "",
    "## References",
    "",
    JSON.stringify(report.referenceMetrics),
    "",
    "## Case comparisons",
    "",
    JSON.stringify(report.caseComparisons),
    "",
    "## Complete report model",
    "",
    "```json",
    JSON.stringify(report, null, 2),
    "```",
    "",
  ].join("\n");
}

function parseOptions(args: readonly string[]): ComparisonOptions & { outputDir: string } {
  if (args[0] !== "compare-development") fail("only compare-development is available; holdout comparison is not implemented or authorized.");
  let capturePath: string | undefined;
  let caseSetPath: string | undefined;
  let outputDir: string | undefined;
  const seen = new Set<string>();
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index]!;
    if (seen.has(option)) fail(`duplicate option ${option}.`);
    seen.add(option);
    const value = args[++index];
    if (!value || value.startsWith("--")) fail(`${option} requires a value.`);
    if (option === "--capture") capturePath = value;
    else if (option === "--case-set") caseSetPath = value;
    else if (option === "--output-dir") outputDir = value;
    else fail(`unknown option ${option}.`);
  }
  if (!capturePath || !caseSetPath || !outputDir) fail("compare-development requires --capture, --case-set, and --output-dir.");
  const requestedManifestPath = resolve(caseSetPath);
  if (!existsSync(requestedManifestPath)) fail("case-set manifest does not exist.");
  const canonicalManifestPath = realpathSync(requestedManifestPath);
  const caseSetDirectory = dirname(canonicalManifestPath);
  const requestedOutputDir = resolve(outputDir);
  const canonicalOutputDir = canonicalDestinationPath(requestedOutputDir);
  if (isWithin(caseSetDirectory, canonicalOutputDir)) fail("comparison output must not be written below the readiness case-set directory.");
  if (existsSync(requestedOutputDir)) fail("comparison output must use a new directory; existing evidence cannot be overwritten.");
  return { capturePath, caseSetPath: canonicalManifestPath, caseSetDirectory, outputDir: canonicalOutputDir };
}

export async function runRankingEvaluation(args: readonly string[]): Promise<RankingComparisonReport> {
  const options = parseOptions(args);
  const report = await compareDevelopment(options);
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(join(options.outputDir, "evaluation.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await writeFile(join(options.outputDir, "evaluation.md"), markdownReport(report), { encoding: "utf8", flag: "wx" });
  return report;
}

async function main(): Promise<void> {
  const report = await runRankingEvaluation(process.argv.slice(2));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
