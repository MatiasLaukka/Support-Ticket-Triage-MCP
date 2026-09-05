import { z } from "zod";
import {
  ApprovedFieldSchema,
  AuditActionSchema,
  AuditEventSchema,
  CategorySchema,
  DiagnosisEvidenceReferenceSchema,
  IsoTimestampSchema,
  KnowledgeReferenceSchema,
  KnownEventIdSchema,
  PrioritySchema,
  TeamSchema,
  TicketIdSchema,
  TicketSchema,
  TriageRecommendationSchema,
} from "../domain.js";
import { CompletedDiagnosisSchema } from "../knowledge-evolution/domain.js";
import { DiagnosticStateSnapshotSchema } from "../approval-desk/diagnostic-state.js";
import { DiagnosticTaxonomyContextSchema } from "../diagnostic-taxonomy.js";

const NonBlankStringSchema = z.string().trim().min(1);
const IdentifierSchema = z.string().trim().min(1).max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const SafeFactTextSchema = NonBlankStringSchema.max(500).refine(
  (value) => !/(?:\b(?:raw\s+)?(?:system|developer|user)\s+(?:prompt|message|instructions?)\b|\braw\s+prompt\b|\b(?:hidden|chain[- ]of[- ]thought|reasoning)\b|\b(?:api[-_]?key|access[-_]?token|secret|password)\s*[=:]\s*\S+|\bsk-[a-z0-9_-]+\b|\b(?:[a-z]:[\\/]|\\\\)|(?:^|\s)[~\/][^\s]*)/i.test(value),
  "Operational facts must not contain prompts, hidden reasoning, secrets, or paths.",
);
const SafeOperationalActorSchema = SafeFactTextSchema.and(
  NonBlankStringSchema.max(120),
);
const SafeProviderModelSchema = SafeFactTextSchema.and(
  z.string().max(120).regex(/^[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*$/),
);

export const OperationalEventIdSchema = z.uuid();
export const CommandIdSchema = z.uuid();
export const RequestHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const RequestHashVersionSchema = z.union([z.literal(1), z.literal(2)]);
export const MessageIdSchema = z.uuid();
export const TicketSequenceSchema = z.number().int().positive();
export const RevisionNumberSchema = z.number().int().nonnegative();
export const OperationalOutboxStatusSchema = z.enum(["pending", "delivered", "dead-letter"]);
export const OutboxClaimTokenSchema = z.string().trim().min(1).max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const OutboxErrorCodeSchema = z.enum([
  "DELIVERY_ERROR",
  "EVENT_CONFLICT",
  "INVALID_EVENT",
  "PERSISTENCE_ERROR",
]);
export const ImportStateSchema = z.enum(["empty", "import-in-progress", "imported", "native"]);
export const VerificationTypeSchema = z.enum(["customer-confirmed", "technically-verified"]);

const UniqueOperationalEventIdsSchema = z.array(OperationalEventIdSchema).min(1).refine(
  (ids) => new Set(ids).size === ids.length,
  "Operational event IDs must be unique.",
);
const OperationalLifecycleAuditEventSchema = AuditEventSchema.refine(
  (event) => [
    "diagnosis-completed",
    "diagnostic-escalated",
    "diagnosis-reviewed",
    "diagnosis-invalidated",
    "diagnostic-taxonomy-revised",
    "fix-available",
    "fix-ineffective",
    "platform-mitigation-available",
    "ticket-updated",
  ].includes(event.action),
  "Operational lifecycle audit results are limited to Task 4D actions.",
);
const UniqueIdentifierSchema = z.array(IdentifierSchema).refine(
  (ids) => new Set(ids).size === ids.length,
  "Identifiers must be unique.",
);
const ImmutableUniqueIdentifierSchema = UniqueIdentifierSchema.readonly();
const SafeFactKeys = [
  "approved",
  "approvedFields",
  "category",
  "confidence",
  "count",
  "diagnosisOutcome",
  "diagnosisId",
  "evidence",
  "evidenceIds",
  "expectedRevision",
  "fixEventId",
  "fallbackCategory",
  "inputTokens",
  "knownEventId",
  "knowledgeArticleIds",
  "latencyMs",
  "messageId",
  "missingEvidenceIds",
  "model",
  "outcome",
  "outputTokens",
  "priority",
  "providedEvidenceIds",
  "provider",
  "recommendationFields",
  "resolution",
  "revision",
  "reasonCode",
  "securityRisk",
  "slaRisk",
  "sourceRevision",
  "stage",
  "status",
  "team",
  "verificationType",
] as const;
/**
 * Facts are deliberately a small allowlist: canonical customer/support bodies
 * belong only in ConversationMessage, never in the operational event spine.
 */
const SafeFactKeySchema = z.string().refine(
  (key): key is (typeof SafeFactKeys)[number] => (SafeFactKeys as readonly string[]).includes(key),
  "Operational fact key is not allowlisted.",
);
const SanitizedOperationalFactValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  SafeFactTextSchema,
  z.number().finite(),
  z.boolean(),
  z.array(SanitizedOperationalFactValueSchema).max(32),
  z.record(SafeFactKeySchema, SanitizedOperationalFactValueSchema)
    .refine(
      (record) => Object.keys(record).length <= 32,
      "Operational fact records may contain at most 32 values.",
    )
    .superRefine(validateTypedOperationalFacts),
]));
const SanitizedOperationalFactsSchema = z.record(
  SafeFactKeySchema,
  SanitizedOperationalFactValueSchema,
)
  .refine(
    (record) => Object.keys(record).length <= 32,
    "Operational facts may contain at most 32 values.",
  )
  .superRefine(validateTypedOperationalFacts);

function validateTypedOperationalFacts(
  facts: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  if (
    Object.prototype.hasOwnProperty.call(facts, "messageId")
    && !MessageIdSchema.safeParse(facts.messageId).success
  ) {
    context.addIssue({
      code: "custom",
      path: ["messageId"],
      message: "Operational message references require a canonical message ID.",
    });
  }
  for (const key of ["diagnosisId", "fixEventId"] as const) {
    if (
      Object.prototype.hasOwnProperty.call(facts, key)
      && !OperationalEventIdSchema.safeParse(facts[key]).success
    ) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `Operational ${key} references require a canonical event ID.`,
      });
    }
  }
}

/**
 * The append-only causal spine. Child aggregates reference this event; the
 * event itself never owns reverse foreign keys to those aggregates.
 */
export const OperationalEventSchema = z.object({
  id: OperationalEventIdSchema,
  ticketId: TicketIdSchema,
  sequence: TicketSequenceSchema,
  occurredAt: IsoTimestampSchema,
  actor: SafeOperationalActorSchema,
  action: AuditActionSchema,
  commandId: CommandIdSchema,
  facts: SanitizedOperationalFactsSchema,
}).strict().superRefine((event, context) => {
  const messageKind = conversationMessageKindForOperationalAction(event.action);
  const factKeys = Object.keys(event.facts);
  if (messageKind !== undefined) {
    if (factKeys.length !== 1 || factKeys[0] !== "messageId") {
      context.addIssue({
        code: "custom",
        path: ["facts"],
        message: "Conversation message events must contain exactly one messageId fact.",
      });
    }
  } else if (Object.prototype.hasOwnProperty.call(event.facts, "messageId")) {
    context.addIssue({
      code: "custom",
      path: ["facts", "messageId"],
      message: "Only conversation message events may reference a messageId.",
    });
  }
}).readonly();

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

export const DiagnosticTaxonomyRevisionSchema = z.object({
  id: IdentifierSchema,
  ticketId: TicketIdSchema,
  revision: RevisionNumberSchema,
  context: DiagnosticTaxonomyContextSchema,
  operationalEventId: OperationalEventIdSchema,
  createdAt: IsoTimestampSchema,
}).strict().superRefine((revision, context) => {
  if (revision.revision < 1) {
    context.addIssue({
      code: "custom",
      path: ["revision"],
      message: "Diagnostic taxonomy revisions must start at one.",
    });
  }
}).readonly();

const OperationalDiagnosisContextSchema = z.object({
  status: z.literal("completed"),
  causeType: z.enum([
    "configuration",
    "platform-delay",
    "customer-data",
    "integration",
    "security",
    "performance",
  ]),
  customerSafeSummary: NonBlankStringSchema,
  evidenceUsed: z.array(NonBlankStringSchema).min(1),
  evidenceReferences: z.array(DiagnosisEvidenceReferenceSchema).default([]),
  confidence: z.enum(["likely", "confirmed"]),
  owner: z.enum(["support", "engineering", "customer", "integration-partner"]),
  recommendedNextAction: NonBlankStringSchema,
  doNotSay: z.array(NonBlankStringSchema),
  knownEventId: KnownEventIdSchema.optional(),
  knownEventMatchReasons: z.array(NonBlankStringSchema).optional(),
  diagnosticState: DiagnosticStateSnapshotSchema.optional(),
}).strict();

export const OperationalDiagnosisRecordSchema = z.object({
  diagnosis: CompletedDiagnosisSchema,
  originalAudit: AuditEventSchema,
  operationalEventId: OperationalEventIdSchema,
}).strict().superRefine((record, context) => {
  if (record.diagnosis.id !== `diagnosis-${record.originalAudit.id}`) {
    context.addIssue({
      code: "custom",
      path: ["diagnosis", "id"],
      message: "Operational completed diagnosis identity must derive exactly from its original audit identity.",
    });
  }
  if (record.originalAudit.id !== record.operationalEventId) {
    context.addIssue({
      code: "custom",
      path: ["operationalEventId"],
      message: "Operational diagnosis must link to its original audit event.",
    });
  }
  if (record.originalAudit.ticketId !== record.diagnosis.ticketId) {
    context.addIssue({
      code: "custom",
      path: ["originalAudit", "ticketId"],
      message: "Operational diagnosis and original audit must belong to the same ticket.",
    });
  }
  if (
    record.originalAudit.action !== "diagnosis-completed"
    && record.originalAudit.action !== "diagnostic-escalated"
  ) {
    context.addIssue({
      code: "custom",
      path: ["originalAudit", "action"],
      message: "Original diagnosis audit must record diagnosis completion or diagnostic escalation.",
    });
  }
  if (record.originalAudit.timestamp !== record.diagnosis.completedAt) {
    context.addIssue({
      code: "custom",
      path: ["originalAudit", "timestamp"],
      message: "Original diagnosis audit timestamp must match the completed diagnosis timestamp.",
    });
  }
  const originalDiagnosis = OperationalDiagnosisContextSchema.safeParse(
    record.originalAudit.after.diagnosis,
  );
  if (!originalDiagnosis.success) {
    context.addIssue({
      code: "custom",
      path: ["originalAudit", "after", "diagnosis"],
      message: "Original diagnosis audit must contain a validated diagnosis context.",
    });
  }
}).readonly();

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
  evidenceIds: ImmutableUniqueIdentifierSchema,
  knowledgeArticleIds: ImmutableUniqueIdentifierSchema,
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
    evidenceIds: ImmutableUniqueIdentifierSchema,
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
  claimedBy: OutboxClaimTokenSchema.optional(),
  claimedAt: IsoTimestampSchema.optional(),
  deliveredAt: IsoTimestampSchema.optional(),
  errorCode: OutboxErrorCodeSchema.optional(),
}).strict().superRefine((row, context) => {
  if (row.envelope.operationalEventId !== row.operationalEventId) {
    context.addIssue({ code: "custom", path: ["envelope", "operationalEventId"], message: "Outbox envelope must reference its committed operational event." });
  }
  if (row.envelope.deliveryKey !== row.deliveryKey) {
    context.addIssue({ code: "custom", path: ["envelope", "deliveryKey"], message: "Outbox envelope must use the row delivery key." });
  }
  if ((row.claimedBy === undefined) !== (row.claimedAt === undefined)) {
    context.addIssue({ code: "custom", path: ["claimedAt"], message: "Outbox claim owner and timestamp must be present together." });
  }
  if (row.attempts === 0 && (row.claimedBy !== undefined || row.errorCode !== undefined)) {
    context.addIssue({ code: "custom", path: ["attempts"], message: "An unattempted outbox row cannot carry claim or error metadata." });
  }
  if (row.status === "pending" && row.deliveredAt !== undefined) {
    context.addIssue({ code: "custom", path: ["deliveredAt"], message: "Pending outbox rows cannot have a delivery timestamp." });
  }
  if (row.status === "delivered" && (
    row.deliveredAt === undefined
    || row.claimedBy !== undefined
    || row.errorCode !== undefined
    || row.attempts < 1
  )) {
    context.addIssue({ code: "custom", path: ["status"], message: "Delivered outbox rows require a completed unclaimed attempt without an error." });
  }
  if (row.status === "dead-letter" && (
    row.errorCode === undefined
    || row.deliveredAt !== undefined
    || row.claimedBy !== undefined
    || row.attempts < 1
  )) {
    context.addIssue({ code: "custom", path: ["status"], message: "Dead-letter outbox rows require a failed unclaimed attempt and safe error code." });
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
  recommendationIds: z.array(z.uuid()).min(2).optional(),
  diagnosisId: IdentifierSchema.optional(),
  messageId: MessageIdSchema.optional(),
  ticketSnapshot: TicketSchema.optional(),
  auditsBeforeSentEventIds: UniqueOperationalEventIdsSchema.optional(),
  lifecycleAuditEvents: z.array(OperationalLifecycleAuditEventSchema).min(1).optional(),
}).strict().superRefine((result, context) => {
  if (result.recommendationId !== undefined && result.recommendationIds !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["recommendationIds"],
      message: "Recommendation result references must use either recommendationId or recommendationIds, not both.",
    });
  }
  if (
    result.recommendationIds !== undefined
    && new Set(result.recommendationIds).size !== result.recommendationIds.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["recommendationIds"],
      message: "Plural recommendation result references must be unique.",
    });
  }
  if (result.ticketSnapshot !== undefined) {
    if (result.tickets.length !== 1 || result.tickets[0]?.ticketId !== result.ticketSnapshot.id) {
      context.addIssue({
        code: "custom",
        path: ["ticketSnapshot"],
        message: "A ticket snapshot must belong to the result's single affected ticket.",
      });
    }
    const resultingRevision = result.tickets[0]?.resultingRevision;
    if (resultingRevision !== null && resultingRevision !== result.ticketSnapshot.revision) {
      context.addIssue({
        code: "custom",
        path: ["ticketSnapshot", "revision"],
        message: "A changed ticket snapshot must match the resulting ticket revision.",
      });
    }
  }
  if (
    result.auditsBeforeSentEventIds !== undefined
    && (result.messageId === undefined || result.tickets.length !== 1)
  ) {
    context.addIssue({
      code: "custom",
      path: ["auditsBeforeSentEventIds"],
      message: "A pre-send audit view requires one affected ticket and a canonical support message.",
    });
  }
  if (result.lifecycleAuditEvents !== undefined) {
    const referencedEvents = new Map(
      result.tickets.flatMap((ticket) =>
        ticket.operationalEventIds.map((eventId) => [eventId, ticket.ticketId] as const)),
    );
    const auditIds = new Set<string>();
    for (const [index, audit] of result.lifecycleAuditEvents.entries()) {
      if (auditIds.has(audit.id)) {
        context.addIssue({
          code: "custom",
          path: ["lifecycleAuditEvents", index, "id"],
          message: "Operational lifecycle audit result IDs must be unique.",
        });
      }
      auditIds.add(audit.id);
      if (referencedEvents.get(audit.id) !== audit.ticketId) {
        context.addIssue({
          code: "custom",
          path: ["lifecycleAuditEvents", index, "id"],
          message: "Operational lifecycle audits must match an affected ticket event.",
        });
      }
    }
    if (auditIds.size !== referencedEvents.size) {
      context.addIssue({
        code: "custom",
        path: ["lifecycleAuditEvents"],
        message: "Operational lifecycle audits must describe every command event exactly once.",
      });
    }
  }
}).readonly();

export const CommandIdempotencyRecordSchema = z.object({
  commandId: CommandIdSchema,
  operation: IdentifierSchema,
  requestHash: RequestHashSchema,
  requestHashVersion: RequestHashVersionSchema.default(1),
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
  actor: SafeOperationalActorSchema,
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
    model: SafeProviderModelSchema.optional(),
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
  diagnosticTaxonomyRevisions: z.array(DiagnosticTaxonomyRevisionSchema).default([]),
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
    ...snapshot.diagnosticTaxonomyRevisions.map((revision) => revision.ticketId),
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
    ...snapshot.diagnosticTaxonomyRevisions.map((revision) => revision.operationalEventId),
    ...snapshot.messages.map((message) => message.operationalEventId),
    ...snapshot.diagnoses.map((diagnosis) => diagnosis.operationalEventId),
    ...snapshot.traces.map((trace) => trace.operationalEventId),
  ];
  eventReferences.forEach((eventId, index) => {
    if (!eventIds.has(eventId)) {
      context.addIssue({ code: "custom", path: ["eventReferences", index], message: "Snapshot child records must reference a snapshot operational event." });
    }
  });
  const taxonomyRevisionIds = new Set<string>();
  const taxonomyEventIds = new Set<string>();
  snapshot.diagnosticTaxonomyRevisions.forEach((revision, index) => {
    if (taxonomyRevisionIds.has(revision.id)) {
      context.addIssue({
        code: "custom",
        path: ["diagnosticTaxonomyRevisions", index, "id"],
        message: "Diagnostic taxonomy revision IDs must be unique.",
      });
    }
    taxonomyRevisionIds.add(revision.id);
    if (taxonomyEventIds.has(revision.operationalEventId)) {
      context.addIssue({
        code: "custom",
        path: ["diagnosticTaxonomyRevisions", index, "operationalEventId"],
        message: "An operational event may back only one diagnostic taxonomy revision.",
      });
    }
    taxonomyEventIds.add(revision.operationalEventId);
    const event = snapshot.events.find((candidate) => candidate.id === revision.operationalEventId);
    if (
      event === undefined
      || event.ticketId !== revision.ticketId
      || event.action !== "diagnostic-taxonomy-revised"
    ) {
      context.addIssue({
        code: "custom",
        path: ["diagnosticTaxonomyRevisions", index, "operationalEventId"],
        message: "Diagnostic taxonomy revisions must bind to a same-ticket diagnostic-taxonomy-revised event.",
      });
    }
    const expectedRevision = index + 1;
    if (revision.revision !== expectedRevision) {
      context.addIssue({
        code: "custom",
        path: ["diagnosticTaxonomyRevisions", index, "revision"],
        message: `Diagnostic taxonomy revisions must be contiguous and ordered from one (expected ${expectedRevision}).`,
      });
    }
  });
  for (const [index, diagnosis] of snapshot.diagnoses.entries()) {
    const event = snapshot.events.find(
      (candidate) => candidate.id === diagnosis.operationalEventId,
    );
    if (
      event === undefined
      || diagnosis.originalAudit.id !== event.id
      || diagnosis.originalAudit.ticketId !== event.ticketId
      || diagnosis.originalAudit.action !== event.action
      || diagnosis.originalAudit.actor !== event.actor
      || diagnosis.originalAudit.timestamp !== event.occurredAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["diagnoses", index, "originalAudit"],
        message: "Every diagnosis original audit must match its canonical operational event.",
      });
    }
  }
  for (const [index, event] of snapshot.events.entries()) {
    const expectedKind = conversationMessageKindForOperationalAction(event.action);
    if (expectedKind === undefined) continue;
    const linkedMessages = snapshot.messages.filter(
      (message) => message.operationalEventId === event.id,
    );
    if (
      linkedMessages.length !== 1
      || !isCanonicalConversationEventPair(event, linkedMessages[0]!)
    ) {
      context.addIssue({
        code: "custom",
        path: ["events", index],
        message: "Every conversation message event must bind to exactly one canonical message.",
      });
    }
  }
  for (const [index, message] of snapshot.messages.entries()) {
    const event = snapshot.events.find((candidate) => candidate.id === message.operationalEventId);
    if (event === undefined || !isCanonicalConversationEventPair(event, message)) {
      context.addIssue({
        code: "custom",
        path: ["messages", index],
        message: "Every conversation message must bind to its canonical operational event.",
      });
    }
  }
  const customerReplyWatermark = snapshot.customerReplyWatermark;
  const latestCustomerMessage = snapshot.messages
    .filter((message) => message.kind === "customer")
    .map((message) => ({
      message,
      event: snapshot.events.find((event) => event.id === message.operationalEventId),
    }))
    .filter((entry): entry is { message: ConversationMessage; event: OperationalEvent } =>
      entry.event !== undefined && isCanonicalConversationEventPair(entry.event, entry.message))
    .sort((left, right) => left.event.sequence - right.event.sequence)
    .at(-1)?.message;
  if (
    (latestCustomerMessage === undefined && customerReplyWatermark.state !== "none")
    || (latestCustomerMessage !== undefined && (
      customerReplyWatermark.state !== "reply"
      || customerReplyWatermark.id !== latestCustomerMessage.id
      || customerReplyWatermark.timestamp !== latestCustomerMessage.createdAt
    ))
  ) {
    context.addIssue({
      code: "custom",
      path: ["customerReplyWatermark"],
      message: "Customer reply watermark must reference the latest canonical customer message by causal event sequence.",
    });
  }
}).readonly();

export const DecisionTimelineEntrySchema = z.object({
  operationalEventId: OperationalEventIdSchema,
  ticketId: TicketIdSchema,
  sequence: TicketSequenceSchema,
  occurredAt: IsoTimestampSchema,
  actor: SafeOperationalActorSchema,
  action: AuditActionSchema,
  category: z.enum([
    "evaluation",
    "evidence",
    "diagnosis",
    "approval",
    "customer-response",
    "fix-or-mitigation",
    "verification",
    "closure",
  ]),
  outcome: z.enum(["success", "rejected"]),
  references: z.object({
    ticketRevision: RevisionNumberSchema.optional(),
    recommendationId: z.uuid().optional(),
    diagnosisId: IdentifierSchema.optional(),
    messageId: MessageIdSchema.optional(),
  }).strict(),
  evidenceIds: UniqueIdentifierSchema.optional(),
  missingEvidenceIds: UniqueIdentifierSchema.optional(),
  approval: z.object({
    decision: z.enum(["approved", "rejected", "canceled", "superseded"]),
    fields: z.array(ApprovedFieldSchema).refine(
      (fields) => new Set(fields).size === fields.length,
      "Approved timeline fields must be unique.",
    ).optional(),
    reason: SafeFactTextSchema.optional(),
  }).strict().optional(),
  knowledge: z.object({
    articleIds: UniqueIdentifierSchema,
    object: KnowledgeReferenceSchema.optional(),
  }).strict().optional(),
  fallbackReason: SafeFactTextSchema.optional(),
  providerTelemetry: z.array(z.object({
    provider: z.enum(["openai", "deterministic", "fallback"]),
    model: SafeProviderModelSchema.optional(),
    status: z.enum(["skipped", "used", "fallback"]),
    latencyMs: z.number().int().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
  }).strict()).optional(),
  reasons: UniqueSafeFactTextsSchema.optional(),
  reason: SafeFactTextSchema.optional(),
}).strict().readonly();

export type OperationalEvent = z.infer<typeof OperationalEventSchema>;
export type TicketRevision = z.infer<typeof TicketRevisionSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type DiagnosticTaxonomyRevision = z.infer<typeof DiagnosticTaxonomyRevisionSchema>;
export type OperationalWorkflowSnapshot = z.infer<typeof OperationalWorkflowSnapshotSchema>;
export type OperationalOutboxRow = z.infer<typeof OperationalOutboxRowSchema>;
export type CommandIdempotencyRecord = z.infer<typeof CommandIdempotencyRecordSchema>;
export type RequestHashVersion = z.infer<typeof RequestHashVersionSchema>;
export type ImportState = z.infer<typeof ImportStateSchema>;
export type ImportResolution = z.infer<typeof ImportResolutionSchema>;
export type DecisionTimelineEntry = z.infer<typeof DecisionTimelineEntrySchema>;
export type OperationalResultReference = z.infer<typeof OperationalResultReferenceSchema>;
export type OperationalTicketResult = z.infer<typeof OperationalTicketResultSchema>;
export type LearningCaptureEnvelope = z.infer<typeof LearningCaptureEnvelopeSchema>;
export type DiagnosisCompletion = z.infer<typeof DiagnosisCompletionSchema>;
export type DecisionTraceEvent = z.infer<typeof DecisionTraceEventSchema>;

export function conversationMessageKindForOperationalAction(
  action: OperationalEvent["action"],
): ConversationMessage["kind"] | undefined {
  if (action === "customer-reply-received") return "customer";
  if (action === "customer-response-sent") return "support";
  return undefined;
}

export function isCanonicalConversationEventPair(
  event: {
    readonly id: string;
    readonly ticketId: string;
    readonly action: OperationalEvent["action"];
    readonly facts: Readonly<Record<string, unknown>>;
  },
  message: Pick<ConversationMessage, "id" | "ticketId" | "operationalEventId" | "kind">,
): boolean {
  const expectedKind = conversationMessageKindForOperationalAction(event.action);
  const factKeys = Object.keys(event.facts);
  return expectedKind !== undefined
    && factKeys.length === 1
    && factKeys[0] === "messageId"
    && event.facts.messageId === message.id
    && event.id === message.operationalEventId
    && event.ticketId === message.ticketId
    && expectedKind === message.kind;
}

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
