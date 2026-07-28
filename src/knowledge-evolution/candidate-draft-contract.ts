import { z } from "zod";

const IdentifierSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const TicketIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/);
const SafeTextSchema = z.string().trim().min(1).max(500).refine(
  (value) => !/(?:\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system|developer|user)\s+(?:instructions?|prompts?|messages?)\b|\b(?:system|developer|user)\s+(?:prompt|message|instructions?)\s*:|\b(?:hidden|chain[- ]of[- ]thought|reasoning)\b|\b(?:api[-_]?key|access[-_]?token|secret|password)\s*[=:]\s*\S+|\bsk-[a-z0-9_-]+\b|(?:[A-Za-z]:[\\/]|\\\\)|(?:^|\s)[~\/][^\s]*|\b(?:model|provider)\s+(?:payload|response)\b|```)/i.test(value),
  "Candidate text must not contain prompts, hidden reasoning, credentials, paths, or raw provider data.",
);
const WorkflowStepSchema = SafeTextSchema.max(280).refine(
  (value) => !/(?:^\s*(?:rm|del|curl|wget|powershell|bash|sh|cmd|node|python|npm|git)\b|[;&|]{1,2}|\$\([^)]*\)|\b(?:chmod|invoke-expression|remove-item)\b)/i.test(value),
  "Candidate workflow steps must be declarative.",
);
const Unique = <T extends z.ZodType>(schema: T) => z.array(schema).min(1).max(8).refine(
  (values) => new Set(values).size === values.length,
  "Values must be unique.",
);
const OptionalUnique = <T extends z.ZodType>(schema: T) => z.array(schema).max(8).refine(
  (values) => new Set(values).size === values.length,
  "Values must be unique.",
);

export const CandidateDraftContractSchema = z.object({
  kind: z.literal("known-cause"),
  name: SafeTextSchema.max(160),
  summary: SafeTextSchema,
  triggerPatterns: Unique(SafeTextSchema.max(240)),
  evidencePolicy: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("none-required") }).strict(),
    z.object({ mode: z.literal("required"), evidenceIds: Unique(IdentifierSchema) }).strict(),
  ]),
  knowledgeArticleIds: OptionalUnique(IdentifierSchema),
  timeConstraints: Unique(SafeTextSchema.max(240)),
  diagnosticSteps: Unique(WorkflowStepSchema),
  fixSteps: Unique(WorkflowStepSchema),
  verificationSteps: Unique(WorkflowStepSchema),
  customerSafeExplanation: SafeTextSchema.max(320).refine(
    (value) => !/\b(?:internal|operator|rationale|diagnos(?:is|tic)|evidence|ticket id)\b/i.test(value),
    "Customer-safe explanation must not include operator-only context.",
  ),
  operatorRationale: SafeTextSchema.max(240),
  confidence: z.number().finite().min(0).max(1),
  rationale: SafeTextSchema.max(240),
  supportingDiagnosisIds: Unique(IdentifierSchema),
  supportingTicketIds: Unique(TicketIdSchema),
  contradictions: OptionalUnique(SafeTextSchema.max(240)),
}).strict();

export type CandidateDraftPayload = z.infer<typeof CandidateDraftContractSchema>;

export class InvalidCandidateDraftContractError extends Error {
  readonly name = "InvalidCandidateDraftContractError";

  constructor(readonly category: "invalid-schema" | "guardrail-rejected" = "invalid-schema") {
    super("Candidate draft did not match the expected structured contract.");
  }
}

export function parseCandidateDraftContract(outputText: string): CandidateDraftPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new InvalidCandidateDraftContractError();
  }
  const result = CandidateDraftContractSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidCandidateDraftContractError(
      result.error.issues.some((issue) => issue.code === "custom")
        ? "guardrail-rejected"
        : "invalid-schema",
    );
  }
  return result.data;
}
