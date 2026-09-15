import type { KnowledgeArticle } from "../src/domain.js";
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";

export const retrievalV2Fixture = JSON.parse(readFileSync(new URL("./fixtures/retrieval-v2-index.json", import.meta.url), "utf8")) as {
  article: KnowledgeArticle;
  provenance: { originalResourceHash: string; originalRepresentationHash: string };
  tables: Record<string, Record<string, unknown>[]>;
};

export function loadRetrievalV2Fixture(path: string): RetrievalStore {
  const store = RetrievalStore.open(path);
  try {
    store.initialize();
    const database = (store as unknown as { database: Database.Database }).database;
    database.transaction(() => {
      database.exec("DELETE FROM retrieval_index_metadata");
      // Exact schema-v2 mappings: never depend on implicit INSERT column ordering.
      const columns: Record<string, string[]> = {
        retrieval_index_metadata: ["key", "value"],
        retrieval_resources: ["resource_key", "resource_type", "source_id", "source_version", "content_hash", "metadata_json"],
        retrieval_representations: ["representation_id", "resource_key", "kind", "ordinal", "title", "heading", "keywords_json", "lexical_text", "semantic_text", "content_hash"],
        retrieval_fts: ["representation_id", "resource_key", "title", "heading", "body", "keywords"],
        retrieval_embeddings: ["representation_id", "model_id", "model_revision", "dimensions", "vector_blob", "content_hash", "status"],
      };
      for (const [table, names] of Object.entries(columns)) {
        const insert = database.prepare(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`);
        for (const row of retrievalV2Fixture.tables[table]!) insert.run(...names.map((name) => name === "vector_blob" ? Buffer.from((row[name] as { data: number[] }).data) : row[name]));
      }
    })();
  } finally { store.close(); }
  const reopened = RetrievalStore.open(path);
  try { reopened.initialize(); return reopened; } catch (error) { reopened.close(); throw error; }
}
export function retrievalArticle(overrides: Partial<KnowledgeArticle> = {}): KnowledgeArticle { return { id: "article", title: "Article", tags: ["support"], body: "Useful support text.", ...overrides }; }
