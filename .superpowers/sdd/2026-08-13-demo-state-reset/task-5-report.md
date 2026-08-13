# Task 5 report: demo reset CLI and npm commands

## Status

Implemented and verified on branch `codex/demo-state-reset` in the isolated
`demo-state-reset` worktree. Work stopped before Task 6 as required.

## RED

Command:

```text
npx vitest run test/demo-reset-cli.test.ts --reporter=dot
```

Observed result before production implementation:

```text
Test Files 1 failed (1)
Tests no tests
Error: Cannot find module '../src/demo-reset-cli.js'
exit code 1
```

The CLI suite failed for the expected missing-entrypoint reason.

## Implementation summary

- Added a small asynchronous `mainDemoResetCli()` adapter and direct Node
  entrypoint. Reset business logic remains in `demo-reset.ts`.
- Requires exactly one explicit destructive target: `operational`, `learning`,
  or `all`. Missing, unknown, or multiple targets return a stable nonzero
  result; there is no implicit reset and no interactive prompt.
- Resolves the same runtime defaults for `TRIAGE_DATA_ROOT`,
  `TRIAGE_SEED_FILE`, `OPERATIONAL_DB_PATH`, and
  `TRIAGE_LEARNING_LEDGER_PATH` through the existing `environmentPath()`
  contract.
- Resolves only target-specific inputs. Learning-only reset does not read or
  validate the seed file and leaves operational SQLite byte-for-byte unchanged;
  operational-only reset leaves learning state unchanged.
- Maps only the exact value `ALLOW_DEMO_RESET_OUTSIDE_DATA_ROOT=true` to the
  existing operational and learning external-path opt-ins. Default behavior
  preserves canonical data-root containment checks.
- Dispatches `all` directly to the atomic `resetDemoState()` API rather than
  chaining independent commands.
- Prints the concise planned success messages. Known reset, usage-lease, and
  configuration failures preserve stable sanitized messages; unexpected errors
  collapse to `Demo state reset failed.` rather than leaking local details.
- Added the three exact npm commands from the approved plan. No README or Task 6
  documentation changes were included.

## Regression coverage

- Missing, invalid, and multiple CLI targets.
- Operational reset from `empty`, `native`, and `imported` state, with every
  result verified as the exact native seed baseline.
- External read-only seed remains byte-for-byte unchanged.
- Operational-only and learning-only target isolation.
- Runtime-default path resolution.
- Atomic combined reset and combined success output.
- Operational and learning external-path refusal plus the exact `true` escape
  hatch.
- Stable refusal while either a shared runtime lease or exclusive reset lease
  is active, with the operational database unchanged.

## GREEN and verification

CLI suite:

```text
npx vitest run test/demo-reset-cli.test.ts --reporter=dot
Test Files 1 passed (1)
Tests 13 passed (13)
exit code 0
```

Required explicit-path focused suite:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/runtime.test.ts --reporter=dot
Test Files 3 passed (3)
Tests 57 passed (57)
exit code 0
```

Dedicated rollback recovery suite:

```text
npx vitest run test/demo-reset-recovery.test.ts --reporter=dot
Test Files 1 passed (1)
Tests 2 passed (2)
exit code 0
```

Fresh complete repository verification:

```text
npm test -- --reporter=dot
Test Files 87 passed (87)
Tests 1531 passed (1531)
exit code 0
```

The full command includes fresh build and typecheck gates. The suite emitted
only the pre-existing expected stderr from the Approval Desk replacement-error
regression. `git diff --check` completed without errors.

## Independent review

The read-only Task 5 review found no Critical, Important, or Minor issues and
returned `Ready: yes`. It specifically confirmed exact target validation,
target-specific path resolution, atomic combined dispatch, strict external-path
opt-in, stable sanitized errors, exact package commands, and real filesystem /
SQLite regression coverage.

## Files

- `src/demo-reset-cli.ts`
- `package.json`
- `test/demo-reset-cli.test.ts`
- `.superpowers/sdd/2026-08-13-demo-state-reset/task-5-report.md`
