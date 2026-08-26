# Diagnostic Taxonomy Inference B1 Design

**Date:** 2026-08-26
**Status:** Approved design, pending repository commit and implementation plan
**Base:** `feature/diagnostic-taxonomy-oracle-b0`

## Purpose

B1 adds advisory diagnostic taxonomy inference to Support Ticket Triage. The system will infer semantic taxonomy from the ticket and conversation, compare deterministic and GPT-assisted inference against human-reviewed oracle ground truth, and report where each lane succeeds or fails.

B1 does not make taxonomy operationally authoritative. It does not change lifecycle behavior, routing, known-cause behavior, diagnosis authority, or persistence.

## Motivation

The existing classifier answers operational questions such as category, team, priority, and escalation. Diagnostic taxonomy answers a different semantic question: what part of the fictional product is involved, and what kind of problem is being observed?

The taxonomy contract already provides product domain/product area and problem-class structure. B0 added reviewed oracle ground truth and taxonomy scoring. B1 turns taxonomy from static evaluation ground truth into an actual system prediction.

The resulting signals should later support diagnosis, pattern discovery, retrieval/reranking, and semantic-search evaluation, while remaining distinct from diagnostic truth.

## Core Boundary

B1 predicts semantic taxonomy only:

```ts
type TaxonomyInferenceCandidate = {
  primaryProductSurface: ProductSurface | null;
  secondaryProductSurfaces: readonly ProductSurface[];
  problemClasses: readonly ProblemClass[];
};
```

The inference lanes do not own `support` or `basis`. Those remain system-owned metadata because a model or heuristic should not be allowed to declare its own evidentiary strength or provenance.

Conceptually:

```text
ticket + conversation
        |
        +--> deterministic taxonomy inference
        |
        +--> GPT taxonomy inference
                    |
             same candidate contract
                    |
             canonical validation
                    |
             oracle evaluation
```

## Inputs

Both inference lanes receive the same information: ticket subject and description, tags and existing ticket metadata available at inference time, conversation messages, and existing deterministic classification signals where already available through the normal evaluation input.

B1 must not use evaluation-oracle labels, reviewed diagnoses, future fix or verification outcomes, ground-truth known causes, selected knowledge article content, diagnostic playbooks as hidden answer sources, or semantic retrieval results.

Keeping knowledge and retrieval out of B1 creates a clean ungrounded baseline for later comparison.

## Deterministic Lane

The deterministic lane is a small, auditable baseline. It uses explicit weighted signals rather than trying to encode the whole fictional domain with a large procedural rule tree.

Examples of legitimate signals:

```text
"SMS"                         -> messaging / sms
"STOP", "opt-out", consent    -> customer-data / consent
"quiet hours"                 -> messaging / sms
"webhook", HMAC               -> integrations / webhooks
"slow", "delay", "latency"    -> degraded-performance
stored/current state mismatch -> data-integrity
policy behaving as designed   -> expected-behavior
```

The implementation should remain intentionally modest. B1 is measuring whether semantic reasoning adds value, not attempting to hand-code a perfect support ontology.

If evidence is too weak or tied, the deterministic lane may abstain with `primaryProductSurface: null`.

Secondary surfaces should be emitted only when there is meaningful evidence for another affected subsystem.

## GPT Lane

The GPT lane uses strict structured output constrained to the same canonical taxonomy vocabulary as the deterministic lane.

GPT may return only:

```ts
{
  primaryProductSurface,
  secondaryProductSurfaces,
  problemClasses
}
```

It must not return authoritative `support`, `basis`, lifecycle decisions, routing decisions, diagnosis state, or numeric confidence.

A short reasoning/rationale field may exist in provider trace data for debugging and evaluation analysis, but it is not part of `TaxonomyInferenceCandidate` and must not become authoritative state.

Invalid, malformed, or out-of-vocabulary model output is rejected or sanitized through the normal provider boundary rather than accepted as taxonomy.

GPT inference is advisory and optional. Offline tests must not require a network connection or API credentials.

## Candidate Validation

Both lanes pass through the same candidate schema and normalization boundary.

Validation should enforce canonical product surfaces and problem classes, no duplicate secondary surfaces, no primary surface repeated as secondary, no duplicate problem classes, valid abstention through `primaryProductSurface: null`, and no arbitrary taxonomy strings.

The canonical domain definitions remain in `src/diagnostic-taxonomy.ts`.

## Evaluation

B1 evaluates only oracle fixtures that contain reviewed taxonomy ground truth. Unreviewed tickets are excluded rather than treated as failures.

Each prediction is decomposed into:

```text
primarySurfacePass
problemClassPass
taxonomyPass
abstained
```

The existing B0 full taxonomy semantics remain compatible: predicted primary surface must match one acceptable oracle primary surface; predicted problem classes must be non-empty when taxonomy is attempted; every predicted problem class must belong to the oracle's acceptable set; acceptable oracle problem classes are alternatives, not a requirement to emit every allowed value; and a missing prediction fails taxonomy scoring for a taxonomy-aware oracle.

Secondary surfaces are observed and retained for debugging in B1 but are not hard-scored because reviewed secondary-surface ground truth does not yet exist.

## Metrics

Each inference lane reports at least:

```text
primarySurfaceAccuracy
problemClassAccuracy
fullTaxonomyAccuracy
abstentionRate
```

Per-ticket results are retained so evaluation can identify deterministic-correct/GPT-correct, deterministic-wrong/GPT-correct, deterministic-correct/GPT-wrong, both-wrong, and abstention cases.

No target accuracy is defined in B1. The current reviewed taxonomy sample is intentionally too small for a meaningful performance threshold. B1 first proves the inference and evaluation machinery.

## Proposed Components

### `src/diagnostic-taxonomy.ts`

Remains the canonical domain contract for product surfaces, problem classes, support, and basis.

### `src/taxonomy-inference.ts`

Owns `TaxonomyInferenceCandidateSchema`, the candidate type, deterministic taxonomy inference, shared candidate normalization/validation, and no network calls.

### `src/taxonomy-reasoning-provider.ts`

Owns the GPT taxonomy provider interface, strict structured-output request/response handling, optional trace rationale, provider failures/sanitization, and no support/basis authority.

### Evaluation code

Extends the existing oracle evaluation surface with lane-specific and per-ticket taxonomy metrics while preserving B0 compatibility.

The evaluator must not require taxonomy to become part of the operational `TriageRecommendation` contract merely to measure B1.

### `src/approval-desk/ai-evaluation.ts`

May orchestrate taxonomy inference where appropriate, but should not contain deterministic taxonomy rules or GPT provider implementation itself.

## Operational Non-Goals

B1 does not write taxonomy revisions to SQLite, update authoritative ticket state, alter lifecycle phases/actions, alter category/team/priority routing, confirm or reject known causes, select a diagnosis, modify fix behavior, use semantic search, use knowledge articles/playbooks as grounding, or replace Phase A persistence.

Phase A persistence and B1 inference remain separate streams until inference quality and integration boundaries are proven.

## Relationship to Semantic Search

Taxonomy and semantic search will later be complementary signals:

```text
taxonomy:
"What kind of issue is this?"

semantic search:
"What existing resources or cases resemble this?"
```

Future retrieval should discover broadly rather than hard-filter solely by taxonomy. Taxonomy can then act as a soft filter or reranking signal, and retrieval evidence can later challenge or support a taxonomy hypothesis.

The architecture must preserve:

```text
semantic similarity
!= taxonomy match
!= resource applicability
!= known-cause applicability
!= confirmed diagnosis
```

A later evaluation ladder can compare deterministic taxonomy, GPT taxonomy, semantic retrieval alone, retrieval plus deterministic taxonomy reranking, retrieval plus GPT taxonomy reranking, and retrieval plus taxonomy plus diagnostic reasoning.

## Fictional Domain Documentation

The project already has knowledge articles and diagnostic playbooks. B1 does not assume they are a complete or ideal product corpus.

A later documentation slice may create a more extensive, internally coherent fictional product reference covering product behavior, configuration, constraints, data propagation, integrations, consent, messaging, automation, billing, identity, security, and developer-platform behavior.

The corpus should be extensive enough to support realistic retrieval and diagnosis, but rational rather than artificially exhaustive. Documentation defines how the fictional product works; it must not encode ticket-specific oracle answers.

Good documentation may explain quiet-hour behavior, consent synchronization, or flow enrollment semantics. It should not say, "If ticket text contains X, classify it as taxonomy Y."

## Error Handling

Deterministic inference should prefer abstention to fabricated precision when evidence is insufficient.

GPT provider errors, timeouts, unavailable credentials, invalid structured output, or out-of-vocabulary values must degrade to a recorded unavailable/rejected advisory result rather than blocking deterministic evaluation or operational ticket handling.

B1 evaluation must remain runnable offline.

## Testing Strategy

B1 uses TDD. Required coverage includes candidate schema acceptance/rejection, primary-secondary and duplicate invariants, deterministic obvious and contrast cases, deterministic abstention, GPT structured-output/provider-error behavior, oracle scoring by dimension, lane-specific aggregate metrics, per-ticket comparison, exclusion of unreviewed taxonomy fixtures, offline evaluation without API credentials, and optional live GPT evaluation outside the normal test suite.

Existing full-suite behavior must remain unchanged because B1 is advisory/evaluation-only.

## Initial Reviewed Contrast

```text
TKT-1017
SMS campaign blocked by quiet-hour protection
-> messaging / sms
-> expected-behavior

TKT-1030
STOP opt-out not reflected in profile eligibility
-> customer-data / consent
-> data-integrity
```

This pair is intentionally useful because both mention SMS while requiring different semantic interpretation.

## Success Criteria

B1 is complete when a shared taxonomy inference candidate contract exists; deterministic inference can produce or abstain; GPT inference can produce strict advisory candidates using the same semantic contract; neither lane controls support or basis; taxonomy inference is scored only against reviewed taxonomy oracles; evaluation reports primary-surface, problem-class, full-taxonomy, and abstention metrics per lane; per-ticket lane comparisons are available; secondary surfaces are observable but not hard-scored; no persistence/lifecycle/routing/known-cause/diagnosis/semantic-search behavior changes; and offline tests, typecheck, build, and the full test suite pass.

## Deferred Work

Deferred work includes integration with immutable Phase A persistence, support/basis promotion rules, taxonomy-informed diagnosis, taxonomy-informed known-cause applicability, taxonomy-aware playbook selection, semantic embeddings and vector/BM25/hybrid retrieval, taxonomy-aware retrieval reranking, large-scale reviewed taxonomy labeling, extensive fictional product documentation, secondary-surface oracle scoring, and accuracy thresholds/calibration.

These should be introduced as separately measurable slices rather than bundled into B1.
