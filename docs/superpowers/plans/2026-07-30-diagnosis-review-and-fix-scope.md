# Governed Diagnosis Review and Diagnosis-Scoped Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make diagnoses reviewable, immutable, freshness-aware, and independently actionable so operators can approve a diagnosis, select a related-ticket impact set, and apply a governed fix without requiring an unconfirmed customer reply or silently closing tickets.

**Architecture:** Preserve the existing `TriageService` as the single authority for diagnosis review, stale checks, fix gating, impact-set validation, and audit invariants. Store the original diagnosis and review decisions as immutable audit-backed records; expose the same operations through Approval Desk HTTP/UI and MCP. Keep queue analysis, similarity discovery, GPT knowledge-object drafting, and executable knowledge-object workflows out of this plan; they consume the reviewable diagnosis contracts in later plans.

**Tech Stack:** TypeScript, Zod schemas, Vitest, local JSON/JSONL repositories, Approval Desk HTTP/UI, MCP server tools.

## Global Constraints

- AI proposes structured knowledge; deterministic services and human approval govern execution.
- Diagnosis history is immutable. Corrections create reviewed versions or review events.
- Stale diagnoses remain historical but cannot unlock current fixes, closure, or promotion.
- A fix applies to a selected diagnosis and explicitly approved impact set; it does not silently close tickets.
- Approval Desk UI, MCP tools, and replay views call the same domain implementation.
- No arbitrary GPT-generated code, automatic knowledge-object promotion, or automatic ordinary-ticket closure.
- All customer-facing text must remain customer-safe and must not expose internal rationale, similarity details, prompts, or secrets.
- Every state-changing operation must have deterministic validation, audit coverage, and a focused regression test before implementation.

---

### Task 1: Add diagnosis-review and impact-set domain contracts

**Files:**
- Modify: `src/domain.ts` (audit actions and shared identifiers)
- Modify: `src/triage-service.ts` (public input/output types near existing diagnosis and fix contracts)
- Create: `src/approval-desk/diagnosis-review.ts` (pure schemas, stale evaluation, and audit read-model helpers)
- Create: `test/diagnosis-review.test.ts`

**Interfaces:**
- Produces `DiagnosisReviewDecisionSchema` with `decision: "approve" | "reject" | "revalidate"`, `diagnosisId`, `ticketId`, `sourceTicketRevision`, `sourceConversationWatermark`, `editedDiagnosis`, `actor`, `rationale`, and `reviewedAt`.
- Produces `DiagnosisImpactSetSchema` containing a unique non-empty list of `{ ticketId, reason }` entries and an operator actor/rationale.
- Produces `DiagnosisReviewSnapshot` with original diagnosis, latest review decision, `stale: boolean`, `staleReasons: string[]`, and the source watermarks.
- Exports `DiagnosisReviewInput` and `DiagnosisImpactSet` as the inferred TypeScript types used by `TriageService` and transport adapters.
- Exposes `isDiagnosisStale(input)` and `latestDiagnosisReview(audits, diagnosisId)` as pure functions used by HTTP, MCP, and UI read models.

- [ ] **Step 1: Write failing schema and stale-state tests**

Add tests covering:

```ts
it("rejects duplicate impact-set ticket IDs", () => { /* parse duplicate IDs */ });
it("requires rationale for reject and revalidate decisions", () => { /* parse missing rationale */ });
it("marks a diagnosis stale after a newer customer reply", () => {
  expect(isDiagnosisStale({
    diagnosisTimestamp: "2026-06-10T10:00:00.000Z",
    diagnosisTicketRevision: 2,
    diagnosisReplyWatermark: "2026-06-10T09:55:00.000Z",
    currentTicketRevision: 2,
    latestReplyAt: "2026-06-10T10:05:00.000Z",
  })).toMatchObject({ stale: true });
});
it("keeps a resolved historical diagnosis available for history", () => { /* stale does not delete */ });
```

- [ ] **Step 2: Run the focused tests and verify they fail for missing contracts**

Run: `npx vitest run test/diagnosis-review.test.ts`

Expected: FAIL because the schemas and stale/read-model helpers do not exist yet.

- [ ] **Step 3: Implement the pure contracts and helpers**

Add strict Zod schemas and pure functions. Use the existing `TicketIdSchema`, `IsoTimestampSchema`, `AuditEventSchema`, `DiagnosisContextSchema`, and `DiagnosticStateSnapshotSchema`. A review decision must reference the original diagnosis and source watermarks; it must never replace the original record. Staleness must report reasons for newer replies, revisions, contradictory evidence, newer diagnosis/review, or invalidating fix/event signals.

- [ ] **Step 4: Re-run focused tests and the typecheck**

Run: `npx vitest run test/diagnosis-review.test.ts && npm run typecheck`

Expected: all focused tests pass and TypeScript accepts the contracts consumed by later tasks.

- [ ] **Step 5: Commit**

```powershell
git add src/domain.ts src/triage-service.ts src/approval-desk/diagnosis-review.ts test/diagnosis-review.test.ts
git commit -m "feat: add diagnosis review contracts"
```

### Task 2: Implement immutable diagnosis review and revalidation in the domain service

**Files:**
- Modify: `src/triage-service.ts` (`TriageService` and diagnosis-related input/output types)
- Modify: `src/approval-desk/workflow-guidance.ts` (review/stale/fix guidance)
- Modify: `src/approval-desk/diagnostic-workflow.ts` (reviewed diagnosis context selection)
- Test: `test/triage-service.test.ts`
- Test: `test/workflow-guidance.test.ts`
- Test: `test/approval-desk-diagnostic-workflow.test.ts`

**Interfaces:**
- Add `TriageService.reviewDiagnosis(input: DiagnosisReviewInput): Promise<AuditEvent>`.
- Add `reviewDiagnosis` validation that loads the ticket and audits under the existing ticket serialization boundary.
- Add `latestAuthoritativeDiagnosis(ticketId, audits)` as the shared read helper used by fix gating.
- Preserve `recordDiagnosis` as the only operation that creates an original diagnosis; review never edits that event.

- [ ] **Step 1: Add failing service tests**

Cover:

```ts
it("approves an unchanged diagnosis and records the review event", async () => { /* record diagnosis, review, assert audit */ });
it("rejects a review with a stale ticket revision", async () => { /* expect STALE_APPROVAL */ });
it("rejects a stale diagnosis after a newer customer reply", async () => { /* expect INVALID_APPROVAL_FIELDS */ });
it("revalidates an unchanged diagnosis with a new watermark", async () => { /* assert new review references original diagnosis */ });
it("never mutates the original diagnosis audit", async () => { /* compare original after review */ });
```

- [ ] **Step 2: Run focused tests to establish the red state**

Run: `npx vitest run test/triage-service.test.ts test/workflow-guidance.test.ts test/approval-desk-diagnostic-workflow.test.ts`

Expected: the new review tests fail because the service operation and guidance do not exist.

- [ ] **Step 3: Implement serialized review and authoritative-diagnosis selection**

Inside `TriageService.reviewDiagnosis`, validate the source diagnosis ID, ticket revision, conversation watermark, and current audit state while holding the ticket operation lock. Approve/revalidate only a current diagnosis; reject stale or ambiguous input with a deterministic domain error. Append a strict review audit containing the original diagnosis ID, edited approved fields, source watermarks, decision, actor, and rationale. Do not overwrite or delete the original diagnosis. Update guidance so stale diagnoses require evaluation/revalidation and cannot unlock fixes or closure.

- [ ] **Step 4: Run focused tests and inspect the audit shape**

Run: `npx vitest run test/triage-service.test.ts test/workflow-guidance.test.ts test/approval-desk-diagnostic-workflow.test.ts`

Expected: all new and existing diagnosis/lifecycle tests pass, with one immutable original diagnosis plus one review audit per decision.

- [ ] **Step 5: Commit**

```powershell
git add src/triage-service.ts src/approval-desk/workflow-guidance.ts src/approval-desk/diagnostic-workflow.ts test/triage-service.test.ts test/workflow-guidance.test.ts test/approval-desk-diagnostic-workflow.test.ts
git commit -m "feat: add governed diagnosis review"
```

### Task 3: Add diagnosis-scoped fix application and impact-set approval

**Files:**
- Modify: `src/triage-service.ts` (`RecordFixInput`, fix service operation, audit compensation)
- Modify: `src/approval-desk/workflow-guidance.ts` (fix gates)
- Modify: `src/approval-desk/diagnostic-workflow.ts` (diagnosis-specific fix context)
- Modify: `src/domain.ts` (impact-set and diagnosis-scoped fix audit payload types)
- Test: `test/triage-service.test.ts`
- Test: `test/workflow-guidance.test.ts`

**Interfaces:**
- Add `ApplyDiagnosisFixInput` with `diagnosisId`, `sourceTicketId`, `impactSet`, `actor`, and `fixedAt`.
- Add `TriageService.applyDiagnosisFix(input): Promise<AuditEvent[]>`.
- Keep the existing single-ticket `recordFix` path as a compatibility adapter that calls the same implementation with a one-ticket impact set.

- [ ] **Step 1: Write failing fix-scope tests**

Cover:

```ts
it("allows a confirmed current diagnosis to unlock a fix without customer confirmation", async () => { /* diagnosis response sent, no reply, apply fix */ });
it("rejects a stale or unreviewed diagnosis", async () => { /* expect deterministic blocker */ });
it("requires explicit operator selection for each impact-set ticket", async () => { /* omitted/duplicate ticket IDs fail */ });
it("writes a separate fix audit for every selected ticket", async () => { /* assert one event per ticket */ });
it("does not close any ticket while applying a diagnosis fix", async () => { /* statuses remain non-resolved */ });
it("compensates partial audit failure without leaving a half-applied impact set", async () => { /* inject append failure and assert rollback */ });
```

- [ ] **Step 2: Run focused tests and verify the expected failures**

Run: `npx vitest run test/triage-service.test.ts test/workflow-guidance.test.ts`

Expected: the new tests fail because fix input has no diagnosis/impact-set scope and the service currently handles only one ticket.

- [ ] **Step 3: Implement the diagnosis-scoped fix operation**

Validate that the diagnosis is current, approved/revalidated, confirmed, and eligible for a fix under existing owner/state rules. Validate every selected ticket and preserve ticket serialization. Build a customer-safe fix context from the diagnosis, append one `fix-available` audit per selected ticket with the diagnosis ID and impact-set rationale, and compensate persisted state if a later append fails. Do not append a closure event or mutate ticket status to resolved.

- [ ] **Step 4: Run focused tests plus existing lifecycle tests**

Run: `npx vitest run test/triage-service.test.ts test/workflow-guidance.test.ts test/approval-desk-diagnostic-workflow.test.ts test/automatic-customer-replies.test.ts`

Expected: all tests pass and the no-customer-confirmation fix path is covered without weakening existing close gates.

- [ ] **Step 5: Commit**

```powershell
git add src/triage-service.ts src/approval-desk/workflow-guidance.ts src/approval-desk/diagnostic-workflow.ts src/domain.ts test/triage-service.test.ts test/workflow-guidance.test.ts test/approval-desk-diagnostic-workflow.test.ts test/automatic-customer-replies.test.ts
git commit -m "feat: apply diagnosis-scoped fixes"
```

### Task 4: Expose equivalent diagnosis review and fix operations through HTTP and MCP

**Files:**
- Modify: `src/approval-desk/http.ts` (diagnosis list/review/fix routes)
- Modify: `src/server.ts` (MCP schemas and tools)
- Modify: `src/runtime.ts` only if dependency wiring is required
- Test: `test/approval-desk-http.test.ts`
- Test: `test/server-actions.test.ts`
- Test: `test/server-read.test.ts`

**Interfaces:**
- HTTP `GET /api/tickets/:ticketId/diagnoses` returns original diagnoses, review decisions, freshness, and stale reasons.
- HTTP `POST /api/tickets/:ticketId/diagnoses/:diagnosisId/review` accepts the strict review input and returns its audit event plus the current diagnosis view.
- HTTP `POST /api/tickets/:ticketId/diagnoses/:diagnosisId/fix` accepts the selected impact set and returns one result per affected ticket.
- MCP tools `get_ticket_diagnoses`, `review_diagnosis`, and `apply_diagnosis_fix` call the same service methods and use equivalent schemas/output semantics.

- [ ] **Step 1: Add failing route and tool contract tests**

Cover successful list/review/fix responses, stale rejection, duplicate impact-set rejection, missing actor/rationale, and parity of HTTP/MCP error codes and audit payloads.

- [ ] **Step 2: Run focused transport tests to verify red**

Run: `npx vitest run test/approval-desk-http.test.ts test/server-actions.test.ts test/server-read.test.ts`

Expected: new routes/tools are not found or do not satisfy the output schemas.

- [ ] **Step 3: Implement HTTP and MCP adapters**

Keep adapters thin: parse identifiers/body, load the current read model only for presentation, call `TriageService`, and return the shared schemas. Do not reproduce stale, approval, fix, or impact-set validation in a route or tool.

- [ ] **Step 4: Run focused transport tests and typecheck**

Run: `npx vitest run test/approval-desk-http.test.ts test/server-actions.test.ts test/server-read.test.ts && npm run typecheck`

Expected: HTTP and MCP tests pass with equivalent domain outcomes.

- [ ] **Step 5: Commit**

```powershell
git add src/approval-desk/http.ts src/server.ts src/runtime.ts test/approval-desk-http.test.ts test/server-actions.test.ts test/server-read.test.ts
git commit -m "feat: expose diagnosis review operations"
```

### Task 5: Add compact Approval Desk diagnosis review and impact-set UI

**Files:**
- Modify: `src/approval-desk/ui.ts` (diagnosis panel, review controls, impact-set selection, status indicator)
- Modify: `test/approval-desk-ui.test.ts`
- Modify: `test/approval-desk-http.test.ts` (diagnosis-review and impact-set view-model fixtures)

**Interfaces:**
- The selected-ticket panel displays original diagnosis, current reviewed version, stale state/reasons, evidence, workflow context, and audit history.
- Review controls edit a draft only; approve, revalidate, and reject call the HTTP review route.
- The fix panel displays the diagnosis-specific fix, suggested related tickets, and selectable impact-set checkboxes. Applying the fix shows per-ticket results and verification state.
- The queue remains compact: one primary status indicator plus an info affordance; no multi-badge expansion.

- [ ] **Step 1: Add failing UI tests**

Cover diagnosis display, stale warning, edit-without-overwrite behavior, approval/revalidation controls, impact-set selection, per-ticket result rendering, and accessible status indicator labels.

- [ ] **Step 2: Run the UI tests to verify red**

Run: `npx vitest run test/approval-desk-ui.test.ts`

Expected: the new selectors/text are absent until the UI is wired.

- [ ] **Step 3: Implement the compact review and fix controls**

Reuse existing `requestJson`, selected-ticket refresh, actor field, result panel, and queue rendering helpers. Do not add lifecycle decisions to browser JavaScript; the UI only renders server guidance and submits operator inputs. Use text/icon/ARIA labels in addition to color.

- [ ] **Step 4: Run UI and HTTP tests**

Run: `npx vitest run test/approval-desk-ui.test.ts test/approval-desk-http.test.ts`

Expected: UI tests pass and controls remain consistent with the shared HTTP/domain behavior.

- [ ] **Step 5: Commit**

```powershell
git add src/approval-desk/ui.ts test/approval-desk-ui.test.ts test/approval-desk-http.test.ts
git commit -m "feat: add diagnosis review controls"
```

### Task 6: Add end-to-end lifecycle coverage and documentation

**Files:**
- Modify: `test/approval-desk-diagnostic-workflow.test.ts`
- Modify: `test/demo-skill-showcase.test.ts` if the showcase covers diagnosis/fix actions
- Modify: `README.md`
- Modify: `docs/skill-evaluation.md` or add `docs/diagnosis-review-example.md`

- [ ] **Step 1: Add a chronological TKT-1001 regression scenario**

The scenario must record complete evidence, record and approve a diagnosis, send the diagnostic response, verify that no customer confirmation is required to unlock the diagnosis-specific fix, select TKT-1001 and any explicitly related tickets, apply the fix, confirm separate fix audits and verification responses, and prove closure remains blocked until the configured ready-to-close response is sent and the operator closes the ticket.

- [ ] **Step 2: Add stale and revalidation scenarios**

Cover a customer reply making the diagnosis stale, a revalidation with a new watermark, a resolved historical diagnosis that remains queryable, and rejection of a fix based on the old version.

- [ ] **Step 3: Run the focused end-to-end tests**

Run: `npx vitest run test/approval-desk-diagnostic-workflow.test.ts test/demo-skill-showcase.test.ts`

Expected: the complete diagnosis-review/fix lifecycle passes with audit evidence visible.

- [ ] **Step 4: Document the operator journey and authority boundaries**

README and the example document must show the diagnosis review, impact-set selection, customer responses, stale handling, and explicit closure gate. State clearly that queue analysis, similarity discovery, and GPT knowledge-object drafting are the next plans, not hidden behavior in this slice.

- [ ] **Step 5: Run full verification**

Run: `npm test`, `npm run build`, `npm run typecheck`, and `git diff --check`.

Expected: the full suite, build, typecheck, and whitespace checks pass. Preserve any user-generated evaluation reports and do not stage them unless explicitly requested.

- [ ] **Step 6: Commit**

```powershell
git add test/approval-desk-diagnostic-workflow.test.ts test/demo-skill-showcase.test.ts README.md docs/diagnosis-review-example.md
git commit -m "test: document governed diagnosis review lifecycle"
```

## Later plans intentionally excluded

After this plan is reviewed and implemented, create separate plans for:

1. revision-aware deterministic queue analysis;
2. evidence-graph similarity and emerging-pattern signals;
3. GPT-drafted candidate knowledge objects and human promotion;
4. executable versioned knowledge-object workflows and migration;
5. expanded multi-turn harness and portfolio showcase.
