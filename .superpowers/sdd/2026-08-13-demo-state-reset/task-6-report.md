# Task 6 report: reset documentation and operator workflow

## Status

Implemented and verified on branch `codex/demo-state-reset` in the isolated
`demo-state-reset` worktree. Work stopped before Task 7 as required.

## Documentation changes

- Replaced the obsolete manual runtime-directory deletion/import instructions
  with the three explicit reset commands.
- Made `npm run reset:demo` followed by `npm run approval-desk` the repeatable
  browser-demo entry point across the README, demo script/results, capture
  guide, case study, and roadmap.
- Documented the normal persistence workflow: perform an action, stop with
  `Ctrl+C`, restart `approval-desk` without resetting, then stop and reset when
  the walkthrough is finished.
- Explained target isolation: operational reset restores exact fresh tickets
  while preserving accumulated learning; learning reset preserves operational
  history and static knowledge; combined reset coordinates both.
- Documented that the seed is external-capable read-only input, while mutable
  reset targets remain contained under the data root unless the explicit
  external-database opt-in is exactly `true`.
- Documented shared runtime/exclusive reset lease refusal, prepare-before-live
  mutation, SQLite sidecar backup, final-path verification, atomic combined
  rollback, and retained sanitized recovery backups.
- Added the focused reset/runtime verification command and portfolio check to
  the operator evidence section.

No documentation-specific test was specified or present in the repository, so
no new doc test was added. Existing executable reset/runtime contracts and the
complete portfolio workflow were used as documentation evidence.

## Verification

Focused reset/runtime contracts:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts --reporter=dot
Test Files 4 passed (4)
Tests 59 passed (59)
exit code 0
```

Fresh complete repository verification, including build and typecheck:

```text
npm test -- --reporter=dot
Test Files 87 passed (87)
Tests 1531 passed (1531)
exit code 0
```

Fresh portfolio verification:

```text
npm run verify:portfolio
exit code 0
```

The portfolio command reran build, typecheck, all 87 Vitest files / 1,531
tests, diagnostic evaluation, the 11/11 lifecycle matrix, the eight-case
knowledge holdout, knowledge-evolution showcase, operational restart showcase,
and deterministic metrics showcase.

`git diff --check` completed without errors; Git emitted only the repository's
expected LF-to-CRLF working-copy notices.

## Scope

- No production reset, runtime, schema, package-command, or test behavior was
  changed.
- No real development demo state was reset or Approval Desk process started;
  that manual operation belongs to Task 7.
- The pre-existing untracked approved-plan file was preserved and not staged.

## Review fix

The Task 6 review found three active public runbooks that still invoked the
legacy `demo:approval-desk` command. That runner clears the runtime directory
before startup, so it could erase lifecycle-replay state and bypass the new
guarded reset workflow.

RED:

```text
npx vitest run test/demo-reset-docs.test.ts --reporter=dot
Test Files 1 failed (1)
Tests 2 failed (2)
```

The regression failed because the README and lifecycle-replay guide still
contained `npm run demo:approval-desk`, while the video runbook had no explicit
`reset:demo` followed by `approval-desk` sequence.

Fix:

- The README lifecycle viewer and `docs/lifecycle-replay.md` now start the
  non-resetting `npm run approval-desk` command so generated evaluation reports
  remain available to the viewer.
- `docs/video-script.md` now runs `npm run reset:demo` and then
  `npm run approval-desk`, making the destructive step explicit and guarded.
- Added `test/demo-reset-docs.test.ts` to reject both legacy implicit-reset
  commands in the three public runbooks and require the video reset/start order.

Fresh review-fix verification:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/demo-reset-docs.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts --reporter=dot
Test Files 5 passed (5)
Tests 61 passed (61)
```

```text
npm test -- --reporter=dot
Test Files 88 passed (88)
Tests 1533 passed (1533)
```

```text
npm run verify:portfolio
exit code 0
```
