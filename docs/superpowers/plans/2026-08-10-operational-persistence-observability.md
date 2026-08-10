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
- Produces `OperationalEvent`, `TicketRevision`, `ConversationMessage`, `OperationalWorkflowSnapshot`, `OperationalOutboxRow`, `CommandIdempotencyRecord`, `ImportState`, `ImportResolution`, `DecisionTimelineEntry`, and `OperationalResultReference` schemas.
- Produces canonical request normalization and immutable result-envelope types consumed by the persistence and service-migration tasks.

- [ ] **Step 1: Write the failing schema tests.** Cover strict parsing for event IDs, ticket IDs, ticket sequences, command IDs, request hashes, message IDs, revision numbers, result references, outbox statuses (`pending | delivered | dead-letter`), import states (`empty | import-in-progress | imported | native`), and timeline entries.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-domain.test.ts`

  Expected: FAIL because the operational module and schemas do not exist.
- [ ] **Step 3: Implement the schemas.** Reuse `TicketSchema`, `TriageRecommendationSchema`, `AuditEventSchema`, `IsoTimestampSchema`, and existing ID schemas rather than creating incompatible duplicates. Make related records point to `operationalEventId`; do not put reverse record foreign keys on `OperationalEvent`.
- [ ] **Step 4: Encode revision and outbox semantics.** The type for diagnosis completion must allow a ticket revision only when the canonical `Ticket` projection changed. The outbox envelope must be a discriminated immutable operational-fact envelope covering every existing learning-capture mapping (`diagnosis-recorded`, `diagnosis-approved`, `fix-available`, and `outcome-verified`), with the committed operational-event reference and only facts captured at commit time.
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
- `initialize(): void` applies versioned migrations transactionally and records schema metadata.
- `close(): void` releases the SQLite handle and is safe to call during restart/test cleanup.
- `transaction<T>(work: (unit: OperationalUnitOfWork) => T): T` runs a synchronous `better-sqlite3` transaction with foreign keys, `BEGIN IMMEDIATE`, and bounded busy timeout; the callback must not `await`.
- `readTicket(ticketId: TicketId): Ticket` and `readWorkflowSnapshot(ticketId: TicketId): OperationalWorkflowSnapshot` read through the same connection.
- `readRecommendation(id: string): TriageRecommendation | undefined` and `readDiagnosis(id: string): CompletedDiagnosis | undefined` are available both outside and inside a transaction.
- `OperationalUnitOfWork.allocateEventSequences(ticketId: TicketId, count: number): number[]` returns contiguous sequences.
- `OperationalUnitOfWork.appendEvent(event: OperationalEvent): void`, `appendTrace(trace: DecisionTraceEvent): void`, and typed insert methods for revisions/messages/diagnoses/recommendations.
- `readTicketAggregate(ticketId: TicketId): OperationalWorkflowSnapshot` reloads canonical projections and causal records after restart.

- [ ] **Step 1: Write failing migration and transaction tests.** Assert all required tables exist, foreign-key enforcement is on, schema version is recorded, a newer/corrupt schema fails without overwrite, a thrown synchronous unit-of-work callback rolls back every write, an async callback is rejected by the operational API rather than running inside SQLite, and close/reopen releases the handle and reloads identical state.
- [ ] **Step 2: Run the focused tests to verify RED.**

  Run: `npm test -- --run test/operational-sqlite-store.test.ts test/operational-unit-of-work.test.ts`

  Expected: FAIL because the SQLite store is absent.
- [ ] **Step 3: Add migrations for the operational tables.** Include `schema_migrations`, `operational_metadata`, `command_idempotency`, `tickets`, `ticket_revisions`, `conversation_messages`, `operational_import_resolutions`, `recommendations`, `recommendation_revisions`, `diagnoses`, `operational_events`, `decision_trace_events`, and `learning_capture_outbox`. Add uniqueness for `(ticket_id, sequence)`, command IDs, event IDs, message IDs, outbox IDs, and delivery keys; add causal/ticket/status lookup indexes.
- [ ] **Step 4: Implement the transaction wrapper and sequence allocator.** Start every operational write unit with `BEGIN IMMEDIATE`, read the current maximum sequence for the ticket, reserve N contiguous values, and require callers to append events in the returned order. The busy timeout is only bounded retry behavior; the write lock is the concurrency mechanism. Related records store only their event ID.
- [ ] **Step 5: Implement typed append/read primitives.** Reject updates/deletes for events and traces after commit. Validate every payload with the Task 1 schemas before SQL execution. Keep timeline reads anchored to event sequence rather than timestamp sorting. Expose `close()` for runtime shutdown and test fixtures.
- [ ] **Step 6: Add the transaction-scoped workflow snapshot.** Return the canonical ticket, recommendations, events, messages, diagnoses, and a customer-reply watermark ordered by the associated operational-event sequence so Tasks 4A–4D can revalidate revision, lifecycle, approval, and reply preconditions through the same SQLite transaction.
- [ ] **Step 7: Add the two-connection concurrency regression.** Run concurrent commands against one ticket from two `OperationalSqliteStore` instances and assert no duplicate sequences, a contiguous final sequence set, and normal stale-revision rejection.
- [ ] **Step 8: Run focused tests, build, and typecheck.**

  Run: `npm test -- --run test/operational-sqlite-store.test.ts test/operational-unit-of-work.test.ts`, `npm run build`, and `npm run typecheck`

  Expected: focused tests pass and both TypeScript commands succeed.
- [ ] **Step 9: Commit.**

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
- `OperationalCommandContext` is `{ commandId: string }`; service mutations receive it explicitly rather than hiding command IDs in generated server values.

- [ ] **Step 1: Write failing idempotency tests.** Cover same command/hash replay, same command/different hash rejection, multiple event references, replay after closing/reopening SQLite, and no partial writes when a duplicate or conflict is rejected.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-idempotency.test.ts`

  Expected: FAIL because command idempotency is not implemented.
- [ ] **Step 3: Implement canonical request hashing.** Hash only the operation route/name and validated caller semantic input after normalization. Exclude server-generated UUIDs, attempt timestamps, and other retry-specific values; those values belong only to the original persisted result envelope. Include operation name so one command ID cannot be reused for a different operation.
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

## Task 4A: Persist evaluation and recommendation submissions atomically

**Files:**
- Modify: `src/triage-service.ts`
- Modify: `src/operational/unit-of-work.ts`
- Modify: `src/runtime.ts`
- Test: `test/triage-operational-evaluation.test.ts`
- Regression tests: `test/triage-service.test.ts`, `test/server-actions.test.ts`

**Interfaces:**
- Preserve the `TriageService.submit` method name and domain outcomes while adding an explicit `OperationalCommandContext` parameter.
- The evaluation write set is `recommendations` aggregate insert/update + recommendation revision + operational event + typed traces.
- The service revalidates `sourceRevision` and all causal preconditions through `OperationalUnitOfWork.readWorkflowSnapshot` inside the synchronous transaction.

- [ ] **Step 1: Write failing evaluation atomicity tests.** Assert a new recommendation aggregate row, recommendation revision, one operational event, and typed traces commit together; a failure in any one write leaves none of them persisted.
- [ ] **Step 2: Add stale-evaluation tests.** Evaluate outside the transaction, change the ticket revision or customer-reply watermark, and assert the commit is rejected without a partial recommendation or event.
- [ ] **Step 3: Run the focused tests to verify RED.**

  Run: `npm test -- --run test/triage-operational-evaluation.test.ts`

  Expected: FAIL because production evaluation still writes file-backed recommendations/audits separately.
- [ ] **Step 4: Route `TriageService.submit` and `TriageService.submitEvaluation` through one synchronous operational command boundary.** `submitEvaluation` owns the complete evaluation command: revalidate the evaluated customer-reply watermark inside the transaction, persist the new recommendation aggregate/revision, supersede any pending recommendation required by the newer evaluation, allocate all resulting event sequences contiguously in domain order, persist one semantic idempotency result, and commit once. Do not implement this as a committed `submit()` followed by a separate supersession transaction.
- [ ] **Step 5: Run focused tests and existing submit/server regressions.**

  Run: `npm test -- --run test/triage-operational-evaluation.test.ts test/triage-service.test.ts test/server-actions.test.ts`

  Expected: all tests pass with the existing recommendation contract unchanged.
- [ ] **Step 6: Commit.**

  ```powershell
  git add src/triage-service.ts src/operational/unit-of-work.ts src/runtime.ts test/triage-operational-evaluation.test.ts test/triage-service.test.ts test/server-actions.test.ts
  git commit -m "feat: persist evaluations transactionally"
  ```

## Task 4B: Migrate conversation and workflow causal reads

**Files:**
- Modify: `src/triage-service.ts`
- Modify: `src/approval-desk/workflow-read-model.ts`
- Modify: `src/approval-desk/workflow-causal-context.ts`
- Modify: `src/approval-desk/conversation-history.ts`
- Modify: `src/operational/unit-of-work.ts`
- Test: `test/operational-workflow-reads.test.ts`
- Regression tests: `test/conversation-history.test.ts`, `test/approval-desk-recommendation.test.ts`, `test/evidence-readiness.test.ts`

**Interfaces:**
- `OperationalWorkflowSnapshot.customerReplyWatermark` is `{ state: "none" }` or `{ state: "reply", timestamp, id }`.
- `customerReplyWatermarkFromSnapshot(snapshot)` uses the canonical message ID ordered by its associated operational-event sequence.
- `workflow-causal-context.ts` consumes event sequence, never array position; `conversation-history.ts` consumes `conversation_messages` bodies, never event payload bodies.

- [ ] **Step 1: Write failing workflow-read tests.** Seed message bodies separately from events and give events timestamps that disagree with sequence; assert conversation rendering, latest reply, latest support response, recommendation ordering, and stale-watermark checks use message/event references and sequence.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-workflow-reads.test.ts`

  Expected: FAIL because current reads use `event.after.body`, `event.after.customerResponse`, and audit array position.
- [ ] **Step 3: Migrate customer-reply writes.** Make `TriageService.addCustomerReply` insert the canonical customer message, allocate one event sequence, append an event containing only the message ID/reference, and append a typed trace atomically. The imported legacy message ID remains the legacy customer-reply audit ID.
- [ ] **Step 4: Replace audit-payload reads.** Update `workflow-read-model.ts`, `workflow-causal-context.ts`, and `conversation-history.ts` to query the operational snapshot, sort by event sequence, and read bodies from `conversation_messages`.
- [ ] **Step 5: Replace the watermark helper.** Update `TriageService.customerReplyWatermarkFromAudits` call sites to use the snapshot watermark while retaining a legacy adapter only for file-backed fixture tests until cutover is complete.
- [ ] **Step 6: Run focused workflow and existing conversation/evidence tests.**

  Run: `npm test -- --run test/operational-workflow-reads.test.ts test/conversation-history.test.ts test/approval-desk-recommendation.test.ts test/evidence-readiness.test.ts`

  Expected: all tests pass and stale-reply behavior remains equivalent.
- [ ] **Step 7: Commit.**

  ```powershell
  git add src/triage-service.ts src/approval-desk/workflow-read-model.ts src/approval-desk/workflow-causal-context.ts src/approval-desk/conversation-history.ts src/operational/unit-of-work.ts test/operational-workflow-reads.test.ts test/conversation-history.test.ts test/approval-desk-recommendation.test.ts test/evidence-readiness.test.ts
  git commit -m "feat: migrate workflow reads to causal operational state"
  ```

## Task 4C: Persist recommendation lifecycle and support responses

**Files:**
- Modify: `src/triage-service.ts`
- Modify: `src/operational/unit-of-work.ts`
- Modify: `src/approval-desk/http.ts`
- Modify: `src/server.ts`
- Test: `test/triage-operational-recommendation-lifecycle.test.ts`
- Regression tests: `test/approval-desk-http.test.ts`, `test/server-actions.test.ts`

**Interfaces:**
- Preserve `approve`, `reject`, `cancelApproval`, `supersedeRecommendation`, `markResponseSent`, and `approveAndMarkResponseSent` names while adding `OperationalCommandContext`.
- `markResponseSent` and `approveAndMarkResponseSent` insert a canonical support conversation message plus the response event and typed trace.

- [ ] **Step 1: Write failing lifecycle atomicity tests.** Cover approve/reject/cancel/supersede, approval field overrides, and sent support responses; assert aggregate projections, revisions, canonical messages, events, traces, and semantic result envelopes commit atomically.
- [ ] **Step 2: Add lifecycle stale/gate tests.** Use transaction-scoped snapshots to reject stale approval, response, or supersession without partial writes.
- [ ] **Step 3: Run the focused tests to verify RED.**

  Run: `npm test -- --run test/triage-operational-recommendation-lifecycle.test.ts`

  Expected: FAIL because current lifecycle methods persist recommendation files and audit records independently.
- [ ] **Step 4: Implement the service write sets.** Re-run existing approval/rejection/lifecycle gates against the in-transaction snapshot, insert/update only the relevant aggregate projection and immutable revision, create support messages where applicable, append events/traces, and persist the replay envelope.
- [ ] **Step 5: Make HTTP and MCP command IDs explicit.** HTTP mutation routes accept `Idempotency-Key`; MCP mutation tools require `commandId`; both pass the same `OperationalCommandContext` to the service.
- [ ] **Step 6: Run focused lifecycle/API regressions.**

  Run: `npm test -- --run test/triage-operational-recommendation-lifecycle.test.ts test/approval-desk-http.test.ts test/server-actions.test.ts`

  Expected: all tests pass with equivalent approval boundaries and response behavior.
- [ ] **Step 7: Commit.**

  ```powershell
  git add src/triage-service.ts src/operational/unit-of-work.ts src/approval-desk/http.ts src/server.ts test/triage-operational-recommendation-lifecycle.test.ts test/approval-desk-http.test.ts test/server-actions.test.ts
  git commit -m "feat: persist recommendation lifecycle atomically"
  ```

## Task 4D: Persist diagnosis, fix, mitigation, verification, and closure

**Files:**
- Modify: `src/triage-service.ts`
- Modify: `src/operational/unit-of-work.ts`
- Test: `test/triage-operational-diagnosis-lifecycle.test.ts`
- Regression tests: `test/diagnosis-review.test.ts`, `test/approval-desk-diagnostic-workflow.test.ts`, `test/approval-desk-http.test.ts`

**Interfaces:**
- Preserve `recordDiagnosis`, `reviewDiagnosis`, `recordFix`, `recordPlatformMitigation`, `applyDiagnosisFix`, and `closeTicket` names and domain gates.
- Each method uses the same synchronous unit of work and explicit command context.

- [ ] **Step 1: Write failing diagnosis-lifecycle atomicity tests.** Cover completed/escalated diagnosis, diagnosis review approval/rejection/revalidation, fix/platform mitigation, scoped multi-ticket fix, verification, and closure.
- [ ] **Step 2: Assert conditional ticket revisions.** A diagnosis completion gets a ticket revision only when the canonical Ticket projection changes; an immutable diagnosis/event/trace still persists when no ticket projection mutation occurs.
- [ ] **Step 3: Run the focused tests to verify RED.**

  Run: `npm test -- --run test/triage-operational-diagnosis-lifecycle.test.ts`

  Expected: FAIL because current diagnosis/fix/closure paths compensate separate file writes and direct learning calls.
- [ ] **Step 4: Implement each exact write set.** Revalidate the diagnosis, approval, fix, lifecycle, ticket revision, and reply-watermark gates through the transaction snapshot; append events in explicit domain order; allocate contiguous sequences for multi-ticket/multi-event commands; persist typed traces and replay envelopes atomically.
- [ ] **Step 5: Run focused diagnosis/lifecycle regressions.**

  Run: `npm test -- --run test/triage-operational-diagnosis-lifecycle.test.ts test/diagnosis-review.test.ts test/approval-desk-diagnostic-workflow.test.ts test/approval-desk-http.test.ts`

  Expected: all tests pass without changing evidence or diagnosis authority.
- [ ] **Step 6: Commit.**

  ```powershell
  git add src/triage-service.ts src/operational/unit-of-work.ts test/triage-operational-diagnosis-lifecycle.test.ts test/diagnosis-review.test.ts test/approval-desk-diagnostic-workflow.test.ts test/approval-desk-http.test.ts
  git commit -m "feat: persist diagnosis and verification lifecycle atomically"
  ```

## Task 5: Make learning capture durable and idempotent

**Files:**
- Create: `src/operational/learning-outbox.ts`
- Modify: `src/knowledge-evolution/learning-capture.ts`
- Modify: `src/knowledge-evolution/learning-ledger.ts`
- Modify: `src/knowledge-evolution/sqlite-learning-ledger.ts`
- Modify: `src/triage-service.ts`
- Modify: `src/operational/unit-of-work.ts`
- Modify: `src/runtime.ts`
- Test: `test/operational-learning-outbox.test.ts`
- Regression tests: `test/knowledge-learning-capture.test.ts`, `test/knowledge-learning-ledger.test.ts`, `test/knowledge-learning-ledger-sqlite.test.ts`

**Interfaces:**
- `LearningCaptureEnvelope` is a discriminated union for `diagnosis-recorded`, `diagnosis-approved`, `fix-available`, and `outcome-verified`; each variant contains only immutable facts captured at the operational commit.
- `deliverOutboxRow(row: OperationalOutboxRow): Promise<DeliveryResult>` uses `deliveryKey` as the ledger idempotency identity.
- `claimPendingOutbox(outboxId: string, claimToken: string): boolean` atomically claims a pending row; the row includes `claimedBy`/`claimedAt` or equivalent claim metadata.
- Same key/same envelope returns a no-op success; same key/different envelope rejects.
- Retryable errors keep `pending`; explicitly non-retryable errors move to `dead-letter`.

- [ ] **Step 1: Write failing outbox tests.** Cover all four existing capture mappings: diagnosis completed/escalated, approved diagnosis review, fix/platform mitigation, and verified resolved outcome. Also cover operational commit followed by learning failure, pending retry after restart, successful learning write followed by process crash before acknowledgement, same-key/different-envelope rejection, one-row/one-learning-event cardinality, and two workers racing for one pending row.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-learning-outbox.test.ts`

  Expected: FAIL because the current capture service appends directly to the ledger using the audit ID without an operational outbox.
- [ ] **Step 3: Implement the discriminated immutable envelopes.** Preserve the existing `LearningCaptureService` mappings exactly, but produce validated outbox envelopes from committed event facts. Do not reload the mutable ticket or recompute a diagnosis during retry.
- [ ] **Step 4: Remove the direct learning path from `TriageService`.** Replace `captureLearning` and its best-effort `learning-capture-failed` audit with one operational outbox intent in the same transaction; the outbox row/error metadata is the durable learning-failure observation.
- [ ] **Step 5: Add ledger delivery identity checks.** Persist/validate the delivery key and envelope hash in the learning ledger append path; identical retries no-op, conflicting payloads fail safely.
- [ ] **Step 6: Add atomic outbox claims and drain transitions.** Make startup/drain atomically claim pending rows with a claim token, increment attempts, record safe error codes, leave retryable rows pending, and move only explicitly non-retryable errors to `dead-letter`.
- [ ] **Step 7: Run focused learning tests and existing ledger tests.**

  Run: `npm test -- --run test/operational-learning-outbox.test.ts test/knowledge-learning-capture.test.ts test/knowledge-learning-ledger.test.ts test/knowledge-learning-ledger-sqlite.test.ts`

  Expected: all tests pass.
- [ ] **Step 8: Commit.**

  ```powershell
  git add src/operational/learning-outbox.ts src/knowledge-evolution/learning-capture.ts src/knowledge-evolution/learning-ledger.ts src/knowledge-evolution/sqlite-learning-ledger.ts src/triage-service.ts src/operational/unit-of-work.ts src/runtime.ts test/operational-learning-outbox.test.ts test/knowledge-learning-capture.test.ts test/knowledge-learning-ledger.test.ts test/knowledge-learning-ledger-sqlite.test.ts
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
- [ ] **Step 4: Implement aggregate import transactions.** Validate all source records first, then insert tickets, revisions, messages, recommendations, diagnoses, and events with preserved IDs. Import a decision trace only when a valid sanitized trace is already present in the source; do not fabricate historical traces. Preserve only recommendation history the source can prove—do not invent missing edits. Reconstruct event sequences from source append/audit order, never timestamp sorting, and mark imported records with legacy provenance where applicable.
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
- Modify: `src/runtime.ts`, `src/server.ts`, `src/approval-desk/http.ts`, `src/approval-desk/ui.ts`
- Modify: `README.md`, `docs/case-study.md`, `docs/roadmap.md`
- Modify: `scripts/demo-approval-desk.ts` or create `scripts/demo-operational-persistence.ts`
- Modify: `package.json`
- Test: `test/operational-runtime-parity.test.ts`

**Interfaces:**
- `createRuntimeDependencies()` returns operational SQLite-backed ticket/recommendation/audit services plus the existing learning service.
- The HTTP, MCP, UI, lifecycle replay, and demo paths all consume the same service and read models.
- HTTP mutation routes use the `Idempotency-Key` header; MCP mutation tools require `commandId`; the Approval Desk generates one UUID per user action and reuses it for transport retries.

- [ ] **Step 1: Write the parity and restart tests.** Start two runtime instances against the same operational DB, evaluate/mutate through HTTP and MCP, restart, and assert identical ticket projection, causal timeline, current recommendation, customer-reply watermark, and command replay envelope. Include concurrent same-ticket writes to prove `BEGIN IMMEDIATE` prevents duplicate sequences while domain revision checks reject stale commands.
- [ ] **Step 2: Run the focused test to verify RED.**

  Run: `npm test -- --run test/operational-runtime-parity.test.ts`

  Expected: FAIL because runtime still constructs file-backed operational repositories.
- [ ] **Step 3: Switch production runtime construction.** Keep fixture seed and knowledge roots unchanged, add `OPERATIONAL_DB_PATH` to `RuntimePaths` and startup validation, initialize SQLite before serving, and fail startup for corrupt/newer schemas. For `empty` or `import-in-progress`, start in restricted inspection/import mode and reject operational mutations rather than failing startup. Add runtime shutdown/test-fixture cleanup that closes both operational and learning SQLite handles.
- [ ] **Step 4: Thread stable command IDs through all mutation adapters.** Validate `Idempotency-Key` at HTTP boundaries, require `commandId` on MCP mutation tools, and use `crypto.randomUUID()` once per UI user action. Retry the same validated caller semantic request with the same ID; never include generated event UUIDs or server timestamps in the request hash.
- [ ] **Step 5: Add the restart/import showcase.** Demonstrate legacy import, evaluation, Decision Timeline inspection, process restart, identical reload, approval, fix, verification, closure, and separate learning reuse.
- [ ] **Step 6: Document the boundary.** README and case study must explain operational truth vs advisory learning, transactional write sets, outbox failure behavior, causal ordering, migration states, and the exact commands to initialize/import/run the showcase.
- [ ] **Step 7: Run the full verification suite.**

  Run: `npm run build`, `npm run typecheck`, `npm test`, `npm run evaluate:diagnostics`, `npm run evaluate:lifecycle-replay`, `npm run evaluate:knowledge-holdout`, `npm run demo:knowledge-evolution -- --verbose`, and `npm run verify:portfolio`.

  Expected: all existing deterministic, lifecycle, knowledge-holdout, and portfolio checks pass; the new restart/import/timeline checks are green; no production path writes legacy JSONL after cutover.
- [ ] **Step 8: Commit.**

  ```powershell
  git add src/runtime.ts src/server.ts src/approval-desk/http.ts src/approval-desk/ui.ts scripts package.json README.md docs/case-study.md docs/roadmap.md test/operational-runtime-parity.test.ts
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
