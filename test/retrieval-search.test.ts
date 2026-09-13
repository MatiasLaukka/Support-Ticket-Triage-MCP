import { describe, expect, it } from "vitest";
import { cosine, makeFtsQuery, retrieve } from "../src/retrieval/search.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { hashRepresentation, hashResource, projectArticle } from "../src/retrieval/representations.js";

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

  it("excludes the ticket's own resolved-case memory from its query", async () => {
    const store = RetrievalStore.open(":memory:");
    store.initialize();
    const resolved = projectArticle({ id: "self", title: "Webhook resolved", tags: [], body: "Webhook secret rotation resolved." });
    const resource = { key: "resolved-ticket:TKT-0001" as const, type: "resolved-ticket" as const, sourceId: "TKT-0001", family: "resolved-ticket" as const, linkedResourceKeys: [] as const };
    const representations = resolved.representations.map((representation) => {
      const canonical = { ...representation, id: "resolved-ticket:TKT-0001:canonical:0", resourceKey: resource.key, kind: "canonical", ordinal: 0 };
      return { ...canonical, contentHash: hashRepresentation(canonical) };
    });
    const projected = { resource: { ...resource, contentHash: hashResource(resource, representations) }, representations };
    store.reconcile({ resources: [projected], unavailableFamilies: [] });
    const result = await retrieve({
      query: { queryText: "webhook secret", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] },
      store,
      limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } },
      signal: new AbortController().signal,
    });
    expect(result.candidates).toHaveLength(0);
    store.close();
  });

  it("reports partial semantic coverage as stale without querying the provider", async () => {
    const store = RetrievalStore.open(":memory:");
    store.initialize();
    const first = projectArticle({ id: "first", title: "First", tags: [], body: "Webhook signing" });
    const second = projectArticle({ id: "second", title: "Second", tags: [], body: "Webhook rotation" });
    store.reconcile({ resources: [first, second], unavailableFamilies: [] });
    const model = { id: "test", revision: "1", dimensions: 2 };
    store.configureModel(model);
    store.installVectors([{ representationId: first.representations[0]!.id, resourceKey: first.resource.key, contentHash: first.representations[0]!.contentHash, model, values: [1, 0] }]);
    let calls = 0;

    const result = await retrieve({
      query: { queryText: "webhook", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] },
      store,
      provider: { model, embed: async () => { calls += 1; return [[1, 0]]; } },
      limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } },
      signal: new AbortController().signal,
    });

    expect(result.lexical.status).toBe("used");
    expect(result.semantic).toEqual({ status: "stale", reason: "pending-vectors" });
    expect(calls).toBe(0);
    store.close();
  });
});
