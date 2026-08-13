import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import type { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import {
  createRuntimeDependencies,
  type RuntimeDependencies,
} from "../src/runtime.js";

const roots: string[] = [];
const ticketId = "TKT-1010";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("operational diagnosis persistence", () => {
  it("preserves the original reviewable diagnosis across a runtime restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "operational-diagnosis-restart-"));
    roots.push(root);
    const operationalDatabase = join(root, "operational.sqlite");
    const env = {
      TRIAGE_DATA_ROOT: root,
      TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      TRIAGE_LEARNING_LEDGER_PATH: join(root, "knowledge-evolution", "learning.sqlite"),
      OPERATIONAL_DB_PATH: operationalDatabase,
    };
    resetOperationalDemoState({
      operationalDatabase,
      seedFile: env.TRIAGE_SEED_FILE,
      dataRoot: root,
    });

    let currentTime = Date.parse("2026-08-13T09:00:00.000Z");
    const now = () => new Date(currentTime);
    let runtime = await createRuntimeDependencies({ env, now });
    let server = createApprovalDeskHttpServer(runtime);
    let baseUrl = await listen(server);

    try {
      const evaluation = await requestJson(baseUrl, `/api/tickets/${ticketId}/recommendations`, {
        method: "POST",
        headers: commandHeaders(1),
        body: JSON.stringify({
          actor: "approval-desk",
          aiPreference: "deterministic",
          customerReplies: [{
            id: "restart-complete-blank-page-evidence",
            createdAt: "2026-08-13T08:59:00.000Z",
            body:
              "The campaign name is Summer Flash Sale. The failure timestamp was 2026-08-13 08:55 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
          }],
        }),
      }, 201);
      const recommendation = evaluation.recommendation;

      currentTime += 60_000;
      await requestJson(baseUrl, `/api/recommendations/${recommendation.id}/approve`, {
        method: "POST",
        headers: commandHeaders(2),
        body: JSON.stringify({
          ticketId,
          expectedRevision: recommendation.sourceRevision,
          approvedFields: ["category", "priority", "team", "customerResponse"],
          editedCustomerResponse: recommendation.draftCustomerResponse,
          actor: "restart-reviewer",
          confirm: true,
        }),
      }, 200);

      currentTime += 60_000;
      await requestJson(baseUrl, `/api/recommendations/${recommendation.id}/mark-sent`, {
        method: "POST",
        headers: commandHeaders(3),
        body: JSON.stringify({
          ticketId,
          actor: "restart-reviewer",
          automaticReplyEnabled: false,
        }),
      }, 200);

      currentTime += 60_000;
      const recorded = await requestJson(baseUrl, `/api/tickets/${ticketId}/diagnosis`, {
        method: "POST",
        headers: commandHeaders(4),
        body: JSON.stringify({ actor: "product-support" }),
      }, 201);
      const diagnosisId = recorded.auditEvent.id;
      const originalDiagnosis = recorded.auditEvent.after.diagnosis;
      expect(originalDiagnosis).toMatchObject({
        status: "completed",
        causeType: "performance",
        owner: "engineering",
      });

      const beforeRestartSnapshot = operationalStore(runtime)
        .readWorkflowSnapshot(ticketId);
      expect(beforeRestartSnapshot.diagnoses).toHaveLength(1);
      expect(beforeRestartSnapshot.diagnoses[0]).toMatchObject({
        diagnosis: { ticketId },
        operationalEventId: diagnosisId,
        originalAudit: {
          id: diagnosisId,
          ticketId,
          after: { diagnosis: originalDiagnosis },
        },
      });
      expect(beforeRestartSnapshot.diagnoses[0]?.originalAudit).toEqual(recorded.auditEvent);
      expect(runtime.operationalDiagnoses).toBeDefined();
      expect(await runtime.operationalDiagnoses!.list()).toEqual(
        beforeRestartSnapshot.diagnoses,
      );
      expect(await runtime.operationalDiagnoses!.list(ticketId)).toEqual(
        beforeRestartSnapshot.diagnoses,
      );
      expect(await runtime.operationalDiagnoses!.list("TKT-1001")).toEqual([]);

      const detachedRecords = await runtime.operationalDiagnoses!.list(ticketId);
      (detachedRecords[0]!.originalAudit.after as Record<string, unknown>).diagnosis = {
        tampered: true,
      };
      expect((await runtime.operationalDiagnoses!.list(ticketId))[0]?.originalAudit)
        .toEqual(recorded.auditEvent);
      const beforeRestart = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses`,
        undefined,
        200,
      );
      expect(beforeRestart.diagnoses).toHaveLength(1);
      expect(beforeRestart.diagnoses[0].originalDiagnosis).toMatchObject({
        id: diagnosisId,
        after: { diagnosis: originalDiagnosis },
      });

      await closeServer(server);
      runtime.close();

      runtime = await createRuntimeDependencies({ env, now });
      server = createApprovalDeskHttpServer(runtime);
      baseUrl = await listen(server);

      const afterRestartSnapshot = operationalStore(runtime)
        .readWorkflowSnapshot(ticketId);
      expect(afterRestartSnapshot.diagnoses).toHaveLength(1);
      expect(afterRestartSnapshot.diagnoses[0]).toMatchObject({
        diagnosis: { ticketId },
        operationalEventId: diagnosisId,
        originalAudit: {
          id: diagnosisId,
          ticketId,
          after: { diagnosis: originalDiagnosis },
        },
      });
      expect(afterRestartSnapshot.diagnoses[0]?.originalAudit).toEqual(recorded.auditEvent);
      const afterRestart = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses`,
        undefined,
        200,
      );
      expect(afterRestart.diagnoses).toHaveLength(1);
      expect(afterRestart.diagnoses[0].originalDiagnosis).toMatchObject({
        id: diagnosisId,
        after: { diagnosis: originalDiagnosis },
      });

      const { diagnosticState: _diagnosticState, ...confirmedDiagnosis } =
        originalDiagnosis;
      currentTime += 60_000;
      const confirmed = await runtime.service.recordDiagnosis({
        ticketId,
        actor: "product-support",
        diagnosedAt: now().toISOString(),
        diagnosis: { ...confirmedDiagnosis, confidence: "confirmed" },
        knowledgeArticleIds: recorded.auditEvent.knowledgeArticleIds,
      }, { commandId: operationalCommandId(5) });
      const reviewDiagnosisId = confirmed.id;
      const reviewOriginalDiagnosis = confirmed.after.diagnosis as Record<
        string,
        unknown
      >;

      await closeServer(server);
      runtime.close();
      runtime = await createRuntimeDependencies({ env, now });
      server = createApprovalDeskHttpServer(runtime);
      baseUrl = await listen(server);

      const reviewableAfterRestart = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses`,
        undefined,
        200,
      );
      const reviewableView = diagnosisView(
        reviewableAfterRestart,
        reviewDiagnosisId,
      );
      const editedDiagnosis = {
        ...reviewOriginalDiagnosis,
        recommendedNextAction:
          "Apply the governed performance correction and verify a fresh export.",
      };
      currentTime += 60_000;
      const approved = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses/${reviewDiagnosisId}/review`,
        {
          method: "POST",
          headers: commandHeaders(6),
          body: JSON.stringify({
            decision: "approve",
            sourceTicketRevision: reviewableView.sourceTicketRevision,
            sourceConversationWatermark: reviewableView.sourceConversationWatermark,
            editedDiagnosis,
            actor: "restart-reviewer",
          }),
        },
        201,
      );
      expect(diagnosisView(approved, reviewDiagnosisId)).toMatchObject({
        originalDiagnosis: {
          id: reviewDiagnosisId,
          after: { diagnosis: reviewOriginalDiagnosis },
        },
        latestReview: { decision: "approve", editedDiagnosis },
        stale: false,
      });

      await closeServer(server);
      runtime.close();
      runtime = await createRuntimeDependencies({ env, now });
      server = createApprovalDeskHttpServer(runtime);
      baseUrl = await listen(server);

      const approvedAfterRestart = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses`,
        undefined,
        200,
      );
      expect(diagnosisView(approvedAfterRestart, reviewDiagnosisId)).toMatchObject({
        originalDiagnosis: {
          id: reviewDiagnosisId,
          after: { diagnosis: reviewOriginalDiagnosis },
        },
        latestReview: { decision: "approve", editedDiagnosis },
      });

      currentTime += 60_000;
      const reply = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/customer-replies`,
        {
          method: "POST",
          headers: commandHeaders(7),
          body: JSON.stringify({
            actor: "customer",
            body: "The blank export still reproduces after the approved diagnostic review.",
          }),
        },
        201,
      );
      const staleView = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses`,
        undefined,
        200,
      );
      expect(diagnosisView(staleView, reviewDiagnosisId)).toMatchObject({
        originalDiagnosis: { id: reviewDiagnosisId },
        latestReview: { decision: "approve", editedDiagnosis },
        stale: true,
        staleReasons: expect.arrayContaining(["newer-customer-reply"]),
      });

      const currentTicket = await runtime.tickets.get(ticketId);
      const replyWatermark = {
        state: "reply",
        id: reply.auditEvent.id,
        timestamp: reply.auditEvent.timestamp,
      };
      currentTime += 60_000;
      const revalidated = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses/${reviewDiagnosisId}/review`,
        {
          method: "POST",
          headers: commandHeaders(8),
          body: JSON.stringify({
            decision: "revalidate",
            sourceTicketRevision: currentTicket.revision,
            sourceConversationWatermark: replyWatermark,
            editedDiagnosis,
            actor: "restart-reviewer",
            rationale: "The newer customer reply confirms the reviewed diagnosis.",
          }),
        },
        201,
      );
      expect(diagnosisView(revalidated, reviewDiagnosisId)).toMatchObject({
        latestReview: { decision: "revalidate", editedDiagnosis },
        stale: false,
        staleReasons: [],
      });

      await closeServer(server);
      runtime.close();
      runtime = await createRuntimeDependencies({ env, now });
      server = createApprovalDeskHttpServer(runtime);
      baseUrl = await listen(server);

      const revalidatedAfterRestart = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses`,
        undefined,
        200,
      );
      expect(diagnosisView(revalidatedAfterRestart, reviewDiagnosisId)).toMatchObject({
        latestReview: { decision: "revalidate", editedDiagnosis },
        stale: false,
      });

      currentTime += 60_000;
      const rejected = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses/${reviewDiagnosisId}/review`,
        {
          method: "POST",
          headers: commandHeaders(9),
          body: JSON.stringify({
            decision: "reject",
            sourceTicketRevision: currentTicket.revision,
            sourceConversationWatermark: replyWatermark,
            editedDiagnosis,
            actor: "restart-reviewer",
            rationale: "A specialist review found the diagnosis unsuitable for authority.",
          }),
        },
        201,
      );
      expect(diagnosisView(rejected, reviewDiagnosisId)).toMatchObject({
        latestReview: { decision: "reject", editedDiagnosis },
      });

      await closeServer(server);
      runtime.close();
      runtime = await createRuntimeDependencies({ env, now });
      server = createApprovalDeskHttpServer(runtime);
      baseUrl = await listen(server);

      const rejectedAfterRestart = await requestJson(
        baseUrl,
        `/api/tickets/${ticketId}/diagnoses`,
        undefined,
        200,
      );
      expect(diagnosisView(rejectedAfterRestart, reviewDiagnosisId)).toMatchObject({
        originalDiagnosis: {
          id: reviewDiagnosisId,
          after: { diagnosis: reviewOriginalDiagnosis },
        },
        latestReview: { decision: "reject", editedDiagnosis },
      });
    } finally {
      await closeServer(server);
      runtime.close();
    }
  });
});

function commandHeaders(sequence: number): Record<string, string> {
  return {
    "content-type": "application/json",
    "Idempotency-Key": operationalCommandId(sequence),
  };
}

function operationalCommandId(sequence: number): string {
  return `a1000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function diagnosisView(body: any, diagnosisId: string): any {
  const view = body.diagnoses.find(
    (candidate: any) => candidate.originalDiagnosis.id === diagnosisId,
  );
  expect(view, `Diagnosis ${diagnosisId} was not returned.`).toBeDefined();
  return view;
}

async function listen(
  server: ReturnType<typeof createApprovalDeskHttpServer>,
): Promise<string> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(
  server: ReturnType<typeof createApprovalDeskHttpServer>,
): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
  });
}

async function requestJson(
  baseUrl: string,
  path: string,
  init: RequestInit | undefined,
  expectedStatus: number,
): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(expectedStatus);
  return body;
}

function operationalStore(runtime: RuntimeDependencies): OperationalSqliteStore {
  return runtime.operationalStore as OperationalSqliteStore;
}
