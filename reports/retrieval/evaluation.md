# B3 hybrid retrieval evaluation

- Mode: offline-lexical-only
- Semantic evidence: outstanding
- Source commit: d136a375c55a5cb1ffb9ca292de3cbc83ccd5200
- Oracle hash: 83435586f4b4fcbc66069ad5c80ff7d79e6c7c271c0b1b9d254d6f2697aaab0e
- Scenario cutoff: 2026-09-12T23:59:59.999Z
- Corpus hash: 1dd1ccb213252a34bb777e46c7d628c447a45bd192c6cf03ac3d1f1d95850476
- Representation version: 2
- FTS tokenization: unicode-letter-number-v1; quoted OR terms; max 128 tokens
- Model: null
- K budget: {"knowledge-article":{"lexical":5,"semantic":5},"known-cause":{"lexical":5,"semantic":5},"diagnostic-playbook":{"lexical":5,"semantic":5},"resolved-ticket":{"lexical":5,"semantic":5}}
- Channel statuses: {"lexical":"available","semantic":"unavailable:provider-not-configured"}
- Scenarios: 8
- Excluded from complete precision: 2
- Semantic-unavailable scenarios: 8

## Candidate pools

| Ticket | Pool size | Candidate recall | Required coverage | Unjudged hits |
|---|---:|---:|---:|---:|
| TKT-1017 | 16 | 1 | 1 | 13 |
| TKT-1028 | 17 | 1 | 1 | 14 |
| TKT-1010 | 14 | 0.5 | n/a | 13 |
| TKT-1020 | 16 | 1 | 1 | 13 |
| TKT-1023 | 17 | 1 | 1 | 14 |
| TKT-1024 | 15 | 1 | n/a | 14 |
| TKT-1007 | 15 | 1 | 1 | 12 |
| TKT-1018 | 16 | 1 | 1 | 13 |

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
| TKT-1023 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 32 | -0.0000014592290086613114 |
| TKT-1023 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 27 | -0.0000018852040816326534 |
| TKT-1023 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 31 | -0.0000014723115236585919 |
| TKT-1023 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 25 | -0.0000033010897762134208 |
| TKT-1023 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 7 | -4.106538136828883 |
| TKT-1023 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 3 | -6.350019786421981 |
| TKT-1023 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 1 | -11.486829204792464 |
| TKT-1023 | knowledge-article:segmentation-audience-rules | lexical | knowledge-article:segmentation-audience-rules:section:0 | 2 | -8.27845621857007 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 4 | -6.002147642857738 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 6 | -4.394807356025191 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 8 | -4.042118945966667 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 9 | -3.9816942974574157 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 21 | -0.000005329024676271007 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 29 | -0.0000018197386462210033 |
| TKT-1023 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 23 | -0.000004222306315189868 |
| TKT-1023 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 28 | -0.0000018324293100776287 |
| TKT-1023 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 5 | -5.5241422137865515 |
| TKT-1023 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 17 | -1.8492264260018096 |
| TKT-1023 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 24 | -0.0000034104728131244776 |
| TKT-1024 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 25 | -0.0000029184580173226227 |
| TKT-1024 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 17 | -1.2652891693077162 |
| TKT-1024 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 5 | -5.018819148595635 |
| TKT-1024 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 1 | -8.133234673062907 |
| TKT-1024 | knowledge-article:segmentation-audience-rules | lexical | knowledge-article:segmentation-audience-rules:section:0 | 3 | -5.8590028913097365 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 2 | -6.372111225681847 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 4 | -5.454075783644428 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 10 | -2.6713219985917087 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 18 | -1.098174075257997 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 30 | -0.0000018197386462210033 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 31 | -0.0000014650476469395573 |
| TKT-1024 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 7 | -4.28819928468561 |
| TKT-1024 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 6 | -4.9639697381750345 |
| TKT-1024 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 19 | -1.0953327145169682 |
| TKT-1024 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 9 | -3.3952114733595757 |
| TKT-1024 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 22 | -0.0000032695372515445087 |
| TKT-1024 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 11 | -2.361727726439652 |
| TKT-1007 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 31 | -0.0000014592290086613114 |
| TKT-1007 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 11 | -1.8584130188825598 |
| TKT-1007 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 6 | -3.7388349008051205 |
| TKT-1007 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 7 | -2.805542132807998 |
| TKT-1007 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 8 | -2.6013871390078447 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 3 | -11.771014493743762 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 4 | -9.078641962096127 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 9 | -2.330798939626926 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 10 | -2.0849343241148595 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 12 | -1.806678230037901 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 13 | -1.7284809434874375 |
| TKT-1007 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 1 | -14.029205359152932 |
| TKT-1007 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 14 | -1.6444813440384227 |
| TKT-1007 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 26 | -0.000001912255939778876 |
| TKT-1007 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 25 | -0.0000019209871125102333 |
| TKT-1007 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 5 | -8.475102377255123 |
| TKT-1007 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 2 | -11.847805586828414 |
| TKT-1018 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 31 | -0.0000014592290086613114 |
| TKT-1018 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 9 | -3.544775376007298 |
| TKT-1018 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 26 | -0.000001867340492735313 |
| TKT-1018 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 6 | -4.489956766714242 |
| TKT-1018 | knowledge-article:product-feedback | lexical | knowledge-article:product-feedback:section:0 | 7 | -4.295460806208722 |
| TKT-1018 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 5 | -7.201440711586065 |
| TKT-1018 | knowledge-article:shopify-integration-sync | lexical | knowledge-article:shopify-integration-sync:section:0 | 3 | -11.266226676364719 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 2 | -13.074353836450998 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 4 | -8.519564300347573 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 8 | -4.007022052349632 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 12 | -2.0849355580015874 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 16 | -1.7284809434874375 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 21 | -0.0000029300952938791146 |
| TKT-1018 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 1 | -16.987690930871604 |
| TKT-1018 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 14 | -1.8578394101279758 |
| TKT-1018 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 24 | -0.0000019209871125102333 |
| TKT-1018 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 18 | -1.6275324904335302 |
| TKT-1018 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 19 | -0.0000034104728131244776 |

## Per-type metrics

| Type | Scenarios | Lexical R@1 | Lexical R@3 | Lexical R@5 | Lexical P@1 | Lexical P@3 | Lexical P@5 | Semantic R@1 | Semantic R@3 | Semantic R@5 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| diagnostic-playbook | 1 | 1 | 1 | 1 | n/a | n/a | n/a | n/a | n/a | n/a |
| knowledge-article | 8 | 0.5 | 0.875 | 0.875 | 0.5 | 0.3333333333333333 | 0.19999999999999998 | n/a | n/a | n/a |
| known-cause | 6 | 1 | 1 | 1 | 1 | 0.3333333333333333 | 0.19999999999999998 | n/a | n/a | n/a |
| resolved-ticket | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Per-family metrics

| Family | Scenarios | Candidate recall | Required coverage |
|---|---:|---:|---:|
| ambiguity | 1 | 0.5 | n/a |
| campaign-coupons | 1 | 1 | n/a |
| consent-sync | 1 | 1 | 1 |
| known-cause | 1 | 1 | 1 |
| shopify-catalog | 2 | 1 | 1 |
| sms-compliance | 1 | 1 | 1 |
| webhooks | 1 | 1 | 1 |

## Baseline comparison

- {"deterministicArticleRequiredCoverage":1,"unionRequiredCoverage":1,"scenariosCompared":6,"unsupportedResourceFamilies":["known-cause","diagnostic-playbook","resolved-ticket"]}

## Reference channel pools

| Channel | Kind | Scenarios | Candidate recall | Required coverage | Excluded recall | Excluded required | Provenance |
|---|---|---:|---:|---:|---:|---:|---|
| deterministic | unordered-pool | 8 | 0.6875 | 1 | 0 | 2 | deterministic classifier associations |
| knownCause | unordered-pool | 8 | 0.375 | 1 | 0 | 2 | direct approved links from retrieved known causes |

## Retrieval, corpus, and oracle-review gaps

- Retrieval misses: None.
- Corpus gaps: TKT-1017:diagnostic-playbook, TKT-1028:diagnostic-playbook, TKT-1020:diagnostic-playbook, TKT-1023:diagnostic-playbook, TKT-1024:resolved-ticket, TKT-1007:diagnostic-playbook, TKT-1018:diagnostic-playbook
- Oracle-review candidates: TKT-1017:diagnostic-playbook:article-backed, TKT-1017:diagnostic-playbook:campaign-editor, TKT-1017:diagnostic-playbook:event-processing-delay, TKT-1017:diagnostic-playbook:flow-trigger, TKT-1017:knowledge-article:campaign-send-failures, TKT-1017:knowledge-article:email-deliverability, TKT-1017:knowledge-article:event-tracking-debugging, TKT-1017:knowledge-article:profile-sync-issues, TKT-1017:knowledge-article:support-operations-playbook, TKT-1017:knowledge-article:webhook-signature-validation, TKT-1017:known-cause:track-api-local-time-timestamp, TKT-1017:known-cause:webhook-delivery-latency, TKT-1017:known-cause:webhook-secret-rotation, TKT-1028:diagnostic-playbook:article-backed, TKT-1028:diagnostic-playbook:campaign-editor, TKT-1028:diagnostic-playbook:event-processing-delay, TKT-1028:diagnostic-playbook:flow-trigger, TKT-1028:knowledge-article:coupon-catalog-sync, TKT-1028:knowledge-article:event-tracking-debugging, TKT-1028:knowledge-article:flow-trigger-troubleshooting, TKT-1028:knowledge-article:profile-sync-issues, TKT-1028:knowledge-article:shopify-integration-sync, TKT-1028:knowledge-article:sms-compliance, TKT-1028:knowledge-article:support-operations-playbook, TKT-1028:known-cause:shopify-custom-field-mapping, TKT-1028:known-cause:sms-stop-sync-delay, TKT-1028:known-cause:track-api-local-time-timestamp, TKT-1010:diagnostic-playbook:flow-trigger, TKT-1010:knowledge-article:email-deliverability, TKT-1010:knowledge-article:event-tracking-debugging, TKT-1010:knowledge-article:flow-trigger-troubleshooting, TKT-1010:knowledge-article:profile-sync-issues, TKT-1010:knowledge-article:security-incident-response, TKT-1010:knowledge-article:shopify-integration-sync, TKT-1010:knowledge-article:sms-compliance, TKT-1010:knowledge-article:support-operations-playbook, TKT-1010:knowledge-article:webhook-signature-validation, TKT-1010:known-cause:shopify-custom-field-mapping, TKT-1010:known-cause:sms-stop-sync-delay, TKT-1010:known-cause:webhook-secret-rotation, TKT-1020:diagnostic-playbook:article-backed, TKT-1020:diagnostic-playbook:campaign-editor, TKT-1020:diagnostic-playbook:event-processing-delay, TKT-1020:knowledge-article:event-tracking-debugging, TKT-1020:knowledge-article:product-feedback, TKT-1020:knowledge-article:profile-sync-issues, TKT-1020:knowledge-article:sms-compliance, TKT-1020:knowledge-article:support-operations-playbook, TKT-1020:knowledge-article:webhook-signature-validation, TKT-1020:known-cause:sms-quiet-hours, TKT-1020:known-cause:sms-stop-sync-delay, TKT-1020:known-cause:track-api-local-time-timestamp, TKT-1020:known-cause:webhook-secret-rotation, TKT-1023:diagnostic-playbook:article-backed, TKT-1023:diagnostic-playbook:campaign-editor, TKT-1023:diagnostic-playbook:event-processing-delay, TKT-1023:diagnostic-playbook:flow-trigger, TKT-1023:knowledge-article:event-tracking-debugging, TKT-1023:knowledge-article:flow-trigger-troubleshooting, TKT-1023:knowledge-article:segmentation-audience-rules, TKT-1023:knowledge-article:shopify-integration-sync, TKT-1023:knowledge-article:sms-compliance, TKT-1023:knowledge-article:support-operations-playbook, TKT-1023:knowledge-article:webhook-signature-validation, TKT-1023:known-cause:shopify-custom-field-mapping, TKT-1023:known-cause:track-api-local-time-timestamp, TKT-1023:known-cause:webhook-secret-rotation, TKT-1024:diagnostic-playbook:article-backed, TKT-1024:diagnostic-playbook:campaign-editor, TKT-1024:knowledge-article:campaign-send-failures, TKT-1024:knowledge-article:event-tracking-debugging, TKT-1024:knowledge-article:profile-sync-issues, TKT-1024:knowledge-article:segmentation-audience-rules, TKT-1024:knowledge-article:sms-compliance, TKT-1024:knowledge-article:support-operations-playbook, TKT-1024:knowledge-article:webhook-signature-validation, TKT-1024:known-cause:sms-quiet-hours, TKT-1024:known-cause:sms-stop-sync-delay, TKT-1024:known-cause:track-api-local-time-timestamp, TKT-1024:known-cause:webhook-delivery-latency, TKT-1024:known-cause:webhook-secret-rotation, TKT-1007:diagnostic-playbook:article-backed, TKT-1007:diagnostic-playbook:event-processing-delay, TKT-1007:knowledge-article:campaign-send-failures, TKT-1007:knowledge-article:event-tracking-debugging, TKT-1007:knowledge-article:profile-sync-issues, TKT-1007:knowledge-article:security-incident-response, TKT-1007:knowledge-article:shopify-integration-sync, TKT-1007:knowledge-article:sms-compliance, TKT-1007:knowledge-article:support-operations-playbook, TKT-1007:known-cause:shopify-custom-field-mapping, TKT-1007:known-cause:sms-stop-sync-delay, TKT-1007:known-cause:track-api-local-time-timestamp, TKT-1018:diagnostic-playbook:article-backed, TKT-1018:diagnostic-playbook:campaign-editor, TKT-1018:diagnostic-playbook:flow-trigger, TKT-1018:knowledge-article:event-tracking-debugging, TKT-1018:knowledge-article:product-feedback, TKT-1018:knowledge-article:profile-sync-issues, TKT-1018:knowledge-article:sms-compliance, TKT-1018:knowledge-article:support-operations-playbook, TKT-1018:knowledge-article:webhook-signature-validation, TKT-1018:known-cause:sms-stop-sync-delay, TKT-1018:known-cause:track-api-local-time-timestamp, TKT-1018:known-cause:webhook-delivery-latency, TKT-1018:known-cause:webhook-secret-rotation

## Approved contrast coverage

| Contrast family | Status | Scenarios | Tickets |
|---|---|---:|---|
| webhook rotation/latency | covered | 2 | TKT-1007, TKT-1028 |
| SMS quiet-hours/consent delay | covered | 2 | TKT-1017, TKT-1023 |
| Shopify mapping/general sync | covered | 2 | TKT-1018, TKT-1020 |
| editor session/platform loading | missing-counterpart | 1 | TKT-1010 |

## Resolved-case evaluation

- {"status":"corpus-gap","reviewedScenarioTickets":["TKT-1024"],"eligibleCaseCount":0,"futureCasesExcluded":0,"selfTicketExclusion":"enforced at retrieval query time"}

## Corpus coverage

- {"knowledge-article":{"adequate":8},"known-cause":{"adequate":6,"uncertain":2},"diagnostic-playbook":{"missing":6,"adequate":1,"uncertain":1},"resolved-ticket":{"not-expected":7,"missing":1}}

## Unjudged hits

- Count: 106
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
- TKT-1023: diagnostic-playbook:article-backed
- TKT-1023: diagnostic-playbook:campaign-editor
- TKT-1023: diagnostic-playbook:event-processing-delay
- TKT-1023: diagnostic-playbook:flow-trigger
- TKT-1023: knowledge-article:event-tracking-debugging
- TKT-1023: knowledge-article:flow-trigger-troubleshooting
- TKT-1023: knowledge-article:segmentation-audience-rules
- TKT-1023: knowledge-article:shopify-integration-sync
- TKT-1023: knowledge-article:sms-compliance
- TKT-1023: knowledge-article:support-operations-playbook
- TKT-1023: knowledge-article:webhook-signature-validation
- TKT-1023: known-cause:shopify-custom-field-mapping
- TKT-1023: known-cause:track-api-local-time-timestamp
- TKT-1023: known-cause:webhook-secret-rotation
- TKT-1024: diagnostic-playbook:article-backed
- TKT-1024: diagnostic-playbook:campaign-editor
- TKT-1024: knowledge-article:campaign-send-failures
- TKT-1024: knowledge-article:event-tracking-debugging
- TKT-1024: knowledge-article:profile-sync-issues
- TKT-1024: knowledge-article:segmentation-audience-rules
- TKT-1024: knowledge-article:sms-compliance
- TKT-1024: knowledge-article:support-operations-playbook
- TKT-1024: knowledge-article:webhook-signature-validation
- TKT-1024: known-cause:sms-quiet-hours
- TKT-1024: known-cause:sms-stop-sync-delay
- TKT-1024: known-cause:track-api-local-time-timestamp
- TKT-1024: known-cause:webhook-delivery-latency
- TKT-1024: known-cause:webhook-secret-rotation
- TKT-1007: diagnostic-playbook:article-backed
- TKT-1007: diagnostic-playbook:event-processing-delay
- TKT-1007: knowledge-article:campaign-send-failures
- TKT-1007: knowledge-article:event-tracking-debugging
- TKT-1007: knowledge-article:profile-sync-issues
- TKT-1007: knowledge-article:security-incident-response
- TKT-1007: knowledge-article:shopify-integration-sync
- TKT-1007: knowledge-article:sms-compliance
- TKT-1007: knowledge-article:support-operations-playbook
- TKT-1007: known-cause:shopify-custom-field-mapping
- TKT-1007: known-cause:sms-stop-sync-delay
- TKT-1007: known-cause:track-api-local-time-timestamp
- TKT-1018: diagnostic-playbook:article-backed
- TKT-1018: diagnostic-playbook:campaign-editor
- TKT-1018: diagnostic-playbook:flow-trigger
- TKT-1018: knowledge-article:event-tracking-debugging
- TKT-1018: knowledge-article:product-feedback
- TKT-1018: knowledge-article:profile-sync-issues
- TKT-1018: knowledge-article:sms-compliance
- TKT-1018: knowledge-article:support-operations-playbook
- TKT-1018: knowledge-article:webhook-signature-validation
- TKT-1018: known-cause:sms-stop-sync-delay
- TKT-1018: known-cause:track-api-local-time-timestamp
- TKT-1018: known-cause:webhook-delivery-latency
- TKT-1018: known-cause:webhook-secret-rotation

## Reviewed contrast families

- webhook rotation/latency
- SMS quiet-hours/consent delay
- Shopify mapping/general sync
- editor session/platform loading

## Notes

Semantic quality evidence is outstanding because no live or cached embedding provider was configured. Lexical metrics are deterministic and the corpus/oracle hashes freeze this run's identity.
