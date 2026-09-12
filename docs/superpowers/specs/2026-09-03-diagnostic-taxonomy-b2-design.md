# B2 Persisted Advisory Diagnostic Taxonomy Integration — Design

**Original date:** 2026-09-03

**R1 reconciliation:** 2026-09-10

**Repository:** `MatiasLaukka/Support-Ticket-Triage-MCP`

**Reconciled baseline:** `origin/main` at `f31f64c38d6715d435307caaf1370d3b9c8411bd`

**Schema:** v4; no migration required

**Status:** Revised after Reliability R1; ready for review before implementation

## 1. Purpose

B2 turns the existing taxonomy research capability into a durable, auditable, advisory signal in the real operational evaluation workflow.

It connects:

- the canonical diagnostic-taxonomy contract;
- deterministic taxonomy inference;
- optional GPT/OpenAI-compatible taxonomy reasoning;
- a sanitized taxonomy execution trace;
- Phase A immutable taxonomy revisions; and
- the Reliability R1 command dispatcher, receipt, transaction, and replay boundaries.

B2 does **not** give taxonomy authority over routing, lifecycle, diagnosis, knowledge selection, recommendation generation, drafting, or customer-facing behavior.

The future modular sequence remains:

```text
B2 taxonomy-stage
B3 retrieval-stage
B4 ranking-stage
B5 applicability-stage
```

Semantic search and three-lane ranking are deliberately deferred until B2 provides a trustworthy operational taxonomy signal.

## 2. Decisions retained from the approved design

The following approved B2 decisions remain valid:

1. Taxonomy is advisory, not diagnostic truth.
2. Deterministic taxonomy always runs for a B2 operational evaluation.
3. A valid GPT candidate is canonical when GPT use is allowed and available.
4. Expected provider failures degrade to deterministic taxonomy and are recorded.
5. Unexpected internal or invariant failures fail preparation.
6. Prompt-injection detection suppresses GPT taxonomy but not deterministic taxonomy.
7. Initial inference produces at most `supported`, never `established`.
8. Only semantic taxonomy or support changes create immutable revisions.
9. Initial-classification taxonomy cannot overwrite stronger evidence-backed taxonomy.
10. No Approval Desk taxonomy UI or SQLite migration is required.
11. Taxonomy remains structurally unable to influence the current recommendation or draft.
12. B3/B4/B5 retrieval, ranking, and applicability behavior stays out of scope.

## 3. Reliability R1 changes that supersede the original design

The original B2 design targeted the pre-R1 `submitOperationalEvaluation()` path. R1 introduced the authoritative production path:

```text
HTTP or MCP
    -> evaluateTicketCommand(raw caller intent, command ID)
    -> OperationalCommandDispatcher.run(...)
       1. validate caller intent
       2. calculate v2 request identity
       3. replay committed receipt, if present
       4. join/conflict with same-process in-flight command
       5. enforce operational readiness
       6. prepare outside the write transaction
       7. begin transaction and recheck receipt
       8. commit authoritative write set
       9. persist immutable command result
    -> replayOperationalEvaluation(...)
```

Consequently:

- `evaluation-command.ts`, not the HTTP/MCP adapters, owns production evaluation preparation.
- `TriageService.commitOperationalEvaluation()` owns transactional validation and writes.
- `TriageService.replayOperationalEvaluation()` owns immutable recovery.
- `OperationalCommandDispatcher` owns v2 identity, early replay, in-flight joining, readiness gating, final receipt recheck, and result persistence.
- Provider output, generated taxonomy, trace, timestamps, IDs, latency, and usage are **prepared output**, not caller intent and not part of the v2 request hash.
- The old instruction that changed generated trace/provenance under the same key must conflict is removed. A replay never regenerates those values; it returns the committed result.
- B2 must not add a second dispatcher, direct `beginCommand*()` call, direct receipt write, or parallel idempotency path.

## 4. Components and ownership

### 4.1 Existing components retained

`src/diagnostic-taxonomy.ts` remains the canonical taxonomy domain contract.

`src/taxonomy-inference.ts` remains the pure deterministic candidate generator: synchronous, network-free, persistence-free, and without workflow authority.

`src/taxonomy-reasoning-provider.ts` remains the model-agnostic provider boundary. B2 hardens its configuration and expected-failure typing but does not merge orchestration into it.

Phase A remains authoritative for:

- `diagnostic_taxonomy_revisions`;
- `diagnostic-taxonomy-revised` operational events;
- contiguous per-ticket taxonomy revisions;
- event-linked immutable snapshots; and
- restart reconstruction.

### 4.2 New taxonomy stage

Add `src/taxonomy-stage.ts`.

It owns:

- deterministic inference;
- taxonomy preference resolution;
- GPT eligibility and invocation;
- expected provider-failure mapping;
- canonical candidate selection;
- conservative support and basis derivation; and
- sanitized taxonomy trace construction.

It does not own repositories, SQLite, operational IDs, transactions, receipts, lifecycle transitions, recommendation generation, retrieval, or ranking.

Conceptual contract:

```ts
export interface TaxonomyStageInput {
  ticket: Ticket;
  conversationText: string;
  deterministicClassification: TicketClassification;
  preference: AiPreference;
  promptInjectionDetected: boolean;
  provider?: TaxonomyReasoningProvider;
}

export interface TaxonomyStageResult {
  context: DiagnosticTaxonomyContext;
  trace: TaxonomyExecutionTrace;
}

export function runTaxonomyStage(
  input: TaxonomyStageInput,
): Promise<TaxonomyStageResult>;
```

Existing domain types should be reused rather than duplicated.

### 4.3 Operational preparation

`evaluateTicketCommand()` is the only production B2 orchestration boundary.

Its validated caller intent gains:

```ts
taxonomyPreference: AiPreferenceSchema.default(/* resolved default */)
```

Resolution is:

```text
explicit taxonomyPreference
    ?? classificationPreference when that public option exists
    ?? aiPreference
```

The normalized preference is caller intent and therefore participates in `canonicalRequestHashV2("evaluate-ticket", intent)`. Generated taxonomy and telemetry do not.

After the dispatcher's early replay and readiness checks, `prepare()`:

1. reads the current ticket, audits, reusable knowledge, and other evaluation inputs;
2. creates the current recommendation and draft without consuming taxonomy;
3. runs the taxonomy stage from the same ticket/conversation snapshot;
4. attaches the taxonomy trace to the recommendation's `AiExecutionTrace`; and
5. returns a `PreparedOperationalEvaluation` containing the recommendation input, watermark, classification confidence, and canonical taxonomy context.

All provider and repository work stays outside the SQLite write transaction.

### 4.4 Transactional commit

`TriageService.commitOperationalEvaluation()` must:

1. re-read the workflow snapshot inside the dispatcher-owned transaction;
2. validate ticket revision and customer-reply watermark;
3. build and persist the recommendation using the existing path;
4. compare the prepared taxonomy against the latest committed taxonomy revision;
5. apply stronger-evidence protection;
6. append zero or one taxonomy event and revision; and
7. return one immutable `OperationalResultReference` covering the complete write set.

The dispatcher persists that result and the v2 receipt in the same transaction.

No taxonomy provider or other network operation may run inside `commitOperationalEvaluation()`.

### 4.5 Immutable replay

Committed retries must be resolved before preparation. They must not:

- read current evaluation prerequisites;
- call classification, drafting, taxonomy, retrieval, or knowledge providers;
- recompute taxonomy;
- reapply current stronger-evidence rules; or
- create another event or revision.

Add an optional explicit taxonomy revision reference to `OperationalResultReference`, for example:

```ts
diagnosticTaxonomyRevisionId?: string;
```

This is an additive JSON result-schema change and does not require a database migration. Existing v2 evaluation receipts without a taxonomy revision reference remain valid because earlier evaluations and taxonomy no-op/trace-only evaluations may have none. Version-1 receipts remain governed by R1's `LEGACY_REPLAY_UNAVAILABLE` rule.

When present, replay validation must prove that:

- the revision exists in the affected ticket's immutable snapshot;
- its event is included in the result's `operationalEventIds`;
- the event action is `diagnostic-taxonomy-revised`;
- event, revision, ticket, command ID, actor, and timestamp are causally consistent; and
- the revision lies within the committed command's event boundary.

A taxonomy event without the matching result reference, or a reference without its causal event, is an operational integrity error. Replay still returns the original recommendation response; the reference exists to validate and audit the complete committed write set.

## 5. Pipeline placement and advisory isolation

```text
validated caller intent
        |
        v
R1 replay/readiness boundary
        |
        v
current ticket + conversation snapshot
        |
        +--------------------+
        |                    |
        v                    v
existing recommendation     taxonomy-stage
and drafting path           advisory only
        |                    |
        +---------+----------+
                  v
       PreparedOperationalEvaluation
                  |
                  v
         R1 transaction commit
```

The current recommendation and drafting computation must not receive the taxonomy result. Regression tests compare recommendation, routing, lifecycle, selected knowledge, and customer draft with taxonomy enabled and disabled or with different valid taxonomy candidates.

## 6. Canonical selection and safety

```text
valid GPT candidate       -> canonical = GPT
expected GPT failure      -> canonical = deterministic
GPT not configured        -> canonical = deterministic
deterministic preference  -> canonical = deterministic
prompt injection detected -> canonical = deterministic
unexpected internal error -> preparation fails
```

Both deterministic and GPT candidates remain visible in the sanitized trace when GPT succeeds. Agreement does not increase evidence support.

Prompt injection is a safety decision, not taxonomy evidence. The trace records that GPT taxonomy was suppressed.

## 7. Provider portability and failure classification

Retain:

```ts
interface TaxonomyReasoningProvider {
  reason(input: TaxonomyInferenceInput): Promise<TaxonomyReasoningExecution>;
}
```

Add an environment factory consistent with current provider conventions:

- `OPENAI_API_KEY`;
- taxonomy-specific model override with `OPENAI_MODEL` fallback;
- `TRIAGE_OPENAI_BASE_URL`;
- taxonomy-specific timeout override with the shared timeout parser; and
- Responses API URL normalization.

The compatibility boundary is the OpenAI Responses API with structured output, not arbitrary chat-completions compatibility.

Expected fallback categories are stable public categories, not raw exception text:

- `not-configured`;
- `timeout`;
- `provider-error`; and
- `invalid-schema`.

Transport rejection, non-2xx response, response-body failure, timeout through body consumption, malformed envelope/output, and schema rejection must map to a recognized provider error. Unexpected programming and invariant errors propagate.

Never persist raw provider bodies, prompts, hidden reasoning, credentials, secrets, stack traces, or machine paths. Model identifiers are persisted only when they satisfy the existing safe model schema.

## 8. Taxonomy context and trace

### 8.1 Initial support

Support describes evidence backing the taxonomy, not model confidence:

```text
any identified primary or secondary product surface -> supported
no identified product surface                       -> tentative
one or more problem classes                         -> supported
no problem classes                                  -> tentative
```

Initial B2 inference never produces `established`.

### 8.2 Initial basis

```ts
{
  source: "initial-classification",
  evidenceIds: [],
  knowledgeArticleIds: [],
  playbookIds: [],
  knownCauseIds: [],
  explanation:
    "Derived from the ticket and current conversation during evaluation."
}
```

Customer-reply IDs are not fabricated as evidence references. Detailed inference provenance belongs in the AI trace.

### 8.3 Trace extension

Add an optional taxonomy sibling to `AiExecutionTraceSchema`. Old traces must continue to parse.

The section records:

- resolved preference;
- `used`, `fallback`, or `skipped` status;
- deterministic candidate;
- optional GPT candidate;
- canonical source and candidate;
- sanitized model/latency/usage;
- fixed fallback category/message or suppression reason; and
- bounded sanitized GPT rationale, never hidden reasoning.

The schema must enforce canonical-source/candidate consistency and valid status combinations rather than relying only on producers.

```text
taxonomy revision = durable domain belief
AI trace          = inference provenance
command result    = immutable recovery reference
```

## 9. Change-only persistence

Compare only:

- `primaryProductSurface`;
- `secondaryProductSurfaces` as a set;
- `problemClasses` as a set;
- `support.productSurface`; and
- `support.problemClass`.

Basis-only, ordering-only, model, telemetry, rationale, and candidate-disagreement changes do not create revisions.

```text
same taxonomy/support                  -> no revision
same taxonomy with stronger support    -> new revision
same sets in another order             -> no revision
same taxonomy/support with new basis   -> no revision
```

Every evaluation still persists its recommendation revision and AI trace. Taxonomy history records meaningful belief changes, not every inference attempt.

## 10. Stronger-evidence protection

```text
latest taxonomy absent
    -> B2 may persist

latest basis = initial-classification
    -> B2 may revise normally

latest basis = customer-evidence
             | diagnostic-evidence
             | known-cause-assessment
             | diagnosis
    -> trace only; no taxonomy revision

latest support contains established
    -> trace only; no downgrade or overwrite
```

The decision is made inside the authoritative transaction against the current committed snapshot, after stale ticket and conversation checks.

## 11. Event ordering and result ownership

One evaluation command owns one atomic write set:

```text
recommendation-submitted event/revision
zero or more recommendation-superseded events/revisions
zero or one diagnostic-taxonomy-revised event/revision
AI traces
command result
v2 receipt
```

All event IDs are included in the affected ticket's `OperationalTicketResult.operationalEventIds`. The taxonomy result reference is present exactly when a taxonomy revision was appended.

Taxonomy persistence alone does not increment the ticket revision.

The implementation must allocate deterministic causal ordering within the transaction and update evaluation replay validation so the additional taxonomy event cannot broaden or corrupt the historical recommendation boundary.

## 12. Concurrency, rollback, and failure behavior

- Same-process identical requests join through the existing dispatcher map.
- Same key with changed normalized caller intent conflicts before provider work.
- Cross-runtime preparation may duplicate, but the final transaction rechecks the receipt and commits at most one write set.
- If the source revision or conversation watermark becomes stale during preparation, the entire evaluation rolls back.
- Taxonomy persistence failure rolls back recommendation, events, traces, result, and receipt.
- Expected taxonomy provider failure does not fail the evaluation because deterministic fallback is prepared.
- Unexpected taxonomy-stage failure occurs before the transaction and commits nothing.
- Operational readiness failure occurs before provider work.

## 13. HTTP, MCP, runtime, and legacy behavior

HTTP and MCP expose the same optional `taxonomyPreference` field and delegate operational evaluation to `evaluateTicketCommand()`. They must not assemble independent taxonomy pipelines.

Provider injection is passed through the shared evaluation-command dependencies. Environment-based construction uses one factory and the same activation rules for both transports.

The explicit legacy fixture composition remains compatible:

- omitted taxonomy preference preserves the existing non-operational evaluation path;
- it is not considered a B2 operational evaluation and need not persist taxonomy;
- an explicitly requested taxonomy preference without an operational dispatcher must fail clearly rather than silently discard a prepared taxonomy result.

Production composition must not fall back to legacy evaluation when operational taxonomy preparation or persistence fails.

## 14. Testing strategy

### Stage and provider

Test deterministic execution, GPT selection, preference inheritance, missing provider, deterministic-only mode, prompt-injection suppression, expected failures, unexpected failures, support/basis derivation, trace consistency, safe provenance, base URL, body-read timeout, malformed envelopes, and invalid structured output.

### R1 command boundary

Test:

- committed replay occurs before ticket/audit/knowledge reads and provider work;
- changed taxonomy preference under the same key conflicts before provider work;
- identical in-flight requests join;
- cross-runtime preparation commits one write set;
- readiness failure precedes provider work;
- source changes during preparation roll back everything; and
- version-1 receipts retain `LEGACY_REPLAY_UNAVAILABLE` behavior.

### Persistence and replay integrity

Test first revision, semantic/support change, order-only and basis-only no-op, stronger-evidence trace-only behavior, no `established` downgrade, event/result linkage, rollback, restart, later-state replay, and missing/mismatched/cross-ticket taxonomy replay references.

### Production composition

Use real runtime composition through HTTP and MCP. Prove preference/provider parity, immutable reopen behavior, and that recommendation, routing, lifecycle, knowledge selection, and draft output remain unchanged.

### B1 regression

Preserve the deterministic/GPT taxonomy evaluator, boundary observations, comparison runner, and offline evaluation command.

## 15. Acceptance criteria

B2 is complete when:

1. Every operational B2 evaluation prepares a canonical advisory taxonomy.
2. Deterministic taxonomy always runs after R1 replay/readiness preflight.
3. Valid allowed GPT taxonomy becomes canonical.
4. Expected provider failures fall back safely and visibly.
5. Unexpected internal failures commit nothing.
6. Prompt injection suppresses GPT taxonomy.
7. Initial support never exceeds `supported`.
8. Taxonomy cannot change recommendation, routing, lifecycle, knowledge selection, or drafting.
9. Caller taxonomy preference participates in the v2 identity.
10. Generated taxonomy, traces, IDs, timestamps, latency, and usage do not participate in identity.
11. A committed retry replays before all provider and mutable-state work.
12. Evaluation, zero/one taxonomy revision/event, trace, result, and receipt commit atomically.
13. Replay validates the taxonomy revision against its immutable causal event.
14. Corrupt or incomplete replay state fails as an operational integrity error.
15. Only semantic taxonomy/support changes create revisions.
16. Initial inference cannot overwrite stronger evidence or `established` support.
17. HTTP and MCP use the same production orchestration and provider configuration.
18. Legacy fixture behavior remains explicit and cannot silently discard requested taxonomy.
19. Existing B1 evaluation behavior remains stable.
20. No semantic retrieval, hybrid ranking, applicability, UI, outbox, or schema migration enters B2.

Core invariants:

```text
caller intent defines identity
prepared AI output does not

one evaluation command
one dispatcher-owned transaction
zero or one taxonomy revision
zero or one taxonomy event
one immutable result and receipt

persist the belief
trace the inference machinery
replay the committed history
never confuse provenance with authority
```

## 16. Expected implementation touchpoints

Likely production files:

```text
src/taxonomy-stage.ts                         NEW
src/taxonomy-reasoning-provider.ts
src/domain.ts
src/evaluation-command.ts
src/approval-desk/ai-evaluation.ts            only as needed for trace attachment
src/triage-service.ts
src/operational/domain.ts
src/server.ts
src/approval-desk/http.ts
src/runtime.ts                                only if shared provider injection requires it
```

Likely tests:

```text
test/taxonomy-stage.test.ts                   NEW
test/taxonomy-reasoning-provider.test.ts
test/taxonomy-evaluation.test.ts
test/ai-evaluation.test.ts
test/triage-operational-evaluation.test.ts
test/operational-domain.test.ts
test/operational-command-dispatch.test.ts
test/reliability-command-replay.test.ts
test/operational-runtime-parity.test.ts
test/server-actions.test.ts
test/approval-desk-http.test.ts
```

Exact files should be confirmed against the execution checkout. No unrelated service split or general provider refactor is part of B2.
