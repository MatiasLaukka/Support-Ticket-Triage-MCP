# Evidence-Quality Hardening Design

## Purpose

The governed knowledge holdout currently reports strong exact-version reuse and
health safety, but its learned evidence precision and missing-evidence rate are
weaker than the other scorecards. Before adding semantic search or new learning
behavior, determine whether this reflects a real evidence-policy problem or an
overly strict holdout oracle, then correct the shared policy at the source.

## Goals

- Make evidence expectations represent the actual deterministic evidence
  catalog and diagnosis policy.
- Reduce genuinely unnecessary evidence requests without weakening lifecycle
  gates or known-cause requirements.
- Keep MCP, Approval Desk, Codex Skill, and holdout evaluation on the same
  evidence-readiness implementation.
- Make evidence decisions explainable through stable evidence IDs and source or
  reason metadata already supported by the domain model.
- Preserve honest scorecards: benchmark labels may be corrected only when they
  conflict with the intended policy, never merely to improve a number.

## Authority and invariants

The evidence-readiness/diagnostic engine remains the only authority for
evidence-derived lifecycle and diagnosis gating. UI routes, MCP tools, GPT
classification, GPT drafting, and holdout scoring may consume its result but
must not recreate the rules.

The following invariants are blocking:

1. Missing required evidence keeps ordinary tickets evidence-gated.
2. A known cause can waive or narrow evidence only when its approved policy
   explicitly allows that behavior.
3. GPT advice cannot add, remove, or satisfy required evidence without passing
   deterministic validation.
4. Evidence supplied in complete conversation snapshots is recognized through
   the same aliases and IDs in every evaluation surface.
5. A corrected holdout expectation must document the policy reason and remain
   stable across deterministic reruns.
6. Evidence scoring continues to report unnecessary, missing, and repeated
   evidence separately; it must not hide weak results behind one blended score.

## Scope

### In scope

- Audit the eight fixed holdout fixtures against the evidence catalog,
  classifier, evidence-readiness output, and intended lifecycle targets.
- Identify and correct mismatched expected evidence IDs or lifecycle labels.
- Fix shared evidence matching only where the audit demonstrates a real engine
  defect, including aliases and multi-turn supplied evidence.
- Add focused regression tests for true positives, near misses, unrelated
  tickets, missing-then-supplied evidence, stale/contradicted versions, and
  approved known-cause exceptions.
- Update the holdout report/README only with reproducible, policy-backed
  metrics and a short explanation of any remaining evidence gap.

### Out of scope

- Semantic/vector search or embeddings.
- New knowledge-object promotion states.
- GPT prompt tuning or live-provider evaluation.
- Changes to ticket lifecycle authority, customer response authority, or
  knowledge-version promotion.
- Replacing evidence IDs with free-form text.

## Data flow

```text
ticket + complete conversation snapshot
        ↓
deterministic classification and evidence catalog aliases
        ↓
shared evidence-readiness result
        ↓
diagnosis/lifecycle gate + customer draft context
        ↓
holdout scorer compares policy-backed expected IDs
```

The holdout remains read-only. It consumes the production result and uses
expected outcomes only after evaluation for scoring; expected values never
enter classification, diagnosis, drafting, or lifecycle decisions.

## Success criteria

- Focused tests prove every changed evidence rule and every corrected fixture.
- No evidence-gate bypass, unsafe lifecycle transition, or wrong knowledge
  version is introduced.
- MCP and Approval Desk produce equivalent evidence IDs and support-state
  outcomes for the same ticket/conversation/actor inputs.
- The deterministic holdout is reproducible with no provider construction or
  network access.
- The final report clearly separates policy-corrected labels from genuine
  engine improvements and retains zero-denominator/null semantics.

## Verification

At minimum, run the focused evidence/holdout suites, the full test suite, the
deterministic knowledge holdout, lifecycle replay, and the portfolio
verification command. Review the final diff for duplicate evidence logic and
confirm the release branch remains unchanged until the refinement is approved.
