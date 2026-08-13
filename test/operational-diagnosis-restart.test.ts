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
    } finally {
      await closeServer(server);
      runtime.close();
    }
  });
});

function commandHeaders(sequence: number): Record<string, string> {
  return {
    "content-type": "application/json",
    "Idempotency-Key": `a1000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
  };
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
