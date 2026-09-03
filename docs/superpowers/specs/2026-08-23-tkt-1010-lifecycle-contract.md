# TKT-1010 lifecycle presentation contract

**Status:** Implemented on `main` and covered by the lifecycle, transport, and
Approval Desk regression suites.

This slice makes the persisted lifecycle projection the only authority for
operator mutations. `diagnosisUiPhase` is presentation navigation only: it may
open the diagnosis, inspection, approved-diagnosis, scoped-fix, or historical
view, but it cannot make an unavailable command available.

## Durable transition contract

| Durable condition | Lifecycle projection | Operator action |
| --- | --- | --- |
| No completed evaluation, or evidence is still required | `evaluation-needed` | `Evaluate` (or `Re-evaluate`/`Clarify` when a prior diagnosis was rejected or ambiguous) |
| Evidence complete and no diagnosis recorded | `diagnosis-ready` | `Diagnose` |
| Diagnosis recorded and awaiting review | `diagnosis-review` | `Review`/`Revalidate` only when the descriptor says available; otherwise the descriptor explains the block |
| Rejected, ambiguous, or insufficient diagnosis | `evaluation-needed` | `Evaluate`/`Re-evaluate`/`Clarify`; never `Next` or `Approve` |
| Confirmed diagnosis awaiting a fix | `awaiting-fix` | `Fix` only when `record-fix-available` is primary/available |
| Fix is available to apply | `fix-ready` | `Fix`/Scoped Fix only when `apply-scoped-fix` is primary/available |
| Fix applied and customer verification is pending | `verification` | `Evaluate` the customer confirmation (or the lifecycle-described alternative) |
| Latest evaluation is ready to close | `ready-for-close` | `Resolve` |
| No governed action remains | `resolved` or `escalated` | Show the lifecycle explanation; do not manufacture a mutation |

The evidence-request loop is repeatable: `Evaluate → Send → customer reply →
Evaluate`. If evidence is complete, the next authoritative projection is
`diagnosis-ready`; if the diagnosis is not confirmed, the next loop is again
`evaluation-needed` with the evidence/questions supplied by the lifecycle and
playbook. A customer confirmation reaches `ready-for-close` only after the
backend evaluates it. “Further investigation required” is presentation copy,
not a new durable lifecycle state.

Back is always a local presentation transition. It refreshes the ticket,
diagnoses, and lifecycle before rendering the destination view. Selecting an
older diagnosis is read-only history and never replaces the current lifecycle
action bar.

## Acceptance invariant

For every durable ticket state, the Approval Desk action bar renders the
lifecycle primary action (or clearly explains why the lifecycle exposes no
operator action), and never advertises a mutation that the backend would reject
from that same state.
