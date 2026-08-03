# Knowledge-Evolution Evidence Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synthetic diagnosis evidence IDs with catalog-backed structured observations and enforce a governed candidate-to-known-cause promotion boundary.

**Architecture:** Extract one shared evidence catalog used by readiness, diagnosis recording, candidate discovery, validation, promotion, and known-cause execution. Keep human-readable diagnosis text separate from structured evidence references. Let candidates be editable and possibly `undecided`, while promoted known causes can contain only a validated required or explicitly justified none-required policy.

**Tech Stack:** TypeScript, Zod, Vitest, local JSON/JSONL repositories, existing Approval Desk and MCP adapters.

## Global Constraints

- Do not add a runtime dependency or migrate persistence to SQLite in this slice.
- `EvidenceRequirementId` is derived from the shared catalog keys and external strings are validated before use.
- New completed diagnoses never create `evidence-<audit-id>` identifiers.
- Historical diagnoses may load without `evidenceReferences`; they remain valid but cannot silently create reusable evidence policy.
- Candidate policy may be `undecided`; approved policy may not be `undecided`.
- Existing customer-facing response wording and adapter behavior remain unchanged unless a shared domain contract requires a pass-through field.
- Every implementation task ends with focused Vitest coverage before moving to the next task.

---

### Task 1: Extract the shared evidence catalog

**Files:**
- Create: `src/evidence-catalog.ts`
- Modify: `src/approval-desk/evidence-readiness.ts`
- Test: `test/evidence-readiness.test.ts`
- Create: `test/evidence-catalog.test.ts`

**Interfaces:**
- Produces `EVIDENCE_CATALOG`, `EvidenceRequirementId`, `EvidenceRequirementDefinition`, `findEvidenceRequirement`, `requireEvidenceRequirement`, and `isEvidenceRequirementId`.
- `findEvidenceRequirement` returns `undefined` for unknown IDs so validation can collect all issues.
- `requireEvidenceRequirement` throws a domain error for corrupted approved state.

- [ ] **Step 1: Write failing catalog and deprecation tests.**

```ts
it("derives IDs from the catalog and resolves active entries", () => {
  expect(isEvidenceRequirementId("request-id")).toBe(true);
  expect(findEvidenceRequirement("request-id")?.status).toBe("active");
});

it("reports unknown IDs without throwing during lookup", () => {
  expect(findEvidenceRequirement("not-a-real-evidence-id")).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused tests and verify the new module is missing.**

Run: `npm test -- --run test/evidence-catalog.test.ts test/evidence-readiness.test.ts`

Expected: FAIL because the shared catalog exports do not exist.

- [ ] **Step 3: Move the current catalog definitions into `src/evidence-catalog.ts`.** Preserve every current ID, label, customer question, and alias. Add `status: "active" | "deprecated"` and optional `replacementId`; mark all current entries active. Derive `EvidenceRequirementId` from `keyof typeof EVIDENCE_CATALOG` and implement both lookup functions.

- [ ] **Step 4: Update evidence readiness to import the catalog.** Replace its private catalog and throwing lookup with the shared functions. Keep `EvidenceRequirement.source` mapping and current customer-question behavior unchanged.

- [ ] **Step 5: Run focused tests and commit the catalog extraction.**

Run: `npm test -- --run test/evidence-catalog.test.ts test/evidence-readiness.test.ts`

Expected: PASS.

Commit: `git add src/evidence-catalog.ts src/approval-desk/evidence-readiness.ts test/evidence-catalog.test.ts test/evidence-readiness.test.ts && git commit -m "refactor: centralize evidence catalog"`

### Task 2: Add structured diagnosis evidence with legacy loading

**Files:**
- Modify: `src/domain.ts`
- Modify: `src/triage-service.ts`
- Modify: `src/knowledge-evolution/domain.ts`
- Modify: `src/knowledge-evolution/diagnosis-repository.ts`
- Test: `test/domain.test.ts`
- Test: `test/knowledge-evolution-domain.test.ts`
- Test: `test/knowledge-evolution-repositories.test.ts`

**Interfaces:**
- Add `DiagnosisEvidenceReferenceSchema` and `DiagnosisEvidenceReference` to the shared domain.
- Extend `DiagnosisContext` with `evidenceReferences`, defaulting to `[]` when an old audit omits the field.
- Completed diagnoses retain readable `evidenceUsed` and persist `evidenceReferences`; keep optional legacy `evidenceIds` only for loading old files and do not use it to derive new policy.

- [ ] **Step 1: Add failing schema tests.** Cover `labelAtDiagnosis`, source values, source-reference constraints, duplicate references with different provenance, and old diagnosis JSON without `evidenceReferences` loading with `[]`.

- [ ] **Step 2: Run the focused schema tests and confirm failure.**

Run: `npm test -- --run test/domain.test.ts test/knowledge-evolution-domain.test.ts test/knowledge-evolution-repositories.test.ts`

Expected: FAIL because the structured reference fields and defaults are absent.

- [ ] **Step 3: Implement the schemas and compatibility defaults.** Use `labelAtDiagnosis` as the immutable display snapshot. Validate any supplied ID through `isEvidenceRequirementId`; preserve duplicate IDs when `sourceRef` differs. Keep legacy `evidenceIds` optional and explicitly deprecated in comments.

- [ ] **Step 4: Update completed-diagnosis repository parsing.** Ensure old persisted records parse without references and remain readable. Do not convert synthetic legacy IDs into valid references.

- [ ] **Step 5: Run focused tests and commit.**

Run: `npm test -- --run test/domain.test.ts test/knowledge-evolution-domain.test.ts test/knowledge-evolution-repositories.test.ts`

Expected: PASS.

Commit: `git add src/domain.ts src/triage-service.ts src/knowledge-evolution/domain.ts src/knowledge-evolution/diagnosis-repository.ts test/domain.test.ts test/knowledge-evolution-domain.test.ts test/knowledge-evolution-repositories.test.ts && git commit -m "feat: add catalog-backed diagnosis evidence references"`

### Task 3: Record observed references instead of synthetic IDs

**Files:**
- Modify: `src/approval-desk/diagnostic-workflow.ts`
- Modify: `src/triage-service.ts`
- Modify: `src/approval-desk/workflow-read-model.ts`
- Test: `test/triage-service.test.ts`
- Test: `test/approval-desk-diagnostic-workflow.test.ts`

**Interfaces:**
- Produce `evidenceReferences` from recognized `providedEvidence`, never from `requiredEvidence` and never from free-form `evidenceUsed` prose.
- `completedDiagnosisFrom` persists `evidenceUsed` and structured references; it does not manufacture IDs.
- Diagnosis recording rejects unknown supplied reference IDs before writing an audit or completed-diagnosis record.

- [ ] **Step 1: Write failing recording tests.** Assert that a catalog-backed provided requirement is persisted with its `labelAtDiagnosis`, that duplicate observations retain separate provenance, and that a valid diagnosis with zero reusable references remains recordable.

- [ ] **Step 2: Add a failing regression proving synthetic IDs are absent.** Record a diagnosis and assert no persisted evidence ID starts with `evidence-`.

- [ ] **Step 3: Run focused tests and verify failure.**

Run: `npm test -- --run test/triage-service.test.ts test/approval-desk-diagnostic-workflow.test.ts`

Expected: FAIL because completed diagnoses currently derive IDs from the audit UUID.

- [ ] **Step 4: Build references from evaluated provided evidence.** Use ticket/reply/operator provenance available in the current audit context; retain the immutable catalog label. Leave readable `evidenceUsed` unchanged for customer-safe diagnosis and audit display.

- [ ] **Step 5: Validate references before persistence and replace `completedDiagnosisFrom`.** Unknown IDs produce a domain validation error with the offending IDs; no diagnosis or audit is partially committed.

- [ ] **Step 6: Run focused tests and commit.**

Run: `npm test -- --run test/triage-service.test.ts test/approval-desk-diagnostic-workflow.test.ts`

Expected: PASS.

Commit: `git add src/approval-desk/diagnostic-workflow.ts src/triage-service.ts src/approval-desk/workflow-read-model.ts test/triage-service.test.ts test/approval-desk-diagnostic-workflow.test.ts && git commit -m "fix: persist observed diagnosis evidence"`

### Task 4: Split candidate draft policy from approved policy

**Files:**
- Modify: `src/knowledge-evolution/domain.ts`
- Modify: `src/knowledge-evolution/candidate-draft-contract.ts`
- Modify: `src/knowledge-evolution/candidate-draft-validation.ts`
- Modify: `src/knowledge-evolution/service.ts`
- Modify: `src/knowledge-evolution/controlled-evaluation-providers.ts`
- Test: `test/knowledge-evolution-domain.test.ts`
- Test: `test/knowledge-evolution-candidate-draft.test.ts`
- Test: `test/knowledge-evolution-service.test.ts`

**Interfaces:**
- `CandidateEvidencePolicy`: `undecided`, valid `required`, or justified `none-required`.
- `ApprovedEvidencePolicy`: valid `required` or justified `none-required` only.
- `CandidateValidationResult`: `validForPromotion`, `errors`, and `warnings`.
- Candidate derivation uses only `diagnosis.evidenceReferences`; duplicate IDs are deduplicated for policy suggestions.

- [ ] **Step 1: Write failing policy tests.** Cover undecided candidates, empty required rejection, missing none-required rationale, unknown/deprecated IDs, and valid required policy conversion.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm test -- --run test/knowledge-evolution-domain.test.ts test/knowledge-evolution-candidate-draft.test.ts test/knowledge-evolution-service.test.ts`

Expected: FAIL because the current candidate and object schemas share one two-branch policy.

- [ ] **Step 3: Implement separate Zod unions and candidate validation issues.** Draft validation collects every blocking issue instead of throwing on the first missing policy. Preserve existing safety guardrails for unsafe GPT text.

- [ ] **Step 4: Update deterministic and controlled candidate derivation.** A diagnosis with references suggests `required` IDs; a diagnosis without references produces `undecided` with `EVIDENCE_POLICY_UNDECIDED`. Never infer `none-required` from an empty set.

- [ ] **Step 5: Record derived versus operator-added policy IDs in candidate review metadata.** Candidate edits may add registered IDs; the final approved object stores only the approved policy.

- [ ] **Step 6: Run focused tests and commit.**

Run: `npm test -- --run test/knowledge-evolution-domain.test.ts test/knowledge-evolution-candidate-draft.test.ts test/knowledge-evolution-service.test.ts`

Expected: PASS.

Commit: `git add src/knowledge-evolution/domain.ts src/knowledge-evolution/candidate-draft-contract.ts src/knowledge-evolution/candidate-draft-validation.ts src/knowledge-evolution/service.ts src/knowledge-evolution/controlled-evaluation-providers.ts test/knowledge-evolution-domain.test.ts test/knowledge-evolution-candidate-draft.test.ts test/knowledge-evolution-service.test.ts && git commit -m "feat: govern candidate evidence policies"`

### Task 5: Revalidate promotion against current catalog state

**Files:**
- Modify: `src/knowledge-evolution/service.ts`
- Modify: `src/knowledge-evolution/knowledge-object-repository.ts`
- Modify: `src/knowledge-evolution/knowledge-audit-repository.ts`
- Test: `test/knowledge-evolution-service.test.ts`
- Test: `test/knowledge-evolution-repositories.test.ts`

**Interfaces:**
- Promotion reloads the current candidate revision and current catalog.
- Promotion converts a valid candidate policy to `ApprovedEvidencePolicy` only after strict validation.
- Invalid promotion creates no approved object, leaves the candidate and diagnosis unchanged, and records no misleading approval event.

- [ ] **Step 1: Write failing promotion tests.** Cover stale draft validation, unknown IDs, duplicate IDs, deprecated IDs, undecided policy, explicit none-required rationale, and successful current-policy conversion.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm test -- --run test/knowledge-evolution-service.test.ts test/knowledge-evolution-repositories.test.ts`

Expected: FAIL because approval currently trusts the shared candidate/object policy shape.

- [ ] **Step 3: Implement current-state promotion validation.** Load the candidate by expected version, validate the operator-edited policy against `findEvidenceRequirement`, block deprecated IDs for new promotions, and produce stable issue codes/messages.

- [ ] **Step 4: Persist audit metadata for approved policy fields and derived/operator-added origins.** Keep the repository compensation behavior intact for failures after object promotion.

- [ ] **Step 5: Run focused tests and commit.**

Run: `npm test -- --run test/knowledge-evolution-service.test.ts test/knowledge-evolution-repositories.test.ts`

Expected: PASS.

Commit: `git add src/knowledge-evolution/service.ts src/knowledge-evolution/knowledge-object-repository.ts src/knowledge-evolution/knowledge-audit-repository.ts test/knowledge-evolution-service.test.ts test/knowledge-evolution-repositories.test.ts && git commit -m "fix: revalidate knowledge promotion policies"`

### Task 6: Preserve diagnostic ambiguity through escalation policy

**Files:**
- Modify: `src/policy.ts`
- Modify: `src/triage-service.ts`
- Test: `test/policy.test.ts`
- Test: `test/triage-service.test.ts`
- Test: `test/approval-desk-recommendation.test.ts`

**Interfaces:**
- Trusted structured recommendation state adds `diagnostic-ambiguity` when `supportState === "escalated"`.
- Escalation reasons are deduplicated and emitted in stable order.
- Submission persists `escalationRequired: true` and retains the ambiguity reason alongside independent SLA or risk reasons.

- [ ] **Step 1: Write failing policy and submission tests.** Assert ambiguity survives with no other escalation signal and remains present when SLA or missing-information reasons are added.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm test -- --run test/policy.test.ts test/triage-service.test.ts test/approval-desk-recommendation.test.ts`

Expected: FAIL because `evaluateEscalation` currently preserves `policy-conflict` but not `diagnostic-ambiguity`.

- [ ] **Step 3: Implement deterministic reason merging.** Add the trusted state reason, deduplicate with a `Set`, and sort using one stable ordering function without changing unrelated escalation semantics.

- [ ] **Step 4: Run focused tests and commit.**

Run: `npm test -- --run test/policy.test.ts test/triage-service.test.ts test/approval-desk-recommendation.test.ts`

Expected: PASS.

Commit: `git add src/policy.ts src/triage-service.ts test/policy.test.ts test/triage-service.test.ts test/approval-desk-recommendation.test.ts && git commit -m "fix: preserve diagnostic ambiguity escalation"`

### Task 7: Add end-to-end knowledge-object reuse coverage

**Files:**
- Create: `test/knowledge-evolution-reuse.test.ts`
- Modify: `src/approval-desk/evidence-readiness.ts`
- Modify: `src/approval-desk/known-cause-catalog.ts`
- Modify: `src/knowledge-evolution/service.ts`
- Test: `test/knowledge-evolution-service.test.ts`

**Interfaces:**
- Later evaluation resolves approved policy directly through the shared catalog.
- A matching ticket without required evidence remains outside the known-cause workflow and reports the missing requirement.
- After the required evidence is provided, reevaluation selects the approved known cause without an unknown-ID exception.

- [ ] **Step 1: Write the positive end-to-end test.** Record a diagnosis with a real catalog reference, discover a candidate, edit/approve a `required` policy, evaluate a later matching ticket without that evidence, then provide it and reevaluate. Assert the support state and approved known-cause ID at both checkpoints.

- [ ] **Step 2: Write the negative end-to-end test.** Record a valid diagnosis with readable evidence but no reusable references, discover an `undecided` candidate, assert draft blocking issues, reject promotion, and assert the original diagnosis remains unchanged.

- [ ] **Step 3: Add migration and deprecation tests.** Load a legacy diagnosis without references, preserve its labels, confirm it cannot silently create a reusable policy, and confirm an existing approved deprecated policy remains readable while new promotion is blocked.

- [ ] **Step 4: Run the integration tests and fix only shared-domain issues exposed by them.**

Run: `npm test -- --run test/knowledge-evolution-reuse.test.ts test/knowledge-evolution-service.test.ts test/evidence-readiness.test.ts`

Expected: PASS with no `Evidence requirement <id> is not registered` error.

- [ ] **Step 5: Commit the end-to-end regression coverage.**

Commit: `git add test/knowledge-evolution-reuse.test.ts src/approval-desk/evidence-readiness.ts src/approval-desk/known-cause-catalog.ts src/knowledge-evolution/service.ts test/knowledge-evolution-service.test.ts && git commit -m "test: cover governed knowledge reuse"`

### Task 8: Update documentation and verify the complete slice

**Files:**
- Modify: `README.md`
- Modify: `docs/knowledge-evolution.md`
- Modify: `docs/diagnostic-evaluation-harness.md`
- Test: all existing test files

- [ ] **Step 1: Document the distinction between observed diagnosis evidence, candidate policy, and approved policy.** Include the `undecided` draft state, deprecated-ID behavior, and the positive/negative reuse paths.

- [ ] **Step 2: Run type checking, build, full tests, and the controlled evaluation.**

Run:

```powershell
npm run build
npm run typecheck
npm test
npm run evaluate:ai-diagnosis
```

Expected: build and typecheck pass, all tests pass, and the controlled diagnosis evaluation reports 24 candidates, 6 deterministic skips, and 0 provider fallbacks.

- [ ] **Step 3: Run `git diff --check` and inspect the final status.** Confirm generated reports remain ignored and no unrelated dirty files were staged.

- [ ] **Step 4: Commit documentation and verification updates.**

Commit: `git add README.md docs/knowledge-evolution.md docs/diagnostic-evaluation-harness.md && git commit -m "docs: explain governed knowledge evidence"`
