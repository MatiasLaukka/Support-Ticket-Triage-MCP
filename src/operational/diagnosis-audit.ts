import { isDeepStrictEqual } from "node:util";
import {
  AuditEventSchema,
  CustomerReplyWatermarkSchema,
  DiagnosisIdSchema,
  IsoTimestampSchema,
  TicketIdSchema,
  type AuditEvent,
} from "../domain.js";
import {
  OperationalDiagnosisContextSchema,
  type OperationalEvent,
  type OperationalResultReference,
} from "./domain.js";

/** Diagnosis lifecycle actions whose persisted payload can affect authority. */
export const DIAGNOSIS_AUTHORITY_AUDIT_ACTIONS = [
  "diagnosis-reviewed",
  "diagnosis-invalidated",
  "fix-ineffective",
] as const satisfies readonly AuditEvent["action"][];

export const DIAGNOSIS_ORIGIN_AUDIT_ACTIONS = [
  "diagnosis-completed",
  "diagnostic-escalated",
] as const satisfies readonly AuditEvent["action"][];

export type DiagnosisAuthorityAuditAction = (typeof DIAGNOSIS_AUTHORITY_AUDIT_ACTIONS)[number];
export type DiagnosisOriginAuditAction = (typeof DIAGNOSIS_ORIGIN_AUDIT_ACTIONS)[number];

export function isDiagnosisAuthorityAuditAction(
  action: AuditEvent["action"] | OperationalEvent["action"],
): action is DiagnosisAuthorityAuditAction {
  return (DIAGNOSIS_AUTHORITY_AUDIT_ACTIONS as readonly string[]).includes(action);
}

export function isDiagnosisOriginAuditAction(
  action: AuditEvent["action"] | OperationalEvent["action"],
): action is DiagnosisOriginAuditAction {
  return (DIAGNOSIS_ORIGIN_AUDIT_ACTIONS as readonly string[]).includes(action);
}

export function isDiagnosisReceiptBackedAuditAction(
  action: AuditEvent["action"] | OperationalEvent["action"],
): action is DiagnosisAuthorityAuditAction | DiagnosisOriginAuditAction {
  return isDiagnosisAuthorityAuditAction(action) || isDiagnosisOriginAuditAction(action);
}

export class DiagnosisAuditIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosisAuditIntegrityError";
  }
}

export function receiptBackedDiagnosisAuditForEvent(
  event: Pick<OperationalEvent, "id" | "ticketId" | "action" | "actor" | "occurredAt" | "facts">,
  result: OperationalResultReference | undefined,
  policy: "strict" | "legacy",
): AuditEvent | undefined {
  const lifecycleAudit = result?.lifecycleAuditEvents?.find(({ id }) => id === event.id);
  if (!isDiagnosisReceiptBackedAuditAction(event.action)) {
    return lifecycleAudit === undefined
      ? undefined
      : validateDiagnosisAuthorityAudit(event, lifecycleAudit);
  }
  if (lifecycleAudit === undefined) {
    if (policy === "legacy") return undefined;
    throw new DiagnosisAuditIntegrityError(
      `Persisted diagnosis lifecycle audit for event ${event.id} is missing.`,
    );
  }
  if (
    isDiagnosisOriginAuditAction(event.action)
    && result?.diagnosisId !== `diagnosis-${event.id}`
  ) {
    throw new DiagnosisAuditIntegrityError(
      `Persisted diagnosis receipt for event ${event.id} has an inconsistent diagnosis identity.`,
    );
  }
  if (result === undefined || !allowedReceiptOperations(event.action).includes(result.operation)) {
    throw new DiagnosisAuditIntegrityError(
      `Persisted diagnosis receipt for event ${event.id} has an inconsistent command operation.`,
    );
  }
  if (
    result.tickets.length !== 1
    || result.tickets[0]?.ticketId !== event.ticketId
    || result.tickets[0].operationalEventIds.length !== 1
    || result.tickets[0].operationalEventIds[0] !== event.id
  ) {
    throw new DiagnosisAuditIntegrityError(
      `Persisted diagnosis receipt for event ${event.id} has an inconsistent causal command reference.`,
    );
  }
  return validateDiagnosisAuthorityAudit(event, lifecycleAudit);
}

export function validateDiagnosisAuthorityAudit(
  event: Pick<OperationalEvent, "id" | "ticketId" | "action" | "actor" | "occurredAt" | "facts">,
  rawAudit: unknown,
): AuditEvent {
  const audit = AuditEventSchema.safeParse(rawAudit);
  if (!audit.success) {
    throw new DiagnosisAuditIntegrityError(
      `Persisted diagnosis lifecycle audit for event ${event.id} failed schema validation.`,
    );
  }
  if (
    audit.data.id !== event.id
    || audit.data.ticketId !== event.ticketId
    || audit.data.action !== event.action
    || audit.data.actor !== event.actor
    || audit.data.timestamp !== event.occurredAt
  ) {
    throw new DiagnosisAuditIntegrityError(
      `Persisted diagnosis lifecycle audit for event ${event.id} does not match its causal event.`,
    );
  }
  validateReceiptAuditPayload(event, audit.data);
  return audit.data;
}

function validateReceiptAuditPayload(
  event: Pick<OperationalEvent, "action" | "actor" | "ticketId" | "occurredAt" | "facts">,
  audit: AuditEvent,
): void {
  const facts = eventFacts(event);
  if (event.action === "diagnosis-completed" || event.action === "diagnostic-escalated") {
    if (
      !OperationalDiagnosisContextSchema.safeParse(audit.after.diagnosis).success
      || !isRevision(audit.after.sourceTicketRevision)
      || !isRevision(facts.sourceRevision)
      || audit.after.sourceTicketRevision !== facts.sourceRevision
    ) {
      throw new DiagnosisAuditIntegrityError(
        "Persisted diagnosis origin audit has an invalid diagnosis payload.",
      );
    }
    return;
  }
  if (event.action === "diagnosis-reviewed") {
    const review = audit.after.diagnosisReview;
    const reviewRecord = typeof review === "object" && review !== null
      ? review as Record<string, unknown>
      : undefined;
    if (
      reviewRecord === undefined
      || !isDiagnosisReviewRecord(reviewRecord)
      || reviewRecord.ticketId !== event.ticketId
      || reviewRecord.actor !== event.actor
      || reviewRecord.reviewedAt !== event.occurredAt
      || audit.before.diagnosisId !== reviewRecord.diagnosisId
      || facts.diagnosisOutcome !== reviewRecord.decision
      || !isRevision(reviewRecord.sourceTicketRevision)
      || facts.sourceRevision !== reviewRecord.sourceTicketRevision
    ) {
      throw new DiagnosisAuditIntegrityError(
        "Persisted diagnosis review audit does not match its causal event.",
      );
    }
    return;
  }
  if (event.action === "diagnosis-invalidated") {
    if (
      audit.before.diagnosisId !== facts.diagnosisId
      || audit.after.diagnosisInvalidated !== true
      || facts.outcome !== "invalidated"
      || !isRevision(audit.before.sourceTicketRevision)
      || !isRevision(facts.sourceRevision)
      || audit.before.sourceTicketRevision !== facts.sourceRevision
    ) {
      throw new DiagnosisAuditIntegrityError(
        "Persisted diagnosis invalidation audit does not match its causal event.",
      );
    }
    return;
  }
  if (event.action === "fix-ineffective" && (
    audit.before.diagnosisId !== facts.diagnosisId
    || audit.before.fixEventId !== facts.fixEventId
    || audit.after.outcome !== "ineffective"
    || facts.outcome !== "ineffective"
  )) {
    throw new DiagnosisAuditIntegrityError(
      "Persisted ineffective-fix audit does not match its causal event.",
    );
  }
}

function isDiagnosisReviewRecord(review: Record<string, unknown>): boolean {
  const decision = review.decision;
  const allowedKeys = new Set([
    "decision",
    "diagnosisId",
    "ticketId",
    "sourceTicketRevision",
    "sourceConversationWatermark",
    "editedDiagnosis",
    "actor",
    "rationale",
    "reviewedAt",
  ]);
  return (
    Object.keys(review).every((key) => allowedKeys.has(key))
    && (decision === "approve" || decision === "reject" || decision === "revalidate")
    && DiagnosisIdSchema.safeParse(review.diagnosisId).success
    && TicketIdSchema.safeParse(review.ticketId).success
    && isRevision(review.sourceTicketRevision)
    && CustomerReplyWatermarkSchema.safeParse(review.sourceConversationWatermark).success
    && OperationalDiagnosisContextSchema.safeParse(review.editedDiagnosis).success
    && isNonBlankString(review.actor)
    && IsoTimestampSchema.safeParse(review.reviewedAt).success
    && (review.rationale === undefined || isNonBlankString(review.rationale))
    && (decision === "approve" || review.rationale !== undefined)
  );
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function eventFacts(event: Pick<OperationalEvent, "action" | "facts">): Record<string, unknown> {
  return event.facts;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export interface DiagnosisAuditProjectionInput {
  readonly events: readonly OperationalEvent[];
  readonly receiptResults: ReadonlyMap<string, OperationalResultReference | undefined>;
  readonly fallbackAudits: readonly AuditEvent[];
  readonly fallbackAuditsByEventId?: ReadonlyMap<string, readonly AuditEvent[]>;
  readonly originalAudits: readonly AuditEvent[];
  readonly policy: "strict" | "legacy";
}

/**
 * Projects operational audits from one receipt map and explicit compatibility
 * fallbacks. Diagnosis lifecycle actions are receipt-backed under strict
 * policy; legacy policy is only allowed to use the supplied fallback audit.
 */
export function projectDiagnosisAudits({
  events,
  receiptResults,
  fallbackAudits,
  fallbackAuditsByEventId,
  originalAudits,
  policy,
}: DiagnosisAuditProjectionInput): AuditEvent[] {
  const originalById = uniqueAuditMap(originalAudits, "original diagnosis");
  const fallbackById = uniqueAuditMap(
    fallbackAudits.filter((audit) => !originalById.has(audit.id)),
    "fallback",
  );
  const receiptAudits = new Map<string, AuditEvent>();
  const projectedAudits = events.flatMap((event) => {
    const fallbackAudit = originalById.get(event.id) ?? fallbackById.get(event.id);
    const eventFallbackAudits = fallbackAuditsByEventId?.get(event.id) ?? (
      fallbackAudit === undefined ? [] : [fallbackAudit]
    );
    const receiptAudit = receiptBackedDiagnosisAuditForEvent(
      event,
      receiptResults.get(event.commandId),
      isDiagnosisReceiptBackedAuditAction(event.action) ? policy : "legacy",
    );
    if (receiptAudit !== undefined) {
      receiptAudits.set(event.id, receiptAudit);
      if (
        isDiagnosisReceiptBackedAuditAction(event.action)
        && isDiagnosisOriginAuditAction(event.action)
        && fallbackAudit !== undefined
        && !isDeepStrictEqual(receiptAudit, fallbackAudit)
      ) {
        throw new DiagnosisAuditIntegrityError(
          `Persisted diagnosis audit for event ${event.id} disagrees with its stored diagnosis history.`,
        );
      }
      return [receiptAudit];
    }
    return eventFallbackAudits;
  });
  const projectedById = uniqueAuditMap(projectedAudits, "projected");
  for (const event of events) {
    const receiptAudit = receiptAudits.get(event.id);
    if (receiptAudit !== undefined) {
      validateCrossRecordReferences(event, receiptAudit, events, originalAudits, projectedById);
    }
  }
  return projectedAudits;
}

function validateCrossRecordReferences(
  event: OperationalEvent,
  audit: AuditEvent,
  events: readonly OperationalEvent[],
  originalAudits: readonly AuditEvent[],
  projectedAudits: ReadonlyMap<string, AuditEvent>,
): void {
  if (!isDiagnosisAuthorityAuditAction(event.action)) return;
  const diagnosisId = audit.before.diagnosisId;
  const diagnosisIds = new Set(originalAudits
    .filter(({ action }) => isDiagnosisOriginAuditAction(action))
    .map(({ id }) => id));
  if (typeof diagnosisId !== "string" || !diagnosisIds.has(diagnosisId)) {
    throw new DiagnosisAuditIntegrityError(
      `Persisted diagnosis audit ${event.id} references an unknown diagnosis.`,
    );
  }
  if (
    event.action === "fix-ineffective"
    && (typeof audit.before.fixEventId !== "string"
      || events.some(({ id, ticketId, action }) =>
        id === audit.before.fixEventId
        && ticketId === event.ticketId
        && action === "fix-available",
      ) === false
      || (() => {
        const fixEvent = events.find(({ id }) => id === audit.before.fixEventId);
        const fixAudit = projectedAudits.get(audit.before.fixEventId as string);
        return fixEvent === undefined
          || fixAudit?.before.diagnosisId !== diagnosisId
          || fixEvent.sequence >= event.sequence;
      })())
  ) {
    throw new DiagnosisAuditIntegrityError(
      `Persisted ineffective-fix audit ${event.id} references an unknown fix event.`,
    );
  }
}

function uniqueAuditMap(audits: readonly AuditEvent[], label: string): Map<string, AuditEvent> {
  const byId = new Map<string, AuditEvent>();
  for (const audit of audits) {
    const existing = byId.get(audit.id);
    if (existing !== undefined && !isDeepStrictEqual(existing, audit)) {
      throw new DiagnosisAuditIntegrityError(
        `Persisted ${label} audits contain contradictory identity ${audit.id}.`,
      );
    }
    byId.set(audit.id, audit);
  }
  return byId;
}

function allowedReceiptOperations(action: OperationalEvent["action"]): readonly string[] {
  switch (action) {
    case "diagnosis-completed":
    case "diagnostic-escalated":
      return ["record-diagnosis"];
    case "diagnosis-reviewed":
      return ["review-diagnosis", "review-diagnosis-workflow"];
    case "diagnosis-invalidated":
      return ["invalidate-diagnosis"];
    case "fix-ineffective":
      return ["record-fix-ineffective"];
    default:
      return [];
  }
}
