# H5a Provider-Neutral Hybrid Shadow Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist provider-neutral H5a shadow reasoning runs from frozen H4b opportunities with safe validation and database-backed idempotency.

**Architecture:** Extend the H4a run payload to a versioned current form carrying H4b opportunity identity and a deterministic execution key, while decoding legacy v1 records without invented identity. Migrate the SQLite repository to support nullable legacy columns, unique execution keys, opportunity lookup, and transactional replay/conflict handling. Add a standalone provider-neutral runner that passes only a frozen H3 input clone, validates output through the existing H4a parser, and persists completed or safely classified failed runs.

**Tech Stack:** TypeScript, Zod, better-sqlite3, Vitest, existing canonical JSON and H4a/H4b reasoning contracts.

**Spec:** User-provided H5a brief in this task; approved design confirmed in conversation.

## Global Constraints

- Do not start H5b or make live provider/API calls.
- Do not alter lifecycle authority, authoritative command success paths, retrieval behavior, or H4b trigger mapping.
- Do not add provider fallback/escalation, queues, scheduling, UI, diagnosis authority, or H6 benchmarking.
- Do not mutate capture contexts or persist raw errors, stacks, HTTP bodies, prompts, or provider objects.
- Do not derive opportunity or execution identity from wall-clock time or random run IDs.
- Preserve v1 decoding without fabricating opportunity IDs or execution keys.
- Use the existing H4a parser for completed result and basis/graph validation.

## Review Focus

- Legacy payloads have no opportunity identity: retain their v1 semantics and decode them without synthetic fields.
- Same execution key with a semantically different payload: reject as a conflict rather than replaying it.
- Two repository connections race on the same key: database uniqueness prevents duplicate semantic runs.
- A provider mutates its input or returns malformed/dangling output: only a frozen clone is exposed and invalid output is never persisted as completed.
- Provider or persistence failure stays outside authoritative operations: keep the runner standalone and propagate failures only to its shadow caller.

---

### Task 1: Version Hybrid Shadow Run Payloads and Migrate SQLite Schema

**Files:**
- Modify: `src/reasoning/shadow-run-types.ts`
- Modify: `src/reasoning/sqlite-shadow-run-repository.ts`
- Test: `test/hybrid-shadow-run-sqlite.test.ts`

**Interfaces:**
- Keep the existing v1 payload decodable as a legacy run with no opportunity/execution identity.
- Add the current v2 run shape with required `opportunityId` and deterministic `executionKey`.
- Extend SQLite schema to version 2, allowing v1 and v2 payload rows, and add nullable identity columns so migrated records remain unidentified.
- Add `listShadowRunsForOpportunity(opportunityId)` for narrow comparison lookup.

- [x] Add failing persistence tests for opening and migrating a v1 database, retaining old payloads unchanged, and decoding new v2 runs with both identities.
- [x] Run `npx vitest run test/hybrid-shadow-run-sqlite.test.ts`; confirm the new migration and v2 assertions fail for missing support.
- [x] Implement explicit v1/v2 parsing and a transactional schema-v1-to-v2 migration; new databases start at schema v2.
- [x] Verify the focused persistence suite passes and old v1 decoding still yields no fabricated opportunity or execution identity.

### Task 2: Enforce Idempotency, Replay, Conflict, and Opportunity Lookup

**Files:**
- Modify: `src/reasoning/sqlite-shadow-run-repository.ts`
- Test: `test/hybrid-shadow-run-sqlite.test.ts`

**Interfaces:**
- Add a repository operation that atomically records a v2 run or returns the matching existing run as replay.
- Attempt the transactional insert under a partial SQLite UNIQUE execution-key constraint; on that constraint collision, re-read the winning row by key and compare semantic payloads excluding only run UUID and `recordedAt`. Return replay for equal payloads and a typed conflict for different payloads. The database constraint is authoritative; a preflight read may only avoid unnecessary provider work. Normalize SQLite busy/locked behavior using the existing repository conventions: use a 250 ms SQLite busy timeout and normalize SQLITE_BUSY/SQLITE_LOCKED to PERSISTENCE_ERROR; do not add retry behavior.
- Enforce uniqueness with a partial SQLite unique index on non-null execution keys; keep legacy rows outside that index.

- [x] Add failing tests for a new execution, exact semantic replay with changed UUID/time, conflicting payload reuse, duplicate insert attempts from two repository connections, different providers on one opportunity, and opportunity lookup ordering. The repository method attempts insertion directly; the unique index resolves collisions without a preflight existence check.
- [x] Run `npx vitest run test/hybrid-shadow-run-sqlite.test.ts`; confirm the new idempotency/concurrency assertions fail before implementation.
- [x] Implement deterministic-key uniqueness and transactional insert-or-replay/conflict behavior, plus the opportunity lookup index/query.
- [x] Verify focused persistence tests pass, including duplicate inserts from two independently opened repository connections.

### Task 3: Add the Provider Interface and Standalone H5a Runner

**Files:**
- Create: `src/reasoning/hybrid-shadow-runner.ts`
- Modify: `src/reasoning/shadow-run-types.ts` only if a runner-specific type is needed
- Test: `test/hybrid-shadow-runner.test.ts`

**Interfaces:**
- Define a narrow `HybridReasoningProvider` with existing `ReasoningProviderIdentity` and `reason(input)` over a deeply readonly H3 input clone.
- Define `runHybridShadowOpportunity` over H4b `HybridShadowCaptureContext`, one provider, the H4a repository, and injected clock/run-ID sources.
- Define `HYBRID_REASONING_PROVIDER_CONTRACT_VERSION` as the explicit semantic execution version and derive the execution key from canonical JSON containing that fixed version, `opportunityId`, `providerKind`, and `model`; hash with SHA-256. Increment the version when materially relevant adapter, prompt/reasoning-contract, or output-contract behavior changes for the same opportunity/provider/model. The repository has no generic provider/model revision identity, so do not add one. Never include timestamps, random IDs, or `recordedAt`. Do not include mode separately because H4b opportunity identity already includes it.
- Return new/replayed status with the stored run; classify known safe timeout/unavailable/invalid-output cases and map unknown provider errors to a fixed provider-error message.
- The runner remains standalone and never receives or mutates lifecycle/runtime state.

- [x] Add deterministic fake-provider tests for frozen-input-only delivery, success persistence and authoritative basis preservation, injected timestamp/run ID, thrown-provider failure persistence without a result or raw error details, malformed provider output persisted as a safe `INVALID_OUTPUT` failed run with no result/details, retry preflight without a second provider call, two runner/repository connections held at a provider barrier until both have observed key absence, distinct providers sharing one opportunity, and unchanged capture input.
- [x] Run `npx vitest run test/hybrid-shadow-runner.test.ts`; confirm assertions fail because the provider interface/runner are absent.
- [x] Implement the provider-neutral runner, safe failure mapping, key derivation, existing-parser validation, and repository bridge. When provider output fails structural/basis/graph validation, persist only a bounded safe invalid-output failed run; if that failure record cannot be persisted, propagate the persistence error to the shadow caller.
- [x] Verify the runner suite passes and database replay/conflict tests remain green.

### Task 4: Regression Verification and H5a Commit

**Files:**
- No additional production files unless a focused verification failure requires an in-scope fix.

- [x] Run focused H5a runner and persistence suites, H4b capture tests, H2/H3 tests, retrieval suites, and relevant lifecycle/runtime suites.
- [x] Run `npm run typecheck` and `npm run build`.
- [x] Run the full suite with the repository's stable worker setting; report any unrelated pre-existing failures precisely.
- [x] Run `git diff --check`, inspect the complete scoped diff, and confirm the working tree contains no unrelated changes.
- [x] Commit the coherent H5a slice on `codex/hybrid-reasoning-h2-h3`; do not push, merge, or open a PR.
