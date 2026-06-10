import { z } from "zod";

const NonBlankStringSchema = z.string().trim().min(1);
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const IsoTimestampSchema = z.iso.datetime({ offset: true });
export const TicketIdSchema = z.string().regex(/^TKT-\d{4}$/);

export const CategorySchema = z.enum([
  "account-access",
  "authentication",
  "billing",
  "api",
  "integration",
  "performance",
  "incident",
  "security",
  "feature-request",
  "other",
]);

export const PrioritySchema = z.enum(["P1", "P2", "P3", "P4"]);

export const TeamSchema = z.enum([
  "support",
  "billing",
  "identity",
  "api-platform",
  "integrations",
  "incident-response",
  "security",
  "product",
]);

export const TicketStatusSchema = z.enum([
  "new",
  "triage",
  "waiting-customer",
  "in-progress",
  "resolved",
]);

export const RiskSchema = z.enum([
  "none",
  "possible",
  "likely",
  "confirmed",
]);

export const CustomerSchema = z
  .object({
    name: NonBlankStringSchema,
    plan: NonBlankStringSchema,
    region: NonBlankStringSchema,
    vip: z.boolean(),
  })
  .strict();

export const SLASchema = z
  .object({
    responseDueAt: IsoTimestampSchema,
    breached: z.boolean(),
  })
  .strict();

export const TicketSchema = z
  .object({
    id: TicketIdSchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
    customer: CustomerSchema,
    subject: NonBlankStringSchema,
    description: NonBlankStringSchema,
    status: TicketStatusSchema,
    category: CategorySchema.optional(),
    priority: PrioritySchema.optional(),
    team: TeamSchema.optional(),
    assignee: NonBlankStringSchema.optional(),
    tags: z.array(NonBlankStringSchema),
    sla: SLASchema,
    relatedTicketIds: z.array(TicketIdSchema),
    revision: z.number().int().nonnegative(),
  })
  .strict();

export const KnowledgeArticleSchema = z
  .object({
    id: SlugSchema,
    title: NonBlankStringSchema,
    tags: z.array(NonBlankStringSchema),
    body: NonBlankStringSchema,
  })
  .strict();

export const DuplicateCandidateSchema = z
  .object({
    ticketId: TicketIdSchema,
    confidence: z.number().min(0).max(1),
    evidence: NonBlankStringSchema,
  })
  .strict();

export const TriageRecommendationSchema = z
  .object({
    id: z.uuid(),
    ticketId: TicketIdSchema,
    sourceRevision: z.number().int().nonnegative(),
    category: CategorySchema,
    priority: PrioritySchema,
    team: TeamSchema,
    duplicateCandidates: z.array(DuplicateCandidateSchema),
    outageRisk: RiskSchema,
    securityRisk: RiskSchema,
    slaRisk: RiskSchema,
    missingInformation: z.array(NonBlankStringSchema),
    knowledgeArticleIds: z.array(SlugSchema),
    draftCustomerResponse: NonBlankStringSchema,
    rationale: NonBlankStringSchema,
    confidence: z.number().min(0).max(1),
    recommendedNextAction: NonBlankStringSchema,
    escalationRequired: z.boolean(),
    escalationReasons: z.array(NonBlankStringSchema),
    status: z.enum(["pending", "approved", "rejected"]),
    createdAt: IsoTimestampSchema,
  })
  .strict();

export const RecommendationSchema = TriageRecommendationSchema;

export const ApprovedFieldSchema = z.enum([
  "category",
  "priority",
  "team",
  "assignee",
  "status",
  "tags",
  "customerResponse",
]);

const ApprovedFieldsSchema = z
  .array(ApprovedFieldSchema)
  .min(1)
  .refine((fields) => new Set(fields).size === fields.length, {
    message: "Approved fields must be unique.",
  });

export const ApprovalSchema = z
  .object({
    recommendationId: z.uuid(),
    ticketId: TicketIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    approvedFields: ApprovedFieldsSchema,
    editedCustomerResponse: NonBlankStringSchema.optional(),
    actor: NonBlankStringSchema,
    confirm: z.literal(true),
    approvedAt: IsoTimestampSchema,
  })
  .strict();

export const AuditActionSchema = z.enum([
  "recommendation-submitted",
  "recommendation-approved",
  "recommendation-rejected",
  "ticket-updated",
  "approval-rejected",
]);

export const AuditEventSchema = z
  .object({
    id: z.uuid(),
    timestamp: IsoTimestampSchema,
    actor: NonBlankStringSchema,
    action: AuditActionSchema,
    ticketId: TicketIdSchema,
    recommendationId: z.uuid().optional(),
    before: z.record(z.string(), z.unknown()),
    after: z.record(z.string(), z.unknown()),
    rationale: NonBlankStringSchema,
    knowledgeArticleIds: z.array(SlugSchema),
    result: z.enum(["success", "rejected"]),
    rejectionReason: NonBlankStringSchema.optional(),
  })
  .strict();

export const RequiredEscalationSchema = z.enum([
  "security",
  "outage",
  "low-confidence",
  "sla",
  "missing-information",
  "policy-conflict",
]);

export const ExpectedOutcomeSchema = z
  .object({
    ticketId: TicketIdSchema,
    category: CategorySchema,
    acceptablePriorities: z.array(PrioritySchema).min(1),
    team: TeamSchema,
    requiredEscalations: z.array(RequiredEscalationSchema),
    knowledgeArticleIds: z.array(SlugSchema),
    duplicateGroup: NonBlankStringSchema.optional(),
  })
  .strict();

export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;
export type TicketId = z.infer<typeof TicketIdSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Team = z.infer<typeof TeamSchema>;
export type TicketStatus = z.infer<typeof TicketStatusSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type SLA = z.infer<typeof SLASchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type KnowledgeArticle = z.infer<typeof KnowledgeArticleSchema>;
export type DuplicateCandidate = z.infer<typeof DuplicateCandidateSchema>;
export type TriageRecommendation = z.infer<typeof TriageRecommendationSchema>;
export type Recommendation = TriageRecommendation;
export type ApprovedField = z.infer<typeof ApprovedFieldSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type RequiredEscalation = z.infer<typeof RequiredEscalationSchema>;
export type ExpectedOutcome = z.infer<typeof ExpectedOutcomeSchema>;
