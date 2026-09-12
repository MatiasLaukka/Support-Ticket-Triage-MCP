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

  it("rejects invalid vectors and preserves model identity when unconfigured", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    expect(() => db.installVectors([{ representationId: "missing", resourceKey: "knowledge-article:x", contentHash: "bad", model: { id: "m", revision: "1", dimensions: 2 }, values: [0, 0] }])).toThrow();
    db.configureModel({ id: "m", revision: "1", dimensions: 2 });
    db.configureModel(undefined);
    expect(db.metadata().model).toEqual({ id: "m", revision: "1", dimensions: 2 });
    db.close();
  });
});
