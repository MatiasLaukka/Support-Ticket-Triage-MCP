# Task 6 report — shared knowledge evolution service

## Delivered

- Added `KnowledgeEvolutionService` for deterministic discovery, optional validated GPT drafting, candidate retrieval, approval, rejection, and deferment.
- Discovery uses the existing deterministic discovery and candidate-draft contracts, loads tickets, diagnoses, approved objects, local articles, and existing candidate records, and persists only candidates that satisfy the domain schema.
- Approval preserves the candidate, validates the expected version, editor-supplied fields, diagnosis/ticket/evidence references, and creates approved version 1 with append-only audit metadata.
- Reject and defer are audit-only actions; they do not change the candidate or any ticket/recommendation state.
- Wired the service into `createRuntimeDependencies` at `knowledgeEvolution.service`.
- Extended the existing knowledge-audit schema with an optional safe `notes` field so approval/review rationale can be recorded without creating a parallel audit type.

## Files

- `src/knowledge-evolution/service.ts`
- `src/knowledge-evolution/knowledge-audit-repository.ts`
- `src/runtime.ts`
- `test/knowledge-evolution-service.test.ts`
- `test/runtime.test.ts`

## Test evidence

1. RED: `npm test -- --run test/knowledge-evolution-service.test.ts` initially failed at typecheck because `src/knowledge-evolution/service.ts` did not exist.
2. GREEN: `npm test -- --run test/knowledge-evolution-service.test.ts test/runtime.test.ts test/knowledge-evolution-repositories.test.ts`
   - Build: passed.
   - Typecheck: passed.
   - Vitest: 3 files, 16 tests passed.
3. `git diff --check`: passed.

## Commit

- `feat: govern knowledge candidate promotion`

## Concerns

- The optional audit `notes` field is a small shared-contract expansion required to retain the requested review notes. It is backward compatible with the Task 3 audit records.
- No MCP, HTTP, UI, or harness surface was added; Task 7 adapters must call `knowledgeEvolution.service`.

## Review fix round

- Approval now compensates if its mandatory audit append fails: the service removes the just-promoted approved object, leaves the candidate intact, and permits a later retry.
- Added repository support for that narrowly scoped rollback and a repository test proving the candidate remains after removal.
- Audit history now has a governance purpose: duplicate rejection and deferment actions for the same candidate are rejected instead of appending repeated terminal-review events.
- Approval reference validation now requires every supporting diagnosis's `ticketId` to be among the candidate's supporting ticket IDs.
- RED evidence: the three new service tests failed before implementation because an audit failure orphaned approval, duplicate rejection succeeded, and mismatched diagnosis/ticket support passed validation.
- GREEN evidence: `npm test -- --run test/knowledge-evolution-service.test.ts test/knowledge-evolution-repositories.test.ts test/runtime.test.ts` passed build, typecheck, and 20 tests across 3 files.
