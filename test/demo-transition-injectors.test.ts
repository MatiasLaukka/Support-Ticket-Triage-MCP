import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import type { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { createRuntimeDependencies } from "../src/runtime.js";

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
});

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
