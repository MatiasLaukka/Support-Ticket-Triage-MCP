import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CustomerReplyWatermark, TicketId } from "../src/domain.js";
import type {
  EvidenceAction,
  EvidenceActionId,
  EvidenceObservation,
  EvidenceObservationId,
  HybridReasoningInput,
  HybridReasoningResult,
  ReasoningRankingExecution,
} from "../src/reasoning/types.js";
import {
  HybridShadowRunIdSchema,
  parseHybridShadowRun,
  type HybridShadowExecutionKey,
  type HybridShadowRun,
  type HybridShadowRunV2,
  type HybridShadowBasis,
} from "../src/reasoning/shadow-run-types.js";
import type { HybridShadowOpportunityId } from "../src/reasoning/hybrid-shadow-capture.js";
import {
  HybridShadowRunStoreError,
  SqliteHybridShadowRunRepository,
} from "../src/reasoning/sqlite-shadow-run-repository.js";
import type { RankingResult } from "../src/retrieval/ranking-types.js";
import type { IndexMetadata, ResourceType } from "../src/retrieval/types.js";
import { buildRetrievalQuery } from "../src/retrieval/stage.js";
import type { EvidenceRequirementId } from "../src/evidence-catalog.js";

const ticketId = "TKT-0101" as TicketId;
const runIds = {
  evaluation: "00000000-0000-4000-8000-000000000001",
  diagnosis: "00000000-0000-4000-8000-000000000002",
  sameTimeA: "00000000-0000-4000-8000-000000000003",
  sameTimeB: "00000000-0000-4000-8000-000000000004",
  otherTicket: "00000000-0000-4000-8000-000000000005",
  failed: "00000000-0000-4000-8000-000000000006",
  replay: "00000000-0000-4000-8000-000000000007",
  conflict: "00000000-0000-4000-8000-000000000008",
  otherProvider: "00000000-0000-4000-8000-000000000009",
  concurrent: "00000000-0000-4000-8000-000000000010",
} as const;

const replyWatermark: CustomerReplyWatermark = {
  state: "reply",
  timestamp: "2026-09-21T11:10:00.000Z",
  id: "00000000-0000-4000-8000-000000000111",
};

const retrievalQuery = buildRetrievalQuery({
  ticket: {
    id: ticketId,
    revision: 7,
    updatedAt: "2026-09-21T11:00:00.000Z",
    subject: "Webhook delivery delayed",
    description: "Delivery attempts arrive late.",
    status: "open",
  } as any,
  customerReplies: [],
  customerReplyWatermark: replyWatermark.id,
  references: [],
});

const retrievalIndex: IndexMetadata = {
  schemaVersion: 2,
  representationVersion: 1,
  generation: 8,
  lexicalGeneration: 8,
  semanticGeneration: 7,
  corpusHash: "corpus-hash-8",
  state: "degraded",
};

const fullBasis: HybridShadowBasis = {
  operationalEventId: "00000000-0000-4000-8000-000000000222",
  eventSequence: 18,
  snapshotThroughSequence: 19,
  ticketRevision: 7,
  customerReplyWatermark: replyWatermark,
  taxonomyRevision: 4,
  retrievalQueryHash: retrievalQuery.queryHash,
};

const roots: string[] = [];
const repositories: SqliteHybridShadowRunRepository[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function openRepository(): { repository: SqliteHybridShadowRunRepository; path: string } {
  const root = mkdtempSync(join(tmpdir(), "hybrid-shadow-run-"));
  roots.push(root);
  const path = join(root, "shadow-runs.sqlite");
  const repository = SqliteHybridShadowRunRepository.open(path);
  repositories.push(repository);
  repository.initialize();
  return { repository, path };
}

function createLegacyV1Database(path: string, run: HybridShadowRun): string {
  const database = new Database(path);
  database.exec(`
    CREATE TABLE hybrid_shadow_runs (
      run_id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('evaluation', 'diagnosis')),
      provider_id TEXT NOT NULL CHECK (length(trim(provider_id)) > 0),
      model_id TEXT NOT NULL CHECK (length(trim(model_id)) > 0),
      status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
      recorded_at TEXT NOT NULL,
      payload_version INTEGER NOT NULL CHECK (payload_version = 1),
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object')
    );
    CREATE INDEX hybrid_shadow_runs_ticket_order_idx
      ON hybrid_shadow_runs(ticket_id, recorded_at, run_id);
    CREATE TRIGGER hybrid_shadow_runs_no_update
      BEFORE UPDATE ON hybrid_shadow_runs
      BEGIN SELECT RAISE(ABORT, 'hybrid shadow runs are immutable'); END;
    CREATE TRIGGER hybrid_shadow_runs_no_delete
      BEFORE DELETE ON hybrid_shadow_runs
      BEGIN SELECT RAISE(ABORT, 'hybrid shadow runs are append-only'); END;
  `);
  const payloadJson = JSON.stringify(run);
  database.prepare(`
    INSERT INTO hybrid_shadow_runs (
      run_id, ticket_id, mode, provider_id, model_id, status, recorded_at,
      payload_version, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    run.runId,
    run.ticketId,
    run.mode,
    run.provider.providerKind,
    run.provider.model,
    run.status,
    run.recordedAt,
    payloadJson,
  );
  database.pragma("user_version = 1");
  database.close();
  return payloadJson;
}

function reasoningInput(
  mode: "evaluation" | "diagnosis",
  basisTicketId: TicketId,
  ranking: ReasoningRankingExecution = { status: "not-requested" },
): HybridReasoningInput {
  return {
    mode,
    basis: {
      ticketId: basisTicketId,
      ticketRevision: 7,
      customerReplyWatermark: structuredClone(replyWatermark),
      retrievalIndex: structuredClone(retrievalIndex),
    },
    observations: [],
    retrievalCandidates: [],
    retrieval: {
      lexical: { status: "used" },
      semantic: { status: "unavailable", reason: "provider-not-configured" },
      referenceDiagnostics: [],
    },
    ranking,
  };
}

function reasoningResult(input: HybridReasoningInput): HybridReasoningResult {
  return {
    mode: input.mode,
    basis: structuredClone(input.basis),
    evidenceRequirements: [],
    hypotheses: [],
    relationships: [],
    actions: [],
  };
}

function rankingResult(): RankingResult {
  const emptyType = (resourceType: ResourceType) => ({
    resourceType,
    poolCount: 0,
    returnedCount: 0,
    omittedCount: 0,
    memberships: [],
  });
  return {
    contractVersion: 1,
    policy: { id: "lexical-only-v1", kind: "lexical-only" },
    tieBreak: "ordinal-resource-key",
    queryBasis: {
      queryHash: fullBasis.retrievalQueryHash,
      ticketId,
      ticketRevision: 7,
      customerReplyWatermark: replyWatermark.state === "reply" ? replyWatermark.id : null,
    },
    inputHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    retrievalIdentity: {
      schemaVersion: retrievalIndex.schemaVersion,
      representationVersion: retrievalIndex.representationVersion,
      generation: retrievalIndex.generation,
      lexicalGeneration: retrievalIndex.lexicalGeneration,
      semanticGeneration: retrievalIndex.semanticGeneration,
      corpusHash: retrievalIndex.corpusHash,
      model: null,
      state: retrievalIndex.state,
    },
    channelSummary: {
      lexical: { status: "used", reason: null, candidateCount: 0 },
      semantic: { status: "unavailable", reason: "provider-not-configured", candidateCount: 0, partial: false },
      contributingChannels: [],
      partialSemanticCoverage: false,
    },
    byType: {
      "knowledge-article": emptyType("knowledge-article"),
      "known-cause": emptyType("known-cause"),
      "diagnostic-playbook": emptyType("diagnostic-playbook"),
      "resolved-ticket": emptyType("resolved-ticket"),
    },
    references: [],
    referenceDiagnostics: [],
    candidates: [],
  };
}

function completedRun(
  runId: string = runIds.evaluation,
  options: { ticketId?: TicketId; mode?: "evaluation" | "diagnosis"; recordedAt?: string; ranking?: ReasoningRankingExecution } = {},
): Extract<HybridShadowRun, { status: "completed" }> {
  const mode = options.mode ?? "evaluation";
  const runTicketId = options.ticketId ?? ticketId;
  const input = reasoningInput(mode, runTicketId, options.ranking);
  return {
    runId: HybridShadowRunIdSchema.parse(runId),
    ticketId: runTicketId,
    mode,
    provider: { providerKind: "openai-responses", model: "gpt-5.6-luna" },
    status: "completed",
    recordedAt: options.recordedAt ?? "2026-09-21T11:16:00.000Z",
    basis: structuredClone(fullBasis),
    input,
    result: reasoningResult(input),
  };
}

function completedRunWithOpportunity(
  runId: string = runIds.evaluation,
  options: {
    recordedAt?: string;
    opportunityId?: string;
    executionKey?: string;
    provider?: HybridShadowRunV2["provider"];
  } = {},
): Extract<HybridShadowRunV2, { status: "completed" }> {
  const base = completedRun(runId, { recordedAt: options.recordedAt });
  return {
    ...base,
    provider: options.provider ?? base.provider,
    opportunityId: (options.opportunityId ?? (
      "hybrid-shadow-opportunity:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    )) as HybridShadowOpportunityId,
    executionKey: (options.executionKey
      ?? "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") as HybridShadowExecutionKey,
  };
}

function failedRun(): HybridShadowRun {
  const input = reasoningInput("diagnosis", ticketId, { status: "failed", durationMs: 12 });
  return {
    runId: HybridShadowRunIdSchema.parse(runIds.failed),
    ticketId,
    mode: "diagnosis",
    provider: { providerKind: "openai-responses", model: "gpt-5.6-luna" },
    status: "failed",
    recordedAt: "2026-09-21T11:17:00.000Z",
    basis: structuredClone(fullBasis),
    input,
    failure: { code: "REASONING_FAILED", message: "The reasoning attempt failed." },
  };
}

describe("SQLite hybrid shadow-run persistence", () => {
  it("round-trips a completed evaluation run with the complete basis and provider", () => {
    const { repository, path } = openRepository();
    const run = completedRun();

    repository.recordShadowRun(run);

    expect(repository.getShadowRun(run.runId)).toEqual(run);
    expect(repository.listShadowRunsForTicket(ticketId)).toEqual([run]);
    expect(run.basis).toMatchObject({
      operationalEventId: "00000000-0000-4000-8000-000000000222",
      eventSequence: 18,
      snapshotThroughSequence: 19,
      ticketRevision: 7,
      customerReplyWatermark: replyWatermark,
      taxonomyRevision: 4,
      retrievalQueryHash: retrievalQuery.queryHash,
    });
    expect(run.input.basis.retrievalIndex).toEqual(retrievalIndex);
    expect(run.provider).toEqual({ providerKind: "openai-responses", model: "gpt-5.6-luna" });

    repository.close();
    const reopened = SqliteHybridShadowRunRepository.open(path);
    reopened.initialize();
    repositories.push(reopened);
    expect(reopened.getShadowRun(run.runId)).toEqual(run);
    const inspector = new Database(path, { readonly: true });
    try {
        expect(inspector.pragma("user_version", { simple: true })).toBe(2);
    } finally {
      inspector.close();
    }
  });

  it("migrates v1 payloads without inventing opportunity or execution identities", () => {
    const root = mkdtempSync(join(tmpdir(), "hybrid-shadow-run-v1-migration-"));
    roots.push(root);
    const path = join(root, "shadow-runs.sqlite");
    const legacy = completedRun();
    const legacyPayloadJson = createLegacyV1Database(path, legacy);

    const repository = SqliteHybridShadowRunRepository.open(path);
    repositories.push(repository);
    repository.initialize();

    expect(repository.getShadowRun(legacy.runId)).toEqual(legacy);
    expect(repository.getShadowRun(legacy.runId)).not.toHaveProperty("opportunityId");
    expect(repository.getShadowRun(legacy.runId)).not.toHaveProperty("executionKey");
    const inspector = new Database(path, { readonly: true });
    try {
      expect(inspector.pragma("user_version", { simple: true })).toBe(2);
      expect(inspector.prepare(`
        SELECT payload_version, opportunity_id, execution_key, payload_json
        FROM hybrid_shadow_runs WHERE run_id = ?
      `).get(legacy.runId)).toEqual({
        payload_version: 1,
        opportunity_id: null,
        execution_key: null,
        payload_json: legacyPayloadJson,
      });
    } finally {
      inspector.close();
    }
  });

  it("round-trips a v2 run with its H4b opportunity and execution identities", () => {
    const { repository, path } = openRepository();
    const run = completedRunWithOpportunity();

    repository.recordShadowRun(run);

    expect(repository.getShadowRun(run.runId)).toEqual(run);
    expect(repository.listShadowRunsForOpportunity(run.opportunityId)).toEqual([run]);
    const inspector = new Database(path, { readonly: true });
    try {
      expect(inspector.prepare(`
        SELECT payload_version, opportunity_id, execution_key
        FROM hybrid_shadow_runs WHERE run_id = ?
      `).get(run.runId)).toEqual({
        payload_version: 2,
        opportunity_id: run.opportunityId,
        execution_key: run.executionKey,
      });
    } finally {
      inspector.close();
    }
  });

  it("records a new v2 execution and returns its stored run", () => {
    const { repository } = openRepository();
    const run = completedRunWithOpportunity();

    expect(repository.recordOrReplayShadowRun(run)).toEqual({ outcome: "recorded", run });
    expect(repository.getShadowRun(run.runId)).toEqual(run);
  });

  it("replays an exact semantic execution while ignoring only run ID and recorded time", () => {
    const { repository } = openRepository();
    const original = completedRunWithOpportunity();
    const retry = completedRunWithOpportunity(runIds.replay, { recordedAt: "2026-09-24T12:00:00.000Z" });
    repository.recordOrReplayShadowRun(original);

    expect(repository.recordOrReplayShadowRun(retry)).toEqual({ outcome: "replayed", run: original });
    expect(repository.listShadowRunsForOpportunity(original.opportunityId)).toEqual([original]);
  });

  it("rejects different semantic payload reuse of an execution key", () => {
    const { repository } = openRepository();
    const original = completedRunWithOpportunity();
    const conflicting = completedRunWithOpportunity(runIds.conflict, {
      recordedAt: "2026-09-24T12:00:00.000Z",
    });
    conflicting.result.hypotheses = [{ id: "different", statement: "Different result.", rank: 1 }];
    repository.recordOrReplayShadowRun(original);

    expect(() => repository.recordOrReplayShadowRun(conflicting)).toThrowError(
      expect.objectContaining({ code: "EXECUTION_KEY_CONFLICT" }),
    );
    expect(repository.listShadowRunsForOpportunity(original.opportunityId)).toEqual([original]);
  });

  it("resolves duplicate insert attempts from separate connections through the unique key", async () => {
    const first = openRepository();
    const second = SqliteHybridShadowRunRepository.open(first.path);
    repositories.push(second);
    second.initialize();
    const original = completedRunWithOpportunity(runIds.concurrent);
    const retry = completedRunWithOpportunity(runIds.replay, { recordedAt: "2026-09-24T12:00:00.000Z" });

    const results = await Promise.all([
      Promise.resolve().then(() => first.repository.recordOrReplayShadowRun(original)),
      Promise.resolve().then(() => second.recordOrReplayShadowRun(retry)),
    ]);

    expect(results.map(({ outcome }) => outcome).sort()).toEqual(["recorded", "replayed"]);
    expect(first.repository.listShadowRunsForOpportunity(original.opportunityId)).toHaveLength(1);
  });

  it("stores distinct provider executions under one opportunity", () => {
    const { repository } = openRepository();
    const luna = completedRunWithOpportunity(runIds.evaluation);
    const qwen = completedRunWithOpportunity(runIds.otherProvider, {
      provider: { providerKind: "controlled-test", model: "Qwen fake" },
      executionKey: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });

    repository.recordOrReplayShadowRun(luna);
    repository.recordOrReplayShadowRun(qwen);

    expect(repository.listShadowRunsForOpportunity(luna.opportunityId).map(({ provider }) => provider)).toEqual([
      luna.provider,
      qwen.provider,
    ]);
  });

  it("rejects a database schema version newer than the repository supports", () => {
    const root = mkdtempSync(join(tmpdir(), "hybrid-shadow-run-future-schema-"));
    roots.push(root);
    const path = join(root, "shadow-runs.sqlite");
    const newerDatabase = new Database(path);
    newerDatabase.pragma("user_version = 3");
    newerDatabase.close();
    const repository = SqliteHybridShadowRunRepository.open(path);
    repositories.push(repository);

    expect(() => repository.initialize()).toThrowError(
      expect.objectContaining({ code: "SCHEMA_ERROR" }),
    );
  });

  it("serializes equivalent snapshots deterministically regardless of object key insertion order", () => {
    const first = openRepository();
    const second = openRepository();
    const firstRun = completedRun();
    const originalSecondRun = completedRun();
    const secondRun = {
      result: originalSecondRun.result,
      input: originalSecondRun.input,
      basis: originalSecondRun.basis,
      recordedAt: originalSecondRun.recordedAt,
      status: originalSecondRun.status,
      provider: originalSecondRun.provider,
      mode: originalSecondRun.mode,
      ticketId: originalSecondRun.ticketId,
      runId: originalSecondRun.runId,
    } satisfies HybridShadowRun;
    first.repository.recordShadowRun(firstRun);
    second.repository.recordShadowRun(secondRun);

    const readPayload = (path: string): string => {
      const database = new Database(path, { readonly: true });
      try {
        return (database.prepare("SELECT payload_json FROM hybrid_shadow_runs").get() as {
          payload_json: string;
        }).payload_json;
      } finally {
        database.close();
      }
    };

    expect(readPayload(first.path)).toBe(readPayload(second.path));
  });

  it("round-trips diagnosis mode distinctly from evaluation mode", () => {
    const { repository } = openRepository();
    const diagnosis = completedRun(runIds.diagnosis, { mode: "diagnosis" });

    repository.recordShadowRun(diagnosis);

    expect(repository.getShadowRun(diagnosis.runId)).toMatchObject({
      mode: "diagnosis",
      input: { mode: "diagnosis" },
      result: { mode: "diagnosis" },
    });
  });

  it.each([
    { status: "succeeded", ranking: { status: "succeeded", result: rankingResult(), durationMs: 3 } },
    { status: "not-requested", ranking: { status: "not-requested" } },
    { status: "failed", ranking: { status: "failed", durationMs: 5 } },
  ] satisfies Array<{ status: string; ranking: ReasoningRankingExecution }>) (
    "preserves ranking status $status separately from run status",
    ({ ranking }) => {
    const { repository } = openRepository();
    const run = completedRun(runIds.evaluation, { ranking });

    repository.recordShadowRun(run);

    expect(repository.getShadowRun(run.runId)?.input.ranking).toEqual(ranking);
    expect(repository.getShadowRun(run.runId)?.basis.retrievalQueryHash)
      .toBe(retrievalQuery.queryHash);
    expect(repository.getShadowRun(run.runId)?.status).toBe("completed");
    },
  );

  it("stores reasoning failure information without a fabricated result", () => {
    const { repository } = openRepository();
    const run = failedRun();

    repository.recordShadowRun(run);

    expect(repository.getShadowRun(run.runId)).toEqual(run);
    expect(repository.getShadowRun(run.runId)).not.toHaveProperty("result");
    expect(repository.getShadowRun(run.runId)?.input.ranking).toEqual({ status: "failed", durationMs: 12 });
  });

  it("round-trips separate observation identities and their provenance", () => {
    const { repository } = openRepository();
    const run = completedRun();
    run.input.observations = [
      {
        id: "observation-ticket" as EvidenceObservationId,
        fact: "The ticket reports a delivery delay.",
        provenance: { sourceType: "ticket", sourceId: "ticket-body", sourceRevision: 7 },
        observedAt: "2026-09-21T11:10:00.000Z",
      },
      {
        id: "observation-reply" as EvidenceObservationId,
        fact: "The customer confirmed the delay is ongoing.",
        provenance: {
          sourceType: "customer-reply",
          sourceId: replyWatermark.id,
          sourceRevision: "reply-revision-1",
        },
        validAt: "2026-09-21T11:10:00.000Z",
        freshnessPolicy: "current-customer-reply",
      },
    ];

    repository.recordShadowRun(run);

    expect(repository.getShadowRun(run.runId)?.input.observations).toEqual(run.input.observations);
    expect(repository.getShadowRun(run.runId)?.input.observations.map(({ id }) => id)).toEqual([
      "observation-ticket",
      "observation-reply",
    ]);
  });

  it("rejects duplicate run identities without overwriting the original snapshot", () => {
    const { repository } = openRepository();
    const original = completedRun();
    repository.recordShadowRun(original);
    const collision = completedRun(original.runId, { recordedAt: "2026-09-21T12:00:00.000Z" });

    expect(() => repository.recordShadowRun(collision)).toThrowError(
      expect.objectContaining({ code: "RUN_ID_CONFLICT" }),
    );
    expect(repository.getShadowRun(original.runId)).toEqual(original);
  });

  it("applies execution-key replay and conflict handling to v2 writes through recordShadowRun", () => {
    const { repository } = openRepository();
    const original = completedRunWithOpportunity();
    expect(repository.recordShadowRun(original)).toEqual({ outcome: "recorded", run: original });
    const replay = {
      ...structuredClone(original),
      runId: HybridShadowRunIdSchema.parse(runIds.replay),
      recordedAt: "2026-09-21T11:18:00.000Z",
    };

    expect(repository.recordShadowRun(replay)).toEqual({ outcome: "replayed", run: original });
    expect(repository.listShadowRunsForOpportunity(original.opportunityId)).toEqual([original]);

    const conflict = {
      ...structuredClone(replay),
      runId: HybridShadowRunIdSchema.parse(runIds.conflict),
      provider: { ...replay.provider, model: "different-model" },
    };
    expect(() => repository.recordShadowRun(conflict)).toThrowError(
      expect.objectContaining({ code: "EXECUTION_KEY_CONFLICT" }),
    );
  });

  it.each([
    ["non-unique", "CREATE INDEX hybrid_shadow_runs_execution_key_unique_idx ON hybrid_shadow_runs(execution_key)"],
    ["wrong-column", "CREATE UNIQUE INDEX hybrid_shadow_runs_execution_key_unique_idx ON hybrid_shadow_runs(opportunity_id) WHERE opportunity_id IS NOT NULL"],
    ["wrong-predicate", "CREATE UNIQUE INDEX hybrid_shadow_runs_execution_key_unique_idx ON hybrid_shadow_runs(execution_key) WHERE status = 'completed'"],
  ])("rejects a same-named execution-key index with a $0 definition", (_kind, definition) => {
    const { repository, path } = openRepository();
    repository.close();
    const tamper = new Database(path);
    try {
      tamper.exec(`DROP INDEX hybrid_shadow_runs_execution_key_unique_idx; ${definition};`);
    } finally {
      tamper.close();
    }

    const reopened = SqliteHybridShadowRunRepository.open(path);
    repositories.push(reopened);
    expect(() => reopened.initialize()).toThrowError(
      expect.objectContaining({ code: "SCHEMA_ERROR" }),
    );
  });

  it("normalizes execution-key read locks as persistence errors", () => {
    const { repository, path } = openRepository();
    const run = completedRunWithOpportunity();
    repository.recordOrReplayShadowRun(run);
    const lock = new Database(path);
    try {
      lock.exec("BEGIN EXCLUSIVE");
      expect(() => repository.getShadowRunByExecutionKey(run.executionKey)).toThrowError(
        expect.objectContaining({ code: "PERSISTENCE_ERROR" }),
      );
    } finally {
      if (lock.inTransaction) lock.exec("ROLLBACK");
      lock.close();
    }
  });

  it("normalizes schema initialization locks as persistence errors", () => {
    const root = mkdtempSync(join(tmpdir(), "hybrid-shadow-run-v1-lock-"));
    roots.push(root);
    const path = join(root, "shadow-runs.sqlite");
    createLegacyV1Database(path, completedRun());
    const lock = new Database(path);
    lock.exec("BEGIN EXCLUSIVE");
    const repository = SqliteHybridShadowRunRepository.open(path);
    repositories.push(repository);
    try {
      expect(() => repository.initialize()).toThrowError(
        expect.objectContaining({ code: "PERSISTENCE_ERROR" }),
      );
    } finally {
      if (lock.inTransaction) lock.exec("ROLLBACK");
      lock.close();
    }
  });

  it("lists a ticket's runs in stable recorded-time and run-ID order and isolates other tickets", () => {
    const { repository } = openRepository();
    const sameTimeB = completedRun(runIds.sameTimeB, { recordedAt: "2026-09-21T11:16:00.000Z" });
    const sameTimeA = completedRun(runIds.sameTimeA, { recordedAt: "2026-09-21T11:16:00.000Z" });
    const earlier = completedRun(runIds.diagnosis, { recordedAt: "2026-09-21T11:14:00.000Z" });
    const otherTicket = completedRun(runIds.otherTicket, { ticketId: "TKT-0102" as TicketId });
    for (const run of [sameTimeB, otherTicket, sameTimeA, earlier]) repository.recordShadowRun(run);

    expect(repository.listShadowRunsForTicket(ticketId).map(({ runId }) => runId)).toEqual([
      earlier.runId,
      sameTimeA.runId,
      sameTimeB.runId,
    ]);
    expect(repository.listShadowRunsForTicket("TKT-0102" as TicketId)).toEqual([otherTicket]);
  });

  it("does not mutate the supplied run or expose stored state through returned objects", () => {
    const { repository } = openRepository();
    const run = completedRun();
    const before = structuredClone(run);

    repository.recordShadowRun(run);
    const firstRead = repository.getShadowRun(run.runId)!;
    firstRead.input.basis.retrievalIndex.corpusHash = "changed-by-caller";

    expect(run).toEqual(before);
    expect(repository.getShadowRun(run.runId)).toEqual(before);
  });

  it("rejects a malformed stored payload with a classified payload error", () => {
    const { repository, path } = openRepository();
    const run = completedRun();
    repository.recordShadowRun(run);

    const tamper = new Database(path);
    try {
      tamper.exec("DROP TRIGGER hybrid_shadow_runs_no_update");
      tamper.prepare("UPDATE hybrid_shadow_runs SET payload_json = ? WHERE run_id = ?")
        .run("{}", run.runId);
    } finally {
      tamper.close();
    }

    expect(() => repository.getShadowRun(run.runId)).toThrowError(
      expect.objectContaining({ code: "RUN_PAYLOAD_ERROR" }),
    );
  });

  it("rejects a stored payload version the repository does not understand", () => {
    const { repository, path } = openRepository();
    const run = completedRun();
    repository.recordShadowRun(run);

    const tamper = new Database(path);
    try {
      tamper.pragma("ignore_check_constraints = ON");
      tamper.exec("DROP TRIGGER hybrid_shadow_runs_no_update");
      tamper.prepare("UPDATE hybrid_shadow_runs SET payload_version = 99 WHERE run_id = ?")
        .run(run.runId);
    } finally {
      tamper.close();
    }

    expect(() => repository.getShadowRun(run.runId)).toThrowError(
      expect.objectContaining({ code: "RUN_PAYLOAD_ERROR" }),
    );
  });

  it("rolls back an insertion rejected after its row was written", () => {
    const { repository, path } = openRepository();
    const run = completedRun();
    const rejectInsert = new Database(path);
    try {
      rejectInsert.exec(`
        CREATE TABLE shadow_insert_probe(run_id TEXT NOT NULL);
        CREATE TRIGGER reject_hybrid_shadow_run
        AFTER INSERT ON hybrid_shadow_runs
        BEGIN
          INSERT INTO shadow_insert_probe(run_id) VALUES (NEW.run_id);
          SELECT RAISE(ABORT, 'test rollback');
        END;
      `);
    } finally {
      rejectInsert.close();
    }

    expect(() => repository.recordShadowRun(run)).toThrowError(HybridShadowRunStoreError);
    expect(repository.getShadowRun(run.runId)).toBeUndefined();
    const inspector = new Database(path, { readonly: true });
    try {
      expect(inspector.prepare("SELECT COUNT(*) AS count FROM shadow_insert_probe").get())
        .toEqual({ count: 0 });
    } finally {
      inspector.close();
    }
  });

  it("enforces append-only rows at the SQLite boundary", () => {
    const { repository, path } = openRepository();
    const run = completedRun();
    repository.recordShadowRun(run);
    const tamper = new Database(path);
    try {
      expect(() => tamper.prepare("UPDATE hybrid_shadow_runs SET recorded_at = ? WHERE run_id = ?")
        .run("2026-09-22T00:00:00.000Z", run.runId)).toThrow();
      expect(() => tamper.prepare("DELETE FROM hybrid_shadow_runs WHERE run_id = ?")
        .run(run.runId)).toThrow();
    } finally {
      tamper.close();
    }
    expect(repository.getShadowRun(run.runId)).toEqual(run);
  });

  it("rejects undeclared semantic payload extensions", () => {
    const run = completedRun();
    const invalid = structuredClone(run) as unknown as Record<string, unknown>;
    (invalid.input as Record<string, unknown>).extension = { futureMeaning: "unversioned" };

    expect(() => parseHybridShadowRun(invalid)).toThrow();
  });

  it("preserves legacy H4a trigger-only snapshots as-of their trigger sequence", () => {
    const legacy = structuredClone(completedRun()) as unknown as Record<string, unknown>;
    const basis = legacy.basis as Record<string, unknown>;
    delete basis.snapshotThroughSequence;

    expect(parseHybridShadowRun(legacy).basis.snapshotThroughSequence).toBe(fullBasis.eventSequence);
  });

  it("rejects malformed nested retrieval candidates", () => {
    const run = completedRun();
    const invalid = structuredClone(run) as unknown as Record<string, unknown>;
    const input = invalid.input as Record<string, unknown>;
    input.retrievalCandidates = [{
      resourceKey: "knowledge-article:bad-candidate",
      resourceType: "knowledge-article",
      lexical: { bestRank: "first", bestBm25Score: 0, matches: [] },
      deterministicReferences: [],
      knownCauseReferences: [],
    }];

    expect(() => parseHybridShadowRun(invalid)).toThrow();
  });

  it("rejects malformed successful ranking payloads", () => {
    const run = completedRun(runIds.evaluation, {
      ranking: { status: "succeeded", result: rankingResult(), durationMs: 3 },
    });
    const invalid = structuredClone(run) as unknown as Record<string, unknown>;
    const input = invalid.input as Record<string, unknown>;
    const ranking = input.ranking as Record<string, unknown>;
    const result = ranking.result as Record<string, unknown>;
    result.candidates = [{
      resourceKey: "knowledge-article:bad-ranking-candidate",
      resourceType: "knowledge-article",
      lexical: { bestRank: 1 },
      deterministicReferences: [],
      knownCauseReferences: [],
    }];

    expect(() => parseHybridShadowRun(invalid)).toThrow();
  });

  it("rejects ranking query identity that differs from the stored retrieval query", () => {
    const run = completedRun(runIds.evaluation, {
      ranking: { status: "succeeded", result: rankingResult(), durationMs: 3 },
    });
    const invalid = structuredClone(run) as unknown as Record<string, unknown>;
    const input = invalid.input as Record<string, unknown>;
    const ranking = input.ranking as Record<string, unknown>;
    const result = ranking.result as Record<string, unknown>;
    const queryBasis = result.queryBasis as Record<string, unknown>;
    queryBasis.queryHash = "different-retrieval-query";

    expect(() => parseHybridShadowRun(invalid)).toThrow();
  });

  it("rejects dangling hypothesis evidence requirements", () => {
    const run = completedRun();
    run.result.hypotheses = [{
      id: "hypothesis-1",
      statement: "A test hypothesis.",
      rank: 1,
      evidenceRequirementIds: ["delivery-id" as EvidenceRequirementId],
    }];

    expect(() => parseHybridShadowRun(run)).toThrow();
  });

  it("rejects relationships that reference observations absent from the reasoning input", () => {
    const run = completedRun();
    run.result.hypotheses = [{ id: "hypothesis-1", statement: "A test hypothesis.", rank: 1 }];
    run.result.relationships = [{
      hypothesisId: "hypothesis-1",
      evidenceId: "observation-missing" as EvidenceObservationId,
      relationship: "supports",
    }];

    expect(() => parseHybridShadowRun(run)).toThrow();
  });

  it("rejects evidence actions that reference absent requirements", () => {
    const run = completedRun();
    run.result.hypotheses = [{ id: "hypothesis-1", statement: "A test hypothesis.", rank: 1 }];
    run.result.actions = [{
      id: "action-1" as EvidenceActionId,
      description: "Collect more evidence.",
      hypothesisIds: ["hypothesis-1"],
      requirementIds: ["delivery-id" as EvidenceRequirementId],
    }];

    expect(() => parseHybridShadowRun(run)).toThrow();
  });

  it("rejects evidence actions that reference absent hypotheses", () => {
    const run = completedRun();
    run.result.actions = [{
      id: "action-1" as EvidenceActionId,
      description: "Collect more evidence.",
      hypothesisIds: ["hypothesis-missing"],
    }];

    expect(() => parseHybridShadowRun(run)).toThrow();
  });

  it.each([
    ["observation", (run: Extract<HybridShadowRun, { status: "completed" }>) => {
      const observation: EvidenceObservation = {
        id: "observation-1" as EvidenceObservationId,
        fact: "The delivery was delayed.",
        provenance: { sourceType: "ticket", sourceId: "ticket-body" },
      };
      run.input.observations = [observation, structuredClone(observation)];
    }],
    ["requirement", (run: Extract<HybridShadowRun, { status: "completed" }>) => {
      const requirement = {
        id: "delivery-id" as EvidenceRequirementId,
        label: "Delivery ID",
        customerQuestion: "Delivery ID",
        aliases: ["delivery"],
        source: "knowledge" as const,
      };
      run.result.evidenceRequirements = [requirement, structuredClone(requirement)];
    }],
    ["hypothesis", (run: Extract<HybridShadowRun, { status: "completed" }>) => {
      const hypothesis = { id: "hypothesis-1", statement: "A test hypothesis.", rank: 1 };
      run.result.hypotheses = [hypothesis, structuredClone(hypothesis)];
    }],
    ["action", (run: Extract<HybridShadowRun, { status: "completed" }>) => {
      const action: EvidenceAction = {
        id: "action-1" as EvidenceActionId,
        description: "Collect more evidence.",
        hypothesisIds: ["hypothesis-1"],
      };
      run.result.hypotheses = [{ id: "hypothesis-1", statement: "A test hypothesis.", rank: 1 }];
      run.result.actions = [action, structuredClone(action)];
    }],
  ] as const)("rejects duplicate %s identities", (_label, mutate) => {
    const run = completedRun();
    mutate(run);

    expect(() => parseHybridShadowRun(run)).toThrow();
  });
});
