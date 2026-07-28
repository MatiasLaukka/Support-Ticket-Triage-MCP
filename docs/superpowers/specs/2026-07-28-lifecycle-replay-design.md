# Lifecycle Replay Design

## Purpose

The AI comparison harness already measures classification agreement, evidence
obligations, response quality, safety gates, and fallback behavior. It does not
make it easy for a human reviewer to judge whether a GPT response feels natural
in its actual ticket context. Lifecycle Replay adds a read-only browser view
for that review.

## Goals

- Show the latest sanitized live evaluation report together with the synthetic
  ticket and conversation context that produced each draft.
- Let a reviewer move between ticket groups and lifecycle snapshots without
  mutating runtime data.
- Show actual GPT drafts beside deterministic drafts when both are available.
- Make customer-visible text, operator-only evidence, GPT advisory output,
  validator results, and approval boundaries visually distinct.
- Preserve the distinction between independent evaluation snapshots and a
  single chronological ticket history.
- Work without another OpenAI call after the report has been generated.

## Non-goals

- No interactive fork, ticket mutation, approval, closure, or outbound message.
- No automatic stitching of snapshots into an inferred journey.
- No new GPT provider, prompt, classifier, or diagnostic-state behavior.
- No replacement for the existing Approval Desk conversation workspace.

## Architecture and data flow

Add a separate read-only route, `/lifecycle-replay`, to the local Approval Desk
server. The route serves a replay view model assembled from:

1. `reports/ai-comparison/live-latest.json`, which contains sanitized lane
   results, drafts, provenance, quality breakdowns, and failure reasons.
2. The synthetic diagnostic scenario metadata and seed ticket data, which add
   ticket fields, customer replies, previous support responses, expected
   lifecycle context, and scenario families.

The server joins records by `scenarioId` and uses a composite
`ticketId + scenarioId` key for navigation. Missing reports or missing optional
context produce explicit unavailable states; the server must not invent a
customer reply, lifecycle event, or provider result.

The view model is read-only and must not use the runtime ticket store or audit
writer. Provider metadata remains sanitized, and candidate model output that
the existing report serializer omits remains omitted here as well.

## Navigation and interaction

The left rail groups snapshots under their ticket:

```text
TKT-1008 — Webhook signature failures
  Partial evidence received
  Stale customer reply

TKT-1010 — Campaign editor blank
  Initial ambiguity
  Bounded specialist escalation
  Failed fix recheck
  Customer confirmation
```

The UI labels these as snapshots, not one continuous history. A reviewer can
filter by lifecycle stage, lane result, GPT usage, and failure status; select a
lane; and move to the previous or next snapshot. The selected lane persists
when changing snapshots, while the timeline cursor resets to the start.

The center panel presents the snapshot timeline:

1. Original ticket.
2. Customer reply, if present.
3. Previous support response, if present.
4. Evaluation and classification.
5. Evidence readiness and lifecycle state.
6. Actual customer-response draft.
7. Validator and response-quality results.
8. Human approval boundary.

The right panel explains the response with final classification, advisory
classification when used, knowledge citations, provided and missing evidence,
repair/fallback provenance, word count, and quality checks. A draft comparison
toggle shows deterministic and GPT wording side by side. A customer-view toggle
hides operator-only details and leaves only the conversation and customer draft.

The replay stops at the approval boundary. It displays “Human approval
required; replay is read-only” and provides no approval action.

## Safety and provenance

- Customer text is displayed as untrusted fixture content, never as UI
  instructions.
- The page must clearly label fixture customer replies versus live GPT drafts.
- Prompt-injection details remain operator-only according to the existing
  sanitized report rules.
- No OpenAI call occurs when opening or navigating the page.
- No runtime ticket, recommendation, audit event, or approval state changes.
- A missing or stale live report is shown as unavailable rather than silently
  replaced with controlled output.

## Testing and acceptance criteria

Unit and route tests will cover:

- joining report scenarios with ticket and conversation metadata;
- grouping multiple snapshots under one ticket;
- composite-key navigation and lane selection;
- rendering missing replies and missing optional provenance safely;
- customer/operator view separation;
- approval-boundary rendering;
- absence of provider calls and runtime mutations.

Acceptance is met when a reviewer can select a ticket, choose a lifecycle
snapshot and GPT lane, step through the complete available context, compare the
actual GPT and deterministic drafts, inspect the evidence and validator
results, and stop at the explicit approval boundary without changing local
workflow state.
