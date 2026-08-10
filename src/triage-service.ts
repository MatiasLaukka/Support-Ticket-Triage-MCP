import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AiExecutionTraceSchema,
  ApprovalSchema,
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
import { hasCustomerReplyAfterRecommendation } from "./approval-desk/workflow-causal-context.js";
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
        snapshot.customerReplyWatermark,
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
      reasons: recommendation.classificationSignals?.map(({ reason }) => reason) ?? [recommendation.rationale],
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
    const latestReply = snapshot.messages
      .filter((message) => message.kind === "customer")
      .map((message) => ({ message, event: snapshot.events.find(({ id }) => id === message.operationalEventId) }))
      .filter((entry): entry is { message: typeof entry.message; event: NonNullable<typeof entry.event> } => entry.event !== undefined)
      .at(-1);
    if (latestReply === undefined) return false;
    const revision = snapshot.recommendationRevisions
      .filter(({ recommendation: candidate }) => candidate.id === recommendation.id)
      .at(-1);
    const recommendationEvent = revision === undefined
      ? undefined
      : snapshot.events.find(({ id }) => id === revision.operationalEventId);
    return recommendationEvent === undefined
      ? compareIsoInstants(latestReply.message.createdAt, recommendation.createdAt) > 0
      : latestReply.event.sequence > recommendationEvent.sequence;
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
  ): Promise<{ ticket: Ticket; auditEvent: AuditEvent }> {
    const approval = ApprovalSchema.parse(input);
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

  async reject(input: RejectRecommendationInput): Promise<AuditEvent> {
    const rejection = RejectRecommendationInputSchema.parse(input);
    return serializeTicket(rejection.ticketId, () =>
      serializeRecommendation(rejection.recommendationId, () =>
        this.rejectValidated(rejection),
      ),
    );
  }

  async cancelApproval(input: CancelApprovalInput): Promise<AuditEvent> {
    const cancellation = CancelApprovalInputSchema.parse(input);
    return serializeTicket(cancellation.ticketId, () =>
      serializeRecommendation(cancellation.recommendationId, () =>
        this.cancelApprovalValidated(cancellation),
      ),
    );
  }

  async markResponseSent(
    input: MarkResponseSentInput,
  ): Promise<AuditEvent> {
    const sent = MarkResponseSentInputSchema.parse(input);
    return serializeTicket(sent.ticketId, () =>
      serializeRecommendation(sent.recommendationId, () =>
        this.markResponseSentValidated(sent),
      ),
    );
  }

  async approveAndMarkResponseSent(
    input: ApproveAndMarkResponseSentInput,
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

  async addCustomerReply(input: AddCustomerReplyInput): Promise<AuditEvent> {
    const reply = AddCustomerReplyInputSchema.parse(input);
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

  async recordDiagnosis(input: RecordDiagnosisInput): Promise<AuditEvent> {
    const diagnosis = RecordDiagnosisInputSchema.parse(input);
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

  async reviewDiagnosis(input: DiagnosisReviewInput): Promise<AuditEvent> {
    const {
      DiagnosisReviewDecisionSchema,
      compareAuditCausalOrder,
      customerReplyWatermarksMatch,
      isDiagnosisStale,
      latestDiagnosisReview,
    } = await import("./approval-desk/diagnosis-review.js");
    const review = DiagnosisReviewDecisionSchema.parse(input);

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

  async recordFix(input: RecordFixInput): Promise<AuditEvent> {
    const fix = RecordFixInputSchema.parse(input);
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
  ): Promise<AuditEvent> {
    const eventId = z.string().trim().min(1).parse(input.eventId);
    const actor = NonBlankStringSchema.parse(input.actor);
    const recordedAt = IsoTimestampSchema.parse(input.recordedAt);
    const rationale = NonBlankStringSchema.parse(input.rationale);
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
  ): Promise<{ ticket: Ticket; auditEvent: AuditEvent }> {
    const close = CloseTicketInputSchema.parse(input);
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

  async applyDiagnosisFix(input: ApplyDiagnosisFixInput): Promise<AuditEvent[]> {
    return this.applyDiagnosisFixValidated(
      ApplyDiagnosisFixInputSchema.parse(input),
    );
  }

  private async applyDiagnosisFixValidated(
    input: z.infer<typeof ApplyDiagnosisFixInputSchema>,
    legacy?: { fix: FixContext; knowledgeArticleIds: string[] },
  ): Promise<AuditEvent[]> {
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

  async supersedeRecommendation(
    input: SupersedeRecommendationInput,
  ): Promise<AuditEvent> {
    const supersession = SupersedeRecommendationInputSchema.parse(input);
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

function operationalCustomerReplyWatermarksMatch(
  evaluated: CustomerReplyWatermark,
  current: CustomerReplyWatermark,
  snapshot: OperationalWorkflowSnapshot,
): boolean {
  const latestCustomerMessage = snapshot.messages
    .filter((message) => message.kind === "customer")
    .at(-1);
  const latestCustomerEvent = latestCustomerMessage === undefined
    ? undefined
    : snapshot.events.find(({ id }) => id === latestCustomerMessage.operationalEventId);
  const currentReplyIds = latestCustomerMessage === undefined
    ? []
    : [latestCustomerMessage.id, ...(latestCustomerEvent === undefined ? [] : [latestCustomerEvent.id])];
  return evaluated.state === current.state &&
    (evaluated.state === "none" ||
      (current.state === "reply" &&
        (evaluated.id === current.id || currentReplyIds.includes(evaluated.id)) &&
        compareIsoInstants(evaluated.timestamp, current.timestamp) === 0));
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
