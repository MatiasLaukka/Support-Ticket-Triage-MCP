# Diagnostic Engine Phase 6 Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the Diagnostic Engine plan by proving the shared workflow read model and turning the existing MCP showcase into an explicit deterministic stateful lifecycle evaluation with a documented ambiguity/escalation companion scenario.

**Architecture:** Reuse `createTriageServer`, the existing in-memory MCP transport, `runSkillShowcase`, `runDiagnosticEvaluation`, and the shared `operatorGuidance` authority. The replay evaluator will observe every `get_ticket_workflow` read and validate its context; it will not implement lifecycle transitions or mutate domain state outside the existing MCP/service operations. The case study and README will distinguish the stateful replay from the scenario-based diagnostic harness and will not claim that all 30 seed tickets were chronologically replayed.

**Tech Stack:** TypeScript, MCP SDK in-memory transport, Vitest, Node CLI scripts, Markdown documentation.

---

### Task 1: Make workflow-read coverage explicit

**Files:**
- Modify: `scripts/demo-skill-showcase.ts`
- Test: `test/demo-skill-showcase.test.ts`

- [ ] **Step 1: Extend the workflow snapshot with the read-model fields the Skill needs**

Add `conversationHistory`, `conversationTimeline`, `recommendationHistory`, `recommendationSummary`, and a sanitized `workflowReads` report entry. Preserve only safe metadata in the report: ticket revision/status, workflow state, timeline kinds, recommendation presence, operator stage, next action, blockers, and approval-required status. Never serialize customer bodies or raw provider payloads in the read coverage section.

- [ ] **Step 2: Validate every read immediately after `get_ticket_workflow`**

The read helper must reject a malformed or incomplete read when it lacks the ticket, conversation arrays, recommendation summary, or operator guidance. The original ticket must be present in the timeline. Any diagnosis or fix timeline item must retain its structured kind and safe summary fields. The helper records one read snapshot before the first action and after every transition.

- [ ] **Step 3: Add regression assertions for read coverage**

Assert that the deterministic showcase records a read before every guided transition, that the report includes recommendation, conversation, guidance, diagnosis, and fix context, and that serialized output contains no customer message bodies, filesystem paths, API keys, or raw provider payloads.

- [ ] **Step 4: Run the focused showcase tests**

Run:

```powershell
npx vitest run --dir test test/demo-skill-showcase.test.ts
```

Expected: all showcase tests pass and the existing final status remains `resolved`.

### Task 2: Add an explicit deterministic lifecycle replay evaluator

**Files:**
- Create: `scripts/evaluate-diagnostic-lifecycle-replay.ts`
- Modify: `package.json`
- Test: `test/demo-skill-showcase.test.ts`

- [ ] **Step 1: Define replay acceptance checks around the existing showcase report**

Export a verifier that requires the ordered workflow stages `review`, `diagnosis-ready`, `diagnosis-recorded`, `fix-ready`, `verification`, `ready-for-close`, and `closed`; requires explicit approvals; requires at least one customer reply and diagnosis/fix audit event; requires every tool action to be preceded by a workflow read; and requires final status `resolved`. Return all failures instead of silently accepting a partial replay.

- [ ] **Step 2: Add the CLI evaluator**

Run the deterministic `runSkillShowcase` in an isolated temporary data root, call the verifier, and print a concise report containing the ordered stage trail, read-model coverage, audit action sequence, final status, and any failures. Run the existing non-mutating eleven-scenario diagnostic evaluation as a companion section and print the `bounded-escalation` result as the supporting ambiguity/escalation example. Set a non-zero exit code if either verifier fails and always remove the temporary root.

- [ ] **Step 3: Add a package script**

Add:

```json
"evaluate:lifecycle-replay": "npm run build && node dist/scripts/evaluate-diagnostic-lifecycle-replay.js"
```

Keep `evaluate:diagnostics` as the focused Vitest contract command; the new command is the stateful replay evaluator.

- [ ] **Step 4: Test the verifier and cleanup behavior**

Add focused tests for a passing replay, a missing required stage, and an incomplete read snapshot. Also assert the CLI evaluator uses deterministic mode and performs no network calls.

### Task 3: Verify and document the authoritative workflow read model

**Files:**
- Modify: `test/server-read.test.ts`
- Modify: `docs/diagnostic-evaluation-harness.md`
- Modify: `docs/diagnostic-engine-plan.md`

- [ ] **Step 1: Add a read-model contract test**

Use `get_ticket_workflow` after persisted diagnosis and fix audits and assert that one read contains the ticket, full conversation history/timeline, recommendation history/latest recommendation, evidence-bearing recommendation fields, operator guidance, and diagnosis/fix timeline items. Assert that no separate workflow-state implementation is needed.

- [ ] **Step 2: Correct the harness terminology**

Describe the eleven-scenario harness as a context-aware, scenario-based deterministic diagnostic harness. State explicitly that it does not execute persisted actions chronologically. Document `evaluate:lifecycle-replay` as the stateful MCP replay for the polished journey.

- [ ] **Step 3: Close Phase 6 in the diagnostic-engine plan**

Record that `get_ticket_workflow` already exposes the required context through its structured fields, timeline, recommendation evidence, and operator guidance. Mark the read-model review and portfolio replay complete. Preserve the remaining opportunities for smaller discriminating evidence requests and broader candidate/refutation coverage as future work.

### Task 4: Refresh portfolio documentation and showcase guidance

**Files:**
- Modify: `README.md`
- Modify: `docs/case-study.md`
- Modify: `docs/demo-results.md`
- Modify: `docs/lifecycle-replay.md`

- [ ] **Step 1: Document the stateful journey**

Add the deterministic command and describe the observed sequence: evidence-gated recommendation, human approval, customer reply, reevaluation, diagnosis, diagnosis approval, response, fix/mitigation, verification, and closure. State that human approval is scripted in the CLI showcase and interactive in Approval Desk/MCP usage.

- [ ] **Step 2: Add the ambiguity/escalation companion**

Document the `bounded-escalation` scenario as a separate supporting example: repeated non-discriminating evidence keeps hypotheses ambiguous, then bounded escalation routes to specialist review without autonomous fix or closure. Keep internal diagnostic text out of customer-facing examples.

- [ ] **Step 3: Clarify the two evaluation surfaces**

Explain that Lifecycle Replay is a read-only report viewer, the eleven-scenario harness is non-mutating scenario coverage, and the new lifecycle replay evaluator is the chronological stateful proof. Include the exact PowerShell commands.

### Task 5: Full verification and commit

**Files:**
- No additional files.

- [ ] **Step 1: Run build and typecheck**

```powershell
npm run build
npm run typecheck
```

- [ ] **Step 2: Run the complete active test suite**

```powershell
npx vitest run --dir test
```

- [ ] **Step 3: Run both evaluation commands**

```powershell
npm run evaluate:diagnostics
npm run evaluate:lifecycle-replay
```

- [ ] **Step 4: Commit the completed phase**

```powershell
git add -- scripts/demo-skill-showcase.ts scripts/evaluate-diagnostic-lifecycle-replay.ts package.json test/demo-skill-showcase.test.ts test/server-read.test.ts docs/diagnostic-evaluation-harness.md docs/diagnostic-engine-plan.md README.md docs/case-study.md docs/demo-results.md docs/lifecycle-replay.md
git commit -m "feat: finish diagnostic engine replay verification"
```
