# B2 Persisted Advisory Diagnostic Taxonomy Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add advisory deterministic/GPT taxonomy to the production evaluation command and persist meaningful taxonomy changes atomically without weakening Reliability R1 replay guarantees.

**Architecture:** `evaluateTicketCommand()` validates and hashes normalized caller intent, then prepares recommendation, drafting, and taxonomy outside SQLite after the dispatcher has checked for a committed receipt. `TriageService.commitOperationalEvaluation()` revalidates mutable state and atomically writes the recommendation, zero or one taxonomy revision/event, traces, command result, and receipt; replay reconstructs and validates the immutable committed result without provider work.

**Tech Stack:** TypeScript, Node.js, Zod, Vitest, better-sqlite3, MCP, Approval Desk HTTP, OpenAI Responses-compatible providers.

**Spec:** `docs/superpowers/specs/2026-09-03-diagnostic-taxonomy-b2-design.md`

## Global Constraints

- Start from `origin/main` at `f31f64c38d6715d435307caaf1370d3b9c8411bd`, or stop and reconcile if `origin/main` has advanced.
- Use an isolated worktree created from the verified current `origin/main`.
- Schema remains v4; do not add a migration.
- Preserve the R1 dispatcher as the only production evaluation command boundary.
- Only normalized caller intent participates in the v2 request hash.
- Generated taxonomy, trace, timestamps, IDs, model output, latency, and usage never participate in command identity.
- Receipt preflight and readiness gating precede repository reads and provider work.
- Provider/network work remains outside SQLite write transactions.
- Recommendation, taxonomy revision/event, traces, immutable result, and receipt commit atomically.
- Taxonomy remains advisory and cannot affect routing, lifecycle, selected knowledge, recommendation, drafting, or customer-facing behavior.
- Expected provider failures fall back to deterministic taxonomy; unexpected internal errors propagate before commit.
- Existing Phase A persistence and B1 inference/evaluation components are reused.
- Existing v1 receipt behavior remains `LEGACY_REPLAY_UNAVAILABLE`.
- Preserve explicit legacy fixture behavior; never silently fall back from operational persistence to legacy repositories.
- Do not implement embeddings, retrieval, hybrid ranking, reranking, applicability, UI controls, outbox work, or unrelated refactoring.
- Use TDD, keep commits reviewable, and do not push, merge, publish, or remove worktrees.

---

## File structure

### New files

- `src/taxonomy-stage.ts` — pure orchestration of deterministic and optional GPT taxonomy, support/basis derivation, and sanitized trace.
- `test/taxonomy-stage.test.ts` — focused stage behavior and invariants.

### Existing production files

- `src/domain.ts` — optional taxonomy section in `AiExecutionTraceSchema`.
- `src/taxonomy-reasoning-provider.ts` — portable URL/configuration factory and complete typed expected failures.
- `src/taxonomy-evaluation.ts` — preserve B1 diagnostic outcome typing if provider reasons expand.
- `scripts/evaluate-taxonomy-inference.ts` — preserve B1 runner diagnostics if provider reasons expand.
- `src/approval-desk/ai-evaluation.ts` — share current conversation/baseline/safety inputs while keeping taxonomy isolated from recommendation/drafting.
- `src/evaluation-command.ts` — normalized taxonomy preference, provider injection, and B2 preparation behind R1 preflight.
- `src/triage-service.ts` — prepared taxonomy field, atomic change-only persistence, and immutable replay validation.
- `src/operational/domain.ts` — optional taxonomy revision reference on the immutable command result.
- `src/server.ts` — MCP input/dependency wiring only.
- `src/approval-desk/http.ts` — HTTP input/dependency wiring only.
- `src/runtime.ts` — only if one shared provider factory/injection point is required by current composition.

### Tests

- `test/diagnostic-taxonomy.test.ts`
- `test/taxonomy-reasoning-provider.test.ts`
- `test/taxonomy-evaluation.test.ts`
- `test/ai-evaluation.test.ts`
- `test/triage-operational-evaluation.test.ts`
- `test/operational-domain.test.ts`
- `test/operational-command-dispatch.test.ts`
- `test/reliability-command-replay.test.ts`
- `test/operational-runtime-parity.test.ts`
- `test/server-actions.test.ts`
- `test/approval-desk-http.test.ts`

Do not create duplicate integration fixtures when the existing R1 reliability runtime fixture can exercise the boundary.

---

### Task 1: Add taxonomy trace and immutable result contracts

**Files:**
- Modify: `src/domain.ts`
- Modify: `src/operational/domain.ts`
- Modify: `test/ai-evaluation.test.ts`
- Modify: `test/operational-domain.test.ts`

**Interfaces:**
- Consumes: existing `AiPreferenceSchema`, `AiModelSchema`, `AiUsageSchema`, sanitized message schemas, `TaxonomyInferenceCandidateSchema`, and operational identifier schemas.
- Produces: optional `AiExecutionTrace["taxonomy"]` and optional `OperationalResultReference.diagnosticTaxonomyRevisionId`.

- [ ] **Step 1: Write failing trace-schema tests**

Add tests proving:

```ts
it("accepts a consistent deterministic taxonomy trace");
it("accepts a consistent GPT taxonomy trace");
it("keeps old traces without taxonomy valid");
it("rejects a GPT canonical source without a GPT candidate");
it("rejects a canonical candidate that differs from its declared source");
it("rejects fallback and suppression combinations inconsistent with status");
it("rejects unsafe rationale and model provenance");
```

Use canonical candidates parsed by `TaxonomyInferenceCandidateSchema`. Do not place raw prompts or provider bodies in fixtures.

- [ ] **Step 2: Write failing operational-result tests**

Add cases proving an `evaluate-ticket` result may contain one taxonomy revision ID and that unrelated operations or malformed identifiers cannot misuse the field. Existing results without the field must still parse.

The result-level invariant is:

```ts
if (result.diagnosticTaxonomyRevisionId !== undefined) {
  result.operation === "evaluate-ticket";
  result.tickets.length === 1;
}
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
npx vitest run test/ai-evaluation.test.ts test/operational-domain.test.ts --maxWorkers=1
```

Expected: new cases fail because neither schema contains the B2 fields.

- [ ] **Step 4: Implement the taxonomy trace schema**

Add an optional strict taxonomy object with:

```ts
{
  preference: AiPreference;
  status: "used" | "fallback" | "skipped";
  deterministicCandidate: TaxonomyInferenceCandidate;
  gptCandidate?: TaxonomyInferenceCandidate;
  canonicalSource: "gpt" | "deterministic";
  canonicalCandidate: TaxonomyInferenceCandidate;
  model?: string;
  latencyMs?: number;
  usage?: AiUsage;
  fallback?: {
    category: "not-configured" | "timeout" | "provider-error" | "invalid-schema";
    message: string;
  };
  suppression?: {
    reason: "prompt-injection" | "deterministic-preference";
  };
  gptRationale?: string;
}
```

Use `superRefine()` to enforce source/candidate and status/fallback/suppression consistency. Export the narrow trace type needed by `taxonomy-stage.ts`; do not export duplicate schemas.

- [ ] **Step 5: Implement the result reference field**

Add `diagnosticTaxonomyRevisionId` as an optional safe identifier. Enforce the invariant above in `OperationalResultReferenceSchema.superRefine()` while preserving existing receipt compatibility.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
npx vitest run test/ai-evaluation.test.ts test/operational-domain.test.ts --maxWorkers=1
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain.ts src/operational/domain.ts test/ai-evaluation.test.ts test/operational-domain.test.ts
git commit -m "feat: define B2 taxonomy recovery contracts"
```

---

### Task 2: Harden the portable taxonomy reasoning provider

**Files:**
- Modify: `src/taxonomy-reasoning-provider.ts`
- Modify: `src/taxonomy-evaluation.ts`
- Modify: `scripts/evaluate-taxonomy-inference.ts`
- Modify: `test/taxonomy-reasoning-provider.test.ts`
- Modify: `test/taxonomy-evaluation.test.ts`

**Interfaces:**
- Consumes: existing `TaxonomyReasoningProvider` and shared OpenAI timeout/Responses URL conventions.
- Produces: `createTaxonomyReasoningProviderFromEnv()` and a typed provider-unavailable union covering every expected external failure.

- [ ] **Step 1: Write failing provider tests**

Cover:

```ts
it("uses the hosted Responses endpoint by default");
it("normalizes an OpenAI-compatible base URL to its Responses endpoint");
it("constructs no provider when taxonomy GPT is not configured");
it("uses a taxonomy model override before OPENAI_MODEL");
it("maps fetch rejection to transport unavailability");
it("maps non-2xx status to HTTP unavailability");
it("maps response.text rejection to response-body unavailability");
it("keeps the timeout active through body consumption");
it("maps malformed envelope and missing output text to invalid response");
it("maps malformed reasoning JSON and invalid taxonomy fields to InvalidTaxonomySchemaError");
it("does not expose provider bodies or credentials in errors");
```

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run test/taxonomy-reasoning-provider.test.ts --maxWorkers=1
```

Expected: failures expose the current fixed URL, narrow `http | timeout` union, and timeout ending before body parsing.

- [ ] **Step 3: Implement portable options and factory**

Use one normalized Responses URL and these configuration sources:

```text
OPENAI_API_KEY
TRIAGE_TAXONOMY_MODEL -> OPENAI_MODEL -> existing default model
TRIAGE_OPENAI_BASE_URL
TRIAGE_TAXONOMY_TIMEOUT_MS -> shared timeout default
```

The factory returns `undefined` when no usable API key/provider configuration exists. Invalid configured timeout or URL values fail startup/configuration clearly rather than being converted into inference fallback.

- [ ] **Step 4: Keep timeout and external error mapping around the full response**

The guarded operation includes fetch, status handling, `response.text()`, envelope parsing, and structured output extraction. Convert only recognized external/response failures into typed expected errors. Preserve `InvalidTaxonomySchemaError` for rejected taxonomy and rethrow unexpected internal errors.

- [ ] **Step 5: Update B1 evaluation diagnostics**

If the provider-unavailable reason union expands, preserve the exact non-accuracy diagnostic outcome in `taxonomy-evaluation.ts` and the comparison script. Do not count provider failure as an incorrect taxonomy candidate.

- [ ] **Step 6: Run focused tests**

```bash
npx vitest run test/taxonomy-reasoning-provider.test.ts test/taxonomy-evaluation.test.ts test/taxonomy-comparison.test.ts --maxWorkers=1
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/taxonomy-reasoning-provider.ts src/taxonomy-evaluation.ts scripts/evaluate-taxonomy-inference.ts test/taxonomy-reasoning-provider.test.ts test/taxonomy-evaluation.test.ts
git commit -m "fix: harden taxonomy reasoning provider boundary"
```

---

### Task 3: Implement the dedicated taxonomy stage

**Files:**
- Create: `src/taxonomy-stage.ts`
- Create: `test/taxonomy-stage.test.ts`

**Interfaces:**
- Consumes: `inferTaxonomyDeterministically()`, `TaxonomyReasoningProvider`, canonical taxonomy schemas, `AiPreference`, and the Task 1 trace contract.
- Produces: `runTaxonomyStage(input): Promise<{ context: DiagnosticTaxonomyContext; trace: TaxonomyExecutionTrace }>`.

- [ ] **Step 1: Write failing stage tests**

Cover all decision-table rows:

```ts
it("always runs deterministic inference");
it("uses a valid GPT candidate as canonical when allowed");
it("falls back when the provider is not configured");
it("falls back on timeout, external failure, and invalid taxonomy schema");
it("rethrows an unexpected provider or programming error");
it("skips GPT for deterministic preference");
it("skips GPT after prompt-injection detection");
it("records deterministic and GPT disagreement without changing support");
it("derives supported surface from secondary-only evidence");
it("derives tentative support for empty candidate fields");
it("never derives established support");
it("uses the fixed initial-classification basis with empty reference arrays");
it("omits unsafe model provenance and persists only fixed fallback messages");
```

Use a counting deterministic adapter or module spy so “always runs” is asserted directly.

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run test/taxonomy-stage.test.ts --maxWorkers=1
```

Expected: FAIL because `src/taxonomy-stage.ts` does not exist.

- [ ] **Step 3: Implement support and basis helpers**

Implement pure helpers that derive:

```text
surface present -> supported; otherwise tentative
problem class present -> supported; otherwise tentative
basis.source -> initial-classification
all basis reference arrays -> []
```

Parse the final context through `DiagnosticTaxonomyContextSchema`.

- [ ] **Step 4: Implement selection and fallback**

Run deterministic inference first. Invoke GPT only when preference/safety permit and a provider exists. Catch only the typed errors from Task 2 and map them to fixed trace categories/messages. A successful provider candidate is canonical. Unexpected errors propagate.

- [ ] **Step 5: Validate the trace before returning**

Construct the trace through the Task 1 schema so impossible combinations cannot leave the stage. Do not store raw provider output.

- [ ] **Step 6: Run tests and typecheck**

```bash
npx vitest run test/taxonomy-stage.test.ts test/taxonomy-inference.test.ts test/diagnostic-taxonomy.test.ts --maxWorkers=1
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/taxonomy-stage.ts test/taxonomy-stage.test.ts
git commit -m "feat: add advisory taxonomy stage"
```

---

### Task 4: Prepare taxonomy behind the R1 replay boundary

**Files:**
- Modify: `src/approval-desk/ai-evaluation.ts`
- Modify: `src/evaluation-command.ts`
- Modify: `src/triage-service.ts`
- Modify: `test/ai-evaluation.test.ts`
- Modify: `test/reliability-command-replay.test.ts`
- Modify: `test/operational-command-dispatch.test.ts`

**Interfaces:**
- Consumes: Task 3 `runTaxonomyStage()`, existing evaluation inputs, `OperationalCommandDispatcher`, and `PreparedOperationalEvaluation`.
- Produces: normalized caller `taxonomyPreference` and a prepared canonical taxonomy/trace that is not part of request identity.

- [ ] **Step 1: Write failing identity and preflight tests**

Prove:

```ts
it("normalizes omitted taxonomy preference to the evaluation preference");
it("hashes omitted and explicitly equivalent taxonomy preference identically");
it("conflicts on a genuinely changed taxonomy preference under the same key");
it("replays a committed evaluation before taxonomy provider or repository work");
it("returns LEGACY_REPLAY_UNAVAILABLE before taxonomy provider work");
it("joins same-process identical evaluations without a second taxonomy call");
it("rejects operational-not-ready before taxonomy provider work");
```

Use controlled providers with exact call counts. The changed-intent case must fail before any provider invocation.

- [ ] **Step 2: Write failing advisory-isolation tests**

Run the same evaluation with deterministic taxonomy and with an injected GPT provider returning a different valid taxonomy. Assert exact equality for recommendation category, team, priority, knowledge references, lifecycle-relevant fields, and customer draft. Only taxonomy trace/context may differ.

- [ ] **Step 3: Run and verify RED**

```bash
npx vitest run test/ai-evaluation.test.ts test/reliability-command-replay.test.ts test/operational-command-dispatch.test.ts --maxWorkers=1
```

- [ ] **Step 4: Normalize caller intent in `evaluation-command.ts`**

Parse an optional raw `taxonomyPreference`, then return a normalized `EvaluationCommandInput` where it is always present:

```ts
taxonomyPreference:
  parsed.taxonomyPreference
  ?? parsed.aiPreference
```

If a distinct public classification preference already exists at execution time, insert it between those values as required by the spec. The normalized object passed to `dispatcher.run()` is the only taxonomy input to `canonicalRequestHashV2()`.

- [ ] **Step 5: Share evaluation snapshot inputs without influencing recommendation**

Refactor `ai-evaluation.ts` narrowly so the operational path can reuse its conversation context, deterministic baseline, and safety assessment for taxonomy without recomputing a competing snapshot. Keep the existing `evaluateTicketWithAi()` behavior for legacy callers.

Expose one operational preparation function or internal shared core that returns:

```ts
{
  recommendationInput: Omit<SubmitEvaluationInput, "submittedAt" | "evaluatedCustomerReplyWatermark">;
  diagnosticTaxonomy: DiagnosticTaxonomyContext;
}
```

Attach the taxonomy trace as the optional taxonomy sibling of the recommendation's existing `aiExecutionTrace`. Never pass `diagnosticTaxonomy` into recommendation builders, knowledge selection, routing, or drafting.

- [ ] **Step 6: Extend prepared evaluation only**

Add to `PreparedOperationalEvaluation`:

```ts
readonly diagnosticTaxonomy: DiagnosticTaxonomyContext;
```

Do not add generated taxonomy to `EvaluationCommandInputSchema`. Do not route it through the direct-service v2 semantic intent. `evaluateTicketCommand.prepare()` creates it after dispatcher preflight and passes it to `commitOperationalEvaluation()`.

- [ ] **Step 7: Run focused R1 tests**

```bash
npx vitest run test/ai-evaluation.test.ts test/reliability-command-replay.test.ts test/operational-command-dispatch.test.ts test/triage-operational-evaluation.test.ts --maxWorkers=1
npm run typecheck
```

Expected: PASS; provider call counts prove replay suppression.

- [ ] **Step 8: Commit**

```bash
git add src/approval-desk/ai-evaluation.ts src/evaluation-command.ts src/triage-service.ts test/ai-evaluation.test.ts test/reliability-command-replay.test.ts test/operational-command-dispatch.test.ts test/triage-operational-evaluation.test.ts
git commit -m "feat: prepare taxonomy behind R1 replay"
```

---

### Task 5: Persist taxonomy atomically and validate immutable replay

**Files:**
- Modify: `src/triage-service.ts`
- Modify: `src/operational/domain.ts`
- Modify: `test/triage-operational-evaluation.test.ts`
- Modify: `test/operational-domain.test.ts`
- Modify: `test/reliability-command-replay.test.ts`
- Modify: `test/operational-runtime-parity.test.ts`

**Interfaces:**
- Consumes: prepared taxonomy from Task 4, Phase A `appendDiagnosticTaxonomyRevision()`, and Task 1 result reference.
- Produces: atomic zero/one taxonomy revision and event with causally validated replay.

- [ ] **Step 1: Write failing change-only persistence tests**

Cover:

```ts
it("persists the first taxonomy revision with its causal event");
it("persists a semantic taxonomy change");
it("persists a tentative-to-supported change");
it("does not persist an order-only change");
it("does not persist a basis-only change");
it("does not persist identical taxonomy and support");
it("records trace but does not overwrite evidence-backed taxonomy");
it("records trace but does not downgrade established support");
```

Assert contiguous taxonomy revision numbers, the `diagnostic-taxonomy-revised` action, inclusion in `operationalEventIds`, and exact presence/absence of `diagnosticTaxonomyRevisionId`.

- [ ] **Step 2: Write failing rollback and race tests**

Inject failure after recommendation writes but before taxonomy/result completion and assert zero new recommendation, event, trace, taxonomy revision, and receipt. Use a preparation barrier to change the source revision or conversation watermark and assert the whole commit fails stale.

Use two runtime/store instances against one database to prove preparation may occur twice but only one complete write set commits.

- [ ] **Step 3: Write failing replay-integrity tests**

Tamper one field at a time and require `OPERATIONAL_INTEGRITY_ERROR` through the shared command classifier:

- missing taxonomy revision;
- cross-ticket revision reference;
- taxonomy revision whose event is absent from the result;
- result event without its taxonomy revision reference;
- wrong event action;
- taxonomy event actor differing from the command's recommendation event, or event/revision timestamp mismatch;
- event with another command ID; and
- taxonomy event after the committed command boundary.

Also advance ticket, recommendation, and taxonomy state after commit, then retry and assert the original recommendation and original taxonomy reference are validated without another provider call.

- [ ] **Step 4: Run and verify RED**

```bash
npx vitest run test/triage-operational-evaluation.test.ts test/operational-domain.test.ts test/reliability-command-replay.test.ts test/operational-runtime-parity.test.ts --maxWorkers=1
```

- [ ] **Step 5: Implement semantic comparison and protection helpers**

Canonicalize secondary surfaces and problem classes as sorted unique sets. Compare only the five semantic/support fields from the spec. Evaluate stronger-evidence protection against the latest taxonomy revision in the transaction-local snapshot.

- [ ] **Step 6: Extend the evaluation write set**

Inside `commitOperationalEvaluation()`, after stale ticket/watermark validation and before returning:

1. determine whether taxonomy is persistable and changed;
2. allocate the recommendation, supersession, and optional taxonomy event IDs/sequences in one transaction-local order;
3. append the existing recommendation writes and traces;
4. append the optional taxonomy event and revision; and
5. return one result containing all event IDs plus the optional taxonomy revision ID.

Use `this.now()` and generated IDs only inside the commit path. No provider call is allowed here. Taxonomy-only persistence must not change ticket revision.

- [ ] **Step 7: Harden `replayOperationalEvaluation()`**

Validate every result event used to establish the evaluation boundary. Recommendation and taxonomy references must belong to the receipt's command, ticket, action, and causal sequence. Resolve the original recommendation revision at the committed event boundary. Validate the optional taxonomy revision when present, even though the transport response remains the existing recommendation/lifecycle shape.

Map missing or inconsistent persisted data through the established persistence/integrity path, not `STALE_APPROVAL`, `INVALID_REQUEST`, or retryable lock handling.

- [ ] **Step 8: Run focused tests and build**

```bash
npx vitest run test/triage-operational-evaluation.test.ts test/operational-domain.test.ts test/reliability-command-replay.test.ts test/operational-runtime-parity.test.ts --maxWorkers=1
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/triage-service.ts src/operational/domain.ts test/triage-operational-evaluation.test.ts test/operational-domain.test.ts test/reliability-command-replay.test.ts test/operational-runtime-parity.test.ts
git commit -m "feat: persist and replay advisory taxonomy"
```

---

### Task 6: Wire HTTP, MCP, runtime configuration, and legacy boundaries

**Files:**
- Modify: `src/server.ts`
- Modify: `src/approval-desk/http.ts`
- Modify: `src/evaluation-command.ts`
- Modify: `src/runtime.ts` only if required by the selected shared provider construction
- Modify: `test/server-actions.test.ts`
- Modify: `test/approval-desk-http.test.ts`
- Modify: `test/operational-runtime-parity.test.ts`
- Modify: `test/reliability-command-replay.test.ts`

**Interfaces:**
- Consumes: normalized command input and provider factory from Tasks 2 and 4.
- Produces: transport-equivalent `taxonomyPreference` and provider injection through the shared operational command.

- [ ] **Step 1: Write failing MCP tests**

Use production server composition and a counting fake taxonomy provider. Prove:

- omitted preference inherits `aiPreference`;
- explicit deterministic preference suppresses the provider;
- GPT-preferred invokes it once on a new command;
- committed replay invokes it zero additional times;
- changed preference under the same command ID returns `IDEMPOTENCY_CONFLICT`; and
- persisted taxonomy/trace can be read after runtime reopen.

- [ ] **Step 2: Write the equivalent HTTP tests**

Use a real HTTP server and the same semantic cases. Include a lost-response retry with the same body and `Idempotency-Key`; assert one committed taxonomy write set and no second provider call.

- [ ] **Step 3: Write explicit legacy-composition tests**

Prove omitted taxonomy preference leaves the explicit legacy fixture path unchanged. An explicitly supplied taxonomy preference without an operational dispatcher returns a clear unsupported/configuration failure and does not silently discard taxonomy.

- [ ] **Step 4: Run and verify RED**

```bash
npx vitest run test/server-actions.test.ts test/approval-desk-http.test.ts test/operational-runtime-parity.test.ts test/reliability-command-replay.test.ts --maxWorkers=1
```

- [ ] **Step 5: Add thin transport wiring**

Add optional `taxonomyPreference` to both request schemas. Forward it to `evaluateTicketCommand()` and pass the injected/shared `taxonomyReasoningProvider` through `EvaluationCommandDependencies`. Do not call `runTaxonomyStage()` from either adapter.

- [ ] **Step 6: Centralize environment construction**

Use one `createTaxonomyReasoningProviderFromEnv()` path for HTTP and MCP. Do not duplicate URL, API-key, model, timeout, or activation logic. Preserve explicit test injection precedence over environment construction.

- [ ] **Step 7: Run transport and regression tests**

```bash
npx vitest run test/server-actions.test.ts test/approval-desk-http.test.ts test/operational-runtime-parity.test.ts test/reliability-command-replay.test.ts test/runtime.test.ts --maxWorkers=1
npm run typecheck
```

Expected: PASS with identical HTTP/MCP canonical behavior.

- [ ] **Step 8: Commit**

```bash
git add src/server.ts src/approval-desk/http.ts src/evaluation-command.ts src/runtime.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/operational-runtime-parity.test.ts test/reliability-command-replay.test.ts test/runtime.test.ts
git commit -m "feat: wire B2 taxonomy through production transports"
```

If `src/runtime.ts` or `test/runtime.test.ts` did not change, omit them from staging rather than creating a no-op edit.

---

### Task 7: Complete B1/R1 regression and release verification

**Files:**
- Modify only narrowly relevant README or evaluation documentation if runtime configuration needs documentation.
- Do not change production behavior in this task unless a reproduced B2 defect requires returning to the owning task.

**Interfaces:**
- Consumes: completed Tasks 1–6.
- Produces: evidence that B2 satisfies the design without regression or scope drift.

- [ ] **Step 1: Run the focused B2 suite**

```bash
npx vitest run \
  test/taxonomy-stage.test.ts \
  test/taxonomy-inference.test.ts \
  test/taxonomy-reasoning-provider.test.ts \
  test/taxonomy-evaluation.test.ts \
  test/ai-evaluation.test.ts \
  test/triage-operational-evaluation.test.ts \
  test/operational-domain.test.ts \
  test/operational-command-dispatch.test.ts \
  test/reliability-command-replay.test.ts \
  test/operational-runtime-parity.test.ts \
  test/server-actions.test.ts \
  test/approval-desk-http.test.ts \
  --maxWorkers=1
```

Record the exact file and assertion counts.

- [ ] **Step 2: Run build and typecheck separately**

```bash
npm run build
npm run typecheck
```

- [ ] **Step 3: Run the B1 evaluator**

```bash
npm run evaluate:taxonomy-inference
```

Record deterministic and controlled-provider lane results. Do not describe controlled providers as live GPT validation.

- [ ] **Step 4: Run the full suite with one worker**

```bash
npx vitest run --dir test --maxWorkers=1
```

- [ ] **Step 5: Inspect structural boundaries**

```bash
git diff --check
git diff --stat origin/main...HEAD
rg -n 'beginCommand\(|canonicalRequestHash\(' src
rg -n 'runTaxonomyStage\(' src
rg -n 'taxonomyReasoningProvider|taxonomyPreference' src
rg -n 'diagnosticTaxonomyRevisionId|diagnostic-taxonomy-revised' src
```

Review every match. Passing conditions:

- no new direct legacy command/hash path;
- `runTaxonomyStage()` appears only in the shared preparation path and focused stage code;
- HTTP/MCP contain wiring, not independent orchestration;
- no provider call appears in a transaction callback;
- no generated taxonomy or trace appears in caller intent hashing;
- every persisted taxonomy revision is linked to one event and optional result reference; and
- no B3/B4/B5 code exists in the diff.

- [ ] **Step 6: Review the entire branch against the spec**

Check every acceptance criterion, replay corruption case, rollback case, legacy boundary, and advisory-isolation assertion. If a defect is found, add the smallest reproducing test in the owning task's test file, fix it, rerun focused and full verification, and commit the remediation separately.

- [ ] **Step 7: Commit narrow documentation, if changed**

```bash
git add README.md docs
git commit -m "docs: describe advisory taxonomy runtime configuration"
```

Skip this commit when no documentation file changed.

- [ ] **Step 8: Report completion without publishing**

Report:

- worktree, branch, base, and final HEAD;
- commits and changed files;
- schema version;
- focused, evaluator, build, typecheck, and full-suite results;
- replay/provider call-count evidence;
- review findings and remaining risks;
- confirmation that semantic retrieval/ranking was not started; and
- clean `git status --short`.

Do not push, merge, create a PR, or delete the worktree.

---

## Acceptance coverage ledger

| Design acceptance | Owning task |
|---|---|
| Canonical trace/result contracts and backward parsing | 1 |
| Portable provider and expected failure typing | 2 |
| Deterministic/GPT selection, safety, support, basis | 3 |
| Caller-intent identity and early replay/readiness | 4 |
| Advisory isolation from recommendation and drafting | 4 |
| Atomic change-only taxonomy persistence | 5 |
| Stronger-evidence protection | 5 |
| Immutable taxonomy replay and corruption detection | 5 |
| HTTP/MCP parity and lost-response recovery | 6 |
| Explicit legacy behavior | 6 |
| B1 evaluator and full R1 regression | 7 |
| No B3/B4/B5 scope drift | 7 |

## Execution handoff

Read the reconciled design and this plan together. At execution time, verify `origin/main` before creating the isolated worktree. If it differs from `f31f64c38d6715d435307caaf1370d3b9c8411bd`, inspect the intervening commits and update only the affected file names, contracts, and tests before starting Task 1.

The most important R1 checkpoints are:

```text
same committed key -> replay before all provider work
changed caller taxonomy preference -> conflict before provider work
generated taxonomy differences -> never redefine command identity
stale preparation -> zero partial writes
successful commit -> recommendation + optional taxonomy + result + receipt are atomic
corrupt replay reference -> operational integrity error
```
