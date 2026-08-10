# Operational Persistence and Decision Observability

## Status

Draft under review; implementation not started.

## Goal

Make the governed support workflow durable and inspectable without changing
which layer has authority over ticket decisions. A ticket evaluation should
survive a process restart, preserve its audit history, and expose a concise
read-only decision timeline that explains what happened.

This is a productionization slice, not a new reasoning engine. It does not
introduce semantic search, autonomous learning, new promotion states, or a
second lifecycle implementation.

## Scope

The first slice persists mutable operational data in SQLite:

- tickets and ticket revisions;
- conversation messages and replies;
- recommendations and recommendation revisions;
- finalized diagnoses;
- operational audit events;
- sanitized decision-trace events.

Static fixtures, evidence catalogs, and test data remain file-backed. The
existing learning plane remains a separate SQLite store containing learning
events, candidates, immutable knowledge versions, and reuse projections.

The UI gains a read-only Decision Timeline embedded in ticket details. MCP,
HTTP, and UI adapters continue to call the same domain services.

## Non-goals

- dual-writing operational state to SQLite and JSONL;
- migrating fixtures or evidence catalogs;
- replacing the learning ledger with an operational database;
- making GPT or a similarity score authoritative;
- storing prompts, hidden reasoning, credentials, or raw provider payloads in
  decision traces;
- building a separate observability dashboard in this slice;
- adding semantic/vector search or new knowledge-promotion states;
- adding an OpenAI Evals integration before this local persistence boundary is
  stable.

## Authority boundary

The operational domain services remain the sole authority for:

- classification;
- evidence readiness;
- diagnosis and diagnosis approval;
- fixes and verification;
- lifecycle transitions;
- customer-facing responses.

Routes and UI components may call these services but must not write tables or
reimplement gates. The operational SQLite store records the authoritative
result of a domain action; it is not a workflow engine.

The learning store remains advisory memory. It records verified outcomes and
approved knowledge changes. The authoritative diagnosis is committed to the
operational store first. Learning capture is attempted separately after that
commit. A learning-store read or write failure produces no learned context and
no `learning.sqlite` event; the durable operational outbox intent remains,
the valid operational result remains intact, and the failure is observable.
An operational-store failure must prevent an unsafe mutation from being
reported as persisted.

## Persistence architecture

Two independent SQLite databases are used:

```text
operational.sqlite
  schema_migrations
  operational_metadata
  command_idempotency
  tickets
  ticket_revisions
  conversation_messages
  operational_import_resolutions
  recommendations
  recommendation_revisions
  diagnoses
  operational_events
  decision_trace_events
  learning_capture_outbox

learning.sqlite
  learning_events
  candidates
  knowledge_versions
  knowledge_audits
  reuse projections
```

The two stores share logical identifiers, such as ticket IDs and exact
`(objectId, sourceVersion)` references, but do not use cross-database foreign
keys. Each store has its own schema version and migration lifecycle.

The operational database path is configurable through `OPERATIONAL_DB_PATH`.
The normal local default is `data/support-ticket-triage.sqlite`; tests use
in-memory or temporary databases, and demos use disposable databases.

## Operational data model

### Tickets and revisions

`tickets` holds the current canonical ticket projection. Every mutation of
that projection creates a `ticket_revisions` row containing a full validated
`Ticket` snapshot, actor, action/event ID, revision number, and timestamp.
Revision numbers are unique per ticket. Messages, recommendations, and traces
are operational mutations too, but have their own causal records and do not
increment the ticket revision unless the canonical `Ticket` projection
changes. Full snapshots make restart and replay deterministic and avoid
introducing a patch-reconstruction engine.

### Conversation messages

`conversation_messages` stores customer and support messages with stable IDs,
message sequence, actor/source, timestamp, and message content. Message
sequence controls conversation rendering; the ticket-wide operational-event
sequence defined below controls workflow causality and Decision Timeline
ordering. Customer replies retain the watermark semantics used by
stale-evaluation and diagnosis protections.

Each customer-reply or sent-support-response operational event stores
`messageId` pointing to the canonical message and does not duplicate the
message body in its payload. During legacy import, the existing customer-reply
audit event ID may become the message ID so existing watermarks remain valid.

Conversation content is operational data and remains available to the support
workflow; it is not copied into decision traces unless a trace field
explicitly stores a sanitized catalog ID or message reference.

### Recommendations

`recommendations` contains one aggregate row per recommendation ID and its
current resolution/projection. `recommendation_revisions` preserves each
evaluated or edited recommendation payload snapshot, its actor, exact
knowledge reference when present, and corresponding ticket revision.

The “current recommendation for a ticket” is a derived read model based on
causal events and recommendation resolution. It is not an independent
workflow authority. No ticket pointer is required unless it is explicitly
maintained as a disposable projection.

Approval, rejection, supersession, and resolution authority live in
`operational_events` and are reflected in the aggregate projection. They are
not a second truth embedded as mutable approval state in a revision row.

### Finalized diagnoses

`diagnoses` stores immutable finalized `CompletedDiagnosis` records, including
the ticket revision, actor, timestamp, evidence references, and diagnosis
content required by the existing domain contract. The operational store owns
this authoritative record. Learning discovery consumes it only after the
operational transaction commits. Diagnosis review, approval, rejection, and
revalidation never mutate the diagnosis row; they are append-only operational
events and optional derived projections.

### Operational events

`operational_events` is an append-only audit stream for lifecycle actions,
approvals, rejections, diagnosis/fix actions, customer replies, and
verification outcomes. Every event has a ticket-wide monotonic causal
`sequence` and a globally unique event ID. Messages, recommendation revisions,
diagnoses, and decision traces reference their associated operational event;
the event does not store reverse foreign keys to those records. Events contain
no duplicated customer/support message bodies. Repositories expose
append/read operations, not update/delete operations after commit. Caller
retry safety is provided by the separate command/idempotency key described
below.

### Decision traces

`decision_trace_events` is an append-only, sanitized observability stream.
Each event identifies its ticket, recommendation revision when applicable,
stage, actor, outcome, safe target identifiers, its associated operational
event, and optional provider/model, latency, and token-usage metadata.

Trace payloads use discriminated, typed allowlists rather than arbitrary JSON:

- `classification-trace`;
- `evidence-trace`;
- `known-cause-trace`;
- `lifecycle-trace`;
- `provider-telemetry-trace`.

Each type accepts only identifiers, enums, counts, confidence/provenance
metadata, safe error codes, and message/evidence references appropriate to its
stage. Trace payloads must reject prompts, hidden reasoning, credentials, raw
provider payloads, machine paths, and unnecessary customer-message copies.
A trace may refer to a conversation-message ID or evidence catalog ID instead.
Trace events are non-authoritative, but transactionally required
observability: domain state never reads them to make a decision, while an
unsafe or invalid trace prevents the enclosing operational write from
committing.

### Ticket-wide causal sequence

Every `operational_events` row receives the next monotonic sequence for its
ticket inside the same transaction. Associated records reference the event:

```text
conversation_message.operationalEventId
recommendation_revision.operationalEventId
diagnosis.operationalEventId
decision_trace_event.operationalEventId
```

The unique `(ticketId, sequence)` pair is the authoritative workflow order for
the Decision Timeline. A separate message sequence may remain for rendering
conversation messages. Timestamps are descriptive metadata, not causal order.

### Persistent idempotency

`command_idempotency` makes retry semantics survive restarts:

```text
command_id PRIMARY KEY
operation
request_hash
result_type
result_id
result_reference_json
committed_at
```

The request hash is computed from a canonical normalized representation, so
JSON property ordering does not change command identity. A known command may
be short-circuited before expensive evaluation, but the command/hash check is
repeated inside the write transaction. The same command and hash returns the
original committed semantic result using an allowlisted immutable reference
envelope, not whichever projection happens to be current. The envelope may
contain `eventIds`, `recommendationRevisionId`, `ticketRevision`, `diagnosisId`,
and `messageId`. The same command with a different hash is rejected. HTTP,
MCP, and UI mutation adapters must carry the stable command ID across retries;
they must not generate a fresh command ID after a transport retry.

### Learning-capture outbox

`learning_capture_outbox` stores durable intent whenever an operational
transaction produces a verified diagnosis/outcome eligible for learning:

```text
outbox_id PRIMARY KEY
delivery_key UNIQUE
ticket_id
operational_event_id
capture_envelope_json
status: pending | delivered | dead-letter
attempt_count
last_error_code
created_at
delivered_at
```

The capture envelope is validated, immutable, and restricted to the finalized
diagnosis/outcome snapshot and its committed operational-event reference. A
retry never recalculates learning content from the current mutable ticket.
Each outbox row represents exactly one learning-ledger event in this slice.
If a future operation must produce a batch, it must use deterministic child
delivery identities (for example, `<delivery_key>:<index>`) and treat the
whole immutable batch as one idempotent delivery contract.
`delivery_key` (normally the outbox ID or a deterministic derivative of the
operational event ID) is the learning-ledger idempotency identity:

```text
same delivery key + same envelope -> no-op
same delivery key + different envelope -> reject
```

The outbox intent is committed atomically with the operational diagnosis,
event, and traces. After commit, runtime may attempt immediate delivery to
`learning.sqlite`; a failed attempt remains pending with error metadata.
Startup or an explicit drain command retries pending items. An explicitly
non-retryable failure may move an item to `dead-letter`. This is not
cross-database ACID and never makes ordinary support actions depend on
learning availability; it closes both crash windows around learning delivery.

## Transaction boundary and unit of work

Evaluation and other potentially expensive work happen outside the SQLite
write transaction:

```text
read ticket/recommendation/conversation snapshot
  -> classify, diagnose, and/or draft outside the write transaction
  -> BEGIN operational transaction
       re-check ticket revision
       re-check customer-reply watermark and causal sequence
       re-check required approval or lifecycle state
       claim/check command idempotency
       allocate one contiguous ticket-sequence range for all events
       apply the authoritative domain transition
       persist projections and immutable revisions
       persist finalized diagnosis when applicable
       append the authoritative operational event(s) in explicit domain order
       append typed, sanitized trace events
       append learning-capture intent when eligible
       persist idempotency result
     COMMIT
  -> attempt learning capture separately
```

If a causal snapshot changed, the write is rejected as stale and the caller
must reevaluate. The domain service owns the transaction composition through
an explicit operational unit of work, conceptually:

```text
operationalStore.transaction(tx => {
  tx.tickets.update(...)
  tx.recommendations.insertRevision(...)
  tx.diagnoses.insert(...)
  tx.events.append(...)
  tx.traces.append(...)
})
```

The transaction object exposes persistence primitives only; it does not own
workflow rules. If any operational persistence step fails, the transaction
rolls back and the adapter returns an error. The system must never report a
successful lifecycle change whose authoritative state, audit, or required
trace write failed.

One operational event consumes one sequence. A transaction producing N events
allocates N contiguous sequences and assigns them in explicit domain order.
Every event still has a unique `(ticketId, sequence)` pair.

The operational transaction and learning capture are deliberately separate:

```text
operational transaction commits
  -> authoritative result exists
  -> attempt learning capture
  -> success: learning event recorded
  -> failure: operational result remains valid and failure is observable
```

There is no cross-database ACID transaction, SQLite `ATTACH` workaround, or
learning-availability requirement on ordinary support actions.

`commandId`/`idempotencyKey` is supplied at mutation boundaries. The same key
with the same normalized request returns the original result; the same key
with conflicting input is rejected. Globally unique event IDs remain separate
from command IDs. Optimistic revision checks reject stale edits rather than
silently overwriting newer operator work.

The write set is explicit per domain command rather than one generic
transaction for every action:

```text
evaluation
  -> recommendation revision + operational event + typed traces

diagnosis completion
  -> immutable diagnosis
     + ticket revision/projection only if the domain transition changes the
       canonical Ticket projection
     + operational event + typed traces + learning outbox intent when eligible

customer reply
  -> canonical customer conversation message + operational event + typed trace

sent support response
  -> canonical support conversation message + operational event + typed trace

approval, fix, verification, or closure
  -> their exact ticket/recommendation projection changes
     + operational event + typed traces
```

The domain service selects the set; the operational unit of work persists it
atomically.

## Import and migration

An explicit `import:operational-data` command imports existing JSONL and
fixture-backed operational records. It supports:

- dry-run validation;
- conflict reporting;
- preservation of IDs, revision numbers, actors, and timestamps;
- idempotent reruns;
- an import summary suitable for the audit trail.

`operational_import_resolutions` is append-only metadata for explicit import
decisions. A skipped aggregate records:

```text
source_aggregate_id
resolution: skipped
reason
actor
occurred_at
import_command_id
```

SQLite becomes the single source of truth for new operational writes after the
cutover. `operational_metadata` records the cutover state:

```text
empty | import-in-progress | imported | native
```

Runtime mutations are allowed only in `imported` or `native` mode. Legacy
files are import inputs, never fallback persistence. An empty or
`import-in-progress` database must not silently make old tickets disappear or
permit live mutations against partial history.

Import first validates all inputs in dry-run mode, then commits one ticket
aggregate at a time. A conflict rejects that ticket's batch without leaving a
partial ticket history; other valid ticket aggregates may commit. Every
successful batch preserves source IDs, revision numbers, actors, timestamps,
and the source/import provenance. The database remains
`import-in-progress` until all source aggregates have imported successfully or
all conflicts have been explicitly resolved or skipped. Every explicit skip is
durable in `operational_import_resolutions` with the source aggregate ID, skip
reason, actor, timestamp, and import command/correlation ID. Only then may the
database enter `imported` mode.

Legacy operational-event sequences are reconstructed from original append or
audit order, not timestamps. This preserves existing customer-reply watermark
semantics during import.

Startup applies versioned schema migrations transactionally. A missing
database is initialized. A newer or corrupt schema fails with an actionable
error instead of being overwritten. The implementation enables foreign-key
enforcement, uses an explicit bounded busy timeout, records schema version
metadata, and indexes ticket, event, recommendation, message-sequence, and
causal lookup keys, outbox status, and command IDs. Uniqueness constraints
cover `(ticketId, sequence)`, `command_id`, event IDs, message IDs, and outbox
IDs. WAL mode may be evaluated for the runtime workload but is not a
correctness requirement.

Every new database begins in `empty` mode. An explicit
`initialize:operational-native` command transitions it to `native`; that
command refuses if recognizable legacy operational files exist until the
operator chooses import or explicitly resolves them. An imported deployment
enters `imported` mode only after every discovered source aggregate has been
imported or has a durable explicit resolution. The `empty` state and
`import-in-progress` states permit inspection and import but not operational
mutation.

## Decision Timeline UI

Ticket details gain a compact, read-only Decision Timeline. It groups events
into the existing workflow milestones:

```text
Evaluation
Evidence update
Diagnosis
Approval
Customer response
Fix or mitigation
Verification
Closure
```

Each entry shows timestamp, event type, actor, lifecycle/action outcome,
evidence IDs or missing IDs, approval/fallback reason, and exact knowledge
object/version references. Provider/model, latency, and token usage appear
only when available and safe to display.

The timeline supports simple filtering by event category and actor. It is not
editable, does not become a second action bar, and does not make decisions.
Customer message bodies remain in Conversation Context; the timeline links
to relevant message or revision IDs instead of duplicating them.

The timeline query starts from `operational_events ORDER BY sequence` and
joins revisions, messages, diagnoses, recommendations, and traces through
their event references. It does not independently merge seven tables and
sort them by timestamp.

## Error behavior

- Operational database unavailable: reject mutating actions and expose an
  actionable persistence error; do not claim the action succeeded.
- Learning database unavailable: return no learned contexts and continue
  deterministic triage, preserving the existing fail-closed learning policy.
- Learning capture failure after an operational commit: preserve the
  authoritative operational result and append/emit an observable capture
  failure; do not roll back the operational transaction.
- Import conflict: reject the conflicting ticket aggregate, preserve already
  committed valid ticket batches, and report the conflict with its stable ID.
- Stale operator revision: reject with a stale-revision result and require the
  UI/MCP caller to reload before retrying.
- Trace schema validation failure: fail the enclosing operational transaction;
  unsafe trace data must never be persisted.

## Testing strategy

The implementation must prove:

1. Evaluation persists its recommendation revision, operational event, and
   typed traces atomically.
2. Diagnosis completion persists its immutable diagnosis, plus a ticket
   revision/projection only when the canonical Ticket projection changes,
   operational event, typed traces, and outbox intent atomically.
3. Approval, fix, verification, and closure each persist their own exact
   transactional write set.
4. Expensive evaluation occurs outside the write transaction and stale
   revision/watermark changes reject the commit.
5. A restart reloads the same ticket lifecycle and Decision Timeline in
   ticket-wide causal sequence order.
6. Import preserves IDs, revisions, timestamps, and is safely rerunnable;
   native initialization refuses recognizable legacy files.
7. Conflicting duplicate command/event IDs are rejected without partial
   writes, including after restart.
8. MCP, HTTP, and UI continue to produce equivalent domain outcomes.
9. Diagnosis, fix, approval, and lifecycle gates remain centralized.
10. Operational-store failure blocks unsafe mutation.
11. Learning capture can fail after commit while the outbox remains pending
    and the operational result remains valid.
12. A crash after successful learning delivery but before outbox acknowledgement
    is safe to retry because the delivery key makes the ledger append a no-op.
13. Learning-store failure preserves deterministic triage without learned
    context.
14. Multi-event commands allocate contiguous causal sequences in explicit
    domain order.
15. Partial imports remain mutation-blocked until all conflicts are resolved
    or explicitly skipped.
16. A repeated command after restart replays its original semantic result,
    including all referenced events and revisions.
17. Operational events and decision traces have no update/delete API after
    commit.
18. Typed trace schemas exclude prompts, hidden reasoning, credentials, raw
    provider payloads, and unnecessary customer content.
19. Existing deterministic, lifecycle, knowledge-holdout, and portfolio
   suites remain green.

The showcase journey is:

```text
import legacy data
  -> evaluate a ticket
  -> inspect its Decision Timeline
  -> restart the application
  -> reload identical history
  -> approve, fix, verify, and close
  -> inspect learning reuse separately
```

## Future slices

After this boundary is stable, separate designs may cover:

- optional OpenAI Evals integration for model graders and log-backed runs;
- deployment packaging, CI/CD, health/readiness endpoints, and cloud hosting;
- retrieval or hybrid search for larger knowledge catalogs.

Those slices must consume the same operational and learning interfaces rather
than bypassing the authority boundaries defined here.
