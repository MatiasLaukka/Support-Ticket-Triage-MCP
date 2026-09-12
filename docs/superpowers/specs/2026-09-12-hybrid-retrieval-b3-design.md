# B3 Hybrid Retrieval — Design Record

**Status:** Approved architecture; implementation plan intentionally deferred
**Date:** 2026-09-12
**Repository:** `MatiasLaukka/Support-Ticket-Triage-MCP`
**Baseline:** `main` / `origin/main` at `61b143a`

## 1. Purpose

B3 introduces a separate candidate-discovery subsystem for the support-triage application. Given a ticket and the customer's observed evidence, B3 finds a broad, high-recall set of potentially useful resources across:

- knowledge articles;
- approved known causes;
- diagnostic playbooks; and
- eligible resolved tickets represented as normalized case memories.

B3 separates resource discovery from the responsibilities that follow it:

```text
classification / taxonomy  →  what kind of ticket is this?
retrieval                  →  what resources might be relevant?
ranking (B4)               →  which candidates deserve attention?
applicability (B5)        →  which candidates fit this case?
diagnosis                  →  what do we believe happened?
governance                →  what may happen next?
```

The output of B3 is therefore an inspectable candidate pool and provenance, not a diagnosis, applicability judgment, final rank, or governed action.

## 2. Current context

The current application still couples resource selection to deterministic classification. Rules in `src/classifier.ts` can emit `knowledge:<article-id>` signals, `chooseKnowledgeArticles()` filters and prioritizes those signals, and `src/approval-desk/ai-evaluation.ts` loads the articles that have already been selected for downstream drafting and diagnostic behavior.

That path gives the application high-precision associations, safety inclusions, and known-cause links, but it is also a discovery gate: a newly added or differently worded resource is not generally discoverable unless a rule or other existing signal names it. B3 addresses that architectural gap without removing the current authoritative path during the B3 rollout.

## 3. Scope

B3 delivers a complete candidate-discovery slice, not merely an embedding experiment.

### Included

- A common retrieval-resource identity and adapter boundary for all four resource families.
- Deterministic retrieval representations:
  - structure-aware knowledge-article chunks;
  - approved known-cause representations;
  - declarative diagnostic-playbook descriptors; and
  - normalized, sanitized resolved-ticket case memories.
- A separate, disposable `retrieval.sqlite` projection containing source metadata, representations, FTS5, embeddings, and index-generation metadata.
- Content-hash incremental indexing, deletion handling, stale-vector invalidation, integrity validation, and an explicit full-rebuild operation.
- SQLite FTS5/BM25 lexical retrieval.
- A provider-neutral embedding boundary with exact cosine search for the initial corpus scale.
- Customer-evidence query construction that excludes system-authored text from the free-text query.
- Per-resource-type top-K retrieval, independent channel execution, candidate union, deduplication, chunk-to-resource aggregation, and raw provenance preservation.
- Shadow runtime integration that records bounded advisory retrieval provenance without changing live authority.
- An evaluation oracle extension with required resources, relevant resources, hard negatives, label completeness, retrieval metrics, and corpus-coverage audit.

### Out of scope for B3

- Final hybrid scoring or weighted fusion.
- Applicability, diagnosis, or confidence judgments derived from similarity.
- Taxonomy-based hard filtering or taxonomy authority over retrieval decisions.
- Replacing the live `knowledgeArticleIds` path, changing recommendations, changing drafting, executing playbooks, changing lifecycle, or changing customer-facing behavior.
- Automatic knowledge creation, promotion, revocation, or corpus authoring.
- An external search service, vector database, ANN/HNSW index, or distributed retrieval deployment.
- Persisting raw conversations, raw payloads, customer identifiers, secrets, model prompts, provider payloads, or hidden reasoning in the retrieval corpus or trace.
- The B4 ranking policy or the B5 applicability policy.
- The implementation plan. This record defines the architecture and completion boundary only.

## 4. Design principles and invariants

### 4.1 B3 discovers evidence; it does not judge it

Retrieval signals are evidence that a resource was discoverable through a channel. They are not relevance probabilities or operational decisions.

```text
cosine similarity = 0.94
        ≠
94% probability that the resource is the cause
```

The B3 candidate contract must not contain `finalScore`, `relevanceProbability`, `applicable`, `diagnosisProbability`, or `selectedForDraft`. B4 owns ranking and B5 owns applicability.

### 4.2 Retrieval is a discovery path alongside deterministic associations

BM25 and semantic retrieval become primary discovery mechanisms for the corpus. Existing deterministic classifier associations, safety inclusions, and known-cause links remain high-precision signals and authority constraints. They are preserved as provenance; they are not the only gate through which a resource can be discovered.

Taxonomy may travel as structured advisory metadata for analysis and evaluation. It must not become a hard retrieval filter, and it must not acquire authority over routing, diagnosis, knowledge selection, recommendation generation, drafting, or lifecycle behavior.

### 4.3 The index is derived state

Source objects remain authoritative in their existing stores. `retrieval.sqlite` contains rebuildable search representations only. Deleting the retrieval database must not delete or invalidate a ticket, diagnosis, knowledge article, known cause, playbook, or approved knowledge version.

### 4.4 Semantic retrieval is optional enhancement

Lexical retrieval must remain available without an embedding provider. Missing configuration, model availability, provider failure, or an in-progress rebuild degrades semantic retrieval and is recorded explicitly; it does not make normal ticket evaluation unavailable.

Unexpected corruption or invariant violations are not converted into a misleading empty-result success. They surface as retrieval/index failures with enough context for diagnosis.

### 4.5 Observed customer evidence is the query basis

The free-text retrieval query is constructed from:

- the ticket subject;
- the ticket description; and
- subsequent customer-authored replies.

Support-agent text, model-generated text, previous recommendations, diagnoses, and drafted replies are excluded. This prevents the system from retrieving a resource merely because the system itself mentioned that resource earlier.

Taxonomy and deterministic references may travel alongside the query as structured metadata. They are not concatenated into `queryText` as if the customer had stated them.

### 4.6 Retrieval cannot change authority

B3 must remain observational during its first rollout. A B3 failure can affect retrieval provenance and evaluation output only. It cannot roll back, reject, or mutate an authoritative operational or knowledge write, and it cannot alter the current recommendation or customer response.

## 5. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| Dedicated retrieval subsystem with a rebuildable projection | Keeps adapters, representations, indexing, retrieval, provenance, and evaluation independently testable; supports B4/B5 later | **Adopt** |
| Bolt retrieval into classifier/recommendation construction | Less initial plumbing, but couples classification, discovery, ranking, and drafting again | Reject |
| External vector/search service from the start | Adds deployment, privacy, and operational complexity before corpus measurements justify it | Defer |

The adopted approach is local-first and exact at the current portfolio/demo corpus scale. The interfaces hide the implementation so a later measured scale-up can replace exact search without changing the candidate contract.

## 6. System architecture

```text
Authoritative sources
├─ knowledge articles
├─ approved known causes
├─ declarative playbook descriptors
└─ eligible completed operational diagnoses
        │
        ▼
RetrievalSourceAdapters
        │
        ▼
Deterministic representation builders
        │
        ▼
IndexManager ────────────────┐
        │                     │
        ▼                     │
retrieval.sqlite             │
├─ resource metadata          │
├─ representations/chunks     │
├─ FTS5 lexical index         │
├─ embedding vectors          │
└─ index/model metadata       │
                              │
Ticket + customer evidence   │
        │                     │
        ▼                     │
RetrievalQueryBuilder        │
        │                     │
        ├───────────────┐     │
        ▼               ▼     │
LexicalRetriever  SemanticRetriever
FTS5 / BM25       embeddings / exact cosine
        │               │
        └──────┬────────┘
               ▼
Deterministic and known-cause references
               │
               ▼
CandidateUnion
deduplication + chunk aggregation + provenance
               │
               ▼
RetrievalCandidate[]
               │
       ┌───────┴─────────┐
       ▼                 ▼
Bounded trace       Evaluation
shadow only         Recall@K / coverage / audit
```

The key boundary is that the retrieval subsystem returns candidates to observation and evaluation. It does not directly feed them into a governed decision during B3.

## 7. Resource identity and representations

### 7.1 Common identity

Every indexed object has a namespaced stable key so equal source IDs from different families cannot collide.

```text
knowledge-article:webhook-signature-validation
known-cause:webhook-secret-rotation
diagnostic-playbook:webhook-delivery-diagnosis
resolved-ticket:TKT-1042
```

The common conceptual contract is:

```ts
type RetrievalResourceType =
  | "knowledge-article"
  | "known-cause"
  | "diagnostic-playbook"
  | "resolved-ticket";

type RetrievalResource = {
  key: string;
  type: RetrievalResourceType;
  sourceId: string;
  sourceVersion?: string;
  contentHash: string;
  taxonomy?: {
    productSurfaces: readonly string[];
    problemClasses: readonly string[];
  };
};

type RetrievalRepresentation = {
  id: string;
  resourceKey: string;
  kind: string;
  ordinal: number;
  title: string;
  heading?: string;
  lexicalText: string;
  semanticText: string;
  contentHash: string;
};
```

These are projections of authoritative objects. B3 does not create a second authoritative knowledge model.

### 7.2 Knowledge articles

Articles use structure-aware representations:

1. split at real document headings and sections;
2. preserve the article title and section heading with each representation;
3. split only oversized sections, deterministically at paragraph boundaries; and
4. include tags and other approved search terms in the lexical representation.

There is no LLM-driven chunking. Retrieval happens at representation level, but the result is aggregated back to the parent article.

```text
knowledge-article:webhook-signature-validation
├─ representation 0: Overview
├─ representation 1: Signature calculation
├─ representation 2: Secret rotation
└─ representation 3: Raw body handling
```

The initial semantic representation policy is resource-specific: articles may have multiple structure-aware representations; short structured resources use one canonical representation.

### 7.3 Known causes

Known causes use one deterministic structured representation containing approved/current descriptive fields such as:

- label and problem summary;
- evidence policy;
- investigation steps;
- safe next-step description; and
- linked knowledge-article IDs where appropriate.

The deterministic `matches()` function remains executable logic and provenance. Its source code is never indexed.

Learned known causes are eligible for indexing only when their existing lifecycle says they are approved and production-eligible. Candidate, rejected, superseded, and otherwise ineligible knowledge objects do not become retrieval evidence merely because they are present in a learning store.

### 7.4 Diagnostic playbooks

Playbook retrieval is based on a declarative descriptor alongside the executable playbook. The descriptor is searchable; the executable behavior remains authoritative and is not invoked by retrieval.

```ts
type DiagnosticPlaybookDescriptor = {
  id: string;
  title: string;
  summary: string;
  symptoms: readonly string[];
  evidenceGoals: readonly string[];
  investigationSteps: readonly string[];
  linkedKnowledgeArticleIds: readonly string[];
  taxonomy?: {
    productSurfaces: readonly string[];
    problemClasses: readonly string[];
  };
};
```

The following are separate facts:

```text
playbook was retrieved
        ≠
playbook applies to this ticket
        ≠
permission to execute the playbook
```

Applicability and execution remain later governed behavior.

### 7.5 Resolved tickets

Resolved tickets are indexed as normalized case memories, never as raw transcripts. The adapter should reuse the existing operational authority boundary for eligible completed diagnoses, including the filtering performed by `OperationalCompletedDiagnosisSource`.

A case memory may contain:

```text
problem summary
observed symptoms
safe evidence description
final diagnosis
verified outcome or applied fix
product surface
problem class
source ticket ID and version metadata
```

The initial B3 representation is one canonical normalized case memory. It must not describe proposed `fixSteps` as a verified applied fix. A recommended action becomes an outcome only when the authoritative history proves that it was applied and verified.

## 8. Privacy and data boundaries

The corpus contains normalized searchable representations, not arbitrary copies of operational data.

| Source | Searchable projection | Explicit exclusion |
|---|---|---|
| Knowledge article | Approved article content, headings, and approved search terms | Unapproved/private operational material |
| Known cause | Approved/current descriptive fields and evidence policy | Function source, rejected/superseded objects, provider payloads |
| Diagnostic playbook | Declarative symptoms, evidence goals, and investigation descriptors | Executable source, hidden reasoning, execution authority |
| Resolved ticket | Sanitized case memory with verified outcome where proven | Raw conversation, internal free-form notes, customer identifiers, secrets, raw payloads |

The following never belongs in the retrieval corpus or a retrieval trace:

```text
customer names and email addresses
account identifiers
API keys, tokens, passwords, cookies, or signing secrets
raw URLs containing credentials
raw request/response payloads
entire conversation transcripts
internal free-form operator notes
model prompts, hidden reasoning, or raw provider responses
machine paths or unrelated runtime state
```

Runtime query text is transient:

```text
subject + description + customer replies
                ↓
        transient RetrievalQuery
                ↓
          lexical / semantic search
                ↓
              discarded
```

The trace preserves reproducibility metadata without persisting another copy of the customer message. It may contain the ticket ID, ticket revision, customer-reply watermark, query-content hash, index generation, candidate IDs, scores, ranks, and channel status.

Embedding processing is local-first. The `EmbeddingProvider` boundary remains provider-neutral, and an explicitly configured hosted provider may be used, but only the retrieval text required for embedding is sent. Operational snapshots, lifecycle state, AI traces, internal rationale, and hidden reasoning are never sent as embedding input.

## 9. `retrieval.sqlite` projection

The physical schema remains deliberately small and independent from `operational.sqlite` and `learning.sqlite`.

```text
retrieval_resources
────────────────────────────────────
resource_key        PRIMARY KEY
resource_type
source_id
source_version
content_hash
metadata_json

retrieval_representations
────────────────────────────────────
representation_id   PRIMARY KEY
resource_key        FOREIGN KEY
kind
ordinal
title
heading
lexical_text
semantic_text
content_hash

retrieval_fts       FTS5 virtual table
────────────────────────────────────
representation_id   UNINDEXED
resource_key        UNINDEXED
title
heading
body
keywords

retrieval_embeddings
────────────────────────────────────
representation_id
model_id
dimensions
vector_blob
content_hash
status

retrieval_index_metadata
────────────────────────────────────
schema_version
representation_version
lexical_generation
semantic_generation
embedding_model
embedding_dimensions
semantic_status
```

Vectors are initially stored as compact `Float32` blobs. Because B3 targets a small corpus and exact, auditable behavior, semantic retrieval loads compatible ready vectors and calculates cosine similarity in application code. No SQLite vector extension or approximate-nearest-neighbor index is required for B3.

The abstraction remains replaceable:

```text
EmbeddingProvider → float[] → retrieval.sqlite

SemanticRetriever → exact cosine for B3
                 → later ANN implementation if measurements justify it
```

Queries do not receive durable vector rows. Only corpus representations belong in the projection.

## 10. Index lifecycle, consistency, and failure handling

### 10.1 Startup reconciliation

Startup does not require successful embedding generation:

```text
application startup
      ↓
open retrieval.sqlite
      ↓
apply compatible retrieval migrations
      ↓
validate schema and index metadata
      ↓
reconcile authoritative resources by content hash
      ├─ lexical entries can become current immediately
      └─ semantic work may remain pending or degraded
      ↓
start normal runtime
```

Reconciliation is idempotent. If the process dies after an authoritative write but before refreshing the projection, the next startup observes the hash mismatch and repairs the derived index. No additional durable outbox is required solely to deliver retrieval projection updates.

### 10.2 Incremental updates and explicit rebuilds

For each resource, the adapter builds a canonical representation and hash:

```text
source hash == indexed hash  → no work
new or changed              → replace representations and FTS rows
changed content             → invalidate old vector before new vector use
deleted source              → remove its projection entries
```

An old vector must never silently represent new content. If the embedding provider is unavailable after a content change, the new lexical representation remains searchable while the old semantic vector is marked stale and excluded.

Full rebuild is an explicit operation for development, migration, recovery, representation-version changes, or embedding-model changes. Normal startup must not rebuild the complete corpus merely because the process restarted.

### 10.3 Model and representation generations

The index metadata records the representation version, embedding model, dimensions, and generations. A model or representation-version change cannot mix incompatible vectors. The semantic channel remains stale/degraded until compatible vectors are available.

### 10.4 Concurrency

`IndexManager` has one serialized writer path. Lexical retrieval, semantic retrieval, evaluation, and trace reads operate against completed index state.

```text
readers: lexical query / semantic query / evaluation / trace
                              ↑
                       completed state
                              ↑
                 serialized IndexManager writer
```

The single-writer rule is sufficient at the initial corpus scale and keeps index generation transitions auditable.

### 10.5 Channel status

Each channel reports its own state rather than allowing the union to imply success:

```ts
type RetrievalChannelStatus =
  | "used"
  | "unavailable"
  | "stale"
  | "failed";
```

Examples include:

```text
lexical: used
semantic: unavailable / provider-not-configured

lexical: used
semantic: stale / model-version-changed

lexical: failed / FTS query error
semantic: used
```

Expected provider unavailability degrades the semantic channel. An unexpected database corruption or invariant violation fails loudly instead of being represented as a successful search with zero matches.

Most importantly, a retrieval-index failure can never roll back or reject an authoritative operational or knowledge write.

## 11. Retrieval execution and candidate union

### 11.1 Query contract

The query is built once and executed independently by each channel:

```ts
type RetrievalQuery = {
  queryText: string;
  ticketId: string;
  sourceRevision: number;
  customerReplyWatermark: string;
  structuredContext: {
    taxonomy?: unknown;
    deterministicReferences: readonly string[];
  };
};
```

`queryText` contains only observed customer-side evidence. `structuredContext` lets evaluation distinguish customer wording from classifier/taxonomy associations without blending them into lexical or semantic text.

### 11.2 Independent channels

The initial channels are:

- `LexicalRetriever`: SQLite FTS5 with BM25-style ranking for exact terminology, identifiers, error codes, product names, and rare tokens.
- `SemanticRetriever`: provider-neutral query embedding plus exact cosine similarity over compatible ready corpus vectors.
- deterministic association references: classifier-emitted article associations, safety inclusions, and equivalent high-precision references;
- known-cause references: approved known-cause links to their related resources.

Lexical and semantic retrieval are independent. A semantic failure does not prevent lexical and deterministic discovery. A lexical failure is recorded as lexical failure even when another channel returns candidates.

### 11.3 Type-aware breadth

Each channel retrieves a configurable top-K per resource type:

```text
                    lexical        semantic
knowledge articles   top K           top K
known causes         top K           top K
playbooks            top K           top K
resolved tickets     top K           top K
```

The initial evaluation may use a modest default such as five per type per channel, but K is configuration, not an architectural relevance claim. Type-aware limits prevent a large resolved-ticket corpus from crowding all other resource families out of the candidate pool.

### 11.4 Candidate contract and union

Candidates deduplicate by stable `resourceKey`. Each candidate retains every meaningful signal rather than collapsing channels into an unsupported score.

```ts
type RetrievalCandidate = {
  resourceKey: string;
  resourceType: RetrievalResourceType;

  lexical?: {
    bestRank: number;
    bestBm25Score: number;
    matchedRepresentationIds: readonly string[];
  };

  semantic?: {
    bestRank: number;
    bestCosineSimilarity: number;
    matchedRepresentationIds: readonly string[];
  };

  deterministicReferences: readonly {
    source: string;
    reason: string;
  }[];

  knownCauseReferences: readonly {
    source: string;
    reason: string;
  }[];

  taxonomy?: {
    productSurfaces: readonly string[];
    problemClasses: readonly string[];
  };
};
```

If three article chunks match, B3 returns one article candidate with all matched representation IDs and the best raw score/rank for each channel. It does not return three apparent copies of the article, and it does not invent a weighted hybrid score.

The resulting union is an evidence pool for B4 and evaluation, not an ordered decision list. Any display ordering before B4 must be explicitly labeled as channel/type order or raw channel rank, never as final relevance.

## 12. Shadow runtime and provenance

During B3, the existing production path remains authoritative:

```text
ticket evaluation
    ├─ current deterministic selection → recommendation, drafting, playbooks
    │                                    remains authoritative
    └─ B3 retrieval                  → candidate pool + bounded trace
                                         evaluation only
```

B3 must not mutate:

```text
knowledgeArticleIds
knownCause
diagnosis
supportState
playbook execution
customer draft
recommended action
lifecycle state
```

The bounded retrieval trace is advisory provenance, not authoritative ticket state. It may include:

```text
ticket ID and source revision
customer-reply watermark
query-content hash
representation/index generations
embedding model and dimensions
lexical status and bounded candidates
semantic status and bounded candidates
deterministic references
known-cause references
deduplicated candidate keys, scores, and ranks
```

It must not include full article/chunk text or a second permanent copy of the customer query. Evaluation runs may capture the complete candidate list separately as an evaluation artifact; normal runtime traces remain bounded.

## 13. Evaluation and oracle design

### 13.1 Extend the existing oracle

The existing `EvaluationOracle` and its distinction between required and relevant knowledge articles remain useful for current recommendation evaluation. B3 adds a retrieval expectation rather than replacing the existing contract:

```ts
type RetrievalOracle = {
  requiredResourceKeys: readonly string[];
  relevantResourceKeys: readonly string[];
  hardNegativeResourceKeys?: readonly string[];
  labelsComplete: boolean;
};
```

The meanings are:

```text
required resource
→ missing it is a serious discovery failure

relevant resource
→ useful candidate for recall/precision analysis

hard negative
→ deliberately similar resource used to test discrimination
```

Hard negatives are observations for B3 evaluation. They do not cause B3 to filter a resource at runtime.

### 13.2 Metrics

B3 reports metrics by resource type and for the complete union:

- **Required-resource coverage@K:** the proportion of required keys present within the evaluated candidate cutoff.
- **Recall@K against known targets:** the proportion of curated relevant keys surfaced within K. This remains useful when the oracle is incomplete, but its interpretation must say that it is recall against known targets rather than proof of exhaustive recall.
- **Precision@K:** reported only when `labelsComplete` is true and the relevant labels are intended to be exhaustive. Unreviewed resources cannot be treated as irrelevant.
- **Candidate recall:** whether a required/relevant resource appears anywhere in the configured candidate pool, regardless of its later rank.
- **Per-channel and union comparisons:** BM25, semantic, deterministic associations, known-cause references, and the unweighted union are compared without presenting the union as a fused scoring model.
- **Degraded-channel observations:** provider-unavailable, stale-index, and failed-channel rates remain visible rather than disappearing into aggregate scores.

Illustrative output shape:

```text
BM25         Recall@5  Recall@10  required coverage
Semantic     Recall@5  Recall@10  required coverage
Associations candidate coverage
Union        Recall@5  Recall@10  candidate coverage
```

All evaluation output records the corpus/index generation, representation version, embedding model where applicable, K configuration, and channel status so a result can be reproduced or explained.

### 13.3 Corpus-coverage audit

Retrieval quality and corpus quality are separate questions. A low score is not automatically a retriever failure.

Each curated scenario may record resource coverage by type:

```ts
type ResourceCoverage = {
  knowledgeArticles: "adequate" | "missing" | "uncertain";
  knownCauses: "adequate" | "missing" | "not-expected" | "uncertain";
  diagnosticPlaybooks: "adequate" | "missing" | "uncertain";
  resolvedTickets: "adequate" | "missing" | "not-expected" | "uncertain";
};
```

The audit distinguishes:

```text
retrieval miss
  relevant resource exists, but B3 did not surface it

corpus gap
  the support problem is legitimate, but no adequate resource exists

oracle gap
  B3 surfaced a useful resource that the evaluation labels did not identify
```

If no adequate resource exists, B3 should return weak or no candidates and expose the coverage gap. It must not force a vaguely similar resource into an apparently successful result merely to improve a metric.

## 14. Testing and verification expectations

The implementation plan must turn these expectations into focused tests and gates:

- representation builders produce deterministic content and stable hashes;
- article chunking respects headings, paragraph boundaries, title/heading context, and parent-resource aggregation;
- ineligible known causes and unapproved learning objects never enter the corpus;
- playbook descriptors are searchable without invoking executable playbooks;
- resolved-ticket adapters use eligible completed-diagnosis authority and do not label proposed fixes as verified outcomes;
- namespaced resource keys cannot collide across resource families;
- FTS5/BM25 returns exact terms and rare identifiers predictably;
- exact cosine search excludes stale, incompatible, or wrong-model vectors;
- incremental updates replace changed representations, invalidate old vectors, remove deletions, and are idempotent;
- startup reconciliation repairs an interrupted derived-index update;
- model/representation generation changes mark semantic state stale rather than mixing vectors;
- a single serialized writer preserves coherent index generations under concurrent refresh requests;
- semantic provider unavailability leaves lexical/deterministic retrieval usable and records the exact degraded state;
- unexpected index corruption is surfaced rather than converted into empty success;
- per-type top-K limits prevent one resource family from crowding out the others;
- union deduplicates by resource key and preserves all raw channel/reference provenance;
- customer replies affect the query while support/model-authored text does not;
- traces are bounded and contain identifiers/metadata rather than full query or resource text;
- shadow execution leaves recommendations, diagnoses, lifecycle, playbooks, drafts, and customer-facing output unchanged;
- required-resource coverage, recall, precision completeness rules, hard negatives, and corpus-gap classifications are deterministic and inspectable;
- a complete candidate-pool evaluation can be compared with the current deterministic selection baseline.

## 15. Completion criteria

B3 is complete when the repository contains and verifies:

1. Four resource adapters with deterministic, privacy-bounded representations.
2. A separate rebuildable `retrieval.sqlite` projection with indexed resources, representations, FTS5, compatible embeddings, and generation metadata.
3. Content-hash incremental maintenance, stale-vector exclusion, deletion handling, integrity validation, and explicit full rebuild.
4. Independent FTS5/BM25 and optional exact-cosine retrieval behind replaceable interfaces.
5. Customer-evidence query construction with system-authored text excluded from the free-text query.
6. Configurable per-type top-K retrieval and a resource-deduplicated, provenance-preserving union with no arbitrary fusion score.
7. Bounded advisory shadow traces that cannot change authoritative behavior and do not duplicate sensitive text.
8. Retrieval-oracle metrics that correctly gate Precision@K on exhaustive labels, preserve required-resource coverage, and report channel degradation.
9. Corpus-coverage reporting that distinguishes retrieval misses, corpus gaps, and oracle gaps.
10. Verification that B3 failure cannot reject or mutate authoritative operational or knowledge writes.

Completion does not include a final ranking model, applicability decision, diagnostic authority, live recommendation replacement, or customer-facing behavior change.

## 16. Future boundaries

The next stages consume this contract without changing its meaning:

```text
B3 candidate pool + provenance
              ↓
B4 final ranking / fusion policy
              ↓
B5 applicability and governed use
```

B4 may define and validate a ranking policy using the raw signals B3 preserves. B5 may decide whether a candidate applies. Neither responsibility should be smuggled into B3 under names such as `hybridScore`, `bestMatch`, or `recommendedResource`.

The B3 implementation must preserve the existing B2 boundary: taxonomy is advisory context, not operational authority. Retrieval makes more resources discoverable; it does not turn similarity, taxonomy, or historical resemblance into permission to diagnose, execute, draft, route, or close.
