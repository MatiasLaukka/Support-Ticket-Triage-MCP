# AI Comparison Evaluation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing diagnostic evaluation with visible, comparable deterministic and GPT-assisted classification and customer-response lanes without changing deterministic authority.

**Architecture:** Keep `runDiagnosticEvaluation` and `classifyTicket` as the unchanged deterministic baseline. Extract its scenario catalog for reuse, then add a comparison orchestrator that calls `evaluateTicketWithAi` with injected classification and drafting providers. A deterministic contract evaluator scores drafts; a CLI prints per-scenario drafts, classification deltas, provider provenance, and aggregate metrics. Live OpenAI providers are selected only by an explicit `--live` flag.

**Tech Stack:** TypeScript, Node.js 20+, Zod domain schemas, Vitest, existing `ClassificationReasoningProvider`, `CustomerResponseDraftProvider`, `evaluateTicketWithAi`, and deterministic draft validators.

## Global Constraints

- Do not rewrite `classifyTicket` or change the existing deterministic diagnostic harness assertions.
- Deterministic policy remains authoritative for routing, escalation, evidence, diagnostic state, approval, and lifecycle transitions.
- Prompt-injection preflight must skip both GPT stages and preserve the deterministic result.
- Controlled-local and deterministic lanes must make no network request and remain CI-safe.
- Live OpenAI evaluation is opt-in and must never run from `npm test` or the default evaluator.
- Do not persist API keys, raw provider payloads, or secrets in reports.
- Add only tests that prove new comparison/reporting invariants; retain existing lifecycle coverage.

---

### Task 1: Extract the existing diagnostic scenario catalog

**Files:**
- Create: `src/approval-desk/diagnostic-evaluation-scenarios.ts`
- Modify: `test/diagnostic-evaluation.test.ts`
- Test: `test/diagnostic-evaluation.test.ts`

**Interfaces:**
- Produces `loadDiagnosticEvaluationScenarios(): Promise<DiagnosticEvaluationScenario[]>`.
- Preserves the existing `runDiagnosticEvaluation(scenarios)` API and all current scenario IDs and expected outcomes.

- [ ] **Step 1: Write the extraction regression test**

Move the current `buildScenarios` assertions into a test that imports the new loader:

```ts
const scenarios = await loadDiagnosticEvaluationScenarios();
expect(scenarios).toHaveLength(11);
expect(scenarios.map(({ id }) => id)).toContain("prompt-injection");
expect(runDiagnosticEvaluation(scenarios).passedScenarioCount).toBe(11);
```

- [ ] **Step 2: Run the focused test before implementation**

Run: `npm test -- --run test/diagnostic-evaluation.test.ts`

Expected: FAIL because the scenario loader does not yet exist.

- [ ] **Step 3: Move the catalog without changing scenario data**

Move the current ticket loading, scenario construction, `escalationAudits`, `diagnosisAudit`, and `customerReplyAudit` helpers into `diagnostic-evaluation-scenarios.ts`. Export the loader and keep the existing `DiagnosticEvaluationScenario` types.

- [ ] **Step 4: Re-run the deterministic harness**

Run: `npm test -- --run test/diagnostic-evaluation.test.ts`

Expected: the existing deterministic harness passes with the same 11 scenarios and unchanged metrics.

- [ ] **Step 5: Commit the catalog extraction**

```powershell
git add -- src/approval-desk/diagnostic-evaluation-scenarios.ts test/diagnostic-evaluation.test.ts
git commit -m "refactor: share diagnostic evaluation scenarios"
```

### Task 2: Add response-quality contracts and deterministic scoring

**Files:**
- Create: `src/approval-desk/response-quality-evaluation.ts`
- Create: `src/approval-desk/response-quality-contracts.ts`
- Create: `test/response-quality-evaluation.test.ts`

**Interfaces:**
- `ResponseQualityContract` contains `scenarioId`, `requiredConcepts`, `forbiddenConcepts`, `requiredEvidence`, `requiredEscalation`, `forbiddenClaims`, `tone`, and `maxWords`.
- `evaluateResponseQuality(input: { draft: string; contract: ResponseQualityContract; deterministicChecks: readonly DraftCustomerResponseCheck[] }): ResponseQualityScore` returns hard safety, concept recall, evidence precision, forbidden-claim count, unnecessary-question count, tone, length, and failures.

- [ ] **Step 1: Write failing contract-score tests**

Cover a safe escalation draft and an ambiguous diagnosis that incorrectly claims a fix:

```ts
const score = evaluateResponseQuality({
  draft: "We are investigating the EU event delay and have escalated it to our incident response team. Please share event timestamps and request IDs.",
  contract: incidentContract,
  deterministicChecks: [],
});
expect(score.hardPass).toBe(true);
expect(score.requiredConceptRecall).toBe(1);
```

```ts
const score = evaluateResponseQuality({
  draft: "The campaign editor issue is fixed. Nothing else is needed.",
  contract: ambiguousCampaignContract,
  deterministicChecks: [],
});
expect(score.hardPass).toBe(false);
expect(score.failures).toContain("forbidden claim: fixed");
```

- [ ] **Step 2: Run the new tests to confirm they fail**

Run: `npm test -- --run test/response-quality-evaluation.test.ts`

Expected: FAIL because the contract and scorer do not exist.

- [ ] **Step 3: Implement normalized concept matching**

Normalize draft text to lowercase, evaluate each required and forbidden concept as a case-insensitive substring group, count relevant evidence requests, and reject any existing deterministic check whose status is not `pass`. Do not use exact full-response equality.

- [ ] **Step 4: Add contracts and static exemplars for all 11 scenarios**

Every contract must specify the customer-safe state, relevant evidence, forbidden claims, escalation wording, expected tone, and maximum length. Keep exemplar prose in a separate `responseExemplars` map for reports and human review; never use it as the sole pass/fail oracle.

- [ ] **Step 5: Run the scorer tests**

Run: `npm test -- --run test/response-quality-evaluation.test.ts`

Expected: all contract-scoring tests pass.

- [ ] **Step 6: Commit the scoring layer**

```powershell
git add -- src/approval-desk/response-quality-evaluation.ts src/approval-desk/response-quality-contracts.ts test/response-quality-evaluation.test.ts
git commit -m "feat: score customer-response quality contracts"
```

### Task 3: Add the four-lane comparison engine

**Files:**
- Create: `src/approval-desk/ai-comparison-evaluation.ts`
- Create: `test/ai-comparison-evaluation.test.ts`
- Modify: `src/approval-desk/diagnostic-evaluation.ts` only if shared observation helpers must be exported; do not change its metric calculations.

**Interfaces:**
- `AiComparisonLane = "deterministic-deterministic" | "gpt-deterministic" | "deterministic-gpt" | "gpt-gpt"`.
- `runAiComparisonEvaluation(input: { scenarios: readonly DiagnosticEvaluationScenario[]; lane: AiComparisonLane; allKnowledgeArticles: readonly KnowledgeArticle[]; classificationProvider?: ClassificationReasoningProvider; draftProvider?: CustomerResponseDraftProvider }): Promise<AiComparisonReport>`.
- Each observation contains the final recommendation, `draftCustomerResponse`, `draftCustomerResponseSource`, `aiExecutionTrace`, classification agreement, baseline agreement, response quality, and failures.

- [ ] **Step 1: Write lane and safety tests**

Use injected fake providers, not network calls:

```ts
it("keeps the deterministic lane provider-free", async () => {
  const report = await runAiComparisonEvaluation({
    scenarios,
    lane: "deterministic-deterministic",
    allKnowledgeArticles,
  });
  expect(report.observations.every(({ aiExecutionTrace }) =>
    aiExecutionTrace.classification.status === "skipped" &&
    aiExecutionTrace.drafting.status === "skipped"
  )).toBe(true);
});
```

```ts
it("skips both GPT stages for prompt injection", async () => {
  const report = await runAiComparisonEvaluation({
    scenarios: scenarios.filter(({ id }) => id === "prompt-injection"),
    lane: "gpt-gpt",
    allKnowledgeArticles,
    classificationProvider: throwingProvider,
    draftProvider: throwingDraftProvider,
  });
  const observation = report.observations[0]!;
  expect(observation.aiExecutionTrace.classification.status).toBe("skipped");
  expect(observation.aiExecutionTrace.drafting.status).toBe("skipped");
  expect(observation.finalRecommendation.category).toBe("integration");
});
```

- [ ] **Step 2: Run the comparison tests to confirm they fail**

Run: `npm test -- --run test/ai-comparison-evaluation.test.ts`

Expected: FAIL because the lane runner does not exist.

- [ ] **Step 3: Map lanes to the production AI path**

Call `evaluateTicketWithAi` once per scenario. Use `aiPreference: "deterministic"` with no providers for the deterministic lane. Use `aiPreference: "gpt-preferred"` with injected providers for GPT lanes. Do not pass `scenario.outcome` when GPT classification must run, because expected outcomes are comparison oracles rather than inputs that suppress the provider stage.

- [ ] **Step 4: Capture classification deltas and response scores**

Extract classification and drafting traces, final recommendation fields, and `draftCustomerResponse`. Compare category, team, priority, knowledge, and escalation with the expected scenario contract and with the deterministic baseline. Invoke `evaluateResponseQuality` with the lane draft and response contract.

- [ ] **Step 5: Run the comparison tests**

Run: `npm test -- --run test/ai-comparison-evaluation.test.ts`

Expected: all four lane tests pass, GPT advisory output remains bounded, and prompt-injection providers are not invoked.

- [ ] **Step 6: Commit the comparison engine**

```powershell
git add -- src/approval-desk/ai-comparison-evaluation.ts test/ai-comparison-evaluation.test.ts
git commit -m "feat: compare deterministic and GPT triage lanes"
```

### Task 4: Add controlled providers and the report command

**Files:**
- Create: `src/approval-desk/controlled-evaluation-providers.ts`
- Create: `scripts/evaluate-ai-comparison.ts`
- Modify: `package.json`
- Test: `test/ai-comparison-evaluation.test.ts`

**Interfaces:**
- `createControlledClassificationProvider(): ClassificationReasoningProvider` returns structured advisory reasoning with model `controlled-local-simulation`.
- `createControlledDraftProvider(): CustomerResponseDraftProvider` returns safe local drafts with controlled simulation provenance.
- `npm run evaluate:ai-comparison` runs all four lanes with controlled providers and prints Markdown plus JSON.
- `npm run evaluate:ai-comparison -- --live` selects existing environment-backed OpenAI providers for GPT lanes and fails clearly when `OPENAI_API_KEY` is absent.

- [ ] **Step 1: Write report-command tests**

Test serialization with a small report and assert it includes lane, scenario ID, actual draft, classification agreement, hard safety result, and provider provenance. Assert live mode does not silently claim a live result without a key.

- [ ] **Step 2: Run the report tests to confirm they fail**

Run: `npm test -- --run test/ai-comparison-evaluation.test.ts`

Expected: FAIL because the controlled providers and report command are not present.

- [ ] **Step 3: Implement controlled providers as provider-contract adapters**

Use the existing provider interfaces. Controlled classification agrees with deterministic output for ordinary scenarios and returns advisory signals for ambiguous campaign-editor context. Controlled drafting returns safe local output and labels its provenance without making a network call.

- [ ] **Step 4: Implement CLI selection and serialization**

Load scenarios and local knowledge, run the four lanes sequentially, and print a compact summary followed by per-scenario drafts. With `--live`, construct providers through the existing environment factories. Never print request headers, API keys, or raw provider payloads.

- [ ] **Step 5: Add the package script and run controlled comparisons**

Add:

```json
"evaluate:ai-comparison": "npm run build && node dist/scripts/evaluate-ai-comparison.js"
```

Run: `npm run evaluate:ai-comparison`

Expected: four lane summaries, 11 scenarios per lane, actual drafts visible, prompt-injection GPT stages marked skipped, and no network request.

- [ ] **Step 6: Commit the controlled report command**

```powershell
git add -- src/approval-desk/controlled-evaluation-providers.ts scripts/evaluate-ai-comparison.ts package.json
git commit -m "feat: add AI comparison evaluation command"
```

### Task 5: Add live-mode boundaries and documentation

**Files:**
- Modify: `scripts/evaluate-ai-comparison.ts`
- Modify: `docs/diagnostic-evaluation-harness.md`
- Modify: `README.md`
- Create: `docs/ai-comparison-example.md`
- Test: `test/ai-comparison-evaluation.test.ts`

**Interfaces:**
- Default command remains network-free and reproducible.
- `--live` runs only GPT-containing lanes, labels them `live-openai-adapter`, and records model/latency/usage metadata without secrets.

- [ ] **Step 1: Add live-mode boundary tests**

Assert no provider factory is called without `--live`, `--live` requires `OPENAI_API_KEY`, and deterministic lanes remain available when live providers are unavailable.

- [ ] **Step 2: Implement live-mode reporting**

Use the existing environment factories and preserve returned `AiExecutionTrace`. Keep provider errors as safe fallback results; do not convert provider failure into a passing GPT-quality score.

- [ ] **Step 3: Document the workflow**

Document the command, four lanes, report fields, controlled-local provenance, live opt-in behavior, prompt-injection skip behavior, and the fact that static exemplars are reference anchors rather than exact expected strings.

- [ ] **Step 4: Add a sanitized example report**

Commit a controlled-local example containing representative drafts and comparison metrics. Do not include API keys, raw OpenAI payloads, or claims that a live model produced the example.

- [ ] **Step 5: Run the complete validation set**

Run:

```powershell
npm test
npm run evaluate
npm run evaluate:diagnostics
npm run evaluate:ai-comparison
git diff --check
```

Expected: all tests pass, existing deterministic metrics remain unchanged, all four controlled lanes report 11 scenarios, prompt-injection provider skips remain zero-call, and no diff-check errors occur.

- [ ] **Step 6: Commit documentation and final validation**

```powershell
git add -- scripts/evaluate-ai-comparison.ts docs/diagnostic-evaluation-harness.md README.md docs/ai-comparison-example.md test/ai-comparison-evaluation.test.ts
git commit -m "docs: document AI comparison evaluation"
```

## Review Checklist

- Existing deterministic classifier and diagnostic tests are unchanged except for scenario-catalog imports.
- Every GPT lane reports provider provenance and actual response text.
- Prompt injection skips both GPT stages and never leaks the internal warning to the customer draft.
- GPT advisory disagreement is visible and cannot override deterministic safety policy.
- Controlled runs are network-free; live runs are explicit and attributable.
- Reports distinguish hard safety failures from softer quality scores.

