# Governed Knowledge Learning Loop

**Status:** Approved design
**Date:** 2026-08-07

## Goal

Extend the support system into a human-governed, self-improving knowledge system. The system should learn reusable operational patterns from verified support outcomes, propose versioned knowledge objects, and let an operator decide when a version becomes active for future evaluations.

“Self-learning” means governed knowledge improvement. It does not mean autonomous model retraining, autonomous policy changes, or unsupervised customer-facing action.

## Non-goals for the first implementation slice

- retraining or fine-tuning the classifier or GPT model;
- automatic promotion of a candidate;
- automatic outbound customer messaging, closure, or fix execution;
- replacing every existing JSON store with SQLite in one migration;
- semantic/vector retrieval before the learning contracts and evaluation loop are reliable.

## 1. Authority boundary and data flow

The system has two planes.

### Operational plane

The operational plane owns tickets, conversations, classification, evidence gating, diagnosis, fix/mitigation actions, verification, and lifecycle transitions. The existing deterministic domain services remain authoritative. Approval Desk UI, MCP tools, and the Codex Skill call the same workflow functions.

### Learning plane

The learning plane records finalized diagnoses, evidence, outcomes, feedback, candidate patterns, versions, and evaluation runs. It proposes knowledge evolution but cannot directly change a live ticket or workflow.

The governed loop is:

```text
Ticket lifecycle
      -> verified outcome event
      -> learning ledger
      -> deterministic pattern discovery
      -> candidate knowledge object
      -> optional GPT parameter draft
      -> human review and promotion
      -> versioned active knowledge object
      -> future-ticket recommendation
      -> new verified outcome
```

Candidate suggestions, confidence, provenance, and revision proposals are advisory. Only the central workflow authority, explicit human approval, and a versioned active object can affect future ticket behavior.

## 2. Learning ledger and state model

The learning ledger is initially a durable, queryable history for knowledge evolution. It is not the operational ticket database in the first slice.

Maturity and health are separate axes.

### Maturity

- `observed`: deterministic similarity found a possible pattern; no future influence;
- `diagnosis-supported`: an operator-approved diagnosis supports the pattern; weak candidate suggestion;
- `outcome-verified`: a governed fix or mitigation succeeded and was confirmed by the customer or by a verified technical outcome; eligible for human promotion review;
- `reuse-validated`: later tickets reused the pattern without operator correction; strong promotion signal;
- `promoted`: an operator explicitly activated a specific immutable version for future evaluations.

### Health

- `active`;
- `stale`;
- `contradicted`;
- `deprecated`;
- `superseded`.

The axes are independent. For example, an object can be `outcome-verified + active` or `reuse-validated + stale`.

Stale and contradicted records remain in immutable history. They may contribute a decayed signal to recurrence detection, but they cannot bypass evidence gates, change routing by themselves, or activate a workflow. A later recurrence requires fresh supporting evidence and human review.

## 3. Evidence and promotion policy

Learning evidence must be stronger than similarity or an unverified GPT suggestion.

A reusable pattern is supported by:

1. an operator-approved diagnosis;
2. a successful governed fix or mitigation;
3. either customer confirmation or a verified technical outcome;
4. optionally, repeated later reuse without operator correction, which strengthens the signal.

GPT-generated candidates are advisory evidence only. GPT may draft a name, description, evidence requirements, workflow parameters, customer-safe explanation, and article references. It may not create executable code, change lifecycle state, or promote itself. Deterministic schema validation and safe fallback remain authoritative.

Open tickets may corroborate wording, timing, or scope, but cannot by themselves promote a knowledge object.

Failed or contradictory reuse records an `unsuccessful-reuse` or `contradicted` outcome, reduces recommendation confidence, and opens a review or revision path. It does not silently delete or deactivate the active object.

## 4. Versioning and reuse

Knowledge-object versions are immutable. Edits always create a new draft version; the active version remains unchanged until an operator explicitly approves the replacement.

Recommendations are pinned to the exact version that produced them:

- new evaluations use the latest active version;
- in-progress tickets remain pinned to their evaluated version;
- an explicit re-evaluation is required to move an in-progress ticket to a newer version;
- historical recommendations and audit records never change retroactively.

Promotion, rollback, deprecation, supersession, and revision approval are explicit, attributed, and auditable.

## 5. Storage boundary and migration path

The learning domain depends on a `LearningLedger` repository interface rather than on SQLite-specific code. Initial adapters may include:

- an in-memory or JSON adapter for deterministic tests and replay;
- a SQLite adapter for durable local runs.

Contract tests must run against every adapter.

The initial SQLite scope is the learning ledger. Logical records include:

- diagnosis and evidence references;
- outcome and verification records;
- operator feedback and review decisions;
- knowledge candidates and immutable versions;
- knowledge-object usage and reuse outcomes;
- promotion, rollback, stale, contradiction, and deprecation events;
- evaluation runs and metric snapshots.

An append-oriented event model may have projections for candidate and object queries. Event IDs are stable and idempotent. Promotion and version creation are transactional. A failed write cannot leave a half-promoted object.

Structured evidence IDs, sanitized summaries, and provenance should be stored in the learning ledger. Raw customer transcripts should not be copied into the ledger by default; existing operational conversation storage remains the source for authorized inspection.

Later, tickets, conversations, audit history, and replay snapshots can migrate to SQLite behind the same repository interfaces. Migration must preserve stable IDs, timestamps, version pins, and historical meaning.

## 6. Failure handling and UI behavior

If GPT is unavailable or produces an invalid draft:

- retain the deterministic candidate;
- record provider status and failure provenance;
- keep ordinary ticket triage available;
- do not promote the invalid draft.

If SQLite or learning capture is unavailable:

- do not change the operational lifecycle;
- keep ticket handling available;
- record learning capture as failed or pending;
- expose the loss in audit or health status;
- never claim that an outcome was recorded when it was not.

The Approval Desk should show a compact candidate summary containing maturity, health, supporting diagnoses and tickets, evidence and match reasons, outcome verification, contradictions, stale signals, and the exact version under review. Details remain expandable. Candidate actions are explicit and bounded: approve, refresh advisory draft, defer, reject, and revise into a new version.

The same review and promotion domain service is used by the UI, MCP tools, and the Skill interface.

## 7. Evaluation and success criteria

The system is not called self-improving merely because it stores candidates. It must demonstrate improvement against a fixed holdout set of future tickets.

Evaluation compares baseline triage without the promoted object against triage with the promoted object, including positive matches, near misses, stale or contradicted versions, and tickets that should not match.

Metrics include:

- knowledge-object match precision and recall;
- successful reuse rate;
- operator correction rate;
- unnecessary evidence questions;
- diagnostic turns saved;
- fix and verification success rate;
- customer-response quality;
- stale-signal false-positive rate;
- time from candidate discovery to safe promotion;
- audit completeness and historical immutability.

A knowledge object is successful only when reuse improves relevant outcomes without increasing unsafe matches or bypassing lifecycle gates.

Required verification includes:

- repository contract tests across adapters;
- append-only, idempotency, and transaction tests;
- version immutability, rollback, stale, and contradiction tests;
- promotion and failed-reuse regression tests;
- the deterministic knowledge-evolution showcase;
- holdout future-ticket evaluation;
- full multi-turn lifecycle regression coverage.

## Portfolio claim

Until the feedback loop and holdout evaluation are implemented, the accurate claim is “human-governed knowledge evolution” or “human-governed self-improving support knowledge.” After verified reuse demonstrates improvement, the project may describe itself as a governed self-learning support system, with the approval and evaluation boundaries made explicit.
