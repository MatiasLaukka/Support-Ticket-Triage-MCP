# GPT Drafting Baseline Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve GPT-assisted customer-response completeness by giving the model the trusted deterministic draft as a preservation anchor while retaining the existing customer-service skill and safety gates.

**Architecture:** `OpenAiCustomerResponseDraftProvider` will continue to build its instructions through `buildCustomerServiceDraftingInstructions`, so the customer-service drafting skill remains authoritative. Its request payload will additionally include `deterministicDraft` as trusted context, and the skill instructions will tell GPT to preserve supported facts, status/escalation wording, and missing-evidence requests while editing for tone.

**Tech Stack:** TypeScript ESM, Zod, Vitest, OpenAI Responses API adapter, existing customer-service drafting skill.

## Global Constraints

- Do not copy response-quality benchmark contracts into production prompts.
- Do not add a second response-generation path.
- Do not change deterministic response wording, approval gates, prompt-injection handling, or classification behavior.
- Do not add retries or extra live API calls.
- GPT drafting must continue to access `buildCustomerServiceDraftingInstructions` and `CUSTOMER_SERVICE_DRAFTING_POLICY`.

---

### Task 1: Prove the provider sends and preserves the deterministic baseline

**Files:**
- Modify: `test/openai-draft-provider.test.ts`
- Modify: `src/approval-desk/customer-service-drafting-skill.ts`
- Modify: `src/approval-desk/draft-response-provider.ts`

**Interfaces:**
- Consumes: `CustomerResponseDraftInput.deterministicDraft`, existing `buildCustomerServiceDraftingInstructions` output, and the existing provider request body.
- Produces: a request body whose `input` includes the deterministic draft and whose `instructions` include baseline-preservation guidance while retaining the customer-service skill policy.

- [ ] **Step 1: Extend the existing provider request test with the desired assertions**

In the first `OpenAiCustomerResponseDraftProvider` test, keep the existing real fetch capture and add:

```ts
expect(requests[0]!.init.body).toContain("Fallback draft.");
expect(JSON.parse(requests[0]!.init.body).instructions).toContain(
  "preserve the supported facts and evidence requests from the deterministic draft",
);
expect(JSON.parse(requests[0]!.init.body).instructions).toContain(
  "Customer service drafting skill",
);
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing baseline contract**

Run:

```powershell
npx vitest run --dir test test/openai-draft-provider.test.ts -t "posts a structured Responses API request"
```

Expected: FAIL because the current request input does not contain `deterministicDraft` and the current instructions do not contain the preservation sentence.

- [ ] **Step 3: Add preservation guidance to the existing drafting skill instructions**

In `buildCustomerServiceDraftingInstructions`, add one rule near the existing evidence-readiness rules:

```ts
"Treat deterministicDraft as a trusted completeness anchor: preserve its supported problem summary, customer-safe status or escalation wording, and missing-evidence requests while improving clarity and tone. Do not add claims that trusted context does not support.",
```

Do not remove or bypass `CUSTOMER_SERVICE_DRAFTING_POLICY`; the new rule must be part of the string returned by the existing skill builder.

- [ ] **Step 4: Include the deterministic baseline in the provider input payload**

In `buildDraftInput`, add the existing input field without changing its value or exposing internal evaluation contracts:

```ts
deterministicDraft: input.deterministicDraft,
```

Keep the field inside the trusted structured request context alongside `expectedOutcome` and `evidenceReadiness`.

- [ ] **Step 5: Run the focused provider test and verify it passes**

Run:

```powershell
npx vitest run --dir test test/openai-draft-provider.test.ts -t "posts a structured Responses API request"
```

Expected: PASS, including the existing assertion that the request still contains `Customer service drafting skill` through the shared skill builder.

- [ ] **Step 6: Run the complete provider test file**

Run:

```powershell
npx vitest run --dir test test/openai-draft-provider.test.ts
```

Expected: all provider tests pass, including fallback, timeout, schema, sign-off, and guardrail behavior.

- [ ] **Step 7: Run typecheck, full tests, and the controlled comparison**

Run:

```powershell
npm run typecheck
npx vitest run --dir test
npm run evaluate:ai-comparison
```

Expected: typecheck succeeds, all tests pass, and every controlled lane remains 11/11. Do not run or commit a live report as part of this implementation task.

- [ ] **Step 8: Review the diff and commit the implementation**

Run:

```powershell
git diff --check
git add src/approval-desk/customer-service-drafting-skill.ts src/approval-desk/draft-response-provider.ts test/openai-draft-provider.test.ts reports/ai-comparison/controlled-latest.md reports/ai-comparison/controlled-latest.json
git commit -m "fix: anchor GPT drafts to deterministic responses"
```

Expected: only the focused skill, provider, test, and regenerated controlled report changes are committed.
