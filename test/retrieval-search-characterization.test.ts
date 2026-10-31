import { expect, it } from "vitest";
import { retrieve } from "../src/retrieval/search.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { hashRepresentation, hashResource, projectArticle } from "../src/retrieval/representations.js";
import { EmbeddingProviderError } from "../src/retrieval/embedding-provider.js";
import type { Limits, ProjectedResource } from "../src/retrieval/types.js";

it("characterizes complete retrieval results across channels and failures", async () => {
  const store = RetrievalStore.open(":memory:");
  try {
    const a = projectArticle({ id: "a", title: "Same", tags: [], body: "webhook" });
    const b = projectArticle({ id: "b", title: "Same", tags: [], body: "webhook" });
    const source = projectArticle({ id: "cause", title: "Cause", tags: [], body: "webhook" });
    const resource = { key: "known-cause:cause" as const, type: "known-cause" as const, sourceId: "cause", sourceVersion: "v1", family: "static-known-cause" as const, linkedResourceKeys: [a.resource.key] };
    const representations = source.representations.map((item) => {
      const representation = { ...item, id: "known-cause:cause:section:0", resourceKey: resource.key };
      return { ...representation, contentHash: hashRepresentation(representation) };
    });
    const cause: ProjectedResource = { resource: { ...resource, contentHash: hashResource(resource, representations) }, representations };
    const model = { id: "synthetic", revision: "1", dimensions: 2 };
    store.reconcile({ resources: [b, a, cause], unavailableFamilies: [] });
    store.configureModel(model);
    store.installVectors([b, a].map((item) => ({ representationId: item.representations[0]!.id, resourceKey: item.resource.key, contentHash: item.representations[0]!.contentHash, model, values: [1, 0] })));
    const limits: Limits = { "knowledge-article": { lexical: 1, semantic: 2 }, "known-cause": { lexical: 1, semantic: 1 }, "diagnostic-playbook": { lexical: 1, semantic: 1 }, "resolved-ticket": { lexical: 1, semantic: 1 } };
    const signal = new AbortController().signal;
    const query = { queryText: "webhook", queryHash: "synthetic", ticketId: "SELF", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [{ resourceKey: cause.resource.key, channel: "deterministic-reference" as const, sourceId: "classifier", reason: "classifier-association" as const }, { resourceKey: "knowledge-article:missing" as const, channel: "deterministic-reference" as const, sourceId: "missing", reason: "classifier-association" as const }] };
    const combined = await retrieve({ query, store, limits, signal, provider: { model, embed: async () => [[1, 0]] } });
    const failed = await retrieve({ query, store, limits, signal, provider: { model, embed: async () => { throw new EmbeddingProviderError("PROVIDER_HTTP_ERROR", "synthetic"); } } });
    const cancelled = await retrieve({ query, store, limits, signal, provider: { model, embed: async () => { throw new EmbeddingProviderError("PROVIDER_CANCELLED", "synthetic"); } } });
    expect({ combined, failed, cancelled }).toMatchSnapshot();
  } finally {
    store.close();
  }
});
