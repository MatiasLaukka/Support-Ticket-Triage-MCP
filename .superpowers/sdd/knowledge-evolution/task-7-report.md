# Task 7 report — governed knowledge review surfaces

## Delivered

- Added four strict MCP tools: `discover_knowledge_candidates`, `get_knowledge_candidate`, `approve_knowledge_candidate`, and `reject_knowledge_candidate`.
- Added Approval Desk HTTP discovery, detail, approval, rejection, and deferment endpoints. Each delegates lifecycle and promotion decisions to `knowledgeEvolution.service`; adapters only validate request shape and serialize safe response data.
- Added one shared strict review-surface serializer that excludes raw model payloads and internal reasoning while retaining candidate fields, evidence policy, deterministic scores/reasons, advisory GPT provenance, support, contradictions, validation state, and customer-safe explanation.
- Added a non-blocking Approval Desk knowledge-pattern indicator and review panel. Review actions carry the operator actor and expected candidate version, and the UI states that approval affects future evaluations rather than historical recommendations or customer replies.
- Corrected an approval persistence defect exposed by the real HTTP/MCP parity path: promoted objects now omit candidate-only fields before strict approved-object persistence.

## Files

- `src/knowledge-evolution/review-surface.ts`
- `src/knowledge-evolution/service.ts`
- `src/server.ts`
- `src/approval-desk/http.ts`
- `src/approval-desk/ui.ts`
- `test/server-read.test.ts`
- `test/server-actions.test.ts`
- `test/approval-desk-http.test.ts`
- `test/approval-desk-ui.test.ts`

## Test evidence

1. RED: `npm test -- --run test/approval-desk-http.test.ts` first failed because the knowledge-candidate HTTP route returned `404`.
2. RED: after adapters were added, the real parity path exposed the pre-existing strict-persistence promotion failure: `Knowledge candidate has already been promoted.` The test used no mock for the service/repository path.
3. GREEN: focused HTTP parity, promotion, rejection, malformed-action, and stale-version coverage passed: 56 tests.
4. GREEN: focused UI rendering and non-blocking refresh coverage passed: 65 tests.
5. GREEN: exact required verification command passed build, typecheck, and 172 tests across 4 files:

   ```powershell
   npm test -- --run test/server-read.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/approval-desk-ui.test.ts
   ```

## Commit

- Pending: `feat: expose governed knowledge review surfaces`

## Concerns

- The existing generated `reports/ai-comparison/controlled-latest.json` and `.md` remain modified but were preserved and excluded from this task's commit.
- The Task 6 discovery result records deterministic candidates directly. A validated GPT candidate remains discoverable through the detail surface once its ID is known; no raw provider payload or internal reasoning is exposed.

## Review fix round

- Discovery now returns the sanitized GPT advisory outcome and persisted GPT candidate alongside deterministic candidates through both MCP and HTTP. The review payload includes the advisory status, candidate ID, model-safe rationale, and advisory confidence.
- Candidate persistence now retains a sanitized discovery summary: deterministic score/reasons, exact diagnosis-to-ticket support records and scores, contradictions, and alert-threshold status. Detail reads therefore preserve the original evidence bundle and threshold rather than fabricating per-diagnosis ticket links or defaulting the threshold to false.
- The Approval Desk labels GPT confidence as advisory and protects non-blocking discovery refreshes with a selected-ticket/request identity check, preventing a slower prior-ticket response from replacing the current panel.
- Adapter parity now exercises discovery, rejection, approval, and GPT candidate output through both MCP and HTTP against the same real service/repository fixture. The test also verifies the HTTP malformed and stale request responses.
- During the red/green cycle, the added persisted discovery summary revealed one strict-persistence regression: approved objects must not contain candidate-only discovery metadata. Approval now excludes that metadata before writing the approved object.

### Review-fix test evidence

1. RED: the expanded GPT parity test failed because discovery returned only `known-cause-diagnosis-a`, omitting the persisted `known-cause-gpt-diagnosis-a` and advisory result.
2. RED: after metadata persistence, the real approval path rejected the deterministic candidate because candidate-only `discovery` data was written into the strict approved-object schema.
3. GREEN: `npm test -- --run test/approval-desk-http.test.ts test/approval-desk-ui.test.ts` passed build, typecheck, and 121 tests.
4. GREEN: the required adapter suite passed build, typecheck, and 172 tests across four files.

### Review-fix commit

- Pending follow-up commit.

## Review fix round 3

- A real ticket switch now synchronously clears the knowledge candidate, resets the prior review workflow, and renders a loading panel before the new ticket-detail request begins. Candidate actions from the old ticket are therefore unavailable throughout the transition.
- Added a delayed-ticket-detail test proving the old pattern panel and its approval/rejection/deferment controls disappear immediately, before ticket B returns.
- Replaced cross-candidate action comparisons with independent MCP and HTTP fixtures. Each fixture discovers the same deterministic candidate and executes the same approve edit, rejection reason, malformed input, or stale version. The test normalizes transport-specific validation formatting and compares the resulting domain outcome.

### Review-fix-round-3 test evidence

1. RED: with ticket B's detail response delayed, ticket A's `Prior ticket pattern` and review controls remained visible during the wait.
2. GREEN: `npm test -- --run test/approval-desk-http.test.ts test/approval-desk-ui.test.ts` passed build, typecheck, and 124 tests.
3. GREEN: the required adapter suite passed build, typecheck, and 175 tests across four files.

### Review-fix-round-3 commit

- Pending follow-up commit.

## Review fix round 2

- Ticket selection now synchronously clears the active knowledge candidate and advances its request identity before loading the next ticket. A pending or late discovery response from the previous ticket cannot render or enable review actions for the new ticket.
- Added an asynchronous two-ticket UI test that verifies the prior candidate is unavailable during the transition and remains unavailable when the older discovery completes later.
- Expanded real SDK MCP coverage for malformed and stale knowledge approval/rejection inputs, with the equivalent HTTP requests checked against the same candidate, actor, version, and reason. The parity fixture continues to exercise MCP and HTTP success outcomes for approval and rejection.

### Review-fix-round-2 test evidence

1. RED: the two-ticket UI test showed `Prior ticket pattern` still rendered after switching to ticket B while B discovery was pending.
2. GREEN: `npm test -- --run test/approval-desk-http.test.ts test/approval-desk-ui.test.ts` passed build, typecheck, and 122 tests.
3. GREEN: the required adapter suite passed build, typecheck, and 173 tests across four files.

### Review-fix-round-2 commit

- Pending follow-up commit.
