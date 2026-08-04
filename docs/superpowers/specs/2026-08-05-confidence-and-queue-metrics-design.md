# Uncertainty-Aware Confidence And Queue Metrics

## Purpose

Make classifier confidence reflect uncertainty instead of only the amount of
category evidence, and make operational savings metrics distinguish realized
value from pending potential. The same calculations must be visible through
the Approval Desk, the MCP metrics resource/tool, and the documented local
showcase.

## Current problem

The deterministic classifier currently calculates confidence from the selected
category score with a fixed clamp. It does not account for a close competing
category, the number of independent rules supporting the result, or explicit
metadata disagreement. The queue metrics expose one average over every
recommendation and call approved savings `estimatedMinutesSaved`, while the
MCP server and Approval Desk have different fallback minutes assumptions.

## Design

### 1. One score snapshot drives routing and confidence

Extract one internal score operation and make both category selection and
confidence calculation consume it:

```text
ScoreSnapshot<T> {
  selectedValue: T
  selectedScore: number
  runnerUpScore: number
  eligibleSignals: ClassificationSignal[]
  hasIndependentEvidence: boolean
  contributingRuleIds: string[]
}
```

The metadata filter must be corrected and centralized. When independent
content evidence exists, metadata signals are excluded from the score; when it
is the only evidence, metadata may still provide weak routing:

```ts
!hasIndependentEvidence || !ruleId.startsWith("metadata-")
```

Hard security/outage overrides may still choose the category, but the snapshot
must calculate the selected and runner-up scores consistently. This prevents
routing and recorded provenance from drifting apart.

`independentSignalCount` is the number of unique matched classifier `Rule.id`
values contributing eligible category evidence. It excludes metadata rules,
disagreement signals, duplicate emissions from one rule, known-cause/event
signals, and accepted GPT advisory signals. It is not the number of persisted
signal rows or distinct weights.

### 2. Confidence remains a bounded decision-support score

Keep the existing numeric `confidence` field and its `[0, 1]` contract. It is
not a calibrated probability and documentation must say so. Add an optional,
structured `classificationConfidence` record to deterministic classifications
and persisted recommendations:

```text
method: uncertainty-aware-v1
band: low | medium | high
categoryScore: nonnegative number
runnerUpScore: nonnegative number
categoryMargin: number
independentSignalCount: nonnegative integer
disagreementCount: nonnegative integer
uncertaintyReasons: ClassificationUncertaintyReason[]
```

Reason codes are bounded and stable:

```text
no-actionable-category | weak-category-support |
close-category-competition | low-signal-diversity |
metadata-disagreement
```

The selected category and confidence details must be calculated from the same
independent-evidence filtering used by category selection. Metadata-only
signals cannot inflate confidence when stronger content evidence exists.

For non-`other` categories, calculate:

```text
supportFactor = min(1, max(0, categoryScore) / 10)
marginFactor = min(1, max(0, categoryScore - runnerUpScore) / 10)
diversityFactor = min(1, independentSignalCount / 3)
disagreementFactor = min(1, disagreementCount / 2)

raw = 0.45
    + 0.25 * supportFactor
    + 0.20 * marginFactor
    + 0.10 * diversityFactor
    - 0.15 * disagreementFactor

confidence = round4(clamp(raw, 0.35, 0.95))
```

`other` remains `0.5` with a full low-band record and a
`no-actionable-category` reason. Bands use the existing low-confidence policy
boundary: low `< 0.75`, medium `< 0.90`, high `>= 0.90`. Add reason codes at
these exact thresholds: weak support when `categoryScore < 5`, close competition
when `categoryMargin < 3`, low diversity when `independentSignalCount < 2`, and
metadata disagreement when `disagreementCount > 0`. The schema validates finite
nonnegative scores, a nonnegative integer signal count, disagreement counts from
zero through three, unique bounded reason codes, and band consistency with the
numeric confidence.

### 3. Persist only safe, structured provenance

Add the confidence-details schema to `src/domain.ts`, the trusted evaluation
input schema and type in `src/triage-service.ts`, and the recommendation
builder.
The record contains scores and counts only; it never contains ticket text,
prompts, secrets, or provider payloads. Existing persisted recommendations may
omit the optional field and remain readable. GPT classification remains
advisory. Accepted GPT advice may enter the shared deterministic resolver as
bounded advisory signals and may influence final routing, but GPT cannot supply
the score, margin, band, counts, or reasons. GPT signals never count toward
independent deterministic rule diversity. Generic `submit_recommendation`
cannot author this provenance; only the trusted `evaluate-ticket` path may
persist it.

### 4. Queue metrics separate observed and projected value

Keep existing fields for compatibility:

- `averageConfidence` remains the average across submitted recommendations.
- `estimatedMinutesSaved` remains the realized value from approved
  recommendations only.
- `minutesPerAcceptedRecommendation` remains the configured assumption.

Add:

- `averageApprovedConfidence`: average confidence among approved
  recommendations, or `null` when none exist;
- `confidenceBandCounts`: low/medium/high counts across submitted
  recommendations, deriving a band from numeric confidence for legacy records;
- `potentialMinutesSaved`: pending recommendations multiplied by the configured
  assumption. This is explicitly potential, never realized savings.

Use one exported default minutes constant for runtime and MCP server fallback so
the same fixture does not report different savings depending on transport. The
configured environment value remains authoritative when provided. Export a
shared strict `QueueMetricsSchema` and use it for the calculator result, HTTP,
MCP, and CLI serialization.

### 5. Surfaces and documentation

The `/api/metrics` endpoint, `metrics://queue`, and `get_queue_metrics` expose
the new fields through the shared `QueueMetrics` object. The Automation Evidence
report and panel display average classifier confidence, low-confidence count,
realized savings estimate, and potential minutes saved. Add a small
network-free `npm run demo:metrics` command using the same calculator and
schema. README and demo documentation label confidence as decision support and
savings as either realized or potential. Realized savings are
approval-attributed estimates under the configured minutes assumption, not
measured stopwatch time.

No new dashboard, model calibration, or historical recalculation is included.

## Invariants

- The shared deterministic resolver is the sole authority for confidence
  details; accepted GPT advice cannot author them and does not count as
  independent rule diversity.
- Explicit approval remains the only path that increases realized savings.
- Pending recommendations can increase potential savings but never realized
  savings.
- Legacy recommendations without confidence details remain valid and receive a
  deterministic band from their numeric confidence.
- Customer-facing responses never include confidence formulas or internal
  uncertainty reasons.

## Verification

Regression coverage must prove:

1. metadata-only evidence remains usable for routing but produces low
   confidence;
2. conflicting metadata is excluded from category score when content evidence
   exists;
3. strong independent evidence outranks a weak, close competitor;
4. close competing category signals reduce confidence and produce an
   uncertainty reason;
5. metadata disagreement reduces confidence without changing routing
   authority;
6. category selection and confidence details use the exact same score snapshot;
7. independent count deduplicates multiple emissions from one rule;
8. queue metrics calculate approved confidence, confidence bands, realized
   savings, and potential savings correctly;
9. a generic submission cannot forge deterministic confidence provenance;
10. legacy and new recommendations are banded identically from numeric
    confidence;
11. canceled and superseded recommendations contribute to neither pending
    potential nor approved realized savings;
12. absent and configured environment values produce identical HTTP and MCP
    outputs;
13. both transports return identical metric fields and the dashboard renders
    them; and
14. the CLI serializes the same `QueueMetrics` shape;
15. the full test suite, deterministic lifecycle evaluation, and showcase remain
   green.
