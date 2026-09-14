import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { hashResourceForVersion, hashRepresentationForVersion, hashText, REPRESENTATION_VERSION } from "./representations.js";
import type { IndexMetadata, ModelIdentity, Representation, Resource, ResourceKey, ResourceType, SearchSnapshot, SourceSnapshot, TaxonomyMetadata } from "./types.js";

export const RETRIEVAL_SCHEMA_VERSION = 2;
const SCHEMA_VERSION = RETRIEVAL_SCHEMA_VERSION;
const UNAVAILABLE_FAMILIES = new Set(["learned-known-cause", "resolved-ticket"]);
const RESOURCE_TYPES = new Set<ResourceType>(["knowledge-article", "known-cause", "diagnostic-playbook", "resolved-ticket"]);
const RESOURCE_FAMILIES = new Set<Resource["family"]>(["article", "static-known-cause", "learned-known-cause", "playbook", "resolved-ticket"]);
const INDEX_STATES = new Set<IndexMetadata["state"]>(["ready", "degraded", "rebuilding", "stale", "unavailable"]);

export class RetrievalIntegrityError extends Error {
  readonly code = "INDEX_INTEGRITY_ERROR";
}

export class RetrievalRepresentationVersionError extends Error {
  readonly code = "INDEX_UPGRADE_REQUIRED";
  constructor(readonly storedVersion: number, readonly requiredVersion: number) {
    super(`Retrieval representation version ${storedVersion} requires version ${requiredVersion}. Run npm run retrieval:index -- rebuild. This maintenance command loads static sources only and refuses to erase unavailable cached learned or resolved sources.`);
    this.name = "RetrievalRepresentationVersionError";
  }
}

export class RetrievalUpgradeSourceUnavailableError extends Error {
  readonly code = "INDEX_UPGRADE_SOURCE_UNAVAILABLE";
  constructor() {
    super("Retrieval rebuild requires authoritative learned/resolved sources that are unavailable. Cached rows were preserved. Restore those sources and rebuild with an all-source loader; the maintenance CLI loads static sources only.");
    this.name = "RetrievalUpgradeSourceUnavailableError";
  }
}

type ResourceRow = {
  resource_key: string;
  resource_type: string;
  source_id: string;
  source_version: string | null;
  content_hash: string;
  metadata_json: string;
};

type RepresentationRow = {
  representation_id: string;
  resource_key: string;
  kind: string;
  ordinal: number;
  title: string;
  heading: string | null;
  keywords_json: string;
  lexical_text: string;
  semantic_text: string;
  content_hash: string;
};

export class RetrievalStore {
  private initialized = false;
  private closed = false;

  private constructor(private readonly database: Database.Database) {}

  static open(path: string): RetrievalStore {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    return new RetrievalStore(new Database(path));
  }

  initialize(): void {
    this.assertOpen();
    if (this.initialized) return;
    const version = Number(this.database.pragma("user_version", { simple: true }));
    if (version > SCHEMA_VERSION) throw new RetrievalIntegrityError("Retrieval schema is newer than this runtime.");
    this.database.pragma("foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS retrieval_resources (
        resource_key TEXT PRIMARY KEY,
        resource_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_version TEXT,
        content_hash TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS retrieval_representations (
        representation_id TEXT PRIMARY KEY,
        resource_key TEXT NOT NULL REFERENCES retrieval_resources(resource_key) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        title TEXT NOT NULL,
        heading TEXT,
        keywords_json TEXT NOT NULL,
        lexical_text TEXT NOT NULL,
        semantic_text TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        UNIQUE(resource_key, kind, ordinal)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS retrieval_fts USING fts5(
        representation_id UNINDEXED, resource_key UNINDEXED, title, heading, body, keywords
      );
      CREATE TABLE IF NOT EXISTS retrieval_embeddings (
        representation_id TEXT PRIMARY KEY REFERENCES retrieval_representations(representation_id) ON DELETE CASCADE,
        model_id TEXT NOT NULL,
        model_revision TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vector_blob BLOB NOT NULL,
        content_hash TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS retrieval_index_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = 2;
    `);
    if (version > 0 && version < SCHEMA_VERSION) {
      this.database.exec("DELETE FROM retrieval_fts; DELETE FROM retrieval_embeddings; DELETE FROM retrieval_representations; DELETE FROM retrieval_resources; DELETE FROM retrieval_index_metadata;");
    }
    if (!this.database.prepare("SELECT 1 FROM retrieval_index_metadata WHERE key='schemaVersion'").get()) {
      this.writeMetadata({ schemaVersion: SCHEMA_VERSION, representationVersion: REPRESENTATION_VERSION, generation: 0, lexicalGeneration: 0, semanticGeneration: 0, corpusHash: "", state: "unavailable" });
    }
    this.initialized = true;
  }

  configureModel(model: ModelIdentity | undefined): boolean {
    this.assertReady();
    if (model === undefined) return false;
    const current = this.metadata().model;
    if (current && current.id === model.id && current.revision === model.revision && current.dimensions === model.dimensions) return false;
    this.database.prepare("UPDATE retrieval_embeddings SET status='stale' WHERE model_id != ? OR model_revision != ? OR dimensions != ?").run(model.id, model.revision, model.dimensions);
    this.setMeta("model", JSON.stringify(model));
    this.setMeta("semanticGeneration", "0");
    this.setMeta("state", "degraded");
    return true;
  }

  metadata(): IndexMetadata {
    this.assertReady();
    const values = Object.fromEntries((this.database.prepare("SELECT key,value FROM retrieval_index_metadata").all() as { key: string; value: string }[]).map(({ key, value }) => [key, value]));
    let model: ModelIdentity | undefined;
    try { model = values.model ? JSON.parse(values.model) as ModelIdentity : undefined; } catch { throw new RetrievalIntegrityError("Retrieval model metadata is invalid."); }
    return { schemaVersion: Number(values.schemaVersion ?? SCHEMA_VERSION), representationVersion: Number(values.representationVersion ?? REPRESENTATION_VERSION), generation: Number(values.generation ?? 0), lexicalGeneration: Number(values.lexicalGeneration ?? 0), semanticGeneration: Number(values.semanticGeneration ?? 0), corpusHash: values.corpusHash ?? "", state: (values.state as IndexMetadata["state"]) ?? "unavailable", ...(model ? { model } : {}) };
  }

  reconcile(snapshot: SourceSnapshot): readonly Representation[] {
    this.assertReady();
    const nextHash = corpusHash(snapshot);
    const oldUnavailable = this.database.prepare("SELECT value FROM retrieval_index_metadata WHERE key='unavailableFamilies'").get() as { value?: string } | undefined;
    if (this.metadata().corpusHash === nextHash && (oldUnavailable?.value ?? "[]") === JSON.stringify(snapshot.unavailableFamilies)) return this.pendingRepresentations();
    return this.database.transaction(() => this.applySnapshot(snapshot, nextHash))();
  }

  installVectors(rows: readonly SearchSnapshot["vectors"][number][]): void { this.assertReady(); this.database.transaction(() => this.applyVectors(rows))(); }

  replaceAll(snapshot: SourceSnapshot, vectors: readonly SearchSnapshot["vectors"][number][], model?: ModelIdentity): void {
    this.assertReady();
    this.validateForRebuild();
    this.assertRebuildSourcesAvailable(snapshot);
    const nextHash = corpusHash(snapshot);
    this.database.transaction(() => {
      this.database.exec("DELETE FROM retrieval_fts; DELETE FROM retrieval_embeddings; DELETE FROM retrieval_representations; DELETE FROM retrieval_resources;");
      if (model) this.setMeta("model", JSON.stringify(model));
      this.setMeta("representationVersion", String(REPRESENTATION_VERSION));
      this.applySnapshot(snapshot, nextHash);
      this.applyVectors(vectors);
      if (vectors.length === 0) this.setMeta("semanticGeneration", "0");
      this.validate();
    })();
  }

  assertRebuildSourcesAvailable(snapshot: SourceSnapshot): void {
    this.assertReady();
    const unavailable = new Set(snapshot.unavailableFamilies);
    for (const row of this.database.prepare("SELECT metadata_json FROM retrieval_resources").all() as { metadata_json: string }[]) {
      if (unavailable.has(parseResourceMetadata(row.metadata_json).family as SourceSnapshot["unavailableFamilies"][number])) {
        throw new RetrievalUpgradeSourceUnavailableError();
      }
    }
  }

  readSnapshot(ftsQuery: string): SearchSnapshot {
    this.assertReady();
    this.validate();
    return this.database.transaction(() => {
      const metadata = this.metadata();
      const unavailableRow = this.database.prepare("SELECT value FROM retrieval_index_metadata WHERE key='unavailableFamilies'").get() as { value?: string } | undefined;
      const unavailable = parseUnavailableFamilies(unavailableRow?.value ?? "[]");
      const resources = (this.database.prepare("SELECT resource_key,resource_type,source_id,source_version,content_hash,metadata_json FROM retrieval_resources ORDER BY resource_type,resource_key").all() as ResourceRow[])
        .map((row) => {
          let meta: Record<string, unknown>;
          try { meta = JSON.parse(row.metadata_json) as Record<string, unknown>; } catch { throw new RetrievalIntegrityError("Resource metadata is invalid."); }
          return { key: row.resource_key, type: row.resource_type, sourceId: row.source_id, ...(row.source_version ? { sourceVersion: row.source_version } : {}), contentHash: row.content_hash, ...meta } as Resource;
        })
        .filter((resource) => !unavailable.has(resource.family));
      let lexical: SearchSnapshot["lexical"] = { status: "used" };
      let lexicalMatches: SearchSnapshot["lexicalMatches"] = [];
      if (ftsQuery) {
        try {
          const rows = this.database.prepare("SELECT representation_id,resource_key,bm25(retrieval_fts) AS score FROM retrieval_fts WHERE retrieval_fts MATCH ? ORDER BY score ASC, resource_key, representation_id").all(ftsQuery) as { representation_id: string; resource_key: string; score: number }[];
          lexicalMatches = rows.map((row, rank) => ({ representationId: row.representation_id, resourceKey: row.resource_key as SearchSnapshot["lexicalMatches"][number]["resourceKey"], score: row.score, rank: rank + 1 })).filter((match) => resources.some((resource) => resource.key === match.resourceKey));
        } catch (error) {
          if (isSharedFtsFailure(error)) throw new RetrievalIntegrityError("Retrieval FTS snapshot is unavailable.");
          lexical = { status: "failed", reason: "fts-query-error" };
        }
      }
      const vectors = (this.database.prepare("SELECT e.representation_id,e.model_id,e.model_revision,e.dimensions,e.vector_blob,e.content_hash,r.content_hash AS representation_hash,r.resource_key FROM retrieval_embeddings e JOIN retrieval_representations r ON r.representation_id=e.representation_id WHERE e.status='ready'").all() as any[]).flatMap((row) => {
        const resource = resources.find((item) => item.key === row.resource_key);
        if (!resource || !metadata.model || row.content_hash !== row.representation_hash || row.model_id !== metadata.model.id || row.model_revision !== metadata.model.revision || row.dimensions !== metadata.model.dimensions) return [];
        if (row.vector_blob.byteLength !== row.dimensions * 4) throw new RetrievalIntegrityError("Vector byte length is invalid.");
        const values = Array.from(new Float32Array(row.vector_blob.buffer, row.vector_blob.byteOffset, row.vector_blob.byteLength / 4));
        if (values.some((value) => !Number.isFinite(value)) || values.every((value) => value === 0)) throw new RetrievalIntegrityError("Stored vector is invalid.");
        return [{ representationId: row.representation_id, resourceKey: row.resource_key, contentHash: row.content_hash, model: { id: row.model_id, revision: row.model_revision, dimensions: row.dimensions }, values }];
      });
      return { metadata, resources, lexical, lexicalMatches, vectors };
    })();
  }

  validate(): void {
    const storedVersion = this.validateForRebuild();
    if (storedVersion !== REPRESENTATION_VERSION) throw new RetrievalRepresentationVersionError(storedVersion, REPRESENTATION_VERSION);
  }

  validateForRebuild(): 2 | 3 {
    this.assertReady();
    try {
      const integrity = this.database.prepare("PRAGMA integrity_check").get() as { integrity_check?: string };
      if (integrity.integrity_check !== "ok") throw new Error();
      const metadata = this.database.prepare("SELECT key,value FROM retrieval_index_metadata").all() as { key: string; value: string }[];
      const values = new Map(metadata.map((row) => [row.key, row.value]));
      for (const key of ["schemaVersion", "representationVersion", "generation", "lexicalGeneration", "semanticGeneration"]) if (!Number.isInteger(Number(values.get(key))) || Number(values.get(key)) < 0) throw new Error();
      if (Number(values.get("lexicalGeneration")) !== Number(values.get("generation")) || Number(values.get("semanticGeneration")) > Number(values.get("generation"))) throw new Error();
      const storedVersion = Number(values.get("representationVersion"));
      if (!["2", "3"].includes(values.get("representationVersion") ?? "")) throw new Error();
      if (Number(values.get("schemaVersion")) !== SCHEMA_VERSION || (storedVersion !== 2 && storedVersion !== 3)) throw new Error();
      if (!INDEX_STATES.has(values.get("state") as IndexMetadata["state"])) throw new Error();
      if (values.get("corpusHash") !== "" && !/^[0-9a-f]{64}$/.test(values.get("corpusHash") ?? "")) throw new Error();
      let configuredModel: ModelIdentity | undefined;
      if (values.has("model")) {
        const parsedModel = JSON.parse(values.get("model")!) as Partial<ModelIdentity>;
        if (typeof parsedModel.id !== "string" || !parsedModel.id.trim() || typeof parsedModel.revision !== "string" || !parsedModel.revision.trim() || typeof parsedModel.dimensions !== "number" || !Number.isInteger(parsedModel.dimensions) || parsedModel.dimensions <= 0) throw new Error();
        configuredModel = parsedModel as ModelIdentity;
      }
      parseUnavailableFamilies(values.get("unavailableFamilies") ?? "[]");
      const representations = new Map<string, RepresentationRow[]>();
      for (const row of this.database.prepare("SELECT representation_id,resource_key,kind,ordinal,title,heading,keywords_json,lexical_text,semantic_text,content_hash FROM retrieval_representations ORDER BY resource_key,representation_id").all() as RepresentationRow[]) {
        const representation = representationFromRow(row);
        const { contentHash, ...canonical } = representation;
        if (contentHash !== hashRepresentationForVersion(canonical, storedVersion)) throw new Error();
        const entries = representations.get(row.resource_key) ?? [];
        entries.push(row);
        representations.set(row.resource_key, entries);
      }
      const resourceRows = this.database.prepare("SELECT resource_key,resource_type,source_id,source_version,content_hash,metadata_json FROM retrieval_resources ORDER BY resource_key").all() as ResourceRow[];
      for (const row of resourceRows) {
        const metadata = parseResourceMetadata(row.metadata_json);
        if (!RESOURCE_TYPES.has(row.resource_type as ResourceType) || !isResourceKey(row.resource_key) || !row.resource_key.startsWith(`${row.resource_type}:`) || !row.source_id || !/^[0-9a-f]{64}$/.test(row.content_hash)) throw new Error();
        const resource = { key: row.resource_key as ResourceKey, type: row.resource_type as ResourceType, sourceId: row.source_id, ...(row.source_version === null ? {} : { sourceVersion: row.source_version }), family: metadata.family, linkedResourceKeys: metadata.linkedResourceKeys, ...(metadata.taxonomy ? { taxonomy: metadata.taxonomy } : {}) };
        const rows = representations.get(row.resource_key) ?? [];
        if (rows.length === 0 || row.content_hash !== hashResourceForVersion(resource, rows.map(({ representation_id, content_hash }) => ({ id: representation_id, contentHash: content_hash })), storedVersion)) throw new Error();
      }
      for (const row of this.database.prepare("SELECT e.model_id,e.model_revision,e.dimensions,e.vector_blob,e.content_hash,r.content_hash AS representation_hash FROM retrieval_embeddings e JOIN retrieval_representations r ON r.representation_id=e.representation_id WHERE e.status='ready'").all() as any[]) {
        const model = configuredModel;
        if (!Number.isInteger(row.dimensions) || row.dimensions <= 0 || row.vector_blob.byteLength !== row.dimensions * 4 || row.content_hash !== row.representation_hash || model === undefined || row.model_id !== model.id || row.model_revision !== model.revision || row.dimensions !== model.dimensions) throw new Error();
        const vector = Array.from(new Float32Array(row.vector_blob.buffer, row.vector_blob.byteOffset, row.vector_blob.byteLength / 4));
        if (vector.some((value) => !Number.isFinite(value)) || vector.every((value) => value === 0)) throw new Error();
      }
      const orphan = this.database.prepare("SELECT count(*) AS count FROM retrieval_representations r LEFT JOIN retrieval_resources s ON s.resource_key=r.resource_key WHERE s.resource_key IS NULL").get() as { count: number };
      if (orphan.count !== 0) throw new Error();
      const ftsRows = this.database.prepare("SELECT representation_id,resource_key,title,heading,body,keywords FROM retrieval_fts").all() as { representation_id: string; resource_key: string; title: string; heading: string; body: string; keywords: string }[];
      const representationRows = [...representations.values()].flat();
      if (ftsRows.length !== representationRows.length) throw new Error();
      const ftsByRepresentation = new Map(ftsRows.map((row) => [row.representation_id, row]));
      if (ftsByRepresentation.size !== representationRows.length) throw new Error();
      for (const row of representationRows) {
        const fts = ftsByRepresentation.get(row.representation_id);
        if (!fts || fts.resource_key !== row.resource_key || fts.title !== row.title || fts.heading !== (row.heading ?? "") || fts.body !== row.lexical_text || fts.keywords !== parseKeywords(row.keywords_json).join(" ")) throw new Error();
      }
      this.database.prepare("INSERT INTO retrieval_fts(retrieval_fts) VALUES('integrity-check')").run();
      return storedVersion;
    } catch { throw new RetrievalIntegrityError("Retrieval index integrity check failed."); }
  }

  close(): void { if (!this.closed) { this.database.close(); this.closed = true; } }

  private applySnapshot(snapshot: SourceSnapshot, nextHash: string): readonly Representation[] {
    const keep = new Set(snapshot.resources.map(({ resource }) => resource.key));
    const unavailable = new Set(snapshot.unavailableFamilies);
    const existing = this.database.prepare("SELECT resource_key,content_hash,metadata_json FROM retrieval_resources").all() as { resource_key: string; content_hash: string; metadata_json: string }[];
    for (const row of existing) if (!keep.has(row.resource_key as Resource["key"])) {
      if (unavailable.has(parseResourceMetadata(row.metadata_json).family as SourceSnapshot["unavailableFamilies"][number])) continue;
      this.database.prepare("DELETE FROM retrieval_fts WHERE resource_key=?").run(row.resource_key);
      this.database.prepare("DELETE FROM retrieval_resources WHERE resource_key=?").run(row.resource_key);
    }
    for (const projected of snapshot.resources) {
      const old = this.database.prepare("SELECT content_hash FROM retrieval_resources WHERE resource_key=?").get(projected.resource.key) as { content_hash: string } | undefined;
      if (old?.content_hash === projected.resource.contentHash) continue;
      this.database.prepare("DELETE FROM retrieval_fts WHERE resource_key=?").run(projected.resource.key);
      this.database.prepare("DELETE FROM retrieval_resources WHERE resource_key=?").run(projected.resource.key);
      this.database.prepare("INSERT INTO retrieval_resources VALUES (?,?,?,?,?,?)").run(projected.resource.key, projected.resource.type, projected.resource.sourceId, projected.resource.sourceVersion ?? null, projected.resource.contentHash, JSON.stringify({ family: projected.resource.family, linkedResourceKeys: projected.resource.linkedResourceKeys, taxonomy: projected.resource.taxonomy }));
      for (const representation of projected.representations) {
        this.database.prepare("INSERT INTO retrieval_representations VALUES (?,?,?,?,?,?,?,?,?,?)").run(representation.id, representation.resourceKey, representation.kind, representation.ordinal, representation.title, representation.heading ?? null, JSON.stringify(representation.keywords), representation.lexicalText, representation.semanticText, representation.contentHash);
        this.database.prepare("INSERT INTO retrieval_fts VALUES (?,?,?,?,?,?)").run(representation.id, representation.resourceKey, representation.title, representation.heading ?? "", representation.lexicalText, representation.keywords.join(" "));
      }
    }
    this.setMeta("corpusHash", nextHash);
    this.setMeta("unavailableFamilies", JSON.stringify(snapshot.unavailableFamilies));
    this.setMeta("generation", String(this.metadata().generation + 1));
    this.setMeta("lexicalGeneration", String(this.metadata().lexicalGeneration + 1));
    this.refreshSemanticState();
    return this.pendingRepresentations();
  }

  private applyVectors(rows: readonly SearchSnapshot["vectors"][number][]): void {
    const configuredModel = this.metadata().model;
    for (const row of rows) {
      const representation = this.database.prepare("SELECT content_hash FROM retrieval_representations WHERE representation_id=?").get(row.representationId) as { content_hash: string } | undefined;
      if (!configuredModel || row.model.id !== configuredModel.id || row.model.revision !== configuredModel.revision || row.model.dimensions !== configuredModel.dimensions || !representation || representation.content_hash !== row.contentHash || row.values.length !== row.model.dimensions || row.values.some((value) => !Number.isFinite(value)) || row.values.every((value) => value === 0)) throw new RetrievalIntegrityError("Embedding does not match current representation or configured model.");
      this.database.prepare("INSERT OR REPLACE INTO retrieval_embeddings VALUES (?,?,?,?,?,?,?)").run(row.representationId, row.model.id, row.model.revision, row.model.dimensions, Buffer.from(new Float32Array(row.values).buffer), row.contentHash, "ready");
    }
    this.refreshSemanticState();
  }

  private pendingRepresentations(): readonly Representation[] {
    const model = this.metadata().model;
    if (!model) return [];
    const unavailable = parseUnavailableFamilies((this.database.prepare("SELECT value FROM retrieval_index_metadata WHERE key='unavailableFamilies'").get() as { value?: string } | undefined)?.value ?? "[]");
    const rows = this.database.prepare(`
      SELECT r.representation_id,r.resource_key,r.kind,r.ordinal,r.title,r.heading,r.keywords_json,r.lexical_text,r.semantic_text,r.content_hash,
             e.representation_id AS vector_id
      FROM retrieval_representations r
      JOIN retrieval_resources s ON s.resource_key=r.resource_key
      LEFT JOIN retrieval_embeddings e ON e.representation_id=r.representation_id
        AND e.status='ready' AND e.content_hash=r.content_hash
        AND e.model_id=? AND e.model_revision=? AND e.dimensions=?
      ORDER BY r.resource_key,r.representation_id
    `).all(model.id, model.revision, model.dimensions) as Array<RepresentationRow & { vector_id: string | null }>;
    return rows.flatMap((row) => {
      const familyRow = this.database.prepare("SELECT metadata_json FROM retrieval_resources WHERE resource_key=?").get(row.resource_key) as { metadata_json: string } | undefined;
      if (row.vector_id !== null || familyRow === undefined || unavailable.has(parseResourceMetadata(familyRow.metadata_json).family as SourceSnapshot["unavailableFamilies"][number])) return [];
      return [representationFromRow(row)];
    });
  }

  private refreshSemanticState(): void {
    const model = this.metadata().model;
    const pending = this.pendingRepresentations();
    if (model && pending.length === 0) {
      this.setMeta("semanticGeneration", String(this.metadata().generation));
      this.setMeta("state", "ready");
      return;
    }
    this.setMeta("semanticGeneration", "0");
    this.setMeta("state", "degraded");
  }

  private writeMetadata(metadata: IndexMetadata): void { for (const [key, value] of Object.entries(metadata)) if (key !== "model") this.setMeta(key, String(value)); }
  private setMeta(key: string, value: string): void { this.database.prepare("INSERT INTO retrieval_index_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value); }
  private assertOpen(): void { if (this.closed) throw new Error("Retrieval store is closed."); }
  private assertReady(): void { this.assertOpen(); if (!this.initialized) this.initialize(); }
}

function corpusHash(snapshot: SourceSnapshot): string {
  return hashText(JSON.stringify(snapshot.resources.map(({ resource }) => [resource.key, resource.contentHash]).sort()));
}

function parseUnavailableFamilies(serialized: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed) || parsed.some((family) => typeof family !== "string" || !UNAVAILABLE_FAMILIES.has(family))) throw new Error();
    return new Set(parsed);
  } catch {
    throw new RetrievalIntegrityError("Unavailable-family metadata is invalid.");
  }
}

function parseKeywords(serialized: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) throw new Error();
    return parsed;
  } catch {
    throw new RetrievalIntegrityError("Representation keywords are invalid.");
  }
}

function parseResourceMetadata(serialized: string): { family: Resource["family"]; linkedResourceKeys: readonly ResourceKey[]; taxonomy?: TaxonomyMetadata } {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const value = parsed as { family?: unknown; linkedResourceKeys?: unknown; taxonomy?: unknown };
    if (typeof value.family !== "string" || !RESOURCE_FAMILIES.has(value.family as Resource["family"]) || !Array.isArray(value.linkedResourceKeys) || value.linkedResourceKeys.some((key) => !isResourceKey(key))) throw new Error();
    if (value.taxonomy === undefined) return { family: value.family as Resource["family"], linkedResourceKeys: value.linkedResourceKeys as ResourceKey[] };
    if (!value.taxonomy || typeof value.taxonomy !== "object" || Array.isArray(value.taxonomy)) throw new Error();
    const taxonomy = value.taxonomy as { productSurfaces?: unknown; problemClasses?: unknown };
    if (!Array.isArray(taxonomy.productSurfaces) || taxonomy.productSurfaces.some((item) => typeof item !== "string") || !Array.isArray(taxonomy.problemClasses) || taxonomy.problemClasses.some((item) => typeof item !== "string")) throw new Error();
    return { family: value.family as Resource["family"], linkedResourceKeys: value.linkedResourceKeys as ResourceKey[], taxonomy: { productSurfaces: taxonomy.productSurfaces as string[], problemClasses: taxonomy.problemClasses as string[] } };
  } catch {
    throw new RetrievalIntegrityError("Resource metadata is invalid.");
  }
}

function representationFromRow(row: RepresentationRow): Representation {
  if (!isResourceKey(row.resource_key) || !row.representation_id || !row.kind || !Number.isInteger(row.ordinal) || row.ordinal < 0 || !row.title || typeof row.lexical_text !== "string" || typeof row.semantic_text !== "string" || !/^[0-9a-f]{64}$/.test(row.content_hash)) throw new RetrievalIntegrityError("Representation row is invalid.");
  return { id: row.representation_id, resourceKey: row.resource_key, kind: row.kind, ordinal: row.ordinal, title: row.title, ...(row.heading === null ? {} : { heading: row.heading }), keywords: parseKeywords(row.keywords_json), lexicalText: row.lexical_text, semanticText: row.semantic_text, contentHash: row.content_hash };
}

function isResourceKey(value: unknown): value is ResourceKey {
  return typeof value === "string" && [...RESOURCE_TYPES].some((type) => value.startsWith(`${type}:`) && value.length > type.length + 1);
}

function isSharedFtsFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("no such table") || message.includes("malformed") || message.includes("corrupt");
}
