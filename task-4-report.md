# Task 4 report: exact reusable-knowledge provenance

## Delivered

- Production diagnostic input now carries the authoritative `ReusableKnowledgeResult` through evidence readiness, recommendation construction, AI evaluation, and persistence.
- A learned known cause stores immutable `{ objectId, version }` provenance in `knownCauseRef`; recommendation schemas reject a reference without a non-null known cause.
- Recommendations expose a compact learned-context status and structured issues. A `ledger-unavailable` result keeps deterministic triage and evidence gating active, but supplies no learned reference.
- Evidence readiness selects approved learned causes only from reusable contexts and applies the matched version's evidence policy. Required evidence remains `needs-information`; a `none-required` policy can reach `known-cause`.
- Approval Desk HTTP and MCP evaluation fetch `listReusableApproved({ asOf: deps.now().toISOString() })` before evaluation and no longer use `listApproved()` as the production reuse feed.
- Existing recommendations are immutable version pins: changing the reusable head from v1 to v2 does not rewrite v1. A later explicit evaluation persists a new recommendation with v2.

## Preserved boundaries

- Catalog known causes and historical records do not receive manufactured references.
- `approvedObjects` remains an optional direct-fixture seam for isolated legacy tests and the non-production comparison evaluator; production HTTP/MCP routes pass `reusableKnowledge` only.
- Operational lifecycle, diagnosis, fixes, verification, and approval remain controlled by the existing deterministic services.

## Verification

- RED: `npm test -- --run test/knowledge-version-pinning.test.ts` initially failed because `reusableKnowledge` and `knownCauseRef` were not defined.
- Green focused coverage: 206 tests passed across Approval Desk recommendation, HTTP, MCP entrypoint, runtime, and pinning suites.
- Targeted route tests passed for ledger-unavailable HTTP/MCP observability and HTTP v1 -> promotion v2 -> pinned v1 -> explicit HTTP/MCP v2 evaluation.
- `npm run typecheck` passed.
- `npm test` and a full `vitest run --dir test --reporter=dot` were run after the focused suites; the runner emitted the complete progress stream without failures.

## Fix round 1

- MCP now requires the knowledge-evolution dependency and fails closed if it is absent; only named test adapters may supply the ledger-unavailable fixture.
- `knownCauseRef.objectId` must equal `knownCause`, and persistence additionally requires an opaque validation token produced from the exact authoritative reusable context. Raw or forged direct references are rejected.
- Verification: 221 focused tests passed; full `npm test` passed after the fix.

## Fix round 2

- Reusable knowledge results are registered and deep-frozen by `listReusableApproved`; token issuance now rejects caller-authored structural lookalikes and relies on immutable registered exact-version keys.
- A regression proves fabricated snapshots cannot mint a persistence token, while real service results retain exact-version and v1-to-v2 pinning behavior.
- Full `npm test` passed after the registry hardening.
