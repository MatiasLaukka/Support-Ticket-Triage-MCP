# Task 2 report: reset runtime and Approval Desk baseline

## Status

Implemented and verified on branch `codex/demo-state-reset` in the isolated
`demo-state-reset` worktree. Work stopped after Task 2 as required.

## RED

Command:

```text
npx vitest run test/demo-reset.test.ts test/runtime.test.ts
```

Observed result after adding the Task 2 regressions and before changing runtime
shutdown:

```text
Test Files 1 failed | 1 passed (2)
Tests 1 failed | 24 passed (25)

FAIL test/runtime.test.ts
releases its usage lease when closing a runtime resource fails

Expected reset-lease acquisition not to throw, but received:
DemoStateLeaseError: Operational demo state is active; stop the runtime before resetting.
```

This was the expected behavior gap: `runtime.close()` stopped at the first
resource-close exception and never released the shared usage lease.

## Implementation summary

- Added reset-to-runtime integration coverage using the public
  `runtime.tickets.snapshot()` repository API. It proves every canonical seed
  ticket is available immediately after reset, including `TKT-1010`.
- Reads `TKT-1010` through the same workflow projection used by Approval Desk
  and verifies its pristine ticket, empty recommendation/conversation/
  diagnosis/Decision Timeline state, and initial `evaluate-ticket` operator
  guidance.
- Restarts the complete runtime and verifies the same pristine Approval Desk
  workflow survives restart unchanged.
- Preserved the existing Task 1 placement of shared lease acquisition before
  operational SQLite, learning SQLite, and mutable diagnosis construction, and
  added a direct race regression proving an exclusive reset lease prevents all
  three resources from being opened or created.
- Added startup-failure coverage proving a lease acquired before repository
  initialization is released when initialization later fails.
- Centralized runtime cleanup so operational SQLite close, learning SQLite
  close, and usage-lease release are all attempted independently. A close
  failure is still reported, but cannot skip the lease release; multiple
  cleanup failures are retained in an `AggregateError`.

## GREEN and verification

Focused Task 2 suite:

```text
npx vitest run test/demo-reset.test.ts test/runtime.test.ts
Test Files 2 passed (2)
Tests 27 passed (27)
exit code 0
```

Build:

```text
npm run build
exit code 0
```

Typecheck:

```text
npm run typecheck
exit code 0
```

Full regression suite:

```text
npm test
Test Files 86 passed (86)
Tests 1500 passed (1500)
exit code 0
```

`git diff --check` completed without errors (Git emitted only the repository's
expected LF-to-CRLF working-copy notices).

## Self-review

- Runtime lease acquisition remains before the first operational SQLite,
  learning SQLite, or diagnosis repository construction.
- Exclusive reset ownership rejects startup atomically before any target
  resource appears; startup works normally after the reset lease is released.
- Normal close, close-with-resource-error, and post-acquisition startup failure
  all attempt lease release.
- The Approval Desk regression uses public runtime repositories and the shared
  workflow read model; no test-only production shortcut was introduced.
- Reset tickets remain free of artificial initialization events and derived
  workflow state.
- No Task 3 learning reset behavior was implemented.

## Files

- `src/runtime.ts`
- `test/demo-reset.test.ts`
- `test/runtime.test.ts`
- `.superpowers/sdd/2026-08-13-demo-state-reset/task-2-report.md`
