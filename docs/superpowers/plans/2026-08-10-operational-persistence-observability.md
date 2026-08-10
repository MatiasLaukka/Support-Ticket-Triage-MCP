# Operational Persistence and Decision Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move mutable runtime ticket operations into one transactional SQLite operational store, preserve the existing domain authority, and expose a read-only causal Decision Timeline that survives restart and migration.

**Architecture:** Keep `TriageService`, the existing diagnostic/evidence gates, and the shared evaluator as the only workflow authority. Add an `OperationalSqliteStore` with migrations, append-only causal events, immutable revisions, command idempotency, and an outbox; adapters continue calling the service. Keep fixtures, evidence catalogs, and the separate learning ledger outside this database, with learning capture occurring after the operational commit.

**Tech Stack:** TypeScript/Node.js ESM, SQLite via `better-sqlite3`, Zod schemas, Vitest, existing MCP/HTTP/UI adapters.

## Global Constraints

- Use the existing Node engine floor `^20.19.0 || ^22.12.0 || >=24.0.0`.
- `operational.sqlite` is the single source of truth for new mutable runtime writes; legacy JSONL is never a write fallback.
- Static fixtures, evidence catalogs, and test data remain file-backed.
- The learning ledger remains a separate SQLite database; operational success must not depend on learning availability.
- `TriageService` and its domain helpers remain authoritative for classification, evidence readiness, diagnosis, approval, fix, verification, closure, and customer responses.
- HTTP, MCP, UI, scripts, and replay code must call shared domain services and must not write operational tables or reimplement gates.
- Operational events, ticket revisions, messages, diagnoses, and decision traces are append-only after commit; no update/delete APIs are added.
- Every operational event has a unique ticket-wide causal sequence; one transaction producing N events allocates N contiguous sequences in explicit domain order.
- Ticket revision increments only when the canonical `Ticket` projection changes; messages, recommendations, and traces use their own records and watermarks.
- Every mutation boundary carries a stable command/idempotency ID across transport retries.
- Learning capture uses an immutable validated envelope and stable delivery identity; retries never recalculate from mutable ticket state.
- `empty` and `import-in-progress` operational databases allow inspection/import only; live mutations are rejected until `imported` or explicit `native` initialization.
- Typed traces must exclude prompts, hidden reasoning, credentials, raw provider payloads, machine paths, and unnecessary customer-message copies.
- Run TDD: write the focused failing test first, verify RED, implement the smallest change, verify GREEN, then run the relevant existing regression suites.

---

## File and module map

Create the operational persistence boundary in focused modules:

- Create: `src/operational/domain.ts` — Zod schemas and TypeScript types for operational events, ticket/recommendation/message revisions, idempotency envelopes, outbox rows, import state, and timeline DTOs.
- Create: `src/operational/sqlite-store.ts` — SQLite connection, schema migrations, foreign keys, busy timeout, transaction wrapper, and repository primitives.
- Create: `src/operational/unit-of-work.ts` — domain-facing transactional write set and contiguous sequence allocator.
- Create: `src/operational/idempotency.ts` — canonical request hashing and replayable semantic-result envelopes.
- Create: `src/operational/learning-outbox.ts` — immutable capture envelopes, delivery claims, retry/dead-letter transitions, and ledger handoff.
- Create: `src/operational/import.ts` — dry-run validation, aggregate batches, durable skip resolutions, cutover state transitions, and legacy causal-order reconstruction.
- Create: `src/operational/timeline.ts` — read-only Decision Timeline projection starting from `operational_events ORDER BY sequence`.
- Modify: `src/runtime.ts` — construct the operational SQLite store, unit of work, outbox worker, and import-aware repositories while retaining existing knowledge/fixture paths.
- Modify: `src/triage-service.ts` — route all mutating commands through the operational unit of work without moving workflow rules into persistence.
- Modify: `src/knowledge-evolution/learning-capture.ts` and `src/knowledge-evolution/learning-ledger.ts` — accept stable delivery identities and immutable capture envelopes.
- Modify: `src/server.ts` and `src/approval-desk/http.ts` — pass stable command IDs, consume the shared operational read model, and expose persistence/import errors without duplicating domain logic.
- Modify: `src/approval-desk/workflow-read-model.ts` and `src/approval-desk/ui.ts` — include the timeline as read-only ticket detail content.
- Modify: `package.json`, `README.md`, `docs/case-study.md`, and `docs/roadmap.md` — add initialization/import commands, persistence guarantees, and the restart/timeline showcase.
- Create focused tests alongside the existing test suite: `test/operational-domain.test.ts`, `test/operational-sqlite-store.test.ts`, `test/operational-unit-of-work.test.ts`, `test/operational-idempotency.test.ts`, `test/operational-learning-outbox.test.ts`, `test/operational-import.test.ts`, and `test/decision-timeline.test.ts`.

Existing `TicketRepository`, `RecommendationRepository`, and `AuditRepository` remain available for fixture/test compatibility during migration, but production runtime dependencies must be backed by the operational store after the cutover.

## Task 1: Define operational contracts and migration schema

**Files:**
- Create: `src/operational/domain.ts`
- Test: `test/operational-domain.test.ts`
- Modify: `src/domain.ts` only where an existing validated domain type must be reused without changing its authority semantics.

**Interfaces:**
- Produces `OperationalEvent`, `TicketRevision`, `ConversationMessage`, `OperationalOutboxRow`, `CommandIdempotencyRecord`, `ImportState`, `ImportResolution`, `DecisionTimelineEntry`, and `OperationalResultReference` schemas.
- Produces canonical request normalization and immutable result-envelope types consumed by Tasks 2–4.

- [ ] **Step 1: Write the failing schema tests.** Cover strict parsing for event IDs, ticket IDs, ticket sequences, command IDs, request hashes, message IDs, revision numbers, result references, outbox statuses (`pending | delivered | dead-letter`), import states (`empty | import-in-progress | imported | native`), and timeline entries.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-domain.test.ts`

  Expected: FAIL because the operational module and schemas do not exist.
- [ ] **Step 3: Implement the schemas.** Reuse `TicketSchema`, `TriageRecommendationSchema`, `AuditEventSchema`, `IsoTimestampSchema`, and existing ID schemas rather than creating incompatible duplicates. Make related records point to `operationalEventId`; do not put reverse record foreign keys on `OperationalEvent`.
- [ ] **Step 4: Encode revision and outbox semantics.** The type for diagnosis completion must allow a ticket revision only when the canonical `Ticket` projection changed. The outbox envelope must represent one learning event for this slice and include the finalized diagnosis/outcome snapshot plus the committed operational-event reference.
- [ ] **Step 5: Run the focused test and typecheck.**

  Run: `npm test -- --run test/operational-domain.test.ts` and `npm run typecheck`

  Expected: all focused tests pass and TypeScript reports no errors.
- [ ] **Step 6: Commit.**

  ```powershell
  git add src/operational/domain.ts test/operational-domain.test.ts src/domain.ts
  git commit -m "feat: define operational persistence contracts"
  ```

## Task 2: Implement SQLite schema, migrations, and repository primitives

**Files:**
- Create: `src/operational/sqlite-store.ts`
- Create: `src/operational/unit-of-work.ts`
- Test: `test/operational-sqlite-store.test.ts`
- Test: `test/operational-unit-of-work.test.ts`

**Interfaces:**
- `OperationalSqliteStore.open(path: string): OperationalSqliteStore`.
- `initialize(): Promise<void>` applies versioned migrations transactionally and records schema metadata.
- `transaction<T>(work: (unit: OperationalUnitOfWork) => T): T` runs one SQLite transaction with foreign keys and bounded busy timeout.
- `OperationalUnitOfWork.allocateEventSequences(ticketId: TicketId, count: number): number[]` returns contiguous sequences.
- `OperationalUnitOfWork.appendEvent(event: OperationalEvent): void`, `appendTrace(trace: DecisionTraceEvent): void`, and typed insert methods for revisions/messages/diagnoses/recommendations.
- `readTicketAggregate(ticketId: TicketId): Promise<...>` reloads canonical projections and causal records after restart.

- [ ] **Step 1: Write failing migration and transaction tests.** Assert all required tables exist, foreign-key enforcement is on, schema version is recorded, a newer/corrupt schema fails without overwrite, and a thrown unit-of-work callback rolls back every write.
- [ ] **Step 2: Run the focused tests to verify RED.**

  Run: `npm test -- --run test/operational-sqlite-store.test.ts test/operational-unit-of-work.test.ts`

  Expected: FAIL because the SQLite store is absent.
- [ ] **Step 3: Add migrations for the operational tables.** Include `schema_migrations`, `operational_metadata`, `command_idempotency`, `tickets`, `ticket_revisions`, `conversation_messages`, `operational_import_resolutions`, `recommendations`, `recommendation_revisions`, `diagnoses`, `operational_events`, `decision_trace_events`, and `learning_capture_outbox`. Add uniqueness for `(ticket_id, sequence)`, command IDs, event IDs, message IDs, outbox IDs, and delivery keys; add causal/ticket/status lookup indexes.
- [ ] **Step 4: Implement the transaction wrapper and sequence allocator.** Lock the SQLite transaction, read the current maximum sequence for the ticket, reserve N contiguous values, and require callers to append events in the returned order. Related records store only their event ID.
- [ ] **Step 5: Implement typed append/read primitives.** Reject updates/deletes for events and traces after commit. Validate every payload with the Task 1 schemas before SQL execution. Keep timeline reads anchored to event sequence rather than timestamp sorting.
- [ ] **Step 6: Run focused tests, build, and typecheck.**

  Run: `npm test -- --run test/operational-sqlite-store.test.ts test/operational-unit-of-work.test.ts`, `npm run build`, and `npm run typecheck`

  Expected: focused tests pass and both TypeScript commands succeed.
- [ ] **Step 7: Commit.**

  ```powershell
  git add src/operational/sqlite-store.ts src/operational/unit-of-work.ts test/operational-sqlite-store.test.ts test/operational-unit-of-work.test.ts
  git commit -m "feat: add transactional operational sqlite store"
  ```

## Task 3: Add persistent idempotency and causal command boundaries

**Files:**
- Create: `src/operational/idempotency.ts`
- Modify: `src/operational/unit-of-work.ts`
- Test: `test/operational-idempotency.test.ts`

**Interfaces:**
- `canonicalRequestHash(operation: string, request: unknown): string`.
- `beginCommand(commandId: string, operation: string, request: unknown): CommandReplay | "new"`.
- `persistCommandResult(commandId: string, hash: string, result: OperationalResultReference): void`.
- `CommandReplay` returns the immutable semantic result envelope, never the current mutable projection.

- [ ] **Step 1: Write failing idempotency tests.** Cover same command/hash replay, same command/different hash rejection, multiple event references, replay after closing/reopening SQLite, and no partial writes when a duplicate or conflict is rejected.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-idempotency.test.ts`

  Expected: FAIL because command idempotency is not implemented.
- [ ] **Step 3: Implement canonical request hashing.** Normalize object key order and validated input values before hashing; include operation name so one command ID cannot be reused for a different operation.
- [ ] **Step 4: Implement transaction-local command claims.** Check the command before expensive work when possible, repeat the check inside the write transaction, and persist the allowlisted result envelope together with the domain writes. Return the original envelope on replay.
- [ ] **Step 5: Add causal multi-event tests.** Verify a composed action receives N contiguous sequences in explicit order and that retrying it does not append a second event set.
- [ ] **Step 6: Run focused tests and typecheck.**

  Run: `npm test -- --run test/operational-idempotency.test.ts` and `npm run typecheck`

  Expected: all tests pass.
- [ ] **Step 7: Commit.**

  ```powershell
  git add src/operational/idempotency.ts src/operational/unit-of-work.ts test/operational-idempotency.test.ts
  git commit -m "feat: add restart-safe command idempotency"
  ```

## Task 4: Migrate TriageService mutations to atomic operational writes

**Files:**
- Modify: `src/triage-service.ts`
- Modify: `src/operational/unit-of-work.ts`
- Modify: `src/runtime.ts`
- Test: `test/triage-operational-persistence.test.ts`
- Regression tests: `test/triage-service.test.ts`, `test/server-actions.test.ts`, `test/approval-desk-http.test.ts`

**Interfaces:**
- Preserve existing public `TriageService` methods and domain errors.
- Add a service-owned `OperationalCommandContext` carrying `commandId`, expected ticket revision, customer-reply watermark, and actor.
- The service is the only caller allowed to compose the write set; adapters only supply validated input and command IDs.

- [ ] **Step 1: Write failing atomicity tests around each command.** Assert the exact write sets from the design:
  - evaluation: recommendation revision + operational event + typed traces;
  - diagnosis completion: immutable diagnosis, conditional ticket revision, event, traces, and eligible outbox intent;
  - customer reply and sent support response: canonical message + event + trace;
  - approval, fix, mitigation, verification, and closure: their projection changes + event + trace.
- [ ] **Step 2: Add stale-precondition tests.** Prepare evaluation outside the transaction, mutate the ticket revision or customer-reply watermark, and assert the commit is rejected without a partial recommendation, message, event, diagnosis, or trace.
- [ ] **Step 3: Run the focused tests to verify RED.**

  Run: `npm test -- --run test/triage-operational-persistence.test.ts`

  Expected: FAIL because current repositories write separate files and increment ticket revisions unconditionally.
- [ ] **Step 4: Route `submit`, approval/rejection/cancellation, response-sent, customer-reply, diagnosis review/completion, fix/mitigation, verification, closure, supersession, and scoped-fix methods through one unit-of-work callback.** Preserve existing gate helpers (`workflow-guidance`, `diagnostic-workflow`, evidence readiness, diagnosis review): perform pure validation before opening the write transaction, then repeat ticket revision, customer-reply watermark, approval, and lifecycle preconditions inside the transaction; do not copy workflow conditions into the store.
- [ ] **Step 5: Implement conditional ticket revision writes.** Compare the proposed canonical `Ticket` projection with the stored projection; insert a `ticket_revisions` row and increment `ticket.revision` only when it changes. Keep conversation freshness on message/audit watermarks instead of artificial ticket updates.
- [ ] **Step 6: Persist typed traces transactionally.** Build sanitized trace payloads from existing classification/evidence/lifecycle results; if validation fails, roll back the whole operational command.
- [ ] **Step 7: Implement stable result envelopes for every mutation.** Return original event IDs, revision IDs, message IDs, diagnosis IDs, and ticket revision from repeated commands rather than re-reading a mutable current projection.
- [ ] **Step 8: Run focused regressions and the existing service/API suites.**

  Run: `npm test -- --run test/triage-operational-persistence.test.ts test/triage-service.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts`

  Expected: all tests pass with existing domain outcomes unchanged.
- [ ] **Step 9: Commit.**

  ```powershell
  git add src/triage-service.ts src/operational/unit-of-work.ts src/runtime.ts test/triage-operational-persistence.test.ts test/triage-service.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts
  git commit -m "feat: persist triage mutations transactionally"
  ```

## Task 5: Make learning capture durable and idempotent

**Files:**
- Create: `src/operational/learning-outbox.ts`
- Modify: `src/knowledge-evolution/learning-capture.ts`
- Modify: `src/knowledge-evolution/learning-ledger.ts`
- Modify: `src/runtime.ts`
- Test: `test/operational-learning-outbox.test.ts`
- Regression tests: `test/knowledge-learning-capture.test.ts`, `test/knowledge-learning-ledger.test.ts`, `test/knowledge-learning-ledger-sqlite.test.ts`

**Interfaces:**
- `LearningCaptureEnvelope` contains only the finalized diagnosis/outcome snapshot and operational-event reference.
- `deliverOutboxRow(row: OperationalOutboxRow): Promise<DeliveryResult>` uses `deliveryKey` as the ledger idempotency identity.
- Same key/same envelope returns a no-op success; same key/different envelope rejects.
- Retryable errors keep `pending`; explicitly non-retryable errors move to `dead-letter`.

- [ ] **Step 1: Write failing outbox tests.** Cover operational commit followed by learning failure, pending retry after restart, successful learning write followed by process crash before acknowledgement, same-key/different-envelope rejection, and one-row/one-learning-event cardinality.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-learning-outbox.test.ts`

  Expected: FAIL because the current capture service appends directly to the ledger using the audit ID without an operational outbox.
- [ ] **Step 3: Implement immutable envelope creation.** Build the envelope from the committed diagnosis/outcome and event, validate it before insertion, and never reload the mutable ticket to reconstruct it during retry.
- [ ] **Step 4: Add ledger delivery identity checks.** Persist/validate the delivery key and envelope hash in the learning ledger append path; identical retries no-op, conflicting payloads fail safely.
- [ ] **Step 5: Add pending drain and dead-letter transitions.** Make startup/drain retry pending rows, increment attempts, record safe error codes, and leave operational outcomes untouched when the learning store is unavailable.
- [ ] **Step 6: Run focused learning tests and existing ledger tests.**

  Run: `npm test -- --run test/operational-learning-outbox.test.ts test/knowledge-learning-capture.test.ts test/knowledge-learning-ledger.test.ts test/knowledge-learning-ledger-sqlite.test.ts`

  Expected: all tests pass.
- [ ] **Step 7: Commit.**

  ```powershell
  git add src/operational/learning-outbox.ts src/knowledge-evolution/learning-capture.ts src/knowledge-evolution/learning-ledger.ts src/runtime.ts test/operational-learning-outbox.test.ts test/knowledge-learning-capture.test.ts test/knowledge-learning-ledger.test.ts test/knowledge-learning-ledger-sqlite.test.ts
  git commit -m "feat: add durable idempotent learning outbox"
  ```

## Task 6: Implement import, cutover states, and native initialization

**Files:**
- Create: `src/operational/import.ts`
- Modify: `src/operational/sqlite-store.ts`
- Modify: `src/runtime.ts`
- Modify: `package.json`
- Test: `test/operational-import.test.ts`

**Interfaces:**
- `validateImport(input): ImportValidationReport` performs a dry run without writes.
- `importOperationalData(input): ImportSummary` writes one ticket aggregate per transaction and preserves IDs/revisions/actors/timestamps/provenance.
- `recordImportSkip(input): void` writes an append-only `operational_import_resolutions` row with source ID, reason, actor, timestamp, and command/correlation ID.
- `initializeOperationalNative(): void` refuses recognizable legacy files and transitions only `empty -> native`.

- [ ] **Step 1: Write failing import tests.** Cover dry-run validation, successful rerun, source append/audit order becoming causal event sequences, conflicting aggregate isolation, durable skipped conflicts, partial import remaining blocked, and native initialization refusing legacy files.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-import.test.ts`

  Expected: FAIL because operational SQLite import/cutover does not exist.
- [ ] **Step 3: Implement `operational_metadata` state transitions.** New DBs begin `empty`; import sets `import-in-progress`; only after every discovered source aggregate is imported or durably resolved/skipped does it become `imported`; native initialization is explicit and refuses legacy inputs.
- [ ] **Step 4: Implement aggregate import transactions.** Validate all source records first, then insert tickets, revisions, messages, recommendations, diagnoses, events, and traces with preserved IDs. Reconstruct event sequences from source append/audit order, never timestamp sorting.
- [ ] **Step 5: Block runtime mutations in `empty` and `import-in-progress`.** Inspection and import remain available; mutation commands return an actionable state error.
- [ ] **Step 6: Add package commands.** Add `initialize:operational-native` and `import:operational-data` scripts that build first and invoke the typed import/native entry points without changing existing fixture generation commands.
- [ ] **Step 7: Run import tests, build, and typecheck.**

  Run: `npm test -- --run test/operational-import.test.ts`, `npm run build`, and `npm run typecheck`

  Expected: all tests pass.
- [ ] **Step 8: Commit.**

  ```powershell
  git add src/operational/import.ts src/operational/sqlite-store.ts src/runtime.ts package.json test/operational-import.test.ts
  git commit -m "feat: add operational import and cutover states"
  ```

## Task 7: Build the causal Decision Timeline read model and UI surface

**Files:**
- Create: `src/operational/timeline.ts`
- Modify: `src/approval-desk/workflow-read-model.ts`
- Modify: `src/approval-desk/http.ts`
- Modify: `src/server.ts`
- Modify: `src/approval-desk/ui.ts`
- Test: `test/decision-timeline.test.ts`
- Regression tests: `test/approval-desk-http.test.ts`, `test/server-read.test.ts`, `test/approval-desk-ui.test.ts`

**Interfaces:**
- `readDecisionTimeline(ticketId: TicketId): Promise<DecisionTimelineEntry[]>` starts from `operational_events ORDER BY sequence` and joins related records through event IDs.
- The read model includes event type, actor, timestamp, outcome, evidence/missing IDs, approval/fallback reason, exact knowledge object/version, and safe provider telemetry when present.
- The UI renders timeline entries read-only and keeps customer bodies in Conversation Context.

- [ ] **Step 1: Write failing timeline tests.** Seed events whose timestamps disagree with causal order and assert sequence order wins; assert related message/recommendation/diagnosis/trace data joins through the event ID; assert no prompt, hidden reasoning, credential, or raw customer body appears in timeline DTOs.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/decision-timeline.test.ts`

  Expected: FAIL because the operational timeline module is absent.
- [ ] **Step 3: Implement the read-only timeline projection.** Keep event sequence as the causal spine; do not merge seven tables and sort by timestamp. Return stable DTOs suitable for both HTTP and MCP.
- [ ] **Step 4: Add timeline data to the shared workflow read model.** Preserve existing recommendation/conversation fields and add `decisionTimeline` without changing lifecycle authority.
- [ ] **Step 5: Render the embedded timeline in the Approval Desk.** Add compact milestone grouping/filtering by event category and actor; do not make it editable or a second action bar.
- [ ] **Step 6: Expose the same read model through MCP/HTTP.** Ensure both adapters call the shared read service and return equivalent domain outcomes/errors.
- [ ] **Step 7: Run focused UI/API tests.**

  Run: `npm test -- --run test/decision-timeline.test.ts test/approval-desk-http.test.ts test/server-read.test.ts test/approval-desk-ui.test.ts`

  Expected: all tests pass.
- [ ] **Step 8: Commit.**

  ```powershell
  git add src/operational/timeline.ts src/approval-desk/workflow-read-model.ts src/approval-desk/http.ts src/server.ts src/approval-desk/ui.ts test/decision-timeline.test.ts test/approval-desk-http.test.ts test/server-read.test.ts test/approval-desk-ui.test.ts
  git commit -m "feat: add causal decision timeline"
  ```

## Task 8: Finish runtime parity, documentation, and verification

**Files:**
- Modify: `src/runtime.ts`, `src/server.ts`, `src/approval-desk/http.ts`
- Modify: `README.md`, `docs/case-study.md`, `docs/roadmap.md`
- Modify: `scripts/demo-approval-desk.ts` or create `scripts/demo-operational-persistence.ts`
- Modify: `package.json`
- Test: `test/operational-runtime-parity.test.ts`

**Interfaces:**
- `createRuntimeDependencies()` returns operational SQLite-backed ticket/recommendation/audit services plus the existing learning service.
- The HTTP, MCP, UI, lifecycle replay, and demo paths all consume the same service and read models.

- [ ] **Step 1: Write the parity and restart tests.** Start two runtime instances against the same operational DB, evaluate/mutate through HTTP and MCP, restart, and assert identical ticket projection, causal timeline, current recommendation, customer-reply watermark, and command replay envelope.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-runtime-parity.test.ts`

  Expected: FAIL because runtime still constructs file-backed operational repositories.
- [ ] **Step 3: Switch production runtime construction.** Keep fixture seed and knowledge roots unchanged, add `OPERATIONAL_DB_PATH` to `RuntimePaths` and startup validation, initialize SQLite before serving, and fail startup safely for corrupt/newer schemas or blocked import states.
- [ ] **Step 4: Thread stable command IDs through all mutation adapters.** Validate them at HTTP/MCP boundaries, preserve them across retries, and ensure UI-generated retries reuse the same ID.
- [ ] **Step 5: Add the restart/import showcase.** Demonstrate legacy import, evaluation, Decision Timeline inspection, process restart, identical reload, approval, fix, verification, closure, and separate learning reuse.
- [ ] **Step 6: Document the boundary.** README and case study must explain operational truth vs advisory learning, transactional write sets, outbox failure behavior, causal ordering, migration states, and the exact commands to initialize/import/run the showcase.
- [ ] **Step 7: Run the full verification suite.**

  Run: `npm run build`, `npm run typecheck`, `npm test`, `npm run evaluate:diagnostics`, `npm run evaluate:lifecycle-replay`, `npm run evaluate:knowledge-holdout`, `npm run demo:knowledge-evolution -- --verbose`, and `npm run verify:portfolio`.

  Expected: all existing deterministic, lifecycle, knowledge-holdout, and portfolio checks pass; the new restart/import/timeline checks are green; no production path writes legacy JSONL after cutover.
- [ ] **Step 8: Commit.**

  ```powershell
  git add src/runtime.ts src/server.ts src/approval-desk/http.ts scripts package.json README.md docs/case-study.md docs/roadmap.md test/operational-runtime-parity.test.ts
  git commit -m "feat: complete operational persistence showcase"
  ```

## Verification checklist before integration

- [ ] `git diff --check` is clean.
- [ ] `npm run build` and `npm run typecheck` pass.
- [ ] Full Vitest suite passes with `npm test`.
- [ ] Every mutation has one authoritative service path and one explicit transactional write set.
- [ ] Duplicate command retries replay the original semantic envelope after restart.
- [ ] Event sequences are contiguous for compound commands and timeline ordering ignores timestamp skew.
- [ ] Diagnosis completion does not create an artificial ticket revision.
- [ ] Learning failures leave operational state valid and outbox rows pending/dead-letter as specified.
- [ ] Learning retries with the same delivery key never duplicate events or accept a changed envelope.
- [ ] Partial imports cannot enable runtime mutation; explicit skips are durable and auditable.
- [ ] MCP, HTTP, and UI outcomes remain equivalent.
- [ ] Timeline DTOs contain no prompts, hidden reasoning, credentials, raw provider payloads, or unnecessary customer content.
- [ ] Existing fixture/catalog boundaries remain unchanged.
