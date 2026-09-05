import { Worker } from "node:worker_threads";
import Database from "better-sqlite3";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";
import { TicketSchema, TriageRecommendationSchema, type Ticket } from "../src/domain.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { createControlledClassificationProvider } from "../src/approval-desk/controlled-evaluation-providers.js";
import type { ClassificationReasoningProvider } from "../src/approval-desk/classification-reasoning-provider.js";
import { importOperationalData, type OperationalImportAggregate } from "../src/operational/import.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { createRuntimeDependencies, type RuntimeDependencies } from "../src/runtime.js";
import { createTriageServer } from "../src/server.js";

const roots: string[] = [];
const runtimes: RuntimeDependencies[] = [];
const clients: Client[] = [];
const mcpServers: McpServer[] = [];
const httpServers: Array<ReturnType<typeof createApprovalDeskHttpServer>> = [];
const fixedNow = "2026-08-11T12:00:00.000Z";

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  await Promise.allSettled(mcpServers.splice(0).map((server) => server.close()));
  await Promise.allSettled(httpServers.splice(0).map((server) => closeHttp(server)));
  for (const runtime of runtimes.splice(0)) closeRuntime(runtime);
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("production operational runtime parity", () => {
  it("blocks evaluation before provider work while a readable import is incomplete", async () => {
    const fixture = await runtimeFixture();
    const database = join(fixture.root, "partial-import.sqlite");
    const partial = OperationalSqliteStore.open(database);
    partial.initialize();
    partial.transaction((unit) => {
      unit.transitionImportState("empty", "import-in-progress");
      unit.insertTicket(importedTicket());
    });
    partial.close();

    let providerCalls = 0;
    const baseProvider = createControlledClassificationProvider();
    const classificationReasoningProvider: ClassificationReasoningProvider = {
      async reason(input) {
        providerCalls += 1;
        return baseProvider.reason(input);
      },
    };
    const runtime = await openRuntime(fixture, database);
    const before = operationalMutationCounts(database);
    const { baseUrl } = await startHttp(runtime, { classificationReasoningProvider });

    const response = await fetch(`${baseUrl}/api/tickets/TKT-0001/recommendations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "81000000-0000-4000-8000-000000000001",
      },
      body: JSON.stringify({ actor: "approval-desk", aiPreference: "auto" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "OPERATIONAL_NOT_READY" },
    });
    expect(providerCalls).toBe(0);
    expect(operationalMutationCounts(database)).toEqual(before);
  });

  it("owns the configured operational database and starts incomplete cutovers in restricted mode", async () => {
    const fixture = await runtimeFixture();
    const emptyDatabase = join(fixture.root, "empty.sqlite");
    const runtime = await createRuntimeDependencies({
      env: fixture.env(emptyDatabase),
      now: () => new Date(fixedNow),
    });
    runtimes.push(runtime);

    expect(runtime.paths).toMatchObject({ operationalDatabase: resolve(emptyDatabase) });
    expect(runtime.operationalStore).toBeInstanceOf(OperationalSqliteStore);
    expect(operationalStore(runtime).readImportState()).toBe("empty");
    await expect(runtime.service.addCustomerReply({
      ticketId: "TKT-0001",
      actor: "customer",
      body: "This restricted database must not accept writes.",
      receivedAt: fixedNow,
    }, { commandId: "81000000-0000-4000-8000-000000000001" }))
      .rejects.toMatchObject({ code: "OPERATIONAL_NOT_READY" });

    closeRuntime(runtime);
    expect(() => operationalStore(runtime).readImportState()).toThrow(/closed/i);
    expect(() => closeRuntime(runtime)).not.toThrow();
  });

  it("shares HTTP and MCP command replay and reloads identical causal state after restart", async () => {
    const fixture = await runtimeFixture();
    const database = join(fixture.root, "operational.sqlite");
    importTicket(database, importedTicket());

    const httpRuntime = await openRuntime(fixture, database);
    const mcpRuntime = await openRuntime(fixture, database, "mcp-learning.sqlite");
    const { baseUrl } = await startHttp(httpRuntime);
    const client = await connectMcp(mcpRuntime);
    const commandId = "82000000-0000-4000-8000-000000000001";
    const semanticReply = {
      actor: "Maya Chen",
      body: "The request still returns 503 after the latest retry.",
      source: "runtime-parity",
    };

    const missingKey = await fetch(`${baseUrl}/api/tickets/TKT-0001/customer-replies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(semanticReply),
    });
    expect(missingKey.status).toBe(400);
    await expect(missingKey.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });

    const httpMutation = await jsonRequest(`${baseUrl}/api/tickets/TKT-0001/customer-replies`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": commandId },
      body: JSON.stringify(semanticReply),
    });
    const mcpReplay = await callTool(client, "add_customer_reply", {
      ticketId: "TKT-0001",
      commandId,
      ...semanticReply,
    });
    expect(mcpReplay.isError).not.toBe(true);
    expect(mcpReplay.structuredContent).toEqual(httpMutation);

    const beforeRestart = httpRuntime.operationalStore!.readWorkflowSnapshot("TKT-0001");
    expect(beforeRestart.events.filter((event) => event.commandId === commandId)).toHaveLength(1);
    expect(beforeRestart.customerReplyWatermark).toMatchObject({ state: "reply" });

    const httpWorkflow = await jsonRequest(`${baseUrl}/api/tickets/TKT-0001`);
    const mcpWorkflow = await callTool(client, "get_ticket_workflow", { id: "TKT-0001" });
    expect(mcpWorkflow.isError).not.toBe(true);
    expect(mcpWorkflow.structuredContent).toMatchObject({
      ticket: httpWorkflow.ticket,
      recommendationSummary: httpWorkflow.recommendationSummary,
      decisionTimeline: httpWorkflow.decisionTimeline,
    });

    closeRuntime(httpRuntime);
    closeRuntime(mcpRuntime);
    const restarted = await openRuntime(fixture, database, "restart-learning.sqlite");
    const afterRestart = restarted.operationalStore!.readWorkflowSnapshot("TKT-0001");
    expect(afterRestart).toEqual(beforeRestart);
    expect(operationalStore(restarted).readRecommendation(importedRecommendation.id))
      .toEqual(importedRecommendation);

    const replayAfterRestart = await restarted.service.addCustomerReply({
      ticketId: "TKT-0001",
      receivedAt: "2026-08-11T12:05:00.000Z",
      ...semanticReply,
    }, { commandId });
    expect(replayAfterRestart).toEqual(httpMutation.auditEvent);
    expect(restarted.operationalStore!.readWorkflowSnapshot("TKT-0001")).toEqual(beforeRestart);
  });

  it("serializes concurrent runtime approvals and rolls back the stale command without sequence gaps", async () => {
    const fixture = await runtimeFixture();
    const database = join(fixture.root, "concurrent.sqlite");
    importTicket(database, importedTicket());
    const readyBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const startBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const workerModule = new URL("../dist/src/runtime.js", import.meta.url).href;
    const inputs = [
      { commandId: "83000000-0000-4000-8000-000000000001", actor: "reviewer-a", learning: "worker-a.sqlite" },
      { commandId: "83000000-0000-4000-8000-000000000002", actor: "reviewer-b", learning: "worker-b.sqlite" },
    ];
    const workerResults = inputs.map((input) => runApprovalWorker({
      workerModule,
      readyBuffer,
      startBuffer,
      env: fixture.env(database, input.learning),
      input,
    }));
    const ready = new Int32Array(readyBuffer);
    const start = new Int32Array(startBuffer);
    const deadline = Date.now() + 10_000;
    while (Atomics.load(ready, 0) !== 2 && Date.now() < deadline) {
      Atomics.wait(ready, 0, Atomics.load(ready, 0), 50);
    }
    expect(Atomics.load(ready, 0)).toBe(2);
    Atomics.store(start, 0, 1);
    Atomics.notify(start, 0, 2);

    const results = await Promise.all(workerResults);
    expect(results.filter(({ ok }) => ok)).toHaveLength(1);
    expect(results.filter(({ code }) => code === "STALE_APPROVAL" || code === "STALE_REVISION"))
      .toHaveLength(1);

    const runtime = await openRuntime(fixture, database, "concurrency-inspection.sqlite");
    const snapshot = runtime.operationalStore!.readWorkflowSnapshot("TKT-0001");
    expect(snapshot.events.map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(snapshot.events.filter(({ commandId }) => inputs.some((input) => input.commandId === commandId)))
      .toHaveLength(1);
    expect(snapshot.recommendations.find(({ id }) => id === importedRecommendation.id)?.resolution)
      .toBe("approved");
  });

  it("fails startup for a blank, newer, or corrupt operational schema without overwriting it", async () => {
    const fixture = await runtimeFixture();
    await expect(createRuntimeDependencies({ env: fixture.env("   ") }))
      .rejects.toThrow("OPERATIONAL_DB_PATH must not be blank.");

    const corrupt = join(fixture.root, "corrupt.sqlite");
    const store = OperationalSqliteStore.open(corrupt);
    store.initialize();
    store.close();
    const Database = (await import("better-sqlite3")).default;
    const raw = new Database(corrupt);
    raw.exec("DROP TRIGGER operational_events_no_update");
    raw.close();
    await expect(createRuntimeDependencies({ env: fixture.env(corrupt) }))
      .rejects.toThrow(/corrupt operational schema/i);
    const inspection = new Database(corrupt, { readonly: true });
    expect(inspection.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").get("operational_events_no_update"))
      .toBeUndefined();
    inspection.close();
  });

  it("keeps operational runtime available when the advisory learning database cannot open", async () => {
    const fixture = await runtimeFixture();
    const database = join(fixture.root, "operational-learning-failure.sqlite");
    const corruptLearning = join(fixture.root, "corrupt-learning.sqlite");
    importTicket(database, importedTicket());
    await writeFile(corruptLearning, "not a sqlite database\n", "utf8");

    const runtime = await createRuntimeDependencies({
      env: fixture.env(database, "corrupt-learning.sqlite"),
      now: () => new Date(fixedNow),
    });
    runtimes.push(runtime);

    expect(runtime.learningAvailability).toEqual({
      status: "unavailable",
      code: "LEARNING_UNAVAILABLE",
      message: expect.stringContaining("TRIAGE_LEARNING_LEDGER_PATH"),
    });
    expect(runtime.learningOutbox).toBeUndefined();
    await expect(runtime.service.addCustomerReply({
      ticketId: "TKT-0001",
      actor: "Maya Chen",
      body: "Operational truth must commit while learning is unavailable.",
      receivedAt: fixedNow,
      source: "learning-failure-regression",
    }, { commandId: "85000000-0000-4000-8000-000000000001" }))
      .resolves.toMatchObject({ action: "customer-reply-received" });
    expect(operationalStore(runtime).readWorkflowSnapshot("TKT-0001").messages)
      .toHaveLength(1);
    const { baseUrl } = await startHttp(runtime);
    expect((await fetch(`${baseUrl}/api/tickets/TKT-0001`)).status).toBe(200);
    const evaluationResponse = await fetch(`${baseUrl}/api/tickets/TKT-0001/recommendations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "85000000-0000-4000-8000-000000000002",
      },
      body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }),
    });
    expect(evaluationResponse.status).toBe(201);
    const learningResponse = await fetch(`${baseUrl}/api/knowledge-candidates/missing-candidate`);
    expect(learningResponse.status).toBe(503);
    await expect(learningResponse.json()).resolves.toEqual({
      error: {
        code: "REPOSITORY_ERROR",
        message: runtime.learningAvailability.status === "unavailable"
          ? runtime.learningAvailability.message
          : "unexpected available learning status",
      },
    });

    await rm(corruptLearning, { force: true });
    await writeFile(corruptLearning, "closed learning handle\n", "utf8");
    closeRuntime(runtime);
    const reopened = OperationalSqliteStore.open(database);
    reopened.initialize();
    expect(reopened.readWorkflowSnapshot("TKT-0001").messages).toHaveLength(1);
    reopened.close();
  });
});

const importedRecommendation = TriageRecommendationSchema.parse({
  id: "84000000-0000-4000-8000-000000000001",
  ticketId: "TKT-0001",
  sourceRevision: 0,
  category: "api",
  priority: "P2",
  team: "api-platform",
  duplicateCandidates: [],
  outageRisk: "none",
  securityRisk: "none",
  slaRisk: "possible",
  missingInformation: [],
  knowledgeArticleIds: ["api-reference"],
  draftCustomerResponse: "We are investigating the accepted request delay.",
  rationale: "Imported operator evaluation.",
  confidence: 0.9,
  recommendedNextAction: "Inspect the delayed request.",
  escalationRequired: false,
  escalationReasons: [],
  resolution: "pending",
  createdAt: "2026-08-10T12:00:00.000Z",
});

function importedTicket(): Ticket {
  return TicketSchema.parse({
    id: "TKT-0001",
    createdAt: "2026-08-10T08:00:00.000Z",
    updatedAt: "2026-08-10T08:00:00.000Z",
    customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
    subject: "Accepted API requests are delayed",
    description: "Accepted requests remain absent from the profile timeline.",
    status: "triage",
    category: "api",
    priority: "P2",
    team: "api-platform",
    tags: ["api", "delay"],
    sla: { responseDueAt: "2026-08-11T14:00:00.000Z", breached: false },
    relatedTicketIds: [],
    revision: 0,
  });
}

async function runtimeFixture() {
  const root = await mkdtemp(join(tmpdir(), "operational-runtime-parity-"));
  roots.push(root);
  const seedFile = join(root, "empty-seed.json");
  await writeFile(seedFile, "[]\n", "utf8");
  return {
    root,
    env(database: string, learning = "learning.sqlite"): NodeJS.ProcessEnv {
      return {
        TRIAGE_DATA_ROOT: join(root, "legacy-runtime"),
        TRIAGE_SEED_FILE: seedFile,
        TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
        TRIAGE_LEARNING_LEDGER_PATH: join(root, learning),
        OPERATIONAL_DB_PATH: database,
      };
    },
  };
}

function importTicket(database: string, ticket: Ticket): void {
  const store = OperationalSqliteStore.open(database);
  store.initialize();
  const eventId = "84000000-0000-4000-8000-000000000011";
  const aggregate: OperationalImportAggregate = {
    sourceId: `runtime-${ticket.id}`,
    provenance: "legacy",
    ticket,
    events: [{
      provenance: "legacy",
      id: eventId,
      ticketId: ticket.id,
      occurredAt: importedRecommendation.createdAt,
      actor: "legacy-reviewer",
      action: "recommendation-submitted",
      commandId: "84000000-0000-4000-8000-000000000012",
      facts: { reasonCode: "legacy-import" },
    }],
    ticketRevisions: [],
    messages: [],
    recommendations: [importedRecommendation],
    recommendationRevisions: [{
      recommendation: importedRecommendation,
      operationalEventId: eventId,
      createdAt: importedRecommendation.createdAt,
    }],
    diagnoses: [],
    traces: [],
  };
  importOperationalData({ store, aggregates: [aggregate] });
  store.close();
}

async function openRuntime(
  fixture: Awaited<ReturnType<typeof runtimeFixture>>,
  database: string,
  learning?: string,
): Promise<RuntimeDependencies> {
  const runtime = await createRuntimeDependencies({
    env: fixture.env(database, learning),
    now: () => new Date(fixedNow),
  });
  runtimes.push(runtime);
  return runtime;
}

function closeRuntime(runtime: RuntimeDependencies): void {
  const closable = runtime as RuntimeDependencies & { close?: () => void };
  if (closable.close !== undefined) closable.close();
  else {
    (runtime.operationalStore as OperationalSqliteStore | undefined)?.close();
    runtime.knowledgeEvolution.ledger.close();
  }
}

async function startHttp(
  runtime: RuntimeDependencies,
  options: Parameters<typeof createApprovalDeskHttpServer>[1] = {},
): Promise<{ baseUrl: string }> {
  const server = createApprovalDeskHttpServer(runtime, options);
  httpServers.push(server);
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

function operationalMutationCounts(path: string): Record<string, number> {
  const database = new Database(path, { readonly: true });
  try {
    return Object.fromEntries([
      "command_idempotency",
      "ticket_revisions",
      "conversation_messages",
      "recommendations",
      "recommendation_revisions",
      "diagnoses",
      "operational_events",
      "decision_trace_events",
      "learning_capture_outbox",
    ].map((table) => [
      table,
      (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
    ]));
  } finally {
    database.close();
  }
}

async function connectMcp(runtime: RuntimeDependencies): Promise<Client> {
  const server = createTriageServer(runtime);
  mcpServers.push(server);
  const client = new Client({ name: "operational-runtime-parity", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  return client.callTool({ name, arguments: args });
}

async function jsonRequest(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const body = await response.json();
  expect(response.ok).toBe(true);
  return body;
}

function closeHttp(server: ReturnType<typeof createApprovalDeskHttpServer>): Promise<void> {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function operationalStore(runtime: RuntimeDependencies): OperationalSqliteStore {
  return runtime.operationalStore as OperationalSqliteStore;
}

function runApprovalWorker(input: {
  workerModule: string;
  readyBuffer: SharedArrayBuffer;
  startBuffer: SharedArrayBuffer;
  env: NodeJS.ProcessEnv;
  input: { commandId: string; actor: string; learning: string };
}): Promise<{ ok: boolean; code?: string }> {
  return new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(`
      const { workerData, parentPort } = require("node:worker_threads");
      (async () => {
      const { createRuntimeDependencies } = await import(workerData.workerModule);
      const ready = new Int32Array(workerData.readyBuffer);
      const start = new Int32Array(workerData.startBuffer);
      const runtime = await createRuntimeDependencies({ env: workerData.env, now: () => new Date("${fixedNow}") });
      Atomics.add(ready, 0, 1);
      Atomics.notify(ready, 0);
      Atomics.wait(start, 0, 0);
      try {
        await runtime.service.approve({
          recommendationId: "${importedRecommendation.id}",
          ticketId: "TKT-0001",
          actor: workerData.input.actor,
          approvedFields: ["priority"],
          expectedRevision: 0,
          confirm: true,
          approvedAt: "${fixedNow}"
        }, { commandId: workerData.input.commandId });
        parentPort.postMessage({ ok: true });
      } catch (error) {
        parentPort.postMessage({ ok: false, code: error?.code });
      } finally {
        runtime.close?.();
        runtime.operationalStore?.close?.();
        runtime.knowledgeEvolution.ledger.close();
      }
      })().catch((error) => { throw error; });
    `, { eval: true, workerData: input });
    worker.once("message", resolveWorker);
    worker.once("error", rejectWorker);
    worker.once("exit", (code) => {
      if (code !== 0) rejectWorker(new Error(`Approval worker exited with code ${code}.`));
    });
  });
}
