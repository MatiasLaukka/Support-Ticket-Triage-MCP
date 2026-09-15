# Knowledge readiness content review

Status: scoped content and the current 21 development labels are approved by Matu under `KR-B4-T5-DEVELOPMENT-APPROVAL-2026-09-15`, recorded at `2026-09-15T11:21:18.000Z`. The current nine static holdout labels and their development/holdout independence judgment are separately approved by Matu under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`, recorded at `2026-09-15T11:39:11.455Z`. Task 5's reviewed case sets are frozen in `data/evaluation/knowledge-readiness/manifest.json`; no holdout retrieval has been run.

Source baseline: `978a7a6e9cf88c61ab2fed623b4004ba37076231` (Task 2 completion). The four article frontmatter IDs, titles, and tags remain unchanged. No provider limit, schema, diagnostic path, cause detection, routing, or drafting implementation changed.

## Source matrix

| Scoped content | Authority and observed implementation | Authored interpretation and boundary |
| --- | --- | --- |
| Campaign editor session isolation and frontend loading | [Demo contract](../data/knowledge/support-operations-playbook.md), Evidence Rules / Safety Boundaries; baseline performance article; [existing executable](../src/approval-desk/diagnostic-playbooks.ts), diagnoseCampaignEditorLoading and its isolation predicates | Compare the same campaign across private window, another browser, and another admin. Console loading evidence, including ChunkLoadError, is a clue. Mixed results remain unresolved. No frontend mitigation recipe or promise is inferred from implementation text. |
| Webhook rotation and raw body | Demo contract, Webhook Evidence Rules and Known Causes; baseline webhook article; [known-cause catalog](../src/approval-desk/known-cause-catalog.ts), webhook-secret-rotation; existing article-backed webhook path | Confirm current-secret use without collecting it; compare the exact raw body and signed headers. One delivery retry requires current-secret confirmation and raw-body verification. No cryptographic scheme, header schema, tolerance value, or secret is invented. |
| Webhook dispatch and retries | Demo contract, Webhook delivery latency known cause; known-cause catalog webhook-delivery-latency; baseline webhook article | Compare creation, dispatch/attempt timing where available, endpoint response, and retry history. Mixed signature/delay observations retain both investigation paths. No retry schedule or guarantee is supplied. |
| Flow presence and eligibility | Baseline flow article; demo evidence/safety rules; diagnoseFlowTriggerIssue in existing executable | Compare event/profile identity, timestamp, status, filters, consent, smart sending, and prior entry. Observed exclusion is not proof that every other condition passed. Correction requires qualification evidence and governed verification. |
| Event acceptance, timing and scope | Baseline event article; demo General API evidence, Routing Principles and Safety Boundaries; diagnoseEventProcessingDelay and confirmsPlatformEventProcessingDelay | Accepted response, timeline appearance and downstream qualification are distinct. Multiple affected stores support investigation; neither acceptance nor similarity independently proves platform fault. No ingestion SLA or accepted timestamp syntax is authored. |

Code establishes current supported paths, not domain truth. In particular, the executable event-processing path emits a confirmed platform-delay diagnosis from textual broad-impact/accepted-event/missing-timeline signals and proposes an unspecified mitigation; the frontend path also names an unspecified mitigation. These stronger implementation statements are not promoted into article guarantees. This potential authority mismatch is recorded for later review, without changing executable behavior.

## Content gaps addressed

Each article now has five short sections: scope qualifications, discriminating evidence, alternative branches, missing/contradictory observations, and verification/handoff as appropriate. Every section has a descriptive immediate heading and remains understandable independently.

- [Performance](../data/knowledge/performance-troubleshooting.md): success in an isolated session versus cross-session failure with console evidence; missing/mixed checks; verification. General account, expensive-object, browser, telemetry, slow-load and timeout guidance remains.
- [Webhooks](../data/knowledge/webhook-signature-validation.md): rotation versus raw-body handling, dispatch versus retry timing, redacted evidence, and prerequisite-bound retry/verification.
- [Flows](../data/knowledge/flow-trigger-troubleshooting.md): matching event presence versus trigger/profile filters and message eligibility; consent, smart sending, re-entry history, contradictory records, and correction checks.
- [Events](../data/knowledge/event-tracking-debugging.md): acceptance versus timeline appearance, identity/timing comparisons, isolated versus broad scope, qualification cross-reference, and failed verification handoff. Existing payload, malformed-property, duplicate-identity, timestamp-conversion and segment guidance remains provisional.

## Descriptor alignment

The [four existing descriptors](../src/approval-desk/diagnostic-playbook-descriptors.ts) retain their IDs, titles and executable paths. Source projection still uses the existing [projectPlaybook](../src/retrieval/sources.ts) behavior.

| Descriptor | Added distinction | Article links |
| --- | --- | --- |
| campaign-editor | Browser-session success versus cross-session/frontend-loading evidence; ChunkLoadError alone insufficient | performance-troubleshooting |
| flow-trigger | Event presence versus filters/eligibility, with broad-impact context | flow-trigger-troubleshooting, event-tracking-debugging |
| event-processing-delay | Accepted events plus missing timelines across stores versus isolated observations; qualification is separate | event-tracking-debugging, flow-trigger-troubleshooting |
| article-backed | Scoped webhook rotation/raw-body/delivery timing investigation, while retaining the list of all nine existing branch families | webhook-signature-validation |

A webhook raw-body investigation is descriptive guidance, not a new executable branch. Other article-backed families remain named but are not claimed to be fully documented by this slice. Tests validate links against the authoritative article catalog and preserve descriptor identities.

## Actual provider projection audit

The existing fetch harness in each provider test captures the serialized Responses request and parses its string `input` field. There is no messages array in this implementation. The diagnosis and classification knowledge records contain id/title/tags/body; draft records contain title/tags/body. Each request has `store: false`.

[Diagnosis test](../test/diagnosis-reasoning-provider.test.ts) asserts exact equality with `article.body.slice(0, 1800)` for all four repository-loaded articles and asserts both required qualifications in those captured bodies. [Classification test](../test/classification-reasoning-provider.test.ts) and [draft test](../test/openai-draft-provider.test.ts) assert exact equality with the full repository-loaded bodies. Existing valid response fixtures remain local to their test modules.

A separate local audit invoked all three compiled production provider entry points with synthetic demo input and an intercepting fetch. It parsed the real serialized request JSON before stopping at the capture boundary. No network request occurred. All three sets of bodies matched the regression-test expectations exactly. The following excerpts are copied from those parsed request fields, not from a guessed prompt builder.

### Before/after character and byte counts

Counts are normalized repository article bodies: frontmatter excluded, CRLF converted to LF and outer whitespace trimmed, matching KnowledgeRepository. The before bodies came from `git show 978a7a6e9cf88c61ab2fed623b4004ba37076231:data/knowledge/<id>.md`; after bodies came from KnowledgeRepository. `body.length` is JavaScript string length, and bytes are `Buffer.byteLength(body, "utf8")`. These are not token counts. This authored snapshot ranges from 3,130 to 3,283 characters per full body, with at most 2,299 characters added to one article; no runtime provider cap changed.

| Article | Before body.length | After body.length | Character growth | Before UTF-8 bytes | After UTF-8 bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| event-tracking-debugging | 1035 | 3283 | +2248 | 1035 | 3283 |
| flow-trigger-troubleshooting | 989 | 3130 | +2141 | 989 | 3130 |
| performance-troubleshooting | 1079 | 3141 | +2062 | 1079 | 3141 |
| webhook-signature-validation | 926 | 3225 | +2299 | 926 | 3225 |

### Entire diagnosis views and cutoff assessment

Every block below contains the entire captured 1,800-character body. The flow view is encoded as a JSON string to preserve its final space without trailing Markdown whitespace; decoding it gives the exact body. Trailing incomplete words/sentences reflect the unchanged hard cutoff. The first section in every view contains both required qualifications and the relevant action prerequisites. The cutoff does not expose an action whose prerequisite is only later in the article.

- Event: ends during a conditional about an event already present. Identity/timing, provisional causes, redacted comparison before changes, and the ban on undocumented timestamp syntax already precede it.
- Flow: ends after “Do not bypass consent or message protections ”. The complete consent/qualification prerequisite is already in the scope section; the cutoff does not expose a bypass instruction.
- Performance: ends during a later inconsistent-result sentence. The complete missing/conflicting-evidence qualification, observed-success prerequisite for using a session, and verification condition already precede it.
- Webhook: ends at “Missing”. Raw-body/current-secret requirements, noncollection of secrets, provisional mixed evidence, and the prerequisite for a single retry already precede it.

#### event-tracking-debugging: diagnosis approvedKnowledge body

```text
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
If the event is present but a flow
```

#### flow-trigger-troubleshooting: diagnosis approvedKnowledge body

```json
"# Flow trigger troubleshooting\n\nA symptom alone does not confirm a cause. Do not claim a fix without verification.\nA missing flow entry requires separate checks of event presence and profile\neligibility. An accepted event or visible timeline entry does not establish that\nthe profile should enter or receive a message. Compare event identity and timing,\nflow status, trigger/profile filters, consent, smart sending, and prior entry.\nAn observed exclusion explains that check only; it does not prove every other\neligibility condition passed. Missing or conflicting records keep the diagnosis\nopen. Recommend a correction only after comparing the relevant qualification\nevidence, retain consent protections, and verify the result through the governed\nworkflow before claiming a fix.\n\n## Flow event-presence evidence\n\nCollect flow name, profile email or customer ID, trigger event name, timestamp\nwith time zone, and profile flow history. Reuse facts already supplied. Compare\nthe event payload, profile timeline, and flow trigger metric for the same profile\nand time. For abandoned-cart and browse abandonment flows, check ecommerce\nproduct identifiers and the relevant event, such as Added to Cart or Viewed\nProduct. A near-matching event name is not proof of the configured trigger.\nAn absent event needs event-tracking investigation before a flow failure claim.\n\n## Flow filters and message eligibility\n\nWhen the matching event is present, compare flow status, trigger filters, profile\nfilters, consent state, smart sending, and whether the profile entered before.\nUse flow analytics and qualification reasons to identify the observed exclusion.\nPresence in a timeline does not prove eligibility, and one passed filter does not\nprove every check passed. Do not bypass consent or message protections "
```

#### performance-troubleshooting: diagnosis approvedKnowledge body

```text
# Performance troubleshooting

A symptom alone does not confirm a cause. Do not claim a fix without verification.
For a blank campaign editor, distinguish success in an isolated browser session
from failure across sessions and admins with console loading evidence.
ChunkLoadError is a clue, not proof by itself. Missing or conflicting isolation
results require comparison before choosing a cause. Only suggest continuing in
a working session when the same campaign actually opens there. Cross-session
failure supports frontend investigation; it does not specify a mitigation.
Any correction needs the governed workflow and a check of the affected campaign
before a fix claim. Other slow pages, timeouts, and expensive campaign or segment
loads still require object, timing, and impact evidence.

## Campaign editor evidence and scope

For editor loading failures, collect the campaign or page, failure time with time
zone, browser/session details, and affected users or accounts. Reuse supplied
facts. Compare the same campaign in a private window, another browser, and with
another admin. If it remains blank, collect the console loading error and retry
time; another screenshot of the same blank page does not distinguish the causes.
Record which checks worked, failed, or were not tried. Compare different objects
and time windows separately so unlike checks do not appear to agree.

## Campaign editor session-isolation branch

When the same campaign opens in a private window or another browser, session
state is a supported investigation path. Continuing in that working session is
a scoped next step, not evidence that a platform fix was applied. If clearing
site data is proposed through the support workflow, verify the editor afterward
before calling it resolved. A later failure or inconsi
```

#### webhook-signature-validation: diagnosis approvedKnowledge body

```text
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
remain a separate investigation path even when rotation is ruled out. Missing
```

### Full classification and drafting bodies

For each article below, the full captured classification and draft body fields were byte-for-byte equal. One copy is shown for both; all content beyond character 1,800 is included.

#### event-tracking-debugging: classification and draft knowledgeArticles body

```markdown
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
see [flow trigger troubleshooting](../data/knowledge/flow-trigger-troubleshooting.md).

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
[support operations playbook](../data/knowledge/support-operations-playbook.md) sets evidence,
routing, and approval boundaries; no ingestion SLA is defined here.
```

#### flow-trigger-troubleshooting: classification and draft knowledgeArticles body

```markdown
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
delayed events, see [event tracking debugging](../data/knowledge/event-tracking-debugging.md).
Approval boundaries remain in the
[support operations playbook](../data/knowledge/support-operations-playbook.md).
```

#### performance-troubleshooting: classification and draft knowledgeArticles body

```markdown
# Performance troubleshooting

A symptom alone does not confirm a cause. Do not claim a fix without verification.
For a blank campaign editor, distinguish success in an isolated browser session
from failure across sessions and admins with console loading evidence.
ChunkLoadError is a clue, not proof by itself. Missing or conflicting isolation
results require comparison before choosing a cause. Only suggest continuing in
a working session when the same campaign actually opens there. Cross-session
failure supports frontend investigation; it does not specify a mitigation.
Any correction needs the governed workflow and a check of the affected campaign
before a fix claim. Other slow pages, timeouts, and expensive campaign or segment
loads still require object, timing, and impact evidence.

## Campaign editor evidence and scope

For editor loading failures, collect the campaign or page, failure time with time
zone, browser/session details, and affected users or accounts. Reuse supplied
facts. Compare the same campaign in a private window, another browser, and with
another admin. If it remains blank, collect the console loading error and retry
time; another screenshot of the same blank page does not distinguish the causes.
Record which checks worked, failed, or were not tried. Compare different objects
and time windows separately so unlike checks do not appear to agree.

## Campaign editor session-isolation branch

When the same campaign opens in a private window or another browser, session
state is a supported investigation path. Continuing in that working session is
a scoped next step, not evidence that a platform fix was applied. If clearing
site data is proposed through the support workflow, verify the editor afterward
before calling it resolved. A later failure or inconsistent comparison keeps
the cause open; record both results rather than selecting only the success.

## Campaign editor frontend-loading branch

When private-window, different-browser, and another-admin checks all fail for
the same campaign, compare the console error and retry time for frontend
investigation. ChunkLoadError alone does not establish platform fault. Successful
isolation contradicts a simple cross-session failure explanation. Hand off the
campaign, time, checks, and console evidence to engineering when that evidence
supports the path. Do not promise an unspecified frontend mitigation.

## Performance verification and unresolved checks

For an editor correction, verify that the affected campaign opens in the tested
session and record the result and time. Continued failure requires a handoff of
the failed checks, not a resolution claim. For other performance issues, compare
account configuration, expensive campaign or segment loads, browser state, and
platform activity using the affected object, time window, and impact scope.
Check platform telemetry or other trusted evidence before claiming a fix. Explain
the suspected area in plain language and request only evidence that changes the
next action. Follow the approval and evidence boundaries in the
[support operations playbook](../data/knowledge/support-operations-playbook.md).
```

#### webhook-signature-validation: classification and draft knowledgeArticles body

```markdown
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
[support operations playbook](../data/knowledge/support-operations-playbook.md) defines approval
and evidence boundaries; it supplies no retry schedule or cryptographic recipe.
```

## Generated section and link inspection

All 20 actual projectArticle representations were inspected in full. Each is a single short section; none requires a 4,000-character split. Scope, conditions and verification remain beside the actions they constrain, and no link is required to recover a safety-critical prerequisite. The semantic lengths below include the existing title and immediate-heading context; they are not section-body lengths or token counts.

| Article | Ordinal | Heading | Semantic text characters |
| --- | ---: | --- | ---: |
| event-tracking-debugging | 0 | Event tracking debugging | 827 |
| event-tracking-debugging | 1 | Event identity and timing evidence | 539 |
| event-tracking-debugging | 2 | Event absence versus downstream qualification | 695 |
| event-tracking-debugging | 3 | Event isolated versus broad impact | 595 |
| event-tracking-debugging | 4 | Event verification and escalation | 735 |
| flow-trigger-troubleshooting | 0 | Flow trigger troubleshooting | 808 |
| flow-trigger-troubleshooting | 1 | Flow event-presence evidence | 607 |
| flow-trigger-troubleshooting | 2 | Flow filters and message eligibility | 591 |
| flow-trigger-troubleshooting | 3 | Flow missing or contradictory observations | 531 |
| flow-trigger-troubleshooting | 4 | Flow correction verification and handoff | 721 |
| performance-troubleshooting | 0 | Performance troubleshooting | 821 |
| performance-troubleshooting | 1 | Campaign editor evidence and scope | 615 |
| performance-troubleshooting | 2 | Campaign editor session-isolation branch | 537 |
| performance-troubleshooting | 3 | Campaign editor frontend-loading branch | 530 |
| performance-troubleshooting | 4 | Performance verification and unresolved checks | 761 |
| webhook-signature-validation | 0 | Webhook signature validation | 776 |
| webhook-signature-validation | 1 | Webhook evidence and delivery identity | 552 |
| webhook-signature-validation | 2 | Webhook rotation and raw-body alternatives | 633 |
| webhook-signature-validation | 3 | Webhook dispatch delay versus retries | 616 |
| webhook-signature-validation | 4 | Webhook verification and handoff | 776 |

The content test verifies nonempty unique descriptive headings, at least five sections per scoped article, and existing relative article-link targets. The source test validates descriptor article IDs against repository-loaded catalog entries. Relative documentation links in this packet are also checked before commit.

## Deferred gaps

- Matu separately approved the scoped content/current 21 development labels and the current nine static holdout labels plus their development/holdout independence judgment. Task 5 freezes those exact reviewed inputs without retrieval execution.
- The Track API accepted timestamp syntax remains undefined. Existing generic references to accepted formats are not authority to invent one.
- Cryptographic schemes, exact webhook header/endpoint schemas, timestamp tolerances, retry schedules, ingestion SLAs, and frontend/event mitigation procedures are not defined here.
- Executable confirmation from textual signals may be stronger than the domain evidence warrants; review that mismatch separately. No behavior was changed.
- Other article-backed branches, real resolved-case corpus material, broad topic expansion, heading ancestry, B4 ranking and B5 applicability remain outside Task 3.
- No live provider quality, semantic retrieval improvement, reviewed-case coverage or overall readiness completion is claimed by these content/projection checks.

## Approval history

Matu explicitly approved the scoped content and the current revised 21 development cases. Decision reference: `KR-B4-T5-DEVELOPMENT-APPROVAL-2026-09-15`. Approval recording timestamp: `2026-09-15T11:21:18.000Z` (current UTC time when provenance was recorded; no exact earlier user-message time is inferred). Every development case contains this identical reviewer, reference, and `reviewedAt` value. Development labels and other case fields were preserved.

Matu separately approved only the current nine static holdout labels and their development/holdout independence judgment. Decision reference: `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`. Approval recording timestamp: `2026-09-15T11:39:11.455Z` (actual current UTC time when this provenance was recorded; no exact earlier user-message time is inferred). Every holdout case contains this identical reviewer, reference, and `reviewedAt` value. This approval does not authorize holdout retrieval, ranking, scoring, output inspection, corpus tuning, a provider call, a model download, or Task 6+ work.

## Task 5 approved development-label packet

Status: **approved and frozen for the scoped content, development labels, current nine static holdout labels, and the reviewed split-independence judgment**. `data/evaluation/knowledge-readiness/development.json` contains the same 21 synthetic development cases with their development decision provenance. `holdout.json` contains the same nine independent static cases with their separate holdout decision provenance. No case content or label field other than the holdout review objects changed during the freeze.

### Changed-content and projection audit

Task 5 changes no knowledge article, descriptor, known-cause definition, or implementation source. Article bindings were mechanically populated from current `projectArticle` projections at worktree baseline `01b3c3eec4d5ef81c90b836fefa1ca5944eecead`; canonical playbook and known-cause bindings were populated from current source projections. Every binding and rationale was then manually inspected for usefulness and necessity.

| Resource | Current source hash | Projected sections | Development use |
| --- | --- | ---: | --- |
| `knowledge-article:performance-troubleshooting` | `5fd0753b02a40fcc1c284cf1aa3bf233c49f7b7f2a6e09df9a6df7af79624773` | 5 | Editor evidence, isolation, frontend rule-out, and verification boundaries |
| `knowledge-article:webhook-signature-validation` | `4a392e4e557658c772d1d20ac63e5fc7da548f8e1f30ca32ac861368e7790740` | 5 | Delivery identity, rotation/raw-body alternatives, and delay/retry separation |
| `knowledge-article:event-tracking-debugging` | `a6785dc2e3b89b815bddbc8a5a4be5e6ec8107b753a465d59478824ac1654a41` | 5 | Event identity/timing and the presence-versus-qualification rule-out |
| `knowledge-article:flow-trigger-troubleshooting` | `cdaf23245ef63b96587de06e0addb41f2d78ec3ef44302e7f9d1d23a8229cc57` | 5 | Trigger presence, eligibility filters, and contradictory-observation handling |
| `diagnostic-playbook:campaign-editor` | `30e183b2a564ca707d781d3ff314bffac24fa3a4a155e6b6c54c3166ff2046d7` | 1 canonical | Next-step editor isolation, console, and disagreement checks |
| `diagnostic-playbook:flow-trigger` | `40e5aca249564ce6247dd700ad80e2a8ff428b4086f4a5278a8fe54cd6410926` | 1 canonical | Next-step event-presence and eligibility checks |
| `diagnostic-playbook:event-processing-delay` | `3b38083b5dcfc5f49f7b352e0107087f50f596d8fb1c250fd56de1b22a27c417` | 1 canonical | Accepted-event, missing-timeline, and multi-store comparison |
| `diagnostic-playbook:article-backed` | `04e13a97e9357ef049e53e0dfd305ff141ee6e86c18957e4e6ccba73c949b3b2` | 1 canonical | Substantive webhook identity, signature, raw-body, and latency evidence |
| `known-cause:webhook-secret-rotation` | `9b4e6cb36291e75d178159e62c47f94d4428fe3982010cce418ecd9ca48a164b` | 1 canonical | Provisional post-rotation investigation or explicit no-rotation hard negative |
| `known-cause:webhook-delivery-latency` | `b4ddd0860866bd79eb10a72361eb86d3c76239147eeac45360554b47c89a065f` | 1 canonical | Provisional timing/retry investigation for delayed deliveries |

Each relevant label has a current source hash, heading or canonical title, complete representation-ID set, and a source-section rationale. Broad articles and non-article resources are labeled relevant only when they supply a concrete next investigation step or rule-out. Relevance never asserts diagnostic-playbook applicability, known-cause confirmation, cause, SLA, mitigation, or executable authority. Explicit no-rotation variants mark `known-cause:webhook-secret-rotation` hard-negative. The opaque delivery-ID control has no relevant binding and marks the webhook article, article-backed playbook, rotation known cause, and latency known cause hard-negative. `labelsComplete` is false throughout, so unrelated corpus material remains unjudged.

### Descriptor summary

The packet does not alter descriptors. It now explicitly reviews their retrieval usefulness: `campaign-editor` is relevant to the editor evidence and rule-out cases; `flow-trigger` is relevant to the flow/event-presence and eligibility cases; `event-processing-delay` is relevant to the independent accepted-event/missing-timeline multi-store case; and the enriched `article-backed` descriptor is relevant to substantive webhook cases but a hard negative for the opaque-ID-only control. `webhook-secret-rotation` is relevant to the post-rotation signature case and hard-negative when rotation is explicitly ruled out; `webhook-delivery-latency` is relevant to delayed-delivery evidence cases and hard-negative for the opaque-ID-only control. These are retrieval usefulness labels, not applicability or selection decisions.

### Coverage and source-section matrix

| Family | Campaign editor | Webhook | Flow/event |
| --- | --- | --- | --- |
| Exact | `chunkload-001`, `no-code-001` | `rotation-001`, `opaque-id-negative-001` | `viewed-product-001`, `accepted-missing-multi-store-001` |
| Paraphrase | `screen-001` | `late-001` | `automation-001` |
| Contrast | `private-001` | `raw-body-001` | `excluded-001` |
| Disagreement probe | `disagreement-001` | `disagreement-001` | `disagreement-001` |
| Insufficient | `insufficient-001` | `insufficient-001` | `insufficient-001` |
| Near-match | `near-match-001` | `near-match-001` | `near-match-001` |

All topic/family cells are represented. The independent multi-store case binds `Event isolated versus broad impact` and reviews the event-processing-delay playbook without making root-cause, SLA, applicability, or mitigation claims. Truthful controlled variants share scenario groups, and each variant links to its source through `derivedFrom`: editor private-session contrast/platform-fix near-match, webhook raw-body/no-rotation contrast/rotation-request near-match, flow filter-exclusion contrast/ingestion-request near-match, editor `ChunkLoadError`/no-code exact control, and webhook rotation/opaque-ID control using the repeated `wh_7Qp9` seed. All of those linked cases remain in development, so the grouping preserves future split isolation instead of claiming false independence.

Every required label now states why the resource is necessary, not merely useful. The required resources are limited to the article branch that carries the decisive bounded distinction in the editor exact and private-session cases, webhook rotation and raw-body cases, flow exact and exclusion cases, and the multi-store broad-impact case. For `readiness-flow-contrast-excluded-001`, `knowledge-article:flow-trigger-troubleshooting` remains required while `knowledge-article:event-tracking-debugging` is relevant-only for its ingestion rule-out.

### Deferred and unresolved gaps

- The Track API accepted timestamp format remains unsupported and is not invented by any case.
- Unrelated article topics are unjudged; coverage does not claim broad corpus readiness.
- There are no real resolved-case resources or real resolved-ticket cases in this packet.
- The packet judges only the named playbooks and webhook known causes above; other playbooks, known causes, and resolved-ticket resources remain unjudged or not expected as declared per case.
- Retrieval relevance is not an applicability oracle. B5 or another governed consumer must still decide whether a diagnostic branch or known cause applies.
- No semantic/provider evidence, retrieval ranking, or overall B4 readiness claim exists. The human holdout-independence decision and frozen static identities are documented below; approval of static labels is not retrieval-quality evidence.

### Separate development and holdout decisions recorded

The development decision is recorded above and in every approved development case. The separate holdout decision is recorded above and in every approved holdout case. The manifest freezes the exact case-file hashes, current static corpus identity, representation version, scenario cutoff, relative file paths, and split assignments. It deliberately has no self-hash or future commit identity.

Structural validation evidence for the corrected packet is recorded in the appended Task 5 report after rerunning the current compiled `validateReadinessCases` helper against freshly projected article, playbook, and known-cause resources. No scoring or ranking inspection is part of that validation.

## Verification evidence

- Content RED: `npx vitest run test/knowledge-readiness-content.test.ts --maxWorkers=2` — 4 tests failed on the absent first-section qualification. The initial sandbox attempt could not create Vitest's temporary transform cache; the authorized retry reached the expected assertion failures.
- Provider/source RED: `npx vitest run test/diagnosis-reasoning-provider.test.ts test/classification-reasoning-provider.test.ts test/openai-draft-provider.test.ts test/retrieval-sources.test.ts --maxWorkers=2` — 2 failed, 55 passed. Diagnosis failed on the missing qualification; source failed on the missing event link. Existing full-body classification/draft behavior already passed characterization.
- Focused GREEN: `npx vitest run test/knowledge-readiness-content.test.ts test/retrieval-sources.test.ts test/diagnosis-reasoning-provider.test.ts test/classification-reasoning-provider.test.ts test/openai-draft-provider.test.ts test/diagnostic-playbooks.test.ts test/diagnostic-evaluation.test.ts test/draft-contract.test.ts test/draft-quality-guardrails.test.ts --maxWorkers=2` — 9 files passed, 105 tests passed.
- `npx tsc -p tsconfig.build.json` — exit 0. `npm run typecheck` — exit 0.
- No full suite or live provider call was run for Task 3.

## Task 5 approved static holdout-label packet

Status: **approved for the current static labels and frozen without retrieval execution**. [holdout.json](../data/evaluation/knowledge-readiness/holdout.json) contains nine synthetic cases (`TKT-9601` through `TKT-9609`), nine independent scenario groups, zero derived links, and 19 current source bindings. All nine review objects contain the exact holdout approval provenance recorded above. These are static labels against unchanged approved content at source revision `01b3c3eec4d5ef81c90b836fefa1ca5944eecead`.

No retrieval, index creation, provider call, ranking, scoring, holdout retrieval output inspection, corpus tuning, or live Ollama/Qwen was performed. Inspecting the static labels and source references is the only holdout inspection in this pass.

### Frozen manifest and split membership

The manifest uses paths relative to its own `data/evaluation/knowledge-readiness/` directory and contains no self-hash.

| Frozen identity | Value |
| --- | --- |
| Manifest schema | `1` |
| Source revision | `01b3c3eec4d5ef81c90b836fefa1ca5944eecead` |
| Static corpus SHA-256 | `43f9e3b0c9c3ca9095f7a15fd90e8a72d685a693c5a749646ffb4022de6082c5` |
| Representation version | `3` |
| Scenario cutoff | `2026-09-15T23:59:59.999Z` |
| Development file | `development.json` — `9a97bda213a3b2b1804464f5d9f343a79e907c257d3031c4c0c3952fd99a2f4a` |
| Holdout file | `holdout.json` — `12c2707681331a1938c6b5caa94189f55d42b9ecd1dcce2b4937bc9d0d1614b1` |

Frozen development membership (21): `readiness-editor-exact-chunkload-001`, `readiness-webhook-exact-rotation-001`, `readiness-flow-exact-viewed-product-001`, `readiness-editor-paraphrase-screen-001`, `readiness-webhook-paraphrase-late-001`, `readiness-flow-paraphrase-automation-001`, `readiness-editor-contrast-private-001`, `readiness-webhook-contrast-raw-body-001`, `readiness-flow-contrast-excluded-001`, `readiness-editor-disagreement-001`, `readiness-webhook-disagreement-001`, `readiness-flow-disagreement-001`, `readiness-editor-insufficient-001`, `readiness-webhook-insufficient-001`, `readiness-flow-insufficient-001`, `readiness-editor-near-match-001`, `readiness-webhook-near-match-001`, `readiness-flow-near-match-001`, `readiness-editor-exact-no-code-001`, `readiness-webhook-opaque-id-negative-001`, and `readiness-event-exact-accepted-missing-multi-store-001`.

Frozen holdout membership (9): `readiness-holdout-editor-expensive-list-control-001`, `readiness-holdout-editor-correction-recheck-failure-001`, `readiness-holdout-editor-stale-console-capture-001`, `readiness-holdout-webhook-cross-delivery-comparison-001`, `readiness-holdout-webhook-retry-response-verification-conflict-001`, `readiness-holdout-webhook-tolerance-request-001`, `readiness-holdout-flow-entry-message-protection-001`, `readiness-holdout-event-correction-downstream-unchecked-001`, and `readiness-holdout-event-capture-window-dispute-001`.

### Case summary and family matrix

The full case IDs below all have prefix `readiness-holdout-` and suffix `-001`. Each multi-tagged case states a separate rationale for each family in its label rationale. Required means the named article supplies a necessary distinction; relevant-only means a concrete next evidence check. Labels never confirm cause, playbook applicability, mitigation, or a fix.

| Case suffix | Topic | Families | Required article | Relevant-only resources | Hard negative |
| --- | --- | --- | --- | --- | --- |
| `editor-expensive-list-control` | campaign-editor | contrast, near-match | knowledge-article:performance-troubleshooting | none | diagnostic-playbook:campaign-editor |
| `editor-correction-recheck-failure` | campaign-editor | paraphrase | knowledge-article:performance-troubleshooting | diagnostic-playbook:campaign-editor | none |
| `editor-stale-console-capture` | campaign-editor | exact, insufficient | none | knowledge-article:performance-troubleshooting, diagnostic-playbook:campaign-editor | none |
| `webhook-cross-delivery-comparison` | webhook | exact, contrast | knowledge-article:webhook-signature-validation | diagnostic-playbook:article-backed | none |
| `webhook-retry-response-verification-conflict` | webhook | paraphrase, disagreement-probe | knowledge-article:webhook-signature-validation | diagnostic-playbook:article-backed | none |
| `webhook-tolerance-request` | webhook | insufficient, near-match | none | knowledge-article:webhook-signature-validation, diagnostic-playbook:article-backed | none |
| `flow-entry-message-protection` | flow-event | exact, near-match | knowledge-article:flow-trigger-troubleshooting | diagnostic-playbook:flow-trigger | none |
| `event-correction-downstream-unchecked` | flow-event | paraphrase, contrast | knowledge-article:event-tracking-debugging | knowledge-article:flow-trigger-troubleshooting, diagnostic-playbook:flow-trigger | none |
| `event-capture-window-dispute` | flow-event | disagreement-probe, insufficient | knowledge-article:event-tracking-debugging | diagnostic-playbook:event-processing-delay | none |

| Family | Campaign editor | Webhook | Flow/event |
| --- | --- | --- | --- |
| exact | `editor-stale-console-capture` | `webhook-cross-delivery-comparison` | `flow-entry-message-protection` |
| paraphrase | `editor-correction-recheck-failure` | `webhook-retry-response-verification-conflict` | `event-correction-downstream-unchecked` |
| contrast | `editor-expensive-list-control` | `webhook-cross-delivery-comparison` | `event-correction-downstream-unchecked` |
| disagreement-probe | deferred | `webhook-retry-response-verification-conflict` | `event-capture-window-dispute` |
| insufficient | `editor-stale-console-capture` | `webhook-tolerance-request` | `event-capture-window-dispute` |
| near-match | `editor-expensive-list-control` | `webhook-tolerance-request` | `flow-entry-message-protection` |

The holdout covers 17 of 18 topic/family cells. Campaign-editor disagreement-probe is deferred: the existing development packet already contains mixed browser/admin/object/time results, and relabeling a variant as independent would weaken split isolation. Development retains all 18 required cells. The nine-case holdout is small authored coverage, not a statistical sample or readiness completion claim.

### Static case details and source bindings

The source hashes below bind to unchanged source projections, not to case-file hashes. Every article heading lists the complete representation-ID set generated mechanically from its current projection. Canonical non-article bindings use their exact titles. Required resources are also in the relevant set. Other resources are unjudged (`labelsComplete: false`), and real resolved-ticket and known-cause coverage are `not-expected` throughout this holdout.

#### readiness-holdout-editor-expensive-list-control-001

- Ticket: `TKT-9601`; scenario group: `holdout-editor-expensive-list-control`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: Use the blank-editor remedy for a campaign list timeout. Opening the campaign list times out when its large saved view is selected. Opening the same campaigns directly in their editors succeeds in ordinary and private sessions for both admins. The requester asks for the blank-editor frontend mitigation; no editor loading failure occurred.
- Evidence limits: The affected object is the campaign list view, not an editor. The successful editors are direct observations; no frontend repair or platform telemetry is supplied.
- Family and label rationale: Contrast: the failing list and working editors separate object scope. Near-match: editor remedy wording does not make that path useful. The performance article is required for the necessary expensive-object and impact comparison; the campaign-editor playbook is a hard negative for the explicitly working editor. No cause or mitigation is selected.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:performance-troubleshooting` / `5fd0753b02a40fcc1c284cf1aa3bf233c49f7b7f2a6e09df9a6df7af79624773` | Performance verification and unresolved checks | `knowledge-article:performance-troubleshooting:section:4` | This article is required because the affected expensive list view needs object, timing, account and telemetry comparisons; editor isolation does not explain the list timeout. |

Hard-negative source identity: `diagnostic-playbook:campaign-editor`, source hash `30e183b2a564ca707d781d3ff314bffac24fa3a4a155e6b6c54c3166ff2046d7`, canonical title `Campaign editor loading`, representation `diagnostic-playbook:campaign-editor:canonical:0`. This is recorded here for review; the strict contract allows supporting sections only for relevant resources. Its rationale is the explicit successful editor observations and separately failing list view above.

#### readiness-holdout-editor-correction-recheck-failure-001

- Ticket: `TKT-9602`; scenario group: `holdout-editor-correction-recheck-failure`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: The composition workspace still cannot be used after the support change. An authorized support change is recorded for campaign Harbor. At 07:20Z the requester reopens Harbor in the tested session and the composition workspace remains empty. The change log says completed, but no successful opening has been observed afterward.
- Evidence limits: A completed change and a failed affected-campaign recheck are separate records. The change procedure and root cause are deliberately unspecified.
- Family and label rationale: Paraphrase: composition workspace names the editing surface without its usual loading vocabulary. The performance article is required for the necessary failed-verification handoff; the editor playbook is relevant to recording the affected campaign, session and recheck. A completed change does not establish resolution.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:performance-troubleshooting` / `5fd0753b02a40fcc1c284cf1aa3bf233c49f7b7f2a6e09df9a6df7af79624773` | Performance verification and unresolved checks | `knowledge-article:performance-troubleshooting:section:4` | This article is required because continued failure after a correction requires recording the result and handing off failed checks instead of claiming resolution. |
| `diagnostic-playbook:campaign-editor` / `30e183b2a564ca707d781d3ff314bffac24fa3a4a155e6b6c54c3166ff2046d7` | Campaign editor loading | `diagnostic-playbook:campaign-editor:canonical:0` | The descriptor is relevant for the next affected-campaign, session and verification comparison; it authorizes no additional correction. |

#### readiness-holdout-editor-stale-console-capture-001

- Ticket: `TKT-9603`; scenario group: `holdout-editor-stale-console-capture`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: ChunkLoadError from an earlier day attached to today's blank screen. Today's report says campaign Summit is blank at 08:40Z. The attached console export contains ChunkLoadError at 16:10Z yesterday during an earlier session; it has no campaign identifier. No console capture from today's failure or session comparisons are available.
- Evidence limits: The exact console code exists, but its time and object binding do not match the current observation. There is no contradictory current isolation outcome.
- Family and label rationale: Exact: ChunkLoadError is a real console term. Insufficient: the available export cannot establish current loading evidence because it belongs to another time and lacks object identity. Article and playbook are relevant for fresh aligned evidence, with no required branch or cause label.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:performance-troubleshooting` / `5fd0753b02a40fcc1c284cf1aa3bf233c49f7b7f2a6e09df9a6df7af79624773` | Campaign editor evidence and scope | `knowledge-article:performance-troubleshooting:section:1` | The section is relevant for comparing object and time separately and collecting the missing current console and isolation evidence. |
| `diagnostic-playbook:campaign-editor` / `30e183b2a564ca707d781d3ff314bffac24fa3a4a155e6b6c54c3166ff2046d7` | Campaign editor loading | `diagnostic-playbook:campaign-editor:canonical:0` | The descriptor is relevant for current console, same-campaign and session checks; the stale code does not confirm its frontend branch. |

#### readiness-holdout-webhook-cross-delivery-comparison-001

- Ticket: `TKT-9604`; scenario group: `holdout-webhook-cross-delivery-comparison`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: Raw body and signed headers came from different deliveries. Receiver verification failed for delivery packet_R41 at 06:12Z. The redacted comparison bundle contains the exact raw body for packet_R41 but signed headers labeled packet_R42 at 06:13Z. The receiver owner has not yet supplied a body-and-header pair for either individual delivery; rotation history is unknown.
- Evidence limits: Each artifact has an explicit delivery identity. No secret, signing scheme or completed verification comparison is supplied.
- Family and label rationale: Exact: raw body and signed headers describe the precise comparison inputs. Contrast: individually exact artifacts from different deliveries are not a matched pair. The webhook article is required for that necessary identity distinction; article-backed guidance is relevant for the next comparison. Unknown rotation is unjudged, not a hard negative.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:webhook-signature-validation` / `4a392e4e557658c772d1d20ac63e5fc7da548f8e1f30ca32ac861368e7790740` | Webhook evidence and delivery identity | `knowledge-article:webhook-signature-validation:section:1` | This article is required because matching body and headers to one delivery is necessary before receiver verification can be interpreted. |
| `diagnostic-playbook:article-backed` / `04e13a97e9357ef049e53e0dfd305ff141ee6e86c18957e4e6ccba73c949b3b2` | Article-backed diagnosis | `diagnostic-playbook:article-backed:canonical:0` | The descriptor is relevant for the next redacted delivery-identity and exact-body comparison; it does not confirm any signature cause. |

#### readiness-holdout-webhook-retry-response-verification-conflict-001

- Ticket: `TKT-9605`; scenario group: `holdout-webhook-retry-response-verification-conflict`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: The callback retry was accepted but the receiver still says it cannot authenticate it. After current-secret confirmation and raw-body verification, support retried one callback through the governed workflow. Its endpoint response is 200, but the receiver's verification record for that same delivery and attempt says failed. The operator proposes closing the signature issue based on the response alone.
- Evidence limits: Both outcomes refer to the same delivery and retry, so the disagreement is between response and verification results rather than record identity. No further retry or cause is proposed.
- Family and label rationale: Paraphrase: callback authentication describes webhook signature verification. Disagreement-probe: endpoint success and verification failure coexist for the same attempt. The webhook article is required for the necessary verification/handoff distinction; the playbook is relevant to unresolved evidence. HTTP success alone does not establish a signature fix.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:webhook-signature-validation` / `4a392e4e557658c772d1d20ac63e5fc7da548f8e1f30ca32ac861368e7790740` | Webhook verification and handoff | `knowledge-article:webhook-signature-validation:section:4` | This article is required because both verification outcome and endpoint response must be checked for the retried delivery; the failed verification requires handoff. |
| `diagnostic-playbook:article-backed` / `04e13a97e9357ef049e53e0dfd305ff141ee6e86c18957e4e6ccba73c949b3b2` | Article-backed diagnosis | `diagnostic-playbook:article-backed:canonical:0` | The descriptor is relevant for reconciling the same-delivery response and verification evidence while keeping cause provisional. |

#### readiness-holdout-webhook-tolerance-request-001

- Ticket: `TKT-9606`; scenario group: `holdout-webhook-tolerance-request`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: Give us the exact receiver timestamp tolerance for the signature error. The receiver rejects a callback and the operator requests a numeric timestamp tolerance to configure. No current tolerance setting, redacted signed timestamp, receive time, delivery identity, rotation history or raw-body comparison is available. The report supplies no delivery-latency observation.
- Evidence limits: This is a request for an undocumented numeric configuration value. Neither clock mismatch nor any rotation or latency cause is established.
- Family and label rationale: Insufficient: the relevant receiver setting and signed/received observations are missing. Near-match: a signature-related configuration request does not authorize a numeric recipe. Article and playbook are relevant for collecting scoped evidence; other known causes stay unjudged.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:webhook-signature-validation` / `4a392e4e557658c772d1d20ac63e5fc7da548f8e1f30ca32ac861368e7790740` | Webhook evidence and delivery identity | `knowledge-article:webhook-signature-validation:section:1` | The section explicitly asks about the receiver timestamp tolerance without prescribing one and requests the missing redacted delivery evidence. |
| `diagnostic-playbook:article-backed` / `04e13a97e9357ef049e53e0dfd305ff141ee6e86c18957e4e6ccba73c949b3b2` | Article-backed diagnosis | `diagnostic-playbook:article-backed:canonical:0` | The descriptor is relevant for the next delivery, body and signature evidence checks; it supplies no numeric tolerance or confirmed cause. |

#### readiness-holdout-flow-entry-message-protection-001

- Ticket: `TKT-9607`; scenario group: `holdout-flow-entry-message-protection`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: Disable smart sending because entry should guarantee a message. The Loyalty Reminder flow history shows profile member-C entered at 09:05Z for its matched trigger. Message analytics records smart sending as the exclusion at 09:06Z. The requester asks to disable the protection because entry should guarantee a message. Consent and remaining qualification checks have not been reviewed.
- Evidence limits: Flow entry is observed; this is not a missing-entry or event-ingestion report. One message-protection exclusion is known, without an all-eligibility claim.
- Family and label rationale: Exact: smart sending names the observed protection. Near-match: entry does not justify bypassing message protection. The flow article is required for the necessary entry-versus-message-eligibility distinction; flow-trigger guidance is relevant to remaining qualifications. No setting change or cause selection is authorized.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:flow-trigger-troubleshooting` / `cdaf23245ef63b96587de06e0addb41f2d78ec3ef44302e7f9d1d23a8229cc57` | Flow correction verification and handoff | `knowledge-article:flow-trigger-troubleshooting:section:4` | This article is required because entry alone is not proof of message eligibility and the affected qualification outcome must be verified. |
| `knowledge-article:flow-trigger-troubleshooting` / `cdaf23245ef63b96587de06e0addb41f2d78ec3ef44302e7f9d1d23a8229cc57` | Flow filters and message eligibility | `knowledge-article:flow-trigger-troubleshooting:section:2` | The section is relevant for retaining smart-sending and consent protections while comparing remaining checks. |
| `diagnostic-playbook:flow-trigger` / `40e5aca249564ce6247dd700ad80e2a8ff428b4086f4a5278a8fe54cd6410926` | Flow trigger troubleshooting | `diagnostic-playbook:flow-trigger:canonical:0` | The descriptor is relevant for the next message-eligibility and consent comparison even though flow entry already succeeded; relevance is not branch applicability. |

#### readiness-holdout-event-correction-downstream-unchecked-001

- Ticket: `TKT-9608`; scenario group: `holdout-event-correction-downstream-unchecked`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: The activity returned after the change; can the follow-up automation be called fixed?. After a governed correction, a redacted request log and profile timeline show the affected Membership Renewed event for member-D at 10:22Z. The follow-up flow history and qualification outcome have not been checked. Support asks whether the visible activity is enough to say both tracking and the automation are fixed.
- Evidence limits: The affected timeline observation was verified after a recorded correction. Downstream results are absent, not observed exclusions. No correction procedure or broad incident is invented.
- Family and label rationale: Paraphrase: activity and follow-up automation describe event appearance and downstream flow behavior. Contrast: verified timeline appearance and unverified downstream results support different claims. The event article is required for the necessary verification limit; the flow article and flow-trigger playbook supply the next qualification checks.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:event-tracking-debugging` / `a6785dc2e3b89b815bddbc8a5a4be5e6ec8107b753a465d59478824ac1654a41` | Event verification and escalation | `knowledge-article:event-tracking-debugging:section:4` | This article is required because a visible affected event verifies that observation only and does not establish downstream qualification. |
| `knowledge-article:flow-trigger-troubleshooting` / `cdaf23245ef63b96587de06e0addb41f2d78ec3ef44302e7f9d1d23a8229cc57` | Flow correction verification and handoff | `knowledge-article:flow-trigger-troubleshooting:section:4` | The section is relevant for checking the affected profile's history and expected qualification result before a flow fix claim. |
| `diagnostic-playbook:flow-trigger` / `40e5aca249564ce6247dd700ad80e2a8ff428b4086f4a5278a8fe54cd6410926` | Flow trigger troubleshooting | `diagnostic-playbook:flow-trigger:canonical:0` | The descriptor is relevant for the next flow history, status and qualification comparison; no failure branch or applicability is inferred. |

#### readiness-holdout-event-capture-window-dispute-001

- Ticket: `TKT-9609`; scenario group: `holdout-event-capture-window-dispute`; split: `holdout`; `derivedFrom: []`; review: `approved` under `KR-B4-T5-HOLDOUT-APPROVAL-2026-09-15`.
- Scenario: Accepted record and timeline screenshots use different observation windows. For one identified profile, the API log records Membership Paused accepted at 11:42Z. A timeline screenshot captured at 11:35Z contains no such event. The operator calls this contradictory evidence of lost processing. No screenshot or timeline query after acceptance, redacted payload comparison, or other affected profile is available.
- Evidence limits: The only absence observation predates acceptance. Identity is aligned, but there is no post-acceptance absence observation and no broad-impact evidence.
- Family and label rationale: Disagreement-probe: the requester frames acceptance and absence as a contradiction. Insufficient: the timeline capture predates the accepted event, so current appearance is unknown. The event article is required for the necessary temporal comparison; event-processing guidance is relevant only for obtaining an aligned timeline and scope check, without data-loss or platform-delay claims.

| Resource and source hash | Heading / canonical title | Representation IDs | Binding rationale |
| --- | --- | --- | --- |
| `knowledge-article:event-tracking-debugging` / `a6785dc2e3b89b815bddbc8a5a4be5e6ec8107b753a465d59478824ac1654a41` | Event identity and timing evidence | `knowledge-article:event-tracking-debugging:section:1` | This article is required because comparing accepted and timeline times is necessary to reject a pre-acceptance screenshot as evidence of later absence. |
| `diagnostic-playbook:event-processing-delay` / `3b38083b5dcfc5f49f7b352e0107087f50f596d8fb1c250fd56de1b22a27c417` | Event processing delay | `diagnostic-playbook:event-processing-delay:canonical:0` | The descriptor is relevant for a fresh identity/timing/timeline comparison and checking affected scope; a single pre-acceptance screenshot does not establish platform delay, root cause or mitigation. |

### Independence evidence

Authoring used approved article sections and descriptor projections as domain references. Source sharing is intentional; it is not scenario derivation. The current 21 development descriptions/groups/links, 30 published seed ticket descriptions (`data/seed/tickets.json`), and published browser-session fixture (`src/retrieval/evaluation-fixtures.ts`, `TKT-1031`) were inspected for scenario overlap. Those published seeds are exclusion references, not templates or new holdout provenance. No development or seed scenario was paraphrased, renamed, or linked into holdout. Empty derived links describe this authoring history; the validator cannot prove semantic independence by itself.

| Holdout scenario | Distinct observation structure used for author independence judgment |
| --- | --- |
| editor-expensive-list-control | A list view times out while editors explicitly work; the development editor failures/private-session controls and published browser-session fixture do not cover a different failing product object. |
| editor-correction-recheck-failure | A recorded correction is followed by a failed affected-campaign recheck; development does not contain this verification sequence. |
| editor-stale-console-capture | A historical, unidentified console artifact is being used for a current failure; no mixed current browser outcomes or published seed is reused. |
| webhook-cross-delivery-comparison | Individually identified body and headers belong to different deliveries; no rotation/raw-body-change or delay/retry seed event is reused. |
| webhook-retry-response-verification-conflict | One governed retry has a successful endpoint response and failed verification for that same attempt; this is not development's separate-delivery signature/latency mixture. |
| webhook-tolerance-request | A request for an undocumented numeric tolerance with missing receiver observations; no rotation event, middleware change or delayed-delivery scenario is reused. |
| flow-entry-message-protection | Flow entry succeeds and smart sending excludes the message; this is distinct from development and published missing-entry/filter cases. |
| event-correction-downstream-unchecked | A corrected timeline observation is verified while downstream results remain unchecked; this is not the development missing-timeline or filter-exclusion scenario. |
| event-capture-window-dispute | Same-profile absence screenshot predates API acceptance, so post-acceptance absence was never observed; this is distinct from development's cross-profile disagreement and multi-store absence. |

All holdout case IDs, ticket IDs and scenario groups are unique and separate from development and seed identities. All nine derivation lists are empty; development's five linked control pairs remain entirely in development. Structural split validation traversed the combined case/group/derived-link graph and found no cross-split component. Matu approved the independence judgment under the holdout decision recorded above; the static checks support the declared identities and links but do not prove semantic independence.

### Deferred gaps and frozen boundary

- The current nine holdout labels and the author independence judgments are reviewed and frozen; any later wording, label, lineage, or source change requires new review and a new case-file hash.
- Campaign-editor disagreement-probe holdout coverage is deferred; development covers it.
- Track API accepted timestamp syntax, numeric receiver tolerance, signing recipes, retry schedules, ingestion SLAs and mitigation procedures remain undocumented and are not authored by these cases.
- Unrelated topic labels, real resolved cases, learned causes, and empirical retrieval/provider quality remain outside this packet. Known causes are unjudged in this holdout; none supplies a necessary distinct next step beyond the bound resources for these scenarios.
- `manifest.json` freezes the exact static inputs listed above. Task 6+, holdout retrieval/ranking/scoring/output inspection, corpus tuning, provider calls and model downloads remain unperformed and unauthorized in this pass.

### Fresh structural-only evidence

`node .superpowers/sdd/2026-09-14-knowledge-readiness/task-5-structural-check.mjs` passed (exit 0). The helper imports only static repository/projector/catalog modules plus `ReadinessManifestSchema`, `validateReadinessCases`, and `validateReadinessSplits`; it does not import the evaluator, index manager, store, search, embedding provider, or retrieval execution entry points. It validated 21 development and nine holdout cases, exact approval objects, 28 current static resources, all source hashes/headings/representation IDs, nine independent holdout groups, zero holdout derivation links, split isolation, manifest schema/version/cutoff/source revision, exact relative paths, both case-file SHA-256 values, the current corpus SHA-256, and the absence of manifest self-hash/commit fields. Result: 18 development and 17 holdout topic/family cells. No index, retrieval, ranking, scoring, provider call, model download, corpus tuning, or holdout output inspection occurred. This validates frozen structure and identity, not retrieval quality.
