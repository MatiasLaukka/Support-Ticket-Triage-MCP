import { z } from "zod";
import {
  AuditActionSchema,
  AuditEventSchema,
  CategorySchema,
  IsoTimestampSchema,
  KnownEventIdSchema,
  PrioritySchema,
  TeamSchema,
  TicketIdSchema,
  TicketSchema,
  TriageRecommendationSchema,
} from "../domain.js";
import { CompletedDiagnosisSchema } from "../knowledge-evolution/domain.js";

const NonBlankStringSchema = z.string().trim().min(1);
const IdentifierSchema = z.string().trim().min(1).max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const SafeFactTextSchema = NonBlankStringSchema.max(500).refine(
  (value) => !/(?:\b(?:raw\s+)?(?:system|developer|user)\s+(?:prompt|message|instructions?)\b|\braw\s+prompt\b|\b(?:hidden|chain[- ]of[- ]thought|reasoning)\b|\b(?:api[-_]?key|access[-_]?token|secret|password)\s*[=:]\s*\S+|\bsk-[a-z0-9_-]+\b|\b(?:[a-z]:[\\/]|\\\\)|(?:^|\s)[~\/][^\s]*)/i.test(value),
  "Operational facts must not contain prompts, hidden reasoning, secrets, or paths.",
);

export const OperationalEventIdSchema = z.uuid();
export const CommandIdSchema = z.uuid();
export const RequestHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const MessageIdSchema = z.uuid();
export const TicketSequenceSchema = z.number().int().positive();
export const RevisionNumberSchema = z.number().int().nonnegative();
export const OperationalOutboxStatusSchema = z.enum(["pending", "delivered", "dead-letter"]);
export const ImportStateSchema = z.enum(["empty", "import-in-progress", "imported", "native"]);
export const VerificationTypeSchema = z.enum(["customer-confirmed", "technically-verified"]);

const UniqueOperationalEventIdsSchema = z.array(OperationalEventIdSchema).min(1).refine(
  (ids) => new Set(ids).size === ids.length,
  "Operational event IDs must be unique.",
);
const UniqueIdentifierSchema = z.array(IdentifierSchema).refine(
  (ids) => new Set(ids).size === ids.length,
  "Identifiers must be unique.",
);
const SafeFactKeySchema = z.string().trim().min(1).max(80).refine(
  (key) => !/(?:body|customer.?response|prompt|reasoning|credential|secret|token|password|path)/i.test(key),
  "Operational fact keys must not name customer content or sensitive data.",
);
const SanitizedOperationalFactValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  SafeFactTextSchema,
  z.number().finite(),
  z.boolean(),
  z.array(SanitizedOperationalFactValueSchema).max(32),
  z.record(SafeFactKeySchema, SanitizedOperationalFactValueSchema).refine(
    (record) => Object.keys(record).length <= 32,
    "Operational fact records may contain at most 32 values.",
  ),
]));
const SanitizedOperationalFactsSchema = z.record(
  SafeFactKeySchema,
  SanitizedOperationalFactValueSchema,
).refine(
  (record) => Object.keys(record).length <= 32,
  "Operational facts may contain at most 32 values.",
);

/**
 * The append-only causal spine. Child aggregates reference this event; the
 * event itself never owns reverse foreign keys to those aggregates.
 */
export const OperationalEventSchema = z.object({
  id: OperationalEventIdSchema,
  ticketId: TicketIdSchema,
  sequence: TicketSequenceSchema,
  occurredAt: IsoTimestampSchema,
  actor: NonBlankStringSchema.max(120),
  action: AuditActionSchema,
  commandId: CommandIdSchema,
  facts: SanitizedOperationalFactsSchema,
}).strict().readonly();

export const TicketRevisionSchema = z.object({
  ticketId: TicketIdSchema,
  revision: RevisionNumberSchema,
  ticket: TicketSchema,
  operationalEventId: OperationalEventIdSchema,
  createdAt: IsoTimestampSchema,
}).strict().superRefine((revision, context) => {
  if (revision.ticket.id !== revision.ticketId) {
    context.addIssue({ code: "custom", path: ["ticket", "id"], message: "Ticket revision must match its ticket ID." });
  }
  if (revision.ticket.revision !== revision.revision) {
    context.addIssue({ code: "custom", path: ["ticket", "revision"], message: "Ticket revision must match the canonical ticket projection." });
  }
}).readonly();

export const ConversationMessageSchema = z.object({
  id: MessageIdSchema,
  ticketId: TicketIdSchema,
  operationalEventId: OperationalEventIdSchema,
  kind: z.enum(["customer", "support"]),
  createdAt: IsoTimestampSchema,
  body: NonBlankStringSchema.max(20_000),
  recommendationId: z.uuid().optional(),
}).strict().readonly();

export const RecommendationRevisionSchema = z.object({
  recommendation: TriageRecommendationSchema,
  operationalEventId: OperationalEventIdSchema,
  createdAt: IsoTimestampSchema,
}).strict().readonly();

export const OperationalDiagnosisRecordSchema = z.object({
  diagnosis: CompletedDiagnosisSchema,
  operationalEventId: OperationalEventIdSchema,
}).strict().readonly();

/** A diagnosis event has a revision exactly when its committed Ticket changed. */
export const DiagnosisCompletionSchema = z.object({
  diagnosis: OperationalDiagnosisRecordSchema,
  ticketProjectionChanged: z.boolean(),
  ticketRevision: TicketRevisionSchema.optional(),
}).strict().superRefine((completion, context) => {
  if (completion.ticketProjectionChanged !== (completion.ticketRevision !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["ticketRevision"],
      message: "Diagnosis completion has a ticket revision only when the canonical ticket projection changed.",
    });
  }
  if (completion.ticketRevision?.ticketId !== completion.diagnosis.diagnosis.ticketId) {
    context.addIssue({ code: "custom", path: ["ticketRevision", "ticketId"], message: "Diagnosis ticket revision must belong to the diagnosed ticket." });
  }
}).readonly();

const LearningEnvelopeBase = {
  operationalEventId: OperationalEventIdSchema,
  deliveryKey: z.uuid(),
  occurredAt: IsoTimestampSchema,
  actor: NonBlankStringSchema.max(120),
  ticketId: TicketIdSchema,
};
const LearningDiagnosisFacts = {
  diagnosisId: IdentifierSchema,
  evidenceIds: UniqueIdentifierSchema,
  knowledgeArticleIds: UniqueIdentifierSchema,
  provenance: SafeFactTextSchema.max(240),
};

/** Immutable, commit-time facts for the only operational-to-learning mappings. */
export const LearningCaptureEnvelopeSchema = z.discriminatedUnion("eventType", [
  z.object({ ...LearningEnvelopeBase, eventType: z.literal("diagnosis-recorded"), ...LearningDiagnosisFacts }).strict().readonly(),
  z.object({ ...LearningEnvelopeBase, eventType: z.literal("diagnosis-approved"), ...LearningDiagnosisFacts }).strict().readonly(),
  z.object({
    ...LearningEnvelopeBase,
    eventType: z.literal("fix-available"),
    diagnosisId: IdentifierSchema.optional(),
    knownEventId: KnownEventIdSchema.optional(),
    outcomeStatus: z.enum(["available", "mitigated"]),
    provenance: SafeFactTextSchema.max(240),
  }).strict().readonly(),
  z.object({
    ...LearningEnvelopeBase,
    eventType: z.literal("outcome-verified"),
    diagnosisId: IdentifierSchema,
    evidenceIds: UniqueIdentifierSchema,
    verificationType: VerificationTypeSchema,
    outcomeStatus: z.literal("resolved"),
    provenance: SafeFactTextSchema.max(240),
  }).strict().readonly(),
]);

export const OperationalOutboxRowSchema = z.object({
  id: z.uuid(),
  operationalEventId: OperationalEventIdSchema,
  deliveryKey: z.uuid(),
  envelope: LearningCaptureEnvelopeSchema,
  status: OperationalOutboxStatusSchema,
  attempts: z.number().int().nonnegative(),
  createdAt: IsoTimestampSchema,
  claimedBy: NonBlankStringSchema.max(120).optional(),
  claimedAt: IsoTimestampSchema.optional(),
  deliveredAt: IsoTimestampSchema.optional(),
  errorCode: NonBlankStringSchema.max(120).optional(),
}).strict().superRefine((row, context) => {
  if (row.envelope.operationalEventId !== row.operationalEventId) {
    context.addIssue({ code: "custom", path: ["envelope", "operationalEventId"], message: "Outbox envelope must reference its committed operational event." });
  }
  if (row.envelope.deliveryKey !== row.deliveryKey) {
    context.addIssue({ code: "custom", path: ["envelope", "deliveryKey"], message: "Outbox envelope must use the row delivery key." });
  }
  if (row.status === "delivered" && row.deliveredAt === undefined) {
    context.addIssue({ code: "custom", path: ["deliveredAt"], message: "Delivered outbox rows require a delivery timestamp." });
  }
}).readonly();

/** Per-ticket outcome required to replay a multi-ticket command faithfully. */
export const OperationalTicketResultSchema = z.object({
  ticketId: TicketIdSchema,
  operationalEventIds: UniqueOperationalEventIdsSchema,
  resultingRevision: RevisionNumberSchema.nullable(),
}).strict().readonly();

/** The immutable semantic result replayed for a duplicate command. */
export const OperationalResultReferenceSchema = z.object({
  operation: IdentifierSchema,
  tickets: z.array(OperationalTicketResultSchema).min(1).refine(
    (tickets) => new Set(tickets.map((ticket) => ticket.ticketId)).size === tickets.length,
    "Result tickets must be unique.",
  ),
  recommendationId: z.uuid().optional(),
  diagnosisId: IdentifierSchema.optional(),
  messageId: MessageIdSchema.optional(),
}).strict().readonly();

export const CommandIdempotencyRecordSchema = z.object({
  commandId: CommandIdSchema,
  operation: IdentifierSchema,
  requestHash: RequestHashSchema,
  result: OperationalResultReferenceSchema,
  createdAt: IsoTimestampSchema,
}).strict().superRefine((record, context) => {
  if (record.result.operation !== record.operation) {
    context.addIssue({ code: "custom", path: ["result", "operation"], message: "Idempotency result operation must match the command operation." });
  }
}).readonly();

export const ImportResolutionSchema = z.object({
  sourceId: NonBlankStringSchema.max(240),
  reason: SafeFactTextSchema.max(500),
  actor: NonBlankStringSchema.max(120),
  resolvedAt: IsoTimestampSchema,
  commandId: CommandIdSchema,
  correlationId: CommandIdSchema,
}).strict().readonly();

const UniqueSafeFactTextsSchema = z.array(SafeFactTextSchema).refine(
  (values) => new Set(values).size === values.length,
  "Trace text values must be unique.",
);
const DecisionTraceBase = {
  id: z.uuid(),
  operationalEventId: OperationalEventIdSchema,
  ticketId: TicketIdSchema,
  occurredAt: IsoTimestampSchema,
  actor: NonBlankStringSchema.max(120),
};

/** Sanitized, typed decision evidence attached to a committed operational event. */
export const DecisionTraceEventSchema = z.discriminatedUnion("traceType", [
  z.object({
    ...DecisionTraceBase,
    traceType: z.literal("classification"),
    category: CategorySchema,
    priority: PrioritySchema,
    team: TeamSchema,
    confidence: z.number().min(0).max(1),
    reasons: UniqueSafeFactTextsSchema,
  }).strict().readonly(),
  z.object({
    ...DecisionTraceBase,
    traceType: z.literal("evidence"),
    requiredEvidenceIds: UniqueIdentifierSchema,
    providedEvidenceIds: UniqueIdentifierSchema,
    missingEvidenceIds: UniqueIdentifierSchema,
  }).strict().readonly(),
  z.object({
    ...DecisionTraceBase,
    traceType: z.literal("known-cause"),
    knownCause: IdentifierSchema.optional(),
    knownEventId: KnownEventIdSchema.optional(),
    matchReasons: UniqueSafeFactTextsSchema,
  }).strict().superRefine((trace, context) => {
    if (trace.knownCause === undefined && trace.knownEventId === undefined) {
      context.addIssue({ code: "custom", message: "Known-cause traces require a known cause or event reference.", path: ["knownCause"] });
    }
  }).readonly(),
  z.object({
    ...DecisionTraceBase,
    traceType: z.literal("lifecycle"),
    stage: IdentifierSchema,
    outcome: z.enum(["success", "rejected"]),
    reason: SafeFactTextSchema.optional(),
  }).strict().readonly(),
  z.object({
    ...DecisionTraceBase,
    traceType: z.literal("provider-telemetry"),
    provider: z.enum(["openai", "deterministic", "fallback"]),
    model: z.string().max(120).regex(/^[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*$/).optional(),
    status: z.enum(["skipped", "used", "fallback"]),
    latencyMs: z.number().int().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    fallbackReason: SafeFactTextSchema.optional(),
  }).strict().readonly(),
]);

export const OperationalWorkflowSnapshotSchema = z.object({
  ticket: TicketSchema,
  ticketRevisions: z.array(TicketRevisionSchema),
  recommendations: z.array(TriageRecommendationSchema),
  recommendationRevisions: z.array(RecommendationRevisionSchema),
  messages: z.array(ConversationMessageSchema),
  diagnoses: z.array(OperationalDiagnosisRecordSchema),
  events: z.array(OperationalEventSchema),
  traces: z.array(DecisionTraceEventSchema),
  customerReplyWatermark: z.discriminatedUnion("state", [
    z.object({ state: z.literal("none") }).strict(),
    z.object({ state: z.literal("reply"), timestamp: IsoTimestampSchema, id: MessageIdSchema }).strict(),
  ]),
}).strict().superRefine((snapshot, context) => {
  const eventIds = new Set<string>();
  const sequences: number[] = [];
  for (const [index, event] of snapshot.events.entries()) {
    if (event.ticketId !== snapshot.ticket.id) {
      context.addIssue({ code: "custom", path: ["events", index, "ticketId"], message: "Snapshot events must belong to the canonical ticket." });
    }
    if (eventIds.has(event.id)) {
      context.addIssue({ code: "custom", path: ["events", index, "id"], message: "Snapshot event IDs must be unique." });
    }
    eventIds.add(event.id);
    sequences.push(event.sequence);
  }
  for (let index = 1; index < sequences.length; index += 1) {
    if (sequences[index - 1]! >= sequences[index]!) {
      context.addIssue({ code: "custom", path: ["events", index, "sequence"], message: "Snapshot events must be in ascending causal sequence." });
    }
  }
  const childTicketIds = [
    ...snapshot.ticketRevisions.map((revision) => revision.ticketId),
    ...snapshot.recommendations.map((recommendation) => recommendation.ticketId),
    ...snapshot.recommendationRevisions.map((revision) => revision.recommendation.ticketId),
    ...snapshot.messages.map((message) => message.ticketId),
    ...snapshot.diagnoses.map((diagnosis) => diagnosis.diagnosis.ticketId),
    ...snapshot.traces.map((trace) => trace.ticketId),
  ];
  childTicketIds.forEach((ticketId, index) => {
    if (ticketId !== snapshot.ticket.id) {
      context.addIssue({ code: "custom", path: ["children", index], message: "Snapshot child records must belong to the canonical ticket." });
    }
  });
  const eventReferences = [
    ...snapshot.ticketRevisions.map((revision) => revision.operationalEventId),
    ...snapshot.recommendationRevisions.map((revision) => revision.operationalEventId),
    ...snapshot.messages.map((message) => message.operationalEventId),
    ...snapshot.diagnoses.map((diagnosis) => diagnosis.operationalEventId),
    ...snapshot.traces.map((trace) => trace.operationalEventId),
  ];
  eventReferences.forEach((eventId, index) => {
    if (!eventIds.has(eventId)) {
      context.addIssue({ code: "custom", path: ["eventReferences", index], message: "Snapshot child records must reference a snapshot operational event." });
    }
  });
  const customerReplyWatermark = snapshot.customerReplyWatermark;
  if (customerReplyWatermark.state === "reply") {
    const message = snapshot.messages.find((candidate) => candidate.id === customerReplyWatermark.id);
    if (message?.kind !== "customer" || message.createdAt !== customerReplyWatermark.timestamp) {
      context.addIssue({ code: "custom", path: ["customerReplyWatermark"], message: "Customer reply watermark must reference its canonical customer message." });
    }
  }
}).readonly();

export const DecisionTimelineEntrySchema = z.object({
  operationalEventId: OperationalEventIdSchema,
  ticketId: TicketIdSchema,
  sequence: TicketSequenceSchema,
  occurredAt: IsoTimestampSchema,
  actor: NonBlankStringSchema.max(120),
  action: AuditActionSchema,
  outcome: z.enum(["success", "rejected"]),
  references: z.object({
    ticketRevision: RevisionNumberSchema.optional(),
    recommendationId: z.uuid().optional(),
    diagnosisId: IdentifierSchema.optional(),
    messageId: MessageIdSchema.optional(),
    auditEvent: AuditEventSchema.optional(),
  }).strict(),
  evidenceIds: UniqueIdentifierSchema.optional(),
  missingEvidenceIds: UniqueIdentifierSchema.optional(),
  reason: SafeFactTextSchema.optional(),
}).strict().readonly();

export type OperationalEvent = z.infer<typeof OperationalEventSchema>;
export type TicketRevision = z.infer<typeof TicketRevisionSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type OperationalWorkflowSnapshot = z.infer<typeof OperationalWorkflowSnapshotSchema>;
export type OperationalOutboxRow = z.infer<typeof OperationalOutboxRowSchema>;
export type CommandIdempotencyRecord = z.infer<typeof CommandIdempotencyRecordSchema>;
export type ImportState = z.infer<typeof ImportStateSchema>;
export type ImportResolution = z.infer<typeof ImportResolutionSchema>;
export type DecisionTimelineEntry = z.infer<typeof DecisionTimelineEntrySchema>;
export type OperationalResultReference = z.infer<typeof OperationalResultReferenceSchema>;
export type OperationalTicketResult = z.infer<typeof OperationalTicketResultSchema>;
export type LearningCaptureEnvelope = z.infer<typeof LearningCaptureEnvelopeSchema>;
export type DiagnosisCompletion = z.infer<typeof DiagnosisCompletionSchema>;
export type DecisionTraceEvent = z.infer<typeof DecisionTraceEventSchema>;

export type CanonicalRequestValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalRequestValue[]
  | { readonly [key: string]: CanonicalRequestValue };

/** Stable semantic-request representation for idempotency hashing. */
export function normalizeOperationalRequest(value: unknown): CanonicalRequestValue {
  return normalize(value, new Set<object>());
}

export function canonicalOperationalRequestJson(value: unknown): string {
  return JSON.stringify(normalizeOperationalRequest(value));
}

function normalize(value: unknown, ancestors: Set<object>): CanonicalRequestValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical operational requests require finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Canonical operational requests cannot contain cycles.");
    ancestors.add(value);
    const normalized = value.map((item) => normalize(item, ancestors));
    ancestors.delete(value);
    return normalized;
  }
  if (typeof value === "object") {
    if (ancestors.has(value)) throw new TypeError("Canonical operational requests cannot contain cycles.");
    ancestors.add(value);
    const record = value as Record<string, unknown>;
    const normalized: Record<string, CanonicalRequestValue> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] === undefined) continue;
      normalized[key] = normalize(record[key], ancestors);
    }
    ancestors.delete(value);
    return normalized;
  }
  throw new TypeError("Canonical operational requests must be JSON-compatible.");
}
