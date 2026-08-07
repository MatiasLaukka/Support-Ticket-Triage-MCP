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
- holdout-triggered automatic promotion, rollback, reactivation, or
  customer-facing mutation; version transitions remain explicit domain
  operations;
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

type ReusableKnowledgeIssue =
  | {
      scope: "snapshot";
      code: "ledger-read-failed";
    }
  | {
      scope: "version";
      objectId: string;
      version: number;
      code:
        | "missing-history"
        | "inconsistent-history"
        | "unhealthy-version";
    };

type ReusableKnowledgeResult = {
  status: "available" | "ledger-unavailable";
  contexts: readonly ReusableKnowledgeContext[];
  issues: readonly ReusableKnowledgeIssue[];
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

`asOf` is a temporal isolation boundary, not only an injected clock. Every
knowledge version and every transition or health event considered by
`listReusableApproved({ asOf })` must have become effective at or before
`asOf`. The service resolves each object's approved head as it existed at that
timestamp; it must not start from today's head and then apply historical
filtering. No promotion, supersession, reactivation, stale, contradicted,
deprecated, or other event occurring after `asOf` may influence the result.

`listApproved()` returns the current approved head for each object without health
filtering. `listVersions(objectId)` exposes the complete immutable version
history for review and audit. Only `listReusableApproved()` supplies learned
context to evaluations.

### Minimal version-transition mechanism

Versioned replacement is an explicit domain operation, not a fixture-only
state. A replacement promotion transaction:

1. validates the expected current head version;
2. inserts the immutable replacement version;
3. moves the object head to the replacement version;
4. records a `knowledge-version-superseded` event for the previous version;
5. records the promotion event for the new version;
6. commits the version, audit, and learning events atomically.

An explicit `reactivateVersion({ objectId, sourceVersion, actorId, reason })`
operation may move the head back to a historical version and records a
`knowledge-version-reactivated` event. No read path infers rollback from stale,
contradicted, or missing history. A version that is not the current head is
never reusable unless this explicit operation makes it active again.

When learning storage is unavailable, ordinary deterministic triage continues
with no learned context. The system must not claim that learned reuse was
available or silently assume that approved objects are healthy.

Persistence compatibility is tested for every adapter: an old JSON object and
an old SQLite payload read as `legacy` without rewriting the historical record,
while every newly promoted version persists `ledger`. Canonical write schemas
must not allow a new promotion to omit the governance marker accidentally.

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

The recommendation builder enforces these invariants:

```text
knownCauseRef is present → knownCause === knownCauseRef.objectId
approved-object reuse → knownCauseRef is present
knownCauseRef → exact object/version was present in the supplied reusable contexts
```

Callers and fixtures cannot manufacture version provenance independently of the
reusable context returned by the shared service.

## Holdout fixture model

Every fixture has an explicit fixed timestamp and a scoring oracle that is never
passed into production evaluation:

```ts
type KnowledgeHoldoutSuite = {
  asOf: string;
  fixtures: readonly KnowledgeHoldoutFixture[];
};

type HoldoutTurn = {
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
  expected?: {
    supportState?: SupportState;
    knownCauseRef?: { objectId: string; version: number };
    requiredEvidenceSatisfied?: boolean;
  };
};

type KnowledgeHoldoutFixture = {
  id: string;
  initialTicket: Ticket;
  expectedOutcome: ExpectedOutcome;
  turns: readonly HoldoutTurn[];
  expectedEvidenceIds: readonly string[];
  expectedTarget: {
    supportState: SupportState;
    knownCauseRef?: { objectId: string; version: number };
    requiredEvidenceSatisfied?: boolean;
  };
};
```

`initialTicket` is immutable fixture input. `customerReplies` is the complete
customer conversation snapshot as of that turn, not only newly introduced
messages. `previousSupportResponse`, when present, is the latest prior support
response visible at that turn. The evaluator constructs each turn from these
immutable inputs rather than carrying hidden mutable state from an earlier
turn.

The suite's fixed `asOf` is passed to every learning lookup, and its fixed
clock is injected into every production evaluation. SLA checks, time
constraints, and other current-time rules therefore use the same deterministic
timestamp as stale projection.

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

Deprecated exclusion is covered by a reusable-context service regression at
the exact-version boundary. It does not require another end-to-end holdout
fixture; stale and contradicted behavior additionally receive dedicated
holdout lanes.

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
  targetReached: boolean;
  unsafeLifecycleChanges: number;
  correctionRequired: boolean;
};
```

Each turn retains the recommendation, exact `knownCauseRef` when present,
requested/provided/missing evidence IDs, lifecycle state, unsafe transition
count, and correction-required result. `targetReached` means the turn matches
the fixture's complete `expectedTarget`: support state, exact known-cause
version when declared, and required-evidence satisfaction when declared. It is
not merely a match on broad `SupportState`. `turnsToExpectedState` is `null`
when a lane never reaches the comparable target. `diagnosticTurnsSaved` is an
integer only when both compared lanes reach the target; otherwise it is `null`.

When a turn declares `expected`, `correctionRequired` compares the observed
recommendation with that turn-level contract. This makes intermediate gates
explicit: for example, a missing-evidence turn may require `needs-information`
and `requiredEvidenceSatisfied: false` even when the final target is a
known-cause state. Turns without an expected contract still receive the global
safety checks, but do not claim an exact per-turn target match.

Stale and contradicted lanes seed the learning ledger and then call the same
`listReusableApproved({ asOf })` operation as production. They never manually
remove the object before evaluation.

## Scorecard definitions

A knowledge match is correct only when the expected exact object/version is
selected as `knownCauseRef`; actionability is scored separately.

Per-case deltas include:

```ts
delta: {
  learnedMatchedExpectedKnowledge: boolean;
  unnecessaryEvidence: number;
  missingNecessaryEvidence: number;
  diagnosticTurnsSaved: number | null;
  repeatedEvidenceRequestCount: number;
  unsafeLifecycleChanges: number;
  correctionRequired: boolean;
}
```

`unsafeLifecycleChanges` counts transitions that violate the fixture contract:

- becoming actionable before required evidence exists;
- entering `known-cause` for the wrong object or version;
- moving beyond an escalation or ambiguity gate;
- reaching a later lifecycle state than the fixture permits.

Evidence-gate bypasses are a subset of `unsafeLifecycleChanges` and remain a
separate headline metric.

Evidence metrics use declared fixture expectations:

```text
unnecessary evidence = unique requested IDs - expected IDs
missing necessary evidence = expected IDs - unique requested IDs
evidence precision = necessary requested evidence / all requested evidence
missing-evidence rate = missing necessary evidence / all expected evidence
```

Evidence IDs are deduplicated across all turns for the precision and
missing-evidence metrics. Repeated requests are counted separately as
`repeatedEvidenceRequestCount` so repeated questions remain visible without
inflating evidence requirements. Zero-denominator metrics are `null`.

`operatorCorrectionRequired` means that the learned lane violated the fixture
contract. It is not presented as observed human correction behavior.

A case is **regressed** if learned behavior introduces a wrong knowledge
version, unsafe activation, evidence-gate bypass, missing necessary evidence
that baseline collected, or correction required where baseline did not. A case
is **benefited** only when there is no regression and at least one meaningful
improvement: correct reuse appears, unnecessary evidence decreases, diagnostic
turns decrease, or baseline misses the target while learned reaches it. All
other cases are **unchanged**.

The aggregate has three non-overlapping views:

- **Efficacy cohort:** main true-positive, missing-evidence, near-miss, and
  unrelated cases contribute knowledge-match precision/recall, evidence
  precision, missing-evidence rate, unnecessary evidence, diagnostic turns
  saved, correction-required rate, and benefited/unchanged/regressed counts.
- **Governance cohort:** stale and contradicted lanes contribute stale,
  contradicted, and combined unhealthy-reuse false-positive rates, unsafe
  activation count, and evidence-gate bypass count.
- **Version cohort:** replacement and draft-isolation lanes contribute
  wrong-version reuse, explicit replacement correctness, and version-pinning
  results.

Global safety counts may span every lane, but efficacy denominators never count
duplicated health or version variants.

## Read-only guarantees

The evaluator uses deterministic mode with no provider construction and no
network access. A regression test snapshots ticket revisions, recommendation
count, operational audit count, learning-ledger event IDs, candidate IDs, and
knowledge-object version IDs, and knowledge-object head mappings
(`objectId -> current head version`) before scoring, then asserts all values
are unchanged afterward. The evaluator must not append evaluation events;
evaluation evidence is returned in the report and may be persisted separately
only by an explicit future operation.

The reusable service establishes one consistent ledger snapshot before
returning contexts. If that snapshot cannot be established—for example, a
ledger read fails partway through or the read cannot provide a consistent
view—it returns `status: "ledger-unavailable"` with no contexts, so apparently
valid partial results are never mixed with an unavailable snapshot. If the
ledger snapshot is healthy but one ledger-governed version has malformed or
missing exact-version history, the service returns `status: "available"`,
excludes only that version, and emits a version-scoped issue; other verified
contexts may remain reusable.

## Output and documentation

Add a deterministic command such as:

```powershell
npm run evaluate:knowledge-holdout
```

The report includes the frozen `asOf`, injected production clock, lane
availability status and structured reusable-context issues, every fixture's
turn-by-turn result, exact knowledge provenance, baseline/learned deltas, and
the separate efficacy, governance, and version scorecards. README and
`docs/demo-results.md` should present the result as evidence of governed
knowledge reuse, not as a claim of autonomous model retraining or measured
human labor savings.

## Success criteria

- Every production evaluation surface obtains reusable knowledge through
  `listReusableApproved({ asOf })`.
- `asOf` excludes every post-`asOf` version and transition/health event and
  resolves each object head as it existed at that timestamp.
- Learning health cannot cross object-version boundaries.
- Replacement promotion transactionally supersedes the old head, and explicit
  reactivation is the only path to reuse a historical version.
- `listReusableApproved()` returns structured exclusion issues, while
  `listVersions()` preserves complete historical inspection.
- Ledger failure excludes learned context while deterministic triage remains
  available.
- Expected outcomes are scoring-only oracles.
- Recommendations persist exact approved-object version provenance.
- The holdout demonstrates positive reuse without evidence-gate bypasses.
- Stale, contradicted, deprecated, superseded, and wrong-version knowledge does
  not influence evaluation.
- Deprecated exclusion is proven by the reusable-context service contract and
  regression tests even though the end-to-end holdout focuses on stale and
  contradicted lanes.
- Every lane retains its full multi-turn results.
- Intermediate turn contracts detect unsafe early transitions, not only final
  target mismatches.
- No operational or learning state changes during scoring, including
  knowledge-object head mappings.
- The aggregate report separates efficacy, governance safety, and version
  correctness while distinguishing improvement, no change, and regression with
  the safety-first comparator.
