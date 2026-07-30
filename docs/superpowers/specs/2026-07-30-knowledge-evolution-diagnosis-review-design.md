# Governed Diagnosis Review and Knowledge Evolution Design

## Status

Draft for user review.

## Purpose

Extend the Approval Desk from a ticket triage workflow into a governed system that can learn reusable operational knowledge from approved diagnoses without allowing unconfirmed similarity or GPT output to control live ticket state.

The first implementation slices are:

1. reviewable, versioned diagnoses and diagnosis-scoped fixes;
2. deterministic queue analysis;
3. evidence-graph pattern discovery and candidate knowledge objects;
4. executable, versioned knowledge-object workflows;
5. lifecycle and portfolio evaluation coverage.

Each slice must preserve one authoritative implementation for diagnostic-state transitions, diagnosis gating, fix gating, and workflow invariants. Approval Desk UI, MCP tools, replay views, and future skills call that domain implementation rather than reimplementing it.

## Core principles

- AI proposes structured knowledge; deterministic services and human approval govern execution.
- Stored ticket metadata, current triage analysis, and approved operator decisions remain distinct.
- Diagnosis history is immutable. Corrections create reviewed versions or review events.
- Similarity is evidence, not truth. Unconfirmed patterns never become authoritative causes.
- A knowledge-object workflow may specialize a ticket lifecycle, but it cannot bypass its evidence and approval policy.
- A fix applies to a selected diagnosis and explicitly approved impact set; it does not silently close tickets.
- Ticket closure remains an explicit operator action by default.
- Workflow versions are pinned to active tickets and change only through explicit migration.
- External workflow transitions require trusted structured signals, scheduled times, or explicit operator action. GPT cannot invent or advance such signals.

## Domain model

### Diagnosis record

A completed diagnosis remains a first-class immutable record containing the ticket, ticket revision, conversation/audit watermark, structured cause, confidence, evidence used, owner, customer-safe summary, next action, and knowledge-object references when available.

An operator does not overwrite the original record. A review draft and approval event capture edited fields, reviewer identity, rationale, source diagnosis ID, and the reviewed context watermark. A later correction creates another version/event.

Diagnosis freshness is evaluated against:

- newer customer replies;
- newer ticket revisions;
- contradictory evidence;
- newer diagnoses or reviews;
- knowledge-object version changes that affect the diagnosis workflow;
- external events or fix signals that invalidate the assumptions.

Stale diagnoses remain visible for history and similarity analysis but cannot unlock current fixes, closure, or current knowledge-object promotion. Revalidation creates a new reviewed version with a new watermark and rationale.

A diagnosis that became stale because its problem was fixed is retained as resolved historical evidence. It may support recurrence detection only when strong fresh signals support reactivation.

### Knowledge domain and knowledge object

Broad labels such as `API` or `Integrations` are domains/categories. An executable knowledge object represents a specific operational pattern, for example `checkout-event-ingestion-outage` or `webhook-signing-secret-rotation-mismatch`.

Each object is versioned and contains:

- identity, domain, kind, lifecycle status, and version;
- trigger and match profile: symptoms, structured signals, timing windows, scope, region, event correlation, and severity signals;
- evidence policy, including required, optional, and sufficient evidence;
- one or more diagnosis patterns and references to supporting approved diagnoses;
- specialized lifecycle checkpoints and allowed transitions;
- fix signal or scheduled activation requirements;
- verification and closure eligibility policy;
- escalation policy;
- customer-safe response templates, prohibited claims, and knowledge article IDs;
- linked-ticket and impact-set rules;
- provenance, supporting tickets, GPT draft diagnostics, approvals, and contradictions.

Supporting diagnosis records are referenced by ID rather than copied into the object. This preserves independent ticket history and makes object versions reproducible.

### Knowledge-object activation

Activation provenance determines authority:

- **emerging:** active-ticket similarity only; advisory review item, no lifecycle control;
- **candidate:** possible object match before diagnosis; remains in normal diagnosis and may add object-specific evidence suggestions;
- **confirmed:** an approved diagnosis establishes the object match; the object workflow may govern specialized checkpoints;
- **operator-selected:** an operator explicitly selects an approved object for the ticket, subject to its evidence policy.

A ticket may be a candidate match while still in normal diagnosis. It enters a specialized workflow only after the diagnosis/known-cause decision resolves the ambiguity or an operator selects an approved object.

If multiple objects match, the ticket remains in normal diagnosis until evidence resolves the ambiguity. One object becomes primary only through deterministic precedence or operator selection; other objects remain secondary hypotheses/signals. Executable workflows are never silently composed.

### Declarative workflow

Knowledge-object workflows use a bounded declarative state-machine vocabulary, not GPT-generated executable code. Allowed primitives include lifecycle states, evidence gates, event/time conditions, response templates, fix and verification actions, impact-set rules, and escalation targets.

Validation rejects unsafe or incomplete objects, including transitions that bypass required evidence, unsupported states, cycles without exits, customer claims that are not supported by the object policy, unsafe secret handling, and closure paths without a valid verification policy.

An authoritative object may prepare a diagnosis, but the diagnosis transition remains operator-approved. Objects may determine closure eligibility through customer confirmation, external signals, or time windows, but actual closure is operator-approved by default.

Existing tickets pin the object version that governs them. New tickets use the latest approved version. Active tickets may migrate only through explicit operator review and an audited migration event. Closed tickets retain their historical version.

## Queue analysis projection

The ticket list gains a read-only analysis projection built from the existing deterministic classifier and domain workflow functions:

```text
ticket + conversation history
  -> deterministic classification
  -> evidence readiness and lifecycle guidance
  -> known-event and knowledge-object matching
  -> similarity/emerging-pattern signals
  -> queue analysis snapshot
```

A snapshot includes analyzed category, priority, team, confidence, classification signals, evidence readiness, primary workflow status, knowledge-object/event matches, related-ticket candidates, ticket revision, conversation watermark, knowledge catalogue version, classifier version, and computed timestamp.

The projection never mutates the ticket or replaces an approved operator value. The UI distinguishes:

- **current priority:** stored or operator-approved value;
- **triage signal:** latest deterministic analysis;
- **difference indicator:** shown when they disagree.

Stale snapshots are refreshed when input revisions, conversation watermarks, knowledge-object versions, or classifier versions change. The queue may show the previous result with a “refreshing analysis” indicator. High-risk changes show “analysis required” until fresh analysis is available.

Active tickets receive deterministic queue analysis. Closed tickets contribute to similarity only when they have an approved diagnosis or trusted resolution record.

The list stays compact: retain the priority pill and show one primary workflow-status indicator using color, icon, and text. The explanation is available through an info affordance, tooltip, and accessible label. Suggested precedence is ready-for-closure, waiting for customer verification, waiting for fix signal/time window, specialist review, then blocked/contradictory evidence.

## Similarity and pattern discovery

Pattern discovery uses a bounded evidence graph rather than raw text clustering alone. Signals may include diagnosis similarity, evidence overlap, timing and event windows, region/product scope, owner/team, workflow shape, and raw wording. Each edge exposes its reasons and strength.

- approved diagnoses and trusted closed outcomes are strong evidence;
- active-ticket clusters are weak emerging-pattern evidence;
- open-ticket patterns may create an emerging-pattern review item but cannot create an executable object;
- a promotable candidate requires supporting approved diagnoses or equivalent trusted outcomes;
- GPT may summarize evidence and draft parameters, but cannot promote or activate an object.

An impact-set proposal lists candidate related tickets and highlights the supporting signals for each. The operator selects the tickets before a fix is applied. Applying a fix creates separate audit events and customer-safe verification responses for each selected ticket. Tickets move to verification or closure eligibility; they are not silently closed.

## GPT knowledge-engineering role

GPT may draft structured parameters for emerging and promotable candidates, including names, summaries, match signals, timing rules, evidence requirements, diagnosis patterns, lifecycle transitions, fix/verification gates, response templates, article IDs, and limitations.

Drafts must be parsed against strict schemas, validated against workflow invariants, and displayed with supporting evidence, provenance, contradictions, and confidence. GPT output is advisory only. It cannot:

- assign an authoritative diagnosis;
- promote or edit an approved object directly;
- bypass evidence or approval;
- invent a fix signal, event, or customer fact;
- generate executable code;
- close or resolve tickets.

## Authority and trusted signals

Workflow transitions that depend on external facts accept only trusted structured sources:

- approved known-event status changes;
- registered platform or monitoring events;
- scheduled effective times;
- explicit operator actions.

Customer replies provide evidence and verification input but do not independently prove that a platform event is fixed. GPT may explain a trusted signal but cannot create one.

## UI and MCP behavior

Diagnosis review, knowledge-object review, impact-set selection, and workflow actions use the same domain service through both Approval Desk routes and MCP tools. Neither surface reimplements gating or state transitions.

The UI exposes diagnosis history, current/stale status, evidence, workflow version, editable review draft, approval/revalidation actions, fix scope, candidate impact set, and audit history. MCP tools expose equivalent structured operations and results. Customer-facing responses never expose internal prompt-injection detection, similarity internals, or private workflow rationale.

## Implementation slices and acceptance criteria

### Slice 0: contracts and invariants

Introduce the shared schemas and invariant checks without changing live queue behavior. Tests prove stale detection, version pinning, activation provenance, and rejection of unsafe workflow definitions.

### Slice 1: diagnosis review and diagnosis-scoped fixes

Operators can view, edit, approve, revalidate, and reject diagnoses. Fix actions require a current approved diagnosis and operate on an explicitly selected impact set. Each mutation has an audit event and customer-safe verification response. No automatic closure is introduced.

### Slice 2: deterministic queue analysis

The queue exposes cached, revision-aware triage projections using existing authoritative classifier and workflow functions. Stored values remain distinct from derived analysis. UI/MCP parity and stale refresh tests are required.

### Slice 3: pattern discovery and candidate objects

Approved diagnoses and trusted closed tickets produce explainable pattern candidates. Active tickets produce emerging-pattern signals only. GPT drafts are schema-validated and human-approved before promotion.

### Slice 4: executable knowledge-object workflows

Approved versioned objects govern specialized lifecycle checkpoints, trusted fix/time signals, responses, verification, explicit migration, and closure eligibility.

### Slice 5: evaluation and showcase

The harness covers diagnosis review, stale/revalidation paths, impact-set approval, queue disagreement, emerging versus promotable candidates, GPT object drafting, workflow version pinning, and full audit traces. README documentation shows the architecture and customer-facing outputs.

## Non-goals for the first implementation

- arbitrary plugins or GPT-generated executable code;
- automatic promotion of knowledge objects;
- automatic customer-facing claims based only on similarity;
- automatic closure of ordinary tickets;
- distributed cross-process locking beyond the existing local service/repository model;
- replacing the deterministic classifier with GPT.
