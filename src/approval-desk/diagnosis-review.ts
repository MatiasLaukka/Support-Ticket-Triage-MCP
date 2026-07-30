import { z } from "zod";
import {
  AuditEventSchema,
  CustomerReplyWatermarkSchema,
  DiagnosisIdSchema,
  IsoTimestampSchema,
  TicketIdSchema,
  type AuditEvent,
} from "../domain.js";
import { DiagnosisContextSchema } from "../triage-service.js";

const NonBlankStringSchema = z.string().trim().min(1);
const TicketRevisionSchema = z.number().int().nonnegative();

export const DiagnosisReviewDecisionSchema = z
  .object({
    decision: z.enum(["approve", "reject", "revalidate"]),
    diagnosisId: DiagnosisIdSchema,
    ticketId: TicketIdSchema,
    sourceTicketRevision: TicketRevisionSchema,
    sourceConversationWatermark: CustomerReplyWatermarkSchema,
    editedDiagnosis: DiagnosisContextSchema,
    actor: NonBlankStringSchema,
    rationale: NonBlankStringSchema.optional(),
    reviewedAt: IsoTimestampSchema,
  })
  .strict()
  .superRefine((decision, context) => {
    if (
      (decision.decision === "reject" || decision.decision === "revalidate") &&
      decision.rationale === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["rationale"],
        message: "Reject and revalidate diagnosis reviews require a rationale.",
      });
    }
  });

const DiagnosisImpactSetTicketSchema = z
  .object({
    ticketId: TicketIdSchema,
    reason: NonBlankStringSchema,
  })
  .strict();

export const DiagnosisImpactSetSchema = z
  .object({
    tickets: z.array(DiagnosisImpactSetTicketSchema).min(1),
    actor: NonBlankStringSchema,
    rationale: NonBlankStringSchema,
  })
  .strict()
  .superRefine((impactSet, context) => {
    const ticketIds = new Set<string>();
    impactSet.tickets.forEach((ticket, index) => {
      if (ticketIds.has(ticket.ticketId)) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "ticketId"],
          message: "Impact-set ticket IDs must be unique.",
        });
      }
      ticketIds.add(ticket.ticketId);
    });
  });

export const DiagnosisStaleReasonSchema = z.enum([
  "newer-customer-reply",
  "newer-ticket-revision",
  "contradictory-evidence",
  "newer-diagnosis",
  "newer-diagnosis-review",
  "invalidating-fix-signal",
  "invalidating-event-signal",
  "knowledge-workflow-changed",
]);

const OriginalDiagnosisAuditSchema = AuditEventSchema.refine(
  (event) =>
    (event.action === "diagnosis-completed" ||
      event.action === "diagnostic-escalated") &&
    typeof event.after.diagnosis === "object" &&
    event.after.diagnosis !== null &&
    DiagnosisContextSchema.safeParse(event.after.diagnosis).success,
  "Original diagnosis must be a diagnosis audit event.",
);

export const DiagnosisReviewSnapshotSchema = z
  .object({
    originalDiagnosis: OriginalDiagnosisAuditSchema,
    latestReview: DiagnosisReviewDecisionSchema.nullable(),
    stale: z.boolean(),
    staleReasons: z.array(DiagnosisStaleReasonSchema),
    sourceTicketRevision: TicketRevisionSchema,
    sourceConversationWatermark: CustomerReplyWatermarkSchema,
  })
  .strict();

export type DiagnosisReviewInput = z.infer<
  typeof DiagnosisReviewDecisionSchema
>;
export type DiagnosisReviewDecision = DiagnosisReviewInput;
export type DiagnosisImpactSet = z.infer<typeof DiagnosisImpactSetSchema>;
export type DiagnosisReviewSnapshot = z.infer<
  typeof DiagnosisReviewSnapshotSchema
>;

export const DiagnosisStalenessInputSchema = z
  .object({
    diagnosisTimestamp: IsoTimestampSchema,
    diagnosisTicketRevision: TicketRevisionSchema,
    diagnosisReplyWatermark: IsoTimestampSchema.optional(),
    diagnosisConversationWatermark: CustomerReplyWatermarkSchema.optional(),
    currentTicketRevision: TicketRevisionSchema,
    latestReplyAt: IsoTimestampSchema.optional(),
    latestConversationWatermark: CustomerReplyWatermarkSchema.optional(),
    contradictoryEvidence: z.boolean().optional(),
    newerDiagnosisAt: IsoTimestampSchema.optional(),
    newerReviewAt: IsoTimestampSchema.optional(),
    invalidatingFixAt: IsoTimestampSchema.optional(),
    invalidatingEventAt: IsoTimestampSchema.optional(),
    knowledgeWorkflowChanged: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const diagnosisTimestamp = input.diagnosisConversationWatermark?.state === "reply"
      ? input.diagnosisConversationWatermark.timestamp
      : undefined;
    if (
      diagnosisTimestamp !== undefined &&
      input.diagnosisReplyWatermark !== undefined &&
      diagnosisTimestamp !== input.diagnosisReplyWatermark
    ) {
      context.addIssue({
        code: "custom",
        path: ["diagnosisReplyWatermark"],
        message: "Diagnosis reply watermark must agree with the conversation watermark.",
      });
    }
    const latestTimestamp = input.latestConversationWatermark?.state === "reply"
      ? input.latestConversationWatermark.timestamp
      : undefined;
    if (
      latestTimestamp !== undefined &&
      input.latestReplyAt !== undefined &&
      latestTimestamp !== input.latestReplyAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["latestReplyAt"],
        message: "Latest reply timestamp must agree with the conversation watermark.",
      });
    }
  });

export const DiagnosisStalenessSchema = z
  .object({
    stale: z.boolean(),
    staleReasons: z.array(DiagnosisStaleReasonSchema),
  })
  .strict();

export type DiagnosisStalenessInput = z.infer<
  typeof DiagnosisStalenessInputSchema
>;
export type DiagnosisStaleReason = z.infer<typeof DiagnosisStaleReasonSchema>;
export type DiagnosisStaleness = z.infer<typeof DiagnosisStalenessSchema>;

export function isDiagnosisStale(input: DiagnosisStalenessInput): DiagnosisStaleness {
  const staleness = DiagnosisStalenessInputSchema.parse(input);
  const staleReasons: DiagnosisStaleReason[] = [];

  if (hasNewerCustomerReply(staleness)) {
    staleReasons.push("newer-customer-reply");
  }
  if (staleness.currentTicketRevision > staleness.diagnosisTicketRevision) {
    staleReasons.push("newer-ticket-revision");
  }
  if (staleness.contradictoryEvidence === true) {
    staleReasons.push("contradictory-evidence");
  }
  if (
    staleness.newerDiagnosisAt !== undefined &&
    isAfter(staleness.newerDiagnosisAt, staleness.diagnosisTimestamp)
  ) {
    staleReasons.push("newer-diagnosis");
  }
  if (
    staleness.newerReviewAt !== undefined &&
    isAfter(staleness.newerReviewAt, staleness.diagnosisTimestamp)
  ) {
    staleReasons.push("newer-diagnosis-review");
  }
  if (
    staleness.invalidatingFixAt !== undefined &&
    isAfter(staleness.invalidatingFixAt, staleness.diagnosisTimestamp)
  ) {
    staleReasons.push("invalidating-fix-signal");
  }
  if (
    staleness.invalidatingEventAt !== undefined &&
    isAfter(staleness.invalidatingEventAt, staleness.diagnosisTimestamp)
  ) {
    staleReasons.push("invalidating-event-signal");
  }
  if (staleness.knowledgeWorkflowChanged === true) {
    staleReasons.push("knowledge-workflow-changed");
  }

  return DiagnosisStalenessSchema.parse({
    stale: staleReasons.length > 0,
    staleReasons,
  });
}

export function latestDiagnosisReview(
  audits: readonly AuditEvent[],
  diagnosisId: z.infer<typeof DiagnosisIdSchema>,
): DiagnosisReviewDecision | undefined {
  return audits
    .map((event, index) => ({ event, index }))
    .flatMap(({ event, index }) => {
      if (event.action !== "diagnosis-reviewed") {
        return [];
      }
      const parsed = DiagnosisReviewDecisionSchema.safeParse(
        event.after.diagnosisReview,
      );
      return parsed.success &&
        parsed.data.diagnosisId === diagnosisId &&
        event.ticketId === parsed.data.ticketId &&
        event.actor === parsed.data.actor &&
        event.timestamp === parsed.data.reviewedAt
        ? [{ review: parsed.data, timestamp: event.timestamp, index, id: event.id }]
        : [];
    })
    .sort(
      (left, right) =>
        right.timestamp.localeCompare(left.timestamp) ||
        right.index - left.index ||
        right.id.localeCompare(left.id),
    )[0]?.review;
}

function hasNewerCustomerReply(input: DiagnosisStalenessInput): boolean {
  const diagnosisWatermark = input.diagnosisConversationWatermark;
  const latestWatermark = input.latestConversationWatermark;
  if (diagnosisWatermark !== undefined && latestWatermark !== undefined) {
    if (latestWatermark.state === "none") {
      return false;
    }
    if (diagnosisWatermark.state === "none") {
      return true;
    }
    return (
      isAfter(latestWatermark.timestamp, diagnosisWatermark.timestamp) ||
      (latestWatermark.timestamp === diagnosisWatermark.timestamp &&
        latestWatermark.id !== diagnosisWatermark.id)
    );
  }

  const referenceReplyAt = input.diagnosisReplyWatermark ?? input.diagnosisTimestamp;
  return input.latestReplyAt !== undefined && isAfter(input.latestReplyAt, referenceReplyAt);
}

function isAfter(left: string, right: string): boolean {
  return Date.parse(left) > Date.parse(right);
}
