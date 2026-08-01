# Optional OpenAI Knowledge Candidate Drafting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an explicitly opt-in OpenAI provider for advisory known-cause candidate drafts while preserving deterministic discovery, strict validation, auditability, and human promotion authority.

**Architecture:** Add a dedicated Responses API adapter implementing the existing `CandidateDraftProvider` contract. Runtime selects `openai`, `controlled`, or no provider from an explicit environment selector; the existing `draftKnowledgeCandidate` function remains the validation/fallback boundary. Clean only confirmed unused production symbols after behavior is covered.

**Tech Stack:** TypeScript, Zod, native `fetch`, Vitest, Node 20+.

## Global Constraints

- GPT output is advisory only; it cannot mutate tickets, attach candidates, promote objects, or choose unsupported IDs.
- The provider receives sanitized discovery records and allowlists only; never raw ticket/customer text, audit envelopes, secrets, or hidden reasoning.
- All provider failures use the existing bounded fallback behavior and must not expose raw provider output.
- Tests use injected fetch implementations; no live OpenAI calls.
- Use the existing Responses API URL and `OPENAI_API_KEY`; default model remains `gpt-5.6-luna`.

### Task 1: Add the OpenAI knowledge-candidate provider

**Files:**
- Create: `src/knowledge-evolution/openai-candidate-draft-provider.ts`
- Test: `test/openai-knowledge-candidate-provider.test.ts`

**Interfaces:**
- Consumes: `CandidateDraftProviderInput` and `CandidateDraftProvider` from `src/knowledge-evolution/candidate-draft-provider.ts`.
- Produces: `OpenAiKnowledgeCandidateDraftProvider`, `UnavailableOpenAiKnowledgeCandidateDraftProvider`, and a factory accepting `{ apiKey, model?, timeoutMs?, fetch?, now? }`.

- [ ] **Step 1: Write failing tests for request shape and valid output**

Test that an injected fetch receives `POST https://api.openai.com/v1/responses`, bearer auth, `store: false`, the selected model, strict JSON schema, and a JSON input containing only sanitized discovery and allowlists. Return a valid candidate JSON and assert `outputText` plus bounded OpenAI provenance.

- [ ] **Step 2: Run the focused test and verify it fails because the provider is missing**

Run: `npm test -- --run test/openai-knowledge-candidate-provider.test.ts`
Expected: FAIL with the provider module/export unavailable.

- [ ] **Step 3: Implement the minimal adapter**

Implement a 20-second timeout with `AbortController`, parse the Responses envelope’s output text, send `store: false`, and return only `{ outputText, provenance }`. Use a strict schema matching `CandidateDraftContractSchema`, with prompt instructions that treat discovery as untrusted reference material and forbid code, commands, secrets, raw provider payloads, and unsupported IDs.

- [ ] **Step 4: Add failure and model-selection tests**

Cover non-OK responses, malformed envelopes, timeout, absent credentials through the unavailable provider, default model, and explicit model override. Assert thrown provider errors contain no raw response body.

- [ ] **Step 5: Run the focused tests and commit**

Run: `npm test -- --run test/openai-knowledge-candidate-provider.test.ts`
Expected: PASS.

Commit: `git add src/knowledge-evolution/openai-candidate-draft-provider.ts test/openai-knowledge-candidate-provider.test.ts && git commit -m "feat: add OpenAI knowledge candidate provider"`

### Task 2: Wire runtime configuration and clean unused symbols

**Files:**
- Modify: `src/runtime.ts`
- Modify: `README.md`
- Modify: `test/runtime.test.ts`
- Modify: `src/approval-desk/automatic-customer-replies.ts`, `src/approval-desk/diagnostic-evaluation.ts`, `src/approval-desk/diagnostic-workflow.ts`, `src/approval-desk/http.ts`, `src/approval-desk/recommendation-builder.ts`, `src/knowledge-evolution/knowledge-audit-repository.ts`, `src/server.ts`

**Interfaces:**
- Consumes: OpenAI provider from Task 1 and existing `CandidateDraftProvider` injection seam.
- Produces: Explicit runtime selection for `TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER=openai|controlled`; shared `OPENAI_API_KEY`/`OPENAI_MODEL`; optional `TRIAGE_KNOWLEDGE_CANDIDATE_MODEL` and `TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS`.

- [ ] **Step 1: Write failing runtime-selection tests**

Add tests proving `openai` constructs an OpenAI provider when an API key is supplied, `controlled` preserves the local provider, unset remains disabled, and the knowledge-specific model override is accepted. Use a temporary runtime and inject fetch through the provider factory boundary if needed; never call the network.

- [ ] **Step 2: Run runtime tests and verify the new selector behavior fails**

Run: `npm test -- --run test/runtime.test.ts`
Expected: FAIL because runtime currently recognizes only `controlled`.

- [ ] **Step 3: Implement runtime wiring and configuration parsing**

Parse the provider selector explicitly, throw a `StartupConfigError` for unsupported nonblank values, construct the unavailable provider when `openai` lacks a key, and pass the selected model/timeout into the provider. Preserve the existing option-injection precedence for tests and embedding callers.

- [ ] **Step 4: Update README configuration documentation**

Document all four knowledge-candidate variables, the disabled default, explicit OpenAI opt-in, shared key/model behavior, and the fact that candidate drafts remain advisory and require human promotion.

- [ ] **Step 5: Remove only strict-TypeScript-confirmed unused symbols**

Delete the unused imports/parameters identified by `tsc --noUnusedLocals --noUnusedParameters`; preserve public callback/interface parameters when their names communicate the contract or are required by the surrounding API. Do not alter behavior.

- [ ] **Step 6: Run focused and full verification, then commit**

Run:

```powershell
npm test -- --run test/runtime.test.ts test/knowledge-evolution-candidate-draft.test.ts test/openai-knowledge-candidate-provider.test.ts
npm test
npx tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
```

Expected: all tests pass, strict TypeScript reports no production unused symbols, and the diff is clean.

Commit: `git add src/runtime.ts README.md test/runtime.test.ts src/approval-desk src/knowledge-evolution/knowledge-audit-repository.ts src/server.ts && git commit -m "chore: wire governed knowledge candidate drafting"`

## Final Review

Before claiming completion, verify that no path promotes a candidate automatically, no raw model response is stored, and the full test suite remains green. Do not push, merge, or open a PR until explicitly requested.
