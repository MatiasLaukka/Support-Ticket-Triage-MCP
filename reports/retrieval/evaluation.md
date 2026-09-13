# B3 hybrid retrieval evaluation

- Mode: offline-lexical-only
- Semantic evidence: outstanding
- Source commit: 9501efbc0759a0102df40aa358f6d92cb33581b4
- Oracle hash: dcb56214562d4d3a68c6ea5ccb0b421f789f185c10aaa7c114c7e3a34aa183d9
- Scenario cutoff: 2026-09-12T23:59:59.999Z
- Corpus hash: c2ecd79155568570f0870246fac4cf8c307940d8327220991a188cb33de79e58
- Representation version: 1
- FTS tokenization: unicode-letter-number-v1; quoted OR terms; max 128 tokens
- Model: null
- K budget: {"knowledge-article":{"lexical":5,"semantic":5},"known-cause":{"lexical":5,"semantic":5},"diagnostic-playbook":{"lexical":5,"semantic":5},"resolved-ticket":{"lexical":5,"semantic":5}}
- Channel statuses: {"lexical":"available","semantic":"unavailable:provider-not-configured"}
- Scenarios: 4
- Excluded from complete precision: 1
- Semantic-unavailable scenarios: 4

## Candidate pools

| Ticket | Pool size | Candidate recall | Required coverage | Unjudged hits |
|---|---:|---:|---:|---:|
| TKT-1017 | 16 | 1 | 1 | 13 |
| TKT-1028 | 17 | 1 | 1 | 14 |
| TKT-1010 | 14 | 0.5 | n/a | 13 |
| TKT-1020 | 16 | 1 | 1 | 13 |

## Per-representation provenance

| Ticket | Resource | Channel | Representation | Rank | Score |
|---|---|---|---|---:|---:|
| TKT-1017 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 33 | -0.0000014592290086613114 |
| TKT-1017 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 14 | -1.2652925202528726 |
| TKT-1017 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 20 | -0.9881717285134475 |
| TKT-1017 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 6 | -5.743522903669345 |
| TKT-1017 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 5 | -7.296759180174303 |
| TKT-1017 | knowledge-article:email-deliverability | lexical | knowledge-article:email-deliverability:section:0 | 9 | -2.9738603575062634 |
| TKT-1017 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 10 | -1.940069575503219 |
| TKT-1017 | knowledge-article:sms-compliance | lexical | knowledge-article:sms-compliance:section:0 | 2 | -20.696153395928352 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 3 | -14.0620355071259 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 4 | -11.170209080677749 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 7 | -4.117432534054373 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 17 | -1.164519025430783 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 23 | -0.7370689884765635 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 30 | -0.0000045696455331335535 |
| TKT-1017 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 1 | -31.25472749086402 |
| TKT-1017 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 8 | -3.360904940223339 |
| TKT-1017 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 19 | -1.0334884328707759 |
| TKT-1017 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 12 | -1.3198824680204038 |
| TKT-1017 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 16 | -1.177327097219393 |
| TKT-1028 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 33 | -0.0000014592290086613114 |
| TKT-1028 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 32 | -0.0000014657410746483954 |
| TKT-1028 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 4 | -5.945268492796047 |
| TKT-1028 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 23 | -0.7252255938660547 |
| TKT-1028 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 9 | -2.824118193398057 |
| TKT-1028 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 10 | -2.109538834544024 |
| TKT-1028 | knowledge-article:shopify-integration-sync | lexical | knowledge-article:shopify-integration-sync:section:0 | 5 | -4.9898622760067655 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 1 | -9.553162647114094 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 6 | -4.586726159482853 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 8 | -3.456961618794181 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 11 | -2.0849360687694536 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 15 | -1.5584367922273281 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 30 | -0.0000031136812219535006 |
| TKT-1028 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 2 | -9.297001220529225 |
| TKT-1028 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 13 | -1.6444830235838772 |
| TKT-1028 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 24 | -0.4829744771501674 |
| TKT-1028 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 22 | -0.7637236920904391 |
| TKT-1028 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 3 | -9.247422562184193 |
| TKT-1028 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 7 | -3.74699503065994 |
| TKT-1010 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 2 | -3.544775376007298 |
| TKT-1010 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 10 | -0.000001867340492735313 |
| TKT-1010 | knowledge-article:email-deliverability | lexical | knowledge-article:email-deliverability:section:0 | 6 | -1.8321382543338192 |
| TKT-1010 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 4 | -3.0307685768955785 |
| TKT-1010 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 7 | -1.729520683583884 |
| TKT-1010 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 5 | -1.8348852745368716 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 1 | -5.274194976214735 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 3 | -3.4089989437467034 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 8 | -1.5839979709681344 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 13 | -0.0000013962106167140789 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 20 | -7.549044645137325e-7 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 21 | -6.784909439946583e-7 |
| TKT-1010 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 16 | -0.0000011401122019635345 |
| TKT-1010 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 15 | -0.00000115616555255298 |
| TKT-1010 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 11 | -0.0000014585417274093348 |
| TKT-1020 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 32 | -0.0000014592290086613114 |
| TKT-1020 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 20 | -1.2652891693077162 |
| TKT-1020 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 12 | -3.221310791695682 |
| TKT-1020 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 1 | -20.011439895783965 |
| TKT-1020 | knowledge-article:product-feedback | lexical | knowledge-article:product-feedback:section:0 | 6 | -6.241965504865301 |
| TKT-1020 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 4 | -8.249899605517198 |
| TKT-1020 | knowledge-article:shopify-integration-sync | lexical | knowledge-article:shopify-integration-sync:section:0 | 2 | -13.203851217279775 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 5 | -6.932475874370532 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 7 | -5.897998196610901 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 14 | -2.7705551144720806 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 21 | -1.1645169042658614 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 27 | -0.0000030180875811366075 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 30 | -0.000002563227254491316 |
| TKT-1020 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 3 | -8.878258338569509 |
| TKT-1020 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 8 | -5.2410202953004275 |
| TKT-1020 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 17 | -1.8578382539624232 |
| TKT-1020 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 15 | -2.7639759053581137 |
| TKT-1020 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 26 | -0.0000030428157772305593 |

## Per-type metrics

| Type | Scenarios | Lexical R@1 | Lexical R@3 | Lexical R@5 | Lexical P@1 | Lexical P@3 | Lexical P@5 | Semantic R@1 | Semantic R@3 | Semantic R@5 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| diagnostic-playbook | 1 | 1 | 1 | 1 | n/a | n/a | n/a | n/a | n/a | n/a |
| knowledge-article | 4 | 0 | 0 | 0.75 | 0 | 0 | 0.2 | n/a | n/a | n/a |
| known-cause | 3 | 0.6666666666666666 | 0.6666666666666666 | 1 | 0.6666666666666666 | 0.2222222222222222 | 0.2 | n/a | n/a | n/a |
| resolved-ticket | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Per-family metrics

| Family | Scenarios | Candidate recall | Required coverage |
|---|---:|---:|---:|
| ambiguity | 1 | 0.5 | n/a |
| known-cause | 1 | 1 | 1 |
| shopify-catalog | 1 | 1 | 1 |
| sms-compliance | 1 | 1 | 1 |

## Baseline comparison

- {"articleOnlyRequiredCoverage":1,"unionRequiredCoverage":1,"scenariosCompared":3}

## Corpus coverage

- {"knowledge-article":{"adequate":4},"known-cause":{"adequate":3,"uncertain":1},"diagnostic-playbook":{"missing":3,"adequate":1},"resolved-ticket":{"not-expected":4}}

## Unjudged hits

- Count: 53
- TKT-1017: diagnostic-playbook:article-backed
- TKT-1017: diagnostic-playbook:campaign-editor
- TKT-1017: diagnostic-playbook:event-processing-delay
- TKT-1017: diagnostic-playbook:flow-trigger
- TKT-1017: knowledge-article:campaign-send-failures
- TKT-1017: knowledge-article:email-deliverability
- TKT-1017: knowledge-article:event-tracking-debugging
- TKT-1017: knowledge-article:profile-sync-issues
- TKT-1017: knowledge-article:support-operations-playbook
- TKT-1017: knowledge-article:webhook-signature-validation
- TKT-1017: known-cause:track-api-local-time-timestamp
- TKT-1017: known-cause:webhook-delivery-latency
- TKT-1017: known-cause:webhook-secret-rotation
- TKT-1028: diagnostic-playbook:article-backed
- TKT-1028: diagnostic-playbook:campaign-editor
- TKT-1028: diagnostic-playbook:event-processing-delay
- TKT-1028: diagnostic-playbook:flow-trigger
- TKT-1028: knowledge-article:coupon-catalog-sync
- TKT-1028: knowledge-article:event-tracking-debugging
- TKT-1028: knowledge-article:flow-trigger-troubleshooting
- TKT-1028: knowledge-article:profile-sync-issues
- TKT-1028: knowledge-article:shopify-integration-sync
- TKT-1028: knowledge-article:sms-compliance
- TKT-1028: knowledge-article:support-operations-playbook
- TKT-1028: known-cause:shopify-custom-field-mapping
- TKT-1028: known-cause:sms-stop-sync-delay
- TKT-1028: known-cause:track-api-local-time-timestamp
- TKT-1010: diagnostic-playbook:flow-trigger
- TKT-1010: knowledge-article:email-deliverability
- TKT-1010: knowledge-article:event-tracking-debugging
- TKT-1010: knowledge-article:flow-trigger-troubleshooting
- TKT-1010: knowledge-article:profile-sync-issues
- TKT-1010: knowledge-article:security-incident-response
- TKT-1010: knowledge-article:shopify-integration-sync
- TKT-1010: knowledge-article:sms-compliance
- TKT-1010: knowledge-article:support-operations-playbook
- TKT-1010: knowledge-article:webhook-signature-validation
- TKT-1010: known-cause:shopify-custom-field-mapping
- TKT-1010: known-cause:sms-stop-sync-delay
- TKT-1010: known-cause:webhook-secret-rotation
- TKT-1020: diagnostic-playbook:article-backed
- TKT-1020: diagnostic-playbook:campaign-editor
- TKT-1020: diagnostic-playbook:event-processing-delay
- TKT-1020: knowledge-article:event-tracking-debugging
- TKT-1020: knowledge-article:product-feedback
- TKT-1020: knowledge-article:profile-sync-issues
- TKT-1020: knowledge-article:sms-compliance
- TKT-1020: knowledge-article:support-operations-playbook
- TKT-1020: knowledge-article:webhook-signature-validation
- TKT-1020: known-cause:sms-quiet-hours
- TKT-1020: known-cause:sms-stop-sync-delay
- TKT-1020: known-cause:track-api-local-time-timestamp
- TKT-1020: known-cause:webhook-secret-rotation

## Reviewed contrast families

- webhook rotation/latency
- SMS quiet-hours/consent delay
- Shopify mapping/general sync
- editor session/platform loading

## Notes

Semantic quality evidence is outstanding because no live or cached embedding provider was configured. Lexical metrics are deterministic and the corpus/oracle hashes freeze this run's identity.
