import { isDeepStrictEqual } from "node:util";
import type { AuditEvent, Ticket } from "../domain.js";
import {
  diagnosisReviewViews,
  DiagnosisReviewDecisionSchema,
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
import {
  DiagnosisAuditIntegrityError,
  isDiagnosisAuthorityAuditAction,
  projectDiagnosisAudits,
} from "../operational/diagnosis-audit.js";
import { OperationalStoreError, type OperationalUnitOfWork } from "../operational/unit-of-work.js";
import type { CompletedDiagnosis } from "./domain.js";

type OperationalDiagnosisRecord = OperationalWorkflowSnapshot["diagnoses"][number];

export interface CompletedDiagnosisSource {
  list(): Promise<CompletedDiagnosis[]>;
}

export interface CompletedDiagnosisReadSnapshot {
  ticket: Ticket;
  audits: readonly AuditEvent[];
  diagnoses: readonly OperationalDiagnosisRecord[];
  events?: readonly OperationalWorkflowSnapshot["events"][number][];
}

export function eligibleCompletedDiagnoses(
  snapshot: CompletedDiagnosisReadSnapshot,
): CompletedDiagnosis[] {
  validateDiagnosisAuthorityReferences(snapshot);
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
  unit: Pick<OperationalUnitOfWork, "readCommandResults">,
  snapshot: OperationalWorkflowSnapshot,
): AuditEvent[] {
  const fallbackAudits = operationalAuditEventsFromSnapshot(snapshot);
  try {
    const commandIds = [...new Set(snapshot.events.map(({ commandId }) => commandId))];
    const receiptResults = unit.readCommandResults(commandIds);
    const fallbackAuditsByEventId = new Map(snapshot.events.map((event) => [
      event.id,
      operationalAuditEventsFromSnapshot({ ...snapshot, events: [event] }),
    ] as const));
    return projectDiagnosisAudits({
      events: snapshot.events,
      receiptResults,
      fallbackAudits,
      fallbackAuditsByEventId,
      originalAudits: snapshot.diagnoses.map(({ originalAudit }) => originalAudit),
      policy: "strict",
    });
  } catch (error) {
    if (error instanceof DiagnosisAuditIntegrityError) {
      throw new OperationalStoreError(error.message, "PERSISTENCE_ERROR", { cause: error });
    }
    throw error;
  }
}

function validateDiagnosisAuthorityReferences(
  snapshot: CompletedDiagnosisReadSnapshot,
): void {
  const diagnosisIds = new Set(snapshot.diagnoses.map(({ originalAudit }) => originalAudit.id));
  const auditsById = new Map(snapshot.audits.map((audit) => [audit.id, audit] as const));
  if (auditsById.size !== snapshot.audits.length) {
    throw new OperationalStoreError(
      "Persisted diagnosis history contains duplicate audit identities.",
      "PERSISTENCE_ERROR",
    );
  }
  for (const record of snapshot.diagnoses) {
    const authoritativeOriginalAudit = auditsById.get(record.originalAudit.id);
    if (
      authoritativeOriginalAudit === undefined
      || !isDeepStrictEqual(authoritativeOriginalAudit, record.originalAudit)
      || !diagnosisRecordMatchesOriginalAudit(record)
      || record.diagnosis.ticketId !== snapshot.ticket.id
      || record.originalAudit.ticketId !== snapshot.ticket.id
      || record.originalAudit.id !== record.operationalEventId
      || (record.originalAudit.action !== "diagnosis-completed"
        && record.originalAudit.action !== "diagnostic-escalated")
    ) {
      throw new OperationalStoreError(
        `Persisted diagnosis record ${record.diagnosis.id} has inconsistent audit, ticket, or causal-event identity.`,
        "PERSISTENCE_ERROR",
      );
    }
  }
  if (snapshot.events !== undefined) {
    const eventsById = new Map(snapshot.events.map((event) => [event.id, event] as const));
    const milestoneIds = new Set(
      snapshot.events
        .filter(({ action }) => action === "diagnosis-completed" || action === "diagnostic-escalated")
        .map(({ id }) => id),
    );
    if (milestoneIds.size !== diagnosisIds.size || [...milestoneIds].some((id) => !diagnosisIds.has(id))) {
      throw new OperationalStoreError(
        "Persisted diagnosis records do not match the operational diagnosis milestones.",
        "PERSISTENCE_ERROR",
      );
    }
    for (const record of snapshot.diagnoses) {
      const event = eventsById.get(record.originalAudit.id);
      if (
        event === undefined
        || event.ticketId !== record.originalAudit.ticketId
        || event.action !== record.originalAudit.action
        || event.actor !== record.originalAudit.actor
        || event.occurredAt !== record.originalAudit.timestamp
        || !isSourceRevision(event.facts.sourceRevision)
        || !isSourceRevision(record.originalAudit.after.sourceTicketRevision)
        || event.facts.sourceRevision !== record.originalAudit.after.sourceTicketRevision
      ) {
        throw new OperationalStoreError(
          `Persisted diagnosis record ${record.diagnosis.id} does not match its causal milestone.`,
          "PERSISTENCE_ERROR",
        );
      }
    }
  }
  for (const audit of snapshot.audits) {
    if (!isDiagnosisAuthorityAuditAction(audit.action)) continue;
    const event = snapshot.events?.find(({ id }) => id === audit.id);
    if (snapshot.events !== undefined && (event === undefined || event.ticketId !== audit.ticketId)) {
      throw new OperationalStoreError(
        `Persisted diagnosis lifecycle audit ${audit.id} has no matching causal event.`,
        "PERSISTENCE_ERROR",
      );
    }
    if (audit.action === "diagnosis-reviewed") {
      const review = DiagnosisReviewDecisionSchema.safeParse(audit.after.diagnosisReview);
      if (
        !review.success
        || !diagnosisIds.has(review.data.diagnosisId)
        || review.data.ticketId !== audit.ticketId
        || review.data.actor !== audit.actor
        || review.data.reviewedAt !== audit.timestamp
        || audit.before.diagnosisId !== review.data.diagnosisId
        || (event !== undefined && (
          event.facts.diagnosisOutcome !== review.data.decision
          || !isSourceRevision(event.facts.sourceRevision)
          || event.facts.sourceRevision !== review.data.sourceTicketRevision
        ))
      ) {
        throw new OperationalStoreError(
          `Persisted diagnosis review audit ${audit.id} references inconsistent diagnosis or revision data.`,
          "PERSISTENCE_ERROR",
        );
      }
      continue;
    }
    const diagnosisId = audit.before.diagnosisId;
    if (typeof diagnosisId !== "string" || !diagnosisIds.has(diagnosisId)) {
      throw new OperationalStoreError(
        `Persisted diagnosis lifecycle audit ${audit.id} references an unknown diagnosis.`,
        "PERSISTENCE_ERROR",
      );
    }
    if (event !== undefined && event.facts.diagnosisId !== diagnosisId) {
      throw new OperationalStoreError(
        `Persisted diagnosis lifecycle audit ${audit.id} disagrees with its causal diagnosis reference.`,
        "PERSISTENCE_ERROR",
      );
    }
    if (event === undefined) continue;
    if (audit.action === "diagnosis-invalidated") {
      if (
        audit.after.diagnosisInvalidated !== true
        || event.facts.outcome !== "invalidated"
        || !isSourceRevision(event.facts.sourceRevision)
        || !isSourceRevision(audit.before.sourceTicketRevision)
        || event.facts.sourceRevision !== audit.before.sourceTicketRevision
      ) {
        throw new OperationalStoreError(
          `Persisted diagnosis invalidation audit ${audit.id} has inconsistent outcome or source revision data.`,
          "PERSISTENCE_ERROR",
        );
      }
    } else if (
      audit.before.fixEventId !== event.facts.fixEventId
      || snapshot.events!.find(({ id, action, ticketId }) =>
        id === audit.before.fixEventId && action === "fix-available" && ticketId === audit.ticketId,
      ) === undefined
      || audit.after.outcome !== "ineffective"
      || event.facts.outcome !== "ineffective"
    ) {
      throw new OperationalStoreError(
        `Persisted fix verification audit ${audit.id} has inconsistent causal references.`,
        "PERSISTENCE_ERROR",
      );
    }
  }
}

function diagnosisRecordMatchesOriginalAudit(record: OperationalDiagnosisRecord): boolean {
  const context = DiagnosisContextSchema.safeParse(record.originalAudit.after.diagnosis);
  if (!context.success) return false;
  const completedDiagnosis = record.diagnosis;
  const expectedOwnerTeam = context.data.owner === "engineering"
    ? "api-platform"
    : context.data.owner === "integration-partner"
      ? "integrations"
      : "support";
  return completedDiagnosis.id === `diagnosis-${record.originalAudit.id}`
    && completedDiagnosis.ticketId === record.originalAudit.ticketId
    && completedDiagnosis.problem === context.data.customerSafeSummary
    && isDeepStrictEqual(completedDiagnosis.symptoms, [context.data.causeType, ...context.data.evidenceUsed])
    && isDeepStrictEqual(completedDiagnosis.evidenceUsed, context.data.evidenceUsed)
    && isDeepStrictEqual(completedDiagnosis.evidenceReferences, context.data.evidenceReferences ?? [])
    && completedDiagnosis.ownerTeam === expectedOwnerTeam
    && isDeepStrictEqual(completedDiagnosis.fixSteps, [
      "Apply the completed diagnosis next action through the governed support workflow.",
    ])
    && isDeepStrictEqual(completedDiagnosis.verificationSteps, [
      "Confirm the customer-safe outcome after the governed next action.",
    ])
    && completedDiagnosis.completedAt === record.originalAudit.timestamp;
}

function isEligibleInvestigation(originalAudit: AuditEvent): boolean {
  const parsed = DiagnosisContextSchema.safeParse(originalAudit.after.diagnosis);
  if (!parsed.success) return false;
  const state = parsed.data.diagnosticState?.state;
  return state === undefined || state === "working-diagnosis" || state === "confirmed";
}

function isSourceRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
