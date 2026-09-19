# B5 Diagnostic-Loop Refinement

Status: approved direction, pre-oracle-freeze refinement

This refinement supersedes the B5 design's synthesis and oracle rules where they conflict with this document. Candidate retrieval, evidence resolution, paired lanes, privacy boundaries, runtime non-authority, and provider-call gating remain unchanged.

## Why this refinement exists

B5 must evaluate reasoning that can later support a diagnosis loop, not merely identify relevant resources or ask generic discriminator questions. A useful diagnostic engine should choose the best current explanation or investigation path, collect evidence for or against it, and revise when new evidence contradicts it.

The intended loop is:

```text
retrieve candidates
-> assess applicability
-> choose one leading hypothesis/path
-> rank alternatives
-> collect concrete evidence
-> reassess with the updated case
-> promote the next alternative or a grounded novel explanation when needed
```

B5 remains offline/development-only. It does not execute checks, mutate lifecycle state, contact customers, apply fixes, or perform operational diagnosis. It evaluates whether the reasoning contract produces the information a later governed diagnostic loop would need.

## Candidate assessment remains separate

The four candidate verdicts remain:

- `applicable-next-step`: justified investigation path or hypothesis;
- `insufficient-evidence`: plausible candidate that needs explicitly named evidence;
- `contradicted`: observed evidence conflicts with required candidate conditions; and
- `irrelevant`: discoverable resource that does not meaningfully address the case.

Evidence polarity is strict:

- `applicable-next-step` requires supporting evidence;
- `insufficient-evidence` requires supporting evidence plus missing evidence;
- `contradicted` requires contradicting evidence;
- `irrelevant` must not invent supporting evidence; and
- the same reference cannot appear as both supporting and contradicting evidence for one candidate.

## Ranked diagnostic synthesis

When a path can be prioritized, synthesis returns exactly one leading hypothesis and zero or more ordered alternatives. Array order is diagnostic priority, not probability.

A candidate-grounded hypothesis may use candidates assessed `applicable-next-step` or `insufficient-evidence`. It may combine complementary resources, such as a playbook and knowledge article, when they support one diagnostic explanation/path. It may not use `contradicted` or `irrelevant` candidates.

An `insufficient-evidence` candidate may lead. Its missing evidence must remain explicit so the next evidence action can test it. B5 must not abstain merely because the best current hypothesis is unconfirmed.

## Open-world hypothesis escape hatch

A hypothesis may be `novel` when the retrieved candidate set does not adequately explain the observed facts. A novel hypothesis must:

- cite supplied case facts;
- explain why the candidate set is insufficient;
- state any missing evidence; and
- remain advisory and unconfirmed.

The frozen development oracle marks novel hypotheses `allowed-requires-review`. A novel hypothesis is not automatically scored wrong merely because it is absent from the frozen candidate oracle. It is surfaced for human review and still participates in evidence-grounding and unsupported-claim checks.

## Concrete evidence actions

Synthesis replaces generic discriminating questions with concrete evidence actions.

Allowed action types are:

- `inspect-internal`: inspect already available system/log/configuration state;
- `run-check`: perform a bounded diagnostic comparison or check in a future governed engine; and
- `request-customer-evidence`: request a specific missing artifact or observation when the evidence cannot reasonably be obtained internally.

For a hypothesis synthesis, each action names the hypothesis ranks it informs, where rank `0` is the leader and ranks `1..N` are ordered alternatives. At least one action must target the leading hypothesis.

The provider should prefer internal evidence and bounded checks. It must not ask the requester to restate the problem or request generic context already present in the safe case projection.

## Abstention

Abstention is reserved for cases where neither the candidate set nor a grounded novel explanation can responsibly be prioritized. An abstention still returns specific evidence actions needed to form a hypothesis. The opaque-identifier negative control is an intended example: without any troubleshooting symptom, the engine may need one precise clarification rather than inventing a signature, latency, or rotation problem.

## Iteration semantics

B5 v2 does not execute a multi-step loop in one provider call. Each paired lane remains one stateless comparative request. Iteration happens by rerunning the adjudicator after new evidence is added to the case snapshot.

A future governed diagnostic engine may therefore:

1. investigate the rank-0 hypothesis;
2. add observed evidence;
3. rerun applicability/diagnostic synthesis;
4. retain, contradict, or demote the previous leader;
5. promote the next alternative or a grounded novel hypothesis; and
6. continue until the evidence supports a governed diagnosis decision.

This keeps the B5 experiment bounded while testing the reasoning contract required by the eventual engine.

## Oracle changes

The pending B5 oracle now records:

- candidate verdicts with corrected evidence polarity;
- acceptable candidate pools that can ground the same leading hypothesis;
- minimum candidate matches rather than exact singleton resource sets;
- required concepts for the leading hypothesis;
- ordered alternative hypothesis pools;
- concrete evidence-action intents and allowed action types;
- `allowed-requires-review` novel-hypothesis policy; and
- forbidden claims.

The oracle no longer rewards a question merely for distinguishing two complementary resources.

## Evaluation changes

Later B5 reporting should replace discriminating-question coverage with evidence-action intent coverage and report:

- leading candidate-grounded hypothesis accuracy/coverage;
- ordered alternative coverage;
- evidence-action intent coverage;
- internal-vs-customer evidence-action mix;
- novel hypothesis count and human-review status;
- unsupported or ungrounded novel claims; and
- the existing candidate-level applicability and safety metrics.

A novel hypothesis requiring human review is neither an automatic success nor an automatic failure in aggregate leading-hypothesis accuracy.
