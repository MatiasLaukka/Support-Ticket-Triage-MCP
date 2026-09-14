---
id: event-tracking-debugging
title: Event Tracking Debugging
tags: events, tracking, metrics, timeline
---
# Event tracking debugging

A symptom alone does not confirm a cause. Do not claim a fix without verification.
An accepted API response, timeline appearance, and downstream qualification are
separate observations. Match event/profile identity and time before interpreting
a missing entry. Multiple affected stores with accepted events and missing
timeline updates support broad-impact investigation; one isolated example does
not establish an incident. Event presence calls for qualification checks before
blaming ingestion for a missing flow entry. Keep missing or contradictory
evidence explicit. Do not claim data loss, promise an ingestion deadline, or
prescribe an undocumented timestamp syntax. Verify the affected event and
downstream result after any governed correction before calling it fixed.

## Event identity and timing evidence

Collect metric/event name, profile email or customer ID, event timestamp with time
zone, API response status, request/event ID when available, and a sample payload
with secrets removed. Reuse supplied details. Compare payload shape and profile
identity with the activity timeline. Compare storefront time, API accepted time,
and timeline time for the same event. Record which observations are missing;
an accepted response alone does not prove timeline appearance or data loss.

## Event absence versus downstream qualification

If the event is absent, compare identity and timing before narrowing the cause.
Ingestion delay, malformed customer properties, duplicate profile identifiers,
and timestamp conversion are possible investigation areas, not established
causes from the symptom. Compare the redacted payload and validation response
before recommending changes; this article supplies no accepted timestamp syntax.
If the event is present but a flow or segment did not qualify, inspect its rules.
Flow filters, consent, smart sending, and prior entry need their own evidence;
see [flow trigger troubleshooting](flow-trigger-troubleshooting.md).

## Event isolated versus broad impact

For missing timeline updates, compare affected stores/profiles, region, event
acceptance evidence, and overlapping times. Multiple stores with accepted events
and missing timelines support platform investigation, but do not independently
prove a root cause or a mitigation. Correlate related customer reports before
treating each as isolated. A single affected profile or conflicting timeline
results need identity/timing comparisons and further scope evidence. Do not
promote a similar report into proof that the same cause applies.

## Event verification and escalation

After a governed correction, compare the affected event's response, profile
timeline, and relevant downstream qualification. A visible event verifies that
observation only; it does not establish that every flow or segment should qualify.
If the timeline remains missing or results conflict, hand off redacted payload,
request identifiers, times, affected scope, and the checks already completed.
Use trusted evidence before claiming incident impact or resolution, and do not
ask customers to repeat evidence already provided. The
[support operations playbook](support-operations-playbook.md) sets evidence,
routing, and approval boundaries; no ingestion SLA is defined here.
