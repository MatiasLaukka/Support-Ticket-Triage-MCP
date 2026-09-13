import { describe, expect, it } from "vitest";
import { IndexManager } from "../src/retrieval/index-manager.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { projectArticle } from "../src/retrieval/representations.js";

describe("retrieval index manager", () => {
  it("embeds pending representations once and refreshes lexical data", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "a", title: "A", tags: [], body: "Webhook signing" });
    let calls = 0;
    const manager = new IndexManager({
      store,
      load: async () => ({ resources: [article], unavailableFamilies: [] }),
      provider: { model: { id: "test", revision: "1", dimensions: 2 }, embed: async (texts) => { calls += 1; return texts.map(() => [1, 0]); } },
    });
    await manager.refresh(new AbortController().signal);
    await manager.refresh(new AbortController().signal);
    expect(calls).toBe(1);
    expect(store.readSnapshot('"webhook"').vectors).toHaveLength(1);
    await manager.close();
  });

  it("recovers its queue after a provider failure", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "a", title: "A", tags: [], body: "Webhook signing" });
    let fail = true;
    const manager = new IndexManager({ store, load: async () => ({ resources: [article], unavailableFamilies: [] }), provider: { model: { id: "test", revision: "1", dimensions: 2 }, embed: async () => { if (fail) { fail = false; throw new Error("provider"); } return [[1, 0]]; } } });
    await expect(manager.refresh(new AbortController().signal)).rejects.toThrow("provider");
    await expect(manager.refresh(new AbortController().signal)).resolves.toBeDefined();
    await manager.close();
  });

  it("rebuilds the complete projection atomically instead of treating it as a no-op refresh", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "a", title: "A", tags: [], body: "Webhook signing" });
    let includeArticle = true;
    let calls = 0;
    const manager = new IndexManager({
      store,
      load: async () => ({ resources: includeArticle ? [article] : [], unavailableFamilies: [] }),
      provider: { model: { id: "test", revision: "1", dimensions: 2 }, embed: async (texts) => { calls += 1; return texts.map(() => [1, 0]); } },
    });
    await manager.refresh(new AbortController().signal);
    await manager.rebuild(new AbortController().signal);
    expect(calls).toBe(2);
    includeArticle = false;
    await manager.rebuild(new AbortController().signal);
    expect(store.readSnapshot('"webhook"').resources).toHaveLength(0);
    await manager.close();
  });

  it("re-embeds the complete corpus after the embedding model revision changes", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "model-change", title: "Model change", tags: [], body: "Webhook signing" });
    let model: { id: string; revision: string; dimensions: number } = { id: "test-a", revision: "1", dimensions: 2 };
    let calls = 0;
    const provider = {
      get model() { return model; },
      embed: async (texts: readonly string[]) => { calls += 1; return texts.map(() => [1, 0]); },
    };
    const manager = new IndexManager({ store, load: async () => ({ resources: [article], unavailableFamilies: [] }), provider });
    await manager.refresh(new AbortController().signal);
    model = { id: "test-b", revision: "2", dimensions: 2 };
    await manager.refresh(new AbortController().signal);
    expect(calls).toBe(2);
    expect(store.readSnapshot('"webhook"').vectors[0]?.model).toEqual(model);
    await manager.close();
  });
});
