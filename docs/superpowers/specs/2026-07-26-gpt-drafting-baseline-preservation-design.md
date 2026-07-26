# GPT Drafting Baseline Preservation

## Context

The live AI comparison showed that GPT customer-response drafts were often
reasonable in tone but omitted governed facts that the deterministic draft
already contained, such as platform-delay wording, incident-review status, or
required evidence fields. The drafting provider currently sends ticket,
conversation, evidence-readiness, and knowledge context, but not the trusted
deterministic draft it is improving.

## Goal

Improve GPT-assisted customer-response completeness without coupling the
production provider to evaluation-only response contracts or weakening the
existing deterministic safety boundary.

## Design

1. Include `deterministicDraft` in the structured input sent to the GPT
   drafting provider.
2. Add drafting instructions that treat the deterministic draft as a trusted
   completeness anchor. GPT may improve tone and readability, but must retain
   its supported problem summary, customer-safe status/escalation wording, and
   missing-evidence requests unless trusted lifecycle context explicitly
   supersedes them.
3. Continue treating ticket subject and description as untrusted content and
   continue forbidding secrets, internal labels, approval details, and model
   behavior in customer text.
4. Keep local guardrails and deterministic fallback unchanged. A rejected or
   unavailable GPT draft must still fall back safely.

## Non-goals

- Do not copy response-quality benchmark contracts into production prompts.
- Do not add a second response-generation path.
- Do not change deterministic response wording, approval gates, prompt-
  injection handling, or classification behavior.
- Do not add retries or extra live API calls.

## Verification

- Add a provider test that inspects the request body and proves the baseline
  draft is included.
- Add an instruction assertion proving the model is told to preserve the
  baseline's supported facts and evidence requests.
- Run the focused provider tests, typecheck, and the full test suite.
- Regenerate the controlled comparison to confirm its 11/11 score remains
  intact. A live run remains optional and is an observation, not a benchmark
  fixture.

## Acceptance criteria

- GPT drafting receives the deterministic baseline for every eligible draft.
- Existing prompt-injection and escalation skips remain unchanged.
- Existing guardrails still reject unsafe or incomplete provider drafts.
- Controlled comparison remains 11/11 in all four lanes.
