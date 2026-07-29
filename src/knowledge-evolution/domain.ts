import { z } from "zod";
import { IsoTimestampSchema, TeamSchema, TicketIdSchema } from "../domain.js";

const NonBlankStringSchema = z.string().trim().min(1).max(1_000);
const IdentifierSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const UniqueIdentifiersSchema = z.array(IdentifierSchema).refine(
  (values) => new Set(values).size === values.length,
  { message: "Values must be unique." },
);
const UniqueTextSchema = z.array(NonBlankStringSchema).min(1).refine(
  (values) => new Set(values).size === values.length,
  { message: "Values must be unique." },
);

const UnsafePersistedText = /(?:\b(?:raw\s+)?(?:system|developer|user)\s+(?:prompt|message|instructions?)\b|\braw\s+prompt\b|\b(?:hidden|chain[- ]of[- ]thought|reasoning)\b|\b(?:api[-_]?key|access[-_]?token|secret|password)\s*[=:]\s*\S+|\bsk-[a-z0-9_-]+\b|\b(?:[a-z]:[\\/]|\\\\)|(?:^|\s)[~\/][^\s]*|\b(?:model|provider)\s+(?:payload|response)\b)/i;
const PersistedTextSchema = NonBlankStringSchema.refine(
  (value) => !UnsafePersistedText.test(value),
  "Persisted text must not contain prompts, hidden reasoning, secrets, paths, or raw model payloads.",
);
const WorkflowStepSchema = PersistedTextSchema.refine(
  (value) => !/(?:^\s*(?:rm|del|curl|wget|powershell|bash|sh|cmd|node|python|npm|git)\b|```|[;&|]{1,2}|\$\([^)]*\)|\b(?:chmod|invoke-expression|remove-item)\b)/i.test(value),
  "Workflow steps must be declarative and not executable-looking.",
);
const CustomerSafeTextSchema = PersistedTextSchema.refine(
  (value) => !/\b(?:internal|operator|rationale|diagnos(?:is|tic)|evidence|ticket id)\b/i.test(value),
  "Customer-safe text must not contain operator rationale.",
);

export const KnowledgeObjectKindSchema = z.enum(["known-cause"]);
export const KnowledgeObjectStatusSchema = z.enum([
  "candidate",
  "approved",
  "rejected",
  "superseded",
]);

export const EvidencePolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none-required") }).strict(),
  z.object({ mode: z.literal("required"), evidenceIds: UniqueIdentifiersSchema.min(1) }).strict(),
]);

export const CompletedDiagnosisSchema = z.object({
  id: IdentifierSchema.readonly(),
  ticketId: TicketIdSchema,
  problem: PersistedTextSchema,
  symptoms: UniqueTextSchema,
  evidenceIds: UniqueIdentifiersSchema,
  ownerTeam: TeamSchema,
  fixSteps: z.array(WorkflowStepSchema).min(1),
  verificationSteps: z.array(WorkflowStepSchema).min(1),
  completedAt: IsoTimestampSchema,
}).strict();

const ProvenanceSchema = z.object({
  source: PersistedTextSchema.max(120),
  recordedAt: IsoTimestampSchema,
  reference: PersistedTextSchema.max(240).optional(),
}).strict();

const GptProvenanceSchema = z.object({
  provider: z.enum(["openai"]),
  model: z.string().max(120).regex(/^[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*$/),
  generatedAt: IsoTimestampSchema,
  summary: PersistedTextSchema.max(240),
  confidence: z.number().min(0).max(1).optional(),
}).strict();

const DiscoverySupportSchema = z.object({
  source: z.enum(["completed-diagnosis", "open-ticket"]),
  diagnosisId: IdentifierSchema.optional(),
  ticketId: TicketIdSchema,
  score: z.number().min(0).max(1),
  reasons: z.array(PersistedTextSchema),
}).strict();
const DiscoverySummarySchema = z.object({
  score: z.number().min(0).max(1),
  reasons: z.array(PersistedTextSchema),
  support: z.array(DiscoverySupportSchema),
  supportCount: z.number().int().nonnegative(),
  contradictions: z.array(PersistedTextSchema),
  meetsAlertThreshold: z.boolean(),
}).strict();

const ApprovalSchema = z.object({
  approvedBy: NonBlankStringSchema.max(120),
  approvedAt: IsoTimestampSchema,
}).strict();

const KnowledgeObjectFieldsSchema = z.object({
  id: IdentifierSchema.readonly(),
  kind: KnowledgeObjectKindSchema,
  name: PersistedTextSchema.max(160),
  summary: PersistedTextSchema,
  triggerPatterns: UniqueTextSchema,
  evidencePolicy: EvidencePolicySchema,
  timeConstraints: UniqueTextSchema,
  diagnosticSteps: z.array(WorkflowStepSchema).min(1),
  fixSteps: z.array(WorkflowStepSchema).min(1),
  verificationSteps: z.array(WorkflowStepSchema).min(1),
  customerSafeExplanation: CustomerSafeTextSchema,
  operatorRationale: PersistedTextSchema,
  owner: TeamSchema,
  version: z.number().int().positive(),
  supportingDiagnosisIds: UniqueIdentifiersSchema,
  supportingTicketIds: z.array(TicketIdSchema).refine(
    (values) => new Set(values).size === values.length,
    { message: "Values must be unique." },
  ),
  provenance: ProvenanceSchema,
}).strict();

export const KnowledgeObjectSchema = KnowledgeObjectFieldsSchema.extend({
  status: KnowledgeObjectStatusSchema,
  approval: ApprovalSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "approved" && value.approval === undefined) {
    context.addIssue({ code: "custom", path: ["approval"], message: "Approved knowledge objects require approval metadata." });
  }
  if (value.status !== "approved" && value.approval !== undefined) {
    context.addIssue({ code: "custom", path: ["approval"], message: "Only approved knowledge objects may include approval metadata." });
  }
});

export const KnowledgeCandidateSchema = KnowledgeObjectFieldsSchema.extend({
  status: z.literal("candidate"),
  deterministicScores: z.object({
    confidence: z.number().min(0).max(1),
    support: z.number().nonnegative(),
  }).strict(),
  deterministicReasons: UniqueTextSchema,
  gptProvenance: GptProvenanceSchema.optional(),
  discovery: DiscoverySummarySchema.optional(),
  contradictions: z.array(PersistedTextSchema),
  validationStatus: z.enum(["pending", "valid", "invalid"]),
}).strict();

export type KnowledgeObjectKind = z.infer<typeof KnowledgeObjectKindSchema>;
export type KnowledgeObjectStatus = z.infer<typeof KnowledgeObjectStatusSchema>;
export type EvidencePolicy = z.infer<typeof EvidencePolicySchema>;
export type CompletedDiagnosis = z.infer<typeof CompletedDiagnosisSchema>;
export type KnowledgeObject = z.infer<typeof KnowledgeObjectSchema>;
export type KnowledgeCandidate = z.infer<typeof KnowledgeCandidateSchema>;
