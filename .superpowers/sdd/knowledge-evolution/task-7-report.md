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
