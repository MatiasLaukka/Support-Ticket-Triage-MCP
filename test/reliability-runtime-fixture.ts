import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import { createRuntimeDependencies, type RuntimeDependencies } from "../src/runtime.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import {
  createApprovalDeskHttpServer,
  type ApprovalDeskHttpOptions,
} from "../src/approval-desk/http.js";

export interface ReliabilityRuntimeOptions extends ApprovalDeskHttpOptions {
  omitEvaluationGuard?: boolean;
}

export async function closeReliabilityResources(
  server: Pick<Server, "close">,
  runtime: Pick<RuntimeDependencies, "close">,
): Promise<void> {
  const errors: unknown[] = [];
  try {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  } catch (error) {
    errors.push(error);
  }
  try {
    await runtime.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Reliability runtime resources could not be closed cleanly.");
  }
}

export async function openReliabilityRuntime(
  options: ReliabilityRuntimeOptions = {},
) {
  const root = await mkdtemp(join(tmpdir(), "triage-r1-"));
  const env = {
    TRIAGE_DATA_ROOT: root,
    TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
    TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
    OPERATIONAL_DB_PATH: join(root, "operational.sqlite"),
  };
  resetOperationalDemoState({
    dataRoot: root,
    seedFile: env.TRIAGE_SEED_FILE,
    operationalDatabase: env.OPERATIONAL_DB_PATH,
  });
  let time = Date.parse("2026-08-13T09:00:00Z");
  let active: { runtime: RuntimeDependencies; server: Server } | undefined;

  async function start(): Promise<{ runtime: RuntimeDependencies; server: Server }> {
    const runtime = await createRuntimeDependencies({ env, now: () => new Date(time) });
    const { omitEvaluationGuard: _omitEvaluationGuard, ...serverOptions } = options;
    const { evaluationGuard: _evaluationGuard, ...withoutGuard } = runtime;
    const server = createApprovalDeskHttpServer(
      options.omitEvaluationGuard ? withoutGuard : runtime,
      serverOptions,
    );
    try {
      await new Promise<void>((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolveListen();
        });
      });
      return { runtime, server };
    } catch (error) {
      try {
        await closeReliabilityResources(server, runtime);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Reliability runtime startup and cleanup failed.",
        );
      }
      throw error;
    }
  }

  try {
    active = await start();
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  async function stop(): Promise<void> {
    const current = active;
    if (current === undefined) return;
    await closeReliabilityResources(current.server, current.runtime);
  }

  return {
    root,
    get runtime(): RuntimeDependencies {
      if (active === undefined) throw new Error("Reliability runtime is not started.");
      return active.runtime;
    },
    advance(milliseconds: number): void {
      time += milliseconds;
    },
    async post(path: string, body: unknown, key = randomUUID()) {
      if (active === undefined) throw new Error("Reliability runtime is not started.");
      const address = active.server.address();
      if (address === null || typeof address === "string") throw new Error("No HTTP port");
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    },
    async restart(): Promise<void> {
      await stop();
      active = await start();
    },
    async close(): Promise<void> {
      try {
        await stop();
      } finally {
        active = undefined;
        await rm(root, { recursive: true, force: true });
      }
    },
  };
}
