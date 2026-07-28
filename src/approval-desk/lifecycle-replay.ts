import type { DiagnosticEvaluationScenario } from "./diagnostic-evaluation.js";

export interface LifecycleReplayReport {
  mode: "live" | "controlled";
  providerProvenance?: Record<string, unknown>;
  lanes: readonly LifecycleReplayReportLane[];
}

interface LifecycleReplayReportLane {
  lane: string;
  scenarioCount: number;
  passedScenarioCount: number;
  draftingContractSummary?: Record<string, unknown>;
  scenarios: readonly LifecycleReplayReportScenario[];
}

interface LifecycleReplayReportScenario {
  scenarioId: string;
  operatorStage?: string;
  actualDraft?: string;
  overallResult?: "pass" | "fail";
  draftingContract?: string;
  classificationAgreement?: unknown;
  classificationDelta?: unknown;
  failureReasons?: readonly string[];
  qualityBreakdown?: unknown;
  providerProvenance?: unknown;
}

export interface LifecycleReplayViewModel {
  available: boolean;
  unavailableReason?: "live-report-missing" | "invalid-report";
  generatedFrom: { liveReport: string; controlledReport?: string };
  tickets: LifecycleReplayTicket[];
}

export interface LifecycleReplayTicket {
  ticketId: string;
  customerName: string;
  subject: string;
  snapshots: LifecycleReplaySnapshot[];
}

export interface LifecycleReplaySnapshot {
  snapshotId: string;
  scenarioId: string;
  label: string;
  family: string;
  operatorStage?: string;
  customerReplies: Array<{
    id: string;
    createdAt: string;
    body: string;
  }>;
  previousSupportResponse?: { sentAt: string; body: string };
  ticket: {
    id: string;
    customer: string;
    subject: string;
    description: string;
    status: string;
    tags: string[];
  };
  lanes: LifecycleReplayLane[];
}

export interface LifecycleReplayLane {
  lane: string;
  result: "pass" | "fail" | "unavailable";
  actualDraft?: string;
  deterministicBaselineDraft?: string;
  draftingContract?: string;
  classificationAgreement?: unknown;
  classificationDelta?: unknown;
  providerProvenance?: unknown;
  qualityBreakdown?: unknown;
  failureReasons: string[];
}

const LIVE_REPORT_PATH = "reports/ai-comparison/live-latest.json";
const CONTROLLED_REPORT_PATH = "reports/ai-comparison/controlled-latest.json";

const SNAPSHOT_LABELS: Readonly<Record<string, string>> = {
  "ordinary-outage-triage": "Ordinary outage triage",
  "known-cause-sms": "Known SMS quiet-hour cause",
  "active-known-event": "Active known event",
  "out-of-window-known-cause": "Out-of-window known cause",
  "partial-evidence": "Partial evidence received",
  "ambiguous-campaign-editor": "Initial ambiguity",
  "bounded-escalation": "Bounded specialist escalation",
  "failed-fix-recheck": "Failed fix recheck",
  "customer-confirmation": "Customer confirms working",
  "stale-reply": "Stale customer reply",
  "prompt-injection": "Prompt-injection safety case",
};

export function buildLifecycleReplayViewModel(input: {
  liveReport: LifecycleReplayReport | undefined;
  controlledReport?: LifecycleReplayReport;
  scenarios: readonly DiagnosticEvaluationScenario[];
}): LifecycleReplayViewModel {
  if (input.liveReport === undefined) {
    return {
      available: false,
      unavailableReason: "live-report-missing",
      generatedFrom: { liveReport: LIVE_REPORT_PATH },
      tickets: [],
    };
  }

  const scenariosById = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]));
  const controlledBaseline = laneByName(input.controlledReport, "deterministic-deterministic");
  const snapshots = new Map<string, LifecycleReplaySnapshot>();

  for (const lane of input.liveReport.lanes) {
    for (const reportScenario of lane.scenarios) {
      const scenario = scenariosById.get(reportScenario.scenarioId);
      if (scenario === undefined) continue;
      const snapshotId = `${scenario.ticket.id}:${scenario.id}`;
      const snapshot = snapshots.get(snapshotId) ?? createSnapshot(scenario);
      snapshot.operatorStage ??= reportScenario.operatorStage;
      const baseline = controlledBaseline?.scenarios.find(
        ({ scenarioId }) => scenarioId === reportScenario.scenarioId,
      )?.actualDraft;
      snapshot.lanes.push(toLane(reportScenario, lane.lane, baseline));
      snapshots.set(snapshotId, snapshot);
    }
  }

  if (controlledBaseline !== undefined) {
    for (const reportScenario of controlledBaseline.scenarios) {
      const scenario = scenariosById.get(reportScenario.scenarioId);
      if (scenario === undefined) continue;
      const snapshotId = `${scenario.ticket.id}:${scenario.id}`;
      const snapshot = snapshots.get(snapshotId);
      if (snapshot === undefined) continue;
      if (!snapshot.lanes.some(({ lane }) => lane === controlledBaseline.lane)) {
        snapshot.lanes.push(toLane(reportScenario, controlledBaseline.lane));
      }
    }
  }

  const tickets = new Map<string, LifecycleReplayTicket>();
  for (const snapshot of snapshots.values()) {
    const ticket = tickets.get(snapshot.ticket.id) ?? {
      ticketId: snapshot.ticket.id,
      customerName: snapshot.ticket.customer,
      subject: snapshot.ticket.subject,
      snapshots: [],
    };
    ticket.snapshots.push(snapshot);
    tickets.set(snapshot.ticket.id, ticket);
  }

  return {
    available: true,
    generatedFrom: {
      liveReport: LIVE_REPORT_PATH,
      controlledReport: input.controlledReport === undefined
        ? undefined
        : CONTROLLED_REPORT_PATH,
    },
    tickets: [...tickets.values()].map((ticket) => ({
      ...ticket,
      snapshots: ticket.snapshots.sort((left, right) =>
        left.snapshotId.localeCompare(right.snapshotId),
      ),
    })).sort((left, right) => left.ticketId.localeCompare(right.ticketId)),
  };
}

function createSnapshot(scenario: DiagnosticEvaluationScenario): LifecycleReplaySnapshot {
  return {
    snapshotId: `${scenario.ticket.id}:${scenario.id}`,
    scenarioId: scenario.id,
    label: SNAPSHOT_LABELS[scenario.id] ?? scenario.id,
    family: scenario.family,
    customerReplies: [...(scenario.customerReplies ?? [])].map((reply) => ({
      id: reply.id,
      createdAt: reply.createdAt,
      body: reply.body,
    })),
    previousSupportResponse: scenario.previousSupportResponse === undefined
      ? undefined
      : { ...scenario.previousSupportResponse },
    ticket: {
      id: scenario.ticket.id,
      customer: scenario.ticket.customer.name,
      subject: scenario.ticket.subject,
      description: scenario.ticket.description,
      status: scenario.ticket.status,
      tags: [...scenario.ticket.tags],
    },
    lanes: [],
  };
}

function toLane(
  scenario: LifecycleReplayReportScenario,
  lane: string,
  deterministicBaselineDraft?: string,
): LifecycleReplayLane {
  return {
    lane,
    result: scenario.overallResult ?? "unavailable",
    actualDraft: scenario.actualDraft,
    deterministicBaselineDraft,
    draftingContract: scenario.draftingContract,
    classificationAgreement: scenario.classificationAgreement,
    classificationDelta: scenario.classificationDelta,
    providerProvenance: scenario.providerProvenance,
    qualityBreakdown: scenario.qualityBreakdown,
    failureReasons: [...(scenario.failureReasons ?? [])],
  };
}

function laneByName(
  report: LifecycleReplayReport | undefined,
  name: string,
): LifecycleReplayReportLane | undefined {
  return report?.lanes.find(({ lane }) => lane === name);
}
