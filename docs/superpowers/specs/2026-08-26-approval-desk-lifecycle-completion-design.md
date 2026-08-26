# Approval Desk Lifecycle Completion Design

## Goal

Make the Approval Desk guide every ticket from evaluation through evidence collection, diagnosis review, scoped fix, customer verification, and resolution without exposing a mutation that the authoritative lifecycle will reject or leaving the operator at an actionless state.

## Scope

This slice repairs lifecycle consumption at the Approval Desk presentation boundary and adds the minimum supporting read-model projection needed for queue consistency. It preserves the existing lifecycle phases, diagnosis governance, persistence, stale-context checks, single-flight evaluation, MCP parity, and append-only history.

The slice does not add lifecycle phases, change deterministic classification or routing, redesign diagnosis governance, add retrieval or semantic search, or change known-cause semantics.

## Authority boundary

The ticket lifecycle returned by the backend is the only authority for mutation availability. `lifecycle.primaryAction` identifies the governed operation for the current durable state; `lifecycle.actions` describes available, blocked, and completed alternatives with reason codes.

`diagnosisUiPhase` remains presentation-only. It may choose whether the operator is looking at the current diagnosis, Inspection, Scoped Fix, or a historical read-only view, but it cannot grant a mutation or infer that a transition succeeded.

Every governed command must recheck the relevant lifecycle action immediately before posting. A stale control must refresh the ticket and render the returned lifecycle instead of issuing a known-invalid mutation. Successful commands adopt the returned lifecycle (or perform a full authoritative refresh when the response is not an envelope) before selecting the next presentation.

## Lifecycle navigation

Back is presentation navigation, not a domain mutation:

- Inspection → current Diagnosis;
- current Diagnosis → normal Evaluate/Response action bar;
- historical Diagnosis → current Diagnosis;
- Scoped Fix → approved diagnosis/current lifecycle view.

The refresh associated with Back completes before the action bar is rendered as settled. If the returned lifecycle still requires diagnosis review, the normal action bar exposes a review/revalidate opener. If it requires evaluation, it exposes Evaluate/Re-evaluate/Clarify. It must never fall through to a generic “Response ready” bar or an empty action bar.

Selecting an older diagnosis only renders compact, read-only history. It never replaces the current lifecycle action bar or enables current diagnosis, fix, response, or resolve mutations.

## Evidence and diagnosis loop

The existing playbook evidence requirements remain authoritative. The implementation adds a deterministic coverage check that every evidence requirement used by the demo has a corresponding customer-reply path through the existing automatic/synthetic reply mechanism. This is a test/data-support check, not a change to production classification or diagnosis authority.

The operator-facing loop is:

1. No recommendation: Evaluate.
2. Missing evidence: Send the evidence request, then wait for the customer reply.
3. New reply: Evaluate again.
4. Evidence complete with no confirmed diagnosis: Diagnose, then review the diagnosis.
5. Ambiguous, insufficient, rejected, or otherwise unconfirmed diagnosis: expose the lifecycle's Evaluate/Re-evaluate/Clarify action and the evidence/questions to request. Do not expose Next → Inspection → Approve.
6. Confirmed diagnosis: Inspection exposes the reviewed fields and approval path; successful approval moves to the lifecycle's fix state.

The UI must not fabricate confirmation or treat a likely diagnosis as confirmed. Demo-only confirmation controls remain reply injection through the existing route and are shown only when the lifecycle/read model permits that simulation.

## Confirmed diagnosis, fix, and verification

The Scoped Fix panel is opened only when the backend reports `apply-scoped-fix` as available/primary. The Fix mutation is still lifecycle-guarded at submit time.

After a successful scoped fix, the UI refreshes the authoritative lifecycle and returns to the normal Evaluate/Response mode. The response explains the applied fix and requests customer verification. The UI does not expose Resolve until a later evaluation produces the lifecycle's `ready-for-close` / `resolve-ticket` action.

Customer confirmation therefore starts the next governed evaluation cycle. A customer report that the problem persists follows the same evidence/evaluation route or the lifecycle's explicit further-investigation explanation; it does not create a new lifecycle state.

## Presentation contract

When a lifecycle descriptor exists, titles, hints, button labels, and enabled states derive from the primary/available action descriptors:

| Lifecycle action | Presentation |
| --- | --- |
| `evaluate-ticket` | Evaluate, Re-evaluate, or Clarify |
| `review-recommendation` | Review |
| `send-customer-response` | Send |
| `record-diagnosis` | Diagnose |
| `review-diagnosis` | Review |
| `revalidate-diagnosis` | Revalidate |
| `record-fix-available` | Fix |
| `apply-scoped-fix` | Open Scoped Fix, then Fix |
| `resolve-ticket` | Resolve |
| `none` / `specialist-review` | Further investigation required |

Local recommendation summaries may explain context, but they cannot override a lifecycle title or action. In particular, `awaiting-fix`, `fix-ready`, and `ready-for-close` must not be presented as a generic “Response ready” state.

## Error and refresh behavior

For a failed diagnosis review, recommendation evaluation, fix, send, or resolve command:

- keep the domain error inline in the relevant panel;
- refresh ticket, diagnoses, lifecycle, operator guidance, and conversation state;
- render from the refreshed durable state;
- retain no local phase that advertises the failed transition as completed.

Stale-context failures follow the same reconciliation path. Existing single-flight and request-token protections remain in place.

## Queue consistency

The ticket-list projection receives a minimal lifecycle summary (phase, primary action, and reason codes or equivalent stable fields) so queue filters and badges do not rely only on recommendation-derived workflow summaries. This is additive and does not duplicate or alter lifecycle computation.

## Acceptance invariant

For every durable ticket state, the Action Bar exposes the lifecycle primary action or clearly explains why no operator action is currently possible. It never exposes an enabled action that the backend will reject from that same state.

The acceptance path uses real Approval Desk HTTP responses and returned lifecycle projections for TKT-1010. It covers evaluation/evidence requests, an ambiguity or rejection recovery cycle, confirmed diagnosis review, scoped fix, post-fix customer response, customer confirmation, re-evaluation, and resolution. Browser state is not fabricated to advance the workflow.

## Compatibility

Existing legacy UI fixtures without lifecycle descriptors remain supported through their current fallback paths. When a lifecycle descriptor is present, the lifecycle path always wins. Existing successful Scoped Fix → refresh → Brief behavior, SQLite persistence, diagnosis authority, MCP projections, and append-only history remain unchanged.
