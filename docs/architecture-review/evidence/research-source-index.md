# Research source provenance

[Report index](../README.md) · [E1a workflow](../execution-flows.md#experimental-simplehybrid-comparison-is-another-path)

These are provenance records for the **observed E1a working-tree overlay**, not links to public source at the audited commit. The research files and any private inputs/results are deliberately not published. The audit observed HEAD `6a60fdd50bd96ac679366bac6b87f00c82d237cc` plus modified working files. HEAD alone does not identify the overlay; the file hashes below identify the bytes actually inspected.

Public-main source references elsewhere remain pinned to `fe035ee383b6f9df1869104f8a623609d025023b`. The public ancestry comparison for this research HEAD returned 404 and remains unresolved. Line numbers refer to the observed files; a reader needs the matching retained research artifact to inspect those lines.

## inputs

* Source: `scripts/home-assistant-e1a/inputs.ts`
* SHA-256: `88e313a01be128fb3a37be5dc9ef0a15abb830914a6d029d87cd146cda3f08c6`
* Observed lines and symbols: 116 buildStages; 152 selectHistoricalVersions; 200 selectDeliveredSections; 242 buildStageBundle.

## runners

* Source: `scripts/home-assistant-e1a/runners.ts`
* SHA-256: `8b812202dc849cb3ed4a95cfcd74100277c7bba7882ab2d9b78e2d4d449c8fb6`
* Observed lines and symbols: 152 preparePair; 349 executePrepared; 455 executeSchedule.

## results

* Source: `scripts/home-assistant-e1a/results.ts`
* SHA-256: `4fef5f4f2d3c4084abe1317c0b0b503f66a9c9a6d400e9da7c7e8e7698d9cda7`
* Observed lines and symbols: 39 createAttemptStore.

## evaluation

* Source: `scripts/home-assistant-e1a/evaluation.ts`
* SHA-256: `ec40f2625b1b2c022622483b1488a83dddd117e9865567f139e8cd00d25a2a5e`
* Observed lines and symbols: 48 validateScorecard; 100 aggregateScores.
