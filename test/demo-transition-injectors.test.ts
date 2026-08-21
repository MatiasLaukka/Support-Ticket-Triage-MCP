import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import { TriageRecommendationSchema } from "../src/domain.js";
import type { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { createRuntimeDependencies, type RuntimeDependencies } from "../src/runtime.js";

const roots: string[] = [];
const runtimes: Array<Awaited<ReturnType<typeof createRuntimeDependencies>>> = [];
const servers: Array<ReturnType<typeof createApprovalDeskHttpServer>> = [];
const ticketId = "TKT-1001" as const;
const commandId = "77777777-7777-4777-8777-777777777777";

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => new Promise<void>((done) => {
    server.close(() => done());
  })));
  for (const runtime of runtimes.splice(0)) runtime.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("development demo transition injectors", () => {
  it.each([
    { name: "the explicit option is absent", enableDemoInjectors: false, nodeEnv: "test" },
    { name: "the runtime is production", enableDemoInjectors: true, nodeEnv: "production" },
  ])("is unavailable when $name", async ({ enableDemoInjectors, nodeEnv }) => {
    const fixture = await startFixture({ enableDemoInjectors, nodeEnv });

    const response = await fixture.json(`/api/demo/tickets/${ticketId}/inject`, {
      method: "POST",
      headers: { "idempotency-key": commandId },
      body: JSON.stringify({
        action: "customer-reply",
        actor: "demo-operator",
        body: "The affected event is still delayed.",
      }),
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found." },
    });
    expect(fixture.runtime.operationalStore!.readWorkflowSnapshot(ticketId).events).toEqual([]);
  });

  it("runs a real command, commits its event, and returns the refreshed lifecycle envelope", async () => {
    const fixture = await startFixture({ enableDemoInjectors: true, nodeEnv: "test" });

    const injected = await fixture.json(`/api/demo/tickets/${ticketId}/inject`, {
      method: "POST",
      headers: { "idempotency-key": commandId },
      body: JSON.stringify({
        action: "customer-reply",
        actor: "demo-operator",
        body: "The affected event is still delayed.",
      }),
    });

    expect(injected.status).toBe(201);
    expect(injected.body).toMatchObject({
      action: "customer-reply",
      command: "add-customer-reply",
      auditEvent: {
        action: "customer-reply-received",
        ticketId,
      },
      operatorGuidance: expect.any(Object),
      lifecycle: expect.any(Object),
    });
    const store = fixture.runtime.operationalStore as OperationalSqliteStore;
    const snapshot = store.readWorkflowSnapshot(ticketId);
    const commandResult = store.transaction((unit) => unit.readCommandResult(commandId));
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]).toMatchObject({
      action: "customer-reply-received",
      commandId,
    });
    expect(commandResult).toMatchObject({
      operation: "add-customer-reply",
      tickets: [{ ticketId, operationalEventIds: [snapshot.events[0]!.id] }],
    });

    const refreshed = await fixture.json(`/api/tickets/${ticketId}`);
    expect(injected.body.operatorGuidance).toEqual(refreshed.body.operatorGuidance);
    expect(injected.body.lifecycle).toEqual(refreshed.body.lifecycle);
  });

  it("records verification success through the real close command", async () => {
    const fixture = await startFixture({ enableDemoInjectors: true, nodeEnv: "test" });
    const diagnosisId = await seedReadyForCloseWorkflow(fixture.runtime);
    const closeCommandId = "88888888-8888-4888-8888-888888888888";
    const ticketBeforeClose = await fixture.runtime.tickets.get(ticketId);
    const expectedRevision = ticketBeforeClose.revision + 1;

    const verified = await fixture.json(`/api/demo/tickets/${ticketId}/inject`, {
      method: "POST",
      headers: { "idempotency-key": closeCommandId },
      body: JSON.stringify({
        action: "verification-success",
        actor: "demo-operator",
      }),
    });

    expect(verified.status).toBe(201);
    expect(verified.body).toMatchObject({
      action: "verification-success",
      command: "close-ticket",
      ticket: { id: ticketId, status: "resolved", revision: expectedRevision },
      auditEvent: {
        action: "ticket-updated",
        ticketId,
        after: { status: "resolved", revision: expectedRevision },
      },
      lifecycle: { phase: "resolved", primaryAction: { kind: "none" } },
    });
    const store = fixture.runtime.operationalStore as OperationalSqliteStore;
    const snapshot = store.readWorkflowSnapshot(ticketId);
    expect(snapshot.events.at(-1)).toMatchObject({
      action: "ticket-updated",
      commandId: closeCommandId,
      facts: {
        status: "resolved",
        verificationType: "customer-confirmed",
        revision: expectedRevision,
      },
    });
    expect(store.listPendingOutbox().at(-1)).toMatchObject({
      operationalEventId: verified.body.auditEvent.id,
      envelope: {
        eventType: "outcome-verified",
        diagnosisId,
        verificationType: "customer-confirmed",
        outcomeStatus: "resolved",
      },
    });
  });

  it("rejects verification success when the real close blockers remain", async () => {
    const fixture = await startFixture({ enableDemoInjectors: true, nodeEnv: "test" });
    const closeCommandId = "99999999-9999-4999-8999-999999999999";

    const rejected = await fixture.json(`/api/demo/tickets/${ticketId}/inject`, {
      method: "POST",
      headers: { "idempotency-key": closeCommandId },
      body: JSON.stringify({
        action: "verification-success",
        actor: "demo-operator",
      }),
    });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatchObject({
      code: "INVALID_APPROVAL_FIELDS",
      message: expect.stringContaining("ready-to-close"),
    });
    expect(fixture.runtime.operationalStore!.readWorkflowSnapshot(ticketId).events).toEqual([]);
  });
});

async function seedReadyForCloseWorkflow(runtime: RuntimeDependencies): Promise<string> {
  const store = runtime.operationalStore as OperationalSqliteStore;
  const ticket = await runtime.tickets.get(ticketId);
  const recommendation = TriageRecommendationSchema.parse({
    id: "90000000-0000-4000-8000-000000000001",
    ticketId,
    sourceRevision: ticket.revision,
    category: ticket.category,
    priority: ticket.priority,
    team: ticket.team,
    tags: ticket.tags,
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    supportState: "ready-for-close",
    requiredEvidence: [],
    providedEvidence: [],
    missingEvidence: [],
    knowledgeArticleIds: [],
    draftCustomerResponse: "Thanks for confirming that the issue is resolved.",
    rationale: "The verified workflow is ready to close.",
    confidence: 0.95,
    recommendedNextAction: "Close the ticket.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "approved",
    createdAt: "2026-08-21T09:00:00.000Z",
  });
  store.transaction((unit) => {
    const eventId = "90000000-0000-4000-8000-000000000002";
    const [sequence] = unit.allocateEventSequences(ticketId, 1);
    unit.appendEvent({
      id: eventId,
      ticketId,
      sequence: sequence!,
      occurredAt: recommendation.createdAt,
      actor: "seed",
      action: "recommendation-submitted",
      commandId: "90000000-0000-4000-8000-000000000003",
      facts: { status: "approved", sourceRevision: ticket.revision },
    });
    unit.insertRecommendation(recommendation);
    unit.appendRecommendationRevision({
      recommendation,
      operationalEventId: eventId,
      createdAt: recommendation.createdAt,
    });
  });
  const diagnosisContext = {
    status: "completed" as const,
    causeType: "platform-delay" as const,
    customerSafeSummary: "The delayed event processing was confirmed.",
    evidenceUsed: ["request ID", "event timeline"],
    confidence: "confirmed" as const,
    owner: "engineering" as const,
    recommendedNextAction: "Verify the restored event processing.",
    doNotSay: [],
  };
  const diagnosis = await runtime.service.recordDiagnosis({
    ticketId,
    actor: "product-support",
    diagnosedAt: "2026-08-21T09:01:00.000Z",
    diagnosis: diagnosisContext,
    knowledgeArticleIds: [],
  }, { commandId: "90000000-0000-4000-8000-000000000004" });
  await runtime.service.reviewDiagnosis({
    decision: "approve",
    diagnosisId: diagnosis.id,
    ticketId,
    sourceTicketRevision: ticket.revision,
    sourceConversationWatermark: { state: "none" },
    editedDiagnosis: diagnosisContext,
    actor: "reviewer",
    reviewedAt: "2026-08-21T09:02:00.000Z",
  }, { commandId: "90000000-0000-4000-8000-000000000005" });
  store.transaction((unit) => {
    const eventId = "90000000-0000-4000-8000-000000000006";
    const messageId = "90000000-0000-4000-8000-000000000007";
    const [sequence] = unit.allocateEventSequences(ticketId, 1);
    unit.appendEvent({
      id: eventId,
      ticketId,
      sequence: sequence!,
      occurredAt: "2026-08-21T09:03:00.000Z",
      actor: "reviewer",
      action: "customer-response-sent",
      commandId: "90000000-0000-4000-8000-000000000008",
      facts: { messageId },
    });
    unit.insertMessage({
      id: messageId,
      ticketId,
      operationalEventId: eventId,
      kind: "support",
      createdAt: "2026-08-21T09:03:00.000Z",
      body: recommendation.draftCustomerResponse,
      recommendationId: recommendation.id,
    });
  });
  return diagnosis.id;
}

async function startFixture(input: {
  enableDemoInjectors: boolean;
  nodeEnv: string;
}) {
  const root = await mkdtemp(join(tmpdir(), "demo-transition-injectors-"));
  roots.push(root);
  const env = {
    NODE_ENV: input.nodeEnv,
    TRIAGE_DATA_ROOT: root,
    TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
    TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
    TRIAGE_LEARNING_LEDGER_PATH: join(root, "knowledge-evolution", "learning.sqlite"),
    OPERATIONAL_DB_PATH: join(root, "operational.sqlite"),
  };
  resetOperationalDemoState({
    operationalDatabase: env.OPERATIONAL_DB_PATH,
    seedFile: env.TRIAGE_SEED_FILE,
    dataRoot: root,
  });
  const runtime = await createRuntimeDependencies({
    env,
    now: () => new Date("2026-08-21T10:00:00.000Z"),
  });
  runtimes.push(runtime);
  const server = createApprovalDeskHttpServer(runtime, {
    enableDemoInjectors: input.enableDemoInjectors,
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    runtime,
    json: async (path: string, init?: RequestInit) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { "content-type": "application/json", ...init?.headers },
        ...init,
      });
      return { status: response.status, body: await response.json() as any };
    },
  };
}
