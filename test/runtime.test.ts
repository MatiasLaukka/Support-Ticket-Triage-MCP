import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimeDependencies,
  createKnowledgeCandidateDraftProviderFromEnv,
  environmentPath,
  minutesSaved,
} from "../src/runtime.js";
import { TriageRecommendationSchema } from "../src/domain.js";
import { diagnosisContextForTicket } from "../src/approval-desk/diagnostic-workflow.js";
import { OpenAiKnowledgeCandidateDraftProvider, UnavailableOpenAiKnowledgeCandidateDraftProvider } from "../src/knowledge-evolution/openai-candidate-draft-provider.js";
import { createControlledKnowledgeCandidateDraftProvider } from "../src/approval-desk/controlled-evaluation-providers.js";
import { DEFAULT_MINUTES_PER_ACCEPTED_RECOMMENDATION } from "../src/metrics.js";
import { acquireDemoStateResetLease } from "../src/demo-state-lease.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";

const temporaryRoots: string[] = [];
const openLedgers: Array<{ close: () => void }> = [];

afterEach(async () => {
  for (const ledger of openLedgers.splice(0)) ledger.close();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("runtime configuration", () => {
  it("selects the explicit knowledge candidate provider", () => {
    expect(createKnowledgeCandidateDraftProviderFromEnv({})).toBeUndefined();
    expect(createKnowledgeCandidateDraftProviderFromEnv({ TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "controlled" })).toMatchObject({ enabled: true });
    expect(createKnowledgeCandidateDraftProviderFromEnv({ TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "openai" })).toBeInstanceOf(UnavailableOpenAiKnowledgeCandidateDraftProvider);
    expect(createKnowledgeCandidateDraftProviderFromEnv({ TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "openai", OPENAI_API_KEY: "key" })).toBeInstanceOf(OpenAiKnowledgeCandidateDraftProvider);
  });

  it("rejects unsupported knowledge candidate provider values", () => {
    expect(() => createKnowledgeCandidateDraftProviderFromEnv({ TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "unknown" })).toThrow("TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER must be unset, controlled, or openai.");
  });

  it("rejects blank path environment variables", () => {
    expect(() =>
      environmentPath("TRIAGE_DATA_ROOT", "data/runtime", {
        TRIAGE_DATA_ROOT: "   ",
      }),
    ).toThrow("TRIAGE_DATA_ROOT must not be blank.");
  });

  it("reads minutes saved from the environment", () => {
    expect(minutesSaved({})).toBe(DEFAULT_MINUTES_PER_ACCEPTED_RECOMMENDATION);
    expect(minutesSaved({ TRIAGE_MINUTES_SAVED: "12" })).toBe(12);
  });

  it("rejects negative minutes saved", () => {
    expect(() => minutesSaved({ TRIAGE_MINUTES_SAVED: "-1" })).toThrow(
      "TRIAGE_MINUTES_SAVED must be a finite nonnegative number.",
    );
  });

  it("initializes repositories and service dependencies", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-"));
    temporaryRoots.push(dataRoot);
    const fixedNow = new Date("2026-06-26T12:00:00.000Z");

    const deps = await createRuntimeDependencies({
      legacyFixtureRepositories: true,
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
        TRIAGE_MINUTES_SAVED: "8",
      },
      now: () => fixedNow,
    });
    openLedgers.push(deps.knowledgeEvolution.ledger);

    await expect(deps.tickets.get("TKT-1005")).resolves.toMatchObject({
      id: "TKT-1005",
      revision: 0,
    });
    expect(deps.minutesPerAcceptedRecommendation).toBe(8);
    expect(deps.paths.knowledgeEvolution).toEqual({
      diagnosesRoot: resolve(dataRoot, "knowledge-evolution", "diagnoses"),
      candidatesRoot: resolve(dataRoot, "knowledge-evolution", "candidates"),
      approvedRoot: resolve(dataRoot, "knowledge-evolution", "approved"),
      auditFile: resolve(dataRoot, "knowledge-evolution", "audit", "events.jsonl"),
      learningLedgerFile: resolve(dataRoot, "knowledge-evolution", "learning.sqlite"),
    });
    await expect(deps.knowledgeEvolution.diagnoses.list()).resolves.toEqual([]);
    await expect(deps.knowledgeEvolution.objects.listCandidates()).resolves.toEqual([]);
    expect(deps.knowledgeEvolution.service).toBeDefined();
    await expect(deps.knowledgeEvolution.ledger.list()).resolves.toEqual([]);
  });

  it("releases its usage lease when closing a runtime resource fails", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-close-failure-"));
    temporaryRoots.push(dataRoot);
    const deps = await createRuntimeDependencies({
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      },
    });
    const store = deps.operationalStore;
    expect(store).toBeInstanceOf(OperationalSqliteStore);
    const closeSpy = vi.spyOn(store as OperationalSqliteStore, "close")
      .mockImplementationOnce(() => {
        throw new Error("injected operational close failure");
      });
    let resetLease: ReturnType<typeof acquireDemoStateResetLease> | undefined;

    try {
      expect(() => deps.close()).toThrow("injected operational close failure");
      expect(() => {
        resetLease = acquireDemoStateResetLease(dataRoot);
      }).not.toThrow();
    } finally {
      resetLease?.release();
      deps.close();
      closeSpy.mockRestore();
    }
  });

  it("releases its usage lease when startup fails after acquisition", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-startup-failure-"));
    temporaryRoots.push(dataRoot);
    const seedFile = join(dataRoot, "invalid-tickets.json");
    await writeFile(seedFile, "not valid JSON", "utf8");

    await expect(createRuntimeDependencies({
      legacyFixtureRepositories: true,
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: seedFile,
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      },
    })).rejects.toThrow();

    const resetLease = acquireDemoStateResetLease(dataRoot);
    resetLease.release();
  });

  it("does not open mutable runtime state while reset owns the exclusive lease", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-reset-race-"));
    temporaryRoots.push(dataRoot);
    const operationalDatabase = join(dataRoot, "operational.sqlite");
    const learningDatabase = join(
      dataRoot,
      "knowledge-evolution",
      "learning.sqlite",
    );
    const diagnosesRoot = join(dataRoot, "knowledge-evolution", "diagnoses");
    const resetLease = acquireDemoStateResetLease(dataRoot);
    try {
      await expect(createRuntimeDependencies({
        env: {
          TRIAGE_DATA_ROOT: dataRoot,
          TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
          TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
        },
      })).rejects.toThrow(/reset.*active/i);
      expect(existsSync(operationalDatabase)).toBe(false);
      expect(existsSync(learningDatabase)).toBe(false);
      expect(existsSync(diagnosesRoot)).toBe(false);
    } finally {
      resetLease.release();
    }

    const deps = await createRuntimeDependencies({
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      },
    });
    try {
      expect(existsSync(operationalDatabase)).toBe(true);
      expect(existsSync(learningDatabase)).toBe(true);
    } finally {
      deps.close();
    }
  });

  it("rejects a blank learning-ledger path and accepts an explicit override", async () => {
    expect(() => environmentPath("TRIAGE_LEARNING_LEDGER_PATH", "data/runtime/knowledge-evolution/learning.sqlite", { TRIAGE_LEARNING_LEDGER_PATH: "   " })).toThrow("TRIAGE_LEARNING_LEDGER_PATH must not be blank.");
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-ledger-"));
    temporaryRoots.push(dataRoot);
    const customLedger = join(dataRoot, "custom", "learning.sqlite");
    const deps = await createRuntimeDependencies({
      legacyFixtureRepositories: true,
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
        TRIAGE_LEARNING_LEDGER_PATH: customLedger,
      },
    });
    openLedgers.push(deps.knowledgeEvolution.ledger);
    expect(deps.paths.knowledgeEvolution.learningLedgerFile).toBe(resolve(customLedger));
    await expect(deps.knowledgeEvolution.ledger.list()).resolves.toEqual([]);
  });

  it("persists a completed diagnosis recorded through the production service", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-diagnosis-"));
    temporaryRoots.push(dataRoot);
    const deps = await createRuntimeDependencies({
      legacyFixtureRepositories: true,
      env: { TRIAGE_DATA_ROOT: dataRoot, TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"), TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge") },
    });
    openLedgers.push(deps.knowledgeEvolution.ledger);

    const ticket = await deps.tickets.get("TKT-1005");
    const diagnosis = diagnosisContextForTicket(ticket, TriageRecommendationSchema.parse({
      id: "a734a24f-27c0-42e9-b7e5-8d5d8d3449a2",
      ticketId: ticket.id,
      sourceRevision: ticket.revision,
      category: "api",
      priority: "P2",
      team: "api-platform",
      duplicateCandidates: [],
      outageRisk: "none",
      securityRisk: "none",
      slaRisk: "none",
      missingInformation: [],
      supportState: "diagnosing",
      requiredEvidence: [],
      providedEvidence: [{
        id: "request-id",
        label: "Request ID",
        customerQuestion: "request ID if available",
        aliases: ["request id"],
        source: "knowledge",
      }],
      missingEvidence: [],
      knowledgeArticleIds: [],
      draftCustomerResponse: "We have the request ID needed for diagnosis.",
      rationale: "The supplied request ID is recognized evidence.",
      confidence: 0.9,
      recommendedNextAction: "Review the request ID.",
      escalationRequired: false,
      escalationReasons: [],
      resolution: "approved",
      createdAt: "2026-07-29T12:00:00.000Z",
    }));

    await deps.service.recordDiagnosis({
      ticketId: "TKT-1005",
      actor: "support-lead",
      diagnosedAt: "2026-07-29T12:00:00.000Z",
      diagnosis,
      knowledgeArticleIds: [],
    });

    const diagnoses = await deps.knowledgeEvolution.diagnoses.list();
    expect(diagnoses).toMatchObject([
      {
        ticketId: "TKT-1005",
        ownerTeam: "support",
        evidenceUsed: ["Request ID"],
        evidenceReferences: [{
          id: "request-id",
          labelAtDiagnosis: "Request ID",
          source: "ticket",
          sourceRef: "TKT-1005",
        }],
      },
    ]);
    expect(diagnoses[0]).not.toHaveProperty("evidenceIds");
    await expect(deps.knowledgeEvolution.service.discover({
      includeGpt: false,
      actorId: "support-lead",
    })).resolves.toMatchObject({ candidates: [expect.any(Object)] });
    await expect(deps.knowledgeEvolution.objects.listCandidates()).resolves.toMatchObject([
      { evidencePolicy: { mode: "required", evidenceIds: ["request-id"] } },
    ]);
    await expect(deps.knowledgeEvolution.ledger.list({ eventType: "candidate-created" })).resolves.toHaveLength(1);
    const [candidate] = await deps.knowledgeEvolution.objects.listCandidates();
    expect(candidate).toBeDefined();
    await expect(deps.knowledgeEvolution.service.learningSummary({
      candidateId: candidate!.id,
    })).resolves.toMatchObject({
      candidateId: candidate!.id,
      maturity: "diagnosis-supported",
      supportingEventIds: [expect.any(String)],
    });
  });

  it("injects an optional candidate draft provider through the runtime boundary", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-candidate-provider-"));
    temporaryRoots.push(dataRoot);
    const deps = await createRuntimeDependencies({
      legacyFixtureRepositories: true,
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      },
      knowledgeCandidateDraftProvider: createControlledKnowledgeCandidateDraftProvider(),
    });
    openLedgers.push(deps.knowledgeEvolution.ledger);
    await deps.knowledgeEvolution.diagnoses.save({
      id: "diagnosis-runtime-provider",
      ticketId: "TKT-1001",
      problem: "The event-processing delay recurs for accepted checkout events.",
      symptoms: ["Accepted checkout events are missing from profile timelines."],
      evidenceReferences: [{ id: "request-id", labelAtDiagnosis: "Accepted request ID", source: "ticket", sourceRef: "TKT-1001" }],
      ownerTeam: "api-platform",
      fixSteps: ["Apply the governed event-processing mitigation."],
      verificationSteps: ["Confirm a new accepted event reaches the profile timeline."],
      completedAt: "2026-07-29T12:00:00.000Z",
    });

    await expect(deps.knowledgeEvolution.service.discover({
      includeGpt: true,
      actorId: "support-lead",
    })).resolves.toMatchObject({
      gptAdvisory: {
        requested: true,
        status: "used",
        candidateId: "known-cause-gpt-diagnosis-runtime-provider",
      },
    });
  });
});
