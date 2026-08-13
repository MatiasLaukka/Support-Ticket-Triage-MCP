# Task 1 report: operational demo reset

## Status

Implemented and verified on branch `codex/demo-state-reset` in the isolated
`demo-state-reset` worktree.

## RED

Command:

```text
npx vitest run test/demo-reset.test.ts
```

Observed result before production implementation:

```text
FAIL test/demo-reset.test.ts
Error: Cannot find module '../src/demo-reset.js'
Test Files 1 failed (1)
Tests no tests
exit code 1
```

This was the expected failure because the operational reset module did not
exist.

## Implementation summary

- Added the public operational prepare/verify/commit/rollback reset contract
  and synchronous convenience wrapper.
- Reads and validates the complete nonempty seed before lease acquisition or
  live-database mutation, including exact schema and duplicate-ID rejection.
- Canonicalizes existing and non-existing paths through their nearest existing
  ancestor; seed input may be outside `dataRoot`, while every mutable database,
  temporary, backup, and sidecar target is containment-checked by default.
- Added an atomic cross-process reader/reset lease gate. Shared runtime-style
  usage leases and the exclusive reset lease are created and inspected inside
  one atomic gate critical section, with live-PID stale-record recovery.
- Builds a fresh sibling SQLite database, transitions only `empty -> native`,
  inserts seed tickets through the existing validated unit of work, and never
  invokes or weakens legacy import/native initialization.
- Verifies seed tickets by ID and payload through public store reads, verifies
  native metadata, checks every snapshot-derived collection, and counts every
  current derived operational table including command idempotency and outbox.
- Uses backup-and-swap replacement with journal/WAL/SHM checkpoint, move,
  cleanup, final-path reopen, and rollback restoration. A verified replacement
  remains authoritative if backup cleanup itself is denied; the backup is
  retained rather than risking a partial-cleanup rollback.
- Added dirty-state, ID-order, idempotence, invalid/empty/duplicate seed,
  external-path, symlink/junction containment, cross-process active-use,
  exclusive-lease, preparation rollback, and replacement-failure regressions.

## GREEN and verification

Focused reset test:

```text
npx vitest run test/demo-reset.test.ts
Test Files 1 passed (1)
Tests 12 passed (12)
```

Required focused pair, rerun after self-review:

```text
npx vitest run test/demo-reset.test.ts test/runtime.test.ts
Test Files 2 passed (2)
Tests 21 passed (21)
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
Test Files 85 passed (85)
Tests 1493 passed (1493)
exit code 0
```

`git diff --check` and the staged equivalent both completed without errors.

## Self-review

- Production import rules are unchanged; no import file or runtime workflow
  behavior was edited.
- Reset produces `native`, never `imported`.
- Tickets are compared as `Map<ticketId, Ticket>` values, independent of
  SQLite/repository iteration order.
- The fresh database contains no fabricated timeline events and every current
  derived operational table is empty.
- Reset is a fresh-database replacement, not table-by-table deletion.
- Invalid seeds fail before lease acquisition and leave the live database
  byte-for-byte unchanged in regression coverage.
- A missing prepared replacement after the live database is backed up restores
  the original database and leaves it reopenable.
- The seed path is read-only and may be external; destructive targets remain
  canonical-containment guarded.

## Commits

- `80bea23` — `feat: add operational demo state reset`
- `1e6fc6d` — `fix: harden operational reset coordination`

## Concerns / handoff

- Backup deletion is best-effort after final-path verification. A denied cleanup
  can retain a sanitized, sibling backup artifact; it cannot cause the verified
  replacement or original data to be deleted through a partial rollback.
- The approved plan file was already untracked in the worktree and was not
  modified or included in the implementation commit.

## Review-fix verification

The first Task 1 review identified two high-severity gaps:

1. `createRuntimeDependencies()` did not yet acquire the shared production
   usage lease before opening operational SQLite, learning SQLite, or mutable
   diagnosis state.
2. A failure after one live database member had moved to backup could lose the
   moved-entry inventory if immediate restoration also failed, producing an
   inaccurate “original restored” error while a backup remained.

Additional RED command:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-recovery.test.ts
```

Observed RED result:

```text
Test Files 2 failed (2)
Tests 2 failed | 12 passed (14)

- runtime startup resolved and opened operational/learning state while the
  exclusive reset lease was held;
- partial backup failure returned REPLACEMENT_FAILED with “original database
  was restored” instead of ROLLBACK_FAILED naming the retained backup.
```

Review fix:

- Runtime now acquires the shared usage lease immediately after non-mutating
  configuration resolution and before any operational SQLite, learning SQLite,
  or diagnosis repository construction. Startup failure and `runtime.close()`
  release it.
- Backup moves now append each successful rename to the prepared operation’s
  durable in-memory inventory. The single outer rollback owns restoration and
  reports any retained recovery basename if restoration cannot complete.

Focused GREEN after the review fix:

```text
npx vitest run test/demo-reset.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts
Test Files 3 passed (3)
Tests 24 passed (24)
```

Fresh full verification after the review fix:

```text
npm test
Test Files 86 passed (86)
Tests 1496 passed (1496)
exit code 0
```

Review-fix commit:

- `1e6fc6d` — `fix: harden operational reset coordination`
