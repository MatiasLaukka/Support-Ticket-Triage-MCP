# Final whole-branch review: demo state reset

## Independent final re-review of `350d37b` — 2026-08-13

### Verdict

**APPROVED**

No actionable findings remain. The residual malformed-`schema_meta` gap is
fixed without broadening the guard beyond the two project-defined learning
schema signatures.

`isLearningDatabase()` now evaluates the complete `learning_events` +
`learning_deliveries` and `knowledge_candidates` + `knowledge_versions` table
pairs before querying the optional metadata marker. A malformed metadata table
therefore cannot suppress a recognized learning schema. The new real-SQLite
regressions prove both signatures are refused before reset mutation, preserve
the target byte-for-byte, and leave no reset artifacts. The operational control
proves that an otherwise legitimate native operational database with an
unrelated malformed `schema_meta` table remains resettable; malformed metadata
alone is not treated as a learning ledger.

The patch is confined to this ordering correction and its regressions. Review
of the surrounding guard confirms it still executes before lease acquisition
and preparation, including for the independent operational API and combined
reset path. The prior canonical target-family isolation, overlap, external-path,
rollback, runtime lease, CLI, documentation, and portfolio findings remain
resolved and covered by the fresh focused and full suites.

Fresh independent verification at `350d37b`:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/demo-reset-docs.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts --reporter=dot
Test Files 5 passed (5)
Tests 73 passed (73)

npm test -- --reporter=dot
Build: passed
Typecheck: passed
Test Files 88 passed (88)
Tests 1545 passed (1545)
exit code 0

npm run verify:portfolio
Test Files 88 passed (88)
Tests 1545 passed (1545)
Diagnostic evaluation: passed
Lifecycle replay: 11/11 scenarios passed
Knowledge holdout: 8/8 fixed cases passed
Knowledge evolution, operational persistence, and metrics demos: passed
exit code 0

git diff --check 778f34c..350d37b
exit code 0
```

The only worktree item outside the reviewed commits remains the pre-existing
untracked approved plan under `docs/superpowers/plans/`.

## Residual schema-guard fix addendum — 2026-08-13

**READY FOR INDEPENDENT RE-REVIEW**

The malformed-`schema_meta` destructive-target gap from the independent
re-review below is fixed. `isLearningDatabase()` now evaluates both recognized
table signatures before attempting the optional metadata-marker query, so a
metadata query error cannot suppress an already-detected learning-ledger or
knowledge-evolution schema.

Regression coverage uses real SQLite databases for both recognized pairs:

- `learning_events` + `learning_deliveries`;
- `knowledge_candidates` + `knowledge_versions`.

Each database also has a malformed `schema_meta (unrelated TEXT)` table. The
tests prove operational reset returns the existing stable learning-ledger
refusal, preserves the database byte-for-byte, and creates no reset artifacts.
A separate control proves that a legitimate operational database with the same
unrelated malformed metadata remains resettable, preserving the operational
contract rather than turning every metadata error into a rejection.

TDD evidence:

```text
npx vitest run test/demo-reset.test.ts --reporter=dot
Test Files 1 failed (1)
Tests 2 failed | 39 passed (41)
Both new signature cases failed because reset did not throw.

After the narrow ordering fix:
Test Files 1 passed (1)
Tests 41 passed (41)
```

Fresh final verification:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/demo-reset-docs.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts --reporter=dot
Test Files 5 passed (5)
Tests 73 passed (73)

npm test -- --reporter=dot
Test Files 88 passed (88)
Tests 1545 passed (1545)
exit code 0

npm run verify:portfolio
exit code 0
```

The `CHANGES REQUIRED` verdict immediately below records the pre-fix
independent re-review and is retained as evidence; this addendum supersedes its
single residual finding pending independent confirmation.

## Independent re-review of `aa6b497` — 2026-08-13

### Verdict

**CHANGES REQUIRED**

The original canonical-target isolation defect is fixed for initialized
learning ledgers and for the covered canonical equality, sidecar, reset
temporary, reset backup, and parent/child overlap cases. The external-path
opt-in does not bypass that initialized-ledger guard. Distinct contained custom
database paths and the external read-only seed behavior also remain green.

One Important destructive-target detection gap remains.

### Important: a marker-query error bypasses the knowledge-schema fallback

`isLearningDatabase()` gathers the table names, then queries `schema_meta`
before evaluating the learning/knowledge table signatures. The marker query and
the signature fallback share one outer `try`/`catch`. If a database contains a
`schema_meta` table whose columns do not match the expected `key`/`value`
shape, the query throws and the catch returns `false`; the function never
checks the already-discovered `knowledge_candidates` + `knowledge_versions` or
`learning_events` + `learning_deliveries` signatures.

I reproduced this against the built `aa6b497` branch with an in-root SQLite
database containing:

```sql
CREATE TABLE schema_meta (unrelated TEXT);
CREATE TABLE knowledge_candidates (id TEXT);
CREATE TABLE knowledge_versions (id TEXT);
```

`resetOperationalDemoState()` returned successfully and replaced those tables
with the operational schema. This remains destructive even without the
external-path opt-in and contradicts the fix's stated protection for a detected
knowledge-evolution table signature.

Required fix:

- Keep marker lookup failure from suppressing the independent table-signature
  checks (or otherwise fail safely once a recognized learning/knowledge
  signature is present).
- Add a regression with the conflicting/malformed `schema_meta` shape and a
  recognized knowledge-evolution or learning-ledger table pair. Assert refusal
  leaves the database unchanged and creates no reset artifacts.

### Fresh re-review evidence

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/demo-reset-docs.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts --reporter=dot
Test Files 5 passed (5)
Tests 70 passed (70)
```

```text
npm run build
exit code 0

Adversarial built-code probe
outcome: RESET_SUCCEEDED
post-reset schema: operational tables (the knowledge-evolution tables were replaced)
```

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
