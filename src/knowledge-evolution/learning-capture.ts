import {
  LearningEventSchema,
  LearningLedgerError,
  type LearningEvent,
  type LearningDeliveryLedger,
  type LearningDeliveryResult,
  type LearningLedger,
  type VerificationType,
} from "./learning-ledger.js";
import type { AuditEvent } from "../domain.js";
import { LearningCaptureEnvelopeSchema, type LearningCaptureEnvelope } from "../operational/domain.js";

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

  async deliverEnvelope(
    envelope: LearningCaptureEnvelope,
    envelopeHash: string,
  ): Promise<LearningDeliveryResult> {
    const parsedEnvelope = LearningCaptureEnvelopeSchema.safeParse(envelope);
    if (!parsedEnvelope.success) {
      throw new LearningLedgerError("Learning capture envelope failed validation.", "INVALID_EVENT", {
        cause: parsedEnvelope.error,
      });
    }
    const deliveryLedger = this.ledger as Partial<LearningDeliveryLedger>;
    if (deliveryLedger.appendDelivery === undefined) {
      throw new LearningLedgerError(
        "Learning ledger does not support durable delivery identities.",
        "PERSISTENCE_ERROR",
      );
    }
    const parsedEvent = LearningEventSchema.safeParse(learningEventFromEnvelope(parsedEnvelope.data));
    if (!parsedEvent.success) {
      throw new LearningLedgerError("Learning capture envelope could not produce a valid event.", "INVALID_EVENT", {
        cause: parsedEvent.error,
      });
    }
    return deliveryLedger.appendDelivery(
      parsedEnvelope.data.deliveryKey,
      envelopeHash,
      parsedEvent.data,
    );
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

function learningEventFromEnvelope(envelope: LearningCaptureEnvelope): LearningEvent {
  const common = {
    id: envelope.deliveryKey,
    occurredAt: envelope.occurredAt,
    actor: envelope.actor,
    correlationId: envelope.operationalEventId,
    ticketId: envelope.ticketId,
  };
  switch (envelope.eventType) {
    case "diagnosis-recorded":
    case "diagnosis-approved":
      return {
        ...common,
        eventType: envelope.eventType,
        diagnosisId: envelope.diagnosisId,
        payload: {
          evidenceIds: [...envelope.evidenceIds],
          knowledgeArticleIds: [...envelope.knowledgeArticleIds],
          provenance: envelope.provenance,
        },
      };
    case "fix-available":
      return {
        ...common,
        eventType: envelope.eventType,
        ...(envelope.diagnosisId === undefined ? {} : { diagnosisId: envelope.diagnosisId }),
        ...(envelope.knownEventId === undefined ? {} : { knownEventId: envelope.knownEventId }),
        payload: {
          outcomeStatus: envelope.outcomeStatus,
          provenance: envelope.provenance,
        },
      };
    case "outcome-verified":
      return {
        ...common,
        eventType: envelope.eventType,
        diagnosisId: envelope.diagnosisId,
        payload: {
          evidenceIds: [...envelope.evidenceIds],
          verificationType: envelope.verificationType,
          outcomeStatus: envelope.outcomeStatus,
          provenance: envelope.provenance,
        },
      };
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
