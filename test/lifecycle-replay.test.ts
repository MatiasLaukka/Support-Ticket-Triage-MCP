import { describe, expect, it } from "vitest";
import {
  buildLifecycleReplayViewModel,
  type LifecycleReplayReport,
} from "../src/approval-desk/lifecycle-replay.js";
import { loadDiagnosticEvaluationScenarios } from "../src/approval-desk/diagnostic-evaluation-scenarios.js";

function reportFor(
  lane: string,
  scenarios: readonly string[],
  source: "openai" | "deterministic" = "openai",
): LifecycleReplayReport {
  return {
    mode: "live",
    providerProvenance: {
      classification: "live-openai-adapter",
      drafting: "live-openai-adapter",
      networkPolicy: "live-provider-allowed",
    },
    lanes: [{
      lane,
      scenarioCount: scenarios.length,
      passedScenarioCount: scenarios.length,
      draftingContractSummary: {
        candidateContractPasses: scenarios.length,
        repairedPasses: 0,
        deterministicFallbacks: 0,
        hardSafetyViolations: 0,
        finalResponseHardSafetyViolations: 0,
      },
      scenarios: scenarios.map((scenarioId) => ({
        scenarioId,
        operatorStage: "review",
        actualDraft: `${source} draft for ${scenarioId}`,
        overallResult: "pass",
        draftingContract: "candidate-pass",
        failureReasons: [],
        classificationAgreement: { all: true },
        qualityBreakdown: { length: { wordCount: 10, maxWords: 120, pass: true } },
        providerProvenance: {
          classification: { status: "used", model: "test-model" },
          drafting: { status: "used", source, model: "test-model" },
        },
      })),
    }],
  };
}

describe("lifecycle replay view model", () => {
  it("groups snapshots by ticket and joins conversation context and lanes", async () => {
    const scenarios = await loadDiagnosticEvaluationScenarios();
    const selected = scenarios.filter((scenario) =>
      ["partial-evidence", "stale-reply"].includes(scenario.id),
    );
    const liveReport = reportFor("gpt-gpt", selected.map(({ id }) => id));
    const controlledReport = reportFor(
      "deterministic-deterministic",
      selected.map(({ id }) => id),
      "deterministic",
    );

    const view = buildLifecycleReplayViewModel({
      liveReport,
      controlledReport,
      scenarios: selected,
    });

    const ticket = view.tickets.find(({ ticketId }) => ticketId === "TKT-1008");
    expect(ticket?.snapshots).toHaveLength(2);
    expect(ticket?.snapshots[0]?.customerReplies).toEqual([
      expect.objectContaining({ body: expect.any(String) }),
    ]);
    expect(ticket?.snapshots[0]?.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lane: "gpt-gpt" }),
        expect.objectContaining({ lane: "deterministic-deterministic" }),
      ]),
    );
    expect(ticket?.snapshots[0]?.snapshotId).toContain("TKT-1008:");
  });

  it("returns an explicit unavailable state when the live report is missing", async () => {
    const scenarios = await loadDiagnosticEvaluationScenarios();

    expect(buildLifecycleReplayViewModel({
      liveReport: undefined,
      controlledReport: undefined,
      scenarios,
    })).toEqual({
      available: false,
      unavailableReason: "live-report-missing",
      generatedFrom: { liveReport: "reports/ai-comparison/live-latest.json" },
      tickets: [],
    });
  });
});
