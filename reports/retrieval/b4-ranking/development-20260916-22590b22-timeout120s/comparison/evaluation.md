# B4 development ranking comparison

- Capture hash: bf6a9fcbf5d9e3f7d5f58b638faa5bc7151d3f1f83c7504091f4b745f3a051d9
- Evaluated split: development
- Holdout executed: false
- Candidate-pool metrics unchanged across policies: true

## Policies

- lexical-only-v1: {"knowledge-article":{"eligibleCases":20,"recallAt1":0.85,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"known-cause":{"eligibleCases":3,"recallAt1":1,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":3,"qualityStatus":"measured"},"diagnostic-playbook":{"eligibleCases":20,"recallAt1":1,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"resolved-ticket":{"eligibleCases":0,"recallAt1":null,"recallAt5":null,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":0,"qualityStatus":"unavailable-no-eligible-cases"}}
- semantic-only-v1: {"knowledge-article":{"eligibleCases":20,"recallAt1":0.9,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"known-cause":{"eligibleCases":3,"recallAt1":1,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":3,"qualityStatus":"measured"},"diagnostic-playbook":{"eligibleCases":20,"recallAt1":0.9,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"resolved-ticket":{"eligibleCases":0,"recallAt1":null,"recallAt5":null,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":0,"qualityStatus":"unavailable-no-eligible-cases"}}
- rrf-equal-v1:10: {"knowledge-article":{"eligibleCases":20,"recallAt1":0.85,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"known-cause":{"eligibleCases":3,"recallAt1":1,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":3,"qualityStatus":"measured"},"diagnostic-playbook":{"eligibleCases":20,"recallAt1":0.95,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"resolved-ticket":{"eligibleCases":0,"recallAt1":null,"recallAt5":null,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":0,"qualityStatus":"unavailable-no-eligible-cases"}}
- rrf-equal-v1:30: {"knowledge-article":{"eligibleCases":20,"recallAt1":0.85,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"known-cause":{"eligibleCases":3,"recallAt1":1,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":3,"qualityStatus":"measured"},"diagnostic-playbook":{"eligibleCases":20,"recallAt1":0.95,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"resolved-ticket":{"eligibleCases":0,"recallAt1":null,"recallAt5":null,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":0,"qualityStatus":"unavailable-no-eligible-cases"}}
- rrf-equal-v1:60: {"knowledge-article":{"eligibleCases":20,"recallAt1":0.85,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"known-cause":{"eligibleCases":3,"recallAt1":1,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":3,"qualityStatus":"measured"},"diagnostic-playbook":{"eligibleCases":20,"recallAt1":0.95,"recallAt5":1,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":20,"qualityStatus":"measured"},"resolved-ticket":{"eligibleCases":0,"recallAt1":null,"recallAt5":null,"precisionAt1":null,"precisionAt5":null,"precisionEligibleCases":0,"precisionExcludedIncompleteLabels":0,"qualityStatus":"unavailable-no-eligible-cases"}}

## References

{"casesWithReferences":21,"membershipCount":154,"missingReferenceDiagnosticCount":0,"byChannel":{"deterministic":14,"knownCause":140}}

## Case comparisons

[{"caseId":"readiness-editor-exact-chunkload-001","families":["exact"],"topic":"campaign-editor","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-webhook-exact-rotation-001","families":["exact"],"topic":"webhook","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-flow-exact-viewed-product-001","families":["exact"],"topic":"flow-event","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-editor-paraphrase-screen-001","families":["paraphrase"],"topic":"campaign-editor","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-webhook-paraphrase-late-001","families":["paraphrase"],"topic":"webhook","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-flow-paraphrase-automation-001","families":["paraphrase"],"topic":"flow-event","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-editor-contrast-private-001","families":["contrast"],"topic":"campaign-editor","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-webhook-contrast-raw-body-001","families":["contrast"],"topic":"webhook","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-flow-contrast-excluded-001","families":["contrast"],"topic":"flow-event","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-editor-disagreement-001","families":["disagreement-probe"],"topic":"campaign-editor","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-webhook-disagreement-001","families":["disagreement-probe"],"topic":"webhook","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":0,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[{"resourceType":"diagnostic-playbook","metric":"recallAt1","delta":-1}]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":1,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-flow-disagreement-001","families":["disagreement-probe"],"topic":"flow-event","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":0,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[{"resourceType":"diagnostic-playbook","metric":"recallAt1","delta":-1}]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":0,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[{"resourceType":"diagnostic-playbook","metric":"recallAt1","delta":-1}]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":0,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[{"resourceType":"diagnostic-playbook","metric":"recallAt1","delta":-1}]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":0,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[{"resourceType":"diagnostic-playbook","metric":"recallAt1","delta":-1}]}}},{"caseId":"readiness-editor-insufficient-001","families":["insufficient"],"topic":"campaign-editor","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-webhook-insufficient-001","families":["insufficient"],"topic":"webhook","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-flow-insufficient-001","families":["insufficient"],"topic":"flow-event","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-editor-near-match-001","families":["near-match"],"topic":"campaign-editor","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-webhook-near-match-001","families":["near-match"],"topic":"webhook","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":0,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[{"resourceType":"knowledge-article","metric":"recallAt1","delta":1}],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":0,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":0,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":0,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-flow-near-match-001","families":["near-match"],"topic":"flow-event","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":0.5,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-editor-exact-no-code-001","families":["exact"],"topic":"campaign-editor","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-webhook-opaque-id-negative-001","families":["exact"],"topic":"webhook","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":null,"known-cause":null,"diagnostic-playbook":null,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}},{"caseId":"readiness-event-exact-accepted-missing-multi-store-001","families":["exact"],"topic":"flow-event","policyResults":{"lexical-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"semantic-only-v1":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:10":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:30":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]},"rrf-equal-v1:60":{"recallAt1ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"recallAt5ByType":{"knowledge-article":1,"known-cause":null,"diagnostic-playbook":1,"resolved-ticket":null},"gainsVsLexical":[],"lossesVsLexical":[]}}}]

## Complete report model

```json
{
  "formatVersion": 1,
  "mode": "development-ranking-comparison",
  "evaluatedSplit": "development",
  "holdoutExecuted": false,
  "evaluatorSourceRevision": "22590b22d736fa031f52940728463473aebfe449",
  "captureHash": "bf6a9fcbf5d9e3f7d5f58b638faa5bc7151d3f1f83c7504091f4b745f3a051d9",
  "caseInputHashes": [
    "33adbdc9256bd6e7801dbfa7dbe60c28255aca496667f1c96b2fbe0bed01d723",
    "6261d46d1fd981a8fdcd4704fd9f38ad645081de7cecec78812e89b030cf90c4",
    "c52f17d08ee269113e17c95f7fcb6539ea5076d0e5fe22a99717e83dd9e6965e",
    "2aecc306cb653edc757d7fe5b130cff12bd928f50cfe2a1e96606f33685dbcb3",
    "d0c110f305def6d95e6144184f368dc27f03fceba77caa2d500ea4a6b9d7b42d",
    "f6f2e7f54dd4d7825ca666c419be3d8f3c643c02d712c95f00fdd83006dfabe8",
    "909093002bd5d1018fbf29697ef257e1e7dcfc9613e96674ed92808225fca03f",
    "b7f9f94b3c43b163f125e4423242ae5ee71ab01d81cda4aa688d610e76fae76f",
    "d96d0a997701eb170f6f7e6dae43a5aaa398c21c13848380c652229830e2fdd9",
    "eb2e7e2000bd0584414edfd53f51aea828e63f2add5bf52546704013767e4cbb",
    "bc331b0179000193291f6d7f62ee644654b160c172421c0990ab43294681e47a",
    "29fbcdb3d3441d456f8581182cb524fd15ca4727bf864803ab427a366c90d919",
    "eceb6795bf8258fe2a2e4412698a706f346708013b638c2515b1455fe63653bb",
    "74137bc54feb196b763e66462260824729bf7bc9ae74f215671476360834a965",
    "842b8e754c97be3df72fc46da84760fb2ac245d74737415a5e0cd24e69161ba7",
    "a14f456156474b692246ae939f866b265c2bb4be8169a921124863c487077c16",
    "0c62b11e009edfc8354bf9195629b9949e4b7d7abd68428e3862cb02be56243b",
    "ab4f7bd4fd63424c157fcd2b56fbabfd5b1ec8c8d093f5f29557179fcf1ccf43",
    "360db1da0ebc5e54114ad7f0bad5805b13c4bd2b68c2ac310bca06ce30343bcb",
    "6ee80b83fae5455ddf4871d82df6ec6e107a41f43a6c4ad4d38fc44fcbb9b66d",
    "f6b24db9cb859a49e41894391071035f4bae0d9e036191e5bea06e37ce81f4b0"
  ],
  "inputIdentity": {
    "caseIds": [
      "readiness-editor-exact-chunkload-001",
      "readiness-webhook-exact-rotation-001",
      "readiness-flow-exact-viewed-product-001",
      "readiness-editor-paraphrase-screen-001",
      "readiness-webhook-paraphrase-late-001",
      "readiness-flow-paraphrase-automation-001",
      "readiness-editor-contrast-private-001",
      "readiness-webhook-contrast-raw-body-001",
      "readiness-flow-contrast-excluded-001",
      "readiness-editor-disagreement-001",
      "readiness-webhook-disagreement-001",
      "readiness-flow-disagreement-001",
      "readiness-editor-insufficient-001",
      "readiness-webhook-insufficient-001",
      "readiness-flow-insufficient-001",
      "readiness-editor-near-match-001",
      "readiness-webhook-near-match-001",
      "readiness-flow-near-match-001",
      "readiness-editor-exact-no-code-001",
      "readiness-webhook-opaque-id-negative-001",
      "readiness-event-exact-accepted-missing-multi-store-001"
    ],
    "caseSetHash": "9a97bda213a3b2b1804464f5d9f343a79e907c257d3031c4c0c3952fd99a2f4a",
    "contentSourceRevision": "01b3c3eec4d5ef81c90b836fefa1ca5944eecead",
    "corpusHash": "43f9e3b0c9c3ca9095f7a15fd90e8a72d685a693c5a749646ffb4022de6082c5",
    "indexIdentity": {
      "corpusHash": "43f9e3b0c9c3ca9095f7a15fd90e8a72d685a693c5a749646ffb4022de6082c5",
      "generation": 1,
      "lexicalGeneration": 1,
      "model": {
        "dimensions": 1024,
        "id": "qwen3-embedding:0.6b",
        "revision": "ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d"
      },
      "representationVersion": 3,
      "schemaVersion": 2,
      "semanticGeneration": 1,
      "state": "ready"
    },
    "labelHash": "bf0c88d8f3cc9ea36717aaa92e549714a94f9548bc4e154f58a4a507ec41a91d",
    "manifestHash": "b62f59c3d2f4be3520fa364eb85d9c804fd75ee02a6294c0707775a3092cdc2d",
    "model": {
      "digest": "ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d",
      "dimensions": 1024,
      "tag": "qwen3-embedding:0.6b"
    },
    "outputLimits": {
      "diagnostic-playbook": 5,
      "knowledge-article": 5,
      "known-cause": 5,
      "resolved-ticket": 5
    },
    "providerKind": "configured-embedding-provider",
    "queryFormatIdentity": {
      "kind": "qwen3-retrieval-instruction-v1",
      "template": "Instruct: {instruction}\n Query:{query}"
    },
    "representationVersion": 3,
    "retrievalLimits": {
      "diagnostic-playbook": {
        "lexical": 5,
        "semantic": 5
      },
      "knowledge-article": {
        "lexical": 5,
        "semantic": 5
      },
      "known-cause": {
        "lexical": 5,
        "semantic": 5
      },
      "resolved-ticket": {
        "lexical": 5,
        "semantic": 5
      }
    },
    "reviewStatus": "approved",
    "sourceCutoff": "2026-09-15T23:59:59.999Z",
    "split": "development"
  },
  "policyOutputLimits": {
    "top1": 1,
    "top5": 5
  },
  "policies": [
    {
      "policyKey": "lexical-only-v1",
      "policy": {
        "id": "lexical-only-v1",
        "kind": "lexical-only"
      },
      "captureHash": "bf6a9fcbf5d9e3f7d5f58b638faa5bc7151d3f1f83c7504091f4b745f3a051d9",
      "caseInputHashes": [
        "33adbdc9256bd6e7801dbfa7dbe60c28255aca496667f1c96b2fbe0bed01d723",
        "6261d46d1fd981a8fdcd4704fd9f38ad645081de7cecec78812e89b030cf90c4",
        "c52f17d08ee269113e17c95f7fcb6539ea5076d0e5fe22a99717e83dd9e6965e",
        "2aecc306cb653edc757d7fe5b130cff12bd928f50cfe2a1e96606f33685dbcb3",
        "d0c110f305def6d95e6144184f368dc27f03fceba77caa2d500ea4a6b9d7b42d",
        "f6f2e7f54dd4d7825ca666c419be3d8f3c643c02d712c95f00fdd83006dfabe8",
        "909093002bd5d1018fbf29697ef257e1e7dcfc9613e96674ed92808225fca03f",
        "b7f9f94b3c43b163f125e4423242ae5ee71ab01d81cda4aa688d610e76fae76f",
        "d96d0a997701eb170f6f7e6dae43a5aaa398c21c13848380c652229830e2fdd9",
        "eb2e7e2000bd0584414edfd53f51aea828e63f2add5bf52546704013767e4cbb",
        "bc331b0179000193291f6d7f62ee644654b160c172421c0990ab43294681e47a",
        "29fbcdb3d3441d456f8581182cb524fd15ca4727bf864803ab427a366c90d919",
        "eceb6795bf8258fe2a2e4412698a706f346708013b638c2515b1455fe63653bb",
        "74137bc54feb196b763e66462260824729bf7bc9ae74f215671476360834a965",
        "842b8e754c97be3df72fc46da84760fb2ac245d74737415a5e0cd24e69161ba7",
        "a14f456156474b692246ae939f866b265c2bb4be8169a921124863c487077c16",
        "0c62b11e009edfc8354bf9195629b9949e4b7d7abd68428e3862cb02be56243b",
        "ab4f7bd4fd63424c157fcd2b56fbabfd5b1ec8c8d093f5f29557179fcf1ccf43",
        "360db1da0ebc5e54114ad7f0bad5805b13c4bd2b68c2ac310bca06ce30343bcb",
        "6ee80b83fae5455ddf4871d82df6ec6e107a41f43a6c4ad4d38fc44fcbb9b66d",
        "f6b24db9cb859a49e41894391071035f4bae0d9e036191e5bea06e37ce81f4b0"
      ],
      "perTypeMetrics": {
        "knowledge-article": {
          "eligibleCases": 20,
          "recallAt1": 0.85,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "known-cause": {
          "eligibleCases": 3,
          "recallAt1": 1,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 3,
          "qualityStatus": "measured"
        },
        "diagnostic-playbook": {
          "eligibleCases": 20,
          "recallAt1": 1,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "resolved-ticket": {
          "eligibleCases": 0,
          "recallAt1": null,
          "recallAt5": null,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 0,
          "qualityStatus": "unavailable-no-eligible-cases"
        }
      },
      "sectionVisibility": {
        "top1": {
          "lexical": {
            "judged": 42,
            "supportingBestMatch": 35,
            "wrongBestSection": 7,
            "supportingBestMatchRate": 0.8333333333333334,
            "lowerSupportingMatch": 7,
            "anySupportingMatch": 42,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 21
            }
          },
          "semantic": {
            "judged": 42,
            "supportingBestMatch": 37,
            "wrongBestSection": 5,
            "supportingBestMatchRate": 0.8809523809523809,
            "lowerSupportingMatch": 5,
            "anySupportingMatch": 42,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 21
            }
          }
        },
        "top5": {
          "lexical": {
            "judged": 47,
            "supportingBestMatch": 37,
            "wrongBestSection": 10,
            "supportingBestMatchRate": 0.7872340425531915,
            "lowerSupportingMatch": 10,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 247
            }
          },
          "semantic": {
            "judged": 47,
            "supportingBestMatch": 41,
            "wrongBestSection": 6,
            "supportingBestMatchRate": 0.8723404255319149,
            "lowerSupportingMatch": 6,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 58,
              "channel-unavailable": 0,
              "unjudged-section": 189
            }
          }
        }
      },
      "rankingTimingMs": {
        "total": 15.67689999999999,
        "perCase": [
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471,
          0.7465190476190471
        ]
      },
      "capturedTimingsMs": {
        "retrieval": 885.7003999999979,
        "provider": 639.8816999999999
      },
      "caseOutcomes": [
        {
          "caseId": "readiness-editor-exact-chunkload-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-exact-rotation-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-exact-viewed-product-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-paraphrase-screen-001",
          "families": [
            "paraphrase"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-paraphrase-late-001",
          "families": [
            "paraphrase"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-paraphrase-automation-001",
          "families": [
            "paraphrase"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-contrast-private-001",
          "families": [
            "contrast"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-contrast-raw-body-001",
          "families": [
            "contrast"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-contrast-excluded-001",
          "families": [
            "contrast"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 0,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-exact-no-code-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-opaque-id-negative-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-event-exact-accepted-missing-multi-store-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        }
      ]
    },
    {
      "policyKey": "semantic-only-v1",
      "policy": {
        "id": "semantic-only-v1",
        "kind": "semantic-only"
      },
      "captureHash": "bf6a9fcbf5d9e3f7d5f58b638faa5bc7151d3f1f83c7504091f4b745f3a051d9",
      "caseInputHashes": [
        "33adbdc9256bd6e7801dbfa7dbe60c28255aca496667f1c96b2fbe0bed01d723",
        "6261d46d1fd981a8fdcd4704fd9f38ad645081de7cecec78812e89b030cf90c4",
        "c52f17d08ee269113e17c95f7fcb6539ea5076d0e5fe22a99717e83dd9e6965e",
        "2aecc306cb653edc757d7fe5b130cff12bd928f50cfe2a1e96606f33685dbcb3",
        "d0c110f305def6d95e6144184f368dc27f03fceba77caa2d500ea4a6b9d7b42d",
        "f6f2e7f54dd4d7825ca666c419be3d8f3c643c02d712c95f00fdd83006dfabe8",
        "909093002bd5d1018fbf29697ef257e1e7dcfc9613e96674ed92808225fca03f",
        "b7f9f94b3c43b163f125e4423242ae5ee71ab01d81cda4aa688d610e76fae76f",
        "d96d0a997701eb170f6f7e6dae43a5aaa398c21c13848380c652229830e2fdd9",
        "eb2e7e2000bd0584414edfd53f51aea828e63f2add5bf52546704013767e4cbb",
        "bc331b0179000193291f6d7f62ee644654b160c172421c0990ab43294681e47a",
        "29fbcdb3d3441d456f8581182cb524fd15ca4727bf864803ab427a366c90d919",
        "eceb6795bf8258fe2a2e4412698a706f346708013b638c2515b1455fe63653bb",
        "74137bc54feb196b763e66462260824729bf7bc9ae74f215671476360834a965",
        "842b8e754c97be3df72fc46da84760fb2ac245d74737415a5e0cd24e69161ba7",
        "a14f456156474b692246ae939f866b265c2bb4be8169a921124863c487077c16",
        "0c62b11e009edfc8354bf9195629b9949e4b7d7abd68428e3862cb02be56243b",
        "ab4f7bd4fd63424c157fcd2b56fbabfd5b1ec8c8d093f5f29557179fcf1ccf43",
        "360db1da0ebc5e54114ad7f0bad5805b13c4bd2b68c2ac310bca06ce30343bcb",
        "6ee80b83fae5455ddf4871d82df6ec6e107a41f43a6c4ad4d38fc44fcbb9b66d",
        "f6b24db9cb859a49e41894391071035f4bae0d9e036191e5bea06e37ce81f4b0"
      ],
      "perTypeMetrics": {
        "knowledge-article": {
          "eligibleCases": 20,
          "recallAt1": 0.9,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "known-cause": {
          "eligibleCases": 3,
          "recallAt1": 1,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 3,
          "qualityStatus": "measured"
        },
        "diagnostic-playbook": {
          "eligibleCases": 20,
          "recallAt1": 0.9,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "resolved-ticket": {
          "eligibleCases": 0,
          "recallAt1": null,
          "recallAt5": null,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 0,
          "qualityStatus": "unavailable-no-eligible-cases"
        }
      },
      "sectionVisibility": {
        "top1": {
          "lexical": {
            "judged": 41,
            "supportingBestMatch": 33,
            "wrongBestSection": 8,
            "supportingBestMatchRate": 0.8048780487804879,
            "lowerSupportingMatch": 8,
            "anySupportingMatch": 41,
            "excluded": {
              "resource-missing": 2,
              "channel-unavailable": 0,
              "unjudged-section": 20
            }
          },
          "semantic": {
            "judged": 41,
            "supportingBestMatch": 36,
            "wrongBestSection": 5,
            "supportingBestMatchRate": 0.8780487804878049,
            "lowerSupportingMatch": 5,
            "anySupportingMatch": 41,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 22
            }
          }
        },
        "top5": {
          "lexical": {
            "judged": 47,
            "supportingBestMatch": 37,
            "wrongBestSection": 10,
            "supportingBestMatchRate": 0.7872340425531915,
            "lowerSupportingMatch": 10,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 58,
              "channel-unavailable": 0,
              "unjudged-section": 189
            }
          },
          "semantic": {
            "judged": 47,
            "supportingBestMatch": 41,
            "wrongBestSection": 6,
            "supportingBestMatchRate": 0.8723404255319149,
            "lowerSupportingMatch": 6,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 247
            }
          }
        }
      },
      "rankingTimingMs": {
        "total": 13.812299999999993,
        "perCase": [
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711,
          0.6577285714285711
        ]
      },
      "capturedTimingsMs": {
        "retrieval": 885.7003999999979,
        "provider": 639.8816999999999
      },
      "caseOutcomes": [
        {
          "caseId": "readiness-editor-exact-chunkload-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-exact-rotation-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-exact-viewed-product-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-paraphrase-screen-001",
          "families": [
            "paraphrase"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-paraphrase-late-001",
          "families": [
            "paraphrase"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-paraphrase-automation-001",
          "families": [
            "paraphrase"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-contrast-private-001",
          "families": [
            "contrast"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-contrast-raw-body-001",
          "families": [
            "contrast"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-contrast-excluded-001",
          "families": [
            "contrast"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-exact-no-code-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-opaque-id-negative-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-event-exact-accepted-missing-multi-store-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        }
      ]
    },
    {
      "policyKey": "rrf-equal-v1:10",
      "policy": {
        "id": "rrf-equal-v1",
        "kind": "rrf-equal",
        "constant": 10
      },
      "captureHash": "bf6a9fcbf5d9e3f7d5f58b638faa5bc7151d3f1f83c7504091f4b745f3a051d9",
      "caseInputHashes": [
        "33adbdc9256bd6e7801dbfa7dbe60c28255aca496667f1c96b2fbe0bed01d723",
        "6261d46d1fd981a8fdcd4704fd9f38ad645081de7cecec78812e89b030cf90c4",
        "c52f17d08ee269113e17c95f7fcb6539ea5076d0e5fe22a99717e83dd9e6965e",
        "2aecc306cb653edc757d7fe5b130cff12bd928f50cfe2a1e96606f33685dbcb3",
        "d0c110f305def6d95e6144184f368dc27f03fceba77caa2d500ea4a6b9d7b42d",
        "f6f2e7f54dd4d7825ca666c419be3d8f3c643c02d712c95f00fdd83006dfabe8",
        "909093002bd5d1018fbf29697ef257e1e7dcfc9613e96674ed92808225fca03f",
        "b7f9f94b3c43b163f125e4423242ae5ee71ab01d81cda4aa688d610e76fae76f",
        "d96d0a997701eb170f6f7e6dae43a5aaa398c21c13848380c652229830e2fdd9",
        "eb2e7e2000bd0584414edfd53f51aea828e63f2add5bf52546704013767e4cbb",
        "bc331b0179000193291f6d7f62ee644654b160c172421c0990ab43294681e47a",
        "29fbcdb3d3441d456f8581182cb524fd15ca4727bf864803ab427a366c90d919",
        "eceb6795bf8258fe2a2e4412698a706f346708013b638c2515b1455fe63653bb",
        "74137bc54feb196b763e66462260824729bf7bc9ae74f215671476360834a965",
        "842b8e754c97be3df72fc46da84760fb2ac245d74737415a5e0cd24e69161ba7",
        "a14f456156474b692246ae939f866b265c2bb4be8169a921124863c487077c16",
        "0c62b11e009edfc8354bf9195629b9949e4b7d7abd68428e3862cb02be56243b",
        "ab4f7bd4fd63424c157fcd2b56fbabfd5b1ec8c8d093f5f29557179fcf1ccf43",
        "360db1da0ebc5e54114ad7f0bad5805b13c4bd2b68c2ac310bca06ce30343bcb",
        "6ee80b83fae5455ddf4871d82df6ec6e107a41f43a6c4ad4d38fc44fcbb9b66d",
        "f6b24db9cb859a49e41894391071035f4bae0d9e036191e5bea06e37ce81f4b0"
      ],
      "perTypeMetrics": {
        "knowledge-article": {
          "eligibleCases": 20,
          "recallAt1": 0.85,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "known-cause": {
          "eligibleCases": 3,
          "recallAt1": 1,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 3,
          "qualityStatus": "measured"
        },
        "diagnostic-playbook": {
          "eligibleCases": 20,
          "recallAt1": 0.95,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "resolved-ticket": {
          "eligibleCases": 0,
          "recallAt1": null,
          "recallAt5": null,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 0,
          "qualityStatus": "unavailable-no-eligible-cases"
        }
      },
      "sectionVisibility": {
        "top1": {
          "lexical": {
            "judged": 41,
            "supportingBestMatch": 34,
            "wrongBestSection": 7,
            "supportingBestMatchRate": 0.8292682926829268,
            "lowerSupportingMatch": 7,
            "anySupportingMatch": 41,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 22
            }
          },
          "semantic": {
            "judged": 41,
            "supportingBestMatch": 36,
            "wrongBestSection": 5,
            "supportingBestMatchRate": 0.8780487804878049,
            "lowerSupportingMatch": 5,
            "anySupportingMatch": 41,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 22
            }
          }
        },
        "top5": {
          "lexical": {
            "judged": 47,
            "supportingBestMatch": 37,
            "wrongBestSection": 10,
            "supportingBestMatchRate": 0.7872340425531915,
            "lowerSupportingMatch": 10,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 31,
              "channel-unavailable": 0,
              "unjudged-section": 216
            }
          },
          "semantic": {
            "judged": 47,
            "supportingBestMatch": 41,
            "wrongBestSection": 6,
            "supportingBestMatchRate": 0.8723404255319149,
            "lowerSupportingMatch": 6,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 27,
              "channel-unavailable": 0,
              "unjudged-section": 220
            }
          }
        }
      },
      "rankingTimingMs": {
        "total": 14.199000000000012,
        "perCase": [
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577,
          0.6761428571428577
        ]
      },
      "capturedTimingsMs": {
        "retrieval": 885.7003999999979,
        "provider": 639.8816999999999
      },
      "caseOutcomes": [
        {
          "caseId": "readiness-editor-exact-chunkload-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-exact-rotation-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-exact-viewed-product-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-paraphrase-screen-001",
          "families": [
            "paraphrase"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-paraphrase-late-001",
          "families": [
            "paraphrase"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-paraphrase-automation-001",
          "families": [
            "paraphrase"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-contrast-private-001",
          "families": [
            "contrast"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-contrast-raw-body-001",
          "families": [
            "contrast"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-contrast-excluded-001",
          "families": [
            "contrast"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 0,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-exact-no-code-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-opaque-id-negative-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-event-exact-accepted-missing-multi-store-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        }
      ]
    },
    {
      "policyKey": "rrf-equal-v1:30",
      "policy": {
        "id": "rrf-equal-v1",
        "kind": "rrf-equal",
        "constant": 30
      },
      "captureHash": "bf6a9fcbf5d9e3f7d5f58b638faa5bc7151d3f1f83c7504091f4b745f3a051d9",
      "caseInputHashes": [
        "33adbdc9256bd6e7801dbfa7dbe60c28255aca496667f1c96b2fbe0bed01d723",
        "6261d46d1fd981a8fdcd4704fd9f38ad645081de7cecec78812e89b030cf90c4",
        "c52f17d08ee269113e17c95f7fcb6539ea5076d0e5fe22a99717e83dd9e6965e",
        "2aecc306cb653edc757d7fe5b130cff12bd928f50cfe2a1e96606f33685dbcb3",
        "d0c110f305def6d95e6144184f368dc27f03fceba77caa2d500ea4a6b9d7b42d",
        "f6f2e7f54dd4d7825ca666c419be3d8f3c643c02d712c95f00fdd83006dfabe8",
        "909093002bd5d1018fbf29697ef257e1e7dcfc9613e96674ed92808225fca03f",
        "b7f9f94b3c43b163f125e4423242ae5ee71ab01d81cda4aa688d610e76fae76f",
        "d96d0a997701eb170f6f7e6dae43a5aaa398c21c13848380c652229830e2fdd9",
        "eb2e7e2000bd0584414edfd53f51aea828e63f2add5bf52546704013767e4cbb",
        "bc331b0179000193291f6d7f62ee644654b160c172421c0990ab43294681e47a",
        "29fbcdb3d3441d456f8581182cb524fd15ca4727bf864803ab427a366c90d919",
        "eceb6795bf8258fe2a2e4412698a706f346708013b638c2515b1455fe63653bb",
        "74137bc54feb196b763e66462260824729bf7bc9ae74f215671476360834a965",
        "842b8e754c97be3df72fc46da84760fb2ac245d74737415a5e0cd24e69161ba7",
        "a14f456156474b692246ae939f866b265c2bb4be8169a921124863c487077c16",
        "0c62b11e009edfc8354bf9195629b9949e4b7d7abd68428e3862cb02be56243b",
        "ab4f7bd4fd63424c157fcd2b56fbabfd5b1ec8c8d093f5f29557179fcf1ccf43",
        "360db1da0ebc5e54114ad7f0bad5805b13c4bd2b68c2ac310bca06ce30343bcb",
        "6ee80b83fae5455ddf4871d82df6ec6e107a41f43a6c4ad4d38fc44fcbb9b66d",
        "f6b24db9cb859a49e41894391071035f4bae0d9e036191e5bea06e37ce81f4b0"
      ],
      "perTypeMetrics": {
        "knowledge-article": {
          "eligibleCases": 20,
          "recallAt1": 0.85,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "known-cause": {
          "eligibleCases": 3,
          "recallAt1": 1,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 3,
          "qualityStatus": "measured"
        },
        "diagnostic-playbook": {
          "eligibleCases": 20,
          "recallAt1": 0.95,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "resolved-ticket": {
          "eligibleCases": 0,
          "recallAt1": null,
          "recallAt5": null,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 0,
          "qualityStatus": "unavailable-no-eligible-cases"
        }
      },
      "sectionVisibility": {
        "top1": {
          "lexical": {
            "judged": 41,
            "supportingBestMatch": 34,
            "wrongBestSection": 7,
            "supportingBestMatchRate": 0.8292682926829268,
            "lowerSupportingMatch": 7,
            "anySupportingMatch": 41,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 22
            }
          },
          "semantic": {
            "judged": 41,
            "supportingBestMatch": 36,
            "wrongBestSection": 5,
            "supportingBestMatchRate": 0.8780487804878049,
            "lowerSupportingMatch": 5,
            "anySupportingMatch": 41,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 22
            }
          }
        },
        "top5": {
          "lexical": {
            "judged": 47,
            "supportingBestMatch": 37,
            "wrongBestSection": 10,
            "supportingBestMatchRate": 0.7872340425531915,
            "lowerSupportingMatch": 10,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 31,
              "channel-unavailable": 0,
              "unjudged-section": 216
            }
          },
          "semantic": {
            "judged": 47,
            "supportingBestMatch": 41,
            "wrongBestSection": 6,
            "supportingBestMatchRate": 0.8723404255319149,
            "lowerSupportingMatch": 6,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 27,
              "channel-unavailable": 0,
              "unjudged-section": 220
            }
          }
        }
      },
      "rankingTimingMs": {
        "total": 12.312299999999993,
        "perCase": [
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997,
          0.5862999999999997
        ]
      },
      "capturedTimingsMs": {
        "retrieval": 885.7003999999979,
        "provider": 639.8816999999999
      },
      "caseOutcomes": [
        {
          "caseId": "readiness-editor-exact-chunkload-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-exact-rotation-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-exact-viewed-product-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-paraphrase-screen-001",
          "families": [
            "paraphrase"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-paraphrase-late-001",
          "families": [
            "paraphrase"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-paraphrase-automation-001",
          "families": [
            "paraphrase"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-contrast-private-001",
          "families": [
            "contrast"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-contrast-raw-body-001",
          "families": [
            "contrast"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-contrast-excluded-001",
          "families": [
            "contrast"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 0,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-exact-no-code-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-opaque-id-negative-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-event-exact-accepted-missing-multi-store-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        }
      ]
    },
    {
      "policyKey": "rrf-equal-v1:60",
      "policy": {
        "id": "rrf-equal-v1",
        "kind": "rrf-equal",
        "constant": 60
      },
      "captureHash": "bf6a9fcbf5d9e3f7d5f58b638faa5bc7151d3f1f83c7504091f4b745f3a051d9",
      "caseInputHashes": [
        "33adbdc9256bd6e7801dbfa7dbe60c28255aca496667f1c96b2fbe0bed01d723",
        "6261d46d1fd981a8fdcd4704fd9f38ad645081de7cecec78812e89b030cf90c4",
        "c52f17d08ee269113e17c95f7fcb6539ea5076d0e5fe22a99717e83dd9e6965e",
        "2aecc306cb653edc757d7fe5b130cff12bd928f50cfe2a1e96606f33685dbcb3",
        "d0c110f305def6d95e6144184f368dc27f03fceba77caa2d500ea4a6b9d7b42d",
        "f6f2e7f54dd4d7825ca666c419be3d8f3c643c02d712c95f00fdd83006dfabe8",
        "909093002bd5d1018fbf29697ef257e1e7dcfc9613e96674ed92808225fca03f",
        "b7f9f94b3c43b163f125e4423242ae5ee71ab01d81cda4aa688d610e76fae76f",
        "d96d0a997701eb170f6f7e6dae43a5aaa398c21c13848380c652229830e2fdd9",
        "eb2e7e2000bd0584414edfd53f51aea828e63f2add5bf52546704013767e4cbb",
        "bc331b0179000193291f6d7f62ee644654b160c172421c0990ab43294681e47a",
        "29fbcdb3d3441d456f8581182cb524fd15ca4727bf864803ab427a366c90d919",
        "eceb6795bf8258fe2a2e4412698a706f346708013b638c2515b1455fe63653bb",
        "74137bc54feb196b763e66462260824729bf7bc9ae74f215671476360834a965",
        "842b8e754c97be3df72fc46da84760fb2ac245d74737415a5e0cd24e69161ba7",
        "a14f456156474b692246ae939f866b265c2bb4be8169a921124863c487077c16",
        "0c62b11e009edfc8354bf9195629b9949e4b7d7abd68428e3862cb02be56243b",
        "ab4f7bd4fd63424c157fcd2b56fbabfd5b1ec8c8d093f5f29557179fcf1ccf43",
        "360db1da0ebc5e54114ad7f0bad5805b13c4bd2b68c2ac310bca06ce30343bcb",
        "6ee80b83fae5455ddf4871d82df6ec6e107a41f43a6c4ad4d38fc44fcbb9b66d",
        "f6b24db9cb859a49e41894391071035f4bae0d9e036191e5bea06e37ce81f4b0"
      ],
      "perTypeMetrics": {
        "knowledge-article": {
          "eligibleCases": 20,
          "recallAt1": 0.85,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "known-cause": {
          "eligibleCases": 3,
          "recallAt1": 1,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 3,
          "qualityStatus": "measured"
        },
        "diagnostic-playbook": {
          "eligibleCases": 20,
          "recallAt1": 0.95,
          "recallAt5": 1,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 20,
          "qualityStatus": "measured"
        },
        "resolved-ticket": {
          "eligibleCases": 0,
          "recallAt1": null,
          "recallAt5": null,
          "precisionAt1": null,
          "precisionAt5": null,
          "precisionEligibleCases": 0,
          "precisionExcludedIncompleteLabels": 0,
          "qualityStatus": "unavailable-no-eligible-cases"
        }
      },
      "sectionVisibility": {
        "top1": {
          "lexical": {
            "judged": 41,
            "supportingBestMatch": 34,
            "wrongBestSection": 7,
            "supportingBestMatchRate": 0.8292682926829268,
            "lowerSupportingMatch": 7,
            "anySupportingMatch": 41,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 22
            }
          },
          "semantic": {
            "judged": 41,
            "supportingBestMatch": 36,
            "wrongBestSection": 5,
            "supportingBestMatchRate": 0.8780487804878049,
            "lowerSupportingMatch": 5,
            "anySupportingMatch": 41,
            "excluded": {
              "resource-missing": 0,
              "channel-unavailable": 0,
              "unjudged-section": 22
            }
          }
        },
        "top5": {
          "lexical": {
            "judged": 47,
            "supportingBestMatch": 37,
            "wrongBestSection": 10,
            "supportingBestMatchRate": 0.7872340425531915,
            "lowerSupportingMatch": 10,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 31,
              "channel-unavailable": 0,
              "unjudged-section": 216
            }
          },
          "semantic": {
            "judged": 47,
            "supportingBestMatch": 41,
            "wrongBestSection": 6,
            "supportingBestMatchRate": 0.8723404255319149,
            "lowerSupportingMatch": 6,
            "anySupportingMatch": 47,
            "excluded": {
              "resource-missing": 27,
              "channel-unavailable": 0,
              "unjudged-section": 220
            }
          }
        }
      },
      "rankingTimingMs": {
        "total": 11.033199999999965,
        "perCase": [
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745,
          0.5253904761904745
        ]
      },
      "capturedTimingsMs": {
        "retrieval": 885.7003999999979,
        "provider": 639.8816999999999
      },
      "caseOutcomes": [
        {
          "caseId": "readiness-editor-exact-chunkload-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-exact-rotation-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-exact-viewed-product-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-paraphrase-screen-001",
          "families": [
            "paraphrase"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-paraphrase-late-001",
          "families": [
            "paraphrase"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-paraphrase-automation-001",
          "families": [
            "paraphrase"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-contrast-private-001",
          "families": [
            "contrast"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-contrast-raw-body-001",
          "families": [
            "contrast"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-contrast-excluded-001",
          "families": [
            "contrast"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-disagreement-001",
          "families": [
            "disagreement-probe"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-insufficient-001",
          "families": [
            "insufficient"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": 0,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-flow-near-match-001",
          "families": [
            "near-match"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-editor-exact-no-code-001",
          "families": [
            "exact"
          ],
          "topic": "campaign-editor",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-webhook-opaque-id-negative-001",
          "families": [
            "exact"
          ],
          "topic": "webhook",
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          }
        },
        {
          "caseId": "readiness-event-exact-accepted-missing-multi-store-001",
          "families": [
            "exact"
          ],
          "topic": "flow-event",
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          }
        }
      ]
    }
  ],
  "perTypeMetricsByPolicy": {
    "lexical-only-v1": {
      "knowledge-article": {
        "eligibleCases": 20,
        "recallAt1": 0.85,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "known-cause": {
        "eligibleCases": 3,
        "recallAt1": 1,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 3,
        "qualityStatus": "measured"
      },
      "diagnostic-playbook": {
        "eligibleCases": 20,
        "recallAt1": 1,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "resolved-ticket": {
        "eligibleCases": 0,
        "recallAt1": null,
        "recallAt5": null,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 0,
        "qualityStatus": "unavailable-no-eligible-cases"
      }
    },
    "semantic-only-v1": {
      "knowledge-article": {
        "eligibleCases": 20,
        "recallAt1": 0.9,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "known-cause": {
        "eligibleCases": 3,
        "recallAt1": 1,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 3,
        "qualityStatus": "measured"
      },
      "diagnostic-playbook": {
        "eligibleCases": 20,
        "recallAt1": 0.9,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "resolved-ticket": {
        "eligibleCases": 0,
        "recallAt1": null,
        "recallAt5": null,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 0,
        "qualityStatus": "unavailable-no-eligible-cases"
      }
    },
    "rrf-equal-v1:10": {
      "knowledge-article": {
        "eligibleCases": 20,
        "recallAt1": 0.85,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "known-cause": {
        "eligibleCases": 3,
        "recallAt1": 1,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 3,
        "qualityStatus": "measured"
      },
      "diagnostic-playbook": {
        "eligibleCases": 20,
        "recallAt1": 0.95,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "resolved-ticket": {
        "eligibleCases": 0,
        "recallAt1": null,
        "recallAt5": null,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 0,
        "qualityStatus": "unavailable-no-eligible-cases"
      }
    },
    "rrf-equal-v1:30": {
      "knowledge-article": {
        "eligibleCases": 20,
        "recallAt1": 0.85,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "known-cause": {
        "eligibleCases": 3,
        "recallAt1": 1,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 3,
        "qualityStatus": "measured"
      },
      "diagnostic-playbook": {
        "eligibleCases": 20,
        "recallAt1": 0.95,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "resolved-ticket": {
        "eligibleCases": 0,
        "recallAt1": null,
        "recallAt5": null,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 0,
        "qualityStatus": "unavailable-no-eligible-cases"
      }
    },
    "rrf-equal-v1:60": {
      "knowledge-article": {
        "eligibleCases": 20,
        "recallAt1": 0.85,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "known-cause": {
        "eligibleCases": 3,
        "recallAt1": 1,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 3,
        "qualityStatus": "measured"
      },
      "diagnostic-playbook": {
        "eligibleCases": 20,
        "recallAt1": 0.95,
        "recallAt5": 1,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 20,
        "qualityStatus": "measured"
      },
      "resolved-ticket": {
        "eligibleCases": 0,
        "recallAt1": null,
        "recallAt5": null,
        "precisionAt1": null,
        "precisionAt5": null,
        "precisionEligibleCases": 0,
        "precisionExcludedIncompleteLabels": 0,
        "qualityStatus": "unavailable-no-eligible-cases"
      }
    }
  },
  "candidatePoolMetrics": {
    "unchangedAcrossPolicies": true,
    "eligibleCases": 20,
    "candidateRecall": {
      "value": 1,
      "eligibleCases": 20
    },
    "requiredCoverage": {
      "value": 1,
      "eligibleCases": 7
    },
    "unjudgedResourceCount": 357,
    "hardNegativeHitCount": 6
  },
  "referenceMetrics": {
    "casesWithReferences": 21,
    "membershipCount": 154,
    "missingReferenceDiagnosticCount": 0,
    "byChannel": {
      "deterministic": 14,
      "knownCause": 140
    }
  },
  "caseComparisons": [
    {
      "caseId": "readiness-editor-exact-chunkload-001",
      "families": [
        "exact"
      ],
      "topic": "campaign-editor",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-webhook-exact-rotation-001",
      "families": [
        "exact"
      ],
      "topic": "webhook",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-flow-exact-viewed-product-001",
      "families": [
        "exact"
      ],
      "topic": "flow-event",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-editor-paraphrase-screen-001",
      "families": [
        "paraphrase"
      ],
      "topic": "campaign-editor",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-webhook-paraphrase-late-001",
      "families": [
        "paraphrase"
      ],
      "topic": "webhook",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-flow-paraphrase-automation-001",
      "families": [
        "paraphrase"
      ],
      "topic": "flow-event",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-editor-contrast-private-001",
      "families": [
        "contrast"
      ],
      "topic": "campaign-editor",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-webhook-contrast-raw-body-001",
      "families": [
        "contrast"
      ],
      "topic": "webhook",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-flow-contrast-excluded-001",
      "families": [
        "contrast"
      ],
      "topic": "flow-event",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-editor-disagreement-001",
      "families": [
        "disagreement-probe"
      ],
      "topic": "campaign-editor",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-webhook-disagreement-001",
      "families": [
        "disagreement-probe"
      ],
      "topic": "webhook",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": [
            {
              "resourceType": "diagnostic-playbook",
              "metric": "recallAt1",
              "delta": -1
            }
          ]
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": 1,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-flow-disagreement-001",
      "families": [
        "disagreement-probe"
      ],
      "topic": "flow-event",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": [
            {
              "resourceType": "diagnostic-playbook",
              "metric": "recallAt1",
              "delta": -1
            }
          ]
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": [
            {
              "resourceType": "diagnostic-playbook",
              "metric": "recallAt1",
              "delta": -1
            }
          ]
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": [
            {
              "resourceType": "diagnostic-playbook",
              "metric": "recallAt1",
              "delta": -1
            }
          ]
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 0,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": [
            {
              "resourceType": "diagnostic-playbook",
              "metric": "recallAt1",
              "delta": -1
            }
          ]
        }
      }
    },
    {
      "caseId": "readiness-editor-insufficient-001",
      "families": [
        "insufficient"
      ],
      "topic": "campaign-editor",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-webhook-insufficient-001",
      "families": [
        "insufficient"
      ],
      "topic": "webhook",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-flow-insufficient-001",
      "families": [
        "insufficient"
      ],
      "topic": "flow-event",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-editor-near-match-001",
      "families": [
        "near-match"
      ],
      "topic": "campaign-editor",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-webhook-near-match-001",
      "families": [
        "near-match"
      ],
      "topic": "webhook",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [
            {
              "resourceType": "knowledge-article",
              "metric": "recallAt1",
              "delta": 1
            }
          ],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 0,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 0,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 0,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-flow-near-match-001",
      "families": [
        "near-match"
      ],
      "topic": "flow-event",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 0.5,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-editor-exact-no-code-001",
      "families": [
        "exact"
      ],
      "topic": "campaign-editor",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-webhook-opaque-id-negative-001",
      "families": [
        "exact"
      ],
      "topic": "webhook",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": null,
            "known-cause": null,
            "diagnostic-playbook": null,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    },
    {
      "caseId": "readiness-event-exact-accepted-missing-multi-store-001",
      "families": [
        "exact"
      ],
      "topic": "flow-event",
      "policyResults": {
        "lexical-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "semantic-only-v1": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:10": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:30": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        },
        "rrf-equal-v1:60": {
          "recallAt1ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "recallAt5ByType": {
            "knowledge-article": 1,
            "known-cause": null,
            "diagnostic-playbook": 1,
            "resolved-ticket": null
          },
          "gainsVsLexical": [],
          "lossesVsLexical": []
        }
      }
    }
  ],
  "corpusLimitations": {
    "resolvedTicketQuality": "unavailable-no-eligible-cases",
    "note": "No eligible resolved-ticket examples exist in the frozen development corpus; no resolved-ticket quality claim is made."
  }
}
```
