# Task 3 report: authoritative Approval Desk mutation reconciliation

## Status

Complete. Approval Desk lifecycle-backed mutations now execute at most one governed POST per operator gesture, recheck descriptor availability before posting, and reconcile ticket detail, diagnoses, lifecycle, queue, guidance, conversation, and evidence from refreshed authoritative state instead of relying on local mutation success.

## Files changed

- `src/approval-desk/ui.ts`
- `test/approval-desk-ui.test.ts`

## TDD evidence

RED command:

```text
npx vitest run test/approval-desk-ui.test.ts --exclude ".worktrees/**"
```

Result before the implementation: 162 tests run; 7 intentional regressions failed. They exposed chained approve-plus-send behavior, missing blocked/completed descriptor guards, and diagnosis-review success/error paths that were not reconciling refreshed authoritative state.

GREEN command:

```text
npx vitest run test/approval-desk-ui.test.ts --exclude ".worktrees/**"
```

Result: 162 passed.

## Final verification

```text
npx vitest run test/approval-desk-ui.test.ts test/approval-desk-http.test.ts test/approval-desk-diagnostic-workflow.test.ts --exclude ".worktrees/**"
```

Result: 3 files passed; 266 tests passed.

```text
npm run typecheck
```

Result: `tsc -p tsconfig.json` completed successfully.

## Implementation notes

- Added a shared governed mutation helper that checks lifecycle descriptor availability, runs exactly one POST, and reconciles detail plus read-model panels from refreshed authoritative state.
- Split lifecycle-backed recommendation approval from response sending so `review-recommendation` settles before `send-customer-response` becomes the next explicit gesture.
- Removed the local `approve ? approved : diagnosis` diagnosis-review fallback on lifecycle-backed paths; refreshed lifecycle/detail state now drives the settled panel and action bar.
- Preserved legacy non-lifecycle Approval Desk behavior so older fixtures still keep their existing one-click semantics and local diagnosis/fix panel flows.

## Concerns

- Git reported LF-to-CRLF conversion warnings for the edited tracked files during diff inspection. No whitespace defect is expected, but `git diff --check` should remain the final gate before commit.

## 2026-08-27 follow-up fix round

- Preserved the in-progress mutation reconciliation work in `src/approval-desk/ui.ts` and `test/approval-desk-ui.test.ts` instead of resetting it.
- Fixed non-lifecycle diagnosis review reconciliation to derive the post-review panel from refreshed authoritative diagnosis state instead of dropping back to an empty normal phase.
- Preserved scoped-fix inline errors across refresh attempts by keeping the scoped-fix presentation active when a governed fix mutation fails.
- Re-rendered the customer-reply focus immediately after a replacement evaluation consumes the latest reply, so the action bar reflects the refreshed consumed watermark without waiting for another event.
- Updated stale UI assertions to match the authoritative-refresh contract and the unchanged legacy non-lifecycle counts.

Follow-up verification:

```text
npx vitest run test/approval-desk-ui.test.ts --exclude ".worktrees/**"
```

Result: 180 passed.

```text
npx vitest run test/approval-desk-ui.test.ts test/approval-desk-http.test.ts test/approval-desk-diagnostic-workflow.test.ts --exclude ".worktrees/**"
```

Result: 3 files passed; 284 tests passed.

```text
npm run typecheck
git diff --check
```

Result: `tsc -p tsconfig.json` completed successfully; `git diff --check` reported only LF/CRLF conversion warnings and no whitespace errors.

## 2026-08-27 scoped re-review fixes

- Evaluation reconciliation now reloads the queue read model after the canonical selected-ticket, diagnosis, guidance, conversation, and evidence refresh.
- Blocked evaluation now reports `lifecycleActionReason('evaluate-ticket')`, even when another action is the lifecycle primary action.
- Added focused regressions covering both behaviors; no request-token, idempotency, single-flight, or existing guard behavior changed.

Verification:

```text
npx vitest run test/approval-desk-ui.test.ts --exclude ".worktrees/**"
```

Result: 1 file passed; 182 tests passed.

```text
npx vitest run test/approval-desk-ui.test.ts test/approval-desk-http.test.ts test/approval-desk-diagnostic-workflow.test.ts --exclude ".worktrees/**"
```

Result: 3 files passed; 286 tests passed.

```text
npm run typecheck
git diff --check
```

Result: typecheck passed; diff check reported only the repository's LF/CRLF conversion warnings and no whitespace errors.
