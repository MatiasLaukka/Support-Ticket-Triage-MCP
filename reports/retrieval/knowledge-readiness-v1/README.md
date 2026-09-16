# Knowledge readiness v1: development evidence

These runs validate the frozen case set and measure development-only retrieval. The offline records below used no provider. The separately recorded Qwen run was an authorized local development experiment; it executed the development split only and did not execute or score the holdout split. Fake providers used in isolated regression tests are not experiment evidence.

## Runs and identities

- [Structural validation JSON](validation-offline-2026-09-15/evaluation.json) and [Markdown](validation-offline-2026-09-15/evaluation.md): 21 development cases approved; 9 holdout cases structurally validated. No retrieval executed.
- [Development lexical JSON](development-lexical-offline-2026-09-15/evaluation.json) and [Markdown](development-lexical-offline-2026-09-15/evaluation.md): 21 development cases executed; `evaluatedSplit: development`, `holdoutExecuted: false`, zero embedding calls/inputs.
- [Qwen structural validation JSON](validation-qwen-20260915/evaluation.json) and [Markdown](validation-qwen-20260915/evaluation.md): 21 development cases and 9 holdout cases structurally validated; no retrieval ran and `holdoutExecuted: false`.
- [Qwen development JSON](development-qwen-20260915/evaluation.json) and [Markdown](development-qwen-20260915/evaluation.md): 21 development cases executed; `evaluatedSplit: development`, `holdoutExecuted: false`, and semantic evidence is measured with the locally installed `qwen3-embedding:0.6b` model (revision `ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d`, 1,024 dimensions).
- Offline evaluator source commit: `597c0f4e3bf0640c058acbc3ac671f42a1decf68`.
- Qwen evaluator source commit: `e4c6df38743780089b2629c564f4abdcebe308b9`.
- Frozen content/case source revision: `01b3c3eec4d5ef81c90b836fefa1ca5944eecead`. This records the manifest's source revision separately from evaluator implementation history.
- Manifest SHA-256: `b62f59c3d2f4be3520fa364eb85d9c804fd75ee02a6294c0707775a3092cdc2d`.
- Corpus SHA-256: `43f9e3b0c9c3ca9095f7a15fd90e8a72d685a693c5a749646ffb4022de6082c5`.
- Development bytes SHA-256: `9a97bda213a3b2b1804464f5d9f343a79e907c257d3031c4c0c3952fd99a2f4a`.
- Holdout bytes SHA-256: `12c2707681331a1938c6b5caa94189f55d42b9ecd1dcce2b4937bc9d0d1614b1`. Only identity/count/validation status are disclosed for holdout.
- Representation version: 3; cutoff: `2026-09-15T23:59:59.999Z`. Generation and channel metadata are recorded in the JSON/Markdown pair.

Changing evaluator code does not invalidate the frozen content revision by itself. Case byte hashes, projected corpus hash, representation version, review state, split lineage, and source/heading/representation bindings still have to pass. Neither these runs nor the implementation changed the approved case files or corpus.

## Offline lexical results

Per resource type, retrieval keeps K=5 for each channel, with no fusion. R@1 and R@5 use the existing macro-average scoring semantics and exclude cases with no relevant labels for that type. All 21 cases have incomplete labels, so precision is unavailable; unjudged hits are not treated as negatives.

| Resource type | Applicable cases | R@1 | R@5 |
|---|---:|---:|---:|
| Knowledge article | 20 | 0.850 | 1.000 |
| Known cause | 3 | 1.000 | 1.000 |
| Diagnostic playbook | 20 | 1.000 | 1.000 |
| Resolved ticket | 0 | n/a | n/a |

| Topic | Total cases | Article R@1 | Article R@5 |
|---|---:|---:|---:|
| Campaign editor | 7 | 1.000 | 1.000 |
| Webhook | 7 | 0.833 | 1.000 |
| Flow/event | 7 | 0.714 | 1.000 |

| Family | Total cases | Article R@1 | Article R@5 |
|---|---:|---:|---:|
| Exact | 6 | 1.000 | 1.000 |
| Paraphrase | 3 | 1.000 | 1.000 |
| Contrast | 3 | 0.833 | 1.000 |
| Disagreement probe | 3 | 0.833 | 1.000 |
| Insufficient | 3 | 0.833 | 1.000 |
| Near match | 3 | 0.500 | 1.000 |

Full per-topic/family/type metrics, denominators, exclusions, candidate/reference pools, and per-representation scores are retained in the run report. Family labels describe case intent; a disagreement probe does not establish an actual lexical/semantic disagreement.

## Measured Qwen development results

The Qwen record preserves the same frozen content/case hashes, corpus hash, representation version (3), and cutoff as the offline evidence. Its semantic query format is exactly `Instruct: {instruction}\n Query:{query}`, with instruction `Given a support ticket, retrieve relevant support resources.`; documents are unprefixed. It records 25 embedding calls for 70 inputs. The `total`, `refresh`, `retrieval`, and `embedding` timing fields overlap whole-run instrumentation and are not per-query latency measurements.

| Resource type | Applicable cases | Lexical R@1 | Semantic R@1 | Lexical R@5 | Semantic R@5 |
|---|---:|---:|---:|---:|---:|
| Knowledge article | 20 | 0.850 | 0.900 | 1.000 | 1.000 |
| Known cause | 3 | 1.000 | 1.000 | 1.000 | 1.000 |
| Diagnostic playbook | 20 | 1.000 | 0.900 | 1.000 | 1.000 |
| Resolved ticket | 0 | n/a | n/a | n/a | n/a |

For article recall by topic, campaign editor is 1.000/1.000 (lexical/semantic) at R@1, webhook is 0.833/1.000, and flow/event is 0.714/0.714; all applicable article R@5 values are 1.000. Precision remains unavailable because all 21 development cases have incomplete labels, so unjudged hits are not negatives.

## Section evidence and gaps

For the measured Qwen development run, lexical retrieval put the supporting representation first in 37 of 47 judged resource/channel pairs (0.787); semantic retrieval did so in 40 of 47 (0.851). Each channel excludes 116 `resource-missing` and 247 `unjudged-section` observations; neither has `channel-unavailable` exclusions. All 47 judged pairs have a supporting match somewhere, so the 10 lexical and 7 semantic non-best matches remain ordering gaps rather than coverage failures.

Concrete recorded gaps include lexical `performance-troubleshooting:section:1` for `readiness-editor-exact-chunkload-001`, lexical `webhook-signature-validation:section:0` for `readiness-webhook-exact-rotation-001`, semantic `performance-troubleshooting:section:3` for `readiness-editor-exact-no-code-001`, and semantic `event-tracking-debugging:section:3` for `readiness-flow-disagreement-001`. These are report diagnostics, not grounds for tuning the frozen labels, corpus, or ranking.

The earlier offline lexical diagnostic returned the supporting representation first in 37 of 47 cross-resource pairs (0.787); 10 had a different best representation and a supporting match lower down. **Its article-only subset is distinct: 14 of 24 judged article/channel pairs (0.583) had the supporting section first, while the remaining 10 had support lower down.** This 14/24 article-only diagnostic is not directly comparable to the later cross-resource Qwen experiment. In both records, a supporting match lower down is an ordering gap, not a success for supporting-best ordering.

The offline lexical aggregate excludes 68 `resource-missing` and 247 `unjudged-section` rows; its article-only subset excludes 68 `resource-missing` and 81 `unjudged-section` rows. Those rows are channel/resource observations over relevant plus returned resources, not distinct case counts. The unavailable offline semantic channel excludes all 362 rows from section denominators, so its section rate is null rather than zero.

The separately measured Qwen development artifacts contain 21 comparable development cases and 21 recorded lexical-versus-semantic ranking differences. Their persisted supporting-best totals are lexical 37/47 and semantic 40/47; each channel excludes 116 `resource-missing` and 247 `unjudged-section` rows. Excluded or unjudged pairs are visible diagnostics, not successes. These development-only differences do not justify tuning frozen labels, corpus, or ranking.

## Article source and prompt sizes

Every article's size is retained in both run artifacts. `sourceCharacters` measures the parsed source body, `diagnosisPromptCharacters` measures the first 1,800 body characters, and `classificationAndDraftBodyCharacters` measures the full body supplied to those consumers. These are body character counts, not full request sizes or token counts.

| Enriched article | Source/full-body characters | Diagnosis body characters |
|---|---:|---:|
| performance-troubleshooting | 3,141 | 1,800 |
| webhook-signature-validation | 3,225 | 1,800 |
| flow-trigger-troubleshooting | 3,130 | 1,800 |
| event-tracking-debugging | 3,283 | 1,800 |

## Reproduction and verification

From the repository root, build the evaluator and choose new run directory names. Existing output directories are rejected; keep the committed directories as evidence.

```powershell
npm run build
node dist/scripts/evaluate-retrieval.js --case-set data/evaluation/knowledge-readiness/manifest.json --validate-cases-only --output-dir reports/retrieval/knowledge-readiness-v1/validation-offline-rerun-001
node dist/scripts/evaluate-retrieval.js --case-set data/evaluation/knowledge-readiness/manifest.json --split development --output-dir reports/retrieval/knowledge-readiness-v1/development-lexical-offline-rerun-001
npm run typecheck
npx vitest run test/retrieval-cli.test.ts test/retrieval-evaluation.test.ts test/retrieval-readiness-cases.test.ts test/retrieval-section-evidence.test.ts --maxWorkers=1
```

The corresponding commands that produced the committed offline evidence used suffixes `validation-offline-2026-09-15` and `development-lexical-offline-2026-09-15`. The implementation build, typecheck, and 67 focused tests are recorded for that implementation work. This retrieval-evidence record does not establish a full-suite result. JSON/Markdown rendering is tested for exact identity, and a second run into an existing output directory is rejected without changing its previous bytes.

The committed Qwen record was a separately authorized local experiment. Before any new Qwen run, verify the installed model's fresh full digest, do not download a missing model, and choose a new output directory. Its query-only format is exactly `Instruct: {instruction}\n Query:{query}` with instruction `Given a support ticket, retrieve relevant support resources.`; documents remain unprefixed. Readiness semantic provider failures abort rather than produce a successful degraded experiment.

## Limits

These small synthetic development cases are not production traffic. The learned-known-cause and resolved-ticket source families are unavailable in this frozen evaluation corpus. All labels are incomplete. Timing fields are overlapping whole-run instrumentation, not per-query latency evidence. The corpus and case set changed together, so comparison with historical report metrics cannot isolate ranking changes. Historical report files remain unchanged. Holdout scoring remains unmeasured; the Qwen record measures semantic quality and development-channel differences only.
