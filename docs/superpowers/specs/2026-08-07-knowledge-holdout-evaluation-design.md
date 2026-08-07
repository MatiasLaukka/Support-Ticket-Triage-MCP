# Governed Knowledge Holdout Evaluation

**Status:** Approved design  
**Date:** 2026-08-07

## Goal

Prove that promoted knowledge improves future support handling through the
existing production diagnostic path, without allowing evaluation to mutate
tickets, recommendations, audits, learning events, or customer responses.

The evaluation compares deterministic baseline triage with reusable promoted
knowledge on fixed multi-turn holdout fixtures. It measures both efficacy and
safety: correct knowledge reuse, evidence quality, diagnostic turns, lifecycle
gates, unhealthy-version withdrawal, and exact-version provenance.

## Non-goals

- GPT calls, GPT provider construction, or live network access;
- a second classifier, diagnostic engine, or scoring simulator;
- automatic promotion, rollback, reactivation, or customer-facing mutation;
- changing operational ticket state while scoring;
- claiming measured human correction behavior from synthetic fixtures;
- migrating operational ticket, conversation, recommendation, or audit stores
  to SQLite in this slice.

## Authority boundary

The operational plane remains authoritative for classification, evidence
readiness, diagnosis, fixes, verification, lifecycle transitions, and customer
responses. The learning plane records verified outcomes and proposes reusable
knowledge, but it cannot change a live ticket.

The Approval Desk, MCP tools, Codex Skill, and holdout evaluator all obtain
future-evaluation knowledge through one service operation:

```text
listReusableApproved({ asOf })
        ↓
evaluateTicketWithAi(...)
```

The evaluator must consume the same reusable-context result as production. It
must not filter stale objects itself or create a holdout-specific knowledge
representation.

## Exact-version governance and reuse

Learning health and reuse eligibility belong to the exact composite key
`(objectId, sourceVersion)`. Candidate-level summaries may aggregate a
candidate lineage, but they never determine whether a specific version is
reusable.

Knowledge-object versions carry immutable provenance:

```ts
learningGovernance: "legacy" | "ledger"
```

Newly promoted versions persist `"ledger"`. Older persisted objects missing the
field are normalized to `"legacy"` at the repository/read boundary without
rewriting historical files. Governance provenance is not mutable health state.

The reusable-context operation returns:

```ts
type ReusableKnowledgeContext = {
  object: KnowledgeObject;
  version: number;
  learning: {
    maturity: LearningMaturity;
    health: LearningHealth;
    eligibleForReuse: boolean;
  };
  eligibilitySource: "ledger-active" | "legacy-compatible";
};

type ReusableKnowledgeResult = {
  status: "available" | "ledger-unavailable";
  contexts: readonly ReusableKnowledgeContext[];
};
```

Eligibility rules are exact-version scoped:

| Version state | Reuse result |
| --- | --- |
| Ledger-governed and exact-version health active | Include as `ledger-active` |
| Explicitly legacy, successful ledger lookup, no conflicting exact-version event | Include as `legacy-compatible` |
| Exact-version stale, contradicted, deprecated, or superseded | Exclude |
| Ledger read failure | Exclude learned context and return `ledger-unavailable` |
| Missing or inconsistent history for a ledger-governed version | Exclude and expose a health warning |

Object-level events without a matching `sourceVersion` cannot poison another
version. An unhealthy current version never implicitly resurrects an older
version; rollback or reactivation requires a separate explicit, attributed,
auditable event.

`listApproved()` remains broad so review, history, and audit surfaces can show
stale, contradicted, deprecated, and superseded versions. Only
`listReusableApproved()` supplies learned context to evaluations.

When learning storage is unavailable, ordinary deterministic triage continues
with no learned context. The system must not claim that learned reuse was
available or silently assume that approved objects are healthy.

## Recommendation provenance

Recommendations that reuse an approved knowledge object persist exact
provenance:

```ts
knownCauseRef?: {
  objectId: string;
  version: number;
}
```

Legacy recommendations may omit this field. Existing `knownCause` values remain
compatible for catalog causes and historical records. New approved-object reuse
must populate `knownCauseRef`, allowing wrong-version reuse, replacement
version behavior, and historical pinning to be scored directly.

## Holdout fixture model

Every fixture has an explicit fixed timestamp and a scoring oracle that is never
passed into production evaluation:

```ts
type HoldoutTurn = {
  ticket: Ticket;
  customerReplies: readonly {
    id: string;
    ticketId: string;
    createdAt: string;
    body: string;
  }[];
  previousSupportResponse?: {
    sentAt: string;
    body: string;
  };
  expectedState?: SupportState;
};

type KnowledgeHoldoutFixture = {
  id: string;
  ticket: Ticket;
  expectedOutcome: ExpectedOutcome;
  turns: readonly HoldoutTurn[];
  expectedKnowledgeVersion?: {
    objectId: string;
    version: number;
  };
  expectedEvidenceIds: readonly string[];
  expectedFinalState: SupportState;
  expectedCorrectionRequired: boolean;
};
```

`expectedOutcome` is used only by the scorer. It is never supplied as
`outcome` to `evaluateTicketWithAi`, because that parameter intentionally
bypasses normal classification. Production evaluation receives only the ticket,
turn sequence, deterministic context, and reusable knowledge returned by
`listReusableApproved()`.

The fixture set contains:

1. a true positive with sufficient evidence;
2. a true positive with required evidence missing, followed by a reply that
   supplies it;
3. a near miss with similar wording but no valid match;
4. an unrelated ticket;
5. a stale-version recurrence;
6. a contradicted-version recurrence;
7. version-isolation cases where unhealthy v1 is replaced by explicitly active
   v2, and where active v1 remains in use while v2 is unapproved.

The main efficacy cases run baseline and healthy learned lanes. Health-safety
cases run baseline, healthy, stale, and contradicted lanes as relevant. Version
fixtures run only the replacement and draft-isolation lanes needed to prove
version behavior; unnecessary Cartesian combinations are not generated.

## Lane and result model

Each lane runs the same deterministic turn sequence through the same production
path. The result retains every turn, not just the public final snapshot:

```ts
type HoldoutLaneResult = {
  turns: readonly HoldoutTurnResult[];
  finalRecommendation: TriageRecommendation;
  targetReached: boolean;
  turnsToExpectedState: number | null;
};

type HoldoutTurnResult = {
  turnIndex: number;
  recommendation: TriageRecommendation;
  knownCauseRef?: { objectId: string; version: number };
  requestedEvidenceIds: readonly string[];
  providedEvidenceIds: readonly string[];
  missingEvidenceIds: readonly string[];
  supportState: SupportState;
  unsafeLifecycleChanges: number;
  correctionRequired: boolean;
};
```

Each turn retains the recommendation, exact `knownCauseRef` when present,
requested/provided/missing evidence IDs, lifecycle state, unsafe transition
count, and correction-required result. `turnsToExpectedState` is `null` when a
lane never reaches the comparable target. `diagnosticTurnsSaved` is an integer
only when both compared lanes reach the target; otherwise it is `null`.

Stale and contradicted lanes seed the learning ledger and then call the same
`listReusableApproved({ asOf })` operation as production. They never manually
remove the object before evaluation.

## Scorecard definitions

A knowledge match is correct only when the expected exact object/version is
selected as `knownCauseRef`; actionability is scored separately.

Per-case deltas include:

```ts
delta: {
  matchedKnowledge: boolean;
  unnecessaryEvidence: number;
  missingNecessaryEvidence: number;
  diagnosticTurnsSaved: number | null;
  unsafeLifecycleChanges: number;
  correctionRequired: boolean;
}
```

`unsafeLifecycleChanges` counts transitions that violate the fixture contract:

- becoming actionable before required evidence exists;
- entering `known-cause` for the wrong object or version;
- moving beyond an escalation or ambiguity gate;
- reaching a later lifecycle state than the fixture permits.

Evidence metrics use declared fixture expectations:

```text
unnecessary evidence = requested IDs - expected IDs
missing necessary evidence = expected IDs - requested IDs
evidence precision = necessary requested evidence / all requested evidence
missing-evidence rate = missing necessary evidence / all expected evidence
```

Zero-denominator metrics are `null`.

`operatorCorrectionRequired` means that the learned lane violated the fixture
contract. It is not presented as observed human correction behavior.

A case is **regressed** if learned behavior introduces a wrong knowledge
version, unsafe activation, evidence-gate bypass, missing necessary evidence
that baseline collected, or correction required where baseline did not. A case
is **benefited** only when there is no regression and at least one meaningful
improvement: correct reuse appears, unnecessary evidence decreases, diagnostic
turns decrease, or baseline misses the target while learned reaches it. All
other cases are **unchanged**.

The aggregate reports knowledge-match precision/recall, evidence precision,
missing-evidence rate, unnecessary evidence, diagnostic turns saved,
correction-required rate, stale false-positive rate, contradicted false-positive
rate, combined unhealthy-reuse false-positive rate, unsafe activation count,
evidence-gate bypass count, and benefited/unchanged/regressed case counts.

## Read-only guarantees

The evaluator uses deterministic mode with no provider construction and no
network access. A regression test snapshots ticket revisions, recommendation
count, operational audit count, and learning-ledger event IDs before scoring,
then asserts all values are unchanged afterward. The evaluator must not append
evaluation events; evaluation evidence is returned in the report and may be
persisted separately only by an explicit future operation.

## Output and documentation

Add a deterministic command such as:

```powershell
npm run evaluate:knowledge-holdout
```

The report includes the frozen `asOf`, lane availability status, every fixture's
turn-by-turn result, exact knowledge provenance, baseline/learned deltas, and
the aggregate safety/efficacy scorecard. README and `docs/demo-results.md`
should present the result as evidence of governed knowledge reuse, not as a
claim of autonomous model retraining or measured human labor savings.

## Success criteria

- Every production evaluation surface obtains reusable knowledge through
  `listReusableApproved({ asOf })`.
- Learning health cannot cross object-version boundaries.
- Ledger failure excludes learned context while deterministic triage remains
  available.
- Expected outcomes are scoring-only oracles.
- Recommendations persist exact approved-object version provenance.
- The holdout demonstrates positive reuse without evidence-gate bypasses.
- Stale, contradicted, deprecated, superseded, and wrong-version knowledge does
  not influence evaluation.
- Every lane retains its full multi-turn results.
- No operational or learning state changes during scoring.
- The aggregate report distinguishes improvement, no change, and regression
  using the safety-first comparator.
