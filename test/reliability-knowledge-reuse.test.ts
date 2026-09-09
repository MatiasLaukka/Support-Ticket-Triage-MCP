import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketSchema, type Ticket } from "../src/domain.js";
import type { DiagnosisContext } from "../src/triage-service.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import { createRuntimeDependencies, type RuntimeDependencies } from "../src/runtime.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import {
  createControlledClassificationProvider,
  createControlledDraftProvider,
} from "../src/approval-desk/controlled-evaluation-providers.js";

const runtimes: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
});

describe("integrated reliability knowledge reuse", () => {
  it("promotes matching operational diagnoses through the normal reusable read path", async () => {
    const harness = await openIntegratedRuntime();
    runtimes.push(harness);
    let firstDiagnosis: DiagnosisContext | undefined;
    const diagnosisIds: string[] = [];

    for (const ticketId of ["TKT-2101", "TKT-2102"] as const) {
      const evidence = await harness.post(`/api/tickets/${ticketId}/customer-replies`, {
        actor: "customer",
        body: "Endpoint URL https://hooks.example.test/events; delivery ID delivery-2101; failure timestamp 2026-09-08T08:30:00Z; the signing secret was rotated yesterday at 08:00 UTC; timestamp tolerance configured; endpoint response code 200; raw body handling has not changed recently.",
      });
      expect(evidence.status).toBe(201);
      const evaluation = await harness.post(`/api/tickets/${ticketId}/recommendations`, {
        actor: "approval-desk",
        aiPreference: "auto",
      });
      expect(evaluation.status, JSON.stringify(evaluation.body)).toBe(201);
      expect(evaluation.body.recommendation).toMatchObject({ missingEvidence: [] });
      const recommendation = evaluation.body.recommendation as {
        id: string;
        sourceRevision: number;
        draftCustomerResponse: string;
      };
      const approval = await harness.post(`/api/recommendations/${recommendation.id}/approve`, {
        ticketId,
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      });
      expect(approval.status, JSON.stringify(approval.body)).toBe(200);
      const sent = await harness.post(`/api/recommendations/${recommendation.id}/mark-sent`, {
        ticketId,
        actor: "reviewer",
      });
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      if (ticketId === "TKT-2101") {
        const diagnosis = await harness.post(`/api/tickets/${ticketId}/diagnosis`, {
          actor: "support-lead",
        });
        expect(diagnosis.status, JSON.stringify(diagnosis.body)).toBe(201);
        diagnosisIds.push((await harness.runtime.operationalDiagnoses!.list(ticketId)).at(-1)!.diagnosis.id);
        firstDiagnosis = (diagnosis.body.auditEvent as { after: { diagnosis: DiagnosisContext } }).after.diagnosis;
      } else {
        expect(firstDiagnosis).toBeDefined();
        await harness.runtime.service.recordDiagnosis({
          ticketId,
          actor: "support-lead",
          diagnosedAt: "2026-09-09T00:00:00.000Z",
          diagnosis: firstDiagnosis!,
          knowledgeArticleIds: ["webhook-signature-validation"],
        }, { commandId: randomUUID() });
        diagnosisIds.push((await harness.runtime.operationalDiagnoses!.list(ticketId)).at(-1)!.diagnosis.id);
      }
    }

    const beforePromotion = await harness.post("/api/tickets/TKT-2103/recommendations", {
      actor: "approval-desk",
      aiPreference: "auto",
    });
    expect(beforePromotion.status).toBe(201);
    expect(beforePromotion.body.recommendation).toMatchObject({
      knownCause: null,
    });
    await expect(harness.runtime.knowledgeEvolution.service.listReusableApproved({
      asOf: "2026-09-09T00:00:00.000Z",
    })).resolves.toMatchObject({ status: "available", contexts: [] });

    const discovery = await harness.post("/api/knowledge-candidates", {
      actor: "support-lead",
      includeGpt: false,
    });
    expect(discovery.status, JSON.stringify(discovery.body)).toBe(200);
    const candidate = (discovery.body as { candidates: Array<{
      id: string;
      version: number;
      supportingDiagnosisIds: string[];
    }> }).candidates[0];
    expect(candidate).toBeDefined();
    expect([...candidate!.supportingDiagnosisIds].sort()).toEqual([...diagnosisIds].sort());

    const approvedResponse = await harness.post(`/api/knowledge-candidates/${candidate!.id}/approve`, {
      actor: "support-lead",
      expectedVersion: candidate!.version,
      edits: {
        evidencePolicy: {
          mode: "required",
          evidenceIds: [
            "endpoint-url",
            "delivery-id",
            "signing-secret-rotation-time",
            "raw-body-change-status",
          ],
        },
      },
    });
    expect(approvedResponse.status, JSON.stringify(approvedResponse.body)).toBe(200);

    const approved = (approvedResponse.body as { object: {
      id: string;
      version: number;
      supportingDiagnosisIds: string[];
    } }).object;
    const reusable = await harness.runtime.knowledgeEvolution.service.listReusableApproved({
      asOf: "2026-09-09T00:00:00.000Z",
    });
    expect(reusable).toMatchObject({ status: "available" });
    expect(reusable.contexts).toHaveLength(1);
    expect(reusable.contexts[0]).toMatchObject({
      object: {
        id: approved.id,
        status: "approved",
        supportingDiagnosisIds: expect.arrayContaining(candidate!.supportingDiagnosisIds),
      },
      version: 1,
    });

    const laterEvidence = await harness.post("/api/tickets/TKT-2103/customer-replies", {
      actor: "customer",
      body: "Endpoint URL https://hooks.example.test/events; delivery ID delivery-2103; failure timestamp 2026-09-08T08:30:00Z; the signing secret was rotated yesterday at 08:00 UTC; timestamp tolerance configured; endpoint response code 200; raw body handling has not changed recently.",
    });
    expect(laterEvidence.status).toBe(201);
    const incompatibleOperationalRoute = await harness.post("/api/tickets/TKT-2103/recommendations", {
      actor: "approval-desk",
      aiPreference: "auto",
    });
    expect(incompatibleOperationalRoute.status).toBe(400);
    expect(incompatibleOperationalRoute.body.error).toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringContaining("knownCauseReferenceValidation"),
    });

    const afterPromotion = await evaluateThroughOperationalHttpCompatibilityPath(harness);
    expect(afterPromotion.recommendation).toMatchObject({ missingEvidence: [] });
    expect(afterPromotion.recommendation).toMatchObject({
      knownCause: approved.id,
      knownCauseRef: { objectId: approved.id, version: 1 },
      supportState: "known-cause",
    });

    await harness.restart();
    const restartedReusable = await harness.runtime.knowledgeEvolution.service.listReusableApproved({
      asOf: "2026-09-09T00:00:00.000Z",
    });
    expect(restartedReusable.contexts).toMatchObject([{
      object: { id: approved.id, status: "approved" },
      version: 1,
    }]);
    const replayed = await evaluateThroughOperationalHttpCompatibilityPath(harness);
    expect(replayed.recommendation).toMatchObject({
      knownCause: approved.id,
      knownCauseRef: { objectId: approved.id, version: 1 },
    });
  });
});

interface IntegratedRuntime {
  readonly root: string;
  readonly runtime: RuntimeDependencies;
  post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
  restart(): Promise<void>;
  close(): Promise<void>;
}

async function evaluateThroughOperationalHttpCompatibilityPath(
  harness: IntegratedRuntime,
): Promise<{ recommendation: Record<string, unknown> }> {
  const originalCommit = harness.runtime.service.commitOperationalEvaluation.bind(harness.runtime.service);
  const compatibility = vi.spyOn(harness.runtime.service, "commitOperationalEvaluation")
    .mockImplementation((unit, prepared, commandId) => {
      const { knownCauseReferenceValidation: _validation, ...serializableInput } = prepared.recommendationInput;
      return originalCommit(unit, { ...prepared, recommendationInput: serializableInput }, commandId);
    });
  try {
    const response = await harness.post("/api/tickets/TKT-2103/recommendations", {
      actor: "approval-desk",
      aiPreference: "auto",
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return { recommendation: response.body.recommendation as Record<string, unknown> };
  } finally {
    compatibility.mockRestore();
  }
}

async function openIntegratedRuntime(): Promise<IntegratedRuntime> {
  const root = await mkdtemp(join(tmpdir(), "triage-r1-knowledge-"));
  const seedFile = join(root, "tickets.json");
  const operationalDatabase = join(root, "operational.sqlite");
  const env = {
    TRIAGE_DATA_ROOT: root,
    TRIAGE_SEED_FILE: seedFile,
    TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
    TRIAGE_LEARNING_LEDGER_PATH: join(root, "knowledge-evolution", "learning.sqlite"),
    OPERATIONAL_DB_PATH: operationalDatabase,
  };
  await writeFile(seedFile, JSON.stringify([
    webhookTicket("TKT-2101"),
    webhookTicket("TKT-2102"),
    webhookTicket("TKT-2103"),
  ]), "utf8");
  resetOperationalDemoState({ dataRoot: root, seedFile, operationalDatabase });
  let now = Date.parse("2026-09-09T00:00:00.000Z");
  let active: { runtime: RuntimeDependencies; server: Server } | undefined;

  async function start(): Promise<void> {
    const runtime = await createRuntimeDependencies({ env, now: () => new Date(now) });
    const server = createApprovalDeskHttpServer(runtime, {
      classificationReasoningProvider: createControlledClassificationProvider(),
      draftProvider: createControlledDraftProvider(),
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", rejectListen);
        resolveListen();
      });
    });
    active = { runtime, server };
  }

  try {
    await start();
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  return {
    root,
    get runtime(): RuntimeDependencies {
      if (active === undefined) throw new Error("Integrated runtime is not started.");
      return active.runtime;
    },
    async post(path, body) {
      if (active === undefined) throw new Error("Integrated runtime is not started.");
      const address = active.server.address();
      if (address === null || typeof address === "string") throw new Error("No HTTP port");
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    },
    async restart() {
      if (active === undefined) throw new Error("Integrated runtime is not started.");
      await closeServer(active.server);
      await active.runtime.close();
      await start();
    },
    async close() {
      const current = active;
      active = undefined;
      if (current !== undefined) {
        await closeServer(current.server);
        await current.runtime.close();
      }
      await rm(root, { recursive: true, force: true });
    },
  };
}

function webhookTicket(id: string): Ticket {
  const description = id === "TKT-2103"
    ? "Webhook integration deliveries fail after a signing-key rotation. Webhook delivery symptoms and endpoint and signature timing are documented."
    : "Webhook deliveries fail after a signing-key rotation.";
  return TicketSchema.parse({
    id,
    createdAt: "2026-09-08T07:00:00.000Z",
    updatedAt: "2026-09-08T07:30:00.000Z",
    customer: { name: "Synthetic webhook customer", plan: "starter", region: "eu", vip: false },
    subject: description,
    description,
    status: "triage",
    tags: ["webhook"],
    sla: { responseDueAt: "2026-09-08T12:00:00.000Z", breached: false },
    revision: 0,
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}
