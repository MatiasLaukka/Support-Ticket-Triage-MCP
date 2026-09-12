import { describe, expect, it } from "vitest";
import { cosine, makeFtsQuery, retrieve } from "../src/retrieval/search.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { projectArticle } from "../src/retrieval/representations.js";

describe("retrieval search", () => {
  it("quotes literal FTS tokens and computes exact cosine", () => {
    expect(makeFtsQuery('webhook OR "secret"')).toBe('"webhook" OR "or" OR "secret"');
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("aggregates several matching chunks into one article and preserves references", async () => {
    const store = RetrievalStore.open(":memory:");
    store.initialize();
    const article = projectArticle({ id: "a", title: "Webhook guide", tags: [], body: "Webhook signing.\n\n## Rotation\n\nSecret rotation." });
    store.reconcile({ resources: [article], unavailableFamilies: [] });
    const result = await retrieve({ query: { queryText: "webhook secret", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [{ resourceKey: "knowledge-article:a", channel: "deterministic-reference", sourceId: "a", reason: "classifier-association" }] }, store, limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } }, signal: new AbortController().signal });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.lexical?.matches.length).toBe(2);
    expect(result.candidates[0]!.deterministicReferences).toHaveLength(1);
    store.close();
  });
});
