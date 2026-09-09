# Task 8 implementation report

Status: DONE_WITH_CONCERNS

The first implementer produced the Task 8 edits but stopped responding before reporting or committing. A second implementer was dispatched to finish, also stopped responding after the edits were present, and was closed. The controller then ran the focused suite, inspected the complete diff, and committed the existing Task 8 changes without production edits beyond the worker's implementation.

## Changes

- Added frozen `createCommandAttempt`/`sendCommandAttempt` helpers and explicit-key preservation in `requestJson`.
- Retained action/ticket identity and pending command attempts through uncertain transport or malformed-response failures.
- Added deliberate action retry and read-only refresh retry paths, with ticket-selection guards and in-flight duplicate-gesture suppression.
- Applied frozen attempts to evaluation and governed lifecycle mutations.
- Added the lost-evaluation-response HTTP/UI integration regression and updated existing UI expectations for unresolved command outcomes.

## Commit

- `482f929 fix: retain command identity during UI recovery`

## Verification

- `npx vitest run test/approval-desk-ui.test.ts test/approval-desk-lifecycle-completion.e2e.test.ts --maxWorkers=1` (baseline): 2 files, 211 tests passed.
- `npm test -- --maxWorkers=1` (baseline): 115 files, 1,992 tests passed.
- `npx vitest run test/approval-desk-retry.test.ts test/approval-desk-ui.test.ts test/approval-desk-lifecycle-completion.e2e.test.ts --maxWorkers=1`: 3 files, 213 tests passed.
- `git diff --check`: passed.

Concern: the worker context was unavailable for a self-review report; the controller performed the required diff inspection and focused verification, and an independent task review is still required before Task 8 is complete.

## I-1 fix report (2026-09-09)

The diagnosis review handler now checks the shared governed-mutation lock before incrementing the per-diagnosis mutation token. The regression fires two rapid diagnosis-review gestures, retains the uncertain first outcome, and verifies that explicit retry uses the same path, serialized body, and idempotency key.

Exact verification command:

```text
npx vitest run test/approval-desk-ui.test.ts -t 'retains the first diagnosis review after a rapid duplicate gesture' --maxWorkers=1
```

Exact output:

```text

 RUN  v4.1.8 D:/Documents/Support Ticket Triage MCP/.worktrees/feature-reliability-r1f-task-8


 Test Files  1 passed (1)
      Tests  1 passed | 210 skipped (211)
   Start at  17:26:44
   Duration  601ms (transform 237ms, setup 0ms, import 294ms, tests 38ms)
```

The previously started three-file covering command was interrupted on request before completion; it is not represented as a passing verification result.
