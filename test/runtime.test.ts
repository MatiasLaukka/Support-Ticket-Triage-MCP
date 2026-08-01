import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeDependencies,
  createKnowledgeCandidateDraftProviderFromEnv,
  environmentPath,
  minutesSaved,
} from "../src/runtime.js";
import { OpenAiKnowledgeCandidateDraftProvider, UnavailableOpenAiKnowledgeCandidateDraftProvider } from "../src/knowledge-evolution/openai-candidate-draft-provider.js";
import { createControlledKnowledgeCandidateDraftProvider } from "../src/approval-desk/controlled-evaluation-providers.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
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
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
        TRIAGE_MINUTES_SAVED: "8",
      },
      now: () => fixedNow,
    });

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
    });
    await expect(deps.knowledgeEvolution.diagnoses.list()).resolves.toEqual([]);
    await expect(deps.knowledgeEvolution.objects.listCandidates()).resolves.toEqual([]);
    expect(deps.knowledgeEvolution.service).toBeDefined();
  });

  it("persists a completed diagnosis recorded through the production service", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-diagnosis-"));
    temporaryRoots.push(dataRoot);
    const deps = await createRuntimeDependencies({
      env: { TRIAGE_DATA_ROOT: dataRoot, TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"), TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge") },
    });

    await deps.service.recordDiagnosis({
      ticketId: "TKT-1005",
      actor: "support-lead",
      diagnosedAt: "2026-07-29T12:00:00.000Z",
      diagnosis: {
        status: "completed", causeType: "configuration", customerSafeSummary: "A configuration mismatch caused the request failure.",
        evidenceUsed: ["request trace"], confidence: "confirmed", owner: "engineering",
        recommendedNextAction: "Apply the approved configuration update.", doNotSay: [],
      },
      knowledgeArticleIds: [],
    });

    await expect(deps.knowledgeEvolution.diagnoses.list()).resolves.toMatchObject([
      { ticketId: "TKT-1005", ownerTeam: "api-platform", evidenceIds: [expect.stringMatching(/^evidence-/)] },
    ]);
  });

  it("injects an optional candidate draft provider through the runtime boundary", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "triage-runtime-candidate-provider-"));
    temporaryRoots.push(dataRoot);
    const deps = await createRuntimeDependencies({
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      },
      knowledgeCandidateDraftProvider: createControlledKnowledgeCandidateDraftProvider(),
    });
    await deps.knowledgeEvolution.diagnoses.save({
      id: "diagnosis-runtime-provider",
      ticketId: "TKT-1001",
      problem: "The event-processing delay recurs for accepted checkout events.",
      symptoms: ["Accepted checkout events are missing from profile timelines."],
      evidenceIds: ["runtime-provider-evidence"],
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
