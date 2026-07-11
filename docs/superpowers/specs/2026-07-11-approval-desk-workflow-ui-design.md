# Approval Desk Workflow UI Design

## Goal

Make the Approval Desk easier to understand and present by reducing visible
information density, separating setup from approval, and making ticket workflow
state obvious. The UI should feel closer to an operator workflow while
preserving the current recommendation, approval, and audit model.

## Current State

The Approval Desk already supports deterministic triage recommendations,
optional GPT drafting, GPT Assist fields, human approval controls, and audit
evidence. The current layout exposes too much internal detail at once:

- queue items wrap poorly and combine ticket subject, customer, and revision;
- actor and draft style live in the approval area even though they are inputs to
  recommendation creation;
- the recommendation panel shows draft text, safety evidence, GPT Assist,
  internal values, and approval controls in one long view;
- approval rows have crowded explanations beside narrow inputs;
- existing pending or approved recommendations are not surfaced as a natural
  review state when a ticket is selected.

## Recommended Approach

Use a staged workflow UI:

1. Select an active ticket from a readable queue.
2. Review subject, description, requester, and compact ticket context.
3. Configure actor and draft style in the ticket panel.
4. Generate a recommendation.
5. Review the draft customer response and compact assist/safety evidence.
6. Continue to approval when ready.
7. Approve or reject named fields with clear, compact controls.

This keeps the main demo story focused on the customer-facing draft and human
decision while keeping audit details available on demand.

## Queue Design

Queue rows should place important text on separate lines:

- ticket ID;
- subject;
- customer or requester;
- revision and workflow state;
- compact risk/status pills.

Workflow state and risk should be visually separate:

- neutral or blue: active ticket with no recommendation;
- amber: pending recommendation;
- green: approved or applied recommendation;
- muted grey: inactive or closed ticket;
- red/orange pills: SLA, outage, security, or high-priority risk.

The queue should default to active tickets and provide simple filter chips for
active, pending, approved, and all tickets.

## Ticket Panel

The middle panel should make the ticket easy to explain:

- subject and description remain the largest ticket content;
- requester information is visible in a compact card;
- technical details stay collapsed;
- developer/audit output stays collapsed;
- actor, draft style, and the create recommendation button move into a
  "Recommendation setup" card below the ticket context.

Actor should be treated as the reviewer display name used in generated sign-off
text. If the actor is blank, the UI should fall back to a support-team label.

## Draft Sign-Off

Customer-facing drafts should end with:

```text
Kind regards,
[Actor]
[Company]
```

The company name should come from a single local display constant or
configuration value. GPT drafts, deterministic drafts, and fallback drafts
should all use the same sign-off rule. Validation should record a warning or
repair the draft if the sign-off is missing.

## Recommendation Panel

The right panel should show stages instead of everything at once:

- no recommendation: simple empty state;
- draft review: draft customer response as the main card, with compact
  expandable GPT Assist and safety sections;
- approval: named-field approval controls, edited customer response, approve
  action, and reject action.

"Why this draft is safe" and "GPT Assist" should be smaller by default. They
can use compact chips plus expandable detail sections. The customer-facing
draft remains the primary visual object.

## Approval Controls

Approval rows should use a field-and-action layout instead of crowded checkbox
rows:

- field label;
- editable proposed value;
- approve toggle or button;
- small info control for explanatory text.

The explanation should not consume row width. The customer response field stays
larger because it is the main human-reviewed customer output.

## Existing Recommendations

When selecting a ticket, the UI should load the latest related recommendation
state:

- pending recommendation: show the draft and allow the user to continue to
  approval;
- approved recommendation: show the submitted draft/read-only outcome and allow
  review;
- new recommendation: warn before replacing the visible workflow with a fresh
  recommendation.

The system should not delete or silently overwrite old recommendations. If a
new recommendation replaces a pending one, the old pending recommendation
should be resolved with an audit-visible superseded/rejected result before the
new recommendation is created.

## API And Data Flow

The ticket list API should include enough recommendation summary data for queue
coloring without triggering GPT calls. This can be derived from local
recommendation repository state:

- latest recommendation ID;
- latest recommendation resolution;
- pending recommendation count or boolean;
- approved recommendation count or boolean;
- risk flags already present in recommendations where available.

Ticket detail should also return the latest related recommendation summary so
the UI can display an existing draft or review state immediately.

## Error Handling

- If queue recommendation summaries fail, the queue should still load tickets
  and show neutral state.
- If creating a new recommendation while one is pending, the UI must require
  explicit confirmation.
- If superseding a pending recommendation fails, do not create the replacement.
- If GPT drafting fails, keep the existing fallback behavior and show the
  warning in compact safety evidence.

## Testing

Add or update tests for:

- queue API includes recommendation summary data;
- queue UI renders separated ticket lines and workflow/risk state;
- actor and draft style are submitted from the ticket panel;
- drafts include the configured sign-off;
- GPT, deterministic, and fallback paths preserve sign-off behavior;
- right panel starts in draft-review mode after generation;
- approval controls remain hidden until the user continues to approval;
- pending recommendations can be reviewed when a ticket is selected;
- creating a new recommendation with an existing pending one requires
  confirmation and preserves audit history.

## Out Of Scope

- Sending customer messages externally.
- Replacing deterministic triage decisions with GPT decisions.
- Adding a full multi-page router.
- Adding a database.
- Building a full design system.
