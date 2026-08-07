import {
  LearningEventSchema,
  LearningLedgerError,
  type LearningEvent,
  type LearningLedger,
  type VerificationType,
} from "./learning-ledger.js";
import type { AuditEvent } from "../domain.js";

export interface LearningCaptureContext {
  diagnosisId?: string;
  evidenceIds?: readonly string[];
  verificationType?: VerificationType;
  knownEventId?: string;
  provenance?: string;
}

/** Maps successful operational audit facts into sanitized, durable learning events. */
export class LearningCaptureService {
  constructor(private readonly ledger: LearningLedger) {}

  async recordAuditOutcome(event: AuditEvent, context: LearningCaptureContext = {}): Promise<LearningEvent | undefined> {
    const learningEvent = this.toLearningEvent(event, context);
    if (learningEvent === undefined) return undefined;
    const parsed = LearningEventSchema.safeParse(learningEvent);
    if (!parsed.success) {
      throw new LearningLedgerError("Operational outcome could not be represented as a learning event.", "INVALID_EVENT", { cause: parsed.error });
    }
    await this.ledger.append(parsed.data);
    return parsed.data;
  }

  private toLearningEvent(event: AuditEvent, context: LearningCaptureContext): LearningEvent | undefined {
    const provenance = context.provenance ?? `Sanitized operational outcome: ${event.action}.`;
    const evidenceIds = [...new Set(context.evidenceIds ?? evidenceIdsFromDiagnosis(event))];
    const common = {
      id: event.id,
      occurredAt: event.timestamp,
      actor: event.actor,
      correlationId: event.id,
      ticketId: event.ticketId,
      ...(context.knownEventId === undefined ? {} : { knownEventId: context.knownEventId }),
    };

    if (event.action === "diagnosis-completed" || event.action === "diagnostic-escalated") {
      return {
        ...common,
        diagnosisId: context.diagnosisId ?? event.id,
        eventType: "diagnosis-recorded",
        payload: {
          evidenceIds,
          knowledgeArticleIds: [...event.knowledgeArticleIds],
          provenance,
        },
      };
    }

    if (event.action === "diagnosis-reviewed" && decisionFromReview(event) === "approve") {
      const diagnosisId = context.diagnosisId ?? stringValue(asRecord(event.before)?.diagnosisId);
      if (diagnosisId === undefined) {
        throw new LearningLedgerError("Approved diagnosis review has no diagnosis reference.", "INVALID_EVENT");
      }
      return {
        ...common,
        diagnosisId,
        eventType: "diagnosis-approved",
        payload: {
          evidenceIds,
          knowledgeArticleIds: [...event.knowledgeArticleIds],
          provenance,
        },
      };
    }

    if (event.action === "fix-available" || event.action === "platform-mitigation-available") {
      const diagnosisId = context.diagnosisId ?? stringValue(asRecord(event.before)?.diagnosisId) ?? stringValue(asRecord(event.after)?.diagnosisId);
      const knownEventId = context.knownEventId ?? knownEventFromAudit(event);
      return {
        ...common,
        ...(diagnosisId === undefined ? {} : { diagnosisId }),
        ...(knownEventId === undefined ? {} : { knownEventId }),
        eventType: "fix-available",
        payload: {
          outcomeStatus: "available",
          provenance,
        },
      };
    }

    if (event.action === "ticket-updated" && stringValue(asRecord(event.after)?.status) === "resolved") {
      if (context.verificationType === undefined) return undefined;
      const diagnosisId = context.diagnosisId;
      if (diagnosisId === undefined) {
        throw new LearningLedgerError("Verified outcome has no diagnosis reference.", "INVALID_EVENT");
      }
      return {
        ...common,
        diagnosisId,
        eventType: "outcome-verified",
        payload: {
          evidenceIds,
          verificationType: context.verificationType,
          outcomeStatus: "resolved",
          provenance,
        },
      };
    }

    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function decisionFromReview(event: AuditEvent): string | undefined {
  return stringValue(asRecord(asRecord(event.after)?.diagnosisReview)?.decision);
}

function evidenceIdsFromDiagnosis(event: AuditEvent): string[] {
  const references = asRecord(asRecord(event.after)?.diagnosis)?.evidenceReferences;
  if (!Array.isArray(references)) return [];
  return [...new Set(references.flatMap((reference) => {
    const id = stringValue(asRecord(reference)?.id);
    return id === undefined ? [] : [id];
  }))];
}

function knownEventFromAudit(event: AuditEvent): string | undefined {
  const candidate = stringValue(asRecord(event.after)?.eventId);
  return candidate?.match(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/) === null ? undefined : candidate;
}
