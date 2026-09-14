# Knowledge readiness content review

Status: pending user/domain review. This packet is author-prepared review material, not an approval record. No reviewer identity or decision has been supplied. Task 5 remains the human review checkpoint; Task 3 does not approve content or case labels.

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
delayed events, see [event tracking debugging](event-tracking-debugging.md).
Approval boundaries remain in the
[support operations playbook](support-operations-playbook.md).
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
[support operations playbook](support-operations-playbook.md).
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
[support operations playbook](support-operations-playbook.md) defines approval
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

- Human/domain approval of this content and the subsequent development case labels remains pending at Task 5. This packet creates no approved reviewer identity.
- The Track API accepted timestamp syntax remains undefined. Existing generic references to accepted formats are not authority to invent one.
- Cryptographic schemes, exact webhook header/endpoint schemas, timestamp tolerances, retry schedules, ingestion SLAs, and frontend/event mitigation procedures are not defined here.
- Executable confirmation from textual signals may be stronger than the domain evidence warrants; review that mismatch separately. No behavior was changed.
- Other article-backed branches, real resolved-case corpus material, broad topic expansion, heading ancestry, B4 ranking and B5 applicability remain outside Task 3.
- No live provider quality, semantic retrieval improvement, reviewed-case coverage or overall readiness completion is claimed by these content/projection checks.

## Approval history

Pending. No user/domain review decision has been recorded. Author inspection and passing tests are technical evidence only and do not approve the content.

## Verification evidence

- Content RED: `npx vitest run test/knowledge-readiness-content.test.ts --maxWorkers=2` — 4 tests failed on the absent first-section qualification. The initial sandbox attempt could not create Vitest's temporary transform cache; the authorized retry reached the expected assertion failures.
- Provider/source RED: `npx vitest run test/diagnosis-reasoning-provider.test.ts test/classification-reasoning-provider.test.ts test/openai-draft-provider.test.ts test/retrieval-sources.test.ts --maxWorkers=2` — 2 failed, 55 passed. Diagnosis failed on the missing qualification; source failed on the missing event link. Existing full-body classification/draft behavior already passed characterization.
- Focused GREEN: `npx vitest run test/knowledge-readiness-content.test.ts test/retrieval-sources.test.ts test/diagnosis-reasoning-provider.test.ts test/classification-reasoning-provider.test.ts test/openai-draft-provider.test.ts test/diagnostic-playbooks.test.ts test/diagnostic-evaluation.test.ts test/draft-contract.test.ts test/draft-quality-guardrails.test.ts --maxWorkers=2` — 9 files passed, 105 tests passed.
- `npx tsc -p tsconfig.build.json` — exit 0. `npm run typecheck` — exit 0.
- No full suite or live provider call was run for Task 3.
