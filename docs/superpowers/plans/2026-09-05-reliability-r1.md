# Support Ticket Triage Reliability R1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. This document does not itself select delegation; follow the user's chosen execution mode.

**Goal:** Repair operational diagnosis reuse, command replay, learning delivery, and error recovery without changing lifecycle or human-approval policy.

**Architecture:** Keep the modular monolith, operational SQLite transaction boundary, and advisory learning store. Introduce narrow command preparation/replay and diagnosis-source boundaries; complete runtime-owned learning delivery. Make HTTP and MCP consume the same application behavior.

**Tech Stack:** TypeScript, Node.js ESM, Zod, better-sqlite3, Vitest; existing MCP SDK and embedded Approval Desk JavaScript.

**Spec:** [Support-Ticket-Triage-Reliability-Slice-R1.md](Support-Ticket-Triage-Reliability-Slice-R1.md). Place the unchanged spec at `docs/superpowers/specs/2026-09-05-reliability-r1-design.md` when importing this plan into the implementation checkout.

**Baseline verified:** Remote main and inspected checkout both at `caaf00917447b32f0b9928c49dd6a572abe8e4f7`. This is a plan, not implemented or verified code. Code blocks below are proposed implementation/test content; integrate them into the named modules.

**Suggested repository destination:** `docs/superpowers/plans/2026-09-05-reliability-r1.md`.

## Global constraints

The following requirements apply to every task:

- Operational diagnosis history is read from SQLite in the normal runtime; no new JSON mirror or fallback hides a missing record.
- The operation and validated caller intent determine replay identity. Generated timestamps, IDs, model output, latency, and usage do not.
- A command key can commit at most one semantic operational outcome. Changed intent under that key conflicts.
- Operational writes, immutable command result, and required outbox intent commit together.
- A replay returns the original command result. Any accompanying lifecycle projection describes current authoritative state and may differ from the original response.
- Learning failure cannot roll back or turn a committed ticket action into failure.
- Rejection, invalidation, replay, migration, and retries do not rewrite prior diagnoses, events, or approved knowledge versions.
- Provider work never occurs inside a SQLite transaction.
- No client automatically substitutes a new command key after an uncertain outcome.
- Initial bounded delivery pass when learning is available.
- Idle poll interval: 1 second.
- At most 25 rows processed per pass.
- Retry backoff per failed row: 1, 2, 4, 8, 16, then 30 seconds, capped at 30 seconds.
- No overlapping passes within one runner.
- Timers are unref'd so they alone do not keep the process alive.
- A valid new event is attempted within two poll intervals on an idle healthy runtime.
- Make orderly runtime cleanup awaitable: close(): Promise<void>, idempotent for repeated callers.
- Version-1 receipts return LEGACY_REPLAY_UNAVAILABLE (409) before provider work or mutation.
- Preserve current package engine range: `^20.19.0 || ^22.12.0 || >=24.0.0`.
- Use existing dependencies; no new runtime framework, queue broker, provider SDK, or frontend framework.
- Tests use temporary synthetic state and controlled/deterministic providers. No live credentials or paid calls.
- Queue optimization, whole-service/whole-UI decomposition, general browser testing, taxonomy changes, and automatic knowledge promotion/revocation are deferred.

## Execution sequence and gates

| Task | Deliverable | Depends on | Acceptance |
|---|---|---|---|
| 1 | Versioned semantic hashes, schema upgrade, read-only receipt lookup | Baseline | A6, A16 |
| 2 | Shared operational error classification | 1 | A15, A16 |
| 3 | Early evaluation replay and atomic commit recheck | 1–2 | A4–A10 |
| 4 | Replay for remaining operational commands and child recovery | 3 | A6, A10, A19 |
| 5 | Operational completed-diagnosis source and promotion support checks | 2 | A1–A3 |
| 6 | Bounded due-outbox selection and per-row delivery outcomes | 1 | A12 |
| 7 | Runtime delivery runner and awaited shutdown | 6 | A11–A14 |
| 8 | Frozen UI retry intent and reconciliation | 3–4 | A17 |
| 9 | Production-composition knowledge/recovery proof and release gate | 1–8 | A2, A18; all |

Execute in table order for the initial implementation. These are reviewable commits, not independent architectural redesigns. Do not merge partially converted operational command identity into main.

Each task follows **write failing test → verify failure reason → implement → run focused tests → inspect diff → commit**. Compilation failures caused by deliberate new interfaces are not sufficient regression evidence; demonstrate the original behavioral failure before completing each repair.

## Setup and baseline check

- [ ] Read repository AGENTS.md instructions if present and use an isolated checkout/worktree through the normal development workflow. Preserve unrelated work.
- [ ] Run the following commands separately:

```bash
git status --short
git rev-parse HEAD
git log -5 --oneline
npm ci
npm test -- --maxWorkers=1
```

- [ ] If the branch differs from the reviewed baseline, inspect changes in the named modules and reconcile this plan before editing. Do not replace newer behavior with stale code.
- [ ] Record exact test results. Previously observed parallel timeouts do not justify ignoring a failing test.
- [ ] Import the design and plan into their suggested documentation paths. The design remains authoritative when examples in this plan require small repository-specific adjustments.

## Task 1 — Versioned hashes and additive receipt migration

**Files**

Modify `src/operational/idempotency.ts`, `src/operational/domain.ts`, `src/operational/sqlite-store.ts`, `src/operational/unit-of-work.ts`; tests `test/operational-idempotency.test.ts`, `test/operational-sqlite-store.test.ts`, and schema assertions in `test/operational-import.test.ts`, `test/demo-reset.test.ts`, `test/operational-diagnostic-taxonomy.test.ts`.

**Interfaces produced**

- `RequestHashVersion = 1 | 2`.
- `canonicalRequestHashV2(operation: string, semanticRequest: unknown): string`.
- `CommandIdempotencyRecord.requestHashVersion: RequestHashVersion`.
- Store `readCommandReceipt(commandId: string): CommandIdempotencyRecord | undefined`, returning detached immutable data through a read-only path.
- Unit `beginCommandV2(commandId: string, operation: string, semanticRequest: unknown): CommandReplay | "new"`.
- Existing `persistCommandResult(commandId, hash, result)` remains the sole atomic receipt writer; the pending claim carries its hash version.

### 1.1 Write and run the failing hash regression

Add to the hash tests:

```ts
it("preserves selected platform-event identity in v2", () => {
  const common = {
    ticketId: "TKT-1010",
    actor: "reviewer",
    rationale: "Mitigation is available.",
  };
  expect(canonicalRequestHashV2("record-platform-mitigation", {
    ...common, eventId: "event-a",
  })).not.toBe(canonicalRequestHashV2("record-platform-mitigation", {
    ...common, eventId: "event-b",
  }));
});

it("preserves nested caller reply identity and order", () => {
  const reply = { id: "reply-a", createdAt: "2026-09-05T10:00:00Z", body: "Still failing." };
  const hash = (replies: unknown[]) =>
    canonicalRequestHashV2("evaluate-ticket", { ticketId: "TKT-1010", replies });
  expect(hash([reply])).not.toBe(hash([{ ...reply, createdAt: "2026-09-05T10:01:00Z" }]));
  expect(hash([reply, { ...reply, id: "reply-b" }]))
    .not.toBe(hash([{ ...reply, id: "reply-b" }, reply]));
});
```

First demonstrate eventId collision against the baseline canonicalRequestHash, then target the new API. Keep existing malformed-JSON/prototype/cycle protections.

```bash
npx vitest run test/operational-idempotency.test.ts --maxWorkers=1
```

### 1.2 Implement versioned serialization

Reuse the existing validated recursive JSON traversal and canonical serialization. Parameterize metadata projection so version 1 retains its exact behavior while version 2 removes no field names. Undefined object values may remain omitted as JSON does; reject unsupported values using existing rules.

The v2 hash preimage is:

```ts
const preimage =
  '{"version":2,"operation":' + JSON.stringify(normalizeOperationName(operation)) +
  ',"request":' + canonicalSemanticJson(validatedSemanticRequest) + '}';
return createHash("sha256").update(preimage, "utf8").digest("hex");
```

`validatedSemanticRequest` is the result of the existing traversal with reserved-key filtering disabled. It is not JSON supplied by a transport without schema validation.

Do not change canonicalLearningJson: its existing delivery deduplication hashes are a different contract.

### 1.3 Add schema version 4

Use the existing migration framework, not startup DDL outside that framework:

```sql
ALTER TABLE command_idempotency
ADD COLUMN request_hash_version INTEGER NOT NULL DEFAULT 1
CHECK (request_hash_version IN (1, 2));
```

Register `versioned-command-request-identity` as migration 4, update operational_metadata.schema_version, and validate the prior physical schema before migration. Update fresh database creation and schema comparison logic so it produces/validates the same physical schema as upgrading. Keep versions 1–3 migratable and future versions rejected.

Write the new column explicitly for new receipts. Never default migrated rows to 2. Preserve result_json/request_hash/created_at and all event/revision rows.

For migration tests, follow the existing disposable-database downgrade-fixture pattern: construct valid receipts, close all handles, rebuild the command_idempotency table with its exact five-column baseline DDL, restore its operation index, remove migration 4, and set schema_version to 3. Do not just change metadata while retaining a v4 physical table.

Before upgrade, capture:

```sql
SELECT command_id, operation, request_hash, result_json, created_at
FROM command_idempotency ORDER BY command_id;
```

After upgrade, assert the same values and request_hash_version=1. Test a tampered prior schema is rejected without recording migration 4.

### 1.4 Add receipt lookup and v2 transaction claims

Make the existing private receipt reader include the version field. Expose a detached read-only store wrapper; do not use BEGIN IMMEDIATE for the preflight read.

`beginCommandV2` must check in this order:

1. Validate key and operation.
2. Existing receipt with version 1 → LEGACY_REPLAY_UNAVAILABLE.
3. Existing receipt with different operation/hash → IDEMPOTENCY_CONFLICT.
4. Matching v2 receipt → mark the unit replay-only and return immutable replay.
5. No receipt → store a transaction-local version-2 claim.

Validate version in assertReadyToCommit alongside current receipt and write-set checks. Keep existing v1 helpers only for explicit legacy fixtures during conversion; Tasks 3–4 remove their use from normal operational mutations.

- [ ] Run the hash, migration, import, reset, and taxonomy-persistence tests.
- [ ] Inspect the migration with old, new, tampered, and future-schema cases.
- [ ] Commit: `feat: version operational command request identities`.

## Task 2 — Shared public command errors

**Files**

Create `src/command-errors.ts`, `test/command-errors.test.ts`. Modify `src/errors.ts`, `src/operational/unit-of-work.ts`, `src/operational/sqlite-store.ts`, `src/approval-desk/http.ts`, `src/server.ts`, `test/approval-desk-http.test.ts`, `test/server-actions.test.ts`.

**Interface produced**

```ts
export interface PublicCommandError {
  code: string;
  message: string;
  httpStatus: 400 | 404 | 409 | 500 | 503;
  retryable: boolean;
}
export function classifyCommandError(error: unknown): PublicCommandError | undefined;
```

Return undefined for unclassified programming failures; existing transport-specific unexpected-error handling remains responsible for those.

### 2.1 Add classification tests before handlers

```ts
it("reports receipt conflicts without exposing internals", () => {
  const error = new OperationalStoreError(
    "SQL and internal path must not reach the client", "IDEMPOTENCY_CONFLICT",
  );
  const result = classifyCommandError(error);
  expect(result).toMatchObject({
    code: "IDEMPOTENCY_CONFLICT", httpStatus: 409, retryable: false,
  });
  expect(result?.message).not.toContain("SQL");
  expect(result?.message).not.toContain("internal path");
});
```

Add table-driven tests for every row of spec §8, including new LEGACY_REPLAY_UNAVAILABLE and KNOWLEDGE_SUPPORT_STALE, missing ticket/recommendation, import-not-ready, SQLite busy/locked, integrity failures, invalid input, and unknown Error.

### 2.2 Implement precise classification

Add dedicated OPERATIONAL_NOT_READY storage classification for the current import-state guard; do not map all STATE_ERROR cases to 503. Preserve typed causes for SQLite busy/locked and unavailable storage. Do not infer retryability from message substrings.

Map ASYNC_TRANSACTION, SCHEMA_ERROR, SEQUENCE_ERROR, corrupt stored values, and violated transaction invariants to safe OPERATIONAL_INTEGRITY_ERROR. Keep caller validation distinguishable from corrupt persisted data.

HTTP retains `{ error: { code, message } }`. MCP retains error text beginning with the same code and `isError: true`. Shared classification supplies both; raw SQL/path/stack content remains internal.

### 2.3 Verify real transport failures

Using existing HTTP and MCP harnesses, submit a valid command then reuse its key with changed body. Assert HTTP 409 / MCP isError and matching IDEMPOTENCY_CONFLICT code. Assert legacy-key errors do not call a provider.

- [ ] Run `npx vitest run test/command-errors.test.ts test/approval-desk-http.test.ts test/server-actions.test.ts --maxWorkers=1`.
- [ ] Commit: `fix: classify operational command failures across transports`.

## Task 3 — Early evaluation replay and shared preparation

**Files**

Create `src/operational-command-dispatch.ts`, `src/evaluation-command.ts`, `test/reliability-runtime-fixture.ts`, `test/reliability-command-replay.test.ts`, `test/operational-command-dispatch.test.ts`.
Modify `src/triage-service.ts`, `src/runtime.ts`, `src/server.ts`, `src/approval-desk/http.ts`, `test/triage-operational-evaluation.test.ts`.

### 3.1 Add the production-composition HTTP fixture

Use the following helper in the new test fixture. It intentionally uses current public runtime setup and does not replace repositories or service methods.

```ts
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRuntimeDependencies } from "../src/runtime.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";

export async function openReliabilityRuntime() {
  const root = await mkdtemp(join(tmpdir(), "triage-r1-"));
  const env = {
    TRIAGE_DATA_ROOT: root,
    TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
    TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
    OPERATIONAL_DB_PATH: join(root, "operational.sqlite"),
  };
  resetOperationalDemoState({
    dataRoot: root, seedFile: env.TRIAGE_SEED_FILE,
    operationalDatabase: env.OPERATIONAL_DB_PATH,
  });
  let time = Date.parse("2026-08-13T09:00:00Z");
  async function start() {
    const runtime = await createRuntimeDependencies({ env, now: () => new Date(time) });
    const server = createApprovalDeskHttpServer(runtime);
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolveListen();
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No HTTP port");
    return { runtime, server, base: "http://127.0.0.1:" + address.port };
  }
  let active = await start();
  async function stop() {
    await new Promise<void>((resolveClose, reject) => active.server.close(
      error => error ? reject(error) : resolveClose(),
    ));
    await active.runtime.close();
  }
  return {
    root,
    get runtime() { return active.runtime; },
    advance(ms: number) { time += ms; },
    async post(path: string, body: unknown, key = randomUUID()) {
      const response = await fetch(active.base + path, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    async restart() { await stop(); active = await start(); },
    async close() { try { await stop(); } finally { await rm(root, { recursive: true, force: true }); } },
  };
}
```

Fixture construction failures must also close any already-open runtime/server and delete the temporary root before rethrowing. Add that cleanup when integrating this helper.

### 3.2 Reproduce the original retry bug

```ts
it("replays evaluation after time and runtime advance", async () => {
  const h = await openReliabilityRuntime();
  const key = randomUUID();
  const input = { actor: "approval-desk", aiPreference: "deterministic" };
  try {
    const first = await h.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(first.status).toBe(201);
    h.advance(60_000);
    const retry = await h.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(retry.status).toBe(201);
    expect(retry.body.recommendation).toEqual(first.body.recommendation);
    await h.restart();
    const restarted = await h.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(restarted.body.recommendation).toEqual(first.body.recommendation);
    expect((await h.runtime.recommendations.list())
      .filter(r => r.ticketId === "TKT-1010")).toHaveLength(1);
  } finally { await h.close(); }
});
```

Run and record its failure before changing evaluation. Extend the fixture with existing provider-option injection from ApprovalDeskHttpOptions for the controlled-provider tests; preserve real runtime composition.

### 3.3 Define one dispatch contract

```ts
import type { OperationalResultReference } from "./operational/domain.js";
import type { OperationalUnitOfWork } from "./operational/unit-of-work.js";

export interface PreparedCommandDefinition<I, P, R> {
  operation: string;
  parse(input: unknown): I;
  prepare(intent: I): Promise<P>;
  // Write set only: called inside the runner's transaction.
  commit(unit: OperationalUnitOfWork, prepared: P, commandId: string): OperationalResultReference;
  // Must use immutable result/revision references.
  replay(reader: OperationalResultReader, result: OperationalResultReference): R;
}
export type OperationalResultReader = Pick<OperationalUnitOfWork, "readWorkflowSnapshot">;
```

The runner exposes `run<I,P,R>(definition, rawIntent, commandId): Promise<R>`. Definitions are trusted application code; HTTP/MCP select named application methods, not caller-provided callbacks, hashes, or definitions.

Add store `readCommandOutcome<T>(commandId, project): T | undefined`, where project receives `(receipt: CommandIdempotencyRecord, reader: OperationalResultReader)`. Run receipt lookup and projection inside one deferred read transaction. Pass a reader facade exposing only bound read methods, never the writable unit. The preflight callback verifies version/operation/hash before reconstructing a result. The final write transaction may pass its unit to the same replay projection because it satisfies the narrow reader interface.

The runner, not a transport, performs normalized v2 hashing. It owns:

- Read-only receipt preflight and v1/conflict rejection.
- Per-runtime in-flight map containing hash plus promise.
- Preparation outside transactions.
- Transactional beginCommandV2 recheck, command write set, persistCommandResult, and replay.
- Cleanup of in-flight state on success/failure.

Extract existing operational transaction **bodies** into commit callbacks. Remove nested transaction/begin/persist calls from extracted bodies; keep every domain guard and write-set validation. Retain independent legacy paths until a later slice.

A late transaction replay must use its stored result, never prepared output from a losing concurrent request. Extend the already-listed sqlite-store.ts and unit-of-work.ts receipt readers for this read-only projection boundary. If a committed receipt exists but its referenced immutable data is missing, return OPERATIONAL_INTEGRITY_ERROR; do not treat corrupt replay data as a stale caller request or execute the command again.

### 3.4 Share evaluation preparation between HTTP and MCP

Move the overlapping orchestration currently in HTTP createRecommendation and MCP evaluateTicket into evaluation-command.ts. Export a named application method:

```ts
evaluateTicketCommand(input: unknown, commandId: string):
  Promise<{ recommendation: TriageRecommendation; recommendations: TriageRecommendation[] }>;
```

Use one normalized input schema for the common fields. Preserve transport-specific accepted optional reply data without silently dropping it. Parsing must occur before hashing and materialize identical defaults.

Preparation keeps the existing order: knowledge availability → source ticket/audits/articles → conversation and diagnosis context → provider selection → evaluateTicketWithAi. Preparation produces evaluation output and source revision/watermark, but those values are not caller identity.

Place TicketEvaluationGuard inside preparation, after receipt/in-flight checks, so same-key retries join rather than receive EVALUATION_IN_PROGRESS. Different-key concurrent ticket evaluations retain the guard.

Preserve submitOperationalEvaluation's stale-revision/watermark checks, supersession events, typed traces, and revision writes in its extracted commit body.

### 3.5 Fix immutable reconstruction and add concurrency tests

Expose existing private replay helpers only to application definitions; do not introduce a new public transport endpoint. Reconstruct evaluation and approval results using persisted revision/event references. Audit replayCustomerReply, which currently uses snapshot.ticket, and use the ticket revision at the committed event or a persisted immutable ticketSnapshot instead.

Add tests for:

- Controlled provider call count remains one after committed replay.
- Same-key joined promises; changed payload while in flight conflicts.
- Two runtime instances sharing the same database, synchronized at provider barriers, produce one committed result.
- Customer reply arrives during provider work → STALE_APPROVAL, no partial receipt.
- Injected failure immediately before receipt persistence rolls back all writes.
- Lost response followed by ticket advancement still returns the first immutable result.

Use a deferred promise barrier, not sleep:

```ts
export function barrier() {
  let release!: () => void;
  const reached = new Promise<void>(resolve => { release = resolve; });
  return { reached, release };
}
```

Use separate entered/release barriers for each provider. A transaction race test may observe duplicate advisory calls, but must assert exactly one committed receipt/write set.

- [ ] Run the new replay/dispatch tests and `test/triage-operational-evaluation.test.ts`, `test/evaluation-guard.test.ts`, `test/ai-evaluation.test.ts`.
- [ ] Commit: `fix: replay evaluation before mutable preparation`.

## Task 4 — Remaining command boundaries and composite recovery

**Files**

Modify `src/triage-service.ts`, `src/operational-command-dispatch.ts`, `src/server.ts`, `src/approval-desk/http.ts`, `src/operational/domain.ts`.
Create `test/reliability-lifecycle-replay.test.ts`; extend `test/recovery-transports.test.ts`, `test/triage-operational-recommendation-lifecycle.test.ts`, `test/triage-operational-diagnosis-lifecycle.test.ts`.

### 4.1 Lock the command inventory

Create a typed registry/explicit switch for these existing operation families. Exhaustive coverage belongs in the lifecycle replay test:

| Existing operation | Caller semantics | Execution-only data |
|---|---|---|
| submit-recommendation | Validated caller proposal, actor, source revision | Server submission time |
| evaluate-ticket | Task 3 normalized request | Source snapshot, generated recommendation/telemetry |
| add-customer-reply | Ticket, actor, body, source | Server receipt time and generated message/event IDs |
| approve-recommendation | Proposal ID, ticket, actor, expected revision, approved fields/edits | Approval timestamp |
| reject-recommendation / cancel-recommendation-approval / supersede-recommendation | Existing validated caller IDs, actor, feedback/reason | Server transition timestamp |
| mark-response-sent | Ticket, recommendation, actor; HTTP automaticReplyEnabled | Server-selected approved response and send timestamp |
| approve-and-mark-response-sent | Approval intent and caller send options | Generated timestamps |
| record-diagnosis | Ticket/actor for workflow tool; full caller diagnosis for explicit direct-service entrypoint | Server-derived diagnosis/source context for workflow tool |
| review-diagnosis | Exact review decision, IDs, source revisions/watermarks, scope, actor | Review timestamp |
| record-fix / apply-diagnosis-fix | Existing caller IDs, scope, revisions, actor | Server-derived current fix context and timestamp |
| record-fix-ineffective / invalidate-diagnosis | Target IDs, source revision/watermark, reason and actor | Server recording timestamp |
| record-platform-mitigation | Ticket, business eventId, actor, rationale | Recording timestamp |
| close-ticket | Workflow ticket/actor; preserve any explicit caller fields | Server-derived current closure context |

Use actual existing operation names from the service before committing this inventory; do not rename persisted operation strings merely to match a tool label. If two public entrypoints have different semantic input contracts, make their operation identity distinguishable or normalize them identically. Never let the same operation/key accept two incompatible projectors.

### 4.2 Move replay before derived inputs

For each family, reuse Task 3's definition/runner and extract the operational transaction body. Preserve public named methods and current new-command validation; change only their operational execution organization.

Schema-derived defaults belong in intent. Explicit caller watermarks and selected business IDs remain in hashes. Remove server timestamps in that command's projector instead of globally filtering keys.

Add this concrete customer-reply replay regression, then cover the same later-state property in each existing lifecycle family fixture:

```ts
it("replays the original reply audit after later conversation activity", async () => {
  const h = await openReliabilityRuntime();
  const key = randomUUID();
  const input = { actor: "reviewer", body: "The campaign page is blank." };
  const path = "/api/tickets/TKT-1010/customer-replies";
  try {
    const first = await h.post(path, input, key);
    expect(first.status).toBe(201);
    h.advance(60_000);
    const later = await h.post(path, { actor: "reviewer", body: "It is still blank." });
    expect(later.status).toBe(201);
    const replay = await h.post(path, input, key);
    expect(replay.status).toBe(201);
    expect(replay.body.auditEvent).toEqual(first.body.auditEvent);
    const audits = await h.runtime.audits.list("TKT-1010");
    expect(audits.filter(a => a.action === "customer-reply-received")).toHaveLength(2);
  } finally { await h.close(); }
});
```

Use existing real response fields (auditEvent, auditEvents, ticket, recommendation). Add imports for Vitest, randomUUID, and openReliabilityRuntime as in Task 3. For each family, compare the corresponding immutable result and count events for the original key before and after replay.

Never bypass source checks for a new key. Add a changed-explicit-revision/changed-selected-event test for every applicable family.

### 4.3 Persist demo child intent before parent acknowledgement

For mark-response-sent, derive automatic-reply eligibility/body from the parent's pre-send state. Add an optional typed `automaticCustomerReplyIntent` field to the existing result schema, containing either `{ kind: "none" }` or the exact child commandId/ticketId/actor/body/source/receivedAt. Validate the field and parent-derived identity; populate it inside the same parent transaction result.

Do not add a second receipt table. Do not reconstruct an outstanding child from the latest ticket state after restart.

After the parent commit/replay, invoke add-customer-reply with the persisted child intent/key. If it already committed, its receipt replays. An interrupted child resumes using the same bytes. Keep output fields and refreshed lifecycle compatible.

Test: throw immediately after parent commit, advance time/restart, retry original mark-sent; assert one parent event and one child message. Test automaticReplyEnabled=false produces no child, and changing that flag with the original key conflicts.

### 4.4 Close conversion gaps

Run:

```bash
rg -n 'canonicalRequestHash\(|beginCommand\(' src/triage-service.ts src/server.ts src/approval-desk/http.ts
```

Every remaining occurrence must be an explicitly isolated legacy/helper path, not normal operational execution. Direct-service test fixtures must either use v2 caller intent or be marked legacy compatibility tests.

- [ ] Run new lifecycle replay tests plus existing recovery, diagnosis lifecycle, recommendation lifecycle, and server-action suites.
- [ ] Commit: `fix: preserve lifecycle command results across retries`.

## Task 5 — Operational diagnosis source and governed support checks

**Files**

Create `src/knowledge-evolution/completed-diagnosis-source.ts`, `test/operational-knowledge-discovery.test.ts`.
Modify `src/runtime.ts`, `src/knowledge-evolution/service.ts`, `src/errors.ts`, `src/operational/runtime-repositories.ts`, `src/operational/sqlite-store.ts`, and `src/operational/unit-of-work.ts`; reuse `src/approval-desk/diagnosis-review.ts` and existing causal helpers. Extend `test/knowledge-evolution-service.test.ts`.

**Interfaces**

```ts
export interface CompletedDiagnosisSource {
  list(): Promise<CompletedDiagnosis[]>;
}
export interface CompletedDiagnosisReadSnapshot {
  ticket: Ticket;
  audits: readonly AuditEvent[];
  diagnoses: readonly OperationalDiagnosisRecord[];
}
export function eligibleCompletedDiagnoses(
  snapshot: CompletedDiagnosisReadSnapshot,
): CompletedDiagnosis[];
```

Use repository-exported types for those existing domain names. Add `readCompletedDiagnosisSnapshots(): CompletedDiagnosisReadSnapshot[]` to the operational store/reader path. Its single deferred read transaction reads operational snapshots and the associated review/invalidation lifecycleAuditEvents from receipts, constructing the same authoritative audit content used by OperationalAuditRepository. The completed-diagnosis source maps and filters those returned snapshots. Do not combine ticket state from one read with audits from another process's later commit. This method may read the complete diagnosis corpus; R1 does not optimize discovery scans.

### 5.1 Reproduce missing runtime wiring

Reuse Task 3 fixture and the existing sufficient-evidence body from operational-diagnosis-restart.test.ts. Drive evaluate → approve named fields → mark sent (automatic replies disabled) → record diagnosis.

Assert operational records contain the diagnosis, then call the **runtime-created** knowledge service's discover and assert support includes its exact `diagnosis-${auditEvent.id}` identifier. This fails before wiring is repaired.

### 5.2 Derive eligibility with existing authority views

Map diagnosisReviewViews by originalDiagnosis.id, then map OperationalDiagnosisRecord.originalAudit.id into that view. Include only:

- Original action diagnosis-completed.
- Investigation is absent or a working/confirmed diagnosis under existing state vocabulary.
- Review view is not stale and latestReview is not reject.
- No causally later diagnosis-invalidated event references that original audit ID.

Use the existing event-position helpers for the last condition. Do not sort events by wall-clock strings. Do not treat fix-ineffective as diagnosis-invalidated. Preserve all raw history.

A pending review alone does not disqualify an otherwise eligible diagnosis from **advisory** discovery. Do not reinterpret this as approval to apply a fix or promote knowledge.

### 5.3 Wire all consumers and revalidate promotion

Runtime supplies CompletedDiagnosisSource to KnowledgeEvolutionService; operational mode uses the new source, explicit legacy fixture mode uses DiagnosisRepository.list.

Keep any existing runtime.knowledgeEvolution.diagnoses handle needed by legacy fixture code clearly separate from the discovery source, or narrow its public type and update those callers. Never present the legacy handle as the operational truth.

Discovery and drafting use the source. Before promotion, re-read the source and compare against the candidate's supportingDiagnosisIds:

```ts
const eligible = new Set((await diagnoses.list()).map(d => d.id));
if (candidate.supportingDiagnosisIds.some(id => !eligible.has(id))) {
  throw new DomainError(
    "Supporting diagnosis evidence changed. Refresh and review the candidate again.",
    "KNOWLEDGE_SUPPORT_STALE",
  );
}
```

Run this in both initial promotion and replacement-promotion paths before their existing reference checks/commit. Do not change the candidate to remove support. Missing operational data must fail, not trigger a JSON fallback.

### 5.4 Test eligibility and history

Use real operational events to test rejection, invalidation, later diagnosis, explicit staleness, revalidation, and ineffective-fix-only behavior. Assert original diagnosis bytes/history remain unchanged. Test a candidate discovered before invalidation cannot subsequently promote. Assert already-approved versions are not deleted.

- [ ] Run `npx vitest run test/operational-knowledge-discovery.test.ts test/knowledge-evolution-service.test.ts test/operational-diagnosis-restart.test.ts test/knowledge-version-pinning.test.ts --maxWorkers=1`.
- [ ] Commit: `fix: discover knowledge from operational diagnoses`.

## Task 6 — Bounded outbox selection and per-row results

**Files**

Modify `src/operational/unit-of-work.ts`, `src/operational/sqlite-store.ts`, `src/operational/learning-outbox.ts`.
Extend `test/operational-learning-outbox.test.ts`.

**Interfaces produced**

```ts
export interface DueOutboxQuery {
  now: string;
  staleBefore: string;
  limit: number; // runtime validates integer 1..25
  deferredUntil: Readonly<Record<string, string>>;
}
export type OutboxAttemptResult =
  | { id: string; outcome: "delivered" | "duplicate" | "dead-letter" | "not-claimed" }
  | { id: string; outcome: "retryable" };

listDueOutbox(input: DueOutboxQuery): OperationalOutboxRow[];
drainDue(input: DueOutboxQuery): Promise<OutboxAttemptResult[]>;
```

Keep drainPending for existing explicit demo/tests if needed; production runner uses drainDue.

### 6.1 Add starvation and bound tests

Seed 26 valid rows using existing outbox fixture helpers. Back off the oldest row and request a limit of 25. Assert the next 25 are returned and no payload parser sees a 26th result. Test recent claimed rows excluded and expired claims included. Maintain deterministic order by created_at, id.

### 6.2 Filter before loading payloads

Use bound parameters and SQLite JSON support already bundled with better-sqlite3. This avoids dynamic placeholder limits for the runtime-local defer map:

```sql
SELECT o.id, o.operational_event_id, o.delivery_key, o.status,
       o.attempts, o.created_at, o.claimed_by, o.claimed_at,
       o.delivered_at, o.error_code, o.envelope_json
FROM learning_capture_outbox AS o
LEFT JOIN json_each(?) AS delay ON delay.key = o.id
WHERE o.status = 'pending'
  AND (o.claimed_by IS NULL OR o.claimed_at <= ?)
  AND (delay.value IS NULL OR delay.value <= ?)
ORDER BY o.created_at ASC, o.id ASC
LIMIT ?
```

Bind JSON.stringify(deferredUntil), staleBefore, now, limit. Normalize/validate schedule timestamps to UTC ISO strings before comparing. The schedule is process-local advisory state; it does not change ledger hashes or outbox envelopes.

### 6.3 Preserve claim/delivery semantics

Extract one-row delivery from drainPending into a shared worker method. Claim each candidate immediately before delivery using a fresh token and current time. Distinguish terminal validation/event conflicts, duplicate delivery, transient failure, and lost claim.

Return per-row outcomes to the runner. A transient row failure must not stop later due rows. If acknowledgement fails after ledger commit, leave recoverable claim state; do not declare delivered. Existing lease-token ownership checks remain intact.

- [ ] Run `npx vitest run test/operational-learning-outbox.test.ts test/operational-unit-of-work.test.ts --maxWorkers=1`.
- [ ] Commit: `feat: select bounded due learning deliveries`.

## Task 7 — Runtime delivery runner and shutdown

**Files**

Create `src/operational/learning-delivery-runner.ts`, `test/learning-delivery-runner.test.ts`, `test/runtime-learning-delivery.test.ts`.
Modify `src/runtime.ts`, `src/index.ts`, `src/approval-desk.ts`, and every runtime.close caller identified by the audit below.

**Interfaces produced**

```ts
export interface DeliveryScheduler {
  now(): Date;
  schedule(delayMs: number, callback: () => void): { cancel(): void };
}
export interface LearningDeliveryRunner {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

The runner consumes worker.drainDue and a safe error reporter. RuntimeOptions accepts optional scheduler injection for deterministic tests; normal runtime owns the default unref'd timer implementation.

### 7.1 Write fake-time scheduling tests

Use Vitest fake timers and deferred barriers. Assert all of:

- start performs one bounded pass.
- New work is attempted by 2,000ms when idle and healthy.
- Retry delays are exactly 1,000 / 2,000 / 4,000 / 8,000 / 16,000 / 30,000 / 30,000ms.
- A slow pass does not overlap another.
- A backed-off row does not starve a later row.
- A thrown pass error is reported and retried without unhandled rejection.
- stop cancels pending schedules and waits for the current pass.

Pure backoff helper:

```ts
export function retryDelayMs(consecutiveFailures: number): number {
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 1) {
    throw new TypeError("Failure count must be a positive integer.");
  }
  return Math.min(30_000, 1_000 * 2 ** Math.min(consecutiveFailures - 1, 5));
}
```

### 7.2 Implement non-overlapping scheduling

Maintain runningPass, timer handle, stopped flag, stopPromise, and per-row failure/deadline maps. Retryable outcomes increase that row's count; delivered/duplicate/dead-letter clear it. not-claimed removes local defer state and leaves ownership to the durable store.

Schedule the next pass after the previous pass settles. Use the minimum of 1,000ms and the nearest future due deadline, clamped to a positive delay. Do not spin immediately on retryable failures.

start is idempotent. stop sets stopped before awaiting runningPass, cancels the timer, and prevents scheduling in finally. Default scheduling uses setTimeout(...).unref().

Prune expired local defer entries during passes. A restarted process may use the minimum delay; persisted claims still control concurrency.

### 7.3 Integrate runtime lifecycle

Create/start the runner only when both learning delivery and operational outbox access are available. The initial pass is bounded and advisory; runner failure does not tear down valid operational state.

Change RuntimeDependencies.close to Promise<void>:

```ts
let closePromise: Promise<void> | undefined;
function close(): Promise<void> {
  return closePromise ??= (async () => {
    await runner?.stop();
    closeRuntimeResources({ sqliteOperationalStore, ledger, usageLease });
  })();
}
```

Integrate a try/finally cleanup path so resource cleanup is still attempted if stopping unexpectedly fails, preserving both errors where necessary. Cleanup attempts every resource exactly once. Stop the runner before closing databases.

Audit call sites:

```bash
rg -n '\.close\(\)|createRuntimeDependencies' src scripts test
```

Update only RuntimeDependencies.close consumers; better-sqlite3.close stays synchronous. Tests that remove temporary directories must await runtime closure first. Update RuntimeDependencies mocks to return Promise<void>.

For HTTP: stop accepting connections, await server close, await runtime.close. For MCP: await protocol close and runtime.close on transport closure/signals. Remove reliance on async process exit listeners; process exit cannot await cleanup. Keep diagnostics on stderr for MCP.

### 7.4 Test production runtime progress and cleanup

Record a real diagnosis after startup, advance injected scheduler, and read the actual learning ledger. No direct drainPending call is allowed in this proof. Simulate ledger unavailable at startup and assert core ticket mutation succeeds while knowledge remains explicitly unavailable.

Hold an active delivery at a barrier, call close twice, assert stores remain open until release and close exactly once afterward. Restart pending/expired-claim scenarios.

- [ ] Run the runner/runtime-delivery tests plus runtime, entrypoint, approval-desk-entrypoint, demo-reset, and operational-recovery tests.
- [ ] Commit: `feat: deliver learning events during runtime sessions`.

## Task 8 — Frozen UI command attempts and reconciliation

**Files**

Modify `src/approval-desk/ui.ts`, `test/approval-desk-ui.test.ts`, `test/approval-desk-lifecycle-completion.e2e.test.ts`.
Create `test/approval-desk-retry.test.ts`.

No framework or general frontend module migration in this task.

### 8.1 Retain command identity outside requestJson

Add a small helper in the existing script:

```js
function createCommandAttempt(path, body) {
  return Object.freeze({
    path,
    body: JSON.stringify(body),
    key: crypto.randomUUID()
  });
}

function sendCommandAttempt(attempt) {
  return requestJson(attempt.path, {
    method: 'POST',
    headers: { 'Idempotency-Key': attempt.key },
    body: attempt.body
  });
}
```

Keep requestJson honoring explicit keys. The governed action owner creates the attempt once and retains it on uncertain failure. Do not create the attempt inside the retry callback.

Store the action/ticket IDs with the attempt in presentation state. Prevent rapid duplicate gestures. An explicit retry control sends the retained attempt; changed fields do not overwrite it.

### 8.2 Distinguish known failure from uncertain outcome

- Transport failure, malformed response, or post-commit refresh failure: retain attempt; mark reconciliation required.
- Classified 409/400 failure: show code-specific remediation, refresh, and require a deliberate new action where appropriate.
- Successful command response: mark the mutation committed, then refresh current state. If refresh fails, retry the read, not the mutation.
- Successful refresh clears the pending attempt only after current state is reconciled.
- Switching tickets cannot attach the old result or retry state to another ticket.
- Reload discards presentation-only attempts and reads authoritative state; do not silently replay from storage.

No automatic new UUID after a failure. Preserve unsaved edits according to the existing UI contract, but do not submit changed intent while a prior outcome is unresolved.

### 8.3 Add the lost-response regression

In the existing UI execution harness, make fetch call the real backend for the first mutation and then throw before returning its response. Trigger explicit retry and assert captured requests have:

```ts
expect(second.path).toBe(first.path);
expect(second.init.body).toBe(first.init.body);
expect(new Headers(second.init.headers).get("Idempotency-Key"))
  .toBe(new Headers(first.init.headers).get("Idempotency-Key"));
```

Assert one committed operational event/write set, authoritative refresh before action re-enable, no overwrite from a stale ticket-selection response, and read-only retry after a refresh failure.

This is a UI-script/HTTP integration test, not a real-browser claim.

- [ ] Run `npx vitest run test/approval-desk-retry.test.ts test/approval-desk-ui.test.ts test/approval-desk-lifecycle-completion.e2e.test.ts --maxWorkers=1`.
- [ ] Commit: `fix: retain command identity during UI recovery`.

## Task 9 — Integrated reliability proof and release gate

**Files**

Create `test/reliability-knowledge-reuse.test.ts`; extend `test/reliability-command-replay.test.ts`, `test/reliability-lifecycle-replay.test.ts`, `test/runtime-learning-delivery.test.ts`.
Update focused reliability/migration notes in README.md. Do not rewrite the full README.

### 9.1 Complete A2 using production composition

Build an isolated seed with three synthetic tickets using the existing TicketSchema and webhook-signature fixture language from knowledge-evolution-harness.test.ts. Give two tickets the same coherent symptoms/evidence and reserve the third for later reuse. Keep default discovery thresholds.

Drive the first two through normal application actions. When choosing an existing diagnosis context for a direct service test, still record through the real runtime service; do not save JSON diagnoses or directly populate knowledge repositories. At least one path must use HTTP or MCP diagnosis creation.

Discover and inspect supportingDiagnosisIds. Approve using the existing human-review endpoint/service with actor support-lead and an explicit valid evidence policy. The third ticket's normal evaluation must reference the promoted knowledge object/version through listReusableApproved, not an approvedObjects argument manually supplied by the test.

Capture both:
- Before promotion: the object is not reusable.
- After promotion: the object is reusable only when existing evidence/trigger rules allow it.

Restart and repeat the reads. Verify the later recommendation remains pinned to its original promoted version.

### 9.2 Run recovery/compatibility proof

Cover every operation family in Task 4's inventory with a committed replay assertion. Use existing normal closure and failed-fix recovery fixtures for A18. Test parent/child interruption before and after child commit.

After upgrading a v3 database, prove:
- All original history/revision/receipt bytes are preserved.
- Old keys produce explicit legacy errors without provider calls.
- New commands commit as v2 and replay after restart.
- Pending old outbox envelopes still deliver with their original learning hashes.

### 9.3 Run required gates in order

Run each separately and record exact command/result:

```bash
npm run build
npm run typecheck
npx vitest run --dir test --maxWorkers=1
npm run evaluate:lifecycle-replay
npm run evaluate:knowledge-holdout
```

The full suite is the release gate after the focused tests, not a substitute for them. If a focused suite already proves a boundary, do not add redundant mirror tests just to increase the test count.

Inspect the final diff for these concrete risks:

```bash
git diff --check
git diff --stat
rg -n 'beginCommand\(|canonicalRequestHash\(' src
rg -n 'drainPending\(' src
rg -n 'deps\.close\(\)|runtime\.close\(\)' src scripts test
```

Review each search match. Legacy helpers and explicit manual drain tools may remain; normal operational commands and runtime cleanup must satisfy R1. Search output alone is not a pass.

- [ ] Confirm no unexpected schema reset, JSON mirroring, network call inside a transaction, missing await, leaked timer, altered approval gate, or suppressed integrity failure.
- [ ] Record baseline, final commit, schema version, exact tests, known limitations, and deferred queue/UI work.
- [ ] Commit: `test: prove reliability across runtime subsystem boundaries`.
- [ ] Request final code review using the repository's established workflow before integration. Do not merge or publish solely because this plan exists.

## Acceptance coverage ledger

| Spec acceptance | Owning task and test evidence |
|---|---|
| A1 | 5 — operational-knowledge-discovery; runtime/restart visibility |
| A2 | 9 — reliability-knowledge-reuse; production creation/promotion/reuse |
| A3 | 5 — operational-knowledge-discovery and knowledge-evolution-service; eligibility/history |
| A4 | 3 — reliability-command-replay; clock/restart replay |
| A5 | 3 — controlled-provider invocation count |
| A6 | 1, 3, 4 — hash distinction plus real command conflict |
| A7 | 3 — in-flight barriers and joined dispatch |
| A8 | 3 — two runtimes, one database, one committed write set |
| A9 | 3 — changing source during preparation and rollback injection |
| A10 | 3, 4 — lost response, advanced workflow, immutable result |
| A11 | 7 — runtime-learning-delivery without manual drain |
| A12 | 6, 7 — due selection, claims, retries, duplicate/terminal delivery |
| A13 | 7 — close barrier, timers, resource order, repeated close |
| A14 | 7 — unavailable learning with successful operational commands |
| A15 | 2 — classification table and both transport adapters |
| A16 | 1, 2, 9 — physical migration, unchanged old bytes, new receipt behavior |
| A17 | 8 — UI lost response, retained body/key, read reconciliation |
| A18 | 9 — normal closure, failed-fix recovery, knowledge/taxonomy invariants |
| A19 | 4, 9 — all operational families and interrupted child commands |

## Handoff

Read this plan together with the R1 design. Start with Task 1 in an isolated checkout. Keep each task's regression proof and commit separate enough for review.

The most important checkpoints are: **upgraded database preserves history; committed evaluation retry avoids regeneration; operational diagnoses support governed reuse; learning progresses without restart; UI retries preserve intent**.

Do not claim implementation complete from unit tests alone, and do not describe controlled provider runs as live AI validation.
