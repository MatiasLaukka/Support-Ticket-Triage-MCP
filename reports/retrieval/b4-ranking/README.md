# B4 development ranking evidence: inconclusive

This directory records one saved development capture and its offline comparison across the five predeclared B4 policies. The result is inconclusive. No policy was selected. Holdout remains unavailable and unexecuted.

No `docs/b4-ranking-selection.md` or `reports/retrieval/b4-ranking/selection.json` was created. Tasks 7–8 were not performed.

## Saved artifacts

Run: `development-20260916-22590b22-timeout120s`

- [B4 capture](development-20260916-22590b22-timeout120s/capture.json): one immutable development retrieval result per case.
- [Saved retrieval evaluation](development-20260916-22590b22-timeout120s/retrieval/evaluation.json) and [Markdown](development-20260916-22590b22-timeout120s/retrieval/evaluation.md): capture-time retrieval and section evidence.
- [Offline comparison JSON](development-20260916-22590b22-timeout120s/comparison/evaluation.json) and [Markdown](development-20260916-22590b22-timeout120s/comparison/evaluation.md): replay of all five policies over the same capture.

The comparison records `evaluatedSplit: development`, `holdoutExecuted: false`, and the same capture hash and 21 case-input hashes for every policy.

## Exact input and provenance identities

| Identity | Value |
| --- | --- |
| Capture format | `1` |
| Capture hash | `bf6a9fcbf5d9e3f7d5f58b638faa5bc7151d3f1f83c7504091f4b745f3a051d9` |
| Evaluator/source revision | `22590b22d736fa031f52940728463473aebfe449` |
| Split and case count | `development`, 21 |
| Frozen case-set hash | `9a97bda213a3b2b1804464f5d9f343a79e907c257d3031c4c0c3952fd99a2f4a` |
| Label hash | `bf0c88d8f3cc9ea36717aaa92e549714a94f9548bc4e154f58a4a507ec41a91d` |
| Manifest hash | `b62f59c3d2f4be3520fa364eb85d9c804fd75ee02a6294c0707775a3092cdc2d` |
| Corpus hash | `43f9e3b0c9c3ca9095f7a15fd90e8a72d685a693c5a749646ffb4022de6082c5` |
| Content-source revision | `01b3c3eec4d5ef81c90b836fefa1ca5944eecead` |
| Review status and cutoff | `approved`; `2026-09-15T23:59:59.999Z` |
| Index identity | schema 2; state `ready`; generation 1; lexical generation 1; semantic generation 1 |
| Representation version | `3` |
| Model | `qwen3-embedding:0.6b`, digest/revision `ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d`, 1,024 dimensions |
| Provider kind recorded in capture | `configured-embedding-provider` |
| Query format | `qwen3-retrieval-instruction-v1`; `Instruct: {instruction}\n Query:{query}` |
| Retrieval limits | lexical 5 and semantic 5 for each resource type |
| Comparison output limits | top 1 and top 5 |

The independently persisted retrieval evaluation records source commit `22590b22d736fa031f52940728463473aebfe449`, lexical channel `available`, and semantic channel `measured`.

Case IDs: `readiness-editor-exact-chunkload-001`, `readiness-webhook-exact-rotation-001`, `readiness-flow-exact-viewed-product-001`, `readiness-editor-paraphrase-screen-001`, `readiness-webhook-paraphrase-late-001`, `readiness-flow-paraphrase-automation-001`, `readiness-editor-contrast-private-001`, `readiness-webhook-contrast-raw-body-001`, `readiness-flow-contrast-excluded-001`, `readiness-editor-disagreement-001`, `readiness-webhook-disagreement-001`, `readiness-flow-disagreement-001`, `readiness-editor-insufficient-001`, `readiness-webhook-insufficient-001`, `readiness-flow-insufficient-001`, `readiness-editor-near-match-001`, `readiness-webhook-near-match-001`, `readiness-flow-near-match-001`, `readiness-editor-exact-no-code-001`, `readiness-webhook-opaque-id-negative-001`, and `readiness-event-exact-accepted-missing-multi-store-001`.

## Policy metrics

Values are macro recall at the indicated cutoff. Eligible denominators are 20 knowledge-article cases, 3 known-cause cases, 20 diagnostic-playbook cases, and 0 resolved-ticket cases.

| Policy | Knowledge article R@1 / R@5 | Known cause R@1 / R@5 | Diagnostic playbook R@1 / R@5 | Resolved ticket |
| --- | ---: | ---: | ---: | ---: |
| `lexical-only-v1` | 0.850 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | unavailable |
| `semantic-only-v1` | 0.900 / 1.000 | 1.000 / 1.000 | 0.900 / 1.000 | unavailable |
| `rrf-equal-v1:10` | 0.850 / 1.000 | 1.000 / 1.000 | 0.950 / 1.000 | unavailable |
| `rrf-equal-v1:30` | 0.850 / 1.000 | 1.000 / 1.000 | 0.950 / 1.000 | unavailable |
| `rrf-equal-v1:60` | 0.850 / 1.000 | 1.000 / 1.000 | 0.950 / 1.000 | unavailable |

Precision is `null` for every policy and resource type. No precision-eligible cases exist: incomplete labels exclude 20 article, 3 known-cause, and 20 playbook observations for every measured policy. All 21 development cases have incomplete labels.

The candidate pool is unchanged across policies. Its unordered candidate recall is 1.000 over 20 eligible cases, required-resource coverage is 1.000 over 7 eligible cases, 357 resources are unjudged, and 6 hard-negative hits are recorded. These are retrieval-pool facts, not ranking gains.

## Per-case gains and losses

The 21 cases comprise 6 exact, 3 paraphrase, 3 contrast, 3 disagreement-probe, 3 insufficient-evidence, and 3 near-match cases. Relative to `lexical-only-v1`, all unlisted case/policy comparisons are neutral at the recorded metrics.

| Case | Family | Policy | Change |
| --- | --- | --- | --- |
| `readiness-webhook-near-match-001` | near-match | `semantic-only-v1` | knowledge-article R@1 gain `+1` |
| `readiness-webhook-disagreement-001` | disagreement-probe | `semantic-only-v1` | diagnostic-playbook R@1 loss `-1` |
| `readiness-flow-disagreement-001` | disagreement-probe | `semantic-only-v1` | diagnostic-playbook R@1 loss `-1` |
| `readiness-flow-disagreement-001` | disagreement-probe | `rrf-equal-v1:10` | diagnostic-playbook R@1 loss `-1` |
| `readiness-flow-disagreement-001` | disagreement-probe | `rrf-equal-v1:30` | diagnostic-playbook R@1 loss `-1` |
| `readiness-flow-disagreement-001` | disagreement-probe | `rrf-equal-v1:60` | diagnostic-playbook R@1 loss `-1` |

There is therefore no uniform winner: semantic-only improves one near-match article result but loses two disagreement-probe playbook results; every RRF constant retains the flow disagreement loss and supplies no recorded gain.

## Section diagnostics

Section visibility is reported separately for lexical and semantic channel judgments. Each cell is `supporting-best / judged (rate)`; `wrong-best` counts are shown in parentheses.

| Policy | Top 1 lexical | Top 1 semantic | Top 5 lexical | Top 5 semantic |
| --- | ---: | ---: | ---: | ---: |
| `lexical-only-v1` | 35 / 42 (0.833; 7 wrong) | 37 / 42 (0.881; 5 wrong) | 37 / 47 (0.787; 10 wrong) | 41 / 47 (0.872; 6 wrong) |
| `semantic-only-v1` | 33 / 41 (0.805; 8 wrong) | 36 / 41 (0.878; 5 wrong) | 37 / 47 (0.787; 10 wrong) | 41 / 47 (0.872; 6 wrong) |
| `rrf-equal-v1:10` | 34 / 41 (0.829; 7 wrong) | 36 / 41 (0.878; 5 wrong) | 37 / 47 (0.787; 10 wrong) | 41 / 47 (0.872; 6 wrong) |
| `rrf-equal-v1:30` | 34 / 41 (0.829; 7 wrong) | 36 / 41 (0.878; 5 wrong) | 37 / 47 (0.787; 10 wrong) | 41 / 47 (0.872; 6 wrong) |
| `rrf-equal-v1:60` | 34 / 41 (0.829; 7 wrong) | 36 / 41 (0.878; 5 wrong) | 37 / 47 (0.787; 10 wrong) | 41 / 47 (0.872; 6 wrong) |

Section exclusions are `resource-missing / channel-unavailable / unjudged-section`:

| Policy | Top 1 lexical | Top 1 semantic | Top 5 lexical | Top 5 semantic |
| --- | ---: | ---: | ---: | ---: |
| `lexical-only-v1` | 0 / 0 / 21 | 0 / 0 / 21 | 0 / 0 / 247 | 58 / 0 / 189 |
| `semantic-only-v1` | 2 / 0 / 20 | 0 / 0 / 22 | 58 / 0 / 189 | 0 / 0 / 247 |
| `rrf-equal-v1:10`, `:30`, `:60` | 0 / 0 / 22 | 0 / 0 / 22 | 31 / 0 / 216 | 27 / 0 / 220 |

`supporting-best` and `lower-supporting` are distinct diagnostics. A supporting match somewhere in the output does not establish useful section ordering.

## Timing boundaries

The saved capture separates retrieval/provider timings from offline ranking replay. The common captured timings reported with each policy are retrieval `885.7004 ms` and provider `639.8817 ms`. The retrieval evaluation also records whole-run instrumentation of total `12579.0397 ms`, refresh `11486.9376 ms`, and embedding `12096.4188 ms` across 25 embedding calls and 70 inputs. These overlapping totals are not per-query latency measurements.

Pure offline ranking replay timings are:

| Policy | Total ranking time (ms) | Per-case average (ms) |
| --- | ---: | ---: |
| `lexical-only-v1` | 15.6769 | 0.7465190 |
| `semantic-only-v1` | 13.8123 | 0.6577286 |
| `rrf-equal-v1:10` | 14.1990 | 0.6761429 |
| `rrf-equal-v1:30` | 12.3123 | 0.5863000 |
| `rrf-equal-v1:60` | 11.0332 | 0.5253905 |

Ranking timings measure policy replay only and exclude the saved retrieval/provider timings. No timing claim is made about production or per-ticket latency.

## References, exclusions, and privacy validation

- References remain outside ranked search metrics: 21 cases have references, with 154 memberships; 14 are from the deterministic channel and 140 from known-cause provenance. Missing-reference diagnostics: 0.
- Resolved-ticket quality is explicitly unavailable: 0 eligible cases exist in the frozen development corpus, so no resolved-ticket evidence or quality claim exists.
- The corpus is synthetic-only; the `learned-known-cause` family is unavailable. Historical metric comparison is invalid because corpus and case set changed together.
- Strict `validateRankingCapture` passed for the saved capture. All 21 cases are complete, `traceTruncated` is false for every case, and the validator rejected no unsafe raw-query, prompt, vector, provider-payload, secret, account-identifier, or ticket-body field.
- The capture and comparison use the same capture hash and input identities; no inference or fabrication was used to complete the saved artifacts.

## Decision and remaining evidence limits

No policy was selected. The development result is accepted as inconclusive rather than converted into an automatic choice. Holdout remains unavailable and unexecuted. No holdout ranking, holdout content, policy tuning, constant tuning, embedding rerun, corpus change, label change, or customer-facing authority change is implied by this report.

The evidence is limited to one frozen synthetic development capture, incomplete labels, absent resolved-ticket examples, unavailable learned-known-cause examples, and channel/section denominators with explicit exclusions. A future policy decision requires separate user selection and the separately gated holdout process; this README does not authorize either.
