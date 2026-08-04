# Governed Knowledge Reuse Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete and prove the governed knowledge-reuse lifecycle by making defer resumable, deriving multi-diagnosis evidence policy safely, and extending the deterministic showcase through future-ticket reuse and historical immutability.

**Architecture:** Keep `KnowledgeEvolutionService` as the sole authority for review and promotion semantics. A deferred candidate remains a candidate and a workflow gate, but it is not a terminal decision; approval or rejection remains the explicit terminal decision. Deterministic candidate policy derives only evidence references common to every completed supporting diagnosis; if no safe common set exists, the candidate stays `undecided` and cannot be promoted without operator policy selection. The showcase uses the existing recommendation builder and knowledge-object projection to compare a saved pre-promotion recommendation with later evaluations.

**Tech Stack:** TypeScript ESM, Zod schemas, Vitest, local repositories, deterministic showcase scripts.

---

### Task 1: Make defer resumable

**Files:**
- Modify: `src/knowledge-evolution/service.ts`
- Test: `test/knowledge-evolution-service.test.ts`

- [x] **Step 1: Write the failing regression test**

Add a service test that discovers a valid candidate, defers it, then approves the same candidate at the unchanged version. Assert that approval succeeds, creates an approved v1 object, and the candidate audit history contains `deferred` followed by `approved`.

- [x] **Step 2: Run the focused test and verify the expected failure**

Run:

```powershell
npx vitest run --dir test test/knowledge-evolution-service.test.ts -t "allows a deferred candidate"
```

Expected failure: approval is rejected with `STALE_APPROVAL` because the current service treats `deferred` as terminal.

- [x] **Step 3: Implement the minimal semantic change**

Change promotion validation so only `rejected` is terminal for a candidate review; remove `deferred` from the terminal-review rejection. Change the shared review guard used by reject/defer so an existing `deferred` audit does not block a later explicit decision, while `approved` and `rejected` still do. Keep the deferred audit and pattern gate state intact so the UI remains blocked until a later review action.

- [x] **Step 4: Run the focused test and verify it passes**

Run the same command. Expected: PASS, including the existing duplicate-review and concurrency tests.

### Task 2: Derive multi-diagnosis evidence policy safely

**Files:**
- Modify: `src/knowledge-evolution/service.ts`
- Test: `test/knowledge-evolution-service.test.ts`
- Test: `test/knowledge-evolution-reuse.test.ts` if the future-ticket fixture needs a distinct evidence policy

- [x] **Step 1: Write failing tests for shared and divergent evidence**

Add one test with two supporting diagnoses that both reference `request-id` plus different secondary evidence; assert the candidate policy requires only the shared `request-id`. Add one test with two supporting diagnoses whose evidence references are disjoint; assert the candidate policy is `{ mode: "undecided" }`, validation is `invalid`, and approval is rejected until an operator supplies an explicit policy.

- [x] **Step 2: Run the focused tests and verify the expected failure**

Run:

```powershell
npx vitest run --dir test test/knowledge-evolution-service.test.ts test/knowledge-evolution-reuse.test.ts -t "shared evidence|divergent evidence"
```

Expected failure: the current candidate uses the first diagnosis's evidence references and therefore incorrectly selects a diagnosis-order-dependent policy.

- [x] **Step 3: Implement the deterministic intersection rule**

Replace the first-diagnosis lookup in `deterministicCandidate()` with a map of evidence IDs per supporting diagnosis. When every supporting diagnosis has at least one observed reference, compute the sorted intersection. Use `required` with the intersection when non-empty; otherwise use `undecided`. Preserve all supporting diagnosis IDs, discovery reasons, contradictions, and metadata. The policy must never use legacy `evidenceIds`.

- [x] **Step 4: Run the focused tests and verify they pass**

Run the same command. Expected: PASS for shared evidence, divergent evidence, legacy evidence, duplicate references, and promotion validation.

### Task 3: Extend the deterministic showcase through future-ticket reuse

**Files:**
- Modify: `scripts/demo-knowledge-evolution.ts`
- Test: `test/demo-knowledge-evolution.test.ts`
- Modify: `README.md`
- Modify: `docs/knowledge-evolution.md`
- Modify: `docs/demo-results.md`

- [x] **Step 1: Write the failing showcase assertions**

Extend the showcase report contract and test to require these observations: a future ticket is evidence-gated before promotion; a pre-promotion recommendation snapshot is saved; promotion creates an approved v1 object; reevaluation after promotion links the known cause but remains evidence-gated; a reply with the required evidence makes the known-cause workflow actionable; and the saved historical recommendation serializes byte-for-byte identically after all later evaluations.

- [x] **Step 2: Run the focused showcase test and verify the expected failure**

Run:

```powershell
npx vitest run --dir test test/demo-knowledge-evolution.test.ts -t "knowledge evolution showcase"
```

Expected failure: the current showcase only discovers and approves a candidate and has no future-ticket or historical snapshot assertions.

- [x] **Step 3: Implement the stateful showcase extension**

Use a deterministic future ticket whose trigger matches the promoted object and whose `request-id` evidence is initially missing. Evaluate it before promotion and save a stable JSON snapshot of the recommendation. Promote the candidate. Evaluate again with the approved object and assert the known-cause ID is present while `supportState` remains `needs-information`. Add a customer reply containing the catalog evidence, reevaluate, and assert `supportState: "known-cause"` with no missing evidence. Re-read the saved original recommendation and compare its stable JSON representation with the pre-promotion snapshot. Print sanitized sections for pre-promotion gate, promoted v1, evidence-gated reuse, actionable reuse, and historical immutability. Keep the controlled GPT candidate draft advisory and local.

- [x] **Step 4: Run the focused test and showcase command**

Run:

```powershell
npx vitest run --dir test test/demo-knowledge-evolution.test.ts
npm run demo:knowledge-evolution -- --verbose
```

Expected: the test passes and the terminal output visibly includes the complete reuse sequence without raw ticket bodies, prompts, or provider payloads.

### Task 4: Document the corrected semantics

**Files:**
- Modify: `docs/knowledge-evolution.md`
- Modify: `README.md`
- Modify: `docs/demo-results.md`

- [x] **Step 1: Update defer semantics**

State that Defer is resumable: it keeps the candidate visible and gated, and a later explicit approval or rejection may proceed at the current candidate version. It does not mutate historical recommendations or route tickets.

- [x] **Step 2: Update multi-diagnosis policy semantics**

Document that deterministic policy uses the intersection of catalog-backed evidence references across all completed supporting diagnoses. A divergent set becomes `undecided` and requires operator policy selection; the system never unions every diagnosis's evidence automatically.

- [x] **Step 3: Add the showcase result**

Document the future-ticket progression and the byte-for-byte historical recommendation check. Describe the approved object as v1, not as a general revision system.

### Task 5: Full verification and GitHub publish

**Files:**
- No additional source files; verify the complete diff.

- [x] **Step 1: Run the complete verification gate**

Run:

```powershell
npm run build
npm run typecheck
npx vitest run --dir test
npm run evaluate:diagnostics
npm run evaluate:lifecycle-replay
npm run demo:knowledge-evolution -- --verbose
```

Expected: all commands exit 0, the full test suite is green, the diagnostic matrix remains 11/11, the lifecycle replay remains resolved, and the knowledge showcase reports future-ticket reuse plus historical immutability.

- [ ] **Step 2: Commit and push**

Create a focused commit:

```powershell
git add src/knowledge-evolution/service.ts scripts/demo-knowledge-evolution.ts test/knowledge-evolution-service.test.ts test/demo-knowledge-evolution.test.ts README.md docs/knowledge-evolution.md docs/demo-results.md docs/superpowers/plans/2026-08-05-governed-knowledge-reuse-closeout.md
git commit -m "feat: prove governed knowledge reuse lifecycle"
git push origin main
```
