/** Shared projections and guards for operational lifecycle commands. This module reads transaction/snapshot inputs and delegates writes to the supplied unit of work; it does not own a store or authorize commands. */
import { createHash } from "node:crypto";
import {
  ApprovedFieldSchema,
  AuditEventSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type Approval,
  type ApprovedField,
  type AuditEvent,
  type Ticket,
  type TicketId,
  type TriageRecommendation
} from "./domain.js";
import { DomainError } from "./errors.js";
import type { OperationalResultReader } from "./operational-command-dispatch.js";
import {
  DiagnosisAuditIntegrityError,
  projectDiagnosisAudits,
} from "./operational/diagnosis-audit.js";
import type {
  ConversationMessage,
  OperationalResultReference,
  OperationalWorkflowSnapshot
} from "./operational/domain.js";
import {
  type OperationalCommandContext
} from "./operational/idempotency.js";
import {
  OperationalStoreError,
  type OperationalUnitOfWork,
} from "./operational/unit-of-work.js";
import { evaluateEscalation, validateApprovedFields } from "./policy.js";

import type { MarkResponseSentInput } from "./recommendation-lifecycle-contracts.js";

type OperationalApprovalFactValue = string | number | boolean | OperationalApprovalFactValue[];

/** Appends a lifecycle trace to the caller's transaction using its injected ID source. */
export function appendLifecycleTrace(
  uuid: () => string,
  unit: OperationalUnitOfWork,
  operationalEventId: string,
  ticketId: TicketId,
  actor: string,
  occurredAt: string,
  stage: string,
  reason?: string,
): void {
  unit.appendTrace({
    id: uuid(),
    operationalEventId,
    ticketId,
    occurredAt,
    actor,
    traceType: "lifecycle",
    stage,
    outcome: "success",
    ...(reason === undefined ? {} : { reason }),
  });
}

/** Projects strict audit history using stored command results, translating diagnosis-audit integrity failures into persistence errors. */
export function operationalAuditsFromSnapshot(
  unit: OperationalUnitOfWork,
  snapshot: OperationalWorkflowSnapshot,
): AuditEvent[] {
  const fallbackAudits = operationalAuditEventsFromSnapshot(snapshot);
  const receiptResults = unit.readCommandResults(
    snapshot.events.map(({ commandId }) => commandId),
  );
  const fallbackAuditsByEventId = new Map(snapshot.events.map((event) => [
    event.id,
    operationalAuditEventsFromSnapshot({ ...snapshot, events: [event] }),
  ] as const));
  try {
    return projectDiagnosisAudits({
      events: snapshot.events,
      receiptResults,
      fallbackAudits,
      fallbackAuditsByEventId,
      originalAudits: snapshot.diagnoses.map(({ originalAudit }) => originalAudit),
      policy: "strict",
    });
  } catch (error) {
    if (error instanceof DiagnosisAuditIntegrityError) {
      throw new OperationalStoreError(error.message, "PERSISTENCE_ERROR", { cause: error });
    }
    throw error;
  }
}

/** Creates the domain error used when transaction-local lifecycle state is stale or no longer eligible. */
export function stale(message: string): DomainError {
  return new DomainError(message, "STALE_APPROVAL");
}

/** Applies approved-field and escalation policy checks before an approval write; invalid routing or fields fail with a domain error. */
export function validateOperationalApproval(
  recommendation: TriageRecommendation,
  ticket: Ticket,
  approval: Approval,
  now: Date,
): void {
  validateApprovedFields(recommendation, approval.approvedFields);
  const decision = evaluateEscalation(recommendation, now, ticket);
  const resultingTeam = approval.approvedFields.includes("team")
    ? approvedFieldValue(recommendation, approval, "team")
    : ticket.team;
  if (
    decision.requiredTeam !== undefined
    && resultingTeam !== decision.requiredTeam
  ) {
    throw new DomainError(
      `Resulting ticket must route to ${decision.requiredTeam}.`,
      "INVALID_APPROVAL_FIELDS",
    );
  }
}

/** Resolves an approved field from a recommendation, honoring an explicit response or field override. */
export function approvedFieldValue(
  recommendation: TriageRecommendation,
  approval: Approval,
  field: ApprovedField,
): unknown {
  if (field === "customerResponse") {
    return approval.editedCustomerResponse ?? recommendation.draftCustomerResponse;
  }

  if (
    approval.fieldOverrides !== undefined &&
    Object.hasOwn(approval.fieldOverrides, field)
  ) {
    return approval.fieldOverrides[field as keyof typeof approval.fieldOverrides];
  }

  return recommendationValue(recommendation, field);
}

function recommendationValue(
  recommendation: TriageRecommendation,
  field: ApprovedField,
): unknown {
  switch (field) {
    case "category":
    case "priority":
    case "team":
    case "assignee":
    case "tags":
      return recommendation[field];
    case "status":
      return recommendation.ticketStatus;
    case "customerResponse":
      return recommendation.draftCustomerResponse;
  }
}

/** Returns the validated recommendation projection produced by an approval. */
export function recommendationAfterApproval(
  recommendation: TriageRecommendation,
  approval: Approval,
): TriageRecommendation {
  return TriageRecommendationSchema.parse({
    ...recommendation,
    resolution: "approved",
    ...(approval.approvedFields.includes("customerResponse")
      ? {
        draftCustomerResponse:
          approval.editedCustomerResponse ?? recommendation.draftCustomerResponse,
      }
      : {}),
  });
}

/** Computes the approved ticket projection and increments revision only when ticket fields change. */
export function approvedTicketProjection(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  approval: Approval,
): Ticket {
  const { before, after } = approvedValues(ticket, recommendation, approval);
  const changesTicket = approval.approvedFields.some(
    (field) => field !== "customerResponse"
      && !sameStructuredValue(before[field], after[field]),
  );
  if (!changesTicket) return ticket;
  return TicketSchema.parse({
    ...applyApprovedFields(ticket, recommendation, approval, approval.approvedAt),
    revision: ticket.revision + 1,
  });
}

/** Produces before/after values for the fields selected by an approval. */
export function approvedValues(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  approval: Approval,
): {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
} {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  for (const field of approval.approvedFields) {
    before[field] =
      field === "customerResponse" ? null : ticketValue(ticket, field);
    after[field] = approvedFieldValue(recommendation, approval, field);
  }
  return { before, after };
}

function ticketValue(ticket: Ticket, field: ApprovedField): unknown {
  switch (field) {
    case "category":
    case "priority":
    case "team":
    case "assignee":
    case "tags":
      return ticket[field];
    case "status":
      return ticket.status;
    case "customerResponse":
      return null;
  }
}

/** Compares persisted JSON-shaped values using the module's structural serialization convention. */
export function sameStructuredValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Copies approved recommendation values into a ticket projection without mutating the supplied ticket. */
export function applyApprovedFields(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  approval: Approval,
  updatedAt: string,
): Ticket {
  const updated = structuredClone(ticket);
  for (const field of approval.approvedFields) {
    switch (field) {
      case "category":
        updated.category = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["category"];
        break;
      case "priority":
        updated.priority = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["priority"];
        break;
      case "team":
        updated.team = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["team"];
        break;
      case "assignee":
        const assignee = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["assignee"] | null;
        if (assignee === null) {
          delete updated.assignee;
        } else {
          updated.assignee = assignee;
        }
        break;
      case "status":
        updated.status = approvedFieldValue(
          recommendation,
          approval,
          field,
        ) as Ticket["status"];
        break;
      case "tags":
        updated.tags = [
          ...(approvedFieldValue(
            recommendation,
            approval,
            field,
          ) as Ticket["tags"]),
        ];
        break;
      case "customerResponse":
        break;
    }
  }
  updated.updatedAt = updatedAt;
  return updated;
}

/** Encodes approved before/after facts for durable event storage; unsupported values fail validation. */
export function operationalApprovalFacts(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  approval: Approval,
): Record<string, unknown> {
  const values = approvedValues(ticket, recommendation, approval);
  const fields = approval.approvedFields.filter((field) => field !== "customerResponse");
  return {
    approvedFields: approval.approvedFields,
    evidence: fields.map((field) => [field, encodeApprovalFact(values.before[field])]),
    recommendationFields: fields.map((field) => [field, encodeApprovalFact(values.after[field])]),
  };
}

function encodeApprovalFact(value: unknown): OperationalApprovalFactValue {
  if (value === null) return "__null__";
  if (value === undefined) return "__undefined__";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(encodeApprovalFact);
  throw new DomainError("Approved field value cannot be persisted safely.", "INVALID_APPROVAL_FIELDS");
}

/** Creates a persistence error for missing or inconsistent immutable replay references. */
export function replayIntegrity(message: string): OperationalStoreError {
  return new OperationalStoreError(message, "PERSISTENCE_ERROR");
}

/** Reads replay history and converts a missing ticket into an integrity failure; other store errors propagate. */
export function readReplayWorkflowSnapshot(
  reader: OperationalResultReader,
  ticketId: string,
): OperationalWorkflowSnapshot {
  try {
    return reader.readWorkflowSnapshot(ticketId);
  } catch (error) {
    if (error instanceof OperationalStoreError && error.code === "NOT_FOUND") {
      throw replayIntegrity("Operational replay references a missing ticket history.");
    }
    throw error;
  }
}

/** Projects a lifecycle audit from its event and recommendation revision, using recorded approval facts when present. */
export function operationalRecommendationLifecycleAudit(
  event: OperationalWorkflowSnapshot["events"][number],
  recommendation: TriageRecommendation,
  expectedResolution: TriageRecommendation["resolution"],
  resultingResolution: TriageRecommendation["resolution"],
  rationale: string,
): AuditEvent {
  const approvalValues = event.action === "recommendation-approved"
    ? approvalAuditValues(event, recommendation)
    : undefined;
  return AuditEventSchema.parse({
    id: event.id,
    timestamp: event.occurredAt,
    actor: event.actor,
    action: event.action,
    ticketId: event.ticketId,
    recommendationId: recommendation.id,
    before: approvalValues?.before ?? { resolution: expectedResolution },
    after: approvalValues?.after ?? { resolution: resultingResolution },
    rationale,
    knowledgeArticleIds: recommendation.knowledgeArticleIds,
    result: "success",
  });
}

function approvalAuditValues(
  event: OperationalWorkflowSnapshot["events"][number],
  recommendation: TriageRecommendation,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const payload = event.facts.recommendationFields;
  const record = typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const before = approvalFactPairs(record.evidence);
  const after = approvalFactPairs(record.recommendationFields);
  const approvedFields = Array.isArray(record.approvedFields)
    ? record.approvedFields.filter((field): field is ApprovedField =>
      typeof field === "string" && ApprovedFieldSchema.safeParse(field).success)
    : [];
  if (approvedFields.includes("customerResponse")) {
    before.customerResponse = null;
    after.customerResponse = recommendation.draftCustomerResponse;
  }
  return { before, after };
}

function approvalFactPairs(value: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!Array.isArray(value)) return result;
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string") continue;
    if (!ApprovedFieldSchema.safeParse(pair[0]).success || pair[0] === "customerResponse") continue;
    result[pair[0]] = decodeApprovalFact(pair[1]);
  }
  return result;
}

function decodeApprovalFact(value: unknown): unknown {
  if (value === "__null__") return null;
  if (value === "__undefined__") return undefined;
  if (Array.isArray(value)) return value.map(decodeApprovalFact);
  return value;
}

/** Selects the established stale-state message for a recommendation transition action. */
export function operationalTransitionStaleMessage(
  action: "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
): string {
  if (action === "recommendation-rejected") return "Recommendation cannot be rejected.";
  if (action === "recommendation-canceled") return "Approved recommendation cannot be canceled.";
  return "Pending recommendation cannot be superseded.";
}

/** Returns the resolution expected before a lifecycle action for replay projection. */
export function operationalExpectedResolution(
  action: "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
): TriageRecommendation["resolution"] {
  return action === "recommendation-canceled" ? "approved" : "pending";
}

/** Requires a matching approved recommendation and response body before a send event can be written. */
export function assertOperationalResponseMayBeSent(
  recommendation: TriageRecommendation | undefined,
  sent: MarkResponseSentInput,
): asserts recommendation is TriageRecommendation {
  if (
    recommendation === undefined
    || recommendation.resolution !== "approved"
    || recommendation.ticketId !== sent.ticketId
  ) {
    throw stale("Approved customer response cannot be marked sent.");
  }
  if (recommendation.draftCustomerResponse !== sent.customerResponse) {
    throw new DomainError(
      "Sent customer response must match the approved customer response.",
      "INVALID_APPROVAL_FIELDS",
    );
  }
}

/** Rejects a second support message for the same recommendation in the supplied workflow snapshot. */
export function assertOperationalResponseNotAlreadySent(
  snapshot: OperationalWorkflowSnapshot,
  recommendationId: string,
): void {
  if (snapshot.messages.some(
    (message) => message.kind === "support"
      && message.recommendationId === recommendationId,
  )) {
    throw stale("Customer response has already been marked sent.");
  }
}

/** Finds the latest recommendation revision whose event precedes the requested causal boundary. */
export function latestRecommendationBeforeEvent(
  snapshot: OperationalWorkflowSnapshot,
  recommendationId: string,
  endSequence: number,
): TriageRecommendation | undefined {
  const revisions = snapshot.recommendationRevisions
    .map((revision) => ({
      revision,
      event: snapshot.events.find(({ id }) => id === revision.operationalEventId),
    }))
    .filter(({ revision, event }) =>
      revision.recommendation.id === recommendationId
      && event !== undefined
      && event.sequence < endSequence,
    )
    .sort((left, right) => right.event!.sequence - left.event!.sequence);
  return revisions[0]?.revision.recommendation;
}

/** Projects the audit view for a persisted support-response event and canonical message. */
export function operationalSupportResponseAudit(
  event: OperationalWorkflowSnapshot["events"][number],
  message: ConversationMessage,
  recommendation: TriageRecommendation,
): AuditEvent {
  return AuditEventSchema.parse({
    id: event.id,
    timestamp: event.occurredAt,
    actor: event.actor,
    action: "customer-response-sent",
    ticketId: event.ticketId,
    recommendationId: recommendation.id,
    before: {},
    after: {
      sentAt: message.createdAt,
      customerResponse: message.body,
    },
    rationale: "Approved customer response was sent.",
    knowledgeArticleIds: recommendation.knowledgeArticleIds,
    result: "success",
  });
}

/** Projects audits for an ordered set of causal events, requiring immutable recommendation references when requested. */
export function operationalConversationAuditsForEventIds(
  snapshot: OperationalWorkflowSnapshot,
  eventIds: readonly string[],
  options: {
    requireImmutableRecommendations?: boolean;
    readCommandResult?: (commandId: string) => OperationalResultReference | undefined;
  } = {},
): AuditEvent[] {
  const requireImmutableRecommendations = options.requireImmutableRecommendations === true;
  const includedEventIds = new Set(eventIds);
  const persistedEventIds = snapshot.events
    .filter(({ id }) => includedEventIds.has(id))
    .map(({ id }) => id);
  if (
    persistedEventIds.length !== eventIds.length
    || persistedEventIds.some((id, index) => id !== eventIds[index])
  ) {
    throw replayIntegrity("Operational pre-send audit replay is missing its causal events.");
  }
  return snapshot.events.flatMap((event) => {
    if (!includedEventIds.has(event.id)) return [];
    const lifecycleAudit = options.readCommandResult?.(event.commandId)
      ?.lifecycleAuditEvents?.find(({ id }) => id === event.id);
    if (lifecycleAudit !== undefined) {
      return [AuditEventSchema.parse(lifecycleAudit)];
    }
    const message = snapshot.messages.find(
      ({ operationalEventId }) => operationalEventId === event.id,
    );
    if (message?.kind === "customer") {
      return [operationalCustomerReplyAudit(message, snapshot.ticket, event.actor)];
    }
    if (message?.kind === "support") {
      const recommendation = message.recommendationId === undefined
        ? undefined
        : latestRecommendationBeforeEvent(snapshot, message.recommendationId, event.sequence)
        ?? (requireImmutableRecommendations
          ? undefined
          : snapshot.recommendations.find(({ id }) => id === message.recommendationId));
      if (recommendation === undefined && requireImmutableRecommendations) {
        throw replayIntegrity("Operational support-response audit replay is missing its immutable recommendation.");
      }
      return recommendation === undefined ? [] : [operationalSupportResponseAudit(event, message, recommendation)];
    }
    const revision = snapshot.recommendationRevisions.find(
      ({ operationalEventId }) => operationalEventId === event.id,
    );
    if (revision !== undefined) {
      if (event.action === "recommendation-submitted") {
        return [operationalSubmittedRecommendationAudit(event, revision.recommendation)];
      }
      if (
        event.action === "recommendation-approved"
        || event.action === "recommendation-rejected"
        || event.action === "recommendation-canceled"
        || event.action === "recommendation-superseded"
      ) {
        const rationale = event.action === "recommendation-approved"
          ? revision.recommendation.rationale
          : typeof event.facts.reasonCode === "string"
            ? event.facts.reasonCode
            : "Recommendation lifecycle transition completed.";
        return [operationalRecommendationLifecycleAudit(
          event,
          revision.recommendation,
          operationalExpectedResolutionForAnyLifecycle(event.action),
          revision.recommendation.resolution,
          rationale,
        )];
      }
    }
    return [AuditEventSchema.parse({
      id: event.id,
      timestamp: event.occurredAt,
      actor: event.actor,
      action: event.action,
      ticketId: event.ticketId,
      before: {},
      after: event.facts,
      rationale: `Operational ${event.action} event.`,
      knowledgeArticleIds: [],
      result: event.action === "approval-rejected" || event.action === "learning-capture-failed"
        ? "rejected"
        : "success",
      ...(event.action === "approval-rejected" || event.action === "learning-capture-failed"
        ? { rejectionReason: `Operational ${event.action} event.` }
        : {}),
    })];
  });
}

/** Projects the canonical customer message as a customer-reply audit event. */
export function operationalCustomerReplyAudit(
  message: ConversationMessage,
  ticket: Ticket,
  actor: string,
): AuditEvent {
  return AuditEventSchema.parse({
    // Canonical message IDs are the reply watermark. Imported legacy messages
    // retain their source audit ID here by using that ID as the message ID.
    id: message.id,
    timestamp: message.createdAt,
    actor,
    action: "customer-reply-received",
    ticketId: ticket.id,
    before: {},
    after: { body: message.body },
    rationale: "Customer reply added to ticket conversation.",
    knowledgeArticleIds: [],
    result: "success",
  });
}

/** Projects the initial submitted-recommendation audit from its persisted event and revision. */
function operationalSubmittedRecommendationAudit(
  event: OperationalWorkflowSnapshot["events"][number],
  recommendation: TriageRecommendation,
): AuditEvent {
  return AuditEventSchema.parse({
    id: event.id,
    timestamp: event.occurredAt,
    actor: event.actor,
    action: "recommendation-submitted",
    ticketId: event.ticketId,
    recommendationId: recommendation.id,
    before: {},
    after: {
      sourceRevision: recommendation.sourceRevision,
      category: recommendation.category,
      priority: recommendation.priority,
      team: recommendation.team,
      escalationRequired: recommendation.escalationRequired,
      escalationReasons: recommendation.escalationReasons,
    },
    rationale: recommendation.rationale,
    knowledgeArticleIds: recommendation.knowledgeArticleIds,
    result: "success",
  });
}

function operationalExpectedResolutionForAnyLifecycle(
  action: "recommendation-approved" | "recommendation-rejected" | "recommendation-canceled" | "recommendation-superseded",
): TriageRecommendation["resolution"] {
  return action === "recommendation-canceled" ? "approved" : "pending";
}

/** Derives a stable child command identity from a parent identity and action name. */
export function derivedOperationalCommandContext(
  parentCommandId: string,
  action: string,
): OperationalCommandContext {
  const hex = createHash("sha256").update(`${parentCommandId}\0${action}`).digest("hex");
  return {
    commandId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
  };
}

/** Returns an ISO timestamp offset by the requested duration. */
export function plusMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

/** Checks whether a receipt's source ticket matches the approval event and immutable ticket revision history. */
export function compositeAutomaticReplySourceTicketMatchesHistory(
  snapshot: OperationalWorkflowSnapshot,
  result: OperationalResultReference,
  ticketResult: OperationalResultReference["tickets"][number],
  sourceTicket: Ticket,
  approvalEvent: OperationalWorkflowSnapshot["events"][number] | undefined,
  recommendation: TriageRecommendation | undefined,
): boolean {
  const ticketSnapshot = result.ticketSnapshot;
  if (ticketSnapshot === undefined || approvalEvent === undefined || recommendation === undefined) {
    return false;
  }
  if (ticketResult.resultingRevision === null) {
    return sameStructuredValue(sourceTicket, ticketSnapshot);
  }
  const ticketRevision = snapshot.ticketRevisions.find(
    (revision) => revision.ticketId === ticketResult.ticketId
      && revision.revision === ticketResult.resultingRevision
      && revision.operationalEventId === approvalEvent.id,
  );
  if (
    ticketRevision === undefined
    || !sameStructuredValue(ticketRevision.ticket, ticketSnapshot)
  ) {
    return false;
  }
  const expectedRevision = readNonnegativeInteger(approvalEvent.facts.expectedRevision);
  if (expectedRevision === undefined) return false;
  const before = approvalAuditValues(approvalEvent, recommendation).before;
  const reconstructed = TicketSchema.safeParse({
    ...ticketSnapshot,
    ...Object.fromEntries(
      Object.entries(before).filter(([key]) => key in ticketSnapshot),
    ),
    revision: expectedRevision,
  });
  if (!reconstructed.success) return false;
  const { updatedAt: _sourceUpdatedAt, ...sourceWithoutUpdatedAt } = sourceTicket;
  const { updatedAt: _reconstructedUpdatedAt, ...reconstructedWithoutUpdatedAt } = reconstructed.data;
  return sameStructuredValue(sourceWithoutUpdatedAt, reconstructedWithoutUpdatedAt);
}

/** Narrows an unknown persisted value to a nonnegative integer. */
export function readNonnegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Projects lifecycle audits for every event in a workflow snapshot. */
export function operationalAuditEventsFromSnapshot(
  snapshot: OperationalWorkflowSnapshot,
): AuditEvent[] {
  return operationalConversationAuditsForEventIds(
    snapshot,
    snapshot.events.map(({ id }) => id),
  );
}
