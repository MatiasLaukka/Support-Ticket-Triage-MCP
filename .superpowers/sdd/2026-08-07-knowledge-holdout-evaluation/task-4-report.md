# Task 4 report: exact reusable-knowledge provenance

## Commits

- `45ac1d8 feat: persist exact reusable knowledge provenance`
- `9f92369 fix: require verified knowledge provenance`
- Fix round 2: pending commit for service-owned reusable-result registration.

## Initial delivery

- Production HTTP and MCP evaluation pass the exact `listReusableApproved({ asOf })` result into evidence readiness, AI evaluation, and persistence.
- Learned known causes persist `{ objectId, version }` as `knownCauseRef`; existing recommendations retain their selected v1 after later v2 availability, while an explicit re-evaluation may persist v2.
- Required learned evidence remains `needs-information`; `none-required` may become `known-cause`; ledger failure remains observable without claimed learned reuse.

## Fix round 1

- `TriageServerDependencies.knowledgeEvolution` is required for the production MCP server. `evaluate_ticket` unconditionally resolves the service and calls `listReusableApproved`; an absent dependency fails closed with a configuration error. Legacy MCP tests use a named `nonProductionReusableKnowledgeAdapter` only.
- Recommendation and submit schemas require `knownCauseRef.objectId === knownCause`.
- The builder creates a module-private, WeakSet-backed opaque validation token only after finding the exact reference in the authoritative reusable result. `TriageService.submit` and `submitEvaluation` reject any learned reference without that token, preventing direct forged or out-of-context persistence. The token is stripped before serialization and never becomes stored data.

## Verification

- RED: direct `submitEvaluation` with both mismatched and matching-but-unvalidated references resolved before this fix.
- Green targeted regression: 3 tests passed (forged/mismatched submission and missing MCP service).
- Focused suites: 221 tests passed across triage service, MCP actions/read paths, Approval Desk HTTP, and version pinning.
- Full `npm test`: passed after the fix round (build, typecheck, and full Vitest suite).

## Preserved seams and concerns

- `approvedObjects` remains a legacy fixture/non-production comparison-evaluator seam, not a production HTTP/MCP reuse feed.
- The MCP adapter is contained in test files and returns only a ledger-unavailable result. Runtime production construction supplies the real knowledge-evolution service.
- Catalog causes and historical records remain reference-free unless the actual reusable selection path created the exact reference.

## Fix round 2

- `listReusableApproved` registers each returned reusable-result object in a module-private `WeakMap` keyed by immutable `(objectId, version)` context keys, then deep-freezes the result.
- The validation-token issuer rejects unregistered caller-authored structural results and checks only the registry keys, not mutable caller-provided context arrays. The `WeakSet` validation token remains opaque to persistence.
- Regression proof: fabricating a structurally valid reusable result cannot mint a token and direct persistence remains rejected; a real result from `listReusableApproved` continues to support exact-version recommendation and HTTP/MCP pinning flows.
- Verification: targeted fabrication/real-result tests passed; full `npm test` passed after the fix.
