import { describe, expect, it } from "vitest";
import { IndexManager } from "../src/retrieval/index-manager.js";
import { RetrievalIntegrityError, RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { projectArticle } from "../src/retrieval/representations.js";
import { EmbeddingProviderError } from "../src/retrieval/embedding-provider.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach } from "vitest";
import { loadRetrievalV2Fixture, retrievalV2Fixture } from "./retrieval-fixtures.js";

describe("supported version-2 rebuild", () => {
  let store: RetrievalStore;
  let manager: IndexManager | undefined;
  let root: string;
  const signal = () => new AbortController().signal;
  const raw = () => (store as unknown as { database: Database.Database }).database;
  const rows = () => Object.fromEntries(Object.keys(retrievalV2Fixture.tables).map((table) => [table, raw().prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
  function setup(provider?: ConstructorParameters<typeof IndexManager>[0]["provider"]) {
    root = mkdtempSync(join(tmpdir(), "retrieval-v2-upgrade-"));
    store = loadRetrievalV2Fixture(join(root, "retrieval.sqlite"));
    manager = new IndexManager({ store, load: async () => ({ resources: [projectArticle(retrievalV2Fixture.article)], unavailableFamilies: [] }), ...(provider ? { provider } : {}) });
    return manager;
  }
  afterEach(async () => { await manager?.close(); store?.close(); if (root) rmSync(root, { recursive: true, force: true }); });

  it("refuses refresh of genuine v2 before loading sources or changing rows", async () => {
    setup();
    const before = rows();
    let loaded = false;
    manager = new IndexManager({ store, load: async () => { loaded = true; throw new Error("must not load"); } });
    await expect(manager.refresh(signal())).rejects.toMatchObject({ code: "INDEX_UPGRADE_REQUIRED", storedVersion: 2, requiredVersion: 3 });
    expect(loaded).toBe(false);
    expect(rows()).toEqual(before);
  });

  it("explicitly rebuilds v2 from authoritative sources as lexical-only and reopens v3", async () => {
    const manager = setup();
    await expect(manager.rebuild(signal())).resolves.toMatchObject({ schemaVersion: 2, representationVersion: 3, generation: 2, lexicalGeneration: 2, semanticGeneration: 0 });
    expect(store.readSnapshot('"paragraph"').vectors).toEqual([]);
    expect(store.readSnapshot('"paragraph"').lexicalMatches).toHaveLength(1);
    expect(store.readSnapshot("").resources[0]!.contentHash).not.toBe(retrievalV2Fixture.provenance.originalResourceHash);
    store.close();
    store = RetrievalStore.open(join(root, "retrieval.sqlite"));
    expect(() => store.validate()).not.toThrow();
    expect(store.metadata().representationVersion).toBe(3);
  });

  it("publishes only replacement vectors and preserves no-op generation relationships", async () => {
    const manager = setup({ model: { id: "current", revision: "3", dimensions: 2 }, embed: async (texts) => texts.map(() => [0, 1]) });
    const rebuilt = await manager.rebuild(signal());
    expect(rebuilt).toMatchObject({ representationVersion: 3, generation: 2, lexicalGeneration: 2, semanticGeneration: 2 });
    expect(store.readSnapshot("").vectors).toMatchObject([{ model: { id: "current" }, values: [0, 1] }]);
    expect(await manager.refresh(signal())).toEqual(rebuilt);
  });

  it("preserves all v2 rows on provider failure and permits an explicit lexical-only retry", async () => {
    const manager = setup({ model: { id: "current", revision: "3", dimensions: 2 }, embed: async () => { throw new EmbeddingProviderError("PROVIDER_UNREACHABLE", "offline"); } });
    const before = rows();
    await expect(manager.rebuild(signal())).rejects.toMatchObject({ code: "PROVIDER_UNREACHABLE" });
    expect(rows()).toEqual(before);
    await manager.close();
    const lexical = new IndexManager({ store, load: async () => ({ resources: [projectArticle(retrievalV2Fixture.article)], unavailableFamilies: [] }) });
    try { expect(await lexical.rebuild(signal())).toMatchObject({ representationVersion: 3, semanticGeneration: 0 }); } finally { await lexical.close(); }
  });

  it.each([
    "UPDATE retrieval_representations SET content_hash='" + "a".repeat(64) + "'",
    "UPDATE retrieval_index_metadata SET value='2' WHERE key='semanticGeneration'",
    "UPDATE retrieval_index_metadata SET value='4' WHERE key='representationVersion'",
    "UPDATE retrieval_index_metadata SET value='broken' WHERE key='representationVersion'",
    "UPDATE retrieval_index_metadata SET value='2.0' WHERE key='representationVersion'",
    "UPDATE retrieval_index_metadata SET value='2e0' WHERE key='representationVersion'",
  ])("rejects corrupt or unsupported legacy data before loading: %s", async (sql) => {
    setup();
    raw().exec(sql);
    const before = rows();
    let loaded = false;
    manager = new IndexManager({ store, load: async () => { loaded = true; return { resources: [], unavailableFamilies: [] }; } });
    await expect(manager.rebuild(signal())).rejects.toBeInstanceOf(RetrievalIntegrityError);
    expect(loaded).toBe(false);
    expect(rows()).toEqual(before);
  });

  it("rolls back rows, FTS, vectors and metadata when publication validation fails", async () => {
    const manager = setup();
    const before = rows();
    raw().exec("CREATE TRIGGER corrupt_publication AFTER INSERT ON retrieval_resources BEGIN UPDATE retrieval_resources SET content_hash='bad' WHERE resource_key=NEW.resource_key; END");
    await expect(manager.rebuild(signal())).rejects.toBeInstanceOf(RetrievalIntegrityError);
    expect(rows()).toEqual(before);
  });

  it("refuses to erase unavailable cached learned sources during a v2 upgrade", async () => {
    setup();
    // Captured with baseline 5c7bab5 projectLearnedCause; these are original v2 hashes.
    raw().prepare("INSERT INTO retrieval_resources(resource_key,resource_type,source_id,source_version,content_hash,metadata_json) VALUES(?,?,?,?,?,?)").run("known-cause:learned/cached", "known-cause", "cached", "1", "dfa7b53c23e264c2f0f907b20c126bf3cf4a8eb2acdb89ba9c77729f8960abe2", '{"family":"learned-known-cause","linkedResourceKeys":[]}');
    const lexical = "Cached cause\ncache\nCached summary\ncache\nCheck cache\nRefresh cache";
    raw().prepare("INSERT INTO retrieval_representations(representation_id,resource_key,kind,ordinal,title,heading,keywords_json,lexical_text,semantic_text,content_hash) VALUES(?,?,?,?,?,?,?,?,?,?)").run("known-cause:learned/cached:canonical:0", "known-cause:learned/cached", "canonical", 0, "Cached cause", null, '["cache"]', lexical, "Cached cause\n\nCached summary\ncache\nCheck cache\nRefresh cache", "8cf602a3555ef540d4105c6506fe1ef0c01bb60daab428674059b2fe897a226e");
    raw().prepare("INSERT INTO retrieval_fts(representation_id,resource_key,title,heading,body,keywords) VALUES(?,?,?,?,?,?)").run("known-cause:learned/cached:canonical:0", "known-cause:learned/cached", "Cached cause", "", lexical, "cache");
    raw().exec("UPDATE retrieval_index_metadata SET value='0' WHERE key='semanticGeneration'; UPDATE retrieval_index_metadata SET value='degraded' WHERE key='state'; UPDATE retrieval_index_metadata SET value='972276157be466a60f639707c78c8bf9efb3530bd5cc37e5a2cbfafe9f8f6d8b' WHERE key='corpusHash'");
    expect(store.validateForRebuild()).toBe(2);
    const before = rows();
    manager = new IndexManager({ store, load: async () => ({ resources: [projectArticle(retrievalV2Fixture.article)], unavailableFamilies: ["learned-known-cause"] }) });
    await expect(manager.rebuild(signal())).rejects.toMatchObject({ code: "INDEX_UPGRADE_SOURCE_UNAVAILABLE" });
    expect(rows()).toEqual(before);
  });
});

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

  it("keeps lexical retrieval available and retries pending vectors after a provider failure", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "a", title: "A", tags: [], body: "Webhook signing" });
    let fail = true;
    const manager = new IndexManager({ store, load: async () => ({ resources: [article], unavailableFamilies: [] }), provider: { model: { id: "test", revision: "1", dimensions: 2 }, embed: async () => { if (fail) { fail = false; throw new EmbeddingProviderError("PROVIDER_UNREACHABLE", "provider"); } return [[1, 0]]; } } });
    await expect(manager.refresh(new AbortController().signal)).resolves.toMatchObject({ state: "degraded", semanticGeneration: 0 });
    expect(store.readSnapshot('"webhook"').lexicalMatches).toHaveLength(1);
    expect(store.readSnapshot('"webhook"').vectors).toHaveLength(0);
    await expect(manager.refresh(new AbortController().signal)).resolves.toBeDefined();
    expect(store.readSnapshot('"webhook"').vectors).toHaveLength(1);
    await manager.close();
  });

  it("propagates a malformed store vector instead of treating it as provider degradation", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "bad-vector", title: "Bad vector", tags: [], body: "Webhook signing" });
    const manager = new IndexManager({ store, load: async () => ({ resources: [article], unavailableFamilies: [] }), provider: { model: { id: "test", revision: "1", dimensions: 2 }, embed: async () => [[0, 0]] } });
    await expect(manager.refresh(new AbortController().signal)).rejects.toBeInstanceOf(RetrievalIntegrityError);
    await manager.close();
  });

  it("rethrows unexpected embedding failures instead of reporting a degraded provider state", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "unexpected", title: "Unexpected", tags: [], body: "Webhook signing" });
    const manager = new IndexManager({ store, load: async () => ({ resources: [article], unavailableFamilies: [] }), provider: { model: { id: "test", revision: "1", dimensions: 2 }, embed: async () => { throw new Error("unexpected embedding failure"); } } });
    await expect(manager.refresh(new AbortController().signal)).rejects.toThrow("unexpected embedding failure");
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

  it("preserves the active model and vectors when a rebuild embedding attempt fails", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "atomic-model", title: "Atomic model", tags: [], body: "Webhook signing" });
    let model: { id: string; revision: string; dimensions: number } = { id: "model-a", revision: "1", dimensions: 2 };
    let failRebuild = false;
    const provider = {
      get model() { return model; },
      embed: async (texts: readonly string[]) => {
        if (failRebuild) throw new Error("provider unavailable");
        return texts.map(() => [1, 0]);
      },
    };
    const manager = new IndexManager({ store, load: async () => ({ resources: [article], unavailableFamilies: [] }), provider });
    await manager.refresh(new AbortController().signal);
    model = { id: "model-b", revision: "2", dimensions: 2 };
    failRebuild = true;

    await expect(manager.rebuild(new AbortController().signal)).rejects.toThrow("provider unavailable");
    expect(store.metadata().model).toEqual({ id: "model-a", revision: "1", dimensions: 2 });
    expect(store.readSnapshot('"webhook"').vectors[0]?.model).toEqual({ id: "model-a", revision: "1", dimensions: 2 });
    await manager.close();
  });
});
