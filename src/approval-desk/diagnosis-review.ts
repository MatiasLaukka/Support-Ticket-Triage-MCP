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

const OriginalDiagnosisAuditSchema = AuditEventSchema.refine(
  (event) =>
    (event.action === "diagnosis-completed" ||
      event.action === "diagnostic-escalated") &&
    typeof event.after.diagnosis === "object" &&
    event.after.diagnosis !== null,
  "Original diagnosis must be a diagnosis audit event.",
);

export const DiagnosisReviewSnapshotSchema = z
  .object({
    originalDiagnosis: OriginalDiagnosisAuditSchema,
    latestReview: DiagnosisReviewDecisionSchema.nullable(),
    stale: z.boolean(),
    staleReasons: z.array(NonBlankStringSchema),
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

export interface DiagnosisStalenessInput {
  diagnosisTimestamp: string;
  diagnosisTicketRevision: number;
  diagnosisReplyWatermark?: string;
  currentTicketRevision: number;
  latestReplyAt?: string;
  contradictoryEvidence?: boolean;
  newerDiagnosisAt?: string;
  newerReviewAt?: string;
  invalidatingFixAt?: string;
  invalidatingEventAt?: string;
  knowledgeWorkflowChanged?: boolean;
}

export interface DiagnosisStaleness {
  stale: boolean;
  staleReasons: string[];
}

export function isDiagnosisStale(input: DiagnosisStalenessInput): DiagnosisStaleness {
  const staleReasons: string[] = [];
  const referenceReplyAt = input.diagnosisReplyWatermark ?? input.diagnosisTimestamp;

  if (input.latestReplyAt !== undefined && input.latestReplyAt > referenceReplyAt) {
    staleReasons.push("newer-customer-reply");
  }
  if (input.currentTicketRevision > input.diagnosisTicketRevision) {
    staleReasons.push("newer-ticket-revision");
  }
  if (input.contradictoryEvidence === true) {
    staleReasons.push("contradictory-evidence");
  }
  if (
    input.newerDiagnosisAt !== undefined &&
    input.newerDiagnosisAt > input.diagnosisTimestamp
  ) {
    staleReasons.push("newer-diagnosis");
  }
  if (
    input.newerReviewAt !== undefined &&
    input.newerReviewAt > input.diagnosisTimestamp
  ) {
    staleReasons.push("newer-diagnosis-review");
  }
  if (
    input.invalidatingFixAt !== undefined &&
    input.invalidatingFixAt > input.diagnosisTimestamp
  ) {
    staleReasons.push("invalidating-fix-signal");
  }
  if (
    input.invalidatingEventAt !== undefined &&
    input.invalidatingEventAt > input.diagnosisTimestamp
  ) {
    staleReasons.push("invalidating-event-signal");
  }
  if (input.knowledgeWorkflowChanged === true) {
    staleReasons.push("knowledge-workflow-changed");
  }

  return { stale: staleReasons.length > 0, staleReasons };
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
      return parsed.success && parsed.data.diagnosisId === diagnosisId
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
