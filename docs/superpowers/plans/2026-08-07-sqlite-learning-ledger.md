# SQLite Learning Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add a durable, queryable SQLite learning ledger for verified diagnoses, outcomes, knowledge candidates, immutable versions, reuse, and evaluation evidence without changing the operational workflow authority.

**Architecture:** Keep tickets, conversations, lifecycle transitions, evidence gates, and customer responses on the existing operational repositories and domain services. Add a storage-neutral learning-ledger contract with an in-memory/JSON test adapter and a SQLite adapter. Migrate the knowledge-evolution candidate/version/audit records into the SQLite-backed learning store first so candidate promotion and its ledger events can be committed transactionally, while leaving the remaining operational JSON stores in place.

**Tech Stack:** TypeScript with Node.js 20 compatibility, Zod schemas, Vitest, \`better-sqlite3\` with \`@types/better-sqlite3\`, existing repository/service interfaces, and the current deterministic knowledge-evolution and lifecycle evaluation harnesses.

## Global Constraints

- The operational plane remains authoritative for classification, evidence readiness, diagnosis, fixes, verification, lifecycle transitions, and customer responses.
- GPT-generated knowledge-object fields remain advisory; GPT cannot promote an object, change lifecycle state, or create executable code.
- Only an operator-approved diagnosis plus a successful governed outcome and customer confirmation or verified technical outcome can produce outcome-verified learning evidence.
- \`observed\`, \`diagnosis-supported\`, \`outcome-verified\`, \`reuse-validated\`, and \`promoted\` are maturity states; \`active\`, \`stale\`, \`contradicted\`, \`deprecated\`, and \`superseded\` are independent health states.
- Historical events, recommendations, and knowledge-object versions are immutable; new edits create new versions.
- New evaluations use the latest active version; in-progress tickets remain pinned to the version that produced their recommendation until explicitly re-evaluated.
- Stale or contradicted objects remain queryable but may only contribute decayed recurrence signals and may never bypass evidence gates.
- Event IDs are stable and idempotent; a duplicate identical event is a no-op, while a duplicate ID with different content is a domain error.
- SQLite failure must not change the operational ticket lifecycle; learning capture must be recorded as failed or pending and exposed through audit/health output.
- Raw customer transcripts are not copied into the learning ledger by default. Store structured IDs, sanitized summaries, provenance, and references to operational records.
- The first implementation must preserve the current JSON/in-memory path for deterministic tests and replay. Full ticket/conversation/audit migration is a later slice.
- Every production change follows TDD: write a failing regression, run it, implement the smallest fix, rerun focused tests, then run the relevant full suite.

---

## File Map

Create these focused modules:

- \`src/knowledge-evolution/learning-ledger.ts\` — Zod schemas, event union, filters, and storage-neutral ledger interfaces.
- \`src/knowledge-evolution/in-memory-learning-ledger.ts\` — deterministic adapter used by unit tests and replay fixtures.
- \`src/knowledge-evolution/sqlite-learning-ledger.ts\` — SQLite connection, schema migration, transactions, idempotency, and query implementation.
- \`src/knowledge-evolution/sqlite-knowledge-evolution-store.ts\` — candidate/version/audit repository facade backed by the same SQLite transaction boundary.
- \`src/knowledge-evolution/learning-capture.ts\` — maps authoritative operational outcomes and knowledge-review actions into learning events and records capture failures without blocking ticket operations.
- \`src/knowledge-evolution/learning-read-model.ts\` — maturity/health projections, stale/contradiction signals, and reuse/evaluation summaries.
- \`test/knowledge-learning-ledger-contract.test.ts\` — adapter contract tests shared by in-memory and SQLite implementations.
- \`test/knowledge-learning-ledger.test.ts\` — event schema, idempotency, stale/contradiction, and transaction regression tests.
- \`test/knowledge-learning-capture.test.ts\` — operational-outcome capture and failure-isolation tests.
- \`test/knowledge-learning-read-model.test.ts\` — maturity/health and reuse projection tests.
- \`scripts/demo-learning-ledger.ts\` — reproducible local showcase of capture, promotion, reuse, contradiction, and historical immutability.
- \`test/demo-learning-ledger.test.ts\` — CLI/showcase contract test.

Modify these existing modules:

- \`package.json\`, \`package-lock.json\` — add the SQLite dependency and a \`demo:learning-ledger\` script.
- \`src/runtime.ts\` — configure the ledger path, initialize the SQLite store, and expose storage-neutral dependencies.
- \`src/triage-service.ts\` — emit learning events after successful diagnosis, fix/mitigation, verification, and closure operations without blocking the operational commit.
- \`src/knowledge-evolution/service.ts\` — use the ledger-backed candidate/version/audit store and emit candidate review/promotion/reuse events.
- \`src/server.ts\` — keep MCP tool outcomes equivalent while exposing the learning summary only through an explicit read surface if needed.
- \`src/approval-desk/http.ts\` — expose the same learning summary used by MCP/read-model consumers; do not duplicate promotion logic.
- \`src/domain.ts\` — add only the audit action/schema entries required to make capture failures observable and safe.
- \`README.md\`, \`docs/knowledge-evolution.md\`, \`docs/case-study.md\`, \`docs/roadmap.md\` — document the bounded learning loop, SQLite scope, maturity/health states, failure behavior, and showcase command.

## Interfaces and event contract

The first task defines the contract that all later tasks consume:

~~~ts
export const LearningEventTypeSchema = z.enum([
  "diagnosis-recorded",
  "diagnosis-approved",
  "fix-available",
  "outcome-verified",
  "candidate-created",
  "candidate-deferred",
  "candidate-rejected",
  "candidate-promoted",
  "knowledge-reused",
  "knowledge-reuse-failed",
  "knowledge-marked-stale",
  "knowledge-deprecated",
  "evaluation-recorded",
]);

export interface LearningLedger {
  initialize(): Promise<void>;
  append(event: LearningEvent): Promise<void>;
  appendBatch(events: readonly LearningEvent[]): Promise<void>;
  list(filters?: LearningEventFilters): Promise<LearningEvent[]>;
  has(id: string): Promise<boolean>;
}
~~~

Every event carries a stable UUID, event type, ISO timestamp, actor, optional ticket/diagnosis/candidate/object/version references, a correlation ID, and a typed sanitized payload. Event payloads must preserve evidence IDs, verification type (\`customer-confirmed\` or \`technically-verified\`), outcome status, match reasons, and provenance without raw prompts, secrets, paths, or transcripts.

The knowledge-evolution SQLite facade must preserve the existing service-facing method shapes:

~~~ts
listCandidates(): Promise<KnowledgeCandidate[]>;
getCandidate(id: string): Promise<KnowledgeCandidate>;
saveCandidate(candidate: KnowledgeCandidate): Promise<void>;
removeCandidate(id: string): Promise<void>;
listApproved(): Promise<KnowledgeObject[]>;
promote(candidateId: string, approved: KnowledgeObject, expectedVersion?: number): Promise<KnowledgeObject>;
removeApproved(id: string): Promise<void>;
appendAudit(event: KnowledgeAuditEvent): Promise<void>;
appendIfNoPriorAction(event: KnowledgeAuditEvent): Promise<boolean>;
listAudit(filters?: KnowledgeAuditFilters): Promise<KnowledgeAuditEvent[]>;
~~~

The SQLite implementation will execute candidate/version persistence and the corresponding promotion audit/learning event in one database transaction. The JSON adapter remains available for isolated tests and deterministic replay.

## Implementation Tasks

### Task 1: Define the learning event contract

**Files:**
- Create: \`src/knowledge-evolution/learning-ledger.ts\`
- Test: \`test/knowledge-learning-ledger.test.ts\`

**Interfaces:**
- Consumes: \`TicketIdSchema\`, \`IsoTimestampSchema\`, knowledge-object IDs, evidence IDs, and existing sanitized text constraints from \`src/domain.ts\` and \`src/knowledge-evolution/domain.ts\`.
- Produces: \`LearningEventSchema\`, \`LearningEventTypeSchema\`, \`LearningEvent\`, \`LearningEventFilters\`, \`LearningLedger\`, and \`LearningLedgerError\`.

- [ ] **Step 1: Write failing schema tests** for every event type, required references, customer/technical verification types, bounded payload text, rejection of raw prompts/secrets/paths, and rejection of missing actor/timestamp/event ID.
- [ ] **Step 2: Run the focused test**.

Run: \`npm test -- --run test/knowledge-learning-ledger.test.ts\`

Expected: FAIL because the new schema and types do not exist.

- [ ] **Step 3: Implement the discriminated event schemas and interfaces**.

Use a strict Zod discriminated union. Keep event payloads structured rather than \`unknown\` blobs. Include \`maturity\`, \`health\`, \`verificationType\`, \`evidenceIds\`, \`matchReasons\`, and \`sourceVersion\` only on the event variants that require them.

- [ ] **Step 4: Run the focused test again**.

Expected: PASS with no schema warnings.

- [ ] **Step 5: Commit**.

~~~powershell
git add src/knowledge-evolution/learning-ledger.ts test/knowledge-learning-ledger.test.ts
git commit -m "feat: define learning ledger event contract"
~~~

### Task 2: Build the deterministic in-memory adapter and contract suite

**Files:**
- Create: \`src/knowledge-evolution/in-memory-learning-ledger.ts\`
- Create: \`test/knowledge-learning-ledger-contract.test.ts\`
- Modify: \`test/knowledge-learning-ledger.test.ts\`

**Interfaces:**
- Consumes: \`LearningLedger\`, \`LearningEvent\`, and \`LearningEventFilters\` from Task 1.
- Produces: \`InMemoryLearningLedger\` and a reusable \`runLearningLedgerContract(createLedger)\` test helper.

- [ ] **Step 1: Write failing contract tests** for initialization, append, batch append, stable chronological listing, filters by event type/ticket/object, idempotent duplicate append, conflicting duplicate rejection, and deep-copy behavior.
- [ ] **Step 2: Run the contract test** and verify it fails because the adapter is missing.
- [ ] **Step 3: Implement the minimal in-memory adapter** with schema parsing at the boundary, stable sorting by \`occurredAt\` then \`id\`, and clone-on-write/clone-on-read semantics.
- [ ] **Step 4: Run the contract suite** and verify every in-memory case passes.
- [ ] **Step 5: Commit**.

~~~powershell
git add src/knowledge-evolution/in-memory-learning-ledger.ts test/knowledge-learning-ledger-contract.test.ts test/knowledge-learning-ledger.test.ts
git commit -m "feat: add learning ledger contract adapter"
~~~

### Task 3: Add the SQLite database and transaction-safe ledger

**Files:**
- Modify: \`package.json\`
- Modify: \`package-lock.json\`
- Create: \`src/knowledge-evolution/sqlite-learning-ledger.ts\`
- Modify: \`test/knowledge-learning-ledger-contract.test.ts\`
- Modify: \`test/knowledge-learning-ledger.test.ts\`

**Interfaces:**
- Consumes: \`LearningLedger\` and event schemas from Task 1.
- Produces: \`SqliteLearningLedger\` with \`initialize\`, \`append\`, \`appendBatch\`, \`list\`, and \`has\` matching the contract exactly.

- [ ] **Step 1: Add \`better-sqlite3\` and \`@types/better-sqlite3\`** using the repository’s Node 20-compatible engine range.
- [ ] **Step 2: Add failing SQLite contract cases** for persistence after closing/reopening, schema initialization, duplicate idempotency, conflicting IDs, batch rollback, and concurrent serialized writes.
- [ ] **Step 3: Run the SQLite contract cases** and confirm they fail because the adapter/schema is absent.
- [ ] **Step 4: Implement \`SqliteLearningLedger\`** with a private schema migration that creates \`schema_meta\` and \`learning_events\`, stores typed payload JSON, enforces primary-key event IDs, and wraps batch writes in \`db.transaction(...)\`.
- [ ] **Step 5: Implement exact duplicate comparison** by canonical JSON serialization; return success for identical retries and throw a domain error for same-ID/different-payload conflicts.
- [ ] **Step 6: Run the shared contract suite against both adapters** and verify identical results.
- [ ] **Step 7: Commit**.

~~~powershell
git add package.json package-lock.json src/knowledge-evolution/sqlite-learning-ledger.ts test/knowledge-learning-ledger-contract.test.ts test/knowledge-learning-ledger.test.ts
git commit -m "feat: persist learning events in SQLite"
~~~

### Task 4: Move knowledge candidates, versions, and audits behind the SQLite transaction boundary

**Files:**
- Create: \`src/knowledge-evolution/sqlite-knowledge-evolution-store.ts\`
- Modify: \`src/knowledge-evolution/service.ts\`
- Modify: \`src/runtime.ts\`
- Modify: \`test/knowledge-evolution-repositories.test.ts\`
- Modify: \`test/knowledge-evolution-service.test.ts\`

**Interfaces:**
- Consumes: existing \`KnowledgeCandidateSchema\`, \`KnowledgeObjectSchema\`, \`KnowledgeAuditEventSchema\`, and the \`LearningLedger\` database handle from Task 3.
- Produces: a SQLite-backed implementation of the existing candidate/object/audit method shapes, without changing \`KnowledgeEvolutionService\` callers.

- [ ] **Step 1: Write failing repository tests** proving candidates and approved versions survive reopen, candidate versions are immutable, stale expected versions are rejected, audit actions are idempotent, and promotion persists candidate/version/audit/event records together.
- [ ] **Step 2: Run the repository tests** and confirm the SQLite store is missing.
- [ ] **Step 3: Add SQLite tables** for \`knowledge_candidates\`, \`knowledge_versions\`, and \`knowledge_audits\`, with unique IDs, version constraints, serialized validated payloads, and foreign-key references to learning-event IDs where applicable.
- [ ] **Step 4: Implement the store** so \`promote\` writes the immutable approved version, promotion audit, and \`candidate-promoted\` learning event in one transaction; rollback the entire transaction on any validation or persistence failure.
- [ ] **Step 5: Keep the existing JSON repositories as a test/replay adapter** and run their current tests unchanged.
- [ ] **Step 6: Run both JSON and SQLite repository suites** and verify equivalent service outcomes.
- [ ] **Step 7: Commit**.

~~~powershell
git add src/knowledge-evolution/sqlite-knowledge-evolution-store.ts src/knowledge-evolution/service.ts test/knowledge-evolution-repositories.test.ts test/knowledge-evolution-service.test.ts
git commit -m "feat: make knowledge evolution transaction-safe in SQLite"
~~~

### Task 5: Wire runtime configuration without changing operational authority

**Files:**
- Modify: \`src/runtime.ts\`
- Modify: \`src/server.ts\`
- Modify: \`src/approval-desk/http.ts\`
- Modify: \`test/runtime.test.ts\`
- Modify: \`test/approval-desk-http.test.ts\`

**Interfaces:**
- Consumes: \`SqliteLearningLedger\` and SQLite knowledge-evolution store from Tasks 3–4.
- Produces: \`RuntimePaths.learningLedgerFile\`, \`RuntimeDependencies.knowledgeEvolution.ledger\`, and the same existing \`KnowledgeEvolutionService\` API for MCP/UI callers.

- [ ] **Step 1: Write failing runtime tests** for the default ledger path, \`TRIAGE_LEARNING_LEDGER_PATH\` override, invalid blank path, clean temporary database initialization, and equivalent HTTP/MCP knowledge-review outcomes.
- [ ] **Step 2: Implement path/config parsing** with default \`data/runtime/knowledge-evolution/learning.sqlite\`; do not change ticket, conversation, recommendation, or operational audit defaults.
- [ ] **Step 3: Initialize the SQLite store at runtime startup** and inject it into the knowledge-evolution service and learning capture service.
- [ ] **Step 4: Preserve dependency injection seams** so unit tests can provide the in-memory/JSON adapters and never require a real filesystem database.
- [ ] **Step 5: Run runtime, HTTP, MCP, and repository tests**.
- [ ] **Step 6: Commit**.

~~~powershell
git add src/runtime.ts src/server.ts src/approval-desk/http.ts test/runtime.test.ts test/approval-desk-http.test.ts
git commit -m "feat: wire the durable learning ledger into runtime"
~~~

### Task 6: Capture verified operational outcomes and isolate ledger failures

**Files:**
- Create: \`src/knowledge-evolution/learning-capture.ts\`
- Modify: \`src/triage-service.ts\`
- Modify: \`src/domain.ts\`
- Modify: \`test/knowledge-learning-capture.test.ts\`
- Modify: \`test/triage-service.test.ts\`

**Interfaces:**
- Consumes: authoritative \`AuditEvent\` results from \`recordDiagnosis\`, \`reviewDiagnosis\`, \`recordFix\`, \`recordPlatformMitigation\`, customer confirmation, and \`closeTicket\`.
- Produces: \`LearningCaptureService.recordAuditOutcome(event, context)\` and learning events with \`diagnosis-recorded\`, \`diagnosis-approved\`, \`fix-available\`, and \`outcome-verified\` types.

- [ ] **Step 1: Write failing capture tests** for:
  - approved diagnosis producing a sanitized event with diagnosis/evidence/article references;
  - fix/mitigation producing an event tied to the exact diagnosis and ticket;
  - customer confirmation producing \`verificationType: "customer-confirmed"\`;
  - a verified technical outcome producing \`verificationType: "technically-verified"\`;
  - an unverified or escalated diagnosis not becoming outcome-verified;
  - duplicate audit delivery remaining idempotent;
  - a ledger failure leaving the operational audit/ticket result successful while exposing a \`learning-capture-failed\` audit action.
- [ ] **Step 2: Run the focused capture tests** and verify they fail before the capture service exists.
- [ ] **Step 3: Add the minimal \`LearningCaptureService\`** with schema-validated redacted payload construction and one ledger append per authoritative audit event.
- [ ] **Step 4: Add the \`learning-capture-failed\` audit action** with \`result: "rejected"\` only when the capture itself is rejected, without changing the original operational audit result.
- [ ] **Step 5: Call capture only after the existing operational commit succeeds**; never make ticket mutation depend on SQLite availability.
- [ ] **Step 6: Run capture, triage, diagnostic workflow, and lifecycle tests**.
- [ ] **Step 7: Commit**.

~~~powershell
git add src/knowledge-evolution/learning-capture.ts src/triage-service.ts src/domain.ts test/knowledge-learning-capture.test.ts test/triage-service.test.ts
git commit -m "feat: capture verified operational outcomes"
~~~

### Task 7: Record candidate review, reuse, contradictions, and maturity/health projections

**Files:**
- Create: \`src/knowledge-evolution/learning-read-model.ts\`
- Modify: \`src/knowledge-evolution/service.ts\`
- Modify: \`src/approval-desk/ai-evaluation.ts\`
- Modify: \`src/approval-desk/http.ts\`
- Modify: \`src/server.ts\`
- Create: \`test/knowledge-learning-read-model.test.ts\`
- Modify: \`test/knowledge-evolution-service.test.ts\`

**Interfaces:**
- Consumes: learning events and approved knowledge versions from Tasks 3–6.
- Produces:

~~~ts
export interface KnowledgeLearningSummary {
  candidateId: string;
  maturity: "observed" | "diagnosis-supported" | "outcome-verified" | "reuse-validated" | "promoted";
  health: "active" | "stale" | "contradicted" | "deprecated" | "superseded";
  signalWeight: number;
  supportingEventIds: string[];
  staleReasons: string[];
  contradictionReasons: string[];
}
~~~

- [ ] **Step 1: Write failing projection tests** for the maturity ladder, independent health axis, decayed stale signals, contradiction without deletion, and reuse validation only after later tickets have no operator correction.
- [ ] **Step 2: Run the read-model tests** and confirm the projection is absent.
- [ ] **Step 3: Implement deterministic projection rules**:
  - \`observed\` has no recommendation influence;
  - \`diagnosis-supported\` is a weak candidate;
  - \`outcome-verified\` is promotion-review eligible;
  - \`reuse-validated\` is a strong candidate signal;
  - only \`promoted + active\` is eligible for governed reuse;
  - stale/contradicted/deprecated objects never bypass evidence gates.
- [ ] **Step 4: Emit candidate-created, deferred, rejected, promoted, reused, and failed-reuse events** from \`KnowledgeEvolutionService\` with exact version references.
- [ ] **Step 5: Expose the summary through one shared read-model function** used by HTTP, MCP, and UI adapters; do not reimplement state transitions in transports.
- [ ] **Step 6: Run knowledge-evolution, HTTP, MCP, and read-model tests**.
- [ ] **Step 7: Commit**.

~~~powershell
git add src/knowledge-evolution/learning-read-model.ts src/knowledge-evolution/service.ts src/approval-desk/ai-evaluation.ts src/approval-desk/http.ts src/server.ts test/knowledge-learning-read-model.test.ts test/knowledge-evolution-service.test.ts
git commit -m "feat: project governed knowledge maturity and reuse"
~~~

### Task 8: Add a reproducible ledger showcase and holdout evaluation

**Files:**
- Create: \`scripts/demo-learning-ledger.ts\`
- Create: \`test/demo-learning-ledger.test.ts\`
- Modify: \`package.json\`
- Modify: \`docs/demo-results.md\`
- Modify: \`docs/knowledge-evolution.md\`

**Interfaces:**
- Consumes: runtime SQLite dependencies, controlled candidate drafting, existing future-ticket reuse fixtures, and the read model from Tasks 5–7.
- Produces: \`npm run demo:learning-ledger\` and a deterministic report containing capture, promotion, reuse, contradiction, stale handling, and historical immutability.

- [ ] **Step 1: Write the showcase test** asserting that the command emits schema-valid JSON/markdown with:
  - one operator-approved diagnosis;
  - one technically verified outcome;
  - one candidate reaching outcome-verified;
  - explicit human promotion;
  - one later ticket reusing the exact promoted version;
  - one failed reuse recorded without deletion;
  - one stale signal decayed but retained;
  - historical recommendation byte-for-byte unchanged.
- [ ] **Step 2: Run the showcase test** and verify the script is missing.
- [ ] **Step 3: Implement the controlled local showcase** in a temporary directory with fixed timestamps, no network, and sanitized output.
- [ ] **Step 4: Add \`demo:learning-ledger\` to \`package.json\`** and ensure it builds before running.
- [ ] **Step 5: Run the command and compare its output to the test contract**.
- [ ] **Step 6: Commit**.

~~~powershell
git add scripts/demo-learning-ledger.ts test/demo-learning-ledger.test.ts package.json docs/demo-results.md docs/knowledge-evolution.md
git commit -m "feat: showcase governed learning ledger reuse"
~~~

### Task 9: Document the bounded claim, migration seam, and operational failure behavior

**Files:**
- Modify: \`README.md\`
- Modify: \`docs/case-study.md\`
- Modify: \`docs/roadmap.md\`
- Modify: \`docs/knowledge-evolution.md\`
- Modify: \`docs/superpowers/specs/2026-08-07-governed-knowledge-learning-loop-design.md\` only if implementation decisions require an explicitly recorded refinement.
- Test: \`test/demo-knowledge-evolution.test.ts\`

**Interfaces:**
- Consumes: verified showcase output and current repository behavior from Tasks 1–8.
- Produces: documentation that distinguishes human-governed knowledge improvement from autonomous model retraining and states that full operational SQLite migration remains future work.

- [ ] **Step 1: Add documentation assertions** for the SQLite learning-ledger command, maturity/health ladder, promotion gate, version pinning, stale behavior, and failure isolation.
- [ ] **Step 2: Update README/case study** with the evidence → recommendation → uncertainty → approval → verified outcome → reusable knowledge narrative.
- [ ] **Step 3: Update the roadmap** so SQLite ledger implementation precedes full-store migration and semantic retrieval.
- [ ] **Step 4: Run documentation/showcase tests**.
- [ ] **Step 5: Commit**.

~~~powershell
git add README.md docs/case-study.md docs/roadmap.md docs/knowledge-evolution.md test/demo-knowledge-evolution.test.ts
git commit -m "docs: explain governed SQLite learning loop"
~~~

### Task 10: Run the complete verification gate

**Files:**
- No source changes expected; inspect all files changed by Tasks 1–9.

- [ ] **Step 1: Run formatting/diff checks**.

~~~powershell
git diff --check
git status --short --branch
~~~

- [ ] **Step 2: Run the full portfolio verification**.

~~~powershell
npm run verify:portfolio
~~~

Expected: build and typecheck pass; all Vitest files pass; deterministic diagnostics and lifecycle replay pass; knowledge-evolution reuse remains historical-immutable; metrics and the new ledger showcase pass.

- [ ] **Step 3: Run the SQLite adapter contract suite after closing/reopening the database** and verify no temporary database is left in the repository.
- [ ] **Step 4: Review the final diff against the approved design** and confirm no operational-plane authority moved into UI, MCP, GPT, or the ledger.
- [ ] **Step 5: Commit any verification-only documentation correction as a separate commit**; do not amend earlier implementation commits.

## Rollback and migration notes

- Runtime can temporarily select the existing JSON/in-memory knowledge-evolution adapter in tests and replay, so a SQLite regression does not block deterministic evaluation.
- The SQLite database is local and disposable during the first slice; no production ticket data is required.
- Importing existing JSON knowledge candidates/audits must preserve stable IDs, versions, timestamps, and audit order. The import should be a separate, idempotent command after the adapter is proven, not part of startup.
- Full migration of tickets, conversations, recommendations, operational audits, and replay snapshots is explicitly deferred until the ledger and holdout evaluation demonstrate value.

