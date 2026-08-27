# Task 6 report: no-platform-fix diagnoses stay actionable

## Status

Complete. Confirmed customer-owned and support-owned diagnoses now stay on the
existing verification/evaluate path without fabricating a fix event, the seed
audit records canonical lifecycle descriptors for every ticket, and the
Approval Desk diagnosis panel explains the no-platform-fix path instead of
implying an internal platform confirmation.

## Files changed

- `src/approval-desk/all-ticket-lifecycle-audit.ts`
- `src/approval-desk/lifecycle.ts`
- `src/approval-desk/ui.ts`
- `src/approval-desk/workflow-guidance.ts`
- `test/all-ticket-lifecycle-audit.test.ts`
- `test/approval-desk-ui.test.ts`
- `test/lifecycle-view.test.ts`

## TDD evidence

RED command:

```text
npx vitest run test/lifecycle-view.test.ts test/all-ticket-lifecycle-audit.test.ts --exclude ".worktrees/**"
```

Result before the implementation: 3 intentional regressions failed. The
lifecycle projection still routed confirmed customer/support diagnoses to
`awaiting-fix`, and the seed audit did not yet expose canonical lifecycle
descriptor coverage.

GREEN command:

```text
npx vitest run test/lifecycle-view.test.ts test/all-ticket-lifecycle-audit.test.ts test/approval-desk-ui.test.ts --exclude ".worktrees/**"
```

Result: 3 files passed; 211 tests passed.

## Final verification

```text
npx vitest run test/lifecycle-view.test.ts test/all-ticket-lifecycle-audit.test.ts test/approval-desk-ui.test.ts --exclude ".worktrees/**"
```

Result: 3 files passed; 211 tests passed.

```text
npm run typecheck
```

Result: `tsc -p tsconfig.json` completed successfully.

```text
git diff --check
```

Result: completed successfully with LF-to-CRLF conversion warnings only; no
whitespace errors were reported.

## Implementation notes

- `buildTicketLifecycleView()` now treats confirmed non-engineering,
  non-integration diagnoses with no fix audit as `verification` plus
  `evaluate-ticket`, with `fix.state === "none"` and
  `no-platform-fix-required`.
- The verification action list no longer offers `record-fix-ineffective` for
  that no-platform-fix branch.
- `buildOperatorGuidance()` now preserves the diagnosis-authored next step for
  customer/support-owned confirmed diagnoses that need re-evaluation rather
  than a platform fix.
- The seed audit now records canonical lifecycle phase/action descriptors from
  `buildTicketLifecycleView()` and checks that every observation keeps a primary
  descriptor aligned with the primary action.
- The Approval Desk diagnosis panel reuses the diagnosis next-step text when
  the lifecycle explicitly says `no-platform-fix-required`, preventing a
  misleading platform-fix wait message.

## Concerns

- Git reports LF-to-CRLF conversion warnings for the edited tracked files in
  this worktree, but the verification commands completed cleanly and
  `git diff --check` reported no whitespace defects.
