import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEvaluationOracles, type EvaluationOracle } from "../src/evaluation-oracle.js";
import { TicketRepository } from "../src/ticket-repository.js";
import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { buildRetrievalQuery } from "../src/retrieval/stage.js";
import { loadRetrievalSources } from "../src/retrieval/sources.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { IndexManager } from "../src/retrieval/index-manager.js";
import { retrieve } from "../src/retrieval/search.js";
import { scorePool, scoreRanked, type RetrievalExpectation } from "../src/retrieval/evaluation.js";
import { unavailableReusableKnowledge } from "../src/knowledge-evolution/reusable-context.js";
import { EmbeddingProviderError, embeddingProviderFromEnv } from "../src/retrieval/embedding-provider.js";
import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";
import { classifyTicketFromContext } from "../src/approval-desk/classifier.js";
import type { CompletedDiagnosisReadSnapshot } from "../src/knowledge-evolution/completed-diagnosis-source.js";
import { SYNTHETIC_RETRIEVAL_EVALUATION_SCENARIOS } from "../src/retrieval/evaluation-fixtures.js";
import type { Candidate, EmbeddingProvider, Reference, ResourceKey } from "../src/retrieval/types.js";
import { hashText, REPRESENTATION_VERSION } from "../src/retrieval/representations.js";
import { ReadinessCaseSchema, ReadinessManifestSchema, selectReadinessDevelopment, validateReadinessCases, validateReadinessSplits, type ReadinessCase } from "../src/retrieval/readiness-cases.js";
import { evaluateSectionEvidence, type SectionEvidenceResult } from "../src/retrieval/section-evidence.js";
import { createRankingCapture, hashCanonicalRankingCapture, modelForCapture, writeRankingCaptureExclusive, type RankingCaptureCase, type RankingCaptureQueryFormat } from "../src/retrieval/ranking-capture.js";
import { canonicalNewB4ArtifactPath } from "../src/retrieval/ranking-artifact-path.js";
import { rankRetrieval } from "../src/retrieval/ranking.js";
import type { RankingOutputLimits } from "../src/retrieval/ranking-types.js";
import type { Limits } from "../src/retrieval/types.js";

type ScoringOracle = Pick<EvaluationOracle, "ticketId" | "retrieval" | "family" | "contrastGroup">;
type SectionDiagnostic = SectionEvidenceResult & { resourceKey: string; channel: "lexical" | "semantic" };
type EvaluationInput = { provider?: EmbeddingProvider; completedSnapshots?: readonly CompletedDiagnosisReadSnapshot[]; semanticQueryFormat?: SemanticQueryFormat; caseSetPath?: string; split?: "development"; validateCasesOnly?: boolean; rankingCaptureOutput?: string; rankingArtifactRoot?: string };
const DEFAULT_B4_ARTIFACT_ROOT = resolve("reports/retrieval/b4-ranking");

function caseFilePath(directory: string, path: string): string {
  const outside = (candidate: string) => { const rel = relative(directory, candidate); return rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel); };
  const candidate = resolve(directory, path);
  if (isAbsolute(path) || /^[a-z]:/i.test(path) || outside(candidate)) throw new Error("Manifest paths must remain inside the case-set directory.");
  const canonical = realpathSync(candidate);
  if (outside(canonical)) throw new Error("Manifest paths must remain inside the case-set directory.");
  return canonical;
}

function loadReadiness(caseSetPath: string, validationOnly: boolean) {
  const manifestBytes = readFileSync(caseSetPath);
  let raw: unknown;
  try { raw = JSON.parse(manifestBytes.toString("utf8")); } catch { throw new Error("Invalid readiness manifest JSON."); }
  if ((raw as { representationVersion?: unknown })?.representationVersion !== REPRESENTATION_VERSION) throw new Error("Readiness representation version does not match the evaluator.");
  const parsedManifest = ReadinessManifestSchema.safeParse(raw);
  if (!parsedManifest.success) throw new Error("Invalid readiness manifest structure.");
  const manifest = parsedManifest.data;
  const directory = realpathSync(dirname(resolve(caseSetPath)));
  // Check both byte identities before parsing any scored inputs.
  const bytes = Object.fromEntries((["development", "holdout"] as const).map((split) => {
    const contents = readFileSync(caseFilePath(directory, manifest[split].path));
    if (createHash("sha256").update(contents).digest("hex") !== manifest[split].sha256) throw new Error(`Readiness ${split} case hash mismatch.`);
    return [split, contents.toString("utf8")];
  }));
  const parse = (split: "development" | "holdout") => {
    try {
      const cases = ReadinessCaseSchema.array().parse(JSON.parse(bytes[split]!));
      if (cases.some(({ id }) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))) throw new Error("Unsafe ID");
      return cases;
    } catch { throw new Error(`Invalid ${split} case structure; safe case IDs and valid labels are required.`); }
  };
  const development = parse("development");
  const holdout = parse("holdout");
  try { validateReadinessSplits(development, holdout); }
  catch { throw new Error("Readiness split structure is invalid or scenario lineage crosses splits."); }
  if (!validationOnly) selectReadinessDevelopment(development);
  return { manifest, manifestHash: createHash("sha256").update(manifestBytes).digest("hex"), development, holdout };
}

const K_BUDGET = {
  "knowledge-article": { lexical: 5, semantic: 5 },
  "known-cause": { lexical: 5, semantic: 5 },
  "diagnostic-playbook": { lexical: 5, semantic: 5 },
  "resolved-ticket": { lexical: 5, semantic: 5 },
} as const;
const B4_OUTPUT_LIMITS: RankingOutputLimits = {
  "knowledge-article": 5,
  "known-cause": 5,
  "diagnostic-playbook": 5,
  "resolved-ticket": 5,
};

function captureRetrievalLimits(): Limits {
  return Object.fromEntries(Object.entries(K_BUDGET).map(([type, limits]) => [type, { ...limits }])) as Limits;
}

function rankingCaptureQueryFormat(format: SemanticQueryFormat | undefined): RankingCaptureQueryFormat {
  return format === undefined
    ? { kind: "plain-query-v1", template: "query-text-v1" }
    : { kind: format.kind, template: format.template };
}

export function readinessLabelHash(cases: readonly ReadinessCase[]): string {
  return hashCanonicalRankingCapture(cases.map(({ id, expectation, supportingSections }) => ({ id, expectation, supportingSections })));
}
const SCENARIO_CUTOFF = "2026-09-12T23:59:59.999Z";
const CONTRAST_FAMILIES = [
  "webhook rotation/latency",
  "SMS quiet-hours/consent delay",
  "Shopify mapping/general sync",
  "editor session/platform loading",
] as const;
export const QWEN3_RETRIEVAL_QUERY_INSTRUCTION = "Given a support ticket, retrieve relevant support resources.";
export type SemanticQueryFormat = {
  kind: "qwen3-retrieval-instruction-v1";
  instruction: string;
  template: "Instruct: {instruction}\n Query:{query}";
};
export const QWEN3_RETRIEVAL_QUERY_FORMAT: SemanticQueryFormat = {
  kind: "qwen3-retrieval-instruction-v1",
  instruction: QWEN3_RETRIEVAL_QUERY_INSTRUCTION,
  template: "Instruct: {instruction}\n Query:{query}",
};

export function formatQwen3RetrievalQuery(query: string, format: SemanticQueryFormat = QWEN3_RETRIEVAL_QUERY_FORMAT): string {
  return format.template.replace("{instruction}", format.instruction).replace("{query}", query);
}

type ScenarioReport = {
  ticketId: string;
  syntheticFixtureId?: string;
  family?: string;
  contrastGroup?: string;
  lexicalKeys: readonly string[];
  semanticKeys: readonly string[];
  deterministicReferenceKeys: readonly string[];
  knownCauseReferenceKeys: readonly string[];
  unionKeys: readonly string[];
  candidateCount: number;
  returnedRepresentations: Record<string, { lexical?: readonly { representationId: string; score: number; rank: number }[]; semantic?: readonly { representationId: string; score: number; rank: number }[] }>;
  pool: ReturnType<typeof scorePool>;
  referencePools: { deterministic: ReturnType<typeof scorePool>; knownCause: ReturnType<typeof scorePool> };
  gaps: { retrievalMisses: readonly string[]; corpusGaps: readonly string[]; oracleReviewCandidates: readonly string[] };
  ranked: { lexical: ReturnType<typeof scoreRanked>; semantic: ReturnType<typeof scoreRanked> };
  channelStatuses: { lexical: string; semantic: string };
  topic?: ReadinessCase["topic"];
  families?: ReadinessCase["families"];
  labelsComplete?: boolean;
  sectionDiagnostics?: SectionDiagnostic[];
};

export function rankedCandidateKeys(candidates: readonly Candidate[], channel: "lexical" | "semantic"): readonly ResourceKey[] {
  return candidates
    .filter((candidate) => candidate[channel] !== undefined)
    .sort((left, right) => left[channel]!.bestRank - right[channel]!.bestRank || left.resourceKey.localeCompare(right.resourceKey))
    .map((candidate) => candidate.resourceKey);
}

export function averageApplicable(values: readonly (number | null)[]): number | null {
  const applicable = values.filter((value): value is number => value !== null);
  return applicable.length === 0 ? null : applicable.reduce((sum, value) => sum + value, 0) / applicable.length;
}

export function validateLabelsAgainstCorpus(oracles: readonly Pick<EvaluationOracle, "ticketId" | "retrieval">[], corpusKeys: ReadonlySet<string>): void {
  for (const oracle of oracles) {
    if (oracle.retrieval === undefined) continue;
    for (const key of [...oracle.retrieval.requiredResourceKeys, ...oracle.retrieval.relevantResourceKeys, ...oracle.retrieval.hardNegativeResourceKeys]) {
      if (!corpusKeys.has(key)) throw new Error(`Retrieval label ${key} for ${oracle.ticketId} is not present in the frozen corpus.`);
    }
  }
}

/** Keep the evaluation corpus reproducible and prevent future cases from leaking into it. */
export function snapshotsAtOrBeforeCutoff<T extends { ticket: { updatedAt: string } }>(snapshots: readonly T[]): readonly T[] {
  return snapshots.filter(({ ticket }) => ticket.updatedAt <= SCENARIO_CUTOFF);
}

export async function evaluateRetrieval(input: EvaluationInput = {}): Promise<Record<string, unknown>> {
  if (input.rankingCaptureOutput !== undefined) {
    input = {
      ...input,
      rankingCaptureOutput: canonicalNewB4ArtifactPath(
        input.rankingArtifactRoot ?? DEFAULT_B4_ARTIFACT_ROOT,
        input.rankingCaptureOutput,
      ),
    };
  }
  if (input.split !== undefined && input.split !== "development") throw new Error("Holdout execution is forbidden; only development scoring is supported.");
  if ((input.split !== undefined || input.validateCasesOnly) && input.caseSetPath === undefined) throw new Error("Readiness split or validation-only mode requires --case-set.");
  if (input.rankingCaptureOutput !== undefined && input.caseSetPath === undefined) throw new Error("Ranking capture output requires --case-set.");
  if (input.rankingCaptureOutput !== undefined && input.validateCasesOnly) throw new Error("Ranking capture output conflicts with validation-only mode.");
  const readiness = input.caseSetPath === undefined ? undefined : loadReadiness(input.caseSetPath, input.validateCasesOnly === true);
  const sourceRoot = mkdtempSync(join(tmpdir(), "triage-retrieval-eval-"));
  const tickets = new TicketRepository(sourceRoot, resolve("data/seed/tickets.json"));
  const store = RetrievalStore.open(":memory:");
  const evaluationStartedAt = performance.now();
  let refreshMs = 0;
  let retrievalMs = 0;
  let embeddingCalls = 0;
  let embeddingInputs = 0;
  let embeddingMs = 0;
  let semanticFailure: string | undefined;
  let activeCaptureProviderTiming: { provider: number } | undefined;
  const rankingCaptureCases: RankingCaptureCase[] = [];
  let manager: IndexManager | undefined;
  const provider = input.provider === undefined ? undefined : {
    model: input.provider.model,
    embed: async (texts: readonly string[], signal: AbortSignal) => {
      const startedAt = performance.now();
      embeddingCalls += 1;
      embeddingInputs += texts.length;
      try { return await input.provider!.embed(texts, signal); }
      catch (error) { semanticFailure = error instanceof EmbeddingProviderError ? error.code : "PROVIDER_ERROR"; throw error; }
      finally {
        const duration = performance.now() - startedAt;
        embeddingMs += duration;
        if (activeCaptureProviderTiming !== undefined) activeCaptureProviderTiming.provider += duration;
      }
    },
  };
  try {
    await tickets.initialize();
    const [articles, seedOracles] = await Promise.all([
      new KnowledgeRepository(resolve("data/knowledge")).list(),
      readiness === undefined ? loadEvaluationOracles() : Promise.resolve([]),
    ]);
    const syntheticScenarios = readiness === undefined ? SYNTHETIC_RETRIEVAL_EVALUATION_SCENARIOS : [];
    const oracles: ScoringOracle[] = readiness === undefined
      ? [...seedOracles, ...syntheticScenarios.map(({ oracle }) => oracle)]
      : readiness.development.map((entry) => ({ ticketId: entry.id, retrieval: entry.expectation, family: entry.topic }));
    const completedSnapshots = (input.completedSnapshots ?? []).filter(({ ticket }) => ticket.updatedAt <= (readiness?.manifest.cutoff ?? SCENARIO_CUTOFF));
    const snapshot = loadRetrievalSources({ articles, reusable: unavailableReusableKnowledge(), completedSnapshots });
    const articleSizes = articles.map(({ id, body }) => ({ articleId: id, sourceCharacters: body.length, diagnosisPromptCharacters: body.slice(0, 1800).length, classificationAndDraftBodyCharacters: body.length }));
    if (readiness !== undefined) {
      const projectedHash = hashText(JSON.stringify(snapshot.resources.map(({ resource }) => [resource.key, resource.contentHash]).sort()));
      if (projectedHash !== readiness.manifest.corpusHash) throw new Error("Readiness corpus hash mismatch; content requires review.");
      validateReadinessCases(readiness.development, snapshot.resources);
      try { validateReadinessCases(readiness.holdout, snapshot.resources); }
      catch { throw new Error("Holdout structural/source binding validation failed; no holdout content was executed or disclosed."); }
      if (input.validateCasesOnly) return {
        mode: "readiness-validation-only", evaluatedSplit: null, holdoutExecuted: false,
        sourceCommit: sourceCommit(), contentSourceRevision: readiness.manifest.sourceRevision,
        manifestHash: readiness.manifestHash, caseHashes: { development: readiness.manifest.development.sha256, holdout: readiness.manifest.holdout.sha256 },
        corpusHash: projectedHash, representationVersion: REPRESENTATION_VERSION, scenarioCutoff: readiness.manifest.cutoff,
        validation: { status: "passed", developmentCount: readiness.development.length, holdoutCount: readiness.holdout.length, developmentApproved: readiness.development.filter(({ review }) => review.status === "approved").length },
        semanticEvidence: "not-run", articleSizes, timingsMs: { embeddingCalls: 0, embeddingInputs: 0 },
      };
    }
    const frozenCorpusKeys = new Set(snapshot.resources.map(({ resource }) => resource.key));
    validateLabelsAgainstCorpus(oracles, frozenCorpusKeys);
    manager = new IndexManager({ store, load: async () => snapshot, ...(provider === undefined ? {} : { provider }) });
    const refreshStartedAt = performance.now();
    await manager.refresh(new AbortController().signal);
    if (readiness && semanticFailure) throw new Error(`Readiness semantic evaluation failed: ${semanticFailure}.`);
    refreshMs = performance.now() - refreshStartedAt;
    const scenarios: ScenarioReport[] = [];
    const evaluationInputs = readiness === undefined ? [
      ...(await Promise.all(seedOracles
        .filter((oracle) => oracle.retrieval !== undefined)
        .map(async (oracle) => ({ fixtureId: undefined, ticket: await tickets.get(oracle.ticketId), oracle })))),
      ...syntheticScenarios.map(({ fixtureId, ticket, oracle }) => ({ fixtureId, ticket, oracle })),
    ] : readiness.development.map((entry, index) => ({ fixtureId: undefined, ticket: entry.ticket, oracle: oracles[index]! }));
    for (const { ticket, oracle, fixtureId } of evaluationInputs) {
      if (oracle.retrieval === undefined) continue;
      const references = deterministicReferences(ticket);
      const query = buildRetrievalQuery({ ticket, customerReplies: [], customerReplyWatermark: "seed", references });
      const retrievalStartedAt = performance.now();
      const captureTiming = { provider: 0 };
      activeCaptureProviderTiming = captureTiming;
      let result;
      try {
        result = await retrieve({ query, ...(input.semanticQueryFormat === undefined ? {} : { semanticQueryText: formatQwen3RetrievalQuery(query.queryText, input.semanticQueryFormat) }), store, limits: K_BUDGET, ...(provider === undefined ? {} : { provider }), signal: new AbortController().signal });
      } finally {
        activeCaptureProviderTiming = undefined;
      }
      if (readiness && provider && result.semantic.status !== "used") throw new Error(`Readiness semantic evaluation failed: ${semanticFailure ?? result.semantic.reason ?? result.semantic.status}.`);
      const retrievalDuration = performance.now() - retrievalStartedAt;
      retrievalMs += retrievalDuration;
      if (readiness !== undefined && input.rankingCaptureOutput !== undefined) {
        const basis = { queryHash: query.queryHash, ticketId: query.ticketId, ticketRevision: query.sourceRevision, customerReplyWatermark: query.customerReplyWatermark };
        const ranking = rankRetrieval({ contractVersion: 1, queryBasis: basis, retrieval: result, outputLimits: B4_OUTPUT_LIMITS }, { id: "lexical-only-v1", kind: "lexical-only" });
        const readinessCase = readiness.development.find(({ id }) => id === oracle.ticketId);
        if (readinessCase === undefined) throw new Error(`Readiness capture case ${oracle.ticketId} is missing from the development set.`);
        rankingCaptureCases.push({
          caseId: readinessCase.id,
          split: "development",
          caseSetHash: readiness.manifest.development.sha256,
          labelHash: readinessLabelHash(readiness.development),
          manifestHash: readiness.manifestHash,
          corpusHash: result.metadata.corpusHash,
          contentSourceRevision: readiness.manifest.sourceRevision,
          queryFormatIdentity: rankingCaptureQueryFormat(input.semanticQueryFormat),
          providerKind: input.provider === undefined ? "none" : "configured-embedding-provider",
          model: modelForCapture(input.provider?.model),
          representationVersion: result.metadata.representationVersion,
          retrievalLimits: captureRetrievalLimits(),
          indexIdentity: ranking.retrievalIdentity,
          queryBasis: basis,
          retrieval: result,
          rankingProvenance: { contractVersion: 1, inputHash: ranking.inputHash, retrievalIdentity: ranking.retrievalIdentity, outputLimits: B4_OUTPUT_LIMITS, tieBreak: "ordinal-resource-key" },
          timingsMs: { retrieval: retrievalDuration, provider: captureTiming.provider, ranking: null },
          traceTruncated: false,
        });
      }
      const lexicalKeys = rankedCandidateKeys(result.candidates, "lexical");
      const semanticKeys = rankedCandidateKeys(result.candidates, "semantic");
      const deterministicReferenceKeys = result.candidates.filter((candidate) => candidate.deterministicReferences.length > 0).map((candidate) => candidate.resourceKey);
      const knownCauseReferenceKeys = result.candidates.filter((candidate) => candidate.knownCauseReferences.length > 0).map((candidate) => candidate.resourceKey);
      const unionKeys = result.candidates.map((candidate) => candidate.resourceKey);
      const returnedRepresentations = Object.fromEntries(result.candidates.map((candidate) => [candidate.resourceKey, {
        ...(candidate.lexical ? { lexical: candidate.lexical.matches.map(({ representationId, score, rank }) => ({ representationId, score, rank })) } : {}),
        ...(candidate.semantic ? { semantic: candidate.semantic.matches.map(({ representationId, score, rank }) => ({ representationId, score, rank })) } : {}),
      }]));
      const readinessCase = readiness?.development.find(({ id }) => id === oracle.ticketId);
      scenarios.push({
        ticketId: oracle.ticketId,
        ...(fixtureId === undefined ? {} : { syntheticFixtureId: fixtureId }),
        ...(oracle.family ? { family: oracle.family } : {}),
        ...(oracle.contrastGroup ? { contrastGroup: oracle.contrastGroup } : {}),
        lexicalKeys,
        semanticKeys,
        deterministicReferenceKeys,
        knownCauseReferenceKeys,
        unionKeys,
        candidateCount: result.candidates.length,
        returnedRepresentations,
        pool: scorePool(unionKeys as any, oracle.retrieval),
        referencePools: { deterministic: scorePool(deterministicReferenceKeys as ResourceKey[], oracle.retrieval), knownCause: scorePool(knownCauseReferenceKeys as ResourceKey[], oracle.retrieval) },
        gaps: scenarioGaps(unionKeys, oracle.retrieval),
        ranked: {
          lexical: scoreRanked(lexicalKeys as any, oracle.retrieval, 5),
          semantic: result.semantic.status === "used" ? scoreRanked(semanticKeys as any, oracle.retrieval, 5) : { recallAtK: null, precisionAtK: null },
        },
        channelStatuses: { lexical: result.lexical.status, semantic: result.semantic.status },
        ...(readinessCase === undefined ? {} : {
          topic: readinessCase.topic, families: readinessCase.families, labelsComplete: readinessCase.expectation.labelsComplete,
          sectionDiagnostics: [...new Set([...readinessCase.expectation.relevantResourceKeys, ...unionKeys])].flatMap((resourceKey) => (["lexical", "semantic"] as const).map((channel) => ({
            resourceKey, channel,
            ...evaluateSectionEvidence({ candidate: result.candidates.find((candidate) => candidate.resourceKey === resourceKey), channel, channelAvailable: result[channel].status === "used", bindings: readinessCase.supportingSections }),
          }))),
        }),
      });
    }
    const evaluatedMetadata = store.metadata();
    const corpusHash = evaluatedMetadata.corpusHash;
    const oracleHash = createHash("sha256").update(JSON.stringify(oracles)).digest("hex");
    const syntheticScenarioHash = createHash("sha256").update(JSON.stringify(syntheticScenarios)).digest("hex");
    const perTypeMetrics = metricBreakdown(scenarios, new Map(oracles.map((oracle) => [oracle.ticketId, oracle])));
    const perFamilyMetrics = readiness === undefined ? familyBreakdown(scenarios) : readinessGroupMetrics(scenarios, oracles, "families");
    const excludedCounts = exclusionBreakdown(scenarios, new Map(oracles.map((oracle) => [oracle.ticketId, oracle])));
    const required = scenarios.map(({ pool }) => pool.requiredCoverage).filter((value): value is number => value !== null);
    const baselineRequired = scenarios.map((scenario) => {
      const oracle = oracles.find((candidate) => candidate.ticketId === scenario.ticketId)?.retrieval;
      return deterministicArticleRequiredCoverage(
        scenario.deterministicReferenceKeys as ResourceKey[],
        (oracle?.requiredResourceKeys ?? []) as ResourceKey[],
      );
    }).filter((value): value is number => value !== null);
    const report = {
      mode: input.provider === undefined ? "offline-lexical-only" : "live-embeddings",
      semanticEvidence: input.provider === undefined ? "outstanding" : "measured",
      sourceCommit: sourceCommit(),
      oracleHash,
      syntheticScenarioHash,
      syntheticScenarioCount: syntheticScenarios.length,
      scenarioCutoff: readiness?.manifest.cutoff ?? SCENARIO_CUTOFF,
      corpusHash,
      indexGeneration: evaluatedMetadata.generation,
      lexicalGeneration: evaluatedMetadata.lexicalGeneration,
      semanticGeneration: evaluatedMetadata.semanticGeneration,
      representationVersion: evaluatedMetadata.representationVersion,
      ftsTokenization: "unicode-letter-number-v1; quoted OR terms; max 128 tokens",
      model: provider?.model ?? null,
      semanticQueryFormatting: input.semanticQueryFormat ?? { kind: "none", instruction: null, template: null },
      timingsMs: {
        total: performance.now() - evaluationStartedAt,
        refresh: refreshMs,
        retrieval: retrievalMs,
        embedding: embeddingMs,
        embeddingCalls,
        embeddingInputs,
      },
      kBudget: K_BUDGET,
      scenarioCount: scenarios.length,
      candidatePools: scenarios,
      channelStatuses: { lexical: "available", semantic: input.provider === undefined ? "unavailable:provider-not-configured" : "measured" },
      perTypeMetrics,
      perFamilyMetrics,
      excludedCounts,
      baselineComparison: {
        deterministicArticleRequiredCoverage: average(baselineRequired),
        unionRequiredCoverage: average(required),
        scenariosCompared: baselineRequired.length,
        unsupportedResourceFamilies: ["known-cause", "diagnostic-playbook", "resolved-ticket"],
      },
      corpusCoverage: coverageBreakdown(oracles.filter((oracle) => oracle.retrieval !== undefined)),
      referenceChannelMetrics: referenceChannelBreakdown(scenarios),
      gapBreakdown: {
        retrievalMisses: scenarios.flatMap(({ ticketId, gaps }) => gaps.retrievalMisses.map((resourceKey) => ({ ticketId, resourceKey }))),
        corpusGaps: scenarios.flatMap(({ ticketId, gaps }) => gaps.corpusGaps.map((resourceType) => ({ ticketId, resourceType }))),
        oracleReviewCandidates: scenarios.flatMap(({ ticketId, gaps }) => gaps.oracleReviewCandidates.map((resourceKey) => ({ ticketId, resourceKey }))),
      },
      approvedContrastCoverage: contrastCoverage(scenarios),
      resolvedCaseEvaluation: {
        status: snapshot.resources.some(({ resource }) => resource.type === "resolved-ticket") ? "covered" : "corpus-gap",
        reviewedScenarioTickets: scenarios.filter(({ ticketId }) => ticketId === "TKT-1024").map(({ ticketId }) => ticketId),
        eligibleCaseCount: snapshot.resources.filter(({ resource }) => resource.type === "resolved-ticket").length,
        futureCasesExcluded: (input.completedSnapshots?.length ?? 0) - completedSnapshots.length,
        selfTicketExclusion: "enforced at retrieval query time",
      },
      unjudgedHits: scenarios.flatMap(({ ticketId, pool }) => pool.unjudgedKeys.map((resourceKey) => ({ ticketId, resourceKey }))),
      reviewedContrastFamilies: readiness === undefined ? CONTRAST_FAMILIES : [],
      ...(readiness === undefined ? {} : {
        evaluatedSplit: "development", holdoutExecuted: false,
        contentSourceRevision: readiness.manifest.sourceRevision, manifestHash: readiness.manifestHash,
        caseHashes: { development: readiness.manifest.development.sha256, holdout: readiness.manifest.holdout.sha256 },
        articleSizes, sectionSummary: sectionSummary(scenarios),
        perTopicMetrics: readinessGroupMetrics(scenarios, oracles, "topic"),
        developmentDisagreements: developmentDisagreements(scenarios),
        disagreementComparableCases: scenarios.filter(({ channelStatuses }) => channelStatuses.lexical === "used" && channelStatuses.semantic === "used").length,
        labelCompleteness: { complete: readiness.development.filter(({ expectation }) => expectation.labelsComplete).length, incomplete: readiness.development.filter(({ expectation }) => !expectation.labelsComplete).length },
        corpusLimitations: { unavailableFamilies: snapshot.unavailableFamilies, syntheticCasesOnly: true, historicalMetricComparison: "invalid: corpus and case set changed together", sectionOrderingEvidence: "supporting best match and lower supporting match are separate; any match alone does not establish useful ordering" },
      }),
    };
    if (input.rankingCaptureOutput !== undefined) {
      if (readiness === undefined) throw new Error("Ranking capture output requires readiness development evaluation.");
      if (rankingCaptureCases.length !== readiness.development.length) throw new Error("Ranking capture is incomplete; every development case must be retrieved exactly once.");
      const first = rankingCaptureCases[0];
      if (first === undefined) throw new Error("Ranking capture is empty.");
      const capture = createRankingCapture({
        evaluatorSourceRevision: sourceCommit(),
        identity: {
          split: "development",
          caseSetHash: readiness.manifest.development.sha256,
          labelHash: readinessLabelHash(readiness.development),
          manifestHash: readiness.manifestHash,
          caseIds: readiness.development.map(({ id }) => id),
          reviewStatus: "approved",
          sourceCutoff: readiness.manifest.cutoff,
          contentSourceRevision: readiness.manifest.sourceRevision,
          corpusHash: first.corpusHash,
          queryFormatIdentity: rankingCaptureQueryFormat(input.semanticQueryFormat),
          providerKind: input.provider === undefined ? "none" : "configured-embedding-provider",
          model: modelForCapture(input.provider?.model),
          representationVersion: first.representationVersion,
          retrievalLimits: captureRetrievalLimits(),
          outputLimits: B4_OUTPUT_LIMITS,
          indexIdentity: first.indexIdentity,
        },
        cases: rankingCaptureCases,
      });
      await writeRankingCaptureExclusive(resolve(input.rankingCaptureOutput), capture);
    }
    return report;
  } finally {
    await manager?.close();
    store.close();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
}

export function deterministicArticleRequiredCoverage(
  deterministicReferenceKeys: readonly ResourceKey[],
  requiredResourceKeys: readonly ResourceKey[],
): number | null {
  const articleRequired = requiredResourceKeys.filter((key) => key.startsWith("knowledge-article:"));
  if (articleRequired.length === 0) return null;
  const articles = new Set(deterministicReferenceKeys.filter((key) => key.startsWith("knowledge-article:")));
  return articleRequired.filter((key) => articles.has(key)).length / articleRequired.length;
}

function sectionSummary(scenarios: readonly ScenarioReport[]) {
  return Object.fromEntries((["lexical", "semantic"] as const).map((channel) => {
    const rows = scenarios.flatMap(({ sectionDiagnostics }) => sectionDiagnostics ?? []).filter((row) => row.channel === channel);
    const supportingBestMatch = rows.filter(({ status }) => status === "supporting-best-match").length;
    const wrongBestSection = rows.filter(({ status }) => status === "right-article-wrong-best-section").length;
    const judged = supportingBestMatch + wrongBestSection;
    return [channel, {
      judged, supportingBestMatch, wrongBestSection,
      supportingBestMatchRate: judged === 0 ? null : supportingBestMatch / judged,
      lowerSupportingMatch: rows.filter(({ status, supportingMatchPresent }) => status === "right-article-wrong-best-section" && supportingMatchPresent).length,
      anySupportingMatch: rows.filter(({ supportingMatchPresent }) => supportingMatchPresent === true).length,
      excluded: Object.fromEntries((["resource-missing", "channel-unavailable", "unjudged-section"] as const).map((status) => [status, rows.filter((row) => row.status === status).length])),
    }];
  }));
}

function developmentDisagreements(scenarios: readonly ScenarioReport[]) {
  return scenarios.filter(({ channelStatuses }) => channelStatuses.lexical === "used" && channelStatuses.semantic === "used").flatMap((scenario) => {
    const sectionDifferences = (scenario.sectionDiagnostics ?? []).filter(({ channel }) => channel === "lexical").flatMap((lexical) => {
      const semantic = scenario.sectionDiagnostics!.find((row) => row.channel === "semantic" && row.resourceKey === lexical.resourceKey)!;
      if (lexical.bestRepresentationId === semantic.bestRepresentationId && lexical.status === semantic.status) return [];
      return [{ resourceKey: lexical.resourceKey, lexical, semantic }];
    });
    const rankingDiffers = JSON.stringify(scenario.lexicalKeys) !== JSON.stringify(scenario.semanticKeys);
    return rankingDiffers || sectionDifferences.length > 0 ? [{ caseId: scenario.ticketId, rankingDiffers, lexicalKeys: scenario.lexicalKeys, semanticKeys: scenario.semanticKeys, sectionDifferences }] : [];
  });
}

function readinessGroupMetrics(scenarios: readonly ScenarioReport[], oracles: readonly ScoringOracle[], field: "topic" | "families") {
  const groups = new Set(scenarios.flatMap((scenario) => field === "topic" ? [scenario.topic!] : scenario.families!));
  const oracleMap = new Map(oracles.map((oracle) => [oracle.ticketId, oracle]));
  return Object.fromEntries([...groups].map((group) => {
    const selected = scenarios.filter((scenario) => field === "topic" ? scenario.topic === group : scenario.families!.some((family) => family === group));
    return [group, { ...familyBreakdown(selected.map((scenario) => ({ ...scenario, family: group })))[group] as object, perTypeMetrics: metricBreakdown(selected, oracleMap), sectionSummary: sectionSummary(selected) }];
  }));
}

function deterministicReferences(ticket: Parameters<typeof buildConversationContextForTicket>[0]["ticket"]): readonly Reference[] {
  const classification = classifyTicketFromContext(buildConversationContextForTicket({ ticket, customerReplies: [] }));
  const references: Reference[] = classification.knowledgeArticleIds.map((sourceId) => ({ resourceKey: `knowledge-article:${sourceId}`, channel: "deterministic-reference", sourceId, reason: "classifier-association" }));
  if (classification.knownCause) references.push({ resourceKey: `known-cause:${classification.knownCause}`, channel: "deterministic-reference", sourceId: classification.knownCause, reason: "safety-inclusion" });
  return references;
}

function scenarioGaps(unionKeys: readonly string[], expectation: RetrievalExpectation): { retrievalMisses: readonly string[]; corpusGaps: readonly string[]; oracleReviewCandidates: readonly string[] } {
  const returned = new Set(unionKeys);
  return {
    retrievalMisses: expectation.requiredResourceKeys.filter((key) => !returned.has(key)),
    corpusGaps: Object.entries(expectation.resourceCoverage).filter(([, coverage]) => coverage === "missing").map(([resourceType]) => resourceType),
    oracleReviewCandidates: scorePool(unionKeys as ResourceKey[], expectation).unjudgedKeys,
  };
}

function referenceChannelBreakdown(scenarios: readonly ScenarioReport[]): Record<string, unknown> {
  const channel = (name: "deterministic" | "knownCause", selector: (scenario: ScenarioReport) => ReturnType<typeof scorePool>) => {
    const pools = scenarios.map(selector);
    return {
      kind: "unordered-pool",
      scenarios: pools.length,
      candidateRecall: averageApplicable(pools.map(({ candidateRecall }) => candidateRecall)),
      requiredCoverage: averageApplicable(pools.map(({ requiredCoverage }) => requiredCoverage)),
      excludedCandidateRecall: pools.filter(({ candidateRecall }) => candidateRecall === null).length,
      excludedRequiredCoverage: pools.filter(({ requiredCoverage }) => requiredCoverage === null).length,
      ...(name === "knownCause" ? { provenance: "direct approved links from retrieved known causes" } : { provenance: "deterministic classifier associations" }),
    };
  };
  return {
    deterministic: channel("deterministic", (scenario) => scenario.referencePools.deterministic),
    knownCause: channel("knownCause", (scenario) => scenario.referencePools.knownCause),
  };
}

function contrastCoverage(scenarios: readonly ScenarioReport[]): Record<string, unknown> {
  return Object.fromEntries(CONTRAST_FAMILIES.map((family) => {
    const covered = scenarios.filter((scenario) => scenario.contrastGroup === family);
    const ticketIds = covered.map((scenario) => scenario.ticketId).sort();
    const syntheticFixtureIds = covered.flatMap((scenario) => scenario.syntheticFixtureId === undefined ? [] : [scenario.syntheticFixtureId]).sort();
    return [family, { status: ticketIds.length >= 2 ? "covered" : "missing-counterpart", scenarioCount: ticketIds.length, ticketIds, syntheticFixtureIds }];
  }));
}

function sourceCommit(): string {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unknown"; }
}

function average(values: readonly number[]): number | null { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }

function metricBreakdown(scenarios: readonly ScenarioReport[], oracles: ReadonlyMap<string, ScoringOracle>): Record<string, unknown> {
  type ChannelMetrics = Record<string, number | null>;
  type MetricEntry = { scenarios: number; lexical: ChannelMetrics; semantic: ChannelMetrics; exclusions: { lexical: Record<string, number>; semantic: Record<string, number> } };
  const result: Record<string, MetricEntry> = Object.fromEntries(([
    "knowledge-article", "known-cause", "diagnostic-playbook", "resolved-ticket",
  ] as const).map((type) => [type, { scenarios: 0, lexical: emptyRankedMetrics(), semantic: emptyRankedMetrics(), exclusions: { lexical: {}, semantic: {} } }]));
  const counts: Record<string, { lexical: Record<string, number>; semantic: Record<string, number> }> = Object.fromEntries(Object.keys(result).map((type) => [type, { lexical: {}, semantic: {} }]));
  const add = (entry: MetricEntry, count: { lexical: Record<string, number>; semantic: Record<string, number> }, channel: "lexical" | "semantic", metric: string, value: number | null) => {
    if (value === null) return;
    entry[channel][metric] = (entry[channel][metric] ?? 0) + value;
    count[channel][metric] = (count[channel][metric] ?? 0) + 1;
  };
  for (const scenario of scenarios) {
    const expectation = oracles.get(scenario.ticketId)?.retrieval;
    if (expectation === undefined) continue;
    for (const type of ["knowledge-article", "known-cause", "diagnostic-playbook", "resolved-ticket"] as const) {
      const relevant = expectation.relevantResourceKeys.filter((key) => key.startsWith(`${type}:`));
      if (relevant.length === 0) continue;
      const typedOracle = { ...expectation, requiredResourceKeys: expectation.requiredResourceKeys.filter((key) => key.startsWith(`${type}:`)), relevantResourceKeys: relevant, hardNegativeResourceKeys: expectation.hardNegativeResourceKeys.filter((key) => key.startsWith(`${type}:`)) };
      const entry = result[type];
      const count = counts[type];
      entry.scenarios += 1;
      for (const k of [1, 3, 5] as const) {
        const lexical = scoreRanked(scenario.lexicalKeys.filter((key) => key.startsWith(`${type}:`)) as any, typedOracle, k);
        add(entry, count, "lexical", `recallAt${k}`, lexical.recallAtK);
        add(entry, count, "lexical", `precisionAt${k}`, lexical.precisionAtK);
        const semantic = scenario.channelStatuses.semantic === "used"
          ? scoreRanked(scenario.semanticKeys.filter((key) => key.startsWith(`${type}:`)) as any, typedOracle, k)
          : { recallAtK: null, precisionAtK: null };
        add(entry, count, "semantic", `recallAt${k}`, semantic.recallAtK);
        add(entry, count, "semantic", `precisionAt${k}`, semantic.precisionAtK);
      }
    }
  }
  for (const [type, entry] of Object.entries(result)) for (const channel of ["lexical", "semantic"] as const) for (const metric of Object.keys(entry[channel])) {
    const applicable = counts[type]![channel][metric] ?? 0;
    entry[channel][metric] = applicable === 0 ? null : entry[channel][metric]! / applicable;
    entry.exclusions[channel][metric] = entry.scenarios - applicable;
  }
  return result;
}

function emptyRankedMetrics(): Record<string, number | null> {
  return Object.fromEntries([1, 3, 5].flatMap((k) => [[`recallAt${k}`, null], [`precisionAt${k}`, null]]));
}

function exclusionBreakdown(scenarios: readonly ScenarioReport[], oracles: ReadonlyMap<string, ScoringOracle>): { incompletePrecision: number; semanticUnavailable: number } {
  let incompletePrecision = 0;
  for (const scenario of scenarios) {
    const expectation = oracles.get(scenario.ticketId)?.retrieval;
    if (expectation !== undefined && !expectation.labelsComplete) incompletePrecision += 1;
  }
  return { incompletePrecision, semanticUnavailable: scenarios.filter(({ channelStatuses }) => channelStatuses.semantic !== "used").length };
}

function familyBreakdown(scenarios: readonly ScenarioReport[]): Record<string, unknown> {
  const result: Record<string, { scenarios: number; candidateRecall: number | null; requiredCoverage: number | null; excludedCandidateRecall: number; excludedRequiredCoverage: number; candidateValues: Array<number | null>; requiredValues: Array<number | null> }> = {};
  for (const scenario of scenarios) {
    const family = scenario.family ?? "unclassified";
    const entry = result[family] ?? (result[family] = { scenarios: 0, candidateRecall: null, requiredCoverage: null, excludedCandidateRecall: 0, excludedRequiredCoverage: 0, candidateValues: [], requiredValues: [] });
    entry.scenarios += 1;
    entry.candidateValues.push(scenario.pool.candidateRecall);
    entry.requiredValues.push(scenario.pool.requiredCoverage);
  }
  return Object.fromEntries(Object.entries(result).map(([family, entry]) => [family, {
    scenarios: entry.scenarios,
    candidateRecall: averageApplicable(entry.candidateValues),
    requiredCoverage: averageApplicable(entry.requiredValues),
    excludedCandidateRecall: entry.candidateValues.filter((value) => value === null).length,
    excludedRequiredCoverage: entry.requiredValues.filter((value) => value === null).length,
  }]));
}

function coverageBreakdown(oracles: readonly ScoringOracle[]): Record<string, unknown> {
  const result: Record<string, Record<string, number>> = {};
  for (const oracle of oracles) for (const [type, value] of Object.entries(oracle.retrieval!.resourceCoverage)) {
    const counts = result[type] ?? (result[type] = {});
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return result;
}

export function markdownReport(report: Record<string, unknown>): string {
  if (report.mode === "readiness-validation-only") return [
    "# Knowledge readiness validation", "",
    ...Object.entries(report).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`), "",
    "Both case files were structurally validated. No retrieval or holdout execution occurred.", "",
  ].join("\n");
  const pools = Array.isArray(report.candidatePools) ? report.candidatePools as Array<Record<string, unknown>> : [];
  const perType = (report.perTypeMetrics ?? {}) as Record<string, { scenarios: number; lexical: Record<string, number | null>; semantic: Record<string, number | null> }>;
  const perFamily = (report.perFamilyMetrics ?? {}) as Record<string, { scenarios: number; candidateRecall: number | null; requiredCoverage: number | null }>;
  const representationRows = pools.flatMap((pool) => {
    const returned = (pool.returnedRepresentations ?? {}) as Record<string, { lexical?: readonly { representationId: string; score: number; rank: number }[]; semantic?: readonly { representationId: string; score: number; rank: number }[] }>;
    return Object.entries(returned).flatMap(([resourceKey, channels]) => (["lexical", "semantic"] as const).flatMap((channel) =>
      (channels[channel] ?? []).map((match) => `| ${pool.ticketId} | ${resourceKey} | ${channel} | ${match.representationId} | ${match.rank} | ${match.score} |`),
    ));
  });
  const metricValue = (entry: { lexical: Record<string, number | null>; semantic: Record<string, number | null> }, channel: "lexical" | "semantic", metric: "recallAt" | "precisionAt", k: 1 | 3 | 5): string | number => entry[channel][`${metric}${k}`] ?? "n/a";
  const familyRows = Object.entries(perFamily).sort(([left], [right]) => left.localeCompare(right)).map(([family, metrics]) => `| ${family} | ${metrics.scenarios} | ${metrics.candidateRecall ?? "n/a"} | ${metrics.requiredCoverage ?? "n/a"} |`);
  const typeRows = Object.entries(perType).sort(([left], [right]) => left.localeCompare(right)).map(([type, metrics]) => `| ${type} | ${metrics.scenarios} | ${metricValue(metrics, "lexical", "recallAt", 1)} | ${metricValue(metrics, "lexical", "recallAt", 3)} | ${metricValue(metrics, "lexical", "recallAt", 5)} | ${metricValue(metrics, "lexical", "precisionAt", 1)} | ${metricValue(metrics, "lexical", "precisionAt", 3)} | ${metricValue(metrics, "lexical", "precisionAt", 5)} | ${metricValue(metrics, "semantic", "recallAt", 1)} | ${metricValue(metrics, "semantic", "recallAt", 3)} | ${metricValue(metrics, "semantic", "recallAt", 5)} |`);
  const unjudged = Array.isArray(report.unjudgedHits) ? report.unjudgedHits as Array<{ ticketId: string; resourceKey: string }> : [];
  const referenceChannels = (report.referenceChannelMetrics ?? {}) as Record<string, { kind: string; scenarios: number; candidateRecall: number | null; requiredCoverage: number | null; excludedCandidateRecall: number; excludedRequiredCoverage: number; provenance: string }>;
  const gaps = (report.gapBreakdown ?? {}) as Record<string, readonly { ticketId: string; resourceKey?: string; resourceType?: string }[]>;
  const contrasts = (report.approvedContrastCoverage ?? {}) as Record<string, { status: string; scenarioCount: number; ticketIds: readonly string[] }>;
  return [
    "# B3 hybrid retrieval evaluation",
    "",
    `- Mode: ${report.mode}`,
    `- Semantic evidence: ${report.semanticEvidence}`,
    `- Source commit: ${report.sourceCommit}`,
    `- Oracle hash: ${report.oracleHash}`,
    `- Synthetic scenario hash: ${report.syntheticScenarioHash}`,
    `- Synthetic scenario count: ${report.syntheticScenarioCount}`,
    `- Scenario cutoff: ${report.scenarioCutoff}`,
    `- Corpus hash: ${report.corpusHash}`,
    `- Index generation: ${report.indexGeneration}`,
    `- Lexical generation: ${report.lexicalGeneration}`,
    `- Semantic generation: ${report.semanticGeneration}`,
    `- Representation version: ${report.representationVersion}`,
    `- FTS tokenization: ${report.ftsTokenization}`,
    `- Model: ${JSON.stringify(report.model)}`,
    `- Semantic query formatting: ${JSON.stringify(report.semanticQueryFormatting)}`,
    `- Timings (ms): ${JSON.stringify(report.timingsMs)}`,
    `- K budget: ${JSON.stringify(report.kBudget)}`,
    `- Channel statuses: ${JSON.stringify(report.channelStatuses)}`,
    `- Scenarios: ${report.scenarioCount}`,
    ...(report.evaluatedSplit === "development" ? [
      `- Evaluated split: ${report.evaluatedSplit}`, `- Holdout executed: ${report.holdoutExecuted}`,
      `- Content/case source revision: ${report.contentSourceRevision}`, `- Manifest hash: ${report.manifestHash}`,
      `- Case hashes: ${JSON.stringify(report.caseHashes)}`, `- Label completeness: ${JSON.stringify(report.labelCompleteness)}`,
    ] : []),
    `- Excluded from complete precision: ${(report.excludedCounts as { incompletePrecision: number } | undefined)?.incompletePrecision ?? "n/a"}`,
    `- Semantic-unavailable scenarios: ${(report.excludedCounts as { semanticUnavailable: number } | undefined)?.semanticUnavailable ?? "n/a"}`,
    "",
    "## Candidate pools",
    "",
    "| Ticket | Pool size | Candidate recall | Required coverage | Unjudged hits |",
    "|---|---:|---:|---:|---:|",
    ...pools.map((pool) => `| ${pool.ticketId} | ${pool.candidateCount} | ${(pool.pool as { candidateRecall: number | null }).candidateRecall ?? "n/a"} | ${(pool.pool as { requiredCoverage: number | null }).requiredCoverage ?? "n/a"} | ${(pool.pool as { unjudgedKeys: unknown[] }).unjudgedKeys.length} |`),
    "",
    "## Per-representation provenance",
    "",
    "| Ticket | Resource | Channel | Representation | Rank | Score |",
    "|---|---|---|---|---:|---:|",
    ...representationRows,
    "",
    "## Per-type metrics",
    "",
    "| Type | Scenarios | Lexical R@1 | Lexical R@3 | Lexical R@5 | Lexical P@1 | Lexical P@3 | Lexical P@5 | Semantic R@1 | Semantic R@3 | Semantic R@5 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...typeRows,
    "",
    "## Per-family metrics",
    "",
    "| Family | Scenarios | Candidate recall | Required coverage |",
    "|---|---:|---:|---:|",
    ...familyRows,
    "",
    "## Baseline comparison",
    "",
    `- ${JSON.stringify(report.baselineComparison)}`,
    "",
    "## Reference channel pools",
    "",
    "| Channel | Kind | Scenarios | Candidate recall | Required coverage | Excluded recall | Excluded required | Provenance |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    ...Object.entries(referenceChannels).map(([name, metrics]) => `| ${name} | ${metrics.kind} | ${metrics.scenarios} | ${metrics.candidateRecall ?? "n/a"} | ${metrics.requiredCoverage ?? "n/a"} | ${metrics.excludedCandidateRecall} | ${metrics.excludedRequiredCoverage} | ${metrics.provenance} |`),
    "",
    "## Retrieval, corpus, and oracle-review gaps",
    "",
    `- Retrieval misses: ${(gaps.retrievalMisses ?? []).map(({ ticketId, resourceKey }) => `${ticketId}:${resourceKey}`).join(", ") || "None."}`,
    `- Corpus gaps: ${(gaps.corpusGaps ?? []).map(({ ticketId, resourceType }) => `${ticketId}:${resourceType}`).join(", ") || "None."}`,
    `- Oracle-review candidates: ${(gaps.oracleReviewCandidates ?? []).map(({ ticketId, resourceKey }) => `${ticketId}:${resourceKey}`).join(", ") || "None."}`,
    "",
    "## Approved contrast coverage",
    "",
    "| Contrast family | Status | Scenarios | Tickets |",
    "|---|---|---:|---|",
    ...Object.entries(contrasts).map(([family, coverage]) => `| ${family} | ${coverage.status} | ${coverage.scenarioCount} | ${coverage.ticketIds.join(", ") || "None"} |`),
    "",
    "## Resolved-case evaluation",
    "",
    `- ${JSON.stringify(report.resolvedCaseEvaluation)}`,
    "",
    "## Corpus coverage",
    "",
    `- ${JSON.stringify(report.corpusCoverage)}`,
    "",
    "## Unjudged hits",
    "",
    `- Count: ${unjudged.length}`,
    ...(unjudged.length === 0 ? ["- None."] : unjudged.map(({ ticketId, resourceKey }) => `- ${ticketId}: ${resourceKey}`)),
    "",
    "## Reviewed contrast families",
    "",
    ...(Array.isArray(report.reviewedContrastFamilies) ? (report.reviewedContrastFamilies as string[]).map((family) => `- ${family}`) : ["- None." ]),
    "",
    "## Notes",
    "",
    ...(report.evaluatedSplit === "development" ? [
      "## Section evidence", "", `- ${JSON.stringify(report.sectionSummary)}`, "",
      "Supporting best matches and lower supporting matches are counted separately. Missing resources, unavailable channels and unjudged sections are excluded from judged denominators.", "",
      "| Case | Resource | Channel | Status | Best representation | Supporting match present |",
      "|---|---|---|---|---|---|",
      ...pools.flatMap((pool) => ((pool.sectionDiagnostics ?? []) as SectionDiagnostic[]).map((row) => `| ${pool.ticketId} | ${row.resourceKey} | ${row.channel} | ${row.status} | ${row.bestRepresentationId ?? "n/a"} | ${row.supportingMatchPresent ?? "n/a"} |`)), "",
      "## Development disagreements", "",
      `- Comparable cases: ${report.disagreementComparableCases}`,
      `- ${JSON.stringify(report.developmentDisagreements)}`, "",
      "## Topic metrics", "", `- ${JSON.stringify(report.perTopicMetrics)}`, "",
      "## Article source and prompt sizes", "", `- ${JSON.stringify(report.articleSizes)}`, "",
      "## Corpus limitations", "", `- ${JSON.stringify(report.corpusLimitations)}`, "",
    ] : []),
    report.semanticEvidence === "outstanding"
      ? "Semantic quality evidence is outstanding because no live or cached embedding provider was configured. Lexical metrics are deterministic and the corpus/oracle hashes freeze this run's identity."
      : "Semantic quality evidence was measured with the configured provider identity recorded above.",
    "",
  ].join("\n");
}

export async function runRetrievalEvaluation(args: readonly string[], env: NodeJS.ProcessEnv, settings: { rankingArtifactRoot?: string } = {}): Promise<Record<string, unknown>> {
  const options = evaluationOptionsFor(args, env, settings);
  const report = await evaluateRetrieval(options);
  const outputDir = resolve(options.outputDir);
  if (options.caseSetPath) {
    mkdirSync(dirname(outputDir), { recursive: true });
    mkdirSync(outputDir);
  } else mkdirSync(outputDir, { recursive: true });
  const writeOptions = { encoding: "utf8" as const, flag: options.caseSetPath ? "wx" : "w" };
  writeFileSync(resolve(outputDir, "evaluation.json"), `${JSON.stringify(report, null, 2)}\n`, writeOptions);
  writeFileSync(resolve(outputDir, "evaluation.md"), markdownReport(report), writeOptions);
  return report;
}

async function main(): Promise<void> {
  const report = await runRetrievalEvaluation(process.argv.slice(2), process.env);
  console.log(JSON.stringify(report, null, 2));
  console.log(markdownReport(report));
}

export function providerForEvaluation(args: readonly string[], env: NodeJS.ProcessEnv): EmbeddingProvider | undefined {
  return evaluationOptionsFor(args, env).provider;
}

export function evaluationOptionsFor(args: readonly string[], env: NodeJS.ProcessEnv, settings: { rankingArtifactRoot?: string } = {}): EvaluationInput & { outputDir: string } {
  let liveEmbeddings = false;
  let useQwen3Instruction = false;
  let outputDir = "reports/retrieval";
  let caseSetPath: string | undefined;
  let split: "development" | undefined;
  let validateCasesOnly = false;
  let rankingCaptureOutput: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (seen.has(arg!)) throw new Error(`Duplicate retrieval evaluation option: ${arg}.`);
    seen.add(arg!);
    if (arg === "--live-embeddings") { liveEmbeddings = true; continue; }
    if (arg === "--qwen3-retrieval-instruction") { useQwen3Instruction = true; continue; }
    if (arg === "--validate-cases-only") { validateCasesOnly = true; continue; }
    if (arg === "--ranking-capture-output") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--ranking-capture-output requires a file.");
      rankingCaptureOutput = value;
      continue;
    }
    if (arg === "--case-set" || arg === "--split") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires ${arg === "--case-set" ? "a manifest path" : "development"}.`);
      if (arg === "--case-set") caseSetPath = value;
      else {
        if (value !== "development") throw new Error("Holdout execution is forbidden; --split supports only development.");
        split = value;
      }
      continue;
    }
    if (arg === "--output-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--output-dir requires a directory.");
      outputDir = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown retrieval evaluation option: ${arg}.`);
  }
  if (caseSetPath === undefined && (split !== undefined || validateCasesOnly)) throw new Error("Readiness split or validation-only mode requires --case-set.");
  if (rankingCaptureOutput !== undefined && caseSetPath === undefined) throw new Error("--ranking-capture-output requires --case-set.");
  if (rankingCaptureOutput !== undefined && validateCasesOnly) throw new Error("Ranking capture output conflicts with validation-only mode.");
  if (validateCasesOnly && (liveEmbeddings || useQwen3Instruction)) throw new Error("Validation-only mode conflicts with live embedding options.");
  const rankingArtifactRoot = settings.rankingArtifactRoot ?? DEFAULT_B4_ARTIFACT_ROOT;
  if (rankingCaptureOutput !== undefined) {
    outputDir = canonicalNewB4ArtifactPath(rankingArtifactRoot, outputDir);
    rankingCaptureOutput = canonicalNewB4ArtifactPath(rankingArtifactRoot, rankingCaptureOutput);
  }
  if (caseSetPath !== undefined) {
    if (!seen.has("--output-dir")) throw new Error("Readiness runs require an explicit --output-dir.");
    if (existsSync(resolve(outputDir))) throw new Error("Readiness output must use a new directory; historical/existing evidence cannot be overwritten.");
    if (rankingCaptureOutput !== undefined && existsSync(resolve(rankingCaptureOutput))) throw new Error("Ranking capture output must use a new file; existing evidence cannot be overwritten.");
    loadReadiness(caseSetPath, validateCasesOnly);
  }
  const readinessOptions = caseSetPath === undefined ? {} : { caseSetPath, split: split ?? "development" as const, validateCasesOnly, ...(rankingCaptureOutput === undefined ? {} : { rankingCaptureOutput, rankingArtifactRoot }) };
  if (useQwen3Instruction && !liveEmbeddings) throw new Error("--qwen3-retrieval-instruction requires --live-embeddings.");
  if (!liveEmbeddings) return { outputDir, ...readinessOptions };
  let provider: EmbeddingProvider | undefined;
  try { provider = embeddingProviderFromEnv(env); } catch { throw new Error("--live-embeddings requires the complete TRIAGE_EMBEDDING_ENDPOINT, TRIAGE_EMBEDDING_MODEL, TRIAGE_EMBEDDING_REVISION, and TRIAGE_EMBEDDING_DIMENSIONS tuple."); }
  if (provider === undefined) throw new Error("--live-embeddings requires the complete TRIAGE_EMBEDDING_ENDPOINT, TRIAGE_EMBEDDING_MODEL, TRIAGE_EMBEDDING_REVISION, and TRIAGE_EMBEDDING_DIMENSIONS tuple.");
  if (useQwen3Instruction && !/^qwen3-embedding(?::|$)/i.test(provider.model.id)) throw new Error("--qwen3-retrieval-instruction requires a qwen3-embedding model.");
  return { provider, ...(useQwen3Instruction ? { semanticQueryFormat: QWEN3_RETRIEVAL_QUERY_FORMAT } : {}), outputDir, ...readinessOptions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
