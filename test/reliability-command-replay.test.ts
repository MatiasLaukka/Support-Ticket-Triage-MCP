import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import { openReliabilityRuntime } from "./reliability-runtime-fixture.js";
import {
  createControlledClassificationProvider,
  createControlledDraftProvider,
} from "../src/approval-desk/controlled-evaluation-providers.js";
import type { ClassificationReasoningProvider } from "../src/approval-desk/classification-reasoning-provider.js";
import { OperationalUnitOfWork } from "../src/operational/unit-of-work.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTriageServer } from "../src/server.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";

const activeRuntimes: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(activeRuntimes.splice(0).map((runtime) => runtime.close()));
});

describe("reliability command replay", () => {
  it("replays evaluation after time and runtime advance", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "approval-desk", aiPreference: "deterministic" };

    const first = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(first.status).toBe(201);
    harness.advance(60_000);
    const retry = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(retry.status).toBe(201);
    expect(retry.body.recommendation).toEqual(first.body.recommendation);
    await harness.restart();
    const restarted = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(restarted.body.recommendation).toEqual(first.body.recommendation);
    expect((await harness.runtime.recommendations.list())
      .filter((recommendation) => recommendation.ticketId === "TKT-1010")).toHaveLength(1);
  });

  it("does not call providers again for a committed replay", async () => {
    const classification = createControlledClassificationProvider();
    const drafting = createControlledDraftProvider();
    let classificationCalls = 0;
    let draftingCalls = 0;
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: {
        async reason(input) {
          classificationCalls += 1;
          return classification.reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          draftingCalls += 1;
          return drafting.draft(input);
        },
      },
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "approval-desk", aiPreference: "auto" };
    const first = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    const retry = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.recommendation).toEqual(first.body.recommendation);
    expect(classificationCalls).toBe(1);
    expect(draftingCalls).toBe(1);
  });

  it("shares the frozen evaluation preparation and replay across HTTP and MCP", async () => {
    const classification = createControlledClassificationProvider();
    const drafting = createControlledDraftProvider();
    let providerCalls = 0;
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: {
        async reason(input) {
          providerCalls += 1;
          return classification.reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          providerCalls += 1;
          return drafting.draft(input);
        },
      },
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const first = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto" },
      key,
    );
    const server = createTriageServer(harness.runtime);
    const client = new Client({ name: "reliability-mcp", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const replay = await client.callTool({
        name: "evaluate_ticket",
        arguments: {
          commandId: key,
          ticketId: "TKT-1010",
          actor: "approval-desk",
          aiPreference: "auto",
        },
      });
      expect(first.status).toBe(201);
      expect(replay.isError).not.toBe(true);
      expect((replay.structuredContent as { recommendation: unknown }).recommendation)
        .toEqual(first.body.recommendation);
      expect(providerCalls).toBe(2);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("joins same-key evaluations and conflicts on changed intent while preparation is in flight", async () => {
    const base = createControlledClassificationProvider();
    const entered = deferred();
    let calls = 0;
    const classification: ClassificationReasoningProvider = {
      async reason(input) {
        calls += 1;
        entered.resolve();
        await entered.releasePromise;
        return base.reason(input);
      },
    };
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "approval-desk", aiPreference: "auto" };
    const firstPromise = harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    await entered.reached;
    const joinedPromise = harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    const conflict = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { ...input, responseStyle: "concise" },
      key,
    );
    expect(conflict.status).toBe(409);
    expect((conflict.body.error as { code: string }).code).toBe("IDEMPOTENCY_CONFLICT");
    entered.release();
    const [first, joined] = await Promise.all([firstPromise, joinedPromise]);
    expect(first.status).toBe(201);
    expect(joined.status).toBe(201);
    expect(joined.body.recommendation).toEqual(first.body.recommendation);
    expect(calls).toBe(1);
  });

  it("uses the HTTP fallback evaluation guard when dependencies omit one", async () => {
    const base = createControlledClassificationProvider();
    const entered = deferred();
    let calls = 0;
    const classification: ClassificationReasoningProvider = {
      async reason(input) {
        calls += 1;
        if (calls === 1) {
          entered.resolve();
          await entered.releasePromise;
        }
        return base.reason(input);
      },
    };
    const harness = await openReliabilityRuntime({
      omitEvaluationGuard: true,
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    activeRuntimes.push(harness);
    const body = { actor: "approval-desk", aiPreference: "gpt-preferred" };
    const firstPromise = harness.post(
      "/api/tickets/TKT-1010/recommendations",
      body,
      randomUUID(),
    );
    await entered.reached;
    const second = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      body,
      randomUUID(),
    );
    entered.release();
    await expect(firstPromise).resolves.toMatchObject({ status: 201 });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: "EVALUATION_IN_PROGRESS" });
    expect(calls).toBe(1);
  });

  it("rejects an evaluation whose source gains a reply during provider work without a receipt", async () => {
    const base = createControlledClassificationProvider();
    const entered = deferred();
    const classification: ClassificationReasoningProvider = {
      async reason(input) {
        entered.resolve();
        await entered.releasePromise;
        return base.reason(input);
      },
    };
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const evaluation = harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto" },
      key,
    );
    await entered.reached;
    const reply = await harness.post(
      "/api/tickets/TKT-1010/customer-replies",
      { actor: "Jamie Lee", body: "The issue is still failing." },
    );
    expect(reply.status).toBe(201);
    entered.release();
    const result = await evaluation;
    expect(result.status).toBe(409);
    expect((result.body.error as { code: string }).code).toBe("STALE_APPROVAL");
    const store = harness.runtime.operationalStore as typeof harness.runtime.operationalStore & {
      readCommandReceipt(commandId: string): unknown;
    };
    expect(store.readCommandReceipt(key)).toBeUndefined();
  });

  it("rolls back the write set when receipt persistence fails before commit", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const key = randomUUID();
    const persist = vi.spyOn(OperationalUnitOfWork.prototype, "persistCommandResult")
      .mockImplementationOnce(() => { throw new Error("injected receipt failure"); });
    try {
      const failed = await harness.post(
        "/api/tickets/TKT-1010/recommendations",
        { actor: "approval-desk", aiPreference: "deterministic" },
        key,
      );
      expect(failed.status).toBe(500);
    } finally {
      persist.mockRestore();
    }
    const store = harness.runtime.operationalStore as typeof harness.runtime.operationalStore & {
      readCommandReceipt(commandId: string): unknown;
    };
    expect(store.readCommandReceipt(key)).toBeUndefined();
    const retry = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
      key,
    );
    expect(retry.status).toBe(201);
  });

  it("replays the original immutable result after the ticket advances", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "approval-desk", aiPreference: "deterministic" };
    const first = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(first.status).toBe(201);
    const reply = await harness.post(
      "/api/tickets/TKT-1010/customer-replies",
      { actor: "Jamie Lee", body: "The issue is still failing." },
    );
    expect(reply.status).toBe(201);
    const replay = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(replay.status).toBe(201);
    expect(replay.body.recommendation).toEqual(first.body.recommendation);
  });

  it("allows two runtime instances to race provider work but commits one receipt and write set", async () => {
    const base = createControlledClassificationProvider();
    const entered = deferred();
    let providerCalls = 0;
    const classification: ClassificationReasoningProvider = {
      async reason(input) {
        providerCalls += 1;
        if (providerCalls === 2) entered.resolve();
        await entered.releasePromise;
        return base.reason(input);
      },
    };
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    activeRuntimes.push(harness);

    const secondRoot = await mkdtemp(join(tmpdir(), "triage-r1-second-"));
    const sharedStore = OperationalSqliteStore.open(join(harness.root, "operational.sqlite"));
    sharedStore.initialize();
    const secondRuntime = await createRuntimeDependencies({
      env: {
        TRIAGE_DATA_ROOT: secondRoot,
        TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
        OPERATIONAL_DB_PATH: join(harness.root, "operational.sqlite"),
      },
      operationalStore: sharedStore,
      now: () => new Date("2026-08-13T09:00:00.000Z"),
    });
    const secondServer = createApprovalDeskHttpServer(secondRuntime, {
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    await listen(secondServer);
    activeRuntimes.push({
      async close() {
        await closeServer(secondServer);
        secondRuntime.close();
        await rm(secondRoot, { recursive: true, force: true });
      },
    });
    const address = secondServer.address();
    if (address === null || typeof address === "string") throw new Error("No second HTTP port");
    const key = randomUUID();
    const body = { actor: "approval-desk", aiPreference: "auto" };
    const first = harness.post("/api/tickets/TKT-1010/recommendations", body, key);
    const second = postToServer(address.port, "/api/tickets/TKT-1010/recommendations", body, key);
    await entered.reached;
    entered.release();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.status).toBe(201);
    expect(secondResult.status).toBe(201);
    expect(secondResult.body.recommendation).toEqual(firstResult.body.recommendation);
    expect(providerCalls).toBe(2);
    expect((await harness.runtime.recommendations.list())
      .filter((recommendation) => recommendation.ticketId === "TKT-1010")).toHaveLength(1);
  });
});

function deferred() {
  let resolveReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => { resolveReached = resolve; });
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  return {
    reached,
    releasePromise,
    release,
    resolve: resolveReached,
  };
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

async function postToServer(
  port: number,
  path: string,
  body: unknown,
  key: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
