# Final whole-branch review: demo state reset

## Fix implementation addendum — 2026-08-13

The Important destructive-target isolation finding below has been addressed and
is ready for independent re-review. The original review is retained below as
the discovery record.

- Independent operational reset now refuses a detected learning-ledger or
  knowledge-evolution SQLite schema before lease acquisition or preparation.
- The combined API compares canonical operational and learning live,
  temporary, backup, journal, WAL, and SHM target families and refuses equality
  or path overlap before either side is prepared.
- The CLI applies the same configured/default cross-target preflight for every
  mode, while retaining the operational-only blank-learning-variable behavior.
- Regression coverage proves a populated learning ledger remains unchanged,
  including with the external-path opt-in; covers equality, sidecar,
  temporary, backup, and parent overlap; and keeps distinct contained custom
  database paths plus an external read-only seed valid.

Fresh implementation verification:

```text
npm run build
exit code 0

npm run typecheck
exit code 0

npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/demo-reset-docs.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts --reporter=dot
Test Files 5 passed (5)
Tests 70 passed (70)

npm test -- --reporter=dot
Test Files 88 passed (88)
Tests 1542 passed (1542)
exit code 0

npm run verify:portfolio
exit code 0
```

The original verdict below predates this fix and must be superseded only by a
fresh independent whole-branch review.

## Verdict

**CHANGES REQUIRED**

One Important destructive-target isolation defect remains. No Critical findings
were identified. The branch's focused, full, and portfolio verification gates
are green, but the defect is not covered by the current tests.

## Important finding

### Operational reset can overwrite the configured learning ledger

`prepareOperationalDemoReset()` delegates path acceptance to
`resolveResetPaths()`, which checks canonical data-root containment but does not
reject a learning-ledger SQLite schema or prevent `operationalDatabase` from
aliasing the configured/default learning ledger. This is asymmetric with
`prepareLearningDemoReset()`, which explicitly rejects operational schemas.

Because reset is intentionally destructive, a configuration such as:

```text
OPERATIONAL_DB_PATH=<TRIAGE_DATA_ROOT>/knowledge-evolution/learning.sqlite
```

passes containment and `npm run reset:operational-demo` replaces the learning
ledger with a native operational database. I reproduced this from the compiled
branch: a freshly initialized `SqliteLearningLedger` / knowledge-evolution
database was accepted as `operationalDatabase`; the command returned a
30-ticket success summary; afterward its learning tables had been replaced by
the operational schema.

This violates the approved isolation contract that operational reset must not
modify learning state, and it makes a path typo capable of erasing accumulated
learning while reporting success.

Required fix:

- Refuse a detected learning-ledger / knowledge-evolution SQLite schema as an
  operational reset target before lease acquisition or preparation.
- In the CLI and combined API, reject canonical equality or overlap between the
  operational database set and learning ledger database set, including
  temporary, backup, and SQLite sidecar paths.
- Add regression coverage for the independent operational command and combined
  reset. Assert refusal leaves the learning ledger and all other state
  unchanged, including with the external-path opt-in.

Relevant production location: `src/demo-reset.ts`, especially
`prepareOperationalDemoReset()` and `resolveResetPaths()` (lines 144-150 and
1163-1188 at `fca7e7d`).

## Verified strengths

- Operational reset rebuilds a fresh native database from the complete,
  nonempty, duplicate-free seed and verifies exact tickets by ID plus zero
  derived operational rows; it does not issue live table-by-table deletes.
- Independent learning reset rebuilds learning SQLite and only the four
  whitelisted mutable learning directories; static knowledge is preserved.
- Combined reset prepares both sides first, retains backups through final-path
  verification, and exercises cross-side rollback and retained sanitized
  recovery backups.
- Shared runtime and exclusive reset leases use one atomic gate; runtime lease
  acquisition precedes mutable SQLite/diagnosis opening, and close/startup
  failures still release the lease.
- SQLite journal/WAL/SHM members, canonical containment, linked-path refusal,
  invalid-seed safety, native/imported reset entry states, pristine timelines,
  Approval Desk startup, restart persistence, and CLI target/error behavior
  have direct regression coverage.
- Production import/cutover code and operational schema were not modified. The
  active runbooks use explicit guarded reset commands rather than legacy
  implicit-reset runners.

## Final reviewer questions

- Every canonical seed ticket recovered: **yes for a valid operational target**.
- Operational reset cannot erase learning state: **no; Important finding above**.
- Learning reset leaves operational state unchanged: **yes for the covered and
  reviewed valid-target paths**.
- Combined reset cleans both: **yes for distinct valid targets**.
- Invalid seed cannot destroy the current DB: **yes**.
- Reset-created ticket timelines are empty: **yes**.
- Import/cutover invariants preserved: **yes**.
- Approval Desk starts immediately after reset: **yes**.
- Restart persistence still works: **yes**.
- Static knowledge remains untouched: **yes**.
- Platform coverage: **Windows verification passed locally; Ubuntu is configured
  in GitHub Actions, but current local review cannot claim a fresh remote CI
  result**.

## Fresh verification evidence

From `codex/demo-state-reset` at `fca7e7d`:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/demo-reset-docs.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts --reporter=dot
Test Files 5 passed (5)
Tests 61 passed (61)
```

```text
npm test -- --reporter=dot
Test Files 88 passed (88)
Tests 1533 passed (1533)
exit code 0
```

```text
npm run verify:portfolio
exit code 0
```

`git diff --check 778f34c..fca7e7d` also completed without errors. The only
worktree item outside reviewed commits remains the pre-existing untracked
approved plan.
