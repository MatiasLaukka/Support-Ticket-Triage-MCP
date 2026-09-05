# Support Ticket Triage — Reliability Slice R1

Status: proposed design for implementation review  
Date: 2026-09-05  
Baseline: main, caaf00917447b32f0b9928c49dd6a572abe8e4f7  
Repository: https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP

## 1. Objective and scope

Make the existing operational workflow reliable across subsystem boundaries: a diagnosis recorded through the normal application can support governed knowledge discovery; a committed command can be recovered safely after a lost response; learning delivery progresses while the application stays open; expected failures produce actionable errors.

This design addresses findings 1–5 of the accompanying architecture review. It is a focused integration repair inside the existing TypeScript/Node modular monolith. SQLite remains authoritative for operational state, with the separate learning SQLite database remaining advisory.

### Included

- Operational diagnosis input for knowledge discovery and promotion validation.
- Stable caller-command identity, replay before evaluation, and explicit semantic hashing.
- Safe treatment of existing idempotency records during schema upgrade.
- Runtime-owned ongoing outbox delivery and orderly shutdown.
- Shared public error classification for HTTP and MCP.
- Minimal Approval Desk retry/reconciliation behavior.
- Integration tests that use production runtime composition.

### Deferred

- Queue-query optimization, the measured 91-snapshot read problem, and wholesale read-model cutover.
- Removal of all legacy repositories or splitting the entire TriageService.
- UI framework adoption, layout redesign, and a general browser-test project.
- New diagnosis taxonomy, lifecycle phases, retrieval algorithms, or external integrations.
- Automatic knowledge promotion, revocation of already-promoted knowledge, or distributed transactions across the two databases.

These deferred items remain valid follow-up work; they are not completion criteria for R1.

## 2. Design choice

Three approaches were considered:

| Approach | Trade-off | Decision |
|---|---|---|
| Repair runtime boundaries with narrow adapters and one command orchestration path | Addresses reproduced failures with limited structural change | Adopt |
| Mirror operational diagnoses into legacy JSON and add retry exceptions | Preserves current wiring but creates duplicate truth and fragile replay rules | Reject |
| Rebuild all workflow reads, commands, and frontend state together | Could reduce complexity eventually, but obscures whether reliability fixes work | Defer |

Implementation must retain existing human approvals, evidence requirements, revision checks, causal ordering, diagnosis recovery, and knowledge version pinning. The AI provider remains advisory. Fixing knowledge visibility must not grant new authority to diagnoses or candidates.

## 3. Observed baseline

The review reproduced:

1. Successful HTTP diagnosis creation produced one SQLite diagnosis, zero diagnoses in the repository consumed by knowledge discovery, and zero discovery candidates.
2. Identical deterministic HTTP evaluation body and Idempotency-Key produced 201 followed by 500 when the server clock advanced.
3. A diagnosis outbox event remained pending during the session and was delivered after restart.
4. Two mitigation commands differing only in business eventId produced the same request hash.
5. An explicit IDEMPOTENCY_CONFLICT reached clients as a generic unexpected error.

The baseline build and typecheck passed. The complete test run had 1,869 passes and three timeouts; all 44 tests in the affected three files passed when rerun with one worker. These timeouts are not established functional defects.

## 4. Required invariants

- **R1-A — One operational truth:** Operational diagnosis history is read from SQLite in the normal runtime; no new JSON mirror or fallback hides a missing record.
- **R1-B — Stable command identity:** The operation and validated caller intent determine replay identity. Generated timestamps, IDs, model output, latency, and usage do not.
- **R1-C — One committed outcome per key:** A command key can commit at most one semantic operational outcome. Changed intent under that key conflicts.
- **R1-D — Atomic receipt:** Operational writes, immutable command result, and required outbox intent commit together.
- **R1-E — Historical result, current view:** A replay returns the original command result. Any accompanying lifecycle projection describes current authoritative state and may differ from the original response.
- **R1-F — Advisory isolation:** Learning failure cannot roll back or turn a committed ticket action into failure.
- **R1-G — Immutable history:** Rejection, invalidation, replay, migration, and retries do not rewrite prior diagnoses, events, or approved knowledge versions.
- **R1-H — No network in write transactions:** Provider work never occurs inside a SQLite transaction.
- **R1-I — Safe recovery:** No client automatically substitutes a new command key after an uncertain outcome.

## 5. Diagnosis-to-knowledge integration

### 5.1 Read boundary

Replace KnowledgeEvolutionService's concrete JSON-repository dependency with a narrow completed-diagnosis source. Its list operation returns the existing CompletedDiagnosis representation; it does not expose save/remove methods.

Provide two explicit compositions:

- Normal operational runtime: read OperationalDiagnosisRecord rows and map record.diagnosis, preserving diagnosis ID, ticket ID, evidence references, and completion time.
- Explicit legacy fixture mode: retain the existing JSON source for compatibility tests.

A failed operational read must surface an error. It must not silently switch to JSON or return an empty success result. Do not change the original diagnosis review representation used by HTTP/MCP.

### 5.2 Eligibility and history

Discovery consumes a derived view of eligible diagnoses, not mutable copies of their history:

| Operational state | Discovery/promotion treatment |
|---|---|
| Completed working diagnosis with no subsequent disqualifying state | May support an advisory candidate under existing discovery rules |
| Awaiting human review | Candidate remains advisory; this does not bypass any review or promotion gate |
| Rejected or explicitly invalidated diagnosis | Exclude from new supporting evidence |
| Escalated/inconclusive diagnostic investigation | Do not represent it as a completed reusable cause |
| Explicitly stale under existing diagnosis-authority rules | Exclude until those rules permit reuse |
| Ineffective fix | Do not infer that the diagnosis itself is invalid; apply existing invalidation and evidence rules |

Use existing causal/authority helpers; do not create a competing timestamp-based state machine. Existing records and candidate history remain readable.

Discovery, candidate drafting, and promotion reference validation must use this same source. Promotion must re-read eligible support at its decision boundary; a candidate whose required supporting diagnosis has become ineligible must fail with an actionable stale-support error. It must not silently remove the support and approve a materially different object.

This is a check against the operational snapshot used for the promotion decision, not a claim of cross-database transactional atomicity. Subsequent invalidation does not retroactively delete or rewrite an approved object in this slice.

### 5.3 Integration proof

Use two synthetic tickets with genuinely matching completed diagnoses to test alert/discovery thresholds. Record them through production runtime actions, discover a candidate without JSON setup, complete existing human promotion requirements, and prove a later eligible ticket can retrieve the promoted object through the current reuse path. Do not lower thresholds to make the test pass.

## 6. Command identity and replay

### 6.1 Caller intent and execution data

Introduce a shared application-level command boundary used by both transports. HTTP headers and MCP commandId remain transport representations of the same identity.

Normalize and validate caller input once. Materialize schema defaults. Hash a versioned object consisting of operation plus its explicit semantic request.

For evaluate-ticket, semantic intent includes ticketId, actor, requested AI preference, requested response style, and any caller-supplied reply data accepted by that transport. Preserve caller reply identifiers, timestamps, ordering, and content because they affect the requested evaluation. Exclude server-selected providers/configuration and generated evaluation output.

For other operational commands, retain every caller-supplied business field, including selected platform eventId, diagnosis/fix/recommendation IDs, expected revisions, evidence watermarks, approved fields, edits, scope, and rationale. Expected revisions/watermarks explicitly supplied by callers remain semantic; snapshots acquired by the server during execution do not become retry identity.

Each operation owns a small semantic projector. The canonical serializer handles ordinary validated JSON deterministically, including object-key ordering, but does not recursively discard fields by name. Preserve array order unless that operation explicitly defines and tests the array as a set. Transport metadata lives outside the semantic object.

The service must construct these projectors; transports must not supply an arbitrary trusted hash that could describe a different mutation.

### 6.2 Processing sequence

1. Validate the transport envelope, command key, and normalized caller intent.
2. Read the durable command receipt before provider calls or mutable workflow preconditions.
3. If the key exists with matching supported identity, reconstruct and return the immutable result.
4. If the key exists for different intent/operation, return IDEMPOTENCY_CONFLICT without provider work or writes.
5. For a new key, acquire runtime-local in-flight coordination keyed by database/runtime identity and command ID. Same key/same intent joins the same promise; same key/different intent conflicts.
6. Read required current source state and run the existing evaluation/decision logic outside a transaction.
7. Inside one short transaction, recheck the receipt, validate existing source revision and conversation watermark requirements, and commit the existing write set plus receipt.
8. Return the operation result and refresh lifecycle through the existing authoritative path.
9. Remove in-flight coordination in a finally path. Failed uncommitted work does not become a successful receipt.

Apply receipt lookup at the caller-command boundary for every operational mutation in this slice, not only evaluation. In particular, record-diagnosis, fix, and closure adapters must not derive fresh semantic input from current state before a committed replay is recognized. Share this dispatch behavior while leaving existing domain handlers responsible for new-command validation. Advisory knowledge-candidate mutations retain their existing separate version/approval contract and are not being moved into operational receipts.

For different command keys targeting the same ticket, preserve the existing evaluation guard behavior. The in-flight coordinator is runtime-owned and cannot be a global map keyed only by ticket ID.

The final transaction is the concurrency authority across HTTP/MCP processes. Two processes may both perform advisory generation before one sees the other's committed receipt; only one operational outcome may commit. R1 guarantees no repeated provider work for a committed replay and same-process joined requests. It does not promise exactly-once external provider execution after process crashes or across concurrent processes.

A failed source-state check commits no operational result and returns STALE_APPROVAL. It does not silently evaluate again against new state.

### 6.3 Result reconstruction

Reconstruct receipt results from immutable result data or immutable revision references, never current mutable projections. Do not rerun buildRecommendation, current diagnosis eligibility, or stale approval checks before accepting an already-committed replay.

Retain existing successful response shapes where possible. The returned original recommendation may historically be pending even if it is now superseded; the refreshed lifecycle/current ticket read governs what the UI may do next.

If a command committed but the connection or subsequent read failed, its receipt must remain usable. A retry must not repeat the mutation. The UI must not treat historical replay fields as newer current state.

Preserve explicitly derived child-command identities used by existing composite adapters, such as the simulated customer reply after marking a response sent. If the parent committed and a required child did not, retry may resume that child using its stable derived key and the parent's persisted result. It must neither duplicate a completed child nor silently skip an incomplete one. Do not claim these separate commits are one transaction.

### 6.4 Existing receipt compatibility

The reviewed operational schema is version 3. Add a versioned additive migration through the existing migration framework; on an unchanged baseline the next schema version is 4.

Add a constrained request-hash-version field to command_idempotency. Existing rows are version 1; new commands use version 2. Preserve existing hashes, result JSON, command IDs, and causal records byte-for-byte where no schema serialization requires otherwise. Update schema validation and import/reset fixtures consistently.

Version-1 receipts lack a reliably recoverable caller-intent contract. Requests reusing a version-1 key must return LEGACY_REPLAY_UNAVAILABLE (409) before provider work or mutation. Do not compare a version-2 hash against a version-1 hash, guess equivalence, delete the old receipt, or automatically issue a new key.

The message must say the key belongs to an earlier command format and direct the operator to reconcile current ticket/history before deciding on a new action. Historical reads remain available. Version-2 commands work without resetting the database.

This is an explicit compatibility boundary: improved replay guarantees apply to version-2 commands; older command history remains preserved but automatic retry is intentionally unavailable.

If implementation starts after other schema migrations, use the next available schema version while preserving this hash-version contract. Unknown future schemas still fail closed. Downgrading an upgraded database is unsupported; preserve the existing backup/restore guidance.

## 7. Ongoing learning delivery

### 7.1 Runtime ownership and scheduling

Own one delivery runner per RuntimeDependencies instance. Reuse LearningOutboxWorker's durable delivery keys, claims, lease recovery, and dead-letter behavior.

Defaults for this slice:

- Initial bounded delivery pass when learning is available.
- Idle poll interval: 1 second.
- At most 25 rows processed per pass.
- Retry backoff per failed row: 1, 2, 4, 8, 16, then 30 seconds, capped at 30 seconds.
- No overlapping passes within one runner.
- Timers are unref'd so they alone do not keep the process alive.

Inject time, scheduling, and backoff behavior for deterministic tests. Select due rows with a bounded store query; do not load the entire outbox each second and slice it in memory. Continue to other due rows when an earlier row is backed off.

A runtime-local retry schedule is sufficient for R1; it may restart from the minimum delay after a process restart. Durable claims and delivery keys remain authoritative across workers. A post-commit wake-up can reduce latency but is optional; polling must guarantee progress without it.

### 7.2 Failure behavior

- A valid new event is attempted within two poll intervals on an idle healthy runtime.
- Transient failures release the claim for retry and preserve the event.
- Existing terminal validation/conflict conditions dead-letter the row.
- Ledger commit followed by a crash before outbox acknowledgement is recovered as duplicate delivery, not a second learning event.
- A fresh unexpired claim is not stolen; expired claims are recoverable.
- Learning unavailable at startup retains the existing explicit unavailable mode and remediation. Hot-reopening an unavailable ledger is outside scope.
- Unexpected runner failures are caught, safely reported, and scheduled for bounded retry; no unhandled promise rejection.
- No failure in this runner changes an already returned operational success.

### 7.3 Shutdown

Make orderly runtime cleanup awaitable: close(): Promise<void>, idempotent for repeated callers. Update runtime consumers, HTTP/MCP entrypoints, scripts, and affected test cleanup to await it.

Stop new passes, cancel timers, allow the current claimed delivery to settle, then close learning and operational stores and release the usage lease. The local delivery operation must not contain unbounded network work.

SIGINT/SIGTERM and normal transport/server closure use awaited shutdown. Do not rely on an asynchronous process exit handler. Abrupt termination need not drain the queue; committed intents and claim leases provide restart recovery.

## 8. Public error contract and UI recovery

Classify errors once in a shared module consumed by HTTP and MCP. Preserve existing domain codes where already appropriate.

| Condition | Public code | HTTP | Automatic handling |
|---|---|---:|---|
| Invalid caller input | INVALID_REQUEST | 400 | Correct input |
| Same key, different intent | IDEMPOTENCY_CONFLICT | 409 | Reconcile; never substitute a key automatically |
| Version-1 key reuse | LEGACY_REPLAY_UNAVAILABLE | 409 | Inspect current history before a new action |
| Stale revision/source snapshot | STALE_APPROVAL | 409 | Refresh; require a new deliberate action |
| Required diagnosis support became ineligible | KNOWLEDGE_SUPPORT_STALE | 409 | Refresh candidate/support and review again |
| Existing ticket evaluation guard | EVALUATION_IN_PROGRESS | 409 | Preserve existing wait/refresh behavior |
| Missing ticket/recommendation | Existing specific NOT_FOUND code | 404 | Refresh |
| Operational initialization/import incomplete | OPERATIONAL_NOT_READY | 503 | Explicit initialization/import remediation |
| Classified transient persistence failure | REPOSITORY_ERROR | 503 | Retry same frozen command with bounded delay |
| Schema corruption, invalid stored state, sequence invariant failure | OPERATIONAL_INTEGRITY_ERROR | 500 | Stop blind retry; report safe remediation |
| Unexpected programming failure | Existing transport unexpected-error code | 500 | Log internally and reconcile outcome |

MCP returns isError: true and the same stable public code/message; it does not invent HTTP semantics. Do not expose SQL, database paths, stack traces, provider credentials, or raw payloads in public errors. Do not classify every OperationalStoreError as a retryable outage.

### Minimal Approval Desk behavior

Retain a frozen path/body/key for an action whose outcome is uncertain. An explicit retry reuses all three. Prevent duplicate gestures while it is in flight. After a committed result is recovered, perform an authoritative refresh before enabling the next lifecycle action.

If the operator edits input, first reconcile the uncertain prior outcome; treat changed intent as a new deliberate action only after that reconciliation. Do not mint another UUID merely because requestJson was called again.

No automatic replay across page reload is required for R1. After reload, refresh authoritative state; HTTP/MCP callers retaining the original version-2 key can still recover the receipt. The service-level restart guarantee must not depend on browser memory.

## 9. Implementation boundaries and order

Proposed small modules may be renamed to fit repository conventions; their responsibilities must remain separate.

| Stage | Existing areas | Deliverable |
|---|---|---|
| 1. Receipt identity and migration | operational/idempotency.ts, domain.ts, sqlite-store.ts, unit-of-work.ts | Version-2 semantic hashing, receipt lookup, additive migration, compatibility tests |
| 2. Command orchestration and errors | triage-service.ts, server.ts, approval-desk/http.ts, errors.ts; proposed operational-command-dispatch.ts, evaluation-command.ts, and command-errors.ts | Shared caller-command dispatch, evaluation entrypoint, early replay, atomic commit recheck, stable transport errors |
| 3. Diagnosis source | runtime.ts, operational/runtime-repositories.ts, knowledge-evolution/service.ts; proposed completed-diagnosis-source.ts | Operational discovery/promotion input with existing authority semantics |
| 4. Delivery lifecycle | operational/learning-outbox.ts, runtime.ts, index.ts, approval-desk.ts; proposed learning-delivery-runner.ts | Bounded ongoing delivery and awaited cleanup |
| 5. Client reconciliation and integration gates | approval-desk/ui.ts, test/ integration files, README reliability notes | Frozen retry intent and complete end-to-end proof |

Use the existing transaction infrastructure. Do not add a second independent receipt store or let HTTP and MCP maintain separate replay implementations. Audit every operational command's semantic projection; special attention is required for nested event IDs and server-generated command timestamps.

Stages are reviewable increments of one reliability slice. Add the targeted failing reproduction before each repair. This document specifies behavior and contracts; it is not authorization to implement or publish changes.

## 10. Acceptance matrix

All tests use temporary state, synthetic data, and deterministic or controlled providers. No API key or paid call is required.

| ID | Scenario | Required result |
|---|---|---|
| A1 | Normal runtime creates operational diagnoses | Discovery sees exact operational identities without JSON writes; restart preserves them |
| A2 | Matching diagnoses → discovery → human promotion → later reuse | Existing thresholds and approval rules pass; promoted version appears through the normal reuse path |
| A3 | Rejection/invalidation/staleness before promotion | Original history remains; ineligible support cannot authorize promotion; ineffective fix alone is not automatic diagnosis invalidation |
| A4 | Same evaluation body/key after clock advance and after restart | Same immutable operation result; no new recommendation, trace, event, or outbox row |
| A5 | Controlled provider would change output on another call | Committed replay does not call it again; provider invocation count is asserted |
| A6 | Same key/changed body or different operation | Conflict before provider work and without mutation; test platform eventId explicitly |
| A7 | Same-process concurrent retries | One execution; same result for joined callers; changed intent conflicts |
| A8 | Separate runtimes race the same key against one database | At most one committed outcome; duplicate advisory generation is allowed and not misreported as exactly-once |
| A9 | Source changes during provider work; failure before commit | Source conflict/failure leaves no partial receipt or write set; no success claimed |
| A10 | Commit succeeds but response is lost; ticket subsequently advances | Retry recovers original result; current lifecycle remains authoritative |
| A11 | Healthy runtime records learning event after startup | Delivery occurs without restart within the scheduling contract |
| A12 | Transient/terminal delivery failure, expired claim, commit-before-ack crash | Backoff/retry, dead letter, claim recovery, and deduplicated ledger effects respectively |
| A13 | Shutdown while delivery is active; repeated close | Timers stop, cleanup awaits delivery, no closed-database writes, lease released once |
| A14 | Learning store unavailable | Operational actions succeed with pending intents; knowledge operations remain explicitly unavailable |
| A15 | HTTP/MCP equivalent domain/storage failures | Same public code and safe meaning; HTTP statuses match the table |
| A16 | Existing schema-3 database upgraded | History preserved; old key returns explicit compatibility error; new key supports replay; restart remains valid |
| A17 | UI uncertain response and explicit retry | Same frozen body/key reused; new actions remain gated until authoritative reconciliation |
| A18 | Normal closure and failed-fix recovery | Existing lifecycle, evidence gates, approvals, taxonomy revisions, and pinned knowledge behavior remain intact |
| A19 | Replay each operational mutation after later state changes; interrupt parent/child demo action between commits | Original parent result recovered without revalidating obsolete preconditions; missing child resumes once with stable identity; completed child is not duplicated |

A2 must begin with createRuntimeDependencies in operational mode. Manually inserting JSON diagnoses, patching dependencies to legacy stores, or replacing the shared application service invalidates that acceptance test.

Use barriers for concurrent tests and injected clocks/schedulers for delivery tests. Real sleeps and broad timeout increases must not substitute for deterministic synchronization.

## 11. Verification and definition of done

Before implementation, confirm the actual target branch/commit and read applicable repository instructions. If these defects have already changed, reconcile the spec against observed behavior and preserve its contracts rather than reapplying stale patches.

Required final verification:

- Build and typecheck.
- New acceptance tests A1–A19 and affected transaction, migration, replay, learning, transport, UI, and knowledge tests.
- Full suite with an explicit worker budget if necessary; report the exact command and all failures.
- Existing deterministic lifecycle replay and knowledge-holdout evaluations.
- Inspect the final diff for accidental legacy fallback, duplicate persistence, provider calls in transactions, swallowed errors, leaked timers, and altered approval semantics.

A passing unit suite alone is insufficient. Completion requires the production-composition discovery/reuse scenario, lost-response recovery scenario, and in-session learning-delivery scenario to pass.

Delivery summary must identify the implemented commit, schema transition, test results, remaining limits, and deferred read-performance/UI refactors. Do not claim general exactly-once AI execution or real-browser validation unless separately demonstrated.
