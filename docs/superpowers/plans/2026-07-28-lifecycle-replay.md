# Lifecycle Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/lifecycle-replay` page that lets a human inspect actual GPT customer drafts in their ticket and conversation context without calling providers or mutating workflow state.

**Architecture:** Add a focused replay view-model module that parses the sanitized live and controlled reports, joins them with synthetic diagnostic scenarios, and groups snapshot records by ticket. Add read-only HTTP routes for the page and JSON view model, then render the view in a separate browser bundle with lane selection, snapshot navigation, timeline context, draft comparison, and an explicit approval pause. The replay path never uses the runtime ticket repository, recommendation writer, audit writer, or AI providers.

**Tech Stack:** TypeScript, Node `http`, Zod, existing inline HTML UI pattern, Vitest, synthetic JSON fixtures, sanitized AI comparison reports.

## Global Constraints

- Keep the page read-only: no ticket, recommendation, audit, approval, closure, or outbound-message mutations.
- Do not make OpenAI or any other provider call while loading or navigating the replay page.
- Label independent evaluation records as snapshots; do not infer chronological journeys.
- Display only sanitized report fields and synthetic fixture context; never expose raw provider payloads or API keys.
- Preserve the existing Approval Desk workflow and route behavior.
- Keep customer-visible draft text visually separate from operator-only provenance and evidence.
- Use test-first changes and run the full suite before claiming completion.

---

### Task 1: Define and test the replay view model

**Files:**
- Create: `src/approval-desk/lifecycle-replay.ts`
- Test: `test/lifecycle-replay.test.ts`

**Interfaces:**
- Consumes: sanitized `live-latest.json` and `controlled-latest.json` report objects plus `DiagnosticEvaluationScenario[]` from `loadDiagnosticEvaluationScenarios()`.
- Produces: `buildLifecycleReplayViewModel(input): LifecycleReplayViewModel` and schemas/types for route serialization.

- [ ] **Step 1: Write failing tests for grouping and context joining**

Add fixture report objects with one live GPT lane, one deterministic baseline lane, two scenarios sharing `TKT-1008`, and one scenario with a customer reply and previous support response. Assert:

```ts
const view = buildLifecycleReplayViewModel({ liveReport, controlledReport, scenarios });

expect(view.tickets.find((ticket) => ticket.ticketId === "TKT-1008")?.snapshots)
  .toHaveLength(2);
expect(view.tickets[0]?.snapshots[0]?.customerReplies).toEqual([
  expect.objectContaining({ body: expect.any(String) }),
]);
expect(view.tickets[0]?.snapshots[0]?.lanes).toEqual(
  expect.arrayContaining([expect.objectContaining({ lane: "gpt-gpt" })]),
);
```

Add tests that missing live reports produce `available: false` with a stable
reason and that missing optional replies/provenance produce empty or
`unavailable` values rather than invented content.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run: `npm test -- --run test/lifecycle-replay.test.ts`

Expected: FAIL because the replay view-model module and builder do not exist.

- [ ] **Step 3: Implement the minimal typed view model**

Define the following stable shapes:

```ts
export interface LifecycleReplayViewModel {
  available: boolean;
  unavailableReason?: "live-report-missing" | "invalid-report";
  generatedFrom: { liveReport: string; controlledReport?: string };
  tickets: LifecycleReplayTicket[];
}

export interface LifecycleReplayTicket {
  ticketId: string;
  customerName: string;
  subject: string;
  snapshots: LifecycleReplaySnapshot[];
}

export interface LifecycleReplaySnapshot {
  snapshotId: string;
  scenarioId: string;
  label: string;
  family: string;
  operatorStage?: string;
  customerReplies: Array<{ id: string; createdAt: string; body: string }>;
  previousSupportResponse?: { sentAt: string; body: string };
  ticket: { id: string; customer: string; subject: string; description: string; status: string; tags: string[] };
  lanes: LifecycleReplayLane[];
}

export interface LifecycleReplayLane {
  lane: string;
  result: "pass" | "fail" | "unavailable";
  actualDraft?: string;
  deterministicBaselineDraft?: string;
  draftingContract?: string;
  classificationAgreement?: unknown;
  classificationDelta?: unknown;
  providerProvenance?: unknown;
  qualityBreakdown?: unknown;
  failureReasons: string[];
}
```

Parse only the required report fields with Zod. Join by `scenarioId`, use
`ticket.id + scenarioId` as the stable snapshot key, and use the
`deterministic-deterministic` controlled lane as the optional deterministic
baseline for GPT lanes. If that baseline is absent, leave the comparison
unavailable and label it as such.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- --run test/lifecycle-replay.test.ts`

Expected: PASS, including grouping, context joining, missing-report handling,
and no invented conversation records.

- [ ] **Step 5: Commit the view-model unit**

```powershell
git add src/approval-desk/lifecycle-replay.ts test/lifecycle-replay.test.ts
git commit -m "feat: build lifecycle replay view model"
```

### Task 2: Add read-only replay HTTP routes

**Files:**
- Modify: `src/approval-desk/http.ts`
- Modify: `src/approval-desk.ts` only if the server options need an explicit report-root path.
- Test: `test/lifecycle-replay-http.test.ts`

**Interfaces:**
- Consumes: `buildLifecycleReplayViewModel` from Task 1 and the existing server `cwd`/environment.
- Produces: `GET /lifecycle-replay` HTML and `GET /api/lifecycle-replay` JSON; both are read-only.

- [ ] **Step 1: Write failing route tests**

Create a test server with a temporary report directory containing sanitized
fixtures. Assert:

```ts
const page = await get("/lifecycle-replay");
expect(page.status).toBe(200);
expect(page.headers.get("content-type")).toContain("text/html");
expect(await page.text()).toContain("Lifecycle Replay");

const data = await get("/api/lifecycle-replay");
expect(data.status).toBe(200);
expect((await data.json()).available).toBe(true);
```

Also assert `POST /api/lifecycle-replay` returns 404, the replay endpoint does
not call an injected draft/classification provider, and the runtime ticket,
recommendation, and audit repositories are unchanged.

- [ ] **Step 2: Run route tests and verify they fail**

Run: `npm test -- --run test/lifecycle-replay-http.test.ts`

Expected: FAIL with 404 or missing route/page behavior.

- [ ] **Step 3: Implement the two read-only routes**

Handle `/lifecycle-replay` beside the existing `/` HTML route and add
`GET /api/lifecycle-replay` to `matchRoute`. Read report files from a configured
path under the project root, return an unavailable view model when the live
report is absent, and never pass provider dependencies into the view-model
builder. Keep JSON errors in the existing route format.

- [ ] **Step 4: Run route tests and verify they pass**

Run: `npm test -- --run test/lifecycle-replay-http.test.ts`

Expected: PASS, including the no-mutation and no-provider-call assertions.

- [ ] **Step 5: Commit the routes**

```powershell
git add src/approval-desk/http.ts src/approval-desk.ts test/lifecycle-replay-http.test.ts
git commit -m "feat: expose read-only lifecycle replay routes"
```

### Task 3: Build the separate Lifecycle Replay page

**Files:**
- Create: `src/approval-desk/lifecycle-replay-ui.ts`
- Test: `test/lifecycle-replay-ui.test.ts`

**Interfaces:**
- Consumes: JSON from `GET /api/lifecycle-replay`.
- Produces: browser UI with ticket grouping, snapshot selection, lane selection, timeline, customer/operator views, and draft comparison.

- [ ] **Step 1: Write failing UI contract tests**

Assert the HTML bundle contains stable IDs and labels for:

```ts
expect(lifecycleReplayHtml).toContain("Lifecycle Replay");
expect(lifecycleReplayHtml).toContain("Customer view");
expect(lifecycleReplayHtml).toContain("Operator view");
expect(lifecycleReplayHtml).toContain("Human approval required; replay is read-only");
expect(lifecycleReplayHtml).toContain("deterministic-deterministic");
```

Use a small DOM-like rendering helper or string-level checks consistent with
the existing inline UI tests; do not add a browser dependency.

- [ ] **Step 2: Run UI tests and verify they fail**

Run: `npm test -- --run test/lifecycle-replay-ui.test.ts`

Expected: FAIL because the page bundle does not exist.

- [ ] **Step 3: Implement the minimal read-only UI**

Render the left ticket/snapshot rail, center timeline, and right provenance
inspector. Fetch JSON once on load, keep the selected lane and snapshot in
client state, reset the timeline cursor when the snapshot changes, and render
unavailable states explicitly. Escape all report and fixture strings before
inserting them into HTML. The customer view must hide operator-only fields;
the operator view must show them with provenance labels. There must be no POST,
PUT, PATCH, or DELETE request in this bundle.

- [ ] **Step 4: Run UI tests and verify they pass**

Run: `npm test -- --run test/lifecycle-replay-ui.test.ts`

Expected: PASS with the required labels and no mutation request paths.

- [ ] **Step 5: Commit the page**

```powershell
git add src/approval-desk/lifecycle-replay-ui.ts test/lifecycle-replay-ui.test.ts
git commit -m "feat: add lifecycle replay page"
```

### Task 4: Document and verify the portfolio walkthrough

**Files:**
- Modify: `README.md`
- Modify: `docs/demo-results.md` if the walkthrough examples belong there.
- Test: `test/approval-desk-entrypoint.test.ts` or the route tests from Task 2 for the printed path.

**Interfaces:**
- Consumes: the completed replay route and existing live evaluation command.
- Produces: concise instructions for running the local Approval Desk and opening `/lifecycle-replay`.

- [ ] **Step 1: Add documentation assertions or a route smoke test**

Assert the documented route and command remain aligned with the server entry
point. Keep this test focused on the route contract rather than duplicating UI
markup assertions.

- [ ] **Step 2: Update the README walkthrough**

Add a short section explaining:

```text
npm run demo:approval-desk
# open http://127.0.0.1:5177/lifecycle-replay
```

Explain that the page replays the latest sanitized live report, labels
independent snapshots honestly, and stops at human approval without mutation.

- [ ] **Step 3: Run the complete verification set**

Run:

```powershell
npm test
npm run evaluate:ai-comparison
```

Expected: all tests pass and the controlled benchmark remains 11/11 in all
four lanes.

- [ ] **Step 4: Inspect the page manually**

Run `npm run demo:approval-desk`, open `/lifecycle-replay`, select `TKT-1008`
and `TKT-1010`, inspect a GPT→GPT draft, switch to customer view, switch back
to operator view, and confirm that no runtime ticket or audit count changes.

- [ ] **Step 5: Commit the documentation and final verification**

```powershell
git add README.md docs/demo-results.md test/approval-desk-entrypoint.test.ts
git commit -m "docs: add lifecycle replay walkthrough"
```

## Final review checklist

- [ ] Replay page is separate from the mutable Approval Desk workspace.
- [ ] Live report and synthetic context join by scenario ID without inferred order.
- [ ] Ticket grouping handles multiple snapshots for one ticket.
- [ ] GPT and deterministic draft comparison is labeled and unavailable when baseline data is missing.
- [ ] Customer/operator views do not leak or mix their respective fields.
- [ ] No provider call or runtime mutation is possible from the replay page.
- [ ] Full tests and controlled benchmark pass.
