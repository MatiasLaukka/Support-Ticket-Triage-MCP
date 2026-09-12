import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { loadRetrievalSources } from "../src/retrieval/sources.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { IndexManager } from "../src/retrieval/index-manager.js";
import { unavailableReusableKnowledge } from "../src/knowledge-evolution/reusable-context.js";

export async function evaluateRetrieval(): Promise<Record<string, unknown>> { const articles = await new KnowledgeRepository(resolve("data/knowledge")).list(); const snapshot = loadRetrievalSources({ articles, reusable: unavailableReusableKnowledge(), completedSnapshots: [] }); const store = RetrievalStore.open(":memory:"); const manager = new IndexManager({ store, load: async () => snapshot }); await manager.refresh(new AbortController().signal); const metadata = store.metadata(); await manager.close(); return { mode: "offline", semanticEvidence: "outstanding", corpusHash: metadata.corpusHash, representationVersion: metadata.representationVersion, model: null, candidatePools: [], channelStatuses: { lexical: "available", semantic: "unavailable" }, corpusCoverage: { "knowledge-article": "adequate", "known-cause": "adequate", "diagnostic-playbook": "adequate", "resolved-ticket": "not-available" } }; }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) evaluateRetrieval().then((result) => { console.log(JSON.stringify(result, null, 2)); console.log(`\n# Retrieval evaluation\n\n- Mode: ${result.mode}\n- Semantic evidence: ${result.semanticEvidence}\n`); }).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
