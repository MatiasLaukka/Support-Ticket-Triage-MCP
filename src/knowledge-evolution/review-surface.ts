import { z } from "zod";
import { TicketIdSchema } from "../domain.js";
import {
  CandidateEvidencePolicySchema,
  KnowledgeCandidateSchema,
  type KnowledgeCandidate,
  type KnowledgeObject,
} from "./domain.js";
import type { KnowledgeDiscoveryCandidate, KnowledgeDiscoveryResult } from "./discovery.js";

export const KnowledgeCandidateIdSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const KnowledgeReviewActorSchema = z.string().trim().min(1).max(120);
export const KnowledgeCandidateEditsSchema = z.object({
  name: KnowledgeCandidateSchema.shape.name.optional(),
  summary: KnowledgeCandidateSchema.shape.summary.optional(),
  triggerPatterns: KnowledgeCandidateSchema.shape.triggerPatterns.optional(),
  evidencePolicy: CandidateEvidencePolicySchema.optional(),
  timeConstraints: KnowledgeCandidateSchema.shape.timeConstraints.optional(),
  diagnosticSteps: KnowledgeCandidateSchema.shape.diagnosticSteps.optional(),
  fixSteps: KnowledgeCandidateSchema.shape.fixSteps.optional(),
  verificationSteps: KnowledgeCandidateSchema.shape.verificationSteps.optional(),
  customerSafeExplanation: KnowledgeCandidateSchema.shape.customerSafeExplanation.optional(),
  operatorRationale: KnowledgeCandidateSchema.shape.operatorRationale.optional(),
  owner: KnowledgeCandidateSchema.shape.owner.optional(),
}).strict();

const CandidateSupportSchema = z.object({
  source: z.enum(["completed-diagnosis", "open-ticket"]),
  diagnosisId: KnowledgeCandidateIdSchema.optional(),
  ticketId: TicketIdSchema,
  score: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string().trim().min(1).max(1_000)),
}).strict();

export const KnowledgeCandidateReviewSchema = z.object({
  id: KnowledgeCandidateIdSchema,
  name: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1_000),
  triggerPatterns: z.array(z.string().trim().min(1).max(1_000)),
  evidencePolicy: CandidateEvidencePolicySchema,
  evidencePolicyMetadata: z.object({
    derivedEvidenceIds: z.array(KnowledgeCandidateIdSchema),
    operatorAddedEvidenceIds: z.array(KnowledgeCandidateIdSchema),
  }).strict(),
  timeConstraints: z.array(z.string().trim().min(1).max(1_000)),
  diagnosticSteps: z.array(z.string().trim().min(1).max(1_000)),
  fixSteps: z.array(z.string().trim().min(1).max(1_000)),
  verificationSteps: z.array(z.string().trim().min(1).max(1_000)),
  customerSafeExplanation: z.string().trim().min(1).max(1_000),
  operatorRationale: z.string().trim().min(1).max(1_000),
  owner: KnowledgeCandidateSchema.shape.owner,
  version: z.number().int().positive(),
  deterministic: z.object({
    score: z.number().min(0).max(1),
    supportCount: z.number().int().nonnegative(),
    reasons: z.array(z.string().trim().min(1).max(1_000)),
    meetsAlertThreshold: z.boolean(),
  }).strict(),
  gptAdvisory: z.object({
    status: z.enum(["not-used", "used"]),
    provider: z.literal("openai").optional(),
    model: z.string().trim().min(1).max(120).optional(),
    rationale: z.string().trim().min(1).max(240).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }).strict(),
  support: z.array(CandidateSupportSchema),
  supportingDiagnosisIds: z.array(KnowledgeCandidateIdSchema),
  supportingTicketIds: z.array(TicketIdSchema),
  contradictions: z.array(z.string().trim().min(1).max(1_000)),
  validationStatus: z.enum(["pending", "valid", "invalid"]),
  validationWarnings: z.array(z.string().trim().min(1).max(1_000)),
}).strict();

export const KnowledgeDiscoveryReviewOutputSchema = z.object({
  candidates: z.array(KnowledgeCandidateReviewSchema),
  gptAdvisory: z.object({
    requested: z.boolean(),
    status: z.enum(["not-used", "used"]),
    candidateId: KnowledgeCandidateIdSchema.optional(),
    fallbackReason: z.string().trim().min(1).max(120).optional(),
    diagnostics: z.array(z.string().trim().min(1).max(1_000)).max(10).optional(),
  }).strict(),
  suppressed: z.array(z.object({
    candidateId: KnowledgeCandidateIdSchema,
    approvedObjectId: KnowledgeCandidateIdSchema,
  }).strict()),
}).strict();
export const KnowledgeCandidateReviewOutputSchema = z.object({ candidate: KnowledgeCandidateReviewSchema }).strict();
export const KnowledgeCandidateApprovalOutputSchema = z.object({
  object: z.object({
    id: KnowledgeCandidateIdSchema,
    status: z.literal("approved"),
    version: z.number().int().positive(),
    approvedBy: KnowledgeReviewActorSchema,
    approvedAt: z.string().datetime(),
  }).strict(),
}).strict();
export const KnowledgeCandidateRejectionOutputSchema = z.object({ candidateId: KnowledgeCandidateIdSchema, rejected: z.literal(true) }).strict();
export const KnowledgeCandidateDefermentOutputSchema = z.object({ candidateId: KnowledgeCandidateIdSchema, deferred: z.literal(true) }).strict();

export function knowledgeCandidateReview(
  candidate: KnowledgeCandidate,
  discovery?: KnowledgeDiscoveryCandidate,
): z.infer<typeof KnowledgeCandidateReviewSchema> {
  const summary = discovery ?? candidate.discovery;
  const support = summary?.support ?? candidate.supportingDiagnosisIds.map((diagnosisId) => ({
    source: "completed-diagnosis" as const,
    diagnosisId,
    ticketId: candidate.supportingTicketIds[0]!,
    reasons: ["Completed diagnosis supports this candidate."],
  }));
  return KnowledgeCandidateReviewSchema.parse({
    id: candidate.id,
    name: candidate.name,
    summary: candidate.summary,
    triggerPatterns: candidate.triggerPatterns,
    evidencePolicy: candidate.evidencePolicy,
    evidencePolicyMetadata: candidate.evidencePolicyMetadata,
    timeConstraints: candidate.timeConstraints,
    diagnosticSteps: candidate.diagnosticSteps,
    fixSteps: candidate.fixSteps,
    verificationSteps: candidate.verificationSteps,
    customerSafeExplanation: candidate.customerSafeExplanation,
    operatorRationale: candidate.operatorRationale,
    owner: candidate.owner,
    version: candidate.version,
    deterministic: {
      score: summary?.score ?? candidate.deterministicScores.confidence,
      supportCount: summary?.supportCount ?? candidate.deterministicScores.support,
      reasons: summary?.reasons ?? candidate.deterministicReasons,
      meetsAlertThreshold: summary?.meetsAlertThreshold ?? false,
    },
    gptAdvisory: candidate.gptProvenance === undefined
      ? { status: "not-used" }
      : {
        status: "used",
        provider: candidate.gptProvenance.provider,
        model: candidate.gptProvenance.model,
        rationale: candidate.gptProvenance.summary,
        confidence: candidate.gptProvenance.confidence,
      },
    support,
    supportingDiagnosisIds: candidate.supportingDiagnosisIds,
    supportingTicketIds: candidate.supportingTicketIds,
    contradictions: summary?.contradictions ?? candidate.contradictions,
    validationStatus: candidate.validationStatus,
    validationWarnings: candidate.validationStatus === "valid"
      ? []
      : ["Candidate requires validation before it can be approved."],
  });
}

export function knowledgeDiscoveryReview(
  result: KnowledgeDiscoveryResult & { gptAdvisory?: z.infer<typeof KnowledgeDiscoveryReviewOutputSchema>["gptAdvisory"] },
  candidates: readonly KnowledgeCandidate[],
): z.infer<typeof KnowledgeDiscoveryReviewOutputSchema> {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return KnowledgeDiscoveryReviewOutputSchema.parse({
    candidates: [
      ...result.candidates.flatMap((candidate) => {
      const stored = byId.get(`known-cause-${candidate.id}`);
      return stored === undefined ? [] : [knowledgeCandidateReview(stored, candidate)];
      }),
      ...(result.gptAdvisory?.candidateId === undefined
        ? []
        : (() => {
          const stored = byId.get(result.gptAdvisory.candidateId!);
          return stored === undefined ? [] : [knowledgeCandidateReview(stored)];
        })()),
    ],
    gptAdvisory: result.gptAdvisory ?? { requested: false, status: "not-used" },
    suppressed: result.suppressed,
  });
}

export function knowledgeApprovalReview(object: KnowledgeObject): z.infer<typeof KnowledgeCandidateApprovalOutputSchema> {
  return KnowledgeCandidateApprovalOutputSchema.parse({
    object: {
      id: object.id,
      status: "approved",
      version: object.version,
      approvedBy: object.approval!.approvedBy,
      approvedAt: object.approval!.approvedAt,
    },
  });
}
