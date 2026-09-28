# B5 Diagnostic-Loop Refinement Plan

This plan inserts a refinement gate before the original Task 6 oracle freeze. The original B5 plan remains authoritative except where this addendum explicitly replaces synthesis/oracle/report requirements.

## Task 5R: Refine synthesis and the pending oracle

Modify:

- `src/retrieval/applicability-types.ts`
- `src/applicability-reasoning-provider.ts`
- `test/retrieval-applicability.test.ts`
- `test/applicability-reasoning-provider.test.ts`
- `src/retrieval/applicability-cases.ts`
- `test/retrieval-applicability-cases.test.ts`
- `data/evaluation/applicability-v1/development.json`
- `data/evaluation/applicability-v1/manifest.json`

Add the design refinement record.

Required behavior:

- bump the applicability contract to v2 and prompt version to `b5-applicability-v2`;
- keep all four candidate verdicts;
- enforce candidate evidence polarity;
- replace resource-bag synthesis with one leading hypothesis plus ordered alternatives;
- allow `insufficient-evidence` candidates to lead when missing evidence is preserved, including promoting a concrete known cause above generic supporting resources when it is the best current explanation;
- allow case-fact-grounded novel hypotheses with an explicit candidate-gap explanation;
- replace generic discriminating questions with concrete evidence actions;
- require a leading evidence action for non-abstaining synthesis;
- retain one stateless request per lane and no runtime authority;
- keep all 21 oracle reviews pending;
- change the two flow cases whose event presence is already established so event-ingestion troubleshooting is not treated as a next diagnostic step; and
- retain the opaque-ID case as an abstention, but inspect the supplied identifier internally before any customer clarification.

Verify:

```powershell
npx vitest run `
  test/retrieval-applicability.test.ts `
  test/retrieval-applicability-evidence.test.ts `
  test/applicability-reasoning-provider.test.ts `
  test/retrieval-applicability-cases.test.ts
npm run typecheck
npm run build
git diff --check
```

Commit only after GREEN:

```text
refactor: refine B5 diagnostic synthesis
```

Stop for human review of the regenerated 21-case pending oracle.

## Revised Task 6: Freeze only after review

Task 6 remains an explicit user-approval gate. Approval must apply to the refined v2 oracle, not the superseded v1 synthesis draft. Do not carry forward a previous approval reference.

## Task 7 capture adjustment

The capture must store sanitized ranked hypotheses and evidence actions instead of discriminating questions. Novel hypotheses store bounded summaries, case-fact evidence references, the bounded candidate-gap explanation, and missing-evidence items; no hidden reasoning or raw provider payload is persisted.

## Task 8 evaluation adjustment

Replace discriminating-question coverage with evidence-action intent coverage. Candidate-grounded leading hypotheses are scored against acceptable hypothesis pools and required concepts. Ordered alternatives are scored by rank-aware coverage.

Novel hypotheses are reported separately as `requires-human-review`; they are not automatically counted as correct or incorrect solely because the frozen oracle did not enumerate them. Grounding, unsupported-claim, and forbidden-claim checks still apply.

No change to the development-only provider authorization gate, holdout prohibition, artifact confinement, or runtime non-authority.
