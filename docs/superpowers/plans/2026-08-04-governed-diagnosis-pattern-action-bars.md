# Governed Diagnosis and Pattern Action Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make diagnosis and knowledge-pattern disposition explicit lifecycle gates, expose every mutating action through coordinated Workflow and Pattern Bars, and keep HTTP/MCP outcomes identical.

**Architecture:** Extend the existing `workflow-guidance.ts` boundary with a typed knowledge-pattern gate and a `review-pattern` action. HTTP and MCP read paths load the same candidate/audit context and pass it to the same read-model builder; mutation routes continue to call `TriageService` and `KnowledgeEvolutionService` rather than duplicating rules. Rejected diagnoses become negative context for the next explicit evaluation, while platform mitigation receives its own audited transition instead of pretending to be a confirmed diagnosis fix.

**Tech Stack:** TypeScript, Zod, Node HTTP server, Vitest, existing Approval Desk DOM test harness, filesystem repositories.

---

## File map

- Modify `src/approval-desk/workflow-guidance.ts`: add the typed pattern gate, diagnosis-review precedence, pattern-review action, and blocker explanations.
- Modify `src/approval-desk/workflow-read-model.ts`: accept the shared knowledge-evolution context and expose the gate to both transports.
- Create `src/approval-desk/knowledge-pattern-gate.ts`: pure candidate-to-ticket matching and terminal review interpretation; no HTTP or DOM code.
- Modify `src/approval-desk/diagnostic-workflow.ts`: preserve rejected diagnosis context separately from authoritative context.
- Modify `src/approval-desk/ai-evaluation.ts`, `src/approval-desk/recommendation-builder.ts`, `src/approval-desk/draft-response-provider.ts`, and `src/approval-desk/classification-reasoning-provider.ts`: pass a short rejected-diagnosis signal to advisory stages without allowing it to become a diagnosis.
- Modify `src/triage-service.ts`, `src/approval-desk/http.ts`, and `src/server.ts`: add the audited platform-mitigation operation and load the same knowledge context for HTTP/MCP reads and evaluations.
- Modify `src/approval-desk/evidence-readiness.ts`: recognize the natural wording already used by the testing UI.
- Modify `src/approval-desk/ui.ts` and the Approval Desk stylesheet: split Workflow Bar and Pattern Bar, move all mutations into the bars, and replace the candidate textarea wall with a compact editor.
- Extend `test/workflow-guidance.test.ts`, `test/approval-desk-http.test.ts`, `test/approval-desk-ui.test.ts`, `test/diagnosis-review.test.ts`, `test/evidence-readiness.test.ts`, `test/diagnostic-workflow.test.ts`, `test/automatic-customer-replies.test.ts`, and `test/draft-quality-guardrails.test.ts`.
- Add `test/knowledge-pattern-gate.test.ts` and `test/action-bar-parity.test.ts` for the new pure gate and cross-transport contract.
- Update `README.md` and `docs/knowledge-evolution.md` only after behavior is verified, documenting the two bars and the controlled platform-mitigation signal.

### Task 1: Add a pure, auditable knowledge-pattern gate

**Files:**
- Create: `src/approval-desk/knowledge-pattern-gate.ts`
- Modify: `src/approval-desk/workflow-guidance.ts`
- Modify: `src/approval-desk/workflow-read-model.ts`
- Test: `test/knowledge-pattern-gate.test.ts`
- Test: `test/workflow-guidance.test.ts`

- [ ] **Step 1: Write failing gate tests.**

```ts
it("blocks only when the candidate supports this ticket's current diagnosis", () => {
  const gate = knowledgePatternGate({
    ticketId: "TKT-1002",
    currentDiagnosisId: "diagnosis-1002",
    candidates: [candidate({
      supportingTicketIds: ["TKT-1002"],
      supportingDiagnosisIds: ["diagnosis-1002"],
      discovery: { meetsAlertThreshold: true },
    })],
    audits: [],
  });
  expect(gate).toMatchObject({ state: "pending", actionable: true });
});

it("does not gate on open-ticket corroboration alone", () => {
  const gate = knowledgePatternGate({
    ticketId: "TKT-1010",
    currentDiagnosisId: undefined,
    candidates: [candidate({ supportingTicketIds: ["TKT-1010"], supportingDiagnosisIds: [] })],
    audits: [],
  });
  expect(gate).toMatchObject({ state: "none", actionable: false });
});

it.each(["approved", "rejected"] as const)("releases the gate after %s", (action) => {
  const gate = knowledgePatternGate({
    ticketId: "TKT-1002",
    currentDiagnosisId: "diagnosis-1002",
    candidates: [candidate({ supportingTicketIds: ["TKT-1002"], supportingDiagnosisIds: ["diagnosis-1002"] })],
    audits: [knowledgeAudit({ candidateId: "candidate-1", action })],
  });
  expect(gate.actionable).toBe(false);
});

it("keeps a deferred candidate as a hard gate", () => {
  const gate = knowledgePatternGate({
    ticketId: "TKT-1002",
    currentDiagnosisId: "diagnosis-1002",
    candidates: [candidate({ supportingTicketIds: ["TKT-1002"], supportingDiagnosisIds: ["diagnosis-1002"] })],
    audits: [knowledgeAudit({ candidateId: "candidate-1", action: "deferred" })],
  });
  expect(gate).toMatchObject({ state: "deferred", actionable: true });
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `npx vitest run test/knowledge-pattern-gate.test.ts test/workflow-guidance.test.ts`

Expected: FAIL because `knowledgePatternGate` and the new guidance fields do not exist.

- [ ] **Step 3: Implement the pure gate.**

Add a strict result type and a function with this shape:

```ts
export type KnowledgePatternGate = {
  state: "none" | "pending" | "approved" | "rejected" | "deferred";
  actionable: boolean;
  candidateId?: string;
  reason?: string;
};

export function knowledgePatternGate(input: {
  ticketId: string;
  currentDiagnosisId?: string;
  candidates: readonly KnowledgeCandidate[];
  audits: readonly KnowledgeAuditEvent[];
}): KnowledgePatternGate;
```

Match `supportingTicketIds`, `supportingDiagnosisIds`, and `discovery.meetsAlertThreshold`; select the latest candidate audit by timestamp; treat `approved` and `rejected` as released, and `deferred` as still actionable. Do not use open-ticket support as a hard gate without the selected ticket's current completed diagnosis.

- [ ] **Step 4: Add the gate to the authoritative guidance contract.**

Extend `OperatorGuidanceSchema` with:

```ts
requiredReview: z.object({
  kind: z.enum(["diagnosis", "knowledge-pattern"]),
  id: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1),
}).optional(),
knowledgePattern: z.object({
  state: z.enum(["none", "pending", "approved", "rejected", "deferred"]),
  actionable: z.boolean(),
  candidateId: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).optional(),
}).strict(),
```

Add `"review-pattern"` to `nextAction`. In `buildOperatorGuidance`, resolve gates in this order: pending recommendation, newer customer reply, escalated state, stale/unreviewed diagnosis, diagnosis review, actionable pattern gate, fix/close/diagnosis actions. When a diagnosis is unreviewed, return `requiredReview.kind = "diagnosis"`; when it is approved but the pattern is actionable, return `requiredReview.kind = "knowledge-pattern"` and `nextAction = "review-pattern"`. Include the blocker in `reason` and `blockers`; do not infer this state in the UI.

- [ ] **Step 5: Pass the same context through the read model.**

Add this input to `buildTicketWorkflowReadModel` and `buildOperatorGuidance`:

```ts
knowledgeEvolution?: {
  candidates: readonly KnowledgeCandidate[];
  audits: readonly KnowledgeAuditEvent[];
};
```

Use the latest recorded diagnosis audit ID to derive the current completed diagnosis ID (`diagnosis-${audit.id}`), call `knowledgePatternGate`, and include its result in every workflow response. Preserve the existing behavior when the optional context is absent by returning `{ state: "none", actionable: false }`.

- [ ] **Step 6: Run focused tests and commit.**

Run: `npx vitest run test/knowledge-pattern-gate.test.ts test/workflow-guidance.test.ts`

Expected: PASS. Commit: `git add src/approval-desk/knowledge-pattern-gate.ts src/approval-desk/workflow-guidance.ts src/approval-desk/workflow-read-model.ts test/knowledge-pattern-gate.test.ts test/workflow-guidance.test.ts; git commit -m "feat: make knowledge pattern disposition a workflow gate"`.

### Task 2: Make diagnosis rejection a negative signal and a re-evaluation gate

**Files:**
- Modify: `src/approval-desk/diagnostic-workflow.ts`
- Modify: `src/approval-desk/ai-evaluation.ts`
- Modify: `src/approval-desk/recommendation-builder.ts`
- Modify: `src/approval-desk/draft-response-provider.ts`
- Modify: `src/approval-desk/classification-reasoning-provider.ts`
- Test: `test/diagnostic-workflow.test.ts`
- Test: `test/diagnosis-review.test.ts`
- Test: `test/ai-evaluation.test.ts`

- [ ] **Step 1: Add failing tests for rejected context.**

Assert that `selectPersistedDiagnosticWorkflowContext` returns no authoritative `diagnosis` after a rejection but returns a separate `rejectedDiagnosis` record; assert that a fresh evaluation receives it as exclusion context and that a deterministic draft does not claim the rejected cause.

```ts
expect(context.diagnosis).toBeUndefined();
expect(context.rejectedDiagnosis?.review.decision).toBe("reject");
expect(classificationInput.excludedDiagnosis?.customerSafeSummary).toContain("platform");
```

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `npx vitest run test/diagnostic-workflow.test.ts test/diagnosis-review.test.ts test/ai-evaluation.test.ts`

Expected: FAIL because rejected context is currently discarded.

- [ ] **Step 3: Implement explicit negative context.**

Extend `PersistedDiagnosticWorkflowContext` with:

```ts
rejectedDiagnosis?: PersistedDiagnosticContext<DiagnosisContext> & {
  review: DiagnosisReviewDecision;
};
```

Select the latest rejected diagnosis review causally, while preserving the immutable original diagnosis and review audit. Add `excludedDiagnosis?: DiagnosisContext` to `GptClassificationReasoningInput`, `CustomerResponseDraftInput`, and the recommendation-builder inputs. Serialize only a sanitized summary, cause family, evidence labels, and review reason; never include internal audit payloads or prompts.

- [ ] **Step 4: Apply the signal without granting authority.**

Pass the exclusion context into both advisory providers with instructions equivalent to:

```text
The following prior diagnosis was explicitly rejected. Treat it only as an exclusion signal, do not repeat it as a cause, and do not claim that a replacement has been confirmed.
```

Keep deterministic classification and lifecycle state authoritative. A rejected diagnosis must not populate `diagnosisContext`, unlock `Fix`, or create positive knowledge support.

- [ ] **Step 5: Run tests and commit.**

Run: `npx vitest run test/diagnostic-workflow.test.ts test/diagnosis-review.test.ts test/ai-evaluation.test.ts test/draft-quality-guardrails.test.ts`

Expected: PASS. Commit: `git add src/approval-desk/diagnostic-workflow.ts src/approval-desk/ai-evaluation.ts src/approval-desk/recommendation-builder.ts src/approval-desk/draft-response-provider.ts src/approval-desk/classification-reasoning-provider.ts test/diagnostic-workflow.test.ts test/diagnosis-review.test.ts test/ai-evaluation.test.ts test/draft-quality-guardrails.test.ts; git commit -m "feat: carry rejected diagnoses into governed reevaluation"`.

### Task 3: Add the governed platform-mitigation signal

**Files:**
- Modify: `src/domain.ts`
- Modify: `src/triage-service.ts`
- Modify: `src/approval-desk/workflow-guidance.ts`
- Modify: `src/approval-desk/http.ts`
- Modify: `src/server.ts`
- Test: `test/triage-service.test.ts`
- Test: `test/workflow-guidance.test.ts`
- Test: `test/approval-desk-http.test.ts`

- [ ] **Step 1: Write failing service and route tests.**

Cover TKT-1001 in `waiting-on-platform-fix`: a platform mitigation event is accepted only for an active matching known event, is audited as `platform-mitigation-available`, does not create `fix-available`, and changes guidance to require a fresh evaluation. Assert that a generic diagnosis `Fix` still requires confirmed authoritative diagnosis.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npx vitest run test/triage-service.test.ts test/workflow-guidance.test.ts test/approval-desk-http.test.ts`

Expected: FAIL because the platform-mitigation action and audit contract do not exist.

- [ ] **Step 3: Implement the deterministic operation.**

Add a typed `PlatformMitigationInput` and `TriageService.recordPlatformMitigation` that validates ticket state, known event ID/status, actor, and causal freshness before appending `platform-mitigation-available`. Add `POST /api/tickets/:id/platform-mitigation` and the MCP `record_platform_mitigation` tool; both call the same service method.

- [ ] **Step 4: Update guidance and customer-safe context.**

Return a distinct guidance reason such as `Platform mitigation was recorded; evaluate the current context before requesting verification.` Do not map this audit to `fixBlockers` or `fixContextForTicket` until the explicit evaluation produces a valid verification path.

- [ ] **Step 5: Run tests and commit.**

Run: `npx vitest run test/triage-service.test.ts test/workflow-guidance.test.ts test/approval-desk-http.test.ts`

Expected: PASS. Commit: `git add src/domain.ts src/triage-service.ts src/approval-desk/workflow-guidance.ts src/approval-desk/http.ts src/server.ts test/triage-service.test.ts test/workflow-guidance.test.ts test/approval-desk-http.test.ts; git commit -m "feat: add governed platform mitigation signal"`.

### Task 4: Correct evidence recognition and no-evidence response consistency

**Files:**
- Modify: `src/approval-desk/evidence-readiness.ts`
- Modify: `src/approval-desk/draft-response-provider.ts`
- Modify: `src/approval-desk/customer-service-drafting-skill.ts` only if the obligation text needs a shared wording update.
- Test: `test/evidence-readiness.test.ts`
- Test: `test/automatic-customer-replies.test.ts`
- Test: `test/draft-quality-guardrails.test.ts`

- [ ] **Step 1: Add failing TKT-1004 wording tests.**

Use the exact testing-mode reply:

```text
The audit source shown is IP 198.51.100.24. The affected scope appears to be 12 profiles in the latest export.
```

Assert that `audit-source` and `affected-scope` become provided while unknown qualifiers remain missing. Add a zero-missing-evidence case asserting that deterministic and GPT fallback drafts do not ask for the already collected details or append “once we have those details”.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npx vitest run test/evidence-readiness.test.ts test/automatic-customer-replies.test.ts test/draft-quality-guardrails.test.ts`

Expected: FAIL on both natural-language recognizers and contradictory response obligations.

- [ ] **Step 3: Implement narrow recognizer changes.**

Allow `shown is`, `appears to be`, optional `IP` spacing, and the existing concrete-value forms in `hasConcreteAuditSource` and `hasKnownAffectedScope`. Keep negated/uncertain forms (`no audit source`, `not sure of the scope`) excluded.

- [ ] **Step 4: Make the response contract lifecycle-aware.**

When `missingEvidence.length === 0`, remove evidence-request obligations and prohibit phrases that ask for the same evidence. When a known cause or platform mitigation path supplies the next action, draft the next safe update instead of a generic “once we have those details” sentence. Preserve customer-safe language and deterministic fallback.

- [ ] **Step 5: Run tests and commit.**

Run: `npx vitest run test/evidence-readiness.test.ts test/automatic-customer-replies.test.ts test/draft-quality-guardrails.test.ts test/response-quality-evaluation.test.ts`

Expected: PASS. Commit: `git add src/approval-desk/evidence-readiness.ts src/approval-desk/draft-response-provider.ts src/approval-desk/customer-service-drafting-skill.ts test/evidence-readiness.test.ts test/automatic-customer-replies.test.ts test/draft-quality-guardrails.test.ts; git commit -m "fix: align evidence recognition and response lifecycle"`.

### Task 5: Expose the shared gate through HTTP and MCP

**Files:**
- Modify: `src/approval-desk/http.ts`
- Modify: `src/server.ts`
- Modify: `src/approval-desk/workflow-read-model.ts`
- Test: `test/approval-desk-http.test.ts`
- Test: `test/server-read.test.ts`
- Test: `test/action-bar-parity.test.ts`

- [ ] **Step 1: Add failing parity tests.**

Seed one ticket with an unreviewed diagnosis and an actionable candidate. Assert that `GET /api/tickets/:id` and the MCP `read_ticket` result both contain the same `operatorGuidance.nextAction`, `requiredReview`, `knowledgePattern`, and blocker text. Repeat after candidate rejection and diagnosis rejection.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npx vitest run test/approval-desk-http.test.ts test/server-read.test.ts test/action-bar-parity.test.ts`

Expected: FAIL because the two transports currently build guidance without knowledge-evolution context.

- [ ] **Step 3: Load one shared context in each transport.**

Before calling `buildTicketWorkflowReadModel`, load:

```ts
const [candidates, knowledgeAudits] = await Promise.all([
  deps.knowledgeEvolution.objects.listCandidates(),
  deps.knowledgeEvolution.audits.list(),
]);
```

Pass `{ candidates, audits: knowledgeAudits }` to the read model in both HTTP and MCP paths. Use the same helper for post-mutation reads so the UI never relies on stale local candidate state.

- [ ] **Step 4: Run tests and commit.**

Run: `npx vitest run test/approval-desk-http.test.ts test/server-read.test.ts test/action-bar-parity.test.ts`

Expected: PASS. Commit: `git add src/approval-desk/http.ts src/server.ts src/approval-desk/workflow-read-model.ts test/approval-desk-http.test.ts test/server-read.test.ts test/action-bar-parity.test.ts; git commit -m "feat: align HTTP and MCP workflow gates"`.

### Task 6: Split the Approval Desk into coordinated Workflow and Pattern Bars

**Files:**
- Modify: `src/approval-desk/ui.ts`
- Modify: `src/approval-desk/ui.ts` (the current Approval Desk CSS is embedded in this module alongside the markup).
- Test: `test/approval-desk-ui.test.ts`
- Test: `test/lifecycle-replay-ui.test.ts`

- [ ] **Step 1: Add failing DOM tests for the two-bar contract.**

Assert that the rendered page contains `#workflowActionBar` and `#patternActionBar`, that `Find pattern` lives under Advanced Settings, and that no center-lane mutation button is rendered. Assert that:

```ts
expect(app.el("patternActionBar").textContent).toContain("Approve");
expect(app.el("workflowActionBar").textContent).toContain("Review diagnosis");
expect(app.el("approveButton").textContent).toBe("Review");
```

when the server guidance reports a pending review gate. Assert that clicking Review focuses the correct bar and does not mutate state.

- [ ] **Step 2: Run focused UI tests and verify failure.**

Run: `npx vitest run test/approval-desk-ui.test.ts test/lifecycle-replay-ui.test.ts`

Expected: FAIL because the current single action bar owns both journeys and the center lane still contains mutation controls.

- [ ] **Step 3: Implement bar markup and state projection.**

Create two sibling sections inside `#workflowActionStack`:

```html
<section id="workflowActionBar" aria-label="Workflow actions"></section>
<section id="patternActionBar" aria-label="Pattern actions" hidden></section>
```

Render the server-provided `operatorGuidance.requiredReview` and `knowledgePattern` values. Keep automatic discovery after evaluation; expose manual `Find pattern` only in Advanced Settings. Move diagnosis review, Diagnose, Fix, platform mitigation, Verify, Close, and recommendation approval into the Workflow Bar. Move candidate review actions into the Pattern Bar.

- [ ] **Step 4: Make the bars coordinate without duplicating rules.**

Replace local checks in `renderRecommendationStageControls`, `shouldShowFixAction`, and `shouldShowCloseTicketAction` with a projection of `operatorGuidance`. If `requiredReview.kind === "diagnosis"`, show `Review diagnosis`; if it is `knowledge-pattern`, show `Review pattern`; hide or disable downstream mutations and show the server blocker. Keep `Done` for an ordinary pending recommendation, but label it `Review` whenever either required review gate is pending.

- [ ] **Step 5: Move diagnosis and candidate mutation forms.**

Render the diagnosis review draft and its Approve/Revalidate/Reject controls inside the Workflow Bar. Render the candidate editor and Approve/Refresh/Defer/Reject controls inside the Pattern Bar. Leave center-lane diagnosis history, evidence, and candidate support as read-only cards with links that focus the appropriate bar.

- [ ] **Step 6: Run focused tests and commit.**

Run: `npx vitest run test/approval-desk-ui.test.ts test/lifecycle-replay-ui.test.ts`

Expected: PASS. Commit: `git add src/approval-desk/ui.ts test/approval-desk-ui.test.ts test/lifecycle-replay-ui.test.ts; git commit -m "feat: split governed workflow and pattern action bars"`.

### Task 7: Replace the candidate textarea wall with a compact review editor

**Files:**
- Modify: `src/approval-desk/ui.ts`
- Modify: `src/approval-desk/evidence-report.ts` or the existing evidence-catalog import site if a display-label helper is needed.
- Test: `test/approval-desk-ui.test.ts`
- Test: `test/approval-desk-http.test.ts`

- [ ] **Step 1: Add failing editor tests.**

Assert that the Pattern Bar shows a summary, score/support/provenance, expandable evidence basis, catalog-backed evidence checkboxes with human labels, and compact workflow sections. Assert that raw `knowledgeEvidenceIds` and the five always-visible textareas are absent from the default view. Assert that selected catalog IDs and edited fields are sent as the existing `KnowledgeCandidateEdits` payload.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npx vitest run test/approval-desk-ui.test.ts test/approval-desk-http.test.ts`

Expected: FAIL because `renderKnowledgeReviewPanel` currently renders raw IDs and a textarea wall.

- [ ] **Step 3: Implement compact rendering and edit collection.**

Use `findEvidenceRequirement` to render each known requirement as:

```html
<label class="evidence-option">
  <input type="checkbox" data-evidence-id="request-id">
  <span><strong>Request ID</strong><small>Use the request identifier from the affected event.</small></span>
</label>
```

Render workflow lists as repeatable rows with `Add step` and `Remove`; keep longer explanations behind `<details>`. Collect edits into the existing fields (`name`, `summary`, `triggerPatterns`, `evidencePolicy`, `timeConstraints`, `diagnosticSteps`, `fixSteps`, `verificationSteps`, `customerSafeExplanation`, `operatorRationale`, `owner`) and preserve the candidate version on every request.

- [ ] **Step 4: Normalize button hierarchy and focus behavior.**

Use primary `Approve`, secondary `Refresh` and `Defer`, destructive `Reject`; require a rejection reason in the compact panel; show disabled/released explanations from `operatorGuidance`. Ensure Approve does not implicitly advance the ticket until the next server read confirms the gate is released.

- [ ] **Step 5: Run focused tests and commit.**

Run: `npx vitest run test/approval-desk-ui.test.ts test/approval-desk-http.test.ts`

Expected: PASS. Commit: `git add src/approval-desk/ui.ts src/evidence-catalog.ts test/approval-desk-ui.test.ts test/approval-desk-http.test.ts; git commit -m "fix: make knowledge candidate review compact and auditable"`.

### Task 8: Verify ordered lifecycles and documentation

**Files:**
- Modify: `test/all-ticket-lifecycle-audit.test.ts` or add `test/ordered-lifecycle-evaluation.test.ts` for ordered transitions.
- Modify: `README.md`
- Modify: `docs/knowledge-evolution.md`
- Modify: `docs/diagnostic-evaluation-harness.md`

- [ ] **Step 1: Add ordered lifecycle coverage.**

Exercise these sequences through the service and HTTP read model, not only snapshots:

```text
TKT-1002: evaluate -> record diagnosis -> review diagnosis -> pattern review -> approve -> evaluate -> fix/close as allowed
TKT-1002: reject diagnosis -> guidance requires evaluate -> replacement evaluation excludes rejected diagnosis
TKT-1001: waiting-on-platform-fix -> record platform mitigation -> evaluate -> verification path
TKT-1004: customer reply -> evidence readiness recognizes audit source and affected scope -> no contradictory evidence ask
TKT-1010: open-ticket corroboration -> no hard pattern gate without completed diagnosis
```

Assert that every attempted out-of-order mutation is rejected by the service, not merely hidden by the UI.

- [ ] **Step 2: Run the complete verification set.**

Run:

```powershell
npm run build
npm test
npx vitest run test/all-ticket-lifecycle-audit.test.ts test/ordered-lifecycle-evaluation.test.ts test/action-bar-parity.test.ts
npm run evaluate:lifecycle
```

Expected: build succeeds, the full suite passes, ordered lifecycle tests pass, and the all-ticket audit still reports 30/30 classification contracts passing.

- [ ] **Step 3: Update documentation.**

Document that:

- diagnosis approval/rejection is an auditable gate;
- rejection triggers a fresh evaluation rather than silently inventing a replacement;
- actionable pattern candidates are reviewed in the Pattern Bar and can block downstream support actions;
- open-ticket corroboration remains advisory;
- platform mitigation is an explicitly audited signal, not a confirmed fix;
- HTTP and MCP expose the same `operatorGuidance` contract.

- [ ] **Step 4: Run documentation checks and commit.**

Run: `git diff --check; npm run build; npm test`

Expected: no whitespace errors, build success, and the complete suite passing. Commit: `git add test README.md docs/knowledge-evolution.md docs/diagnostic-evaluation-harness.md; git commit -m "docs: describe governed diagnosis and pattern lifecycles"`.

## Self-review checklist

- Spec coverage: Tasks 1–3 cover diagnosis disposition, pattern disposition, rejection context, and platform mitigation; Task 4 covers evidence and response consistency; Tasks 5–7 cover transport parity, two bars, and the compact editor; Task 8 covers ordered verification and documentation.
- No runtime mutation is delegated to DOM code: the UI only projects `operatorGuidance` and calls existing service-backed routes.
- No GPT output changes lifecycle state: advisory providers receive rejected diagnoses as exclusions, while deterministic guidance remains authoritative.
- No candidate from open-ticket corroboration alone blocks a ticket.
- No platform-mitigation audit is treated as `fix-available`.
- Every task has exact files, failing-test commands, passing-test commands, and a commit boundary.
