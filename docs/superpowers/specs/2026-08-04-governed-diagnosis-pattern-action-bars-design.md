# Governed Diagnosis and Pattern Action Bars

## Status

Design proposal for review. No implementation changes are included in this
specification.

## Problem

The Approval Desk currently exposes recommendation approval, diagnosis review,
diagnosis-specific fixes, and knowledge-candidate review in different parts of
the page. The backend already protects diagnosis, fix, and closure operations,
but the UI allows operators to reach a waiting state without seeing which
disposition is required next. Active platform incidents also have no controlled
mitigation signal, so a legitimate `waiting-on-platform-fix` ticket can appear
stuck indefinitely.

Evidence extraction has a related usability failure: natural customer wording
such as “the audit source shown is IP ...” and “the affected scope appears to
be 12 profiles” is not recognized by the structured evidence checks even
though the evidence is present.

## Goals

1. Make diagnosis disposition a visible, authoritative lifecycle gate.
2. Ensure every mutating support action is reachable from one of two action
   bars: the Workflow Bar or the Pattern Bar.
3. Prevent `Done`, `Diagnose`, `Fix`, and `Close` from advancing a ticket while
   a required diagnosis or pattern disposition is pending.
4. Preserve one backend implementation for lifecycle invariants used by the
   HTTP UI and MCP tools.
5. Make diagnosis approvals and rejections useful context for later diagnosis,
   classification, drafting, and knowledge discovery.
6. Make active platform-fix lifecycles demonstrable without confusing a
   platform mitigation signal with a confirmed customer diagnosis fix.
7. Replace the candidate wall of textareas and raw evidence IDs with a compact,
   readable, catalog-backed review editor.
8. Correct natural-language evidence recognition and add regression coverage.

## Non-goals

This slice does not build the full Sol-plan knowledge graph, a general-purpose
playbook programming editor, real incident-provider integrations, or autonomous
GPT diagnosis authority. GPT remains advisory and all executable transitions
remain deterministic and auditable.

## Domain contract

### Diagnosis disposition

The existing diagnosis review remains the single authoritative disposition:

- `approve` or `revalidate` makes the current diagnosis authoritative when its
  ticket revision and conversation watermark are current;
- `reject` preserves the immutable diagnosis and review audit but invalidates
  it for downstream work;
- a rejected, stale, ambiguous, or unreviewed diagnosis blocks fix and closure
  operations;
- guidance after rejection becomes `evaluate-ticket`, with an explicit reason
  that a fresh evaluation must find a replacement diagnosis;
- the next evaluation receives the rejected diagnosis as negative context but
  must not treat it as an authoritative cause or reuse it as positive knowledge
  support.

The backend does not silently invent a replacement diagnosis at rejection time.
The next explicit evaluation invokes the normal deterministic diagnostic path,
with optional GPT advice remaining bounded and auditable.

### Pattern disposition

Knowledge discovery may produce an advisory candidate. A candidate becomes a
hard gate only when it is actionable for the selected ticket: the candidate's
support includes the ticket's current completed diagnosis (or an equivalent
current diagnosis reference), and the candidate meets the deterministic alert
threshold.

Open-ticket corroboration without a completed diagnosis remains advisory and
does not block ordinary triage.

For an actionable candidate:

- `approve` promotes it and releases the gate;
- `reject` records the decision and releases the gate without changing
  historical ticket recommendations;
- `defer` records the decision but keeps the gate pending;
- optional GPT refresh only replaces the advisory draft and never releases the
  gate.

The authoritative workflow read model exposes the pattern gate and its reason
alongside `operatorGuidance`; the UI does not infer the gate from candidate
markup.

### Platform mitigation

An active known event needs a distinct platform-mitigation signal. This signal
is not the same as the existing confirmed-diagnosis `fix-available` operation.

The governed transition is:

```text
waiting-on-platform-fix
  -> platform mitigation signal recorded
  -> evaluate current context
  -> verification response
  -> customer confirmation
  -> close
```

The local Approval Desk exposes this only through an explicitly labeled
advanced/testing control. A real integration can later provide the same domain
signal. The existing `Fix` operation remains restricted to confirmed,
authoritative, platform-owned diagnoses.

## UI design

### Workflow Bar

The Workflow Bar owns ticket lifecycle actions:

```text
Evaluate -> Review response -> Diagnose -> Review diagnosis
         -> Fix / Await platform mitigation -> Verify -> Close
```

All mutating actions appear here. When a diagnosis review or pattern gate is
pending, `Done` becomes `Review` and focuses the relevant bar. The bar displays
the server-provided blocker rather than merely hiding a button.

### Pattern Bar

The Pattern Bar is a separate compact bar shown only when an actionable
candidate exists. It contains the pattern state, evidence basis, and the
`Approve`, `Refresh`, `Defer`, and `Reject` actions. `Find pattern` moves to
Advanced Settings as a manual rerun; automatic discovery runs after evaluation
and ticket refresh.

The center lane remains useful for read-only conversation, evidence, and
diagnosis history. Mutating diagnosis and knowledge actions are launched from
the action bars so the operator always sees the governing next step.

### Candidate review editor

The current long form is replaced by:

- a summary header with candidate name, score, support count, validation, and
  provenance;
- an expandable evidence-basis section containing completed diagnoses, open
  corroboration, shared catalog evidence, and contradictions;
- a catalog-backed evidence checklist with readable labels and customer
  questions instead of raw IDs;
- compact expandable workflow sections for triggers/timing, diagnosis, fix,
  verification, customer-safe explanation, and operator rationale;
- repeatable rows for list fields, with add/remove controls;
- consistent button hierarchy and responsive width.

## Evidence recognition

The structured evidence checks will accept the natural-language forms already
used by the UI's testing replies, while preserving unknown/negative qualifiers.
The regression set includes TKT-1004 replies for audit source, affected scope,
key identifier, usage status, rotation status, and exposure location.

## Verification plan

The implementation must add or update focused tests for:

1. diagnosis approval unlocking only the governed downstream action;
2. diagnosis rejection forcing a new evaluation and excluding the rejected
   diagnosis from authoritative reuse;
3. stale and ambiguous diagnoses remaining blocked;
4. actionable candidate gates blocking `Done`, `Diagnose`, `Fix`, and `Close`
   until approval or rejection;
5. deferred candidates remaining gated;
6. advisory open-ticket candidates not blocking ordinary triage;
7. platform mitigation moving TKT-1001 out of the waiting state only through the
   governed signal and subsequent evaluation;
8. natural TKT-1004 evidence wording being recognized;
9. no-candidate and known-cause tickets retaining their intended workflows;
10. HTTP and MCP paths producing equivalent guidance and transition outcomes;
11. the two action bars rendering correctly and exposing every mutation without
    relying on center-lane buttons.

The existing all-ticket classification and controlled diagnosis evaluations
remain regression checks; this slice adds ordered lifecycle tests because the
baseline snapshots do not exercise interactive transitions.

## Later Sol-plan alignment

This design leaves room for later evidence-graph similarity, versioned
knowledge-object workflows, playbook evolution, and cross-ticket impact
visualization. Approved knowledge objects can later supply specialized
transitions and responses through the same authoritative guidance boundary.
