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
