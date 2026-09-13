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
  unionKeys: readonly string[];
  candidateCount: number;
  returnedRepresentations: Record<string, { lexical?: readonly { representationId: string; score: number; rank: number }[]; semantic?: readonly { representationId: string; score: number; rank: number }[] }>;
  pool: ReturnType<typeof scorePool>;
  ranked: { lexical: ReturnType<typeof scoreRanked>; semantic: ReturnType<typeof scoreRanked> };
  channelStatuses: { lexical: string; semantic: string };
};

export async function evaluateRetrieval(): Promise<Record<string, unknown>> {
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
    const manager = new IndexManager({ store, load: async () => snapshot });
    await manager.refresh(new AbortController().signal);
    const scenarios: ScenarioReport[] = [];
    for (const oracle of oracles) {
      if (oracle.retrieval === undefined) continue;
      const ticket = await tickets.get(oracle.ticketId);
      const query = buildRetrievalQuery({ ticket, customerReplies: [], customerReplyWatermark: "seed", references: [] });
      const result = await retrieve({ query, store, limits: K_BUDGET, signal: new AbortController().signal });
      const lexicalKeys = result.candidates.filter((candidate) => candidate.lexical !== undefined).map((candidate) => candidate.resourceKey);
      const semanticKeys = result.candidates.filter((candidate) => candidate.semantic !== undefined).map((candidate) => candidate.resourceKey);
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
        unionKeys,
        candidateCount: result.candidates.length,
        returnedRepresentations,
        pool: scorePool(unionKeys as any, oracle.retrieval),
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
    const required = scenarios.map(({ pool }) => pool.requiredCoverage).filter((value): value is number => value !== null);
    const baselineRequired = scenarios.map((scenario) => {
      const oracle = oracles.find((candidate) => candidate.ticketId === scenario.ticketId)?.retrieval;
      if (!oracle || oracle.requiredResourceKeys.length === 0) return null;
      const articles = new Set(scenario.unionKeys.filter((key) => key.startsWith("knowledge-article:")));
      return oracle.requiredResourceKeys.filter((key) => articles.has(key)).length / oracle.requiredResourceKeys.length;
    }).filter((value): value is number => value !== null);
    return {
      mode: "offline-lexical-only",
      semanticEvidence: "outstanding",
      sourceCommit: sourceCommit(),
      oracleHash,
      scenarioCutoff: SCENARIO_CUTOFF,
      corpusHash,
      representationVersion: store.metadata().representationVersion,
      ftsTokenization: "unicode-letter-number-v1; quoted OR terms; max 128 tokens",
      model: null,
      kBudget: K_BUDGET,
      scenarioCount: scenarios.length,
      candidatePools: scenarios,
      channelStatuses: { lexical: "available", semantic: "unavailable:provider-not-configured" },
      perTypeMetrics,
      perFamilyMetrics,
      baselineComparison: {
        articleOnlyRequiredCoverage: average(baselineRequired),
        unionRequiredCoverage: average(required),
        scenariosCompared: baselineRequired.length,
      },
      corpusCoverage: coverageBreakdown(oracles.filter((oracle) => oracle.retrieval !== undefined)),
      unjudgedHits: scenarios.flatMap(({ ticketId, pool }) => pool.unjudgedKeys.map((resourceKey) => ({ ticketId, resourceKey }))),
      reviewedContrastFamilies: CONTRAST_FAMILIES,
    };
  } finally {
    store.close();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
}

function sourceCommit(): string {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unknown"; }
}

function average(values: readonly number[]): number | null { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }

function metricBreakdown(scenarios: readonly ScenarioReport[], oracles: ReadonlyMap<string, EvaluationOracle>): Record<string, unknown> {
  const result: Record<string, { scenarios: number; lexical: Record<string, number | null>; semantic: Record<string, number | null> }> = {};
  for (const scenario of scenarios) {
    const expectation = oracles.get(scenario.ticketId)?.retrieval;
    if (expectation === undefined) continue;
    for (const type of ["knowledge-article", "known-cause", "diagnostic-playbook", "resolved-ticket"] as const) {
      const relevant = expectation.relevantResourceKeys.filter((key) => key.startsWith(`${type}:`));
      if (relevant.length === 0) continue;
      const typedOracle = { ...expectation, requiredResourceKeys: expectation.requiredResourceKeys.filter((key) => key.startsWith(`${type}:`)), relevantResourceKeys: relevant, hardNegativeResourceKeys: expectation.hardNegativeResourceKeys.filter((key) => key.startsWith(`${type}:`)) };
      const entry = result[type] ?? (result[type] = { scenarios: 0, lexical: {}, semantic: {} });
      entry.scenarios += 1;
      for (const k of [1, 3, 5] as const) {
        const lexical = scoreRanked(scenario.lexicalKeys.filter((key) => key.startsWith(`${type}:`)) as any, typedOracle, k);
        entry.lexical[`recallAt${k}`] = averageMetric(entry.lexical[`recallAt${k}`], lexical.recallAtK, entry.scenarios);
        entry.lexical[`precisionAt${k}`] = averageMetric(entry.lexical[`precisionAt${k}`], lexical.precisionAtK, entry.scenarios);
        const semantic = scenario.channelStatuses.semantic === "used"
          ? scoreRanked(scenario.semanticKeys.filter((key) => key.startsWith(`${type}:`)) as any, typedOracle, k)
          : { recallAtK: null, precisionAtK: null };
        entry.semantic[`recallAt${k}`] = averageMetric(entry.semantic[`recallAt${k}`], semantic.recallAtK, entry.scenarios);
        entry.semantic[`precisionAt${k}`] = averageMetric(entry.semantic[`precisionAt${k}`], semantic.precisionAtK, entry.scenarios);
      }
    }
  }
  return result;
}

function averageMetric(current: number | null | undefined, next: number | null, count: number): number | null {
  if (next === null) return current ?? null;
  return current === undefined || current === null ? next : current + (next - current) / count;
}

function familyBreakdown(scenarios: readonly ScenarioReport[]): Record<string, unknown> {
  const result: Record<string, { scenarios: number; candidateRecall: number | null; requiredCoverage: number | null }> = {};
  for (const scenario of scenarios) {
    const family = scenario.family ?? "unclassified";
    const entry = result[family] ?? (result[family] = { scenarios: 0, candidateRecall: null, requiredCoverage: null });
    entry.scenarios += 1;
    entry.candidateRecall = combineAverage(entry.candidateRecall, scenario.pool.candidateRecall, entry.scenarios);
    entry.requiredCoverage = combineAverage(entry.requiredCoverage, scenario.pool.requiredCoverage, entry.scenarios);
  }
  return result;
}

function combineAverage(current: number | null, next: number | null, count: number): number | null { return next === null ? current : current === null ? next : current + (next - current) / count; }

function coverageBreakdown(oracles: readonly EvaluationOracle[]): Record<string, unknown> {
  const result: Record<string, Record<string, number>> = {};
  for (const oracle of oracles) for (const [type, value] of Object.entries(oracle.retrieval!.resourceCoverage)) {
    const counts = result[type] ?? (result[type] = {});
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return result;
}

function markdownReport(report: Record<string, unknown>): string {
  const pools = Array.isArray(report.candidatePools) ? report.candidatePools as Array<Record<string, unknown>> : [];
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
    `- Scenarios: ${report.scenarioCount}`,
    "",
    "## Candidate pools",
    "",
    "| Ticket | Pool size | Candidate recall | Required coverage | Unjudged hits |",
    "|---|---:|---:|---:|---:|",
    ...pools.map((pool) => `| ${pool.ticketId} | ${pool.candidateCount} | ${(pool.pool as { candidateRecall: number | null }).candidateRecall ?? "n/a"} | ${(pool.pool as { requiredCoverage: number | null }).requiredCoverage ?? "n/a"} | ${(pool.pool as { unjudgedKeys: unknown[] }).unjudgedKeys.length} |`),
    "",
    "## Notes",
    "",
    "Semantic quality evidence is outstanding because no live or cached embedding provider was configured. Lexical metrics are deterministic and the corpus/oracle hashes freeze this run's identity.",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const report = await evaluateRetrieval();
  const outputDir = resolve("reports/retrieval");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "evaluation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(resolve(outputDir, "evaluation.md"), markdownReport(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(markdownReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
