import { describe, expect, it } from "vitest";
import { RetrievalIntegrityError, RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { hashRepresentation, hashResource, projectArticle } from "../src/retrieval/representations.js";
import { projectLearnedCause } from "../src/retrieval/sources.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type Database from "better-sqlite3";
import { loadRetrievalV2Fixture, retrievalV2Fixture } from "./retrieval-fixtures.js";
import { RetrievalRepresentationVersionError } from "../src/retrieval/sqlite-store.js";

describe("retrieval store", () => {
  it("loads exact legacy SQL columns, validates original v2 hashes, and refuses normal snapshots", () => {
    const root = mkdtempSync(join(tmpdir(), "retrieval-v2-store-"));
    const store = loadRetrievalV2Fixture(join(root, "retrieval.sqlite"));
    try {
      const database = (store as unknown as { database: Database.Database }).database;
      for (const [table, rows] of Object.entries(retrievalV2Fixture.tables)) {
        const loaded = database.prepare(`SELECT * FROM ${table}`).all();
        expect(JSON.parse(JSON.stringify(loaded))).toEqual(rows);
      }
      expect(store.validateForRebuild()).toBe(2);
      expect(() => store.validate()).toThrow(RetrievalRepresentationVersionError);
      expect(() => store.readSnapshot('"paragraph"')).toThrow(RetrievalRepresentationVersionError);
      expect(() => store.validate()).toThrow(/npm run retrieval:index -- rebuild/);
      expect(store.metadata()).toMatchObject({ schemaVersion: 2, representationVersion: 2, semanticGeneration: 1 });
    } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
  });

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

  it("retains unavailable-family projections while excluding them from active retrieval", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const learned = projectLearnedCause({
      object: {
        id: "example",
        kind: "known-cause",
        name: "Cached approved learning",
        summary: "Cached approved learning",
        triggerPatterns: ["cached"],
        evidencePolicy: { mode: "none-required", rationale: "reviewed" },
        timeConstraints: [], diagnosticSteps: ["inspect"], fixSteps: [], verificationSteps: [],
        customerSafeExplanation: "Cached approved learning", operatorRationale: "reviewed", owner: "support", version: 1,
        supportingDiagnosisIds: [], supportingTicketIds: [], provenance: { source: "review", recordedAt: "2026-09-12T00:00:00.000Z" },
        status: "approved", approval: { approvedBy: "reviewer", approvedAt: "2026-09-12T00:00:00.000Z" }, learningGovernance: "legacy",
      },
      version: 1,
      learning: { maturity: "outcome-verified", health: "active", eligibleForReuse: true },
      eligibilitySource: "legacy-compatible",
    });
    db.reconcile({ resources: [learned], unavailableFamilies: [] });
    db.reconcile({ resources: [], unavailableFamilies: ["learned-known-cause"] });

    expect(db.readSnapshot('"cached"').resources).toEqual([]);
    const raw = (db as unknown as { database: { prepare(sql: string): { get(): { count: number } } } }).database;
    expect(raw.prepare("SELECT count(*) AS count FROM retrieval_resources").get().count).toBe(1);

    db.reconcile({ resources: [], unavailableFamilies: [] });
    expect(raw.prepare("SELECT count(*) AS count FROM retrieval_resources").get().count).toBe(0);
    db.close();
  });

  it("retains a cached resolved case only while its source is unavailable, then removes it after an authoritative empty read", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const key = "resolved-ticket:TKT-9001" as const;
    const representation = { id: `${key}:case`, resourceKey: key, kind: "case", ordinal: 0, title: "Resolved case", keywords: ["resolved"], lexicalText: "Resolved case", semanticText: "Resolved case" };
    const projected = {
      resource: { key, type: "resolved-ticket" as const, sourceId: "TKT-9001", family: "resolved-ticket" as const, linkedResourceKeys: [] as const },
      representations: [{ ...representation, contentHash: hashRepresentation(representation) }],
    };
    const resolved = { ...projected, resource: { ...projected.resource, contentHash: hashResource(projected.resource, projected.representations) } };
    db.reconcile({ resources: [resolved], unavailableFamilies: [] });
    db.reconcile({ resources: [], unavailableFamilies: ["resolved-ticket"] });
    const raw = (db as unknown as { database: { prepare(sql: string): { get(): { count: number } } } }).database;
    expect(raw.prepare("SELECT count(*) AS count FROM retrieval_resources WHERE resource_type='resolved-ticket'").get().count).toBe(1);
    db.reconcile({ resources: [], unavailableFamilies: [] });
    expect(raw.prepare("SELECT count(*) AS count FROM retrieval_resources WHERE resource_type='resolved-ticket'").get().count).toBe(0);
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
    expect(() => db.validate()).not.toThrow();
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
    db.reconcile({ resources: [], unavailableFamilies: [] });
    const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='corpusHash'").run("{");
    expect(() => db.validate()).toThrow();
    db.close();
  });

  it("rejects invalid bounded metadata instead of serving it as a normal snapshot", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='state'").run("bogus");
    expect(() => db.validate()).toThrow();
    expect(() => db.readSnapshot("")).toThrow();
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='state'").run("ready");
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='generation'").run("-1");
    expect(() => db.validate()).toThrow();
    db.close();
  });

  it("rejects impossible lexical and semantic generation ordering before serving a snapshot", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='generation'").run("1");
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='lexicalGeneration'").run("1");
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='semanticGeneration'").run("2");
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='state'").run("ready");
    expect(() => db.validate()).toThrow(RetrievalIntegrityError);
    expect(() => db.readSnapshot("")).toThrow(RetrievalIntegrityError);
    db.close();
  });

  it("rejects blank and whitespace-only persisted model identities before serving a snapshot", () => {
    for (const model of [
      { id: "", revision: "r1", dimensions: 2 },
      { id: "  ", revision: "r1", dimensions: 2 },
      { id: "model", revision: "", dimensions: 2 },
      { id: "model", revision: "\t", dimensions: 2 },
    ]) {
      const db = RetrievalStore.open(":memory:");
      db.initialize();
      db.configureModel({ id: "valid", revision: "r1", dimensions: 2 });
      const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
      raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='model'").run(JSON.stringify(model));
      expect(() => db.validate()).toThrow(RetrievalIntegrityError);
      expect(() => db.readSnapshot("")).toThrow(RetrievalIntegrityError);
      db.close();
    }
  });

  it("detects tampered canonical representation and FTS rows during validation", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const article = projectArticle({ id: "integrity", title: "Integrity", tags: [], body: "Canonical content" });
    db.reconcile({ resources: [article], unavailableFamilies: [] });
    const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_representations SET lexical_text='tampered' WHERE representation_id=?").run(article.representations[0]!.id);
    expect(() => db.validate()).toThrow();
    db.close();
  });

  it("detects FTS rows that no longer match their representation", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const article = projectArticle({ id: "fts-integrity", title: "FTS integrity", tags: [], body: "Canonical content" });
    db.reconcile({ resources: [article], unavailableFamilies: [] });
    const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_fts SET body='tampered' WHERE representation_id=?").run(article.representations[0]!.id);
    expect(() => db.validate()).toThrow();
    db.close();
  });

  it("rejects unknown unavailable source families during validation", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    db.reconcile({ resources: [], unavailableFamilies: [] });
    const raw = (db as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='unavailableFamilies'").run('["unsupported-family"]');
    expect(() => db.validate()).toThrow();
    expect(() => db.readSnapshot("")).toThrow();
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
    expect(() => db.readSnapshot('"stale"')).toThrow();
    expect(() => db.validate()).toThrow();
    db.close();
  });

  it("publishes a full rebuild atomically when replacement validation fails", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const original = projectArticle({ id: "original", title: "Original", tags: [], body: "Original content" });
    db.reconcile({ resources: [original], unavailableFamilies: [] });
    const replacement = projectArticle({ id: "replacement", title: "Replacement", tags: [], body: "Replacement content" });
    const malformed = { resource: replacement.resource, representations: [...replacement.representations, ...replacement.representations] };
    expect(() => db.replaceAll({ resources: [malformed], unavailableFamilies: [] }, [])).toThrow();
    expect(db.readSnapshot('"original"').resources.map(({ key }) => key)).toEqual(["knowledge-article:original"]);
    expect(db.readSnapshot('"replacement"').resources.map(({ key }) => key)).toEqual(["knowledge-article:original"]);
    db.close();
  });

  it("rejects incompatible model vectors during atomic publication", () => {
    const db = RetrievalStore.open(":memory:");
    db.initialize();
    const original = projectArticle({ id: "original-model", title: "Original", tags: [], body: "Original content" });
    db.reconcile({ resources: [original], unavailableFamilies: [] });
    db.configureModel({ id: "model-a", revision: "1", dimensions: 2 });
    const replacement = projectArticle({ id: "replacement-model", title: "Replacement", tags: [], body: "Replacement content" });
    expect(() => db.replaceAll({ resources: [replacement], unavailableFamilies: [] }, [{ representationId: replacement.representations[0]!.id, resourceKey: replacement.resource.key, contentHash: replacement.representations[0]!.contentHash, model: { id: "model-b", revision: "2", dimensions: 2 }, values: [1, 0] }])).toThrow();
    expect(db.readSnapshot('"original"').resources.map(({ key }) => key)).toEqual(["knowledge-article:original-model"]);
    db.close();
  });
});
