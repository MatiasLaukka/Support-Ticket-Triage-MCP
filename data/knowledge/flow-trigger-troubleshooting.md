---
id: flow-trigger-troubleshooting
title: Flow Trigger Troubleshooting
tags: flows, triggers, filters, consent
---
# Flow trigger troubleshooting

A symptom alone does not confirm a cause. Do not claim a fix without verification.
A missing flow entry requires separate checks of event presence and profile
eligibility. An accepted event or visible timeline entry does not establish that
the profile should enter or receive a message. Compare event identity and timing,
flow status, trigger/profile filters, consent, smart sending, and prior entry.
An observed exclusion explains that check only; it does not prove every other
eligibility condition passed. Missing or conflicting records keep the diagnosis
open. Recommend a correction only after comparing the relevant qualification
evidence, retain consent protections, and verify the result through the governed
workflow before claiming a fix.

## Flow event-presence evidence

Collect flow name, profile email or customer ID, trigger event name, timestamp
with time zone, and profile flow history. Reuse facts already supplied. Compare
the event payload, profile timeline, and flow trigger metric for the same profile
and time. For abandoned-cart and browse abandonment flows, check ecommerce
product identifiers and the relevant event, such as Added to Cart or Viewed
Product. A near-matching event name is not proof of the configured trigger.
An absent event needs event-tracking investigation before a flow failure claim.

## Flow filters and message eligibility

When the matching event is present, compare flow status, trigger filters, profile
filters, consent state, smart sending, and whether the profile entered before.
Use flow analytics and qualification reasons to identify the observed exclusion.
Presence in a timeline does not prove eligibility, and one passed filter does not
prove every check passed. Do not bypass consent or message protections to make a
flow appear to work. Review actual qualification evidence before changing
priority or recommending a setup correction.

## Flow missing or contradictory observations

For a missing flow entry, request only absent evidence that changes the next
action. If one record shows an event and another does not, align profile identity,
event identity, and timestamps before choosing ingestion or eligibility as the
explanation. If exclusion and apparent eligibility conflict, compare the relevant
flow history and settings rather than asserting platform failure. Keep the
diagnosis provisional while those comparisons are incomplete.

## Flow correction verification and handoff

After qualification evidence supports a correction, use the governed workflow
and compare the affected profile's event, flow history, and qualification result.
Verify entry or the expected exclusion for that case; entry alone is not proof
of message eligibility. Continued failure requires the event, profile, flow,
timing, settings, and unresolved checks for handoff. Do not claim mapping or flow
behavior is fixed without recorded correction and verification. For absent or
delayed events, see [event tracking debugging](event-tracking-debugging.md).
Approval boundaries remain in the
[support operations playbook](support-operations-playbook.md).
