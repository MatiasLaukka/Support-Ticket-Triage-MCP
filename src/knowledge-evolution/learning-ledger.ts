import { z } from "zod";
import { IsoTimestampSchema, TicketIdSchema } from "../domain.js";

const IdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const SlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
const UnsafePersistedText = /(?:\b(?:raw\s+)?(?:system|developer|user)\s+(?:prompt|message|instructions?)\b|\braw\s+prompt\b|\b(?:hidden|chain[- ]of[- ]thought|reasoning)\b|\b(?:api[-_]?key|access[-_]?token|secret|password)\s*[=:]\s*\S+|\bsk-[a-z0-9_-]+\b|\b(?:[a-z]:[\\/]|\\\\)|(?:^|\s)[~\/]\S*)/i;
const SanitizedTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !UnsafePersistedText.test(value), "Learning text must be sanitized.");
const ActorSchema = SanitizedTextSchema.max(120);
const EvidenceIdsSchema = z.array(SlugSchema).max(64).refine(
  (values) => new Set(values).size === values.length,
  "Evidence IDs must be unique.",
);
const ArticleIdsSchema = z.array(SlugSchema).max(64).refine(
  (values) => new Set(values).size === values.length,
  "Knowledge article IDs must be unique.",
);
const EventIdsSchema = z.array(z.uuid()).max(128).refine(
  (values) => new Set(values).size === values.length,
  "Event IDs must be unique.",
);
const SafeReasonsSchema = z.array(SanitizedTextSchema).max(32).refine(
  (values) => new Set(values).size === values.length,
  "Reasons must be unique.",
);
const ProvenanceSchema = SanitizedTextSchema.max(240);

export const LearningEventTypeSchema = z.enum([
  "diagnosis-recorded",
  "diagnosis-approved",
  "fix-available",
  "outcome-verified",
  "candidate-created",
  "candidate-deferred",
  "candidate-rejected",
  "candidate-promoted",
  "knowledge-reused",
  "knowledge-reuse-failed",
  "knowledge-marked-stale",
  "knowledge-deprecated",
  "evaluation-recorded",
]);

export const LearningMaturitySchema = z.enum([
  "observed",
  "diagnosis-supported",
  "outcome-verified",
  "reuse-validated",
  "promoted",
]);

export const LearningHealthSchema = z.enum([
  "active",
  "stale",
  "contradicted",
  "deprecated",
  "superseded",
]);

export const VerificationTypeSchema = z.enum([
  "customer-confirmed",
  "technically-verified",
]);

const OutcomeStatusSchema = z.enum([
  "recorded",
  "approved",
  "available",
  "mitigated",
  "resolved",
  "failed",
]);

const EventBase = {
  id: z.uuid(),
  occurredAt: IsoTimestampSchema,
  actor: ActorSchema,
  correlationId: z.uuid(),
  ticketId: TicketIdSchema.optional(),
  diagnosisId: IdentifierSchema.optional(),
  candidateId: IdentifierSchema.optional(),
  objectId: IdentifierSchema.optional(),
  sourceVersion: z.number().int().positive().optional(),
};

const DiagnosisReferences = {
  ticketId: TicketIdSchema,
  diagnosisId: IdentifierSchema,
};

const CandidateReferences = {
  candidateId: IdentifierSchema,
};

const ObjectReferences = {
  objectId: IdentifierSchema,
  sourceVersion: z.number().int().positive(),
};

const DiagnosisPayload = z
  .object({
    evidenceIds: EvidenceIdsSchema,
    knowledgeArticleIds: ArticleIdsSchema,
    provenance: ProvenanceSchema,
  })
  .strict();

const FixPayload = z
  .object({
    outcomeStatus: z.enum(["available", "mitigated"]),
    provenance: ProvenanceSchema,
  })
  .strict();

const OutcomePayload = z
  .object({
    evidenceIds: EvidenceIdsSchema.min(1),
    verificationType: VerificationTypeSchema,
    outcomeStatus: z.literal("resolved"),
    provenance: ProvenanceSchema,
  })
  .strict();

const CandidateCreatedPayload = z
  .object({
    maturity: z.enum(["observed", "diagnosis-supported"]),
    supportingEventIds: EventIdsSchema.default([]),
    provenance: ProvenanceSchema,
  })
  .strict();

const CandidateDeferredPayload = z
  .object({
    maturity: z.enum(["observed", "diagnosis-supported"]),
    provenance: ProvenanceSchema,
  })
  .strict();

const CandidateRejectedPayload = z
  .object({
    rejectionReason: SanitizedTextSchema,
    provenance: ProvenanceSchema,
  })
  .strict();

const CandidatePromotedPayload = z
  .object({
    maturity: z.literal("promoted"),
    health: z.literal("active"),
    provenance: ProvenanceSchema,
  })
  .strict();

const ReusePayload = z
  .object({
    matchReasons: SafeReasonsSchema.min(1),
    evidenceIds: EvidenceIdsSchema,
    provenance: ProvenanceSchema,
  })
  .strict();

const FailedReusePayload = z
  .object({
    matchReasons: SafeReasonsSchema,
    failureReason: SanitizedTextSchema,
    provenance: ProvenanceSchema,
  })
  .strict();

const StalePayload = z
  .object({
    health: z.literal("stale"),
    staleReasons: SafeReasonsSchema.min(1),
    provenance: ProvenanceSchema,
  })
  .strict();

const DeprecatedPayload = z
  .object({
    health: z.literal("deprecated"),
    reason: SanitizedTextSchema,
    provenance: ProvenanceSchema,
  })
  .strict();

const EvaluationPayload = z
  .object({
    matchReasons: SafeReasonsSchema,
    provenance: ProvenanceSchema,
  })
  .strict();

export const LearningEventSchema = z.discriminatedUnion("eventType", [
  z.object({ ...EventBase, eventType: z.literal("diagnosis-recorded"), ...DiagnosisReferences, payload: DiagnosisPayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("diagnosis-approved"), ...DiagnosisReferences, payload: DiagnosisPayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("fix-available"), ...DiagnosisReferences, payload: FixPayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("outcome-verified"), ...DiagnosisReferences, payload: OutcomePayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("candidate-created"), ...CandidateReferences, payload: CandidateCreatedPayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("candidate-deferred"), ...CandidateReferences, payload: CandidateDeferredPayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("candidate-rejected"), ...CandidateReferences, payload: CandidateRejectedPayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("candidate-promoted"), ...CandidateReferences, ...ObjectReferences, payload: CandidatePromotedPayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("knowledge-reused"), ...ObjectReferences, ticketId: TicketIdSchema, payload: ReusePayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("knowledge-reuse-failed"), ...ObjectReferences, ticketId: TicketIdSchema, payload: FailedReusePayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("knowledge-marked-stale"), ...ObjectReferences, payload: StalePayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("knowledge-deprecated"), ...ObjectReferences, payload: DeprecatedPayload }).strict(),
  z.object({ ...EventBase, eventType: z.literal("evaluation-recorded"), ticketId: TicketIdSchema, objectId: IdentifierSchema.optional(), sourceVersion: z.number().int().positive().optional(), payload: EvaluationPayload }).strict(),
]);

export type LearningEventType = z.infer<typeof LearningEventTypeSchema>;
export type LearningMaturity = z.infer<typeof LearningMaturitySchema>;
export type LearningHealth = z.infer<typeof LearningHealthSchema>;
export type VerificationType = z.infer<typeof VerificationTypeSchema>;
export type LearningEvent = z.infer<typeof LearningEventSchema>;

export interface LearningEventFilters {
  eventType?: LearningEventType;
  eventTypes?: readonly LearningEventType[];
  ticketId?: string;
  diagnosisId?: string;
  candidateId?: string;
  objectId?: string;
  occurredAfter?: string;
  occurredBefore?: string;
}

export interface LearningLedger {
  initialize(): Promise<void>;
  append(event: LearningEvent): Promise<void>;
  appendBatch(events: readonly LearningEvent[]): Promise<void>;
  list(filters?: LearningEventFilters): Promise<LearningEvent[]>;
  has(id: string): Promise<boolean>;
}

export type LearningLedgerErrorCode =
  | "INVALID_EVENT"
  | "EVENT_CONFLICT"
  | "PERSISTENCE_ERROR";

export class LearningLedgerError extends Error {
  constructor(
    message: string,
    public readonly code: LearningLedgerErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LearningLedgerError";
  }
}
