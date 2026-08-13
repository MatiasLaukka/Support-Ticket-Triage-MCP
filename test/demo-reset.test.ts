import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import {
  TicketSchema,
  TriageRecommendationSchema,
  type Ticket,
} from "../src/domain.js";
import { CompletedDiagnosisSchema } from "../src/knowledge-evolution/domain.js";
import type { KnowledgeCandidate } from "../src/knowledge-evolution/domain.js";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";
import type { LearningEvent } from "../src/knowledge-evolution/learning-ledger.js";
import { DiagnosisRepository } from "../src/knowledge-evolution/diagnosis-repository.js";
import { SqliteLearningLedger } from "../src/knowledge-evolution/sqlite-learning-ledger.js";
import { SqliteKnowledgeEvolutionStore } from "../src/knowledge-evolution/sqlite-knowledge-evolution-store.js";
import {
  acquireDemoStateUsageLease,
  prepareLearningDemoReset,
  prepareOperationalDemoReset,
  resetDemoState,
  resetLearningDemoState,
  resetOperationalDemoState,
} from "../src/demo-reset.js";
import type { LearningCaptureEnvelope } from "../src/operational/domain.js";
import { canonicalRequestHash } from "../src/operational/idempotency.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { readDecisionTimeline } from "../src/operational/timeline.js";
import {
  createRuntimeDependencies,
  type RuntimeDependencies,
} from "../src/runtime.js";
import { buildTicketWorkflowReadModel } from "../src/approval-desk/workflow-read-model.js";

const roots: string[] = [];
const children: ChildProcess[] = [];
const derivedTables = [
  "command_idempotency",
  "ticket_revisions",
  "conversation_messages",
  "operational_import_resolutions",
  "recommendations",
  "recommendation_revisions",
  "diagnoses",
  "operational_events",
  "decision_trace_events",
  "learning_capture_outbox",
] as const;

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill();
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("operational demo reset", () => {
  it("replaces dirty operational state with the exact native seed baseline", () => {
    const harness = dirtyHarness();

    const summary = resetOperationalDemoState(harness.input);

    expect(summary).toEqual({
      ticketCount: harness.seedTickets.length,
      ticketIds: harness.seedTickets.map(({ id }) => id),
      databasePath: resolve(harness.databasePath),
    });
    assertPristineBaseline(harness.databasePath, harness.seedTickets);
  });

  it("verifies seed tickets by ID instead of repository iteration order", () => {
    const harness = dirtyHarness({ reverseSeed: true });

    expect(() => resetOperationalDemoState(harness.input)).not.toThrow();
    assertPristineBaseline(harness.databasePath, harness.seedTickets);
  });

  it("is idempotent", () => {
    const harness = dirtyHarness();

    const first = resetOperationalDemoState(harness.input);
    const firstSnapshots = readSnapshots(harness.databasePath);
    const second = resetOperationalDemoState(harness.input);

    expect(second).toEqual(first);
    expect(readSnapshots(harness.databasePath)).toEqual(firstSnapshots);
  });

  it.each([
    ["invalid JSON", "not json"],
    ["an empty array", "[]"],
    ["duplicate ticket IDs", undefined],
  ])("leaves the live database byte-for-byte unchanged for %s", (_label, seedText) => {
    const harness = dirtyHarness();
    const originalBytes = readFileSync(harness.databasePath);
    if (seedText === undefined) {
      writeFileSync(
        harness.seedFile,
        JSON.stringify([harness.seedTickets[0], harness.seedTickets[0]]),
      );
    } else {
      writeFileSync(harness.seedFile, seedText);
    }

    expect(() => resetOperationalDemoState(harness.input)).toThrow(/operational seed/i);
    expect(readFileSync(harness.databasePath)).toEqual(originalBytes);
    expect(readSnapshots(harness.databasePath)[0]?.events).not.toEqual([]);
  });

  it("allows a read-only seed outside dataRoot but refuses an external database by default", () => {
    const harness = dirtyHarness({ seedOutsideDataRoot: true });
    const externalRoot = temporaryRoot("demo-reset-external-");
    const externalDatabase = join(externalRoot, "operational.sqlite");
    writeFileSync(externalDatabase, "do-not-touch");

    expect(() => resetOperationalDemoState({
      ...harness.input,
      operationalDatabase: externalDatabase,
    })).toThrow(/outside.*data root/i);
    expect(readFileSync(externalDatabase, "utf8")).toBe("do-not-touch");

    expect(() => resetOperationalDemoState(harness.input)).not.toThrow();
  });

  it("canonicalizes linked destructive paths before applying containment", () => {
    const harness = dirtyHarness();
    const externalRoot = temporaryRoot("demo-reset-linked-external-");
    const linkedRoot = join(harness.root, "linked-outside");
    symlinkSync(externalRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    const externalDatabase = join(linkedRoot, "operational.sqlite");
    writeFileSync(join(externalRoot, "operational.sqlite"), "do-not-touch");

    expect(() => resetOperationalDemoState({
      ...harness.input,
      operationalDatabase: externalDatabase,
    })).toThrow(/outside.*data root/i);
    expect(readFileSync(join(externalRoot, "operational.sqlite"), "utf8"))
      .toBe("do-not-touch");
  });

  it("refuses reset while another process owns a shared usage lease", async () => {
    const harness = dirtyHarness();
    const originalHash = fileHash(harness.databasePath);
    const child = await startLeaseHolder(harness.root);
    children.push(child);

    expect(() => resetOperationalDemoState(harness.input)).toThrow(
      /operational demo state is active/i,
    );
    expect(fileHash(harness.databasePath)).toBe(originalHash);
    expect(resetArtifacts(harness.databasePath)).toEqual([]);

    child.send?.("release");
    await waitForExit(child);
  });

  it("prevents usage acquisition while a prepared reset owns the exclusive lease", () => {
    const harness = dirtyHarness();
    const prepared = prepareOperationalDemoReset(harness.input);
    try {
      expect(() => acquireDemoStateUsageLease(harness.root)).toThrow(/reset.*active/i);
    } finally {
      prepared.rollback();
    }
  });

  it("blocks real runtime startup before it opens mutable state while reset is prepared", async () => {
    const harness = dirtyHarness();
    const prepared = prepareOperationalDemoReset(harness.input);
    const learningDatabase = join(harness.root, "knowledge-evolution", "learning.sqlite");
    try {
      await expect(createRuntimeDependencies({
        cwd: harness.root,
        env: {
          TRIAGE_DATA_ROOT: harness.root,
          TRIAGE_SEED_FILE: harness.seedFile,
          TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
          OPERATIONAL_DB_PATH: harness.databasePath,
        },
      })).rejects.toThrow(/reset.*active/i);
      expect(existsSync(learningDatabase)).toBe(false);
      expect(existsSync(join(harness.root, "knowledge-evolution", "diagnoses"))).toBe(false);
    } finally {
      prepared.rollback();
    }
  });

  it("holds the shared usage lease for the real runtime lifetime", async () => {
    const harness = dirtyHarness();
    const runtime = await createRuntimeDependencies({
      cwd: harness.root,
      env: {
        TRIAGE_DATA_ROOT: harness.root,
        TRIAGE_SEED_FILE: harness.seedFile,
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
        OPERATIONAL_DB_PATH: harness.databasePath,
      },
    });
    try {
      expect(() => resetOperationalDemoState(harness.input)).toThrow(
        /operational demo state is active/i,
      );
    } finally {
      runtime.close();
    }

    expect(() => resetOperationalDemoState(harness.input)).not.toThrow();
  });

  it("starts the Approval Desk runtime from the reset baseline and preserves it across restart", async () => {
    const harness = dirtyHarness();
    resetOperationalDemoState(harness.input);

    const firstRuntime = await createResetRuntime(harness);
    const expectedTicketIds = harness.seedTickets.map(({ id }) => id).sort();
    let firstWorkflow: Awaited<ReturnType<typeof readApprovalDeskWorkflow>>;
    try {
      expect((await firstRuntime.tickets.snapshot()).map(({ id }) => id).sort())
        .toEqual(expectedTicketIds);
      expect(expectedTicketIds).toContain("TKT-1010");
      firstWorkflow = await readApprovalDeskWorkflow(firstRuntime, "TKT-1010");
      assertPristineApprovalDeskWorkflow(firstRuntime, firstWorkflow);
    } finally {
      firstRuntime.close();
    }

    const restartedRuntime = await createResetRuntime(harness);
    try {
      const restartedWorkflow = await readApprovalDeskWorkflow(
        restartedRuntime,
        "TKT-1010",
      );
      assertPristineApprovalDeskWorkflow(restartedRuntime, restartedWorkflow);
      expect(restartedWorkflow).toEqual(firstWorkflow!);
    } finally {
      restartedRuntime.close();
    }
  });

  it("does not replace the live database until commit and rollback removes the prepared file", () => {
    const harness = dirtyHarness();
    const originalHash = fileHash(harness.databasePath);
    const prepared = prepareOperationalDemoReset(harness.input);
    const artifacts = resetArtifacts(harness.databasePath);

    expect(fileHash(harness.databasePath)).toBe(originalHash);
    expect(artifacts.some((path) => path.endsWith(".tmp"))).toBe(true);
    prepared.verify();
    prepared.rollback();

    expect(fileHash(harness.databasePath)).toBe(originalHash);
    expect(resetArtifacts(harness.databasePath)).toEqual([]);
  });

  it("restores the original database if the prepared replacement disappears before commit", () => {
    const harness = dirtyHarness();
    const originalHash = fileHash(harness.databasePath);
    const prepared = prepareOperationalDemoReset(harness.input);
    const [temporaryDatabase] = resetArtifacts(harness.databasePath)
      .filter((path) => path.endsWith(".tmp"));
    expect(temporaryDatabase).toBeDefined();
    rmSync(temporaryDatabase!, { force: true });

    expect(() => prepared.commit()).toThrow(/replace operational demo state/i);
    expect(fileHash(harness.databasePath)).toBe(originalHash);
    expect(() => readSnapshots(harness.databasePath)).not.toThrow();
    prepared.rollback();
  });
});

describe("learning demo reset", () => {
  it("resets only mutable learning state and preserves operational and static knowledge state", async () => {
    const harness = await dirtyLearningHarness();
    const operationalBefore = readSnapshots(harness.databasePath);
    const staticKnowledgeBefore = readFileSync(harness.staticKnowledgeFile, "utf8");

    const summary = await resetLearningDemoState(harness.learningInput);

    expect(summary).toEqual({ databasePath: resolve(harness.learningDatabase) });
    await assertPristineLearningBaseline(harness);
    expect(readSnapshots(harness.databasePath)).toEqual(operationalBefore);
    expect(readFileSync(harness.staticKnowledgeFile, "utf8")).toBe(staticKnowledgeBefore);
  });

  it("refuses while a real runtime owns the shared lease before touching learning resources", async () => {
    const harness = await dirtyLearningHarness();
    const runtime = await createResetRuntime(harness);
    try {
      const before = learningResourceSnapshot(harness);

      await expect(resetLearningDemoState(harness.learningInput)).rejects.toThrow(
        /operational demo state is active/i,
      );
      expect(learningResourceSnapshot(harness)).toEqual(before);
    } finally {
      runtime.close();
    }
  });

  it("prepares fresh learning resources without replacing live state and rollback removes them", async () => {
    const harness = await dirtyLearningHarness();
    const before = learningResourceSnapshot(harness);
    const prepared = await prepareLearningDemoReset(harness.learningInput);

    expect(learningResourceSnapshot(harness)).toEqual(before);
    await prepared.verify();
    await prepared.rollback();

    expect(learningResourceSnapshot(harness)).toEqual(before);
    expect(learningResetArtifacts(harness)).toEqual([]);
  });

  it("keeps SQLite sidecars in the rollback set and removes them from the reset baseline", async () => {
    const harness = await dirtyLearningHarness();
    writeFileSync(`${harness.learningDatabase}-journal`, "legacy journal");
    writeFileSync(`${harness.learningDatabase}-wal`, "legacy wal");
    writeFileSync(`${harness.learningDatabase}-shm`, "legacy shm");
    const sidecarsBefore = ["-journal", "-wal", "-shm"].map((suffix) =>
      readFileSync(`${harness.learningDatabase}${suffix}`, "utf8")
    );
    const prepared = await prepareLearningDemoReset(harness.learningInput);

    await prepared.rollback();
    expect(["-journal", "-wal", "-shm"].map((suffix) =>
      readFileSync(`${harness.learningDatabase}${suffix}`, "utf8")
    )).toEqual(sidecarsBefore);

    await resetLearningDemoState(harness.learningInput);
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      expect(existsSync(`${harness.learningDatabase}${suffix}`)).toBe(false);
    }
  });

  it("is idempotent", async () => {
    const harness = await dirtyLearningHarness();

    const first = await resetLearningDemoState(harness.learningInput);
    const firstState = learningResourceSnapshot(harness);
    const second = await resetLearningDemoState(harness.learningInput);

    expect(second).toEqual(first);
    expect(learningResourceSnapshot(harness)).toEqual(firstState);
    await assertPristineLearningBaseline(harness);
  });

  it("refuses an external ledger and a linked mutable path before changing prior state", async () => {
    const harness = await dirtyLearningHarness();
    const outside = temporaryRoot("learning-reset-outside-");
    const externalLedger = join(outside, "learning.sqlite");
    writeFileSync(externalLedger, "do-not-touch");

    await expect(resetLearningDemoState({
      ...harness.learningInput,
      learningLedgerFile: externalLedger,
    })).rejects.toThrow(/outside.*data root/i);
    expect(readFileSync(externalLedger, "utf8")).toBe("do-not-touch");

    rmSync(harness.diagnosesRoot, { recursive: true, force: true });
    const externalDiagnoses = join(outside, "diagnoses");
    mkdirSync(externalDiagnoses, { recursive: true });
    writeFileSync(join(externalDiagnoses, "keep.txt"), "do-not-touch");
    symlinkSync(
      externalDiagnoses,
      harness.diagnosesRoot,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(resetLearningDemoState(harness.learningInput)).rejects.toThrow(
      /mutable learning path.*outside/i,
    );
    expect(readFileSync(join(externalDiagnoses, "keep.txt"), "utf8")).toBe("do-not-touch");
  });

  it("never treats static knowledge as a learning ledger even with external-path opt-in", async () => {
    const harness = await dirtyLearningHarness();
    const staticBefore = readFileSync(harness.staticKnowledgeFile, "utf8");

    await expect(resetLearningDemoState({
      ...harness.learningInput,
      learningLedgerFile: harness.staticKnowledgeFile,
      allowExternalLedgerPath: true,
    })).rejects.toThrow(/static knowledge/i);
    expect(readFileSync(harness.staticKnowledgeFile, "utf8")).toBe(staticBefore);
  });

  it("never treats an operational SQLite database as a learning ledger", async () => {
    const harness = await dirtyLearningHarness({ databaseName: "custom-workflow.db" });
    const operationalBefore = learningResourceSnapshot(harness);
    const snapshotsBefore = readSnapshots(harness.databasePath);

    await expect(resetLearningDemoState({
      ...harness.learningInput,
      learningLedgerFile: harness.databasePath,
      allowExternalLedgerPath: true,
    })).rejects.toThrow(/operational database/i);
    expect(readSnapshots(harness.databasePath)).toEqual(snapshotsBefore);
    expect(learningResourceSnapshot(harness)).toEqual(operationalBefore);
  });

  it("allows only one concurrent commit to replace a prepared learning reset", async () => {
    const harness = await dirtyLearningHarness();
    const prepared = await prepareLearningDemoReset(harness.learningInput);

    const results = await Promise.allSettled([prepared.commit(), prepared.commit()]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await assertPristineLearningBaseline(harness);
  });

  it.each(["commit", "rollback"] as const)(
    "keeps %s out while prepared learning verification is active",
    async (operation) => {
      const harness = await dirtyLearningHarness();
      const prepared = await prepareLearningDemoReset(harness.learningInput);

      const verify = prepared.verify();
      const competing = operation === "commit" ? prepared.commit() : prepared.rollback();

      await expect(competing).rejects.toThrow(/current state|verification.*active/i);
      await expect(verify).resolves.toBeUndefined();
      await prepared.rollback();
      expect(learningResetArtifacts(harness)).toEqual([]);
    },
  );

  it("restores moved database members when a later backup member cannot move", async () => {
    const harness = await dirtyLearningHarness();
    writeFileSync(`${harness.learningDatabase}-shm`, "legacy shm");
    const operationalBefore = readSnapshots(harness.databasePath);
    const learningBefore = learningResourceSnapshot(harness);
    const prepared = await prepareLearningDemoReset(harness.learningInput);
    const temporaryDatabase = learningResetArtifacts(harness)
      .find((path) => path.includes("learning.sqlite.reset-") && path.endsWith(".tmp"));
    expect(temporaryDatabase).toBeDefined();
    const backupDatabase = temporaryDatabase!
      .replace(/\.reset-([^.]+)\.tmp$/, ".reset-backup-$1");
    mkdirSync(`${backupDatabase}-shm`);

    await expect(prepared.commit()).rejects.toThrow(/replace learning demo state/i);
    expect(readSnapshots(harness.databasePath)).toEqual(operationalBefore);
    expect(learningResourceSnapshot(harness)).toEqual(learningBefore);
    await prepared.rollback();
  });

  it("restores prior learning and leaves operational state untouched when replacement fails", async () => {
    const harness = await dirtyLearningHarness();
    const operationalBefore = readSnapshots(harness.databasePath);
    const learningBefore = learningResourceSnapshot(harness);
    const prepared = await prepareLearningDemoReset(harness.learningInput);
    const temporaryDatabase = learningResetArtifacts(harness)
      .find((path) => path.includes("learning.sqlite.reset-") && path.endsWith(".tmp"));
    expect(temporaryDatabase).toBeDefined();
    rmSync(temporaryDatabase!, { force: true });

    await expect(prepared.commit()).rejects.toThrow(/replace learning demo state/i);
    expect(readSnapshots(harness.databasePath)).toEqual(operationalBefore);
    expect(learningResourceSnapshot(harness)).toEqual(learningBefore);
    await prepared.rollback();
  });
});

describe("combined demo reset", () => {
  it("resets both dirty sides by ticket ID while preserving static knowledge", async () => {
    const harness = await dirtyLearningHarness({ reverseSeed: true });
    const staticKnowledgeBefore = readFileSync(harness.staticKnowledgeFile, "utf8");

    const summary = await resetDemoState({
      ...harness.input,
      ...harness.learningInput,
    });

    expect(summary).toEqual({
      operational: {
        ticketCount: harness.seedTickets.length,
        ticketIds: harness.seedTickets.map(({ id }) => id),
        databasePath: resolve(harness.databasePath),
      },
      learning: { databasePath: resolve(harness.learningDatabase) },
    });
    assertPristineBaseline(harness.databasePath, harness.seedTickets);
    await assertPristineLearningBaseline(harness);
    expect(readFileSync(harness.staticKnowledgeFile, "utf8")).toBe(staticKnowledgeBefore);
    expect(resetArtifacts(harness.databasePath)).toEqual([]);
    expect(learningResetArtifacts(harness)).toEqual([]);
  });

  it("holds one exclusive lease while both sides prepare, commit, verify, and clean up", async () => {
    const harness = await dirtyLearningHarness();

    const reset = resetDemoState({
      ...harness.input,
      ...harness.learningInput,
    });

    expect(() => acquireDemoStateUsageLease(harness.root)).toThrow(/reset.*active/i);
    await expect(reset).resolves.toBeDefined();
    const usage = acquireDemoStateUsageLease(harness.root);
    usage.release();
  });

  it("restores both originals when the learning commit fails after operational commit", async () => {
    const harness = await dirtyLearningHarness();
    const operationalBefore = readSnapshots(harness.databasePath);
    const learningBefore = await readLearningLogicalState(harness);
    const reset = resetDemoState({
      ...harness.input,
      ...harness.learningInput,
    });
    const blockedBackup = await blockLearningDatabaseBackup(harness);
    expect(readSnapshots(harness.databasePath)).toEqual(operationalBefore);

    await expect(reset).rejects.toThrow(/learning side/i);
    expect(readSnapshots(harness.databasePath)).toEqual(operationalBefore);
    await expect(readLearningLogicalState(harness)).resolves.toEqual(learningBefore);
    expect(existsSync(blockedBackup)).toBe(true);
    expect(resetArtifacts(harness.databasePath)).toEqual([]);
    const usage = acquireDemoStateUsageLease(harness.root);
    usage.release();
  });

  it("retains sanitized operational recovery backups when cross-side rollback fails", async () => {
    const harness = await dirtyLearningHarness();
    const learningBefore = await readLearningLogicalState(harness);
    const reset = resetDemoState({
      ...harness.input,
      ...harness.learningInput,
    });
    await blockLearningDatabaseBackup(harness);
    await waitForCondition(() => operationalStateIsPristine(harness));
    rmSync(harness.databasePath, { force: true });
    mkdirSync(harness.databasePath);

    const error = await reset.catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "ROLLBACK_FAILED" });
    expect(String((error as Error).message)).toMatch(/learning side.*rollback.*could not complete/i);
    expect(String((error as Error).message)).not.toContain(harness.root);
    expect(resetArtifacts(harness.databasePath).some((path) =>
      path.includes(".reset-backup-") && existsSync(path)
    )).toBe(true);
    await expect(readLearningLogicalState(harness)).resolves.toEqual(learningBefore);
    const usage = acquireDemoStateUsageLease(harness.root);
    usage.release();
  });
});

async function createResetRuntime(
  harness: ReturnType<typeof dirtyHarness>,
): Promise<RuntimeDependencies> {
  return createRuntimeDependencies({
    cwd: harness.root,
    env: {
      TRIAGE_DATA_ROOT: harness.root,
      TRIAGE_SEED_FILE: harness.seedFile,
      TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      OPERATIONAL_DB_PATH: harness.databasePath,
    },
  });
}

async function readApprovalDeskWorkflow(
  runtime: RuntimeDependencies,
  ticketId: string,
) {
  const operationalStore = runtime.operationalStore;
  expect(operationalStore).toBeDefined();
  const [ticket, recommendations, audits, decisionTimeline] = await Promise.all([
    runtime.tickets.get(ticketId),
    runtime.recommendations.list(),
    runtime.audits.list(ticketId),
    readDecisionTimeline(ticketId, operationalStore!),
  ]);
  return buildTicketWorkflowReadModel({
    ticket,
    recommendations,
    audits,
    decisionTimeline,
  });
}

function assertPristineApprovalDeskWorkflow(
  runtime: RuntimeDependencies,
  workflow: Awaited<ReturnType<typeof readApprovalDeskWorkflow>>,
): void {
  expect(workflow.ticket).toMatchObject({
    id: "TKT-1010",
    revision: 0,
    status: "new",
  });
  expect(workflow.recommendationHistory).toEqual([]);
  expect(workflow.latestRecommendation).toBeUndefined();
  expect(workflow.conversationHistory).toEqual([]);
  expect(workflow.decisionTimeline).toEqual([]);
  expect(workflow.operatorGuidance).toMatchObject({
    stage: "active",
    nextAction: "evaluate-ticket",
    unlocksTool: "evaluate_ticket",
  });
  expect(runtime.operationalStore!.readWorkflowSnapshot("TKT-1010").diagnoses)
    .toEqual([]);
}

function dirtyHarness(options: {
  readonly reverseSeed?: boolean;
  readonly seedOutsideDataRoot?: boolean;
  readonly databaseName?: string;
} = {}) {
  const root = temporaryRoot("demo-reset-");
  const sourceSeed = resolve("data", "seed", "tickets.json");
  const canonicalTickets = TicketSchema.array().min(1).parse(
    JSON.parse(readFileSync(sourceSeed, "utf8")),
  );
  const seedTickets = options.reverseSeed === true
    ? [...canonicalTickets].reverse()
    : canonicalTickets;
  const seedRoot = options.seedOutsideDataRoot === true
    ? temporaryRoot("demo-reset-seed-")
    : root;
  const seedFile = join(seedRoot, "tickets.json");
  writeFileSync(seedFile, JSON.stringify(seedTickets));
  const databasePath = join(root, options.databaseName ?? "operational.sqlite");
  const store = OperationalSqliteStore.open(databasePath);
  store.initialize();
  store.transaction((unit) => {
    unit.transitionImportState("empty", "native");
    for (const ticket of canonicalTickets.slice(0, 2)) unit.insertTicket(ticket);
  });
  addDirtyOperationalState(store, canonicalTickets[0]!);
  store.close();
  return {
    root,
    seedFile,
    seedTickets,
    databasePath,
    input: { operationalDatabase: databasePath, seedFile, dataRoot: root },
  };
}

async function dirtyLearningHarness(options: Parameters<typeof dirtyHarness>[0] = {}) {
  const operational = dirtyHarness(options);
  const knowledgeEvolutionRoot = join(operational.root, "knowledge-evolution");
  const learningDatabase = join(knowledgeEvolutionRoot, "learning.sqlite");
  const diagnosesRoot = join(knowledgeEvolutionRoot, "diagnoses");
  const candidatesRoot = join(knowledgeEvolutionRoot, "candidates");
  const approvedRoot = join(knowledgeEvolutionRoot, "approved");
  const auditRoot = join(knowledgeEvolutionRoot, "audit");
  const ledger = new SqliteLearningLedger(learningDatabase);
  await ledger.initialize();
  const store = new SqliteKnowledgeEvolutionStore(ledger.getDatabase());
  try {
    await store.initialize();
    await ledger.append(dirtyLearningEvent);
    await store.saveCandidate(dirtyKnowledgeCandidate);
    await store.append(dirtyKnowledgeAudit);
  } finally {
    ledger.close();
  }
  await new DiagnosisRepository(diagnosesRoot).save(dirtyCompletedDiagnosis);
  for (const [root, name] of [
    [candidatesRoot, "legacy-candidate.json"],
    [approvedRoot, "legacy-approved.json"],
    [auditRoot, "events.jsonl"],
  ] as const) {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, name), "legacy mutable state");
  }
  const staticKnowledgeRoot = join(operational.root, "data", "knowledge");
  const staticKnowledgeFile = join(staticKnowledgeRoot, "static-article.md");
  mkdirSync(staticKnowledgeRoot, { recursive: true });
  writeFileSync(staticKnowledgeFile, "# Static knowledge\n\nNever reset this article.\n");
  return {
    ...operational,
    knowledgeEvolutionRoot,
    learningDatabase,
    diagnosesRoot,
    candidatesRoot,
    approvedRoot,
    auditRoot,
    staticKnowledgeFile,
    learningInput: {
      dataRoot: operational.root,
      learningLedgerFile: learningDatabase,
    },
  };
}

const dirtyCompletedDiagnosis = CompletedDiagnosisSchema.parse({
  id: "diagnosis-learning-reset",
  ticketId: "TKT-1001",
  problem: "The deployment retained an old credential.",
  symptoms: ["Requests return 401 after credential rotation."],
  evidenceUsed: ["The active and deployed credential versions differ."],
  evidenceReferences: [{
    id: "request-id",
    labelAtDiagnosis: "Request ID",
    source: "operator",
  }],
  ownerTeam: "api-platform",
  fixSteps: ["Refresh the deployed credential."],
  verificationSteps: ["Confirm a new request succeeds."],
  completedAt: "2026-08-12T10:04:00.000Z",
});

const dirtyKnowledgeCandidate: KnowledgeCandidate = {
  id: "known-cause-learning-reset",
  kind: "known-cause",
  name: "Stale deployment credential",
  summary: "A deployment can retain a rotated credential.",
  triggerPatterns: ["Requests return 401 after credential rotation."],
  evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
  timeConstraints: ["Applies after credential rotation."],
  diagnosticSteps: ["Compare deployed and active credential versions."],
  fixSteps: ["Refresh the deployed credential."],
  verificationSteps: ["Confirm a new request succeeds."],
  customerSafeExplanation: "We found a configuration mismatch and are refreshing it.",
  operatorRationale: "The completed diagnosis identifies an old deployed credential.",
  owner: "api-platform",
  version: 1,
  status: "candidate",
  supportingDiagnosisIds: [dirtyCompletedDiagnosis.id],
  supportingTicketIds: [dirtyCompletedDiagnosis.ticketId],
  provenance: { source: "completed-diagnoses", recordedAt: "2026-08-12T10:05:00.000Z" },
  deterministicScores: { confidence: 0.9, support: 1 },
  deterministicReasons: ["A completed diagnosis supports the candidate."],
  contradictions: [],
  validationStatus: "valid",
  evidencePolicyMetadata: { derivedEvidenceIds: ["request-id"], operatorAddedEvidenceIds: [] },
  objectId: "known-cause-learning-reset",
  sourceVersion: 1,
};

const dirtyLearningEvent: LearningEvent = {
  id: "81111111-1111-4111-8111-111111111111",
  occurredAt: "2026-08-12T10:04:00.000Z",
  actor: "support-lead",
  correlationId: "82222222-2222-4222-8222-222222222222",
  ticketId: dirtyCompletedDiagnosis.ticketId,
  diagnosisId: dirtyCompletedDiagnosis.id,
  eventType: "diagnosis-approved",
  payload: {
    evidenceIds: ["request-id"],
    knowledgeArticleIds: [],
    provenance: "Operator-reviewed diagnosis record.",
  },
};

const dirtyKnowledgeAudit: KnowledgeAuditEvent = {
  id: "audit-learning-reset",
  candidateId: dirtyKnowledgeCandidate.id,
  action: "candidate-reviewed",
  actor: "support-lead",
  timestamp: "2026-08-12T10:06:00.000Z",
  supportIds: [dirtyCompletedDiagnosis.id],
  reviewedFields: ["summary"],
  result: "approved-for-review",
};

async function assertPristineLearningBaseline(
  harness: Awaited<ReturnType<typeof dirtyLearningHarness>>,
): Promise<void> {
  const ledger = new SqliteLearningLedger(harness.learningDatabase);
  await ledger.initialize();
  const store = new SqliteKnowledgeEvolutionStore(ledger.getDatabase());
  await store.initialize();
  try {
    await expect(ledger.snapshot()).resolves.toEqual([]);
    await expect(store.listCandidates()).resolves.toEqual([]);
    await expect(store.listApproved()).resolves.toEqual([]);
    await expect(store.listVersionsAsOf("9999-12-31T23:59:59.999Z")).resolves.toEqual([]);
    await expect(store.listHeadMappings()).resolves.toEqual(new Map());
    await expect(store.list()).resolves.toEqual([]);
  } finally {
    ledger.close();
  }
  await expect(new DiagnosisRepository(harness.diagnosesRoot).list()).resolves.toEqual([]);
  expect(directoryManifest(harness.candidatesRoot)).toEqual([]);
  expect(directoryManifest(harness.approvedRoot)).toEqual([]);
  expect(directoryManifest(harness.auditRoot)).toEqual([]);
}

function learningResourceSnapshot(
  harness: Awaited<ReturnType<typeof dirtyLearningHarness>>,
): unknown {
  return {
    database: fileHash(harness.learningDatabase),
    sidecars: ["-journal", "-wal", "-shm"].map((suffix) => ({
      suffix,
      hash: existsSync(`${harness.learningDatabase}${suffix}`)
        ? fileHash(`${harness.learningDatabase}${suffix}`)
        : undefined,
    })),
    diagnoses: directoryManifest(harness.diagnosesRoot),
    candidates: directoryManifest(harness.candidatesRoot),
    approved: directoryManifest(harness.approvedRoot),
    audit: directoryManifest(harness.auditRoot),
  };
}

async function readLearningLogicalState(
  harness: Awaited<ReturnType<typeof dirtyLearningHarness>>,
): Promise<unknown> {
  const ledger = new SqliteLearningLedger(harness.learningDatabase);
  await ledger.initialize();
  const store = new SqliteKnowledgeEvolutionStore(ledger.getDatabase());
  try {
    await store.initialize();
    return {
      events: await ledger.snapshot(),
      candidates: await store.listCandidates(),
      approved: await store.listApproved(),
      versions: await store.listVersionsAsOf("9999-12-31T23:59:59.999Z"),
      heads: [...(await store.listHeadMappings()).entries()],
      audits: await store.list(),
      diagnoses: await new DiagnosisRepository(harness.diagnosesRoot).list(),
      legacyCandidates: directoryManifest(harness.candidatesRoot),
      legacyApproved: directoryManifest(harness.approvedRoot),
      legacyAudits: directoryManifest(harness.auditRoot),
    };
  } finally {
    ledger.close();
  }
}

function directoryManifest(root: string): Array<{ path: string; hash: string }> {
  if (!existsSync(root)) return [];
  const manifest: Array<{ path: string; hash: string }> = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) visit(path, relativePath);
      else manifest.push({ path: relativePath, hash: fileHash(path) });
    }
  };
  visit(root, "");
  return manifest.sort((left, right) => left.path.localeCompare(right.path));
}

function learningResetArtifacts(
  harness: Awaited<ReturnType<typeof dirtyLearningHarness>>,
): string[] {
  return readdirSync(harness.knowledgeEvolutionRoot)
    .filter((name) => name.includes(".reset-"))
    .map((name) => join(harness.knowledgeEvolutionRoot, name))
    .sort();
}

async function blockLearningDatabaseBackup(
  harness: Awaited<ReturnType<typeof dirtyLearningHarness>>,
): Promise<string> {
  let temporaryDatabase: string | undefined;
  await waitForCondition(() => {
    temporaryDatabase = learningResetArtifacts(harness)
      .find((path) => path.includes("learning.sqlite.reset-") && path.endsWith(".tmp"));
    return temporaryDatabase !== undefined;
  });
  const backupDatabase = temporaryDatabase!
    .replace(/\.reset-([^.]+)\.tmp$/, ".reset-backup-$1");
  mkdirSync(backupDatabase);
  return backupDatabase;
}

function operationalStateIsPristine(
  harness: Awaited<ReturnType<typeof dirtyLearningHarness>>,
): boolean {
  try {
    return readSnapshots(harness.databasePath).every((snapshot) =>
      snapshot.ticketRevisions.length === 0
      && snapshot.recommendations.length === 0
      && snapshot.messages.length === 0
      && snapshot.diagnoses.length === 0
      && snapshot.events.length === 0
      && snapshot.traces.length === 0
    );
  } catch {
    return false;
  }
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for reset state transition.");
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 0));
  }
}

function addDirtyOperationalState(store: OperationalSqliteStore, ticket: Ticket): void {
  const updated: Ticket = {
    ...ticket,
    revision: ticket.revision + 1,
    status: "in-progress",
    updatedAt: "2026-08-12T10:00:00.000Z",
  };
  const recommendation = TriageRecommendationSchema.parse({
    id: "10000000-0000-4000-8000-000000000001",
    ticketId: ticket.id,
    sourceRevision: updated.revision,
    category: updated.category,
    priority: updated.priority,
    team: updated.team,
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    knowledgeArticleIds: [],
    draftCustomerResponse: "Please share the request identifier.",
    rationale: "The request identifier is needed for diagnosis.",
    confidence: 0.8,
    recommendedNextAction: "Review the request identifier.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "pending",
    createdAt: "2026-08-12T10:01:00.000Z",
  });
  const ids = {
    updateEvent: "20000000-0000-4000-8000-000000000001",
    recommendationEvent: "20000000-0000-4000-8000-000000000002",
    messageEvent: "20000000-0000-4000-8000-000000000003",
    diagnosisEvent: "20000000-0000-4000-8000-000000000004",
    outboxEvent: "20000000-0000-4000-8000-000000000005",
    message: "30000000-0000-4000-8000-000000000001",
    trace: "40000000-0000-4000-8000-000000000001",
    outbox: "50000000-0000-4000-8000-000000000001",
    command: "60000000-0000-4000-8000-000000000001",
    otherCommand: "60000000-0000-4000-8000-000000000002",
    delivery: "70000000-0000-4000-8000-000000000001",
  } as const;
  store.transaction((unit) => {
    const request = { ticketId: ticket.id, expectedRevision: ticket.revision, status: updated.status };
    const requestHash = canonicalRequestHash("ticket-update", request);
    expect(unit.beginCommand(ids.command, "ticket-update", request)).toBe("new");
    const [sequence] = unit.allocateEventSequences(ticket.id, 1);
    unit.appendEvent({
      id: ids.updateEvent,
      ticketId: ticket.id,
      sequence: sequence!,
      occurredAt: updated.updatedAt,
      actor: "operator",
      action: "ticket-updated",
      commandId: ids.command,
      facts: { status: updated.status, revision: updated.revision },
    });
    unit.updateTicket(updated, ticket.revision);
    unit.appendTicketRevision({
      ticketId: ticket.id,
      revision: updated.revision,
      ticket: updated,
      operationalEventId: ids.updateEvent,
      createdAt: updated.updatedAt,
    });
    unit.persistCommandResult(ids.command, requestHash, {
      operation: "ticket-update",
      tickets: [{
        ticketId: ticket.id,
        operationalEventIds: [ids.updateEvent],
        resultingRevision: updated.revision,
      }],
    });
  });
  store.transaction((unit) => {
    const sequences = unit.allocateEventSequences(ticket.id, 4);
    unit.appendEvent({
      id: ids.recommendationEvent,
      ticketId: ticket.id,
      sequence: sequences[0]!,
      occurredAt: recommendation.createdAt,
      actor: "operator",
      action: "recommendation-submitted",
      commandId: ids.otherCommand,
      facts: { status: "pending", sourceRevision: updated.revision },
    });
    unit.insertRecommendation(recommendation);
    unit.appendRecommendationRevision({
      recommendation,
      operationalEventId: ids.recommendationEvent,
      createdAt: recommendation.createdAt,
    });
    unit.appendEvent({
      id: ids.messageEvent,
      ticketId: ticket.id,
      sequence: sequences[1]!,
      occurredAt: "2026-08-12T10:02:00.000Z",
      actor: "customer",
      action: "customer-reply-received",
      commandId: ids.otherCommand,
      facts: { messageId: ids.message },
    });
    unit.insertMessage({
      id: ids.message,
      ticketId: ticket.id,
      operationalEventId: ids.messageEvent,
      kind: "customer",
      createdAt: "2026-08-12T10:02:00.000Z",
      body: "The issue still occurs.",
    });
    unit.appendTrace({
      id: ids.trace,
      operationalEventId: ids.messageEvent,
      ticketId: ticket.id,
      occurredAt: "2026-08-12T10:02:00.000Z",
      actor: "operator",
      traceType: "lifecycle",
      stage: "customer-reply-received",
      outcome: "success",
    });
    unit.appendEvent({
      id: ids.diagnosisEvent,
      ticketId: ticket.id,
      sequence: sequences[2]!,
      occurredAt: "2026-08-12T10:02:30.000Z",
      actor: "operator",
      action: "diagnosis-completed",
      commandId: ids.otherCommand,
      facts: { diagnosisOutcome: "completed", knowledgeArticleIds: [] },
    });
    unit.insertDiagnosis({
      operationalEventId: ids.diagnosisEvent,
      diagnosis: CompletedDiagnosisSchema.parse({
        id: "diagnosis-demo-reset",
        ticketId: ticket.id,
        problem: "The request remains unavailable after retry.",
        symptoms: ["The request returns an error."],
        evidenceUsed: ["The request identifier was reviewed."],
        evidenceReferences: [{
          id: "request-id",
          labelAtDiagnosis: "Request ID",
          source: "operator",
        }],
        ownerTeam: "api-platform",
        fixSteps: ["Apply the governed service correction."],
        verificationSteps: ["Confirm a new request succeeds."],
        completedAt: "2026-08-12T10:02:30.000Z",
      }),
    });
    const envelope: LearningCaptureEnvelope = {
      operationalEventId: ids.outboxEvent,
      deliveryKey: ids.delivery,
      occurredAt: "2026-08-12T10:03:00.000Z",
      actor: "operator",
      ticketId: ticket.id,
      eventType: "fix-available",
      outcomeStatus: "available",
      provenance: "Sanitized operational outcome: fix-available.",
    };
    unit.appendEvent({
      id: ids.outboxEvent,
      ticketId: ticket.id,
      sequence: sequences[3]!,
      occurredAt: envelope.occurredAt,
      actor: envelope.actor,
      action: "fix-available",
      commandId: ids.otherCommand,
      facts: { outcome: "available" },
    });
    unit.appendLearningCaptureOutbox({
      id: ids.outbox,
      operationalEventId: ids.outboxEvent,
      deliveryKey: ids.delivery,
      envelope,
      status: "pending",
      attempts: 0,
      createdAt: envelope.occurredAt,
    });
  });
}

function assertPristineBaseline(databasePath: string, expectedTickets: readonly Ticket[]): void {
  const store = OperationalSqliteStore.open(databasePath);
  store.initialize();
  try {
    expect(store.readImportState()).toBe("native");
    const snapshots = store.listWorkflowSnapshots();
    expect(new Map(snapshots.map(({ ticket }) => [ticket.id, ticket])))
      .toEqual(new Map(expectedTickets.map((ticket) => [ticket.id, ticket])));
    for (const snapshot of snapshots) {
      expect(snapshot.ticketRevisions).toEqual([]);
      expect(snapshot.recommendations).toEqual([]);
      expect(snapshot.recommendationRevisions).toEqual([]);
      expect(snapshot.messages).toEqual([]);
      expect(snapshot.diagnoses).toEqual([]);
      expect(snapshot.events).toEqual([]);
      expect(snapshot.traces).toEqual([]);
    }
    expect(store.listPendingOutbox()).toEqual([]);
  } finally {
    store.close();
  }
  const database = new Database(databasePath, { readonly: true });
  try {
    for (const table of derivedTables) {
      const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
      expect(row.count, `${table} must be empty`).toBe(0);
    }
  } finally {
    database.close();
  }
}

function readSnapshots(databasePath: string) {
  const store = OperationalSqliteStore.open(databasePath);
  store.initialize();
  try {
    return store.listWorkflowSnapshots();
  } finally {
    store.close();
  }
}

function resetArtifacts(databasePath: string): string[] {
  const base = databasePath.split(/[\\/]/).at(-1)!;
  return readdirSync(dirname(databasePath))
    .filter((name) => name.startsWith(`${base}.reset-`))
    .map((name) => join(dirname(databasePath), name));
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function startLeaseHolder(dataRoot: string): Promise<ChildProcess> {
  const transpiledLease = ts.transpileModule(
    readFileSync(resolve("src", "demo-state-lease.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const modulePath = join(dataRoot, "demo-state-lease.mjs");
  writeFileSync(modulePath, transpiledLease);
  const moduleUrl = pathToFileURL(modulePath).href;
  const script = [
    `import { acquireDemoStateUsageLease } from ${JSON.stringify(moduleUrl)};`,
    `const lease = acquireDemoStateUsageLease(${JSON.stringify(dataRoot)});`,
    `process.send?.("ready");`,
    `process.on("message", (message) => { if (message === "release") { lease.release(); process.exit(0); } });`,
  ].join("\n");
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  await new Promise<void>((resolveReady, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.once("message", (message) => {
      if (message === "ready") resolveReady();
    });
    child.once("exit", (code) => reject(new Error(`Lease holder exited (${code}): ${stderr}`)));
  });
  return child;
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
}
