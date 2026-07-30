import { z } from "zod";
import {
  AuditEventSchema,
  CustomerReplyWatermarkSchema,
  DiagnosisIdSchema,
  DiagnosisImpactSetSchema as DomainDiagnosisImpactSetSchema,
  IsoTimestampSchema,
  TicketIdSchema,
  type AuditEvent,
  type CustomerReplyWatermark,
  type DiagnosisImpactSet as DomainDiagnosisImpactSet,
  type Ticket,
} from "../domain.js";
import { DiagnosisContextSchema } from "../triage-service.js";
import { compareIsoInstants } from "../iso-instant.js";
import {
  auditCausalPositions,
  compareAuditCausalOrder,
  type AuditCausalPosition,
} from "./workflow-causal-context.js";
export { compareIsoInstants };
export { compareAuditCausalOrder } from "./workflow-causal-context.js";
export type { AuditCausalPosition } from "./workflow-causal-context.js";

const NonBlankStringSchema = z.string().trim().min(1);
const TicketRevisionSchema = z.number().int().nonnegative();

/** Strict persisted-review shape before decision-specific domain constraints. */
export const DiagnosisReviewDraftSchema = z
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
  .strict();

export const DiagnosisReviewDecisionSchema = DiagnosisReviewDraftSchema
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

export const DiagnosisImpactSetSchema = DomainDiagnosisImpactSetSchema;

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

/**
 * The transport-safe causal view of one immutable diagnosis. This preserves
 * the original audit, every valid review decision, and the current freshness
 * calculation without treating a review as a replacement diagnosis.
 */
export const DiagnosisReviewViewSchema = DiagnosisReviewSnapshotSchema.extend({
  reviews: z.array(DiagnosisReviewDecisionSchema),
}).strict();

export const DiagnosisReviewListOutputSchema = z
  .object({ diagnoses: z.array(DiagnosisReviewViewSchema) })
  .strict();

export const DiagnosisReviewActionOutputSchema = z
  .object({
    auditEvent: AuditEventSchema,
    diagnoses: z.array(DiagnosisReviewViewSchema),
  })
  .strict();

export const DiagnosisFixActionOutputSchema = z
  .object({ auditEvents: z.array(AuditEventSchema).min(1) })
  .strict();

export type DiagnosisReviewInput = z.infer<
  typeof DiagnosisReviewDecisionSchema
>;
export type DiagnosisReviewDecision = DiagnosisReviewInput;
export type DiagnosisImpactSet = DomainDiagnosisImpactSet;
export type DiagnosisReviewSnapshot = z.infer<
  typeof DiagnosisReviewSnapshotSchema
>;
export type DiagnosisReviewView = z.infer<typeof DiagnosisReviewViewSchema>;

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
      !isSameInstant(diagnosisTimestamp, input.diagnosisReplyWatermark)
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
      !isSameInstant(latestTimestamp, input.latestReplyAt)
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

export interface DiagnosisReviewRecord extends AuditCausalPosition {
  review: DiagnosisReviewDecision;
}

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
  return latestDiagnosisReviewRecord(audits, diagnosisId)?.review;
}

export function latestDiagnosisReviewRecord(
  audits: readonly AuditEvent[],
  diagnosisId: z.infer<typeof DiagnosisIdSchema>,
): DiagnosisReviewRecord | undefined {
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
        isSameInstant(event.timestamp, parsed.data.reviewedAt)
        ? [{ review: parsed.data, event, index }]
        : [];
    })
    .sort(
      (left, right) =>
        compareAuditCausalOrder(
          { event: right.event, index: right.index },
          { event: left.event, index: left.index },
        ),
    )[0];
}

/**
 * Parses a review record only when the persisted review is causally linked to
 * one real, earlier original diagnosis. Governance gates and drafting must use
 * this parser rather than trusting a review payload by itself.
 */
export function strictDiagnosisReviewRecord(
  audits: readonly AuditEvent[],
  position: AuditCausalPosition,
): DiagnosisReviewRecord | undefined {
  const { event } = position;
  if (event.action !== "diagnosis-reviewed") return undefined;
  const parsed = DiagnosisReviewDecisionSchema.safeParse(
    event.after.diagnosisReview,
  );
  if (
    !parsed.success ||
    event.ticketId !== parsed.data.ticketId ||
    event.actor !== parsed.data.actor ||
    event.before.diagnosisId !== parsed.data.diagnosisId ||
    !isSameInstant(event.timestamp, parsed.data.reviewedAt)
  ) {
    return undefined;
  }
  const original = auditCausalPositions(audits).find(
    (candidate) =>
      candidate.index < position.index &&
      candidate.event.id === parsed.data.diagnosisId &&
      candidate.event.ticketId === parsed.data.ticketId &&
      OriginalDiagnosisAuditSchema.safeParse(candidate.event).success,
  );
  return original === undefined
    ? undefined
    : { event, index: position.index, review: parsed.data };
}

export function latestStrictDiagnosisReviewRecord(
  audits: readonly AuditEvent[],
  diagnosisId: z.infer<typeof DiagnosisIdSchema>,
): DiagnosisReviewRecord | undefined {
  return auditCausalPositions(audits)
    .flatMap((position) => {
      const record = strictDiagnosisReviewRecord(audits, position);
      return record?.review.diagnosisId === diagnosisId ? [record] : [];
    })
    .sort((left, right) => compareAuditCausalOrder(right, left))[0];
}

/**
 * Build one shared diagnosis read-model for HTTP, MCP, and UI consumers.
 * Persisted audit order is the causal source of truth; timestamp order only
 * remains a tie-breaker inside the shared audit-order helper.
 */
export function diagnosisReviewViews(input: {
  ticket: Pick<Ticket, "id" | "revision">;
  audits: readonly AuditEvent[];
}): DiagnosisReviewView[] {
  const positions = auditCausalPositions(input.audits);
  const latestConversationWatermark = conversationWatermarkFromAudits(
    input.audits,
  );

  return positions
    .filter(
      ({ event }) =>
        event.ticketId === input.ticket.id &&
        OriginalDiagnosisAuditSchema.safeParse(event).success,
    )
    .map((originalPosition) => {
      const originalDiagnosis = OriginalDiagnosisAuditSchema.parse(
        originalPosition.event,
      );
      const reviews = positions
        .flatMap((position) => {
          const record = strictDiagnosisReviewRecord(input.audits, position);
          return record?.review.diagnosisId === originalDiagnosis.id
            ? [record]
            : [];
        })
        .sort((left, right) => compareAuditCausalOrder(left, right));
      const latestReview = reviews.at(-1)?.review;
      const currentReview =
        latestReview?.decision === "approve" ||
          latestReview?.decision === "revalidate"
          ? latestReview
          : undefined;
      const sourceTicketRevision = currentReview?.sourceTicketRevision ??
        TicketRevisionSchema.safeParse(
          originalDiagnosis.after.sourceTicketRevision,
        ).data ?? input.ticket.revision;
      const sourceConversationWatermark =
        currentReview?.sourceConversationWatermark ??
        CustomerReplyWatermarkSchema.safeParse(
          originalDiagnosis.after.sourceConversationWatermark,
        ).data ?? conversationWatermarkAt(
          input.audits,
          originalPosition.index,
        );
      const freshness = isDiagnosisStale({
        diagnosisTimestamp: currentReview?.reviewedAt ?? originalDiagnosis.timestamp,
        diagnosisTicketRevision: sourceTicketRevision,
        diagnosisConversationWatermark: sourceConversationWatermark,
        currentTicketRevision: input.ticket.revision,
        latestConversationWatermark,
      });
      const laterDiagnosis = positions.some(
        (position) =>
          position.event.id !== originalDiagnosis.id &&
          OriginalDiagnosisAuditSchema.safeParse(position.event).success &&
          compareAuditCausalOrder(position, originalPosition) > 0,
      );
      const staleReasons = [
        ...freshness.staleReasons,
        ...(laterDiagnosis ? ["newer-diagnosis" as const] : []),
      ];

      return DiagnosisReviewViewSchema.parse({
        originalDiagnosis,
        reviews: reviews.map(({ review }) => review),
        latestReview: latestReview ?? null,
        stale: staleReasons.length > 0,
        staleReasons,
        sourceTicketRevision,
        sourceConversationWatermark,
      });
    });
}

export function customerReplyWatermarksMatch(
  evaluated: CustomerReplyWatermark,
  current: CustomerReplyWatermark,
): boolean {
  return evaluated.state === current.state &&
    (evaluated.state === "none" ||
      (current.state === "reply" &&
        evaluated.id === current.id &&
        isSameInstant(evaluated.timestamp, current.timestamp)));
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
    return !customerReplyWatermarksMatch(
      diagnosisWatermark,
      latestWatermark,
    );
  }

  const referenceReplyAt = input.diagnosisReplyWatermark ?? input.diagnosisTimestamp;
  return input.latestReplyAt !== undefined && isAfter(input.latestReplyAt, referenceReplyAt);
}

function isAfter(left: string, right: string): boolean {
  return compareIsoInstants(left, right) > 0;
}

function isSameInstant(left: string, right: string): boolean {
  return compareIsoInstants(left, right) === 0;
}

function conversationWatermarkFromAudits(
  audits: readonly AuditEvent[],
): CustomerReplyWatermark {
  return conversationWatermarkAt(audits, audits.length);
}

function conversationWatermarkAt(
  audits: readonly AuditEvent[],
  endExclusive: number,
): CustomerReplyWatermark {
  const latestReply = audits
    .slice(0, endExclusive)
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
