# B3 hybrid retrieval evaluation

- Mode: live-embeddings
- Semantic evidence: measured
- Source commit: 64a46bb5cee7043e482e0cb9d00ff0a5ff31cfbb
- Oracle hash: d3e9d25d6ae708f85cbfe11231f1b24c127beeeb3684adc392d2535e744a1b09
- Synthetic scenario hash: b03944b31f33fd47373658c47df40dce714910a2f08e70dacadb3d857df4d497
- Synthetic scenario count: 1
- Scenario cutoff: 2026-09-12T23:59:59.999Z
- Corpus hash: 1dd1ccb213252a34bb777e46c7d628c447a45bd192c6cf03ac3d1f1d95850476
- Index generation: 1
- Lexical generation: 1
- Semantic generation: 1
- Representation version: 2
- FTS tokenization: unicode-letter-number-v1; quoted OR terms; max 128 tokens
- Model: {"id":"qwen3-embedding:0.6b","revision":"ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d","dimensions":1024}
- Semantic query formatting: {"kind":"qwen3-retrieval-instruction-v1","instruction":"Given a support ticket, retrieve relevant support resources.","template":"Instruct: {instruction}\\n Query:{query}"}
- Timings (ms): {"total":5947.2439,"refresh":5185.3072999999995,"retrieval":557.8199000000004,"embedding":5636.603600000001,"embeddingCalls":12,"embeddingInputs":42}
- K budget: {"knowledge-article":{"lexical":5,"semantic":5},"known-cause":{"lexical":5,"semantic":5},"diagnostic-playbook":{"lexical":5,"semantic":5},"resolved-ticket":{"lexical":5,"semantic":5}}
- Channel statuses: {"lexical":"available","semantic":"measured"}
- Scenarios: 9
- Excluded from complete precision: 3
- Semantic-unavailable scenarios: 0

## Candidate pools

| Ticket | Pool size | Candidate recall | Required coverage | Unjudged hits |
|---|---:|---:|---:|---:|
| TKT-1017 | 17 | 1 | 1 | 14 |
| TKT-1028 | 18 | 1 | 1 | 15 |
| TKT-1010 | 22 | 1 | n/a | 20 |
| TKT-1020 | 19 | 1 | 1 | 16 |
| TKT-1023 | 19 | 1 | 1 | 16 |
| TKT-1024 | 20 | 1 | n/a | 19 |
| TKT-1007 | 20 | 1 | 1 | 17 |
| TKT-1018 | 17 | 1 | 1 | 14 |
| TKT-1031 | 22 | 1 | n/a | 20 |

## Per-representation provenance

| Ticket | Resource | Channel | Representation | Rank | Score |
|---|---|---|---|---:|---:|
| TKT-1017 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 33 | -0.0000014592290086613114 |
| TKT-1017 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 27 | 0.31143166302062875 |
| TKT-1017 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 14 | -1.2652925202528726 |
| TKT-1017 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 15 | 0.373891687698818 |
| TKT-1017 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 20 | -0.9881717285134475 |
| TKT-1017 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 13 | 0.38672722061501946 |
| TKT-1017 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 6 | -5.743522903669345 |
| TKT-1017 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 12 | 0.4013090571088496 |
| TKT-1017 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 5 | -7.296759180174303 |
| TKT-1017 | knowledge-article:campaign-send-failures | semantic | knowledge-article:campaign-send-failures:section:0 | 4 | 0.5540524412737106 |
| TKT-1017 | knowledge-article:email-deliverability | lexical | knowledge-article:email-deliverability:section:0 | 9 | -2.9738603575062634 |
| TKT-1017 | knowledge-article:email-deliverability | semantic | knowledge-article:email-deliverability:section:0 | 9 | 0.4399666798650933 |
| TKT-1017 | knowledge-article:flow-trigger-troubleshooting | semantic | knowledge-article:flow-trigger-troubleshooting:section:0 | 16 | 0.37159721594003914 |
| TKT-1017 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 10 | -1.940069575503219 |
| TKT-1017 | knowledge-article:sms-compliance | lexical | knowledge-article:sms-compliance:section:0 | 2 | -20.696153395928352 |
| TKT-1017 | knowledge-article:sms-compliance | semantic | knowledge-article:sms-compliance:section:0 | 2 | 0.7208094353148162 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 3 | -14.0620355071259 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 4 | -11.170209080677749 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 7 | -4.117432534054373 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 17 | -1.164519025430783 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 23 | -0.7370689884765635 |
| TKT-1017 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 30 | -0.0000045696455331335535 |
| TKT-1017 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 5 | 0.5450093979466492 |
| TKT-1017 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 6 | 0.46152778683697676 |
| TKT-1017 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 8 | 0.4429354263976478 |
| TKT-1017 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 18 | 0.35241168104524123 |
| TKT-1017 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 24 | 0.3257651043498968 |
| TKT-1017 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 25 | 0.3173136088189297 |
| TKT-1017 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 1 | -31.25472749086402 |
| TKT-1017 | known-cause:sms-quiet-hours | semantic | known-cause:sms-quiet-hours:canonical:0 | 1 | 0.8935889082397611 |
| TKT-1017 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 8 | -3.360904940223339 |
| TKT-1017 | known-cause:sms-stop-sync-delay | semantic | known-cause:sms-stop-sync-delay:canonical:0 | 3 | 0.6555982389984898 |
| TKT-1017 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 19 | -1.0334884328707759 |
| TKT-1017 | known-cause:track-api-local-time-timestamp | semantic | known-cause:track-api-local-time-timestamp:canonical:0 | 11 | 0.4258851809157049 |
| TKT-1017 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 12 | -1.3198824680204038 |
| TKT-1017 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 7 | 0.44980265316454715 |
| TKT-1017 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 16 | -1.177327097219393 |
| TKT-1017 | known-cause:webhook-secret-rotation | semantic | known-cause:webhook-secret-rotation:canonical:0 | 10 | 0.4306977948295309 |
| TKT-1028 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 33 | -0.0000014592290086613114 |
| TKT-1028 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 27 | 0.3188188335679612 |
| TKT-1028 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 32 | -0.0000014657410746483954 |
| TKT-1028 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 20 | 0.3625190558918156 |
| TKT-1028 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 4 | -5.945268492796047 |
| TKT-1028 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 2 | 0.6769996224200808 |
| TKT-1028 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 23 | -0.7252255938660547 |
| TKT-1028 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 11 | 0.48494151655923384 |
| TKT-1028 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 9 | -2.824118193398057 |
| TKT-1028 | knowledge-article:email-deliverability | semantic | knowledge-article:email-deliverability:section:0 | 15 | 0.4158789500780604 |
| TKT-1028 | knowledge-article:event-tracking-debugging | semantic | knowledge-article:event-tracking-debugging:section:0 | 10 | 0.49851918751487684 |
| TKT-1028 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 10 | -2.109538834544024 |
| TKT-1028 | knowledge-article:shopify-integration-sync | lexical | knowledge-article:shopify-integration-sync:section:0 | 5 | -4.9898622760067655 |
| TKT-1028 | knowledge-article:shopify-integration-sync | semantic | knowledge-article:shopify-integration-sync:section:0 | 6 | 0.5384067898389453 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 1 | -9.553162647114094 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 6 | -4.586726159482853 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 8 | -3.456961618794181 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 11 | -2.0849360687694536 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 15 | -1.5584367922273281 |
| TKT-1028 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 30 | -0.0000031136812219535006 |
| TKT-1028 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 5 | 0.5538820905953703 |
| TKT-1028 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 7 | 0.5340004336692726 |
| TKT-1028 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 13 | 0.46390566050837384 |
| TKT-1028 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 17 | 0.38023609460915997 |
| TKT-1028 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 21 | 0.3601018405096449 |
| TKT-1028 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 28 | 0.3112088177872646 |
| TKT-1028 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 2 | -9.297001220529225 |
| TKT-1028 | knowledge-article:webhook-signature-validation | semantic | knowledge-article:webhook-signature-validation:section:0 | 4 | 0.611619222003995 |
| TKT-1028 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 13 | -1.6444830235838772 |
| TKT-1028 | known-cause:shopify-custom-field-mapping | semantic | known-cause:shopify-custom-field-mapping:canonical:0 | 12 | 0.4837142557267803 |
| TKT-1028 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 24 | -0.4829744771501674 |
| TKT-1028 | known-cause:sms-stop-sync-delay | semantic | known-cause:sms-stop-sync-delay:canonical:0 | 9 | 0.511331573796815 |
| TKT-1028 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 22 | -0.7637236920904391 |
| TKT-1028 | known-cause:track-api-local-time-timestamp | semantic | known-cause:track-api-local-time-timestamp:canonical:0 | 8 | 0.5128430130908873 |
| TKT-1028 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 3 | -9.247422562184193 |
| TKT-1028 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 1 | 0.8456601851479228 |
| TKT-1028 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 7 | -3.74699503065994 |
| TKT-1028 | known-cause:webhook-secret-rotation | semantic | known-cause:webhook-secret-rotation:canonical:0 | 3 | 0.6477837775006445 |
| TKT-1010 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 6 | 0.4453070817666603 |
| TKT-1010 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 2 | -3.544775376007298 |
| TKT-1010 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 5 | 0.45347133207931206 |
| TKT-1010 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 7 | 0.44344963045868524 |
| TKT-1010 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 10 | -0.000001867340492735313 |
| TKT-1010 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 2 | 0.46685482048120186 |
| TKT-1010 | knowledge-article:account-access | semantic | knowledge-article:account-access:section:0 | 16 | 0.38983418401332653 |
| TKT-1010 | knowledge-article:email-deliverability | lexical | knowledge-article:email-deliverability:section:0 | 6 | -1.8321382543338192 |
| TKT-1010 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 4 | -3.0307685768955785 |
| TKT-1010 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 7 | -1.729520683583884 |
| TKT-1010 | knowledge-article:performance-troubleshooting | semantic | knowledge-article:performance-troubleshooting:section:0 | 14 | 0.4011850799899919 |
| TKT-1010 | knowledge-article:product-feedback | semantic | knowledge-article:product-feedback:section:0 | 13 | 0.4124000106725276 |
| TKT-1010 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 5 | -1.8348852745368716 |
| TKT-1010 | knowledge-article:shopify-integration-sync | semantic | knowledge-article:shopify-integration-sync:section:0 | 10 | 0.43499950983856184 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 1 | -5.274194976214735 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 3 | -3.4089989437467034 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 8 | -1.5839979709681344 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 13 | -0.0000013962106167140789 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 20 | -7.549044645137325e-7 |
| TKT-1010 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 21 | -6.784909439946583e-7 |
| TKT-1010 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 12 | 0.4302861370708336 |
| TKT-1010 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 15 | 0.3999336812279444 |
| TKT-1010 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 17 | 0.37787343124728345 |
| TKT-1010 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 18 | 0.37395430065667573 |
| TKT-1010 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 23 | 0.33573373637418935 |
| TKT-1010 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 27 | 0.2965496799433071 |
| TKT-1010 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 16 | -0.0000011401122019635345 |
| TKT-1010 | known-cause:shopify-custom-field-mapping | semantic | known-cause:shopify-custom-field-mapping:canonical:0 | 1 | 0.4705622813769518 |
| TKT-1010 | known-cause:sms-quiet-hours | semantic | known-cause:sms-quiet-hours:canonical:0 | 8 | 0.443270051298077 |
| TKT-1010 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 15 | -0.00000115616555255298 |
| TKT-1010 | known-cause:track-api-local-time-timestamp | semantic | known-cause:track-api-local-time-timestamp:canonical:0 | 4 | 0.4545732841856743 |
| TKT-1010 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 3 | 0.4546389942712648 |
| TKT-1010 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 11 | -0.0000014585417274093348 |
| TKT-1010 | known-cause:webhook-secret-rotation | semantic | known-cause:webhook-secret-rotation:canonical:0 | 9 | 0.4412760556704675 |
| TKT-1020 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 32 | -0.0000014592290086613114 |
| TKT-1020 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 24 | 0.3399961541380736 |
| TKT-1020 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 20 | -1.2652891693077162 |
| TKT-1020 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 13 | 0.44067866147759893 |
| TKT-1020 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 12 | -3.221310791695682 |
| TKT-1020 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 5 | 0.5416625802795514 |
| TKT-1020 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 9 | 0.4598741830575512 |
| TKT-1020 | knowledge-article:campaign-send-failures | semantic | knowledge-article:campaign-send-failures:section:0 | 15 | 0.41709198997209107 |
| TKT-1020 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 1 | -20.011439895783965 |
| TKT-1020 | knowledge-article:coupon-catalog-sync | semantic | knowledge-article:coupon-catalog-sync:section:0 | 2 | 0.644505365623351 |
| TKT-1020 | knowledge-article:product-feedback | lexical | knowledge-article:product-feedback:section:0 | 6 | -6.241965504865301 |
| TKT-1020 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 4 | -8.249899605517198 |
| TKT-1020 | knowledge-article:profile-sync-issues | semantic | knowledge-article:profile-sync-issues:section:0 | 11 | 0.4457758063332803 |
| TKT-1020 | knowledge-article:shopify-integration-sync | lexical | knowledge-article:shopify-integration-sync:section:0 | 2 | -13.203851217279775 |
| TKT-1020 | knowledge-article:shopify-integration-sync | semantic | knowledge-article:shopify-integration-sync:section:0 | 1 | 0.7095083638465973 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 5 | -6.932475874370532 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 7 | -5.897998196610901 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 14 | -2.7705551144720806 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 21 | -1.1645169042658614 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 27 | -0.0000030180875811366075 |
| TKT-1020 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 30 | -0.000002563227254491316 |
| TKT-1020 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 4 | 0.5554965804554031 |
| TKT-1020 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 10 | 0.4535300579739814 |
| TKT-1020 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 12 | 0.44302458686562013 |
| TKT-1020 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 20 | 0.38237517831383433 |
| TKT-1020 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 21 | 0.3578388714451815 |
| TKT-1020 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 30 | 0.2736401556838462 |
| TKT-1020 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 3 | -8.878258338569509 |
| TKT-1020 | known-cause:shopify-custom-field-mapping | semantic | known-cause:shopify-custom-field-mapping:canonical:0 | 3 | 0.6313403256405044 |
| TKT-1020 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 8 | -5.2410202953004275 |
| TKT-1020 | known-cause:sms-quiet-hours | semantic | known-cause:sms-quiet-hours:canonical:0 | 8 | 0.471788732265287 |
| TKT-1020 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 17 | -1.8578382539624232 |
| TKT-1020 | known-cause:sms-stop-sync-delay | semantic | known-cause:sms-stop-sync-delay:canonical:0 | 7 | 0.5129290874253178 |
| TKT-1020 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 15 | -2.7639759053581137 |
| TKT-1020 | known-cause:track-api-local-time-timestamp | semantic | known-cause:track-api-local-time-timestamp:canonical:0 | 14 | 0.44011661041178224 |
| TKT-1020 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 6 | 0.5320874707157934 |
| TKT-1020 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 26 | -0.0000030428157772305593 |
| TKT-1023 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 32 | -0.0000014592290086613114 |
| TKT-1023 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 26 | 0.38109224439755895 |
| TKT-1023 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 27 | -0.0000018852040816326534 |
| TKT-1023 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 13 | 0.4490928504457902 |
| TKT-1023 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 31 | -0.0000014723115236585919 |
| TKT-1023 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 23 | 0.3868758529889305 |
| TKT-1023 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 25 | -0.0000033010897762134208 |
| TKT-1023 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 15 | 0.43776909837492184 |
| TKT-1023 | knowledge-article:api-reference | semantic | knowledge-article:api-reference:section:0 | 10 | 0.47104919599714434 |
| TKT-1023 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 7 | -4.106538136828883 |
| TKT-1023 | knowledge-article:flow-trigger-troubleshooting | lexical | knowledge-article:flow-trigger-troubleshooting:section:0 | 3 | -6.350019786421981 |
| TKT-1023 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 1 | -11.486829204792464 |
| TKT-1023 | knowledge-article:profile-sync-issues | semantic | knowledge-article:profile-sync-issues:section:0 | 1 | 0.6838106069642365 |
| TKT-1023 | knowledge-article:segmentation-audience-rules | lexical | knowledge-article:segmentation-audience-rules:section:0 | 2 | -8.27845621857007 |
| TKT-1023 | knowledge-article:segmentation-audience-rules | semantic | knowledge-article:segmentation-audience-rules:section:0 | 7 | 0.48180199408424285 |
| TKT-1023 | knowledge-article:shopify-integration-sync | semantic | knowledge-article:shopify-integration-sync:section:0 | 6 | 0.5265565153536518 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 4 | -6.002147642857738 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 6 | -4.394807356025191 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 8 | -4.042118945966667 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 9 | -3.9816942974574157 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 21 | -0.000005329024676271007 |
| TKT-1023 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 29 | -0.0000018197386462210033 |
| TKT-1023 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 3 | 0.5550285739843802 |
| TKT-1023 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 8 | 0.4758105234764456 |
| TKT-1023 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 19 | 0.4237245944184946 |
| TKT-1023 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 22 | 0.40154265261413413 |
| TKT-1023 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 25 | 0.38600264065235634 |
| TKT-1023 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 27 | 0.3781849029605671 |
| TKT-1023 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 23 | -0.000004222306315189868 |
| TKT-1023 | known-cause:shopify-custom-field-mapping | semantic | known-cause:shopify-custom-field-mapping:canonical:0 | 4 | 0.5475371115475853 |
| TKT-1023 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 28 | -0.0000018324293100776287 |
| TKT-1023 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 5 | -5.5241422137865515 |
| TKT-1023 | known-cause:sms-stop-sync-delay | semantic | known-cause:sms-stop-sync-delay:canonical:0 | 2 | 0.6090938649586486 |
| TKT-1023 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 17 | -1.8492264260018096 |
| TKT-1023 | known-cause:track-api-local-time-timestamp | semantic | known-cause:track-api-local-time-timestamp:canonical:0 | 12 | 0.4584985829577171 |
| TKT-1023 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 9 | 0.4745023892987454 |
| TKT-1023 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 24 | -0.0000034104728131244776 |
| TKT-1023 | known-cause:webhook-secret-rotation | semantic | known-cause:webhook-secret-rotation:canonical:0 | 5 | 0.5277717857932077 |
| TKT-1024 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 25 | -0.0000029184580173226227 |
| TKT-1024 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 31 | 0.30008165745689125 |
| TKT-1024 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 17 | -1.2652891693077162 |
| TKT-1024 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 8 | 0.4507919106756031 |
| TKT-1024 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 17 | 0.3778627651275129 |
| TKT-1024 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 13 | 0.40421752485927664 |
| TKT-1024 | knowledge-article:billing-and-invoices | semantic | knowledge-article:billing-and-invoices:section:0 | 5 | 0.4725072943963648 |
| TKT-1024 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 5 | -5.018819148595635 |
| TKT-1024 | knowledge-article:campaign-send-failures | semantic | knowledge-article:campaign-send-failures:section:0 | 2 | 0.5373548064762845 |
| TKT-1024 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 1 | -8.133234673062907 |
| TKT-1024 | knowledge-article:coupon-catalog-sync | semantic | knowledge-article:coupon-catalog-sync:section:0 | 1 | 0.5908974080476291 |
| TKT-1024 | knowledge-article:segmentation-audience-rules | lexical | knowledge-article:segmentation-audience-rules:section:0 | 3 | -5.8590028913097365 |
| TKT-1024 | knowledge-article:sms-compliance | semantic | knowledge-article:sms-compliance:section:0 | 12 | 0.4115533661768807 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 2 | -6.372111225681847 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 4 | -5.454075783644428 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 10 | -2.6713219985917087 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 18 | -1.098174075257997 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 30 | -0.0000018197386462210033 |
| TKT-1024 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 31 | -0.0000014650476469395573 |
| TKT-1024 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 9 | 0.44477529426355833 |
| TKT-1024 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 10 | 0.44103227166503134 |
| TKT-1024 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 19 | 0.36801426093401474 |
| TKT-1024 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 22 | 0.3601093915776539 |
| TKT-1024 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 23 | 0.3598475318642868 |
| TKT-1024 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 25 | 0.3331934577748114 |
| TKT-1024 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 7 | -4.28819928468561 |
| TKT-1024 | known-cause:shopify-custom-field-mapping | semantic | known-cause:shopify-custom-field-mapping:canonical:0 | 11 | 0.4148054202445439 |
| TKT-1024 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 6 | -4.9639697381750345 |
| TKT-1024 | known-cause:sms-quiet-hours | semantic | known-cause:sms-quiet-hours:canonical:0 | 6 | 0.4717591558516794 |
| TKT-1024 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 19 | -1.0953327145169682 |
| TKT-1024 | known-cause:sms-stop-sync-delay | semantic | known-cause:sms-stop-sync-delay:canonical:0 | 3 | 0.494419173033472 |
| TKT-1024 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 9 | -3.3952114733595757 |
| TKT-1024 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 22 | -0.0000032695372515445087 |
| TKT-1024 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 7 | 0.4645539879717756 |
| TKT-1024 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 11 | -2.361727726439652 |
| TKT-1024 | known-cause:webhook-secret-rotation | semantic | known-cause:webhook-secret-rotation:canonical:0 | 4 | 0.4866508763424678 |
| TKT-1007 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 31 | -0.0000014592290086613114 |
| TKT-1007 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 21 | 0.3691418763418614 |
| TKT-1007 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 28 | 0.3336720675508906 |
| TKT-1007 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 11 | -1.8584130188825598 |
| TKT-1007 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 18 | 0.39114555253376154 |
| TKT-1007 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 10 | 0.43195765193726726 |
| TKT-1007 | knowledge-article:api-reference | semantic | knowledge-article:api-reference:section:0 | 8 | 0.45415162073033855 |
| TKT-1007 | knowledge-article:authentication | semantic | knowledge-article:authentication:section:0 | 14 | 0.4140407214199482 |
| TKT-1007 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 6 | -3.7388349008051205 |
| TKT-1007 | knowledge-article:event-tracking-debugging | lexical | knowledge-article:event-tracking-debugging:section:0 | 7 | -2.805542132807998 |
| TKT-1007 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 8 | -2.6013871390078447 |
| TKT-1007 | knowledge-article:shopify-integration-sync | semantic | knowledge-article:shopify-integration-sync:section:0 | 9 | 0.4358185861935814 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 3 | -11.771014493743762 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 4 | -9.078641962096127 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 9 | -2.330798939626926 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 10 | -2.0849343241148595 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 12 | -1.806678230037901 |
| TKT-1007 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 13 | -1.7284809434874375 |
| TKT-1007 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 4 | 0.5621724416480995 |
| TKT-1007 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 5 | 0.5452028005086386 |
| TKT-1007 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 7 | 0.46192769961436786 |
| TKT-1007 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 15 | 0.4011118153281392 |
| TKT-1007 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 24 | 0.34459286400025113 |
| TKT-1007 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 26 | 0.33867071793984965 |
| TKT-1007 | knowledge-article:webhook-signature-validation | lexical | knowledge-article:webhook-signature-validation:section:0 | 1 | -14.029205359152932 |
| TKT-1007 | knowledge-article:webhook-signature-validation | semantic | knowledge-article:webhook-signature-validation:section:0 | 2 | 0.8272781175841695 |
| TKT-1007 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 14 | -1.6444813440384227 |
| TKT-1007 | known-cause:shopify-custom-field-mapping | semantic | known-cause:shopify-custom-field-mapping:canonical:0 | 12 | 0.42353721470721883 |
| TKT-1007 | known-cause:sms-quiet-hours | semantic | known-cause:sms-quiet-hours:canonical:0 | 11 | 0.4303908219816771 |
| TKT-1007 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 26 | -0.000001912255939778876 |
| TKT-1007 | known-cause:sms-stop-sync-delay | semantic | known-cause:sms-stop-sync-delay:canonical:0 | 6 | 0.48995415722222746 |
| TKT-1007 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 25 | -0.0000019209871125102333 |
| TKT-1007 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 5 | -8.475102377255123 |
| TKT-1007 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 3 | 0.6229254561768451 |
| TKT-1007 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 2 | -11.847805586828414 |
| TKT-1007 | known-cause:webhook-secret-rotation | semantic | known-cause:webhook-secret-rotation:canonical:0 | 1 | 0.8688178225418909 |
| TKT-1018 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 31 | -0.0000014592290086613114 |
| TKT-1018 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 25 | 0.31291399656732544 |
| TKT-1018 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 9 | -3.544775376007298 |
| TKT-1018 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 21 | 0.34509015293222256 |
| TKT-1018 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 16 | 0.37150808060957047 |
| TKT-1018 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 26 | -0.000001867340492735313 |
| TKT-1018 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 9 | 0.41321481580358915 |
| TKT-1018 | knowledge-article:coupon-catalog-sync | lexical | knowledge-article:coupon-catalog-sync:section:0 | 6 | -4.489956766714242 |
| TKT-1018 | knowledge-article:coupon-catalog-sync | semantic | knowledge-article:coupon-catalog-sync:section:0 | 5 | 0.5051214343197733 |
| TKT-1018 | knowledge-article:event-tracking-debugging | semantic | knowledge-article:event-tracking-debugging:section:0 | 8 | 0.4243721499151952 |
| TKT-1018 | knowledge-article:product-feedback | lexical | knowledge-article:product-feedback:section:0 | 7 | -4.295460806208722 |
| TKT-1018 | knowledge-article:profile-sync-issues | lexical | knowledge-article:profile-sync-issues:section:0 | 5 | -7.201440711586065 |
| TKT-1018 | knowledge-article:profile-sync-issues | semantic | knowledge-article:profile-sync-issues:section:0 | 4 | 0.5212807967296734 |
| TKT-1018 | knowledge-article:shopify-integration-sync | lexical | knowledge-article:shopify-integration-sync:section:0 | 3 | -11.266226676364719 |
| TKT-1018 | knowledge-article:shopify-integration-sync | semantic | knowledge-article:shopify-integration-sync:section:0 | 2 | 0.7174877953227733 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 2 | -13.074353836450998 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 4 | -8.519564300347573 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 8 | -4.007022052349632 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 12 | -2.0849355580015874 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 16 | -1.7284809434874375 |
| TKT-1018 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 21 | -0.0000029300952938791146 |
| TKT-1018 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 3 | 0.5242330005672633 |
| TKT-1018 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 6 | 0.48158081970875666 |
| TKT-1018 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 12 | 0.37793079086157005 |
| TKT-1018 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 17 | 0.36891735016351496 |
| TKT-1018 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 20 | 0.3478259780953993 |
| TKT-1018 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 22 | 0.334899460139709 |
| TKT-1018 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 1 | -16.987690930871604 |
| TKT-1018 | known-cause:shopify-custom-field-mapping | semantic | known-cause:shopify-custom-field-mapping:canonical:0 | 1 | 0.7940401760106195 |
| TKT-1018 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 14 | -1.8578394101279758 |
| TKT-1018 | known-cause:sms-stop-sync-delay | semantic | known-cause:sms-stop-sync-delay:canonical:0 | 7 | 0.43985085054487466 |
| TKT-1018 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 24 | -0.0000019209871125102333 |
| TKT-1018 | known-cause:track-api-local-time-timestamp | semantic | known-cause:track-api-local-time-timestamp:canonical:0 | 14 | 0.3771353346694697 |
| TKT-1018 | known-cause:webhook-delivery-latency | lexical | known-cause:webhook-delivery-latency:canonical:0 | 18 | -1.6275324904335302 |
| TKT-1018 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 10 | 0.4099734988459383 |
| TKT-1018 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 19 | -0.0000034104728131244776 |
| TKT-1018 | known-cause:webhook-secret-rotation | semantic | known-cause:webhook-secret-rotation:canonical:0 | 11 | 0.3897394783754555 |
| TKT-1031 | diagnostic-playbook:article-backed | lexical | diagnostic-playbook:article-backed:canonical:0 | 33 | -0.0000014592290086613114 |
| TKT-1031 | diagnostic-playbook:article-backed | semantic | diagnostic-playbook:article-backed:canonical:0 | 21 | 0.404120099189705 |
| TKT-1031 | diagnostic-playbook:campaign-editor | lexical | diagnostic-playbook:campaign-editor:canonical:0 | 3 | -13.392063684891177 |
| TKT-1031 | diagnostic-playbook:campaign-editor | semantic | diagnostic-playbook:campaign-editor:canonical:0 | 1 | 0.837400405242301 |
| TKT-1031 | diagnostic-playbook:event-processing-delay | lexical | diagnostic-playbook:event-processing-delay:canonical:0 | 31 | -0.0000029446230473171838 |
| TKT-1031 | diagnostic-playbook:event-processing-delay | semantic | diagnostic-playbook:event-processing-delay:canonical:0 | 5 | 0.47458733064475134 |
| TKT-1031 | diagnostic-playbook:flow-trigger | lexical | diagnostic-playbook:flow-trigger:canonical:0 | 32 | -0.000001867340492735313 |
| TKT-1031 | diagnostic-playbook:flow-trigger | semantic | diagnostic-playbook:flow-trigger:canonical:0 | 4 | 0.514892944355027 |
| TKT-1031 | knowledge-article:authentication | lexical | knowledge-article:authentication:section:0 | 2 | -13.396563271466439 |
| TKT-1031 | knowledge-article:campaign-send-failures | lexical | knowledge-article:campaign-send-failures:section:0 | 9 | -3.4974472420350375 |
| TKT-1031 | knowledge-article:campaign-send-failures | semantic | knowledge-article:campaign-send-failures:section:0 | 2 | 0.5727899117206762 |
| TKT-1031 | knowledge-article:coupon-catalog-sync | semantic | knowledge-article:coupon-catalog-sync:section:0 | 10 | 0.4604671696921264 |
| TKT-1031 | knowledge-article:flow-trigger-troubleshooting | semantic | knowledge-article:flow-trigger-troubleshooting:section:0 | 13 | 0.43075368327173 |
| TKT-1031 | knowledge-article:performance-troubleshooting | lexical | knowledge-article:performance-troubleshooting:section:0 | 1 | -14.917648555122023 |
| TKT-1031 | knowledge-article:performance-troubleshooting | semantic | knowledge-article:performance-troubleshooting:section:0 | 3 | 0.5260711075706096 |
| TKT-1031 | knowledge-article:security-incident-response | lexical | knowledge-article:security-incident-response:section:0 | 8 | -4.10423793110812 |
| TKT-1031 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:2 | 5 | -4.95624133692041 |
| TKT-1031 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:3 | 6 | -4.510900262704638 |
| TKT-1031 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:1 | 7 | -4.314175117732113 |
| TKT-1031 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:5 | 12 | -3.3906785809511786 |
| TKT-1031 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:4 | 16 | -2.401186084770788 |
| TKT-1031 | knowledge-article:support-operations-playbook | lexical | knowledge-article:support-operations-playbook:section:0 | 28 | -0.000005767994468049158 |
| TKT-1031 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:2 | 7 | 0.4706022865037153 |
| TKT-1031 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:3 | 12 | 0.4516713818810429 |
| TKT-1031 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:0 | 20 | 0.40584650841904263 |
| TKT-1031 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:4 | 22 | 0.37971014855764057 |
| TKT-1031 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:1 | 24 | 0.375491957661404 |
| TKT-1031 | knowledge-article:support-operations-playbook | semantic | knowledge-article:support-operations-playbook:section:5 | 26 | 0.3727024887208768 |
| TKT-1031 | known-cause:shopify-custom-field-mapping | lexical | known-cause:shopify-custom-field-mapping:canonical:0 | 27 | -0.000007041963971698858 |
| TKT-1031 | known-cause:shopify-custom-field-mapping | semantic | known-cause:shopify-custom-field-mapping:canonical:0 | 9 | 0.4651196836760802 |
| TKT-1031 | known-cause:sms-quiet-hours | lexical | known-cause:sms-quiet-hours:canonical:0 | 4 | -7.0556276786641225 |
| TKT-1031 | known-cause:sms-quiet-hours | semantic | known-cause:sms-quiet-hours:canonical:0 | 6 | 0.4726104558872266 |
| TKT-1031 | known-cause:sms-stop-sync-delay | lexical | known-cause:sms-stop-sync-delay:canonical:0 | 29 | -0.000004943768153092321 |
| TKT-1031 | known-cause:sms-stop-sync-delay | semantic | known-cause:sms-stop-sync-delay:canonical:0 | 14 | 0.4307244389359961 |
| TKT-1031 | known-cause:track-api-local-time-timestamp | lexical | known-cause:track-api-local-time-timestamp:canonical:0 | 13 | -3.3553234136575605 |
| TKT-1031 | known-cause:webhook-delivery-latency | semantic | known-cause:webhook-delivery-latency:canonical:0 | 8 | 0.46649521362125124 |
| TKT-1031 | known-cause:webhook-secret-rotation | lexical | known-cause:webhook-secret-rotation:canonical:0 | 19 | -1.6023774575093037 |
| TKT-1031 | known-cause:webhook-secret-rotation | semantic | known-cause:webhook-secret-rotation:canonical:0 | 11 | 0.4580718936449753 |

## Per-type metrics

| Type | Scenarios | Lexical R@1 | Lexical R@3 | Lexical R@5 | Lexical P@1 | Lexical P@3 | Lexical P@5 | Semantic R@1 | Semantic R@3 | Semantic R@5 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| diagnostic-playbook | 2 | 1 | 1 | 1 | n/a | n/a | n/a | 0.5 | 1 | 1 |
| knowledge-article | 9 | 0.5555555555555556 | 0.8888888888888888 | 0.8888888888888888 | 0.5 | 0.3333333333333333 | 0.19999999999999998 | 0.7777777777777778 | 0.8888888888888888 | 1 |
| known-cause | 6 | 1 | 1 | 1 | 1 | 0.3333333333333333 | 0.19999999999999998 | 1 | 1 | 1 |
| resolved-ticket | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Per-family metrics

| Family | Scenarios | Candidate recall | Required coverage |
|---|---:|---:|---:|
| ambiguity | 1 | 1 | n/a |
| campaign-coupons | 1 | 1 | n/a |
| consent-sync | 1 | 1 | 1 |
| known-cause | 1 | 1 | 1 |
| shopify-catalog | 2 | 1 | 1 |
| sms-compliance | 1 | 1 | 1 |
| synthetic-browser-session | 1 | 1 | n/a |
| webhooks | 1 | 1 | 1 |

## Baseline comparison

- {"deterministicArticleRequiredCoverage":1,"unionRequiredCoverage":1,"scenariosCompared":6,"unsupportedResourceFamilies":["known-cause","diagnostic-playbook","resolved-ticket"]}

## Reference channel pools

| Channel | Kind | Scenarios | Candidate recall | Required coverage | Excluded recall | Excluded required | Provenance |
|---|---|---:|---:|---:|---:|---:|---|
| deterministic | unordered-pool | 9 | 0.6666666666666666 | 1 | 0 | 3 | deterministic classifier associations |
| knownCause | unordered-pool | 9 | 0.3333333333333333 | 1 | 0 | 3 | direct approved links from retrieved known causes |

## Retrieval, corpus, and oracle-review gaps

- Retrieval misses: None.
- Corpus gaps: TKT-1017:diagnostic-playbook, TKT-1028:diagnostic-playbook, TKT-1020:diagnostic-playbook, TKT-1023:diagnostic-playbook, TKT-1024:resolved-ticket, TKT-1007:diagnostic-playbook, TKT-1018:diagnostic-playbook
- Oracle-review candidates: TKT-1017:diagnostic-playbook:article-backed, TKT-1017:diagnostic-playbook:campaign-editor, TKT-1017:diagnostic-playbook:event-processing-delay, TKT-1017:diagnostic-playbook:flow-trigger, TKT-1017:knowledge-article:campaign-send-failures, TKT-1017:knowledge-article:email-deliverability, TKT-1017:knowledge-article:event-tracking-debugging, TKT-1017:knowledge-article:flow-trigger-troubleshooting, TKT-1017:knowledge-article:profile-sync-issues, TKT-1017:knowledge-article:support-operations-playbook, TKT-1017:knowledge-article:webhook-signature-validation, TKT-1017:known-cause:track-api-local-time-timestamp, TKT-1017:known-cause:webhook-delivery-latency, TKT-1017:known-cause:webhook-secret-rotation, TKT-1028:diagnostic-playbook:article-backed, TKT-1028:diagnostic-playbook:campaign-editor, TKT-1028:diagnostic-playbook:event-processing-delay, TKT-1028:diagnostic-playbook:flow-trigger, TKT-1028:knowledge-article:coupon-catalog-sync, TKT-1028:knowledge-article:email-deliverability, TKT-1028:knowledge-article:event-tracking-debugging, TKT-1028:knowledge-article:flow-trigger-troubleshooting, TKT-1028:knowledge-article:profile-sync-issues, TKT-1028:knowledge-article:shopify-integration-sync, TKT-1028:knowledge-article:sms-compliance, TKT-1028:knowledge-article:support-operations-playbook, TKT-1028:known-cause:shopify-custom-field-mapping, TKT-1028:known-cause:sms-stop-sync-delay, TKT-1028:known-cause:track-api-local-time-timestamp, TKT-1010:diagnostic-playbook:article-backed, TKT-1010:diagnostic-playbook:event-processing-delay, TKT-1010:diagnostic-playbook:flow-trigger, TKT-1010:knowledge-article:account-access, TKT-1010:knowledge-article:email-deliverability, TKT-1010:knowledge-article:event-tracking-debugging, TKT-1010:knowledge-article:flow-trigger-troubleshooting, TKT-1010:knowledge-article:product-feedback, TKT-1010:knowledge-article:profile-sync-issues, TKT-1010:knowledge-article:security-incident-response, TKT-1010:knowledge-article:shopify-integration-sync, TKT-1010:knowledge-article:sms-compliance, TKT-1010:knowledge-article:support-operations-playbook, TKT-1010:knowledge-article:webhook-signature-validation, TKT-1010:known-cause:shopify-custom-field-mapping, TKT-1010:known-cause:sms-quiet-hours, TKT-1010:known-cause:sms-stop-sync-delay, TKT-1010:known-cause:track-api-local-time-timestamp, TKT-1010:known-cause:webhook-delivery-latency, TKT-1010:known-cause:webhook-secret-rotation, TKT-1020:diagnostic-playbook:article-backed, TKT-1020:diagnostic-playbook:campaign-editor, TKT-1020:diagnostic-playbook:event-processing-delay, TKT-1020:diagnostic-playbook:flow-trigger, TKT-1020:knowledge-article:campaign-send-failures, TKT-1020:knowledge-article:event-tracking-debugging, TKT-1020:knowledge-article:product-feedback, TKT-1020:knowledge-article:profile-sync-issues, TKT-1020:knowledge-article:sms-compliance, TKT-1020:knowledge-article:support-operations-playbook, TKT-1020:knowledge-article:webhook-signature-validation, TKT-1020:known-cause:sms-quiet-hours, TKT-1020:known-cause:sms-stop-sync-delay, TKT-1020:known-cause:track-api-local-time-timestamp, TKT-1020:known-cause:webhook-delivery-latency, TKT-1020:known-cause:webhook-secret-rotation, TKT-1023:diagnostic-playbook:article-backed, TKT-1023:diagnostic-playbook:campaign-editor, TKT-1023:diagnostic-playbook:event-processing-delay, TKT-1023:diagnostic-playbook:flow-trigger, TKT-1023:knowledge-article:api-reference, TKT-1023:knowledge-article:event-tracking-debugging, TKT-1023:knowledge-article:flow-trigger-troubleshooting, TKT-1023:knowledge-article:segmentation-audience-rules, TKT-1023:knowledge-article:shopify-integration-sync, TKT-1023:knowledge-article:sms-compliance, TKT-1023:knowledge-article:support-operations-playbook, TKT-1023:knowledge-article:webhook-signature-validation, TKT-1023:known-cause:shopify-custom-field-mapping, TKT-1023:known-cause:track-api-local-time-timestamp, TKT-1023:known-cause:webhook-delivery-latency, TKT-1023:known-cause:webhook-secret-rotation, TKT-1024:diagnostic-playbook:article-backed, TKT-1024:diagnostic-playbook:campaign-editor, TKT-1024:diagnostic-playbook:event-processing-delay, TKT-1024:diagnostic-playbook:flow-trigger, TKT-1024:knowledge-article:billing-and-invoices, TKT-1024:knowledge-article:campaign-send-failures, TKT-1024:knowledge-article:event-tracking-debugging, TKT-1024:knowledge-article:profile-sync-issues, TKT-1024:knowledge-article:segmentation-audience-rules, TKT-1024:knowledge-article:shopify-integration-sync, TKT-1024:knowledge-article:sms-compliance, TKT-1024:knowledge-article:support-operations-playbook, TKT-1024:knowledge-article:webhook-signature-validation, TKT-1024:known-cause:shopify-custom-field-mapping, TKT-1024:known-cause:sms-quiet-hours, TKT-1024:known-cause:sms-stop-sync-delay, TKT-1024:known-cause:track-api-local-time-timestamp, TKT-1024:known-cause:webhook-delivery-latency, TKT-1024:known-cause:webhook-secret-rotation, TKT-1007:diagnostic-playbook:article-backed, TKT-1007:diagnostic-playbook:campaign-editor, TKT-1007:diagnostic-playbook:event-processing-delay, TKT-1007:diagnostic-playbook:flow-trigger, TKT-1007:knowledge-article:api-reference, TKT-1007:knowledge-article:authentication, TKT-1007:knowledge-article:campaign-send-failures, TKT-1007:knowledge-article:event-tracking-debugging, TKT-1007:knowledge-article:profile-sync-issues, TKT-1007:knowledge-article:security-incident-response, TKT-1007:knowledge-article:shopify-integration-sync, TKT-1007:knowledge-article:sms-compliance, TKT-1007:knowledge-article:support-operations-playbook, TKT-1007:known-cause:shopify-custom-field-mapping, TKT-1007:known-cause:sms-quiet-hours, TKT-1007:known-cause:sms-stop-sync-delay, TKT-1007:known-cause:track-api-local-time-timestamp, TKT-1018:diagnostic-playbook:article-backed, TKT-1018:diagnostic-playbook:campaign-editor, TKT-1018:diagnostic-playbook:event-processing-delay, TKT-1018:diagnostic-playbook:flow-trigger, TKT-1018:knowledge-article:event-tracking-debugging, TKT-1018:knowledge-article:product-feedback, TKT-1018:knowledge-article:profile-sync-issues, TKT-1018:knowledge-article:sms-compliance, TKT-1018:knowledge-article:support-operations-playbook, TKT-1018:knowledge-article:webhook-signature-validation, TKT-1018:known-cause:sms-stop-sync-delay, TKT-1018:known-cause:track-api-local-time-timestamp, TKT-1018:known-cause:webhook-delivery-latency, TKT-1018:known-cause:webhook-secret-rotation, TKT-1031:diagnostic-playbook:article-backed, TKT-1031:diagnostic-playbook:event-processing-delay, TKT-1031:diagnostic-playbook:flow-trigger, TKT-1031:knowledge-article:authentication, TKT-1031:knowledge-article:campaign-send-failures, TKT-1031:knowledge-article:coupon-catalog-sync, TKT-1031:knowledge-article:event-tracking-debugging, TKT-1031:knowledge-article:flow-trigger-troubleshooting, TKT-1031:knowledge-article:profile-sync-issues, TKT-1031:knowledge-article:security-incident-response, TKT-1031:knowledge-article:shopify-integration-sync, TKT-1031:knowledge-article:sms-compliance, TKT-1031:knowledge-article:support-operations-playbook, TKT-1031:knowledge-article:webhook-signature-validation, TKT-1031:known-cause:shopify-custom-field-mapping, TKT-1031:known-cause:sms-quiet-hours, TKT-1031:known-cause:sms-stop-sync-delay, TKT-1031:known-cause:track-api-local-time-timestamp, TKT-1031:known-cause:webhook-delivery-latency, TKT-1031:known-cause:webhook-secret-rotation

## Approved contrast coverage

| Contrast family | Status | Scenarios | Tickets |
|---|---|---:|---|
| webhook rotation/latency | covered | 2 | TKT-1007, TKT-1028 |
| SMS quiet-hours/consent delay | covered | 2 | TKT-1017, TKT-1023 |
| Shopify mapping/general sync | covered | 2 | TKT-1018, TKT-1020 |
| editor session/platform loading | covered | 2 | TKT-1010, TKT-1031 |

## Resolved-case evaluation

- {"status":"corpus-gap","reviewedScenarioTickets":["TKT-1024"],"eligibleCaseCount":0,"futureCasesExcluded":0,"selfTicketExclusion":"enforced at retrieval query time"}

## Corpus coverage

- {"knowledge-article":{"adequate":9},"known-cause":{"adequate":6,"uncertain":2,"not-expected":1},"diagnostic-playbook":{"missing":6,"adequate":2,"uncertain":1},"resolved-ticket":{"not-expected":8,"missing":1}}

## Unjudged hits

- Count: 151
- TKT-1017: diagnostic-playbook:article-backed
- TKT-1017: diagnostic-playbook:campaign-editor
- TKT-1017: diagnostic-playbook:event-processing-delay
- TKT-1017: diagnostic-playbook:flow-trigger
- TKT-1017: knowledge-article:campaign-send-failures
- TKT-1017: knowledge-article:email-deliverability
- TKT-1017: knowledge-article:event-tracking-debugging
- TKT-1017: knowledge-article:flow-trigger-troubleshooting
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
- TKT-1028: knowledge-article:email-deliverability
- TKT-1028: knowledge-article:event-tracking-debugging
- TKT-1028: knowledge-article:flow-trigger-troubleshooting
- TKT-1028: knowledge-article:profile-sync-issues
- TKT-1028: knowledge-article:shopify-integration-sync
- TKT-1028: knowledge-article:sms-compliance
- TKT-1028: knowledge-article:support-operations-playbook
- TKT-1028: known-cause:shopify-custom-field-mapping
- TKT-1028: known-cause:sms-stop-sync-delay
- TKT-1028: known-cause:track-api-local-time-timestamp
- TKT-1010: diagnostic-playbook:article-backed
- TKT-1010: diagnostic-playbook:event-processing-delay
- TKT-1010: diagnostic-playbook:flow-trigger
- TKT-1010: knowledge-article:account-access
- TKT-1010: knowledge-article:email-deliverability
- TKT-1010: knowledge-article:event-tracking-debugging
- TKT-1010: knowledge-article:flow-trigger-troubleshooting
- TKT-1010: knowledge-article:product-feedback
- TKT-1010: knowledge-article:profile-sync-issues
- TKT-1010: knowledge-article:security-incident-response
- TKT-1010: knowledge-article:shopify-integration-sync
- TKT-1010: knowledge-article:sms-compliance
- TKT-1010: knowledge-article:support-operations-playbook
- TKT-1010: knowledge-article:webhook-signature-validation
- TKT-1010: known-cause:shopify-custom-field-mapping
- TKT-1010: known-cause:sms-quiet-hours
- TKT-1010: known-cause:sms-stop-sync-delay
- TKT-1010: known-cause:track-api-local-time-timestamp
- TKT-1010: known-cause:webhook-delivery-latency
- TKT-1010: known-cause:webhook-secret-rotation
- TKT-1020: diagnostic-playbook:article-backed
- TKT-1020: diagnostic-playbook:campaign-editor
- TKT-1020: diagnostic-playbook:event-processing-delay
- TKT-1020: diagnostic-playbook:flow-trigger
- TKT-1020: knowledge-article:campaign-send-failures
- TKT-1020: knowledge-article:event-tracking-debugging
- TKT-1020: knowledge-article:product-feedback
- TKT-1020: knowledge-article:profile-sync-issues
- TKT-1020: knowledge-article:sms-compliance
- TKT-1020: knowledge-article:support-operations-playbook
- TKT-1020: knowledge-article:webhook-signature-validation
- TKT-1020: known-cause:sms-quiet-hours
- TKT-1020: known-cause:sms-stop-sync-delay
- TKT-1020: known-cause:track-api-local-time-timestamp
- TKT-1020: known-cause:webhook-delivery-latency
- TKT-1020: known-cause:webhook-secret-rotation
- TKT-1023: diagnostic-playbook:article-backed
- TKT-1023: diagnostic-playbook:campaign-editor
- TKT-1023: diagnostic-playbook:event-processing-delay
- TKT-1023: diagnostic-playbook:flow-trigger
- TKT-1023: knowledge-article:api-reference
- TKT-1023: knowledge-article:event-tracking-debugging
- TKT-1023: knowledge-article:flow-trigger-troubleshooting
- TKT-1023: knowledge-article:segmentation-audience-rules
- TKT-1023: knowledge-article:shopify-integration-sync
- TKT-1023: knowledge-article:sms-compliance
- TKT-1023: knowledge-article:support-operations-playbook
- TKT-1023: knowledge-article:webhook-signature-validation
- TKT-1023: known-cause:shopify-custom-field-mapping
- TKT-1023: known-cause:track-api-local-time-timestamp
- TKT-1023: known-cause:webhook-delivery-latency
- TKT-1023: known-cause:webhook-secret-rotation
- TKT-1024: diagnostic-playbook:article-backed
- TKT-1024: diagnostic-playbook:campaign-editor
- TKT-1024: diagnostic-playbook:event-processing-delay
- TKT-1024: diagnostic-playbook:flow-trigger
- TKT-1024: knowledge-article:billing-and-invoices
- TKT-1024: knowledge-article:campaign-send-failures
- TKT-1024: knowledge-article:event-tracking-debugging
- TKT-1024: knowledge-article:profile-sync-issues
- TKT-1024: knowledge-article:segmentation-audience-rules
- TKT-1024: knowledge-article:shopify-integration-sync
- TKT-1024: knowledge-article:sms-compliance
- TKT-1024: knowledge-article:support-operations-playbook
- TKT-1024: knowledge-article:webhook-signature-validation
- TKT-1024: known-cause:shopify-custom-field-mapping
- TKT-1024: known-cause:sms-quiet-hours
- TKT-1024: known-cause:sms-stop-sync-delay
- TKT-1024: known-cause:track-api-local-time-timestamp
- TKT-1024: known-cause:webhook-delivery-latency
- TKT-1024: known-cause:webhook-secret-rotation
- TKT-1007: diagnostic-playbook:article-backed
- TKT-1007: diagnostic-playbook:campaign-editor
- TKT-1007: diagnostic-playbook:event-processing-delay
- TKT-1007: diagnostic-playbook:flow-trigger
- TKT-1007: knowledge-article:api-reference
- TKT-1007: knowledge-article:authentication
- TKT-1007: knowledge-article:campaign-send-failures
- TKT-1007: knowledge-article:event-tracking-debugging
- TKT-1007: knowledge-article:profile-sync-issues
- TKT-1007: knowledge-article:security-incident-response
- TKT-1007: knowledge-article:shopify-integration-sync
- TKT-1007: knowledge-article:sms-compliance
- TKT-1007: knowledge-article:support-operations-playbook
- TKT-1007: known-cause:shopify-custom-field-mapping
- TKT-1007: known-cause:sms-quiet-hours
- TKT-1007: known-cause:sms-stop-sync-delay
- TKT-1007: known-cause:track-api-local-time-timestamp
- TKT-1018: diagnostic-playbook:article-backed
- TKT-1018: diagnostic-playbook:campaign-editor
- TKT-1018: diagnostic-playbook:event-processing-delay
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
- TKT-1031: diagnostic-playbook:article-backed
- TKT-1031: diagnostic-playbook:event-processing-delay
- TKT-1031: diagnostic-playbook:flow-trigger
- TKT-1031: knowledge-article:authentication
- TKT-1031: knowledge-article:campaign-send-failures
- TKT-1031: knowledge-article:coupon-catalog-sync
- TKT-1031: knowledge-article:event-tracking-debugging
- TKT-1031: knowledge-article:flow-trigger-troubleshooting
- TKT-1031: knowledge-article:profile-sync-issues
- TKT-1031: knowledge-article:security-incident-response
- TKT-1031: knowledge-article:shopify-integration-sync
- TKT-1031: knowledge-article:sms-compliance
- TKT-1031: knowledge-article:support-operations-playbook
- TKT-1031: knowledge-article:webhook-signature-validation
- TKT-1031: known-cause:shopify-custom-field-mapping
- TKT-1031: known-cause:sms-quiet-hours
- TKT-1031: known-cause:sms-stop-sync-delay
- TKT-1031: known-cause:track-api-local-time-timestamp
- TKT-1031: known-cause:webhook-delivery-latency
- TKT-1031: known-cause:webhook-secret-rotation

## Reviewed contrast families

- webhook rotation/latency
- SMS quiet-hours/consent delay
- Shopify mapping/general sync
- editor session/platform loading

## Notes

Semantic quality evidence was measured with the configured provider identity recorded above.
