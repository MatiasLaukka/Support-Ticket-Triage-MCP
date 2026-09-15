# B3 hybrid retrieval evaluation

- Mode: offline-lexical-only
- Semantic evidence: outstanding
- Source commit: 597c0f4e3bf0640c058acbc3ac671f42a1decf68
- Oracle hash: 591a9046db6dae284450c6534ec93a05687c5d8821ba33f5a21d5c0557ff5c3b
- Synthetic scenario hash: 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
- Synthetic scenario count: 0
- Scenario cutoff: 2026-09-15T23:59:59.999Z
- Corpus hash: 43f9e3b0c9c3ca9095f7a15fd90e8a72d685a693c5a749646ffb4022de6082c5
- Index generation: 1
- Lexical generation: 1
- Semantic generation: 0
- Representation version: 3
- FTS tokenization: unicode-letter-number-v1; quoted OR terms; max 128 tokens
- Model: null
- Semantic query formatting: {"kind":"none","instruction":null,"template":null}
- Timings (ms): {"total":289.3325,"refresh":11.444000000000017,"retrieval":113.26170000000008,"embedding":0,"embeddingCalls":0,"embeddingInputs":0}
- K budget: {"knowledge-article":{"lexical":5,"semantic":5},"known-cause":{"lexical":5,"semantic":5},"diagnostic-playbook":{"lexical":5,"semantic":5},"resolved-ticket":{"lexical":5,"semantic":5}}
- Channel statuses: {"lexical":"available","semantic":"unavailable:provider-not-configured"}
- Scenarios: 21
- Evaluated split: development
- Holdout executed: false
- Content/case source revision: 01b3c3eec4d5ef81c90b836fefa1ca5944eecead
- Manifest hash: b62f59c3d2f4be3520fa364eb85d9c804fd75ee02a6294c0707775a3092cdc2d
- Case hashes: {"development":"9a97bda213a3b2b1804464f5d9f343a79e907c257d3031c4c0c3952fd99a2f4a","holdout":"12c2707681331a1938c6b5caa94189f55d42b9ecd1dcce2b4937bc9d0d1614b1"}
- Label completeness: {"complete":0,"incomplete":21}
- Excluded from complete precision: 21
- Semantic-unavailable scenarios: 21

## Candidate pools

| Ticket | Pool size | Candidate recall | Required coverage | Unjudged hits |
|---|---:|---:|---:|---:|
| readiness-editor-exact-chunkload-001 | 17 | 1 | 1 | 15 |
| readiness-webhook-exact-rotation-001 | 16 | 1 | 1 | 13 |
| readiness-flow-exact-viewed-product-001 | 18 | 1 | 1 | 16 |
| readiness-editor-paraphrase-screen-001 | 17 | 1 | n/a | 15 |
| readiness-webhook-paraphrase-late-001 | 16 | 1 | n/a | 13 |
| readiness-flow-paraphrase-automation-001 | 17 | 1 | n/a | 15 |
| readiness-editor-contrast-private-001 | 19 | 1 | 1 | 17 |
| readiness-webhook-contrast-raw-body-001 | 17 | 1 | 1 | 14 |
| readiness-flow-contrast-excluded-001 | 17 | 1 | 1 | 14 |
| readiness-editor-disagreement-001 | 18 | 1 | n/a | 16 |
| readiness-webhook-disagreement-001 | 16 | 1 | n/a | 13 |
| readiness-flow-disagreement-001 | 16 | 1 | n/a | 13 |
| readiness-editor-insufficient-001 | 18 | 1 | n/a | 16 |
| readiness-webhook-insufficient-001 | 17 | 1 | n/a | 15 |
| readiness-flow-insufficient-001 | 17 | 1 | n/a | 14 |
| readiness-editor-near-match-001 | 19 | 1 | n/a | 17 |
| readiness-webhook-near-match-001 | 18 | 1 | n/a | 15 |
| readiness-flow-near-match-001 | 16 | 1 | n/a | 13 |
| readiness-editor-exact-no-code-001 | 19 | 1 | n/a | 17 |
| readiness-webhook-opaque-id-negative-001 | 17 | n/a | n/a | 13 |
| readiness-event-exact-accepted-missing-multi-store-001 | 17 | 1 | 1 | 15 |

## Per-representation provenance

| Ticket | Resource | Channel | Representation | Rank | Score |
|---|---|---|---|---:|---:|
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 24 | -1.9176136119313927 |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 1 | -24.68875713685198 |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 49 | -0.000002635624173446611 |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 48 | -0.0000029562348298667356 |
| readiness-editor-exact-chunkload-001 | knowledge-article:account-access | lexical | knowledge-article:account-access:section:0 | 10 | -4.768807482360881 |
| readiness-editor-exact-chunkload-001 | knowledge-article:authentication | lexical | knowledge-article:authentication:section:0 | 6 | -5.857607383598445 |
| readiness-editor-exact-chunkload-001 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 9 | -4.769870420867376 |
| readiness-editor-exact-chunkload-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 8 | -4.952388794828995 |
| readiness-editor-exact-chunkload-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 15 | -3.068924009340822 |
| readiness-editor-exact-chunkload-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 31 | -1.113441343033121 |
| readiness-editor-exact-chunkload-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 44 | -0.0000050658960007032245 |
| readiness-editor-exact-chunkload-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 47 | -0.000003548413037863726 |
| readiness-editor-exact-chunkload-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 2 | -23.254138636924747 |
| readiness-editor-exact-chunkload-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 3 | -18.288161273950664 |
| readiness-editor-exact-chunkload-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 4 | -12.036163182126023 |
| readiness-editor-exact-chunkload-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 5 | -11.622544704490931 |
| readiness-editor-exact-chunkload-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 7 | -5.837537468012974 |
| readiness-editor-exact-chunkload-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 37 | -0.22624201348005238 |
| readiness-editor-exact-chunkload-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 14 | -3.1406471630194925 |
| readiness-editor-exact-chunkload-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 26 | -1.7181226420463813 |
| readiness-editor-exact-chunkload-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 18 | -2.4403527954959596 |
| readiness-editor-exact-chunkload-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 17 | -2.4996798294831497 |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 6 | -17.57122044286022 |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 37 | -0.7192411255079972 |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 24 | -3.102489506564207 |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 22 | -3.409961112379357 |
| readiness-webhook-exact-rotation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 11 | -4.729338683887613 |
| readiness-webhook-exact-rotation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 13 | -4.15891204789493 |
| readiness-webhook-exact-rotation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 18 | -3.706612725210764 |
| readiness-webhook-exact-rotation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 30 | -1.9157627543775684 |
| readiness-webhook-exact-rotation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 40 | -0.00000611179275718585 |
| readiness-webhook-exact-rotation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 10 | -5.605479242548708 |
| readiness-webhook-exact-rotation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 21 | -3.4788712965194977 |
| readiness-webhook-exact-rotation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 32 | -1.7029859333603277 |
| readiness-webhook-exact-rotation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 35 | -1.3246307369158614 |
| readiness-webhook-exact-rotation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 43 | -0.000004718224120271244 |
| readiness-webhook-exact-rotation-001 | knowledge-article:product-feedback | lexical | knowledge-article:product-feedback:section:0 | 9 | -6.167955240033976 |
| readiness-webhook-exact-rotation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 5 | -18.251222440840824 |
| readiness-webhook-exact-rotation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 8 | -12.890709623752791 |
| readiness-webhook-exact-rotation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 26 | -3.0760799490442476 |
| readiness-webhook-exact-rotation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 27 | -2.9156055724794685 |
| readiness-webhook-exact-rotation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 29 | -2.07944539486751 |
| readiness-webhook-exact-rotation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 33 | -1.5718787353382517 |
| readiness-webhook-exact-rotation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 1 | -30.16075831751932 |
| readiness-webhook-exact-rotation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 2 | -28.904980602465248 |
| readiness-webhook-exact-rotation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 3 | -19.276778662220927 |
| readiness-webhook-exact-rotation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 4 | -18.899737006933602 |
| readiness-webhook-exact-rotation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 14 | -4.026460679343747 |
| readiness-webhook-exact-rotation-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 34 | -1.4937342810879701 |
| readiness-webhook-exact-rotation-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 36 | -0.8561824850141052 |
| readiness-webhook-exact-rotation-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 31 | -1.7087652976400136 |
| readiness-webhook-exact-rotation-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 19 | -3.6571736703874502 |
| readiness-webhook-exact-rotation-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 7 | -15.623720291815824 |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 36 | -1.0489771097990146 |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 42 | -0.7192403571924846 |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 20 | -3.999565062447482 |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 2 | -13.164444029172909 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 7 | -7.7254229222582085 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 6 | -7.791789694883569 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 3 | -10.67274718744892 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 18 | -4.671042537853571 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 22 | -3.5142952223052784 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 28 | -2.0419041743951922 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 29 | -1.9443649490810837 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 1 | -33.77805074291449 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 4 | -8.912649874205394 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 11 | -5.780824311252249 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 14 | -5.27481454845917 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 19 | -4.569820576809265 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 5 | -8.148457088376594 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 9 | -6.3220075867559595 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 13 | -5.595602878057026 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 15 | -5.2444786119292734 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 32 | -1.5718795666169734 |
| readiness-flow-exact-viewed-product-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 45 | -0.000005444899017852696 |
| readiness-flow-exact-viewed-product-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 33 | -1.4937326107866173 |
| readiness-flow-exact-viewed-product-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 37 | -0.8561831018691921 |
| readiness-flow-exact-viewed-product-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 23 | -3.1307343671410917 |
| readiness-flow-exact-viewed-product-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 27 | -2.3416663937239393 |
| readiness-flow-exact-viewed-product-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 24 | -3.0162842536188212 |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 13 | -2.8501535279368824 |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 5 | -7.587681819122479 |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 24 | -1.9543324826012 |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 16 | -2.5211627580088267 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:authentication | lexical | knowledge-article:authentication:section:0 | 3 | -8.928230780489688 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 11 | -3.252955123245614 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 18 | -2.322748934943919 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 23 | -2.003986269017392 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 36 | -0.5003231010267867 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 45 | -0.000004451575979820676 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 1 | -12.62589563811833 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 2 | -11.857001255087914 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 4 | -8.670562331337464 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 6 | -6.498538926454148 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 7 | -6.209866128734532 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 9 | -3.3592752696613086 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 12 | -3.1325094408494514 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 19 | -2.2685061644269404 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 21 | -2.117690407739565 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 28 | -1.5718813794172013 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 33 | -1.1599027845511007 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 10 | -3.3318886964909264 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 17 | -2.3655182543704854 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 22 | -2.1031836077296724 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 27 | -1.7903075713815408 |
| readiness-editor-paraphrase-screen-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 42 | -0.000005119204314042154 |
| readiness-editor-paraphrase-screen-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 8 | -5.955316367306827 |
| readiness-editor-paraphrase-screen-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 32 | -1.2236596460481488 |
| readiness-editor-paraphrase-screen-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 48 | -0.000004193806197406031 |
| readiness-editor-paraphrase-screen-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 46 | -0.000004439399391602159 |
| readiness-editor-paraphrase-screen-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 29 | -1.4779880297315626 |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 4 | -10.849981240577558 |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 35 | -1.1735300124719221 |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 10 | -6.039623745747292 |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 22 | -2.686355416236338 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 6 | -6.969457078657541 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 15 | -4.246563105162213 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 23 | -2.2478173351909976 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 24 | -2.236347590517929 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 29 | -1.6301317256889014 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 14 | -4.4504922040566175 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:sms-compliance | lexical | knowledge-article:sms-compliance:section:0 | 17 | -4.026823055341525 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 3 | -14.581289816905123 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 9 | -6.0931111624667365 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 11 | -5.695879899342397 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 12 | -4.935799959571458 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 21 | -2.74882572974587 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 48 | -0.000003091981888876329 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 1 | -18.490459756907423 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 5 | -10.33734261770655 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 8 | -6.574309144832736 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 13 | -4.9316618493691555 |
| readiness-webhook-paraphrase-late-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 20 | -2.8613905464296323 |
| readiness-webhook-paraphrase-late-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 30 | -1.4937320262766387 |
| readiness-webhook-paraphrase-late-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 16 | -4.2069974445702645 |
| readiness-webhook-paraphrase-late-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 18 | -3.3839234168074332 |
| readiness-webhook-paraphrase-late-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 2 | -15.514443945100494 |
| readiness-webhook-paraphrase-late-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 7 | -6.5766116380730715 |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 32 | -0.9648939166117798 |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 38 | -0.6286999384594918 |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 11 | -4.11413202343165 |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 2 | -7.905959721212064 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:api-reference | lexical | knowledge-article:api-reference:section:0 | 13 | -3.886251222391301 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 3 | -7.4508300407577845 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 5 | -6.753649215050921 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 6 | -6.548598118712279 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 9 | -4.547787474203231 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 16 | -2.8565345246045566 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 1 | -8.146184585911708 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 4 | -7.286338233442569 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 8 | -4.618921681281362 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 10 | -4.534254072413807 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 22 | -2.453863330202614 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 7 | -5.6958780865421685 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 14 | -3.579649156398414 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 20 | -2.706355624755608 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 21 | -2.6515548569331115 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 30 | -1.1109628777386973 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 31 | -1.0866075447703356 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 12 | -3.90631413080577 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 15 | -2.9005216616634137 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 19 | -2.766147176410561 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 25 | -2.3655171161646735 |
| readiness-flow-paraphrase-automation-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 42 | -0.04129186295907737 |
| readiness-flow-paraphrase-automation-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 28 | -1.4937319378165403 |
| readiness-flow-paraphrase-automation-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 37 | -0.739655405309516 |
| readiness-flow-paraphrase-automation-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 41 | -0.0728426507741014 |
| readiness-flow-paraphrase-automation-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 23 | -2.444221606854157 |
| readiness-flow-paraphrase-automation-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 33 | -0.8622565066453209 |
| readiness-editor-contrast-private-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 31 | -1.0112452033097417 |
| readiness-editor-contrast-private-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 1 | -12.111221524721358 |
| readiness-editor-contrast-private-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 15 | -2.7463880904480003 |
| readiness-editor-contrast-private-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 14 | -2.7954489917903222 |
| readiness-editor-contrast-private-001 | knowledge-article:account-access | lexical | knowledge-article:account-access:section:0 | 9 | -4.902203327792972 |
| readiness-editor-contrast-private-001 | knowledge-article:authentication | lexical | knowledge-article:authentication:section:0 | 3 | -10.105069539896068 |
| readiness-editor-contrast-private-001 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 12 | -3.4276255471893142 |
| readiness-editor-contrast-private-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 2 | -11.008653285171286 |
| readiness-editor-contrast-private-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 4 | -9.865748496894373 |
| readiness-editor-contrast-private-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 5 | -9.325066111145011 |
| readiness-editor-contrast-private-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 6 | -7.82154226613128 |
| readiness-editor-contrast-private-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 7 | -6.955484568022623 |
| readiness-editor-contrast-private-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 8 | -5.829267978866579 |
| readiness-editor-contrast-private-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 10 | -4.04679306471968 |
| readiness-editor-contrast-private-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 11 | -3.4379737745790626 |
| readiness-editor-contrast-private-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 16 | -2.7148977868423785 |
| readiness-editor-contrast-private-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 19 | -2.0150471233142437 |
| readiness-editor-contrast-private-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 25 | -1.5718822945017266 |
| readiness-editor-contrast-private-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 22 | -1.7199715600909564 |
| readiness-editor-contrast-private-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 13 | -3.2911248342521215 |
| readiness-editor-contrast-private-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 37 | -0.6939066897996222 |
| readiness-editor-contrast-private-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 44 | -0.29031034899774544 |
| readiness-editor-contrast-private-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 18 | -2.0716866286092337 |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 7 | -8.727535710821755 |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 17 | -2.191874207082181 |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 27 | -0.997248578996826 |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 49 | -0.0000029562348298667356 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 9 | -6.24582627570503 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 11 | -4.255152052168393 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 19 | -1.915761633842682 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 22 | -1.8442675258753178 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 43 | -0.0000038712566929863 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 47 | -0.000003327874380593075 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 10 | -5.421312060501811 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 5 | -12.003084224796394 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 8 | -8.469008702030475 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 13 | -2.9965347846708696 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 14 | -2.9245769786649056 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 21 | -1.8820836158841652 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 46 | -0.000003354297156074232 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 1 | -16.1998239514927 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 2 | -16.19949474881843 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 3 | -13.780420626404203 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 6 | -10.765448265234118 |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 24 | -1.5895957554129738 |
| readiness-webhook-contrast-raw-body-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 18 | -1.955603792042154 |
| readiness-webhook-contrast-raw-body-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 42 | -0.000004243786101418313 |
| readiness-webhook-contrast-raw-body-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 36 | -0.000004555116258399979 |
| readiness-webhook-contrast-raw-body-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 28 | -0.7900004567708866 |
| readiness-webhook-contrast-raw-body-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 4 | -13.397942383176096 |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 27 | -1.6306808765140797 |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 45 | -0.000007102681618507992 |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 6 | -8.446941557150259 |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 3 | -18.652207543594372 |
| readiness-flow-contrast-excluded-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 5 | -10.705219969826022 |
| readiness-flow-contrast-excluded-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 24 | -2.1249851057854414 |
| readiness-flow-contrast-excluded-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 26 | -1.9443668962665053 |
| readiness-flow-contrast-excluded-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 30 | -1.3339949262136799 |
| readiness-flow-contrast-excluded-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 37 | -0.6186164763388412 |
| readiness-flow-contrast-excluded-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 1 | -24.557493867129676 |
| readiness-flow-contrast-excluded-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 2 | -19.198040017987154 |
| readiness-flow-contrast-excluded-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 4 | -11.992721186162584 |
| readiness-flow-contrast-excluded-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 7 | -8.394551744450876 |
| readiness-flow-contrast-excluded-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 10 | -6.1770235342411715 |
| readiness-flow-contrast-excluded-001 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 8 | -8.38473124398489 |
| readiness-flow-contrast-excluded-001 | knowledge-article:segmentation-audience-rules | lexical | knowledge-article:segmentation-audience-rules:section:0 | 13 | -4.528147251136505 |
| readiness-flow-contrast-excluded-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 9 | -7.9200027995706535 |
| readiness-flow-contrast-excluded-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 11 | -5.695883458505871 |
| readiness-flow-contrast-excluded-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 12 | -4.745292191281216 |
| readiness-flow-contrast-excluded-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 16 | -2.910944771257483 |
| readiness-flow-contrast-excluded-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 18 | -2.85217618707689 |
| readiness-flow-contrast-excluded-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 46 | -0.000006715318437222045 |
| readiness-flow-contrast-excluded-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 29 | -1.4937361293979192 |
| readiness-flow-contrast-excluded-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 15 | -3.1454900836858193 |
| readiness-flow-contrast-excluded-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 21 | -2.4023500017661075 |
| readiness-flow-contrast-excluded-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 38 | -0.07284764558752801 |
| readiness-flow-contrast-excluded-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 28 | -1.5516741335260305 |
| readiness-editor-disagreement-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 29 | -2.417289768179772 |
| readiness-editor-disagreement-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 1 | -31.922397639744993 |
| readiness-editor-disagreement-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 30 | -2.3957220336176936 |
| readiness-editor-disagreement-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 43 | -0.0000050615233130930575 |
| readiness-editor-disagreement-001 | knowledge-article:authentication | lexical | knowledge-article:authentication:section:0 | 9 | -8.0849061795636 |
| readiness-editor-disagreement-001 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 7 | -11.949971129941584 |
| readiness-editor-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 8 | -8.68994130946341 |
| readiness-editor-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 24 | -2.696051163340668 |
| readiness-editor-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 28 | -2.4226091643264027 |
| readiness-editor-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 41 | -0.000006111792757185851 |
| readiness-editor-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 48 | -0.000003862418907901574 |
| readiness-editor-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 10 | -6.028105877043882 |
| readiness-editor-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 34 | -1.3854920648995896 |
| readiness-editor-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 35 | -1.316131798811063 |
| readiness-editor-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 36 | -1.2043718029881152 |
| readiness-editor-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 42 | -0.000005779436937660207 |
| readiness-editor-disagreement-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 2 | -24.24084432277487 |
| readiness-editor-disagreement-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 3 | -24.057061036189385 |
| readiness-editor-disagreement-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 4 | -23.387205770932493 |
| readiness-editor-disagreement-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 5 | -17.41097489212435 |
| readiness-editor-disagreement-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 6 | -12.17014202800527 |
| readiness-editor-disagreement-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 44 | -0.0000050525183499518066 |
| readiness-editor-disagreement-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 11 | -5.2081092916812 |
| readiness-editor-disagreement-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 12 | -5.037072806855185 |
| readiness-editor-disagreement-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 46 | -0.000004157396198637748 |
| readiness-editor-disagreement-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 18 | -3.842433269659457 |
| readiness-webhook-disagreement-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 6 | -14.787928422614845 |
| readiness-webhook-disagreement-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 46 | -0.7192400293657291 |
| readiness-webhook-disagreement-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 13 | -8.985092125302778 |
| readiness-webhook-disagreement-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 34 | -2.1380375504975455 |
| readiness-webhook-disagreement-001 | knowledge-article:api-reference | lexical | knowledge-article:api-reference:section:0 | 17 | -6.339922166228283 |
| readiness-webhook-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 12 | -9.301105714686527 |
| readiness-webhook-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 14 | -8.666366597558051 |
| readiness-webhook-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 20 | -5.3058618266902355 |
| readiness-webhook-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 31 | -2.5460642810493797 |
| readiness-webhook-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 38 | -1.814268701851316 |
| readiness-webhook-disagreement-001 | knowledge-article:sms-compliance | lexical | knowledge-article:sms-compliance:section:0 | 16 | -6.499873233399737 |
| readiness-webhook-disagreement-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 5 | -15.285067774245954 |
| readiness-webhook-disagreement-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 11 | -9.420593433709627 |
| readiness-webhook-disagreement-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 15 | -8.439714262838669 |
| readiness-webhook-disagreement-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 27 | -3.610643472030863 |
| readiness-webhook-disagreement-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 30 | -2.65701482117673 |
| readiness-webhook-disagreement-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 39 | -1.5718799217260768 |
| readiness-webhook-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 1 | -21.530919307346338 |
| readiness-webhook-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 2 | -20.107780311203808 |
| readiness-webhook-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 3 | -19.536657853963188 |
| readiness-webhook-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 4 | -18.62628913811991 |
| readiness-webhook-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 8 | -11.21760653682801 |
| readiness-webhook-disagreement-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 32 | -2.1916414645268323 |
| readiness-webhook-disagreement-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 10 | -9.431765551161098 |
| readiness-webhook-disagreement-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 21 | -4.639955704968917 |
| readiness-webhook-disagreement-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 7 | -11.839179847447419 |
| readiness-webhook-disagreement-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 9 | -9.986420069098306 |
| readiness-flow-disagreement-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 46 | -0.9716213757703396 |
| readiness-flow-disagreement-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 30 | -2.966211574769446 |
| readiness-flow-disagreement-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 2 | -13.788204966311001 |
| readiness-flow-disagreement-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 1 | -21.470156819297955 |
| readiness-flow-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 3 | -12.132981245665867 |
| readiness-flow-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 4 | -12.129906423500051 |
| readiness-flow-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 6 | -11.451816001012746 |
| readiness-flow-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 8 | -10.867637226736425 |
| readiness-flow-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 9 | -10.595746351841315 |
| readiness-flow-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 5 | -11.486810716839218 |
| readiness-flow-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 7 | -11.20120227865408 |
| readiness-flow-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 10 | -8.894378997505932 |
| readiness-flow-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 18 | -5.124082696980537 |
| readiness-flow-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 32 | -2.832726838636086 |
| readiness-flow-disagreement-001 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 12 | -6.445697589444921 |
| readiness-flow-disagreement-001 | knowledge-article:segmentation-audience-rules | lexical | knowledge-article:segmentation-audience-rules:section:0 | 13 | -6.39290203478787 |
| readiness-flow-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 14 | -6.063372662438138 |
| readiness-flow-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 21 | -3.992047704313371 |
| readiness-flow-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 38 | -2.237911854148827 |
| readiness-flow-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 41 | -1.8577945210070108 |
| readiness-flow-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 47 | -0.8012605559185282 |
| readiness-flow-disagreement-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 24 | -3.546067249827062 |
| readiness-flow-disagreement-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 11 | -7.5544012980641275 |
| readiness-flow-disagreement-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 31 | -2.8836516759148445 |
| readiness-flow-disagreement-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 36 | -2.4442196213287555 |
| readiness-flow-disagreement-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 19 | -4.704686696564657 |
| readiness-editor-insufficient-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 17 | -2.8501506842451465 |
| readiness-editor-insufficient-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 2 | -21.145979714513842 |
| readiness-editor-insufficient-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 23 | -1.96840395346441 |
| readiness-editor-insufficient-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 46 | -0.0000029562348298667356 |
| readiness-editor-insufficient-001 | knowledge-article:account-access | lexical | knowledge-article:account-access:section:0 | 11 | -3.7542570645510303 |
| readiness-editor-insufficient-001 | knowledge-article:authentication | lexical | knowledge-article:authentication:section:0 | 9 | -4.471038334629054 |
| readiness-editor-insufficient-001 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 8 | -5.611588880598956 |
| readiness-editor-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 7 | -7.0645351438866095 |
| readiness-editor-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 10 | -3.975705494640458 |
| readiness-editor-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 22 | -2.0416542469815537 |
| readiness-editor-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 24 | -1.8883381790695979 |
| readiness-editor-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 43 | -0.000003478443627872672 |
| readiness-editor-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 1 | -23.289530108383804 |
| readiness-editor-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 3 | -17.39705402516754 |
| readiness-editor-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 4 | -15.566237408473333 |
| readiness-editor-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 5 | -15.432580906283183 |
| readiness-editor-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 6 | -7.461629287750101 |
| readiness-editor-insufficient-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 39 | -0.000004646016967709772 |
| readiness-editor-insufficient-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 28 | -1.2236566112390521 |
| readiness-editor-insufficient-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 40 | -0.000004585335390831614 |
| readiness-editor-insufficient-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 32 | -0.8925538246245989 |
| readiness-editor-insufficient-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 33 | -0.862257584301399 |
| readiness-webhook-insufficient-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 4 | -16.70887909670297 |
| readiness-webhook-insufficient-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 46 | -0.000005318762980936225 |
| readiness-webhook-insufficient-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 27 | -1.2844123748985263 |
| readiness-webhook-insufficient-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 38 | -0.5602381222135329 |
| readiness-webhook-insufficient-001 | knowledge-article:api-reference | lexical | knowledge-article:api-reference:section:0 | 13 | -4.573026097387907 |
| readiness-webhook-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 12 | -5.603669433547965 |
| readiness-webhook-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 19 | -2.7687724730107055 |
| readiness-webhook-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 29 | -1.113440403130465 |
| readiness-webhook-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 30 | -0.9880232405909644 |
| readiness-webhook-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 48 | -0.000004466748448739552 |
| readiness-webhook-insufficient-001 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 14 | -4.396885457234354 |
| readiness-webhook-insufficient-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 6 | -14.833522637104968 |
| readiness-webhook-insufficient-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 7 | -12.67700061494697 |
| readiness-webhook-insufficient-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 10 | -7.423469567085031 |
| readiness-webhook-insufficient-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 22 | -2.3007687355266535 |
| readiness-webhook-insufficient-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 26 | -1.8475881342462104 |
| readiness-webhook-insufficient-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 49 | -0.00000418557587781577 |
| readiness-webhook-insufficient-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 2 | -19.715750285249605 |
| readiness-webhook-insufficient-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 3 | -18.75218304357889 |
| readiness-webhook-insufficient-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 5 | -16.442896604984437 |
| readiness-webhook-insufficient-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 8 | -12.479601321302226 |
| readiness-webhook-insufficient-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 9 | -7.489666287439772 |
| readiness-webhook-insufficient-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 39 | -0.000007167296993621865 |
| readiness-webhook-insufficient-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 33 | -0.8561824850141052 |
| readiness-webhook-insufficient-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 37 | -0.6086758042964151 |
| readiness-webhook-insufficient-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 11 | -5.968075182154079 |
| readiness-webhook-insufficient-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 1 | -21.095140183167555 |
| readiness-flow-insufficient-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 28 | -2.3113927434334642 |
| readiness-flow-insufficient-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 39 | -0.6287018891265984 |
| readiness-flow-insufficient-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 7 | -7.913430142880249 |
| readiness-flow-insufficient-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 2 | -10.58028352613592 |
| readiness-flow-insufficient-001 | knowledge-article:api-reference | lexical | knowledge-article:api-reference:section:0 | 10 | -6.581056535176817 |
| readiness-flow-insufficient-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 1 | -10.828318419071326 |
| readiness-flow-insufficient-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 3 | -10.348148070946845 |
| readiness-flow-insufficient-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 5 | -8.676256950358368 |
| readiness-flow-insufficient-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 11 | -5.654777940283315 |
| readiness-flow-insufficient-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 18 | -3.7338646387743943 |
| readiness-flow-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 4 | -9.520004618541087 |
| readiness-flow-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 6 | -8.098206560021984 |
| readiness-flow-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 8 | -7.458418078498341 |
| readiness-flow-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 9 | -6.847667354170459 |
| readiness-flow-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 12 | -5.049771046842616 |
| readiness-flow-insufficient-001 | knowledge-article:segmentation-audience-rules | lexical | knowledge-article:segmentation-audience-rules:section:0 | 14 | -4.462747334599639 |
| readiness-flow-insufficient-001 | knowledge-article:sms-compliance | lexical | knowledge-article:sms-compliance:section:0 | 13 | -5.028637719513304 |
| readiness-flow-insufficient-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 43 | -0.000005230526946232995 |
| readiness-flow-insufficient-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 22 | -3.126003532651112 |
| readiness-flow-insufficient-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 40 | -0.07284465285814401 |
| readiness-flow-insufficient-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 35 | -1.6583849213255986 |
| readiness-flow-insufficient-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 44 | -0.000004157396198637748 |
| readiness-editor-near-match-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 36 | -0.6679552126963945 |
| readiness-editor-near-match-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 3 | -13.224682551097231 |
| readiness-editor-near-match-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 12 | -3.763267277379814 |
| readiness-editor-near-match-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 20 | -2.1380356469069572 |
| readiness-editor-near-match-001 | knowledge-article:account-access | lexical | knowledge-article:account-access:section:0 | 10 | -4.902201535819021 |
| readiness-editor-near-match-001 | knowledge-article:authentication | lexical | knowledge-article:authentication:section:0 | 5 | -11.180394807475768 |
| readiness-editor-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 1 | -15.810896679396894 |
| readiness-editor-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 2 | -14.2116156756685 |
| readiness-editor-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 4 | -11.467046679009744 |
| readiness-editor-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 6 | -10.845102025482376 |
| readiness-editor-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 7 | -8.356992935186732 |
| readiness-editor-near-match-001 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 11 | -4.120494070410222 |
| readiness-editor-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 8 | -8.000740051106714 |
| readiness-editor-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 9 | -5.870051750113457 |
| readiness-editor-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 14 | -3.0724132441396703 |
| readiness-editor-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 16 | -2.794463360652819 |
| readiness-editor-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 24 | -2.015044399602527 |
| readiness-editor-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 28 | -1.5718795666169736 |
| readiness-editor-near-match-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 26 | -1.719968762383938 |
| readiness-editor-near-match-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 33 | -1.2236590539262306 |
| readiness-editor-near-match-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 47 | -0.0000034114656073732033 |
| readiness-editor-near-match-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 38 | -0.2903078246716598 |
| readiness-editor-near-match-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 22 | -2.071684032688587 |
| readiness-webhook-near-match-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 9 | -5.835376574920623 |
| readiness-webhook-near-match-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 15 | -3.587801992302449 |
| readiness-webhook-near-match-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 32 | -1.8351155072934842 |
| readiness-webhook-near-match-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 11 | -4.809702853825146 |
| readiness-webhook-near-match-001 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 13 | -4.285687910449366 |
| readiness-webhook-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 14 | -4.050449661320826 |
| readiness-webhook-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 22 | -2.786574495144776 |
| readiness-webhook-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 28 | -2.2920043240865096 |
| readiness-webhook-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 37 | -1.5486587149826387 |
| readiness-webhook-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 42 | -1.0400924946223142 |
| readiness-webhook-near-match-001 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 12 | -4.396885071423793 |
| readiness-webhook-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 1 | -13.123340998842128 |
| readiness-webhook-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 2 | -9.00929105485217 |
| readiness-webhook-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 4 | -8.548057084053474 |
| readiness-webhook-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 8 | -6.308142882343571 |
| readiness-webhook-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 18 | -2.9612731010214457 |
| readiness-webhook-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 36 | -1.5718807530047985 |
| readiness-webhook-near-match-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 3 | -8.61627929508415 |
| readiness-webhook-near-match-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 5 | -7.748019690520524 |
| readiness-webhook-near-match-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 7 | -6.485341955626541 |
| readiness-webhook-near-match-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 33 | -1.7903071984392296 |
| readiness-webhook-near-match-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 47 | -0.000004206793855649281 |
| readiness-webhook-near-match-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 6 | -6.624505658916427 |
| readiness-webhook-near-match-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 23 | -2.5259323011699264 |
| readiness-webhook-near-match-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 35 | -1.6583084926784926 |
| readiness-webhook-near-match-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 30 | -2.209730443509562 |
| readiness-webhook-near-match-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 10 | -5.481830879913776 |
| readiness-flow-near-match-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 8 | -7.398368023534177 |
| readiness-flow-near-match-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 16 | -5.065459137599412 |
| readiness-flow-near-match-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 14 | -5.6303229568766335 |
| readiness-flow-near-match-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 3 | -9.986511738759857 |
| readiness-flow-near-match-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 6 | -9.072714684885195 |
| readiness-flow-near-match-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 7 | -7.890005469713739 |
| readiness-flow-near-match-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 9 | -7.119840370629859 |
| readiness-flow-near-match-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 20 | -3.3484119329860467 |
| readiness-flow-near-match-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 29 | -2.232138375165523 |
| readiness-flow-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 1 | -14.43304812118723 |
| readiness-flow-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 2 | -12.369192211438975 |
| readiness-flow-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 4 | -9.555486550376763 |
| readiness-flow-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 10 | -6.388572495701844 |
| readiness-flow-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 17 | -4.26536249188031 |
| readiness-flow-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 13 | -5.757495307227524 |
| readiness-flow-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 25 | -2.4982763490754785 |
| readiness-flow-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 26 | -2.4034023214971216 |
| readiness-flow-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 28 | -2.3515243405727118 |
| readiness-flow-near-match-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 45 | -0.2977734212075587 |
| readiness-flow-near-match-001 | knowledge-article:sms-compliance | lexical | knowledge-article:sms-compliance:section:0 | 12 | -5.967513812235507 |
| readiness-flow-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 5 | -9.456878821302867 |
| readiness-flow-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 11 | -6.305624189735251 |
| readiness-flow-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 19 | -4.124006891076951 |
| readiness-flow-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 21 | -3.3338902168632742 |
| readiness-flow-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 37 | -1.3111538842939257 |
| readiness-flow-near-match-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 47 | -0.16917556076728182 |
| readiness-flow-near-match-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 33 | -1.7530319937860486 |
| readiness-flow-near-match-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 18 | -4.175640776149447 |
| readiness-flow-near-match-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 31 | -1.9257623263283257 |
| readiness-flow-near-match-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 41 | -0.9662395933844259 |
| readiness-flow-near-match-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 42 | -0.862260422144001 |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 16 | -3.931533890065265 |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 1 | -33.60996730934225 |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 48 | -0.000003671102056163254 |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 49 | -0.0000029562348298667356 |
| readiness-editor-exact-no-code-001 | knowledge-article:account-access | lexical | knowledge-article:account-access:section:0 | 10 | -5.170410735520749 |
| readiness-editor-exact-no-code-001 | knowledge-article:authentication | lexical | knowledge-article:authentication:section:0 | 6 | -13.27261467055487 |
| readiness-editor-exact-no-code-001 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 9 | -5.468433524970811 |
| readiness-editor-exact-no-code-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:3 | 2 | -24.634622335456534 |
| readiness-editor-exact-no-code-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:1 | 3 | -24.051057710657865 |
| readiness-editor-exact-no-code-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 4 | -24.02832410439281 |
| readiness-editor-exact-no-code-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:2 | 5 | -17.523553849594364 |
| readiness-editor-exact-no-code-001 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:4 | 7 | -10.629669361374846 |
| readiness-editor-exact-no-code-001 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 8 | -6.637200075984356 |
| readiness-editor-exact-no-code-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 37 | -0.22624314088571806 |
| readiness-editor-exact-no-code-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 25 | -2.0674688151349874 |
| readiness-editor-exact-no-code-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 27 | -1.813408207578752 |
| readiness-editor-exact-no-code-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 17 | -3.5616818529900116 |
| readiness-editor-exact-no-code-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 18 | -3.2980947771443345 |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 3 | -16.844625040966832 |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 49 | -0.000004383698999222968 |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 34 | -2.338336002463135 |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 40 | -0.7454698794555225 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 13 | -5.434273654216125 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 14 | -5.357533392420389 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 18 | -4.346704569988296 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 28 | -3.486391212299975 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 31 | -2.7281754622600958 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 41 | -0.6857369355034859 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 5 | -13.829056657605484 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 4 | -14.498313525223644 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 10 | -9.834626506212775 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 11 | -8.965379854344393 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 20 | -4.153200565117441 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 25 | -3.6951726451558735 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 37 | -1.5332121849803353 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 2 | -18.338791479439838 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:2 | 6 | -13.055895943610048 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:1 | 7 | -12.892563091573 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:4 | 8 | -12.891135429037169 |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:3 | 9 | -12.790000415589336 |
| readiness-webhook-opaque-id-negative-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 32 | -2.48555820614297 |
| readiness-webhook-opaque-id-negative-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 16 | -4.782159388389741 |
| readiness-webhook-opaque-id-negative-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 26 | -3.6809167695204996 |
| readiness-webhook-opaque-id-negative-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 12 | -6.269891890398515 |
| readiness-webhook-opaque-id-negative-001 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 1 | -20.281452595206368 |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 32 | -3.0072110334801994 |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 28 | -3.509461477650315 |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 1 | -20.321843942988608 |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 2 | -16.77454027842943 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:3 | 3 | -13.844438943029727 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:2 | 4 | -11.747062496927413 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:1 | 6 | -9.04974613828426 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 9 | -8.384599700930085 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:4 | 16 | -6.619675679215857 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:3 | 5 | -11.164171258734731 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:1 | 10 | -7.873001862685771 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:4 | 12 | -7.511579404552025 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 13 | -7.336261266820926 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:2 | 14 | -7.163928680159325 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:segmentation-audience-rules | lexical | knowledge-article:segmentation-audience-rules:section:0 | 15 | -6.955627190214407 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:shopify-integration-sync | lexical | knowledge-article:shopify-integration-sync:section:0 | 7 | -8.81891866846229 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 8 | -8.495341541916718 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 11 | -7.545795413464449 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 17 | -5.932896568643711 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 35 | -2.7983853945422643 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 48 | -0.000005998566483820199 |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 49 | -0.0000045406849810411845 |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 31 | -3.0602419308196764 |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 26 | -3.6965485727238745 |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 37 | -2.5173341899758506 |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 19 | -4.410109864022377 |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 42 | -1.3270697446128334 |

## Per-type metrics

| Type | Scenarios | Lexical R@1 | Lexical R@3 | Lexical R@5 | Lexical P@1 | Lexical P@3 | Lexical P@5 | Semantic R@1 | Semantic R@3 | Semantic R@5 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| diagnostic-playbook | 20 | 1 | 1 | 1 | n/a | n/a | n/a | n/a | n/a | n/a |
| knowledge-article | 20 | 0.85 | 1 | 1 | n/a | n/a | n/a | n/a | n/a | n/a |
| known-cause | 3 | 1 | 1 | 1 | n/a | n/a | n/a | n/a | n/a | n/a |
| resolved-ticket | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Per-family metrics

| Family | Scenarios | Candidate recall | Required coverage |
|---|---:|---:|---:|
| contrast | 3 | 1 | 1 |
| disagreement-probe | 3 | 1 | n/a |
| exact | 6 | 1 | 1 |
| insufficient | 3 | 1 | n/a |
| near-match | 3 | 1 | n/a |
| paraphrase | 3 | 1 | n/a |

## Baseline comparison

- {"deterministicArticleRequiredCoverage":0.5714285714285714,"unionRequiredCoverage":1,"scenariosCompared":7,"unsupportedResourceFamilies":["known-cause","diagnostic-playbook","resolved-ticket"]}

## Reference channel pools

| Channel | Kind | Scenarios | Candidate recall | Required coverage | Excluded recall | Excluded required | Provenance |
|---|---|---:|---:|---:|---:|---:|---|
| deterministic | unordered-pool | 21 | 0.18333333333333332 | 0.5714285714285714 | 1 | 14 | deterministic classifier associations |
| knownCause | unordered-pool | 21 | 0.2166666666666667 | 0.42857142857142855 | 1 | 14 | direct approved links from retrieved known causes |

## Retrieval, corpus, and oracle-review gaps

- Retrieval misses: None.
- Corpus gaps: None.
- Oracle-review candidates: readiness-editor-exact-chunkload-001:diagnostic-playbook:article-backed, readiness-editor-exact-chunkload-001:diagnostic-playbook:event-processing-delay, readiness-editor-exact-chunkload-001:diagnostic-playbook:flow-trigger, readiness-editor-exact-chunkload-001:knowledge-article:account-access, readiness-editor-exact-chunkload-001:knowledge-article:authentication, readiness-editor-exact-chunkload-001:knowledge-article:coupon-catalog-sync, readiness-editor-exact-chunkload-001:knowledge-article:event-tracking-debugging, readiness-editor-exact-chunkload-001:knowledge-article:shopify-integration-sync, readiness-editor-exact-chunkload-001:knowledge-article:sms-compliance, readiness-editor-exact-chunkload-001:knowledge-article:webhook-signature-validation, readiness-editor-exact-chunkload-001:known-cause:shopify-custom-field-mapping, readiness-editor-exact-chunkload-001:known-cause:sms-quiet-hours, readiness-editor-exact-chunkload-001:known-cause:track-api-local-time-timestamp, readiness-editor-exact-chunkload-001:known-cause:webhook-delivery-latency, readiness-editor-exact-chunkload-001:known-cause:webhook-secret-rotation, readiness-webhook-exact-rotation-001:diagnostic-playbook:campaign-editor, readiness-webhook-exact-rotation-001:diagnostic-playbook:event-processing-delay, readiness-webhook-exact-rotation-001:diagnostic-playbook:flow-trigger, readiness-webhook-exact-rotation-001:knowledge-article:event-tracking-debugging, readiness-webhook-exact-rotation-001:knowledge-article:flow-trigger-troubleshooting, readiness-webhook-exact-rotation-001:knowledge-article:product-feedback, readiness-webhook-exact-rotation-001:knowledge-article:shopify-integration-sync, readiness-webhook-exact-rotation-001:knowledge-article:sms-compliance, readiness-webhook-exact-rotation-001:knowledge-article:support-operations-playbook, readiness-webhook-exact-rotation-001:known-cause:shopify-custom-field-mapping, readiness-webhook-exact-rotation-001:known-cause:sms-quiet-hours, readiness-webhook-exact-rotation-001:known-cause:track-api-local-time-timestamp, readiness-webhook-exact-rotation-001:known-cause:webhook-delivery-latency, readiness-flow-exact-viewed-product-001:diagnostic-playbook:article-backed, readiness-flow-exact-viewed-product-001:diagnostic-playbook:campaign-editor, readiness-flow-exact-viewed-product-001:diagnostic-playbook:event-processing-delay, readiness-flow-exact-viewed-product-001:knowledge-article:campaign-send-failures, readiness-flow-exact-viewed-product-001:knowledge-article:coupon-catalog-sync, readiness-flow-exact-viewed-product-001:knowledge-article:event-tracking-debugging, readiness-flow-exact-viewed-product-001:knowledge-article:profile-sync-issues, readiness-flow-exact-viewed-product-001:knowledge-article:shopify-integration-sync, readiness-flow-exact-viewed-product-001:knowledge-article:sms-compliance, readiness-flow-exact-viewed-product-001:knowledge-article:support-operations-playbook, readiness-flow-exact-viewed-product-001:knowledge-article:webhook-signature-validation, readiness-flow-exact-viewed-product-001:known-cause:shopify-custom-field-mapping, readiness-flow-exact-viewed-product-001:known-cause:sms-quiet-hours, readiness-flow-exact-viewed-product-001:known-cause:sms-stop-sync-delay, readiness-flow-exact-viewed-product-001:known-cause:webhook-delivery-latency, readiness-flow-exact-viewed-product-001:known-cause:webhook-secret-rotation, readiness-editor-paraphrase-screen-001:diagnostic-playbook:article-backed, readiness-editor-paraphrase-screen-001:diagnostic-playbook:event-processing-delay, readiness-editor-paraphrase-screen-001:diagnostic-playbook:flow-trigger, readiness-editor-paraphrase-screen-001:knowledge-article:authentication, readiness-editor-paraphrase-screen-001:knowledge-article:event-tracking-debugging, readiness-editor-paraphrase-screen-001:knowledge-article:profile-sync-issues, readiness-editor-paraphrase-screen-001:knowledge-article:shopify-integration-sync, readiness-editor-paraphrase-screen-001:knowledge-article:sms-compliance, readiness-editor-paraphrase-screen-001:knowledge-article:support-operations-playbook, readiness-editor-paraphrase-screen-001:knowledge-article:webhook-signature-validation, readiness-editor-paraphrase-screen-001:known-cause:shopify-custom-field-mapping, readiness-editor-paraphrase-screen-001:known-cause:sms-quiet-hours, readiness-editor-paraphrase-screen-001:known-cause:sms-stop-sync-delay, readiness-editor-paraphrase-screen-001:known-cause:track-api-local-time-timestamp, readiness-editor-paraphrase-screen-001:known-cause:webhook-delivery-latency, readiness-webhook-paraphrase-late-001:diagnostic-playbook:campaign-editor, readiness-webhook-paraphrase-late-001:diagnostic-playbook:event-processing-delay, readiness-webhook-paraphrase-late-001:diagnostic-playbook:flow-trigger, readiness-webhook-paraphrase-late-001:knowledge-article:event-tracking-debugging, readiness-webhook-paraphrase-late-001:knowledge-article:profile-sync-issues, readiness-webhook-paraphrase-late-001:knowledge-article:security-incident-response, readiness-webhook-paraphrase-late-001:knowledge-article:shopify-integration-sync, readiness-webhook-paraphrase-late-001:knowledge-article:sms-compliance, readiness-webhook-paraphrase-late-001:knowledge-article:support-operations-playbook, readiness-webhook-paraphrase-late-001:known-cause:shopify-custom-field-mapping, readiness-webhook-paraphrase-late-001:known-cause:sms-stop-sync-delay, readiness-webhook-paraphrase-late-001:known-cause:track-api-local-time-timestamp, readiness-webhook-paraphrase-late-001:known-cause:webhook-secret-rotation, readiness-flow-paraphrase-automation-001:diagnostic-playbook:article-backed, readiness-flow-paraphrase-automation-001:diagnostic-playbook:campaign-editor, readiness-flow-paraphrase-automation-001:diagnostic-playbook:event-processing-delay, readiness-flow-paraphrase-automation-001:knowledge-article:api-reference, readiness-flow-paraphrase-automation-001:knowledge-article:event-tracking-debugging, readiness-flow-paraphrase-automation-001:knowledge-article:profile-sync-issues, readiness-flow-paraphrase-automation-001:knowledge-article:shopify-integration-sync, readiness-flow-paraphrase-automation-001:knowledge-article:sms-compliance, readiness-flow-paraphrase-automation-001:knowledge-article:support-operations-playbook, readiness-flow-paraphrase-automation-001:knowledge-article:webhook-signature-validation, readiness-flow-paraphrase-automation-001:known-cause:shopify-custom-field-mapping, readiness-flow-paraphrase-automation-001:known-cause:sms-stop-sync-delay, readiness-flow-paraphrase-automation-001:known-cause:track-api-local-time-timestamp, readiness-flow-paraphrase-automation-001:known-cause:webhook-delivery-latency, readiness-flow-paraphrase-automation-001:known-cause:webhook-secret-rotation, readiness-editor-contrast-private-001:diagnostic-playbook:article-backed, readiness-editor-contrast-private-001:diagnostic-playbook:event-processing-delay, readiness-editor-contrast-private-001:diagnostic-playbook:flow-trigger, readiness-editor-contrast-private-001:knowledge-article:account-access, readiness-editor-contrast-private-001:knowledge-article:authentication, readiness-editor-contrast-private-001:knowledge-article:campaign-send-failures, readiness-editor-contrast-private-001:knowledge-article:event-tracking-debugging, readiness-editor-contrast-private-001:knowledge-article:profile-sync-issues, readiness-editor-contrast-private-001:knowledge-article:shopify-integration-sync, readiness-editor-contrast-private-001:knowledge-article:sms-compliance, readiness-editor-contrast-private-001:knowledge-article:support-operations-playbook, readiness-editor-contrast-private-001:knowledge-article:webhook-signature-validation, readiness-editor-contrast-private-001:known-cause:shopify-custom-field-mapping, readiness-editor-contrast-private-001:known-cause:sms-quiet-hours, readiness-editor-contrast-private-001:known-cause:sms-stop-sync-delay, readiness-editor-contrast-private-001:known-cause:track-api-local-time-timestamp, readiness-editor-contrast-private-001:known-cause:webhook-delivery-latency, readiness-webhook-contrast-raw-body-001:diagnostic-playbook:campaign-editor, readiness-webhook-contrast-raw-body-001:diagnostic-playbook:event-processing-delay, readiness-webhook-contrast-raw-body-001:diagnostic-playbook:flow-trigger, readiness-webhook-contrast-raw-body-001:knowledge-article:campaign-send-failures, readiness-webhook-contrast-raw-body-001:knowledge-article:event-tracking-debugging, readiness-webhook-contrast-raw-body-001:knowledge-article:profile-sync-issues, readiness-webhook-contrast-raw-body-001:knowledge-article:security-incident-response, readiness-webhook-contrast-raw-body-001:knowledge-article:shopify-integration-sync, readiness-webhook-contrast-raw-body-001:knowledge-article:sms-compliance, readiness-webhook-contrast-raw-body-001:knowledge-article:support-operations-playbook, readiness-webhook-contrast-raw-body-001:known-cause:shopify-custom-field-mapping, readiness-webhook-contrast-raw-body-001:known-cause:sms-quiet-hours, readiness-webhook-contrast-raw-body-001:known-cause:sms-stop-sync-delay, readiness-webhook-contrast-raw-body-001:known-cause:webhook-delivery-latency, readiness-flow-contrast-excluded-001:diagnostic-playbook:article-backed, readiness-flow-contrast-excluded-001:diagnostic-playbook:campaign-editor, readiness-flow-contrast-excluded-001:diagnostic-playbook:event-processing-delay, readiness-flow-contrast-excluded-001:knowledge-article:profile-sync-issues, readiness-flow-contrast-excluded-001:knowledge-article:segmentation-audience-rules, readiness-flow-contrast-excluded-001:knowledge-article:shopify-integration-sync, readiness-flow-contrast-excluded-001:knowledge-article:sms-compliance, readiness-flow-contrast-excluded-001:knowledge-article:support-operations-playbook, readiness-flow-contrast-excluded-001:knowledge-article:webhook-signature-validation, readiness-flow-contrast-excluded-001:known-cause:shopify-custom-field-mapping, readiness-flow-contrast-excluded-001:known-cause:sms-quiet-hours, readiness-flow-contrast-excluded-001:known-cause:sms-stop-sync-delay, readiness-flow-contrast-excluded-001:known-cause:track-api-local-time-timestamp, readiness-flow-contrast-excluded-001:known-cause:webhook-delivery-latency, readiness-editor-disagreement-001:diagnostic-playbook:article-backed, readiness-editor-disagreement-001:diagnostic-playbook:event-processing-delay, readiness-editor-disagreement-001:diagnostic-playbook:flow-trigger, readiness-editor-disagreement-001:knowledge-article:authentication, readiness-editor-disagreement-001:knowledge-article:campaign-send-failures, readiness-editor-disagreement-001:knowledge-article:event-tracking-debugging, readiness-editor-disagreement-001:knowledge-article:flow-trigger-troubleshooting, readiness-editor-disagreement-001:knowledge-article:profile-sync-issues, readiness-editor-disagreement-001:knowledge-article:shopify-integration-sync, readiness-editor-disagreement-001:knowledge-article:sms-compliance, readiness-editor-disagreement-001:knowledge-article:webhook-signature-validation, readiness-editor-disagreement-001:known-cause:shopify-custom-field-mapping, readiness-editor-disagreement-001:known-cause:sms-quiet-hours, readiness-editor-disagreement-001:known-cause:sms-stop-sync-delay, readiness-editor-disagreement-001:known-cause:track-api-local-time-timestamp, readiness-editor-disagreement-001:known-cause:webhook-secret-rotation, readiness-webhook-disagreement-001:diagnostic-playbook:campaign-editor, readiness-webhook-disagreement-001:diagnostic-playbook:event-processing-delay, readiness-webhook-disagreement-001:diagnostic-playbook:flow-trigger, readiness-webhook-disagreement-001:knowledge-article:api-reference, readiness-webhook-disagreement-001:knowledge-article:event-tracking-debugging, readiness-webhook-disagreement-001:knowledge-article:profile-sync-issues, readiness-webhook-disagreement-001:knowledge-article:shopify-integration-sync, readiness-webhook-disagreement-001:knowledge-article:sms-compliance, readiness-webhook-disagreement-001:knowledge-article:support-operations-playbook, readiness-webhook-disagreement-001:known-cause:shopify-custom-field-mapping, readiness-webhook-disagreement-001:known-cause:sms-quiet-hours, readiness-webhook-disagreement-001:known-cause:sms-stop-sync-delay, readiness-webhook-disagreement-001:known-cause:webhook-secret-rotation, readiness-flow-disagreement-001:diagnostic-playbook:article-backed, readiness-flow-disagreement-001:diagnostic-playbook:campaign-editor, readiness-flow-disagreement-001:diagnostic-playbook:event-processing-delay, readiness-flow-disagreement-001:knowledge-article:profile-sync-issues, readiness-flow-disagreement-001:knowledge-article:security-incident-response, readiness-flow-disagreement-001:knowledge-article:segmentation-audience-rules, readiness-flow-disagreement-001:knowledge-article:sms-compliance, readiness-flow-disagreement-001:knowledge-article:webhook-signature-validation, readiness-flow-disagreement-001:known-cause:sms-quiet-hours, readiness-flow-disagreement-001:known-cause:sms-stop-sync-delay, readiness-flow-disagreement-001:known-cause:track-api-local-time-timestamp, readiness-flow-disagreement-001:known-cause:webhook-delivery-latency, readiness-flow-disagreement-001:known-cause:webhook-secret-rotation, readiness-editor-insufficient-001:diagnostic-playbook:article-backed, readiness-editor-insufficient-001:diagnostic-playbook:event-processing-delay, readiness-editor-insufficient-001:diagnostic-playbook:flow-trigger, readiness-editor-insufficient-001:knowledge-article:account-access, readiness-editor-insufficient-001:knowledge-article:authentication, readiness-editor-insufficient-001:knowledge-article:coupon-catalog-sync, readiness-editor-insufficient-001:knowledge-article:event-tracking-debugging, readiness-editor-insufficient-001:knowledge-article:flow-trigger-troubleshooting, readiness-editor-insufficient-001:knowledge-article:shopify-integration-sync, readiness-editor-insufficient-001:knowledge-article:sms-compliance, readiness-editor-insufficient-001:knowledge-article:webhook-signature-validation, readiness-editor-insufficient-001:known-cause:shopify-custom-field-mapping, readiness-editor-insufficient-001:known-cause:sms-quiet-hours, readiness-editor-insufficient-001:known-cause:track-api-local-time-timestamp, readiness-editor-insufficient-001:known-cause:webhook-delivery-latency, readiness-editor-insufficient-001:known-cause:webhook-secret-rotation, readiness-webhook-insufficient-001:diagnostic-playbook:campaign-editor, readiness-webhook-insufficient-001:diagnostic-playbook:event-processing-delay, readiness-webhook-insufficient-001:diagnostic-playbook:flow-trigger, readiness-webhook-insufficient-001:knowledge-article:api-reference, readiness-webhook-insufficient-001:knowledge-article:performance-troubleshooting, readiness-webhook-insufficient-001:knowledge-article:profile-sync-issues, readiness-webhook-insufficient-001:knowledge-article:security-incident-response, readiness-webhook-insufficient-001:knowledge-article:shopify-integration-sync, readiness-webhook-insufficient-001:knowledge-article:sms-compliance, readiness-webhook-insufficient-001:knowledge-article:support-operations-playbook, readiness-webhook-insufficient-001:known-cause:shopify-custom-field-mapping, readiness-webhook-insufficient-001:known-cause:sms-quiet-hours, readiness-webhook-insufficient-001:known-cause:sms-stop-sync-delay, readiness-webhook-insufficient-001:known-cause:webhook-delivery-latency, readiness-webhook-insufficient-001:known-cause:webhook-secret-rotation, readiness-flow-insufficient-001:diagnostic-playbook:article-backed, readiness-flow-insufficient-001:diagnostic-playbook:campaign-editor, readiness-flow-insufficient-001:diagnostic-playbook:event-processing-delay, readiness-flow-insufficient-001:knowledge-article:api-reference, readiness-flow-insufficient-001:knowledge-article:profile-sync-issues, readiness-flow-insufficient-001:knowledge-article:segmentation-audience-rules, readiness-flow-insufficient-001:knowledge-article:shopify-integration-sync, readiness-flow-insufficient-001:knowledge-article:sms-compliance, readiness-flow-insufficient-001:knowledge-article:webhook-signature-validation, readiness-flow-insufficient-001:known-cause:shopify-custom-field-mapping, readiness-flow-insufficient-001:known-cause:sms-stop-sync-delay, readiness-flow-insufficient-001:known-cause:track-api-local-time-timestamp, readiness-flow-insufficient-001:known-cause:webhook-delivery-latency, readiness-flow-insufficient-001:known-cause:webhook-secret-rotation, readiness-editor-near-match-001:diagnostic-playbook:article-backed, readiness-editor-near-match-001:diagnostic-playbook:event-processing-delay, readiness-editor-near-match-001:diagnostic-playbook:flow-trigger, readiness-editor-near-match-001:knowledge-article:account-access, readiness-editor-near-match-001:knowledge-article:authentication, readiness-editor-near-match-001:knowledge-article:event-tracking-debugging, readiness-editor-near-match-001:knowledge-article:profile-sync-issues, readiness-editor-near-match-001:knowledge-article:security-incident-response, readiness-editor-near-match-001:knowledge-article:shopify-integration-sync, readiness-editor-near-match-001:knowledge-article:sms-compliance, readiness-editor-near-match-001:knowledge-article:support-operations-playbook, readiness-editor-near-match-001:knowledge-article:webhook-signature-validation, readiness-editor-near-match-001:known-cause:shopify-custom-field-mapping, readiness-editor-near-match-001:known-cause:sms-quiet-hours, readiness-editor-near-match-001:known-cause:sms-stop-sync-delay, readiness-editor-near-match-001:known-cause:track-api-local-time-timestamp, readiness-editor-near-match-001:known-cause:webhook-delivery-latency, readiness-webhook-near-match-001:diagnostic-playbook:campaign-editor, readiness-webhook-near-match-001:diagnostic-playbook:event-processing-delay, readiness-webhook-near-match-001:diagnostic-playbook:flow-trigger, readiness-webhook-near-match-001:knowledge-article:campaign-send-failures, readiness-webhook-near-match-001:knowledge-article:event-tracking-debugging, readiness-webhook-near-match-001:knowledge-article:flow-trigger-troubleshooting, readiness-webhook-near-match-001:knowledge-article:profile-sync-issues, readiness-webhook-near-match-001:knowledge-article:security-incident-response, readiness-webhook-near-match-001:knowledge-article:shopify-integration-sync, readiness-webhook-near-match-001:knowledge-article:sms-compliance, readiness-webhook-near-match-001:knowledge-article:support-operations-playbook, readiness-webhook-near-match-001:known-cause:shopify-custom-field-mapping, readiness-webhook-near-match-001:known-cause:sms-quiet-hours, readiness-webhook-near-match-001:known-cause:sms-stop-sync-delay, readiness-webhook-near-match-001:known-cause:track-api-local-time-timestamp, readiness-flow-near-match-001:diagnostic-playbook:article-backed, readiness-flow-near-match-001:diagnostic-playbook:campaign-editor, readiness-flow-near-match-001:diagnostic-playbook:event-processing-delay, readiness-flow-near-match-001:knowledge-article:performance-troubleshooting, readiness-flow-near-match-001:knowledge-article:profile-sync-issues, readiness-flow-near-match-001:knowledge-article:sms-compliance, readiness-flow-near-match-001:knowledge-article:support-operations-playbook, readiness-flow-near-match-001:knowledge-article:webhook-signature-validation, readiness-flow-near-match-001:known-cause:sms-quiet-hours, readiness-flow-near-match-001:known-cause:sms-stop-sync-delay, readiness-flow-near-match-001:known-cause:track-api-local-time-timestamp, readiness-flow-near-match-001:known-cause:webhook-delivery-latency, readiness-flow-near-match-001:known-cause:webhook-secret-rotation, readiness-editor-exact-no-code-001:diagnostic-playbook:article-backed, readiness-editor-exact-no-code-001:diagnostic-playbook:event-processing-delay, readiness-editor-exact-no-code-001:diagnostic-playbook:flow-trigger, readiness-editor-exact-no-code-001:knowledge-article:account-access, readiness-editor-exact-no-code-001:knowledge-article:authentication, readiness-editor-exact-no-code-001:knowledge-article:campaign-send-failures, readiness-editor-exact-no-code-001:knowledge-article:event-tracking-debugging, readiness-editor-exact-no-code-001:knowledge-article:profile-sync-issues, readiness-editor-exact-no-code-001:knowledge-article:security-incident-response, readiness-editor-exact-no-code-001:knowledge-article:shopify-integration-sync, readiness-editor-exact-no-code-001:knowledge-article:sms-compliance, readiness-editor-exact-no-code-001:knowledge-article:webhook-signature-validation, readiness-editor-exact-no-code-001:known-cause:shopify-custom-field-mapping, readiness-editor-exact-no-code-001:known-cause:sms-quiet-hours, readiness-editor-exact-no-code-001:known-cause:sms-stop-sync-delay, readiness-editor-exact-no-code-001:known-cause:track-api-local-time-timestamp, readiness-editor-exact-no-code-001:known-cause:webhook-secret-rotation, readiness-webhook-opaque-id-negative-001:diagnostic-playbook:campaign-editor, readiness-webhook-opaque-id-negative-001:diagnostic-playbook:event-processing-delay, readiness-webhook-opaque-id-negative-001:diagnostic-playbook:flow-trigger, readiness-webhook-opaque-id-negative-001:knowledge-article:campaign-send-failures, readiness-webhook-opaque-id-negative-001:knowledge-article:event-tracking-debugging, readiness-webhook-opaque-id-negative-001:knowledge-article:profile-sync-issues, readiness-webhook-opaque-id-negative-001:knowledge-article:security-incident-response, readiness-webhook-opaque-id-negative-001:knowledge-article:shopify-integration-sync, readiness-webhook-opaque-id-negative-001:knowledge-article:sms-compliance, readiness-webhook-opaque-id-negative-001:knowledge-article:support-operations-playbook, readiness-webhook-opaque-id-negative-001:known-cause:shopify-custom-field-mapping, readiness-webhook-opaque-id-negative-001:known-cause:sms-stop-sync-delay, readiness-webhook-opaque-id-negative-001:known-cause:track-api-local-time-timestamp, readiness-event-exact-accepted-missing-multi-store-001:diagnostic-playbook:article-backed, readiness-event-exact-accepted-missing-multi-store-001:diagnostic-playbook:campaign-editor, readiness-event-exact-accepted-missing-multi-store-001:diagnostic-playbook:flow-trigger, readiness-event-exact-accepted-missing-multi-store-001:knowledge-article:flow-trigger-troubleshooting, readiness-event-exact-accepted-missing-multi-store-001:knowledge-article:profile-sync-issues, readiness-event-exact-accepted-missing-multi-store-001:knowledge-article:segmentation-audience-rules, readiness-event-exact-accepted-missing-multi-store-001:knowledge-article:shopify-integration-sync, readiness-event-exact-accepted-missing-multi-store-001:knowledge-article:sms-compliance, readiness-event-exact-accepted-missing-multi-store-001:knowledge-article:support-operations-playbook, readiness-event-exact-accepted-missing-multi-store-001:knowledge-article:webhook-signature-validation, readiness-event-exact-accepted-missing-multi-store-001:known-cause:shopify-custom-field-mapping, readiness-event-exact-accepted-missing-multi-store-001:known-cause:sms-quiet-hours, readiness-event-exact-accepted-missing-multi-store-001:known-cause:sms-stop-sync-delay, readiness-event-exact-accepted-missing-multi-store-001:known-cause:track-api-local-time-timestamp, readiness-event-exact-accepted-missing-multi-store-001:known-cause:webhook-delivery-latency

## Approved contrast coverage

| Contrast family | Status | Scenarios | Tickets |
|---|---|---:|---|
| webhook rotation/latency | missing-counterpart | 0 | None |
| SMS quiet-hours/consent delay | missing-counterpart | 0 | None |
| Shopify mapping/general sync | missing-counterpart | 0 | None |
| editor session/platform loading | missing-counterpart | 0 | None |

## Resolved-case evaluation

- {"status":"corpus-gap","reviewedScenarioTickets":[],"eligibleCaseCount":0,"futureCasesExcluded":0,"selfTicketExclusion":"enforced at retrieval query time"}

## Corpus coverage

- {"knowledge-article":{"adequate":20,"uncertain":1},"known-cause":{"not-expected":15,"adequate":6},"diagnostic-playbook":{"adequate":21},"resolved-ticket":{"not-expected":21}}

## Unjudged hits

- Count: 309
- readiness-editor-exact-chunkload-001: diagnostic-playbook:article-backed
- readiness-editor-exact-chunkload-001: diagnostic-playbook:event-processing-delay
- readiness-editor-exact-chunkload-001: diagnostic-playbook:flow-trigger
- readiness-editor-exact-chunkload-001: knowledge-article:account-access
- readiness-editor-exact-chunkload-001: knowledge-article:authentication
- readiness-editor-exact-chunkload-001: knowledge-article:coupon-catalog-sync
- readiness-editor-exact-chunkload-001: knowledge-article:event-tracking-debugging
- readiness-editor-exact-chunkload-001: knowledge-article:shopify-integration-sync
- readiness-editor-exact-chunkload-001: knowledge-article:sms-compliance
- readiness-editor-exact-chunkload-001: knowledge-article:webhook-signature-validation
- readiness-editor-exact-chunkload-001: known-cause:shopify-custom-field-mapping
- readiness-editor-exact-chunkload-001: known-cause:sms-quiet-hours
- readiness-editor-exact-chunkload-001: known-cause:track-api-local-time-timestamp
- readiness-editor-exact-chunkload-001: known-cause:webhook-delivery-latency
- readiness-editor-exact-chunkload-001: known-cause:webhook-secret-rotation
- readiness-webhook-exact-rotation-001: diagnostic-playbook:campaign-editor
- readiness-webhook-exact-rotation-001: diagnostic-playbook:event-processing-delay
- readiness-webhook-exact-rotation-001: diagnostic-playbook:flow-trigger
- readiness-webhook-exact-rotation-001: knowledge-article:event-tracking-debugging
- readiness-webhook-exact-rotation-001: knowledge-article:flow-trigger-troubleshooting
- readiness-webhook-exact-rotation-001: knowledge-article:product-feedback
- readiness-webhook-exact-rotation-001: knowledge-article:shopify-integration-sync
- readiness-webhook-exact-rotation-001: knowledge-article:sms-compliance
- readiness-webhook-exact-rotation-001: knowledge-article:support-operations-playbook
- readiness-webhook-exact-rotation-001: known-cause:shopify-custom-field-mapping
- readiness-webhook-exact-rotation-001: known-cause:sms-quiet-hours
- readiness-webhook-exact-rotation-001: known-cause:track-api-local-time-timestamp
- readiness-webhook-exact-rotation-001: known-cause:webhook-delivery-latency
- readiness-flow-exact-viewed-product-001: diagnostic-playbook:article-backed
- readiness-flow-exact-viewed-product-001: diagnostic-playbook:campaign-editor
- readiness-flow-exact-viewed-product-001: diagnostic-playbook:event-processing-delay
- readiness-flow-exact-viewed-product-001: knowledge-article:campaign-send-failures
- readiness-flow-exact-viewed-product-001: knowledge-article:coupon-catalog-sync
- readiness-flow-exact-viewed-product-001: knowledge-article:event-tracking-debugging
- readiness-flow-exact-viewed-product-001: knowledge-article:profile-sync-issues
- readiness-flow-exact-viewed-product-001: knowledge-article:shopify-integration-sync
- readiness-flow-exact-viewed-product-001: knowledge-article:sms-compliance
- readiness-flow-exact-viewed-product-001: knowledge-article:support-operations-playbook
- readiness-flow-exact-viewed-product-001: knowledge-article:webhook-signature-validation
- readiness-flow-exact-viewed-product-001: known-cause:shopify-custom-field-mapping
- readiness-flow-exact-viewed-product-001: known-cause:sms-quiet-hours
- readiness-flow-exact-viewed-product-001: known-cause:sms-stop-sync-delay
- readiness-flow-exact-viewed-product-001: known-cause:webhook-delivery-latency
- readiness-flow-exact-viewed-product-001: known-cause:webhook-secret-rotation
- readiness-editor-paraphrase-screen-001: diagnostic-playbook:article-backed
- readiness-editor-paraphrase-screen-001: diagnostic-playbook:event-processing-delay
- readiness-editor-paraphrase-screen-001: diagnostic-playbook:flow-trigger
- readiness-editor-paraphrase-screen-001: knowledge-article:authentication
- readiness-editor-paraphrase-screen-001: knowledge-article:event-tracking-debugging
- readiness-editor-paraphrase-screen-001: knowledge-article:profile-sync-issues
- readiness-editor-paraphrase-screen-001: knowledge-article:shopify-integration-sync
- readiness-editor-paraphrase-screen-001: knowledge-article:sms-compliance
- readiness-editor-paraphrase-screen-001: knowledge-article:support-operations-playbook
- readiness-editor-paraphrase-screen-001: knowledge-article:webhook-signature-validation
- readiness-editor-paraphrase-screen-001: known-cause:shopify-custom-field-mapping
- readiness-editor-paraphrase-screen-001: known-cause:sms-quiet-hours
- readiness-editor-paraphrase-screen-001: known-cause:sms-stop-sync-delay
- readiness-editor-paraphrase-screen-001: known-cause:track-api-local-time-timestamp
- readiness-editor-paraphrase-screen-001: known-cause:webhook-delivery-latency
- readiness-webhook-paraphrase-late-001: diagnostic-playbook:campaign-editor
- readiness-webhook-paraphrase-late-001: diagnostic-playbook:event-processing-delay
- readiness-webhook-paraphrase-late-001: diagnostic-playbook:flow-trigger
- readiness-webhook-paraphrase-late-001: knowledge-article:event-tracking-debugging
- readiness-webhook-paraphrase-late-001: knowledge-article:profile-sync-issues
- readiness-webhook-paraphrase-late-001: knowledge-article:security-incident-response
- readiness-webhook-paraphrase-late-001: knowledge-article:shopify-integration-sync
- readiness-webhook-paraphrase-late-001: knowledge-article:sms-compliance
- readiness-webhook-paraphrase-late-001: knowledge-article:support-operations-playbook
- readiness-webhook-paraphrase-late-001: known-cause:shopify-custom-field-mapping
- readiness-webhook-paraphrase-late-001: known-cause:sms-stop-sync-delay
- readiness-webhook-paraphrase-late-001: known-cause:track-api-local-time-timestamp
- readiness-webhook-paraphrase-late-001: known-cause:webhook-secret-rotation
- readiness-flow-paraphrase-automation-001: diagnostic-playbook:article-backed
- readiness-flow-paraphrase-automation-001: diagnostic-playbook:campaign-editor
- readiness-flow-paraphrase-automation-001: diagnostic-playbook:event-processing-delay
- readiness-flow-paraphrase-automation-001: knowledge-article:api-reference
- readiness-flow-paraphrase-automation-001: knowledge-article:event-tracking-debugging
- readiness-flow-paraphrase-automation-001: knowledge-article:profile-sync-issues
- readiness-flow-paraphrase-automation-001: knowledge-article:shopify-integration-sync
- readiness-flow-paraphrase-automation-001: knowledge-article:sms-compliance
- readiness-flow-paraphrase-automation-001: knowledge-article:support-operations-playbook
- readiness-flow-paraphrase-automation-001: knowledge-article:webhook-signature-validation
- readiness-flow-paraphrase-automation-001: known-cause:shopify-custom-field-mapping
- readiness-flow-paraphrase-automation-001: known-cause:sms-stop-sync-delay
- readiness-flow-paraphrase-automation-001: known-cause:track-api-local-time-timestamp
- readiness-flow-paraphrase-automation-001: known-cause:webhook-delivery-latency
- readiness-flow-paraphrase-automation-001: known-cause:webhook-secret-rotation
- readiness-editor-contrast-private-001: diagnostic-playbook:article-backed
- readiness-editor-contrast-private-001: diagnostic-playbook:event-processing-delay
- readiness-editor-contrast-private-001: diagnostic-playbook:flow-trigger
- readiness-editor-contrast-private-001: knowledge-article:account-access
- readiness-editor-contrast-private-001: knowledge-article:authentication
- readiness-editor-contrast-private-001: knowledge-article:campaign-send-failures
- readiness-editor-contrast-private-001: knowledge-article:event-tracking-debugging
- readiness-editor-contrast-private-001: knowledge-article:profile-sync-issues
- readiness-editor-contrast-private-001: knowledge-article:shopify-integration-sync
- readiness-editor-contrast-private-001: knowledge-article:sms-compliance
- readiness-editor-contrast-private-001: knowledge-article:support-operations-playbook
- readiness-editor-contrast-private-001: knowledge-article:webhook-signature-validation
- readiness-editor-contrast-private-001: known-cause:shopify-custom-field-mapping
- readiness-editor-contrast-private-001: known-cause:sms-quiet-hours
- readiness-editor-contrast-private-001: known-cause:sms-stop-sync-delay
- readiness-editor-contrast-private-001: known-cause:track-api-local-time-timestamp
- readiness-editor-contrast-private-001: known-cause:webhook-delivery-latency
- readiness-webhook-contrast-raw-body-001: diagnostic-playbook:campaign-editor
- readiness-webhook-contrast-raw-body-001: diagnostic-playbook:event-processing-delay
- readiness-webhook-contrast-raw-body-001: diagnostic-playbook:flow-trigger
- readiness-webhook-contrast-raw-body-001: knowledge-article:campaign-send-failures
- readiness-webhook-contrast-raw-body-001: knowledge-article:event-tracking-debugging
- readiness-webhook-contrast-raw-body-001: knowledge-article:profile-sync-issues
- readiness-webhook-contrast-raw-body-001: knowledge-article:security-incident-response
- readiness-webhook-contrast-raw-body-001: knowledge-article:shopify-integration-sync
- readiness-webhook-contrast-raw-body-001: knowledge-article:sms-compliance
- readiness-webhook-contrast-raw-body-001: knowledge-article:support-operations-playbook
- readiness-webhook-contrast-raw-body-001: known-cause:shopify-custom-field-mapping
- readiness-webhook-contrast-raw-body-001: known-cause:sms-quiet-hours
- readiness-webhook-contrast-raw-body-001: known-cause:sms-stop-sync-delay
- readiness-webhook-contrast-raw-body-001: known-cause:webhook-delivery-latency
- readiness-flow-contrast-excluded-001: diagnostic-playbook:article-backed
- readiness-flow-contrast-excluded-001: diagnostic-playbook:campaign-editor
- readiness-flow-contrast-excluded-001: diagnostic-playbook:event-processing-delay
- readiness-flow-contrast-excluded-001: knowledge-article:profile-sync-issues
- readiness-flow-contrast-excluded-001: knowledge-article:segmentation-audience-rules
- readiness-flow-contrast-excluded-001: knowledge-article:shopify-integration-sync
- readiness-flow-contrast-excluded-001: knowledge-article:sms-compliance
- readiness-flow-contrast-excluded-001: knowledge-article:support-operations-playbook
- readiness-flow-contrast-excluded-001: knowledge-article:webhook-signature-validation
- readiness-flow-contrast-excluded-001: known-cause:shopify-custom-field-mapping
- readiness-flow-contrast-excluded-001: known-cause:sms-quiet-hours
- readiness-flow-contrast-excluded-001: known-cause:sms-stop-sync-delay
- readiness-flow-contrast-excluded-001: known-cause:track-api-local-time-timestamp
- readiness-flow-contrast-excluded-001: known-cause:webhook-delivery-latency
- readiness-editor-disagreement-001: diagnostic-playbook:article-backed
- readiness-editor-disagreement-001: diagnostic-playbook:event-processing-delay
- readiness-editor-disagreement-001: diagnostic-playbook:flow-trigger
- readiness-editor-disagreement-001: knowledge-article:authentication
- readiness-editor-disagreement-001: knowledge-article:campaign-send-failures
- readiness-editor-disagreement-001: knowledge-article:event-tracking-debugging
- readiness-editor-disagreement-001: knowledge-article:flow-trigger-troubleshooting
- readiness-editor-disagreement-001: knowledge-article:profile-sync-issues
- readiness-editor-disagreement-001: knowledge-article:shopify-integration-sync
- readiness-editor-disagreement-001: knowledge-article:sms-compliance
- readiness-editor-disagreement-001: knowledge-article:webhook-signature-validation
- readiness-editor-disagreement-001: known-cause:shopify-custom-field-mapping
- readiness-editor-disagreement-001: known-cause:sms-quiet-hours
- readiness-editor-disagreement-001: known-cause:sms-stop-sync-delay
- readiness-editor-disagreement-001: known-cause:track-api-local-time-timestamp
- readiness-editor-disagreement-001: known-cause:webhook-secret-rotation
- readiness-webhook-disagreement-001: diagnostic-playbook:campaign-editor
- readiness-webhook-disagreement-001: diagnostic-playbook:event-processing-delay
- readiness-webhook-disagreement-001: diagnostic-playbook:flow-trigger
- readiness-webhook-disagreement-001: knowledge-article:api-reference
- readiness-webhook-disagreement-001: knowledge-article:event-tracking-debugging
- readiness-webhook-disagreement-001: knowledge-article:profile-sync-issues
- readiness-webhook-disagreement-001: knowledge-article:shopify-integration-sync
- readiness-webhook-disagreement-001: knowledge-article:sms-compliance
- readiness-webhook-disagreement-001: knowledge-article:support-operations-playbook
- readiness-webhook-disagreement-001: known-cause:shopify-custom-field-mapping
- readiness-webhook-disagreement-001: known-cause:sms-quiet-hours
- readiness-webhook-disagreement-001: known-cause:sms-stop-sync-delay
- readiness-webhook-disagreement-001: known-cause:webhook-secret-rotation
- readiness-flow-disagreement-001: diagnostic-playbook:article-backed
- readiness-flow-disagreement-001: diagnostic-playbook:campaign-editor
- readiness-flow-disagreement-001: diagnostic-playbook:event-processing-delay
- readiness-flow-disagreement-001: knowledge-article:profile-sync-issues
- readiness-flow-disagreement-001: knowledge-article:security-incident-response
- readiness-flow-disagreement-001: knowledge-article:segmentation-audience-rules
- readiness-flow-disagreement-001: knowledge-article:sms-compliance
- readiness-flow-disagreement-001: knowledge-article:webhook-signature-validation
- readiness-flow-disagreement-001: known-cause:sms-quiet-hours
- readiness-flow-disagreement-001: known-cause:sms-stop-sync-delay
- readiness-flow-disagreement-001: known-cause:track-api-local-time-timestamp
- readiness-flow-disagreement-001: known-cause:webhook-delivery-latency
- readiness-flow-disagreement-001: known-cause:webhook-secret-rotation
- readiness-editor-insufficient-001: diagnostic-playbook:article-backed
- readiness-editor-insufficient-001: diagnostic-playbook:event-processing-delay
- readiness-editor-insufficient-001: diagnostic-playbook:flow-trigger
- readiness-editor-insufficient-001: knowledge-article:account-access
- readiness-editor-insufficient-001: knowledge-article:authentication
- readiness-editor-insufficient-001: knowledge-article:coupon-catalog-sync
- readiness-editor-insufficient-001: knowledge-article:event-tracking-debugging
- readiness-editor-insufficient-001: knowledge-article:flow-trigger-troubleshooting
- readiness-editor-insufficient-001: knowledge-article:shopify-integration-sync
- readiness-editor-insufficient-001: knowledge-article:sms-compliance
- readiness-editor-insufficient-001: knowledge-article:webhook-signature-validation
- readiness-editor-insufficient-001: known-cause:shopify-custom-field-mapping
- readiness-editor-insufficient-001: known-cause:sms-quiet-hours
- readiness-editor-insufficient-001: known-cause:track-api-local-time-timestamp
- readiness-editor-insufficient-001: known-cause:webhook-delivery-latency
- readiness-editor-insufficient-001: known-cause:webhook-secret-rotation
- readiness-webhook-insufficient-001: diagnostic-playbook:campaign-editor
- readiness-webhook-insufficient-001: diagnostic-playbook:event-processing-delay
- readiness-webhook-insufficient-001: diagnostic-playbook:flow-trigger
- readiness-webhook-insufficient-001: knowledge-article:api-reference
- readiness-webhook-insufficient-001: knowledge-article:performance-troubleshooting
- readiness-webhook-insufficient-001: knowledge-article:profile-sync-issues
- readiness-webhook-insufficient-001: knowledge-article:security-incident-response
- readiness-webhook-insufficient-001: knowledge-article:shopify-integration-sync
- readiness-webhook-insufficient-001: knowledge-article:sms-compliance
- readiness-webhook-insufficient-001: knowledge-article:support-operations-playbook
- readiness-webhook-insufficient-001: known-cause:shopify-custom-field-mapping
- readiness-webhook-insufficient-001: known-cause:sms-quiet-hours
- readiness-webhook-insufficient-001: known-cause:sms-stop-sync-delay
- readiness-webhook-insufficient-001: known-cause:webhook-delivery-latency
- readiness-webhook-insufficient-001: known-cause:webhook-secret-rotation
- readiness-flow-insufficient-001: diagnostic-playbook:article-backed
- readiness-flow-insufficient-001: diagnostic-playbook:campaign-editor
- readiness-flow-insufficient-001: diagnostic-playbook:event-processing-delay
- readiness-flow-insufficient-001: knowledge-article:api-reference
- readiness-flow-insufficient-001: knowledge-article:profile-sync-issues
- readiness-flow-insufficient-001: knowledge-article:segmentation-audience-rules
- readiness-flow-insufficient-001: knowledge-article:shopify-integration-sync
- readiness-flow-insufficient-001: knowledge-article:sms-compliance
- readiness-flow-insufficient-001: knowledge-article:webhook-signature-validation
- readiness-flow-insufficient-001: known-cause:shopify-custom-field-mapping
- readiness-flow-insufficient-001: known-cause:sms-stop-sync-delay
- readiness-flow-insufficient-001: known-cause:track-api-local-time-timestamp
- readiness-flow-insufficient-001: known-cause:webhook-delivery-latency
- readiness-flow-insufficient-001: known-cause:webhook-secret-rotation
- readiness-editor-near-match-001: diagnostic-playbook:article-backed
- readiness-editor-near-match-001: diagnostic-playbook:event-processing-delay
- readiness-editor-near-match-001: diagnostic-playbook:flow-trigger
- readiness-editor-near-match-001: knowledge-article:account-access
- readiness-editor-near-match-001: knowledge-article:authentication
- readiness-editor-near-match-001: knowledge-article:event-tracking-debugging
- readiness-editor-near-match-001: knowledge-article:profile-sync-issues
- readiness-editor-near-match-001: knowledge-article:security-incident-response
- readiness-editor-near-match-001: knowledge-article:shopify-integration-sync
- readiness-editor-near-match-001: knowledge-article:sms-compliance
- readiness-editor-near-match-001: knowledge-article:support-operations-playbook
- readiness-editor-near-match-001: knowledge-article:webhook-signature-validation
- readiness-editor-near-match-001: known-cause:shopify-custom-field-mapping
- readiness-editor-near-match-001: known-cause:sms-quiet-hours
- readiness-editor-near-match-001: known-cause:sms-stop-sync-delay
- readiness-editor-near-match-001: known-cause:track-api-local-time-timestamp
- readiness-editor-near-match-001: known-cause:webhook-delivery-latency
- readiness-webhook-near-match-001: diagnostic-playbook:campaign-editor
- readiness-webhook-near-match-001: diagnostic-playbook:event-processing-delay
- readiness-webhook-near-match-001: diagnostic-playbook:flow-trigger
- readiness-webhook-near-match-001: knowledge-article:campaign-send-failures
- readiness-webhook-near-match-001: knowledge-article:event-tracking-debugging
- readiness-webhook-near-match-001: knowledge-article:flow-trigger-troubleshooting
- readiness-webhook-near-match-001: knowledge-article:profile-sync-issues
- readiness-webhook-near-match-001: knowledge-article:security-incident-response
- readiness-webhook-near-match-001: knowledge-article:shopify-integration-sync
- readiness-webhook-near-match-001: knowledge-article:sms-compliance
- readiness-webhook-near-match-001: knowledge-article:support-operations-playbook
- readiness-webhook-near-match-001: known-cause:shopify-custom-field-mapping
- readiness-webhook-near-match-001: known-cause:sms-quiet-hours
- readiness-webhook-near-match-001: known-cause:sms-stop-sync-delay
- readiness-webhook-near-match-001: known-cause:track-api-local-time-timestamp
- readiness-flow-near-match-001: diagnostic-playbook:article-backed
- readiness-flow-near-match-001: diagnostic-playbook:campaign-editor
- readiness-flow-near-match-001: diagnostic-playbook:event-processing-delay
- readiness-flow-near-match-001: knowledge-article:performance-troubleshooting
- readiness-flow-near-match-001: knowledge-article:profile-sync-issues
- readiness-flow-near-match-001: knowledge-article:sms-compliance
- readiness-flow-near-match-001: knowledge-article:support-operations-playbook
- readiness-flow-near-match-001: knowledge-article:webhook-signature-validation
- readiness-flow-near-match-001: known-cause:sms-quiet-hours
- readiness-flow-near-match-001: known-cause:sms-stop-sync-delay
- readiness-flow-near-match-001: known-cause:track-api-local-time-timestamp
- readiness-flow-near-match-001: known-cause:webhook-delivery-latency
- readiness-flow-near-match-001: known-cause:webhook-secret-rotation
- readiness-editor-exact-no-code-001: diagnostic-playbook:article-backed
- readiness-editor-exact-no-code-001: diagnostic-playbook:event-processing-delay
- readiness-editor-exact-no-code-001: diagnostic-playbook:flow-trigger
- readiness-editor-exact-no-code-001: knowledge-article:account-access
- readiness-editor-exact-no-code-001: knowledge-article:authentication
- readiness-editor-exact-no-code-001: knowledge-article:campaign-send-failures
- readiness-editor-exact-no-code-001: knowledge-article:event-tracking-debugging
- readiness-editor-exact-no-code-001: knowledge-article:profile-sync-issues
- readiness-editor-exact-no-code-001: knowledge-article:security-incident-response
- readiness-editor-exact-no-code-001: knowledge-article:shopify-integration-sync
- readiness-editor-exact-no-code-001: knowledge-article:sms-compliance
- readiness-editor-exact-no-code-001: knowledge-article:webhook-signature-validation
- readiness-editor-exact-no-code-001: known-cause:shopify-custom-field-mapping
- readiness-editor-exact-no-code-001: known-cause:sms-quiet-hours
- readiness-editor-exact-no-code-001: known-cause:sms-stop-sync-delay
- readiness-editor-exact-no-code-001: known-cause:track-api-local-time-timestamp
- readiness-editor-exact-no-code-001: known-cause:webhook-secret-rotation
- readiness-webhook-opaque-id-negative-001: diagnostic-playbook:campaign-editor
- readiness-webhook-opaque-id-negative-001: diagnostic-playbook:event-processing-delay
- readiness-webhook-opaque-id-negative-001: diagnostic-playbook:flow-trigger
- readiness-webhook-opaque-id-negative-001: knowledge-article:campaign-send-failures
- readiness-webhook-opaque-id-negative-001: knowledge-article:event-tracking-debugging
- readiness-webhook-opaque-id-negative-001: knowledge-article:profile-sync-issues
- readiness-webhook-opaque-id-negative-001: knowledge-article:security-incident-response
- readiness-webhook-opaque-id-negative-001: knowledge-article:shopify-integration-sync
- readiness-webhook-opaque-id-negative-001: knowledge-article:sms-compliance
- readiness-webhook-opaque-id-negative-001: knowledge-article:support-operations-playbook
- readiness-webhook-opaque-id-negative-001: known-cause:shopify-custom-field-mapping
- readiness-webhook-opaque-id-negative-001: known-cause:sms-stop-sync-delay
- readiness-webhook-opaque-id-negative-001: known-cause:track-api-local-time-timestamp
- readiness-event-exact-accepted-missing-multi-store-001: diagnostic-playbook:article-backed
- readiness-event-exact-accepted-missing-multi-store-001: diagnostic-playbook:campaign-editor
- readiness-event-exact-accepted-missing-multi-store-001: diagnostic-playbook:flow-trigger
- readiness-event-exact-accepted-missing-multi-store-001: knowledge-article:flow-trigger-troubleshooting
- readiness-event-exact-accepted-missing-multi-store-001: knowledge-article:profile-sync-issues
- readiness-event-exact-accepted-missing-multi-store-001: knowledge-article:segmentation-audience-rules
- readiness-event-exact-accepted-missing-multi-store-001: knowledge-article:shopify-integration-sync
- readiness-event-exact-accepted-missing-multi-store-001: knowledge-article:sms-compliance
- readiness-event-exact-accepted-missing-multi-store-001: knowledge-article:support-operations-playbook
- readiness-event-exact-accepted-missing-multi-store-001: knowledge-article:webhook-signature-validation
- readiness-event-exact-accepted-missing-multi-store-001: known-cause:shopify-custom-field-mapping
- readiness-event-exact-accepted-missing-multi-store-001: known-cause:sms-quiet-hours
- readiness-event-exact-accepted-missing-multi-store-001: known-cause:sms-stop-sync-delay
- readiness-event-exact-accepted-missing-multi-store-001: known-cause:track-api-local-time-timestamp
- readiness-event-exact-accepted-missing-multi-store-001: known-cause:webhook-delivery-latency

## Reviewed contrast families


## Notes

## Section evidence

- {"lexical":{"judged":47,"supportingBestMatch":37,"wrongBestSection":10,"supportingBestMatchRate":0.7872340425531915,"lowerSupportingMatch":10,"anySupportingMatch":47,"excluded":{"resource-missing":68,"channel-unavailable":0,"unjudged-section":247}},"semantic":{"judged":0,"supportingBestMatch":0,"wrongBestSection":0,"supportingBestMatchRate":null,"lowerSupportingMatch":0,"anySupportingMatch":0,"excluded":{"resource-missing":0,"channel-unavailable":362,"unjudged-section":0}}}

Supporting best matches and lower supporting matches are counted separately. Missing resources, unavailable channels and unjudged sections are excluded from judged denominators.

| Case | Resource | Channel | Status | Best representation | Supporting match present |
|---|---|---|---|---|---|
| readiness-editor-exact-chunkload-001 | knowledge-article:performance-troubleshooting | lexical | right-article-wrong-best-section | knowledge-article:performance-troubleshooting:section:1 | true |
| readiness-editor-exact-chunkload-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:campaign-editor | lexical | supporting-best-match | diagnostic-playbook:campaign-editor:canonical:0 | true |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-editor-exact-chunkload-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:account-access | lexical | unjudged-section | knowledge-article:account-access:section:0 | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:account-access | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:authentication | lexical | unjudged-section | knowledge-article:authentication:section:0 | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:authentication | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:coupon-catalog-sync | lexical | unjudged-section | knowledge-article:coupon-catalog-sync:section:0 | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:coupon-catalog-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:3 | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-editor-exact-chunkload-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-editor-exact-chunkload-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:webhook-signature-validation | lexical | right-article-wrong-best-section | knowledge-article:webhook-signature-validation:section:0 | true |
| readiness-webhook-exact-rotation-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:article-backed | lexical | supporting-best-match | diagnostic-playbook:article-backed:canonical:0 | true |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:webhook-secret-rotation | lexical | supporting-best-match | known-cause:webhook-secret-rotation:canonical:0 | true |
| readiness-webhook-exact-rotation-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-webhook-exact-rotation-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:3 | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | unjudged-section | knowledge-article:flow-trigger-troubleshooting:section:4 | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:product-feedback | lexical | unjudged-section | knowledge-article:product-feedback:section:0 | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:product-feedback | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:2 | n/a |
| readiness-webhook-exact-rotation-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-webhook-exact-rotation-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:flow-trigger-troubleshooting | lexical | supporting-best-match | knowledge-article:flow-trigger-troubleshooting:section:1 | true |
| readiness-flow-exact-viewed-product-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:flow-trigger | lexical | supporting-best-match | diagnostic-playbook:flow-trigger:canonical:0 | true |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-flow-exact-viewed-product-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:campaign-send-failures | lexical | unjudged-section | knowledge-article:campaign-send-failures:section:0 | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:campaign-send-failures | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:coupon-catalog-sync | lexical | unjudged-section | knowledge-article:coupon-catalog-sync:section:0 | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:coupon-catalog-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:2 | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:1 | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-flow-exact-viewed-product-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:performance-troubleshooting | lexical | right-article-wrong-best-section | knowledge-article:performance-troubleshooting:section:2 | true |
| readiness-editor-paraphrase-screen-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:campaign-editor | lexical | supporting-best-match | diagnostic-playbook:campaign-editor:canonical:0 | true |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-editor-paraphrase-screen-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:authentication | lexical | unjudged-section | knowledge-article:authentication:section:0 | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:authentication | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:2 | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:4 | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:webhook-signature-validation | lexical | unjudged-section | knowledge-article:webhook-signature-validation:section:2 | n/a |
| readiness-editor-paraphrase-screen-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-editor-paraphrase-screen-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:webhook-signature-validation | lexical | supporting-best-match | knowledge-article:webhook-signature-validation:section:3 | true |
| readiness-webhook-paraphrase-late-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:article-backed | lexical | supporting-best-match | diagnostic-playbook:article-backed:canonical:0 | true |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:webhook-delivery-latency | lexical | supporting-best-match | known-cause:webhook-delivery-latency:canonical:0 | true |
| readiness-webhook-paraphrase-late-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-webhook-paraphrase-late-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:3 | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:security-incident-response | lexical | unjudged-section | knowledge-article:security-incident-response:section:0 | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:security-incident-response | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:sms-compliance | lexical | unjudged-section | knowledge-article:sms-compliance:section:0 | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:3 | n/a |
| readiness-webhook-paraphrase-late-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-webhook-paraphrase-late-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:flow-trigger-troubleshooting | lexical | right-article-wrong-best-section | knowledge-article:flow-trigger-troubleshooting:section:0 | true |
| readiness-flow-paraphrase-automation-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:flow-trigger | lexical | supporting-best-match | diagnostic-playbook:flow-trigger:canonical:0 | true |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-flow-paraphrase-automation-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:api-reference | lexical | unjudged-section | knowledge-article:api-reference:section:0 | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:api-reference | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:0 | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:0 | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:webhook-signature-validation | lexical | unjudged-section | knowledge-article:webhook-signature-validation:section:3 | n/a |
| readiness-flow-paraphrase-automation-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-flow-paraphrase-automation-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:performance-troubleshooting | lexical | supporting-best-match | knowledge-article:performance-troubleshooting:section:2 | true |
| readiness-editor-contrast-private-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | diagnostic-playbook:campaign-editor | lexical | supporting-best-match | diagnostic-playbook:campaign-editor:canonical:0 | true |
| readiness-editor-contrast-private-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-editor-contrast-private-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-editor-contrast-private-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-editor-contrast-private-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:account-access | lexical | unjudged-section | knowledge-article:account-access:section:0 | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:account-access | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:authentication | lexical | unjudged-section | knowledge-article:authentication:section:0 | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:authentication | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:campaign-send-failures | lexical | unjudged-section | knowledge-article:campaign-send-failures:section:0 | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:campaign-send-failures | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:event-tracking-debugging | lexical | resource-missing | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:1 | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-editor-contrast-private-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-editor-contrast-private-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-editor-contrast-private-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-editor-contrast-private-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-editor-contrast-private-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-contrast-private-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-editor-contrast-private-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:webhook-signature-validation | lexical | supporting-best-match | knowledge-article:webhook-signature-validation:section:2 | true |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:article-backed | lexical | supporting-best-match | diagnostic-playbook:article-backed:canonical:0 | true |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:campaign-send-failures | lexical | unjudged-section | knowledge-article:campaign-send-failures:section:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:campaign-send-failures | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:4 | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:security-incident-response | lexical | unjudged-section | knowledge-article:security-incident-response:section:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:security-incident-response | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:2 | n/a |
| readiness-webhook-contrast-raw-body-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-webhook-contrast-raw-body-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:flow-trigger-troubleshooting | lexical | supporting-best-match | knowledge-article:flow-trigger-troubleshooting:section:2 | true |
| readiness-flow-contrast-excluded-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:event-tracking-debugging | lexical | supporting-best-match | knowledge-article:event-tracking-debugging:section:2 | true |
| readiness-flow-contrast-excluded-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:flow-trigger | lexical | supporting-best-match | diagnostic-playbook:flow-trigger:canonical:0 | true |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-flow-contrast-excluded-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:profile-sync-issues | lexical | unjudged-section | knowledge-article:profile-sync-issues:section:0 | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:segmentation-audience-rules | lexical | unjudged-section | knowledge-article:segmentation-audience-rules:section:0 | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:segmentation-audience-rules | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:1 | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-flow-contrast-excluded-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-flow-contrast-excluded-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:performance-troubleshooting | lexical | supporting-best-match | knowledge-article:performance-troubleshooting:section:1 | true |
| readiness-editor-disagreement-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | diagnostic-playbook:campaign-editor | lexical | supporting-best-match | diagnostic-playbook:campaign-editor:canonical:0 | true |
| readiness-editor-disagreement-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-editor-disagreement-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-editor-disagreement-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-editor-disagreement-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:authentication | lexical | unjudged-section | knowledge-article:authentication:section:0 | n/a |
| readiness-editor-disagreement-001 | knowledge-article:authentication | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:campaign-send-failures | lexical | unjudged-section | knowledge-article:campaign-send-failures:section:0 | n/a |
| readiness-editor-disagreement-001 | knowledge-article:campaign-send-failures | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:3 | n/a |
| readiness-editor-disagreement-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | unjudged-section | knowledge-article:flow-trigger-troubleshooting:section:3 | n/a |
| readiness-editor-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-editor-disagreement-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-editor-disagreement-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-editor-disagreement-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-editor-disagreement-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-editor-disagreement-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-disagreement-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-editor-disagreement-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | supporting-best-match | knowledge-article:webhook-signature-validation:section:3 | true |
| readiness-webhook-disagreement-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | diagnostic-playbook:article-backed | lexical | supporting-best-match | diagnostic-playbook:article-backed:canonical:0 | true |
| readiness-webhook-disagreement-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | known-cause:webhook-delivery-latency | lexical | supporting-best-match | known-cause:webhook-delivery-latency:canonical:0 | true |
| readiness-webhook-disagreement-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-webhook-disagreement-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-webhook-disagreement-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-webhook-disagreement-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:api-reference | lexical | unjudged-section | knowledge-article:api-reference:section:0 | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:api-reference | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:2 | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:sms-compliance | lexical | unjudged-section | knowledge-article:sms-compliance:section:0 | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:3 | n/a |
| readiness-webhook-disagreement-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-webhook-disagreement-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-webhook-disagreement-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-webhook-disagreement-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-disagreement-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-webhook-disagreement-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:event-tracking-debugging | lexical | supporting-best-match | knowledge-article:event-tracking-debugging:section:2 | true |
| readiness-flow-disagreement-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | lexical | supporting-best-match | knowledge-article:flow-trigger-troubleshooting:section:3 | true |
| readiness-flow-disagreement-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | diagnostic-playbook:flow-trigger | lexical | supporting-best-match | diagnostic-playbook:flow-trigger:canonical:0 | true |
| readiness-flow-disagreement-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-flow-disagreement-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-flow-disagreement-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-flow-disagreement-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:security-incident-response | lexical | unjudged-section | knowledge-article:security-incident-response:section:0 | n/a |
| readiness-flow-disagreement-001 | knowledge-article:security-incident-response | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:segmentation-audience-rules | lexical | unjudged-section | knowledge-article:segmentation-audience-rules:section:0 | n/a |
| readiness-flow-disagreement-001 | knowledge-article:segmentation-audience-rules | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | knowledge-article:webhook-signature-validation | lexical | unjudged-section | knowledge-article:webhook-signature-validation:section:3 | n/a |
| readiness-flow-disagreement-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-flow-disagreement-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-flow-disagreement-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-flow-disagreement-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-flow-disagreement-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-disagreement-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-flow-disagreement-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | supporting-best-match | knowledge-article:performance-troubleshooting:section:1 | true |
| readiness-editor-insufficient-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | diagnostic-playbook:campaign-editor | lexical | supporting-best-match | diagnostic-playbook:campaign-editor:canonical:0 | true |
| readiness-editor-insufficient-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-editor-insufficient-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-editor-insufficient-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-editor-insufficient-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:account-access | lexical | unjudged-section | knowledge-article:account-access:section:0 | n/a |
| readiness-editor-insufficient-001 | knowledge-article:account-access | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:authentication | lexical | unjudged-section | knowledge-article:authentication:section:0 | n/a |
| readiness-editor-insufficient-001 | knowledge-article:authentication | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:coupon-catalog-sync | lexical | unjudged-section | knowledge-article:coupon-catalog-sync:section:0 | n/a |
| readiness-editor-insufficient-001 | knowledge-article:coupon-catalog-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:event-tracking-debugging | lexical | resource-missing | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | unjudged-section | knowledge-article:flow-trigger-troubleshooting:section:3 | n/a |
| readiness-editor-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-editor-insufficient-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-editor-insufficient-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-editor-insufficient-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-editor-insufficient-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-editor-insufficient-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-insufficient-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-editor-insufficient-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:webhook-signature-validation | lexical | right-article-wrong-best-section | knowledge-article:webhook-signature-validation:section:0 | true |
| readiness-webhook-insufficient-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | diagnostic-playbook:article-backed | lexical | supporting-best-match | diagnostic-playbook:article-backed:canonical:0 | true |
| readiness-webhook-insufficient-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-webhook-insufficient-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-webhook-insufficient-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-webhook-insufficient-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:api-reference | lexical | unjudged-section | knowledge-article:api-reference:section:0 | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:api-reference | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:performance-troubleshooting | lexical | unjudged-section | knowledge-article:performance-troubleshooting:section:4 | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:security-incident-response | lexical | unjudged-section | knowledge-article:security-incident-response:section:0 | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:security-incident-response | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:3 | n/a |
| readiness-webhook-insufficient-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-webhook-insufficient-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-webhook-insufficient-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-webhook-insufficient-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-webhook-insufficient-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-insufficient-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-webhook-insufficient-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | lexical | right-article-wrong-best-section | knowledge-article:flow-trigger-troubleshooting:section:2 | true |
| readiness-flow-insufficient-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:event-tracking-debugging | lexical | right-article-wrong-best-section | knowledge-article:event-tracking-debugging:section:4 | true |
| readiness-flow-insufficient-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | diagnostic-playbook:flow-trigger | lexical | supporting-best-match | diagnostic-playbook:flow-trigger:canonical:0 | true |
| readiness-flow-insufficient-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-flow-insufficient-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-flow-insufficient-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-flow-insufficient-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:api-reference | lexical | unjudged-section | knowledge-article:api-reference:section:0 | n/a |
| readiness-flow-insufficient-001 | knowledge-article:api-reference | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:segmentation-audience-rules | lexical | unjudged-section | knowledge-article:segmentation-audience-rules:section:0 | n/a |
| readiness-flow-insufficient-001 | knowledge-article:segmentation-audience-rules | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:sms-compliance | lexical | unjudged-section | knowledge-article:sms-compliance:section:0 | n/a |
| readiness-flow-insufficient-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-flow-insufficient-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-flow-insufficient-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-flow-insufficient-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-flow-insufficient-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-flow-insufficient-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-insufficient-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-flow-insufficient-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:performance-troubleshooting | lexical | supporting-best-match | knowledge-article:performance-troubleshooting:section:2 | true |
| readiness-editor-near-match-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | diagnostic-playbook:campaign-editor | lexical | supporting-best-match | diagnostic-playbook:campaign-editor:canonical:0 | true |
| readiness-editor-near-match-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-editor-near-match-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-editor-near-match-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-editor-near-match-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:account-access | lexical | unjudged-section | knowledge-article:account-access:section:0 | n/a |
| readiness-editor-near-match-001 | knowledge-article:account-access | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:authentication | lexical | unjudged-section | knowledge-article:authentication:section:0 | n/a |
| readiness-editor-near-match-001 | knowledge-article:authentication | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:event-tracking-debugging | lexical | resource-missing | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:security-incident-response | lexical | unjudged-section | knowledge-article:security-incident-response:section:0 | n/a |
| readiness-editor-near-match-001 | knowledge-article:security-incident-response | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:1 | n/a |
| readiness-editor-near-match-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-editor-near-match-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-editor-near-match-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-editor-near-match-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-editor-near-match-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-editor-near-match-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-near-match-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-editor-near-match-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:webhook-signature-validation | lexical | right-article-wrong-best-section | knowledge-article:webhook-signature-validation:section:1 | true |
| readiness-webhook-near-match-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | diagnostic-playbook:article-backed | lexical | supporting-best-match | diagnostic-playbook:article-backed:canonical:0 | true |
| readiness-webhook-near-match-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-webhook-near-match-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-webhook-near-match-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-webhook-near-match-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:campaign-send-failures | lexical | unjudged-section | knowledge-article:campaign-send-failures:section:0 | n/a |
| readiness-webhook-near-match-001 | knowledge-article:campaign-send-failures | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:event-tracking-debugging | lexical | resource-missing | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | unjudged-section | knowledge-article:flow-trigger-troubleshooting:section:0 | n/a |
| readiness-webhook-near-match-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:security-incident-response | lexical | unjudged-section | knowledge-article:security-incident-response:section:0 | n/a |
| readiness-webhook-near-match-001 | knowledge-article:security-incident-response | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:4 | n/a |
| readiness-webhook-near-match-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-webhook-near-match-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-webhook-near-match-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-webhook-near-match-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-webhook-near-match-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-near-match-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-webhook-near-match-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:event-tracking-debugging | lexical | right-article-wrong-best-section | knowledge-article:event-tracking-debugging:section:4 | true |
| readiness-flow-near-match-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:flow-trigger-troubleshooting | lexical | supporting-best-match | knowledge-article:flow-trigger-troubleshooting:section:2 | true |
| readiness-flow-near-match-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | diagnostic-playbook:flow-trigger | lexical | supporting-best-match | diagnostic-playbook:flow-trigger:canonical:0 | true |
| readiness-flow-near-match-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-flow-near-match-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-flow-near-match-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-flow-near-match-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:performance-troubleshooting | lexical | unjudged-section | knowledge-article:performance-troubleshooting:section:4 | n/a |
| readiness-flow-near-match-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:sms-compliance | lexical | unjudged-section | knowledge-article:sms-compliance:section:0 | n/a |
| readiness-flow-near-match-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:1 | n/a |
| readiness-flow-near-match-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-flow-near-match-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-flow-near-match-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-flow-near-match-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-flow-near-match-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-flow-near-match-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-flow-near-match-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-flow-near-match-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:performance-troubleshooting | lexical | right-article-wrong-best-section | knowledge-article:performance-troubleshooting:section:3 | true |
| readiness-editor-exact-no-code-001 | knowledge-article:performance-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:campaign-editor | lexical | supporting-best-match | diagnostic-playbook:campaign-editor:canonical:0 | true |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-editor-exact-no-code-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:account-access | lexical | unjudged-section | knowledge-article:account-access:section:0 | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:account-access | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:authentication | lexical | unjudged-section | knowledge-article:authentication:section:0 | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:authentication | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:campaign-send-failures | lexical | unjudged-section | knowledge-article:campaign-send-failures:section:0 | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:campaign-send-failures | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:event-tracking-debugging | lexical | resource-missing | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:security-incident-response | lexical | unjudged-section | knowledge-article:security-incident-response:section:0 | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:security-incident-response | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-editor-exact-no-code-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-editor-exact-no-code-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-editor-exact-no-code-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-editor-exact-no-code-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-editor-exact-no-code-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-editor-exact-no-code-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-editor-exact-no-code-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:event-processing-delay | lexical | unjudged-section | diagnostic-playbook:event-processing-delay:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:campaign-send-failures | lexical | unjudged-section | knowledge-article:campaign-send-failures:section:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:campaign-send-failures | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:event-tracking-debugging | lexical | unjudged-section | knowledge-article:event-tracking-debugging:section:4 | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:security-incident-response | lexical | unjudged-section | knowledge-article:security-incident-response:section:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:security-incident-response | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:shopify-integration-sync | lexical | resource-missing | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:3 | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:webhook-signature-validation | lexical | unjudged-section | knowledge-article:webhook-signature-validation:section:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:webhook-secret-rotation | lexical | unjudged-section | known-cause:webhook-secret-rotation:canonical:0 | n/a |
| readiness-webhook-opaque-id-negative-001 | known-cause:webhook-secret-rotation | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:event-tracking-debugging | lexical | supporting-best-match | knowledge-article:event-tracking-debugging:section:3 | true |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:event-tracking-debugging | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:event-processing-delay | lexical | supporting-best-match | diagnostic-playbook:event-processing-delay:canonical:0 | true |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:event-processing-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:article-backed | lexical | unjudged-section | diagnostic-playbook:article-backed:canonical:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:article-backed | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:campaign-editor | lexical | unjudged-section | diagnostic-playbook:campaign-editor:canonical:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:campaign-editor | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:flow-trigger | lexical | unjudged-section | diagnostic-playbook:flow-trigger:canonical:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | diagnostic-playbook:flow-trigger | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:flow-trigger-troubleshooting | lexical | unjudged-section | knowledge-article:flow-trigger-troubleshooting:section:3 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:flow-trigger-troubleshooting | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:profile-sync-issues | lexical | resource-missing | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:profile-sync-issues | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:segmentation-audience-rules | lexical | unjudged-section | knowledge-article:segmentation-audience-rules:section:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:segmentation-audience-rules | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:shopify-integration-sync | lexical | unjudged-section | knowledge-article:shopify-integration-sync:section:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:shopify-integration-sync | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:sms-compliance | lexical | resource-missing | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:sms-compliance | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:support-operations-playbook | lexical | unjudged-section | knowledge-article:support-operations-playbook:section:2 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:support-operations-playbook | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:webhook-signature-validation | lexical | resource-missing | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | knowledge-article:webhook-signature-validation | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:shopify-custom-field-mapping | lexical | unjudged-section | known-cause:shopify-custom-field-mapping:canonical:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:shopify-custom-field-mapping | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:sms-quiet-hours | lexical | unjudged-section | known-cause:sms-quiet-hours:canonical:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:sms-quiet-hours | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:sms-stop-sync-delay | lexical | unjudged-section | known-cause:sms-stop-sync-delay:canonical:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:sms-stop-sync-delay | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:track-api-local-time-timestamp | lexical | unjudged-section | known-cause:track-api-local-time-timestamp:canonical:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:track-api-local-time-timestamp | semantic | channel-unavailable | n/a | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:webhook-delivery-latency | lexical | unjudged-section | known-cause:webhook-delivery-latency:canonical:0 | n/a |
| readiness-event-exact-accepted-missing-multi-store-001 | known-cause:webhook-delivery-latency | semantic | channel-unavailable | n/a | n/a |

## Development disagreements

- Comparable cases: 0
- []

## Topic metrics

- {"campaign-editor":{"scenarios":7,"candidateRecall":1,"requiredCoverage":1,"excludedCandidateRecall":0,"excludedRequiredCoverage":5,"perTypeMetrics":{"knowledge-article":{"scenarios":7,"lexical":{"recallAt1":1,"precisionAt1":null,"recallAt3":1,"precisionAt3":null,"recallAt5":1,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":7,"recallAt3":0,"precisionAt3":7,"recallAt5":0,"precisionAt5":7},"semantic":{"recallAt1":7,"precisionAt1":7,"recallAt3":7,"precisionAt3":7,"recallAt5":7,"precisionAt5":7}}},"known-cause":{"scenarios":0,"lexical":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0},"semantic":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0}}},"diagnostic-playbook":{"scenarios":7,"lexical":{"recallAt1":1,"precisionAt1":null,"recallAt3":1,"precisionAt3":null,"recallAt5":1,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":7,"recallAt3":0,"precisionAt3":7,"recallAt5":0,"precisionAt5":7},"semantic":{"recallAt1":7,"precisionAt1":7,"recallAt3":7,"precisionAt3":7,"recallAt5":7,"precisionAt5":7}}},"resolved-ticket":{"scenarios":0,"lexical":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0},"semantic":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0}}}},"sectionSummary":{"lexical":{"judged":14,"supportingBestMatch":11,"wrongBestSection":3,"supportingBestMatchRate":0.7857142857142857,"lowerSupportingMatch":3,"anySupportingMatch":14,"excluded":{"resource-missing":29,"channel-unavailable":0,"unjudged-section":84}},"semantic":{"judged":0,"supportingBestMatch":0,"wrongBestSection":0,"supportingBestMatchRate":null,"lowerSupportingMatch":0,"anySupportingMatch":0,"excluded":{"resource-missing":0,"channel-unavailable":127,"unjudged-section":0}}}},"webhook":{"scenarios":7,"candidateRecall":1,"requiredCoverage":1,"excludedCandidateRecall":1,"excludedRequiredCoverage":5,"perTypeMetrics":{"knowledge-article":{"scenarios":6,"lexical":{"recallAt1":0.8333333333333334,"precisionAt1":null,"recallAt3":1,"precisionAt3":null,"recallAt5":1,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":6,"recallAt3":0,"precisionAt3":6,"recallAt5":0,"precisionAt5":6},"semantic":{"recallAt1":6,"precisionAt1":6,"recallAt3":6,"precisionAt3":6,"recallAt5":6,"precisionAt5":6}}},"known-cause":{"scenarios":3,"lexical":{"recallAt1":1,"precisionAt1":null,"recallAt3":1,"precisionAt3":null,"recallAt5":1,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":3,"recallAt3":0,"precisionAt3":3,"recallAt5":0,"precisionAt5":3},"semantic":{"recallAt1":3,"precisionAt1":3,"recallAt3":3,"precisionAt3":3,"recallAt5":3,"precisionAt5":3}}},"diagnostic-playbook":{"scenarios":6,"lexical":{"recallAt1":1,"precisionAt1":null,"recallAt3":1,"precisionAt3":null,"recallAt5":1,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":6,"recallAt3":0,"precisionAt3":6,"recallAt5":0,"precisionAt5":6},"semantic":{"recallAt1":6,"precisionAt1":6,"recallAt3":6,"precisionAt3":6,"recallAt5":6,"precisionAt5":6}}},"resolved-ticket":{"scenarios":0,"lexical":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0},"semantic":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0}}}},"sectionSummary":{"lexical":{"judged":15,"supportingBestMatch":12,"wrongBestSection":3,"supportingBestMatchRate":0.8,"lowerSupportingMatch":3,"anySupportingMatch":15,"excluded":{"resource-missing":19,"channel-unavailable":0,"unjudged-section":83}},"semantic":{"judged":0,"supportingBestMatch":0,"wrongBestSection":0,"supportingBestMatchRate":null,"lowerSupportingMatch":0,"anySupportingMatch":0,"excluded":{"resource-missing":0,"channel-unavailable":117,"unjudged-section":0}}}},"flow-event":{"scenarios":7,"candidateRecall":1,"requiredCoverage":1,"excludedCandidateRecall":0,"excludedRequiredCoverage":4,"perTypeMetrics":{"knowledge-article":{"scenarios":7,"lexical":{"recallAt1":0.7142857142857143,"precisionAt1":null,"recallAt3":1,"precisionAt3":null,"recallAt5":1,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":7,"recallAt3":0,"precisionAt3":7,"recallAt5":0,"precisionAt5":7},"semantic":{"recallAt1":7,"precisionAt1":7,"recallAt3":7,"precisionAt3":7,"recallAt5":7,"precisionAt5":7}}},"known-cause":{"scenarios":0,"lexical":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0},"semantic":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0}}},"diagnostic-playbook":{"scenarios":7,"lexical":{"recallAt1":1,"precisionAt1":null,"recallAt3":1,"precisionAt3":null,"recallAt5":1,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":7,"recallAt3":0,"precisionAt3":7,"recallAt5":0,"precisionAt5":7},"semantic":{"recallAt1":7,"precisionAt1":7,"recallAt3":7,"precisionAt3":7,"recallAt5":7,"precisionAt5":7}}},"resolved-ticket":{"scenarios":0,"lexical":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"semantic":{"recallAt1":null,"precisionAt1":null,"recallAt3":null,"precisionAt3":null,"recallAt5":null,"precisionAt5":null},"exclusions":{"lexical":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0},"semantic":{"recallAt1":0,"precisionAt1":0,"recallAt3":0,"precisionAt3":0,"recallAt5":0,"precisionAt5":0}}}},"sectionSummary":{"lexical":{"judged":18,"supportingBestMatch":14,"wrongBestSection":4,"supportingBestMatchRate":0.7777777777777778,"lowerSupportingMatch":4,"anySupportingMatch":18,"excluded":{"resource-missing":20,"channel-unavailable":0,"unjudged-section":80}},"semantic":{"judged":0,"supportingBestMatch":0,"wrongBestSection":0,"supportingBestMatchRate":null,"lowerSupportingMatch":0,"anySupportingMatch":0,"excluded":{"resource-missing":0,"channel-unavailable":118,"unjudged-section":0}}}}}

## Article source and prompt sizes

- [{"articleId":"account-access","sourceCharacters":751,"diagnosisPromptCharacters":751,"classificationAndDraftBodyCharacters":751},{"articleId":"api-reference","sourceCharacters":677,"diagnosisPromptCharacters":677,"classificationAndDraftBodyCharacters":677},{"articleId":"authentication","sourceCharacters":736,"diagnosisPromptCharacters":736,"classificationAndDraftBodyCharacters":736},{"articleId":"billing-and-invoices","sourceCharacters":800,"diagnosisPromptCharacters":800,"classificationAndDraftBodyCharacters":800},{"articleId":"campaign-send-failures","sourceCharacters":1103,"diagnosisPromptCharacters":1103,"classificationAndDraftBodyCharacters":1103},{"articleId":"coupon-catalog-sync","sourceCharacters":944,"diagnosisPromptCharacters":944,"classificationAndDraftBodyCharacters":944},{"articleId":"email-deliverability","sourceCharacters":982,"diagnosisPromptCharacters":982,"classificationAndDraftBodyCharacters":982},{"articleId":"event-tracking-debugging","sourceCharacters":3283,"diagnosisPromptCharacters":1800,"classificationAndDraftBodyCharacters":3283},{"articleId":"flow-trigger-troubleshooting","sourceCharacters":3130,"diagnosisPromptCharacters":1800,"classificationAndDraftBodyCharacters":3130},{"articleId":"performance-troubleshooting","sourceCharacters":3141,"diagnosisPromptCharacters":1800,"classificationAndDraftBodyCharacters":3141},{"articleId":"product-feedback","sourceCharacters":748,"diagnosisPromptCharacters":748,"classificationAndDraftBodyCharacters":748},{"articleId":"profile-sync-issues","sourceCharacters":922,"diagnosisPromptCharacters":922,"classificationAndDraftBodyCharacters":922},{"articleId":"security-incident-response","sourceCharacters":1012,"diagnosisPromptCharacters":1012,"classificationAndDraftBodyCharacters":1012},{"articleId":"segmentation-audience-rules","sourceCharacters":953,"diagnosisPromptCharacters":953,"classificationAndDraftBodyCharacters":953},{"articleId":"shopify-integration-sync","sourceCharacters":850,"diagnosisPromptCharacters":850,"classificationAndDraftBodyCharacters":850},{"articleId":"sms-compliance","sourceCharacters":850,"diagnosisPromptCharacters":850,"classificationAndDraftBodyCharacters":850},{"articleId":"support-operations-playbook","sourceCharacters":7906,"diagnosisPromptCharacters":1800,"classificationAndDraftBodyCharacters":7906},{"articleId":"webhook-signature-validation","sourceCharacters":3225,"diagnosisPromptCharacters":1800,"classificationAndDraftBodyCharacters":3225}]

## Corpus limitations

- {"unavailableFamilies":["learned-known-cause"],"syntheticCasesOnly":true,"historicalMetricComparison":"invalid: corpus and case set changed together","sectionOrderingEvidence":"supporting best match and lower supporting match are separate; any match alone does not establish useful ordering"}

Semantic quality evidence is outstanding because no live or cached embedding provider was configured. Lexical metrics are deterministic and the corpus/oracle hashes freeze this run's identity.
