import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
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
import {
  acquireDemoStateUsageLease,
  prepareOperationalDemoReset,
  resetOperationalDemoState,
} from "../src/demo-reset.js";
import type { LearningCaptureEnvelope } from "../src/operational/domain.js";
import { canonicalRequestHash } from "../src/operational/idempotency.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { createRuntimeDependencies } from "../src/runtime.js";

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

function dirtyHarness(options: {
  readonly reverseSeed?: boolean;
  readonly seedOutsideDataRoot?: boolean;
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
  const databasePath = join(root, "operational.sqlite");
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
