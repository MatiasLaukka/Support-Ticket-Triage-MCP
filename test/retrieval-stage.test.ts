import { describe, expect, it, vi } from "vitest";
import { buildRetrievalQuery, createRetrievalObserver, createUnavailableRetrievalObserver, RETRIEVAL_QUERY_MAX_CHARS } from "../src/retrieval/stage.js";
import { executeRetrieval } from "../src/retrieval/execution.js";
import { RETRIEVAL_SCHEMA_VERSION, RetrievalIntegrityError } from "../src/retrieval/sqlite-store.js";
import { REPRESENTATION_VERSION } from "../src/retrieval/representations.js";

const retrievalLimits = {
  "knowledge-article": { lexical: 5, semantic: 5 },
  "known-cause": { lexical: 5, semantic: 5 },
  "diagnostic-playbook": { lexical: 5, semantic: 5 },
  "resolved-ticket": { lexical: 5, semantic: 5 },
};

const executionQuery = {
  queryText: "execution",
  queryHash: "execution-query-hash",
  ticketId: "TKT-0001",
  sourceRevision: 1,
  customerReplyWatermark: "none",
  queryTruncated: false,
  references: [],
} as const;

function executionFixture(resourceKey = "knowledge-article:execution") {
  const snapshot = {
    metadata: { schemaVersion: 2, representationVersion: REPRESENTATION_VERSION, generation: 1, lexicalGeneration: 1, semanticGeneration: 0, corpusHash: "execution-corpus", state: "degraded" },
    resources: [{ key: resourceKey, type: "knowledge-article", sourceId: "execution", contentHash: "execution-content", family: "article", linkedResourceKeys: [] }],
    lexical: { status: "used" },
    lexicalMatches: [{ representationId: "execution-representation", resourceKey, score: 0.1, rank: 2 }],
    vectors: [],
  };
  let refreshes = 0;
  const manager = { refresh: async () => { refreshes += 1; }, close: async () => undefined } as any;
  const store = { readSnapshot: () => snapshot, close: () => undefined } as any;
  return { manager, store, limits: retrievalLimits, refreshes: () => refreshes };
}

function throwingRankingPolicy(error: Error) {
  const target = { id: "lexical-only-v1" };
  Object.defineProperty(target, "kind", { value: "lexical-only", enumerable: false });
  return new Proxy(target, {
    get(policy, property, receiver) {
      if (property === "kind") throw error;
      return Reflect.get(policy, property, receiver);
    },
  });
}

describe("retrieval stage", () => {
  it("returns the actual retrieval result from reusable execution", async () => {
    const fixture = executionFixture();
    const execution = await executeRetrieval({ ...fixture, query: executionQuery, signal: new AbortController().signal });

    expect(execution).toMatchObject({
      retrieval: {
        metadata: { corpusHash: "execution-corpus", generation: 1 },
        lexical: { status: "used" },
        semantic: { status: "unavailable", reason: "provider-not-configured" },
        candidates: [{
          resourceKey: "knowledge-article:execution",
          resourceType: "knowledge-article",
          lexical: { bestRank: 2, bestBm25Score: 0.1 },
        }],
        referenceDiagnostics: [],
      },
      ranking: { status: "not-requested" },
    });
    expect(fixture.refreshes()).toBe(1);
  });

  it("returns the real ranking result from reusable execution", async () => {
    const fixture = executionFixture();
    const policy = { id: "lexical-only-v1", kind: "lexical-only" } as const;
    const execution = await executeRetrieval({
      ...fixture,
      query: executionQuery,
      signal: new AbortController().signal,
      ranking: { policy, outputLimit: 1 },
    });

    expect(execution.ranking.status).toBe("succeeded");
    if (execution.ranking.status !== "succeeded") throw new Error("expected ranking success");
    expect(execution.ranking.result).toMatchObject({
      contractVersion: 1,
      policy,
      queryBasis: {
        queryHash: "execution-query-hash",
        ticketId: "TKT-0001",
        ticketRevision: 1,
        customerReplyWatermark: "none",
      },
      byType: {
        "knowledge-article": {
          poolCount: 1,
          returnedCount: 1,
          memberships: [{ resourceKey: "knowledge-article:execution", position: 1 }],
        },
      },
    });
    expect(execution.retrieval.candidates).toHaveLength(1);
  });

  it("preserves retrieval, the original ranking error, and ranking duration", async () => {
    const fixture = executionFixture();
    const originalError = Object.assign(new Error("ranking failed"), { code: "INVALID_RANKING_INPUT" });
    const policy = throwingRankingPolicy(originalError) as any;
    const now = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(137);
    try {
      const execution = await executeRetrieval({
        ...fixture,
        query: executionQuery,
        signal: new AbortController().signal,
        ranking: { policy, outputLimit: 1 },
      });

      expect(execution.retrieval.candidates).toHaveLength(1);
      expect(execution.ranking.status).toBe("failed");
      if (execution.ranking.status !== "failed") throw new Error("expected ranking failure");
      expect(execution.ranking.error).toBe(originalError);
      expect(execution.ranking.durationMs).toBe(37);
    } finally {
      now.mockRestore();
    }
  });

  it("projects successful execution into the observer ranking trace", async () => {
    const directFixture = executionFixture();
    const observerFixture = executionFixture();
    const policy = { id: "lexical-only-v1", kind: "lexical-only" } as const;
    const ranking = { policy, outputLimit: 1 };
    const execution = await executeRetrieval({ ...directFixture, query: executionQuery, signal: new AbortController().signal, ranking });
    const observer = createRetrievalObserver({ ...observerFixture, ranking });

    await observer.observe(executionQuery, "cmd-execution-success");
    const trace = observer.recent()[0]!;
    expect(execution.ranking.status).toBe("succeeded");
    if (execution.ranking.status !== "succeeded") throw new Error("expected ranking success");
    expect(trace.result).toEqual(execution.retrieval);
    expect(trace.ranking).toMatchObject({
      contractVersion: 1,
      policy,
      inputHash: execution.ranking.result.inputHash,
      channelSummary: execution.ranking.result.channelSummary,
      byType: {
        "knowledge-article": {
          poolCount: 1,
          returnedCount: 1,
          omittedCount: 0,
          memberships: [{ resourceKey: "knowledge-article:execution", position: 1 }],
        },
      },
      references: [],
      status: "used",
      truncated: false,
    });
    await observer.close();
  });

  it("projects the original ranking error and duration while reporting the existing failure code", async () => {
    const fixture = executionFixture();
    const policy = { id: "invalid-policy", kind: "invalid" } as any;
    const diagnostics: Array<{ code: string; commandId: string }> = [];
    const observer = createRetrievalObserver({
      ...fixture,
      ranking: { policy, outputLimit: 1 },
      report: (diagnostic) => diagnostics.push(diagnostic),
    });
    const now = vi.spyOn(performance, "now").mockReturnValueOnce(200).mockReturnValueOnce(255);
    try {
      await observer.observe(executionQuery, "cmd-execution-ranking-failure");
      expect(observer.recent()[0]).toMatchObject({
        result: { candidates: [{ resourceKey: "knowledge-article:execution" }] },
        ranking: {
          policy: { id: "invalid-policy", kind: "invalid" },
          status: "failed",
          failureCode: "INVALID_RANKING_INPUT",
          durationMs: 55,
          truncated: false,
        },
      });
      expect(diagnostics).toEqual([{ code: "B4_RANKING_FAILED", commandId: "cmd-execution-ranking-failure" }]);
    } finally {
      now.mockRestore();
      await observer.close();
    }
  });

  it("keeps the reusable execution result intact when the observer truncates its trace", async () => {
    const resourceKey = `knowledge-article:${"é".repeat(40_000)}`;
    const directFixture = executionFixture(resourceKey);
    const observerFixture = executionFixture(resourceKey);
    const execution = await executeRetrieval({ ...directFixture, query: executionQuery, signal: new AbortController().signal });
    const observer = createRetrievalObserver(observerFixture);

    await observer.observe(executionQuery, "cmd-execution-truncated");
    expect(execution.retrieval.candidates).toHaveLength(1);
    expect(execution.retrieval.candidates[0]!.resourceKey).toBe(resourceKey);
    expect(observer.recent()[0]).toMatchObject({ truncated: true, candidateCount: 1, result: { candidates: [] } });
    await observer.close();
  });

  it("keeps closed observer calls as resolved no-ops", async () => {
    let refreshes = 0;
    let reads = 0;
    const observer = createRetrievalObserver({
      manager: { refresh: async () => { refreshes += 1; }, close: async () => undefined } as any,
      store: { readSnapshot: () => { reads += 1; throw new Error("closed observer must not read"); }, close: () => undefined } as any,
      limits: retrievalLimits,
    });

    await observer.close();
    await expect(observer.observe(executionQuery, "cmd-after-close")).resolves.toBeUndefined();
    expect(refreshes).toBe(0);
    expect(reads).toBe(0);
    expect(observer.recent()).toEqual([]);
  });

  it("builds customer-only deterministic queries and hashes reply identities", () => {
    const ticket = { id: "TKT-0001", revision: 7, updatedAt: "2026-01-01T00:00:00.000Z", subject: "Webhook delayed", description: "Delivery is late", status: "open" } as any;
    const base = buildRetrievalQuery({ ticket, customerReplies: [{ id: "r1", ticketId: ticket.id, createdAt: "2026-01-01T01:00:00.000Z", body: "Still delayed" }], customerReplyWatermark: "reply:r1", references: [], taxonomy: { productSurfaces: ["webhooks"], problemClasses: ["latency"] } });
    const changed = buildRetrievalQuery({ ticket, customerReplies: [{ id: "r2", ticketId: ticket.id, createdAt: "2026-01-01T01:00:00.000Z", body: "Still delayed" }], customerReplyWatermark: "reply:r1", references: [] });
    expect(base.queryText).toContain("Still delayed");
    expect(base.queryText).not.toContain("support response");
    expect(base.queryHash).not.toBe(changed.queryHash);
    expect(base.sourceRevision).toBe(7);
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
    expect(diagnostics).toEqual([{ code: "INDEX_INTEGRITY_ERROR", commandId: "cmd-corrupt" }]);
    await observer.close();
  });

  it("bounds traces by UTF-8 byte length rather than JavaScript character length", async () => {
    const resourceKey = `knowledge-article:${"é".repeat(40_000)}` as any;
    const observer = createRetrievalObserver({
      manager: { refresh: async () => undefined, close: async () => undefined } as any,
      store: {
        readSnapshot: () => ({ metadata: { schemaVersion: 2, representationVersion: REPRESENTATION_VERSION, generation: 1, lexicalGeneration: 1, semanticGeneration: 0, corpusHash: "", state: "degraded" }, resources: [{ key: resourceKey, type: "knowledge-article", sourceId: "emoji", contentHash: "hash", family: "article", linkedResourceKeys: [] }], lexical: { status: "used" }, lexicalMatches: [{ representationId: "emoji", resourceKey, score: -1, rank: 1 }], vectors: [] }),
        close: () => undefined,
      } as any,
      limits: { "knowledge-article": { lexical: 1, semantic: 1 }, "known-cause": { lexical: 1, semantic: 1 }, "diagnostic-playbook": { lexical: 1, semantic: 1 }, "resolved-ticket": { lexical: 1, semantic: 1 } },
    });
    await observer.observe({ queryText: "emoji", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-unicode");
    expect(observer.recent()[0]).toMatchObject({ truncated: true, result: { candidates: [] } });
    await observer.close();
  });

  it("retains the safe startup integrity reason in an unavailable-observer trace", async () => {
    const diagnostics: Array<{ code: string; commandId: string }> = [];
    const observer = (createUnavailableRetrievalObserver as any)({
      report: (diagnostic: { code: string; commandId: string }) => diagnostics.push(diagnostic),
      failureCode: "INDEX_INTEGRITY_ERROR",
    });
    await observer.observe({ queryText: "test", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-startup-corrupt");
    expect(observer.recent()[0]).toMatchObject({ failureCode: "INDEX_INTEGRITY_ERROR", result: { lexical: { status: "failed", reason: "index-integrity-error" }, semantic: { status: "failed", reason: "index-integrity-error" } } });
    expect(observer.recent()[0]!.result.metadata).toMatchObject({ schemaVersion: RETRIEVAL_SCHEMA_VERSION, representationVersion: REPRESENTATION_VERSION });
    expect(diagnostics).toEqual([{ code: "INDEX_INTEGRITY_ERROR", commandId: "cmd-startup-corrupt" }]);
    await observer.close();
  });

  it("projects B4 ranking from the completed B3 result without another retrieval or provider call", async () => {
    let refreshes = 0;
    let snapshots = 0;
    let providerCalls = 0;
    const resourceKey = "knowledge-article:shadow" as const;
    const model = { id: "shadow-model", revision: "1", dimensions: 2 };
    const observer = createRetrievalObserver({
      manager: { refresh: async () => { refreshes += 1; }, close: async () => undefined } as any,
      store: {
        readSnapshot: () => {
          snapshots += 1;
          return {
            metadata: { schemaVersion: 2, representationVersion: REPRESENTATION_VERSION, generation: 1, lexicalGeneration: 1, semanticGeneration: 0, corpusHash: "hash", model, state: "degraded" },
            resources: [{ key: resourceKey, type: "knowledge-article", sourceId: "shadow", contentHash: "content", family: "article", linkedResourceKeys: [] }],
            lexical: { status: "used" },
            lexicalMatches: [{ representationId: "shadow-representation", resourceKey, score: 0.1, rank: 7 }],
            vectors: [],
          };
        },
        close: () => undefined,
      } as any,
      limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } },
      provider: { model, embed: async () => { providerCalls += 1; return [[1, 0]]; } },
      ranking: { policy: { id: "lexical-only-v1", kind: "lexical-only" }, outputLimit: 1 },
    });

    await observer.observe({ queryText: "shadow", queryHash: "query", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-ranking");
    const trace = observer.recent()[0]!;
    expect(refreshes).toBe(1);
    expect(snapshots).toBe(1);
    expect(providerCalls).toBe(1);
    expect(trace.ranking).toMatchObject({
      status: "used",
      policy: { id: "lexical-only-v1", kind: "lexical-only" },
      truncated: false,
      byType: { "knowledge-article": { poolCount: 1, returnedCount: 1, memberships: [{ resourceKey, position: 1 }] } },
    });
    await observer.close();
  });

  it("records a ranking failure separately while retaining the valid B3 trace", async () => {
    const observer = createRetrievalObserver({
      manager: { refresh: async () => undefined, close: async () => undefined } as any,
      store: {
        readSnapshot: () => ({
          metadata: { schemaVersion: 2, representationVersion: REPRESENTATION_VERSION, generation: 1, lexicalGeneration: 1, semanticGeneration: 0, corpusHash: "hash", state: "degraded" },
          resources: [{ key: "knowledge-article:failure" as const, type: "knowledge-article", sourceId: "failure", contentHash: "content", family: "article", linkedResourceKeys: [] }],
          lexical: { status: "used" },
          lexicalMatches: [{ representationId: "failure-representation", resourceKey: "knowledge-article:failure" as const, score: 0.1, rank: 1 }],
          vectors: [],
        }),
        close: () => undefined,
      } as any,
      limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } },
      ranking: { policy: { id: "invalid-policy", kind: "invalid" } as any, outputLimit: 1 },
    });

    await observer.observe({ queryText: "failure", queryHash: "query", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-ranking-failure");
    expect(observer.recent()[0]).toMatchObject({ result: { candidates: [{ resourceKey: "knowledge-article:failure" }] }, ranking: { status: "failed", truncated: false } });
    await observer.close();
  });

  it("marks omitted B4 detail as truncated when the combined trace exceeds the byte budget", async () => {
    const resourceKey = `knowledge-article:${"é".repeat(40_000)}` as any;
    const observer = createRetrievalObserver({
      manager: { refresh: async () => undefined, close: async () => undefined } as any,
      store: {
        readSnapshot: () => ({
          metadata: { schemaVersion: 2, representationVersion: REPRESENTATION_VERSION, generation: 1, lexicalGeneration: 1, semanticGeneration: 0, corpusHash: "hash", state: "degraded" },
          resources: [{ key: resourceKey, type: "knowledge-article", sourceId: "large", contentHash: "content", family: "article", linkedResourceKeys: [] }],
          lexical: { status: "used" },
          lexicalMatches: [{ representationId: "large-representation", resourceKey, score: 0.1, rank: 1 }],
          vectors: [],
        }),
        close: () => undefined,
      } as any,
      limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } },
      ranking: { policy: { id: "lexical-only-v1", kind: "lexical-only" }, outputLimit: 5 },
    });

    await observer.observe({ queryText: "large", queryHash: "query", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-ranking-truncated");
    expect(observer.recent()[0]).toMatchObject({ truncated: true, result: { candidates: [] }, ranking: { status: "used", truncated: true, byType: { "knowledge-article": { memberships: [] } } } });
    await observer.close();
  });

  it("cancels active observation before closing retrieval resources", async () => {
    let aborted = false;
    let closed = false;
    const manager = {
      refresh: async (signal: AbortSignal) => await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("cancelled")); }, { once: true })),
      close: async () => { closed = true; },
    } as any;
    const observer = createRetrievalObserver({
      manager,
      store: { readSnapshot: () => { throw new Error("should not read after cancellation"); }, close: () => { closed = true; } } as any,
      limits: { "knowledge-article": { lexical: 1, semantic: 1 }, "known-cause": { lexical: 1, semantic: 1 }, "diagnostic-playbook": { lexical: 1, semantic: 1 }, "resolved-ticket": { lexical: 1, semantic: 1 } },
    });
    const pending = observer.observe({ queryText: "test", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-cancel");
    await observer.close();
    await expect(pending).resolves.toBeUndefined();
    expect(aborted).toBe(true);
    expect(closed).toBe(true);
  });
});
