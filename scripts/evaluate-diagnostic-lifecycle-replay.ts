import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import {
  loadDiagnosticEvaluationScenarios,
} from "../src/approval-desk/diagnostic-evaluation-scenarios.js";
import {
  runDiagnosticEvaluation,
} from "../src/approval-desk/diagnostic-evaluation.js";
import {
  runSkillShowcase,
  verifySkillShowcaseReport,
} from "./demo-skill-showcase.js";

export async function evaluateDiagnosticLifecycleReplay(
  root: string = resolve(import.meta.dirname, "../.."),
): Promise<number> {
  const dataRoot = await mkdtemp(join(tmpdir(), "diagnostic-replay-"));
  try {
    const replay = await runSkillShowcase({
      root,
      dataRoot,
      mode: "deterministic",
    });
    const replayFailures = verifySkillShowcaseReport(replay);
    const scenarios = await loadDiagnosticEvaluationScenarios();
    const diagnostic = runDiagnosticEvaluation(scenarios);
    const bounded = diagnostic.observations.find(
      (observation) => observation.scenarioId === "bounded-escalation",
    );

    console.log("# Diagnostic Lifecycle Replay");
    console.log("- Mode: deterministic; network access disabled.");
    console.log(`- Stateful journey: ${replay.finalTicketStatus === "resolved" ? "PASS" : "FAIL"}.`);
    console.log(`- Workflow reads: ${replay.workflowReads.length}; tool actions: ${replay.toolCallTrace.filter(({ kind }) => kind === "action").length}.`);
    console.log(`- Read-before-action coverage: ${replayFailures.some((failure) => failure.includes("preceded by a workflow read")) ? "FAIL" : "PASS"}.`);
    console.log(`- Deterministic scenario matrix: ${diagnostic.passedScenarioCount}/${diagnostic.scenarioCount} scenarios passed.`);
    console.log(
      `- Bounded ambiguity companion: stage=${bounded?.operatorStage ?? "missing"}; next=${bounded?.operatorNextAction ?? "missing"}; ` +
      `diagnosis=${bounded?.diagnosisOutcome ?? "missing"}; failures=${bounded?.failures.length ?? "missing"}.`,
    );
    console.log("\n## Chronological journey");
    console.log("- evidence → diagnosis → approval → response → mitigation/fix → verification → closure");
    console.log(`- Observed stages: ${replay.workflowStages.map(({ stage }) => stage).join(" → ")}`);

    if (replayFailures.length > 0) {
      console.error("\n## Replay verification failures");
      replayFailures.forEach((failure) => console.error(`- ${failure}`));
    }
    if (diagnostic.passedScenarioCount !== diagnostic.scenarioCount) {
      console.error("\n## Diagnostic scenario failures");
      diagnostic.observations
        .filter(({ failures }) => failures.length > 0)
        .forEach(({ scenarioId, failures }) =>
          console.error(`- ${scenarioId}: ${failures.join("; ")}`),
        );
    }
    return replayFailures.length === 0 &&
        diagnostic.passedScenarioCount === diagnostic.scenarioCount
      ? 0
      : 1;
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  void evaluateDiagnosticLifecycleReplay().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
