import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
import { embeddingProviderFromEnv } from "../src/retrieval/embedding-provider.js";
import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";
import { classifyTicketFromContext } from "../src/approval-desk/classifier.js";
import type { Candidate, EmbeddingProvider, Reference, ResourceKey } from "../src/retrieval/types.js";

const K_BUDGET = {
  "knowledge-article": { lexical: 5, semantic: 5 },
  "known-cause": { lexical: 5, semantic: 5 },
  "diagnostic-playbook": { lexical: 5, semantic: 5 },
  "resolved-ticket": { lexical: 5, semantic: 5 },
} as const;
const SCENARIO_CUTOFF = "2026-09-12T23:59:59.999Z";
const CONTRAST_FAMILIES = [
  "webhook rotation/latency",
  "SMS quiet-hours/consent delay",
  "Shopify mapping/general sync",
  "editor session/platform loading",
] as const;

type ScenarioReport = {
  ticketId: string;
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

export async function evaluateRetrieval(input: { provider?: EmbeddingProvider } = {}): Promise<Record<string, unknown>> {
  const sourceRoot = mkdtempSync(join(tmpdir(), "triage-retrieval-eval-"));
  const tickets = new TicketRepository(sourceRoot, resolve("data/seed/tickets.json"));
  const store = RetrievalStore.open(":memory:");
  try {
    await tickets.initialize();
    const [articles, oracles] = await Promise.all([
      new KnowledgeRepository(resolve("data/knowledge")).list(),
      loadEvaluationOracles(),
    ]);
    const snapshot = loadRetrievalSources({ articles, reusable: unavailableReusableKnowledge(), completedSnapshots: [] });
    const frozenCorpusKeys = new Set(snapshot.resources.map(({ resource }) => resource.key));
    validateLabelsAgainstCorpus(oracles, frozenCorpusKeys);
    const manager = new IndexManager({ store, load: async () => snapshot, ...(input.provider === undefined ? {} : { provider: input.provider }) });
    await manager.refresh(new AbortController().signal);
    const scenarios: ScenarioReport[] = [];
    for (const oracle of oracles) {
      if (oracle.retrieval === undefined) continue;
      const ticket = await tickets.get(oracle.ticketId);
      const references = deterministicReferences(ticket);
      const query = buildRetrievalQuery({ ticket, customerReplies: [], customerReplyWatermark: "seed", references });
      const result = await retrieve({ query, store, limits: K_BUDGET, ...(input.provider === undefined ? {} : { provider: input.provider }), signal: new AbortController().signal });
      const lexicalKeys = rankedCandidateKeys(result.candidates, "lexical");
      const semanticKeys = rankedCandidateKeys(result.candidates, "semantic");
      const deterministicReferenceKeys = result.candidates.filter((candidate) => candidate.deterministicReferences.length > 0).map((candidate) => candidate.resourceKey);
      const knownCauseReferenceKeys = result.candidates.filter((candidate) => candidate.knownCauseReferences.length > 0).map((candidate) => candidate.resourceKey);
      const unionKeys = result.candidates.map((candidate) => candidate.resourceKey);
      const returnedRepresentations = Object.fromEntries(result.candidates.map((candidate) => [candidate.resourceKey, {
        ...(candidate.lexical ? { lexical: candidate.lexical.matches.map(({ representationId, score, rank }) => ({ representationId, score, rank })) } : {}),
        ...(candidate.semantic ? { semantic: candidate.semantic.matches.map(({ representationId, score, rank }) => ({ representationId, score, rank })) } : {}),
      }]));
      scenarios.push({
        ticketId: oracle.ticketId,
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
      });
    }
    const corpusHash = store.metadata().corpusHash;
    const oracleHash = createHash("sha256").update(JSON.stringify(oracles)).digest("hex");
    const perTypeMetrics = metricBreakdown(scenarios, new Map(oracles.map((oracle) => [oracle.ticketId, oracle])));
    const perFamilyMetrics = familyBreakdown(scenarios);
    const excludedCounts = exclusionBreakdown(scenarios, new Map(oracles.map((oracle) => [oracle.ticketId, oracle])));
    const required = scenarios.map(({ pool }) => pool.requiredCoverage).filter((value): value is number => value !== null);
    const baselineRequired = scenarios.map((scenario) => {
      const oracle = oracles.find((candidate) => candidate.ticketId === scenario.ticketId)?.retrieval;
      if (!oracle || oracle.requiredResourceKeys.length === 0) return null;
      const articles = new Set(scenario.deterministicReferenceKeys.filter((key) => key.startsWith("knowledge-article:")));
      return oracle.requiredResourceKeys.filter((key) => articles.has(key)).length / oracle.requiredResourceKeys.length;
    }).filter((value): value is number => value !== null);
    return {
      mode: input.provider === undefined ? "offline-lexical-only" : "live-embeddings",
      semanticEvidence: input.provider === undefined ? "outstanding" : "measured",
      sourceCommit: sourceCommit(),
      oracleHash,
      scenarioCutoff: SCENARIO_CUTOFF,
      corpusHash,
      representationVersion: store.metadata().representationVersion,
      ftsTokenization: "unicode-letter-number-v1; quoted OR terms; max 128 tokens",
      model: input.provider?.model ?? null,
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
        futureCasesExcluded: 0,
        selfTicketExclusion: "enforced at retrieval query time",
      },
      unjudgedHits: scenarios.flatMap(({ ticketId, pool }) => pool.unjudgedKeys.map((resourceKey) => ({ ticketId, resourceKey }))),
      reviewedContrastFamilies: CONTRAST_FAMILIES,
    };
  } finally {
    store.close();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
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
    const ticketIds = scenarios.filter((scenario) => scenario.contrastGroup === family).map((scenario) => scenario.ticketId).sort();
    return [family, { status: ticketIds.length >= 2 ? "covered" : "missing-counterpart", scenarioCount: ticketIds.length, ticketIds }];
  }));
}

function sourceCommit(): string {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unknown"; }
}

function average(values: readonly number[]): number | null { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }

function metricBreakdown(scenarios: readonly ScenarioReport[], oracles: ReadonlyMap<string, EvaluationOracle>): Record<string, unknown> {
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

function exclusionBreakdown(scenarios: readonly ScenarioReport[], oracles: ReadonlyMap<string, EvaluationOracle>): { incompletePrecision: number; semanticUnavailable: number } {
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

function coverageBreakdown(oracles: readonly EvaluationOracle[]): Record<string, unknown> {
  const result: Record<string, Record<string, number>> = {};
  for (const oracle of oracles) for (const [type, value] of Object.entries(oracle.retrieval!.resourceCoverage)) {
    const counts = result[type] ?? (result[type] = {});
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return result;
}

export function markdownReport(report: Record<string, unknown>): string {
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
    `- Scenario cutoff: ${report.scenarioCutoff}`,
    `- Corpus hash: ${report.corpusHash}`,
    `- Representation version: ${report.representationVersion}`,
    `- FTS tokenization: ${report.ftsTokenization}`,
    `- Model: ${JSON.stringify(report.model)}`,
    `- K budget: ${JSON.stringify(report.kBudget)}`,
    `- Channel statuses: ${JSON.stringify(report.channelStatuses)}`,
    `- Scenarios: ${report.scenarioCount}`,
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
    report.semanticEvidence === "outstanding"
      ? "Semantic quality evidence is outstanding because no live or cached embedding provider was configured. Lexical metrics are deterministic and the corpus/oracle hashes freeze this run's identity."
      : "Semantic quality evidence was measured with the configured provider identity recorded above.",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const provider = providerForEvaluation(process.argv.slice(2), process.env);
  const report = await evaluateRetrieval(provider === undefined ? {} : { provider });
  const outputDir = resolve("reports/retrieval");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "evaluation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(resolve(outputDir, "evaluation.md"), markdownReport(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(markdownReport(report));
}

export function providerForEvaluation(args: readonly string[], env: NodeJS.ProcessEnv): EmbeddingProvider | undefined {
  const unknown = args.filter((arg) => arg !== "--live-embeddings");
  if (unknown.length > 0) throw new Error(`Unknown retrieval evaluation option: ${unknown[0]}.`);
  if (!args.includes("--live-embeddings")) return undefined;
  let provider: EmbeddingProvider | undefined;
  try { provider = embeddingProviderFromEnv(env); } catch { throw new Error("--live-embeddings requires the complete TRIAGE_EMBEDDING_ENDPOINT, TRIAGE_EMBEDDING_MODEL, TRIAGE_EMBEDDING_REVISION, and TRIAGE_EMBEDDING_DIMENSIONS tuple."); }
  if (provider === undefined) throw new Error("--live-embeddings requires the complete TRIAGE_EMBEDDING_ENDPOINT, TRIAGE_EMBEDDING_MODEL, TRIAGE_EMBEDDING_REVISION, and TRIAGE_EMBEDDING_DIMENSIONS tuple.");
  return provider;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
