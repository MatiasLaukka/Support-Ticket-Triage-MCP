# GPT Drafting Contract Enforcement Design

## Goal

Make GPT-assisted customer responses reliable enough for the portfolio benchmark without weakening the deterministic workflow, diagnosis, approval, or safety boundaries.

The deterministic draft remains the trusted baseline. GPT may improve wording, but it must not change supported facts, lifecycle state, evidence requirements, escalation meaning, or approval semantics.

## Observed failure pattern

The latest live run showed that classification and knowledge-article selection were reliable: all 20 live GPT classifications matched the expected domain outcome and no structured-output fallbacks occurred. The remaining failures were in GPT drafting:

- escalation wording was too vague (`under review` instead of explicit incident review);
- technical concepts were paraphrased beyond the evaluator's current aliases;
- one stale-reply draft repeated a question whose evidence was already supplied;
- one draft exceeded its word limit;
- closure wording was semantically correct but did not state the expected resolution concept.

These are response-contract failures, not classifier or knowledge-retrieval failures.

## Design principles

1. Deterministic domain outcomes are authoritative.
2. Customer-facing drafts must be validated locally before they are returned.
3. Safety, escalation, evidence status, and approval boundaries are hard obligations; style is advisory.
4. GPT output must never expose internal prompt-injection detection, article IDs, or backend-only workflow details.
5. The same response contract is used by the Approval Desk path, MCP tools, and evaluation harness.
6. A failed GPT draft must degrade safely to a deterministic response, never to an unvalidated model response.

## Proposed flow

```text
authoritative workflow outcome
        |
        v
deterministic baseline + obligation checklist
        |
        v
GPT draft (optional wording improvement)
        |
        v
local semantic contract + safety validation
        |
   pass | fail
        |       \
        |        -> one bounded repair request containing only missing obligations
        |                         |
        |                    pass | fail
        |                         |       \
        v                         |        -> deterministic baseline fallback
validated GPT draft <-------------+
```

The repair request is optional and bounded to one attempt. If the provider is unavailable, times out, returns invalid structured output, or fails the repaired contract, the deterministic baseline is returned with auditable fallback metadata.

## Contract model

The response-quality contract will distinguish three kinds of obligations:

### Hard policy obligations

These must pass exactly or through narrowly defined, policy-safe aliases:

- escalation disclosure (`incident review`, `specialist escalation`, or the scenario's approved equivalent);
- no secrets, approval bypasses, unsupported resolution promises, or internal IDs;
- lifecycle-consistent closure and recheck language;
- no repeated evidence questions after the conversation marks that evidence as supplied.

### Evidence and diagnostic concepts

These use normalized concept groups with explicit aliases. For example, `webhook signature`, `signature validation`, and `signature failure` may be equivalent when the scenario's contract defines them as the same customer-safe concept. Aliases must be scenario-specific and cannot erase a required diagnostic distinction.

### Style obligations

Tone, concision, and natural phrasing remain quality signals. They may produce warnings but must not override authoritative workflow state.

## GPT prompt contract

The drafting input will include a machine-readable obligation checklist derived from the deterministic baseline and workflow state:

- required customer-safe concepts;
- required evidence to request, excluding evidence already supplied;
- required escalation wording;
- forbidden claims and internal terms;
- maximum word count;
- whether the ticket is awaiting evidence, awaiting a platform fix, ready for close, or escalated.

The prompt will explicitly state that `deterministicDraft` is a completeness anchor, not optional advice. GPT may rephrase it only if every obligation remains present.

## Validation and repair

The local validator will return structured diagnostics with obligation IDs and sanitized messages. A failed candidate will not be shown as the customer response.

For an OpenAI candidate:

1. Validate the candidate.
2. If only repairable contract obligations fail, send one repair request containing the missing obligation IDs and the baseline draft.
3. Validate the repaired candidate.
4. If any hard policy obligation still fails, return the deterministic baseline.

For deterministic candidates, retain the existing bounded local fallback behavior; do not send deterministic output through GPT repair.

Fallback telemetry will record provider status, validation stage, failed obligation IDs, and whether repair was attempted. It will not record raw model output, ticket secrets, or internal prompt-injection text.

## Evaluator alignment

The benchmark evaluator will use the same normalized concept groups for ordinary terminology, while preserving strict checks for escalation, closure, safety, and evidence-state obligations. This prevents false negatives such as `working again` versus `resolved it` without making the benchmark permissive about missing escalation or repeated questions.

The harness will report separately:

- classification agreement;
- candidate-draft contract pass rate;
- repaired-draft pass rate;
- deterministic fallback rate;
- forbidden-claim and secret-request violations;
- latency and token usage.

## Testing scope

Add focused tests for:

- obligation checklist generation for escalation, partial evidence, stale replies, failed fixes, and closure;
- semantic aliases that should pass;
- near-miss wording that must still fail hard policy checks;
- one successful GPT repair;
- repair failure followed by deterministic fallback;
- no repeated question when evidence is already supplied;
- word-limit enforcement;
- sanitized telemetry and no raw model output leakage;
- unchanged prompt-injection skip behavior;
- Approval Desk and MCP paths producing equivalent validated outcomes.

Retain the existing deterministic classifier harness and controlled AI comparison benchmark. Do not add article-search changes until new failure data demonstrates a retrieval gap.

## Success criteria

- GPT classification remains at least 20/20 agreement in the current live scenarios.
- GPT drafts either pass the contract or safely fall back; no unvalidated GPT draft is returned.
- All hard policy obligations pass in the controlled benchmark.
- Live GPT drafting improves materially beyond the current 7/18 strict pass rate without increasing safety violations.
- The evaluator distinguishes genuine contract defects from acceptable wording variation.
