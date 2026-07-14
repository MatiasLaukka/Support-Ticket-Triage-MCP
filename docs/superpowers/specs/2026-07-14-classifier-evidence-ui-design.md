# Classifier Evidence UI Design

## Goal

Expose the deterministic classifier's reasoning in the Approval Desk without making the already-dense recommendation panel harder to present. The UI should make the backend intelligence visible to a reviewer or demo viewer, while keeping the draft customer response and approval flow as the main focus.

## Current State

Recommendations now include `classificationSignals`, `confidence`, category, priority, team, knowledge articles, escalation reasons, known cause, evidence readiness, GPT Assist, and the customer-facing draft. The right panel already has draft and approval stages, and the approval stage intentionally hides most recommendation details to reduce overload.

The classifier work is currently mostly invisible in the UI. A reviewer can see the final proposed fields, but not why the system chose them.

## Design

Add a compact classifier evidence block to the recommendation draft stage:

- show final classification summary: category, priority, team, and confidence;
- show 2-3 readable reason chips derived from the highest-value signals;
- show a warning/attention chip only when safety escalation, outage escalation, known cause, or metadata disagreement is present;
- keep the full signal list collapsed behind `Why this classification?`.

The default view should be small enough to scan in a few seconds. It should not compete visually with the draft customer response.

## Placement

In the right recommendation panel, place the classifier evidence block:

1. after the proposed field summary;
2. before the draft customer response;
3. before GPT Assist.

In approval stage, do not show the full evidence card. Replace it with a one-line compact reference:

`Classification evidence available - 6 signals`

with a small `Review` button or link that returns to the recommendation view.

## Expanded View

The expanded view should group signals into human-friendly sections:

- Customer text;
- Submitted metadata;
- Safety rules;
- Known cause;
- Other supporting rules.

Each signal row should show:

- short label;
- weight;
- readable reason.

Raw signal targets such as `category:integration` or `knownCause:webhook-secret-rotation` may appear in a subdued monospace detail line, but the main text should be readable.

## Signal Presentation Rules

The UI should convert raw signals into concise labels:

- `category:*`, `team:*`, and `priority:*` become proposed field reasons;
- `knowledge:*` becomes knowledge/context reason;
- `knownCause:*` becomes detected known cause;
- `escalation:*` or `risk:*` becomes safety/escalation reason;
- `metadata-*` becomes submitted metadata signal;
- `disagreement:*` becomes metadata override/disagreement signal.

Top chips should prefer:

1. safety or escalation signals;
2. known cause signals;
3. strongest category/team/product-topic signals;
4. metadata disagreement signals.

Pure low-weight metadata support should not become a prominent chip unless it explains a disagreement.

## Empty And Legacy States

Some old recommendations may not include classifier signals. In that case:

- show the final category, priority, team, and confidence;
- display: `No classifier signal snapshot stored for this recommendation.`;
- do not show an empty expanded section.

## Accessibility And Readability

- Use a normal `<details>` disclosure for the expanded evidence.
- Keep chip labels short.
- Do not rely only on color to communicate safety or disagreement.
- Avoid dense tables; use stacked rows.
- Escape all rendered signal text.

## Non-Goals

- Do not add a separate classifier dashboard.
- Do not redesign the whole Approval Desk layout.
- Do not show every internal signal by default.
- Do not add editing controls for classifier signals.
- Do not let classifier evidence change approval behavior; it is explanatory only.

## Acceptance Criteria

- Draft-stage recommendations show a compact classifier evidence block.
- Expanded view shows grouped classifier signals with readable labels and reasons.
- Approval stage stays visually compact and does not duplicate the full evidence block.
- Recommendations without stored signals render gracefully.
- Existing approval controls, GPT Assist, draft response, and audit behavior remain unchanged.
