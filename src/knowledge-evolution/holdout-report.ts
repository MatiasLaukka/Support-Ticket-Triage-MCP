import type { Category, Priority, SupportState, Team } from "../domain.js";
import type { KnowledgeHoldoutFixture } from "./holdout-fixtures.js";
import type {
  HoldoutCaseDelta,
  HoldoutLaneResult,
  HoldoutScorecard,
  KnowledgeHoldoutEvaluation,
} from "./holdout-evaluation.js";
import type { KnowledgeReference, ReusableKnowledgeIssue, ReusableKnowledgeResult } from "./reusable-context.js";

export type HoldoutReportTurn = {
  turnIndex: number;
  category: Category;
  priority: Priority;
  team: Team;
  supportState: SupportState;
  knownCauseRef?: KnowledgeReference;
  knownEventId?: string | null;
  requestedEvidenceIds: readonly string[];
  providedEvidenceIds: readonly string[];
  missingEvidenceIds: readonly string[];
  unsafeLifecycleViolations: readonly string[];
  correctionRequired: boolean;
};

export type HoldoutReportLane = {
  lane: "baseline" | "learned";
  classificationContractPassed: boolean;
  turns: readonly HoldoutReportTurn[];
  targetReached: boolean;
  turnsToExpectedTarget: number | null;
};

export type HoldoutReportCase = {
  fixtureId: string;
  reusableKnowledge: {
    status: ReusableKnowledgeResult["status"];
    issues: readonly ReusableKnowledgeIssue[];
  };
  baseline: HoldoutReportLane;
  learned: HoldoutReportLane;
  delta: HoldoutCaseDelta;
  comparison: "benefited" | "unchanged" | "regressed";
  readOnly: { baseline: boolean; learned: boolean };
};

export type ControlledKnowledgeHoldoutReport = {
  reportVersion: 1;
  run: {
    mode: "controlled-synthetic";
    asOf: string;
    clock: string;
    provider: "not-constructed";
  };
  cases: readonly HoldoutReportCase[];
  scorecard: HoldoutScorecard;
  limitation: string;
};

export function toControlledKnowledgeHoldoutReport(input: {
  asOf: string;
  clock: string;
  cases: readonly {
    fixture: KnowledgeHoldoutFixture;
    reusableKnowledge: ReusableKnowledgeResult;
    evaluation: KnowledgeHoldoutEvaluation;
    delta: HoldoutCaseDelta;
    comparison: HoldoutReportCase["comparison"];
  }[];
  scorecard: HoldoutScorecard;
}): ControlledKnowledgeHoldoutReport {
  const report: ControlledKnowledgeHoldoutReport = {
    reportVersion: 1,
    run: { mode: "controlled-synthetic", asOf: input.asOf, clock: input.clock, provider: "not-constructed" },
    cases: input.cases.map(({ fixture, reusableKnowledge, evaluation, delta, comparison }) => ({
      fixtureId: fixture.id,
      reusableKnowledge: { status: reusableKnowledge.status, issues: reusableKnowledge.issues.map(copyIssue) },
      baseline: toLane("baseline", evaluation.baseline),
      learned: toLane("learned", evaluation.learned),
      delta: { ...delta },
      comparison,
      readOnly: {
        baseline: snapshotsMatch(evaluation.baseline),
        learned: snapshotsMatch(evaluation.learned),
      },
    })),
    scorecard: copyScorecard(input.scorecard),
    limitation: "Synthetic/controlled fixed fixtures demonstrate governed knowledge reuse only; no human-time claim or live-model performance claim is made.",
  };
  assertSanitizedReport(report);
  return report;
}

export function renderControlledKnowledgeHoldoutMarkdown(report: ControlledKnowledgeHoldoutReport): string {
  const rows = report.cases.map((entry) => {
    const learned = entry.learned;
    return `| ${entry.fixtureId} | ${entry.reusableKnowledge.status} | ${learned.targetReached ? "yes" : "no"} | ${entry.comparison} | ${entry.readOnly.learned ? "pass" : "FAIL"} |`;
  });
  return [
    "# Controlled Knowledge Holdout Evaluation",
    "",
    `- Mode: ${report.run.mode}`,
    `- Frozen as-of and injected clock: ${report.run.asOf}`,
    `- Provider: ${report.run.provider}`,
    `- ${report.limitation}`,
    "",
    "## Case scorecard",
    "",
    "| Fixture | Reusable-context status | Learned target | Comparison | Read-only |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Aggregate scorecards",
    "",
    `- Efficacy: learned exact-version precision=${formatMetric(report.scorecard.efficacy.knowledgeMatchPrecision)}, recall=${formatMetric(report.scorecard.efficacy.knowledgeMatchRecall)}, evidence precision=${formatMetric(report.scorecard.efficacy.evidencePrecision)}, missing-evidence rate=${formatMetric(report.scorecard.efficacy.missingEvidenceRate)}.`,
    `- Governance: stale false-positive rate=${formatMetric(report.scorecard.governance.staleFalsePositiveRate)}, contradicted false-positive rate=${formatMetric(report.scorecard.governance.contradictedFalsePositiveRate)}, unsafe lifecycle changes=${report.scorecard.governance.unsafeLifecycleChanges}.`,
    `- Version: wrong-version reuse=${report.scorecard.version.wrongVersionReuse}, replacement correctness=${formatMetric(report.scorecard.version.replacementCorrectnessRate)}, version pinning=${formatMetric(report.scorecard.version.versionPinningRate)}.`,
  ].join("\n");
}

function toLane(lane: HoldoutReportLane["lane"], result: HoldoutLaneResult): HoldoutReportLane {
  return {
    lane,
    classificationContractPassed: result.outcomeMatched,
    turns: result.turns.map((turn) => ({
      turnIndex: turn.turn,
      category: turn.recommendation.category,
      priority: turn.recommendation.priority,
      team: turn.recommendation.team,
      supportState: turn.supportState ?? "diagnosing",
      ...(turn.knownCauseRef === undefined ? {} : { knownCauseRef: { ...turn.knownCauseRef } }),
      ...(turn.recommendation.knownEventId === undefined ? {} : { knownEventId: turn.recommendation.knownEventId }),
      requestedEvidenceIds: [...turn.requestedEvidenceIds],
      providedEvidenceIds: [...turn.providedEvidenceIds],
      missingEvidenceIds: [...turn.missingEvidenceIds],
      unsafeLifecycleViolations: turn.unsafeLifecycleViolations.map(({ code }) => code),
      correctionRequired: turn.correctionStatus === "incorrect",
    })),
    targetReached: result.targetReached,
    turnsToExpectedTarget: result.turnsToExpectedTarget,
  };
}

function copyIssue(issue: ReusableKnowledgeIssue): ReusableKnowledgeIssue {
  return issue.scope === "snapshot" ? { scope: issue.scope, code: issue.code } : { ...issue };
}

function copyScorecard(scorecard: HoldoutScorecard): HoldoutScorecard {
  return {
    efficacy: {
      ...scorecard.efficacy,
      baseline: { ...scorecard.efficacy.baseline, byScenario: { ...scorecard.efficacy.baseline.byScenario } },
      learned: { ...scorecard.efficacy.learned, byScenario: { ...scorecard.efficacy.learned.byScenario } },
    },
    governance: { ...scorecard.governance },
    version: { ...scorecard.version },
  };
}

function snapshotsMatch(lane: HoldoutLaneResult): boolean {
  return JSON.stringify(lane.before) === JSON.stringify(lane.after);
}

function formatMetric(value: number | null): string { return value === null ? "n/a" : value.toFixed(3); }

function assertSanitizedReport(report: ControlledKnowledgeHoldoutReport): void {
  const forbidden = /draftCustomerResponse|rationale|classificationSignals|conversation|customerReplies|previousSupportResponse|prompt|body|expectedOutcome/i;
  if (forbidden.test(JSON.stringify(report))) throw new Error("Holdout report violated the sanitized allowlist.");
}
