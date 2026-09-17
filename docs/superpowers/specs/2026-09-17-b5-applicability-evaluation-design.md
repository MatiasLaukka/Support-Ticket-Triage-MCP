# B5 Applicability Evaluation and Model-Assisted Diagnostic Reasoning Design

**Date:** 2026-09-17
**Status:** Approved design; implementation plan pending
**Baseline:** `95b6dcf2584d4a4d656f0a0935dd4deb37b5f99c`
**Branch:** `codex/b5-applicability-design`

## 1. Purpose and program boundary

B5 introduces a trustworthy development-only evaluation of resource applicability and evidence-grounded diagnostic reasoning.

The program responsibilities remain distinct:

```text
B1/B2 taxonomy      -> what kind of issue appears to be present?
B3 discovery        -> what resources might be relevant?
B4 ranking          -> which candidates deserve attention?
B5 applicability    -> which candidates fit this case, and what evidence would distinguish them?
diagnosis            -> what do we believe happened?
governance           -> what may happen next?
```

This first B5 slice evaluates applicability and candidate-grounded hypotheses over frozen synthetic development cases. It does not change runtime behavior or operational authority.

The long-term direction is for a proven B5 capability to become the principal evidence-grounded diagnostic reasoning stage. That future stage may supersede the current shallow model-assisted diagnosis lane, which is anchored to a deterministic cause family and already-selected articles. It will not replace command receipts, replay protection, atomic persistence, lifecycle rules, approval gates, deterministic safety constraints, or human review.

## 2. Architectural decisions and approaches considered

### 2.1 Selected: one-pass comparative applicability adjudicator

For each case, one bounded provider request receives the complete assessable candidate set and returns:

- one applicability verdict per assessable candidate;
- supporting, contradicting, and missing evidence;
- a candidate-grounded leading hypothesis or abstention;
- grounded alternatives; and
- discriminating questions.

This lets the model compare competing explanations under one coherent evidentiary standard. It also avoids the cost and inconsistency of independent candidate calls.

The same immutable case basis is evaluated in two paired lanes:

1. `evidence-only`; and
2. `taxonomy-informed`.

The taxonomy projection is the only permitted input difference between those lanes.

### 2.2 Rejected for this slice: candidate-by-candidate calls plus synthesis

Calling the provider independently for every candidate would produce smaller prompts, but it would multiply provider calls, make standards drift between candidates more likely, and require a second synthesis stage to compare hypotheses. It is disproportionate before the simpler comparative contract has been measured.

### 2.3 Rejected: extend the current diagnosis-reasoning provider

The existing diagnosis provider is intentionally anchored to the deterministic cause family and receives already-selected knowledge. Extending it would conflate applicability with diagnosis, leak the current answer into the experiment, and make it difficult to measure whether B5 independently discriminates among candidates.

B5 therefore uses a separate `ApplicabilityReasoningProvider` contract. It may reuse proven OpenAI-compatible transport, configuration, timeout, and expected-failure mechanisms without sharing the diagnosis contract or its prompt.

This refines rather than violates B4's boundary. B4 preserved the existing diagnosis provider as the then-current future integration point and prohibited B4 from building another diagnosis engine. B5 now defines a distinct offline applicability experiment because the existing provider cannot perform a blind comparative assessment. This slice does not install a second production diagnosis engine. A later diagnosis-integration design must decide whether to adapt, replace, or compose with the existing diagnosis provider.

### 2.4 Deferred: runtime shadow execution

The first slice is offline/development evaluation only. Runtime-shadow provider calls are a separate future design gate after development quality and repeatability are demonstrated.

## 3. Scope

B5 includes:

- a strict applicability input, output, and capture contract;
- a privacy-bounded frozen case projection;
- reuse of one coherent B3 candidate union and B4 channel-rank evidence without selecting a B4 policy;
- exact resolution of matched knowledge-article sections, known-cause projections, diagnostic-playbook descriptors, and sanitized resolved-case memories;
- one bounded request per case;
- four semantic applicability verdicts;
- explicit non-semantic system outcomes;
- candidate-grounded hypotheses, alternatives, discriminating questions, and abstention;
- paired evidence-only and taxonomy-informed development lanes;
- a separate reviewed B5 applicability oracle over the existing 21 approved development cases;
- provider-free input sizing and structural validation;
- strict sanitized capture and reproducible JSON/Markdown reports;
- controlled fake-provider tests; and
- an explicit stop gate before any live development provider run.

## 4. Explicit non-goals

B5 does not include:

- runtime or operational provider calls;
- replacement of the current diagnosis provider;
- changes to diagnosis, recommendation, drafting, routing, lifecycle, knowledge selection, receipts, replay, or governed actions;
- selection or freezing of a B4 ranking policy;
- execution, scoring, ranking, or display of a B4 or B5 holdout;
- corpus, label, retrieval, chunking, embedding, taxonomy, or index tuning in response to model output;
- automatic evidence-budget optimization or lossy truncation;
- choosing a production reasoning model;
- numeric diagnosis confidence or probability;
- automatic playbook execution;
- operational customer data;
- production quality, latency, or cost claims; or
- an implementation plan.

B4 Tasks 7-8 remain deferred. B5 evidence may motivate a later B4 experiment, but B5 cannot select a B4 policy or bypass B4's development-policy and holdout gates.

## 5. Authority and blind-assessment boundary

B5 output is advisory evaluation evidence only. It cannot mutate or control any operational path.

The model receives a blind case projection. It must not receive:

- the deterministic diagnosis or cause family;
- a selected known cause;
- existing diagnosis prose;
- the current recommendation;
- recommendation-selected knowledge article IDs;
- generated support-agent text;
- drafted customer replies;
- lifecycle conclusions;
- future outcomes; or
- operational customer/account identifiers.

Those existing results may be compared with B5 only after the B5 response has been captured and validated.

The safe case projection contains only approved synthetic development data:

- normalized problem statement;
- observed symptoms;
- stable, named case facts;
- safe evidence state;
- bounded conversation state derived from approved synthetic inputs; and
- stable evidence IDs for grounding.

No live customer or operational ticket may enter the first B5 slice.

## 6. Input contract

The provider boundary is model-neutral:

```ts
interface ApplicabilityReasoningProvider {
  assess(
    input: ApplicabilityReasoningInput,
  ): Promise<ApplicabilityReasoningExecution>;
}

type ApplicabilityReasoningInput = {
  contractVersion: string;
  lane: "evidence-only" | "taxonomy-informed";
  case: SafeCaseProjection;
  candidates: readonly ApplicabilityCandidateInput[];
  evidenceRegistry: readonly ResolvedEvidenceRepresentation[];
  taxonomy?: AdvisoryTaxonomyProjection;
  identity: ApplicabilityInputIdentity;
};
```

The actual schemas must be strict allowlists with bounded strings and arrays. The illustrative types in this design do not permit arbitrary extension fields.

### 6.1 Coherent candidate basis

Each case uses one coherent B3 retrieval result. B5 consumes the complete bounded B3 candidate union, not a selected B4 policy output.

The candidate projection preserves:

- resource key and type;
- source identity, source version, and content hash;
- lexical and semantic channel status;
- raw channel scores and ranks;
- B4-derived dense resource rank per available channel;
- matched representation IDs;
- deterministic-reference provenance;
- known-cause-reference provenance; and
- resource taxonomy metadata where available, retained in the immutable internal candidate snapshot and exposed to the provider only in the taxonomy-informed lane.

Candidate order is canonical by resource type and ordinal resource key. It must not be ordered by a B4 policy or provider-facing priority. Channel ranks are visible metadata, not positional hints.

Reference-only candidates remain visible and must not acquire fabricated retrieval scores or ranks.

### 6.2 Exact historical evidence

For every match-bearing candidate, B5 resolves only the exact matched representations named by the coherent retrieval result:

- structure-aware article sections;
- declarative playbook descriptors;
- approved known-cause projections; and
- sanitized eligible resolved-case memories.

Resolution is bound to the same source revision, corpus hash, index identity/generation, representation version, and resource content hashes as the candidate snapshot.

Reference-only candidates require a distinct evidence path because they have no lexical or semantic matched representation. For those candidates, B5 resolves the frozen canonical representation set of the causally referenced resource and labels it `reference-grounded`. The input preserves the reference source and reason and must not describe those representations as search matches. If the reference cannot identify a bounded resource or its frozen canonical representations cannot be resolved, the candidate is `evidence-unavailable`.

Reference-grounded resolution does not create a channel rank, score, or synthetic best section. For a sectioned article referenced only at resource level, the complete frozen canonical section set is included rather than selecting an apparently relevant section with a new hidden heuristic. Input sizing makes the cost visible.

If historical evidence cannot be resolved, B5 records `evidence-unavailable`. It must never silently substitute current content.

### 6.3 Lossless evidence deduplication

Representation text is stored once in a canonical evidence registry keyed by representation identity and content hash. Candidate inputs refer to that registry. This removes repeated text without removing evidence.

Only exact matched representations or explicitly labeled reference-grounded canonical representations are included. B5 does not send an entire resource body merely because one section matched.

## 7. Input sizing and evidence-budget boundary

The first slice measures input size before designing a lossy evidence-selection policy.

Provider-free preflight reports, per case and lane:

- candidate count;
- available and unavailable representation counts;
- deduplicated serialized UTF-8 byte count;
- a conservative token estimate;
- required output-token reserve;
- declared provider/context limit when configured;
- fit status; and
- the largest input components.

Canonical serialization, exact-section selection, and representation deduplication are permitted because they do not discard evidence.

The first slice must not silently drop candidates, matched representations, provenance, or case facts to fit a context window. If the complete input does not fit, the result is `assessment-skipped` with reason `input-too-large`.

This is a fail-closed safeguard, not the intended normal path. If the frozen cases demonstrate a material size problem, a later design may evaluate an explicit evidence-budgeting policy that preserves candidate identity, minimum per-candidate coverage, evidence diversity, and auditable omissions. That policy is not smuggled into B5 v1.

## 8. Semantic applicability and case-level output

The semantic verdict vocabulary is closed:

```ts
type ApplicabilityVerdict =
  | "applicable-next-step"
  | "contradicted"
  | "insufficient-evidence"
  | "irrelevant";
```

The meanings are:

- `applicable-next-step`: the candidate provides a justified investigation path or hypothesis for the observed case. It does not confirm a cause.
- `contradicted`: observed case evidence conflicts with conditions or claims required by the candidate.
- `insufficient-evidence`: the candidate is plausible, but explicitly named evidence is still required.
- `irrelevant`: the candidate does not meaningfully address the case despite being discoverable.

An assessed candidate includes:

```ts
type CandidateAssessment = {
  resourceKey: string;
  verdict: ApplicabilityVerdict;
  supportingEvidence: readonly EvidenceReference[];
  contradictingEvidence: readonly EvidenceReference[];
  missingEvidence: readonly MissingEvidenceItem[];
  explanation: string;
  taxonomyRelation?: "supports" | "conflicts" | "neutral" | "unavailable";
};
```

Evidence references identify stable case-fact IDs or exact representation IDs. Free-form text is not a substitute for a valid reference.

The case synthesis contains either:

- a leading hypothesis grounded in one or more candidate resource keys and evidence references; or
- explicit abstention.

It may also contain grounded alternatives, discriminating questions, and candidate-coverage gaps.

The provider may synthesize across candidates, but it may not present a free-floating diagnosis as established. When no candidate adequately supports a hypothesis, it must abstain and identify the coverage or evidence gap.

A non-abstaining leading hypothesis must be supported by at least one candidate assessed `applicable-next-step`. Candidates assessed `contradicted` or `irrelevant` cannot support a leading or alternative hypothesis. An `insufficient-evidence` candidate may appear only as a qualified alternative with its missing evidence preserved. If no candidate is `applicable-next-step`, the case synthesis abstains.

Each discriminating question names the hypotheses or candidate explanations that its answer would separate. Questions may not request unrestricted exploration unrelated to the candidate set.

## 9. System outcomes and completeness

Semantic verdicts describe case evidence. System outcomes describe whether B5 could perform an assessment. These concepts remain separate.

The execution envelope has one of:

```text
complete
partial-assessment
assessment-skipped
assessment-failed
```

Each candidate is accounted for by either:

- one valid semantic `CandidateAssessment`; or
- an `evidence-unavailable` system outcome with a bounded reason code.

`partial-assessment` is used only when some candidate evidence could not be resolved but every available candidate was validly assessed. It cannot excuse a missing provider judgment.

An output that omits an assessable candidate, duplicates a candidate, invents a candidate key, cites an unknown fact/representation, or provides a semantic verdict for unresolved evidence is invalid. Invalid provider output results in `assessment-failed`, not a partial success.

If no candidate is assessable, the case is skipped without a provider call.

## 10. Taxonomy's B5 role

Taxonomy remains advisory and challengeable.

The program deliberately separates:

```text
semantic similarity
!= taxonomy match
!= resource applicability
!= known-cause applicability
!= confirmed diagnosis
```

The `evidence-only` lane receives no case or candidate taxonomy. Candidate ordering and every non-taxonomy input field remain identical to the taxonomy-informed lane.

The `taxonomy-informed` lane additionally receives:

- primary and secondary product surfaces;
- problem classes;
- support/basis and source provenance;
- a taxonomy snapshot/hash; and
- candidate resource taxonomy metadata already preserved by B3/B4.

Only taxonomy causally available from the same pre-diagnosis case snapshot is eligible. Taxonomy strengthened by a later diagnosis, outcome, or future evidence is excluded to prevent hindsight leakage.

Taxonomy agreement cannot by itself make a candidate applicable. Taxonomy disagreement cannot automatically make it irrelevant. Retrieval evidence may support or challenge taxonomy.

`taxonomyRelation` is present only in taxonomy-informed output. It is an inspectable explanation field, not an authority signal. B5 cannot revise, persist, promote, or operationalize taxonomy.

## 11. One-request-per-case execution

For each lane, the provider receives one request containing all assessable candidates from the complete registry. Unavailable candidate identities and reason codes remain visible as coverage context, but their unresolved content is not presented and they receive no semantic verdict.

Each lane uses a fresh stateless request. No conversation, response chain, session state, or prior lane output may be shared between evidence-only and taxonomy-informed execution. Execution order is recorded so a single paired run is not mistaken for deterministic causal evidence.

One request per case is selected because it supports:

- direct comparison of competing explanations;
- consistent verdict standards;
- detection of attractive but non-applicable near matches;
- candidate-grounded hypothesis synthesis;
- discriminating questions; and
- bounded provider cost.

The strict response must cover every assessable candidate exactly once.

The two development lanes therefore require at most two authorized provider requests per eligible case. This is an evaluation design, not a commitment to two production calls.

## 12. Development oracle and leakage prevention

B5 reuses the 21 approved Knowledge Readiness development cases but creates a separate applicability oracle. Existing retrieval labels remain unchanged.

Before any B5 provider execution, reviewers freeze deliberately judged case-candidate records containing:

- expected applicability verdict;
- supporting case-fact and resource-evidence IDs;
- contradicting evidence IDs;
- acceptable missing-evidence items;
- acceptable grounded hypotheses and alternatives;
- required abstention where applicable;
- useful discriminating questions or question intents;
- forbidden or unsupported conclusions; and
- a rationale.

Unjudged case-candidate pairs remain explicit exclusions. They never count as successes.

Oracle authoring must not inspect provider output. If labels, cases, corpus content, taxonomy, or prompt policy change after a run, the changed inputs receive new identities and constitute a new experiment. Existing evidence is not overwritten or relabeled to improve a score.

Where compatible, B5 may reuse the validated coherent B4 development capture. It must independently validate source revision, case-set hash, corpus/index/generation identity, provider/model identity for retrieval, candidate completeness, representation identities, and strict capture safety before reuse.

No existing B4 ranking policy is selected merely because its capture provides coherent B3 inputs.

## 13. Evaluation lanes, baselines, and metrics

The development comparison includes:

1. a retrieval-only reference showing the consequence of treating every retrieved candidate as `applicable-next-step`;
2. the evidence-only provider lane; and
3. the taxonomy-informed provider lane.

Taxonomy overlap is reported as a diagnostic relationship. It is not converted into an automatic applicability verdict.

### 13.1 Candidate-level metrics

For judged, available pairs, reports include:

- full confusion matrix;
- per-verdict precision, recall, and F1;
- macro-F1 with visible per-label support;
- `applicable-next-step` precision and recall;
- insufficient-evidence recognition;
- dangerous false-positive rate, where an oracle `contradicted` or `irrelevant` item is predicted `applicable-next-step`;
- structurally valid evidence-reference rate;
- semantically correct supporting/contradicting citation rate where judged; and
- unsupported-claim and hallucinated-reference counts.

### 13.2 Case-level metrics

For eligible judged cases, reports include:

- grounded leading-hypothesis accuracy and coverage;
- acceptable alternative-hypothesis coverage;
- abstention precision and recall;
- discriminating-question coverage;
- candidate-coverage-gap recognition; and
- ungrounded or free-floating hypothesis count.

### 13.3 Taxonomy delta analysis

Paired lane output is compared case by case and candidate by candidate:

- beneficial changes;
- harmful changes;
- neutral changes;
- new or corrected dangerous false positives;
- new or corrected abstentions;
- evidence of taxonomy anchoring; and
- cases where evidence appropriately challenges taxonomy.

The report must not claim that taxonomy caused a difference from a single nondeterministic run. It describes observed paired differences and their limitations.

### 13.4 Coverage, exclusions, and input-size diagnostics

Reports separately show:

- complete and partial assessment rates;
- evidence-unavailable counts;
- skipped and failed cases by reason;
- candidate and representation counts;
- serialized bytes and estimated tokens;
- resource-missing, unjudged, unavailable, skipped, and failed exclusions;
- provider usage and timing metadata; and
- exact denominators for every metric.

Excluded, unavailable, skipped, and failed items never count as successes.

## 14. Interpretation and repeatability

A single paired provider run is preliminary evidence. It is categorized as:

- `promising`;
- `regressive`; or
- `inconclusive`.

The evaluator records provider/model identity, request order, contract/prompt version, timing, and output hashes. It must disclose that model output may vary even when inputs are identical.

Promising results do not authorize runtime integration. Materially promising results require a separately designed and authorized repeatability experiment before runtime-shadow applicability is proposed.

No automatic score threshold selects a model or policy in this slice. Human review considers candidate safety errors, coverage, exclusions, corpus limitations, and qualitative case deltas alongside aggregates.

## 15. Privacy, prompt injection, and capture safety

Case and resource text is untrusted data, even when it comes from an approved resource. Provider instructions must delimit it as data and forbid following embedded instructions.

Following the existing taxonomy safety precedent, detected prompt injection produces `assessment-skipped` with reason `prompt-injection-detected` before any provider call.

Persisted capture may contain only strict approved projections:

- approved synthetic safe case facts and their stable IDs;
- candidate/resource identities;
- representation IDs and hashes, not duplicated resource bodies;
- evidence references;
- contract and prompt-template versions and hashes;
- evaluator/source revision;
- case-set, oracle, corpus, index, generation, taxonomy, candidate-snapshot, input, and output hashes;
- provider/model identity;
- lane and execution order;
- bounded usage and overlapping timing metadata;
- strict structured assessments; and
- typed sanitized failure reasons.

It must not contain:

- raw operational conversations;
- customer names, emails, account IDs, or secrets;
- raw prompt transcripts;
- arbitrary provider request/response payloads;
- hidden reasoning;
- embedding vectors;
- credentials or headers;
- arbitrary provider error bodies; or
- unrestricted free-form trace fields.

All capture objects use exact-key allowlists. Hashes that claim SHA-256 identity must be canonical 64-character lowercase hexadecimal digests. Unknown fields fail validation.

JSON is the source artifact. Markdown must render deterministically from saved JSON and reproduce every metric aside from explicitly remeasured timing where such remeasurement is separately identified.

B5 output is confined to the fixed repository root:

```text
reports/retrieval/b5-applicability/
```

Exported production APIs must not permit caller-controlled artifact roots. Manifest, case-set, evidence, and output paths are canonicalized physically before containment checks so symlinks and junctions cannot escape or bypass the boundary.

## 16. Provider execution and failure behavior

Ordinary tests and provider-free validation make no live calls.

A live development run requires explicit authorization naming:

- endpoint class and endpoint;
- model and immutable model identity where available;
- contract and prompt-template versions and hashes;
- timeout and request limit;
- frozen development case-set/oracle hashes; and
- which paired lanes may execute.

There is no default live provider, automatic retry, remote fallback, model download, or model substitution.

Expected failures include:

- provider not configured or unavailable;
- timeout;
- bounded HTTP/provider failure;
- declared context exhaustion; and
- invalid structured output.

Expected failures produce sanitized `assessment-failed` results when a call was attempted. Unexpected programming, integrity, hash, evidence-resolution, or invariant failures fail the evaluator and must not be mislabeled as ordinary provider degradation.

No partial artifact is published as a complete experiment. Retry after a failed explicitly bounded live attempt requires renewed authorization when the authorization was limited to one attempt.

## 17. Holdout and B4 gates

The first B5 slice uses development cases only.

It must not load, retrieve, score, rank, display, or otherwise inspect existing B4/Knowledge Readiness holdout case content. Any future B5 holdout requires:

- separately reviewed B5 applicability labels;
- a frozen approved development contract and provider/model identity;
- immutable hashes and source identities;
- no tuning after holdout access; and
- separate explicit execution authorization.

The B5 CLI and APIs reject holdout execution by default. The first slice need not provide an executable holdout path.

B4 remains inconclusive. B5 cannot reinterpret its development results as a B4 policy selection. B4 Tasks 7-8 remain open until expanded evidence supports a separately approved selection and holdout decision.

## 18. Implementation shape

Expected repository areas are:

```text
src/
├─ applicability-reasoning-provider.ts
└─ retrieval/
   ├─ applicability-types.ts
   ├─ applicability.ts
   ├─ applicability-evidence.ts
   └─ applicability-capture.ts

scripts/
└─ evaluate-applicability.ts

data/evaluation/
└─ applicability-v1/
   ├─ manifest.json
   └─ development.json

reports/retrieval/
└─ b5-applicability/

test/
├─ applicability.test.ts
├─ applicability-evidence.test.ts
├─ applicability-capture.test.ts
├─ applicability-provider.test.ts
└─ applicability-evaluation.test.ts
```

Exact file boundaries may be adjusted by the implementation plan, but the domain/provider/evaluator/runtime authority boundaries in this design may not be collapsed.

There is no first-slice modification to runtime composition, HTTP/MCP commands, `TriageService`, operational persistence, recommendation generation, drafting, or customer-facing behavior.

## 19. Verification requirements

Required test coverage includes:

- strict input/output schema acceptance and rejection;
- exact-key and bounded-text enforcement;
- blind-input exclusion of diagnosis/recommendation/generated fields;
- canonical candidate order and input-order invariance;
- complete candidate outcome accounting;
- valid case-fact and representation grounding;
- rejection of unknown, duplicate, missing, or unresolved references;
- grounded hypothesis and abstention behavior;
- discriminating-question references;
- historical evidence resolution without current-content substitution;
- unavailable-source recovery behavior;
- lossless representation deduplication;
- provider-free input sizing and no lossy truncation;
- byte-for-byte non-taxonomy parity between paired lanes;
- eligible pre-diagnosis taxonomy and hindsight-leakage rejection;
- prompt-injection suppression before provider use;
- all four semantic verdicts;
- complete, partial, unavailable, skipped, and failed paths;
- typed expected provider failures and unexpected failure propagation;
- capture identity, hashing, privacy scanning, and strict validation;
- JSON/Markdown reconstruction;
- fixed artifact-root and physical path containment, including symlink/junction regressions where the platform permits them;
- development-only execution and holdout rejection;
- no ordinary-test provider calls; and
- no operational-authority change.

Final verification includes:

- focused B5 suites;
- `npm run typecheck`;
- `npm run build`;
- existing oracle and taxonomy evaluators;
- existing B3/B4 provider-free validation where applicable;
- `npm test -- --maxWorkers=2`;
- deterministic artifact reconstruction tests;
- `git diff --check`; and
- a clean worktree.

## 20. Completion criteria and next gate

The first B5 slice is complete when:

1. The provider-neutral applicability contract and strict validators exist.
2. The 21 approved development cases have a separately reviewed, frozen B5 applicability oracle before provider execution.
3. A coherent candidate basis and exact historical evidence resolve reproducibly.
4. Provider-free preflight validates identity, privacy, completeness, and input size for every development case.
5. Controlled providers cover every verdict, abstention, system state, and failure path.
6. Evidence-only and taxonomy-informed inputs are identical except for the declared taxonomy projection.
7. Captures are strict, sanitized, hash-bound, and reconstruct their reports exactly.
8. Ordinary tests and verification make no live provider calls.
9. Holdout and operational execution remain fail-closed.
10. No B4 policy or production reasoning model is selected.
11. No runtime or operational behavior changes.
12. Required verification passes.

After implementation and independent review, work stops at the explicit authorization gate for a bounded development-only provider run.

Observed results determine the next separately designed step:

```text
poor or inconclusive
  -> improve the oracle, corpus, prompt contract, or applicability design

promising but unstable
  -> authorized repeatability experiment

credible and repeatable
  -> runtime-shadow applicability design

successful runtime shadow
  -> governed diagnosis-integration design
```

No result from this slice directly authorizes diagnosis replacement or operational action.
