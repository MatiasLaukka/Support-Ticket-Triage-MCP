# GPT Drafting Contract Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GPT customer-response drafting contract-first, with one bounded repair attempt and deterministic fallback while preserving authoritative workflow and safety behavior.

**Architecture:** Build one shared obligation builder and validator around the existing `draftCustomerResponseWithFallback` boundary. The OpenAI provider will receive the deterministic baseline plus obligations, optionally repair a failed candidate once, and return only a locally validated response. The benchmark evaluator will use explicit semantic aliases for ordinary wording while keeping escalation, closure, safety, and evidence-state checks strict.

**Tech Stack:** TypeScript, Zod, Vitest, OpenAI Responses API JSON Schema, existing Approval Desk/MCP domain services.

## Global Constraints

- Deterministic domain outcomes, diagnosis state, fix gates, approval gates, and workflow invariants remain authoritative.
- No raw model output, API keys, ticket secrets, article IDs, or internal prompt-injection details may enter customer-facing responses or telemetry.
- GPT drafting is optional; unavailable, timed-out, invalid, or contract-failing GPT output must safely fall back to deterministic output.
- Exactly one bounded GPT repair attempt is allowed; deterministic candidates are never sent to GPT for repair.
- Approval Desk UI and MCP tools must use the same response-validation and fallback functions.
- Existing deterministic classifier and controlled benchmark tests must remain intact.

---

### Task 1: Add shared draft obligations and semantic validation

**Files:**
- Create: `src/approval-desk/draft-contract.ts`
- Modify: `src/approval-desk/draft-response-provider.ts:584-742`
- Test: `test/draft-contract.test.ts`

**Interfaces:**
- `DraftObligation` contains `id`, `kind`, `customerText`, `aliases`, and `hard` fields.
- `DraftContractInput` accepts `CustomerResponseDraftInput`, the candidate response, and the current assist text.
- `buildDraftObligations(input: CustomerResponseDraftInput): DraftObligation[]` derives obligations from `outcome`, `evidenceReadiness`, conversation turn, diagnosis context, fix context, and deterministic baseline.
- `validateDraftContract(input: DraftContractInput): DraftContractResult` returns `checks`, `blockingMessages`, and sanitized `failedObligationIds`.

- [ ] **Step 1: Write failing obligation tests**

Add tests covering:

```ts
expect(buildDraftObligations(partialEvidenceInput)).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: "concept:webhook-signature", hard: true }),
    expect.objectContaining({ id: "evidence:signing-secret-rotation-time" }),
  ]),
);

expect(validateDraftContract({
  input: activeKnownEventInput,
  response: "The event-ingestion delay is under review.",
  assistText: "",
})).toMatchObject({
  failedObligationIds: ["escalation:incident-review"],
});
```

Also test that `signature validation` satisfies the `webhook signature` alias, that a stale reply does not request provided evidence, and that `resolved it`/`working again` satisfy the customer-confirmation closure concept.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run test/draft-contract.test.ts`

Expected: FAIL because the shared obligation builder and validator do not yet exist.

- [ ] **Step 3: Implement the shared obligation builder**

Create `DraftObligation` values from authoritative state. Use evidence requirement IDs and aliases for missing evidence, `requiredEscalations` plus known-event state for escalation obligations, and customer-confirmed/ready-for-close state for closure obligations. Never derive obligations from raw GPT advice.

- [ ] **Step 4: Implement the local semantic validator**

Normalize case, punctuation, hyphens, and whitespace. Match only declared aliases. Mark safety, escalation, lifecycle, and repeated-evidence obligations as hard failures; return sanitized IDs and messages rather than candidate text.

- [ ] **Step 5: Integrate the validator with existing draft checks**

Call `validateDraftContract` from `validateCustomerResponseDraft` and merge its checks/blocking messages with `validateDraftQuality`. Preserve existing `AiGuardrailCheck` and `DraftCustomerResponseCheck` shapes.

- [ ] **Step 6: Run the focused tests and commit**

Run: `npm test -- --run test/draft-contract.test.ts test/openai-draft-provider.test.ts`

Expected: PASS.

```bash
git add src/approval-desk/draft-contract.ts src/approval-desk/draft-response-provider.ts test/draft-contract.test.ts
git commit -m "feat: add shared customer response contract"
```

### Task 2: Add obligation-aware GPT prompts and one repair attempt

**Files:**
- Modify: `src/approval-desk/customer-service-drafting-skill.ts`
- Modify: `src/approval-desk/draft-response-provider.ts:179-352,379-526,1031-1090`
- Modify: `src/domain.ts:157-271` if telemetry needs a schema field
- Test: `test/openai-draft-provider.test.ts`

**Interfaces:**
- Extend the draft request payload with `obligations: Array<{ id: string; requirement: string; aliases: string[]; hard: boolean }>`.
- Add `CustomerResponseRepairInput` with `draftInput`, `candidateResponse`, `failedObligationIds`, and `failedMessages`.
- Add `RepairableCustomerResponseDraftProvider.repair(input): Promise<CustomerResponseDraft>`.
- `OpenAiCustomerResponseDraftProvider.repair` uses the same JSON response schema and model, with a repair-specific instruction.

- [ ] **Step 1: Add failing provider tests**

Add mocked Responses API tests asserting:

```ts
expect(JSON.parse(request.body).input).toContain('"obligations"');
expect(JSON.parse(request.body).instructions).toContain("deterministicDraft");
```

Add a two-response test where the first draft omits `incident review`, the repair includes it, and `draftCustomerResponseWithFallback` returns the repaired OpenAI draft with `repair-attempted` telemetry/check information.

Add a repair-failure test asserting deterministic fallback and sanitized failed obligation IDs.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run test/openai-draft-provider.test.ts`

Expected: FAIL because the request has no obligation checklist and the provider has no repair capability.

- [ ] **Step 3: Add the obligation checklist to the prompt**

Update `buildDraftInput` and the drafting skill instructions so GPT is told that the deterministic draft is a completeness anchor. Include only customer-safe obligations and explicitly prohibit internal article IDs, prompt-injection details, unsupported resolution claims, and repeated evidence requests.

- [ ] **Step 4: Implement the repair request**

Add a private request builder that sends the baseline draft, the candidate draft, and sanitized missing obligation IDs. Keep the same strict JSON schema and `store: false`. Do not include raw validation output beyond safe obligation messages.

- [ ] **Step 5: Add repair orchestration to the shared fallback boundary**

After an OpenAI candidate fails validation, call `repair` once when the provider implements `RepairableCustomerResponseDraftProvider`. Validate the repaired candidate through the same shared validator. If it fails or repair throws, use the existing deterministic fallback path.

- [ ] **Step 6: Add bounded repair telemetry**

Record only `repairAttempted`, `repairSucceeded`, failed obligation IDs, and provider latency/usage. Extend Zod schemas with bounded arrays and enums if necessary; never serialize candidate response text into fallback metadata.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- --run test/openai-draft-provider.test.ts test/draft-contract.test.ts`

Expected: PASS.

```bash
git add src/approval-desk/customer-service-drafting-skill.ts src/approval-desk/draft-response-provider.ts src/domain.ts test/openai-draft-provider.test.ts
git commit -m "feat: add bounded GPT draft repair"
```

### Task 3: Align benchmark response contracts without weakening policy

**Files:**
- Modify: `src/approval-desk/response-quality-contracts.ts`
- Modify: `src/approval-desk/response-quality-evaluation.ts`
- Test: `test/response-quality-evaluation.test.ts`

**Interfaces:**
- Keep `ResponseQualityContract` public shape compatible.
- Add a private normalization/alias map for ordinary concepts.
- Preserve hard failure behavior for `requiredEscalation`, forbidden claims, deterministic checks, and unnecessary evidence questions.

- [ ] **Step 1: Add failing evaluator tests for valid paraphrases**

Add cases showing that `signature validation mismatch` satisfies the webhook-signature concept and `working again` satisfies the resolved customer-confirmation concept. Add a near-miss case where an active incident response says only `under review` and still fails the explicit escalation requirement.

- [ ] **Step 2: Run the focused evaluator tests and verify they fail**

Run: `npm test -- --run test/response-quality-evaluation.test.ts`

Expected: FAIL for the new valid-paraphrase cases.

- [ ] **Step 3: Add narrowly scoped aliases and concept metadata**

Update only the affected contracts. Keep escalation aliases explicit (`incident review`, `platform review`) and do not make generic `review` sufficient. Keep stale-reply evidence checks strict.

- [ ] **Step 4: Run the evaluator suite and commit**

Run: `npm test -- --run test/response-quality-evaluation.test.ts test/ai-comparison-evaluation.test.ts`

Expected: PASS.

```bash
git add src/approval-desk/response-quality-contracts.ts src/approval-desk/response-quality-evaluation.ts test/response-quality-evaluation.test.ts
git commit -m "test: align response contract aliases"
```

### Task 4: Verify end-to-end lane behavior and observability

**Files:**
- Modify: `src/approval-desk/ai-comparison-evaluation.ts` if additional repair/fallback counters are required
- Modify: `README.md` or `docs/ai-comparison-example.md` with the updated scorecard
- Test: `test/ai-comparison-evaluation.test.ts`

**Interfaces:**
- Preserve existing report JSON/Markdown fields.
- Add separate counters for candidate contract passes, repaired passes, deterministic fallbacks, and hard safety violations.

- [ ] **Step 1: Add report assertions**

Assert that controlled evaluation reports classification agreement separately from GPT draft quality and records repair/fallback provenance without model output.

- [ ] **Step 2: Run the controlled benchmark**

Run: `npm run evaluate:ai-comparison`

Expected: deterministic lane remains 11/11; all controlled GPT classification fields remain aligned; GPT candidates either pass, repair, or fall back safely.

- [ ] **Step 3: Run all automated verification**

Run:

```powershell
npm run typecheck
npm test
```

Expected: typecheck passes and the complete Vitest suite passes with no snapshot or report-contract regressions.

- [ ] **Step 4: Update documentation and commit**

Document the contract-first flow, one repair limit, fallback behavior, and separate classification/drafting scorecard. Do not claim live GPT quality until a new live run confirms it.

```bash
git add src/approval-desk/ai-comparison-evaluation.ts README.md docs/ai-comparison-example.md test/ai-comparison-evaluation.test.ts
git commit -m "docs: document GPT drafting contract results"
```

### Task 5: Run one live evaluation and inspect failures

**Files:**
- Generated/ignored: `reports/ai-comparison/live-latest.md`
- Generated/ignored: `reports/ai-comparison/live-latest.json`

- [ ] **Step 1: Run the live evaluation only with the user-provided environment**

Run from PowerShell:

```powershell
$env:OPENAI_MODEL = 'gpt-5.6-luna'
npm run evaluate:ai-comparison -- --live
```

Do not print or persist the API key.

- [ ] **Step 2: Analyze separate metrics**

Check classification agreement, candidate pass rate, repair success rate, deterministic fallback rate, hard policy failures, forbidden claims, unnecessary questions, and average latency.

- [ ] **Step 3: Stop before article changes**

Only propose knowledge-article or retrieval work if the new report shows correct response obligations cannot be satisfied because required evidence/article content is absent. Otherwise keep the next iteration focused on drafting contracts.

