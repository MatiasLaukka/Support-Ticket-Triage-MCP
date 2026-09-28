import { describe, expect, it } from "vitest";
import { createRetrievalObserver } from "../src/retrieval/stage.js";
import type { RetrievalExecution } from "../src/retrieval/execution.js";
import { REPRESENTATION_VERSION } from "../src/retrieval/representations.js";

const query = {
  queryText: "committed evaluation",
  queryHash: "committed-query-hash",
  ticketId: "TKT-0001",
  sourceRevision: 1,
  customerReplyWatermark: "none",
  queryTruncated: false,
  references: [],
} as const;

describe("retrieval execution capture hook", () => {
  it("exposes the same full execution after the unchanged retrieval trace is recorded", async () => {
    const resourceKey = "knowledge-article:hook" as const;
    const observer = createRetrievalObserver({
      manager: { refresh: async () => undefined, close: async () => undefined } as any,
      store: {
        readSnapshot: () => ({
          metadata: {
            schemaVersion: 2,
            representationVersion: REPRESENTATION_VERSION,
            generation: 1,
            lexicalGeneration: 1,
            semanticGeneration: 0,
            corpusHash: "hook-corpus",
            state: "degraded",
          },
          resources: [{ key: resourceKey, type: "knowledge-article", sourceId: "hook", contentHash: "hook-content", family: "article", linkedResourceKeys: [] }],
          lexical: { status: "used" },
          lexicalMatches: [{ representationId: "hook-representation", resourceKey, score: 0.25, rank: 1 }],
          vectors: [],
        }),
        close: () => undefined,
      } as any,
      limits: {
        "knowledge-article": { lexical: 5, semantic: 5 },
        "known-cause": { lexical: 5, semantic: 5 },
        "diagnostic-playbook": { lexical: 5, semantic: 5 },
        "resolved-ticket": { lexical: 5, semantic: 5 },
      },
    });

    let receivedQuery: unknown;
    let receivedExecution: RetrievalExecution | undefined;
    await observer.observe(query, "cmd-hybrid-hook", (actualQuery, execution) => {
      receivedQuery = actualQuery;
      receivedExecution = execution;
      expect(observer.recent()).toHaveLength(1);
    });

    expect(receivedQuery).toBe(query);
    expect(receivedExecution).toMatchObject({
      retrieval: {
        metadata: { corpusHash: "hook-corpus", generation: 1 },
        candidates: [{ resourceKey }],
      },
      ranking: { status: "not-requested" },
    });
    expect(observer.recent()[0]).toMatchObject({
      commandId: "cmd-hybrid-hook",
      queryHash: "committed-query-hash",
      result: { metadata: { corpusHash: "hook-corpus" }, candidates: [{ resourceKey }] },
    });
    await observer.close();
  });
});
