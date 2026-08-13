# Task 3 report: independent learning demo reset

## Status

Implemented and verified on branch `codex/demo-state-reset` in the isolated
`demo-state-reset` worktree. Work stopped after Task 3 as required.

## RED

Command:

```text
npx vitest run test/demo-reset.test.ts
```

Observed result before production implementation:

```text
Test Files 1 failed (1)
Tests 6 failed | 15 passed (21)

TypeError: resetLearningDemoState is not a function
TypeError: prepareLearningDemoReset is not a function
```

The six new regressions failed for the expected missing-feature reason while
the existing operational reset tests remained green.

## Implementation summary

- Added the requested asynchronous `prepareLearningDemoReset()` and
  `resetLearningDemoState()` APIs with `verify()`, `commit()`, and `rollback()`
  phases.
- Acquires the existing atomic exclusive reset lease before inspecting or
  preparing mutable learning state and holds it through final verification,
  backup cleanup, or rollback. A real runtime shared lease refuses reset before
  any learning resource is touched.
- Builds a fresh sibling `learning.sqlite` using `SqliteLearningLedger` and
  `SqliteKnowledgeEvolutionStore`, then verifies empty events, candidates,
  approved objects/versions, heads, and audits through their public APIs.
- Treats learning reset as one multi-resource replacement: the ledger database,
  its journal/WAL/SHM sidecars, the active file-backed diagnoses repository, and
  only the whitelisted legacy `candidates`, `approved`, and `audit` directories.
- Builds and verifies empty replacement directories before changing live state.
  Each destructive target is canonicalized and containment-checked during path
  resolution and immediately before rename/removal, protecting against linked
  path escapes and post-prepare path swaps.
- Explicitly excludes `data/knowledge`, including when external ledger opt-in
  is supplied, and regression-tests that the static article remains byte-for-
  byte unchanged.
- Uses backup-and-swap installation with final-path public-API verification.
  Failure removes any installed replacements, restores every moved live member,
  preserves incomplete recovery backups, and reports only sanitized basenames.
- Preserves the full dirty operational workflow snapshot across both successful
  learning reset and forced learning replacement failure.

## GREEN and verification

Required focused pair:

```text
npx vitest run test/demo-reset.test.ts test/runtime.test.ts
Test Files 2 passed (2)
Tests 40 passed (40)
exit code 0
```

Build and typecheck both completed with exit code 0.

Fresh full regression suite:

```text
npm test
Test Files 86 passed (86)
Tests 1513 passed (1513)
exit code 0
```

`git diff --check` completed without errors; Git emitted only the repository's
expected LF-to-CRLF working-copy notices.

## Self-review

- Learning reset changes no operational database path or workflow record.
- Operational reset behavior and import/native safeguards are unchanged.
- Static knowledge is neither recursively removed nor accepted as the ledger.
- Missing and populated mutable directories converge on the same empty baseline,
  and a second reset produces an identical state.
- Default and custom-named operational SQLite databases are refused as ledger
  targets before lease acquisition, including with external-ledger opt-in.
- Prepared learning reset commit is single-flight: the state transitions to
  `committing` before the first await and competing verify/commit/rollback calls
  are rejected.
- Public verification likewise transitions synchronously to `verifying`; tests
  prove concurrent commit and rollback are refused until verification finishes.
- Operational-schema inspection occurs only after the exclusive reset lease is
  acquired and before any prepared learning resources are created.
- A sidecar backup failure after the main database has moved restores the exact
  prior database, sidecars, directories, and operational snapshot.
- The live database is not opened until commit; prepare and verify operate only
  on the sibling temporary database and temporary directories.
- Sidecars participate in backup/rollback and are absent beside the verified
  replacement.
- The pre-existing untracked approved-plan file was not modified or staged.

## Review gate

The independent staged-diff review initially found operational-ledger aliasing,
async prepared-operation re-entrancy, and insufficient partial rollback coverage.
Those findings were fixed with dedicated RED-to-GREEN regressions. Final
re-review found no Critical, Important, or Minor blockers and returned
`Ready to commit Task 3` after a fresh 40-test focused run.

## Files

- `src/demo-reset.ts`
- `test/demo-reset.test.ts`
- `.superpowers/sdd/2026-08-13-demo-state-reset/task-3-report.md`
