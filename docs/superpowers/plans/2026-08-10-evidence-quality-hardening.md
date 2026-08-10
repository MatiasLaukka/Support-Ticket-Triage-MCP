# Evidence-Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the deterministic knowledge holdout with the real evidence policy and fix only proven shared evidence-matching gaps, improving evidence metrics without weakening lifecycle gates.

**Architecture:** The existing `analyzeEvidenceReadiness` implementation remains authoritative. Holdout fixtures will carry policy-backed evidence expectations, while the scorer continues to consume production readiness output and keeps expected values oracle-only. Cross-surface tests will compare the same ticket/conversation inputs through the evaluator path used by MCP and Approval Desk.

**Tech Stack:** TypeScript, Node.js, Vitest, Zod domain schemas, deterministic evidence catalog, existing holdout evaluator/report, SQLite-backed isolated fixtures.

## Global Constraints

- Missing required evidence keeps ordinary tickets evidence-gated.
- A known cause can waive or narrow evidence only when its approved policy explicitly allows that behavior.
- GPT advice cannot add, remove, or satisfy required evidence without deterministic validation.
- Evidence supplied in complete conversation snapshots is recognized through the same aliases and IDs in every evaluation surface.
- Cross-surface parity means identical evidence facts and gating semantics; surface-specific lifecycle projection is allowed. Direct readiness may report `needs-information`, while recommendation surfaces may report `information-received` after partial recognized evidence. `missingEvidence` remains the diagnosis/fix gate everywhere.
- Expected outcomes and policy labels are scoring-only; they never enter production classification, diagnosis, drafting, or lifecycle decisions.
- Do not add semantic search, embeddings, prompt tuning, live-provider calls, or new promotion states in this slice.
- Preserve zero-denominator `null` rates and zero count totals in holdout scorecards.

---

### Task 1: Encode and audit policy-backed holdout evidence expectations

**Files:**
- Modify: `src/knowledge-evolution/holdout-fixtures.ts`
- Modify: `test/knowledge-holdout-evaluation.test.ts`
- Create: `test/knowledge-holdout-evidence-policy.test.ts`

**Interfaces:**
- Consumes: `knowledgeHoldoutFixtures()`, `EvidenceRequirementId`, and the existing `HoldoutLaneResult` evidence fields.
- Produces: a fixture-level `evidencePolicy` value with immutable `requiredIds`, a stable `reasonCode`, a traceable `policySource`, and a non-customer-facing `rationale`, plus a test matrix proving each expectation is registered in `EVIDENCE_CATALOG`.

- [ ] **Step 1: Write the failing policy audit test.** Add a matrix that expects these policy-backed required IDs:

```ts
const expectedEvidence = {
  "sufficient-evidence-true-positive": ["request-id"],
  "missing-evidence-then-supplied": ["request-id"],
  "near-miss": [],
  "unrelated": [
    "invoice-number", "billing-account", "plan-or-promotion",
    "failure-timestamp", "error-banner",
  ],
  "stale-version": [
    "endpoint-url", "request-id", "api-response-status",
    "sample-payload", "failure-timestamp",
  ],
  "contradicted-version": [
    "endpoint-url", "request-id", "api-response-status",
    "sample-payload", "failure-timestamp",
  ],
  "draft-version-isolation": ["request-id"],
  "replacement-and-draft-isolation": ["request-id"],
} as const;
```

Assert that every ID resolves through `findEvidenceRequirement`, every fixture
has a non-empty rationale, and `fixture.expectedEvidenceIds` equals its
policy-backed IDs. Run:

```powershell
npm test -- --run test/knowledge-holdout-evidence-policy.test.ts
```

Expected: FAIL because the current near-miss, unrelated, stale, and
contradicted expectations do not match this policy matrix.

- [ ] **Step 2: Add immutable fixture policy metadata.** Extend
`KnowledgeHoldoutFixture` with:

```ts
evidencePolicy: {
  requiredIds: readonly EvidenceRequirementId[];
  reasonCode: "approved-known-cause-required" | "ordinary-knowledge-article" | "successful-near-miss-no-failure" | "billing-knowledge-article";
  policySource:
    | { kind: "approved-known-cause"; objectId: string; version: number }
    | { kind: "knowledge-article"; articleId: string }
    | { kind: "successful-near-miss" };
  rationale: string;
};
```

Use the matrix above, the reason codes shown in the type, a source matching the
fixture's approved known cause, selected knowledge article, or near-miss policy,
and concise rationales
such as “successful near miss has no failure evidence requirement,” “billing
article requires its catalogued invoice fields,” and “ordinary API fallback
applies when unhealthy knowledge is excluded.” Keep `expectedEvidenceIds` as a
compatibility alias derived from `evidencePolicy.requiredIds`, rather than
maintaining two independent lists.

- [ ] **Step 3: Make the holdout tests consume the policy metadata.** Update
`test/knowledge-holdout-evaluation.test.ts` to assert the scorer’s necessary
evidence accounting uses `fixture.evidencePolicy.requiredIds`, and assert that
the rationale is never passed to `evaluateTicketWithAi`. Assert that each
policy source is traceable to the fixture's known cause, article, or near-miss
policy rather than merely being a registered evidence ID.

- [ ] **Step 4: Run the focused audit and holdout tests.**

```powershell
npm test -- --run test/knowledge-holdout-evidence-policy.test.ts test/knowledge-holdout-evaluation.test.ts
```

Expected: PASS with the eight fixtures aligned to the registered policy.

- [ ] **Step 5: Commit.**

```powershell
git add src/knowledge-evolution/holdout-fixtures.ts test/knowledge-holdout-evidence-policy.test.ts test/knowledge-holdout-evaluation.test.ts
git commit -m "test: align holdout evidence policy"
```

### Task 2: Prove shared evidence recognition and lifecycle gates

**Files:**
- Modify: `test/evidence-readiness.test.ts`
- Modify: `test/server-actions.test.ts`
- Modify: `test/approval-desk-http.test.ts`
- Modify: `test/knowledge-holdout-evaluation.test.ts`
- Modify: `src/approval-desk/evidence-readiness.ts` only if a new RED regression identifies a real matcher defect

**Interfaces:**
- Consumes: `analyzeEvidenceReadiness`, `evaluateTicketWithAi`, `listReusableApproved`, the MCP `evaluate_ticket` tool, and the Approval Desk HTTP evaluation route.
- Produces: regression coverage showing equivalent provided/required/missing evidence IDs and known-cause gating semantics across surfaces. Surface state may differ intentionally: direct readiness reports `needs-information`, while MCP/Approval Desk recommendations may project `information-received` after partial recognized evidence. Remaining `missingEvidence` is authoritative for diagnosis/fix gating.

- [ ] **Step 1: Add RED parity cases.** Cover these exact inputs through the
direct readiness function, MCP `evaluate_ticket`, and Approval Desk HTTP
evaluation route:
  - a complete customer reply containing `Request ID: req_holdout_001`, which must provide `request-id`;
  - TKT-1004-style wording containing “audit source shown is IP 198.51.100.24” and “affected scope appears to be 12 profiles,” which must provide `audit-source` and `affected-scope`;
  - an ordinary API ticket with only `request-id`: direct readiness remains `needs-information`; MCP and Approval Desk may report `information-received`, but all surfaces must expose the same remaining missing IDs and keep diagnosis/fix blocked;
  - a reusable approved object whose policy requires only `request-id`, which may reach `known-cause` once that ID is present;
  - the same approved object with no request ID, which must remain evidence-gated.

Assert exact ID sets as order-independent sets and surface-appropriate `supportState`; do not assert customer wording or draft prose.

Also attempt the diagnosis/fix action at the action/service boundary for the
partial-evidence case and assert that it is rejected or unavailable while
`missingEvidence.length > 0`.

- [ ] **Step 2: Run the RED cases.**

```powershell
npm test -- --run test/evidence-readiness.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/knowledge-holdout-evaluation.test.ts
```

Expected: the existing TKT-1004 cases remain green; any failure must identify
one concrete shared matcher or lifecycle-policy defect rather than a fixture
label mismatch.

- [ ] **Step 3: Implement only a proven matcher fix.** If a new case is RED,
change the smallest relevant branch in `isEvidenceProvided` or its focused
helper. Preserve unknown/negated wording behavior, deprecated evidence IDs,
and the `missingEvidence.length > 0` lifecycle gate. Do not add a second
matcher in MCP, HTTP, or holdout code.

- [ ] **Step 4: Run the focused evidence suite and verify both surfaces.**

```powershell
npm test -- --run test/evidence-readiness.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/knowledge-holdout-evaluation.test.ts
```

Expected: all cases pass, with no evidence-gate bypass or known-cause version
drift.

- [ ] **Step 5: Commit.**

```powershell
git add test/evidence-readiness.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/knowledge-holdout-evaluation.test.ts src/approval-desk/evidence-readiness.ts
git commit -m "test: verify shared evidence lifecycle gates"
```

### Task 3: Refresh the holdout report and documentation from corrected policy

**Files:**
- Modify: `scripts/evaluate-knowledge-holdout.ts`
- Modify: `src/knowledge-evolution/holdout-report.ts`
- Modify: `test/demo-knowledge-holdout.test.ts`
- Modify: `README.md`
- Modify: `docs/knowledge-evolution.md`
- Modify: `docs/demo-results.md`
- Regenerate: `reports/knowledge-holdout/controlled-latest.json`
- Regenerate: `reports/knowledge-holdout/controlled-latest.md`

**Interfaces:**
- Consumes: corrected immutable `evidencePolicy` metadata and scorecard output from Tasks 1–2.
- Produces: sanitized reports that expose policy-backed evidence IDs and stable reason codes without customer bodies, prompts, drafts, free-form rationales, or internal traces.

- [ ] **Step 1: Add a failing report-contract assertion.** Extend
`test/demo-knowledge-holdout.test.ts` to assert each report case includes the
policy-required evidence IDs and that the report does not contain customer
reply bodies or the policy rationale text if it contains sensitive wording.

- [ ] **Step 2: Map only sanitized policy fields.** Add an allowlisted
`evidencePolicy` object containing `requiredIds` and one of the four stable
reason codes from Task 1 (not free-form ticket text). Preserve all existing
lane, delta, issue, provenance, and read-only fields.

- [ ] **Step 3: Regenerate and inspect the controlled report.** Run:

```powershell
npm run evaluate:knowledge-holdout
```

Confirm the report remains deterministic, exact-version precision/governance
metrics remain valid, and evidence precision/missing-rate changes are
explained by the policy matrix rather than hidden.

Preserve the metric checkpoint: retain the original report as the baseline,
record the post-policy/oracle-correction metrics before any matcher change,
and describe any later behavior delta separately. Do not call an oracle-only
change a production behavior improvement.

- [ ] **Step 4: Update documentation.** State the corrected evidence policy,
the distinction between legitimate catalogued requests and unnecessary
requests, and the fact that known-cause exceptions remain explicit and
evidence-gated when their policy requires evidence. Do not claim semantic
search, autonomous learning, or live GPT performance.

- [ ] **Step 5: Run the focused report tests.**

```powershell
npm test -- --run test/demo-knowledge-holdout.test.ts test/knowledge-holdout-evaluation.test.ts
```

- [ ] **Step 6: Commit.**

```powershell
git add scripts/evaluate-knowledge-holdout.ts src/knowledge-evolution/holdout-report.ts test/demo-knowledge-holdout.test.ts README.md docs/knowledge-evolution.md docs/demo-results.md reports/knowledge-holdout/controlled-latest.json reports/knowledge-holdout/controlled-latest.md
git commit -m "docs: publish evidence quality holdout results"
```

### Task 4: Run the complete refinement verification gate

**Files:**
- No source changes expected; inspect all files changed by Tasks 1–3.

**Interfaces:**
- Consumes: the complete evidence-quality hardening branch.
- Produces: verified branch ready for review and merge.

- [ ] **Step 1: Run static checks.**

```powershell
git diff --check
npm run build
npm run typecheck
```

- [ ] **Step 2: Run focused and full tests.**

```powershell
npm test -- --run test/evidence-readiness.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/knowledge-holdout-evidence-policy.test.ts test/knowledge-holdout-evaluation.test.ts test/demo-knowledge-holdout.test.ts
npm test -- --maxWorkers=1 --no-file-parallelism
```

- [ ] **Step 3: Run deterministic evaluations.**

```powershell
npm run evaluate:knowledge-holdout
npm run evaluate:diagnostics
npm run evaluate:lifecycle-replay
npm run verify:portfolio
```

- [ ] **Step 4: Review authority boundaries.** Confirm there is exactly one
evidence-readiness implementation, expected policy values never reach
production evaluation, no UI/MCP route reimplements evidence gates, and the
report contains no customer bodies or prompts.

- [ ] **Step 5: Commit any verification-only documentation correction as a
separate commit.** Do not amend implementation commits.
