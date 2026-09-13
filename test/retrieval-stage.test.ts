import { describe, expect, it } from "vitest";
import { buildRetrievalQuery, createRetrievalObserver } from "../src/retrieval/stage.js";

describe("retrieval stage", () => {
  it("builds customer-only deterministic queries and hashes reply identities", () => {
    const ticket = { id: "TKT-0001", updatedAt: "2026-01-01T00:00:00.000Z", subject: "Webhook delayed", description: "Delivery is late", status: "open" } as any;
    const base = buildRetrievalQuery({ ticket, customerReplies: [{ id: "r1", ticketId: ticket.id, createdAt: "2026-01-01T01:00:00.000Z", body: "Still delayed" }], customerReplyWatermark: "reply:r1", references: [], taxonomy: { productSurfaces: ["webhooks"], problemClasses: ["latency"] } });
    const changed = buildRetrievalQuery({ ticket, customerReplies: [{ id: "r2", ticketId: ticket.id, createdAt: "2026-01-01T01:00:00.000Z", body: "Still delayed" }], customerReplyWatermark: "reply:r1", references: [] });
    expect(base.queryText).toContain("Still delayed");
    expect(base.queryText).not.toContain("support response");
    expect(base.queryHash).not.toBe(changed.queryHash);
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
});
