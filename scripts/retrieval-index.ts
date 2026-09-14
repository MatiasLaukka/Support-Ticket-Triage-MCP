import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { unavailableReusableKnowledge } from "../src/knowledge-evolution/reusable-context.js";
import { loadRetrievalSources } from "../src/retrieval/sources.js";
import { IndexManager } from "../src/retrieval/index-manager.js";
import { RetrievalRepresentationVersionError, RetrievalStore } from "../src/retrieval/sqlite-store.js";

export async function runRetrievalIndex(args: readonly string[], dataRoot = resolve("data/runtime")): Promise<Record<string, unknown>> {
  const command = args[0];
  if (args.length !== 1 || !["status", "refresh", "rebuild", "validate"].includes(command ?? "")) throw new Error("Unknown retrieval command. Use status, refresh, rebuild, or validate.");
  const path = resolve(dataRoot, "retrieval.sqlite");
  if ((command === "status" || command === "validate") && !existsSync(path)) return { status: "absent", path };
  const store = RetrievalStore.open(path);
  let manager: IndexManager | undefined;
  try {
    store.initialize();
    if (command === "status") {
      try { store.validate(); }
      catch (error) {
        if (error instanceof RetrievalRepresentationVersionError) return { status: "upgrade-required", code: error.code, instruction: error.message, path, metadata: store.metadata() };
        throw error;
      }
      return { status: "ready", path, metadata: store.metadata() };
    }
    if (command === "validate") { store.validate(); return { status: "valid", path, metadata: store.metadata() }; }
    // Maintenance currently reloads static sources only. Rebuild refuses to erase cached
    // learned/resolved families until an authoritative loader can supply them.
    manager = new IndexManager({ store, load: async () => ({ resources: loadRetrievalSources({ articles: await new KnowledgeRepository(resolve("data/knowledge")).list(), reusable: unavailableReusableKnowledge() }).resources, unavailableFamilies: ["learned-known-cause", "resolved-ticket"] }) });
    const metadata = command === "rebuild" ? await manager.rebuild(new AbortController().signal) : await manager.refresh(new AbortController().signal);
    return { status: "refreshed", path, metadata, sourceScope: "static-only", unavailableFamilies: ["learned-known-cause", "resolved-ticket"] };
  } finally {
    await manager?.close();
    store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runRetrievalIndex(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
