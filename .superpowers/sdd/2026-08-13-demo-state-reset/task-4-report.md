# Task 4 report: combined demo state reset

## Status

Implemented and verified on branch `codex/demo-state-reset` in the isolated
`demo-state-reset` worktree. Work stopped before Task 5 as required.

## RED

Command:

```text
npx vitest run test/demo-reset.test.ts
```

Observed result before production implementation:

```text
Test Files 1 failed (1)
Tests 4 failed | 28 passed (32)

TypeError: resetDemoState is not a function
```

The four combined-reset regressions failed for the expected missing-feature
reason while every independent operational and learning reset test remained
green.

## Implementation summary

- Added `DemoResetInput`, `DemoResetSummary`, and asynchronous
  `resetDemoState()`.
- Refactored the existing operational and learning preparation paths to accept
  one internally owned exclusive lease. The combined operation holds that
  lease from the first preparation through both commits, both final-path
  verifications, backup cleanup, rollback, and recovery verification.
- Preserved the public independent reset wrappers and their one-side-only lease,
  prepare, commit, final verification, cleanup, and rollback semantics.
- Added deferred finalization to both prepared reset implementations. Combined
  commit retains both backup inventories until the operational database and the
  learning SQLite plus every whitelisted mutable directory have reopened and
  passed final-path verification.
- If the learning replacement fails after operational replacement, combined
  rollback restores learning first and operational second, then reopens both
  restored original states before releasing the lease.
- If cross-side rollback cannot complete, all recoverable backup entries remain
  in place and the error reports sanitized basenames only.
- Captures SHA-256 manifests for every whitelisted mutable learning directory
  before replacement. Combined rollback reopens the restored SQLite state and
  byte-compares all restored directory manifests before it may report that both
  originals were restored.

## Regression coverage

- Dirty operational and learning state reset together, including ticket
  mutation, recommendations and workflow history, learning event, candidate,
  audit, diagnosis, and legacy mutable learning files.
- Reversed seed order verifies ticket payload comparison by ticket ID.
- Static knowledge remains byte-for-byte unchanged.
- Both sides are prepared before the operational live database changes.
- Runtime usage acquisition is refused throughout the combined operation and
  succeeds immediately after completion or failure cleanup.
- Injected learning-side backup failure after operational commit restores and
  reopens both original states.
- Forced operational rollback failure retains its backup and reports no
  absolute recovery path.
- Injected partial learning backup/restore failure retains the diagnoses
  directory backup and reports `ROLLBACK_FAILED` with only its sanitized
  basename.
- Successful completion leaves no operational or learning reset artifacts.

## GREEN and verification

Focused reset/runtime suite:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts
Test Files 3 passed (3)
Tests 46 passed (46)
exit code 0
```

Fresh full verification, including build and typecheck:

```text
npm test
Test Files 86 passed (86)
Tests 1518 passed (1518)
exit code 0
```

## Self-review

- Combined reset composes internal phases; it never calls the independent
  public wrappers sequentially and does not duplicate baseline creation or
  verification rules.
- The existing active-use guard, canonical containment checks, SQLite sidecar
  handling, and learning directory whitelist remain authoritative.
- Operational and learning independent reset behavior remains covered by the
  existing regression suite.
- Final-path verification occurs while backups still exist; backup deletion is
  best-effort only after both sides have verified.
- Ticket equality remains ID-based, and static `data/knowledge` is outside the
  learning reset whitelist.
- The pre-existing untracked approved-plan file was not modified or staged.
