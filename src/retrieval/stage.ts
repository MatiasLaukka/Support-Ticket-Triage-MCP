import { createHash } from "node:crypto";
import type { Ticket } from "../domain.js";
import type { CustomerReply } from "../approval-desk/ai-evaluation.js";
import { retrieve } from "./search.js";
import type { IndexManager } from "./index-manager.js";
import type { EmbeddingProvider, IndexMetadata, Limits, Query, Reference, RetrievalTrace } from "./types.js";
import { RETRIEVAL_SCHEMA_VERSION, RetrievalIntegrityError, RetrievalRepresentationVersionError, type RetrievalStore } from "./sqlite-store.js";
import { REPRESENTATION_VERSION } from "./representations.js";
import { rankRetrieval, RESOURCE_TYPES } from "./ranking.js";
import type { RankingOutputLimits, RankingPolicy, RankingResult } from "./ranking-types.js";
import type { RankingTraceProjection } from "./types.js";

export const RETRIEVAL_QUERY_MAX_CHARS = 12_000;
const TRACE_LIMIT = 100;
const TRACE_MAX_BYTES = 64 * 1024;

export function buildRetrievalQuery(input: {
  ticket: Ticket;
  customerReplies: readonly CustomerReply[];
  customerReplyWatermark: string;
  references: readonly Reference[];
  taxonomy?: { productSurfaces: readonly string[]; problemClasses: readonly string[] };
}): Query {
  const subject = input.ticket.subject.trim();
  const description = input.ticket.description.trim();
  const fullPrefix = `${subject}\n\n${description}`;
  const prefix = fullPrefix.slice(0, RETRIEVAL_QUERY_MAX_CHARS);
  const ordered = [...input.customerReplies].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const room = Math.max(0, RETRIEVAL_QUERY_MAX_CHARS - prefix.length - 2);
  const replyText = ordered.map((reply) => reply.body.trim()).filter(Boolean).join("\n\n");
  const clippedReplyText = room === 0 ? "" : replyText.length <= room ? replyText : replyText.slice(-room);
  const queryText = `${prefix}${clippedReplyText ? `\n\n${clippedReplyText}` : ""}`;
  const queryTruncated = queryText.length < fullPrefix.length + (replyText ? replyText.length + 2 : 0);
  const queryHash = createHash("sha256").update(JSON.stringify({ subject, description, replies: ordered.map(({ id, body }) => ({ id, body })) })).digest("hex");
  return { queryText, queryHash, ticketId: input.ticket.id, sourceRevision: input.ticket.revision, customerReplyWatermark: input.customerReplyWatermark, queryTruncated, references: [...input.references], ...(input.taxonomy ? { taxonomy: input.taxonomy } : {}) };
}

export interface RetrievalObserver { observe(query: Query, commandId: string): Promise<void>; reportFailure?(commandId: string): void; recent(): readonly RetrievalTrace[]; close(): Promise<void> }

export interface RetrievalRankingConfig {
  policy: RankingPolicy;
  outputLimit: number;
}

export function createRetrievalObserver(input: { manager: IndexManager; store: RetrievalStore; limits: Limits; provider?: EmbeddingProvider; ranking?: RetrievalRankingConfig; report?: (diagnostic: { code: string; commandId: string }) => void }): RetrievalObserver {
  const traces: RetrievalTrace[] = [];
  const report = input.report ?? (() => undefined);
  const controller = new AbortController();
  const active = new Set<Promise<void>>();
  let closed = false;
  const observe = (query: Query, commandId: string): Promise<void> => {
    if (closed) return Promise.resolve();
    const work = (async () => {
      try {
        await input.manager.refresh(controller.signal);
        const result = await retrieve({ query, store: input.store, provider: input.provider, limits: input.limits, signal: controller.signal });
        let ranking: RankingTraceProjection | undefined;
        if (input.ranking !== undefined) {
          const rankingStarted = performance.now();
          try {
            const outputLimits = Object.fromEntries(RESOURCE_TYPES.map((resourceType) => [resourceType, input.ranking!.outputLimit])) as RankingOutputLimits;
            ranking = compactRankingTrace(rankRetrieval({
              contractVersion: 1,
              queryBasis: { queryHash: query.queryHash, ticketId: query.ticketId, ticketRevision: query.sourceRevision, customerReplyWatermark: query.customerReplyWatermark },
              retrieval: result,
              outputLimits,
            }, input.ranking.policy), performance.now() - rankingStarted);
          } catch (error) {
            ranking = failedRankingTrace(input.ranking.policy, performance.now() - rankingStarted, error);
            reportRetrievalFailure(commandId, report, "B4_RANKING_FAILED");
          }
        }
        const trace: RetrievalTrace = { commandId, queryHash: query.queryHash, ticketId: query.ticketId, sourceRevision: query.sourceRevision, customerReplyWatermark: query.customerReplyWatermark, queryTruncated: query.queryTruncated, result, candidateCount: result.candidates.length, truncated: query.queryTruncated, truncatedCount: query.queryTruncated ? 1 : 0, ...(ranking === undefined ? {} : { ranking }) };
        const serialized = JSON.stringify(trace);
        if (Buffer.byteLength(serialized, "utf8") > TRACE_MAX_BYTES) {
          traces.push({ ...trace, result: { ...result, candidates: [] }, ...(ranking === undefined ? {} : { ranking: truncateRankingTrace(ranking) }), truncated: true, truncatedCount: trace.truncatedCount + Math.max(1, trace.candidateCount) });
        } else {
          traces.push(trace);
        }
        while (traces.length > TRACE_LIMIT) traces.shift();
      } catch (error) {
        if (!controller.signal.aborted) {
          const code = error instanceof RetrievalRepresentationVersionError ? "INDEX_UPGRADE_REQUIRED" : error instanceof RetrievalIntegrityError ? "INDEX_INTEGRITY_ERROR" : "RETRIEVAL_OBSERVATION_FAILED";
          if (code !== "RETRIEVAL_OBSERVATION_FAILED") recordIndexFailure(query, commandId, input.store, traces, code);
          reportRetrievalFailure(commandId, report, code);
        }
      }
    })();
    active.add(work);
    void work.finally(() => active.delete(work));
    return work;
  };
  return {
    observe,
    reportFailure(commandId) { reportRetrievalFailure(commandId, report); },
    recent() { return traces.map((trace) => structuredClone(trace)); },
    async close() { if (closed) return; closed = true; controller.abort(); await Promise.allSettled([...active]); await input.manager.close(); input.store.close(); },
  };
}

function emptyRankedTypes(): RankingTraceProjection["byType"] {
  return Object.fromEntries(RESOURCE_TYPES.map((resourceType) => [resourceType, { poolCount: 0, returnedCount: 0, omittedCount: 0, memberships: [] }])) as unknown as RankingTraceProjection["byType"];
}

function compactRankingTrace(result: RankingResult, durationMs: number): RankingTraceProjection {
  return {
    contractVersion: result.contractVersion,
    policy: result.policy,
    inputHash: result.inputHash,
    channelSummary: result.channelSummary,
    byType: Object.fromEntries(RESOURCE_TYPES.map((resourceType) => {
      const byType = result.byType[resourceType];
      return [resourceType, { poolCount: byType.poolCount, returnedCount: byType.returnedCount, omittedCount: byType.omittedCount, memberships: byType.memberships.map(({ resourceKey, position }) => ({ resourceKey, position })) }];
    })) as unknown as RankingTraceProjection["byType"],
    references: result.references,
    durationMs,
    status: "used",
    truncated: false,
  };
}

function failedRankingTrace(policy: RankingPolicy, durationMs: number, error: unknown): RankingTraceProjection {
  return {
    contractVersion: 1,
    policy,
    inputHash: null,
    channelSummary: null,
    byType: emptyRankedTypes(),
    references: [],
    durationMs,
    status: "failed",
    failureCode: error instanceof Error && "code" in error && error.code === "INVALID_RANKING_INPUT" ? "INVALID_RANKING_INPUT" : "B4_RANKING_FAILED",
    truncated: false,
  };
}

function truncateRankingTrace(ranking: RankingTraceProjection): RankingTraceProjection {
  return { ...ranking, byType: emptyRankedTypes(), references: [], truncated: true };
}

function recordIndexFailure(query: Query, commandId: string, store: RetrievalStore, traces: RetrievalTrace[], failureCode: "INDEX_INTEGRITY_ERROR" | "INDEX_UPGRADE_REQUIRED"): void {
  let metadata: IndexMetadata;
  try {
    metadata = store.metadata();
  } catch {
    metadata = { schemaVersion: RETRIEVAL_SCHEMA_VERSION, representationVersion: REPRESENTATION_VERSION, generation: 0, lexicalGeneration: 0, semanticGeneration: 0, corpusHash: "", state: "unavailable" };
  }
  const channel = failureCode === "INDEX_UPGRADE_REQUIRED" ? { status: "unavailable", reason: "index-upgrade-required" } as const : { status: "failed", reason: "index-integrity-error" } as const;
  traces.push({ commandId, queryHash: query.queryHash, ticketId: query.ticketId, sourceRevision: query.sourceRevision, customerReplyWatermark: query.customerReplyWatermark, queryTruncated: query.queryTruncated, result: { metadata, lexical: channel, semantic: channel, candidates: [], referenceDiagnostics: [] }, candidateCount: 0, truncated: query.queryTruncated, truncatedCount: query.queryTruncated ? 1 : 0, failureCode });
  while (traces.length > TRACE_LIMIT) traces.shift();
}

export function createUnavailableRetrievalObserver(input: ((diagnostic: { code: string; commandId: string }) => void) | { report?: (diagnostic: { code: string; commandId: string }) => void; failureCode?: RetrievalTrace["failureCode"] } = () => undefined): RetrievalObserver {
  const report = typeof input === "function" ? input : input.report ?? (() => undefined);
  const failureCode = typeof input === "function" ? undefined : input.failureCode;
  const traces: RetrievalTrace[] = [];
  return {
    async observe(query, commandId) {
      const channel = failureCode === "INDEX_INTEGRITY_ERROR" ? { status: "failed", reason: "index-integrity-error" } as const : { status: "unavailable", reason: failureCode === "INDEX_UPGRADE_REQUIRED" ? "index-upgrade-required" : "index-unavailable" } as const;
      traces.push({ commandId, queryHash: query.queryHash, ticketId: query.ticketId, sourceRevision: query.sourceRevision, customerReplyWatermark: query.customerReplyWatermark, queryTruncated: query.queryTruncated, result: { metadata: { schemaVersion: RETRIEVAL_SCHEMA_VERSION, representationVersion: REPRESENTATION_VERSION, generation: 0, lexicalGeneration: 0, semanticGeneration: 0, corpusHash: "", state: "unavailable" }, lexical: channel, semantic: channel, candidates: [], referenceDiagnostics: [] }, candidateCount: 0, truncated: query.queryTruncated, truncatedCount: query.queryTruncated ? 1 : 0, ...(failureCode ? { failureCode } : {}) });
      while (traces.length > TRACE_LIMIT) traces.shift();
      reportRetrievalFailure(commandId, report, failureCode ?? "RETRIEVAL_OBSERVATION_FAILED");
    },
    reportFailure(commandId) { reportRetrievalFailure(commandId, report); },
    recent() { return traces.map((trace) => structuredClone(trace)); },
    async close() { /* no derived resources were opened */ },
  };
}

export function reportRetrievalFailure(commandId: string, report: (diagnostic: { code: string; commandId: string }) => void = () => undefined, code = "RETRIEVAL_OBSERVATION_FAILED"): void { try { report({ code, commandId }); } catch { /* diagnostics must never affect command authority */ } }
