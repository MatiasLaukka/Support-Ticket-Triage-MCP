import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AiExecutionTraceSchema,
  ApprovalSchema,
  ApprovedFieldSchema,
  AuditEventSchema,
  CategorySchema,
  ClassificationConfidenceSchema,
  ClassificationSignalSchema,
  CustomerReplyWatermarkSchema,
  DiagnosisEvidenceReferenceSchema,
  DiagnosisFixContextSchema,
  DiagnosisIdSchema,
  DiagnosisImpactSetSchema,
  DiagnosisScopedFixAuditPayloadSchema,
  DraftCustomerResponseCheckSchema,
  DraftCustomerResponseSourceSchema,
  DraftCustomerResponseStyleSchema,
  DuplicateCandidateSchema,
  EvidenceRequirementSchema,
  GptAssistSchema,
  IsoTimestampSchema,
  KnowledgeReferenceSchema,
  LearnedContextSchema,
  KnownEventIdSchema,
  PrioritySchema,
  RequiredEscalationSchema,
  RiskSchema,
  SupportStateSchema,
  TeamSchema,
  TicketIdSchema,
  TicketSchema,
  TicketStatusSchema,
  TriageRecommendationSchema,
  type Approval,
  type AiExecutionTrace,
  type ApprovedField,
  type AuditEvent,
  type Category,
  type ClassificationConfidence,
  type ClassificationSignal,
  type DiagnosisImpactSet,
  type DiagnosisEvidenceReference,
  type DuplicateCandidate,
  type EvidenceRequirement,
  type GptAssist,
  type Priority,
  type RequiredEscalation,
  type Risk,
  type SupportState,
  type Team,
  type Ticket,
  type TicketId,
  type TicketStatus,
  type TriageRecommendation,
} from "./domain.js";
import { DomainError } from "./errors.js";
import { compareIsoInstants } from "./iso-instant.js";
import { evaluateEscalation, validateApprovedFields } from "./policy.js";
import {
  DiagnosticStateSnapshotSchema,
  type DiagnosticStateSnapshot,
} from "./approval-desk/diagnostic-state.js";
import type { CompletedDiagnosis } from "./knowledge-evolution/domain.js";
import type { LearningCaptureContext, LearningCaptureService } from "./knowledge-evolution/learning-capture.js";
import type { DiagnosisReviewInput } from "./approval-desk/diagnosis-review.js";
import {
  hasCustomerReplyAfterRecommendation,
  hasCustomerReplyAfterRecommendationFromSnapshot,
} from "./approval-desk/workflow-causal-context.js";
import { getKnownEvent } from "./approval-desk/known-event-catalog.js";
import {
  isValidatedKnownCauseReference,
  type ValidatedKnownCauseReference,
} from "./knowledge-evolution/reusable-context.js";
import {
  canonicalRequestHash,
  type CommandReplay,
  type OperationalCommandContext,
} from "./operational/idempotency.js";
import type {
  ConversationMessage,
  OperationalResultReference,
  OperationalWorkflowSnapshot,
} from "./operational/domain.js";
import { OperationalEventSchema } from "./operational/domain.js";
import type { OperationalUnitOfWork } from "./operational/unit-of-work.js";
export type {
  DiagnosisReviewInput,
} from "./approval-desk/diagnosis-review.js";
export type { DiagnosisImpactSet } from "./domain.js";

const NonBlankStringSchema = z.string().trim().min(1);
const recommendationOperations = new Map<string, Promise<void>>();
const ticketOperations = new Map<TicketId, Promise<void>>();
const submitWithinTicketLockCapability = Symbol("submitWithinTicketLock");
const submitClassificationConfidenceCapability = Symbol(
  "submitClassificationConfidence",
);
const NEWER_REPLY_SUPERSESSION_REASON =
  "A newer customer reply requires a fresh recommendation.";

const SubmitRecommendationInputSchema = z
  .object({
    ticketId: TicketIdSchema,
    sourceRevision: z.number().int().nonnegative(),
    category: CategorySchema,
    priority: PrioritySchema,
    team: TeamSchema,
    assignee: NonBlankStringSchema.nullable().optional(),
    ticketStatus: TicketStatusSchema.optional(),
    tags: z.array(NonBlankStringSchema).optional(),
    duplicateCandidates: z.array(DuplicateCandidateSchema),
    outageRisk: RiskSchema,
    securityRisk: RiskSchema,
    slaRisk: RiskSchema,
    missingInformation: z.array(NonBlankStringSchema),
    supportState: SupportStateSchema.optional(),
    knownCause: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable().optional(),
    knownCauseRef: KnowledgeReferenceSchema.optional(),
    learnedContext: LearnedContextSchema.optional(),
    knownEventId: KnownEventIdSchema.nullable().optional(),
    knownEventMatchReasons: z.array(NonBlankStringSchema).optional(),
    requiredEvidence: z.array(EvidenceRequirementSchema).optional(),
    providedEvidence: z.array(EvidenceRequirementSchema).optional(),
    missingEvidence: z.array(EvidenceRequirementSchema).optional(),
    classificationSignals: z.array(ClassificationSignalSchema).optional(),
    nextInvestigationSteps: z.array(NonBlankStringSchema).optional(),
    knowledgeArticleIds: z.array(
      z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ),
    draftCustomerResponse: NonBlankStringSchema,
    draftCustomerResponseSource: DraftCustomerResponseSourceSchema.optional(),
    draftCustomerResponseStyle: DraftCustomerResponseStyleSchema.optional(),
    draftCustomerResponseChecks: z
      .array(DraftCustomerResponseCheckSchema)
      .optional(),
    gptAssist: GptAssistSchema.optional(),
    aiExecutionTrace: AiExecutionTraceSchema.optional(),
    rationale: NonBlankStringSchema.max(500),
    confidence: z.number().min(0).max(1),
    recommendedNextAction: NonBlankStringSchema,
    escalationRequired: z.boolean().optional(),
    escalationReasons: z.array(RequiredEscalationSchema).optional(),
    actor: NonBlankStringSchema,
    submittedAt: IsoTimestampSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.knownCauseRef !== undefined && input.knownCause !== input.knownCauseRef.objectId) {
      context.addIssue({
        code: "custom",
        path: ["knownCauseRef"],
        message: "knownCauseRef.objectId must match knownCause.",
      });
    }
  });

const RejectRecommendationInputSchema = z
  .object({
    recommendationId: z.uuid(),
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    feedback: NonBlankStringSchema,
    rejectedAt: IsoTimestampSchema,
  })
  .strict();

const SubmitEvaluationInputSchema = SubmitRecommendationInputSchema.extend({
  evaluatedCustomerReplyWatermark: CustomerReplyWatermarkSchema,
  classificationConfidence: ClassificationConfidenceSchema.optional(),
});

const CancelApprovalInputSchema = z
  .object({
    recommendationId: z.uuid(),
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    reason: NonBlankStringSchema,
    canceledAt: IsoTimestampSchema,
  })
  .strict();

const MarkResponseSentInputSchema = z
  .object({
    recommendationId: z.uuid(),
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    sentAt: IsoTimestampSchema,
    customerResponse: NonBlankStringSchema,
  })
  .strict();

const AddCustomerReplyInputSchema = z
  .object({
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    body: NonBlankStringSchema.max(4_000),
    receivedAt: IsoTimestampSchema,
    source: NonBlankStringSchema.optional(),
  })
  .strict();
export const DiagnosisContextSchema: z.ZodType<DiagnosisContext> = z
  .object({
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
    owner: z.enum([
      "support",
      "engineering",
      "customer",
      "integration-partner",
    ]),
    recommendedNextAction: NonBlankStringSchema,
    doNotSay: z.array(NonBlankStringSchema),
    knownEventId: KnownEventIdSchema.optional(),
    knownEventMatchReasons: z.array(NonBlankStringSchema).optional(),
    diagnosticState: DiagnosticStateSnapshotSchema.optional(),
  })
  .strict();
const RecordDiagnosisInputSchema = z
  .object({
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    diagnosedAt: IsoTimestampSchema,
    diagnosis: DiagnosisContextSchema,
    knowledgeArticleIds: z.array(
      z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ),
    sourceWorkflow: z
      .object({
        recommendationId: z.uuid(),
        ticketRevision: z.number().int().nonnegative(),
        customerReplyWatermark: CustomerReplyWatermarkSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
const RecordFixInputSchema = z
  .object({
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    fixedAt: IsoTimestampSchema,
    fix: DiagnosisFixContextSchema,
    knowledgeArticleIds: z.array(
      z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ),
  })
  .strict();
const CloseTicketInputSchema = z
  .object({
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    closedAt: IsoTimestampSchema,
  })
  .strict();
const ApplyDiagnosisFixInputSchema = z
  .object({
    diagnosisId: DiagnosisIdSchema,
    sourceTicketId: TicketIdSchema,
    impactSet: DiagnosisImpactSetSchema,
    actor: NonBlankStringSchema,
    fixedAt: IsoTimestampSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.actor !== input.impactSet.actor) {
      context.addIssue({
        code: "custom",
        path: ["impactSet", "actor"],
        message: "The impact-set actor must match the fix actor.",
      });
    }
    if (!input.impactSet.tickets.some((ticket) => ticket.ticketId === input.sourceTicketId)) {
      context.addIssue({
        code: "custom",
        path: ["impactSet", "tickets"],
        message: "The source ticket must be explicitly selected in the impact set.",
      });
    }
  });

const SupersedeRecommendationInputSchema = z
  .object({
    recommendationId: z.uuid(),
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    supersededAt: IsoTimestampSchema,
    reason: NonBlankStringSchema,
  })
  .strict();

export interface SubmitRecommendationInput {
  ticketId: TicketId;
  sourceRevision: number;
  category: Category;
  priority: Priority;
  team: Team;
  assignee?: string | null;
  ticketStatus?: TicketStatus;
  tags?: string[];
  duplicateCandidates: DuplicateCandidate[];
  outageRisk: Risk;
  securityRisk: Risk;
  slaRisk: Risk;
  missingInformation: string[];
  supportState?: SupportState;
  knownCause?: string | null;
  knownCauseRef?: { objectId: string; version: number };
  /** Opaque validation created only by the reusable-knowledge selection path. */
  knownCauseReferenceValidation?: ValidatedKnownCauseReference;
  learnedContext?: {
    status: "available" | "ledger-unavailable";
    issues: ReadonlyArray<
      | { scope: "snapshot"; code: "ledger-read-failed" }
      | { scope: "version"; objectId: string; version: number; code: "missing-history" | "inconsistent-history" | "unhealthy-version" }
    >;
  };
  knownEventId?: string | null;
  knownEventMatchReasons?: string[];
  requiredEvidence?: EvidenceRequirement[];
  providedEvidence?: EvidenceRequirement[];
  missingEvidence?: EvidenceRequirement[];
  classificationSignals?: ClassificationSignal[];
  nextInvestigationSteps?: string[];
  knowledgeArticleIds: string[];
  draftCustomerResponse: string;
  draftCustomerResponseSource?: z.infer<
    typeof DraftCustomerResponseSourceSchema
  >;
  draftCustomerResponseStyle?: z.infer<
    typeof DraftCustomerResponseStyleSchema
  >;
  draftCustomerResponseChecks?: z.infer<
    typeof DraftCustomerResponseCheckSchema
  >[];
  gptAssist?: GptAssist;
  aiExecutionTrace?: AiExecutionTrace;
  rationale: string;
  confidence: number;
  recommendedNextAction: string;
  escalationRequired?: boolean;
  escalationReasons?: RequiredEscalation[];
  actor: string;
  submittedAt: string;
}

export type CustomerReplyWatermark = z.infer<
  typeof CustomerReplyWatermarkSchema
>;

export interface SubmitEvaluationInput extends SubmitRecommendationInput {
  evaluatedCustomerReplyWatermark: CustomerReplyWatermark;
  classificationConfidence?: ClassificationConfidence;
}

export interface RejectRecommendationInput {
  recommendationId: string;
  ticketId: TicketId;
  actor: string;
  feedback: string;
  rejectedAt: string;
}

export interface CancelApprovalInput {
  recommendationId: string;
  ticketId: TicketId;
  actor: string;
  reason: string;
  canceledAt: string;
}

export interface MarkResponseSentInput {
  recommendationId: string;
  ticketId: TicketId;
  actor: string;
  sentAt: string;
  customerResponse: string;
}

export interface ApproveAndMarkResponseSentInput {
  approval: Approval;
  responseSent: MarkResponseSentInput;
}

export interface AddCustomerReplyInput {
  ticketId: TicketId;
  actor: string;
  body: string;
  receivedAt: string;
  source?: string;
}

export interface DiagnosisContext extends Record<string, unknown> {
  status: "completed";
  causeType:
    | "configuration"
    | "platform-delay"
    | "customer-data"
    | "integration"
    | "security"
    | "performance";
  customerSafeSummary: string;
  evidenceUsed: string[];
  evidenceReferences?: DiagnosisEvidenceReference[];
  confidence: "likely" | "confirmed";
  owner: "support" | "engineering" | "customer" | "integration-partner";
  recommendedNextAction: string;
  doNotSay: string[];
  knownEventId?: string;
  knownEventMatchReasons?: string[];
  diagnosticState?: DiagnosticStateSnapshot;
}

export type FixContext = z.infer<typeof DiagnosisFixContextSchema>;

export interface RecordDiagnosisInput {
  ticketId: TicketId;
  actor: string;
  diagnosedAt: string;
  diagnosis: DiagnosisContext;
  knowledgeArticleIds: string[];
  /**
   * Present for an evaluation-derived diagnosis. The service validates this
   * snapshot after it owns the ticket transition, so adapters cannot advance
   * a workflow using stale customer context.
   */
  sourceWorkflow?: {
    recommendationId: string;
    ticketRevision: number;
    customerReplyWatermark: CustomerReplyWatermark;
  };
}

export interface RecordFixInput {
  ticketId: TicketId;
  actor: string;
  fixedAt: string;
  fix: FixContext;
  knowledgeArticleIds: string[];
}

export interface RecordPlatformMitigationInput {
  ticketId: TicketId;
  eventId: string;
  actor: string;
  recordedAt: string;
  rationale: string;
}

export interface CloseTicketInput {
  ticketId: TicketId;
  actor: string;
  closedAt: string;
}

export interface ApplyDiagnosisFixInput {
  diagnosisId: string;
  sourceTicketId: TicketId;
  impactSet: DiagnosisImpactSet;
  actor: string;
  fixedAt: string;
}

export interface SupersedeRecommendationInput {
  recommendationId: string;
  ticketId: TicketId;
  actor: string;
  supersededAt: string;
  reason: string;
}

export interface TicketStore {
  get(id: TicketId): Promise<Ticket>;
  update(
    id: TicketId,
    expectedRevision: number,
    mutate: (ticket: Ticket) => Ticket,
  ): Promise<Ticket>;
  updateWithCommit<T>(
    id: TicketId,
    expectedRevision: number,
    mutate: (ticket: Ticket) => Ticket,
    commit: (updated: Ticket, previous: Ticket) => Promise<T>,
  ): Promise<{ ticket: Ticket; result: T }>;
}

export interface RecommendationStore {
  create(value: TriageRecommendation): Promise<void>;
  get(id: string): Promise<TriageRecommendation>;
  list(): Promise<TriageRecommendation[]>;
  deletePending(id: string): Promise<void>;
  transitionResolution(
    id: string,
    expected: TriageRecommendation["resolution"],
    next: TriageRecommendation["resolution"],
  ): Promise<void>;
  markResolved(
    id: string,
    resolution: "approved" | "rejected",
  ): Promise<void>;
}

export interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  appendBatch(events: readonly AuditEvent[]): Promise<void>;
  list(ticketId?: TicketId): Promise<AuditEvent[]>;
}

export interface TriageServiceDependencies {
  tickets: TicketStore;
  recommendations: RecommendationStore;
  audit: AuditStore;
  diagnoses?: { save(record: CompletedDiagnosis): Promise<void>; remove(id: CompletedDiagnosis["id"]): Promise<void> };
  learningCapture?: LearningCaptureService;
  operationalStore?: OperationalCommandStore;
  now?: () => Date;
  uuid?: () => string;
}

export interface OperationalCommandStore {
  transaction<T>(work: (unit: OperationalUnitOfWork) => T): T;
  readTicket(ticketId: TicketId): Ticket;
  readWorkflowSnapshot(ticketId: TicketId): OperationalWorkflowSnapshot;
}

export function derivedOperationalCommandContext(
  parentCommandId: string,
  action: string,
): OperationalCommandContext {
  const hex = createHash("sha256").update(`${parentCommandId}\0${action}`).digest("hex");
  return {
    commandId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
  };
}

/** @deprecated File-backed fixture adapter only until operational cutover. */
export function customerReplyWatermarkFromAudits(
  audits: readonly AuditEvent[],
): CustomerReplyWatermark {
  const latestReply = audits
    .filter((event) => event.action === "customer-reply-received")
    .at(-1);
  return latestReply === undefined
    ? { state: "none" }
    : {
        state: "reply",
        timestamp: latestReply.timestamp,
        id: latestReply.id,
      };
}

/** Canonical operational watermark; its ID is always the message-row ID. */
export function customerReplyWatermarkFromSnapshot(
  snapshot: OperationalWorkflowSnapshot,
): CustomerReplyWatermark {
  return CustomerReplyWatermarkSchema.parse(snapshot.customerReplyWatermark);
}

function assertTrustedKnownCauseReference(
  input: Pick<SubmitRecommendationInput, "knownCause" | "knownCauseRef">,
  validation: ValidatedKnownCauseReference | undefined,
): void {
  if (input.knownCauseRef === undefined) {
    if (validation !== undefined) {
      throw new DomainError(
        "Known-cause reference validation requires a known-cause reference.",
        "INVALID_APPROVAL_FIELDS",
      );
    }
    return;
  }
  if (input.knownCause !== input.knownCauseRef.objectId) {
    throw new DomainError(
      "knownCauseRef.objectId must match knownCause.",
      "INVALID_APPROVAL_FIELDS",
    );
  }
  if (!isValidatedKnownCauseReference(validation, input.knownCauseRef)) {
    throw new DomainError(
      "Known-cause references require authoritative reusable knowledge validation.",
      "INVALID_APPROVAL_FIELDS",
    );
  }
}

export class TriageService {
  private readonly now: () => Date;
  private readonly uuid: () => string;

  constructor(private readonly dependencies: TriageServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.uuid = dependencies.uuid ?? randomUUID;
  }

  async submit(
    input: SubmitRecommendationInput,
    commandContext?: OperationalCommandContext,
  ): Promise<TriageRecommendation>;
  async submit(
    input: SubmitRecommendationInput,
    capability: symbol | undefined,
    classificationConfidence: ClassificationConfidence | undefined,
    confidenceCapability: typeof submitClassificationConfidenceCapability,
    knownCauseReferenceValidation?: ValidatedKnownCauseReference,
  ): Promise<TriageRecommendation>;
  async submit(
    input: SubmitRecommendationInput,
    commandContextOrCapability?: OperationalCommandContext | symbol,
    classificationConfidence?: ClassificationConfidence,
    confidenceCapability?: symbol,
    knownCauseReferenceValidation?: ValidatedKnownCauseReference,
  ): Promise<TriageRecommendation> {
    if (
      classificationConfidence !== undefined &&
      confidenceCapability !== submitClassificationConfidenceCapability
    ) {
      throw new DomainError(
        "Classifier confidence provenance requires the evaluation capability.",
        "INVALID_CLASSIFICATION_PROVENANCE",
      );
    }
    assertTrustedKnownCauseReference(input, knownCauseReferenceValidation);
    const { knownCauseReferenceValidation: _validation, ...serializableInput } = input;
    const parsed = SubmitRecommendationInputSchema.parse(serializableInput);
    const capability = typeof commandContextOrCapability === "symbol"
      ? commandContextOrCapability
      : undefined;
    const commandContext = typeof commandContextOrCapability === "object"
      ? commandContextOrCapability
      : undefined;
    if (this.dependencies.operationalStore !== undefined && commandContext !== undefined) {
      return this.submitOperational(parsed, commandContext, classificationConfidence);
    }
    if (this.dependencies.operationalStore !== undefined && capability === undefined) {
      throw new DomainError(
        "Operational recommendation submissions require an explicit command context.",
        "REPOSITORY_ERROR",
      );
    }
    if (capability === submitWithinTicketLockCapability) {
      return this.submitValidated(parsed, classificationConfidence);
    }
    return serializeTicket(parsed.ticketId, () =>
      this.submitValidated(parsed, classificationConfidence),
    );
  }

  private async captureLearning(event: AuditEvent, context: LearningCaptureContext = {}): Promise<void> {
    if (this.dependencies.learningCapture === undefined) return;
    try {
      await this.dependencies.learningCapture.recordAuditOutcome(event, context);
    } catch {
      const failure = AuditEventSchema.safeParse({
        id: this.uuid(),
        timestamp: this.now().toISOString(),
        actor: "learning-ledger",
        action: "learning-capture-failed",
        ticketId: event.ticketId,
        before: { sourceAuditId: event.id, sourceAction: event.action },
        after: { status: "failed" },
        rationale: "The operational result was retained, but its learning record could not be persisted.",
        knowledgeArticleIds: event.knowledgeArticleIds,
        result: "rejected",
        rejectionReason: "Learning ledger capture failed.",
      });
      if (failure.success) {
        try { await this.dependencies.audit.append(failure.data); } catch { /* learning failure must not block operational work */ }
      }
    }
  }

  private async submitValidated(
    parsed: z.infer<typeof SubmitRecommendationInputSchema>,
    classificationConfidence?: ClassificationConfidence,
  ): Promise<TriageRecommendation> {
    const ticket = await this.dependencies.tickets.get(parsed.ticketId);
    if (ticket.revision !== parsed.sourceRevision) {
      throw stale("Recommendation source revision is stale.");
    }

    const recommendation = this.buildRecommendation(parsed, ticket, classificationConfidence);

    const auditEvent = AuditEventSchema.parse({
      id: this.uuid(),
      timestamp: parsed.submittedAt,
      actor: parsed.actor,
      action: "recommendation-submitted",
      ticketId: ticket.id,
      recommendationId: recommendation.id,
      before: {},
      after: {
        sourceRevision: recommendation.sourceRevision,
        category: recommendation.category,
        priority: recommendation.priority,
        team: recommendation.team,
        ...(recommendation.knownEventId === undefined
          ? {}
          : { knownEventId: recommendation.knownEventId }),
        ...(recommendation.knownEventMatchReasons === undefined
          ? {}
          : { knownEventMatchReasons: recommendation.knownEventMatchReasons }),
        escalationRequired: recommendation.escalationRequired,
        escalationReasons: recommendation.escalationReasons,
        classificationSignalCount:
          recommendation.classificationSignals?.length ?? 0,
        ...(recommendation.aiExecutionTrace?.safety === undefined
          ? {}
          : { safety: recommendation.aiExecutionTrace.safety }),
      },
      rationale: recommendation.rationale,
      knowledgeArticleIds: recommendation.knowledgeArticleIds,
      result: "success",
    });

    return serializeRecommendation(recommendation.id, async () => {
      await this.dependencies.recommendations.create(recommendation);
      try {
        await this.dependencies.audit.append(auditEvent);
      } catch (auditError) {
        try {
          await this.dependencies.recommendations.deletePending(recommendation.id);
        } catch {
          throw domainErrorWithCause(
            "Submission audit failed and recommendation rollback was not safe.",
            auditError,
          );
        }
        throw domainErrorWithCause(
          "Submission audit failed; recommendation was compensated.",
          auditError,
        );
      }
      return recommendation;
    });
  }

  private buildRecommendation(
    parsed: z.infer<typeof SubmitRecommendationInputSchema>,
    ticket: Ticket,
    classificationConfidence?: ClassificationConfidence,
  ): TriageRecommendation {

    const unevaluated = TriageRecommendationSchema.parse({
      id: this.uuid(),
      ticketId: parsed.ticketId,
      sourceRevision: parsed.sourceRevision,
      category: parsed.category,
      priority: parsed.priority,
      team: parsed.team,
      ...(parsed.assignee === undefined ? {} : { assignee: parsed.assignee }),
      ...(parsed.ticketStatus === undefined
        ? {}
        : { ticketStatus: parsed.ticketStatus }),
      ...(parsed.tags === undefined ? {} : { tags: parsed.tags }),
      duplicateCandidates: parsed.duplicateCandidates,
      outageRisk: parsed.outageRisk,
      securityRisk: parsed.securityRisk,
      slaRisk: parsed.slaRisk,
      missingInformation: parsed.missingInformation,
      ...(parsed.supportState === undefined
        ? {}
        : { supportState: parsed.supportState }),
      ...(parsed.knownCause === undefined
        ? {}
        : { knownCause: parsed.knownCause }),
      ...(parsed.knownCauseRef === undefined
        ? {}
        : { knownCauseRef: parsed.knownCauseRef }),
      ...(parsed.learnedContext === undefined
        ? {}
        : { learnedContext: parsed.learnedContext }),
      ...(parsed.knownEventId === undefined
        ? {}
        : { knownEventId: parsed.knownEventId }),
      ...(parsed.knownEventMatchReasons === undefined
        ? {}
        : { knownEventMatchReasons: parsed.knownEventMatchReasons }),
      ...(parsed.requiredEvidence === undefined
        ? {}
        : { requiredEvidence: parsed.requiredEvidence }),
      ...(parsed.providedEvidence === undefined
        ? {}
        : { providedEvidence: parsed.providedEvidence }),
      ...(parsed.missingEvidence === undefined
        ? {}
        : { missingEvidence: parsed.missingEvidence }),
      ...(parsed.classificationSignals === undefined
        ? {}
        : { classificationSignals: parsed.classificationSignals }),
      ...(classificationConfidence === undefined
        ? {}
        : { classificationConfidence }),
      ...(parsed.nextInvestigationSteps === undefined
        ? {}
        : { nextInvestigationSteps: parsed.nextInvestigationSteps }),
      knowledgeArticleIds: parsed.knowledgeArticleIds,
      draftCustomerResponse: parsed.draftCustomerResponse,
      ...(parsed.draftCustomerResponseSource === undefined
        ? {}
        : { draftCustomerResponseSource: parsed.draftCustomerResponseSource }),
      ...(parsed.draftCustomerResponseStyle === undefined
        ? {}
        : { draftCustomerResponseStyle: parsed.draftCustomerResponseStyle }),
      ...(parsed.draftCustomerResponseChecks === undefined
        ? {}
        : { draftCustomerResponseChecks: parsed.draftCustomerResponseChecks }),
      ...(parsed.gptAssist === undefined ? {} : { gptAssist: parsed.gptAssist }),
      ...(parsed.aiExecutionTrace === undefined
        ? {}
        : { aiExecutionTrace: parsed.aiExecutionTrace }),
      rationale: parsed.rationale,
      confidence: parsed.confidence,
      recommendedNextAction: parsed.recommendedNextAction,
      // Preserve classifier/policy signals while recomputing derived escalation
      // reasons. `evaluateEscalation` deduplicates and adds independent signals
      // such as SLA or missing-information risk.
      escalationRequired: (parsed.escalationReasons ?? []).length > 0,
      escalationReasons: parsed.escalationReasons ?? [],
      resolution: "pending",
      createdAt: parsed.submittedAt,
    });
    const decision = evaluateEscalation(unevaluated, this.now(), ticket);
    const recommendation = TriageRecommendationSchema.parse({
      ...unevaluated,
      escalationRequired: decision.required,
      escalationReasons: decision.reasons,
    });
    return recommendation;
  }

  private async submitOperational(
    parsed: z.infer<typeof SubmitRecommendationInputSchema>,
    commandContext: OperationalCommandContext,
    classificationConfidence?: ClassificationConfidence,
  ): Promise<TriageRecommendation> {
    const store = this.dependencies.operationalStore;
    if (store === undefined) throw new Error("Operational store is not configured.");
    const ticket = store.readTicket(parsed.ticketId);
    const recommendation = this.buildRecommendation(parsed, ticket, classificationConfidence);
    const request = classificationConfidence === undefined
      ? parsed
      : { ...parsed, classificationConfidence };
    const requestHash = canonicalRequestHash("submit-recommendation", request);
    return store.transaction((unit) => {
      const replay = unit.beginCommand(commandContext.commandId, "submit-recommendation", request);
      if (replay !== "new") return this.replayRecommendation(unit, replay);
      const snapshot = unit.readWorkflowSnapshot(parsed.ticketId);
      if (snapshot.ticket.revision !== parsed.sourceRevision) {
        throw stale("Recommendation source revision is stale.");
      }
      const eventId = this.uuid();
      const [sequence] = unit.allocateEventSequences(parsed.ticketId, 1);
      unit.appendEvent(this.operationalRecommendationEvent(
        eventId,
        parsed.ticketId,
        sequence!,
        commandContext.commandId,
        recommendation,
        parsed.actor,
        parsed.submittedAt,
        "recommendation-submitted",
      ));
      unit.insertRecommendation(recommendation);
      unit.appendRecommendationRevision({
        recommendation,
        operationalEventId: eventId,
        createdAt: parsed.submittedAt,
      });
      this.appendEvaluationTraces(unit, eventId, recommendation, parsed.actor, parsed.submittedAt);
      unit.persistCommandResult(commandContext.commandId, requestHash, {
        operation: "submit-recommendation",
        tickets: [{ ticketId: parsed.ticketId, operationalEventIds: [eventId], resultingRevision: null }],
        recommendationId: recommendation.id,
      });
      return recommendation;
    });
  }

  private async submitOperationalEvaluation(
    parsed: z.infer<typeof SubmitEvaluationInputSchema>,
    recommendationInput: z.infer<typeof SubmitRecommendationInputSchema>,
    evaluatedCustomerReplyWatermark: CustomerReplyWatermark,
    classificationConfidence: ClassificationConfidence | undefined,
    commandContext: OperationalCommandContext,
  ): Promise<{ recommendation: TriageRecommendation; recommendations: TriageRecommendation[] }> {
    const store = this.dependencies.operationalStore;
    if (store === undefined) throw new Error("Operational store is not configured.");
    const ticket = store.readTicket(parsed.ticketId);
    const recommendation = this.buildRecommendation(recommendationInput, ticket, classificationConfidence);
    const requestHash = canonicalRequestHash("evaluate-ticket", parsed);
    return store.transaction((unit) => {
      const replay = unit.beginCommand(commandContext.commandId, "evaluate-ticket", parsed);
      if (replay !== "new") return this.replayEvaluation(unit, replay);
      const snapshot = unit.readWorkflowSnapshot(parsed.ticketId);
      if (snapshot.ticket.revision !== parsed.sourceRevision) {
        throw stale("Recommendation source revision is stale.");
      }
      if (!operationalCustomerReplyWatermarksMatch(
        evaluatedCustomerReplyWatermark,
        snapshot,
      )) {
        throw stale("Evaluation customer reply snapshot is stale.");
      }

      const superseded = snapshot.recommendations.filter((candidate) =>
        candidate.resolution === "pending" &&
        candidate.ticketId === parsed.ticketId &&
        this.hasOperationalCustomerReplyAfterRecommendation(snapshot, candidate),
      );
      const eventIds = [this.uuid(), ...superseded.map(() => this.uuid())];
      const sequences = unit.allocateEventSequences(parsed.ticketId, eventIds.length);
      unit.appendEvent(this.operationalRecommendationEvent(
        eventIds[0]!,
        parsed.ticketId,
        sequences[0]!,
        commandContext.commandId,
        recommendation,
        parsed.actor,
        parsed.submittedAt,
        "recommendation-submitted",
      ));
      unit.insertRecommendation(recommendation);
      unit.appendRecommendationRevision({
        recommendation,
        operationalEventId: eventIds[0]!,
        createdAt: parsed.submittedAt,
      });
      this.appendEvaluationTraces(unit, eventIds[0]!, recommendation, parsed.actor, parsed.submittedAt);

      superseded.forEach((candidate, index) => {
        const updated = TriageRecommendationSchema.parse({ ...candidate, resolution: "superseded" });
        const eventId = eventIds[index + 1]!;
        unit.appendEvent(this.operationalRecommendationEvent(
          eventId,
          parsed.ticketId,
          sequences[index + 1]!,
          commandContext.commandId,
          updated,
          parsed.actor,
          parsed.submittedAt,
          "recommendation-superseded",
        ));
        unit.updateRecommendation(updated, "pending");
        unit.appendRecommendationRevision({
          recommendation: updated,
          operationalEventId: eventId,
          createdAt: parsed.submittedAt,
        });
      });

      const recommendationIds = [recommendation.id, ...superseded.map(({ id }) => id)];
      const result: OperationalResultReference = {
        operation: "evaluate-ticket",
        tickets: [{ ticketId: parsed.ticketId, operationalEventIds: eventIds, resultingRevision: null }],
        ...(recommendationIds.length === 1
          ? { recommendationId: recommendationIds[0]! }
          : { recommendationIds }),
      };
      unit.persistCommandResult(commandContext.commandId, requestHash, result);
      return this.replayEvaluation(unit, { result }, recommendation.id);
    });
  }

  private operationalRecommendationEvent(
    id: string,
    ticketId: TicketId,
    sequence: number,
    commandId: string,
    recommendation: TriageRecommendation,
    actor: string,
    occurredAt: string,
    action: "recommendation-submitted" | "recommendation-superseded",
  ) {
    return OperationalEventSchema.parse({
      id,
      ticketId,
      sequence,
      occurredAt,
      actor,
      action,
      commandId,
      facts: action === "recommendation-submitted"
        ? {
          sourceRevision: recommendation.sourceRevision,
          category: recommendation.category,
          priority: recommendation.priority,
          team: recommendation.team,
          confidence: recommendation.confidence,
          outcome: "pending",
        }
        : { resolution: "superseded", reasonCode: "newer-customer-reply" },
    });
  }

  private appendEvaluationTraces(
    unit: OperationalUnitOfWork,
    operationalEventId: string,
    recommendation: TriageRecommendation,
    actor: string,
    occurredAt: string,
  ): void {
    unit.appendTrace({
      id: this.uuid(),
      operationalEventId,
      ticketId: recommendation.ticketId,
      occurredAt,
      actor,
      traceType: "classification",
      category: recommendation.category,
      priority: recommendation.priority,
      team: recommendation.team,
      confidence: recommendation.confidence,
      reasons: stableUnique(
        recommendation.classificationSignals?.map(({ reason }) => reason) ?? [recommendation.rationale],
      ),
    });
    unit.appendTrace({
      id: this.uuid(),
      operationalEventId,
      ticketId: recommendation.ticketId,
      occurredAt,
      actor,
      traceType: "evidence",
      requiredEvidenceIds: recommendation.requiredEvidence?.map(({ id }) => id) ?? [],
      providedEvidenceIds: recommendation.providedEvidence?.map(({ id }) => id) ?? [],
      missingEvidenceIds: recommendation.missingEvidence?.map(({ id }) => id) ?? [],
    });
    unit.appendTrace({
      id: this.uuid(),
      operationalEventId,
      ticketId: recommendation.ticketId,
      occurredAt,
      actor,
      traceType: "lifecycle",
      stage: "recommendation-submitted",
      outcome: "success",
    });
    if (
      (recommendation.knownCause !== undefined && recommendation.knownCause !== null) ||
      recommendation.knownEventId !== undefined
    ) {
      unit.appendTrace({
        id: this.uuid(),
        operationalEventId,
        ticketId: recommendation.ticketId,
        occurredAt,
        actor,
        traceType: "known-cause",
        ...(recommendation.knownCause === undefined || recommendation.knownCause === null
          ? {}
          : { knownCause: recommendation.knownCause }),
        ...(recommendation.knownEventId === undefined || recommendation.knownEventId === null
          ? {}
          : { knownEventId: recommendation.knownEventId }),
        matchReasons: recommendation.knownEventMatchReasons ?? [],
      });
    }
    const aiTrace = recommendation.aiExecutionTrace;
    if (aiTrace !== undefined) {
      const telemetry = aiTrace.classification;
      unit.appendTrace({
        id: this.uuid(),
        operationalEventId,
        ticketId: recommendation.ticketId,
        occurredAt,
        actor,
        traceType: "provider-telemetry",
        provider: telemetry.status === "fallback"
          ? "fallback"
          : telemetry.status === "used" ? "openai" : "deterministic",
        ...(telemetry.model === undefined ? {} : { model: telemetry.model }),
        status: telemetry.status,
        ...(telemetry.latencyMs === undefined ? {} : { latencyMs: telemetry.latencyMs }),
        ...(telemetry.usage === undefined ? {} : {
          inputTokens: telemetry.usage.inputTokens,
          outputTokens: telemetry.usage.outputTokens,
        }),
        ...(telemetry.fallback?.message === undefined ? {} : { fallbackReason: telemetry.fallback.message }),
      });
    }
  }

  private replayRecommendation(unit: OperationalUnitOfWork, replay: CommandReplay): TriageRecommendation {
    const recommendationId = replay.result.recommendationId ?? replay.result.recommendationIds?.[0];
    if (recommendationId === undefined) throw stale("Operational recommendation replay is missing its recommendation reference.");
    const eventIds = new Set(replay.result.tickets.flatMap(({ operationalEventIds }) => operationalEventIds));
    const snapshot = unit.readWorkflowSnapshot(replay.result.tickets[0]!.ticketId);
    const endSequence = Math.max(
      ...snapshot.events.filter(({ id }) => eventIds.has(id)).map(({ sequence }) => sequence),
    );
    const historical = snapshot.recommendationRevisions
      .map((revision) => ({
        revision,
        event: snapshot.events.find(({ id }) => id === revision.operationalEventId),
      }))
      .filter(({ revision, event }) =>
        revision.recommendation.id === recommendationId && event !== undefined && event.sequence <= endSequence,
      )
      .at(-1)?.revision.recommendation;
    if (historical === undefined) throw stale("Operational recommendation replay is missing its persisted recommendation.");
    return historical;
  }

  private replayEvaluation(
    unit: OperationalUnitOfWork,
    replay: CommandReplay,
    preferredRecommendationId?: string,
  ): { recommendation: TriageRecommendation; recommendations: TriageRecommendation[] } {
    const recommendationIds = replay.result.recommendationIds ??
      (replay.result.recommendationId === undefined ? [] : [replay.result.recommendationId]);
    const eventIds = new Set(replay.result.tickets.flatMap(({ operationalEventIds }) => operationalEventIds));
    const snapshot = unit.readWorkflowSnapshot(replay.result.tickets[0]!.ticketId);
    const commandSequences = new Set(snapshot.events.filter(({ id }) => eventIds.has(id)).map(({ sequence }) => sequence));
    const endSequence = Math.max(...commandSequences);
    const latest = new Map<string, TriageRecommendation>();
    const firstRevisionSequence = new Map<string, number>();
    for (const revision of snapshot.recommendationRevisions) {
      const event = snapshot.events.find(({ id }) => id === revision.operationalEventId);
      if (event === undefined || event.sequence > endSequence || !recommendationIds.includes(revision.recommendation.id)) continue;
      latest.set(revision.recommendation.id, revision.recommendation);
      if (!firstRevisionSequence.has(revision.recommendation.id)) {
        firstRevisionSequence.set(revision.recommendation.id, event.sequence);
      }
    }
    const recommendation = latest.get(preferredRecommendationId ?? recommendationIds[0]!);
    if (recommendation === undefined) throw stale("Operational evaluation replay is missing its persisted recommendation.");
    return {
      recommendation,
      recommendations: [...latest.entries()]
        .sort((left, right) => (firstRevisionSequence.get(left[0]) ?? 0) - (firstRevisionSequence.get(right[0]) ?? 0))
        .map(([, value]) => value),
    };
  }

  private hasOperationalCustomerReplyAfterRecommendation(
    snapshot: OperationalWorkflowSnapshot,
    recommendation: TriageRecommendation,
  ): boolean {
    return hasCustomerReplyAfterRecommendationFromSnapshot(snapshot, recommendation);
  }

  async submitEvaluation(
    input: SubmitEvaluationInput,
    commandContext?: OperationalCommandContext,
  ): Promise<{
    recommendation: TriageRecommendation;
    recommendations: TriageRecommendation[];
  }> {
    const { knownCauseReferenceValidation, ...serializableInput } = input;
    assertTrustedKnownCauseReference(serializableInput, knownCauseReferenceValidation);
    const parsed = SubmitEvaluationInputSchema.parse(serializableInput);
    const { customerReplyWatermarksMatch } = await import(
      "./approval-desk/diagnosis-review.js"
    );
    const {
      evaluatedCustomerReplyWatermark,
      classificationConfidence,
      ...recommendationInput
    } = parsed;
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational evaluations require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      return this.submitOperationalEvaluation(
        parsed,
        recommendationInput,
        evaluatedCustomerReplyWatermark,
        classificationConfidence,
        commandContext,
      );
    }
    return serializeTicket(recommendationInput.ticketId, async () => {
      const currentCustomerReplyWatermark = customerReplyWatermarkFromAudits(
        await this.dependencies.audit.list(recommendationInput.ticketId),
      );
      if (
        !customerReplyWatermarksMatch(
          evaluatedCustomerReplyWatermark,
          currentCustomerReplyWatermark,
        )
      ) {
        throw stale("Evaluation customer reply snapshot is stale.");
      }
      const recommendation = await this.submit(
        recommendationInput,
        submitWithinTicketLockCapability,
        classificationConfidence,
        submitClassificationConfidenceCapability,
        knownCauseReferenceValidation,
      );
      const recommendations =
        await this.supersedePendingRecommendationsWithNewerReply({
          ticketId: recommendationInput.ticketId,
          actor: recommendationInput.actor,
          supersededAt: recommendationInput.submittedAt,
        });
      return { recommendation, recommendations };
    });
  }

  async approve(
    input: Approval,
    commandContext?: OperationalCommandContext,
  ): Promise<{ ticket: Ticket; auditEvent: AuditEvent }> {
    const approval = ApprovalSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational recommendation approvals require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      return this.approveOperational(approval, commandContext);
    }
    return serializeTicket(approval.ticketId, async () => {
      await this.supersedePendingRecommendationsWithNewerReply({
        ticketId: approval.ticketId,
        actor: approval.actor,
        supersededAt: approval.approvedAt,
      });
      return serializeRecommendation(approval.recommendationId, () =>
        this.approveValidated(approval),
      );
    });
  }

  async reject(
    input: RejectRecommendationInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const rejection = RejectRecommendationInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational recommendation rejections require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      return this.transitionOperationalRecommendation(
        "reject-recommendation",
        rejection,
        "pending",
        "rejected",
        "recommendation-rejected",
        rejection.feedback,
        rejection.rejectedAt,
        commandContext,
      );
    }
    return serializeTicket(rejection.ticketId, () =>
      serializeRecommendation(rejection.recommendationId, () =>
        this.rejectValidated(rejection),
      ),
    );
  }

  async cancelApproval(
    input: CancelApprovalInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const cancellation = CancelApprovalInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational approval cancellations require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      return this.transitionOperationalRecommendation(
        "cancel-recommendation-approval",
        cancellation,
        "approved",
        "canceled",
        "recommendation-canceled",
        cancellation.reason,
        cancellation.canceledAt,
        commandContext,
      );
    }
    return serializeTicket(cancellation.ticketId, () =>
      serializeRecommendation(cancellation.recommendationId, () =>
        this.cancelApprovalValidated(cancellation),
      ),
    );
  }

  async markResponseSent(
    input: MarkResponseSentInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const sent = MarkResponseSentInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational support responses require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      return this.markOperationalResponseSent(sent, commandContext);
    }
    return serializeTicket(sent.ticketId, () =>
      serializeRecommendation(sent.recommendationId, () =>
        this.markResponseSentValidated(sent),
      ),
    );
  }

  async approveAndMarkResponseSent(
    input: ApproveAndMarkResponseSentInput,
    commandContext?: OperationalCommandContext,
  ): Promise<{
    ticket: Ticket;
    approvalEvent: AuditEvent;
    sentEvent: AuditEvent;
    auditsBeforeSent: AuditEvent[];
  }> {
    const approval = ApprovalSchema.parse(input.approval);
    const responseSent = MarkResponseSentInputSchema.parse(input.responseSent);
    if (
      approval.recommendationId !== responseSent.recommendationId ||
      approval.ticketId !== responseSent.ticketId
    ) {
      throw stale("Approval and sent response do not match.");
    }
    if (
      !approval.approvedFields.includes("customerResponse") ||
      approval.editedCustomerResponse !== responseSent.customerResponse
    ) {
      throw new DomainError(
        "Sent customer response must match the approved customer response.",
        "INVALID_APPROVAL_FIELDS",
      );
    }

    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational approval and response commands require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      return this.approveAndMarkOperationalResponseSent(
        approval,
        responseSent,
        commandContext,
      );
    }

    return serializeTicket(approval.ticketId, async () => {
      await this.supersedePendingRecommendationsWithNewerReply({
        ticketId: approval.ticketId,
        actor: approval.actor,
        supersededAt: approval.approvedAt,
      });
      return serializeRecommendation(approval.recommendationId, async () => {
        const approved = await this.approveValidated(approval);
        const auditsBeforeSent = await this.dependencies.audit.list(
          approval.ticketId,
        );
        const sentEvent = await this.markResponseSentValidated(responseSent);
        return {
          ticket: approved.ticket,
          approvalEvent: approved.auditEvent,
          sentEvent,
          auditsBeforeSent,
        };
      });
    });
  }

  async addCustomerReply(
    input: AddCustomerReplyInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const reply = AddCustomerReplyInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational customer replies require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      return this.addOperationalCustomerReply(reply, commandContext);
    }
    return serializeTicket(reply.ticketId, async () => {
      await this.dependencies.tickets.get(reply.ticketId);

      const auditEvent = AuditEventSchema.parse({
        id: this.uuid(),
        timestamp: reply.receivedAt,
        actor: reply.actor,
        action: "customer-reply-received",
        ticketId: reply.ticketId,
        before: {},
        after: {
          body: reply.body,
          ...(reply.source === undefined ? {} : { source: reply.source }),
        },
        rationale: "Customer reply added to ticket conversation.",
        knowledgeArticleIds: [],
        result: "success",
      });
      await this.dependencies.audit.append(auditEvent);
      return auditEvent;
    });
  }

  private async addOperationalCustomerReply(
    reply: z.infer<typeof AddCustomerReplyInputSchema>,
    commandContext: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const store = this.dependencies.operationalStore;
    if (store === undefined) throw new Error("Operational store is not configured.");
    const semanticRequest = {
      ticketId: reply.ticketId,
      actor: reply.actor,
      body: reply.body,
      ...(reply.source === undefined ? {} : { source: reply.source }),
    };
    const requestHash = canonicalRequestHash("add-customer-reply", semanticRequest);
    return store.transaction((unit) => {
      const replay = unit.beginCommand(
        commandContext.commandId,
        "add-customer-reply",
        semanticRequest,
      );
      if (replay !== "new") return this.replayCustomerReply(unit, replay);
      const snapshot = unit.readWorkflowSnapshot(reply.ticketId);
      const messageId = this.uuid();
      const operationalEventId = this.uuid();
      const [sequence] = unit.allocateEventSequences(reply.ticketId, 1);
      unit.appendEvent({
        id: operationalEventId,
        ticketId: reply.ticketId,
        sequence: sequence!,
        occurredAt: reply.receivedAt,
        actor: reply.actor,
        action: "customer-reply-received",
        commandId: commandContext.commandId,
        facts: { messageId },
      });
      const message: ConversationMessage = {
        id: messageId,
        ticketId: reply.ticketId,
        operationalEventId,
        kind: "customer",
        createdAt: reply.receivedAt,
        body: reply.body,
      };
      unit.insertMessage(message);
      unit.appendTrace({
        id: this.uuid(),
        operationalEventId,
        ticketId: reply.ticketId,
        occurredAt: reply.receivedAt,
        actor: reply.actor,
        traceType: "lifecycle",
        stage: "customer-reply-received",
        outcome: "success",
      });
      unit.persistCommandResult(commandContext.commandId, requestHash, {
        operation: "add-customer-reply",
        tickets: [{
          ticketId: reply.ticketId,
          operationalEventIds: [operationalEventId],
          resultingRevision: null,
        }],
        messageId,
      });
      return operationalCustomerReplyAudit(message, snapshot.ticket, reply.actor);
    });
  }

  private replayCustomerReply(
    unit: OperationalUnitOfWork,
    replay: CommandReplay,
  ): AuditEvent {
    const ticketResult = replay.result.tickets[0];
    if (ticketResult === undefined || replay.result.messageId === undefined) {
      throw stale("Operational customer-reply replay is missing its message reference.");
    }
    const snapshot = unit.readWorkflowSnapshot(ticketResult.ticketId);
    const message = snapshot.messages.find(({ id }) => id === replay.result.messageId);
    const event = message === undefined
      ? undefined
      : snapshot.events.find(({ id }) => id === message.operationalEventId);
    if (
      message?.kind !== "customer"
      || event?.action !== "customer-reply-received"
      || !ticketResult.operationalEventIds.includes(event.id)
    ) {
      throw stale("Operational customer-reply replay is missing its persisted message.");
    }
    return operationalCustomerReplyAudit(message, snapshot.ticket, event.actor);
  }

  private approveOperational(
    approval: Approval,
    commandContext: OperationalCommandContext,
  ): { ticket: Ticket; auditEvent: AuditEvent } {
    const store = this.dependencies.operationalStore;
    if (store === undefined) throw new Error("Operational store is not configured.");
    const { approvedAt: _approvedAt, ...semanticRequest } = approval;
    const requestHash = canonicalRequestHash("approve-recommendation", semanticRequest);
    return store.transaction((unit) => {
      const replay = unit.beginCommand(
        commandContext.commandId,
        "approve-recommendation",
        semanticRequest,
      );
      if (replay !== "new") return this.replayOperationalApproval(unit, replay);
      const snapshot = unit.readWorkflowSnapshot(approval.ticketId);
      const recommendation = snapshot.recommendations.find(
        ({ id }) => id === approval.recommendationId,
      );
      if (
        recommendation === undefined
        || recommendation.resolution !== "pending"
        || recommendation.ticketId !== approval.ticketId
      ) {
        throw stale("Recommendation cannot be applied.");
      }
      if (this.hasOperationalCustomerReplyAfterRecommendation(snapshot, recommendation)) {
        throw stale("Recommendation cannot be applied after a newer customer reply.");
      }
      const ticketBefore = snapshot.ticket;
      if (
        ticketBefore.revision !== approval.expectedRevision
        || recommendation.sourceRevision !== approval.expectedRevision
      ) {
        throw stale("Approval revision is stale.");
      }
      validateOperationalApproval(recommendation, ticketBefore, approval, this.now());

      const approvedRecommendation = recommendationAfterApproval(recommendation, approval);
      const ticketAfter = approvedTicketProjection(ticketBefore, recommendation, approval);
      const changesTicket = ticketAfter !== ticketBefore;
      const approvalFacts = operationalApprovalFacts(ticketBefore, recommendation, approval);
      const eventId = this.uuid();
      const [sequence] = unit.allocateEventSequences(approval.ticketId, 1);
      unit.appendEvent({
        id: eventId,
        ticketId: approval.ticketId,
        sequence: sequence!,
        occurredAt: approval.approvedAt,
        actor: approval.actor,
        action: "recommendation-approved",
        commandId: commandContext.commandId,
        facts: {
          approved: true,
          approvedFields: approval.approvedFields,
          resolution: "approved",
          expectedRevision: approval.expectedRevision,
          recommendationFields: approvalFacts,
          ...(changesTicket ? { revision: ticketAfter.revision } : {}),
        },
      });
      unit.updateRecommendation(approvedRecommendation, "pending");
      unit.appendRecommendationRevision({
        recommendation: approvedRecommendation,
        operationalEventId: eventId,
        createdAt: approval.approvedAt,
      });
      if (changesTicket) {
        unit.updateTicket(ticketAfter, ticketBefore.revision);
        unit.appendTicketRevision({
          ticketId: ticketAfter.id,
          revision: ticketAfter.revision,
          ticket: ticketAfter,
          operationalEventId: eventId,
          createdAt: approval.approvedAt,
        });
      }
      this.appendLifecycleTrace(
        unit,
        eventId,
        approval.ticketId,
        approval.actor,
        approval.approvedAt,
        "recommendation-approved",
      );
      const result: OperationalResultReference = {
        operation: "approve-recommendation",
        tickets: [{
          ticketId: approval.ticketId,
          operationalEventIds: [eventId],
          resultingRevision: changesTicket ? ticketAfter.revision : null,
        }],
        recommendationId: recommendation.id,
        ticketSnapshot: ticketAfter,
      };
      unit.persistCommandResult(commandContext.commandId, requestHash, result);
      return this.replayOperationalApproval(unit, { result });
    });
  }

  private replayOperationalApproval(
    unit: OperationalUnitOfWork,
    replay: CommandReplay,
  ): { ticket: Ticket; auditEvent: AuditEvent } {
    const ticketResult = replay.result.tickets[0];
    const recommendationId = replay.result.recommendationId
      ?? replay.result.recommendationIds?.[0];
    if (ticketResult === undefined || recommendationId === undefined) {
      throw stale("Operational approval replay is missing its semantic references.");
    }
    const snapshot = unit.readWorkflowSnapshot(ticketResult.ticketId);
    const event = snapshot.events.find(
      ({ id, action }) => ticketResult.operationalEventIds.includes(id)
        && action === "recommendation-approved",
    );
    const recommendation = event === undefined
      ? undefined
      : snapshot.recommendationRevisions.find(
          (revision) => revision.operationalEventId === event.id
            && revision.recommendation.id === recommendationId,
        )?.recommendation;
    if (event === undefined || recommendation === undefined) {
      throw stale("Operational approval replay is missing its persisted recommendation.");
    }
    const ticket = replay.result.ticketSnapshot ?? snapshot.ticketRevisions.find(
      ({ operationalEventId }) => operationalEventId === event.id,
    )?.ticket ?? snapshot.ticket;
    return {
      ticket,
      auditEvent: operationalRecommendationLifecycleAudit(
        event,
        recommendation,
        "pending",
        "approved",
        recommendation.rationale,
      ),
    };
  }

  private transitionOperationalRecommendation(
    operation: string,
    input: {
      recommendationId: string;
      ticketId: TicketId;
      actor: string;
    },
    expectedResolution: TriageRecommendation["resolution"],
    resultingResolution: TriageRecommendation["resolution"],
    action: "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
    reason: string,
    occurredAt: string,
    commandContext: OperationalCommandContext,
  ): AuditEvent {
    const store = this.dependencies.operationalStore;
    if (store === undefined) throw new Error("Operational store is not configured.");
    const semanticRequest = {
      recommendationId: input.recommendationId,
      ticketId: input.ticketId,
      actor: input.actor,
      reason,
    };
    const requestHash = canonicalRequestHash(operation, semanticRequest);
    return store.transaction((unit) => {
      const replay = unit.beginCommand(commandContext.commandId, operation, semanticRequest);
      if (replay !== "new") return this.replayOperationalTransition(unit, replay, action);
      const snapshot = unit.readWorkflowSnapshot(input.ticketId);
      const recommendation = snapshot.recommendations.find(
        ({ id }) => id === input.recommendationId,
      );
      if (
        recommendation === undefined
        || recommendation.resolution !== expectedResolution
        || recommendation.ticketId !== input.ticketId
      ) {
        throw stale(operationalTransitionStaleMessage(action));
      }
      const updated = TriageRecommendationSchema.parse({
        ...recommendation,
        resolution: resultingResolution,
      });
      const eventId = this.uuid();
      const [sequence] = unit.allocateEventSequences(input.ticketId, 1);
      unit.appendEvent({
        id: eventId,
        ticketId: input.ticketId,
        sequence: sequence!,
        occurredAt,
        actor: input.actor,
        action,
        commandId: commandContext.commandId,
        facts: { resolution: resultingResolution, reasonCode: reason },
      });
      unit.updateRecommendation(updated, expectedResolution);
      unit.appendRecommendationRevision({
        recommendation: updated,
        operationalEventId: eventId,
        createdAt: occurredAt,
      });
      this.appendLifecycleTrace(
        unit,
        eventId,
        input.ticketId,
        input.actor,
        occurredAt,
        action,
        reason,
      );
      const result: OperationalResultReference = {
        operation,
        tickets: [{
          ticketId: input.ticketId,
          operationalEventIds: [eventId],
          resultingRevision: null,
        }],
        recommendationId: input.recommendationId,
      };
      unit.persistCommandResult(commandContext.commandId, requestHash, result);
      return this.replayOperationalTransition(unit, { result }, action);
    });
  }

  private replayOperationalTransition(
    unit: OperationalUnitOfWork,
    replay: CommandReplay,
    action: "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
  ): AuditEvent {
    const ticketResult = replay.result.tickets[0];
    const recommendationId = replay.result.recommendationId;
    if (ticketResult === undefined || recommendationId === undefined) {
      throw stale("Operational lifecycle replay is missing its semantic references.");
    }
    const snapshot = unit.readWorkflowSnapshot(ticketResult.ticketId);
    const event = snapshot.events.find(
      ({ id, action: candidateAction }) => ticketResult.operationalEventIds.includes(id)
        && candidateAction === action,
    );
    const recommendation = event === undefined
      ? undefined
      : snapshot.recommendationRevisions.find(
          (revision) => revision.operationalEventId === event.id
            && revision.recommendation.id === recommendationId,
        )?.recommendation;
    if (event === undefined || recommendation === undefined) {
      throw stale("Operational lifecycle replay is missing its persisted recommendation.");
    }
    const reason = typeof event.facts.reasonCode === "string"
      ? event.facts.reasonCode
      : "Recommendation lifecycle transition completed.";
    return operationalRecommendationLifecycleAudit(
      event,
      recommendation,
      operationalExpectedResolution(action),
      recommendation.resolution,
      reason,
    );
  }

  private markOperationalResponseSent(
    sent: MarkResponseSentInput,
    commandContext: OperationalCommandContext,
  ): AuditEvent {
    const store = this.dependencies.operationalStore;
    if (store === undefined) throw new Error("Operational store is not configured.");
    const { sentAt: _sentAt, ...semanticRequest } = sent;
    const requestHash = canonicalRequestHash("mark-response-sent", semanticRequest);
    return store.transaction((unit) => {
      const replay = unit.beginCommand(
        commandContext.commandId,
        "mark-response-sent",
        semanticRequest,
      );
      if (replay !== "new") return this.replayOperationalResponseSent(unit, replay);
      const snapshot = unit.readWorkflowSnapshot(sent.ticketId);
      const recommendation = snapshot.recommendations.find(
        ({ id }) => id === sent.recommendationId,
      );
      assertOperationalResponseMayBeSent(recommendation, sent);
      if (this.hasOperationalCustomerReplyAfterRecommendation(snapshot, recommendation)) {
        throw stale("Approved customer response is stale after a newer customer reply.");
      }
      assertOperationalResponseNotAlreadySent(snapshot, sent.recommendationId);
      const eventId = this.uuid();
      const messageId = this.uuid();
      const [sequence] = unit.allocateEventSequences(sent.ticketId, 1);
      unit.appendEvent({
        id: eventId,
        ticketId: sent.ticketId,
        sequence: sequence!,
        occurredAt: sent.sentAt,
        actor: sent.actor,
        action: "customer-response-sent",
        commandId: commandContext.commandId,
        facts: { messageId },
      });
      unit.insertMessage({
        id: messageId,
        ticketId: sent.ticketId,
        operationalEventId: eventId,
        kind: "support",
        createdAt: sent.sentAt,
        body: sent.customerResponse,
        recommendationId: sent.recommendationId,
      });
      this.appendLifecycleTrace(
        unit,
        eventId,
        sent.ticketId,
        sent.actor,
        sent.sentAt,
        "customer-response-sent",
      );
      const result: OperationalResultReference = {
        operation: "mark-response-sent",
        tickets: [{
          ticketId: sent.ticketId,
          operationalEventIds: [eventId],
          resultingRevision: null,
        }],
        messageId,
      };
      unit.persistCommandResult(commandContext.commandId, requestHash, result);
      return this.replayOperationalResponseSent(unit, { result });
    });
  }

  private replayOperationalResponseSent(
    unit: OperationalUnitOfWork,
    replay: CommandReplay,
  ): AuditEvent {
    const ticketResult = replay.result.tickets[0];
    const messageId = replay.result.messageId;
    if (ticketResult === undefined || messageId === undefined) {
      throw stale("Operational support-response replay is missing its semantic references.");
    }
    const snapshot = unit.readWorkflowSnapshot(ticketResult.ticketId);
    const message = snapshot.messages.find(({ id }) => id === messageId);
    const event = message === undefined
      ? undefined
      : snapshot.events.find(({ id }) => id === message.operationalEventId);
    const recommendationId = replay.result.recommendationId ?? message?.recommendationId;
    const recommendation = recommendationId === undefined
      ? undefined
      : snapshot.recommendations.find(({ id }) => id === recommendationId);
    if (
      message?.kind !== "support"
      || event?.action !== "customer-response-sent"
      || recommendation === undefined
      || !ticketResult.operationalEventIds.includes(event.id)
    ) {
      throw stale("Operational support-response replay is missing its persisted message.");
    }
    return operationalSupportResponseAudit(event, message, recommendation);
  }

  private approveAndMarkOperationalResponseSent(
    approval: Approval,
    sent: MarkResponseSentInput,
    commandContext: OperationalCommandContext,
  ): {
    ticket: Ticket;
    approvalEvent: AuditEvent;
    sentEvent: AuditEvent;
    auditsBeforeSent: AuditEvent[];
  } {
    const store = this.dependencies.operationalStore;
    if (store === undefined) throw new Error("Operational store is not configured.");
    const { approvedAt: _approvedAt, ...semanticApproval } = approval;
    const { sentAt: _sentAt, ...semanticSent } = sent;
    const semanticRequest = { approval: semanticApproval, responseSent: semanticSent };
    const operation = "approve-and-mark-response-sent";
    const requestHash = canonicalRequestHash(operation, semanticRequest);
    return store.transaction((unit) => {
      const replay = unit.beginCommand(commandContext.commandId, operation, semanticRequest);
      if (replay !== "new") return this.replayOperationalApprovalAndSend(unit, replay);
      const snapshot = unit.readWorkflowSnapshot(approval.ticketId);
      const recommendation = snapshot.recommendations.find(
        ({ id }) => id === approval.recommendationId,
      );
      if (
        recommendation === undefined
        || recommendation.resolution !== "pending"
        || recommendation.ticketId !== approval.ticketId
      ) {
        throw stale("Recommendation cannot be applied.");
      }
      if (this.hasOperationalCustomerReplyAfterRecommendation(snapshot, recommendation)) {
        throw stale("Recommendation cannot be applied after a newer customer reply.");
      }
      const ticketBefore = snapshot.ticket;
      if (
        ticketBefore.revision !== approval.expectedRevision
        || recommendation.sourceRevision !== approval.expectedRevision
      ) {
        throw stale("Approval revision is stale.");
      }
      validateOperationalApproval(recommendation, ticketBefore, approval, this.now());
      const approvedRecommendation = recommendationAfterApproval(recommendation, approval);
      assertOperationalResponseMayBeSent(approvedRecommendation, sent);
      assertOperationalResponseNotAlreadySent(snapshot, sent.recommendationId);
      const ticketAfter = approvedTicketProjection(ticketBefore, recommendation, approval);
      const changesTicket = ticketAfter !== ticketBefore;
      const approvalFacts = operationalApprovalFacts(ticketBefore, recommendation, approval);
      const approvalEventId = this.uuid();
      const sentEventId = this.uuid();
      const messageId = this.uuid();
      const [approvalSequence, sentSequence] = unit.allocateEventSequences(approval.ticketId, 2);
      unit.appendEvent({
        id: approvalEventId,
        ticketId: approval.ticketId,
        sequence: approvalSequence!,
        occurredAt: approval.approvedAt,
        actor: approval.actor,
        action: "recommendation-approved",
        commandId: commandContext.commandId,
        facts: {
          approved: true,
          approvedFields: approval.approvedFields,
          resolution: "approved",
          expectedRevision: approval.expectedRevision,
          recommendationFields: approvalFacts,
          ...(changesTicket ? { revision: ticketAfter.revision } : {}),
        },
      });
      unit.updateRecommendation(approvedRecommendation, "pending");
      unit.appendRecommendationRevision({
        recommendation: approvedRecommendation,
        operationalEventId: approvalEventId,
        createdAt: approval.approvedAt,
      });
      if (changesTicket) {
        unit.updateTicket(ticketAfter, ticketBefore.revision);
        unit.appendTicketRevision({
          ticketId: ticketAfter.id,
          revision: ticketAfter.revision,
          ticket: ticketAfter,
          operationalEventId: approvalEventId,
          createdAt: approval.approvedAt,
        });
      }
      this.appendLifecycleTrace(
        unit,
        approvalEventId,
        approval.ticketId,
        approval.actor,
        approval.approvedAt,
        "recommendation-approved",
      );
      unit.appendEvent({
        id: sentEventId,
        ticketId: sent.ticketId,
        sequence: sentSequence!,
        occurredAt: sent.sentAt,
        actor: sent.actor,
        action: "customer-response-sent",
        commandId: commandContext.commandId,
        facts: { messageId },
      });
      unit.insertMessage({
        id: messageId,
        ticketId: sent.ticketId,
        operationalEventId: sentEventId,
        kind: "support",
        createdAt: sent.sentAt,
        body: sent.customerResponse,
        recommendationId: sent.recommendationId,
      });
      this.appendLifecycleTrace(
        unit,
        sentEventId,
        sent.ticketId,
        sent.actor,
        sent.sentAt,
        "customer-response-sent",
      );
      const result: OperationalResultReference = {
        operation,
        tickets: [{
          ticketId: approval.ticketId,
          operationalEventIds: [approvalEventId, sentEventId],
          resultingRevision: changesTicket ? ticketAfter.revision : null,
        }],
        recommendationId: recommendation.id,
        messageId,
        ticketSnapshot: ticketAfter,
        auditsBeforeSentEventIds: [
          ...snapshot.events.map(({ id }) => id),
          approvalEventId,
        ],
      };
      unit.persistCommandResult(commandContext.commandId, requestHash, result);
      return this.replayOperationalApprovalAndSend(unit, { result });
    });
  }

  private replayOperationalApprovalAndSend(
    unit: OperationalUnitOfWork,
    replay: CommandReplay,
  ): {
    ticket: Ticket;
    approvalEvent: AuditEvent;
    sentEvent: AuditEvent;
    auditsBeforeSent: AuditEvent[];
  } {
    const approved = this.replayOperationalApproval(unit, replay);
    const sentEvent = this.replayOperationalResponseSent(unit, replay);
    const ticketResult = replay.result.tickets[0]!;
    const snapshot = unit.readWorkflowSnapshot(ticketResult.ticketId);
    const persistedSentEvent = snapshot.events.find(
      ({ id, action }) => ticketResult.operationalEventIds.includes(id)
        && action === "customer-response-sent",
    );
    if (persistedSentEvent === undefined) {
      throw stale("Operational approval and send replay is missing its sent event.");
    }
    const auditsBeforeSentEventIds = replay.result.auditsBeforeSentEventIds
      ?? snapshot.events
        .filter(({ sequence }) => sequence < persistedSentEvent.sequence)
        .map(({ id }) => id);
    return {
      ticket: approved.ticket,
      approvalEvent: approved.auditEvent,
      sentEvent,
      auditsBeforeSent: operationalConversationAuditsForEventIds(
        snapshot,
        auditsBeforeSentEventIds,
      ),
    };
  }

  private appendLifecycleTrace(
    unit: OperationalUnitOfWork,
    operationalEventId: string,
    ticketId: TicketId,
    actor: string,
    occurredAt: string,
    stage: string,
    reason?: string,
  ): void {
    unit.appendTrace({
      id: this.uuid(),
      operationalEventId,
      ticketId,
      occurredAt,
      actor,
      traceType: "lifecycle",
      stage,
      outcome: "success",
      ...(reason === undefined ? {} : { reason }),
    });
  }

  async recordDiagnosis(
    input: RecordDiagnosisInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const diagnosis = RecordDiagnosisInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational diagnoses require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      const [diagnosisReview, workflowGuidance, workflowReadModel] = await Promise.all([
        import("./approval-desk/diagnosis-review.js"),
        import("./approval-desk/workflow-guidance.js"),
        import("./approval-desk/workflow-read-model.js"),
      ]);
      const store = this.dependencies.operationalStore;
      const { diagnosedAt: _diagnosedAt, ...semanticRequest } = diagnosis;
      const operation = "record-diagnosis";
      const requestHash = canonicalRequestHash(operation, semanticRequest);
      return store.transaction((unit) => {
        const replay = unit.beginCommand(commandContext.commandId, operation, semanticRequest);
        if (replay !== "new") {
          return this.replayOperationalLifecycleAudit(replay, [
            "diagnosis-completed",
            "diagnostic-escalated",
          ]);
        }
        const snapshot = unit.readWorkflowSnapshot(diagnosis.ticketId);
        const audits = this.operationalAuditsFromSnapshot(unit, snapshot);
        if (diagnosis.sourceWorkflow !== undefined) {
          if (snapshot.ticket.revision !== diagnosis.sourceWorkflow.ticketRevision) {
            throw stale("Diagnosis ticket snapshot is stale.");
          }
          if (!diagnosisReview.customerReplyWatermarksMatch(
            diagnosis.sourceWorkflow.customerReplyWatermark,
            customerReplyWatermarkFromSnapshot(snapshot),
          )) {
            throw stale("Diagnosis customer reply snapshot is stale.");
          }
          const recommendation = workflowReadModel.summarizeRecommendationsForTicket(
            snapshot.ticket,
            snapshot.recommendations,
            audits,
          ).latest;
          if (recommendation?.id !== diagnosis.sourceWorkflow.recommendationId) {
            throw stale("Diagnosis recommendation snapshot is stale.");
          }
          const [diagnosisBlocker] = workflowGuidance.diagnosisBlockers({
            recommendation,
            audits,
          });
          if (diagnosisBlocker !== undefined) {
            throw new DomainError(diagnosisBlocker, "INVALID_APPROVAL_FIELDS");
          }
        }
        const escalated = diagnosis.diagnosis.diagnosticState?.state === "escalated";
        const eventId = this.uuid();
        const auditEvent = AuditEventSchema.parse({
          id: eventId,
          timestamp: diagnosis.diagnosedAt,
          actor: diagnosis.actor,
          action: escalated ? "diagnostic-escalated" : "diagnosis-completed",
          ticketId: diagnosis.ticketId,
          before: {},
          after: {
            diagnosis: diagnosis.diagnosis,
            sourceTicketRevision: snapshot.ticket.revision,
            sourceConversationWatermark: customerReplyWatermarkFromSnapshot(snapshot),
          },
          rationale: escalated
            ? "Diagnosis reached a bounded ambiguity limit and was escalated for specialist review."
            : "Diagnosis completed from trusted support context.",
          knowledgeArticleIds: diagnosis.knowledgeArticleIds,
          result: "success",
        });
        const [sequence] = unit.allocateEventSequences(diagnosis.ticketId, 1);
        unit.appendEvent({
          id: eventId,
          ticketId: diagnosis.ticketId,
          sequence: sequence!,
          occurredAt: diagnosis.diagnosedAt,
          actor: diagnosis.actor,
          action: auditEvent.action,
          commandId: commandContext.commandId,
          facts: {
            diagnosisOutcome: escalated ? "escalated" : "completed",
            sourceRevision: snapshot.ticket.revision,
            knowledgeArticleIds: diagnosis.knowledgeArticleIds,
            ...(diagnosis.diagnosis.knownEventId === undefined
              ? {}
              : { knownEventId: diagnosis.diagnosis.knownEventId }),
          },
        });
        const completedDiagnosis = escalated
          ? undefined
          : completedDiagnosisFrom(auditEvent, diagnosis);
        if (completedDiagnosis !== undefined) {
          unit.insertDiagnosis({ diagnosis: completedDiagnosis, operationalEventId: eventId });
        }
        unit.appendTrace({
          id: this.uuid(),
          operationalEventId: eventId,
          ticketId: diagnosis.ticketId,
          occurredAt: diagnosis.diagnosedAt,
          actor: diagnosis.actor,
          traceType: "evidence",
          requiredEvidenceIds: [],
          providedEvidenceIds: stableUnique(
            (diagnosis.diagnosis.evidenceReferences ?? []).map(({ id }) => id),
          ),
          missingEvidenceIds: [],
        });
        this.appendLifecycleTrace(
          unit,
          eventId,
          diagnosis.ticketId,
          diagnosis.actor,
          diagnosis.diagnosedAt,
          auditEvent.action,
        );
        const result: OperationalResultReference = {
          operation,
          tickets: [{
            ticketId: diagnosis.ticketId,
            operationalEventIds: [eventId],
            resultingRevision: null,
          }],
          ...(completedDiagnosis === undefined ? {} : { diagnosisId: completedDiagnosis.id }),
          lifecycleAuditEvents: [auditEvent],
        };
        unit.persistCommandResult(commandContext.commandId, requestHash, result);
        return auditEvent;
      });
    }
    return serializeTicket(diagnosis.ticketId, async () => {
      const [ticket, audits, recommendations] = await Promise.all([
        this.dependencies.tickets.get(diagnosis.ticketId),
        this.dependencies.audit.list(diagnosis.ticketId),
        this.dependencies.recommendations.list(),
      ]);
      if (diagnosis.sourceWorkflow !== undefined) {
        const [
          { customerReplyWatermarksMatch },
          { diagnosisBlockers },
          { summarizeRecommendationsForTicket },
        ] = await Promise.all([
          import("./approval-desk/diagnosis-review.js"),
          import("./approval-desk/workflow-guidance.js"),
          import("./approval-desk/workflow-read-model.js"),
        ]);
        if (ticket.revision !== diagnosis.sourceWorkflow.ticketRevision) {
          throw stale("Diagnosis ticket snapshot is stale.");
        }
        const currentCustomerReplyWatermark = customerReplyWatermarkFromAudits(audits);
        if (!customerReplyWatermarksMatch(
          diagnosis.sourceWorkflow.customerReplyWatermark,
          currentCustomerReplyWatermark,
        )) {
          throw stale("Diagnosis customer reply snapshot is stale.");
        }
        const recommendation = summarizeRecommendationsForTicket(
          ticket,
          recommendations,
          audits,
        ).latest;
        if (recommendation?.id !== diagnosis.sourceWorkflow.recommendationId) {
          throw stale("Diagnosis recommendation snapshot is stale.");
        }
        const [diagnosisBlocker] = diagnosisBlockers({
          recommendation,
          audits,
        });
        if (diagnosisBlocker !== undefined) {
          throw new DomainError(diagnosisBlocker, "INVALID_APPROVAL_FIELDS");
        }
      }
      const escalated = diagnosis.diagnosis.diagnosticState?.state === "escalated";
      const auditEvent = AuditEventSchema.parse({
        id: this.uuid(),
        timestamp: diagnosis.diagnosedAt,
        actor: diagnosis.actor,
        action: escalated ? "diagnostic-escalated" : "diagnosis-completed",
        ticketId: diagnosis.ticketId,
        before: {},
        after: {
          diagnosis: diagnosis.diagnosis,
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: customerReplyWatermarkFromAudits(audits),
        },
        rationale: escalated
          ? "Diagnosis reached a bounded ambiguity limit and was escalated for specialist review."
          : "Diagnosis completed from trusted support context.",
        knowledgeArticleIds: diagnosis.knowledgeArticleIds,
        result: "success",
      });
      const completedDiagnosis = !escalated && this.dependencies.diagnoses !== undefined
        ? completedDiagnosisFrom(auditEvent, diagnosis)
        : undefined;
      if (completedDiagnosis !== undefined) {
        await this.dependencies.diagnoses!.save(completedDiagnosis);
        try {
          await this.dependencies.audit.append(auditEvent);
        } catch (auditError) {
          try {
            await this.dependencies.diagnoses!.remove(completedDiagnosis.id);
          } catch {
            throw domainErrorWithCause(
              "Diagnosis audit failed and completed diagnosis rollback was not safe.",
              auditError,
            );
          }
          throw domainErrorWithCause(
            "Diagnosis audit failed; completed diagnosis was compensated.",
            auditError,
          );
        }
        await this.captureLearning(auditEvent, {
          diagnosisId: auditEvent.id,
          evidenceIds: (diagnosis.diagnosis.evidenceReferences ?? []).map(({ id }) => id),
        });
        return auditEvent;
      }
      await this.dependencies.audit.append(auditEvent);
      await this.captureLearning(auditEvent, {
        diagnosisId: auditEvent.id,
        evidenceIds: (diagnosis.diagnosis.evidenceReferences ?? []).map(({ id }) => id),
      });
      return auditEvent;
    });
  }

  async reviewDiagnosis(
    input: DiagnosisReviewInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const {
      DiagnosisReviewDecisionSchema,
      compareAuditCausalOrder,
      customerReplyWatermarksMatch,
      isDiagnosisStale,
      latestDiagnosisReview,
    } = await import("./approval-desk/diagnosis-review.js");
    const review = DiagnosisReviewDecisionSchema.parse(input);

    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational diagnosis reviews require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      const store = this.dependencies.operationalStore;
      const { reviewedAt: _reviewedAt, ...semanticRequest } = review;
      const operation = "review-diagnosis";
      const requestHash = canonicalRequestHash(operation, semanticRequest);
      return store.transaction((unit) => {
        const replay = unit.beginCommand(commandContext.commandId, operation, semanticRequest);
        if (replay !== "new") {
          return this.replayOperationalLifecycleAudit(replay, ["diagnosis-reviewed"]);
        }
        const snapshot = unit.readWorkflowSnapshot(review.ticketId);
        const audits = this.operationalAuditsFromSnapshot(unit, snapshot);
        if (snapshot.ticket.revision !== review.sourceTicketRevision) {
          throw stale("Diagnosis review ticket revision is stale.");
        }
        const currentConversationWatermark = customerReplyWatermarkFromSnapshot(snapshot);
        if (!customerReplyWatermarksMatch(
          review.sourceConversationWatermark,
          currentConversationWatermark,
        )) {
          throw stale("Diagnosis review conversation snapshot is stale.");
        }
        const original = audits.find(
          (event) =>
            event.id === review.diagnosisId
            && event.ticketId === review.ticketId
            && (event.action === "diagnosis-completed" || event.action === "diagnostic-escalated"),
        );
        const originalDiagnosis = DiagnosisContextSchema.safeParse(original?.after.diagnosis);
        if (original === undefined || !originalDiagnosis.success) {
          throw invalidDiagnosisReview("Diagnosis review must reference an original diagnosis audit.");
        }
        const diagnosticState = originalDiagnosis.data.diagnosticState?.state;
        if (
          review.decision !== "reject"
          && (original.action === "diagnostic-escalated"
            || diagnosticState === "ambiguous"
            || diagnosticState === "escalated")
        ) {
          throw invalidDiagnosisReview(
            "An ambiguous or escalated diagnosis cannot become authoritative.",
          );
        }
        const previousReview = latestDiagnosisReview(audits, original.id);
        const previousDiagnosis = previousReview?.editedDiagnosis ?? originalDiagnosis.data;
        if (
          review.decision === "revalidate"
          && !sameStructuredValue(review.editedDiagnosis, previousDiagnosis)
        ) {
          throw invalidDiagnosisReview(
            "Revalidation must preserve the previously reviewed diagnosis fields.",
          );
        }
        const originalSourceRevision = readNonnegativeInteger(
          original.after.sourceTicketRevision,
        ) ?? review.sourceTicketRevision;
        const originalConversationWatermark = CustomerReplyWatermarkSchema.safeParse(
          original.after.sourceConversationWatermark,
        ).data ?? conversationWatermarkAt(audits, original.id);
        const originalPosition = {
          event: original,
          index: audits.findIndex((event) => event.id === original.id),
        };
        const newerDiagnoses = audits.filter(
          (event, index) =>
            event.id !== original.id
            && (event.action === "diagnosis-completed" || event.action === "diagnostic-escalated")
            && compareAuditCausalOrder({ event, index }, originalPosition) > 0,
        );
        const staleDiagnosis = isDiagnosisStale({
          diagnosisTimestamp: original.timestamp,
          diagnosisTicketRevision: originalSourceRevision,
          diagnosisConversationWatermark: originalConversationWatermark,
          currentTicketRevision: snapshot.ticket.revision,
          latestConversationWatermark: currentConversationWatermark,
          ...(newerDiagnoses[0] === undefined
            ? {}
            : { newerDiagnosisAt: newerDiagnoses[0].timestamp }),
        });
        if (
          review.decision === "approve"
          && (staleDiagnosis.stale || newerDiagnoses.length > 0)
        ) {
          throw invalidDiagnosisReview(
            "A stale diagnosis must be re-evaluated or revalidated before approval.",
          );
        }
        if (review.decision === "revalidate" && newerDiagnoses.length > 0) {
          throw invalidDiagnosisReview("A superseded diagnosis cannot be revalidated.");
        }
        const eventId = this.uuid();
        const auditEvent = AuditEventSchema.parse({
          id: eventId,
          timestamp: review.reviewedAt,
          actor: review.actor,
          action: "diagnosis-reviewed",
          ticketId: review.ticketId,
          before: { diagnosisId: original.id, previousReview: previousReview ?? null },
          after: { diagnosisReview: review },
          rationale: review.rationale ?? (review.decision === "approve"
            ? "Diagnosis approved by the operator."
            : "Diagnosis review recorded by the operator."),
          knowledgeArticleIds: original.knowledgeArticleIds,
          result: "success",
        });
        const [sequence] = unit.allocateEventSequences(review.ticketId, 1);
        unit.appendEvent({
          id: eventId,
          ticketId: review.ticketId,
          sequence: sequence!,
          occurredAt: review.reviewedAt,
          actor: review.actor,
          action: "diagnosis-reviewed",
          commandId: commandContext.commandId,
          facts: {
            diagnosisOutcome: review.decision,
            sourceRevision: review.sourceTicketRevision,
          },
        });
        this.appendLifecycleTrace(
          unit,
          eventId,
          review.ticketId,
          review.actor,
          review.reviewedAt,
          "diagnosis-reviewed",
          `Diagnosis review decision: ${review.decision}.`,
        );
        const result: OperationalResultReference = {
          operation,
          tickets: [{
            ticketId: review.ticketId,
            operationalEventIds: [eventId],
            resultingRevision: null,
          }],
          lifecycleAuditEvents: [auditEvent],
        };
        unit.persistCommandResult(commandContext.commandId, requestHash, result);
        return auditEvent;
      });
    }

    return serializeTicket(review.ticketId, async () => {
      const [ticket, audits] = await Promise.all([
        this.dependencies.tickets.get(review.ticketId),
        this.dependencies.audit.list(review.ticketId),
      ]);
      if (ticket.revision !== review.sourceTicketRevision) {
        throw stale("Diagnosis review ticket revision is stale.");
      }
      const currentConversationWatermark = customerReplyWatermarkFromAudits(audits);
      if (
        !customerReplyWatermarksMatch(
          review.sourceConversationWatermark,
          currentConversationWatermark,
        )
      ) {
        throw stale("Diagnosis review conversation snapshot is stale.");
      }

      const original = audits.find(
        (event) =>
          event.id === review.diagnosisId &&
          event.ticketId === review.ticketId &&
          (event.action === "diagnosis-completed" ||
            event.action === "diagnostic-escalated"),
      );
      const originalDiagnosis = DiagnosisContextSchema.safeParse(
        original?.after.diagnosis,
      );
      if (original === undefined || !originalDiagnosis.success) {
        throw invalidDiagnosisReview("Diagnosis review must reference an original diagnosis audit.");
      }
      const diagnosticState = originalDiagnosis.data.diagnosticState?.state;
      if (
        review.decision !== "reject" &&
        (original.action === "diagnostic-escalated" ||
          diagnosticState === "ambiguous" ||
          diagnosticState === "escalated")
      ) {
        throw invalidDiagnosisReview(
          "An ambiguous or escalated diagnosis cannot become authoritative.",
        );
      }

      const previousReview = latestDiagnosisReview(audits, original.id);
      const previousDiagnosis = previousReview?.editedDiagnosis ?? originalDiagnosis.data;
      if (
        review.decision === "revalidate" &&
        !sameStructuredValue(review.editedDiagnosis, previousDiagnosis)
      ) {
        throw invalidDiagnosisReview(
          "Revalidation must preserve the previously reviewed diagnosis fields.",
        );
      }

      const originalSourceRevision = readNonnegativeInteger(
        original.after.sourceTicketRevision,
      ) ?? review.sourceTicketRevision;
      const originalConversationWatermark = CustomerReplyWatermarkSchema.safeParse(
        original.after.sourceConversationWatermark,
      ).data ?? conversationWatermarkAt(audits, original.id);
      const originalPosition = {
        event: original,
        index: audits.findIndex((event) => event.id === original.id),
      };
      const newerDiagnoses = audits.filter(
        (event, index) =>
          event.id !== original.id &&
          (event.action === "diagnosis-completed" ||
            event.action === "diagnostic-escalated") &&
          compareAuditCausalOrder({ event, index }, originalPosition) > 0,
      );
      const staleDiagnosis = isDiagnosisStale({
        diagnosisTimestamp: original.timestamp,
        diagnosisTicketRevision: originalSourceRevision,
        diagnosisConversationWatermark: originalConversationWatermark,
        currentTicketRevision: ticket.revision,
        latestConversationWatermark: currentConversationWatermark,
        ...(newerDiagnoses[0] === undefined
          ? {}
          : { newerDiagnosisAt: newerDiagnoses[0].timestamp }),
      });
      if (
        review.decision === "approve" &&
        (staleDiagnosis.stale || newerDiagnoses.length > 0)
      ) {
        throw invalidDiagnosisReview(
          "A stale diagnosis must be re-evaluated or revalidated before approval.",
        );
      }
      if (review.decision === "revalidate" && newerDiagnoses.length > 0) {
        throw invalidDiagnosisReview(
          "A superseded diagnosis cannot be revalidated.",
        );
      }

      const auditEvent = AuditEventSchema.parse({
        id: this.uuid(),
        timestamp: review.reviewedAt,
        actor: review.actor,
        action: "diagnosis-reviewed",
        ticketId: review.ticketId,
        before: {
          diagnosisId: original.id,
          previousReview: previousReview ?? null,
        },
        after: { diagnosisReview: review },
        rationale:
          review.rationale ??
          (review.decision === "approve"
            ? "Diagnosis approved by the operator."
            : "Diagnosis review recorded by the operator."),
        knowledgeArticleIds: original.knowledgeArticleIds,
        result: "success",
      });
      await this.dependencies.audit.append(auditEvent);
      if (review.decision === "approve") {
        await this.captureLearning(auditEvent, {
          diagnosisId: original.id,
          evidenceIds: (originalDiagnosis.data.evidenceReferences ?? []).map(({ id }) => id),
        });
      }
      return auditEvent;
    });
  }

  async recordFix(
    input: RecordFixInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const fix = RecordFixInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational fixes require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      const [auditEvent] = await this.applyDiagnosisFixValidated(
        ApplyDiagnosisFixInputSchema.parse({
          // The record-fix command resolves the authoritative diagnosis from
          // its transaction-local snapshot before any write. This placeholder
          // is never persisted or included in the semantic request.
          diagnosisId: commandContext.commandId,
          sourceTicketId: fix.ticketId,
          impactSet: {
            tickets: [{
              ticketId: fix.ticketId,
              reason: "The source ticket was explicitly selected for the legacy fix operation.",
            }],
            actor: fix.actor,
            rationale: "The legacy single-ticket fix operation selected the source ticket.",
          },
          actor: fix.actor,
          fixedAt: fix.fixedAt,
        }),
        { fix: fix.fix, knowledgeArticleIds: fix.knowledgeArticleIds },
        commandContext,
        "record-fix",
      );
      if (auditEvent === undefined) {
        throw new DomainError("A scoped fix audit was not created.", "REPOSITORY_ERROR");
      }
      return auditEvent;
    }
    const [ticket, audits] = await Promise.all([
      this.dependencies.tickets.get(fix.ticketId),
      this.dependencies.audit.list(fix.ticketId),
    ]);
    const { fixBlockers, latestAuthoritativeDiagnosis } = await import(
      "./approval-desk/workflow-guidance.js"
    );
    const [fixBlocker] = fixBlockers({ ticket, audits });
    if (fixBlocker !== undefined) {
      throw new DomainError(fixBlocker, "INVALID_APPROVAL_FIELDS");
    }
    const diagnosis = latestAuthoritativeDiagnosis(fix.ticketId, audits);
    if (diagnosis === undefined) {
      throw new DomainError(
        "An approved current diagnosis is required before marking a fix available.",
        "INVALID_APPROVAL_FIELDS",
      );
    }

    const [auditEvent] = await this.applyDiagnosisFixValidated(
      ApplyDiagnosisFixInputSchema.parse({
        diagnosisId: diagnosis.diagnosisId,
        sourceTicketId: fix.ticketId,
        impactSet: {
          tickets: [{
            ticketId: fix.ticketId,
            reason: "The source ticket was explicitly selected for the legacy fix operation.",
          }],
          actor: fix.actor,
          rationale: "The legacy single-ticket fix operation selected the source ticket.",
        },
        actor: fix.actor,
        fixedAt: fix.fixedAt,
      }),
      { fix: fix.fix, knowledgeArticleIds: fix.knowledgeArticleIds },
    );
    if (auditEvent === undefined) {
      throw new DomainError(
        "A scoped fix audit was not created.",
        "REPOSITORY_ERROR",
      );
    }
    return auditEvent;
  }

  async recordPlatformMitigation(
    input: RecordPlatformMitigationInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const eventId = z.string().trim().min(1).parse(input.eventId);
    const actor = NonBlankStringSchema.parse(input.actor);
    const recordedAt = IsoTimestampSchema.parse(input.recordedAt);
    const rationale = NonBlankStringSchema.parse(input.rationale);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational platform mitigations require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      const store = this.dependencies.operationalStore;
      const semanticRequest = {
        ticketId: input.ticketId,
        eventId,
        actor,
        rationale,
      };
      const operation = "record-platform-mitigation";
      const requestHash = canonicalRequestHash(operation, semanticRequest);
      const { summarizeRecommendationsForTicket } = await import(
        "./approval-desk/workflow-read-model.js"
      );
      return store.transaction((unit) => {
        const replay = unit.beginCommand(commandContext.commandId, operation, semanticRequest);
        if (replay !== "new") {
          return this.replayOperationalLifecycleAudit(
            replay,
            ["platform-mitigation-available"],
          );
        }
        const snapshot = unit.readWorkflowSnapshot(input.ticketId);
        const audits = this.operationalAuditsFromSnapshot(unit, snapshot);
        if (snapshot.ticket.status === "resolved") {
          throw new DomainError(
            "A resolved ticket cannot receive a platform mitigation signal.",
            "INVALID_APPROVAL_FIELDS",
          );
        }
        const knownEvent = getKnownEvent(eventId);
        if (knownEvent?.status !== "active") {
          throw new DomainError(
            "Only an active known event can receive a platform mitigation signal.",
            "INVALID_APPROVAL_FIELDS",
          );
        }
        const recommendation = summarizeRecommendationsForTicket(
          snapshot.ticket,
          snapshot.recommendations,
          audits,
        ).latest;
        if (
          recommendation?.knownEventId !== eventId
          || recommendation.supportState !== "waiting-on-platform-fix"
        ) {
          throw new DomainError(
            "The current ticket recommendation is not waiting on this platform event.",
            "INVALID_APPROVAL_FIELDS",
          );
        }
        if (audits.some((audit) =>
          audit.action === "platform-mitigation-available"
          && audit.after.eventId === eventId
        )) {
          throw new DomainError(
            "A platform mitigation signal already exists for this event.",
            "STALE_APPROVAL",
          );
        }
        const auditEvent = AuditEventSchema.parse({
          id: this.uuid(),
          timestamp: recordedAt,
          actor,
          action: "platform-mitigation-available",
          ticketId: input.ticketId,
          before: { eventId, status: knownEvent.status },
          after: { eventId, status: "available" },
          rationale,
          knowledgeArticleIds: recommendation.knowledgeArticleIds,
          result: "success",
        });
        const [sequence] = unit.allocateEventSequences(input.ticketId, 1);
        unit.appendEvent({
          id: auditEvent.id,
          ticketId: input.ticketId,
          sequence: sequence!,
          occurredAt: recordedAt,
          actor,
          action: "platform-mitigation-available",
          commandId: commandContext.commandId,
          facts: { knownEventId: eventId, outcome: "available" },
        });
        this.appendLifecycleTrace(
          unit,
          auditEvent.id,
          input.ticketId,
          actor,
          recordedAt,
          "platform-mitigation-available",
        );
        const result: OperationalResultReference = {
          operation,
          tickets: [{
            ticketId: input.ticketId,
            operationalEventIds: [auditEvent.id],
            resultingRevision: null,
          }],
          lifecycleAuditEvents: [auditEvent],
        };
        unit.persistCommandResult(commandContext.commandId, requestHash, result);
        return auditEvent;
      });
    }
    return serializeTicket(input.ticketId, async () => {
      const [ticket, audits, recommendations] = await Promise.all([
        this.dependencies.tickets.get(input.ticketId),
        this.dependencies.audit.list(input.ticketId),
        this.dependencies.recommendations.list(),
      ]);
      if (ticket.status === "resolved") {
        throw new DomainError("A resolved ticket cannot receive a platform mitigation signal.", "INVALID_APPROVAL_FIELDS");
      }
      const knownEvent = getKnownEvent(eventId);
      if (knownEvent?.status !== "active") {
        throw new DomainError("Only an active known event can receive a platform mitigation signal.", "INVALID_APPROVAL_FIELDS");
      }
      const { summarizeRecommendationsForTicket } = await import(
        "./approval-desk/workflow-read-model.js"
      );
      const recommendation = summarizeRecommendationsForTicket(
        ticket,
        recommendations,
        audits,
      ).latest;
      if (
        recommendation?.knownEventId !== eventId ||
        recommendation.supportState !== "waiting-on-platform-fix"
      ) {
        throw new DomainError(
          "The current ticket recommendation is not waiting on this platform event.",
          "INVALID_APPROVAL_FIELDS",
        );
      }
      if (audits.some((audit) =>
        audit.action === "platform-mitigation-available" &&
        audit.after.eventId === eventId,
      )) {
        throw new DomainError("A platform mitigation signal already exists for this event.", "STALE_APPROVAL");
      }
      const auditEvent = AuditEventSchema.parse({
        id: this.uuid(),
        timestamp: recordedAt,
        actor,
        action: "platform-mitigation-available",
        ticketId: input.ticketId,
        before: { eventId, status: knownEvent.status },
        after: { eventId, status: "available" },
        rationale,
        knowledgeArticleIds: recommendation.knowledgeArticleIds,
        result: "success",
      });
      await this.dependencies.audit.append(auditEvent);
      await this.captureLearning(auditEvent, { knownEventId: eventId });
      return auditEvent;
    });
  }

  /**
   * The only transition that resolves a ticket. It reloads every workflow
   * input while the ticket operation is serialized; adapters can preview the
   * guidance but cannot make the final close decision from a stale snapshot.
   */
  async closeTicket(
    input: CloseTicketInput,
    commandContext?: OperationalCommandContext,
  ): Promise<{ ticket: Ticket; auditEvent: AuditEvent }> {
    const close = CloseTicketInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational ticket closure requires an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      const store = this.dependencies.operationalStore;
      const { closedAt: _closedAt, ...semanticRequest } = close;
      const operation = "close-ticket";
      const requestHash = canonicalRequestHash(operation, semanticRequest);
      const [{ closeBlockers }, { summarizeRecommendationsForTicket }] = await Promise.all([
        import("./approval-desk/workflow-guidance.js"),
        import("./approval-desk/workflow-read-model.js"),
      ]);
      return store.transaction((unit) => {
        const replay = unit.beginCommand(commandContext.commandId, operation, semanticRequest);
        if (replay !== "new") return this.replayOperationalClosure(replay);
        const snapshot = unit.readWorkflowSnapshot(close.ticketId);
        const audits = this.operationalAuditsFromSnapshot(unit, snapshot);
        const recommendation = summarizeRecommendationsForTicket(
          snapshot.ticket,
          snapshot.recommendations,
          audits,
        ).latest;
        const [closeBlocker] = closeBlockers({
          ticket: snapshot.ticket,
          recommendation,
          audits,
        });
        if (closeBlocker !== undefined) {
          throw new DomainError(closeBlocker, "INVALID_APPROVAL_FIELDS");
        }
        if (recommendation === undefined) {
          throw new DomainError(
            "Ticket must have a ready-to-close recommendation before it can be closed.",
            "INVALID_APPROVAL_FIELDS",
          );
        }
        const updated = TicketSchema.parse({
          ...snapshot.ticket,
          status: "resolved",
          revision: snapshot.ticket.revision + 1,
          updatedAt: close.closedAt,
        });
        const auditEvent = AuditEventSchema.parse({
          id: this.uuid(),
          timestamp: close.closedAt,
          actor: close.actor,
          action: "ticket-updated",
          ticketId: close.ticketId,
          recommendationId: recommendation.id,
          before: { status: snapshot.ticket.status, revision: snapshot.ticket.revision },
          after: {
            status: updated.status,
            revision: updated.revision,
            closedAt: close.closedAt,
          },
          rationale:
            "Ticket closed after the customer confirmed resolution and the closing response was sent.",
          knowledgeArticleIds: recommendation.knowledgeArticleIds,
          result: "success",
        });
        const [sequence] = unit.allocateEventSequences(close.ticketId, 1);
        unit.appendEvent({
          id: auditEvent.id,
          ticketId: close.ticketId,
          sequence: sequence!,
          occurredAt: close.closedAt,
          actor: close.actor,
          action: "ticket-updated",
          commandId: commandContext.commandId,
          facts: {
            status: "resolved",
            expectedRevision: snapshot.ticket.revision,
            revision: updated.revision,
            verificationType: "customer-confirmed",
          },
        });
        unit.updateTicket(updated, snapshot.ticket.revision);
        unit.appendTicketRevision({
          ticketId: updated.id,
          revision: updated.revision,
          ticket: updated,
          operationalEventId: auditEvent.id,
          createdAt: close.closedAt,
        });
        this.appendLifecycleTrace(
          unit,
          auditEvent.id,
          close.ticketId,
          close.actor,
          close.closedAt,
          "ticket-closed",
        );
        const result: OperationalResultReference = {
          operation,
          tickets: [{
            ticketId: close.ticketId,
            operationalEventIds: [auditEvent.id],
            resultingRevision: updated.revision,
          }],
          ticketSnapshot: updated,
          lifecycleAuditEvents: [auditEvent],
        };
        unit.persistCommandResult(commandContext.commandId, requestHash, result);
        return { ticket: updated, auditEvent };
      });
    }
    return serializeTicket(close.ticketId, async () => {
      const [ticket, audits, recommendations] = await Promise.all([
        this.dependencies.tickets.get(close.ticketId),
        this.dependencies.audit.list(close.ticketId),
        this.dependencies.recommendations.list(),
      ]);
      const [{ closeBlockers }, { summarizeRecommendationsForTicket }] = await Promise.all([
        import("./approval-desk/workflow-guidance.js"),
        import("./approval-desk/workflow-read-model.js"),
      ]);
      const recommendation = summarizeRecommendationsForTicket(
        ticket,
        recommendations,
        audits,
      ).latest;
      const [closeBlocker] = closeBlockers({
        ticket,
        recommendation,
        audits,
      });
      if (closeBlocker !== undefined) {
        throw new DomainError(closeBlocker, "INVALID_APPROVAL_FIELDS");
      }
      if (recommendation === undefined) {
        throw new DomainError(
          "Ticket must have a ready-to-close recommendation before it can be closed.",
          "INVALID_APPROVAL_FIELDS",
        );
      }

      const { ticket: updated, result: auditEvent } =
        await this.dependencies.tickets.updateWithCommit(
          close.ticketId,
          ticket.revision,
          (current) => ({
            ...current,
            status: "resolved",
            updatedAt: close.closedAt,
          }),
          async (updatedTicket, previousTicket) => {
            const event = AuditEventSchema.parse({
              id: this.uuid(),
              timestamp: close.closedAt,
              actor: close.actor,
              action: "ticket-updated",
              ticketId: close.ticketId,
              recommendationId: recommendation.id,
              before: {
                status: previousTicket.status,
                revision: previousTicket.revision,
              },
              after: {
                status: updatedTicket.status,
                revision: updatedTicket.revision,
                closedAt: close.closedAt,
              },
              rationale:
                "Ticket closed after the customer confirmed resolution and the closing response was sent.",
              knowledgeArticleIds: recommendation.knowledgeArticleIds,
              result: "success",
            });
            await this.dependencies.audit.append(event);
            return event;
          },
        );
      const latestDiagnosis = (await import("./approval-desk/workflow-guidance.js")).latestAuthoritativeDiagnosis(close.ticketId, audits);
      await this.captureLearning(auditEvent, {
        ...(latestDiagnosis === undefined ? {} : { diagnosisId: latestDiagnosis.diagnosisId }),
        verificationType: "customer-confirmed",
      });
      return { ticket: updated, auditEvent };
    });
  }

  async applyDiagnosisFix(
    input: ApplyDiagnosisFixInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent[]> {
    const parsed = ApplyDiagnosisFixInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined && commandContext === undefined) {
      throw new DomainError(
        "Operational scoped fixes require an explicit command context.",
        "REPOSITORY_ERROR",
      );
    }
    return this.applyDiagnosisFixValidated(
      parsed,
      undefined,
      commandContext,
      "apply-diagnosis-fix",
    );
  }

  private async applyDiagnosisFixValidated(
    input: z.infer<typeof ApplyDiagnosisFixInputSchema>,
    legacy?: { fix: FixContext; knowledgeArticleIds: string[] },
    commandContext?: OperationalCommandContext,
    operation = "apply-diagnosis-fix",
  ): Promise<AuditEvent[]> {
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational scoped fixes require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      const store = this.dependencies.operationalStore;
      const { fixedAt: _fixedAt, ...scopedSemanticRequest } = input;
      const semanticRequest = operation === "record-fix" && legacy !== undefined
        ? {
            ticketId: input.sourceTicketId,
            actor: input.actor,
            fix: legacy.fix,
            knowledgeArticleIds: legacy.knowledgeArticleIds,
          }
        : scopedSemanticRequest;
      const requestHash = canonicalRequestHash(operation, semanticRequest);
      const { fixBlockers, latestAuthoritativeDiagnosis } = await import(
        "./approval-desk/workflow-guidance.js"
      );
      const { fixContextForTicket } = await import(
        "./approval-desk/diagnostic-workflow.js"
      );
      return store.transaction((unit) => {
        const replay = unit.beginCommand(commandContext.commandId, operation, semanticRequest);
        if (replay !== "new") {
          return this.replayOperationalLifecycleAudits(replay, "fix-available");
        }
        const ticketIds = input.impactSet.tickets.map(({ ticketId }) => ticketId);
        const snapshots = ticketIds.map((ticketId) => unit.readWorkflowSnapshot(ticketId));
        const snapshotByTicket = new Map(snapshots.map((snapshot) => [snapshot.ticket.id, snapshot]));
        const selectedTickets = snapshots.map(({ ticket }) => ticket);
        const sourceSnapshot = snapshotByTicket.get(input.sourceTicketId);
        if (sourceSnapshot === undefined) {
          throw new DomainError(
            "The source ticket must be explicitly selected in the impact set.",
            "INVALID_APPROVAL_FIELDS",
          );
        }
        const closedTicket = selectedTickets.find((ticket) => ticket.status === "resolved");
        if (closedTicket !== undefined) {
          throw new DomainError(
            "A fix cannot be applied to a closed ticket.",
            "INVALID_APPROVAL_FIELDS",
          );
        }
        const auditsByTicket = new Map(snapshots.map((snapshot) => [
          snapshot.ticket.id,
          this.operationalAuditsFromSnapshot(unit, snapshot),
        ] as const));
        const sourceAudits = auditsByTicket.get(input.sourceTicketId) ?? [];
        assertFixTimestampIsCurrent(input.fixedAt, [...auditsByTicket.values()].flat());
        const diagnosis = latestAuthoritativeDiagnosis(input.sourceTicketId, sourceAudits);
        const diagnosisId = operation === "record-fix"
          ? diagnosis?.diagnosisId
          : input.diagnosisId;
        const [fixBlocker] = fixBlockers({
          ticket: sourceSnapshot.ticket,
          audits: sourceAudits,
          ...(diagnosisId === undefined ? {} : { diagnosisId }),
        });
        if (fixBlocker !== undefined) {
          throw new DomainError(fixBlocker, "INVALID_APPROVAL_FIELDS");
        }
        if (diagnosis === undefined || diagnosis.diagnosisId !== diagnosisId) {
          throw new DomainError(
            "An approved current diagnosis is required before marking a fix available.",
            "INVALID_APPROVAL_FIELDS",
          );
        }
        const payload = DiagnosisScopedFixAuditPayloadSchema.parse({
          diagnosisId,
          sourceTicketId: input.sourceTicketId,
          impactSet: input.impactSet,
          fix: legacy?.fix ?? fixContextForTicket(diagnosis.reviewAudit),
        });
        const auditEvents = input.impactSet.tickets.map((selectedTicket) =>
          AuditEventSchema.parse({
            id: this.uuid(),
            timestamp: input.fixedAt,
            actor: input.actor,
            action: "fix-available",
            ticketId: selectedTicket.ticketId,
            before: { diagnosisId, sourceTicketId: input.sourceTicketId },
            after: payload,
            rationale:
              `Fix or mitigation is available for customer verification. `
              + `Impact selection: ${selectedTicket.reason}`,
            knowledgeArticleIds:
              legacy?.knowledgeArticleIds ?? diagnosis.originalDiagnosis.knowledgeArticleIds,
            result: "success",
          })
        );
        for (const auditEvent of auditEvents) {
          const [sequence] = unit.allocateEventSequences(auditEvent.ticketId, 1);
          unit.appendEvent({
            id: auditEvent.id,
            ticketId: auditEvent.ticketId,
            sequence: sequence!,
            occurredAt: auditEvent.timestamp,
            actor: auditEvent.actor,
            action: "fix-available",
            commandId: commandContext.commandId,
            facts: {
              diagnosisOutcome: "approved",
              outcome: "available",
            },
          });
          this.appendLifecycleTrace(
            unit,
            auditEvent.id,
            auditEvent.ticketId,
            auditEvent.actor,
            auditEvent.timestamp,
            "fix-available",
          );
        }
        const result: OperationalResultReference = {
          operation,
          tickets: input.impactSet.tickets.map(({ ticketId }, index) => ({
            ticketId,
            operationalEventIds: [auditEvents[index]!.id],
            resultingRevision: null,
          })),
          lifecycleAuditEvents: auditEvents,
        };
        unit.persistCommandResult(commandContext.commandId, requestHash, result);
        return auditEvents;
      });
    }
    const ticketIds = input.impactSet.tickets.map(({ ticketId }) => ticketId);
    return serializeTickets(ticketIds, async () => {
      const selectedTickets = await Promise.all(
        ticketIds.map((ticketId) => this.dependencies.tickets.get(ticketId)),
      );
      const sourceTicket = selectedTickets.find(
        (ticket) => ticket.id === input.sourceTicketId,
      );
      if (sourceTicket === undefined) {
        throw new DomainError(
          "The source ticket must be explicitly selected in the impact set.",
          "INVALID_APPROVAL_FIELDS",
        );
      }
      const closedTicket = selectedTickets.find(
        (ticket) => ticket.status === "resolved",
      );
      if (closedTicket !== undefined) {
        throw new DomainError(
          "A fix cannot be applied to a closed ticket.",
          "INVALID_APPROVAL_FIELDS",
        );
      }

      const auditsByTicket = new Map(
        await Promise.all(
          ticketIds.map(async (ticketId) => [
            ticketId,
            await this.dependencies.audit.list(ticketId),
          ] as const),
        ),
      );
      const sourceAudits = auditsByTicket.get(input.sourceTicketId) ?? [];
      assertFixTimestampIsCurrent(
        input.fixedAt,
        [...auditsByTicket.values()].flat(),
      );
      const { fixBlockers, latestAuthoritativeDiagnosis } = await import(
        "./approval-desk/workflow-guidance.js"
      );
      const [fixBlocker] = fixBlockers({
        ticket: sourceTicket,
        audits: sourceAudits,
        diagnosisId: input.diagnosisId,
      });
      if (fixBlocker !== undefined) {
        throw new DomainError(fixBlocker, "INVALID_APPROVAL_FIELDS");
      }
      const diagnosis = latestAuthoritativeDiagnosis(
        input.sourceTicketId,
        sourceAudits,
      );
      if (diagnosis?.diagnosisId !== input.diagnosisId) {
        throw new DomainError(
          "An approved current diagnosis is required before marking a fix available.",
          "INVALID_APPROVAL_FIELDS",
        );
      }

      const { fixContextForTicket } = await import(
        "./approval-desk/diagnostic-workflow.js"
      );
      const payload = DiagnosisScopedFixAuditPayloadSchema.parse({
        diagnosisId: input.diagnosisId,
        sourceTicketId: input.sourceTicketId,
        impactSet: input.impactSet,
        fix:
          legacy?.fix ??
          fixContextForTicket(diagnosis.reviewAudit),
      });
      const events = input.impactSet.tickets.map((selectedTicket) =>
        AuditEventSchema.parse({
          id: this.uuid(),
          timestamp: input.fixedAt,
          actor: input.actor,
          action: "fix-available",
          ticketId: selectedTicket.ticketId,
          before: {
            diagnosisId: input.diagnosisId,
            sourceTicketId: input.sourceTicketId,
          },
          after: payload,
          rationale:
            `Fix or mitigation is available for customer verification. ` +
            `Impact selection: ${selectedTicket.reason}`,
          knowledgeArticleIds:
            legacy?.knowledgeArticleIds ?? diagnosis.originalDiagnosis.knowledgeArticleIds,
          result: "success",
        }),
      );
      await this.dependencies.audit.appendBatch(events);
      const evidenceIds: string[] = [];
      await Promise.all(events.map((event) => this.captureLearning(event, {
        diagnosisId: input.diagnosisId,
        evidenceIds,
      })));
      return events;
    });
  }

  private operationalAuditsFromSnapshot(
    unit: OperationalUnitOfWork,
    snapshot: OperationalWorkflowSnapshot,
  ): AuditEvent[] {
    return snapshot.events.flatMap((event) => {
      const lifecycleAudit = unit.readCommandResult(event.commandId)
        ?.lifecycleAuditEvents?.find(({ id }) => id === event.id);
      if (lifecycleAudit !== undefined) {
        return [AuditEventSchema.parse(lifecycleAudit)];
      }
      return operationalConversationAuditsForEventIds(snapshot, [event.id]);
    });
  }

  private replayOperationalLifecycleAudits(
    replay: CommandReplay,
    expectedAction: AuditEvent["action"],
  ): AuditEvent[] {
    const audits = replay.result.lifecycleAuditEvents?.map((event) =>
      AuditEventSchema.parse(event)
    );
    if (
      audits === undefined
      || audits.length !== replay.result.tickets.length
      || audits.some(({ action }) => action !== expectedAction)
    ) {
      throw stale("Operational lifecycle replay is missing its persisted audit result.");
    }
    return audits;
  }

  private replayOperationalLifecycleAudit(
    replay: CommandReplay,
    expectedActions: readonly AuditEvent["action"][],
  ): AuditEvent {
    const audits = replay.result.lifecycleAuditEvents?.map((event) =>
      AuditEventSchema.parse(event)
    );
    const audit = audits?.[0];
    if (
      audit === undefined
      || audits?.length !== 1
      || !expectedActions.includes(audit.action)
    ) {
      throw stale("Operational lifecycle replay is missing its persisted audit result.");
    }
    return audit;
  }

  private replayOperationalClosure(
    replay: CommandReplay,
  ): { ticket: Ticket; auditEvent: AuditEvent } {
    const ticket = replay.result.ticketSnapshot;
    if (ticket === undefined) {
      throw stale("Operational closure replay is missing its persisted ticket snapshot.");
    }
    return {
      ticket: TicketSchema.parse(ticket),
      auditEvent: this.replayOperationalLifecycleAudit(replay, ["ticket-updated"]),
    };
  }

  async supersedeRecommendation(
    input: SupersedeRecommendationInput,
    commandContext?: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const supersession = SupersedeRecommendationInputSchema.parse(input);
    if (this.dependencies.operationalStore !== undefined) {
      if (commandContext === undefined) {
        throw new DomainError(
          "Operational recommendation supersessions require an explicit command context.",
          "REPOSITORY_ERROR",
        );
      }
      return this.transitionOperationalRecommendation(
        "supersede-recommendation",
        supersession,
        "pending",
        "superseded",
        "recommendation-superseded",
        supersession.reason,
        supersession.supersededAt,
        commandContext,
      );
    }
    return serializeTicket(supersession.ticketId, () =>
      serializeRecommendation(supersession.recommendationId, () =>
        this.supersedeRecommendationValidated(supersession),
      ),
    );
  }

  private async supersedePendingRecommendationsWithNewerReply(input: {
    ticketId: TicketId;
    actor: string;
    supersededAt: string;
  }): Promise<TriageRecommendation[]> {
    const [audits, storedRecommendations] = await Promise.all([
      this.dependencies.audit.list(input.ticketId),
      this.dependencies.recommendations.list(),
    ]);
    let recommendations = [...storedRecommendations];
    for (const recommendation of recommendations.filter(
      (candidate) =>
        candidate.ticketId === input.ticketId &&
        candidate.resolution === "pending" &&
        hasCustomerReplyAfterRecommendation(audits, candidate),
    )) {
      await serializeRecommendation(recommendation.id, () =>
        this.supersedeRecommendationValidated({
          recommendationId: recommendation.id,
          ticketId: input.ticketId,
          actor: input.actor,
          supersededAt: input.supersededAt,
          reason: NEWER_REPLY_SUPERSESSION_REASON,
        }),
      );
      recommendations = recommendations.map((candidate) =>
        candidate.id === recommendation.id
          ? TriageRecommendationSchema.parse({
              ...candidate,
              resolution: "superseded",
            })
          : candidate,
      );
    }
    return recommendations;
  }

  private async approveValidated(
    approval: Approval,
  ): Promise<{ ticket: Ticket; auditEvent: AuditEvent }> {
    const recommendation = await this.dependencies.recommendations.get(
      approval.recommendationId,
    );
    if (
      recommendation.resolution !== "pending" ||
      recommendation.ticketId !== approval.ticketId
    ) {
      const error = stale("Recommendation cannot be applied.");
      await this.appendApprovalRejectedAudit(approval, recommendation, error);
      throw error;
    }

    const ticketBefore = await this.dependencies.tickets.get(
      recommendation.ticketId,
    );
    if (
      ticketBefore.revision !== approval.expectedRevision ||
      recommendation.sourceRevision !== approval.expectedRevision
    ) {
      const error = stale("Approval revision is stale.");
      await this.appendApprovalRejectedAudit(approval, recommendation, error);
      throw error;
    }

    validateApprovedFields(recommendation, approval.approvedFields);
    const decision = evaluateEscalation(
      recommendation,
      this.now(),
      ticketBefore,
    );
    const resultingTeam = approval.approvedFields.includes("team")
      ? approvedFieldValue(recommendation, approval, "team")
      : ticketBefore.team;
    if (
      decision.requiredTeam !== undefined &&
      resultingTeam !== decision.requiredTeam
    ) {
      throw new DomainError(
        `Resulting ticket must route to ${decision.requiredTeam}.`,
        "INVALID_APPROVAL_FIELDS",
      );
    }

    const { before, after } = approvedValues(
      ticketBefore,
      recommendation,
      approval,
    );
    const auditEvent = AuditEventSchema.parse({
      id: this.uuid(),
      timestamp: approval.approvedAt,
      actor: approval.actor,
      action: "recommendation-approved",
      ticketId: ticketBefore.id,
      recommendationId: recommendation.id,
      before,
      after,
      rationale: recommendation.rationale,
      knowledgeArticleIds: recommendation.knowledgeArticleIds,
      result: "success",
    });

    // An approval that only authorizes an outbound response, or repeats the
    // ticket's existing triage values, does not change ticket state or
    // evidence. Keeping the ticket revision stable lets an already-reviewed
    // diagnosis remain current until customer context or an actual ticket
    // field changes.
    const changesTicket = approval.approvedFields.some(
      (field) =>
        field !== "customerResponse" &&
        !sameStructuredValue(before[field], after[field]),
    );
    if (!changesTicket && approval.approvedFields.includes("customerResponse")) {
      await this.dependencies.recommendations.transitionResolution(
        recommendation.id,
        "pending",
        "approved",
      );
      try {
        await this.dependencies.audit.append(auditEvent);
      } catch (auditError) {
        try {
          await this.dependencies.recommendations.transitionResolution(
            recommendation.id,
            "approved",
            "pending",
          );
        } catch {
          throw domainErrorWithCause(
            "Approval audit failed and recommendation rollback was not safe.",
            auditError,
          );
        }
        throw domainErrorWithCause(
          "Approval audit failed; recommendation was compensated.",
          auditError,
        );
      }
      return { ticket: ticketBefore, auditEvent };
    }

    const { ticket: updated, result: committedAuditEvent } =
      await this.dependencies.tickets.updateWithCommit(
        ticketBefore.id,
        approval.expectedRevision,
        (ticket) =>
          applyApprovedFields(
            ticket,
            recommendation,
            approval,
            approval.approvedAt,
          ),
        async () => {
          await this.dependencies.recommendations.transitionResolution(
            recommendation.id,
            "pending",
            "approved",
          );
          try {
            await this.dependencies.audit.append(auditEvent);
          } catch (auditError) {
            try {
              await this.dependencies.recommendations.transitionResolution(
                recommendation.id,
                "approved",
                "pending",
              );
            } catch {
              throw domainErrorWithCause(
                "Approval audit failed and recommendation rollback was not safe.",
                auditError,
              );
            }
            throw domainErrorWithCause(
              "Approval audit failed; recommendation was compensated.",
              auditError,
            );
          }
          return auditEvent;
        },
      );

    return { ticket: updated, auditEvent: committedAuditEvent };
  }

  private async markResponseSentValidated(
    sent: MarkResponseSentInput,
  ): Promise<AuditEvent> {
    const recommendation = await this.dependencies.recommendations.get(
      sent.recommendationId,
    );
    if (
      recommendation.resolution !== "approved" ||
      recommendation.ticketId !== sent.ticketId
    ) {
      throw stale("Approved customer response cannot be marked sent.");
    }

    const auditEvent = AuditEventSchema.parse({
      id: this.uuid(),
      timestamp: sent.sentAt,
      actor: sent.actor,
      action: "customer-response-sent",
      ticketId: sent.ticketId,
      recommendationId: recommendation.id,
      before: {},
      after: {
        sentAt: sent.sentAt,
        customerResponse: sent.customerResponse,
      },
      rationale: "Approved customer response was sent.",
      knowledgeArticleIds: recommendation.knowledgeArticleIds,
      result: "success",
    });
    await this.dependencies.audit.append(auditEvent);
    return auditEvent;
  }

  private async appendApprovalRejectedAudit(
    approval: Approval,
    recommendation: TriageRecommendation,
    error: DomainError,
  ): Promise<void> {
    try {
      await this.dependencies.audit.append(
        AuditEventSchema.parse({
          id: this.uuid(),
          timestamp: approval.approvedAt,
          actor: approval.actor,
          action: "approval-rejected",
          ticketId: recommendation.ticketId,
          recommendationId: recommendation.id,
          before: {
            expectedRevision: approval.expectedRevision,
            sourceRevision: recommendation.sourceRevision,
            resolution: recommendation.resolution,
          },
          after: {},
          rationale: error.message,
          knowledgeArticleIds: recommendation.knowledgeArticleIds,
          result: "rejected",
          rejectionReason: error.message,
        }),
      );
    } catch {
      // Rejected approval telemetry is best-effort; keep the original stale error.
    }
  }

  private async rejectValidated(
    rejection: RejectRecommendationInput,
  ): Promise<AuditEvent> {
    const recommendation = await this.dependencies.recommendations.get(
      rejection.recommendationId,
    );
    if (
      recommendation.resolution !== "pending" ||
      recommendation.ticketId !== rejection.ticketId
    ) {
      throw stale("Recommendation cannot be rejected.");
    }
    await this.dependencies.tickets.get(rejection.ticketId);

    const auditEvent = AuditEventSchema.parse({
      id: this.uuid(),
      timestamp: rejection.rejectedAt,
      actor: rejection.actor,
      action: "recommendation-rejected",
      ticketId: rejection.ticketId,
      recommendationId: recommendation.id,
      before: { resolution: "pending" },
      after: { resolution: "rejected" },
      rationale: rejection.feedback,
      knowledgeArticleIds: recommendation.knowledgeArticleIds,
      result: "success",
    });

    await this.dependencies.recommendations.transitionResolution(
      recommendation.id,
      "pending",
      "rejected",
    );
    try {
      await this.dependencies.audit.append(auditEvent);
    } catch (auditError) {
      try {
        await this.dependencies.recommendations.transitionResolution(
          recommendation.id,
          "rejected",
          "pending",
        );
      } catch {
        throw domainErrorWithCause(
          "Rejection audit failed and recommendation rollback was not safe.",
          auditError,
        );
      }
      throw domainErrorWithCause(
        "Rejection audit failed; recommendation was compensated.",
        auditError,
      );
    }
    return auditEvent;
  }

  private async cancelApprovalValidated(
    cancellation: CancelApprovalInput,
  ): Promise<AuditEvent> {
    const recommendation = await this.dependencies.recommendations.get(
      cancellation.recommendationId,
    );
    if (
      recommendation.resolution !== "approved" ||
      recommendation.ticketId !== cancellation.ticketId
    ) {
      throw stale("Approved recommendation cannot be canceled.");
    }
    await this.dependencies.tickets.get(cancellation.ticketId);

    const auditEvent = AuditEventSchema.parse({
      id: this.uuid(),
      timestamp: cancellation.canceledAt,
      actor: cancellation.actor,
      action: "recommendation-canceled",
      ticketId: cancellation.ticketId,
      recommendationId: recommendation.id,
      before: { resolution: "approved" },
      after: { resolution: "canceled" },
      rationale: cancellation.reason,
      knowledgeArticleIds: recommendation.knowledgeArticleIds,
      result: "success",
    });

    await this.dependencies.recommendations.transitionResolution(
      recommendation.id,
      "approved",
      "canceled",
    );
    try {
      await this.dependencies.audit.append(auditEvent);
    } catch (auditError) {
      try {
        await this.dependencies.recommendations.transitionResolution(
          recommendation.id,
          "canceled",
          "approved",
        );
      } catch {
        throw domainErrorWithCause(
          "Cancellation audit failed and recommendation rollback was not safe.",
          auditError,
        );
      }
      throw domainErrorWithCause(
        "Cancellation audit failed; recommendation was compensated.",
        auditError,
      );
    }
    return auditEvent;
  }

  private async supersedeRecommendationValidated(
    supersession: SupersedeRecommendationInput,
  ): Promise<AuditEvent> {
    const recommendation = await this.dependencies.recommendations.get(
      supersession.recommendationId,
    );
    if (
      recommendation.resolution !== "pending" ||
      recommendation.ticketId !== supersession.ticketId
    ) {
      throw stale("Pending recommendation cannot be superseded.");
    }

    const auditEvent = AuditEventSchema.parse({
      id: this.uuid(),
      timestamp: supersession.supersededAt,
      actor: supersession.actor,
      action: "recommendation-superseded",
      ticketId: supersession.ticketId,
      recommendationId: recommendation.id,
      before: { resolution: "pending" },
      after: { resolution: "superseded" },
      rationale: supersession.reason,
      knowledgeArticleIds: recommendation.knowledgeArticleIds,
      result: "success",
    });

    await this.dependencies.recommendations.transitionResolution(
      recommendation.id,
      "pending",
      "superseded",
    );
    try {
      await this.dependencies.audit.append(auditEvent);
    } catch (auditError) {
      try {
        await this.dependencies.recommendations.transitionResolution(
          recommendation.id,
          "superseded",
          "pending",
        );
      } catch {
        throw domainErrorWithCause(
          "Supersession audit failed and recommendation rollback was not safe.",
          auditError,
        );
      }
      throw domainErrorWithCause(
        "Supersession audit failed; recommendation was compensated.",
        auditError,
      );
    }
    return auditEvent;
  }
}

function completedDiagnosisFrom(
  event: AuditEvent,
  input: z.infer<typeof RecordDiagnosisInputSchema>,
): CompletedDiagnosis {
  return {
    id: `diagnosis-${event.id}`,
    ticketId: input.ticketId,
    problem: input.diagnosis.customerSafeSummary,
    symptoms: [input.diagnosis.causeType, ...input.diagnosis.evidenceUsed],
    evidenceUsed: input.diagnosis.evidenceUsed,
    evidenceReferences: input.diagnosis.evidenceReferences ?? [],
    ownerTeam: completedDiagnosisOwner(input.diagnosis.owner),
    fixSteps: ["Apply the completed diagnosis next action through the governed support workflow."],
    verificationSteps: ["Confirm the customer-safe outcome after the governed next action."],
    completedAt: input.diagnosedAt,
  };
}

function completedDiagnosisOwner(owner: DiagnosisContext["owner"]): Team {
  if (owner === "engineering") return "api-platform";
  if (owner === "integration-partner") return "integrations";
  return "support";
}

/** Explicit compatibility result for adapters that still expose AuditEvent. */
function operationalCustomerReplyAudit(
  message: ConversationMessage,
  ticket: Ticket,
  actor: string,
): AuditEvent {
  return AuditEventSchema.parse({
    // Canonical message IDs are the reply watermark. Imported legacy messages
    // retain their source audit ID here by using that ID as the message ID.
    id: message.id,
    timestamp: message.createdAt,
    actor,
    action: "customer-reply-received",
    ticketId: ticket.id,
    before: {},
    after: { body: message.body },
    rationale: "Customer reply added to ticket conversation.",
    knowledgeArticleIds: [],
    result: "success",
  });
}

function validateOperationalApproval(
  recommendation: TriageRecommendation,
  ticket: Ticket,
  approval: Approval,
  now: Date,
): void {
  validateApprovedFields(recommendation, approval.approvedFields);
  const decision = evaluateEscalation(recommendation, now, ticket);
  const resultingTeam = approval.approvedFields.includes("team")
    ? approvedFieldValue(recommendation, approval, "team")
    : ticket.team;
  if (
    decision.requiredTeam !== undefined
    && resultingTeam !== decision.requiredTeam
  ) {
    throw new DomainError(
      `Resulting ticket must route to ${decision.requiredTeam}.`,
      "INVALID_APPROVAL_FIELDS",
    );
  }
}

function recommendationAfterApproval(
  recommendation: TriageRecommendation,
  approval: Approval,
): TriageRecommendation {
  return TriageRecommendationSchema.parse({
    ...recommendation,
    resolution: "approved",
    ...(approval.approvedFields.includes("customerResponse")
      ? {
          draftCustomerResponse:
            approval.editedCustomerResponse ?? recommendation.draftCustomerResponse,
        }
      : {}),
  });
}

function approvedTicketProjection(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  approval: Approval,
): Ticket {
  const { before, after } = approvedValues(ticket, recommendation, approval);
  const changesTicket = approval.approvedFields.some(
    (field) => field !== "customerResponse"
      && !sameStructuredValue(before[field], after[field]),
  );
  if (!changesTicket) return ticket;
  return TicketSchema.parse({
    ...applyApprovedFields(ticket, recommendation, approval, approval.approvedAt),
    revision: ticket.revision + 1,
  });
}

type OperationalApprovalFactValue = string | number | boolean | OperationalApprovalFactValue[];

function operationalApprovalFacts(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  approval: Approval,
): Record<string, unknown> {
  const values = approvedValues(ticket, recommendation, approval);
  const fields = approval.approvedFields.filter((field) => field !== "customerResponse");
  return {
    approvedFields: approval.approvedFields,
    evidence: fields.map((field) => [field, encodeApprovalFact(values.before[field])]),
    recommendationFields: fields.map((field) => [field, encodeApprovalFact(values.after[field])]),
  };
}

function encodeApprovalFact(value: unknown): OperationalApprovalFactValue {
  if (value === null) return "__null__";
  if (value === undefined) return "__undefined__";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(encodeApprovalFact);
  throw new DomainError("Approved field value cannot be persisted safely.", "INVALID_APPROVAL_FIELDS");
}

function decodeApprovalFact(value: unknown): unknown {
  if (value === "__null__") return null;
  if (value === "__undefined__") return undefined;
  if (Array.isArray(value)) return value.map(decodeApprovalFact);
  return value;
}

function approvalAuditValues(
  event: OperationalWorkflowSnapshot["events"][number],
  recommendation: TriageRecommendation,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const payload = event.facts.recommendationFields;
  const record = typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const before = approvalFactPairs(record.evidence);
  const after = approvalFactPairs(record.recommendationFields);
  const approvedFields = Array.isArray(record.approvedFields)
    ? record.approvedFields.filter((field): field is ApprovedField =>
        typeof field === "string" && ApprovedFieldSchema.safeParse(field).success)
    : [];
  if (approvedFields.includes("customerResponse")) {
    before.customerResponse = null;
    after.customerResponse = recommendation.draftCustomerResponse;
  }
  return { before, after };
}

function approvalFactPairs(value: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!Array.isArray(value)) return result;
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string") continue;
    if (!ApprovedFieldSchema.safeParse(pair[0]).success || pair[0] === "customerResponse") continue;
    result[pair[0]] = decodeApprovalFact(pair[1]);
  }
  return result;
}

function assertOperationalResponseMayBeSent(
  recommendation: TriageRecommendation | undefined,
  sent: MarkResponseSentInput,
): asserts recommendation is TriageRecommendation {
  if (
    recommendation === undefined
    || recommendation.resolution !== "approved"
    || recommendation.ticketId !== sent.ticketId
  ) {
    throw stale("Approved customer response cannot be marked sent.");
  }
  if (recommendation.draftCustomerResponse !== sent.customerResponse) {
    throw new DomainError(
      "Sent customer response must match the approved customer response.",
      "INVALID_APPROVAL_FIELDS",
    );
  }
}

function assertOperationalResponseNotAlreadySent(
  snapshot: OperationalWorkflowSnapshot,
  recommendationId: string,
): void {
  if (snapshot.messages.some(
    (message) => message.kind === "support"
      && message.recommendationId === recommendationId,
  )) {
    throw stale("Customer response has already been marked sent.");
  }
}

function operationalRecommendationLifecycleAudit(
  event: OperationalWorkflowSnapshot["events"][number],
  recommendation: TriageRecommendation,
  expectedResolution: TriageRecommendation["resolution"],
  resultingResolution: TriageRecommendation["resolution"],
  rationale: string,
): AuditEvent {
  const approvalValues = event.action === "recommendation-approved"
    ? approvalAuditValues(event, recommendation)
    : undefined;
  return AuditEventSchema.parse({
    id: event.id,
    timestamp: event.occurredAt,
    actor: event.actor,
    action: event.action,
    ticketId: event.ticketId,
    recommendationId: recommendation.id,
    before: approvalValues?.before ?? { resolution: expectedResolution },
    after: approvalValues?.after ?? { resolution: resultingResolution },
    rationale,
    knowledgeArticleIds: recommendation.knowledgeArticleIds,
    result: "success",
  });
}

function operationalSupportResponseAudit(
  event: OperationalWorkflowSnapshot["events"][number],
  message: ConversationMessage,
  recommendation: TriageRecommendation,
): AuditEvent {
  return AuditEventSchema.parse({
    id: event.id,
    timestamp: event.occurredAt,
    actor: event.actor,
    action: "customer-response-sent",
    ticketId: event.ticketId,
    recommendationId: recommendation.id,
    before: {},
    after: {
      sentAt: message.createdAt,
      customerResponse: message.body,
    },
    rationale: "Approved customer response was sent.",
    knowledgeArticleIds: recommendation.knowledgeArticleIds,
    result: "success",
  });
}

function operationalTransitionStaleMessage(
  action: "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
): string {
  if (action === "recommendation-rejected") return "Recommendation cannot be rejected.";
  if (action === "recommendation-canceled") return "Approved recommendation cannot be canceled.";
  return "Pending recommendation cannot be superseded.";
}

function operationalExpectedResolution(
  action: "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
): TriageRecommendation["resolution"] {
  return action === "recommendation-canceled" ? "approved" : "pending";
}

function operationalConversationAuditsForEventIds(
  snapshot: OperationalWorkflowSnapshot,
  eventIds: readonly string[],
): AuditEvent[] {
  const includedEventIds = new Set(eventIds);
  const persistedEventIds = snapshot.events
    .filter(({ id }) => includedEventIds.has(id))
    .map(({ id }) => id);
  if (
    persistedEventIds.length !== eventIds.length
    || persistedEventIds.some((id, index) => id !== eventIds[index])
  ) {
    throw stale("Operational pre-send audit replay is missing its causal events.");
  }
  return snapshot.events.flatMap((event) => {
    if (!includedEventIds.has(event.id)) return [];
    const message = snapshot.messages.find(
      ({ operationalEventId }) => operationalEventId === event.id,
    );
    if (message?.kind === "customer") {
      return [operationalCustomerReplyAudit(message, snapshot.ticket, event.actor)];
    }
    if (message?.kind === "support") {
      const recommendation = message.recommendationId === undefined
        ? undefined
        : snapshot.recommendations.find(({ id }) => id === message.recommendationId);
      return recommendation === undefined ? [] : [operationalSupportResponseAudit(event, message, recommendation)];
    }
    const revision = snapshot.recommendationRevisions.find(
      ({ operationalEventId }) => operationalEventId === event.id,
    );
    if (revision !== undefined) {
      if (event.action === "recommendation-submitted") {
        return [operationalSubmittedRecommendationAudit(event, revision.recommendation)];
      }
      if (
        event.action === "recommendation-approved"
        || event.action === "recommendation-rejected"
        || event.action === "recommendation-canceled"
        || event.action === "recommendation-superseded"
      ) {
        const rationale = event.action === "recommendation-approved"
          ? revision.recommendation.rationale
          : typeof event.facts.reasonCode === "string"
            ? event.facts.reasonCode
            : "Recommendation lifecycle transition completed.";
        return [operationalRecommendationLifecycleAudit(
          event,
          revision.recommendation,
          operationalExpectedResolutionForAnyLifecycle(event.action),
          revision.recommendation.resolution,
          rationale,
        )];
      }
    }
    return [AuditEventSchema.parse({
      id: event.id,
      timestamp: event.occurredAt,
      actor: event.actor,
      action: event.action,
      ticketId: event.ticketId,
      before: {},
      after: event.facts,
      rationale: `Operational ${event.action} event.`,
      knowledgeArticleIds: [],
      result: event.action === "approval-rejected" || event.action === "learning-capture-failed"
        ? "rejected"
        : "success",
      ...(event.action === "approval-rejected" || event.action === "learning-capture-failed"
        ? { rejectionReason: `Operational ${event.action} event.` }
        : {}),
    })];
  });
}

function operationalExpectedResolutionForAnyLifecycle(
  action: "recommendation-approved" | "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
): TriageRecommendation["resolution"] {
  return action === "recommendation-canceled" ? "approved" : "pending";
}

function operationalSubmittedRecommendationAudit(
  event: OperationalWorkflowSnapshot["events"][number],
  recommendation: TriageRecommendation,
): AuditEvent {
  return AuditEventSchema.parse({
    id: event.id,
    timestamp: event.occurredAt,
    actor: event.actor,
    action: "recommendation-submitted",
    ticketId: event.ticketId,
    recommendationId: recommendation.id,
    before: {},
    after: {
      sourceRevision: recommendation.sourceRevision,
      category: recommendation.category,
      priority: recommendation.priority,
      team: recommendation.team,
      escalationRequired: recommendation.escalationRequired,
      escalationReasons: recommendation.escalationReasons,
    },
    rationale: recommendation.rationale,
    knowledgeArticleIds: recommendation.knowledgeArticleIds,
    result: "success",
  });
}

function operationalCustomerReplyWatermarksMatch(
  evaluated: CustomerReplyWatermark,
  snapshot: OperationalWorkflowSnapshot,
): boolean {
  const current = customerReplyWatermarkFromSnapshot(snapshot);
  return evaluated.state === current.state &&
    (evaluated.state === "none" ||
      (current.state === "reply" &&
        evaluated.id === current.id &&
        compareIsoInstants(evaluated.timestamp, current.timestamp) === 0));
}

function stableUnique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

async function serializeRecommendation<T>(
  recommendationId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous =
    recommendationOperations.get(recommendationId) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolveOperation) => {
    release = resolveOperation;
  });
  recommendationOperations.set(recommendationId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (recommendationOperations.get(recommendationId) === current) {
      recommendationOperations.delete(recommendationId);
    }
  }
}

function stale(message: string): DomainError {
  return new DomainError(message, "STALE_APPROVAL");
}

function invalidDiagnosisReview(message: string): DomainError {
  return new DomainError(message, "INVALID_APPROVAL_FIELDS");
}

function sameStructuredValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readNonnegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function assertFixTimestampIsCurrent(
  fixedAt: string,
  priorAudits: readonly AuditEvent[],
): void {
  const latestContextTimestamp = priorAudits.reduce<string | undefined>(
    (latest, event) =>
      latest === undefined || compareIsoInstants(event.timestamp, latest) > 0
        ? event.timestamp
        : latest,
    undefined,
  );
  if (
    latestContextTimestamp !== undefined &&
    compareIsoInstants(fixedAt, latestContextTimestamp) < 0
  ) {
    throw new DomainError(
      "Fix timestamp cannot predate the governed ticket context.",
      "INVALID_APPROVAL_FIELDS",
    );
  }
}

function conversationWatermarkAt(
  audits: readonly AuditEvent[],
  auditId: string,
): CustomerReplyWatermark {
  const auditIndex = audits.findIndex((event) => event.id === auditId);
  return customerReplyWatermarkFromAudits(
    auditIndex < 0 ? [] : audits.slice(0, auditIndex),
  );
}

function domainErrorWithCause(message: string, cause: unknown): DomainError {
  const error = new DomainError(message, "REPOSITORY_ERROR");
  Object.defineProperty(error, "cause", {
    value: cause,
    configurable: true,
  });
  return error;
}

function approvedValues(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  approval: Approval,
): {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
} {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  for (const field of approval.approvedFields) {
    before[field] =
      field === "customerResponse" ? null : ticketValue(ticket, field);
    after[field] = approvedFieldValue(recommendation, approval, field);
  }
  return { before, after };
}

async function serializeTicket<T>(
  ticketId: TicketId,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = ticketOperations.get(ticketId) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolveOperation) => {
    release = resolveOperation;
  });
  ticketOperations.set(ticketId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (ticketOperations.get(ticketId) === current) {
      ticketOperations.delete(ticketId);
    }
  }
}

async function serializeTickets<T>(
  ticketIds: readonly TicketId[],
  operation: () => Promise<T>,
): Promise<T> {
  const ordered = [...new Set(ticketIds)].sort();
  const acquire = async (index: number): Promise<T> => {
    const ticketId = ordered[index];
    if (ticketId === undefined) return operation();
    return serializeTicket(ticketId, () => acquire(index + 1));
  };
  return acquire(0);
}

function ticketValue(ticket: Ticket, field: ApprovedField): unknown {
  switch (field) {
    case "category":
    case "priority":
    case "team":
    case "assignee":
    case "tags":
      return ticket[field];
    case "status":
      return ticket.status;
    case "customerResponse":
      return null;
  }
}

function recommendationValue(
  recommendation: TriageRecommendation,
  field: ApprovedField,
): unknown {
  switch (field) {
    case "category":
    case "priority":
    case "team":
    case "assignee":
    case "tags":
      return recommendation[field];
    case "status":
      return recommendation.ticketStatus;
    case "customerResponse":
      return recommendation.draftCustomerResponse;
  }
}

function approvedFieldValue(
  recommendation: TriageRecommendation,
  approval: Approval,
  field: ApprovedField,
): unknown {
  if (field === "customerResponse") {
    return approval.editedCustomerResponse ?? recommendation.draftCustomerResponse;
  }

  if (
    approval.fieldOverrides !== undefined &&
    Object.hasOwn(approval.fieldOverrides, field)
  ) {
    return approval.fieldOverrides[field as keyof typeof approval.fieldOverrides];
  }

  return recommendationValue(recommendation, field);
}

function applyApprovedFields(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  approval: Approval,
  updatedAt: string,
): Ticket {
  const updated = structuredClone(ticket);
  for (const field of approval.approvedFields) {
    switch (field) {
      case "category":
        updated.category = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["category"];
        break;
      case "priority":
        updated.priority = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["priority"];
        break;
      case "team":
        updated.team = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["team"];
        break;
      case "assignee":
        const assignee = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["assignee"] | null;
        if (assignee === null) {
          delete updated.assignee;
        } else {
          updated.assignee = assignee;
        }
        break;
      case "status":
        updated.status = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["status"];
        break;
      case "tags":
        updated.tags = [
          ...(approvedFieldValue(
            recommendation,
            approval,
            field,
          ) as Ticket["tags"]),
        ];
        break;
      case "customerResponse":
        break;
    }
  }
  updated.updatedAt = updatedAt;
  return updated;
}
