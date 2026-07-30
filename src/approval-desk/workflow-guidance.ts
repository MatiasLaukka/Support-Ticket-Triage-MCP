import { z } from "zod";
import {
  ApprovedFieldSchema,
  type ApprovedField,
  type AuditEvent,
  type Ticket,
  type TriageRecommendation,
} from "../domain.js";
import type {
  CustomerReplyWatermark,
  DiagnosisContext,
} from "../triage-service.js";
import {
  diagnosisContextForTicket,
  diagnosisContextFromAudit,
} from "./diagnostic-workflow.js";
import {
  compareIsoInstants,
  isDiagnosisStale,
  latestStrictDiagnosisReviewRecord,
  type DiagnosisReviewDecision,
} from "./diagnosis-review.js";
import { DiagnosticStateSnapshotSchema } from "./diagnostic-state.js";
import {
  auditCausalPositions,
  auditPositionForEvent,
  compareAuditCausalOrder,
  hasCustomerReplyAfterRecommendation,
  latestAuditPosition,
  latestRecommendationSubmissionPosition,
  type AuditCausalPosition,
} from "./workflow-causal-context.js";

export const OperatorGuidanceSchema = z
  .object({
    stage: z.enum([
      "active",
      "review",
      "waiting-customer",
      "customer-replied",
      "diagnosis-ready",
      "diagnosis-recorded",
      "fix-ready",
      "verification",
      "ready-for-close",
      "escalated",
      "closed",
    ]),
    changed: z.string().trim().min(1),
    nextAction: z.enum([
      "evaluate-ticket",
      "review-recommendation",
      "review-diagnosis",
      "wait-for-customer",
      "record-diagnosis",
      "mark-fix-available",
      "close-ticket",
      "specialist-review",
      "none",
    ]),
    reason: z.string().trim().min(1),
    approval: z
      .object({
        required: z.boolean(),
        fields: z.array(ApprovedFieldSchema),
      })
      .strict(),
    unlocksTool: z
      .enum([
        "evaluate_ticket",
        "mark_response_done",
        "record_diagnosis",
        "review_diagnosis",
        "mark_fix_available",
        "close_ticket",
      ])
      .optional(),
    blockers: z.array(z.string().trim().min(1)),
    customerNextStep: z.string().trim().min(1).optional(),
  })
  .strict();

export type OperatorGuidance = z.infer<typeof OperatorGuidanceSchema>;

interface RecommendationBlockerInput {
  recommendation: TriageRecommendation | undefined;
  audits: readonly AuditEvent[];
}

export function diagnosisBlockers(
  input: RecommendationBlockerInput,
): string[] {
  const { recommendation, audits } = input;
  if (recommendation === undefined) {
    return ["A completed evaluation is required before diagnosis."];
  }

  const blockers: string[] = [];
  if (recommendation.supportState === "escalated") {
    blockers.push(
      "Specialist review must complete before automated diagnosis continues.",
    );
  }
  const knownCauseReady = recommendation.supportState === "known-cause";
  if (!knownCauseReady && (recommendation.missingEvidence?.length ?? 0) > 0) {
    blockers.push("Diagnosis requires all required evidence to be gathered.");
  }
  if (
    !knownCauseReady &&
    !["diagnosing", "waiting-on-platform-fix"].includes(
      recommendation.supportState ?? "",
    )
  ) {
    blockers.push("Diagnosis requires a diagnosis-ready ticket state.");
  }
  const sent = latestSentResponsePositionForRecommendation(
    audits,
    recommendation.id,
  );
  if (sent === undefined) {
    blockers.push("The evaluated response must be marked done before diagnosis.");
  }
  const latestReply = latestAuditPosition(
    audits,
    (event) => event.action === "customer-reply-received",
  );
  if (
    sent !== undefined &&
    latestReply !== undefined &&
    compareAuditCausalOrder(latestReply, sent) > 0
  ) {
    blockers.push("Evaluate the latest customer reply before diagnosis.");
  }
  const latestDiagnosis = latestAuditPosition(
    audits,
    (event) => event.action === "diagnosis-completed",
  );
  if (
    latestDiagnosis !== undefined &&
    (latestReply === undefined ||
      compareAuditCausalOrder(latestDiagnosis, latestReply) > 0)
  ) {
    blockers.push("Diagnosis has already been recorded for the latest context.");
  }
  return blockers;
}

export function fixBlockers(input: {
  ticket: Pick<Ticket, "revision">;
  audits: readonly AuditEvent[];
  diagnosisId?: string;
}): string[] {
  const latestRecordedDiagnosis = latestDiagnosisAudit(input.audits);
  if (latestRecordedDiagnosis === undefined) {
    return ["A completed diagnosis is required before marking a fix available."];
  }

  const blockers: string[] = [];
  const selectedAuthoritative = latestAuthoritativeDiagnosis(
    latestRecordedDiagnosis.ticketId,
    input.audits,
  );
  const authoritative = selectedAuthoritative !== undefined &&
      selectedAuthoritative.review.sourceTicketRevision === input.ticket.revision &&
      (input.diagnosisId === undefined ||
        selectedAuthoritative.diagnosisId === input.diagnosisId)
    ? selectedAuthoritative
    : undefined;
  if (authoritative === undefined) {
    blockers.push(
      "An approved current diagnosis is required before marking a fix available.",
    );
  }
  const diagnosis = authoritative?.diagnosis ?? diagnosisFromAudit(latestRecordedDiagnosis);
  if (diagnosis?.confidence !== "confirmed") {
    blockers.push(
      "A confirmed diagnosis is required before marking a fix available.",
    );
  }
  if (
    !["engineering", "integration-partner"].includes(
      String(diagnosis?.owner),
    )
  ) {
    blockers.push("This confirmed diagnosis does not require a platform fix.");
  }
  const diagnosticState = diagnosticStateFromDiagnosis(diagnosis);
  if (diagnosticState?.state === "ambiguous") {
    blockers.push(
      "A diagnosis with unresolved plausible causes cannot unlock a fix.",
    );
  }
  if (diagnosticState?.state === "escalated") {
    blockers.push("An escalated diagnosis cannot unlock a fix.");
  }
  const latestFix = latestAuditPosition(
    input.audits,
    (event) => event.action === "fix-available",
  );
  const authoritativePosition = authoritative === undefined
    ? undefined
    : auditPositionForEvent(input.audits, authoritative.reviewAudit);
  const diagnosisPositionForExistingFix = authoritativePosition ??
    auditPositionForEvent(input.audits, latestRecordedDiagnosis);
  if (
    latestFix !== undefined &&
    diagnosisPositionForExistingFix !== undefined &&
    compareAuditCausalOrder(latestFix, diagnosisPositionForExistingFix) > 0
  ) {
    blockers.push("A fix has already been recorded for the latest diagnosis.");
  }
  const sent = latestAuditPosition(
    input.audits,
    (event) => event.action === "customer-response-sent",
  );
  const recordedDiagnosisPosition = auditPositionForEvent(
    input.audits,
    latestRecordedDiagnosis,
  );
  if (
    sent === undefined ||
    (recordedDiagnosisPosition !== undefined &&
      compareAuditCausalOrder(sent, recordedDiagnosisPosition) <= 0)
  ) {
    blockers.push("Send the diagnosis response before marking a fix available.");
  }
  const latestReply = latestAuditPosition(
    input.audits,
    (event) => event.action === "customer-reply-received",
  );
  if (
    sent !== undefined &&
    latestReply !== undefined &&
    compareAuditCausalOrder(latestReply, sent) > 0
  ) {
    blockers.push("Evaluate the latest customer reply before marking a fix available.");
  }
  return blockers;
}

export function closeBlockers(input: {
  ticket: Ticket;
  recommendation: TriageRecommendation | undefined;
  audits: readonly AuditEvent[];
}): string[] {
  const blockers: string[] = [];
  if (input.ticket.status === "resolved") {
    blockers.push("Ticket is already closed.");
  }
  const latestDiagnosis = latestDiagnosisAudit(input.audits);
  const selectedAuthoritativeDiagnosis = latestDiagnosis === undefined
    ? undefined
    : latestAuthoritativeDiagnosis(input.ticket.id, input.audits);
  const authoritativeDiagnosis = selectedAuthoritativeDiagnosis !== undefined &&
      selectedAuthoritativeDiagnosis.review.sourceTicketRevision === input.ticket.revision
    ? selectedAuthoritativeDiagnosis
    : undefined;
  const latestFix = latestFixAudit(input.audits);
  const latestCustomerReply = latestAuditPosition(
    input.audits,
    (event) => event.action === "customer-reply-received",
  );
  const latestFixPosition = latestFix === undefined
    ? undefined
    : auditPositionForEvent(input.audits, latestFix);
  const authoritativeDiagnosisAtFix = latestFixPosition === undefined
    ? undefined
    : latestAuthoritativeDiagnosis(
        input.ticket.id,
        input.audits.slice(0, latestFixPosition.index),
      );
  const closureUsesRecordedFix =
    input.recommendation?.supportState === "ready-for-close" &&
    latestDiagnosis !== undefined &&
    latestFixPosition !== undefined &&
    authoritativeDiagnosisAtFix !== undefined &&
    compareAuditCausalOrder(
      latestFixPosition,
      {
        event: latestDiagnosis,
        index: input.audits.indexOf(latestDiagnosis),
      },
    ) > 0 &&
    (latestCustomerReply === undefined ||
      compareAuditCausalOrder(latestFixPosition, latestCustomerReply) > 0);
  if (
    latestDiagnosis !== undefined &&
    authoritativeDiagnosis === undefined &&
    !closureUsesRecordedFix
  ) {
    blockers.push("A current approved diagnosis is required before ticket closure.");
  }
  const diagnosticState = diagnosticStateFromDiagnosis(
    authoritativeDiagnosis?.diagnosis ??
      (latestDiagnosis === undefined ? undefined : diagnosisFromAudit(latestDiagnosis)),
  );
  if (diagnosticState?.state === "ambiguous") {
    blockers.push("An ambiguous diagnosis cannot unlock ticket closure.");
  }
  if (diagnosticState?.state === "escalated") {
    blockers.push("An escalated diagnosis cannot unlock ticket closure.");
  }
  if (input.recommendation?.supportState !== "ready-for-close") {
    blockers.push(
      "Ticket must have a ready-to-close recommendation before it can be closed.",
    );
  }
  if (
    input.recommendation !== undefined &&
    hasCustomerReplyAfterRecommendation(input.audits, input.recommendation)
  ) {
    blockers.push("Evaluate the latest customer reply before closing the ticket.");
  }
  if (
    input.recommendation === undefined ||
    latestSentResponsePositionForRecommendation(
      input.audits,
      input.recommendation.id,
    ) ===
      undefined
  ) {
    blockers.push(
      "The ready-to-close response must be marked done before the ticket can be closed.",
    );
  }
  return blockers;
}

export function buildOperatorGuidance(input: {
  ticket: Ticket;
  recommendations: readonly TriageRecommendation[];
  audits: readonly AuditEvent[];
}): OperatorGuidance {
  const latest = latestCurrentRecommendation(input);
  const latestDiagnosticContext =
    latest === undefined
      ? undefined
      : diagnosisContextForTicket(input.ticket, latest, input.audits);
  const noApproval = { required: false as const, fields: [] as ApprovedField[] };

  if (input.ticket.status === "resolved") {
    return OperatorGuidanceSchema.parse({
      stage: "closed",
      changed: "The ticket is resolved.",
      nextAction: "none",
      reason: "The governed ticket lifecycle is complete.",
      approval: noApproval,
      blockers: [],
    });
  }

  const closingBlockers = closeBlockers({
    ticket: input.ticket,
    recommendation: latest,
    audits: input.audits,
  });
  if (closingBlockers.length === 0) {
    return OperatorGuidanceSchema.parse({
      stage: "ready-for-close",
      changed: "The ready-to-close response was sent.",
      nextAction: "close-ticket",
      reason: "All enforced close-ticket preconditions are satisfied.",
      approval: noApproval,
      unlocksTool: "close_ticket",
      blockers: [],
    });
  }

  const latestReply = latestAuditPosition(
    input.audits,
    (event) => event.action === "customer-reply-received",
  );
  if (
    latestReply !== undefined &&
    (latest === undefined || hasCustomerReplyAfterRecommendation(input.audits, latest))
  ) {
    return OperatorGuidanceSchema.parse({
      stage: "customer-replied",
      changed: "The customer replied after the latest evaluation.",
      nextAction: "evaluate-ticket",
      reason:
        "The latest customer context must be evaluated before lifecycle work continues.",
      approval: noApproval,
      unlocksTool: "evaluate_ticket",
      blockers: [],
    });
  }

  if (latest?.resolution === "pending") {
    return OperatorGuidanceSchema.parse({
      stage: "review",
      changed: "A pending recommendation is awaiting human review.",
      nextAction: "review-recommendation",
      reason:
        "Explicit approval is required before applying fields or sending a response.",
      approval: {
        required: true,
        fields: changedApprovalFields(input.ticket, latest),
      },
      unlocksTool: "mark_response_done",
      blockers: [],
    });
  }

  const latestDiagnosis = latestDiagnosisAudit(input.audits);
  const latestRecordedDiagnosticState = diagnosticStateFromDiagnosis(
    latestDiagnosis === undefined ? undefined : diagnosisFromAudit(latestDiagnosis),
  );
  const latestDiagnosisReview = latestDiagnosis === undefined
    ? undefined
    : latestStrictDiagnosisReviewRecord(input.audits, latestDiagnosis.id);
  if (
    latest?.supportState === "escalated" ||
    latestDiagnosticContext?.diagnosticState?.state === "escalated" ||
    latestDiagnosis?.action === "diagnostic-escalated" ||
    latestRecordedDiagnosticState?.state === "escalated"
  ) {
    return OperatorGuidanceSchema.parse({
      stage: "escalated",
      changed: "The ticket was escalated for specialist review.",
      nextAction: "specialist-review",
      reason:
        "Specialist review is required before further diagnostic or fix work.",
      approval: noApproval,
      blockers: [],
      customerNextStep:
        "No further diagnostic action is required from you right now; support will update you after specialist review.",
    });
  }

  if (
    latestDiagnosisReview !== undefined &&
    (latestDiagnosisReview.review.decision === "approve" ||
      latestDiagnosisReview.review.decision === "revalidate") &&
    latestDiagnosisReview.review.sourceTicketRevision !== input.ticket.revision
  ) {
    return OperatorGuidanceSchema.parse({
      stage: "diagnosis-recorded",
      changed: "The ticket changed after the prior diagnosis review.",
      nextAction: "review-diagnosis",
      reason:
        "The unchanged diagnosis must be revalidated against the current ticket revision before it can unlock governed fix or closure work.",
      approval: { required: true, fields: [] },
      unlocksTool: "review_diagnosis",
      blockers: [],
    });
  }

  const latestFix = latestFixAudit(input.audits);
  const hasNewerFix = isAuditNewerThanRecommendation(
    latestFix,
    latest,
    input.audits,
  );
  const fixingBlockers = fixBlockers({
    ticket: input.ticket,
    audits: input.audits,
  });
  if (fixingBlockers.length === 0 && !hasNewerFix) {
    return OperatorGuidanceSchema.parse({
      stage: "fix-ready",
      changed: "A confirmed platform-owned diagnosis was recorded.",
      nextAction: "mark-fix-available",
      reason: "All enforced fix-available preconditions are satisfied.",
      approval: noApproval,
      unlocksTool: "mark_fix_available",
      blockers: [],
    });
  }

  if (hasNewerFix) {
    return OperatorGuidanceSchema.parse({
      stage: "verification",
      changed: "A fix was recorded after the latest evaluation.",
      nextAction: "evaluate-ticket",
      reason:
        "The recorded fix must be evaluated before preparing customer verification.",
      approval: noApproval,
      unlocksTool: "evaluate_ticket",
      blockers: [],
      customerNextStep:
        "No customer action is required until support sends the reviewed verification request.",
    });
  }

  if (
    isAuditNewerThanRecommendation(
      latestDiagnosis,
      latest,
      input.audits,
    )
  ) {
    if (latestRecordedDiagnosticState?.state === "ambiguous") {
      return OperatorGuidanceSchema.parse({
        stage: "diagnosis-recorded",
        changed: "The recorded diagnosis still has unresolved plausible causes.",
        nextAction: "evaluate-ticket",
        reason:
          "The requested diagnostic evidence must resolve the ambiguity before human review can make a diagnosis authoritative.",
        approval: noApproval,
        unlocksTool: "evaluate_ticket",
        blockers: [],
        customerNextStep: customerNextStepForGuidance(
          diagnosisContextFromAudit(latestDiagnosis),
        ),
      });
    }
    const authoritativeDiagnosis = latestDiagnosis === undefined
      ? undefined
      : latestAuthoritativeDiagnosis(input.ticket.id, input.audits);
    if (authoritativeDiagnosis === undefined) {
      return OperatorGuidanceSchema.parse({
        stage: "diagnosis-recorded",
        changed: "A diagnosis was recorded and is awaiting human review.",
        nextAction: "review-diagnosis",
        reason:
          "The diagnosis must be approved or revalidated before it can unlock governed fix or closure work.",
        approval: { required: true, fields: [] },
        unlocksTool: "review_diagnosis",
        blockers: [],
      });
    }
    return OperatorGuidanceSchema.parse({
      stage: "diagnosis-recorded",
      changed: "A diagnosis was recorded after the latest evaluation.",
      nextAction: "evaluate-ticket",
      reason:
        "The recorded diagnosis must be evaluated before preparing the next customer response.",
      approval: noApproval,
      unlocksTool: "evaluate_ticket",
      blockers: [],
      customerNextStep:
        "No customer action is required until support sends the reviewed diagnostic update.",
    });
  }

  const diagnosingBlockers = diagnosisBlockers({
    recommendation: latest,
    audits: input.audits,
  });
  if (diagnosingBlockers.length === 0) {
    return OperatorGuidanceSchema.parse({
      stage: "diagnosis-ready",
      changed: "The latest evaluated response was sent with diagnosis-ready evidence.",
      nextAction: "record-diagnosis",
      reason: "All enforced diagnosis preconditions are satisfied.",
      approval: noApproval,
      unlocksTool: "record_diagnosis",
      blockers: [],
    });
  }

  const latestSent =
    latest === undefined
      ? latestAuditPosition(
          input.audits,
          (event) => event.action === "customer-response-sent",
        )
      : latestSentResponsePositionForRecommendation(input.audits, latest.id);
  if (
    latestSent !== undefined &&
    (latestReply === undefined ||
      compareAuditCausalOrder(latestReply, latestSent) <= 0)
  ) {
    return OperatorGuidanceSchema.parse({
      stage: "waiting-customer",
      changed: "The latest approved response was sent.",
      nextAction: "wait-for-customer",
      reason: "No newer customer reply is available to evaluate.",
      approval: noApproval,
      blockers: diagnosingBlockers,
      customerNextStep: customerNextStepForGuidance(latestDiagnosticContext),
    });
  }

  return OperatorGuidanceSchema.parse({
    stage: "active",
    changed: "The ticket is active without a pending governed step.",
    nextAction: "evaluate-ticket",
    reason: "A fresh evaluation will determine the next governed recommendation.",
    approval: noApproval,
    unlocksTool: "evaluate_ticket",
    blockers: diagnosingBlockers,
  });
}

function customerNextStepForGuidance(
  diagnosis: DiagnosisContext | undefined,
): string {
  const evidenceToRequest =
    diagnosis?.diagnosticState?.state === "ambiguous"
      ? diagnosis.diagnosticState.evidenceToRequest
      : [];
  if (evidenceToRequest.length > 0) {
    return `Reply with the targeted diagnostic details: ${evidenceToRequest.join(" ")}`;
  }
  return "Reply with the requested information or verification result.";
}

function changedApprovalFields(
  ticket: Ticket,
  recommendation: TriageRecommendation,
): ApprovedField[] {
  const fields: ApprovedField[] = [];
  for (const field of ["category", "priority", "team"] as const) {
    if (ticket[field] !== recommendation[field]) {
      fields.push(field);
    }
  }
  if (
    recommendation.assignee !== undefined &&
    (ticket.assignee ?? null) !== recommendation.assignee
  ) {
    fields.push("assignee");
  }
  if (
    recommendation.ticketStatus !== undefined &&
    ticket.status !== recommendation.ticketStatus
  ) {
    fields.push("status");
  }
  if (
    recommendation.tags !== undefined &&
    !arraysEqual(ticket.tags, recommendation.tags)
  ) {
    fields.push("tags");
  }
  fields.push("customerResponse");
  return fields;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function latestCurrentRecommendation(input: {
  ticket: Ticket;
  recommendations: readonly TriageRecommendation[];
  audits: readonly AuditEvent[];
}): TriageRecommendation | undefined {
  const submittedPositions = new Map<string, AuditCausalPosition>();
  auditCausalPositions(input.audits).forEach((position) => {
    const { event } = position;
    if (
      event.action === "recommendation-submitted" &&
      event.recommendationId !== undefined
    ) {
      const current = submittedPositions.get(event.recommendationId);
      if (
        current === undefined ||
        compareAuditCausalOrder(position, current) > 0
      ) {
        submittedPositions.set(event.recommendationId, position);
      }
    }
  });
  return input.recommendations
    .filter(
      (recommendation) =>
        recommendation.ticketId === input.ticket.id &&
        ["pending", "approved"].includes(recommendation.resolution),
    )
    .sort((left, right) => {
      const leftSubmission = submittedPositions.get(left.id);
      const rightSubmission = submittedPositions.get(right.id);
      if (leftSubmission !== undefined && rightSubmission !== undefined) {
        const causalOrder = compareAuditCausalOrder(
          rightSubmission,
          leftSubmission,
        );
        if (causalOrder !== 0) return causalOrder;
      }
      return compareIsoInstants(right.createdAt, left.createdAt) ||
        right.id.localeCompare(left.id);
    })[0];
}

export function latestDiagnosisAudit(
  audits: readonly AuditEvent[],
): AuditEvent | undefined {
  return audits
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        (event.action === "diagnosis-completed" ||
          event.action === "diagnostic-escalated") &&
        typeof event.after.diagnosis === "object" &&
        event.after.diagnosis !== null,
    )
    .sort(
      (left, right) => compareAuditCausalOrder(right, left),
    )[0]?.event;
}

export interface AuthoritativeDiagnosis {
  diagnosisId: string;
  diagnosis: DiagnosisContext;
  originalDiagnosis: AuditEvent;
  review: DiagnosisReviewDecision;
  reviewAudit: AuditEvent;
}

export function latestAuthoritativeDiagnosis(
  ticketId: string,
  audits: readonly AuditEvent[],
): AuthoritativeDiagnosis | undefined {
  const candidates = audits.flatMap((originalDiagnosis) => {
    if (
      originalDiagnosis.ticketId !== ticketId ||
      (originalDiagnosis.action !== "diagnosis-completed" &&
        originalDiagnosis.action !== "diagnostic-escalated") ||
      diagnosisContextFromAudit(originalDiagnosis) === undefined
    ) {
      return [];
    }
    const reviewRecord = latestStrictDiagnosisReviewRecord(
      audits,
      originalDiagnosis.id,
    );
    const review = reviewRecord?.review;
    if (
      review === undefined ||
      (review.decision !== "approve" && review.decision !== "revalidate")
    ) {
      return [];
    }
    const reviewAudit = reviewRecord;
    if (reviewAudit === undefined) return [];
    const diagnosis = diagnosisContextFromAudit(reviewAudit.event);
    if (diagnosis === undefined) return [];

    const latestConversationWatermark = conversationWatermarkFromAudits(audits);
    const baseStaleness = isDiagnosisStale({
      diagnosisTimestamp: review.reviewedAt,
      diagnosisTicketRevision: review.sourceTicketRevision,
      diagnosisConversationWatermark: review.sourceConversationWatermark,
      currentTicketRevision: review.sourceTicketRevision,
      latestConversationWatermark,
    });
    const laterInvalidation = audits.some((event, index) => {
      if (event === reviewAudit.event || event.ticketId !== ticketId) return false;
      if (
        event.action !== "diagnosis-completed" &&
        event.action !== "diagnostic-escalated" &&
        event.action !== "fix-available"
      ) {
        return false;
      }
      return compareAuditCausalOrder(
        { event, index },
        reviewAudit,
      ) > 0;
    });
    if (baseStaleness.stale || laterInvalidation) return [];
    return [{
      diagnosisId: originalDiagnosis.id,
      diagnosis,
      originalDiagnosis,
      review,
      reviewAudit: reviewAudit.event,
      auditIndex: reviewAudit.index,
    }];
  });

  const latest = candidates.sort((left, right) =>
    compareAuditCausalOrder(
      { event: right.reviewAudit, index: right.auditIndex },
      { event: left.reviewAudit, index: left.auditIndex },
    ))[0];
  if (latest === undefined) return undefined;
  const { auditIndex: _auditIndex, ...authoritative } = latest;
  return authoritative;
}

function latestFixAudit(audits: readonly AuditEvent[]): AuditEvent | undefined {
  return audits
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.action === "fix-available" &&
        typeof event.after.fix === "object" &&
        event.after.fix !== null,
    )
    .sort(
      (left, right) => compareAuditCausalOrder(right, left),
    )[0]?.event;
}

function isAuditNewerThanRecommendation(
  event: AuditEvent | undefined,
  recommendation: TriageRecommendation | undefined,
  audits: readonly AuditEvent[],
): boolean {
  if (event === undefined) {
    return false;
  }
  if (recommendation === undefined) {
    return true;
  }
  const auditPosition = auditPositionForEvent(audits, event);
  const submission = latestRecommendationSubmissionPosition(
    audits,
    recommendation.id,
  );
  if (auditPosition !== undefined && submission !== undefined) {
    return compareAuditCausalOrder(auditPosition, submission) > 0;
  }
  return compareIsoInstants(event.timestamp, recommendation.createdAt) > 0;
}

function diagnosisFromAudit(
  event: AuditEvent,
): Record<string, unknown> | undefined {
  return typeof event.after.diagnosis === "object" &&
    event.after.diagnosis !== null
    ? (event.after.diagnosis as Record<string, unknown>)
    : undefined;
}

function conversationWatermarkFromAudits(
  audits: readonly AuditEvent[],
): CustomerReplyWatermark {
  const latestReply = audits
    .filter((event) => event.action === "customer-reply-received")
    .at(-1);
  return latestReply === undefined
    ? { state: "none" }
    : { state: "reply", timestamp: latestReply.timestamp, id: latestReply.id };
}

function diagnosticStateFromDiagnosis(
  diagnosis: { diagnosticState?: unknown } | undefined,
) {
  return DiagnosticStateSnapshotSchema.safeParse(
    diagnosis?.diagnosticState,
  ).data;
}

function latestSentResponsePositionForRecommendation(
  audits: readonly AuditEvent[],
  recommendationId: string,
): AuditCausalPosition | undefined {
  return latestAuditPosition(
    audits,
    (event) =>
      event.action === "customer-response-sent" &&
      event.recommendationId === recommendationId,
  );
}
