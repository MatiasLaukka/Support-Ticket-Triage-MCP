import { createHash } from "node:crypto";
import type { Ticket } from "../domain.js";
import type { CustomerReply } from "../approval-desk/ai-evaluation.js";
import { retrieve } from "./search.js";
import type { IndexManager } from "./index-manager.js";
import type { EmbeddingProvider, Limits, Query, Reference, RetrievalTrace } from "./types.js";
import type { RetrievalStore } from "./sqlite-store.js";

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
  return { queryText, queryHash, ticketId: input.ticket.id, sourceRevision: Date.parse(input.ticket.updatedAt), customerReplyWatermark: input.customerReplyWatermark, queryTruncated, references: [...input.references], ...(input.taxonomy ? { taxonomy: input.taxonomy } : {}) };
}

export interface RetrievalObserver { observe(query: Query, commandId: string): Promise<void>; recent(): readonly RetrievalTrace[]; close(): Promise<void> }

export function createRetrievalObserver(input: { manager: IndexManager; store: RetrievalStore; limits: Limits; provider?: EmbeddingProvider; report?: (diagnostic: { code: string; commandId: string }) => void }): RetrievalObserver {
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
        const trace: RetrievalTrace = { commandId, queryHash: query.queryHash, ticketId: query.ticketId, sourceRevision: query.sourceRevision, customerReplyWatermark: query.customerReplyWatermark, queryTruncated: query.queryTruncated, result, candidateCount: result.candidates.length, truncated: query.queryTruncated, truncatedCount: query.queryTruncated ? 1 : 0 };
        const serialized = JSON.stringify(trace);
        if (serialized.length > TRACE_MAX_BYTES) {
          traces.push({ ...trace, result: { ...result, candidates: [] }, truncated: true, truncatedCount: trace.truncatedCount + Math.max(1, trace.candidateCount) });
        } else {
          traces.push(trace);
        }
        while (traces.length > TRACE_LIMIT) traces.shift();
      } catch {
        if (!controller.signal.aborted) reportRetrievalFailure(commandId, report);
      }
    })();
    active.add(work);
    void work.finally(() => active.delete(work));
    return work;
  };
  return {
    observe,
    recent() { return traces.map((trace) => structuredClone(trace)); },
    async close() { if (closed) return; closed = true; controller.abort(); await Promise.allSettled([...active]); await input.manager.close(); input.store.close(); },
  };
}

export function createUnavailableRetrievalObserver(report: (diagnostic: { code: string; commandId: string }) => void = () => undefined): RetrievalObserver {
  return { async observe(_query, commandId) { reportRetrievalFailure(commandId, report); }, recent() { return []; }, async close() { /* no derived resources were opened */ } };
}

export function reportRetrievalFailure(commandId: string, report: (diagnostic: { code: string; commandId: string }) => void = () => undefined): void { try { report({ code: "RETRIEVAL_OBSERVATION_FAILED", commandId }); } catch { /* diagnostics must never affect command authority */ } }
