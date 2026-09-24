import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CustomerReplyWatermark, TicketId } from "../src/domain.js";
import type {
  HybridReasoningInput,
  HybridReasoningResult,
  ReasoningRankingExecution,
} from "../src/reasoning/types.js";
import {
  HybridShadowRunIdSchema,
  type HybridShadowRun,
  type HybridShadowBasis,
} from "../src/reasoning/shadow-run-types.js";
import {
  HybridShadowRunStoreError,
  SqliteHybridShadowRunRepository,
} from "../src/reasoning/sqlite-shadow-run-repository.js";
import type { RankingResult } from "../src/retrieval/ranking-types.js";
import type { IndexMetadata, ResourceType } from "../src/retrieval/types.js";

const ticketId = "TKT-0101" as TicketId;
const runIds = {
  evaluation: "00000000-0000-4000-8000-000000000001",
  diagnosis: "00000000-0000-4000-8000-000000000002",
  sameTimeA: "00000000-0000-4000-8000-000000000003",
  sameTimeB: "00000000-0000-4000-8000-000000000004",
  otherTicket: "00000000-0000-4000-8000-000000000005",
  failed: "00000000-0000-4000-8000-000000000006",
} as const;

const replyWatermark: CustomerReplyWatermark = {
  state: "reply",
  timestamp: "2026-09-21T11:10:00.000Z",
  id: "00000000-0000-4000-8000-000000000111",
};

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
  ticketRevision: 7,
  customerReplyWatermark: replyWatermark,
  taxonomyRevision: 4,
  retrievalInputHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as HybridShadowBasis["retrievalInputHash"],
  knowledgeAsOf: "2026-09-21T11:15:00.000Z",
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
      queryHash: "query-hash-1",
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
): HybridShadowRun {
  const mode = options.mode ?? "evaluation";
  const runTicketId = options.ticketId ?? ticketId;
  const input = reasoningInput(mode, runTicketId, options.ranking);
  return {
    runId: HybridShadowRunIdSchema.parse(runId),
    ticketId: runTicketId,
    mode,
    provider: { providerId: "example-provider", modelId: "example-model" },
    status: "completed",
    recordedAt: options.recordedAt ?? "2026-09-21T11:16:00.000Z",
    basis: structuredClone(fullBasis),
    input,
    result: reasoningResult(input),
  };
}

function failedRun(): HybridShadowRun {
  const input = reasoningInput("diagnosis", ticketId, { status: "failed", durationMs: 12 });
  return {
    runId: HybridShadowRunIdSchema.parse(runIds.failed),
    ticketId,
    mode: "diagnosis",
    provider: { providerId: "example-provider", modelId: "example-model" },
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

    repository.close();
    const reopened = SqliteHybridShadowRunRepository.open(path);
    reopened.initialize();
    repositories.push(reopened);
    expect(reopened.getShadowRun(run.runId)).toEqual(run);
    const inspector = new Database(path, { readonly: true });
    try {
      expect(inspector.pragma("user_version", { simple: true })).toBe(1);
    } finally {
      inspector.close();
    }
  });

  it("rejects a database schema version newer than the repository supports", () => {
    const root = mkdtempSync(join(tmpdir(), "hybrid-shadow-run-future-schema-"));
    roots.push(root);
    const path = join(root, "shadow-runs.sqlite");
    const newerDatabase = new Database(path);
    newerDatabase.pragma("user_version = 2");
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
    const secondRun = completedRun();
    Object.assign(firstRun.input, { extension: { z: 2, a: { y: true, b: false } } });
    Object.assign(secondRun.input, { extension: { a: { b: false, y: true }, z: 2 } });
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
});
