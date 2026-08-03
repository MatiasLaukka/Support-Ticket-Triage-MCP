# Knowledge-Evolution Evidence Correctness Design

## Goal

Make diagnosis evidence reusable, catalog-backed, and safe to promote into known-cause policy without changing the validity of the underlying diagnosis.

## Scope

This slice covers:

- a shared evidence catalog API;
- structured diagnosis evidence references;
- candidate evidence-policy derivation from observed evidence;
- draft and promotion validation;
- preservation of `diagnostic-ambiguity` escalation;
- end-to-end knowledge-object reuse regression coverage.

SQLite migration, HTTP authentication, response-send idempotency, and broad classifier confidence calibration remain separate slices.

## Domain model

Human-readable diagnosis reasoning and reusable evidence are separate concerns.

```ts
interface DiagnosisEvidenceReference {
  id: EvidenceRequirementId;
  labelAtDiagnosis: string;
  source: "ticket" | "reply" | "knowledge" | "operator";
  sourceRef?: string;
}
```

`labelAtDiagnosis` is an immutable historical snapshot. `sourceRef` is optional because provenance may refer to a reply audit event, a knowledge article, a ticket field, or an operator audit rather than always being an event ID.

A diagnosis retains readable `evidenceUsed: string[]` and adds authoritative `evidenceReferences: DiagnosisEvidenceReference[]`. The arrays do not need to be one-to-one: readable reasoning may contain observations that are not reusable evidence requirements.

Completed diagnoses persist both readable evidence and structured references. They never manufacture evidence requirement IDs from audit IDs.

## Shared evidence catalog

Move the catalog definitions out of the evidence-readiness implementation into a shared domain module. The catalog derives `EvidenceRequirementId` from its declared keys and exposes:

```ts
export type EvidenceRequirementId = keyof typeof EVIDENCE_CATALOG;
export function findEvidenceRequirement(id: string): EvidenceRequirementDefinition | undefined;
export function requireEvidenceRequirement(id: EvidenceRequirementId): EvidenceRequirementDefinition;
export function isEvidenceRequirementId(value: string): value is EvidenceRequirementId;
```

Evidence readiness, diagnosis recording, candidate derivation, candidate editing, promotion validation, and known-cause execution all use this module. Catalog definitions include `status: "active" | "deprecated"` and an optional replacement ID. Existing approved objects continue resolving deprecated IDs; new promotions containing deprecated IDs are blocked. Catalog entries are never deleted after use.

## Evidence policy

Candidates and promoted known causes use different policy types:

```ts
type CandidateEvidencePolicy =
  | { mode: "undecided" }
  | { mode: "required"; evidenceIds: EvidenceRequirementId[] }
  | { mode: "none-required"; rationale: string };

type ApprovedEvidencePolicy =
  | { mode: "required"; evidenceIds: EvidenceRequirementId[] }
  | { mode: "none-required"; rationale: string };
```

Invariants:

- candidate and approved `required` policies contain at least one unique catalog-backed ID;
- candidate and approved `none-required` policies require an explicit rationale;
- candidate `undecided` is reviewable but cannot be promoted;
- an empty observed evidence set never silently becomes `none-required`;
- a candidate without reusable evidence remains reviewable but is blocked from promotion until an operator supplies a valid policy.

## Candidate lifecycle

Candidate validation has two levels.

### Draft validation

Discovery and editing may produce an incomplete candidate. The result exposes blocking errors and non-blocking warnings:

```ts
interface CandidateValidationResult {
  validForPromotion: boolean;
  errors: CandidateValidationIssue[];
  warnings: CandidateValidationIssue[];
}
```

The candidate remains visible for operator review and correction.

### Promotion validation

Promotion is strict and authoritative. It reloads the current candidate revision and current catalog, then verifies catalog membership, uniqueness, policy mode requirements, deprecated-ID policy, and the absence of unresolved errors. It never trusts an earlier draft-validation result. Invalid promotion is atomic: it does not alter the completed diagnosis or partially promote the candidate.

The promoted object stores exactly the approved evidence policy. Future evaluation resolves that policy directly; it never reconstructs policy from the original diagnosis.

## Diagnostic ambiguity

The escalation policy preserves `diagnostic-ambiguity` whenever trusted recommendation state indicates an escalated diagnosis. Submission must persist:

```ts
supportState: "escalated"
escalationRequired: true
escalationReasons: ["diagnostic-ambiguity", ...otherReasons]
```

The policy must not erase this reason while recomputing independent escalation signals.

## Data flow

```text
evaluation
  -> provided evidence recognized
  -> operator records diagnosis and accepts evidence references
  -> discovery compares structured observations
  -> candidate proposes policy from observed catalog IDs
  -> operator edits/chooses future evidence policy
  -> draft validation exposes blocking issues
  -> promotion validation authorizes only an explicit valid policy
  -> approved known cause is persisted
  -> later evaluation resolves the approved policy through the same catalog
```

Evidence overlap is only one discovery signal. Candidate quality continues to consider symptom, diagnosis, owner, workflow, timing, product, and contradiction signals. No individual similarity signal proves identity or authorizes promotion.

## Tests

Required regression coverage:

1. A catalog-backed diagnosis records structured references and preserves readable `labelAtDiagnosis` snapshots.
2. A diagnosis with no reusable evidence remains valid, but its candidate is promotion-blocked rather than silently converted to `none-required`.
3. Operator-edited required policies reject unknown or duplicate IDs.
4. Explicit `none-required` policies require and persist a rationale.
5. `diagnostic-ambiguity` survives policy evaluation and validated recommendation submission.
6. End-to-end positive path: recognize catalog evidence -> record diagnosis -> discover candidate -> inspect/edit policy -> approve -> evaluate a later matching ticket -> resolve evidence readiness without throwing and apply the approved policy.
7. End-to-end negative path: valid diagnosis -> candidate without reusable evidence -> candidate remains reviewable -> promotion is rejected -> original diagnosis remains unchanged.
8. Existing deterministic classifier, lifecycle, response, MCP, and UI tests remain green.
9. Duplicate observations of one evidence ID may remain in diagnosis history with distinct provenance, while candidate policy derivation deduplicates IDs.
10. Old persisted diagnoses without `evidenceReferences` load with an empty reference list and produce an incomplete candidate rather than `none-required`.
11. Existing approved objects containing deprecated IDs remain readable and executable; new promotion with deprecated IDs is blocked.
12. Promotion recomputes validation instead of trusting an earlier result.

## Compatibility and migration

Existing customer-facing diagnosis text remains unchanged. Existing candidate and completed-diagnosis fixtures are migrated to registered evidence IDs or explicit `undecided`-policy fixtures. No synthetic `evidence-<audit-id>` values are introduced. Older persisted diagnoses without `evidenceReferences` load with `evidenceReferences: []`. Existing repository interfaces remain stable unless a type must gain the structured evidence field; adapters are updated to pass the new field through the shared application service.
