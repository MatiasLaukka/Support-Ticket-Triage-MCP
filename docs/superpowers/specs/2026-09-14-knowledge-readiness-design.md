# Knowledge Readiness Before B4 — Design Record

Date: 2026-09-14
Status: Approved conversational scope; written specification awaiting user review
Repository: MatiasLaukka/Support-Ticket-Triage-MCP
Verified baseline: `aa53992d84ffd37a61a570ce387c5592b8ed8b1b` (merged PR #24)

## 1. Purpose and governing boundaries

Make the existing knowledge sufficiently detailed, faithfully searchable, and evaluable before choosing a B4 ranking policy. Completeness means enough grounded information to take the appropriate next step, including collecting evidence or escalating; it does not mean every ticket can be solved automatically.

This slice enriches the corpus in three topic families and corrects one narrow chunking discrepancy. It does not implement B4 ranking or B5 applicability. Retrieval remains advisory/shadow-only; operational routing, recommendations, drafting orchestration, diagnosis logic, approval, receipts, replay, and lifecycle code are not changed.

Content is already consumed by existing article-backed workflows. Consequently, article edits can change the guidance available to drafts even without changing orchestration. Review customer-facing guidance and run affected regressions; do not describe this slice as having no possible effect on draft wording.

References:

- [B3 architecture](2026-09-12-hybrid-retrieval-b3-design.md).
- [B3 implementation plan](../plans/2026-09-12-hybrid-retrieval-b3-implementation-plan.md).
- [Existing semantic evidence](../../../reports/retrieval/semantic-ollama-qwen3-embedding-0.6b/README.md).
- `data/knowledge/support-operations-playbook.md`: the fictional demo-domain contract and safety boundaries.

## 2. Baseline findings

The inspected corpus has 18 knowledge files, four searchable playbook descriptors, and six static known causes. Most articles contain one heading and short evidence-collection paragraphs. The executable campaign-editor path contains richer alternative hypotheses than its article or descriptor. The generic article-backed descriptor represents nine distinct branches with little searchable specificity.

`src/retrieval/representations.ts` currently retains article title and immediate section heading, but not the heading ancestry. Oversized section bodies split at spaces around a 4,000-character limit rather than preferentially at paragraph boundaries. Representation version is 2 at the baseline.

Existing local Qwen evidence measures nine controlled retrieval scenarios, with stronger article recall for semantic than lexical retrieval, but no required-resource coverage gain over the deterministic baseline. It does not establish knowledge completeness, real resolved-case quality, or production quality. Historical reports remain unchanged.

## 3. Scope and alternatives

Adopt a targeted content-and-representation slice, rather than rewriting the entire corpus or tuning ranking around missing knowledge.

Included topic families:

| Family | Content and investigation scope |
| --- | --- |
| Campaign editor | Browser/session isolation versus frontend-loading investigation; missing and contradictory checks; verification and handoff. |
| Webhooks | Signing-secret rotation, raw-body handling, and delivery latency/retries; discriminating evidence and safe next steps. |
| Flow/event processing | Event presence and timing versus trigger filters and eligibility exclusions; delayed ingestion and broad-impact investigation. |

Included work:

- Targeted edits to existing articles and corresponding searchable descriptors.
- Paragraph-aware splitting with bounded fallback, regression tests, and representation compatibility handling.
- A reviewed, source-grounded case set and coverage matrix.
- Development/holdout separation and frozen, reproducible evaluation inputs.
- A concise deferred-gap register for unsupported or out-of-scope topics.

Excluded work:

- RRF or other fusion, learned weights, taxonomy boosts/filters, rerankers, LLM query rewriting, vector databases, and new provider frameworks.
- New executable diagnostic branches or changes to cause detection and confirmation logic.
- A broad heading-hierarchy redesign, LLM chunking, new overlap policy, or token-aware chunking framework.
- Rewriting unrelated articles, inventing product behavior, or adding operational customer data.
- Automatically publishing evaluation queries as searchable case memories.

The previously identified Track API format omission is deferred unless the user separately approves a concrete demo API contract. Existing references to an accepted format are not authority to invent that format.

## 4. Content standard and source authority

Improve existing resources rather than creating duplicate articles by default. The primary article targets are `performance-troubleshooting.md`, `webhook-signature-validation.md`, `flow-trigger-troubleshooting.md`, and `event-tracking-debugging.md` under `data/knowledge`.

Each scoped diagnostic unit documents:

1. Symptoms, scope, and exclusions.
2. Evidence that changes the next action.
3. Alternative explanations and supporting, contradicting, or missing observations.
4. Safe next actions with prerequisites and approval boundaries.
5. Success criteria, failed-check handling, and escalation/handoff information.

Use descriptive headings such as “Webhook rotation — verification,” not context-free headings such as “Verification.” Each unit must remain meaningful when retrieved alone. Keep safety conditions and prerequisites beside the action they constrain. Cross-links assist navigation but must not be necessary to understand a safety-critical qualification.

Evidence priority is the approved demo-domain contract, reviewed resource content, and actual supported executable paths. Code is evidence of current implementation, not automatic proof that a domain assertion is correct. Record contradictions for review rather than documenting a suspicious implementation as truth. External product specifics require an authoritative source and explicit applicability to this fictional demo.

Do not invent endpoint schemas, accepted timestamps, error codes, timeout guarantees, retry schedules, mitigations, or verified resolutions. Examples must be synthetic and non-sensitive. Resource text must not solicit secrets or promote similarity into evidence of a cause.

## 5. Playbook representation alignment

Review `src/approval-desk/diagnostic-playbooks.ts`, `diagnostic-playbook-descriptors.ts`, `known-cause-catalog.ts`, and `src/retrieval/sources.ts` together.

- Expand campaign-editor, flow-trigger, and event-processing descriptions using their existing evidence and branch distinctions.
- Describe webhook investigation through the existing article-backed descriptor and known-cause/article context. Preserve existing resource IDs; do not introduce separate executable capabilities or duplicate voting resources merely to improve search.
- Keep unrelated article-backed branches intact. Enrich the scoped portion without implying this slice fully documents all nine branches.
- Preserve and validate applicable article links. Descriptors summarize supported investigation; they do not execute checks, approve action, or guarantee applicability.
- A documented raw-body investigation is not a newly implemented raw-body diagnosis branch.

If useful specificity cannot be represented without changing descriptor identity or executable contracts, report the concrete issue for approval rather than silently broadening this slice.

## 6. Narrow chunking correction

Retain heading-based article sections, title/immediate-heading context, and the existing 4,000-character section-body ceiling.

Within a section, group complete paragraphs up to the ceiling, splitting at paragraph boundaries whenever possible. A paragraph larger than the ceiling uses deterministic whitespace splitting, falling back to a hard character boundary when necessary. Do not emit empty chunks, drop or duplicate non-whitespace content, or exceed the body ceiling. Repeated runs over identical input must produce identical representations and hashes.

Formatting normalization must preserve paragraph separation. Critical qualifications must fit with their associated action; where a table, list, or code example could be split unsafely, author a smaller self-contained unit rather than adding a general Markdown parser in this slice. Test representative tables/lists/examples and inspect generated chunks.

Advance the representation version from the verified baseline version to mark changed semantics. Use existing reconciliation/rebuild mechanisms and compatibility checks: no old vector may represent newly chunked text, and references to historical chunk ordinals must be interpreted with the recorded source/representation identity. No new database authority or migration framework is introduced.

Tests cover heading context, paragraph packing, oversized-paragraph fallback, long unbroken input, exact-limit behavior, Unicode content, deterministic output, content preservation, bounded chunk bodies, and stale/incompatible vector exclusion after representation changes. Retrieval still aggregates chunks into one resource; more chunks do not create extra ranking votes.

## 7. Reviewed case coverage

The matrix is a case-authoring guide, not preapproved labels or a promise about which channel wins.

| Case family | Campaign editor | Webhooks | Flow/event processing |
| --- | --- | --- | --- |
| Exact terms/codes/identifiers | Existing `ChunkLoadError` signal and a reviewed distractor | Grounded signature/rotation terms; opaque delivery IDs are evidence, not article lookup targets | Supported trigger/event names with meaningful near-matches |
| Paraphrases | Editing screen never opens | Notifications arrive long after the action | Customers act but never enter the automation |
| Similar symptoms/different causes | Session isolation versus frontend loading | Rotation mismatch versus raw-body changes | Event absent/delayed versus present but excluded |
| Disagreement probes | Generic loading plus specific console evidence | Delay language plus signature terminology | Ingestion language plus qualification terminology |
| Insufficient evidence | Blank editor without isolation results | Signature failure without rotation/body evidence | Missing flow entry without event history |
| Relevant-sounding but inapplicable | Platform mitigation despite successful isolation | Rotation guidance when rotation is ruled out | Ingestion explanation despite event presence and documented exclusion |

Add contradictory/mixed-observation cases within this matrix: inconsistent isolation outcomes, multiple webhook symptoms, or conflicting event/qualification observations. They may legitimately require multiple useful resources or more evidence, not one forced cause.

Each topic must have reviewed cases covering all six families; a case may cover multiple families when each rationale is explicit. Exact-code coverage must include an actual grounded code, not only broad terminology. Opaque identifiers also need a negative-control case showing that incidental identifier overlap is not sufficient relevance. If a family cannot be grounded, disclose that gap and seek approval; do not claim complete coverage.

Actual lexical/semantic disagreement is determined empirically. Probe cases do not count as demonstrated disagreement unless baseline outputs differ. A lack of disagreement is a valid result, not a reason to alter labels.

## 8. Case records, labels, and leakage prevention

Extend existing evaluation structures only as needed; avoid a parallel oracle framework. Each case records a stable ID, topic, case-family tags, scenario-group ID, synthetic/source provenance, customer-only query basis, reviewed resource keys and source sections, relevance rationale, missing/discriminating evidence, justified hard negatives, judgment completeness, split assignment, and review identity/status.

Distinguish content, representation, retrieval, ranking, and oracle gaps. Source sections are anchored by article identity and source snapshot, not only mutable chunk ordinals.

Relevance means useful for the next investigation step. Applicability is a separate annotation where supported and never a B4 authority output. Rule-out guidance may be relevant even when the cause does not apply. Unjudged resources are not negatives. Required-resource labels must have a necessity rationale and are not mandatory for every ambiguous case.

Review cases against frozen source content independently of desired channel outcomes. Synthetic fixture creation does not constitute human/domain approval; pending cases remain explicitly unreviewed and excluded from reviewed-quality claims.

Assign related paraphrases, contrast variants, and cases derived from one seed scenario to the same scenario group. Split by scenario group, not individual query. Topic families may appear in both splits through independent scenario groups. Finalize and record assignments before baseline-result inspection or tuning. Existing published scenarios and new cases selected after observing disagreement belong to development, not untouched holdout.

Complete content authoring before finalizing independent held-out queries; never use held-out query wording to optimize resources. Keep holdout judgments separate from development inspection during future tuning; if holdout results drive changes, mark that set as consumed and obtain fresh independent cases before another held-out claim. Do not claim a statistically persuasive holdout from a tiny set.

Evaluation-only queries must not enter the searchable corpus. Historical case memories require a separate, governed corpus decision; this slice does not manufacture resolved cases.

## 9. Evaluation and reproducibility

Sequence: chunking correction, grounded content/descriptor edits, independent case review, frozen manifest, then baseline evaluation. No ranking-policy tuning occurs here.

Persist a versioned coverage/gap matrix alongside the new case set and a frozen manifest with source revision, corpus/representation hashes, source sections, oracle/case-set hashes, split assignments, cutoff, resource/channel limits, representation version, model tag/digest/dimensions, exact query-formatting identity, and index generations. Record the actual evaluated source; artifact commits may follow it.

Use isolated evaluation indexes and new report directories. Preserve previous cold/warm and offline reports. Corpus changes and chunking changes must be distinguished from ranking-policy changes; do not compare different corpora/case sets as if only the ranking algorithm changed. Reuse unchanged legacy cases as an explicitly labeled comparison subset where useful, without calling them held-out.

Report lexical and semantic rankings separately and existing candidate-pool/reference coverage separately. Use Recall@K only over reviewed relevance sets with disclosed completeness; precision requires complete judgments for the measured pool. Required coverage with a zero denominator is not a success. Keep per-topic and case-family breakdowns, concrete misses, uncertainty, and the zero-real-resolved-case limitation. No fused ranking or unsupported applicability metric is introduced.

Local Ollama/Qwen is the existing semantic baseline, not a required new download. A later implementation/evaluation task must have authorization for local provider calls. No remote calls or operational-data ingestion are implied. Missing provider access produces an explicit semantic-evidence gap, never lexical-only results labeled as semantic success. Report provider variation and timing scope honestly.

## 10. Acceptance and verification

Completion requires:

- Source-grounded content in all three scoped families, with alternatives, missing/contradictory evidence, safe next actions, verification, and escalation.
- Accurate descriptors and valid scoped links without new executable behavior.
- Generated-chunk review proving that scoped guidance remains interpretable and its safety qualifications stay attached.
- Passing chunker/compatibility regressions and existing affected retrieval and diagnostic tests.
- Reviewed matrix coverage, grouped split validation, valid source references, explicit unjudged handling, and no synthetic content passed off as operational history.
- Reproducible new evaluation artifacts, or an explicit blocker where provider authorization or reviewed cases are missing; no full evidence-completion claim while these remain unresolved.
- Typecheck, build, relevant oracle/taxonomy audits, full suite with `--maxWorkers=2`, and `git diff --check` for the implementation slice, with actual results and environmental limitations reported.

No minimum improvement percentage is required. Discovering that better content does not improve measured retrieval is a valid outcome. This slice establishes readiness and honest limitations, not B4 policy approval or production quality.

Documentation-only creation of this record requires scope/consistency and link checks, not application execution. Implementation and its plan are not part of this document-writing task.

## 11. Deferred work and next gate

Defer unrelated article-backed branches, broader topic drafting, the Track API format contract, real resolved-case corpus material, heading ancestry redesign, and B4 ranking/B5 applicability. Record newly found out-of-scope gaps rather than expanding the task.

After user review of this written record, prepare an ordered implementation plan. After implementation, use the coverage audit to decide whether another corpus expansion is necessary before B4. Every subsequent expansion requires review, a new index/snapshot, and bounded evaluation claims.
