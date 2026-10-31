/** Operational recommendation commands: prepare semantic requests, validate transaction-local state, write through the dispatcher, and project persisted results on replay. TriageService owns public validation, compatibility paths, and post-commit automatic-reply execution. */
import { z } from "zod";
import {
  hasCustomerReplyAfterRecommendationFromSnapshot
} from "./approval-desk/workflow-causal-context.js";
import {
  ApprovalSchema,
  IsoTimestampSchema,
  TicketIdSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type Approval,
  type AuditEvent,
  type Ticket,
  type TicketId,
  type TriageRecommendation
} from "./domain.js";
import type { OperationalResultReader } from "./operational-command-dispatch.js";
import type { OperationalCommandDispatcher, PreparedCommandDefinition } from "./operational-command-dispatch.js";
import {
  appendLifecycleTrace,
  approvedTicketProjection,
  assertOperationalResponseMayBeSent,
  assertOperationalResponseNotAlreadySent,
  compositeAutomaticReplySourceTicketMatchesHistory,
  derivedOperationalCommandContext,
  latestRecommendationBeforeEvent,
  operationalApprovalFacts,
  operationalAuditsFromSnapshot,
  operationalConversationAuditsForEventIds,
  operationalExpectedResolution,
  operationalRecommendationLifecycleAudit,
  operationalSupportResponseAudit,
  operationalTransitionStaleMessage,
  plusMilliseconds,
  readReplayWorkflowSnapshot,
  recommendationAfterApproval,
  replayIntegrity,
  sameStructuredValue,
  stale,
  validateOperationalApproval,
} from "./operational-lifecycle-support.js";
import type {
  OperationalResultReference,
  OperationalWorkflowSnapshot
} from "./operational/domain.js";
import {
  AutomaticCustomerReplyIntentSchema
} from "./operational/domain.js";
import {
  type CommandReplay,
  type OperationalCommandContext,
} from "./operational/idempotency.js";
import {
  OperationalStoreError
} from "./operational/unit-of-work.js";

import type { CancelApprovalInput, MarkResponseSentInput, RejectRecommendationInput, SupersedeRecommendationInput } from "./recommendation-lifecycle-contracts.js";

const NonBlankStringSchema = z.string().trim().min(1);
export const MarkResponseSentInputSchema = z
  .object({
    recommendationId: z.uuid(),
    ticketId: TicketIdSchema,
    actor: NonBlankStringSchema,
    sentAt: IsoTimestampSchema,
    customerResponse: NonBlankStringSchema,
    automaticReplyEnabled: z.boolean().optional(),
  })
  .strict();

type OperationalMarkResponseSentInput = Omit<MarkResponseSentInput, "customerResponse"> & { customerResponse?: string };

export class RecommendationLifecycleCommands {
  /** Supplies the shared command boundary and deterministic time/ID sources used by writes. */
  constructor(
    private readonly dispatcher: OperationalCommandDispatcher,
    private readonly now: () => Date,
    private readonly uuid: () => string,
  ) {}

  /** Prepares and commits an operational approval; the transaction rechecks freshness and replay projects the recorded immutable result. */
  async approveOperational(
    approval: Approval,
    commandContext: OperationalCommandContext,
  ): Promise<{ ticket: Ticket; auditEvent: AuditEvent }> {
    const { approvedAt: _approvedAt, ...semanticRequest } = approval;
    const definition: PreparedCommandDefinition<
      typeof semanticRequest,
      Approval,
      { ticket: Ticket; auditEvent: AuditEvent }
    > = {
      operation: "approve-recommendation",
      parse: (raw) => {
        const parsedApproval = ApprovalSchema.parse({
          ...z.record(z.string(), z.unknown()).parse(raw),
          approvedAt: "1970-01-01T00:00:00.000Z",
        });
        const { approvedAt: _generatedAt, ...intent } = parsedApproval;
        return intent;
      },
      prepare: async () => approval,
      commit: (unit, prepared, commandId) => {
        const snapshot = unit.readWorkflowSnapshot(prepared.ticketId);
        const recommendation = snapshot.recommendations.find(
          ({ id }) => id === prepared.recommendationId,
        );
        if (
          recommendation === undefined
          || recommendation.resolution !== "pending"
          || recommendation.ticketId !== prepared.ticketId
        ) {
          throw stale("Recommendation cannot be applied.");
        }
        if (hasCustomerReplyAfterRecommendationFromSnapshot(snapshot, recommendation)) {
          throw stale("Recommendation cannot be applied after a newer customer reply.");
        }
        const ticketBefore = snapshot.ticket;
        if (
          ticketBefore.revision !== prepared.expectedRevision
          || recommendation.sourceRevision !== prepared.expectedRevision
        ) {
          throw stale("Approval revision is stale.");
        }
        validateOperationalApproval(recommendation, ticketBefore, prepared, this.now());
        const approvedRecommendation = recommendationAfterApproval(recommendation, prepared);
        const ticketAfter = approvedTicketProjection(ticketBefore, recommendation, prepared);
        const changesTicket = ticketAfter !== ticketBefore;
        const approvalFacts = operationalApprovalFacts(ticketBefore, recommendation, prepared);
        const eventId = this.uuid();
        const [sequence] = unit.allocateEventSequences(prepared.ticketId, 1);
        unit.appendEvent({
          id: eventId,
          ticketId: prepared.ticketId,
          sequence: sequence!,
          occurredAt: prepared.approvedAt,
          actor: prepared.actor,
          action: "recommendation-approved",
          commandId,
          facts: {
            approved: true,
            approvedFields: prepared.approvedFields,
            resolution: "approved",
            expectedRevision: prepared.expectedRevision,
            recommendationFields: approvalFacts,
            ...(changesTicket ? { revision: ticketAfter.revision } : {}),
          },
        });
        unit.updateRecommendation(approvedRecommendation, "pending");
        unit.appendRecommendationRevision({
          recommendation: approvedRecommendation,
          operationalEventId: eventId,
          createdAt: prepared.approvedAt,
        });
        if (changesTicket) {
          unit.updateTicket(ticketAfter, ticketBefore.revision);
          unit.appendTicketRevision({
            ticketId: ticketAfter.id,
            revision: ticketAfter.revision,
            ticket: ticketAfter,
            operationalEventId: eventId,
            createdAt: prepared.approvedAt,
          });
        }
        appendLifecycleTrace(this.uuid,
          unit,
          eventId,
          prepared.ticketId,
          prepared.actor,
          prepared.approvedAt,
          "recommendation-approved",
        );
        return {
          operation: "approve-recommendation",
          tickets: [{
            ticketId: prepared.ticketId,
            operationalEventIds: [eventId],
            resultingRevision: changesTicket ? ticketAfter.revision : null,
          }],
          recommendationId: recommendation.id,
          ticketSnapshot: ticketAfter,
        };
      },
      replay: (reader, result) => this.replayOperationalApproval(reader, { result }),
    };
    return this.dispatcher.run(
      definition,
      semanticRequest,
      commandContext.commandId,
    );
  }

  /** Rebuilds the approval audit from persisted event/revision references and returns the receipt's ticket snapshot. */
  private replayOperationalApproval(
    reader: OperationalResultReader,
    replay: CommandReplay,
  ): { ticket: Ticket; auditEvent: AuditEvent } {
    const ticketResult = replay.result.tickets[0];
    const recommendationId = replay.result.recommendationId
      ?? replay.result.recommendationIds?.[0];
    if (
      ticketResult === undefined
      || recommendationId === undefined
      || replay.result.ticketSnapshot === undefined
    ) {
      throw replayIntegrity("Operational approval replay is missing its immutable result references.");
    }
    const snapshot = readReplayWorkflowSnapshot(reader, ticketResult.ticketId);
    const event = snapshot.events.find(
      ({ id, action }) => ticketResult.operationalEventIds.includes(id)
        && action === "recommendation-approved",
    );
    const recommendation = event === undefined
      ? undefined
      : snapshot.recommendationRevisions.find(
        (revision) => revision.operationalEventId === event.id
          && revision.recommendation.id === recommendationId,
      )?.recommendation;
    if (event === undefined || recommendation === undefined) {
      throw replayIntegrity("Operational approval replay is missing its persisted recommendation.");
    }
    return {
      ticket: replay.result.ticketSnapshot,
      auditEvent: operationalRecommendationLifecycleAudit(
        event,
        recommendation,
        "pending",
        "approved",
        recommendation.rationale,
      ),
    };
  }

  /** Runs the pending-to-rejected command through the shared dispatcher. */
  reject(input: RejectRecommendationInput, context: OperationalCommandContext): Promise<AuditEvent> {
    return this.transitionOperationalRecommendation(
      "reject-recommendation", input, "pending", "rejected",
      "recommendation-rejected", input.feedback, input.rejectedAt, context,
    );
  }

  /** Runs the approved-to-canceled command through the shared dispatcher. */
  cancel(input: CancelApprovalInput, context: OperationalCommandContext): Promise<AuditEvent> {
    return this.transitionOperationalRecommendation(
      "cancel-recommendation-approval", input, "approved", "canceled",
      "recommendation-canceled", input.reason, input.canceledAt, context,
    );
  }

  /** Runs the pending-to-superseded command through the shared dispatcher. */
  supersede(input: SupersedeRecommendationInput, context: OperationalCommandContext): Promise<AuditEvent> {
    return this.transitionOperationalRecommendation(
      "supersede-recommendation", input, "pending", "superseded",
      "recommendation-superseded", input.reason, input.supersededAt, context,
    );
  }

  /** Validates a semantic lifecycle request, checks its expected resolution in the transaction, and records its event, revision, trace, and result reference together. */
  private async transitionOperationalRecommendation(
    operation: string,
    input: {
      recommendationId: string;
      ticketId: TicketId;
      actor: string;
    },
    expectedResolution: TriageRecommendation["resolution"],
    resultingResolution: TriageRecommendation["resolution"],
    action: "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
    reason: string,
    occurredAt: string,
    commandContext: OperationalCommandContext,
  ): Promise<AuditEvent> {
    const semanticRequest = {
      recommendationId: input.recommendationId,
      ticketId: input.ticketId,
      actor: input.actor,
      reason,
    };
    const definition: PreparedCommandDefinition<
      typeof semanticRequest,
      typeof semanticRequest & { occurredAt: string },
      AuditEvent
    > = {
      operation,
      parse: (raw) => z.object({
        recommendationId: z.uuid(),
        ticketId: TicketIdSchema,
        actor: NonBlankStringSchema,
        reason: NonBlankStringSchema,
      }).strict().parse(raw),
      prepare: async (intent) => ({ ...intent, occurredAt }),
      commit: (unit, prepared, commandId) => {
        const snapshot = unit.readWorkflowSnapshot(prepared.ticketId);
        const recommendation = snapshot.recommendations.find(
          ({ id }) => id === prepared.recommendationId,
        );
        if (
          recommendation === undefined
          || recommendation.resolution !== expectedResolution
          || recommendation.ticketId !== prepared.ticketId
        ) {
          throw stale(operationalTransitionStaleMessage(action));
        }
        const updated = TriageRecommendationSchema.parse({
          ...recommendation,
          resolution: resultingResolution,
        });
        const eventId = this.uuid();
        const [sequence] = unit.allocateEventSequences(prepared.ticketId, 1);
        unit.appendEvent({
          id: eventId,
          ticketId: prepared.ticketId,
          sequence: sequence!,
          occurredAt: prepared.occurredAt,
          actor: prepared.actor,
          action,
          commandId,
          facts: { resolution: resultingResolution, reasonCode: prepared.reason },
        });
        unit.updateRecommendation(updated, expectedResolution);
        unit.appendRecommendationRevision({
          recommendation: updated,
          operationalEventId: eventId,
          createdAt: prepared.occurredAt,
        });
        appendLifecycleTrace(this.uuid,
          unit,
          eventId,
          prepared.ticketId,
          prepared.actor,
          prepared.occurredAt,
          action,
          prepared.reason,
        );
        return {
          operation,
          tickets: [{
            ticketId: prepared.ticketId,
            operationalEventIds: [eventId],
            resultingRevision: null,
          }],
          recommendationId: prepared.recommendationId,
        };
      },
      replay: (reader, result) => this.replayOperationalTransition(
        reader,
        { result },
        action,
      ),
    };
    return this.dispatcher.run(
      definition,
      semanticRequest,
      commandContext.commandId,
    );
  }

  /** Resolves a lifecycle audit from immutable receipt references; inconsistent history raises a persistence error. */
  private replayOperationalTransition(
    reader: OperationalResultReader,
    replay: CommandReplay,
    action: "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
  ): AuditEvent {
    const ticketResult = replay.result.tickets[0];
    const recommendationId = replay.result.recommendationId;
    if (ticketResult === undefined || recommendationId === undefined) {
      throw replayIntegrity("Operational lifecycle replay is missing its semantic references.");
    }
    const snapshot = readReplayWorkflowSnapshot(reader, ticketResult.ticketId);
    const event = snapshot.events.find(
      ({ id, action: candidateAction }) => ticketResult.operationalEventIds.includes(id)
        && candidateAction === action,
    );
    const recommendation = event === undefined
      ? undefined
      : snapshot.recommendationRevisions.find(
        (revision) => revision.operationalEventId === event.id
          && revision.recommendation.id === recommendationId,
      )?.recommendation;
    if (event === undefined || recommendation === undefined) {
      throw replayIntegrity("Operational lifecycle replay is missing its persisted recommendation.");
    }
    const reason = typeof event.facts.reasonCode === "string"
      ? event.facts.reasonCode
      : "Recommendation lifecycle transition completed.";
    return operationalRecommendationLifecycleAudit(
      event,
      recommendation,
      operationalExpectedResolution(action),
      recommendation.resolution,
      reason,
    );
  }

  /** Records an approved response and deterministic automatic-reply intent; validation and writes occur through the dispatcher, while execution of the child reply stays with TriageService. */
  async markOperationalResponseSent(
    sent: OperationalMarkResponseSentInput,
    commandContext: OperationalCommandContext,
    semanticOverride?: unknown,
    operation = "mark-response-sent",
  ): Promise<{
    auditEvent: AuditEvent;
    automaticCustomerReplyIntent?: z.infer<typeof AutomaticCustomerReplyIntentSchema>;
    automaticCustomerReplyTicketSnapshot?: Ticket;
  }> {
    const { automaticReplyForTicket } = await import(
      "./approval-desk/automatic-customer-replies.js"
    );
    const automaticReplyEnabled = sent.automaticReplyEnabled ?? true;
    const {
      sentAt: _sentAt,
      automaticReplyEnabled: _automaticReplyEnabled,
      ...semanticFields
    } = sent;
    const semanticRequest = semanticOverride ?? { ...semanticFields, automaticReplyEnabled };
    const definition: PreparedCommandDefinition<
      unknown,
      OperationalMarkResponseSentInput,
      {
        auditEvent: AuditEvent;
        automaticCustomerReplyIntent?: z.infer<typeof AutomaticCustomerReplyIntentSchema>;
        automaticCustomerReplyTicketSnapshot?: Ticket;
      }
    > = {
      operation,
      parse: (raw) => z.object({
        recommendationId: z.uuid(),
        ticketId: TicketIdSchema,
        actor: NonBlankStringSchema,
        customerResponse: NonBlankStringSchema.max(20_000).optional(),
        automaticReplyEnabled: z.boolean(),
      }).strict().parse(raw),
      prepare: async () => sent,
      commit: (unit, prepared, commandId) => {
        const snapshot = unit.readWorkflowSnapshot(prepared.ticketId);
        const recommendation = snapshot.recommendations.find(
          ({ id }) => id === prepared.recommendationId,
        );
        const effectiveSent: MarkResponseSentInput = {
          ...prepared,
          customerResponse: prepared.customerResponse
            ?? recommendation?.draftCustomerResponse
            ?? "",
        };
        assertOperationalResponseMayBeSent(recommendation, effectiveSent);
        if (hasCustomerReplyAfterRecommendationFromSnapshot(snapshot, recommendation)) {
          throw stale("Approved customer response is stale after a newer customer reply.");
        }
        assertOperationalResponseNotAlreadySent(snapshot, prepared.recommendationId);
        const eventId = this.uuid();
        const messageId = this.uuid();
        const [sequence] = unit.allocateEventSequences(prepared.ticketId, 1);
        unit.appendEvent({
          id: eventId,
          ticketId: prepared.ticketId,
          sequence: sequence!,
          occurredAt: effectiveSent.sentAt,
          actor: prepared.actor,
          action: "customer-response-sent",
          commandId,
          facts: { messageId },
        });
        unit.insertMessage({
          id: messageId,
          ticketId: prepared.ticketId,
          operationalEventId: eventId,
          kind: "support",
          createdAt: effectiveSent.sentAt,
          body: effectiveSent.customerResponse,
          recommendationId: effectiveSent.recommendationId,
        });
        appendLifecycleTrace(this.uuid,
          unit,
          eventId,
          prepared.ticketId,
          prepared.actor,
          effectiveSent.sentAt,
          "customer-response-sent",
        );
        const auditsBeforeSent = operationalAuditsFromSnapshot(unit, snapshot);
        const automaticCustomerReplyIntent = this.automaticCustomerReplyIntent(
          snapshot,
          recommendation,
          auditsBeforeSent,
          effectiveSent,
          commandId,
          automaticReplyForTicket,
        );
        this.assertAutomaticCustomerReplyIntent(
          commandId,
          automaticCustomerReplyIntent,
        );
        const result: OperationalResultReference = {
          operation,
          tickets: [{
            ticketId: prepared.ticketId,
            operationalEventIds: [eventId],
            resultingRevision: null,
          }],
          recommendationId: prepared.recommendationId,
          messageId,
          ticketSnapshot: snapshot.ticket,
          automaticCustomerReplyTicketSnapshot: snapshot.ticket,
          automaticCustomerReplyEnabled: automaticReplyEnabled,
          auditsBeforeSentEventIds: snapshot.events.map(({ id }) => id),
          automaticCustomerReplyIntent,
        };
        return result;
      },
      replay: (reader, result) => {
        this.assertPersistedAutomaticCustomerReplyIntent(
          commandContext.commandId,
          reader,
          result,
          automaticReplyForTicket,
          automaticReplyEnabled,
        );
        return {
          auditEvent: this.replayOperationalResponseSent(reader, { result }),
          automaticCustomerReplyIntent: result.automaticCustomerReplyIntent!,
          automaticCustomerReplyTicketSnapshot: result.automaticCustomerReplyTicketSnapshot!,
        };
      },
    };
    return this.dispatcher.run(
      definition,
      semanticRequest,
      commandContext.commandId,
    );
  }

  /** Projects the sent-response audit and pre-send history from immutable persisted references. */
  private replayOperationalResponseSent(
    reader: OperationalResultReader,
    replay: CommandReplay,
  ): AuditEvent {
    const ticketResult = replay.result.tickets[0];
    const messageId = replay.result.messageId;
    if (ticketResult === undefined || messageId === undefined) {
      throw replayIntegrity("Operational support-response replay is missing its semantic references.");
    }
    const snapshot = readReplayWorkflowSnapshot(reader, ticketResult.ticketId);
    const message = snapshot.messages.find(({ id }) => id === messageId);
    const event = message === undefined
      ? undefined
      : snapshot.events.find(({ id }) => id === message.operationalEventId);
    const recommendationId = replay.result.recommendationId ?? message?.recommendationId;
    const recommendation = recommendationId === undefined || event === undefined
      ? undefined
      : latestRecommendationBeforeEvent(snapshot, recommendationId, event.sequence);
    if (
      message?.kind !== "support"
      || event?.action !== "customer-response-sent"
      || recommendation === undefined
      || !ticketResult.operationalEventIds.includes(event.id)
    ) {
      throw replayIntegrity("Operational support-response replay is missing its persisted message.");
    }
    return operationalSupportResponseAudit(event, message, recommendation);
  }

  /** Commits approval and response-sent events/messages in one unit of work, retaining immutable replay data for the composite result. */
  async approveAndMarkOperationalResponseSent(
    approval: Approval,
    sent: MarkResponseSentInput,
    commandContext: OperationalCommandContext,
  ): Promise<{
    ticket: Ticket;
    approvalEvent: AuditEvent;
    sentEvent: AuditEvent;
    auditsBeforeSent: AuditEvent[];
    automaticReplyIntent?: z.infer<typeof AutomaticCustomerReplyIntentSchema>;
  }> {
    const { automaticReplyForTicket } = await import(
      "./approval-desk/automatic-customer-replies.js"
    );
    const { approvedAt: _approvedAt, ...semanticApproval } = approval;
    const { sentAt: _sentAt, automaticReplyEnabled: _automaticReplyEnabled, ...semanticSent } = sent;
    const semanticRequest = {
      approval: semanticApproval,
      responseSent: {
        ...semanticSent,
        automaticReplyEnabled: sent.automaticReplyEnabled ?? true,
      },
    };
    const operation = "approve-and-mark-response-sent";
    const definition: PreparedCommandDefinition<
      typeof semanticRequest,
      { approval: Approval; responseSent: MarkResponseSentInput },
      {
        ticket: Ticket;
        approvalEvent: AuditEvent;
        sentEvent: AuditEvent;
        auditsBeforeSent: AuditEvent[];
        automaticReplyIntent?: z.infer<typeof AutomaticCustomerReplyIntentSchema>;
      }
    > = {
      operation,
      parse: (raw) => {
        const record = z.object({
          approval: z.record(z.string(), z.unknown()),
          responseSent: z.record(z.string(), z.unknown()),
        }).strict().parse(raw);
        const parsedApproval = ApprovalSchema.parse({
          ...record.approval,
          approvedAt: "1970-01-01T00:00:00.000Z",
        });
        const parsedSent = MarkResponseSentInputSchema.parse({
          ...record.responseSent,
          sentAt: "1970-01-01T00:00:00.000Z",
        });
        const { approvedAt: _approvedAt, ...approvalIntent } = parsedApproval;
        const { sentAt: _sentAt, ...sentIntent } = parsedSent;
        return {
          approval: approvalIntent,
          responseSent: {
            ...sentIntent,
            automaticReplyEnabled: sentIntent.automaticReplyEnabled ?? true,
          },
        };
      },
      prepare: async () => ({
        approval,
        responseSent: {
          ...sent,
          automaticReplyEnabled: sent.automaticReplyEnabled ?? true,
        },
      }),
      commit: (unit, prepared, commandId) => {
        const approval = prepared.approval;
        const sent = prepared.responseSent;
        const snapshot = unit.readWorkflowSnapshot(approval.ticketId);
        const recommendation = snapshot.recommendations.find(
          ({ id }) => id === approval.recommendationId,
        );
        if (
          recommendation === undefined
          || recommendation.resolution !== "pending"
          || recommendation.ticketId !== approval.ticketId
        ) {
          throw stale("Recommendation cannot be applied.");
        }
        if (hasCustomerReplyAfterRecommendationFromSnapshot(snapshot, recommendation)) {
          throw stale("Recommendation cannot be applied after a newer customer reply.");
        }
        const ticketBefore = snapshot.ticket;
        if (
          ticketBefore.revision !== approval.expectedRevision
          || recommendation.sourceRevision !== approval.expectedRevision
        ) {
          throw stale("Approval revision is stale.");
        }
        validateOperationalApproval(recommendation, ticketBefore, approval, this.now());
        const approvedRecommendation = recommendationAfterApproval(recommendation, approval);
        assertOperationalResponseMayBeSent(approvedRecommendation, sent);
        assertOperationalResponseNotAlreadySent(snapshot, sent.recommendationId);
        const ticketAfter = approvedTicketProjection(ticketBefore, recommendation, approval);
        const changesTicket = ticketAfter !== ticketBefore;
        const approvalFacts = operationalApprovalFacts(ticketBefore, recommendation, approval);
        const approvalEventId = this.uuid();
        const sentEventId = this.uuid();
        const messageId = this.uuid();
        const [approvalSequence, sentSequence] = unit.allocateEventSequences(approval.ticketId, 2);
        unit.appendEvent({
          id: approvalEventId,
          ticketId: approval.ticketId,
          sequence: approvalSequence!,
          occurredAt: approval.approvedAt,
          actor: approval.actor,
          action: "recommendation-approved",
          commandId,
          facts: {
            approved: true,
            approvedFields: approval.approvedFields,
            resolution: "approved",
            expectedRevision: approval.expectedRevision,
            recommendationFields: approvalFacts,
            ...(changesTicket ? { revision: ticketAfter.revision } : {}),
          },
        });
        unit.updateRecommendation(approvedRecommendation, "pending");
        unit.appendRecommendationRevision({
          recommendation: approvedRecommendation,
          operationalEventId: approvalEventId,
          createdAt: approval.approvedAt,
        });
        if (changesTicket) {
          unit.updateTicket(ticketAfter, ticketBefore.revision);
          unit.appendTicketRevision({
            ticketId: ticketAfter.id,
            revision: ticketAfter.revision,
            ticket: ticketAfter,
            operationalEventId: approvalEventId,
            createdAt: approval.approvedAt,
          });
        }
        appendLifecycleTrace(this.uuid,
          unit,
          approvalEventId,
          approval.ticketId,
          approval.actor,
          approval.approvedAt,
          "recommendation-approved",
        );
        unit.appendEvent({
          id: sentEventId,
          ticketId: sent.ticketId,
          sequence: sentSequence!,
          occurredAt: sent.sentAt,
          actor: sent.actor,
          action: "customer-response-sent",
          commandId,
          facts: { messageId },
        });
        unit.insertMessage({
          id: messageId,
          ticketId: sent.ticketId,
          operationalEventId: sentEventId,
          kind: "support",
          createdAt: sent.sentAt,
          body: sent.customerResponse,
          recommendationId: sent.recommendationId,
        });
        appendLifecycleTrace(this.uuid,
          unit,
          sentEventId,
          sent.ticketId,
          sent.actor,
          sent.sentAt,
          "customer-response-sent",
        );
        const auditsBeforeSent = operationalAuditsFromSnapshot(unit, snapshot);
        const automaticReplyIntent = this.automaticCustomerReplyIntent(
          snapshot,
          recommendation,
          auditsBeforeSent,
          sent,
          commandId,
          automaticReplyForTicket,
        );
        this.assertAutomaticCustomerReplyIntent(commandId, automaticReplyIntent);
        const result: OperationalResultReference = {
          operation,
          tickets: [{
            ticketId: approval.ticketId,
            operationalEventIds: [approvalEventId, sentEventId],
            resultingRevision: changesTicket ? ticketAfter.revision : null,
          }],
          recommendationId: recommendation.id,
          messageId,
          ticketSnapshot: ticketAfter,
          automaticCustomerReplyTicketSnapshot: snapshot.ticket,
          automaticCustomerReplyEnabled: sent.automaticReplyEnabled ?? true,
          auditsBeforeSentEventIds: [
            ...snapshot.events.map(({ id }) => id),
            approvalEventId,
          ],
          automaticCustomerReplyIntent: automaticReplyIntent,
        };
        return result;
      },
      replay: (reader, result) => {
        this.assertPersistedAutomaticCustomerReplyIntent(
          commandContext.commandId,
          reader,
          result,
          automaticReplyForTicket,
          sent.automaticReplyEnabled ?? true,
        );
        return {
          ...this.replayOperationalApprovalAndSend(reader, { result }),
          automaticReplyIntent: result.automaticCustomerReplyIntent!,
        };
      },
    };
    return this.dispatcher.run(
      definition,
      semanticRequest,
      commandContext.commandId,
    );
  }

  private replayOperationalApprovalAndSend(
    reader: OperationalResultReader,
    replay: CommandReplay,
  ): {
    ticket: Ticket;
    approvalEvent: AuditEvent;
    sentEvent: AuditEvent;
    auditsBeforeSent: AuditEvent[];
  } {
    const approved = this.replayOperationalApproval(reader, replay);
    const sentEvent = this.replayOperationalResponseSent(reader, replay);
    const ticketResult = replay.result.tickets[0]!;
    const snapshot = readReplayWorkflowSnapshot(reader, ticketResult.ticketId);
    const persistedSentEvent = snapshot.events.find(
      ({ id, action }) => ticketResult.operationalEventIds.includes(id)
        && action === "customer-response-sent",
    );
    if (persistedSentEvent === undefined) {
      throw replayIntegrity("Operational approval and send replay is missing its sent event.");
    }
    const auditsBeforeSentEventIds = replay.result.auditsBeforeSentEventIds;
    if (auditsBeforeSentEventIds === undefined) {
      throw replayIntegrity("Operational approval and send replay is missing its immutable pre-send references.");
    }
    return {
      ticket: approved.ticket,
      approvalEvent: approved.auditEvent,
      sentEvent,
      auditsBeforeSent: operationalConversationAuditsForEventIds(
        snapshot,
        auditsBeforeSentEventIds,
        {
          requireImmutableRecommendations: true,
          readCommandResult: (commandId) => reader.readCommandResult(commandId),
        },
      ),
    };
  }

  /** Builds the child-reply intent from the parent result and captured pre-send history without performing the reply. */
  private automaticCustomerReplyIntent(
    snapshot: OperationalWorkflowSnapshot,
    recommendation: TriageRecommendation,
    auditsBeforeSent: readonly AuditEvent[],
    sent: MarkResponseSentInput,
    parentCommandId: string,
    automaticReplyForTicket: (input: {
      ticket: Ticket;
      recommendation: TriageRecommendation;
      auditsBeforeSent: readonly AuditEvent[];
    }) => string | undefined,
  ): z.infer<typeof AutomaticCustomerReplyIntentSchema> {
    if (sent.automaticReplyEnabled === false) {
      return { kind: "none" };
    }
    const body = automaticReplyForTicket({
      ticket: snapshot.ticket,
      recommendation,
      auditsBeforeSent,
    });
    if (body === undefined) {
      return { kind: "none" };
    }
    const child = {
      commandId: derivedOperationalCommandContext(
        parentCommandId,
        "automatic-customer-reply",
      ).commandId,
      ticketId: snapshot.ticket.id,
      actor: snapshot.ticket.requester?.name ?? snapshot.ticket.customer.name,
      body,
      source: "demo-auto-reply",
      receivedAt: plusMilliseconds(sent.sentAt, 1),
    };
    return AutomaticCustomerReplyIntentSchema.parse({
      kind: "add-customer-reply",
      ...child,
    });
  }

  /** Rejects a parent command when its child identity or intent differs from the deterministic derivation. */
  private assertAutomaticCustomerReplyIntent(
    parentCommandId: string,
    intent: z.infer<typeof AutomaticCustomerReplyIntentSchema> | undefined,
  ): void {
    if (intent === undefined) {
      throw new OperationalStoreError(
        "Persisted automatic customer-reply intent is missing from its parent command result.",
        "PERSISTENCE_ERROR",
      );
    }
    if (intent.kind === "none") return;
    const expectedChildCommandId = derivedOperationalCommandContext(
      parentCommandId,
      "automatic-customer-reply",
    ).commandId;
    if (intent.commandId !== expectedChildCommandId) {
      throw new OperationalStoreError(
        "Persisted automatic customer-reply intent is inconsistent with its parent command.",
        "PERSISTENCE_ERROR",
      );
    }
  }

  /** Recomputes child intent from persisted parent references and fails closed when replay data disagrees. */
  private assertPersistedAutomaticCustomerReplyIntent(
    parentCommandId: string,
    reader: OperationalResultReader,
    result: OperationalResultReference,
    automaticReplyForTicket: (input: {
      ticket: Ticket;
      recommendation: TriageRecommendation;
      auditsBeforeSent: readonly AuditEvent[];
    }) => string | undefined,
    expectedAutomaticReplyEnabled: boolean,
  ): void {
    this.assertAutomaticCustomerReplyIntent(
      parentCommandId,
      result.automaticCustomerReplyIntent,
    );
    const ticketResult = result.tickets[0];
    const recommendationId = result.recommendationId;
    const sourceTicket = result.automaticCustomerReplyTicketSnapshot;
    const preSendEventIds = result.auditsBeforeSentEventIds;
    if (
      ticketResult === undefined
      || result.messageId === undefined
      || recommendationId === undefined
      || sourceTicket === undefined
      || preSendEventIds === undefined
      || result.automaticCustomerReplyEnabled !== expectedAutomaticReplyEnabled
    ) {
      throw new OperationalStoreError(
        "Persisted automatic customer-reply intent is missing its immutable parent references.",
        "PERSISTENCE_ERROR",
      );
    }
    const snapshot = readReplayWorkflowSnapshot(reader, ticketResult.ticketId);
    const sentEvent = snapshot.events.find(
      ({ id, action }) => ticketResult.operationalEventIds.includes(id)
        && action === "customer-response-sent",
    );
    const sentMessage = snapshot.messages.find(({ id }) => id === result.messageId);
    const recommendationEvent = result.operation === "approve-and-mark-response-sent"
      ? snapshot.events.find(
        ({ id, action }) => ticketResult.operationalEventIds.includes(id)
          && action === "recommendation-approved",
      )
      : sentEvent;
    const recommendation = recommendationEvent === undefined
      ? undefined
      : latestRecommendationBeforeEvent(
        snapshot,
        recommendationId,
        recommendationEvent.sequence,
      );
    if (
      sourceTicket.id !== ticketResult.ticketId
      || result.ticketSnapshot === undefined
      || (result.operation !== "approve-and-mark-response-sent"
        && !sameStructuredValue(sourceTicket, result.ticketSnapshot))
      || sentEvent === undefined
      || sentMessage?.kind !== "support"
      || sentMessage.operationalEventId !== sentEvent.id
      || sentMessage.ticketId !== ticketResult.ticketId
      || sentMessage.recommendationId !== recommendationId
      || recommendation === undefined
    ) {
      throw new OperationalStoreError(
        "Persisted automatic customer-reply intent is inconsistent with its parent command result.",
        "PERSISTENCE_ERROR",
      );
    }
    if (
      result.operation === "approve-and-mark-response-sent"
      && !compositeAutomaticReplySourceTicketMatchesHistory(
        snapshot,
        result,
        ticketResult,
        sourceTicket,
        recommendationEvent,
        recommendation,
      )
    ) {
      throw new OperationalStoreError(
        "Persisted automatic customer-reply source ticket is inconsistent with immutable parent history.",
        "PERSISTENCE_ERROR",
      );
    }
    const auditsBeforeSent = operationalConversationAuditsForEventIds(
      snapshot,
      preSendEventIds,
      {
        requireImmutableRecommendations: true,
        readCommandResult: (commandId) => reader.readCommandResult(commandId),
      },
    );
    const expectedBody = automaticReplyForTicket({
      ticket: TicketSchema.parse(sourceTicket),
      recommendation,
      auditsBeforeSent,
    });
    const effectiveExpectedBody = result.automaticCustomerReplyEnabled === false
      ? undefined
      : expectedBody;
    const expectedIntent = effectiveExpectedBody === undefined
      ? { kind: "none" as const }
      : AutomaticCustomerReplyIntentSchema.parse({
        kind: "add-customer-reply",
        commandId: derivedOperationalCommandContext(
          parentCommandId,
          "automatic-customer-reply",
        ).commandId,
        ticketId: sourceTicket.id,
        actor: sourceTicket.requester?.name ?? sourceTicket.customer.name,
        body: effectiveExpectedBody,
        source: "demo-auto-reply",
        receivedAt: plusMilliseconds(sentEvent.occurredAt, 1),
      });
    if (!sameStructuredValue(result.automaticCustomerReplyIntent, expectedIntent)) {
      throw new OperationalStoreError(
        "Persisted automatic customer-reply intent is inconsistent with immutable parent history.",
        "PERSISTENCE_ERROR",
      );
    }
  }
}
