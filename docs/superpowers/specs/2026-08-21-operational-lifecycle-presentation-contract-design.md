# Operational Lifecycle Presentation Contract Design

**Status:** Approved for implementation
**Date:** 2026-08-21

## Goal

Provide the Approval Desk and other workflow consumers with one authoritative, structured presentation projection of the operational ticket lifecycle while preserving the existing `operatorGuidance` contract and all current diagnosis, evidence, approval, stale-context, persistence, and learning semantics.

## Scope

This design covers the backend contract required to present lifecycle state reliably:

- a canonical `lifecycle` read projection beside `operatorGuidance`;
- durable phases and semantic action availability;
- structured evidence, confirmation, and response state;
- diagnostic-investigation, diagnosis-authority, fix-outcome, and knowledge-secondary state;
- append-only diagnosis-invalidation and ineffective-fix recovery operations;
- isolated development/demo transition injectors that execute real domain commands;
- refreshed lifecycle state after workflow mutations and idempotent replay;
- operational and legacy-read compatibility during migration;
- contract, transition, replay, stale-state, and UI-consumer tests.

The design does not implement classifier changes, playbook evolution, semantic retrieval, knowledge promotion, learning health, or customer-response policy changes. It adds only the narrow domain events required to represent diagnosis invalidation and ineffective-fix recovery safely.

## Non-goals and deferred work

- Do not replace or rename `operatorGuidance`.
- Do not make diagnosis rejection a learning event in this slice.
- Do not make the numeric diagnostic-attempt limit part of the lifecycle contract. It remains replaceable diagnostic policy.
- Do not automatically edit playbooks or knowledge objects.
- Do not recalculate the confidence of historical diagnoses.
- Do not introduce distributed evaluation or new provider infrastructure.
- Do not persist browser panel state, unsaved inspection edits, focus, scroll position, or visual styling.
- Do not expose debug/demo transition injectors in production mode or add them to the normal production action union.

## Current problem

`operatorGuidance` is the compact backend control-plane contract. It correctly communicates a coarse stage, one next action, approval requirements, blockers, customer next step, and required review. It is used by MCP consumers, service-level governance, and the Approval Desk UI.

It is not a complete presentation model. The UI currently supplements it with local phase state, timestamp comparisons, and inferred action availability. Several mutation responses also return only audit events or command results, requiring a second read and local inference before the UI can decide which panel or button to show. The operational snapshot read projection likewise does not expose a dedicated lifecycle presentation object.

This creates drift between:

1. authoritative operational state;
2. compatibility audit/repository projections;
3. browser-local interaction state.

## Design principles

1. **Operational state remains authoritative.** The lifecycle projection is derived from the same authoritative state and does not create a second state machine.
2. **`operatorGuidance` remains compatible.** Its schema and existing compatibility fields remain available, while new guidance generation no longer makes an actionable knowledge candidate preempt ordinary ticket work unless an explicit safety rule requires it.
3. **The lifecycle projection is additive.** It supplies structured presentation data without changing command authorization or domain transitions.
4. **Commands revalidate state.** A lifecycle projection never grants permission by itself; every mutation continues to revalidate the current snapshot transactionally.
5. **Historical records remain immutable.** A new diagnosis, review, invalidation, fix attempt, or verification outcome changes current authority only through append-only governed events; it never rewrites earlier records.
6. **The UI does not infer workflow state.** It renders action availability, evidence, and reasons from the projection rather than comparing timestamps or guessing from local panel state.
7. **Learning remains separate.** The projection may show a knowledge candidate as secondary state, but it does not add playbook evolution, semantic retrieval, or learning promotion writes.
8. **Debug controls use real domain semantics.** Demo-only routes or fixture helpers call real commands and commit real operational events; they never mutate browser state as a substitute for workflow behavior.

## Contract boundary

The backend owns durable workflow state:

- the current lifecycle phase;
- the primary action and all known action availability;
- current recommendation, diagnosis, and fix references;
- ticket revision and conversation watermark;
- required, provided, and missing evidence;
- diagnosis confidence and confirmation state;
- diagnostic hypotheses, evidence requests, and escalation reason;
- diagnosis authority (`none`, `recorded`, `approved`, `rejected`, `stale`, `invalidated`);
- fix progression and outcome, including ineffective fixes that do or do not invalidate the diagnosis;
- response intent and delivery state;
- existing knowledge-pattern review state.

The browser owns transient interaction state:

- whether a Diagnosis, Inspection, or Scoped Fix panel is expanded;
- unsaved textarea and field edits until a review command is submitted;
- focus, scroll position, loading indicators, and visual styling.

An unsaved Inspection edit is not an authoritative diagnosis. It becomes durable only when the operator submits a governed diagnosis command and the backend records the corresponding review, revalidation, rejection, or invalidation event.

## Lifecycle projection

The workflow read model gains an additive `lifecycle` property beside `operatorGuidance`.

### Durable phase

```ts
type LifecyclePhase =
  | "evaluation-needed"
  | "recommendation-review"
  | "waiting-for-customer"
  | "diagnosis-ready"
  | "diagnosis-review"
  | "awaiting-confirmation"
  | "awaiting-fix"
  | "fix-ready"
  | "verification"
  | "ready-for-close"
  | "escalated"
  | "resolved";
```

These phases describe domain workflow, not the browser's expanded/collapsed panel state.

### Action descriptors

```ts
type LifecycleActionKind =
  | "evaluate-ticket"
  | "review-recommendation"
  | "send-customer-response"
  | "record-diagnosis"
  | "review-diagnosis"
  | "revalidate-diagnosis"
  | "reject-diagnosis"
  | "invalidate-diagnosis"
  | "record-fix-available"
  | "apply-scoped-fix"
  | "record-fix-ineffective"
  | "resolve-ticket"
  | "specialist-review"
  | "review-pattern"
  | "none";

type LifecycleAction = {
  kind: LifecycleActionKind;
  availability: "primary" | "available" | "blocked" | "completed";
  reasonCodes: string[];
};
```

The action list must distinguish the real semantic operations from contextual UI labels:

- `send-customer-response` represents the existing governed response-send operation; a UI may label the first evidence request `Send` and a later customer update `Update` without inventing another command;
- `record-fix-available` records that the internal mitigation is available;
- `apply-scoped-fix` applies the reviewed solution to the selected impact set;
- `record-fix-ineffective` records a failed verification outcome for a specific fix attempt;
- `invalidate-diagnosis` explicitly removes current authority from a diagnosis without deleting it;
- `evaluate-ticket` creates the next recommendation after new evidence, a customer reply, or a recorded fix.

The UI maps stable action kinds and reason codes to labels. Backend reason codes include at least:

- `missing-evidence`;
- `awaiting-customer-reply`;
- `diagnosis-not-recorded`;
- `diagnosis-not-approved`;
- `diagnosis-not-confirmed`;
- `diagnosis-stale`;
- `response-not-sent`;
- `fix-not-available`;
- `fix-ineffective`;
- `diagnosis-invalidated`;
- `newer-customer-reply`;
- `specialist-review-required`;
- `already-completed`.

### Current references and freshness

```ts
current: {
  recommendationId?: string;
  diagnosisId?: string;
  fixEventId?: string;
  ticketRevision: number;
  conversationWatermark: CustomerReplyWatermark;
}
```

These references identify the state being presented. They do not replace the existing stale-context and expected-revision checks.

### Structured lifecycle dimensions

The projection exposes the existing diagnostic snapshot and the separate authority/outcome gates instead of making the UI infer them:

```ts
diagnosticInvestigation: {
  state: "not-started" | "insufficient-evidence" | "ambiguous" |
    "working-diagnosis" | "confirmed" | "escalated";
  hypotheses: Array<{
    id: string;
    label: string;
    status: "plausible" | "leading" | "confirmed" | "ruled-out";
    evidenceUsed: string[];
    evidenceToConfirm: string[];
  }>;
  evidenceToRequest: string[];
  escalationReason?: string;
};

diagnosis: {
  state: "none" | "recorded" | "approved" | "rejected" | "stale" | "invalidated";
  diagnosisId?: string;
  reasonCodes: string[];
};

fix: {
  state: "none" | "awaiting" | "available" | "ready-to-apply" |
    "applied" | "verification-pending" | "verified" | "ineffective";
  diagnosisId?: string;
  fixEventId?: string;
  reasonCodes: string[];
  diagnosisStillAuthoritative: boolean;
};
```

The fix operation currently uses the existing `fix-available` audit/operational action for compatibility. The canonical projection must distinguish internal availability from scoped application using an explicit persisted operation stage/fact, not by frontend timestamp inference. If that existing representation cannot prove the distinction during implementation, the adapter must stop and surface the contradiction before adding a new event vocabulary.

## Evidence, confirmation, and response state

The projection reuses existing catalogued evidence objects:

```ts
evidence: {
  required: EvidenceRequirement[];
  provided: EvidenceRequirement[];
  missing: EvidenceRequirement[];
}
```

Confirmation is projected separately from evidence completeness:

```ts
confirmation: {
  state:
    | "not-required"
    | "awaiting-evidence"
    | "awaiting-internal-verification"
    | "confirmed"
    | "escalated";
  request?: {
    owner: "customer" | "internal" | "specialist";
    evidenceIds: string[];
    reasonCode: string;
  };
}
```

`awaiting-evidence` is used when the diagnosis is provisional because required facts are missing. `awaiting-internal-verification` is used when customer evidence is complete but platform, engineering, or another internal confirmation is still required. `confirmed` means the existing governed fix/closure preconditions may be evaluated; it does not bypass approval.

Response presentation is explicit:

```ts
response: {
  intent: "evidence-request" | "diagnosis-update" | "fix-verification" | "closure";
  state: "none" | "draft" | "approval-required" | "sent" | "waiting-for-reply";
}
```

This allows the UI to explain why a response is being drafted without changing response-generation or approval rules.

Knowledge remains read-only in this projection:

```ts
knowledge: {
  state: "none" | "pending" | "approved" | "rejected" | "deferred";
  actionable: boolean;
  candidateId?: string;
  reason?: string;
}
```

An actionable candidate is a secondary `review-pattern` action. It does not replace the source ticket's primary action or block ordinary work unless a genuine governance rule requires it. This reuses the existing knowledge-pattern metadata and does not add support counters, contradiction learning, or confidence recalculation.

## Read-model construction

Add a focused lifecycle projection builder, conceptually:

```ts
buildTicketLifecycleView(input: WorkflowLifecycleInput): LifecycleView
```

The builder consumes a shared internal workflow-state shape so both paths use the same semantics:

1. the canonical operational snapshot path;
2. the legacy audit/repository compatibility path retained for fixtures and migration support.

There must not be separate phase or action algorithms for operational and legacy reads. Compatibility adapters may translate storage shapes, but lifecycle decisions are shared.

The existing `buildTicketWorkflowReadModelFromSnapshot` path should expose `operatorGuidance` and `lifecycle` from authoritative operational data. The existing file-backed adapter should expose the same properties while it remains in compatibility use.

## Recovery operations and diagnostic policy

Two narrowly scoped append-only operations are required:

1. `invalidate-diagnosis` records an operator/system determination that a diagnosis is contradicted, superseded, or otherwise no longer authoritative. It references the diagnosis, expected ticket revision and conversation watermark, a reason code, and the actor. It never mutates or deletes the original diagnosis or reviews.
2. `record-fix-ineffective` records that a specific fix attempt failed verification. It references the fix event and diagnosis. It does not itself invalidate the diagnosis; a separate explicit invalidation operation is required when the failure materially contradicts the diagnosis. This preserves the valid path where another fix may be attempted against the still-authoritative diagnosis.

Both operations are transactionally revalidated, idempotent, stale-checked, represented in the mutation envelope, and included in the lifecycle projection. They preserve the causal episode:

```text
diagnosis approved → fix applied → verification fails
  → ineffective fix (diagnosis may remain authoritative)
  → optional diagnosis invalidation
  → evaluation-needed / Update → diagnostic investigation resumes
```

The existing `MAX_DIAGNOSTIC_ATTEMPTS` value is diagnostic policy, not lifecycle schema. The projection supports any configured number of useful ambiguity/clarification rounds; contradiction or policy exhaustion may escalate. The frontend never decides whether another round is useful.

## Development/demo transition injectors

Development and demo controls may simulate internal confirmation, fix availability/application, verification success/failure, contradictory evidence, invalidation, and customer replies. They must be isolated behind an explicit development/demo configuration and route or fixture helper, unavailable in production, and must call real domain commands that commit real operational events. They are not members of the production `LifecycleActionKind` union and must return the same refreshed lifecycle projection as normal mutations.

## API envelopes

Existing response fields remain intact. The following additive shape is used wherever a workflow read or mutation currently returns state:

```ts
{
  ...existingResult,
  operatorGuidance: OperatorGuidance,
  lifecycle: LifecycleView,
}
```

The GET ticket workflow response includes both objects. Workflow mutations that change lifecycle state—evaluation, customer reply, response completion, diagnosis recording/review, internal fix availability, scoped-fix application, and closure—return the committed result plus the refreshed `operatorGuidance` and `lifecycle` projection.

The refreshed projection is read after the authoritative write commits. Expensive evaluation/provider work remains outside synchronous SQLite write transactions. This envelope applies equally to diagnosis invalidation, ineffective-fix recording, and demo injectors.

Idempotent replay returns the same persisted result references and the same lifecycle projection for the resulting state. A stale command still fails through the existing stale/revision protections; the client then refreshes the workflow read model.

## Transition semantics

The projection follows the existing domain rules:

| Phase | Primary action | Meaning |
|---|---|---|
| `evaluation-needed` | `evaluate-ticket` | No current governed recommendation exists. |
| `recommendation-review` | `review-recommendation` or `send-customer-response` | A recommendation is awaiting human approval and/or the approved response is ready to send. |
| `waiting-for-customer` | `none` | The approved request was sent and no newer reply exists. |
| `diagnosis-ready` | `record-diagnosis` | Evidence gates allow the diagnostic result to be recorded. |
| `diagnosis-review` | `review-diagnosis` or `revalidate-diagnosis` | A non-ambiguous recorded diagnosis awaits governed review. |
| `awaiting-confirmation` | `evaluate-ticket` or `none` | The diagnosis is likely and needs the declared confirmation source. |
| `awaiting-fix` | `none` or `record-fix-available` | The diagnosis is eligible but an internal/platform mitigation is not yet available. |
| `fix-ready` | `record-fix-available` or `apply-scoped-fix` | The internal mitigation is available or the reviewed scoped solution is ready to apply. |
| `verification` | `evaluate-ticket` | A recorded fix or mitigation needs a customer-safe verification response. |
| `ready-for-close` | `resolve-ticket` | The ready-to-close response is sent and closure gates pass. |
| `escalated` | `specialist-review` | Specialist ownership is required; autonomous diagnosis and fixes stop. |
| `resolved` | `none` | The governed lifecycle is complete; existing domain status compatibility may still call this `closed`. |

The exact primary action is selected from the authoritative blockers and causal order. The UI may show secondary actions such as Back or History, but those are navigation/read actions and do not change the backend phase.

Re-evaluation creates a new recommendation/diagnosis context. It never restores an older diagnosis as current merely because the user navigated backward in the interface. Invalidation and ineffective-fix recovery append new events and reopen the derived current phase without rewriting history.

## UI consumption rules

The Approval Desk must:

1. render the active workflow panel from `lifecycle.phase`;
2. render the primary button from `lifecycle.primaryAction`;
3. render disabled actions with backend reason codes;
4. replace local timestamp heuristics for freshness and action availability;
5. replace local workflow state with the returned projection after every mutation;
6. retain local interaction state only for unsaved edits and presentation details;
7. keep historical diagnosis/recommendation views read-only and visually distinct from current authority.

The UI must not:

- infer confirmation from `missingEvidence.length === 0` alone;
- treat a likely diagnosis as fix-eligible;
- treat a pattern candidate as an approved knowledge object or a blocking primary phase;
- fabricate internal confirmation or customer evidence;
- use GPT-generated next-step text as an operational instruction.

## Error handling

Command errors continue to use the existing structured domain error contract. Lifecycle reason codes are for state presentation; they do not replace authoritative command validation or error codes.

When a command fails because the state changed, the client should refresh the workflow projection and present the new primary action. The backend must not silently convert a rejected, stale, or unauthorized command into a different transition.

## Verification plan

The implementation must add or update tests for:

1. strict schema validation of the new lifecycle projection;
2. every phase/action mapping in the transition table;
3. evidence and confirmation projection for missing, complete, likely, confirmed, and escalated cases;
4. response intent/state across evidence request, diagnosis update, fix verification, and closure;
5. parity between operational snapshot reads and the legacy compatibility adapter;
6. mutation responses containing refreshed guidance and lifecycle state;
7. idempotent replay returning the same lifecycle projection;
8. stale customer replies and ticket revisions preventing outdated actions;
9. scoped-fix availability and application remaining distinct actions;
10. UI rendering using lifecycle action descriptors instead of timestamp inference.
11. diagnosis invalidation, ineffective fixes with and without invalidation, causal replay, stale rejection, and historical audit preservation;
12. development/demo injectors exercising real commands and remaining unavailable outside development/demo configuration;
13. repeated useful ambiguity rounds independent of the literal default attempt limit;
14. orthogonal actionable knowledge candidates while the source-ticket primary action remains available.

Existing diagnosis, evidence, approval, stale-context, operational persistence, knowledge, and evaluation suites must continue to pass unchanged except for additive contract expectations.

## Rollout order

1. Add the lifecycle schema and projection builder beside the existing guidance builder.
2. Add the projection to operational and compatibility read models.
3. Add refreshed projection fields to workflow mutation envelopes.
4. Add and test the two recovery operations, keeping their events append-only and separate from learning writes.
5. Add isolated development/demo injectors that call real commands.
6. Adjust guidance generation so knowledge candidates are secondary while retaining compatibility schema values.
7. Migrate the Approval Desk UI to render phase and action availability from the projection.
8. Remove only the now-unused UI timestamp/action inference helpers after regression coverage proves parity.

No playbook evolution, semantic retrieval, knowledge-object promotion, learning-ledger policy, diagnosis-confidence recalculation, or customer-response policy changes are part of this rollout.
