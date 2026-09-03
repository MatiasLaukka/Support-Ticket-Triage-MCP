# Approval Desk Lifecycle Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Approval Desk consume the authoritative lifecycle consistently so every durable ticket state has a truthful, actionable, and recoverable path from evaluation through diagnosis, scoped fix, customer verification, and resolution.

**Architecture:** Keep `buildTicketLifecycleView()` and its `LifecycleView` projection as the sole authority for governed mutation availability. The embedded Approval Desk script will use a small lifecycle action guard plus an authoritative refresh/reconciliation helper; `diagnosisUiPhase` will remain navigation-only. The HTTP list projection will add a minimal lifecycle summary generated from the same workflow read model, while the real TKT-1010 acceptance test will drive operator mutations through the rendered UI and use HTTP only for external/demo events.

**Tech Stack:** TypeScript, Node.js, Vitest, Zod lifecycle schemas, the existing Approval Desk HTTP server, the existing embedded HTML/inline browser harness, and the persisted operational SQLite runtime.

**Spec:** `docs/superpowers/specs/2026-08-26-approval-desk-lifecycle-completion-design.md`

## Global Constraints

- The ticket lifecycle returned by the backend is the only authority for mutation availability; `diagnosisUiPhase` is presentation-only.
- Every governed command rechecks the relevant lifecycle descriptor immediately before posting; existing ticket-revision, conversation-watermark, idempotency, and backend stale-context guards remain authoritative.
- A single operator gesture may execute at most one governed lifecycle mutation. Reconcile and render the returned authoritative state before another governed mutation can be issued.
- After every successful governed mutation, reconcile lifecycle, operator guidance, ticket/revision, current recommendation, diagnoses, and conversation/timeline data affected by that mutation. Do not fabricate durable state locally from a successful POST.
- Back is presentation navigation only: Inspection → current Diagnosis, current Diagnosis → normal Evaluate/Response action bar, history → current Diagnosis, and Scoped Fix → approved diagnosis/current lifecycle.
- Back refreshes authoritative data before the settled action bar is rendered; it must never leave an empty action bar or fall through to contradictory “Response ready” copy.
- Ambiguous, insufficient, rejected, stale, or otherwise unconfirmed diagnoses expose lifecycle-authorized Evaluate/Re-evaluate/Clarify and evidence/questions; they never expose an enabled Next → Inspection → Approve path.
- A confirmed diagnosis opens Scoped Fix only when the lifecycle reports `apply-scoped-fix` as available/primary. Resolve is exposed only when the lifecycle reports `ready-for-close` / `resolve-ticket`.
- A confirmed customer/support-owned diagnosis with no platform mitigation uses the existing verification/customer-action path with a `no-platform-fix-required` explanation; do not fabricate a fix event or add a lifecycle phase.
- Existing playbook evidence requirements remain authoritative. Automatic/synthetic reply coverage must be tested through the real extraction/evaluation path; a generic fallback sentence is not sufficient.
- General correctness comes from exhaustive lifecycle/presentation state coverage plus a cross-ticket invariant audit over every seeded scenario. TKT-1010 is the deep composition test, not the only correctness proof.
- The existing successful Scoped Fix → refresh → Brief behavior, SQLite persistence, diagnosis authority, MCP parity, single-flight evaluation, and append-only history must remain intact.
- Do not add lifecycle phases, alter deterministic classification/routing/priority, redesign diagnosis governance, add retrieval or semantic search, change known-cause semantics, or redesign the UI beyond the targeted lifecycle/presentation corrections.
- Specialist-result/re-entry workflow, permanent-no-fix disposition, and state-aware conversational GPT fallback for nonstandard customer replies are explicitly deferred. Any future GPT assistance may vary drafting, but lifecycle/evidence/diagnosis/fix truth remains deterministic and authoritative.
- Do not rewrite the embedded HTML template wholesale. Make small targeted patches in the existing inline script and preserve legacy fixture fallback when no lifecycle descriptor is present.
- Queue lifecycle data is additive only and must be generated from the same lifecycle/read-model code; do not duplicate lifecycle rules in the queue renderer.
- Execute tasks in order with one fresh implementation subagent at a time. After each task, run both a specification-compliance review and a code-quality/regression review, resolve findings, run the task tests, and commit the task-level change before continuing.

---

## File Map

### Existing production files to modify

- `src/approval-desk/lifecycle.ts` — complete the lifecycle action descriptor projection where RED contract tests identify missing primary/available/blocked/completed actions or reason codes; do not change phases or domain authority.
- `src/approval-desk/workflow-guidance.ts` — ensure rejected/invalidated diagnoses cannot reassert `review-diagnosis` guidance over the lifecycle’s `evaluate-ticket` primary action.
- `src/approval-desk/all-ticket-lifecycle-audit.ts` — extend the existing seed audit with lifecycle/action-descriptor observations and cross-ticket invariant checks; do not duplicate lifecycle computation.
- `src/approval-desk/ui.ts` — add the lifecycle action guard, authoritative refresh/reconciliation path, phase-aware titles/hints, Back recovery, single-mutation gesture handling, and lifecycle-derived diagnosis/recommendation/fix controls using targeted inline-script patches only.
- `src/approval-desk/http.ts` — add an additive minimal lifecycle summary to `GET /api/tickets` using the canonical workflow/lifecycle projection and the same operational diagnosis normalization used by detail reads.

### Existing tests to modify

- `test/lifecycle-view.test.ts` — RED/GREEN coverage for the complete lifecycle action matrix, ambiguous/insufficient/rejected recovery, and reason-code alignment.
- `test/workflow-guidance.test.ts` — rejection alignment assertions ensuring guidance and lifecycle agree on `evaluate-ticket`.
- `test/approval-desk-ui.test.ts` — focused unit-style browser-harness regressions for lifecycle-driven controls, Back reconciliation, inline errors, one mutation per gesture, compact historical views, and no contradictory/empty action bar.
- `test/approval-desk-http.test.ts` — queue lifecycle-summary projection and real evidence-loop/command-envelope checks where the HTTP route is the smallest faithful boundary.
- `test/automatic-customer-replies.test.ts` — focused generator coverage only where it can prove each required evidence ID has a specific, non-generic sample sentence.
- `test/all-ticket-lifecycle-audit.test.ts` — assert the cross-ticket invariant audit covers all seeded scenarios and reports no action-descriptor contradictions.

### New or separately scoped acceptance test

- `test/approval-desk-lifecycle-completion.e2e.test.ts` — real HTTP + embedded Approval Desk TKT-1010 acceptance journey. This file drives operator transitions through UI controls, injects only customer replies/internal confirmation through demo HTTP routes, and includes a runtime restart/reload checkpoint.

### Verification-only files

- `package.json` — read-only reference for `npm test`, `npm run typecheck`, and `npm run build`; do not change scripts unless a test proves an existing command cannot run the required suite.
- `docs/superpowers/specs/2026-08-26-approval-desk-lifecycle-completion-design.md` — authoritative design; do not broaden it during implementation.

---

## Task 1: Lock the lifecycle action contract and rejection alignment

**Files:**
- Modify: `src/approval-desk/lifecycle.ts`
- Modify: `src/approval-desk/workflow-guidance.ts`
- Test: `test/lifecycle-view.test.ts`
- Test: `test/workflow-guidance.test.ts`

**Interfaces:**
- Consumes: `LifecycleView`, `LifecycleAction`, `buildTicketLifecycleView()`, `buildOperatorGuidance()`, and the existing diagnosis/recommendation audit fixtures.
- Produces: a lifecycle projection in which `primaryAction.kind` and `actions[]` describe the same governed operation for every existing phase, and a rejected diagnosis always yields `evaluation-needed` + primary `evaluate-ticket` with diagnosis review/revalidation blocked by explicit reason codes.

- [ ] **Step 1: Add RED coverage for the complete phase/action matrix.**

  Extend the existing lifecycle projection tests with table-driven cases for `evaluation-needed`, `recommendation-review`, `waiting-for-customer`, `diagnosis-ready`, `diagnosis-review`, `awaiting-confirmation`, `awaiting-fix`, `fix-ready`, `verification`, `ready-for-close`, `escalated`, and `resolved`. For each case assert:

  ```ts
  expect(view.primaryAction).toMatchObject({ kind: expectedPrimary, availability: "primary" });
  expect(view.actions).toEqual(expect.arrayContaining(expectedDescriptors));
  expect(new Set(view.actions.map(({ kind }) => kind)).size).toBe(view.actions.length);
  ```

  Include the blocked/completed descriptor and exact reason-code expectations for diagnosis review, fix readiness, verification, ready-for-close, and resolved states. Add a rejected-diagnosis fixture that asserts `operatorGuidance.nextAction === "evaluate-ticket"`, `requiredReview` is absent, and the lifecycle has no enabled diagnosis-review/revalidate action.

- [ ] **Step 2: Run the RED lifecycle tests.**

  Run:

  ```text
  npx vitest run test/lifecycle-view.test.ts test/workflow-guidance.test.ts --exclude ".worktrees/**"
  ```

  Expected: the newly added matrix/rejection assertions fail only where the current descriptors or guidance still contradict the approved contract. Preserve any already-green cases.

- [ ] **Step 3: Implement the smallest contract correction.**

  In `lifecycle.ts`, keep the existing phase derivation and add only missing descriptors required by the RED matrix. Every descriptor must use a real `LifecycleActionKind`, one of `primary|available|blocked|completed`, and a stable nonblank reason code. Do not add a phase or change `primaryActionForPhase()` semantics.

  In `workflow-guidance.ts`, make the “latest diagnosis newer than recommendation” branch check the latest diagnosis review decision before selecting `review-diagnosis`; when the decision is `reject` (or the diagnosis is invalidated), return the existing evaluation-needed guidance instead. Do not change diagnosis authority or recommendation generation.

- [ ] **Step 4: Run the GREEN lifecycle tests and typecheck.**

  Run:

  ```text
  npx vitest run test/lifecycle-view.test.ts test/workflow-guidance.test.ts --exclude ".worktrees/**"
  npm run typecheck
  ```

  Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 5: Review and commit Task 1.**

  Review the diff against the spec, especially that no new phase, routing rule, or diagnosis authority rule was introduced. Then run `git diff --check` and commit:

  ```text
  git add src/approval-desk/lifecycle.ts src/approval-desk/workflow-guidance.ts test/lifecycle-view.test.ts test/workflow-guidance.test.ts
  git commit -m "fix: align lifecycle actions after diagnosis rejection"
  ```

---

## Task 2: Make Approval Desk presentation lifecycle-driven and recoverable through Back

**Files:**
- Modify: `src/approval-desk/ui.ts`
- Test: `test/approval-desk-ui.test.ts`

**Interfaces:**
- Consumes: `state.lifecycle`, `LifecycleAction.kind`, `LifecycleAction.availability`, `state.operatorGuidance`, `diagnosisUiPhase`, and the existing `selectTicket()`/refresh helpers.
- Produces: lifecycle-aware rendering helpers with this behavior: an enabled governed control exists only for an action whose descriptor is `primary` or `available`; `diagnosisUiPhase` only chooses the visible panel; Back refreshes before rendering settled state; historical diagnosis views remain read-only.

- [ ] **Step 1: Add RED UI regressions for the exact presentation failures.**

  Add focused browser-harness tests with explicit lifecycle fixtures for:

  1. ambiguous/insufficient diagnosis: the Inspection panel has no enabled Approve/Next/Review mutation, shows the lifecycle evidence/questions, and exposes the lifecycle’s Evaluate/Re-evaluate/Clarify control;
  2. `record-diagnosis`: the normal action bar exposes Diagnose and does not require a newer reply merely because local recommendation summary says `customer-replied`;
  3. `apply-scoped-fix`: the action bar exposes the Scoped Fix opener only when the descriptor is `primary`/`available`;
  4. `ready-for-close`: the operator-facing label is Resolve, never Close;
  5. `none` phases: resolved, waiting-for-customer, and escalated states each have a non-empty phase/reason explanation and do not say generic Response ready;
  6. Back from Inspection → Diagnosis and Diagnosis → normal action bar performs a refresh before final assertions and leaves a lifecycle-backed opener visible;
  7. selecting an older diagnosis renders a compact read-only record and leaves current action-bar mutation controls unchanged.

  Assert enabled controls by `data-action`/element ID and descriptor availability, not only by text. Use a fixture where a rejected diagnosis remains in history while the lifecycle primary is `evaluate-ticket` to prove history cannot reclaim the action bar.

- [ ] **Step 2: Run the RED UI regressions.**

  Run:

  ```text
  npx vitest run test/approval-desk-ui.test.ts --exclude ".worktrees/**"
  ```

  Expected: the new tests fail against the stale Back/phase/title/Inspection behavior while existing compatibility fixtures continue to run.

- [ ] **Step 3: Add one small lifecycle-action lookup/guard in the inline script.**

  In `ui.ts`, centralize descriptor lookup in the existing lifecycle helpers (for example, `lifecycleActionIsAvailable(kind)` plus a companion returning the descriptor/reason). All lifecycle-backed buttons and mutation handlers must call this guard. The guard must treat only `primary` and `available` as enabled; `blocked` and `completed` remain disabled/hidden with their reason exposed as copy.

  Update the diagnosis/recommendation/fix renderers to use the descriptor for button choice and labels. Specifically:

  - ambiguous/insufficient/rejected states render Evaluate/Re-evaluate/Clarify and evidence-to-request rather than Next/Approve;
  - `record-diagnosis`, `review-diagnosis`, `revalidate-diagnosis`, `record-fix-available`, `apply-scoped-fix`, and `resolve-ticket` map to Diagnose, Review, Revalidate, Fix, Open Scoped Fix/Fix, and Resolve;
  - awaiting-fix, fix-ready, and ready-for-close do not use generic Response ready copy;
  - preserve the legacy fallback only when no lifecycle descriptor exists.

- [ ] **Step 4: Replace asynchronous Back rendering with authoritative reconciliation.**

  Change the existing `refreshAfterPresentationBack`/`selectTicket` path so a Back action awaits the ticket detail refresh (or its existing request-token equivalent) before calling the settled renderer. Reconcile lifecycle, operator guidance, ticket, recommendations, diagnoses, and conversation/timeline from that response; do not set a local lifecycle phase and render before the refresh completes. Use the following navigation mapping exactly:

  ```text
  inspection -> current diagnosis
  current diagnosis -> normal action bar
  historical diagnosis -> current diagnosis
  scoped fix -> approved diagnosis/current lifecycle
  ```

  After the refresh, select the opener implied by the returned lifecycle (`evaluate-ticket`, `review-*`, `record-diagnosis`, `apply-scoped-fix`, or phase-aware `none`). Never fall through to an empty action bar.

- [ ] **Step 5: Run the GREEN UI tests and targeted regression suites.**

  Run:

  ```text
  npx vitest run test/approval-desk-ui.test.ts test/lifecycle-view.test.ts test/workflow-guidance.test.ts --exclude ".worktrees/**"
  npm run typecheck
  ```

  Expected: all focused tests pass, including legacy fixtures without lifecycle data.

- [ ] **Step 6: Review and commit Task 2.**

  Confirm the patch is targeted (no wholesale template rewrite), inspect all enabled `data-action` controls for lifecycle guards, run `git diff --check`, and commit:

  ```text
  git add src/approval-desk/ui.ts test/approval-desk-ui.test.ts
  git commit -m "fix: reconcile Approval Desk presentation from lifecycle"
  ```

---

## Task 3: Enforce one governed mutation per gesture and reconcile every command result

**Files:**
- Modify: `src/approval-desk/ui.ts`
- Test: `test/approval-desk-ui.test.ts`

**Interfaces:**
- Consumes: lifecycle action guard from Task 2, existing request-token/single-flight evaluation state, and all current command handlers (`createRecommendation`, `reviewSelectedDiagnosis`, `applySelectedDiagnosisFix`, `recordDiagnosis`, `recordFix`, `markResponseSent`, `closeTicket`).
- Produces: a shared guarded mutation/reconciliation path that posts at most one governed command per click, preserves domain errors inline, and re-renders only from refreshed authoritative data.

- [ ] **Step 1: Add RED tests for mutation sequencing and stale failure recovery.**

  Add tests that:

  - click the recommendation approval control once and assert exactly one `/approve` request, no automatic `/mark-sent` request, and a refreshed lifecycle whose next primary action is `send-customer-response`; a second explicit Send click is required for `/mark-sent`;
  - click Review/Approve/Reject/Revalidate/Fix/Resolve with a matching descriptor and assert the handler sends the correct governed command kind, then refreshes all affected read-model panels before settling;
  - return a stale/rejected diagnosis-review response and assert the domain error remains inline while ticket, diagnoses, lifecycle, guidance, and conversation are refreshed; the failed transition is not advertised as completed;
  - click an action whose descriptor is blocked/completed and assert no governed POST is issued;
  - exercise single-flight evaluation and assert a double click creates one recommendation request and one rendered authoritative result.

- [ ] **Step 2: Run the RED mutation tests.**

  Run:

  ```text
  npx vitest run test/approval-desk-ui.test.ts --exclude ".worktrees/**"
  ```

  Expected: tests fail where `completeTask` chains approve + mark-sent, handlers skip descriptor checks, or error paths force a local phase.

- [ ] **Step 3: Implement the guarded command helper and split chained commands.**

  Add a small inline helper with the following behavior (use the project’s existing request/error helpers and naming conventions):

  ```text
  runGovernedMutation(kind, post):
    if a lifecycle descriptor exists and kind is not primary/available, show its reason and return without POST;
    invoke exactly one post() promise;
    on success, await the canonical selected-ticket refresh and render the returned lifecycle;
    on DomainError/stale failure, store the inline error, await the same refresh, then render the refreshed durable state;
    never set a successful phase/recommendation locally from the POST alone.
  ```

  Route every governed handler through this helper. Keep idempotency keys, expected revision/watermark fields, and request-token behavior unchanged. Change `completeTask` so approval ends after the approval mutation and reconciliation; the response-send mutation is available only to the next explicit gesture.

- [ ] **Step 4: Make diagnosis review success/error phase selection authoritative.**

  Remove the local `approve ? approved : diagnosis` fallback from `reviewSelectedDiagnosis`. Read the returned lifecycle when present; otherwise await the normal detail refresh and derive the phase from that response. On reject, leave the diagnosis historical and expose evaluation; on approve/revalidate, expose the lifecycle’s resulting review/fix/evaluation action without returning to a stale inspection phase.

- [ ] **Step 5: Run GREEN tests plus command-path regression suites.**

  Run:

  ```text
  npx vitest run test/approval-desk-ui.test.ts test/approval-desk-http.test.ts test/approval-desk-diagnostic-workflow.test.ts --exclude ".worktrees/**"
  npm run typecheck
  ```

  Expected: all focused tests pass, including persistence-backed command envelopes and existing scoped-fix behavior.

- [ ] **Step 6: Review and commit Task 3.**

  Verify no handler can chain two lifecycle mutations from one click, run `git diff --check`, and commit:

  ```text
  git add src/approval-desk/ui.ts test/approval-desk-ui.test.ts
  git commit -m "fix: reconcile each Approval Desk mutation authoritatively"
  ```

---

## Task 4: Prove the evidence-request loop feeds real evaluation and clarification

**Files:**
- Modify: `src/approval-desk/automatic-customer-replies.ts` only if a focused coverage test identifies a missing ticket-specific sample.
- Test: `test/automatic-customer-replies.test.ts`
- Test: `test/approval-desk-http.test.ts` or `test/approval-desk-diagnostic-workflow.test.ts` (choose the existing suite that already owns the real extraction/evaluation harness; do not create a second fake evaluator).

**Interfaces:**
- Consumes: `automaticReplyForTicket()`, `contextualEvidenceSentences()`, `TriageService` evaluation, existing `/mark-sent` automatic-reply behavior, and playbook `EvidenceRequirement` records.
- Produces: deterministic, network-free coverage proving generated customer-reply text changes the real evaluation projection from missing evidence to provided evidence, and a rejected/ambiguous diagnosis path that returns to the lifecycle’s evaluation action.

- [ ] **Step 1: Add RED evidence coverage tests.**

  Enumerate the evidence requirements used by the demo scenarios and call the existing automatic-reply path for each ticket/recommendation. Assert that each generated body contains a specific sentence for every requested requirement (not `example-<id>`), then feed the body through the existing customer-reply command and deterministic evaluation path. Assert the next recommendation’s `missingEvidence` excludes the supplied IDs. Include the multi-round behavior: first reply supplies only the first subset, second automatic reply supplies the remaining subset.

  Add a rejection recovery assertion using the existing HTTP/runtime test setup: after a diagnosis is rejected, the next evaluation request is allowed, receives the rejected diagnosis context already supported by the service, and the automatic evidence reply can move the ticket back toward another evaluation/diagnosis cycle. Do not add a new simulation endpoint or fabricate extraction output.

- [ ] **Step 2: Run the RED evidence tests.**

  Run:

  ```text
  npx vitest run test/automatic-customer-replies.test.ts test/approval-desk-http.test.ts test/approval-desk-diagnostic-workflow.test.ts --exclude ".worktrees/**"
  ```

  Expected: the test identifies any requirement whose automatic text still falls through to the generic fallback or does not survive real extraction/evaluation.

- [ ] **Step 3: Add only missing ticket-specific sample sentences.**

  Extend the existing `samples` map in `automatic-customer-replies.ts` only for IDs proven missing by RED. Keep sentences deterministic, synthetic, and semantically faithful to the requirement; do not alter production classification, evidence requirements, diagnosis authority, or customer-reply policy.

- [ ] **Step 4: Run GREEN evidence and lifecycle tests.**

  Run:

  ```text
  npx vitest run test/automatic-customer-replies.test.ts test/approval-desk-http.test.ts test/approval-desk-diagnostic-workflow.test.ts --exclude ".worktrees/**"
  npm run typecheck
  ```

- [ ] **Step 5: Review and commit Task 4.**

  Confirm the tests use real extraction/evaluation and not string-only or fabricated browser state. Run `git diff --check` and commit:

  ```text
  git add src/approval-desk/automatic-customer-replies.ts test/automatic-customer-replies.test.ts test/approval-desk-http.test.ts test/approval-desk-diagnostic-workflow.test.ts
  git commit -m "test: prove automatic evidence replies complete evaluation"
  ```

---

## Task 5: Add an additive lifecycle summary to the queue projection

**Files:**
- Modify: `src/approval-desk/http.ts`
- Modify: `src/approval-desk/ui.ts` only if queue badges need to consume the new summary rather than infer state locally.
- Test: `test/approval-desk-http.test.ts`
- Test: `test/approval-desk-ui.test.ts` only if the queue rendering assertion is needed.

**Interfaces:**
- Consumes: `GET /api/tickets` inputs, the canonical detail workflow projection (`buildTicketWorkflowReadModel`/operational normalization), and `LifecycleView`.
- Produces: each queue item receives an additive `lifecycleSummary` with the stable fields `{ phase, primaryAction, reasonCodes }`; no existing ticket/recommendation summary field is removed or reinterpreted.

- [ ] **Step 1: Add RED HTTP projection tests.**

  Extend the queue tests to request a mixed page containing evaluation-needed, diagnosis-review, fix-ready, ready-for-close, and resolved tickets. Assert every item has:

  ```ts
  expect(item.lifecycleSummary).toMatchObject({
    phase: expect.any(String),
    primaryAction: expect.any(String),
    reasonCodes: expect.any(Array),
  });
  ```

  Assert the summary’s primary action matches the detail `lifecycle.primaryAction.kind` for the same ticket and that no local recommendation-derived “Response ready” state is substituted for `fix-ready`, `ready-for-close`, or `resolved`.

- [ ] **Step 2: Run the RED queue tests.**

  Run:

  ```text
  npx vitest run test/approval-desk-http.test.ts --exclude ".worktrees/**"
  ```

  Expected: queue items lack the new additive summary or expose a mismatch with the detail lifecycle.

- [ ] **Step 3: Implement the minimal projection.**

  In `listTickets`, use the same authoritative audit/operational diagnosis normalization and lifecycle builder as the detail route. Return only `{ phase, primaryAction: primaryAction.kind, reasonCodes: primaryAction.reasonCodes }` under `lifecycleSummary`; do not duplicate phase-selection logic and do not make the queue compute lifecycle from recommendation summaries.

  If the queue UI consumes the new field, use it only for badges/sorting copy and keep mutation controls governed by the selected ticket’s full lifecycle descriptor.

- [ ] **Step 4: Run GREEN queue and UI tests.**

  Run:

  ```text
  npx vitest run test/approval-desk-http.test.ts test/approval-desk-ui.test.ts --exclude ".worktrees/**"
  npm run typecheck
  ```

- [ ] **Step 5: Review and commit Task 5.**

  Confirm the list projection is additive and shares lifecycle computation with detail reads. Run `git diff --check` and commit:

  ```text
  git add src/approval-desk/http.ts src/approval-desk/ui.ts test/approval-desk-http.test.ts test/approval-desk-ui.test.ts
  git commit -m "feat: expose lifecycle summaries in Approval Desk queue"
  ```

---

## Task 6: Cover confirmed diagnoses that require no platform fix and audit every seed ticket

**Files:**
- Modify: `src/approval-desk/lifecycle.ts`
- Modify: `src/approval-desk/all-ticket-lifecycle-audit.ts`
- Modify: `src/approval-desk/workflow-guidance.ts` only to surface the existing diagnosis customer/support action for this path.
- Test: `test/lifecycle-view.test.ts`
- Test: `test/all-ticket-lifecycle-audit.test.ts`
- Test: `test/approval-desk-ui.test.ts`

**Interfaces:**
- Consumes: `DiagnosisContext.owner`, `buildTicketLifecycleView()`, `auditSeedTicketLifecycles()`, and the existing seeded tickets/outcomes.
- Produces: a deterministic no-platform-fix interpretation and an all-seed invariant report. A confirmed `customer` or `support` diagnosis with no platform mitigation projects through the existing `verification` phase, primary `evaluate-ticket`, `fix.state === "none"`, and reason code `no-platform-fix-required`; it never projects `awaiting-fix` or fabricates a fix event. Engineering/integration-partner ownership retains the existing fix-availability path.

- [ ] **Step 1: Add RED coverage for customer/support-owned confirmed diagnoses.**

  Add lifecycle fixtures with a recorded diagnosis, an approved/revalidated review, complete evidence, no `fix-available`/`platform-mitigation-available` audit, and `owner: "customer"` or `owner: "support"`. Assert for both owners:

  ```ts
  expect(view.phase).toBe("verification");
  expect(view.fix.state).toBe("none");
  expect(view.fix.reasonCodes).toContain("no-platform-fix-required");
  expect(view.primaryAction).toMatchObject({ kind: "evaluate-ticket", availability: "primary" });
  expect(view.actions).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "evaluate-ticket", availability: "primary" }),
  ]));
  ```

  Assert that the same fixtures do not contain an enabled `record-fix-available` or `apply-scoped-fix` action and that the guidance/read-model text carries the diagnosis’s customer/support action and verification request. Add a UI harness fixture for the same lifecycle and assert the Action Bar exposes Evaluate plus the customer-action/verification explanation, with no Fix control. Keep an engineering-owned fixture proving the current `awaiting-fix` behavior remains unchanged.

- [ ] **Step 2: Add RED coverage for the cross-ticket seed invariant audit.**

  Extend `auditSeedTicketLifecycles()` observations with the canonical lifecycle phase, primary action kind, and descriptor consistency failures. For every ticket loaded from `data/seed/tickets.json`, assert:

  ```ts
  expect(report.ticketCount).toBe(tickets.length);
  expect(report.observations).toHaveLength(tickets.length);
  expect(report.lifecycleInvariantPassCount).toBe(tickets.length);
  expect(report.observations.every(({ lifecyclePrimaryAction, lifecycleActions }) =>
    lifecycleActions.some((action) => action.kind === lifecyclePrimaryAction && action.availability === "primary")
  )).toBe(true);
  ```

  The audit must also flag an enabled action whose descriptor is `blocked`/`completed`, a missing primary descriptor, or a non-resolved/non-waiting state with `none` as primary. Existing classification and expected-outcome metrics for all 30 tickets remain unchanged.

- [ ] **Step 3: Run the RED no-fix and seed-audit tests.**

  Run:

  ```text
  npx vitest run test/lifecycle-view.test.ts test/all-ticket-lifecycle-audit.test.ts --exclude ".worktrees/**"
  ```

  Expected: no-fix fixtures fail because the current phase code sends every approved diagnosis without a fix to `awaiting-fix`, and the extended audit fields/guards are not yet present.

- [ ] **Step 4: Implement the existing-phase no-platform-fix rule.**

  Add one internal predicate in `lifecycle.ts`:

  ```ts
  function diagnosisRequiresPlatformFix(owner: DiagnosisContext["owner"] | undefined): boolean {
    return owner === undefined || owner === "engineering" || owner === "integration-partner";
  }
  ```

  Pass the current approved diagnosis owner into `fixProjection()`, `phaseForLifecycle()`, and `reasonCodesForPhase()`. When an approved, confirmed diagnosis has no fix audit and `diagnosisRequiresPlatformFix(owner)` is false, return a `fix` projection with `state: "none"`, `reasonCodes: ["no-platform-fix-required"]`, and `diagnosisStillAuthoritative: true`; then return `verification` with primary `evaluate-ticket`. In `lifecycleActionsForPhase()`, do not add `record-fix-ineffective` for this `fix.state === "none"` case. In `workflow-guidance.ts`, preserve the existing evaluate primary and use the diagnosis’s `recommendedNextAction` as the customer/support next-step text. Do not emit or infer a fix audit, change `DiagnosisContext`, or add a lifecycle phase. Keep the existing owner/platform mitigation checks for engineering and integration-partner diagnoses.

- [ ] **Step 5: Implement the all-seed lifecycle/action audit through canonical projection.**

  In `all-ticket-lifecycle-audit.ts`, build the lifecycle view using the same `buildTicketLifecycleView()` input used by the Approval Desk read model, record `lifecyclePhase`, `lifecyclePrimaryAction`, and `lifecycleActions`, and append descriptor mismatches to the existing `lifecycleInvariantMismatches` array. Do not duplicate phase selection or action mapping. Preserve all current report fields and expected-outcome comparison behavior.

- [ ] **Step 6: Run GREEN tests and focused lifecycle regressions.**

  Run:

  ```text
  npx vitest run test/lifecycle-view.test.ts test/all-ticket-lifecycle-audit.test.ts test/approval-desk-ui.test.ts --exclude ".worktrees/**"
  npm run typecheck
  ```

  Expected: both no-platform-fix owners use the customer-action/verification path, engineering/integration behavior remains unchanged, and every seeded scenario passes the descriptor invariant.

- [ ] **Step 7: Review and commit Task 6.**

  Check that no new lifecycle state or fix event was introduced and that the seed audit computes its lifecycle through canonical code. Run `git diff --check` and commit:

  ```text
  git add src/approval-desk/lifecycle.ts src/approval-desk/all-ticket-lifecycle-audit.ts test/lifecycle-view.test.ts test/all-ticket-lifecycle-audit.test.ts
  git commit -m "fix: keep no-platform-fix diagnoses actionable"
  ```

---

## Task 7: Replace the partial TKT-1010 acceptance path with real UI-driven lifecycle coverage

**Files:**
- Create: `test/approval-desk-lifecycle-completion.e2e.test.ts` — keep the existing `test/approval-desk-lifecycle.e2e.test.ts` contract test unchanged unless a shared helper import is needed.

**Interfaces:**
- Consumes: the real Approval Desk HTTP server, `approvalDeskHtml`, the existing browser harness (`startLiveApprovalDeskApp` and its element/request helpers), persisted operational SQLite runtime creation/restart, and the lifecycle projection returned by `GET /api/tickets/:id`.
- Produces: a deterministic end-to-end proof for TKT-1010 that uses real lifecycle projections and real UI controls for every operator mutation.

- [ ] **Step 1: Add RED assertions around the existing journey.**

  Add/extend the test so it records every operator HTTP request and defines a helper that, after each UI gesture, fetches the ticket lifecycle and asserts:

  ```ts
  expect(renderedPrimaryAction(app)).toBe(lifecycle.primaryAction.kind);
  expect(enabledGovernedControls(app)).toSatisfy((controls) =>
    controls.every(({ kind }) => lifecycle.actions.some(
      (action) => action.kind === kind && ["primary", "available"].includes(action.availability),
    )),
  );
  ```

  Drive the following sequence without direct operator HTTP mutation calls:

  1. UI Evaluate → Review/approve → UI Send evidence request.
  2. External automatic customer reply through the existing automatic-reply mechanism → UI Evaluate.
  3. Complete evidence → UI Diagnose → UI open Diagnosis/Inspection.
  4. Reject or encounter ambiguity → UI Back/reopen → UI Re-evaluate/Clarify; assert one recommendation request and rejected diagnosis context.
  5. External automatic reply/internal confirmation as allowed by the current demo route → UI Evaluate/Diagnose again.
  6. Confirmed diagnosis → UI review/approve → lifecycle `fix-ready`/`apply-scoped-fix`.
  7. UI open Scoped Fix → UI Fix; assert refresh to normal response mode and a verification response.
  8. External customer confirmation reply → UI Evaluate → UI Review/approve/send as returned by lifecycle.
  9. UI Resolve only after lifecycle exposes `ready-for-close`/`resolve-ticket`.

  Use direct HTTP only for customer replies and internal/demo confirmation. Do not mutate `operatorGuidance`, `diagnosisUiPhase`, diagnosis state, button visibility, or lifecycle objects in the browser fixture to advance the journey.

- [ ] **Step 2: Run the RED e2e test.**

  Run:

  ```text
  npx vitest run test/approval-desk-lifecycle-completion.e2e.test.ts --exclude ".worktrees/**"
  ```

  Expected: direct-HTTP operator steps or stale UI transitions fail the new assertions.

- [ ] **Step 3: Refactor only the e2e harness needed for UI controls and restart.**

  Add small helpers for `clickPrimaryLifecycleControl`, `waitForAuthoritativeRefresh`, and `restartRuntimeFromOperationalSqlite`. The restart helper must close the existing server/runtime, recreate dependencies from the same operational database, reload the HTML harness, select TKT-1010, and assert the returned persisted lifecycle before continuing. Keep all external event injection on the existing routes.

- [ ] **Step 4: Run GREEN e2e and persistence regressions.**

  Run:

  ```text
  npx vitest run test/approval-desk-lifecycle-completion.e2e.test.ts test/approval-desk-lifecycle.e2e.test.ts test/operational-diagnosis-restart.test.ts --exclude ".worktrees/**"
  npm run typecheck
  npm run build
  ```

  Expected: the complete journey reaches resolved, the restart resumes from SQLite, and every operator gesture has at most one governed mutation request.

- [ ] **Step 5: Review and commit Task 7.**

  Review that the test’s operator transitions are UI-driven, direct HTTP is limited to external/demo events, and no browser state is fabricated. Run `git diff --check` and commit:

  ```text
  git add test/approval-desk-lifecycle-completion.e2e.test.ts
  git commit -m "test: cover complete Approval Desk lifecycle for TKT-1010"
  ```

---

## Task 8: Whole-branch verification and final review

**Files:**
- No new production files. Review all files changed by Tasks 1–6.

**Interfaces:**
- Consumes: all task commits, the approved design spec, and the repository’s existing verification commands.
- Produces: a verified branch with no enabled UI mutation that the lifecycle would reject and no durable state stranded by Back or failed commands.

- [ ] **Step 1: Run the exhaustive focused suites.**

  Run:

  ```text
  npx vitest run test/lifecycle-view.test.ts test/workflow-guidance.test.ts test/lifecycle-slice-matrix.test.ts test/all-ticket-lifecycle-audit.test.ts test/approval-desk-ui.test.ts test/approval-desk-http.test.ts test/approval-desk-diagnostic-workflow.test.ts test/automatic-customer-replies.test.ts test/approval-desk-lifecycle.e2e.test.ts test/approval-desk-lifecycle-completion.e2e.test.ts --exclude ".worktrees/**"
  ```

- [ ] **Step 2: Run repository verification.**

  Run:

  ```text
  npm run typecheck
  npm run build
  npm test
  git diff --check
  ```

  Record the exact test counts and any pre-existing failures without weakening tests or changing unrelated files.

- [ ] **Step 3: Perform the broad whole-branch review.**

  Review from the pre-slice merge-base across two axes: specification compliance and code quality/regression risk. Explicitly inspect all lifecycle-backed `data-action` controls, every mutation handler, Back/refresh paths, queue summary generation, and the e2e request log. Fix load-bearing findings, rerun the affected focused suites, and review the fixes again.

- [ ] **Step 4: Verify the acceptance invariant before completion.**

  Confirm that every durable lifecycle phase either renders its primary action or a phase/reason explanation, no blocked/completed descriptor is enabled, ambiguous/rejected diagnoses cannot reach Inspection approval, scoped fix still returns to Brief/response after refresh, and Resolve appears only after `ready-for-close`.

- [ ] **Step 5: Commit only verification-related fixes and prepare handoff.**

  Use `superpowers:verification-before-completion` before claiming completion, then use `superpowers:finishing-a-development-branch` to report the final branch/worktree, task commits, tests/evaluations, compatibility seams, and any explicitly deferred findings.

---

## Self-review checklist

- Lifecycle authority: Tasks 1–3 and Task 6 cover the lifecycle/action descriptor authority and the no-enabled-rejected-mutation invariant.
- Back/recovery: Task 2 covers all approved Back edges and refresh-before-render; Task 3 covers failure reconciliation.
- Evidence loop: Task 4 proves generated evidence through extraction/evaluation and retains the existing automatic-reply mechanism.
- Confirmed/fix/resolve path: Tasks 2, 3, and 6 cover `fix-ready`, Scoped Fix, verification, `ready-for-close`, and Resolve without adding lifecycle states.
- No-platform-fix path: Task 6 covers confirmed customer/support-owned diagnoses through existing verification semantics without fabricating a fix; specialist re-entry, permanent disposition, and conversational fallback remain deferred.
- Queue consistency: Task 5 adds only the specified lifecycle summary and reuses canonical projection logic.
- Persistence/restart/MCP compatibility: Task 3 preserves existing command envelopes and Task 7 restarts from operational SQLite; no MCP or persistence redesign is introduced.
- UI scope: targeted inline-script patches only; no wholesale template rewrite or unrelated visual redesign.
- Placeholders: every task contains concrete file paths, assertions, commands, and commit steps rather than deferred or unbound instructions.
- Type consistency: all tasks use existing `LifecycleActionKind`, `LifecycleAction`, `LifecycleView`, and the named Approval Desk helpers/routes; the one new queue shape is explicitly `{ phase, primaryAction, reasonCodes }`.
