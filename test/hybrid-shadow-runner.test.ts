import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IsoTimestampSchema, TicketSchema, type CustomerReplyWatermark } from "../src/domain.js";
import type { CustomerReply } from "../src/approval-desk/ai-evaluation.js";
import type { OperationalEvent, OperationalWorkflowSnapshot } from "../src/operational/domain.js";
import {
  assembleHybridShadowCaptureContext,
  type HybridShadowCaptureContext,
} from "../src/reasoning/hybrid-shadow-capture.js";
import { assembleHybridReasoningInput } from "../src/reasoning/input-assembler.js";
import {
  HYBRID_REASONING_PROVIDER_CONTRACT_VERSION,
  HybridReasoningProviderError,
  runHybridShadowOpportunity,
  type DeepReadonly,
  type HybridReasoningProvider,
} from "../src/reasoning/hybrid-shadow-runner.js";
import {
  HybridShadowRunIdSchema,
  type ReasoningProviderIdentity,
  type HybridShadowRunV2,
} from "../src/reasoning/shadow-run-types.js";
import type {
  EvidenceObservationId,
  HybridReasoningInput,
  HybridReasoningResult,
} from "../src/reasoning/types.js";
import {
  HybridShadowRunStoreError,
  type HybridShadowRunRecordResult,
  SqliteHybridShadowRunRepository,
} from "../src/reasoning/sqlite-shadow-run-repository.js";
import { deterministicRetrievalReferences } from "../src/retrieval/deterministic-references.js";
import type { RetrievalExecution } from "../src/retrieval/execution.js";
import { buildRetrievalQuery } from "../src/retrieval/stage.js";
import type { IndexMetadata, RetrievalResult } from "../src/retrieval/types.js";

const runIds = {
  success: "20000000-0000-4000-8000-000000000001",
  failure: "20000000-0000-4000-8000-000000000002",
  malformed: "20000000-0000-4000-8000-000000000003",
  replay: "20000000-0000-4000-8000-000000000004",
  secondProvider: "20000000-0000-4000-8000-000000000005",
  changedOpportunity: "20000000-0000-4000-8000-000000000006",
  concurrentA: "20000000-0000-4000-8000-000000000007",
  concurrentB: "20000000-0000-4000-8000-000000000008",
  unavailable: "20000000-0000-4000-8000-000000000009",
  persistFailure: "20000000-0000-4000-8000-000000000010",
  diagnosis: "20000000-0000-4000-8000-000000000011",
} as const;

const timestamps = {
  initial: "2026-09-24T13:00:00.000Z",
  retry: "2026-09-25T13:00:00.000Z",
  other: "2026-09-26T13:00:00.000Z",
} as const;

const rootDirectories: string[] = [];
const repositories: SqliteHybridShadowRunRepository[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
  for (const root of rootDirectories.splice(0)) rmSync(root, { recursive: true, force: true });
});

function openRepository(): { repository: SqliteHybridShadowRunRepository; path: string } {
  const root = mkdtempSync(join(tmpdir(), "hybrid-shadow-runner-"));
  rootDirectories.push(root);
  const path = join(root, "shadow-runs.sqlite");
  const repository = SqliteHybridShadowRunRepository.open(path);
  repositories.push(repository);
  repository.initialize();
  return { repository, path };
}

function context(mode: "evaluation" | "diagnosis" = "evaluation", generation = 8): HybridShadowCaptureContext {
  const ticket = TicketSchema.parse({
    id: "TKT-0101",
    createdAt: "2026-09-21T11:00:00.000Z",
    updatedAt: "2026-09-21T11:00:00.000Z",
    customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
    subject: "Webhook delivery is delayed",
    description: "Delivery attempts arrive late.",
    status: "triage",
    category: "api",
    priority: "P2",
    team: "api-platform",
    tags: ["webhook"],
    sla: { responseDueAt: "2026-09-21T15:00:00.000Z", breached: false },
    relatedTicketIds: [],
    revision: 7,
  });
  const watermark: CustomerReplyWatermark = { state: "none" };
  const index: IndexMetadata = {
    schemaVersion: 2,
    representationVersion: 1,
    generation,
    lexicalGeneration: generation,
    semanticGeneration: generation,
    corpusHash: `corpus-hash-${generation}`,
    state: "degraded",
  };
  const retrieval: RetrievalResult = {
    metadata: index,
    lexical: { status: "used" },
    semantic: { status: "unavailable", reason: "provider-not-configured" },
    candidates: [],
    referenceDiagnostics: [],
  };
  const retrievalExecution: RetrievalExecution = {
    retrieval,
    ranking: { status: "not-requested" },
  };
  const taxonomyEvent: OperationalEvent = {
    id: "30000000-0000-4000-8000-000000000001" as OperationalEvent["id"],
    ticketId: ticket.id,
    sequence: 2,
    occurredAt: "2026-09-21T11:30:00.000Z",
    actor: "test-operator",
    action: "diagnostic-taxonomy-revised",
    commandId: "30000000-0000-4000-8000-000000000003" as OperationalEvent["commandId"],
    facts: { revision: 1, status: "advisory" } as OperationalEvent["facts"],
  };
  const evaluationEvent: OperationalEvent = {
    id: "30000000-0000-4000-8000-000000000002" as OperationalEvent["id"],
    ticketId: ticket.id,
    sequence: 3,
    occurredAt: "2026-09-21T11:31:00.000Z",
    actor: "test-operator",
    action: "recommendation-submitted",
    commandId: "30000000-0000-4000-8000-000000000004" as OperationalEvent["commandId"],
    facts: {} as OperationalEvent["facts"],
  };
  const snapshot: OperationalWorkflowSnapshot = {
    ticket,
    ticketRevisions: [],
    recommendations: [],
    recommendationRevisions: [],
    diagnosticTaxonomyRevisions: [{
      id: "taxonomy-1",
      ticketId: ticket.id,
      revision: 1,
      context: {} as never,
      operationalEventId: taxonomyEvent.id,
      createdAt: taxonomyEvent.occurredAt,
    }],
    messages: [],
    diagnoses: [],
    events: [taxonomyEvent, evaluationEvent],
    traces: [],
    customerReplyWatermark: watermark,
  };
  const customerReplies: CustomerReply[] = [];
  const query = buildRetrievalQuery({
    ticket,
    customerReplies,
    customerReplyWatermark: JSON.stringify(watermark),
    references: deterministicRetrievalReferences({ ticket, customerReplies }),
  });
  return assembleHybridShadowCaptureContext({
    mode,
    event: evaluationEvent,
    snapshot,
    snapshotThroughSequence: evaluationEvent.sequence,
    query,
    retrievalExecution,
  });
}

function resultFor(input: DeepReadonly<HybridReasoningInput>): HybridReasoningResult {
  return {
    mode: input.mode,
    basis: structuredClone(input.basis),
    evidenceRequirements: [],
    hypotheses: [],
    relationships: [],
    actions: [],
  };
}

const lunaIdentity: ReasoningProviderIdentity = { providerKind: "controlled-test", model: "Luna fake" };

class SuccessfulFakeHybridReasoningProvider implements HybridReasoningProvider {
  calls = 0;
  readonly inputs: DeepReadonly<HybridReasoningInput>[] = [];

  constructor(readonly identity: ReasoningProviderIdentity = lunaIdentity) {}

  async reason(input: DeepReadonly<HybridReasoningInput>): Promise<HybridReasoningResult> {
    this.calls += 1;
    this.inputs.push(input);
    return resultFor(input);
  }
}

class FailingFakeHybridReasoningProvider extends SuccessfulFakeHybridReasoningProvider {
  override async reason(input: DeepReadonly<HybridReasoningInput>): Promise<HybridReasoningResult> {
    this.calls += 1;
    this.inputs.push(input);
    const error = new Error("provider secret api-key=never-store");
    error.stack = "provider stack secret api-key=never-store";
    throw error;
  }
}

class MalformedFakeHybridReasoningProvider extends SuccessfulFakeHybridReasoningProvider {
  override async reason(input: DeepReadonly<HybridReasoningInput>): Promise<HybridReasoningResult> {
    this.calls += 1;
    this.inputs.push(input);
    return {
      ...resultFor(input),
      hypotheses: [{ id: "hypothesis-1", statement: "provider-only-malformed-detail", rank: 1 }],
      relationships: [{
        hypothesisId: "missing-hypothesis",
        evidenceId: "missing-observation" as EvidenceObservationId,
        relationship: "supports",
      }],
    };
  }
}

function metadata(runId: string, recordedAt: string = timestamps.initial) {
  return {
    createRunId: () => HybridShadowRunIdSchema.parse(runId),
    clock: () => IsoTimestampSchema.parse(recordedAt),
  };
}

function completedRunFrom(outcome: HybridShadowRunRecordResult): Extract<HybridShadowRunV2, { status: "completed" }> {
  if (outcome.run.status !== "completed") throw new Error("Expected a completed shadow run in this test.");
  return outcome.run;
}

function failedRunFrom(outcome: HybridShadowRunRecordResult): Extract<HybridShadowRunV2, { status: "failed" }> {
  if (outcome.run.status !== "failed") throw new Error("Expected a failed shadow run in this test.");
  return outcome.run;
}

function assertDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

describe("provider-neutral hybrid shadow runner", () => {
  it("passes a deep-frozen input clone and persists a validated completed run", async () => {
    const { repository } = openRepository();
    const capture = context();
    const before = structuredClone(capture);
    const provider = new SuccessfulFakeHybridReasoningProvider();

    const outcome = await runHybridShadowOpportunity(capture, provider, repository, metadata(runIds.success));
    const completed = completedRunFrom(outcome);

    expect(outcome.outcome).toBe("recorded");
    expect(completed).toMatchObject({
      runId: runIds.success,
      opportunityId: capture.opportunityId,
      ticketId: capture.ticketId,
      mode: "evaluation",
      provider: lunaIdentity,
      recordedAt: timestamps.initial,
      basis: capture.basis,
      input: capture.input,
      status: "completed",
      result: { mode: "evaluation", basis: capture.input.basis },
    });
    expect(repository.getShadowRun(completed.runId)).toEqual(completed);
    expect(repository.getShadowRunByExecutionKey(completed.executionKey)).toEqual(completed);
    expect(provider.calls).toBe(1);
    expect(provider.inputs[0]).toEqual(capture.input);
    expect(provider.inputs[0]).not.toBe(capture.input);
    assertDeepFrozen(provider.inputs[0]);
    expect(capture).toEqual(before);

    const expectedKeyPayload = JSON.stringify({
      model: lunaIdentity.model,
      opportunityId: capture.opportunityId,
      providerContractVersion: 1,
      providerKind: lunaIdentity.providerKind,
    });
    expect(HYBRID_REASONING_PROVIDER_CONTRACT_VERSION).toBe(1);
    expect(completed.executionKey).toBe(createHash("sha256").update(expectedKeyPayload).digest("hex"));
  });

  it("persists provider failures with bounded safe details and no fabricated result", async () => {
    const { repository } = openRepository();
    const capture = context();
    const provider = new FailingFakeHybridReasoningProvider();

    const outcome = await runHybridShadowOpportunity(
      capture,
      provider,
      repository,
      metadata(runIds.failure),
    );
    const failed = failedRunFrom(outcome);

    expect(failed.failure).toEqual({
      code: "PROVIDER_ERROR",
      message: "The reasoning provider failed.",
    });
    expect(failed).not.toHaveProperty("result");
    expect(JSON.stringify(failed)).not.toContain("api-key");
    expect(JSON.stringify(failed)).not.toContain("stack secret");
    expect(repository.listShadowRunsForOpportunity(capture.opportunityId)).toEqual([failed]);
  });

  it("persists malformed provider output as a safe failed run without retaining the output", async () => {
    const { repository } = openRepository();
    const capture = context();
    const provider = new MalformedFakeHybridReasoningProvider();

    const outcome = await runHybridShadowOpportunity(
      capture,
      provider,
      repository,
      metadata(runIds.malformed),
    );
    const failed = failedRunFrom(outcome);

    expect(failed.failure).toEqual({
      code: "INVALID_OUTPUT",
      message: "The reasoning provider returned output that did not satisfy the reasoning contract.",
    });
    expect(failed).not.toHaveProperty("result");
    expect(JSON.stringify(failed)).not.toContain("provider-only-malformed-detail");
    expect(repository.getShadowRun(failed.runId)).toEqual(failed);
  });

  it("propagates persistence failure when an invalid-output failure run cannot be stored", async () => {
    const { repository } = openRepository();
    const provider = new MalformedFakeHybridReasoningProvider();
    const closeAfterOutput: HybridReasoningProvider = {
      identity: provider.identity,
      async reason(input) {
        const output = await provider.reason(input);
        repository.close();
        return output;
      },
    };

    await expect(runHybridShadowOpportunity(
      context(),
      closeAfterOutput,
      repository,
      metadata(runIds.persistFailure),
    )).rejects.toMatchObject({
      code: "CLOSED",
      name: "HybridShadowRunStoreError",
    } satisfies Partial<HybridShadowRunStoreError>);
  });

  it("maps explicitly classified provider unavailability to a bounded failure", async () => {
    const { repository } = openRepository();
    const provider: HybridReasoningProvider = {
      identity: lunaIdentity,
      async reason() {
        throw new HybridReasoningProviderError("UNAVAILABLE", "raw provider detail must not be stored");
      },
    };

    const outcome = await runHybridShadowOpportunity(
      context(),
      provider,
      repository,
      metadata(runIds.unavailable),
    );
    const failed = failedRunFrom(outcome);

    expect(failed.failure).toEqual({
      code: "UNAVAILABLE",
      message: "The reasoning provider is unavailable.",
    });
    expect(JSON.stringify(failed)).not.toContain("raw provider detail");
  });

  it("returns an existing execution before invoking the provider or requesting new metadata", async () => {
    const { repository } = openRepository();
    const capture = context();
    const provider = new SuccessfulFakeHybridReasoningProvider();
    const first = await runHybridShadowOpportunity(capture, provider, repository, metadata(runIds.success));
    const completed = completedRunFrom(first);
    const retryMetadata = {
      createRunId: () => { throw new Error("run ID must not be requested for replay"); },
      clock: () => { throw new Error("clock must not be requested for replay"); },
    };

    const retry = await runHybridShadowOpportunity(
      capture,
      provider,
      repository,
      retryMetadata,
    );

    expect(retry).toEqual({ outcome: "replayed", run: first.run });
    expect(provider.calls).toBe(1);
    expect(completed.executionKey).toBe(first.run.executionKey);
    expect(repository.listShadowRunsForOpportunity(capture.opportunityId)).toHaveLength(1);
  });

  it("stores different provider/model executions for the same opportunity", async () => {
    const { repository } = openRepository();
    const capture = context();
    const luna = new SuccessfulFakeHybridReasoningProvider(lunaIdentity);
    const qwen = new SuccessfulFakeHybridReasoningProvider({ providerKind: "controlled-test", model: "Qwen fake" });
    const lunaRun = await runHybridShadowOpportunity(capture, luna, repository, metadata(runIds.success));
    const qwenRun = await runHybridShadowOpportunity(
      capture,
      qwen,
      repository,
      metadata(runIds.secondProvider, timestamps.other),
    );

    expect(qwenRun.run.opportunityId).toBe(lunaRun.run.opportunityId);
    expect(qwenRun.run.executionKey).not.toBe(lunaRun.run.executionKey);
    expect(repository.listShadowRunsForOpportunity(capture.opportunityId)).toHaveLength(2);
  });

  it("stores a changed H4b opportunity as a separate run for the same provider", async () => {
    const { repository } = openRepository();
    const original = context("evaluation", 8);
    const changed = context("evaluation", 9);
    const provider = new SuccessfulFakeHybridReasoningProvider();
    const first = await runHybridShadowOpportunity(original, provider, repository, metadata(runIds.success));
    const second = await runHybridShadowOpportunity(
      changed,
      provider,
      repository,
      metadata(runIds.changedOpportunity, timestamps.other),
    );

    expect(second.run.opportunityId).not.toBe(first.run.opportunityId);
    expect(second.run.executionKey).not.toBe(first.run.executionKey);
    expect(repository.listShadowRunsForOpportunity(original.opportunityId)).toHaveLength(1);
    expect(repository.listShadowRunsForOpportunity(changed.opportunityId)).toHaveLength(1);
  });

  it("keeps evaluation and diagnosis as separate run modes and opportunities", async () => {
    const { repository } = openRepository();
    const provider = new SuccessfulFakeHybridReasoningProvider();
    const evaluation = await runHybridShadowOpportunity(
      context("evaluation"), provider, repository, metadata(runIds.success),
    );
    const diagnosis = await runHybridShadowOpportunity(
      context("diagnosis"), provider, repository, metadata(runIds.diagnosis, timestamps.other),
    );

    expect(evaluation.run.mode).toBe("evaluation");
    expect(evaluation.run.input.mode).toBe("evaluation");
    expect(completedRunFrom(evaluation).result.mode).toBe("evaluation");
    expect(diagnosis.run.mode).toBe("diagnosis");
    expect(diagnosis.run.input.mode).toBe("diagnosis");
    expect(completedRunFrom(diagnosis).result.mode).toBe("diagnosis");
    expect(diagnosis.run.opportunityId).not.toBe(evaluation.run.opportunityId);
  });

  it("resolves two runners that both pass key preflight before either output is persisted", async () => {
    const first = openRepository();
    const second = SqliteHybridShadowRunRepository.open(first.path);
    repositories.push(second);
    second.initialize();
    const capture = context();
    let providerCalls = 0;
    let releaseProvider!: () => void;
    let notifyBothProviders!: () => void;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const bothProvidersCalled = new Promise<void>((resolve) => { notifyBothProviders = resolve; });
    const provider: HybridReasoningProvider = {
      identity: lunaIdentity,
      async reason(input) {
        providerCalls += 1;
        if (providerCalls === 2) notifyBothProviders();
        await providerGate;
        return resultFor(input);
      },
    };

    const firstAttempt = runHybridShadowOpportunity(
      capture,
      provider,
      first.repository,
      metadata(runIds.concurrentA),
    );
    const secondAttempt = runHybridShadowOpportunity(
      capture,
      provider,
      second,
      metadata(runIds.concurrentB, timestamps.other),
    );
    await bothProvidersCalled;
    expect(providerCalls).toBe(2);
    expect(first.repository.listShadowRunsForOpportunity(capture.opportunityId)).toEqual([]);
    releaseProvider();

    const outcomes = await Promise.all([firstAttempt, secondAttempt]);

    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["recorded", "replayed"]);
    expect(first.repository.listShadowRunsForOpportunity(capture.opportunityId)).toHaveLength(1);
  });
});
