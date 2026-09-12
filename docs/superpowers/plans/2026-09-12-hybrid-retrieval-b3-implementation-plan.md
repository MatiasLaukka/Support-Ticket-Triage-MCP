# B3 Hybrid Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver and evaluate the approved four-resource B3 discovery subsystem while retaining existing operational behavior.

**Architecture:** Pure source projections feed one derived SQLite store. Independent lexical and semantic searches produce per-type resource candidates; union preserves provenance without cross-channel ranking. A runtime observer records bounded traces after successful evaluation.

**Tech Stack:** Existing TypeScript, Node.js, better-sqlite3, Zod, Vitest, built-in crypto and fetch. No new package dependency.

**Spec:** [2026-09-12-hybrid-retrieval-b3-design.md](../specs/2026-09-12-hybrid-retrieval-b3-design.md)

**Date:** 2026-09-12

**Inspected baseline:** `f965835b5ca46358be823e6e808a790dbff6d4df`. Recheck HEAD and repository instructions before execution. This document is a plan for review; creating it does not start implementation.

## Global constraints

- "B3 delivers a complete candidate-discovery slice, not merely an embedding experiment."
- "Source objects remain authoritative in their existing stores."
- "The B3 candidate contract must not contain `finalScore`, `relevanceProbability`, `applicable`, `diagnosisProbability`, or `selectedForDraft`."
- "Taxonomy and deterministic references may travel alongside the query as structured metadata. They are not concatenated into `queryText` as if the customer had stated them."
- "An old vector must never silently represent new content."
- "Queries do not receive durable vector rows. Only corpus representations belong in the projection."
- "Most importantly, a retrieval-index failure can never roll back or reject an authoritative operational or knowledge write."
- Keep the current engine requirement: `^20.19.0 || ^22.12.0 || >=24.0.0`.
- Preserve R1 receipt identity, replay-before-preparation, transaction ownership, and immutable historical results.
- Preserve B2 taxonomy authority boundaries and HTTP/MCP parity.
- No LLM query rewriting, automatic knowledge creation, ANN, new search service, or arbitrary recall target.
- Do not refactor the classifier, diagnostic workflow, command dispatcher, or learning service to accommodate retrieval.
- Implementation occurs in an isolated worktree. Preserve existing untracked files in the main checkout.

## Review of the design record and complexity budget

The original approved discussion is [Support Ticket Triage Review](https://chatgpt.com/c/6a70d092-3f80-83eb-8fe6-bfc07f851a3e). Its explicit decisions resolve the following omissions or ambiguities in the formal record. These are fidelity corrections, not permission to expand B3.

1. **Union metrics:** Spec section 13's illustrative "Union Recall@5" conflicts with its unordered union. Report Recall@K/Precision@K only for each ranked channel/type. Report candidate recall and required coverage for the union, naming the per-channel K budget.
2. **Source path:** The classifier is `src/approval-desk/classifier.ts`, not `src/classifier.ts`. Production evaluation is in `src/evaluation-command.ts`.
3. **Resolved eligibility:** `OperationalCompletedDiagnosisSource` filters invalid/stale/rejected diagnoses but does not require resolved ticket status. Apply that extra condition. It also returns working diagnoses; never relabel one as confirmed.
4. **Outcome evidence:** `CompletedDiagnosis.fixSteps` contains recommendations and, in the operational projection, generic workflow instructions. These are not applied fixes. Include only outcome facts proven by causal operational history; omit an applied-fix description when none is established.
5. **Atomic publication:** The original discussion explicitly requires validated rebuild publication and one coherent snapshot per retrieval. Generation counters alone do not provide either guarantee.
6. **Quota and provenance:** Aggregate representations before resource top-K; append explicit references after search quotas. Retain representation-level scores and ranks, not only the winning score and an ID list.
7. **Empirical acceptance:** Preserve required baseline resources and demonstrate measured candidate-recall improvement on the curated corpus. Do not invent a percentage target or claim semantic value from fake vectors.
8. **Non-generative boundary:** Customer text is data throughout B3. No agent, prompt template, query-rewriting model, or applicability call is needed.

Keep the implementation small:

- Plain adapter functions; no adapter plugin registry, dependency container, generic repository hierarchy, or pipeline DSL.
- One concrete retrieval SQLite store. Keep only the provider/retriever seams needed for substitution and deterministic tests.
- One promise chain for serialized maintenance; no durable outbox, worker framework, job scheduler, automatic retry service, or multi-process coordinator.
- Build full rebuild candidates in memory at this corpus size and replace the active derived tables in one short transaction after validation. Record a new generation. No historical generation retention service.
- Bounded runtime trace ring, inspectable through runtime dependencies/tests. No operational schema migration or UI dashboard for traces.
- Reconcile at startup, before shadow queries, and through an explicit CLI. This catches authoritative changes without adding hooks to every command. Do not install filesystem watchers.
- Use the existing library's FTS5 ranking. SQLite BM25 sorts **ascending**, while cosine sorts descending. See [SQLite's BM25 documentation](https://www.sqlite.org/fts5.html#the_bm25_function).
- Avoid speculative cache layers and tuning weights. Hashing to skip unchanged embeddings is sufficient.

## File map and dependency order

New production files:

| File | Responsibility | Task |
|---|---|---|
| `src/retrieval/types.ts` | Shared data contracts and small provider/retriever interfaces | 1 |
| `src/retrieval/representations.ts` | Normalization, safe text projection, hashing, article splitting | 1 |
| `src/retrieval/sources.ts` | Four source adapters and authoritative snapshot loading | 2 |
| `src/approval-desk/diagnostic-playbook-descriptors.ts` | Declarative descriptors for existing executable paths | 2 |
| `src/retrieval/sqlite-store.ts` | Tables, atomic updates, integrity checks, snapshot reads | 3 |
| `src/retrieval/index-manager.ts` | Serialized refresh, embeddings, atomic rebuild | 4 |
| `src/retrieval/embedding-provider.ts` | Explicitly configured embedding endpoint and validation | 5 |
| `src/retrieval/search.ts` | Safe FTS query, exact cosine, resource aggregation, union | 6 |
| `src/retrieval/stage.ts` | Customer query builder, shadow observer, bounded trace ring | 7 |
| `src/retrieval/evaluation.ts` | Retrieval expectation schema and scoring | 8 |
| `scripts/retrieval-index.ts` | status / refresh / rebuild / validate commands | 9 |
| `scripts/evaluate-retrieval.ts` | Reproducible offline/live reports | 9 |

Existing integration points:

- `src/runtime.ts`: instantiate and close retrieval; construct the operational diagnosis source independently of learning availability.
- `src/evaluation-command.ts`: capture the evaluated basis and observe after successful dispatch.
- `src/server.ts`, `src/approval-desk/http.ts`: pass the same optional observer dependency.
- `src/evaluation-oracle.ts`: optional retrieval expectation; keep existing recommendation scoring unchanged.
- `data/seed/evaluation-oracles.json`: reviewed retrieval labels and coverage annotations.
- `package.json`, `README.md`: two scripts and operating instructions.
- `.gitignore`: only if the chosen evaluation output path is not already ignored.

Test files are specified under their tasks. One `test/retrieval-fixtures.ts` contains fixture constructors only, never tests or imported test modules.

Execute tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Review each deliverable before moving on. Do not split contract declarations or configuration into separate infrastructure-only commits.

## Shared contracts

Define these in Task 1. Add the listed fields to the spec's conceptual shapes; do not create parallel versions of these types in later files.

```ts
type ResourceType =
  | "knowledge-article" | "known-cause"
  | "diagnostic-playbook" | "resolved-ticket";
type ResourceKey = `${ResourceType}:${string}`;
type TaxonomyMetadata = {
  productSurfaces: readonly string[];
  problemClasses: readonly string[];
};
type Resource = {
  key: ResourceKey; type: ResourceType; sourceId: string;
  sourceVersion?: string; contentHash: string;
  family: "article" | "static-known-cause" | "learned-known-cause" | "playbook" | "resolved-ticket";
  linkedResourceKeys: readonly ResourceKey[];
  taxonomy?: TaxonomyMetadata;
};
type Representation = {
  id: string; resourceKey: ResourceKey; kind: string; ordinal: number;
  title: string; heading?: string; keywords: readonly string[];
  lexicalText: string; semanticText: string; contentHash: string;
};
type ProjectedResource = {
  resource: Resource; representations: readonly Representation[];
};
type SourceSnapshot = {
  resources: readonly ProjectedResource[];
  // Unavailable is not an authoritative empty list.
  unavailableFamilies: readonly ("learned-known-cause" | "resolved-ticket")[];
};
type ModelIdentity = { id: string; revision: string; dimensions: number };
interface EmbeddingProvider {
  readonly model: ModelIdentity;
  embed(texts: readonly string[], signal: AbortSignal):
    Promise<readonly (readonly number[])[]>;
}
type Match = {
  representationId: string; resourceKey: ResourceKey;
  score: number; rank: number;
};
type Reference = {
  resourceKey: ResourceKey;
  channel: "deterministic-reference" | "known-cause-reference";
  sourceId: string; sourceVersion?: string;
  reason: "classifier-association" | "known-cause-link" | "safety-inclusion";
};
type Candidate = {
  resourceKey: ResourceKey; resourceType: ResourceType;
  lexical?: { bestRank: number; bestBm25Score: number; matches: readonly Match[] };
  semantic?: { bestRank: number; bestCosineSimilarity: number; matches: readonly Match[] };
  deterministicReferences: readonly Reference[];
  knownCauseReferences: readonly Reference[];
  taxonomy?: TaxonomyMetadata;
};
type ChannelState = {
  status: "used" | "unavailable" | "stale" | "failed";
  reason?: "provider-not-configured" | "provider-timeout" | "provider-http-error"
    | "provider-unreachable" | "provider-invalid-response" | "cancelled"
    | "model-version-changed" | "pending-vectors" | "source-unavailable"
    | "fts-query-error" | "index-integrity-error" | "index-unavailable";
};
type IndexMetadata = {
  schemaVersion: number; representationVersion: number;
  generation: number; lexicalGeneration: number; semanticGeneration: number;
  corpusHash: string; model?: ModelIdentity;
  state: "ready" | "degraded" | "rebuilding" | "stale" | "unavailable";
};
type Query = {
  queryText: string; queryHash: string; ticketId: string;
  sourceRevision: number; customerReplyWatermark: string;
  queryTruncated: boolean;
  taxonomy?: TaxonomyMetadata; references: readonly Reference[];
};
type SearchSnapshot = {
  metadata: IndexMetadata; resources: readonly Resource[];
  lexical: ChannelState;
  lexicalMatches: readonly Match[];
  vectors: readonly {
    representationId: string; resourceKey: ResourceKey;
    contentHash: string; model: ModelIdentity; values: readonly number[];
  }[];
};
type RetrievalResult = {
  metadata: IndexMetadata;
  lexical: ChannelState; semantic: ChannelState;
  candidates: readonly Candidate[];
};
type RetrievalTrace = Omit<Query, "queryText" | "references" | "taxonomy"> & {
  commandId: string; result: RetrievalResult;
  candidateCount: number; truncated: boolean;
};
type Limits = Record<ResourceType, { lexical: number; semantic: number }>;
```

Use source-native taxonomy types at the adapter boundary, converting surface objects to canonical `domain/area` strings. Do not use `unknown` as an unvalidated metadata escape hatch. All error reasons are bounded codes; diagnostic details go only to a safe reporter.

Defaults are implementation bounds, not quality targets: K=5 per channel/type; article section body limit 4,000 characters; query limit 12,000 characters; 128 unique FTS tokens; embedding batch size 16; provider timeout 5 seconds; trace ring 100 entries, maximum 64 KiB serialized per entry. Keep them as named constants, accepting test overrides only where needed. Record query clipping and representation version in provenance. Do not truncate explicit references from the actual candidate pool; runtime trace truncation is separate.

## Task 1: Deterministic representations and privacy projection

**Files:** Create `src/retrieval/types.ts`, `src/retrieval/representations.ts`, `test/retrieval-fixtures.ts`, `test/retrieval-representations.test.ts`.

**Interfaces:** Produce the shared contracts and:
```ts
normalizeText(text: string): string;
hashText(text: string): string;
projectArticle(article: KnowledgeArticle): ProjectedResource;
safeCaseText(text: string, identifiers: readonly string[]): string | undefined;
```

- [ ] Add failing tests with a real small `KnowledgeArticle` literal (`id`, `title`, `tags`, `body`). Verify equal input produces equal IDs/hashes and a heading/content change changes the corresponding representation hash. Include this focused regression:
```ts
const article = {
  id: "rotation", title: "Signing secrets", tags: ["webhook"],
  body: "# Overview\n\nDelivery checks.\n\n## Rotation\n\nUse the active secret.",
};
const first = projectArticle(article);
expect(projectArticle(article)).toEqual(first);
expect(first.representations.every(r =>
  r.semanticText.includes(article.title))).toBe(true);
expect(first.representations.some(r => r.heading === "Rotation")).toBe(true);
expect(projectArticle({ ...article, body: article.body + "\n\nRetry once." })
  .resource.contentHash).not.toBe(first.resource.contentHash);
```
- [ ] Run `npx vitest run test/retrieval-representations.test.ts`; confirm failure comes from the missing projection, not malformed fixtures.
- [ ] Implement normalization and hashing with built-ins:
```ts
export const normalizeText = (text: string) =>
  text.normalize("NFC").replace(/\r\n?/g, "\n").trim();
export const hashText = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
```
  Split on Markdown headings, then paragraphs; if one paragraph exceeds the bound, split on whitespace with a final character fallback. Preserve a heading stack and section title; include the title in every semantic view. Use stable `resourceKey:kind:ordinal` representation IDs; hash canonical fields including representation version and sorted tags. Keep the long-field fallback deterministic; no tokenizer dependency or overlap experiment.
- [ ] Implement allowlisted case-field projection before storage: remove known customer-name/email/account identifiers supplied from the source; reject unsafe fields containing credentials, credential-bearing URLs, payload blocks, machine paths, or prompt/provider artifacts. Reuse the existing persisted-text policy semantics without loosening its domain schema or inventing a universal PII detector. Drop a case if its essential problem/diagnosis becomes empty. Ordinary words such as "secret rotation" must survive.
- [ ] Add table-driven tests for synthetic identifiers, tokens, raw JSON payloads, URLs, paths, and harmless domain vocabulary. Test unknown free-form notes are never selected as fields. Test exact boundary lengths and repeated paragraphs.
- [ ] Run the focused file and typecheck; inspect resulting normalized text manually.
- [ ] Commit only this task's four files: `feat: add deterministic retrieval representations`.

## Task 2: Four authoritative source adapters

**Files:** Create `src/retrieval/sources.ts`, `src/approval-desk/diagnostic-playbook-descriptors.ts`, `test/retrieval-sources.test.ts`. Extend `test/retrieval-fixtures.ts`.

**Read:** `src/approval-desk/known-cause-catalog.ts`, `src/approval-desk/diagnostic-playbooks.ts`, `src/knowledge-evolution/completed-diagnosis-source.ts`, `src/knowledge-evolution/reusable-context.ts`, and closure/verification projections in `src/triage-service.ts`.

**Interfaces:**
```ts
projectStaticCause(cause: KnownCauseDefinition): ProjectedResource;
projectLearnedCause(context: ReusableKnowledgeContext): ProjectedResource;
projectPlaybook(descriptor: DiagnosticPlaybookDescriptor): ProjectedResource;
projectResolvedCase(input: CompletedDiagnosisReadSnapshot):
  ProjectedResource | undefined;
loadRetrievalSources(input: {
  articles: readonly KnowledgeArticle[];
  reusable: ReusableKnowledgeResult;
  completedSnapshots: readonly CompletedDiagnosisReadSnapshot[];
}): SourceSnapshot;
```
Define/export `DiagnosticPlaybookDescriptor` using the approved descriptor fields. The loader uses the existing `KNOWN_CAUSES` and a single exported `PLAYBOOK_DESCRIPTORS` constant.

- [ ] Write failing source tests. Use current operational fixture builders for diagnosis records/audits; do not fabricate contradictory history. Add a sentinel test for executable-code leakage:
```ts
const cause = {
  ...KNOWN_CAUSES[0]!,
  matches: () => { throw new Error("retrieval executed matching logic"); },
};
const resource = projectStaticCause(cause);
expect(JSON.stringify(resource)).not.toContain("retrieval executed");
expect(resource.resource.type).toBe("known-cause");
```
- [ ] Run `npx vitest run test/retrieval-sources.test.ts`.
- [ ] Implement ordinary mapping functions, selecting fields explicitly. Learned causes come from service-owned `listReusableApproved` contexts with `eligibleForReuse`; never broad learning history. Preserve exact active version and exclude ineligible versions. A failed learning read marks that source unavailable rather than deleting its corpus as if it were empty; exclude unavailable-family candidates until eligibility is re-established.
- [ ] Establish identity within the known-cause family: static keys retain `known-cause:<id>`; learned keys use `known-cause:learned/<id>`. Keep original source ID/version separately. Test a learned ID equal to a static ID; reject all remaining duplicate resource identities before indexing.
- [ ] Write descriptors for the existing event-processing, flow-trigger, campaign-editor, and article-backed diagnostic paths. Review the article-backed branches individually; record each actual source path and related article IDs in tests. Do not create a descriptor for an invented playbook or add an execution registry. Descriptor tests ensure linked article IDs exist.
- [ ] Implement resolved cases using `eligibleCompletedDiagnoses(snapshot)` plus `snapshot.ticket.status === "resolved"`. Choose the latest eligible diagnosis by audit causal order, not string ID or wall clock. Preserve diagnosis confidence wording. Extract customer-confirmed closure from the existing causal facts; include a proven fixed outcome only when linked history supports it. Otherwise omit it. Do not populate "applied fix" from `fixSteps`.
- [ ] Verify unresolved, stale, rejected, invalidated, and subsequently reopened cases are excluded; verified and unverified outcomes remain distinct. Include a learning-unavailable case with an operational resolved case still retrievable. Test taxonomy absence as legal.
- [ ] Run source and representation tests plus existing diagnostic-playbook tests; commit `feat: project eligible retrieval sources`.

## Task 3: SQLite projection and coherent reads

**Files:** Create `src/retrieval/sqlite-store.ts`, `test/retrieval-store.test.ts`.

**Interfaces:** Export `RetrievalStore`, with:
```ts
static open(path: string): RetrievalStore;
initialize(): void;
configureModel(model: ModelIdentity | undefined): void;
metadata(): IndexMetadata;
reconcile(snapshot: SourceSnapshot): readonly Representation[];
installVectors(rows: readonly SearchSnapshot["vectors"][number][]): void;
replaceAll(snapshot: SourceSnapshot,
  vectors: readonly SearchSnapshot["vectors"][number][]): void;
readSnapshot(ftsQuery: string): SearchSnapshot;
validate(): void;
close(): void;
```
`configureModel` persists the embedding-space identity and marks incompatible vectors stale; an absent provider does not erase cached model identity or vectors. `reconcile` returns pending representations; `installVectors` compares their current hashes and configured model before writing. `readSnapshot` executes FTS and copies compatible vectors plus resource metadata in one synchronous read transaction. Keep family and linked resource keys in validated resource metadata; unavailable-family exclusion and known-cause links use these fields.

- [ ] Use `:memory:` for focused tests and a temporary file for reopen/rollback tests. Add a real FTS5 smoke test and a changed-content regression:
```ts
const db = RetrievalStore.open(":memory:");
db.initialize();
const a = projectArticle({
  id: "rotation", title: "Rotation", tags: [], body: "Old signing secret",
});
db.reconcile({ resources: [a], unavailableFamilies: [] });
expect(db.readSnapshot('"signing"').lexicalMatches).toHaveLength(1);
const b = projectArticle({
  id: "rotation", title: "Rotation", tags: [], body: "New delivery delay",
});
db.reconcile({ resources: [b], unavailableFamilies: [] });
expect(db.readSnapshot('"signing"').lexicalMatches).toHaveLength(0);
db.close();
```
- [ ] Run `npx vitest run test/retrieval-store.test.ts`.
- [ ] Implement the five tables from spec section 9. Use foreign keys, unique representation identity and resource/kind/ordinal, integer positive vector dimensions, and explicit serialization. FTS5 is a regular content-bearing table maintained explicitly in the same transaction; no external-content triggers or ORM. Use `PRAGMA user_version = 1`; reject future versions. Metadata includes model revision and a monotonically increasing generation.
- [ ] Use short transactions for replacing a changed resource, FTS rows, and vector invalidation. A no-op reconciliation does not advance generation. A removed or newly ineligible resource is deleted; unavailable families remain recorded as unavailable and excluded from active snapshots.
- [ ] Encode vectors with explicit Float32 little-endian reads/writes. Reject nonfinite numbers, dimension mismatch, zero norm, unexpected byte length, stale hash, or incompatible model. Recheck hash on installation so late work cannot resurrect replaced content.
- [ ] Implement read isolation:
```ts
return database.transaction(() => {
  const metadata = readMetadata();
  const resources = readActiveResources();
  const { lexical, lexicalMatches } = readFtsMatches(ftsQuery);
  const vectors = readCompatibleVectors(metadata);
  return { metadata, resources, lexical, lexicalMatches, vectors };
})();
```
  The four private helpers are local SQL readers in this file. The FTS helper converts a channel-local query error into a failed lexical state with empty matches; shared integrity errors still throw. All arrays are detached from SQLite before async embedding work.
- [ ] Validate hashes by reconstructing canonical representations, foreign keys, orphan/missing FTS rows, model/vector consistency, and FTS5's integrity check. Throw a typed integrity error with a safe code. A corrupt DB must not return a successful empty result.
- [ ] Test duplicate IDs, mismatched vectors, source deletion, unavailable sources, rollback during replacement, reopen persistence, future schema rejection, and read-generation coherence.
- [ ] Run store/source tests and typecheck; commit `feat: add rebuildable retrieval SQLite store`.

## Task 4: Serialized refresh and atomic rebuild

**Files:** Create `src/retrieval/index-manager.ts`, `test/retrieval-index-manager.test.ts`.

**Interfaces:**
```ts
class IndexManager {
  constructor(input: {
    store: RetrievalStore;
    load: () => Promise<SourceSnapshot>;
    provider?: EmbeddingProvider;
  });
  refresh(signal: AbortSignal): Promise<IndexMetadata>;
  rebuild(signal: AbortSignal): Promise<IndexMetadata>;
  close(): Promise<void>;
}
```

- [ ] Add failing tests with an injected provider returning unit vectors and a deferred promise to control timing. Assert unchanged resources do not get embedded twice and a provider failure leaves new lexical content with no old vector.
- [ ] Run `npx vitest run test/retrieval-index-manager.test.ts`.
- [ ] Implement a single promise chain; restore the queue after a failed operation:
```ts
private tail: Promise<void> = Promise.resolve();
private serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = this.tail.then(work);
  this.tail = result.then(() => undefined, () => undefined);
  return result;
}
```
  Closing rejects new requests, aborts provider work via a manager-owned controller, and awaits the chain before the store is closed.
- [ ] Refresh calls `configureModel` with the provider identity, loads sources, commits changed lexical representations plus vector invalidation, then embeds pending representations outside SQLite transactions in batches of 16. Install only results still matching source hash/model. Expected provider failures record unavailable/stale semantics; integrity failures propagate to the caller. `semanticGeneration` describes the last fully compatible semantic corpus; when only some vectors are ready, record partial coverage as stale and preserve those valid matches.
- [ ] Full rebuild builds and validates a complete candidate snapshot outside the active tables. Replace all active tables and advance generation in one transaction. Readers see the old complete state or the new complete state. If semantic generation fails, a complete lexical snapshot may publish with semantic degradation. A structural validation failure preserves the old snapshot and reports rebuild failure.
- [ ] No durable staging generations: the corpus is small and derived. A crash before publication retains the old generation; a crash during publication rolls back. Startup reconciliation repairs lag.
- [ ] Test model changes, no unnecessary reembedding on restart, cancellation, stale-result rejection, concurrent refresh serialization, queue recovery, atomic rebuild failure, and startup repair. Test no write transaction is held when the provider is called.
- [ ] Run manager/store tests and typecheck; commit `feat: maintain retrieval index incrementally`.

## Task 5: Optional embedding transport

**Files:** Create `src/retrieval/embedding-provider.ts`, `test/retrieval-embedding-provider.test.ts`.

**Interfaces:**
```ts
createEmbeddingProvider(input: {
  endpoint: string; model: ModelIdentity; apiKey?: string;
  timeoutMs?: number; fetchImpl?: typeof fetch;
}): EmbeddingProvider;
embeddingProviderFromEnv(env: NodeJS.ProcessEnv): EmbeddingProvider | undefined;
```

- [ ] Add mocked transport tests using `vi.fn<typeof fetch>()`. Assert only `model` and `input` are sent, and credentials never appear in errors. A test server or fetch stub must return the actual index/embedding response shape, not a fabricated app-specific envelope.
- [ ] Run `npx vitest run test/retrieval-embedding-provider.test.ts`.
- [ ] Use one OpenAI-compatible embedding endpoint adapter, with an explicitly configured full URL. Unset configuration means no provider and lexical-only operation. Do not infer a hosted endpoint from an existing OpenAI key or classification configuration.
- [ ] Configuration: `TRIAGE_EMBEDDING_ENDPOINT`, `TRIAGE_EMBEDDING_MODEL`, `TRIAGE_EMBEDDING_REVISION`, `TRIAGE_EMBEDDING_DIMENSIONS`, optional `TRIAGE_EMBEDDING_API_KEY`, and `TRIAGE_EMBEDDING_TIMEOUT_MS`. Require a complete valid tuple if any required field is set. Revision pins an operator-declared embedding space; changing it invalidates vectors even if dimensions stay equal. Local HTTP is allowed; remote endpoints require HTTPS.
- [ ] Transport outline:
```ts
const response = await fetchImpl(endpoint, {
  method: "POST",
  signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
  redirect: "error",
  headers: {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  },
  body: JSON.stringify({ model: model.id, input: texts }),
});
```
  Parse response `data[index, embedding]`, require exactly one unique index per input, restore input order, and validate count/dimensions/finiteness/nonzero norm. Bound response size. Map timeout, cancellation, HTTP error, unreachable endpoint, and invalid response to safe typed provider codes; do not store the raw body.
- [ ] Confirm the endpoint contract against the chosen provider's current official documentation during implementation. Tests remain entirely mocked. A real provider experiment needs explicit endpoint/model and authorization; installation, downloads, hosted calls, and credential setup are not implementation prerequisites.
- [ ] Test out-of-order results, duplicate/missing indices, dimensional mismatch, NaN/zero vectors, timeout, abort, redirects, 401/429/500, malformed JSON, oversized response, and no configuration. Do not add retries or an SDK.
- [ ] Run provider/manager tests and typecheck; commit `feat: add optional retrieval embedding provider`.

## Task 6: Independent search and provenance-preserving union

**Files:** Create `src/retrieval/search.ts`, `test/retrieval-search.test.ts`.

**Interfaces:**
```ts
makeFtsQuery(text: string): string;
cosine(left: readonly number[], right: readonly number[]): number;
aggregateMatches(matches: readonly Match[], channel: "lexical" | "semantic",
  resources: readonly Resource[], limits: Limits): readonly Candidate[];
unionCandidates(lexical: readonly Candidate[], semantic: readonly Candidate[],
  references: readonly Reference[], resources: readonly Resource[]): readonly Candidate[];
retrieve(input: {
  query: Query; store: RetrievalStore; provider?: EmbeddingProvider;
  limits: Limits; signal: AbortSignal;
}): Promise<RetrievalResult>;
```

- [ ] Write failing tests for exact error-code matching, semantic paraphrase using deterministic vectors, one article matching several chunks, and explicit references beyond K.
```ts
expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
expect(makeFtsQuery('webhook OR "secret"')).toBe('"webhook" OR "or" OR "secret"');
```
- [ ] Run `npx vitest run test/retrieval-search.test.ts`.
- [ ] Normalize to lowercase Unicode letters/numbers, quote literal unique tokens, join with OR, and cap at 128 tokens. Never pass raw customer text as FTS syntax. Empty token lists yield a valid used channel with zero lexical hits. Preserve the exact transformation version in evaluation configuration.
- [ ] Read lexical results and vectors in one `store.readSnapshot` call; release the transaction before requesting a query embedding. A later refresh cannot change the copied snapshot. If lexical SQL fails, mark lexical failed and separately copy compatible semantic data in the same read-snapshot operation where possible; a corrupt shared snapshot fails both channels with integrity status.
- [ ] Sort lexical raw scores ascending and semantic descending. Within a resource retain every matching representation score/rank; then select distinct top-K resources per type/channel. Ties use resource key and representation ID, never unstable database row order.
- [ ] Add eligible explicit associations after both channel quotas. Resolve links against the same snapshot and preserve source IDs/version; record invalid/missing references with safe diagnostics. A known cause discovered by similarity may contribute its direct approved article links with provenance, but no recursive graph walk or applicability inference.
- [ ] Return a stable neutral union order: resource type, then resource key. Taxonomy never filters or reranks. Add no similarity threshold tuned against the oracle.
- [ ] Verify semantic-unavailable leaves lexical+references, lexical failure remains visible, stale/wrong-model vectors are excluded, self-ticket resolved memory is excluded for evaluation/querying, ties are stable, and explicit references consume no search slots.
- [ ] Run search/store/provider tests and typecheck; commit `feat: retrieve and union B3 candidates`.

## Task 7: Runtime shadow observation with immutable command behavior

**Files:** Create `src/retrieval/stage.ts`, `test/retrieval-stage.test.ts`, `test/retrieval-runtime.test.ts`. Modify `src/runtime.ts`, `src/evaluation-command.ts`, `src/server.ts`, `src/approval-desk/http.ts`.

**Interfaces:**
```ts
buildRetrievalQuery(input: {
  ticket: Ticket; customerReplies: readonly CustomerReply[];
  customerReplyWatermark: string; references: readonly Reference[];
  taxonomy?: TaxonomyMetadata;
}): Query;
interface RetrievalObserver {
  observe(query: Query, commandId: string): Promise<void>;
  recent(): readonly RetrievalTrace[];
  close(): Promise<void>;
}
```
Reuse the existing `CustomerReply` type from `src/approval-desk/ai-evaluation.ts`. The observer owns the manager/store and safe trace reporter through constructor dependencies.

- [ ] Add query tests with explicit customer replies and a distinctive support-response marker. Changing taxonomy or references must not change query text/hash. Changing a submitted reply must change the hash even though the persisted reply watermark is unchanged.
- [ ] Run `npx vitest run test/retrieval-stage.test.ts test/retrieval-runtime.test.ts`.
- [ ] Build the query from the exact ticket and customer replies already loaded during evaluation preparation. Keep stable reply order, include reply IDs in basis hashing, and apply deterministic 12,000-character clipping favoring recent replies after subject/description allocation. Record clipping. No model-generated text or existing draft is accepted by this function.
- [ ] Retain the evaluated input basis in the evaluation closure, outside `PreparedOperationalEvaluation`; build the retrieval query only after dispatch succeeds, inside the observer failure boundary. For deterministic references, call the existing `classifyTicketFromContext` with `buildConversationContextForTicket` and the captured customer evidence, without advisory model signals. This extra deterministic read belongs to observation, not preparation or receipt identity. Add a local `didCommit` marker only after the existing service commit call succeeds. After `dispatcher.run` resolves, invoke observation only if this call actually committed. The marker must not be a new persistent field or caller input:
```ts
let didCommit = false;
// In the existing definition.commit, after commitOperationalEvaluation succeeds:
didCommit = true;
// After dispatch resolves successfully:
if (didCommit && capturedBasis && deps.retrievalObserver) {
  try {
    const query = buildRetrievalQuery(capturedBasis);
    await deps.retrievalObserver.observe(query, commandId);
  } catch {
    // Record a bounded failed observation through the nonthrowing safe reporter.
    reportRetrievalFailure(commandId);
  }
}
return result;
```
  Define `capturedBasis` from the actual loaded ticket/replies and persisted watermark; finalize its references after commit. Its final shape is `Parameters<typeof buildRetrievalQuery>[0]`. Define `result` as the awaited dispatcher result. Add `reportRetrievalFailure(commandId: string): void` in `stage.ts`, using a fixed failure code and a nonthrowing diagnostic sink. Guard reference extraction, query building, and observation together; none may fail an authoritative command. Integrity failure is an explicit failed trace and diagnostic, not normal degradation. Test a throwing query builder and reporter as well as a throwing retriever.
- [ ] Replays, in-flight joiners, and rolled-back/failed commits perform no retrieval. Cross-process receipt races that skip the commit callback also perform no observation. Keep command hashes, receipts, operational schemas, and `TriageService` unchanged. No provider call occurs inside an operational transaction.
- [ ] Runtime defaults to shadow retrieval with lexical-only availability unless embeddings are configured; `TRIAGE_RETRIEVAL_MODE=off|shadow` supports comparison and disabling. Store path is `resolve(dataRoot, "retrieval.sqlite")` with no arbitrary DB-path override. Startup uses source loading plus `store.reconcile` for lexical data without awaiting embeddings; query-time refresh uses a bounded abort signal. Construct operational case snapshots from the operational store even when learning is unavailable. Retrieval startup/configuration/integrity failures produce a visibly unavailable observer and a safe diagnostic while normal runtime starts; CLI validation still exits nonzero. Do not reuse the learning-unavailable JSON diagnosis fallback for production cases.
- [ ] Reconcile before each shadow retrieval so closure/rejection/promotion since startup is observed. Hash comparison prevents unnecessary embeddings. The existing authoritative result is already committed; expected refresh failure records source/index staleness. Do not serve old ineligible cases as current after source verification fails.
- [ ] Retain at most 100 traces and 64 KiB per trace with explicit truncation counts. Only hashes, identifiers, ranks/scores, safe reference reasons, and model/generation metadata survive. No query text/vector or corpus text in the ring; no operational events or new trace database. `recent()` returns defensive copies. Runtime shutdown cancels and awaits retrieval work before closing its SQLite connection.
- [ ] Use `openReliabilityRuntime` and existing operational command tests for HTTP/MCP parity. Compare actual recommendation, ticket state, taxonomy revisions, receipts, and audit effects with shadow off/on under a fixed clock. Inject unavailable provider, corrupt index, and throwing trace sink. Assert successful command results and replay contents remain identical; only advisory traces differ.
- [ ] Run focused new tests plus existing replay, taxonomy command, HTTP, and MCP tests selected from current filenames. Run `npm run typecheck`; commit `feat: observe B3 retrieval after evaluation commits`.

## Task 8: Retrieval oracle, honest metrics, and corpus audit

**Files:** Create `src/retrieval/evaluation.ts`, `test/retrieval-evaluation.test.ts`; modify `src/evaluation-oracle.ts`, `data/seed/evaluation-oracles.json`, `test/evaluation-oracle.test.ts`.

**Interfaces:**
```ts
type RetrievalExpectation = {
  requiredResourceKeys: readonly ResourceKey[];
  relevantResourceKeys: readonly ResourceKey[];
  hardNegativeResourceKeys: readonly ResourceKey[];
  labelsComplete: boolean;
  resourceCoverage: Record<ResourceType, "adequate" | "missing" | "uncertain" | "not-expected">;
};
scorePool(keys: readonly ResourceKey[], oracle: RetrievalExpectation): {
  candidateRecall: number | null; requiredCoverage: number | null;
  unjudgedKeys: readonly ResourceKey[]; hardNegativeHits: readonly ResourceKey[];
};
scoreRanked(keys: readonly ResourceKey[], oracle: RetrievalExpectation, k: number): {
  recallAtK: number | null; precisionAtK: number | null;
};
```
Export `RetrievalExpectationSchema`; add it as optional `retrieval` to the existing oracle. Refine coverage so `not-expected` is legal only for known causes and resolved tickets, matching the spec. Required keys must be a subset of relevant; hard negatives must be disjoint.

- [ ] Add failing tests with complete literal keys:
```ts
const oracle = {
  requiredResourceKeys: ["knowledge-article:a"],
  relevantResourceKeys: ["knowledge-article:a", "knowledge-article:b"],
  hardNegativeResourceKeys: ["knowledge-article:c"],
  labelsComplete: false,
  resourceCoverage: {
    "knowledge-article": "adequate", "known-cause": "not-expected",
    "diagnostic-playbook": "missing", "resolved-ticket": "not-expected",
  },
} as const;
expect(scorePool(["knowledge-article:a"], oracle).candidateRecall).toBe(0.5);
expect(scorePool(["knowledge-article:a"], oracle).requiredCoverage).toBe(1);
expect(scoreRanked(["knowledge-article:a"], oracle, 5).precisionAtK).toBeNull();
```
- [ ] Run `npx vitest run test/retrieval-evaluation.test.ts test/evaluation-oracle.test.ts`.
- [ ] Implement set-based metrics, deduplicating keys. For complete labels, Precision@K denominator is K, including unfilled slots; record returned count as a separate diagnostic in the report. Empty relevant/required denominator yields null, not 100%; aggregate only applicable scenarios and show excluded counts.
- [ ] Report channel/type Recall@1/@3/@5 and Precision@K when complete. Union reports candidate recall, required coverage, pool size, and K budget only. Baseline article coverage uses article-only target denominators; report its missing other resource families explicitly instead of implying classifier failure at discovering unsupported types.
- [ ] Audit the existing scenario families and contrast groups by reading actual articles/descriptors and eligible case snapshots. Add reviewed required/relevant/hard-negative keys and rationale to the existing oracle entries. Do not automatically label current retrieval hits relevant, copy every legacy article label without review, or set exhaustive labels true by default.
- [ ] Validate every labeled key against a frozen corpus snapshot. Include the four approved contrast families: webhook rotation/latency, SMS quiet-hours/consent delay, Shopify mapping/general sync, and editor session/platform loading. Mark genuine corpus gaps explicitly; do not fabricate cases or playbooks to improve scores.
- [ ] Treat unjudged hits as review candidates. An oracle gap requires a reviewed useful resource absent from labels; never infer it from a high score. Corpus gaps require coverage annotations, not zero hits. Channel/index failure is a system failure, never a corpus gap.
- [ ] Exclude self-ticket case memories and future resolved cases relative to the scenario's evaluation cutoff; freeze and hash the eligible corpus per evaluation run. Do not leak the target ticket's final diagnosis into its own retrieval corpus.
- [ ] Run scoring tests, existing oracle audit, and taxonomy inference evaluation; verify unchanged existing recommendation scoring. Commit `feat: evaluate retrieval recall and corpus coverage`.

## Task 9: Operations CLI, empirical report, and final verification

**Files:** Create `scripts/retrieval-index.ts`, `scripts/evaluate-retrieval.ts`, `test/retrieval-cli.test.ts`; modify `package.json`, `README.md` and, if necessary, `.gitignore`. During execution save reviewed empirical artifacts under `reports/retrieval/`.

**Interfaces:** Reuse `RetrievalStore`, `IndexManager`, `retrieve`, and the two scoring functions; no second implementation of indexing or search.

- [ ] Write CLI tests in temporary directories. Validate unknown command errors, JSON status, nonzero integrity failure exit, lexical-only operation, and deterministic output with a fixed corpus/provider.
- [ ] Run `npx vitest run test/retrieval-cli.test.ts`.
- [ ] Add scripts:
```json
{
  "retrieval:index": "npm run build && node dist/scripts/retrieval-index.js",
  "evaluate:retrieval": "npm run build && node dist/scripts/evaluate-retrieval.js"
}
```
  Index CLI accepts exactly `status`, `refresh`, `rebuild`, `validate`. Status/validate do not initialize or mutate absent databases. Refresh/rebuild only mutate the derived retrieval store. Use read-only authoritative readers; do not call whole-runtime startup that starts learning delivery or imports operational state.
- [ ] The evaluation CLI defaults to an isolated fixture corpus and no network. It accepts `--live-embeddings` only with an explicit provider tuple. Use cached real vectors tied to corpus hash/model for reproducibility; never serialize query vectors. Controlled unit vectors test mechanics only and must be labeled synthetic, not a quality experiment.
- [ ] Emit JSON and Markdown containing source commit, oracle hash, scenario cutoff, corpus hash, representation version, FTS tokenization configuration, model identity, K budget, candidate pools and per-representation scores, channel statuses, per-type and per-family metrics, baseline comparison, corpus coverage, and unjudged hits. Neither file contains raw ticket text or provider payloads.
- [ ] Document these commands, generated database location, trace ring lifetime, source eligibility, failure codes, local endpoint configuration, and the B3/B4/B5 boundary. Explain that compatible dimensions alone do not imply compatible embeddings; model revision must change with the embedding space.
- [ ] Obtain a real configured embedding run when authorized and available. Report measured improvement over deterministic discovery and preservation of baseline required resources. If no real embedding endpoint/cached vectors are available, finish all offline deliverables and explicitly report semantic empirical evidence as outstanding; do not claim full B3 acceptance or tune labels to force a gain.
- [ ] Final verification in the isolated implementation worktree:
```powershell
npm run typecheck
npm run build
npm test -- --maxWorkers=2
npm run evaluate:taxonomy-inference
npm run evaluate:oracle-audit
npm run evaluate:retrieval
git diff --check
```
  The existing npm test pretest repeats build/typecheck; that is current repo behavior, not a request to rewrite scripts. If integration timing fails, diagnose and rerun the affected scope; do not inflate timeouts or claim every failure is unrelated.
- [ ] Review the entire branch for source-selection leakage, query/trace text leakage, authority changes, stale vectors, quota aggregation, and unsolicited frameworks. Record actual test counts and measured results, not historical counts from B2.
- [ ] Commit verified CLI/docs/report files with explicit paths: `feat: expose retrieval maintenance and evaluation reports`. Do not commit databases, credentials, unrelated reports, generated dist, or unreviewed artifacts. Branch integration/push follows the user's execution instructions.

## Plan self-review and acceptance matrix

| Approved requirement | Tasks / evidence |
|---|---|
| Four resource families, identities, eligibility | 1–2; source exclusions and collision tests |
| Safe normalized text; no raw transcripts or executable source | 1–2; privacy fixtures and sentinel function |
| FTS5, local vectors, separate derived store | 3, 5–6 |
| Incremental hashes, deletion, stale-vector invalidation | 3–4 |
| Full rebuild atomicity, coherent query snapshot | 3–4, 6 |
| Local-first optional provider, explicit degradation | 4–7 |
| Customer-only evidence and watermark/hash provenance | 7 |
| Per-type distinct-resource K, references outside quota | 6 |
| Complete raw provenance and neutral union order | 6–7 |
| Shadow parity, R1 replay and failure isolation | 7 |
| Oracle completeness, ranked metrics versus union coverage | 8 |
| Contrast groups, baseline comparison, corpus/oracle gaps | 8–9 |
| Operations commands and empirical B4 evidence | 9 |
| No B4/B5 authority, no speculative framework | Global constraints; branch review |

Self-review performed against the formal spec, original approved discussion, and current repository seams. The plan resolves the unordered-union metric contradiction, incorrect classifier path, missing resolution eligibility, representation-level provenance loss, and atomic snapshot requirements explicitly. No production behavior or implementation files are changed by this planning work.

Review this plan before execution. The preferred execution mode is one fresh implementer per task with spec and code review between tasks; inline execution with the same checkpoints is also supported.
