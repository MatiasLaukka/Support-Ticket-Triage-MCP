# Operational Lifecycle Presentation Contract Design

**Status:** Draft for review  
**Date:** 2026-08-21

## Goal

Provide the Approval Desk and other workflow consumers with one authoritative, structured presentation projection of the operational ticket lifecycle while preserving the existing `operatorGuidance` contract and all current diagnosis, evidence, approval, stale-context, persistence, and learning semantics.

## Scope

This design covers the backend contract required to present lifecycle state reliably:

- a canonical `lifecycle` read projection beside `operatorGuidance`;
- durable phases and action availability;
- structured evidence, confirmation, and response state;
- refreshed lifecycle state after workflow mutations and idempotent replay;
- operational and legacy-read compatibility during migration;
- contract, transition, replay, stale-state, and UI-consumer tests.

The design does not change diagnosis logic, classifier behavior, playbooks, evidence catalogs, knowledge discovery, knowledge promotion, learning health, or customer-response governance.

## Non-goals and deferred work

- Do not replace or rename `operatorGuidance`.
- Do not make diagnosis rejection a learning event in this slice.
- Do not automatically edit playbooks or knowledge objects.
- Do not recalculate the confidence of historical diagnoses.
- Do not introduce distributed evaluation or new provider infrastructure.
- Do not persist browser panel state, unsaved inspection edits, focus, scroll position, or visual styling.

## Current problem

`operatorGuidance` is the compact backend control-plane contract. It correctly communicates a coarse stage, one next action, approval requirements, blockers, customer next step, and required review. It is used by MCP consumers, service-level governance, and the Approval Desk UI.

It is not a complete presentation model. The UI currently supplements it with local phase state, timestamp comparisons, and inferred action availability. Several mutation responses also return only audit events or command results, requiring a second read and local inference before the UI can decide which panel or button to show. The operational snapshot read projection likewise does not expose a dedicated lifecycle presentation object.

This creates drift between:

1. authoritative operational state;
2. compatibility audit/repository projections;
3. browser-local interaction state.

## Design principles

1. **Operational state remains authoritative.** The lifecycle projection is derived from the same authoritative state and does not create a second state machine.
2. **`operatorGuidance` remains stable.** Existing MCP and command-gating consumers continue to receive it unchanged.
3. **The lifecycle projection is additive.** It supplies structured presentation data without changing command authorization or domain transitions.
4. **Commands revalidate state.** A lifecycle projection never grants permission by itself; every mutation continues to revalidate the current snapshot transactionally.
5. **Historical records remain immutable.** A new diagnosis or review changes current authority only through existing governed semantics; it never rewrites earlier records.
6. **The UI does not infer workflow state.** It renders action availability, evidence, and reasons from the projection rather than comparing timestamps or guessing from local panel state.
7. **Learning remains separate.** The projection may show the existing knowledge-pattern gate, but it does not add learning writes or alter learning eligibility.

## Contract boundary

The backend owns durable workflow state:

- the current lifecycle phase;
- the primary action and all known action availability;
- current recommendation, diagnosis, and fix references;
- ticket revision and conversation watermark;
- required, provided, and missing evidence;
- diagnosis confidence and confirmation state;
- response intent and delivery state;
- existing knowledge-pattern review state.

The browser owns transient interaction state:

- whether a Diagnosis, Inspection, or Scoped Fix panel is expanded;
- unsaved textarea and field edits until a review command is submitted;
- focus, scroll position, loading indicators, and visual styling.

An unsaved Inspection edit is not an authoritative diagnosis. It becomes durable only when the operator submits Approve, Revalidate, or Reject and the backend records the corresponding review event.

## Lifecycle projection

The workflow read model gains an additive `lifecycle` property beside `operatorGuidance`.

### Durable phase

```ts
type LifecyclePhase =
  | "evaluation-needed"
  | "recommendation-review"
  | "waiting-for-customer"
  | "diagnosis-review"
  | "awaiting-confirmation"
  | "fix-ready"
  | "verification"
  | "ready-for-close"
  | "escalated"
  | "closed";
```

These phases describe domain workflow, not the browser's expanded/collapsed panel state.

### Action descriptors

```ts
type LifecycleActionKind =
  | "evaluate-ticket"
  | "review-recommendation"
  | "mark-response-done"
  | "record-diagnosis"
  | "review-diagnosis"
  | "revalidate-diagnosis"
  | "make-fix-available"
  | "apply-scoped-fix"
  | "close-ticket"
  | "specialist-review"
  | "none";

type LifecycleAction = {
  kind: LifecycleActionKind;
  availability: "primary" | "available" | "blocked" | "completed";
  reasonCodes: string[];
};
```

The action list must distinguish recording an internal/platform fix from applying a reviewed scoped fix:

- `make-fix-available` records that the internal mitigation is available;
- `apply-scoped-fix` applies the reviewed solution to the selected impact set;
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

This reuses the existing knowledge-pattern gate and does not add support counters, contradiction learning, or confidence recalculation.

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

The refreshed projection is read after the authoritative write commits. Expensive evaluation/provider work remains outside synchronous SQLite write transactions.

Idempotent replay returns the same persisted result references and the same lifecycle projection for the resulting state. A stale command still fails through the existing stale/revision protections; the client then refreshes the workflow read model.

## Transition semantics

The projection follows the existing domain rules:

| Phase | Primary action | Meaning |
|---|---|---|
| `evaluation-needed` | `evaluate-ticket` | No current governed recommendation exists. |
| `recommendation-review` | `mark-response-done` | A recommendation is awaiting human approval and response completion. |
| `waiting-for-customer` | `none` | The approved request was sent and no newer reply exists. |
| `diagnosis-review` | `record-diagnosis` or `review-diagnosis` | `record-diagnosis` is primary when no current diagnosis exists; `review-diagnosis` is primary when a diagnosis is recorded and awaits human review. |
| `awaiting-confirmation` | `evaluate-ticket` or `none` | The diagnosis is likely and needs the declared confirmation source. |
| `fix-ready` | `make-fix-available` or `apply-scoped-fix` | `make-fix-available` is primary when the internal mitigation has not been recorded; `apply-scoped-fix` is primary when the reviewed solution is ready for operator application. |
| `verification` | `evaluate-ticket` | A recorded fix or mitigation needs a customer-safe verification response. |
| `ready-for-close` | `close-ticket` | The ready-to-close response is sent and closure gates pass. |
| `escalated` | `specialist-review` | Specialist ownership is required; autonomous diagnosis and fixes stop. |
| `closed` | `none` | The governed lifecycle is complete. |

The exact primary action is selected from the authoritative blockers and causal order. The UI may show secondary actions such as Back or History, but those are navigation/read actions and do not change the backend phase.

Re-evaluation creates a new recommendation/diagnosis context. It never restores an older diagnosis as current merely because the user navigated backward in the interface.

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
- treat a pattern candidate as an approved knowledge object;
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

Existing diagnosis, evidence, approval, stale-context, operational persistence, knowledge, and evaluation suites must continue to pass unchanged except for additive contract expectations.

## Rollout order

1. Add the lifecycle schema and projection builder beside the existing guidance builder.
2. Add the projection to operational and compatibility read models.
3. Add refreshed projection fields to workflow mutation envelopes.
4. Migrate the Approval Desk UI to render phase and action availability from the projection.
5. Remove only the now-unused UI timestamp/action inference helpers after regression coverage proves parity.

No playbook, knowledge-object, learning-ledger, diagnosis-confidence, or customer-response policy changes are part of this rollout.
