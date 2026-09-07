import { AuditEventSchema, type AuditEvent } from "../domain.js";
import type { OperationalEvent, OperationalResultReference } from "./domain.js";

/** Diagnosis lifecycle actions whose persisted payload can affect authority. */
export const DIAGNOSIS_AUTHORITY_AUDIT_ACTIONS = [
  "diagnosis-reviewed",
  "diagnosis-invalidated",
  "fix-ineffective",
] as const satisfies readonly AuditEvent["action"][];

export type DiagnosisAuthorityAuditAction = (typeof DIAGNOSIS_AUTHORITY_AUDIT_ACTIONS)[number];

export function isDiagnosisAuthorityAuditAction(
  action: AuditEvent["action"] | OperationalEvent["action"],
): action is DiagnosisAuthorityAuditAction {
  return (DIAGNOSIS_AUTHORITY_AUDIT_ACTIONS as readonly string[]).includes(action);
}

export class DiagnosisAuditIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosisAuditIntegrityError";
  }
}

export function receiptBackedDiagnosisAuditForEvent(
  event: Pick<OperationalEvent, "id" | "ticketId" | "action" | "actor" | "occurredAt">,
  result: OperationalResultReference | undefined,
  policy: "strict" | "legacy",
): AuditEvent | undefined {
  const lifecycleAudit = result?.lifecycleAuditEvents?.find(({ id }) => id === event.id);
  if (!isDiagnosisAuthorityAuditAction(event.action)) {
    return lifecycleAudit === undefined ? undefined : AuditEventSchema.parse(lifecycleAudit);
  }
  if (lifecycleAudit === undefined) {
    if (policy === "legacy") return undefined;
    throw new DiagnosisAuditIntegrityError(
      `Persisted diagnosis lifecycle audit for event ${event.id} is missing.`,
    );
  }
  return validateDiagnosisAuthorityAudit(event, lifecycleAudit);
}

export function validateDiagnosisAuthorityAudit(
  event: Pick<OperationalEvent, "id" | "ticketId" | "action" | "actor" | "occurredAt">,
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
  return audit.data;
}
