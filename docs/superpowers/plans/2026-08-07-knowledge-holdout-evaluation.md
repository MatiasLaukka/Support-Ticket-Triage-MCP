# Governed Knowledge Holdout Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a read-only, deterministic holdout evaluator that compares baseline triage with exact-version governed knowledge reuse through the same production path, proving efficacy, lifecycle safety, temporal isolation, and historical immutability.

**Architecture:** Extend the existing learning ledger and knowledge-evolution stores with immutable version/head semantics and a shared `listReusableApproved({ asOf })` boundary. Production HTTP/MCP/UI evaluation and the holdout evaluator consume the same `ReusableKnowledgeResult` before calling `evaluateTicketWithAi`; no evaluator-specific matcher or expected-outcome shortcut is permitted. The holdout runs fixed multi-turn fixtures in baseline and learned lanes, retaining every turn and producing separate efficacy, governance-safety, and version-correctness scorecards without operational or learning writes.

**Tech Stack:** TypeScript/Node.js 20+, Zod, Vitest, existing `better-sqlite3` adapters, JSON/in-memory compatibility repositories, deterministic fixtures, and the current Approval Desk/MCP runtime.

## Global Constraints

- The operational plane remains authoritative for classification, evidence readiness, diagnosis, fixes, verification, lifecycle transitions, and customer responses.
- All production surfaces and the holdout use `listReusableApproved({ asOf })` followed by `evaluateTicketWithAi`; no transport or evaluator may reimplement reuse filtering.
- `asOf` is temporal isolation: no post-`asOf` version, head transition, or health event may influence a result, and each head is reconstructed as it existed at `asOf`.
- `learningGovernance: "legacy" | "ledger"` is immutable version provenance; legacy normalization is read-only and new writes must include the marker.
- Exact `(objectId, sourceVersion)` health controls eligibility; unhealthy current versions never implicitly resurrect older versions.
- GPT, expected outcomes, and oracle labels are advisory/scoring inputs only; deterministic workflow rules and human approval remain authoritative.
- Holdout scoring is deterministic, provider-free, network-free, and read-only: it must not mutate tickets, recommendations, operational audits, learning events, candidates, knowledge versions, or head mappings.
- A whole-ledger snapshot failure returns no reusable contexts and `status: "ledger-unavailable"`; a healthy snapshot with one malformed version excludes only that version and returns a structured issue.
- In-progress tickets remain pinned to the exact knowledge version that produced their recommendation until explicit re-evaluation.
- Stale, contradicted, deprecated, or superseded versions remain inspectable but never bypass evidence gates or become reusable without an explicit domain action.
- New tests follow TDD: write a failing focused regression, run it, implement the smallest change, rerun the focused suite, then run the affected full suite.

---

## File Map

Create:

- `src/knowledge-evolution/reusable-context.ts` — exact-version reusable-context result, issue types, historical projection, and shared service boundary.
- `src/knowledge-evolution/knowledge-version-store.ts` — storage-neutral version/head interfaces and transition input types.
- `src/knowledge-evolution/holdout-fixtures.ts` — fixed future-ticket fixtures, complete conversation snapshots, and expected per-turn/final targets.
- `src/knowledge-evolution/holdout-evaluation.ts` — baseline/learned lane runner, turn retention, safety-violation detection, snapshot guards, and scorecard aggregation.
- `scripts/evaluate-knowledge-holdout.ts` — deterministic CLI/report writer.
- `test/knowledge-version-store.test.ts` — version/head immutability and transition contracts.
- `test/knowledge-reusable-context.test.ts` — exact-version health, `asOf`, legacy compatibility, and failure semantics.
- `test/knowledge-holdout-evaluation.test.ts` — fixture lanes, no-write guarantees, and scorecard contracts.
- `test/demo-knowledge-holdout.test.ts` — CLI output contract.

Modify:

- `src/knowledge-evolution/domain.ts` — immutable governance marker and canonical read/write schemas.
- `src/knowledge-evolution/learning-ledger.ts` — atomic snapshot API and version-transition event types.
- `src/knowledge-evolution/in-memory-learning-ledger.ts` — defensive atomic snapshots for tests/replay.
- `src/knowledge-evolution/sqlite-learning-ledger.ts` — transactional snapshots and transition-event persistence.
- `src/knowledge-evolution/learning-read-model.ts` — exact-version, `asOf`-bounded projection.
- `src/knowledge-evolution/knowledge-object-repository.ts` — legacy-compatible JSON version/head storage.
- `src/knowledge-evolution/sqlite-knowledge-evolution-store.ts` — version history, head mappings, replacement promotion, and explicit reactivation.
- `src/knowledge-evolution/service.ts` — shared reusable boundary, replacement/reactivation operations, and exact-version review semantics.
- `src/approval-desk/evidence-readiness.ts` — consume reusable contexts and return exact `knownCauseRef`.
- `src/approval-desk/recommendation-builder.ts` — persist approved-object version provenance and reuse availability.
- `src/approval-desk/ai-evaluation.ts` — accept the production reusable-context result without creating a second representation.
- `src/server.ts`, `src/approval-desk/http.ts`, `src/runtime.ts` — route every production evaluation through the shared boundary and expose truthful availability/issues.
- `src/domain.ts`, `src/triage-service.ts` — extend recommendation provenance/output schemas only where exact version and reuse status require it.
- `package.json` — add `evaluate:knowledge-holdout` and include it in the verification command after focused tests are green.
- `README.md`, `docs/knowledge-evolution.md`, `docs/demo-results.md` — document the bounded claim and sanitized holdout evidence.

---

## Task 1: Formalize immutable version provenance and atomic ledger snapshots

**Files:**
- Modify: `src/knowledge-evolution/domain.ts`
- Modify: `src/knowledge-evolution/learning-ledger.ts`
- Modify: `src/knowledge-evolution/in-memory-learning-ledger.ts`
- Modify: `src/knowledge-evolution/sqlite-learning-ledger.ts`
- Modify: `src/knowledge-evolution/learning-read-model.ts`
- Create: `test/knowledge-version-store.test.ts`
- Modify: `test/knowledge-learning-ledger.test.ts`
- Modify: `test/knowledge-learning-ledger-contract.test.ts`
- Modify: `test/knowledge-learning-read-model.test.ts`

**Interfaces:**
- Consumes: existing `KnowledgeObjectSchema`, `LearningEventSchema`, `LearningLedger`, and adapter contract tests.
- Produces:

```ts
export const LearningGovernanceSchema = z.enum(["legacy", "ledger"]);
export type LearningGovernance = z.infer<typeof LearningGovernanceSchema>;

export interface LearningLedger {
  initialize(): Promise<void>;
  append(event: LearningEvent): Promise<void>;
  appendBatch(events: readonly LearningEvent[]): Promise<void>;
  snapshot(): Promise<readonly LearningEvent[]>;
  list(filters?: LearningEventFilters): Promise<LearningEvent[]>;
  has(id: string): Promise<boolean>;
}
```

- [ ] **Step 1: Write failing contract tests** for a ledger snapshot returning a defensive, chronologically stable copy; identical snapshot reads not observing a partial batch; `knowledge-version-superseded` and `knowledge-version-reactivated` event validation; and a new approved object requiring `learningGovernance: "ledger"`.
- [ ] **Step 2: Run the focused tests**.

Run: `npm test -- --run test/knowledge-learning-ledger.test.ts test/knowledge-learning-ledger-contract.test.ts test/knowledge-learning-read-model.test.ts`

Expected: FAIL because the snapshot method, transition event variants, and governance marker are absent.

- [ ] **Step 3: Add the canonical schemas.** Add immutable `learningGovernance` to new knowledge-object writes. Add a read-only normalization schema that fills the missing field with `"legacy"` only when parsing old persisted JSON/SQLite payloads; the canonical write schema must reject omission. Add strict transition payloads carrying the exact object/version and replacement/reactivation version where needed.
- [ ] **Step 4: Implement atomic snapshots.** In-memory snapshots clone the complete event list under the adapter’s write lock. SQLite snapshots run one read transaction and return validated event copies. Keep `list(filters)` behavior stable by filtering a snapshot result rather than maintaining a second projection path.
- [ ] **Step 5: Make `projectKnowledgeLearning(events, { candidateId, objectId, asOf })` discard every event after `asOf` before sorting/projection and scope health transitions to the exact `(objectId, sourceVersion)` key.** Add superseded/reactivated handling without deleting historical events.
- [ ] **Step 6: Run the focused tests again**, then run `npm test -- --run test/knowledge-learning-ledger*.test.ts test/knowledge-learning-read-model.test.ts`.
- [ ] **Step 7: Commit.**

```powershell
git add src/knowledge-evolution/domain.ts src/knowledge-evolution/learning-ledger.ts src/knowledge-evolution/in-memory-learning-ledger.ts src/knowledge-evolution/sqlite-learning-ledger.ts src/knowledge-evolution/learning-read-model.ts test/knowledge-version-store.test.ts test/knowledge-learning-ledger.test.ts test/knowledge-learning-ledger-contract.test.ts test/knowledge-learning-read-model.test.ts
git commit -m "feat: formalize versioned learning snapshots"
```

## Task 2: Implement version-aware JSON and SQLite knowledge stores

**Files:**
- Create: `src/knowledge-evolution/knowledge-version-store.ts`
- Modify: `src/knowledge-evolution/knowledge-object-repository.ts`
- Modify: `src/knowledge-evolution/sqlite-knowledge-evolution-store.ts`
- Modify: `src/knowledge-evolution/service.ts`
- Modify: `src/runtime.ts`
- Modify: `test/knowledge-evolution-repositories.test.ts`
- Modify: `test/sqlite-knowledge-evolution-store.test.ts`
- Modify: `test/knowledge-evolution-service.test.ts`

**Interfaces:**
- Consumes: Task 1 governance schemas and transition events.
- Produces:

```ts
export interface KnowledgeVersionStore {
  listApproved(): Promise<KnowledgeObject[]>;
  listVersions(objectId: string): Promise<KnowledgeObject[]>;
  listVersionsAsOf(asOf: string): Promise<KnowledgeObject[]>;
  listHeadMappings(): Promise<ReadonlyMap<string, number>>;
  listHeadMappingsAsOf(asOf: string): Promise<ReadonlyMap<string, number>>;
  promoteReplacement(input: {
    candidateId: string;
    approved: KnowledgeObject;
    expectedCandidateVersion: number;
    expectedHeadVersion: number;
    promotionAudit: KnowledgeAuditEvent;
    supersededEvent: LearningEvent;
    promotionEvent: LearningEvent;
  }): Promise<KnowledgeObject>;
  reactivateVersion(input: {
    objectId: string;
    sourceVersion: number;
    actorId: string;
    reason: string;
    occurredAt: string;
    reactivatedEvent: LearningEvent;
  }): Promise<KnowledgeObject>;
}
```

- [ ] **Step 1: Write failing repository tests** for legacy JSON/SQLite records normalizing to `legacy`; new records requiring `ledger`; complete immutable version history; current head mappings; `listVersionsAsOf` excluding future versions; replacement requiring the expected head; atomic supersession/promotion records; explicit reactivation; and no implicit fallback to an older version.
- [ ] **Step 2: Run the focused repository tests** and confirm the methods are missing or reject the new contracts.
- [ ] **Step 3: Add the storage-neutral interface and JSON layout.** Preserve an existing `<approvedRoot>/<objectId>.json` as a legacy v1 read path. Store new immutable payloads under `<approvedRoot>/_versions/<objectId>/v<version>.json`, atomically publish `<approvedRoot>/_heads.json` mappings, and append immutable head-transition records to `<approvedRoot>/_head-transitions.jsonl` with effective timestamps. A missing marker is normalized only on read; every newly published version includes `learningGovernance: "ledger"`.
- [ ] **Step 4: Extend the SQLite schema.** Keep `knowledge_versions` immutable, add a `knowledge_object_heads(object_id PRIMARY KEY, version)` table and a `knowledge_head_transitions` table containing from/to versions, transition kind, effective timestamp, and correlation ID. Store the governance marker and effective approval timestamp, and add indexes for object/version/time queries.
- [ ] **Step 5: Implement replacement promotion as one transaction.** Validate the candidate version and expected current head, insert the next immutable version, update the head mapping, append a supersession transition, persist the supplied old-version supersession and new-version promotion events, and roll back all writes if any validation or persistence step fails. Do not permit replacement to overwrite an existing version.
- [ ] **Step 6: Implement explicit `reactivateVersion`.** Require an existing historical version and actor/reason, move only the requested object head, append a reactivation transition and the supplied `knowledge-version-reactivated` event, and never infer reactivation from a stale, contradicted, deprecated, or missing event.
- [ ] **Step 7: Run JSON and SQLite repository suites plus existing knowledge-evolution service tests.** Verify old fixtures remain readable and current `listApproved()` callers still receive only the current head.
- [ ] **Step 8: Commit.**

```powershell
git add src/knowledge-evolution/knowledge-version-store.ts src/knowledge-evolution/knowledge-object-repository.ts src/knowledge-evolution/sqlite-knowledge-evolution-store.ts src/knowledge-evolution/service.ts src/runtime.ts test/knowledge-evolution-repositories.test.ts test/sqlite-knowledge-evolution-store.test.ts test/knowledge-evolution-service.test.ts
git commit -m "feat: add immutable knowledge version transitions"
```

## Task 3: Build the shared exact-version reusable-context boundary

**Files:**
- Create: `src/knowledge-evolution/reusable-context.ts`
- Modify: `src/knowledge-evolution/service.ts`
- Modify: `src/knowledge-evolution/learning-read-model.ts`
- Create: `test/knowledge-reusable-context.test.ts`

**Interfaces:**
- Consumes: `KnowledgeVersionStore`, `LearningLedger.snapshot()`, and `projectKnowledgeLearning`.
- Produces:

```ts
export type ReusableKnowledgeIssue =
  | { scope: "snapshot"; code: "ledger-read-failed" }
  | { scope: "version"; objectId: string; version: number; code: "missing-history" | "inconsistent-history" | "unhealthy-version" };

export type ReusableKnowledgeContext = {
  object: KnowledgeObject;
  version: number;
  learning: {
    maturity: LearningMaturity;
    health: LearningHealth;
    eligibleForReuse: boolean;
  };
  eligibilitySource: "ledger-active" | "legacy-compatible";
};

export type ReusableKnowledgeResult = {
  status: "available" | "ledger-unavailable";
  contexts: readonly ReusableKnowledgeContext[];
  issues: readonly ReusableKnowledgeIssue[];
};

export async function listReusableApproved(input: {
  objects: KnowledgeVersionStore;
  ledger: LearningLedger;
  asOf: string;
}): Promise<ReusableKnowledgeResult>;
```

- [ ] **Step 1: Write failing tests** for ledger-active inclusion, explicit legacy compatibility, exact stale/contradicted/deprecated/superseded exclusion, missing/inconsistent ledger-governed history, object-version isolation, no implicit historical resurrection, and all post-`asOf` promotions/health events being ignored.
- [ ] **Step 2: Add failure-semantics tests.** A snapshot read that fails or cannot establish one consistent view must return `status: "ledger-unavailable"`, `contexts: []`, and a snapshot-scoped issue. A healthy snapshot with one malformed version must return `status: "available"`, exclude only that version, and retain other verified contexts.
- [ ] **Step 3: Implement historical head resolution.** Query `listVersionsAsOf(asOf)` and `listHeadMappingsAsOf(asOf)`, use only versions and head transitions effective by `asOf`, and select each object’s head as of that timestamp rather than using today’s head.
- [ ] **Step 4: Implement exact-version health projection.** For each selected `(objectId, version)`, project only matching events at or before `asOf`; include ledger-governed active versions and explicitly legacy versions with no exact conflicting event; attach structured issues for missing/inconsistent histories.
- [ ] **Step 5: Expose the function through `KnowledgeEvolutionService.listReusableApproved({ asOf })`** so UI, MCP, Skill, and holdout callers have one authoritative domain entry point. Keep `listApproved()` broad for review/history and never make it the production reuse feed.
- [ ] **Step 6: Run the focused service tests and the complete learning/read-model suite.**
- [ ] **Step 7: Commit.**

```powershell
git add src/knowledge-evolution/reusable-context.ts src/knowledge-evolution/service.ts src/knowledge-evolution/learning-read-model.ts test/knowledge-reusable-context.test.ts
git commit -m "feat: enforce historical reusable knowledge eligibility"
```

## Task 4: Carry exact knowledge provenance through the production diagnostic path

**Files:**
- Modify: `src/approval-desk/evidence-readiness.ts`
- Modify: `src/approval-desk/recommendation-builder.ts`
- Modify: `src/approval-desk/ai-evaluation.ts`
- Modify: `src/domain.ts`
- Modify: `src/triage-service.ts`
- Modify: `src/server.ts`
- Modify: `src/approval-desk/http.ts`
- Modify: `src/runtime.ts`
- Modify: `test/approval-desk-recommendation.test.ts`
- Modify: `test/approval-desk-http.test.ts`
- Modify: `test/approval-desk-entrypoint.test.ts`

**Interfaces:**
- Consumes: `ReusableKnowledgeResult` from Task 3.
- Produces:

```ts
type ProductionKnowledgeInput = {
  reusableKnowledge: ReusableKnowledgeResult;
};

type KnowledgeReference = { objectId: string; version: number };
```

- [ ] **Step 1: Write failing production-path tests** proving an approved object is usable only when supplied through a reusable context, a required-evidence object remains `needs-information`, a none-required object can reach `known-cause`, and the recommendation persists the exact `knownCauseRef`.
- [ ] **Step 2: Add tests for service failure observability.** With `status: "ledger-unavailable"`, evaluation still performs deterministic classification and evidence gating, produces no learned match, and exposes the status/issues without claiming learned reuse.
- [ ] **Step 3: Update evidence readiness.** Accept reusable contexts as the authoritative learned input, return the matched `{ objectId, version }`, and use the selected object’s evidence policy. Preserve the existing direct `approvedObjects` fixture seam only for isolated legacy tests; production routes must pass `ReusableKnowledgeResult`.
- [ ] **Step 4: Update recommendation schemas/builders.** Add optional `knownCauseRef` and a compact learned-context status/issues field where the existing output contract permits it. Enforce `knownCauseRef -> knownCause`, require the reference for approved-object reuse, and reject a reference not present in the supplied reusable contexts.
- [ ] **Step 5: Wire HTTP, MCP, and runtime evaluation.** Before every call to `evaluateTicketWithAi`, call `deps.knowledgeEvolution.service.listReusableApproved({ asOf: deps.now().toISOString() })` and pass that exact result through. Remove production calls that use `service.listApproved()` as a reuse feed.
- [ ] **Step 6: Keep direct test fixtures deterministic.** Update existing tests to wrap approved objects in a `ReusableKnowledgeResult` where they assert version provenance; leave catalog known causes and legacy records without a manufactured reference.
- [ ] **Step 7: Run recommendation, HTTP, MCP, and runtime suites.** Confirm Approval Desk and MCP produce equivalent recommendation fields for the same ticket/history/actor input.
- [ ] **Step 8: Commit.**

```powershell
git add src/approval-desk/evidence-readiness.ts src/approval-desk/recommendation-builder.ts src/approval-desk/ai-evaluation.ts src/domain.ts src/triage-service.ts src/server.ts src/approval-desk/http.ts src/runtime.ts test/approval-desk-recommendation.test.ts test/approval-desk-http.test.ts test/approval-desk-entrypoint.test.ts
git commit -m "feat: persist exact reusable knowledge provenance"
```

## Task 5: Define fixed multi-turn holdout fixtures and lane execution

**Files:**
- Create: `src/knowledge-evolution/holdout-fixtures.ts`
- Create: `src/knowledge-evolution/holdout-evaluation.ts`
- Modify: `src/approval-desk/ai-evaluation.ts`
- Create: `test/knowledge-holdout-evaluation.test.ts`

**Interfaces:**
- Consumes: the production `evaluateTicketWithAi` input, `listReusableApproved({ asOf })`, existing ticket/knowledge/diagnosis repositories, and deterministic clock injection.
- Produces:

```ts
export type HoldoutTurn = {
  customerReplies: readonly CustomerReply[]; // complete conversation snapshot as of this turn
  previousSupportResponse?: PreviousSupportResponse;
  expected?: {
    supportState?: SupportState;
    knownCauseRef?: { objectId: string; version: number };
    requiredEvidenceSatisfied?: boolean;
  };
};

export type KnowledgeHoldoutFixture = {
  id: string;
  initialTicket: Ticket;
  expectedOutcome: ExpectedOutcome; // scorer oracle only
  turns: readonly HoldoutTurn[];
  expectedEvidenceIds: readonly string[];
  expectedTarget: {
    supportState: SupportState;
    knownCauseRef?: { objectId: string; version: number };
    requiredEvidenceSatisfied?: boolean;
  };
};

export type HoldoutLaneResult = {
  turns: readonly HoldoutTurnResult[];
  finalRecommendation: TriageRecommendation;
  targetReached: boolean;
  turnsToExpectedTarget: number | null;
};
```

- [ ] **Step 1: Write failing fixture tests** for all seven fixture classes: sufficient-evidence true positive; missing evidence followed by a supplying reply; near miss; unrelated; stale; contradicted; and version isolation for replacement and unapproved draft versions.
- [ ] **Step 2: Make every turn an immutable input.** Use `initialTicket` plus complete `customerReplies` snapshots; do not append hidden evaluator state from a prior turn. Keep `expectedOutcome` and `expectedTarget` in the scorer-only structure and never pass `expectedOutcome` as the production evaluator’s `outcome` shortcut.
- [ ] **Step 3: Implement targeted lanes.** Run baseline with no reusable contexts and healthy learned with the exact `ReusableKnowledgeResult`; run stale/contradicted variants only through the real service; run replacement/draft-isolation variants without generating an unnecessary Cartesian product.
- [ ] **Step 4: Retain every turn.** Each turn stores recommendation, exact `knownCauseRef`, requested/provided/missing evidence IDs, support state, target match, correction status, and `unsafeLifecycleViolations` reason codes. Derive `unsafeLifecycleChanges` from those codes for the public scorecard.
- [ ] **Step 5: Implement intermediate and final contracts.** Per-turn `expected` detects early evidence-gate bypasses, wrong-version activation, escalation bypasses, or later-than-permitted states. The final target requires state, exact version when declared, and evidence satisfaction when declared; `turnsToExpectedTarget` is `null` when unreachable.
- [ ] **Step 6: Add read-only snapshots around each lane.** Snapshot ticket revisions, recommendation count, operational audit count, learning-event IDs, candidate IDs, version IDs, and `objectId -> headVersion` mappings before and after. Fail the lane if any value changes, including evaluation events.
- [ ] **Step 7: Run the focused holdout tests** and confirm all lanes call the same production reusable-context and evaluation functions.
- [ ] **Step 8: Commit.**

```powershell
git add src/knowledge-evolution/holdout-fixtures.ts src/knowledge-evolution/holdout-evaluation.ts src/approval-desk/ai-evaluation.ts test/knowledge-holdout-evaluation.test.ts
git commit -m "feat: add production-path knowledge holdout lanes"
```

## Task 6: Add efficacy, governance, and version scorecards

**Files:**
- Modify: `src/knowledge-evolution/holdout-evaluation.ts`
- Modify: `src/knowledge-evolution/holdout-fixtures.ts`
- Modify: `test/knowledge-holdout-evaluation.test.ts`

**Interfaces:**
- Consumes: complete `HoldoutLaneResult` values from Task 5.
- Produces:

```ts
export type HoldoutScorecard = {
  efficacy: {
    knowledgeMatchPrecision: number | null;
    knowledgeMatchRecall: number | null;
    evidencePrecision: number | null;
    missingEvidenceRate: number | null;
    unnecessaryEvidence: number | null;
    diagnosticTurnsSaved: number | null;
    correctionRequiredRate: number | null;
    benefited: number;
    unchanged: number;
    regressed: number;
  };
  governance: {
    staleFalsePositiveRate: number | null;
    contradictedFalsePositiveRate: number | null;
    unhealthyFalsePositiveRate: number | null;
    unsafeLifecycleChanges: number;
    evidenceGateBypass: number;
  };
  version: {
    wrongVersionReuse: number;
    replacementCorrectness: number | null;
    versionPinning: number | null;
  };
};
```

- [ ] **Step 1: Write failing metric tests** for exact-version match precision/recall, unique evidence precision/missing rate, repeated evidence requests, null zero denominators, turns saved only when both lanes reach the target, stale/contradicted safety rates, version isolation, and safety-first benefited/regressed classification.
- [ ] **Step 2: Implement evidence accounting.** Deduplicate requested IDs across turns for precision and missing-necessary-evidence; count duplicate requests separately as `repeatedEvidenceRequestCount`; use `null` for zero denominators.
- [ ] **Step 3: Implement safety accounting.** Count `evidence-gate-bypass` separately while retaining it in `unsafeLifecycleChanges`; classify wrong object/version, escalation/ambiguity bypass, and later-than-permitted transitions with explicit reason codes.
- [ ] **Step 4: Implement non-overlapping cohorts.** Efficacy includes true positives, missing-evidence, near-miss, and unrelated cases; governance includes stale/contradicted cases; version includes replacement/draft-isolation cases. Do not let health/version variants alter efficacy denominators.
- [ ] **Step 5: Implement comparator semantics.** Mark learned behavior regressed when it introduces an unsafe activation, wrong version, bypass, missing necessary evidence that baseline collected, or new correction requirement. Mark benefited only when no regression exists and reuse, evidence, turns, or target attainment materially improves; otherwise mark unchanged.
- [ ] **Step 6: Run the focused metric tests and the full holdout suite.**
- [ ] **Step 7: Commit.**

```powershell
git add src/knowledge-evolution/holdout-evaluation.ts src/knowledge-evolution/holdout-fixtures.ts test/knowledge-holdout-evaluation.test.ts
git commit -m "feat: score governed knowledge holdout outcomes"
```

## Task 7: Add the deterministic CLI, sanitized reports, and documentation

**Files:**
- Create: `scripts/evaluate-knowledge-holdout.ts`
- Create: `test/demo-knowledge-holdout.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/knowledge-evolution.md`
- Modify: `docs/demo-results.md`

**Interfaces:**
- Consumes: runtime dependencies, fixed holdout suite, and scorecard API from Tasks 3–6.
- Produces: `npm run evaluate:knowledge-holdout`, `reports/knowledge-holdout/controlled-latest.json`, and `reports/knowledge-holdout/controlled-latest.md`.

- [ ] **Step 1: Write the CLI contract test** asserting the report includes frozen `asOf`, injected clock, reusable-context status/issues, every fixture’s turn-by-turn results, exact provenance, baseline/learned deltas, all three scorecards, and read-only snapshot results.
- [ ] **Step 2: Run the CLI test** and confirm the script/report path is absent.
- [ ] **Step 3: Implement the deterministic script.** Load seed tickets/articles/diagnoses, create isolated temporary learning/version stores, seed only fixed approved knowledge and health/version events, run the evaluator with no provider construction, and write sanitized JSON/Markdown without customer transcripts or secrets.
- [ ] **Step 4: Add the package scripts.** Use `npm run build && node dist/scripts/evaluate-knowledge-holdout.js` for `evaluate:knowledge-holdout`, and include that command in `verify:portfolio`; keep both commands deterministic and fail nonzero when any safety/read-only contract fails.
- [ ] **Step 5: Document the result.** Explain that the report demonstrates governed knowledge reuse rather than autonomous retraining, distinguish the three scorecards, describe `ledger-unavailable` fallback, and state that deprecated exclusion is proven by the reusable-context boundary regression while stale/contradicted cases have end-to-end lanes.
- [ ] **Step 6: Run the CLI and documentation tests**, inspect the generated sanitized report, and verify no report contains raw conversation bodies or internal prompts.
- [ ] **Step 7: Commit.**

```powershell
git add scripts/evaluate-knowledge-holdout.ts test/demo-knowledge-holdout.test.ts package.json README.md docs/knowledge-evolution.md docs/demo-results.md
git commit -m "feat: publish governed knowledge holdout evaluation"
```

## Task 8: Run the complete verification gate and review the authority boundary

**Files:**
- No source changes expected; inspect all files changed by Tasks 1–7.

- [ ] **Step 1: Run static checks.**

```powershell
git diff --check
npm run build
npm run typecheck
```

- [ ] **Step 2: Run focused and existing regression suites.**

```powershell
npm test -- --run test/knowledge-version-store.test.ts test/knowledge-reusable-context.test.ts test/knowledge-holdout-evaluation.test.ts test/demo-knowledge-holdout.test.ts
npm test -- --run test/knowledge-evolution-*.test.ts test/approval-desk-recommendation.test.ts test/approval-desk-http.test.ts test/runtime.test.ts
```

- [ ] **Step 3: Run the deterministic holdout and existing lifecycle verification.**

```powershell
npm run evaluate:knowledge-holdout
npm run evaluate:diagnostics
npm run evaluate:lifecycle-replay
```

- [ ] **Step 4: Run the complete portfolio command** after the focused command is green: `npm run verify:portfolio`.
- [ ] **Step 5: Review the final diff against `docs/superpowers/specs/2026-08-07-knowledge-holdout-evaluation-design.md`.** Confirm every production evaluation surface calls the shared reusable service, expected outcomes never enter production evaluation, holdout scoring makes no writes, exact versions cannot drift, and no UI/MCP/GPT code owns lifecycle or promotion decisions.
- [ ] **Step 6: Record any verification-only documentation correction as a separate commit.** Do not amend implementation commits and do not claim measured human time savings from synthetic holdout lanes.

```powershell
git status --short --branch
```

## Rollback and migration notes

- The existing direct `approvedObjects` fixture seam remains available only for isolated legacy tests while production paths use `ReusableKnowledgeResult`.
- The JSON adapter continues to read old approved files as `legacy`; new version files and head mappings are additive and can be removed from a temporary test root without touching operational ticket data.
- SQLite transition writes are transactional. A ledger/read-model failure returns no learned contexts and leaves deterministic triage available.
- The holdout uses isolated temporary stores and never writes evaluation events to the project’s runtime ledger.
- Full migration of tickets, conversations, recommendations, operational audits, and replay snapshots to SQLite remains outside this slice.
