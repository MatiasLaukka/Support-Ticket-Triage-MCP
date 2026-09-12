import { describe, expect, it } from "vitest";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { projectArticle } from "../src/retrieval/representations.js";

describe("retrieval store", () => {
  it("uses FTS5 and removes changed representations", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const a = projectArticle({ id: "rotation", title: "Rotation", tags: [], body: "Old signing secret" });
    db.reconcile({ resources: [a], unavailableFamilies: [] });
    expect(db.readSnapshot('"signing"').lexicalMatches).toHaveLength(1);
    const b = projectArticle({ id: "rotation", title: "Rotation", tags: [], body: "New delivery delay" });
    db.reconcile({ resources: [b], unavailableFamilies: [] });
    expect(db.readSnapshot('"signing"').lexicalMatches).toHaveLength(0);
    db.close();
  });

  it("does not advance generation for an unchanged reconciliation", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const article = projectArticle({ id: "same", title: "Same", tags: [], body: "Stable content" });
    db.reconcile({ resources: [article], unavailableFamilies: [] });
    const before = db.metadata();
    db.reconcile({ resources: [article], unavailableFamilies: [] });
    expect(db.metadata().generation).toBe(before.generation);
    expect(db.metadata().lexicalGeneration).toBe(before.lexicalGeneration);
    db.close();
  });

  it("excludes vectors after the configured embedding model changes", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const article = projectArticle({ id: "model", title: "Model", tags: [], body: "Compatible vector" });
    db.reconcile({ resources: [article], unavailableFamilies: [] });
    db.configureModel({ id: "model-a", revision: "r1", dimensions: 2 });
    db.installVectors([{ representationId: article.representations[0]!.id, resourceKey: article.resource.key, contentHash: article.representations[0]!.contentHash, model: { id: "model-a", revision: "r1", dimensions: 2 }, values: [1, 0] }]);
    db.configureModel({ id: "model-b", revision: "r2", dimensions: 2 });
    expect(db.readSnapshot('"compatible"').vectors).toHaveLength(0);
    db.close();
  });

  it("rejects invalid vectors and preserves model identity when unconfigured", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    expect(() => db.installVectors([{ representationId: "missing", resourceKey: "knowledge-article:x", contentHash: "bad", model: { id: "m", revision: "1", dimensions: 2 }, values: [0, 0] }])).toThrow();
    db.configureModel({ id: "m", revision: "1", dimensions: 2 });
    db.configureModel(undefined);
    expect(db.metadata().model).toEqual({ id: "m", revision: "1", dimensions: 2 });
    db.close();
  });

  it("rejects malformed persisted metadata during validation", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='corpusHash'").run("{");
    expect(() => db.validate()).toThrow();
    db.close();
  });

  it("excludes stale ready vectors and surfaces their corruption to validation", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const article = projectArticle({ id: "stale", title: "Stale", tags: [], body: "Stale vector" });
    db.reconcile({ resources: [article], unavailableFamilies: [] });
    db.configureModel({ id: "model", revision: "1", dimensions: 2 });
    db.installVectors([{ representationId: article.representations[0]!.id, resourceKey: article.resource.key, contentHash: article.representations[0]!.contentHash, model: { id: "model", revision: "1", dimensions: 2 }, values: [1, 0] }]);
    const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_embeddings SET content_hash=? WHERE representation_id=?").run("stale-hash", article.representations[0]!.id);
    expect(db.readSnapshot('"stale"').vectors).toHaveLength(0);
    expect(() => db.validate()).toThrow();
    db.close();
  });
});
