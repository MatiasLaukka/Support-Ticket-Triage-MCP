# Final reset isolation fix report

## Residual malformed-metadata follow-up

The independent re-review found that a malformed `schema_meta` table could
throw before the known learning/knowledge table-pair fallback executed. The
guard now evaluates both recognized table signatures first and only queries the
optional marker when neither signature is present.

Real-SQLite regressions cover malformed metadata with both
`learning_events` + `learning_deliveries` and `knowledge_candidates` +
`knowledge_versions`. Both targets are refused with the existing stable error,
remain byte-for-byte unchanged, and leave no reset artifacts. A legitimate
operational database carrying unrelated malformed `schema_meta` remains valid.

The regressions were observed RED (2 expected failures) before the production
change and GREEN afterward. Fresh final verification passed 73 focused reset
tests, 1545 full-suite tests, and `npm run verify:portfolio`.

## Finding reproduced

The original production behavior accepted a real initialized
`SqliteLearningLedger` as `operationalDatabase`, including with
`allowExternalDatabasePath: true`, and replaced its learning schema with the
operational baseline. The first focused run failed six regressions: independent
API schema refusal, CLI schema refusal, CLI canonical alias refusal, and
combined equality, sidecar, and parent-overlap refusal.

## Fix

- Operational preparation detects the learning-ledger marker and the learning
  or knowledge-evolution table signatures before acquiring the reset lease or
  creating a prepared database.
- Canonical reset database families include each configured live database,
  generated or configured temporary/backup aliases, and SQLite journal/WAL/SHM
  members. Cross-family equality or containment overlap is rejected.
- Combined reset applies the guard before the shared lease and before either
  preparation phase.
- The CLI resolves both the operational and configured/default learning target
  for preflight in every mode. An intentionally blank learning variable remains
  non-blocking for operational-only reset, matching the prior independent
  command contract.

## Preserved boundaries

- Distinct custom operational and learning database names remain valid inside
  the configured data root.
- The existing external database opt-in remains valid for legitimate distinct
  targets but cannot bypass learning-schema identity checks.
- The seed remains read-only input and may remain outside the data root.
- Operational/learning schema creation, replacement, lease, import, and cutover
  implementation paths were not broadened or weakened.

## Regression coverage

- A dirty real learning ledger cannot be reset as operational state, and its
  events, candidates, mutable directories, sidecars, and separate operational
  state remain unchanged.
- Combined reset refuses canonical equality, WAL aliasing, reset-temporary
  aliasing, reset-backup aliasing, and parent/child overlap before mutation.
- CLI refuses an empty canonical target alias and a populated external learning
  target while returning stable safe errors.
- CLI combined reset succeeds for distinct contained custom database paths.

## Fresh verification

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

git diff --check
exit code 0
```
