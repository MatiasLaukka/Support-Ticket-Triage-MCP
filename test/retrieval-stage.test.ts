import { describe, expect, it } from "vitest";
import { buildRetrievalQuery, createRetrievalObserver, RETRIEVAL_QUERY_MAX_CHARS } from "../src/retrieval/stage.js";
import { RetrievalIntegrityError } from "../src/retrieval/sqlite-store.js";

describe("retrieval stage", () => {
  it("builds customer-only deterministic queries and hashes reply identities", () => {
    const ticket = { id: "TKT-0001", updatedAt: "2026-01-01T00:00:00.000Z", subject: "Webhook delayed", description: "Delivery is late", status: "open" } as any;
    const base = buildRetrievalQuery({ ticket, customerReplies: [{ id: "r1", ticketId: ticket.id, createdAt: "2026-01-01T01:00:00.000Z", body: "Still delayed" }], customerReplyWatermark: "reply:r1", references: [], taxonomy: { productSurfaces: ["webhooks"], problemClasses: ["latency"] } });
    const changed = buildRetrievalQuery({ ticket, customerReplies: [{ id: "r2", ticketId: ticket.id, createdAt: "2026-01-01T01:00:00.000Z", body: "Still delayed" }], customerReplyWatermark: "reply:r1", references: [] });
    expect(base.queryText).toContain("Still delayed");
    expect(base.queryText).not.toContain("support response");
    expect(base.queryHash).not.toBe(changed.queryHash);
  });

  it("caps oversized ticket context before allocating reply evidence", () => {
    const query = buildRetrievalQuery({
      ticket: { id: "TKT-0001", updatedAt: "2026-01-01T00:00:00.000Z", subject: "Subject", description: "d".repeat(RETRIEVAL_QUERY_MAX_CHARS) } as any,
      customerReplies: [{ id: "reply", ticketId: "TKT-0001", createdAt: "2026-01-01T01:00:00.000Z", body: "Recent customer evidence" }],
      customerReplyWatermark: "reply:reply",
      references: [],
    });
    expect(query.queryText.length).toBeLessThanOrEqual(RETRIEVAL_QUERY_MAX_CHARS);
    expect(query.queryTruncated).toBe(true);
  });

  it("reconciles before every observation and waits for cancellation on close", async () => {
    let refreshes = 0;
    let closed = false;
    const manager = { refresh: async () => { refreshes += 1; }, close: async () => { closed = true; } } as any;
    const store = {
      readSnapshot: () => ({ metadata: { schemaVersion: 1, representationVersion: 1, generation: 1, lexicalGeneration: 1, semanticGeneration: 0, corpusHash: "", state: "degraded" }, resources: [], lexical: { status: "used" }, lexicalMatches: [], vectors: [] }),
      close: () => { closed = true; },
    } as any;
    const observer = createRetrievalObserver({ manager, store, limits: { "knowledge-article": { lexical: 1, semantic: 1 }, "known-cause": { lexical: 1, semantic: 1 }, "diagnostic-playbook": { lexical: 1, semantic: 1 }, "resolved-ticket": { lexical: 1, semantic: 1 } } });
    await observer.observe({ queryText: "test", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-1");
    expect(refreshes).toBe(1);
    expect(observer.recent()[0]).toMatchObject({ truncated: false, truncatedCount: 0 });
    await observer.close();
    expect(closed).toBe(true);
  });

  it("records an explicit failed trace when the retrieval index is corrupt", async () => {
    const diagnostics: Array<{ code: string; commandId: string }> = [];
    const observer = createRetrievalObserver({
      manager: { refresh: async () => undefined, close: async () => undefined } as any,
      store: { readSnapshot: () => { throw new RetrievalIntegrityError("corrupt"); }, close: () => undefined } as any,
      limits: { "knowledge-article": { lexical: 1, semantic: 1 }, "known-cause": { lexical: 1, semantic: 1 }, "diagnostic-playbook": { lexical: 1, semantic: 1 }, "resolved-ticket": { lexical: 1, semantic: 1 } },
      report: (diagnostic) => diagnostics.push(diagnostic),
    });
    await observer.observe({ queryText: "test", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-corrupt");
    expect(observer.recent()[0]).toMatchObject({ failureCode: "INDEX_INTEGRITY_ERROR", result: { lexical: { status: "failed", reason: "index-integrity-error" }, semantic: { status: "failed", reason: "index-integrity-error" } } });
    expect(diagnostics).toEqual([{ code: "RETRIEVAL_OBSERVATION_FAILED", commandId: "cmd-corrupt" }]);
    await observer.close();
  });
});
