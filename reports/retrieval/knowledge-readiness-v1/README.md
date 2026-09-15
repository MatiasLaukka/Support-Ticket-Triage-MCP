# Knowledge readiness v1: offline development evidence

These runs validate the frozen case set and measure development-only lexical retrieval. **Live Qwen semantic evaluation is BLOCKED and was not attempted because user authorization has not been given.** No provider was constructed, credentials consumed, model metadata requested, model downloaded, or embedding request sent by either recorded run. Fake providers were used only in isolated regression tests; their rankings are not experiment evidence.

## Runs and identities

- [Structural validation JSON](validation-offline-2026-09-15/evaluation.json) and [Markdown](validation-offline-2026-09-15/evaluation.md): 21 development cases approved; 9 holdout cases structurally validated. No retrieval executed.
- [Development lexical JSON](development-lexical-offline-2026-09-15/evaluation.json) and [Markdown](development-lexical-offline-2026-09-15/evaluation.md): 21 development cases executed; `evaluatedSplit: development`, `holdoutExecuted: false`, zero embedding calls/inputs.
- Evaluator source commit: `597c0f4e3bf0640c058acbc3ac671f42a1decf68`.
- Frozen content/case source revision: `01b3c3eec4d5ef81c90b836fefa1ca5944eecead`. This records the manifest's source revision separately from evaluator implementation history.
- Manifest SHA-256: `b62f59c3d2f4be3520fa364eb85d9c804fd75ee02a6294c0707775a3092cdc2d`.
- Corpus SHA-256: `43f9e3b0c9c3ca9095f7a15fd90e8a72d685a693c5a749646ffb4022de6082c5`.
- Development bytes SHA-256: `9a97bda213a3b2b1804464f5d9f343a79e907c257d3031c4c0c3952fd99a2f4a`.
- Holdout bytes SHA-256: `12c2707681331a1938c6b5caa94189f55d42b9ecd1dcce2b4937bc9d0d1614b1`. Only identity/count/validation status are disclosed for holdout.
- Representation version: 3; cutoff: `2026-09-15T23:59:59.999Z`. Generation and channel metadata are recorded in the JSON/Markdown pair.

Changing evaluator code does not invalidate the frozen content revision by itself. Case byte hashes, projected corpus hash, representation version, review state, split lineage, and source/heading/representation bindings still have to pass. Neither these runs nor the implementation changed the approved case files or corpus.

## Lexical results

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

## Section evidence and gaps

Across all judged resource/channel pairs, lexical retrieval returned the supporting representation first in 37 of 47 cases (0.787); 10 had a different best representation and a supporting match lower down. These totals include known-cause and playbook representations.

**For articles alone, the supporting section is first in 14 of 24 judged article/channel pairs (0.583).** The remaining 10 have the supporting section lower down. Thus any-supporting-match coverage of 24/24 does not demonstrate useful section ordering. The detailed report lists the safe development case ID, resource, best representation ID, status, and supporting-match presence for each pair. Article section gaps occur across editor, webhook, and flow/event cases; they were recorded without tuning labels, corpus, or ranking.

The lexical aggregate excludes 68 resource-missing and 247 unjudged-section rows. The article-only subset excludes 68 resource-missing and 81 unjudged-section rows. These rows are channel/resource observations over relevant plus returned resources, not distinct case counts. The unavailable semantic channel excludes all 362 rows from section denominators. Its section rate is null, not zero.

There are zero cases with two measured channels, so `developmentDisagreements` is empty and `disagreementComparableCases` is zero. This means disagreement evidence is unavailable; it does not mean the channels agree.

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

The corresponding commands that produced the committed evidence used suffixes `validation-offline-2026-09-15` and `development-lexical-offline-2026-09-15`. The implementation build, typecheck, and 67 focused tests passed. The known hanging full suite was not run. JSON/Markdown rendering is tested for exact identity, and a second run into an existing output directory is rejected without changing its previous bytes.

When separately authorized, a local Qwen experiment must verify the installed model's fresh full digest, avoid downloading a missing model, and use a new output directory. The existing opt-in query-only format remains exactly `Instruct: {instruction}\n Query:{query}` with instruction `Given a support ticket, retrieve relevant support resources.`; documents remain unprefixed. The recorded offline runs have no semantic query format/provider configured. Readiness semantic provider failures abort rather than produce a successful degraded experiment.

## Limits

These small synthetic development cases are not production traffic. The learned-known-cause and resolved-ticket source families are unavailable in this frozen evaluation corpus. All labels are incomplete. Timing fields are overlapping whole-run instrumentation, not per-query latency evidence. The corpus and case set changed together, so comparison with historical report metrics cannot isolate ranking changes. Historical report files remain unchanged. Holdout scoring, semantic quality, and actual inter-channel disagreements remain unmeasured.
