import { z } from "zod";
import {
  CustomerReplyWatermarkSchema,
  EvidenceRequirementSchema,
  type AuditEvent,
  type EvidenceRequirement,
  type Ticket,
  type TriageRecommendation,
} from "../domain.js";
import type { KnowledgeAuditEvent } from "../knowledge-evolution/knowledge-audit-repository.js";
import type { KnowledgeCandidate } from "../knowledge-evolution/domain.js";
import type { CustomerReplyWatermark, DiagnosisContext } from "../triage-service.js";
import {
  diagnosisContextFromAudit,
} from "./diagnostic-workflow.js";
import {
  isDiagnosisStale,
  latestStrictDiagnosisReviewRecord,
} from "./diagnosis-review.js";
import {
  auditCausalPositions,
  compareAuditCausalOrder,
  latestAuditPosition,
  type AuditCausalPosition,
} from "./workflow-causal-context.js";
import {
  buildOperatorGuidance,
  latestAuthoritativeDiagnosis,
  latestDiagnosisAudit,
  type OperatorGuidance,
} from "./workflow-guidance.js";

const NonBlankStringSchema = z.string().trim().min(1);

export const LifecyclePhaseSchema = z.enum([
  "evaluation-needed",
  "recommendation-review",
  "waiting-for-customer",
  "diagnosis-ready",
  "diagnosis-review",
  "awaiting-confirmation",
  "awaiting-fix",
  "fix-ready",
  "verification",
  "ready-for-close",
  "escalated",
  "resolved",
]);

export const LifecycleActionKindSchema = z.enum([
  "evaluate-ticket",
  "review-recommendation",
  "send-customer-response",
  "record-diagnosis",
  "review-diagnosis",
  "revalidate-diagnosis",
  "reject-diagnosis",
  "invalidate-diagnosis",
  "record-fix-available",
  "apply-scoped-fix",
  "record-fix-ineffective",
  "resolve-ticket",
  "specialist-review",
  "review-pattern",
  "none",
]);

export const LifecycleActionSchema = z.object({
  kind: LifecycleActionKindSchema,
  availability: z.enum(["primary", "available", "blocked", "completed"]),
  reasonCodes: z.array(NonBlankStringSchema),
}).strict();

const LifecycleCurrentSchema = z.object({
  recommendationId: z.uuid().optional(),
  diagnosisId: z.uuid().optional(),
  fixEventId: z.uuid().optional(),
  ticketRevision: z.number().int().nonnegative(),
  conversationWatermark: CustomerReplyWatermarkSchema,
}).strict();

const LifecycleDiagnosticInvestigationSchema = z.object({
  state: z.enum([
    "not-started",
    "insufficient-evidence",
    "ambiguous",
    "working-diagnosis",
    "confirmed",
    "escalated",
  ]),
  hypotheses: z.array(z.object({
    id: NonBlankStringSchema,
    label: NonBlankStringSchema,
    status: z.enum(["plausible", "leading", "confirmed", "ruled-out"]),
    evidenceUsed: z.array(NonBlankStringSchema),
    evidenceToConfirm: z.array(NonBlankStringSchema),
  }).strict()),
  evidenceToRequest: z.array(NonBlankStringSchema),
  escalationReason: NonBlankStringSchema.optional(),
}).strict();

const LifecycleDiagnosisSchema = z.object({
  state: z.enum(["none", "recorded", "approved", "rejected", "stale", "invalidated"]),
  diagnosisId: z.uuid().optional(),
  reasonCodes: z.array(NonBlankStringSchema),
}).strict();

const LifecycleEvidenceSchema = z.object({
  required: z.array(EvidenceRequirementSchema),
  provided: z.array(EvidenceRequirementSchema),
  missing: z.array(EvidenceRequirementSchema),
}).strict();

const LifecycleConfirmationSchema = z.object({
  state: z.enum([
    "not-required",
    "awaiting-evidence",
    "awaiting-internal-verification",
    "confirmed",
    "escalated",
  ]),
  request: z.object({
    owner: z.enum(["customer", "internal", "specialist"]),
    evidenceIds: z.array(NonBlankStringSchema),
    reasonCode: NonBlankStringSchema,
  }).strict().optional(),
}).strict();

const LifecycleResponseSchema = z.object({
  intent: z.enum(["evidence-request", "diagnosis-update", "fix-verification", "closure"]),
  state: z.enum(["none", "draft", "approval-required", "approved", "sent", "waiting-for-reply"]),
}).strict();

const LifecycleFixSchema = z.object({
  state: z.enum([
    "none",
    "awaiting",
    "available",
    "ready-to-apply",
    "applied",
    "verification-pending",
    "verified",
    "ineffective",
  ]),
  diagnosisId: z.uuid().optional(),
  fixEventId: z.uuid().optional(),
  reasonCodes: z.array(NonBlankStringSchema),
  diagnosisStillAuthoritative: z.boolean(),
}).strict();

const LifecycleKnowledgeSchema = z.object({
  state: z.enum(["none", "pending", "approved", "rejected", "deferred"]),
  actionable: z.boolean(),
  candidateId: NonBlankStringSchema.optional(),
  reason: NonBlankStringSchema.optional(),
  secondaryAction: z.literal("review-pattern").optional(),
}).strict();

export const LifecycleViewSchema = z.object({
  phase: LifecyclePhaseSchema,
  primaryAction: LifecycleActionSchema,
  actions: z.array(LifecycleActionSchema),
  current: LifecycleCurrentSchema,
  diagnosticInvestigation: LifecycleDiagnosticInvestigationSchema,
  diagnosis: LifecycleDiagnosisSchema,
  evidence: LifecycleEvidenceSchema,
  confirmation: LifecycleConfirmationSchema,
  fix: LifecycleFixSchema,
  response: LifecycleResponseSchema,
  knowledge: LifecycleKnowledgeSchema,
}).strict();

export type LifecyclePhase = z.infer<typeof LifecyclePhaseSchema>;
export type LifecycleActionKind = z.infer<typeof LifecycleActionKindSchema>;
export type LifecycleAction = z.infer<typeof LifecycleActionSchema>;
export type LifecycleView = z.infer<typeof LifecycleViewSchema>;

export interface WorkflowLifecycleInput {
  ticket: Ticket;
  recommendations: readonly TriageRecommendation[];
  audits: readonly AuditEvent[];
  knowledgeEvolution?: {
    candidates: readonly KnowledgeCandidate[];
    audits: readonly KnowledgeAuditEvent[];
  };
}

export function buildTicketLifecycleView(input: WorkflowLifecycleInput): LifecycleView {
  const recommendation = latestRecommendation(input);
  const currentWatermark = conversationWatermarkFromAudits(input.audits);
  const guidance = buildOperatorGuidance({
    ...input,
    knowledgeEvolution: undefined,
  });
  const guidanceWithKnowledge = buildOperatorGuidance(input);
  const latestDiagnosis = latestDiagnosisAudit(input.audits);
  const diagnosisContext = latestDiagnosis === undefined
    ? undefined
    : diagnosisContextFromAudit(latestDiagnosis);
  const latestReview = latestDiagnosis === undefined
    ? undefined
    : latestStrictDiagnosisReviewRecord(input.audits, latestDiagnosis.id);
  const authoritative = latestAuthoritativeDiagnosis(input.ticket.id, input.audits);
  const diagnosis = diagnosisProjection({
    ticket: input.ticket,
    audits: input.audits,
    latestDiagnosis,
    latestReview,
    authoritative,
    currentWatermark,
  });
  const diagnosticInvestigation = diagnosticProjection(diagnosisContext);
  const evidence = evidenceProjection(recommendation);
  const confirmation = confirmationProjection(diagnosisContext, evidence);
  const fix = fixProjection({
    audits: input.audits,
    diagnosis,
    authoritativeDiagnosisId: authoritative?.diagnosisId,
  });
  const phase = phaseForLifecycle({
    ticket: input.ticket,
    recommendation,
    guidance,
    diagnosis,
    diagnosticInvestigation,
    confirmation,
    fix,
    audits: input.audits,
  });
  const primaryAction = primaryActionForPhase({
    phase,
    guidance,
    diagnosis,
    fix,
    reasonCodes: reasonCodesForPhase({ phase, diagnosis, confirmation, fix }),
  });
  const knowledge = knowledgeProjection(guidanceWithKnowledge);
  const actions = lifecycleActionsForPhase({
    phase,
    primaryAction,
    diagnosis,
    diagnosticInvestigation,
    confirmation,
    fix,
    knowledgeActionable: knowledge.actionable,
  });
  return LifecycleViewSchema.parse({
    phase,
    primaryAction,
    actions,
    current: {
      ...(recommendation === undefined ? {} : { recommendationId: recommendation.id }),
      ...(diagnosis.diagnosisId === undefined ? {} : { diagnosisId: diagnosis.diagnosisId }),
      ...(fix.fixEventId === undefined ? {} : { fixEventId: fix.fixEventId }),
      ticketRevision: input.ticket.revision,
      conversationWatermark: currentWatermark,
    },
    diagnosticInvestigation,
    diagnosis,
    evidence,
    confirmation,
    fix,
    response: responseProjection({ phase, recommendation, audits: input.audits }),
    knowledge,
  });
}

function phaseForLifecycle(input: {
  ticket: Ticket;
  recommendation: TriageRecommendation | undefined;
  guidance: OperatorGuidance;
  diagnosis: LifecycleView["diagnosis"];
  diagnosticInvestigation: LifecycleView["diagnosticInvestigation"];
  confirmation: LifecycleView["confirmation"];
  fix: LifecycleView["fix"];
  audits: readonly AuditEvent[];
}): LifecyclePhase {
  if (input.ticket.status === "resolved") return "resolved";
  if (input.guidance.stage === "escalated" || input.diagnosticInvestigation.state === "escalated") {
    return "escalated";
  }
  if (input.guidance.stage === "ready-for-close") return "ready-for-close";
  if (input.recommendation?.resolution === "pending") return "recommendation-review";
  if (input.guidance.stage === "waiting-customer") return "waiting-for-customer";
  if (input.diagnosis.state === "invalidated" || input.diagnosis.state === "rejected") {
    return "evaluation-needed";
  }
  // A fresh evaluation with complete evidence is the handoff that records the
  // next diagnosis. The previous diagnosis may still project an ambiguous or
  // insufficient diagnostic snapshot, but it is historical once the newer
  // recommendation satisfies the authoritative diagnosis blockers. Let the
  // guidance projection own this boundary instead of sending the operator back
  // into an evaluation loop.
  if (input.guidance.stage === "diagnosis-ready") return "diagnosis-ready";
  if (input.diagnosticInvestigation.state === "ambiguous" || input.diagnosticInvestigation.state === "insufficient-evidence") {
    return "evaluation-needed";
  }
  if (input.diagnosis.state === "recorded" || input.diagnosis.state === "stale") return "diagnosis-review";
  if (input.diagnosis.state === "approved") {
    if (input.confirmation.state === "awaiting-evidence" || input.confirmation.state === "awaiting-internal-verification") {
      return "awaiting-confirmation";
    }
    if (input.fix.state === "awaiting" || input.fix.state === "none") return "awaiting-fix";
    if (input.fix.state === "available" || input.fix.state === "ready-to-apply") return "fix-ready";
    if (input.fix.state === "applied" || input.fix.state === "verification-pending" || input.fix.state === "ineffective") {
      return input.fix.state === "ineffective" && input.fix.diagnosisStillAuthoritative
        ? "evaluation-needed"
        : "verification";
    }
  }
  if (input.guidance.stage === "review") return "recommendation-review";
  if (input.recommendation === undefined || input.guidance.stage === "active" || input.guidance.stage === "customer-replied") {
    return "evaluation-needed";
  }
  return "evaluation-needed";
}

function primaryActionForPhase(input: {
  phase: LifecyclePhase;
  guidance: OperatorGuidance;
  diagnosis: LifecycleView["diagnosis"];
  fix: LifecycleView["fix"];
  reasonCodes: string[];
}): LifecycleAction {
  const kind: LifecycleActionKind =
    input.phase === "resolved" ? "none" :
    input.phase === "recommendation-review" ? (input.guidance.stage === "review" ? "review-recommendation" : "send-customer-response") :
    input.phase === "diagnosis-ready" ? "record-diagnosis" :
    input.phase === "diagnosis-review" ? (input.diagnosis.state === "stale" ? "revalidate-diagnosis" : "review-diagnosis") :
    input.phase === "awaiting-confirmation" || input.phase === "verification" || input.phase === "evaluation-needed" ? "evaluate-ticket" :
    input.phase === "awaiting-fix" ? "record-fix-available" :
    input.phase === "fix-ready" ? (input.fix.state === "available" ? "apply-scoped-fix" : "record-fix-available") :
    input.phase === "ready-for-close" ? "resolve-ticket" :
    input.phase === "escalated" ? "specialist-review" :
    "none";
  return LifecycleActionSchema.parse({
    kind,
    availability: "primary",
    reasonCodes: input.reasonCodes,
  });
}

function lifecycleActionsForPhase(input: {
  phase: LifecyclePhase;
  primaryAction: LifecycleAction;
  diagnosis: LifecycleView["diagnosis"];
  diagnosticInvestigation: LifecycleView["diagnosticInvestigation"];
  confirmation: LifecycleView["confirmation"];
  fix: LifecycleView["fix"];
  knowledgeActionable: boolean;
}): LifecycleAction[] {
  const actions: LifecycleAction[] = [input.primaryAction];
  const add = (
    kind: LifecycleActionKind,
    availability: LifecycleAction["availability"],
    reasonCodes: string[],
  ): void => {
    if (actions.some((action) => action.kind === kind)) return;
    actions.push(LifecycleActionSchema.parse({ kind, availability, reasonCodes }));
  };
  const diagnosisBlockedReason = input.diagnosticInvestigation.state === "ambiguous"
    ? "diagnosis-ambiguous"
    : input.diagnosticInvestigation.state === "insufficient-evidence"
      ? "diagnosis-insufficient-evidence"
      : input.diagnosis.state === "rejected"
        ? "diagnosis-rejected"
        : input.diagnosis.state === "invalidated"
          ? "diagnosis-invalidated"
          : "diagnosis-not-ready";

  switch (input.phase) {
    case "evaluation-needed":
      add("review-diagnosis", "blocked", [diagnosisBlockedReason]);
      add("revalidate-diagnosis", "blocked", [diagnosisBlockedReason]);
      add(
        "reject-diagnosis",
        input.diagnosis.state === "rejected" ? "completed" : "blocked",
        input.diagnosis.state === "rejected" ? ["diagnosis-rejected"] : [diagnosisBlockedReason],
      );
      break;
    case "recommendation-review":
      add("send-customer-response", "blocked", ["recommendation-approval-required"]);
      break;
    case "diagnosis-ready":
      add("review-diagnosis", "blocked", ["diagnosis-not-recorded"]);
      add("revalidate-diagnosis", "blocked", ["diagnosis-not-recorded"]);
      add("reject-diagnosis", "blocked", ["diagnosis-not-recorded"]);
      break;
    case "diagnosis-review":
      add(
        "revalidate-diagnosis",
        input.diagnosis.state === "stale" ? "primary" : "blocked",
        input.diagnosis.state === "stale" ? ["diagnosis-stale"] : ["diagnosis-not-stale"],
      );
      add("reject-diagnosis", "available", ["operator-review"]);
      break;
    case "awaiting-confirmation":
      add("review-diagnosis", "blocked", ["diagnosis-not-confirmed"]);
      add("revalidate-diagnosis", "blocked", ["diagnosis-not-confirmed"]);
      add("reject-diagnosis", "blocked", ["diagnosis-not-confirmed"]);
      break;
    case "awaiting-fix":
      add("apply-scoped-fix", "blocked", ["fix-not-available"]);
      break;
    case "fix-ready":
      add("record-fix-available", "completed", ["fix-already-available"]);
      break;
    case "verification":
      add("record-fix-ineffective", "available", ["fix-verification-available"]);
      break;
    case "ready-for-close":
      add("send-customer-response", "completed", ["response-already-sent"]);
      break;
    case "resolved":
      add("resolve-ticket", "completed", ["already-completed"]);
      break;
    default:
      break;
  }
  if (input.knowledgeActionable) {
    add("review-pattern", "available", ["knowledge-candidate-actionable"]);
  }
  return actions;
}

function reasonCodesForPhase(input: {
  phase: LifecyclePhase;
  diagnosis: LifecycleView["diagnosis"];
  confirmation: LifecycleView["confirmation"];
  fix: LifecycleView["fix"];
}): string[] {
  if (input.phase === "waiting-for-customer") return ["awaiting-customer-reply"];
  if (input.phase === "escalated") return ["specialist-review-required"];
  const reasons: string[] = [];
  if (input.confirmation.state === "awaiting-evidence") reasons.push("missing-evidence");
  if (input.confirmation.state === "awaiting-internal-verification") reasons.push("diagnosis-not-confirmed");
  if (input.diagnosis.state === "rejected") reasons.push("diagnosis-rejected");
  if (input.diagnosis.state === "stale") reasons.push("diagnosis-stale");
  if (input.diagnosis.state === "invalidated") reasons.push("diagnosis-invalidated");
  if (input.fix.state === "awaiting") reasons.push("fix-not-available");
  if (input.fix.state === "ineffective") reasons.push("fix-ineffective");
  if (input.phase === "evaluation-needed" && reasons.length === 0) reasons.push("evaluation-required");
  if (reasons.length === 0 && input.phase === "resolved") reasons.push("already-completed");
  if (reasons.length === 0) {
    const phaseReasonCodes: Partial<Record<LifecyclePhase, string>> = {
      "recommendation-review": "recommendation-approval-required",
      "waiting-for-customer": "awaiting-customer-reply",
      "diagnosis-ready": "diagnosis-ready",
      "diagnosis-review": "diagnosis-not-approved",
      "fix-ready": "fix-ready",
      verification: "fix-verification-required",
      "ready-for-close": "ready-for-close",
      escalated: "specialist-review-required",
    };
    const phaseReasonCode = phaseReasonCodes[input.phase];
    if (phaseReasonCode !== undefined) reasons.push(phaseReasonCode);
  }
  return reasons;
}

function diagnosisProjection(input: {
  ticket: Ticket;
  audits: readonly AuditEvent[];
  latestDiagnosis: AuditEvent | undefined;
  latestReview: ReturnType<typeof latestStrictDiagnosisReviewRecord>;
  authoritative: ReturnType<typeof latestAuthoritativeDiagnosis>;
  currentWatermark: CustomerReplyWatermark;
}): LifecycleView["diagnosis"] {
  const diagnosisId = input.latestDiagnosis?.id;
  if (diagnosisId === undefined) return { state: "none", reasonCodes: [] };
  const invalidated = input.audits.some((event) =>
    (event.action as string) === "diagnosis-invalidated" &&
    event.before.diagnosisId === diagnosisId,
  );
  if (invalidated) return { state: "invalidated", diagnosisId, reasonCodes: ["diagnosis-invalidated"] };
  if (input.latestReview?.review.decision === "reject") return { state: "rejected", diagnosisId, reasonCodes: ["diagnosis-rejected"] };
  if (input.latestReview?.review.decision === "approve" || input.latestReview?.review.decision === "revalidate") {
    const stale = isDiagnosisStale({
      diagnosisTimestamp: input.latestReview.review.reviewedAt,
      diagnosisTicketRevision: input.latestReview.review.sourceTicketRevision,
      diagnosisConversationWatermark: input.latestReview.review.sourceConversationWatermark,
      currentTicketRevision: input.ticket.revision,
      latestConversationWatermark: input.currentWatermark,
    }).stale;
    if (stale || input.authoritative === undefined) return { state: "stale", diagnosisId, reasonCodes: ["diagnosis-stale"] };
    return { state: "approved", diagnosisId, reasonCodes: [] };
  }
  return { state: "recorded", diagnosisId, reasonCodes: ["diagnosis-not-approved"] };
}

function diagnosticProjection(diagnosis: DiagnosisContext | undefined): LifecycleView["diagnosticInvestigation"] {
  const state = diagnosis?.diagnosticState;
  return {
    state: state?.state ?? "not-started",
    hypotheses: state?.hypotheses ?? [],
    evidenceToRequest: state?.evidenceToRequest ?? [],
    ...(state?.escalationReason === undefined ? {} : { escalationReason: state.escalationReason }),
  };
}

function evidenceProjection(recommendation: TriageRecommendation | undefined): LifecycleView["evidence"] {
  return {
    required: recommendation?.requiredEvidence ?? [],
    provided: recommendation?.providedEvidence ?? [],
    missing: recommendation?.missingEvidence ?? [],
  };
}

function confirmationProjection(
  diagnosis: DiagnosisContext | undefined,
  evidence: LifecycleView["evidence"],
): LifecycleView["confirmation"] {
  if (diagnosis === undefined) return { state: "not-required" };
  if (diagnosis.confidence === "confirmed") return { state: "confirmed" };
  if (evidence.missing.length > 0 || diagnosis.diagnosticState?.state === "insufficient-evidence") {
    return {
      state: "awaiting-evidence",
      request: {
        owner: "customer",
        evidenceIds: evidence.missing.map((item) => item.id),
        reasonCode: "missing-evidence",
      },
    };
  }
  return {
    state: "awaiting-internal-verification",
    request: { owner: "internal", evidenceIds: [], reasonCode: "diagnosis-not-confirmed" },
  };
}

function fixProjection(input: {
  audits: readonly AuditEvent[];
  diagnosis: LifecycleView["diagnosis"];
  authoritativeDiagnosisId: string | undefined;
}): LifecycleView["fix"] {
  const fixPositions = auditCausalPositions(input.audits).filter(({ event }) =>
    ["platform-mitigation-available", "fix-available", "fix-ineffective"].includes(event.action as string),
  );
  const latest = fixPositions.at(-1)?.event;
  if (latest === undefined) {
    return {
      state: input.authoritativeDiagnosisId === undefined ? "none" : "awaiting",
      ...(input.authoritativeDiagnosisId === undefined ? {} : { diagnosisId: input.authoritativeDiagnosisId }),
      reasonCodes: input.authoritativeDiagnosisId === undefined ? [] : ["fix-not-available"],
      diagnosisStillAuthoritative: input.diagnosis.state === "approved",
    };
  }
  const diagnosisId = typeof latest.before.diagnosisId === "string"
    ? latest.before.diagnosisId
    : input.authoritativeDiagnosisId;
  if ((latest.action as string) === "fix-ineffective") {
    const invalidated = latest.after.diagnosisInvalidated === true || input.diagnosis.state === "invalidated";
    return {
      state: "ineffective",
      ...(diagnosisId === undefined ? {} : { diagnosisId }),
      fixEventId: latest.id,
      reasonCodes: ["fix-ineffective"],
      diagnosisStillAuthoritative: !invalidated,
    };
  }
  const state = latest.action === "platform-mitigation-available" ? "available" : "applied";
  return {
    state,
    ...(diagnosisId === undefined ? {} : { diagnosisId }),
    fixEventId: latest.id,
    reasonCodes: [],
    diagnosisStillAuthoritative: input.diagnosis.state === "approved",
  };
}

function responseProjection(input: {
  phase: LifecyclePhase;
  recommendation: TriageRecommendation | undefined;
  audits: readonly AuditEvent[];
}): LifecycleView["response"] {
  const intent = input.phase === "verification"
    ? "fix-verification"
    : input.phase === "ready-for-close"
      ? "closure"
      : (input.recommendation?.missingEvidence?.length ?? 0) > 0
        ? "evidence-request"
        : "diagnosis-update";
  const latestSent = latestAuditPosition(input.audits, (event) => event.action === "customer-response-sent");
  const latestReply = latestAuditPosition(input.audits, (event) => event.action === "customer-reply-received");
  if (latestSent !== undefined && (latestReply === undefined || compareAuditCausalOrder(latestSent, latestReply) > 0)) {
    return { intent, state: "waiting-for-reply" };
  }
  if (input.recommendation?.resolution === "pending") return { intent, state: "approval-required" };
  if (input.recommendation?.resolution === "approved" && latestSent === undefined) return { intent, state: "approved" };
  return { intent, state: "none" };
}

function knowledgeProjection(guidance: OperatorGuidance): LifecycleView["knowledge"] {
  const knowledge = guidance.knowledgePattern;
  return {
    state: knowledge.state,
    actionable: knowledge.actionable,
    ...(knowledge.candidateId === undefined ? {} : { candidateId: knowledge.candidateId }),
    ...(knowledge.reason === undefined ? {} : { reason: knowledge.reason }),
    ...(knowledge.actionable ? { secondaryAction: "review-pattern" as const } : {}),
  };
}

function latestRecommendation(input: WorkflowLifecycleInput): TriageRecommendation | undefined {
  const submissions = new Map<string, AuditCausalPosition>();
  for (const position of auditCausalPositions(input.audits)) {
    if (position.event.action !== "recommendation-submitted" || position.event.recommendationId === undefined) continue;
    const current = submissions.get(position.event.recommendationId);
    if (current === undefined || compareAuditCausalOrder(position, current) > 0) submissions.set(position.event.recommendationId, position);
  }
  return input.recommendations
    .filter((recommendation) => recommendation.ticketId === input.ticket.id && ["pending", "approved"].includes(recommendation.resolution))
    .sort((left, right) => {
      const leftPosition = submissions.get(left.id);
      const rightPosition = submissions.get(right.id);
      if (leftPosition !== undefined && rightPosition !== undefined) {
        const causal = compareAuditCausalOrder(rightPosition, leftPosition);
        if (causal !== 0) return causal;
      }
      return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
    })[0];
}

function conversationWatermarkFromAudits(audits: readonly AuditEvent[]): CustomerReplyWatermark {
  const latest = latestAuditPosition(audits, (event) => event.action === "customer-reply-received");
  return latest === undefined
    ? { state: "none" }
    : { state: "reply", timestamp: latest.event.timestamp, id: latest.event.id };
}
