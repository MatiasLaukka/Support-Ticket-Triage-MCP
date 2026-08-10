# Operational Persistence and Decision Observability

## Status

Design approved in conversation; implementation not started.

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
approved knowledge changes. A learning-store read failure produces no learned
context while deterministic triage continues. An operational-store failure
must prevent an unsafe mutation from being reported as persisted.

## Persistence architecture

Two independent SQLite databases are used:

```text
operational.sqlite
  tickets
  ticket_revisions
  conversation_messages
  recommendations
  recommendation_revisions
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
creates a `ticket_revisions` row with the actor, revision number, timestamp,
and the domain-approved change. Revision numbers are unique per ticket.

### Conversation messages

`conversation_messages` stores customer and support messages with stable IDs,
sequence/order, actor/source, timestamp, and message content. Conversation
content is operational data and remains available to the support workflow; it
is not copied into decision traces unless a trace field explicitly stores a
sanitized catalog ID or message reference.

### Recommendations

`recommendations` identifies the current recommendation for a ticket.
`recommendation_revisions` preserves each evaluated or edited proposal, its
actor, approval outcome, exact knowledge reference when present, and the
corresponding ticket revision.

### Operational events

`operational_events` is an append-only audit stream for lifecycle actions,
approvals, rejections, diagnosis/fix actions, customer replies, and
verification outcomes. Event IDs are globally unique and idempotent.

### Decision traces

`decision_trace_events` is an append-only, sanitized observability stream.
Each event identifies its ticket, recommendation revision when applicable,
stage, actor, outcome, safe target identifiers, and optional provider/model,
latency, and token-usage metadata.

Trace payloads must reject prompts, hidden reasoning, credentials, raw provider
payloads, machine paths, and unnecessary customer-message copies. A trace may
refer to a conversation-message ID or evidence catalog ID instead.

## Transaction boundary

Every mutating domain action uses one operational transaction:

```text
validate actor and input
  -> apply the authoritative domain transition
  -> persist the ticket/recommendation revision
  -> append the operational audit event
  -> append sanitized decision-trace events
  -> commit
```

If any persistence step fails, the transaction rolls back and the adapter
returns an error. The system must never report a successful lifecycle change
whose audit or trace write failed.

Idempotency keys and unique event/action IDs make retries safe. Repeating an
identical action is a no-op; reusing an ID with conflicting content is
rejected. Optimistic revision checks reject stale edits rather than silently
overwriting newer operator work.

## Import and migration

An explicit `import:operational-data` command imports existing JSONL and
fixture-backed operational records. It supports:

- dry-run validation;
- conflict reporting;
- preservation of IDs, revision numbers, actors, and timestamps;
- idempotent reruns;
- an import summary suitable for the audit trail.

SQLite becomes the single source of truth for new operational writes after the
cutover. There is no silent JSON fallback for mutations. Existing file data
remains available as an import source and as static fixture input until the
explicit migration has been run.

Startup applies versioned schema migrations transactionally. A missing
database is initialized. A newer or corrupt schema fails with an actionable
error instead of being overwritten.

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
- Import conflict: reject the conflicting record, preserve already committed
  valid records, and report the conflict with its stable ID.
- Stale operator revision: reject with a stale-revision result and require the
  UI/MCP caller to reload before retrying.
- Trace sanitization failure: fail the enclosing operational transaction;
  unsafe trace data must never be persisted.

## Testing strategy

The implementation must prove:

1. Evaluation persists recommendation, audit, and trace records atomically.
2. A restart reloads the same ticket lifecycle and Decision Timeline.
3. Import preserves IDs, revisions, timestamps, and is safely rerunnable.
4. Conflicting duplicate IDs are rejected without partial writes.
5. MCP, HTTP, and UI continue to produce equivalent domain outcomes.
6. Diagnosis, fix, approval, and lifecycle gates remain centralized.
7. Operational-store failure blocks unsafe mutation.
8. Learning-store failure preserves deterministic triage without learned
   context.
9. Trace sanitization excludes prompts, hidden reasoning, credentials, raw
   provider payloads, and unnecessary customer content.
10. Existing deterministic, lifecycle, knowledge-holdout, and portfolio
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
