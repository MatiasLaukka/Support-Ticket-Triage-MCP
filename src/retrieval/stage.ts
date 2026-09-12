import { createHash } from "node:crypto";
import type { Ticket } from "../domain.js";
import type { CustomerReply } from "../approval-desk/ai-evaluation.js";
import { retrieve } from "./search.js";
import type { IndexManager } from "./index-manager.js";
import type { EmbeddingProvider, Limits, Query, Reference, RetrievalResult, RetrievalTrace } from "./types.js";
import type { RetrievalStore } from "./sqlite-store.js";

export const RETRIEVAL_QUERY_MAX_CHARS = 12_000;
const TRACE_LIMIT = 100;
const TRACE_MAX_BYTES = 64 * 1024;
export function buildRetrievalQuery(input: { ticket: Ticket; customerReplies: readonly CustomerReply[]; customerReplyWatermark: string; references: readonly Reference[]; taxonomy?: { productSurfaces: readonly string[]; problemClasses: readonly string[] } }): Query {
  const subject = input.ticket.subject.trim();
  const description = input.ticket.description.trim();
  const prefix = `${subject}\n\n${description}`;
  const ordered = [...input.customerReplies].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const room = Math.max(0, RETRIEVAL_QUERY_MAX_CHARS - prefix.length - 2);
  const replyText = ordered.map((reply) => reply.body.trim()).filter(Boolean).join("\n\n");
  const queryText = replyText.length <= room ? `${prefix}${replyText ? `\n\n${replyText}` : ""}` : `${prefix}${replyText ? `\n\n${replyText.slice(-room)}` : ""}`;
  const queryTruncated = queryText.length < prefix.length + (replyText ? replyText.length + 2 : 0);
  const queryHash = createHash("sha256").update(JSON.stringify({ subject, description, replies: ordered.map(({ id, body }) => ({ id, body })) })).digest("hex");
  return { queryText, queryHash, ticketId: input.ticket.id, sourceRevision: Date.parse(input.ticket.updatedAt), customerReplyWatermark: input.customerReplyWatermark, queryTruncated, references: [...input.references], ...(input.taxonomy ? { taxonomy: input.taxonomy } : {}) };
}

export interface RetrievalObserver { observe(query: Query, commandId: string): Promise<void>; recent(): readonly RetrievalTrace[]; close(): Promise<void> }
export function createRetrievalObserver(input: { manager: IndexManager; store: RetrievalStore; limits: Limits; provider?: EmbeddingProvider; report?: (diagnostic: { code: string; commandId: string }) => void }): RetrievalObserver {
  const traces: RetrievalTrace[] = [];
  const report = input.report ?? (() => undefined);
  return { async observe(query, commandId) { try { const result = await retrieve({ query, store: input.store, provider: input.provider, limits: input.limits, signal: new AbortController().signal }); const trace: RetrievalTrace = { commandId, queryHash: query.queryHash, ticketId: query.ticketId, sourceRevision: query.sourceRevision, customerReplyWatermark: query.customerReplyWatermark, queryTruncated: query.queryTruncated, result, candidateCount: result.candidates.length, truncated: query.queryTruncated }; const serialized = JSON.stringify(trace); traces.push(serialized.length > TRACE_MAX_BYTES ? { ...trace, result: { ...result, candidates: [] }, truncated: true } : trace); while (traces.length > TRACE_LIMIT) traces.shift(); } catch { reportRetrievalFailure(commandId, report); } }, recent() { return traces.map((trace) => structuredClone(trace)); }, async close() { await input.manager.close(); input.store.close(); } };
}
export function reportRetrievalFailure(commandId: string, report: (diagnostic: { code: string; commandId: string }) => void = () => undefined): void { try { report({ code: "RETRIEVAL_OBSERVATION_FAILED", commandId }); } catch { /* diagnostics must never affect command authority */ } }
