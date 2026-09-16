# B4 Resource Ranking — Design Record

Date: 2026-09-16
Status: Approved design and implementation plan; B4 implementation is gated on this documentation PR merging
Repository: MatiasLaukka/Support-Ticket-Triage-MCP
Verified program baseline: `95f603360bd98791582883aacf8ff9fc943a3932` (merged PR #26; Knowledge Readiness and its README/parity follow-up corrections)

## 1. Purpose and program boundary

B4 answers “which discovered resources deserve closer examination?” It orders B3 candidates while preserving the evidence and provenance needed for later model-assisted diagnosis. It does not decide that a candidate applies, establish a cause, select drafting context, or authorize action.

The program responsibilities remain:

```text
B3 discovery -> B4 ranking -> B5 applicability / model-assisted diagnosis
                                      -> governed action and verification
```

The existing diagnosis-reasoning provider remains the intended integration point for later work. Comparing hypotheses, asking discriminating questions, revising diagnoses, and an interactive diagnostic demonstration are separate future deliverables. This slice neither builds a second diagnosis engine nor changes the current provider inputs.

References:

- [B3 design](2026-09-12-hybrid-retrieval-b3-design.md).
- [Knowledge-readiness design](2026-09-14-knowledge-readiness-design.md).
- [Knowledge-readiness review](../../knowledge-readiness-review.md).
- [Development evidence and reproduction](../../../reports/retrieval/knowledge-readiness-v1/README.md).

## 2. Evidence and approaches considered

The merged knowledge-readiness work reports article Recall@1 of 0.850 lexical versus 0.900 semantic, and Recall@5 of 1.000 for both. Article-only supporting-best section coverage is 14/24 versus 17/24; the broader resource/representation population is 37/47 versus 40/47. These are distinct denominators, not successive measurements of the same population.

These development results motivate an ordering experiment, not a claim that fusion improves coverage. Cases are synthetic, judgments incomplete, real resolved cases absent, and semantic evidence comes from one recorded local run. No held-out quality result is assumed.

| Approach | Decision |
| --- | --- |
| Equal-weight reciprocal rank fusion (RRF) | Implement as a small, transparent experimental policy. Avoid raw-score normalization and new inference. |
| Lexical-only and semantic-only ordering | Retain as first-class competing policies; either can be the selected result. |
| Normalized weighted-score fusion | Defer; normalization and weight selection add unsupported tuning choices. |
| Dedicated reranker, learned ranking, query rewriting | Defer until simpler methods show a concrete deficiency worth the extra inference and operational cost. |

## 3. Scope and non-goals

Included:

- A pure, deterministic ranker over an immutable, coherent B3 result.
- Independent ranked lists for all four resource types.
- A separate reference set with no fabricated rank or confidence.
- A typed output contract preserving per-channel matches, scores, ranks, availability, and source identity.
- Shadow-only integration and bounded provenance; no change to authoritative ticket behavior.
- Development comparisons of five predeclared policies, a recorded policy-selection gate, and a separately authorized frozen holdout comparison.
- Regression, degradation, determinism, privacy, and evaluation tests.

Excluded:

- A global ranking that mixes resource types or allocates quotas between them.
- Applicability flags, diagnostic confidence/probability, taxonomy filtering/boosting, or reference boosts.
- New corpus content, case-label tuning, chunking changes, embedding model changes, or index/schema migrations.
- New provider calls inside the ranker, new dependencies, vector databases, or search services.
- Replacing `knowledgeArticleIds`, changing recommendation/drafting/diagnosis/lifecycle/receipt/replay behavior, or executing playbooks.
- A new UI workbench or the richer diagnostic demonstration.

Content defects discovered during the experiment are recorded separately. Correcting them creates a new corpus experiment; they must not be silently folded into a ranking-only comparison.

## 4. Input contract and resource ranks

Consume B3's `RetrievalResult`, its exact retrieval limits, and a query-basis identity (query hash, ticket revision, customer-reply watermark). Preserve the supplied index metadata and raw candidate fields; do not reread a newer index while ranking an older result.

The current `Candidate.lexical.bestRank`, `Candidate.semantic.bestRank`, and `Match.rank` refer to underlying representation ranks. They are not necessarily dense resource ranks, and may span resource types. B4 must not use them directly in RRF.

For each resource type and each usable channel:

1. Take distinct candidates carrying valid matches for that channel from the supplied B3 pool.
2. Order by best BM25 ascending for lexical, or best cosine descending for semantic.
3. Resolve equal resource scores by stable resource key.
4. Assign dense, one-based resource ranks within that type/channel.

Preserve the original representation ranks as provenance alongside the derived resource rank. Never mutate the input. Use a documented ordinal string comparator, not a locale-dependent tie-break, for B4 resource-key ties. Candidate input order must not affect results.

Reject malformed inputs such as duplicate resource keys, type/key mismatch, nonfinite scores, contradictory best-score/match metadata, and cross-resource match IDs. Do not silently repair them by choosing an arbitrary duplicate. A ranker validation failure is a reported B4 failure, not a valid empty ranking; it still cannot affect committed operational commands.

## 5. Candidate depth, output size, and references

Initial retrieval depth is five distinct resources per channel/type. The lexical and semantic union can therefore contain up to ten search candidates per type, with additional reference-only candidates. B4 does not retrieve additional resources or backfill beyond that pool.

Rank all available search candidates before taking the requested top N. N is an explicit non-negative integer; zero produces no ranked entries without removing references. The runtime/shadow default is five per type; evaluation compares top 1 and top 5. Requesting more than the available pool returns the available entries with no padding. Report pool count, returned count, and omitted count separately.

References remain outside search quotas. Deduplicate resource identity while retaining all distinct reference provenance (including source, version, channel, and reason). A resource may have membership in both a ranked list and the reference set, but it is still one candidate. Reference-only resources receive no artificial search rank, fusion score, or confidence.

Carry B3's missing-reference diagnostics forward. Do not resurrect missing, excluded, unavailable-source, or self-ticket resources from a separate database lookup. “Separate reference set” means available references already admitted by B3, not a bypass of eligibility rules.

Reference-set display order is stable resource-key order and explicitly non-relevance order. Reference membership must not alter score or tie-breaking. Downstream consumers must deduplicate by resource key rather than treat double membership as two independent confirmations.

## 6. Predeclared policies

The development experiment compares exactly:

- `lexical-only-v1`;
- `semantic-only-v1`;
- `rrf-equal-v1`, constant 10;
- `rrf-equal-v1`, constant 30;
- `rrf-equal-v1`, constant 60.

RRF uses equal contributions from lexical and semantic resource ranks:

```text
score(resource) = sum over matching usable channels of 1 / (constant + resourceRank)
```

An absent match contributes zero. There is at most one contribution per resource per channel regardless of how many chunks matched. Sort by unrounded score descending, then ordinal resource key; round only for display. Record exact constant and individual contributions. An RRF score is an ordering device, not a probability or a score comparable across queries/resource types.

Single-channel policies preserve the derived ordering of their named channel and do not append the other channel's resources. Their output records the selected raw score and dense resource rank, not an invented RRF contribution. References are identical across policy comparisons.

Use one policy configuration across resource types for this first experiment; report per-type outcomes without searching for separate per-type weights/constants. The constants are deliberately a small predeclared set, not evidence-based optima. Do not add further values after inspecting development results without recording a separate experiment.

## 7. Availability, partial results, and failures

Availability is not equivalent to “nonempty list.” A healthy channel can return no matches. Preserve B3 channel status and reason, and explicitly identify which channels supplied contributions.

| B3 channel state | B4 treatment |
| --- | --- |
| `used` | Channel eligible, including a valid empty result. |
| Semantic `stale` / `pending-vectors` with compatible matches supplied by B3 | Retain those matches; label partial semantic coverage. Do not discard valid matches merely because the channel is incomplete. |
| `stale` / `model-version-changed`, `unavailable`, or `failed` | No contribution from that channel. Preserve reason; unexpected supplied matches for an unusable channel are an invalid input. |
| Integrity/upgrade failure before a B3 snapshot exists | No normal ranking; preserve the existing failure/upgrade diagnostic without pretending “no relevant resources.” |

With one contributing channel, RRF preserves that channel's resource ordering and records the effective contributing set. Distinguish a healthy empty second channel from an unavailable second channel. With neither channel contributing, ranked lists are empty and available references remain.

For honest evaluation, a single-channel baseline does not silently fall back to the other channel when its named channel is unavailable; it reports unavailable ranked evidence. RRF is the policy with explicit single-channel degradation. This distinction must also be visible in any selected-policy shadow output.

No channel status or ranking failure can reject, delay through new awaited external work, or mutate a committed authoritative command. Retain detached, bounded shadow-observer lifecycle and exactly-once/replay invariants.

## 8. Output and evidence contract

B4 output is separate from the raw B3 candidate contract. It is a projection keyed by resource identity, not a new authoritative resource store.

The result contains:

- Contract version and ranking policy identity, parameters, tie-break rule, candidate depth, and requested output limits.
- Query-basis identity, B3 index/generation/corpus identity, and captured-input hash.
- Original channel states plus contribution/partial-coverage summary.
- Per-type ranked memberships: resource key, one-based output position, derived channel resource ranks, RRF contributions/score where applicable, or selected raw score for a single-channel policy.
- A separate deduplicated reference membership set and existing reference diagnostics.
- The original resource type, raw channel scores/ranks, matched representation IDs, and reference provenance through the shared candidate registry rather than duplicating them in every membership.
- Pool/returned/omitted counts and explicit trace-truncation information.

Preserve matched sections separately by channel. B4 must not create a global “best evidence section” by comparing BM25 against cosine. Reordering a resource does not change its best-matching section within a channel.

Do not label every matched section “supporting” as a relevance assertion. In runtime, these are channel matches; reviewed supporting-section labels exist only in evaluation. A future diagnosis consumer must resolve referenced text against the matching source/index identity and report unavailable historical content instead of silently substituting current text. Building that resolver and changing diagnosis context are deferred.

Runtime traces contain IDs and bounded metadata, not raw customer queries, prompts, vectors, or article bodies. Reuse B3's bounded trace lifecycle rather than adding another persistent store. If the combined trace exceeds existing byte limits, mark the omission explicitly; never present truncated capture as a complete evaluation input. Reference membership is outside relevance quotas but is not exempt from an explicitly reported diagnostic trace size cap.

The evaluator may persist complete sanitized match metadata for reproducibility in an isolated report directory. It must not rely on a size-truncated runtime ring buffer.

## 9. Runtime integration and implementation shape

Implement one pure ranker with typed contracts and focused tests. Reuse existing B3 search, source eligibility, query formatting, section diagnostics, and case validation. No policy plugin framework is needed for five configurations of three simple policy kinds.

Run B4 only as a shadow projection after a successful B3 retrieval, inside the existing detached observation workflow. Keep existing retrieval off/shadow behavior. The shadow policy must be explicitly recorded and configured; before development selection, any enabled policy is labeled experimental, not the chosen production policy. No result is automatically applied to recommendation or diagnosis consumers.

Absent B4 policy configuration means no ranking projection; B3 continues unchanged. Accept only the documented policy kinds and constants and validated output limits. Invalid explicit configuration must produce a clear configuration diagnostic rather than silently selecting a different policy. This is an optional shadow extension, not another background service or autonomous policy-selection loop.

Adding ranking must not add provider calls per ticket. The ranker only consumes the retrieved snapshot; its own latency can be measured separately from embedding/retrieval latency. Its failure is reported separately while retaining valid B3 evidence when the trace budget permits.

Do not change B3 raw rank semantics to satisfy B4. Derive the dense ranks at the B4 boundary. Do not change SQLite representation/schema versions for a ranking-only change.

## 10. Development experiment and interpretation

Use the approved frozen knowledge-readiness development split and the same corpus, query construction, source eligibility, model identity, query formatting, cutoff, and per-type/channel depth for every policy. Do not re-author cases or relabel resources based on ranking results.

Capture one coherent untruncated B3 result per case, then evaluate all five policies over that identical capture. Rerunning the provider separately for each policy would confound algorithm differences with provider variation and is prohibited. If saved artifacts lack necessary input metadata, make one newly authorized capture and run all policies against it; never invent missing metadata. Additional captures are separately identified repeats, not cherry-picked replacements.

Report:

- Recall@1 and Recall@5 separately per resource type, with eligible-case counts and judgment-completeness caveats.
- Existing unordered candidate-pool recall and required-resource coverage separately from ranked top-N metrics; ranking cannot improve recall of an unchanged input pool.
- Precision only when the relevant judgment completeness requirements hold; unjudged resources are not negatives and zero denominators remain null/excluded.
- Per-case and case-family gains/losses, especially exact matches, paraphrases, contrasts, insufficient evidence, mixed observations, and channel disagreements.
- Reference membership preservation, separately from ranked search coverage; references must not inflate a search-only metric.
- Existing per-channel section diagnostics for the frozen pool, plus visibility of those same diagnostics for top-N ranked resources. RRF changes which resources are exposed, not which section a channel matched best.
- Missing-resource, unavailable-channel, unjudged-section, partial-semantic, and trace/capture exclusions with explicit denominators. Compare section rates on identical populations or clearly disclose differing selection populations.
- Pure ranking latency separately from total retrieval/provider duration; no single-run production-performance claim.

Do not combine types into an opaque average that hides regressions. The lack of eligible real resolved cases prevents a quality claim for that type; test its ranking contract synthetically and report corpus absence.

## 11. Policy selection and holdout gate

The five-policy comparison is exploratory development evidence. There is no automatic deployment or automatic “best policy” declaration based on a tiny average difference.

Present a selection record with the five results, per-case regressions, exact-match behavior, section exposure, and coverage limitations. Recommend one policy only with a concrete explanation of its useful trade-off. Prefer a single-channel policy when fusion has no demonstrated useful advantage; do not force fusion to win. The user approves the selected candidate policy, including any accepted development regressions, before the independent comparison. An inconclusive recommendation is a valid outcome and leaves selection unresolved rather than inventing confidence.

Freeze the approved candidate, the two fixed single-channel controls, constants, code/source revisions, candidate depth, output sizes, ordinal tie-breaking, corpus/model/query-format identities, captured development inputs, metrics, and case/label hashes before holdout execution.

The current readiness evaluator deliberately rejects holdout ranking. Preserve that default. A B4 holdout entry point must require explicit opt-in, an approved frozen selection record, matching identities, and execution-time user authorization. Do not weaken the existing development-only command or accidentally run holdout through default tests/reports.

Only the approved candidate and fixed controls are run on holdout; do not expose all three RRF constants there and choose a winner afterward. Capture each holdout retrieval once for the paired comparison. If the selected candidate is a control, do not duplicate it as a supposedly independent arm.

Until authorization, structural validation may inspect identities, source bindings, review status, and split separation without running or displaying holdout rankings. This document-writing task does not authorize any provider call or holdout execution.

After holdout, report wins, losses, uncertainty, and whether the development recommendation generalizes. Do not switch to another RRF constant after seeing holdout outcomes. If findings lead to tuning, mark the holdout consumed and obtain fresh independent cases for another independent claim. A failed/inconclusive holdout does not require changing the corpus or shipping B4.

## 12. Reproducibility and report boundaries

Write new B4 reports under a distinct `reports/retrieval/b4-ranking/` experiment directory; preserve all B3 and readiness artifacts. Separate development, selection record, and authorized holdout outputs. Do not overwrite previous runs; append identified repeats.

Record evaluator and content-source revisions separately, case/manifest hashes, review and selection provenance, capture hash, resource/match inputs, representation/index generations, model tag/digest/dimensions, exact query formatting, source cutoff, policy versions/constants, limits, status/exclusions, and tie-breaking. Output tables must be reconstructible from saved inputs without another provider call.

Use the existing local Qwen model only when a provider run is authorized. No downloads, remote provider substitution, operational data ingestion, or new synthetic corpus memories are implicit. Mocked tests remain offline. Missing access is an explicit evidence limitation, not permission to label lexical-only output semantic success.

Do not freeze a future self-referential artifact commit as its own source. A source/capture or selection commit may legitimately precede the report commit.

## 13. Verification and acceptance

Required regression coverage:

- Dense per-type resource ranks despite gaps/mixed types in raw chunk ranks.
- Exact RRF contributions for constants 10/30/60, absent matches, overlapping channels, and duplicate chunk matches without extra votes.
- Input permutation invariance, ordinal ties, no pre-sort score rounding, and no input mutation.
- Separate references, double membership with one identity, missing-reference diagnostics, zero output size, top-N limits, and no backfill.
- Healthy-empty versus unavailable channels, valid partial semantic results, incompatible models, reference-only results, and invalid-input failure reporting.
- Unchanged per-channel best-section evidence under resource reordering.
- All policy comparisons sharing one captured input per case and no per-policy provider calls.
- Default holdout refusal, explicit frozen-selection validation, no holdout content in ordinary diagnostics, and no tuning path that silently consumes holdout.
- Existing shadow authority, exactly-once observation, replay isolation, cancellation/shutdown, and bounded-trace behavior.

Implementation verification includes focused ranking/retrieval/evaluator/runtime tests, typecheck, build, existing relevant audits, full `npm test -- --maxWorkers=2`, and `git diff --check`. Report exact outcomes and separate inherited checks. No production model-call test is required for unit correctness.

Distinguish three completion claims:

1. Engineering complete: tested ranker, contracts, shadow integration, and reproducible development comparison.
2. Candidate selected: user-approved frozen policy and documented development trade-offs.
3. Independent evidence complete: separately authorized holdout comparison and honest disposition.

Do not claim the later gates merely because the earlier gate passes. There is no mandated numeric gain, no forced RRF adoption, and no operational activation in this slice.

## 14. Next gate

Knowledge Readiness is complete, including the merged README evidence-chronology and fixture-parity corrections. This B4 design and its implementation plan are complete. Begin B4 implementation only after this documentation PR is merged, from an isolated implementation worktree descended from that merged-main documentation commit. Any later change to corpus, provider, limits, ranking candidates, or holdout-use rules requires an explicit experiment/design amendment rather than silent implementation discretion. The richer evidence-guided diagnostic demonstration remains a separate design using the existing diagnosis provider.
