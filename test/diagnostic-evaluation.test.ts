import { describe, expect, it } from "vitest";
import { runDiagnosticEvaluation } from "../src/approval-desk/diagnostic-evaluation.js";
import { loadDiagnosticEvaluationScenarios } from "../src/approval-desk/diagnostic-evaluation-scenarios.js";

describe("diagnostic evaluation harness", () => {
  it("evaluates broad classifier and diagnostic scenarios with risk metrics", async () => {
    const scenarios = await loadDiagnosticEvaluationScenarios();

    expect(scenarios).toHaveLength(11);
    expect(scenarios.map(({ id }) => id)).toContain("prompt-injection");
    expect(scenarios.filter(({ oracle }) => oracle !== undefined)).toHaveLength(9);

    const report = runDiagnosticEvaluation(scenarios);

    expect(report.scenarioCount).toBe(11);
    expect(report.passedScenarioCount).toBe(11);
    expect(report.familyCounts).toMatchObject({
      "known-event": expect.any(Number),
      "known-cause": expect.any(Number),
      evidence: expect.any(Number),
      ambiguity: expect.any(Number),
      escalation: expect.any(Number),
      fix: expect.any(Number),
      stale: expect.any(Number),
      adversarial: expect.any(Number),
    });
    expect(report.categoryAccuracy).toBeGreaterThan(0.7);
    expect(report.knownCauseRecall).toBe(1);
    expect(report.knownEventPrecision).toBe(1);
    expect(report.knownEventRecall).toBe(1);
    expect(report.approvalBypassCount).toBe(0);
    expect(report.unsafeCustomerResponseCount).toBe(0);
    expect(report.staleActionCount).toBe(0);
    expect(report.oracleClassificationAccuracy).toBe(1);
    expect(report.oracleKnowledgeCoverage).toBe(1);
    expect(report.oracleKnownCauseAccuracy).toBe(1);
    expect(report.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scenarioId: "active-known-event",
          knownEventId: "EVT-2026-06-10-WEBHOOK-LATENCY",
        }),
        expect.objectContaining({
          scenarioId: "prompt-injection",
          promptInjectionDetected: true,
        }),
      ]),
    );
  });
});
