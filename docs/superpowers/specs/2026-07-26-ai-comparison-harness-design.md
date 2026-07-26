# AI-Assisted Classification and Customer-Response Comparison Harness

## Purpose

Extend the existing deterministic diagnostic evaluation harness so that it can
compare the two optional AI roles independently and together:

1. deterministic classification with deterministic drafting;
2. GPT-assisted classification with deterministic drafting;
3. deterministic classification with GPT-assisted drafting;
4. GPT-assisted classification with GPT-assisted drafting.

The existing deterministic classifier harness remains the baseline and is not
rewritten. The comparison layer reuses the production classifier, workflow
guidance, classification-reasoning provider, draft provider, and deterministic
validators.

## Goals

- Show the actual classification and customer-response draft for every
  scenario and lane.
- Measure whether GPT advisory classification improves agreement with expected
  outcomes without overriding deterministic safety policy.
- Measure whether GPT drafting improves customer-facing quality without
  weakening existing validators or approval boundaries.
- Make classification-only, drafting-only, and combined effects distinguishable.
- Keep deterministic and controlled-local comparisons reproducible in CI.
- Make live OpenAI evaluation explicit, attributable, and opt-in.

## Non-goals

- Rewriting `classifyTicket` or the existing deterministic harness.
- Making GPT classification authoritative.
- Allowing GPT to mutate ticket state, diagnostic state, routing, escalation,
  approval fields, or lifecycle transitions.
- Treating an exact static response string as the only valid answer.
- Making live provider calls part of the default test command or CI gate.

## Evaluation matrix

Each scenario in the existing diagnostic matrix is evaluated through the same
production recommendation-building path with a lane configuration:

| Lane | Classification | Drafting | Default execution |
| --- | --- | --- | --- |
| `deterministic-deterministic` | deterministic | deterministic | CI |
| `gpt-deterministic` | GPT advisory | deterministic | controlled-local CI; live opt-in |
| `deterministic-gpt` | deterministic | GPT-assisted | controlled-local CI; live opt-in |
| `gpt-gpt` | GPT advisory | GPT-assisted | controlled-local CI; live opt-in |

Controlled-local providers exercise the same provider contracts without a
network call and are labeled as simulations. Live lanes use the existing
OpenAI adapters only when an explicit `--live` option is supplied and a key is
available. Live output is never presented as a reproducible CI result.

## Safety and authority

The deterministic preflight runs before either AI role. When prompt injection
is detected:

- GPT classification is not invoked;
- GPT drafting is not invoked;
- deterministic classification and drafting continue;
- the operator/audit warning remains visible;
- the customer-facing draft does not disclose the internal detection.

For all other scenarios, GPT classification produces advisory signals only.
Deterministic category, priority, team, escalation, evidence readiness,
diagnostic state, approval fields, and lifecycle gates remain authoritative.
Drafts pass the existing deterministic validators before quality scoring. A
hard safety failure makes the lane fail regardless of any quality score.

## Classification comparison

Each lane records:

- deterministic category, priority, team, escalation, and citations;
- GPT advisory signals, if invoked;
- final persisted recommendation fields;
- agreement with the expected outcome;
- agreement or disagreement with the deterministic baseline;
- provider status, fallback status, and prompt-injection skip status.

Classification metrics include category/team/priority agreement, knowledge
citation coverage, advisory acceptance rate, deterministic-safety override
count, prompt-injection provider-skip count, and disagreement summaries.
GPT output is never used as the expected answer; expected outcomes and
deterministic policy remain the oracle.

## Customer-response comparison

The report stores the actual draft for each scenario and lane, along with its
source, style, validator checks, and fallback information. Each scenario has a
response contract containing:

- concepts the response must communicate;
- evidence requests that are relevant and optional;
- claims that are forbidden for the current diagnostic state;
- required escalation or ownership wording;
- expected tone and maximum length;
- internal details that must not appear.

Static ideal responses are retained as human-readable exemplars and review
anchors. They are not compared with exact string equality. The first quality
gate is deterministic contract checking. Optional semantic judging may score
relevance, clarity, empathy, and actionability, but it cannot override a hard
safety failure.

Response metrics include safety pass rate, required-concept recall, forbidden-
claim count, relevant-evidence precision, unnecessary-question count, style
score, length compliance, escalation fidelity, and deterministic-versus-GPT
pairwise preference when both drafts are available.

## Report and command surface

Add a comparison command that emits both machine-readable JSON and a concise
Markdown report. The report contains a scenario-by-lane table, actual drafts,
classification differences, provider provenance, hard failures, quality
scores, and aggregate lane metrics. Synthetic fixture content is allowed in
the local report; API keys and provider payloads are never recorded.

The default command runs deterministic and controlled-local lanes. A separate
explicit live option runs the OpenAI lanes and records the model/provider
metadata needed to interpret non-reproducible results.

## Testing strategy

- Preserve all existing deterministic classifier and diagnostic harness tests.
- Add focused tests for the four lane configurations using injected fake
  providers.
- Assert that prompt-injection scenarios skip both providers.
- Assert that GPT advisory signals cannot override security, outage, SLA,
  approval, diagnostic, or lifecycle rules.
- Assert that draft contracts and existing validators are applied in every
  lane.
- Keep live-provider tests opt-in and separate from the default suite.
- Run full tests, the existing fixture evaluation, and the comparison report
  before publishing results.

## Success criteria

The harness can answer, per scenario and in aggregate:

1. Did GPT classification improve or degrade the deterministic baseline?
2. Did GPT drafting improve customer usefulness without safety regressions?
3. What changed when both AI roles were enabled?
4. Did prompt-injection preflight prevent both AI roles from running?
5. Which results are reproducible local simulations and which are live-model
   observations?

