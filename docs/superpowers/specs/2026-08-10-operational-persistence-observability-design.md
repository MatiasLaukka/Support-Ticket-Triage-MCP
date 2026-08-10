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
commit. A learning-store read or write failure produces no learned context or
learning event, but the valid operational result remains intact and the
failure is observable. An operational-store failure must prevent an unsafe
mutation from being reported as persisted.

## Persistence architecture

Two independent SQLite databases are used:

```text
operational.sqlite
  schema_migrations
  operational_metadata
  tickets
  ticket_revisions
  conversation_messages
  recommendations
  recommendation_revisions
  diagnoses
  operational_events
  decision_trace_events

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

`tickets` holds the current canonical ticket projection. Every mutable change
creates a `ticket_revisions` row containing a full validated `Ticket` snapshot,
actor, action/event ID, revision number, and timestamp. Revision numbers are
unique per ticket. Full snapshots make restart and replay deterministic and
avoid introducing a patch-reconstruction engine.

### Conversation messages

`conversation_messages` stores customer and support messages with stable IDs,
per-ticket monotonic causal sequence, actor/source, timestamp, and message
content. The sequence—not timestamp sorting alone—determines conversation
causality and Decision Timeline ordering. Customer replies retain the
watermark semantics used by stale-evaluation and diagnosis protections.

Each customer-reply operational event stores `messageId` pointing to the
canonical message. During legacy import, the existing customer-reply audit
event ID may become the message ID so existing watermarks remain valid.

Conversation content is operational data and remains available to the support
workflow; it is not copied into decision traces unless a trace field
explicitly stores a sanitized catalog ID or message reference.

### Recommendations

`recommendations` contains one aggregate row per recommendation ID and its
current resolution/projection. `recommendation_revisions` preserves each
evaluated or edited proposal, its actor, approval outcome, exact knowledge
reference when present, and corresponding ticket revision.

The “current recommendation for a ticket” is a derived read model based on
causal events and recommendation resolution. It is not an independent
workflow authority. No ticket pointer is required unless it is explicitly
maintained as a disposable projection.

### Finalized diagnoses

`diagnoses` stores immutable finalized `CompletedDiagnosis` records, including
the ticket revision, actor, timestamp, evidence references, and diagnosis
content required by the existing domain contract. The operational store owns
this authoritative record. Learning discovery consumes it only after the
operational transaction commits.

### Operational events

`operational_events` is an append-only audit stream for lifecycle actions,
approvals, rejections, diagnosis/fix actions, customer replies, and
verification outcomes. Event IDs are globally unique. Caller retry safety is
provided by the separate command/idempotency key described below.

### Decision traces

`decision_trace_events` is an append-only, sanitized observability stream.
Each event identifies its ticket, recommendation revision when applicable,
stage, actor, outcome, safe target identifiers, and optional provider/model,
latency, and token-usage metadata.

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
       apply the authoritative domain transition
       persist projections and immutable revisions
       persist finalized diagnosis when applicable
       append the authoritative operational event
       append typed, sanitized trace events
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

## Import and migration

An explicit `import:operational-data` command imports existing JSONL and
fixture-backed operational records. It supports:

- dry-run validation;
- conflict reporting;
- preservation of IDs, revision numbers, actors, and timestamps;
- idempotent reruns;
- an import summary suitable for the audit trail.

SQLite becomes the single source of truth for new operational writes after the
cutover. `operational_metadata` records the cutover state:

```text
empty | imported | native
```

Runtime mutations are allowed only in `imported` or `native` mode. Legacy
files are import inputs, never fallback persistence. An empty SQLite database
must not silently make old tickets disappear because an import was skipped.

Import first validates all inputs in dry-run mode, then commits one ticket
aggregate at a time. A conflict rejects that ticket's batch without leaving a
partial ticket history; other valid ticket aggregates may commit. Every
successful batch preserves source IDs, revision numbers, actors, timestamps,
and the source/import provenance.

Startup applies versioned schema migrations transactionally. A missing
database is initialized. A newer or corrupt schema fails with an actionable
error instead of being overwritten. The implementation enables foreign-key
enforcement, uses an explicit bounded busy timeout, records schema version
metadata, and indexes ticket, event, recommendation, message-sequence, and
causal lookup keys. WAL mode may be evaluated for the runtime workload but is
not a correctness requirement.

An explicitly initialized new deployment enters `native` mode after schema
creation. An imported deployment enters `imported` mode only after a
successful import batch. The `empty` state permits inspection and import but
not operational mutation.

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

1. Evaluation persists recommendation, finalized diagnosis when applicable,
   audit, and trace records atomically.
2. Expensive evaluation occurs outside the write transaction and stale
   revision/watermark changes reject the commit.
3. A restart reloads the same ticket lifecycle and Decision Timeline in causal
   sequence order.
4. Import preserves IDs, revisions, timestamps, and is safely rerunnable.
5. Conflicting duplicate command/event IDs are rejected without partial
   writes.
6. MCP, HTTP, and UI continue to produce equivalent domain outcomes.
7. Diagnosis, fix, approval, and lifecycle gates remain centralized.
8. Operational-store failure blocks unsafe mutation.
9. Learning capture failure leaves the committed operational result valid and
   observable.
10. Learning-store failure preserves deterministic triage without learned
   context.
11. Typed trace schemas exclude prompts, hidden reasoning, credentials, raw
   provider payloads, and unnecessary customer content.
12. Existing deterministic, lifecycle, knowledge-holdout, and portfolio
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
