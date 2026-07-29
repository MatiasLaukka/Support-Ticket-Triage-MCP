import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { loadDiagnosticEvaluationScenarios } from "../src/approval-desk/diagnostic-evaluation-scenarios.js";
import type { CustomerResponseDraftProvider } from "../src/approval-desk/draft-response-provider.js";
import type { ClassificationReasoningProvider } from "../src/approval-desk/classification-reasoning-provider.js";
import { createRuntimeDependencies } from "../src/runtime.js";

const temporaryRoots: string[] = [];
const servers: Array<ReturnType<typeof createApprovalDeskHttpServer>> = [];

afterEach(async () => {
  await Promise.allSettled(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolveClose, rejectClose) =>
          server.close((error: Error | undefined) =>
            error === undefined ? resolveClose() : rejectClose(error),
          ),
        ),
    ),
  );
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("lifecycle replay HTTP surface", () => {
  it("serves the read-only page and a grouped replay view model", async () => {
    const scenarios = await loadDiagnosticEvaluationScenarios();
    const scenario = scenarios.find(({ id }) => id === "prompt-injection")!;
    const fixture = await startFixture({
      lifecycleReplayScenarios: scenarios,
      report: {
        mode: "live",
        providerProvenance: { classification: "openai" },
        lanes: [
          {
            lane: "gpt-assisted-gpt-assisted",
            scenarioCount: 1,
            passedScenarioCount: 1,
            scenarios: [
              {
                scenarioId: scenario.id,
                operatorStage: "recommendation-ready",
                actualDraft: "We are reviewing this issue.",
                overallResult: "pass",
                draftingContract: "pass",
                failureReasons: [],
              },
            ],
          },
        ],
      },
    });

    const page = await fetch(`${fixture.baseUrl}/lifecycle-replay`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Lifecycle Replay");

    const replay = await fixture.json("/api/lifecycle-replay");
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({
      available: true,
      tickets: [
        {
          ticketId: scenario.ticket.id,
          snapshots: [{ scenarioId: "prompt-injection" }],
        },
      ],
    });
  });

  it("does not invoke providers or mutate runtime state", async () => {
    const scenarios = await loadDiagnosticEvaluationScenarios();
    const scenario = scenarios[0]!;
    const fixture = await startFixture({
      lifecycleReplayScenarios: scenarios,
      report: {
        mode: "live",
        lanes: [
          {
            lane: "deterministic-deterministic",
            scenarioCount: 1,
            passedScenarioCount: 1,
            scenarios: [{ scenarioId: scenario.id, overallResult: "pass" }],
          },
        ],
      },
      draftProvider: {
        async draft(): Promise<never> {
          throw new Error("lifecycle replay must not draft");
        },
      } satisfies CustomerResponseDraftProvider,
      classificationReasoningProvider: {
        async reason(): Promise<never> {
          throw new Error("lifecycle replay must not classify");
        },
      } satisfies ClassificationReasoningProvider,
    });
    const beforeTicket = await fixture.deps.tickets.get(scenario.ticket.id);
    const beforeAudits = await fixture.deps.audits.list();

    const replay = await fixture.json("/api/lifecycle-replay");
    expect(replay.status).toBe(200);

    expect(await fixture.deps.tickets.get(scenario.ticket.id)).toEqual(beforeTicket);
    expect(await fixture.deps.audits.list()).toEqual(beforeAudits);
  });

  it("uses the controlled report when no live report is available", async () => {
    const scenarios = await loadDiagnosticEvaluationScenarios();
    const scenario = scenarios[0]!;
    const fixture = await startFixture({
      lifecycleReplayScenarios: scenarios,
      controlledReport: {
        mode: "controlled",
        lanes: [{
          lane: "deterministic-deterministic",
          scenarioCount: 1,
          passedScenarioCount: 1,
          scenarios: [{ scenarioId: scenario.id, overallResult: "pass" }],
        }],
      },
    });
    const replay = await fixture.json("/api/lifecycle-replay");
    expect(replay.body).toMatchObject({
      available: true,
      generatedFrom: { liveReport: expect.stringContaining("controlled") },
    });
  });

  it("returns stable unavailable states when the live report is absent or invalid", async () => {
    const scenarios = await loadDiagnosticEvaluationScenarios();
    const missing = await startFixture({
      lifecycleReplayScenarios: scenarios,
      controlledReportPath: join(tmpdir(), "missing-controlled-report.json"),
    });
    expect((await missing.json("/api/lifecycle-replay")).body).toMatchObject({
      available: false,
      unavailableReason: "live-report-missing",
    });

    const invalid = await startFixture({
      lifecycleReplayScenarios: scenarios,
      reportText: "not json",
    });
    expect((await invalid.json("/api/lifecycle-replay")).body).toMatchObject({
      available: false,
      unavailableReason: "invalid-report",
    });
  });
});

async function startFixture(options: {
  lifecycleReplayScenarios: Awaited<ReturnType<typeof loadDiagnosticEvaluationScenarios>>;
  report?: object;
  reportText?: string;
  controlledReport?: object;
  controlledReportPath?: string;
  draftProvider?: CustomerResponseDraftProvider;
  classificationReasoningProvider?: ClassificationReasoningProvider;
}) {
  const root = await mkdtemp(join(tmpdir(), "lifecycle-replay-http-"));
  temporaryRoots.push(root);
  const reportPath = join(root, "live-latest.json");
  if (options.report !== undefined || options.reportText !== undefined) {
    await writeFile(reportPath, options.reportText ?? JSON.stringify(options.report), "utf8");
  }
  const controlledReportPath = options.controlledReportPath ?? join(root, "controlled-latest.json");
  if (options.controlledReport !== undefined) {
    await writeFile(controlledReportPath, JSON.stringify(options.controlledReport), "utf8");
  }
  const deps = await createRuntimeDependencies({
    cwd: resolve(),
    env: {
      TRIAGE_DATA_ROOT: join(root, "runtime"),
      TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
    },
  });
  const server = createApprovalDeskHttpServer(deps, {
    lifecycleReplayReportPath: reportPath,
    lifecycleReplayControlledReportPath: controlledReportPath,
    lifecycleReplayScenarios: options.lifecycleReplayScenarios,
    draftProvider: options.draftProvider,
    classificationReasoningProvider: options.classificationReasoningProvider,
  });
  servers.push(server);
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    deps,
    baseUrl,
    json: async (path: string) => {
      const response = await fetch(`${baseUrl}${path}`);
      return { status: response.status, body: await response.json(), response };
    },
  };
}
