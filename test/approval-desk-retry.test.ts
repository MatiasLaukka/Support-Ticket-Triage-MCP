import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { startLiveApprovalDeskApp } from "./approval-desk-lifecycle-completion.e2e.test.js";

describe("Approval Desk command retry integration", () => {
  it("retries a lost evaluation response with the same command attempt and reconciles once", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "approval-desk-command-retry-"));
    const seedPath = join(dataRoot, "tickets.json");
    const operationalDatabase = join(dataRoot, "operational.sqlite");
    await writeFile(
      seedPath,
      readFileSync(resolve("data/seed/tickets.json"), "utf8"),
      "utf8",
    );

    const env = {
      TRIAGE_DATA_ROOT: dataRoot,
      TRIAGE_SEED_FILE: seedPath,
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
      OPERATIONAL_DB_PATH: operationalDatabase,
    };
    resetOperationalDemoState({ operationalDatabase, seedFile: seedPath, dataRoot });
    const deps = await createRuntimeDependencies({
      env,
      now: () => new Date("2026-08-27T09:00:00.000Z"),
    });
    const server = createApprovalDeskHttpServer(deps, { enableDemoInjectors: true });

    try {
      await new Promise<void>((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", rejectListen);
          resolveListen();
        });
      });
      const address = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const app = await startLiveApprovalDeskApp(baseUrl, {
        throwAfterResponseOnce: /\/api\/tickets\/TKT-1010\/recommendations$/,
      });

      await app.wait(50);
      app.setQueueFilter("all");
      await app.wait(50);
      await app.selectTicket("TKT-1010");

      await app.createRecommendation();

      const mutations = () => app.requests.filter((request) =>
        request.path === "/api/tickets/TKT-1010/recommendations",
      );
      expect(mutations()).toHaveLength(1);
      expect(app.el("refreshQueue").textContent).toBe("Retry action");

      await app.refreshQueue();

      expect(mutations()).toHaveLength(2);
      const first = mutations()[0]!;
      const second = mutations()[1]!;
      expect(second.path).toBe(first.path);
      expect(second.init?.body).toBe(first.init?.body);
      expect(new Headers(second.init?.headers).get("Idempotency-Key")).toBe(
        new Headers(first.init?.headers).get("Idempotency-Key"),
      );
      expect(app.el("refreshQueue").textContent).toBe("Refresh");
      expect(app.el("startRejectButton").disabled).toBe(false);
      expect(app.el("actionBarTitle").textContent).toBe("Review recommendation");

      const detailResponse = await fetch(`${baseUrl}/api/tickets/TKT-1010`);
      const detail = await detailResponse.json() as {
        recommendationHistory?: unknown[];
        decisionTimeline?: unknown[];
      };
      expect(detail.recommendationHistory).toHaveLength(1);
      expect(detail.decisionTimeline).toHaveLength(1);
    } finally {
      if (server.listening) {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }
      await deps.close();
      await rm(dataRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
