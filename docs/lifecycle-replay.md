# Lifecycle Replay Viewer

Lifecycle Replay is a separate, read-only browser surface for inspecting the
customer-facing output of `evaluate:ai-comparison`. It complements the
Approval Desk rather than becoming a second workflow engine.

## Run it

```powershell
npm run evaluate:ai-comparison
npm run demo:approval-desk
```

Use `npm run evaluate:ai-comparison -- --live` instead when an authenticated
live observation is useful. Open `/lifecycle-replay` on the local URL printed
by the Approval Desk runner.

## What is shown

- The left rail groups available snapshots by ticket.
- The snapshot rail labels the scenario and operator stage without claiming a
  chronological order that was not recorded.
- The center timeline shows the original request, customer replies, any prior
  support response, and the selected evaluation lane.
- Operator view exposes sanitized provenance, classification agreement and
  delta, response-quality breakdown, and failure reasons.
- Customer view hides internal provenance and shows the customer-facing draft
  plus the explicit approval pause.

The page reads the latest sanitized report files only. It does not call GPT,
create recommendations, write audit events, change tickets, or send responses.
It is therefore a snapshot viewer, not a chronological lifecycle test. For a
stateful verification using the authoritative MCP workflow, run:

```powershell
npm run evaluate:lifecycle-replay
```

That command drives the existing Approval Desk/MCP service through a complete
multi-turn journey and validates the full `get_ticket_workflow` context before
each action. The existing Approval Desk and MCP tools remain the authoritative
workflow surfaces for diagnosis, fixes, approval, and lifecycle transitions.
