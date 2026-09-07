import { AuditEventSchema, type AuditEvent, type Ticket } from "../domain.js";
import {
  diagnosisReviewViews,
  operationalDiagnosisAudits,
} from "../approval-desk/diagnosis-review.js";
import {
  auditCausalPositions,
  compareAuditCausalOrder,
} from "../approval-desk/workflow-causal-context.js";
import {
  DiagnosisContextSchema,
  operationalAuditEventsFromSnapshot,
} from "../triage-service.js";
import type { OperationalWorkflowSnapshot } from "../operational/domain.js";
import type { OperationalUnitOfWork } from "../operational/unit-of-work.js";
import type { CompletedDiagnosis } from "./domain.js";

type OperationalDiagnosisRecord = OperationalWorkflowSnapshot["diagnoses"][number];

export interface CompletedDiagnosisSource {
  list(): Promise<CompletedDiagnosis[]>;
}

export interface CompletedDiagnosisReadSnapshot {
  ticket: Ticket;
  audits: readonly AuditEvent[];
  diagnoses: readonly OperationalDiagnosisRecord[];
}

export function eligibleCompletedDiagnoses(
  snapshot: CompletedDiagnosisReadSnapshot,
): CompletedDiagnosis[] {
  const viewsByOriginalId = new Map(
    diagnosisReviewViews({
      ticket: snapshot.ticket,
      audits: snapshot.audits,
      originalDiagnoses: snapshot.diagnoses,
    }).map((view) => [view.originalDiagnosis.id, view]),
  );
  const positions = auditCausalPositions(snapshot.audits);

  return snapshot.diagnoses
    .filter((record) => record.originalAudit.action === "diagnosis-completed")
    .filter((record) => isEligibleInvestigation(record.originalAudit))
    .filter((record) => {
      const view = viewsByOriginalId.get(record.originalAudit.id);
      return view !== undefined && !view.stale && view.latestReview?.decision !== "reject";
    })
    .filter((record) => !positions.some((position) =>
      position.event.action === "diagnosis-invalidated"
      && position.event.before.diagnosisId === record.originalAudit.id
      && compareAuditCausalOrder(
        position,
        { event: record.originalAudit, index: snapshot.audits.findIndex(({ id }) => id === record.originalAudit.id) },
      ) > 0,
    ))
    .map((record) => structuredClone(record.diagnosis));
}

export class OperationalCompletedDiagnosisSource implements CompletedDiagnosisSource {
  constructor(
    private readonly reader: Pick<{
      readCompletedDiagnosisSnapshots(): CompletedDiagnosisReadSnapshot[];
    }, "readCompletedDiagnosisSnapshots">,
  ) {}

  async list(): Promise<CompletedDiagnosis[]> {
    return this.reader.readCompletedDiagnosisSnapshots()
      .flatMap((snapshot) => eligibleCompletedDiagnoses(snapshot));
  }
}

/** Build the same receipt-backed audit view used by OperationalAuditRepository. */
export function authoritativeOperationalAudits(
  unit: Pick<OperationalUnitOfWork, "readCommandResult">,
  snapshot: OperationalWorkflowSnapshot,
): AuditEvent[] {
  const fallbackAudits = operationalAuditEventsFromSnapshot(snapshot);
  const authoritativeDiagnosisAudits = operationalDiagnosisAudits({
    ticket: snapshot.ticket,
    audits: fallbackAudits,
    originalDiagnoses: snapshot.diagnoses,
  });
  return snapshot.events.flatMap((event) => {
    if (event.action === "diagnosis-completed" || event.action === "diagnostic-escalated") {
      return authoritativeDiagnosisAudits.filter(({ id }) => id === event.id);
    }
    const lifecycleAudit = unit.readCommandResult(event.commandId)
      ?.lifecycleAuditEvents?.find((candidate) => candidate.id === event.id);
    return lifecycleAudit === undefined
      ? operationalAuditEventsFromSnapshot({ ...snapshot, events: [event] })
      : [AuditEventSchema.parse(lifecycleAudit)];
  });
}

function isEligibleInvestigation(originalAudit: AuditEvent): boolean {
  const parsed = DiagnosisContextSchema.safeParse(originalAudit.after.diagnosis);
  if (!parsed.success) return false;
  const state = parsed.data.diagnosticState?.state;
  return state === undefined || state === "working-diagnosis" || state === "confirmed";
}
