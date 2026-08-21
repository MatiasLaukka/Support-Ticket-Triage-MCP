# Operational Lifecycle Presentation Contract Implementation Plan

**Status:** Approved for implementation
**Design:** `docs/superpowers/specs/2026-08-21-operational-lifecycle-presentation-contract-design.md`
**Branch:** `codex/operational-lifecycle-presentation-contract`

## Objective

Deliver one deterministic backend lifecycle projection for the Approval Desk and other workflow consumers, derived from committed operational facts and returned after every lifecycle-changing mutation. Preserve the existing domain workflow, evidence gates, stale protections, learning separation, and compatibility surfaces except for the explicitly approved cleanup that makes knowledge-pattern review secondary.

The slice also adds two narrowly scoped append-only recovery operations:

- `invalidate-diagnosis`;
- `record-fix-ineffective`.

Development/demo injectors may exercise real commands, but must never become frontend-only state or production actions.

## Non-negotiable constraints

- No independently persisted lifecycle state machine.
- Operational event causal order remains authoritative.
- Historical diagnoses, reviews, fixes, and verification attempts remain immutable.
- `operatorGuidance` remains schema-compatible; actionable knowledge candidates no longer preempt ordinary ticket work unless a genuine safety rule requires it.
- Diagnostic ambiguity is represented by the existing `DiagnosticStateSnapshot`; the literal `MAX_DIAGNOSTIC_ATTEMPTS = 2` is replaceable policy, not lifecycle schema.
- Expensive evaluation/provider work remains outside synchronous SQLite write transactions.
- Operational and legacy reads use one lifecycle builder.
- Mutations revalidate state transactionally, are idempotent, and return a refreshed lifecycle projection.
- Debug/demo controls are unavailable outside explicit development/demo configuration and call real domain commands.
- Do not implement Knowledge Object or Playbook evolution, semantic retrieval, information-gain scoring, or distributed evaluation.

## Task 0 — Pre-flight and contract inventory

1. Verify the current branch, worktree, and existing design commit.
2. Read this plan and the approved design once before editing production code.
3. Inventory existing command routes, operational event actions, `OperationalWorkflowSnapshot`, `operatorGuidance`, diagnostic snapshots, knowledge-pattern gates, and UI state helpers.
4. Confirm the existing `fix-available` representation can distinguish internal availability from scoped application using an explicit persisted operation stage/fact. If it cannot, stop and report that contradiction before introducing a new event vocabulary.
5. Create/update the implementation ledger used by the execution workflow.

**Gate:** no production change until the inventory and the fix-stage representation are documented in the task notes.

## Task 1 — Lifecycle schemas and deterministic builder (RED → GREEN)

Add strict schemas/types for `LifecycleView`, `LifecyclePhase`, `LifecycleAction`, and the structured dimensions:

- diagnostic investigation and hypotheses;
- diagnosis authority;
- evidence and confirmation;
- fix state and diagnosis-authority relationship;
- response intent/state;
- orthogonal knowledge state.

Implement `buildTicketLifecycleView(...)` as a pure builder over a normalized workflow snapshot. It must:

- derive state from causal operational facts;
- keep phase granularity modest;
- expose reason codes and stable references;
- distinguish likely approval from confirmed fix eligibility;
- distinguish fix available, scoped fix ready, applied, verification pending, verified, and ineffective;
- represent ineffective fix with diagnosis still authoritative;
- represent invalidated diagnosis as non-authoritative;
- return `resolved` while preserving the existing domain `closed` compatibility terminology.

Write schema and mapping tests first. Add transitions for initial evaluation, recommendation review, waiting customer, diagnosis-ready/review, confirmation, awaiting-fix, fix-ready, verification, ready-for-close, escalation, and resolved.

**Review gate:** specification compliance and pure-builder quality/regression review. Resolve all findings before Task 2.

## Task 2 — Operational and legacy read parity (RED → GREEN)

1. Adapt `buildTicketWorkflowReadModelFromSnapshot` to return both `operatorGuidance` and `lifecycle`.
2. Adapt the file-backed compatibility path to normalize into the same builder input.
3. Do not duplicate phase/action logic in either adapter.
4. Preserve immutable diagnostic journey/provenance references.

Add parity tests for all lifecycle fixtures, including ambiguous investigation, stale/rejected/invalidated diagnosis, multiple fix attempts, and orthogonal knowledge candidates.

**Review gate:** specification compliance and read-model regression review.

## Task 3 — Mutation envelopes and replay (RED → GREEN)

Update lifecycle-changing HTTP/MCP/service responses to return:

```ts
{
  ...committedResult,
  operatorGuidance,
  lifecycle
}
```

Cover evaluation, customer replies, recommendation review/approval, response sending, diagnosis recording/review/revalidation/rejection, fix availability, scoped-fix application, ineffective-fix recording, invalidation, and resolution.

The refreshed projection must be read after commit. Idempotent replay must return equivalent persisted references and lifecycle state. Stale commands remain rejected through existing revision/watermark protections.

**Review gate:** envelope shape, transaction boundaries, replay determinism, and stale-state review.

## Task 4 — Recovery operations (RED → GREEN)

### 4A — `record-fix-ineffective`

Add a narrow command with diagnosis/fix references, expected revision/watermark, actor, rationale, and verification evidence. It must:

- append an auditable operational event;
- leave the diagnosis authoritative unless a separate invalidation occurs;
- support multiple historical fix attempts;
- be stale-checked and idempotent;
- return the refreshed lifecycle projection.

### 4B — `invalidate-diagnosis`

Add a narrow command with diagnosis reference, reason code, expected revision/watermark, actor, and rationale. It must:

- append an auditable invalidation event;
- prevent the diagnosis from authorizing fix, closure, or reuse;
- preserve the original diagnosis and reviews;
- allow a new evaluation/diagnostic investigation;
- be stale-checked and idempotent;
- return the refreshed lifecycle projection.

Add regressions for explicit invalidation, ineffective fix without invalidation, ineffective fix with invalidation, new diagnosis after invalidation, contradictory evidence, and historical audit preservation.

**Review gate:** domain semantics, atomicity, causal sequencing, replay, and learning separation.

## Task 5 — Diagnostic policy decoupling (RED → GREEN)

Keep the current bounded default if necessary, but make lifecycle projection and tests independent of the literal value `2`. Ensure configured policy exhaustion escalates, contradiction escalates immediately, and useful ambiguity can persist for multiple rounds when policy allows it. The frontend must never decide whether more evidence is useful.

Add generic repeated-clarification tests; retain existing policy tests as policy tests rather than lifecycle-contract tests.

**Review gate:** ensure no accidental weakening of escalation or evidence governance.

## Task 6 — Orthogonal knowledge guidance (RED → GREEN)

Adjust guidance generation so an actionable pattern candidate is exposed as secondary knowledge state/action while the source ticket retains its lifecycle primary action. Preserve compatibility enum values and metadata for older consumers. Update Approval Desk consumers to use `lifecycle` as the authoritative workflow projection.

Add tests for actionable and non-actionable candidates, fix-ready source tickets, and no interruption of ordinary ticket work.

**Review gate:** verify no knowledge promotion or learning writes were introduced.

## Task 7 — Development/demo transition injectors (RED → GREEN)

Add explicitly gated demo/development routes or fixture helpers for:

- internal confirmation;
- fix availability/application;
- verification success/failure;
- contradictory evidence;
- diagnosis invalidation;
- customer reply/evidence injection where needed.

Each injector must call a real command, commit real operational events, and return the same lifecycle envelope. Add tests proving injectors are unavailable outside the allowed configuration and cannot mutate browser state directly.

**Review gate:** route isolation, production safety, real-command execution, and lifecycle parity.

## Task 8 — Approval Desk migration (RED → GREEN)

Migrate authoritative workflow decisions to `lifecycle`:

- active panel from `lifecycle.phase`;
- primary/secondary actions from lifecycle descriptors;
- disabled reasons from backend reason codes;
- mutation responses replace the authoritative lifecycle object directly;
- diagnosis, inspection, approved diagnosis, scoped fix, verification, and resolution panels remain presentation/navigation state only.

Remove or demote helpers that infer domain state from timestamps, local recommendation order, or panel state, including equivalents of `shouldShowFixAction`, `shouldShowDiagnoseAction`, `latestUnevaluatedWorkflowEvent`, `isDiagnosisApproved`, and queue workflow inference. Keep unsaved edits and visual navigation state.

Add UI regressions for action descriptors, stale command refresh, orthogonal knowledge, invalidation recovery, and debug controls.

**Review gate:** UI authority boundary, accessibility, and regression review.

## Task 9 — Whole-slice regression coverage

Ensure coverage for at least:

1. initial Evaluate;
2. recommendation review;
3. approval versus Send;
4. waiting for customer;
5. customer reply → Update;
6. insufficient evidence;
7. multiple plausible hypotheses;
8. targeted clarification;
9. clarification reply remains ambiguous;
10. repeated useful clarification;
11. ambiguity resolves to a reviewable diagnosis;
12. competing hypotheses do not unlock Diagnosis Review;
13. diagnosis recording;
14. diagnosis approval;
15. revalidation;
16. rejection;
17. stale diagnosis;
18. invalidated diagnosis;
19. likely approved diagnosis with missing confirmation;
20. confirmed approved diagnosis;
21. awaiting internal fix;
22. fix available;
23. scoped-fix application;
24. applied fix → Update;
25. verification draft;
26. approval → Send;
27. verification success → ready for Resolve;
28. verification failure → ineffective fix and diagnostic reopening;
29. newer contradictory evidence after fix;
30. newer evidence at ready-for-close;
31. superseding diagnosis with intact history;
32. escalation;
33. actionable knowledge candidate remains secondary;
34. no knowledge candidate causes no interruption;
35. operational/legacy parity;
36. mutation envelopes;
37. idempotent replay;
38. stale mutation rejection;
39. UI action descriptors instead of timestamp heuristics;
40. demo injectors and production disablement;
41. existing diagnosis/evidence/knowledge/security/governance suites.

Use TKT-1010 as an ambiguous-flow fixture, but keep behavior generic and domain-driven.

## Task 10 — Verification and handoff

1. Run the complete repository test/typecheck/build suite.
2. Run the full portfolio/evaluation suites required by the repository.
3. Perform a broad whole-branch review focused on lifecycle authority, event causality, replay, stale safety, UI inference removal, and scope boundaries.
4. Resolve load-bearing findings and re-run the affected reviews/tests.
5. Use verification-before-completion before claiming success.
6. Commit by task, preserve the design/plan commits separately from implementation commits, and report the final branch, commits, tests, compatibility seams, and deferred work.
