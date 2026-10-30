# Learning Knotty while developing independently

[Report index](README.md) · [Module map](module-map.md) · [Execution flows](execution-flows.md)

The goal is to predict what the system will do from its contracts, then verify that prediction with a small test. Reading every line in repository order is unnecessary. Use public-main permalinks here until the local checkout is intentionally reconciled with the audited baseline.

## A practical reading route

1. **Vocabulary and policy:** [src/domain.ts:11](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/domain.ts#L11), [src/policy.ts:39](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/policy.ts#L39), [src/approval-desk/classifier.ts:121](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/approval-desk/classifier.ts#L121). Read the ticket/recommendation/approval schemas and one classifier test. Write down which facts are inputs, which outputs are proposals, and which constraints a model cannot waive.
2. **Command interface:** [src/operational-command-dispatch.ts:17](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/operational-command-dispatch.ts#L17). Follow `parse → prepare → commit → replay` through `run` and `execute`. Explain why `prepare` is async but `commit` is synchronous, and why a matching receipt is checked before provider work.
3. **One command body:** [src/evaluation-command.ts:98](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/evaluation-command.ts#L98) and [src/triage-service.ts:1083](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/triage-service.ts#L1083). Follow the prepared revision and reply watermark into the transaction. Use the [evaluation diagram](execution-flows.md#operational-ticket-evaluation) to keep the path small.
4. **Persistence:** [src/operational/sqlite-store.ts:131](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/operational/sqlite-store.ts#L131), [src/operational/unit-of-work.ts:1459](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/operational/unit-of-work.ts#L1459). Inspect one command result and the matching event/revision references. Learn why an atomic SQL transaction is necessary but insufficient without semantic write-set validation.
5. **Human authority:** [src/triage-service.ts:1935](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/triage-service.ts#L1935), [src/triage-service.ts:3365](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/triage-service.ts#L3365). Compare approval with evaluation: evaluate proposes, approval applies selected fields, review grants a specific diagnosis basis, and each must still be fresh.
6. **Learning and observation:** [src/operational/learning-outbox.ts:101](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/operational/learning-outbox.ts#L101), [src/knowledge-evolution/service.ts:217](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/knowledge-evolution/service.ts#L217), [src/reasoning/hybrid-shadow-runner.ts:76](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/reasoning/hybrid-shadow-runner.ts#L76). Explain why learning delivery, retrieval and shadow reasoning have different stores and failure consequences.

Treat names as clues rather than proof. `approval-desk/` includes domain logic and evaluation code, and `ReasoningMode = "diagnosis"` does not mean the current B5 adapter can diagnose operationally. A schema-valid output can still be diagnostically wrong.

## Documentation approach for later code changes

These are recommendations for a future authorized documentation pass in source. No runtime comments or JSDoc were edited in this audit.

| Location | Useful file summary / JSDoc content | Why it helps |
|---|---|---|
| `evaluation-command.ts` | “Shared transport-neutral evaluation command. Preparation may call providers; commit revalidates revision and persisted reply watermark. Optional retrieval/capture starts only after a new commit. Matching replay never prepares again.” Link service commit/replay and reliability tests | Reveals the authority/timing contract before the reader enters provider details |
| `triage-service.ts` | Short command-family index: recommendation lifecycle, conversation, diagnosis/review/fix, closure, replay/compatibility. Link each family to commit/replay pair and its tests | Supports focused reading without treating every private helper as a public interface |
| `PreparedCommandDefinition` / dispatcher | Document identity normalization, in-flight scope, cross-process duplicate preparation, synchronous commit, immutable result projection, errors for changed identity and v1 receipts | The interface includes ordering/error/recovery promises, beyond the TypeScript signature |
| `OperationalUnitOfWork` / `transaction` | Explain same-command event binding, expected revisions, required result references, no await, scope closure and rollback. Link the write-set failure tests | Explains why the “extra” validation exists instead of encouraging unsafe simplification |
| Classifier and `policy.ts` | Distinguish classifier scoring/advisory signals from mandatory escalation and approval restrictions; document stable escalation-reason ordering | Separates model advice, deterministic decision policy, and persistence |
| `recommendation-builder.ts` | Identify evidence/lifecycle projection versus customer text formatting, and which source can justify readiness claims | Helps the owner change wording without changing authority or evidence semantics |
| Retrieval search/execution/types | Document BM25 score direction, semantic channel status, resource-versus-representation rank, deterministic reference provenance, index generation and self-ticket exclusion | These are non-obvious invariants, not syntax explanations |
| Capture/runner/B5 adapter | Distinguish opportunity identity from execution identity, frozen source basis from result, evaluation-only mode, and append/replay from exactly-once provider calls | Prevents treating a research result or unique index as operational permission |
| Knowledge service/reusable context | Document actor authorization, expected candidate/head versions, explicit evidence policy, active as-of head and promotion/health eligibility | “Approved object exists” alone is not the reuse contract |
| Outbox/ledger | Explain claim lease → idempotent delivery → acknowledgement, duplicate delivery after acknowledgement failure, dead-letter versus retry | Makes cross-DB recovery understandable without claiming distributed ACID |

A concise public-function JSDoc should answer: what authority does the caller have, which inputs must agree, which state changes, which failures escape, and which tests demonstrate the contract? Add `@param`, `@returns`, or `@throws` only when they add information the type does not express. Link to a related symbol/test rather than copying long policy prose into several files.

For example, a future comment above `commitOperationalEvaluation` could explain that it rejects a preparation whose ticket or persisted replies changed during provider work, writes only the evaluation write set through the supplied unit, and must never await a provider. A comment saying “commits the evaluation” adds no useful knowledge.

### Policy, mechanism and implementation detail

| Kind | Knotty example | What a reader should ask |
|---|---|---|
| Policy | Security escalation; explicit approved fields; human diagnosis review; evidence eligibility | What rule must remain true even if storage or model changes? |
| Mechanism | Prepare/commit/replay dispatcher; revision compare; unit of work; outbox; frozen capture | How is the rule enforced across time, failure and retries? |
| Implementation detail | SQL query shape; map/set use; BM25 token construction; one UI DOM renderer | Can this change without altering the promised behavior? Which focused test proves that? |

## Exercise 1 — Predict a deterministic triage and its approval limits

**Difficulty:** code reading and test interpretation. No provider, DB, or API change is needed.

**Files:** [src/approval-desk/classifier.ts:121](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/approval-desk/classifier.ts#L121), [src/approval-desk/conversation-context.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/approval-desk/conversation-context.ts), [src/policy.ts:39](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/policy.ts#L39), [src/triage-service.ts:853](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/triage-service.ts#L853); tests [test/classifier.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/classifier.test.ts), [test/policy.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/policy.test.ts).

**Problem:** choose an existing synthetic classifier fixture involving security or outage risk and a second fixture involving insufficient evidence. Before running a focused test, predict category, team, priority, missing evidence and escalation reasons. Add a customer reply in your written trace and explain why classification may change. Then identify which ticket fields a human approval may apply and which policy constraints remain.

**Functions/types:** `Ticket`, `TicketClassification`, `TriageRecommendation`, `classifyTicketFromContext`, `evaluateEscalation`, `validateApprovedFields`, `buildRecommendation`.

**Useful checks:** classifier tests for conflicting/risk signals and policy tests for security precedence, low confidence, SLA, empty/duplicate/unproposed approval fields. Use fixtures already under test; do not reset an existing demo or assume a gold override is the normal path.

**Expected output:** a one-page input → signal → classification → policy table, with test names supporting each prediction. Label any mismatch as “my prediction differed” before asking Codex for an explanation.

**Learning outcome:** understand deterministic policy as executable domain rules and see why advisory classification cannot directly authorize a ticket mutation.

## Exercise 2 — Explain and later test a command replay after state advances

**Difficulty:** trace persistence and implement one focused regression test in a later authorized task.

**Files:** [src/operational-command-dispatch.ts:49](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/operational-command-dispatch.ts#L49), [src/operational/idempotency.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/operational/idempotency.ts), [src/evaluation-command.ts:98](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/evaluation-command.ts#L98), [src/triage-service.ts:1083](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/triage-service.ts#L1083), [src/triage-service.ts:1114](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/triage-service.ts#L1114), [src/operational/unit-of-work.ts:334](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/operational/unit-of-work.ts#L334).

**Problem:** explain what should happen when evaluation command A completes, the ticket later advances, and A is retried. Contrast that with reusing A's key for changed intent and with a new key whose preparation became stale during provider work. Draw four boxes for parsed intent, prepared input, committed result reference and replayed output; identify which values may be recomputed.

**Functions/types:** `PreparedCommandDefinition`, `PreparedOperationalEvaluation`, `OperationalResultReference`, `canonicalRequestHashV2`, `beginCommandV2`, `persistCommandResult`, `replayOperationalEvaluation`.

**Useful tests:** [test/reliability-command-replay.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/reliability-command-replay.test.ts) cases “does not call providers again for a committed replay,” “replays the original immutable result after the ticket advances,” “rejects an evaluation whose source gains a reply during provider work without a receipt,” and receipt-persistence rollback. Also [test/operational-command-dispatch.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/operational-command-dispatch.test.ts) and [test/triage-operational-evaluation.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/triage-operational-evaluation.test.ts).

**Later implementation exercise:** using the existing disposable recovery fixture, write one test that counts provider calls and snapshots event/revision/receipt counts across retry. Assert both returned original result and zero extra mutation. Do not edit schemas, change the dispatcher or call a real provider. Explain the failing assertion before proposing a fix.

**Learning outcome:** separate async preparation from atomic authority, understand identity and concurrency, and practice a test that observes behavior instead of mirroring implementation.

## Exercise 3 — Audit a frozen shadow opportunity and reject an inconsistent basis

**Difficulty:** cross-module reasoning and a later isolated contract-test extension.

**Files:** [src/retrieval/execution.ts:52](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/retrieval/execution.ts#L52), [src/retrieval/stage.ts:58](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/retrieval/stage.ts#L58), [src/reasoning/hybrid-shadow-capture.ts:86](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/reasoning/hybrid-shadow-capture.ts#L86), [src/reasoning/input-assembler.ts:16](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/reasoning/input-assembler.ts#L16), [src/reasoning/hybrid-shadow-runner.ts:76](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/reasoning/hybrid-shadow-runner.ts#L76), [src/reasoning/b5-hybrid-reasoning-provider.ts:31](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/reasoning/b5-hybrid-reasoning-provider.ts#L31).

**Problem:** choose one synthetic capture fixture and trace ticket revision, reply watermark, event sequence, committed-through boundary, taxonomy revision, retrieval index and evidence hashes into `HybridReasoningInput`. Explain which mismatch should be rejected before a provider call. Identify why a B5 hypothesis rank is not a diagnosis approval.

**Functions/types:** `RetrievalExecution`, `HybridShadowCaptureAssemblySource`, `HybridShadowBasis`, `assembleHybridShadowCaptureContext`, `HybridReasoningProvider`, `runHybridShadowOpportunity`, `assessApplicabilitySemanticCase`, `recordOrReplayShadowRun`.

**Useful tests:** [test/hybrid-shadow-capture.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/hybrid-shadow-capture.test.ts), [test/hybrid-reasoning-input.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/hybrid-reasoning-input.test.ts), [test/hybrid-shadow-runner.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/hybrid-shadow-runner.test.ts), [test/hybrid-shadow-run-sqlite.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/hybrid-shadow-run-sqlite.test.ts), [test/b5-hybrid-reasoning-provider.test.ts](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/test/b5-hybrid-reasoning-provider.test.ts) (especially diagnosis-mode rejection).

**Later implementation exercise:** clone a fixture, change exactly one provenance field, and write a test proving capture rejects it, the provider counter stays zero and operational state stays unchanged. Then retry an unchanged valid shadow execution against an initialized temporary shadow repository and verify append/replay behavior with an injected provider. Do not change frozen research inputs, introduce an operational action, or call a live model.

**Learning outcome:** reason about trustworthy data lineage across modules, immutable inputs/results and failure containment; distinguish structurally valid reasoning from empirically useful diagnosis.

## A productive Codex collaboration loop

Ask Codex to point to one call site and one test before explaining a rule. Make your own prediction, request a counterexample, run a bounded check against disposable state, and update your mental diagram. For implementation, keep the first change small enough that you can explain its effect and rollback in your own words. Completion evidence should say which commit, inputs and tests were used; historical test counts and unmeasured model performance should not stand in for current validation.

These exercises are proposed work only. None was implemented as part of the audit.
