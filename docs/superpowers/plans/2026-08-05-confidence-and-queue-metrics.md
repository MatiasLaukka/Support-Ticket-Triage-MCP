# Uncertainty-Aware Confidence And Queue Metrics Implementation Plan

> REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Replace clamp-only classifier confidence with a shared uncertainty-aware score, expose safe provenance and transport-consistent queue metrics, and prove the values in the Approval Desk, MCP, CLI, and documentation.

**Architecture:** classifier.ts builds one score snapshot for routing and confidence. classifier-confidence.ts owns the versioned confidence schema, bands, reason codes, and formula. metrics.ts exports QueueMetricsSchema and calculates every queue field; HTTP, MCP, the evidence report, and demo:metrics consume that same object. Confidence provenance is trusted only on evaluation; generic submission cannot author it.

**Tech Stack:** TypeScript ESM, Zod, Vitest, local JSON repositories, Approval Desk HTTP UI, MCP SDK.

---

### Task 1: Shared confidence contract and score snapshot

**Files:** Create src/classifier-confidence.ts; modify src/domain.ts and src/approval-desk/classifier.ts; test test/classifier.test.ts.

- [ ] Step 1: Write failing tests for metadata-only routing, conflicting metadata filtering, close category competition, reason codes, and deduplicated independent rule counting.
- [ ] Step 2: Run npx vitest run --dir test test/classifier.test.ts -t "metadata-only|conflicting metadata|close category" and confirm the old clamp-only behavior fails.
- [ ] Step 3: Add Zod schemas for method uncertainty-aware-v1, bands, bounded reason codes, finite nonnegative scores, unique reasons, and band consistency. Add helpers confidenceBand and calculateClassificationConfidence with the approved support/margin/diversity/disagreement formula and four-decimal rounding.
- [ ] Step 4: Refactor chooseScoredValue in src/approval-desk/classifier.ts into a typed snapshot containing selected value, selected score, runner-up score, eligible signals, independent-evidence presence, and contributing Rule.id values. Correct the filter to !hasIndependentEvidence || !ruleId.startsWith("metadata-"). Make category, priority, and team selection use the snapshot. Make confidence use the category snapshot. Exclude metadata, disagreement, known-cause/event, duplicate emissions, and gpt-advisory signals from independent rule diversity. Accepted GPT advice may influence bounded score and routing, but cannot author confidence provenance.
- [ ] Step 5: Run npx vitest run --dir test test/classifier.test.ts; all classifier tests must pass.
- [ ] Step 6: Commit with git add src/classifier-confidence.ts src/domain.ts src/approval-desk/classifier.ts test/classifier.test.ts and git commit -m "feat: make classifier confidence uncertainty-aware".

### Task 2: Trusted confidence provenance

**Files:** modify src/triage-service.ts, src/domain.ts, src/approval-desk/recommendation-builder.ts, src/approval-desk/ai-evaluation.ts, src/server.ts; test triage-service, server-actions, and approval-desk-recommendation suites.

- [ ] Step 1: Write failing tests proving generic submitRecommendation rejects classificationConfidence, classifier-backed submitEvaluation persists it, and fixture/expected-outcome evaluation may omit it.
- [ ] Step 2: Run npx vitest run --dir test test/triage-service.test.ts test/server-actions.test.ts test/approval-desk-recommendation.test.ts -t "classificationConfidence|confidence provenance|trusted".
- [ ] Step 3: Keep the generic submission schemas without classificationConfidence. Extend only SubmitEvaluationInputSchema and its type. Persist the optional field through TriageRecommendationSchema. Update the builder and evaluateTicketWithAi to emit it only when the real classifier ran; never include it in drafts or provider payloads.
- [ ] Step 4: Run those three suites without a filter and commit with git add src/domain.ts src/triage-service.ts src/server.ts src/approval-desk/recommendation-builder.ts src/approval-desk/ai-evaluation.ts test/triage-service.test.ts test/server-actions.test.ts test/approval-desk-recommendation.test.ts and git commit -m "feat: persist trusted classifier confidence provenance".

### Task 3: Strict, transport-consistent queue metrics

**Files:** modify src/metrics.ts, src/runtime.ts, src/server.ts; test metrics, server-read, and runtime suites.

- [ ] Step 1: Write failing tests with approved, pending, rejected, canceled, and superseded recommendations at all confidence bands. Assert averageApprovedConfidence, confidenceBandCounts, approved realized savings, pending potential savings, and no savings contribution from canceled/superseded records.
- [ ] Step 2: Run npx vitest run --dir test test/metrics.test.ts test/server-read.test.ts test/runtime.test.ts and confirm new fields/default mismatch fail.
- [ ] Step 3: Move the strict queue metrics Zod schema from server.ts to metrics.ts as QueueMetricsSchema and derive QueueMetrics from it. Export one default minutes constant using runtime default 8; remove the MCP-only fallback 10. Add averageApprovedConfidence, confidenceBandCounts, and potentialMinutesSaved. Derive bands for every numeric confidence with shared thresholds. Validate calculator output with QueueMetricsSchema.
- [ ] Step 4: Make get_queue_metrics and metrics://queue use QueueMetricsSchema instead of a duplicate schema. Run the three suites and commit with git add src/metrics.ts src/runtime.ts src/server.ts test/metrics.test.ts test/server-read.test.ts test/runtime.test.ts and git commit -m "feat: unify queue metrics and savings semantics".

### Task 4: Automation Evidence and Approval Desk surfaces

**Files:** modify src/approval-desk/evidence-report.ts and src/approval-desk/ui.ts; test approval-desk-evidence-report, approval-desk-http, and approval-desk-ui.

- [ ] Step 1: Write failing assertions for average confidence, low-confidence count, realized savings estimate, and potential savings in the report summary and UI.
- [ ] Step 2: Run npx vitest run --dir test test/approval-desk-evidence-report.test.ts test/approval-desk-http.test.ts test/approval-desk-ui.test.ts -t "confidence|minutes|savings|evidence".
- [ ] Step 3: Project all values from QueueMetrics into AutomationEvidenceReport.summary, clone new nested objects, render one-decimal percentages, label estimatedMinutesSaved as a realized savings estimate, and keep uncertainty reasons out of customer-facing response panels.
- [ ] Step 4: Run all three suites and commit with git add src/approval-desk/evidence-report.ts src/approval-desk/ui.ts test/approval-desk-evidence-report.test.ts test/approval-desk-http.test.ts test/approval-desk-ui.test.ts and git commit -m "feat: expose uncertainty and savings metrics in the desk".

### Task 5: Deterministic metrics CLI

**Files:** create scripts/demo-metrics.ts and test/demo-metrics.test.ts; modify package.json.

- [ ] Step 1: Write a failing CLI contract test that runs the built script with seed tickets and sample recommendations at a fixed timestamp and parses the output through QueueMetricsSchema.
- [ ] Step 2: Run npx vitest run --dir test test/demo-metrics.test.ts and confirm the command is missing.
- [ ] Step 3: Load data/seed/tickets.json and data/seed/sample-recommendations.json, parse domain schemas, call calculateQueueMetrics with the fixed fixture time and shared default minutes, validate with QueueMetricsSchema, and print stable JSON. Add demo:metrics after build.
- [ ] Step 4: Run npm run build; npx vitest run --dir test test/demo-metrics.test.ts; npm run demo:metrics and commit with git add scripts/demo-metrics.ts package.json test/demo-metrics.test.ts and git commit -m "feat: add deterministic queue metrics showcase".

### Task 6: Portfolio documentation

**Files:** modify README.md, docs/demo-results.md, docs/demo-script.md, and docs/case-study.md.

- [ ] Step 1: Document confidence as uncertainty-aware decision support, not probability; document method uncertainty-aware-v1, bands, reason codes, metadata filtering, GPT advisory boundaries, and legacy fallback.
- [ ] Step 2: Document estimatedMinutesSaved as a realized approval-attributed estimate under the configured assumption, potentialMinutesSaved as pending projection, and neither as measured stopwatch time.
- [ ] Step 3: Document npm run demo:metrics and the transport consistency check against /api/metrics and metrics://queue.
- [ ] Step 4: Run affected showcase commands, then commit with git add README.md docs/demo-results.md docs/demo-script.md docs/case-study.md and git commit -m "docs: explain uncertainty and realized queue metrics".

### Task 7: Full verification

**Files:** no additional source files.

- [ ] Step 1: Run git diff --check, npm run build, npm run typecheck, npx vitest run --dir test, npm run evaluate:diagnostics, npm run evaluate:lifecycle-replay, npm run demo:knowledge-evolution -- --verbose, and npm run demo:metrics.
- [ ] Step 2: Confirm all commands exit zero, the suite is green, diagnostics remain 11/11, lifecycle replay remains resolved, knowledge reuse remains immutable, and CLI JSON validates the shared schema.
- [ ] Step 3: Run git status -sb, git diff --check, and git log --oneline -8; make only verification-driven documentation corrections, rerunning affected commands before reporting completion.

