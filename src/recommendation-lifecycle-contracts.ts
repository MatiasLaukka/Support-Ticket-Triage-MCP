/** Caller-facing input shapes shared by TriageService and its lifecycle command module. */
import type { TicketId } from "./domain.js";

/** Describes a rejection request; runtime validation and persistence belong to TriageService and its operational command path. */
export interface RejectRecommendationInput {
  recommendationId: string;
  ticketId: TicketId;
  actor: string;
  feedback: string;
  rejectedAt: string;
}

/** Describes cancellation of an already approved recommendation. */
export interface CancelApprovalInput {
  recommendationId: string;
  ticketId: TicketId;
  actor: string;
  reason: string;
  canceledAt: string;
}

/** Describes recording the send of an approved customer response; the optional flag controls persisted automatic-reply intent. */
export interface MarkResponseSentInput {
  recommendationId: string;
  ticketId: TicketId;
  actor: string;
  sentAt: string;
  customerResponse: string;
  automaticReplyEnabled?: boolean;
}

/** Describes superseding a pending recommendation with a reason and event time. */
export interface SupersedeRecommendationInput {
  recommendationId: string;
  ticketId: TicketId;
  actor: string;
  supersededAt: string;
  reason: string;
}
