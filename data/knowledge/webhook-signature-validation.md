---
id: webhook-signature-validation
title: Webhook Signature Validation
tags: webhooks, signatures, delivery, retries
---
# Webhook signature validation

A symptom alone does not confirm a cause. Do not claim a fix without verification.
Signature failures require comparing the exact raw request body and headers that
were signed with receiver verification. After rotation, ask for rotation time
and confirmation that the receiver uses the current secret, never its value.
Only retry one delivery after confirming the current secret and verifying raw
body handling, through the governed support workflow. Delayed delivery requires
event creation, dispatch/attempt timing, endpoint status, and retry history before
assigning delay to the platform or receiver. Mixed or missing evidence leaves
both paths open. Do not invent a signing scheme, retry schedule, or guarantee.

## Webhook evidence and delivery identity

Collect delivery ID, endpoint URL, failure/delivery time with time zone, endpoint
response status, rotation time if relevant, and whether raw-body handling changed.
Reuse provided facts. Ask about parsing, proxying, compression, or middleware
changes and the receiver's timestamp tolerance without prescribing a tolerance.
Use redacted evidence; never request a live secret or unredacted private logs.
Match body and headers to the same delivery before comparing verification logic.

## Webhook rotation and raw-body alternatives

For failures after rotation, confirm the receiver uses the current signing secret
without collecting or regenerating it. Timing alone does not prove a mismatch;
unchanged secrets or failures before rotation weaken that explanation. Compare
the exact raw body and signed headers locally with the receiver's verification
input. A parsed or transformed payload is not that comparison. Raw-body changes
remain a separate investigation path even when rotation is ruled out. Missing or
conflicting observations require the remaining comparison before a code change.

## Webhook dispatch delay versus retries

For deliveries that eventually succeed, compare source event creation time,
platform dispatch and delivery attempt times where available, endpoint responses,
and retry history for the same delivery. Delay before dispatch and time spent in
retry attempts are different observations. Event creation and final success
alone cannot distinguish them. If dispatch timing or attempt history is absent,
request the missing record before claiming platform delay or endpoint fault.
Signature failures and latency can coexist; retain evidence for both paths.

## Webhook verification and handoff

After current-secret confirmation and raw-body verification, the demo contract
supports retrying one delivery through the governed workflow. Check the resulting
verification outcome and endpoint response for that delivery before claiming the
signature issue is fixed. For latency, compare its event and attempt timeline
again; successful delivery alone does not explain the delay. If a check fails or
evidence conflicts, hand off delivery identity, redacted comparisons, timing,
response status, and unresolved questions. Keep the cause provisional. The
[support operations playbook](support-operations-playbook.md) defines approval
and evidence boundaries; it supplies no retry schedule or cryptographic recipe.
