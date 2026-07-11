# GPT Assist Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a compact GPT Assist panel with missing-info suggestions, investigation steps, tone, and audience while preserving deterministic triage and approval.

**Architecture:** Extend the existing draft provider from a response-only output to an enriched assist output. Persist the assist object on pending recommendations, expose it through the existing HTTP API, and render one compact advisory UI card beside the draft.

**Tech Stack:** TypeScript, Zod, Vitest, existing Approval Desk HTML/JS, OpenAI Responses API JSON schema.

---

### Task 1: Domain And Service Plumbing

**Files:**
- Modify: `src/domain.ts`
- Modify: `src/triage-service.ts`
- Test: `test/domain.test.ts`
- Test: `test/triage-service.test.ts`

- [x] **Step 1: Write failing schema tests**

Add a domain test proving `TriageRecommendationSchema` accepts `gptAssist` with source, suggestions, steps, tone, audience, and checks. Also add a test proving empty assist suggestions are rejected.

- [x] **Step 2: Run the domain tests to verify RED**

Run: `npm test -- --run test/domain.test.ts`
Expected: FAIL because `gptAssist` is not allowed by the strict schema.

- [x] **Step 3: Add domain schemas**

Add `GptAssistSourceSchema`, `GptAssistAudienceSchema`, `GptAssistSchema`, and `GptAssist` type. Add optional `gptAssist` to `TriageRecommendationSchema`.

- [x] **Step 4: Pass `gptAssist` through submission**

Add optional `gptAssist` to `SubmitRecommendationSchema`, `SubmitRecommendationInput`, and `TriageService.submitRecommendation` so pending recommendations preserve the object.

- [x] **Step 5: Run focused tests**

Run: `npm test -- --run test/domain.test.ts test/triage-service.test.ts`
Expected: PASS.

### Task 2: Draft Provider Enrichment

**Files:**
- Modify: `src/approval-desk/draft-response-provider.ts`
- Test: `test/openai-draft-provider.test.ts`
- Test: `test/approval-desk-recommendation.test.ts`

- [x] **Step 1: Write failing provider tests**

Update OpenAI provider tests to expect strict JSON with `draftCustomerResponse`, `missingInfoSuggestions`, `investigationSteps`, `tone`, and `audience`. Add a fallback test that unsafe suggestions asking for secrets cause fallback.

- [x] **Step 2: Run provider tests to verify RED**

Run: `npm test -- --run test/openai-draft-provider.test.ts test/approval-desk-recommendation.test.ts`
Expected: FAIL because provider outputs only a draft response.

- [x] **Step 3: Extend provider result types**

Return a validated assist object from deterministic, OpenAI, and fallback paths. Keep existing `draftCustomerResponse*` fields intact for compatibility.

- [x] **Step 4: Add assist validators**

Validate non-empty suggestion arrays, no internal knowledge IDs, no approval-bypass language, no unsafe promises, no secret requests, and reviewer-facing investigation steps.

- [x] **Step 5: Run focused tests**

Run: `npm test -- --run test/openai-draft-provider.test.ts test/approval-desk-recommendation.test.ts`
Expected: PASS.

### Task 3: Recommendation Builder And HTTP Shape

**Files:**
- Modify: `src/approval-desk/recommendation-builder.ts`
- Test: `test/approval-desk-recommendation.test.ts`
- Test: `test/approval-desk-http.test.ts`

- [x] **Step 1: Write failing builder and HTTP tests**

Assert deterministic recommendations include `gptAssist`; OpenAI-backed recommendations expose OpenAI assist content through `/api/tickets/:id/recommendations`.

- [x] **Step 2: Run focused tests to verify RED**

Run: `npm test -- --run test/approval-desk-recommendation.test.ts test/approval-desk-http.test.ts`
Expected: FAIL because no recommendation contains `gptAssist`.

- [x] **Step 3: Attach assist to recommendation input**

Set deterministic assist on the base recommendation and override it with provider assist in `buildApprovalDeskRecommendationInputWithDrafting`.

- [x] **Step 4: Run focused tests**

Run: `npm test -- --run test/approval-desk-recommendation.test.ts test/approval-desk-http.test.ts`
Expected: PASS.

### Task 4: Compact Approval Desk UI

**Files:**
- Modify: `src/approval-desk/ui.ts`
- Test: `test/approval-desk-ui.test.ts`

- [x] **Step 1: Write failing UI tests**

Assert the HTML contains "GPT Assist" and renders escaped tone, audience, missing-info suggestions, and investigation steps from `recommendation.gptAssist`.

- [x] **Step 2: Run UI tests to verify RED**

Run: `npm test -- --run test/approval-desk-ui.test.ts`
Expected: FAIL because the UI does not render assist content.

- [x] **Step 3: Render one compact assist card**

Add `renderAssistCard`, `formatAssistChecks`, and `formatBullets` helpers. Place the card after "Why this draft is safe"; keep details short and escaped.

- [x] **Step 4: Run UI tests**

Run: `npm test -- --run test/approval-desk-ui.test.ts`
Expected: PASS.

### Task 5: Final Verification

**Files:**
- Modify only if verification exposes a real issue.

- [x] **Step 1: Run full test suite**

Run: `npm test`
Expected: PASS, all test files and tests pass.

- [x] **Step 2: Run evaluator**

Run: `npm run evaluate`
Expected: PASS with 30 tickets, 100% tracked metrics, 0 approval-safety violations.

- [x] **Step 3: Run diff hygiene**

Run: `git diff --check`
Expected: no output.

- [x] **Step 4: Commit and push**

Run:

```bash
git add -- src/domain.ts src/triage-service.ts src/approval-desk/draft-response-provider.ts src/approval-desk/recommendation-builder.ts src/approval-desk/ui.ts test/domain.test.ts test/triage-service.test.ts test/openai-draft-provider.test.ts test/approval-desk-recommendation.test.ts test/approval-desk-http.test.ts test/approval-desk-ui.test.ts docs/superpowers/plans/2026-07-11-gpt-assist-panel.md
git commit -m "feat: add gpt assist panel"
git -c http.sslBackend=schannel push
```
