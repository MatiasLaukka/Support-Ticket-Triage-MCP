# Demo Results And Examples

This page gives a short, repeatable story for reviewers who want to understand
what the demo proves before running it.

## One-Command Demo

```powershell
npm ci
npm run build
npm run demo:showcase
```

The command resets local runtime data, starts the browser Approval Desk, and
prints a local URL.

## Resettable Skill Showcase Results

The separate command-line showcase uses fresh temporary state and exercises
the same governed lifecycle exclusively through MCP tools:

```powershell
npm run build
npm run demo:skill-showcase
npm run demo:skill-showcase -- --deterministic
```

Recorded results:

| Evidence | Controlled/default | Deterministic |
| --- | --- | --- |
| Reported mode | `controlled` | `deterministic` |
| Provider provenance | Classification and drafting are `controlled-local-simulation`; network is `disabled` | Classification and drafting are `not-configured`; network is `disabled` |
| External provider call | None; controlled local simulation only | None; no providers passed |
| Classification trace | Eight `used` stages | Eight `skipped` stages |
| Drafting trace | Eight normalized `used` local-simulation stages, all with local deterministic source | Eight `skipped` stages, all with local deterministic source |
| Human boundary | Eight disclosed `portfolio-reviewer` simulations using guidance-provided fields | Same |
| Lifecycle | Diagnose, Fix, verification, ready-for-close, closed | Same |
| Final status | `resolved` | `resolved` |

The checked-in [skill-showcase-example.md](skill-showcase-example.md) is a
compact static controlled-mode transcript. The current stateful report is
produced by `evaluate:lifecycle-replay`. Each workflow entry shows the new
next action, making the replay auditable without exposing ticket
text, response text, prompts, or provider payloads. Audit output is restricted
to event type, actor, and timestamp. The report also identifies the selected
safe mode and explicit provider provenance. Controlled traces are normalized
only for the showcase report so local simulation is never attributed to a
real external model adapter. Invalid, duplicate, or conflicting CLI arguments
exit nonzero instead of silently falling back to controlled mode.

The focused test command was:

```powershell
npm test -- --run test/demo-skill-showcase.test.ts
```

Result: one test file passed, with all 16 tests passing. The test verifies the
narrow report schema, exact guidance-driven lifecycle, explicit controlled
local-simulation provenance, accepted local deterministic drafting,
no-provider deterministic skipped semantics,
safe live-mode configuration failure, and preservation of the real live
OpenAI adapters when live mode is explicitly configured.

Live mode is optional and was not run for these results. To run it, set the key
only in the current shell and select it explicitly:

```powershell
$env:OPENAI_API_KEY = 'set-in-the-shell-only'
npm run demo:skill-showcase -- --live
```

## Stateful Diagnostic Lifecycle Replay

The showcase above is a useful MCP transcript, but the dedicated lifecycle
evaluator makes its chronological guarantees machine-checkable:

```powershell
npm run evaluate:lifecycle-replay
```

Current deterministic result:

| Check | Result |
| --- | --- |
| Complete workflow reads | 23 |
| Governed MCP actions | 20 |
| Read before every MCP action | PASS |
| Ordered journey | evidence → diagnosis → approval → response → mitigation/fix → verification → closure |
| Final ticket status | `resolved` |
| Context-aware diagnostic matrix | 11/11 scenarios |

The evaluator keeps the bounded-ambiguity/escalation observation visible as a
supporting path. It verifies that unresolved diagnostic ambiguity remains a
specialist handoff, not an autonomous fix or closure. This replay is stateful;
the separate eleven-scenario matrix remains intentionally non-mutating and
tests breadth across known causes/events, evidence, ambiguity, stale replies,
fixes, and adversarial text.

## Primary Scenario

Ticket: `TKT-1010`

Scenario: the initial ticket is vague: subject `Problem`, description `It does
not work`. The reviewer adds a realistic customer reply:

```text
I was trying to open the campaign editor, but the page stayed blank. The steps were: I opened the campaign, clicked Edit, and then the page stayed blank.
```

In the Approval Desk, add this reply by expanding the action bar's **Advanced
settings**, checking **Disable automatic customer replies**, expanding **Manual
customer reply**, pasting the text, clicking **Add reply**, and then clicking
**Evaluate**. Conversation Context itself is read-only.

Expected recommendation:

| Field | Expected value |
| --- | --- |
| Category | `performance` |
| Priority | `P3` |
| Team | `product` |
| Support state | `information-received` or `diagnosing` |
| Missing evidence | campaign name, failure timestamp, browser/session details, affected scope |

The important behavior is that the recommendation updates from the full
conversation. The system should stop treating the ticket as a generic support
request, should not require a screenshot of a blank page, and should draft a
reply about the campaign editor loading path.

## Alternate Incident Scenario

Ticket: `TKT-1001`

Scenario: recent EU Checkout Started events are delayed or missing from
customer profile timelines.

Expected recommendation:

| Field | Expected value |
| --- | --- |
| Category | `incident` |
| Priority | `P1` |
| Team | `incident-response` |
| Outage risk | `likely` |
| SLA risk | `likely` |

## Example GPT Draft

The exact response may vary by model, style, and current configuration. A good
draft should look roughly like this:

```text
Hi Northstar Apparel,

We are treating the delayed Checkout Started events across your EU stores as a
priority investigation and have escalated it to our incident response team.

To help us compare storefront event timing, API acceptance, and activity
timeline processing, please share the affected store URLs, one or two affected
profile emails or customer IDs, event timestamps with time zone, request IDs if
available, and whether the events were accepted by the API but are still
missing from profile timelines.

We will compare the event time, API accepted time, and timeline appearance
across the affected stores before recommending the next update.
```

Good customer-facing drafts should:

- avoid internal article IDs;
- avoid saying the issue is fixed before evidence confirms it;
- ask for only relevant evidence;
- use plain language for merchant users;
- make escalation or investigation status understandable.

## Safety Evidence To Point Out

In the Approval Desk, use the **Why this draft is safe** panel:

- `Source`: shows whether drafting came from OpenAI, deterministic local rules,
  or fallback.
- `Style`: shows the selected tone, such as `empathetic` or
  `executive-update`.
- `Checks`: summarizes validator status.
- `Retrieved context`: lists the local knowledge article IDs used internally.
- `Human approval`: confirms that the response is pending review before use.

Also point out the **Classifier evidence** and **Lifecycle summary** panels:

- deterministic safety and metadata signals are visible;
- GPT advisory signals, when configured, appear as `gpt-advisory-*` evidence;
- lifecycle state controls whether the draft asks for missing evidence,
  thanks the customer for partial information, explains a known cause, or
  prepares to close.

## Reproducible Fixture Evaluation

Run:

```powershell
npm run evaluate
```

Expected committed fixture result:

```json
{
  "ticketCount": 30,
  "categoryAccuracy": 1,
  "routingAccuracy": 1,
  "priorityAgreement": 1,
  "securityEscalationRecall": 1,
  "outageEscalationRecall": 1,
  "duplicatePrecision": 1,
  "duplicateRecall": 1,
  "knowledgeCitationCoverage": 1,
  "approvalSafetyViolations": 0
}
```

The evaluator scores committed synthetic recommendations against committed
expected outcomes. It does not evaluate real queues or live model quality.

## Useful Alternate Scenarios

| Ticket | What it demonstrates |
| --- | --- |
| `TKT-1005` | Prompt-injection in customer text is treated as evidence only. |
| `TKT-1004` | Security routing takes priority and requires missing scope evidence. |
| `TKT-1017` | Known-cause SMS quiet-hour blocks get solution-first wording. |
| `TKT-1008` | Webhook troubleshooting asks for delivery and signature evidence. |
| `TKT-1010` | Vague tickets can evolve after replies into a specific product diagnosis. |

