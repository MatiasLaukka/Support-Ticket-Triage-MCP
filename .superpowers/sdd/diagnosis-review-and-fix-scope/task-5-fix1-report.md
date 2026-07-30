# Task 5 fix 1 — selected-ticket safety and UI authority cleanup

## Fixed review findings

- Added one selected-ticket request identity and used it to fence ticket-detail
  loads, diagnosis-list loads, diagnosis review mutations, and scoped-fix
  mutations. A response or error from ticket A is ignored after ticket B is
  selected.
- Clears diagnosis state and renders a loading panel immediately for a new
  ticket selection. The panel displays a load failure only when that failure
  belongs to the still-current ticket.
- Reject reviews remain review history. Only approve and revalidate reviews
  may provide the active reviewed diagnosis/draft context.
- Removed browser-side timeline/diagnosis-field eligibility inference for the
  Diagnose and Fix actions. The UI follows `operatorGuidance.nextAction` when
  the server provides it; without guidance, it exposes passive explicit
  controls and relies on the service to validate the request.
- Removed two obsolete UI tests that asserted old browser-derived fix
  eligibility rather than the server guidance contract.

## Regression coverage

- Delayed ticket-detail and diagnosis-list response from A cannot replace B.
- Delayed successful review and scoped-fix responses from A cannot render in
  B's diagnosis panel.
- Delayed failed review and scoped-fix responses from A cannot replace B's
  result panel.
- A rejected review stays out of the active review draft.
- A slow/failing diagnosis load clears the old diagnosis before showing the
  current ticket's loading/failure state.
- Explicit server guidance controls Diagnose/Fix visibility independently of
  timeline fields.

## Verification

- `npx vitest run test/approval-desk-ui.test.ts` — 75 passed.
- `npx vitest run test/approval-desk-http.test.ts` — 72 passed.
- `npm run typecheck` — passed.
- `git diff --check` — passed.
