# Controlled Knowledge Holdout Evaluation

- Mode: controlled-synthetic
- Frozen as-of and injected clock: 2026-08-08T12:00:00.000Z
- Provider: not-constructed
- Synthetic/controlled fixed fixtures demonstrate governed knowledge reuse only; no human-time claim or live-model performance claim is made.

## Case scorecard

| Fixture | Reusable-context status | Learned target | Comparison | Read-only |
| --- | --- | --- | --- | --- |
| sufficient-evidence-true-positive | available | yes | benefited | pass |
| missing-evidence-then-supplied | available | yes | benefited | pass |
| near-miss | available | yes | unchanged | pass |
| unrelated | available | yes | unchanged | pass |
| stale-version | available | yes | unchanged | pass |
| contradicted-version | available | yes | unchanged | pass |
| draft-version-isolation | available | yes | benefited | pass |
| replacement-and-draft-isolation | available | yes | benefited | pass |

## Aggregate scorecards

- Efficacy: learned exact-version precision=1.000, recall=1.000, evidence precision=0.286, missing-evidence rate=0.333.
- Governance: stale false-positive rate=0.000, contradicted false-positive rate=0.000, unsafe lifecycle changes=0.
- Version: wrong-version reuse=0, replacement correctness=1.000, version pinning=1.000.
