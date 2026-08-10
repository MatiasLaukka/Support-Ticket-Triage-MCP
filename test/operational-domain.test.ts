import { describe, expect, it } from "vitest";
import {
  CommandIdSchema,
  CommandIdempotencyRecordSchema,
  ConversationMessageSchema,
  DecisionTraceEventSchema,
  DecisionTimelineEntrySchema,
  ImportStateSchema,
  LearningCaptureEnvelopeSchema,
  OperationalEventSchema,
  OperationalOutboxRowSchema,
  OperationalResultReferenceSchema,
  OperationalWorkflowSnapshotSchema,
  RequestHashSchema,
  RevisionNumberSchema,
  TicketRevisionSchema,
  canonicalOperationalRequestJson,
} from "../src/operational/domain.js";

const eventId = "11111111-1111-4111-8111-111111111111";
const secondEventId = "12111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";
const commandId = "33333333-3333-4333-8333-333333333333";
const requestHash = "a".repeat(64);

const ticket = {
  id: "TKT-0001",
  createdAt: "2026-08-10T09:00:00.000Z",
  updatedAt: "2026-08-10T10:00:00.000Z",
  customer: { name: "Ada", plan: "Pro", region: "EU", vip: false },
  subject: "Requests fail",
  description: "Requests return 401 after credential rotation.",
  status: "in-progress",
  tags: [],
  sla: { responseDueAt: "2026-08-10T11:00:00.000Z", breached: false },
  revision: 2,
};

describe("operational persistence domain", () => {
  it("rejects malformed identifiers and non-positive causal sequences", () => {
    expect(CommandIdSchema.safeParse("not-a-command").success).toBe(false);
    expect(OperationalEventSchema.safeParse({
      id: eventId,
      ticketId: "TKT-0001",
      sequence: 0,
      occurredAt: "2026-08-10T10:00:00.000Z",
      actor: "support-lead",
      action: "ticket-updated",
      commandId,
      facts: {},
    }).success).toBe(false);
    expect(ConversationMessageSchema.safeParse({
      id: "message-1",
      ticketId: "TKT-0001",
      operationalEventId: eventId,
      kind: "customer",
      createdAt: "2026-08-10T10:00:00.000Z",
      body: "The customer supplied a request ID.",
    }).success).toBe(false);
  });

  it("accepts a ticket revision only when it matches the canonical ticket projection", () => {
    expect(TicketRevisionSchema.safeParse({
      ticketId: "TKT-0001",
      revision: 1,
      ticket,
      operationalEventId: eventId,
      createdAt: "2026-08-10T10:00:00.000Z",
    }).success).toBe(false);
  });

  it("requires immutable committed facts for every learning capture mapping", () => {
    const base = {
      operationalEventId: eventId,
      deliveryKey: "44444444-4444-4444-8444-444444444444",
      occurredAt: "2026-08-10T10:00:00.000Z",
      actor: "support-lead",
      ticketId: "TKT-0001",
    };
    for (const envelope of [
      { ...base, eventType: "diagnosis-recorded", diagnosisId: "diagnosis-001", evidenceIds: ["request-id"], knowledgeArticleIds: ["api-auth"], provenance: "Sanitized diagnosis outcome." },
      { ...base, eventType: "diagnosis-approved", diagnosisId: "diagnosis-001", evidenceIds: ["request-id"], knowledgeArticleIds: ["api-auth"], provenance: "Sanitized review outcome." },
      { ...base, eventType: "fix-available", diagnosisId: "diagnosis-001", outcomeStatus: "available", provenance: "Sanitized fix outcome." },
      { ...base, eventType: "outcome-verified", diagnosisId: "diagnosis-001", evidenceIds: ["request-id"], verificationType: "customer-confirmed", outcomeStatus: "resolved", provenance: "Sanitized verification outcome." },
    ]) expect(LearningCaptureEnvelopeSchema.safeParse(envelope).success).toBe(true);

    expect(LearningCaptureEnvelopeSchema.safeParse({
      ...base,
      eventType: "outcome-verified",
      diagnosisId: "diagnosis-001",
      evidenceIds: [],
      outcomeStatus: "resolved",
      provenance: "Sanitized verification outcome.",
    }).success).toBe(false);
  });

  it("strictly validates result references, outbox states, import states, and causal timeline entries", () => {
    expect(OperationalResultReferenceSchema.safeParse({
      operation: "record-diagnosis",
      tickets: [{ ticketId: "TKT-0001", operationalEventIds: [eventId], resultingRevision: 2 }],
      diagnosisId: "diagnosis-001",
    }).success).toBe(true);
    expect(OperationalResultReferenceSchema.safeParse({
      operation: "apply-diagnosis-fix",
      tickets: [
        { ticketId: "TKT-0001", operationalEventIds: [eventId], resultingRevision: 3 },
        { ticketId: "TKT-0002", operationalEventIds: [secondEventId], resultingRevision: null },
      ],
      diagnosisId: "diagnosis-001",
    }).success).toBe(true);
    expect(OperationalResultReferenceSchema.safeParse({
      operation: "record-diagnosis",
      tickets: [{ ticketId: "TKT-0001", operationalEventIds: [], resultingRevision: 2 }],
    }).success).toBe(false);
    expect(OperationalOutboxRowSchema.safeParse({
      id: "55555555-5555-4555-8555-555555555555",
      operationalEventId: eventId,
      deliveryKey: "44444444-4444-4444-8444-444444444444",
      envelope: { operationalEventId: eventId, deliveryKey: "44444444-4444-4444-8444-444444444444", occurredAt: "2026-08-10T10:00:00.000Z", actor: "support-lead", ticketId: "TKT-0001", eventType: "fix-available", outcomeStatus: "available", provenance: "Sanitized fix outcome." },
      status: "pending",
      attempts: 0,
      createdAt: "2026-08-10T10:00:00.000Z",
    }).success).toBe(true);
    expect(OperationalOutboxRowSchema.safeParse({ status: "retrying" }).success).toBe(false);
    expect(ImportStateSchema.safeParse("native").success).toBe(true);
    expect(ImportStateSchema.safeParse("ready").success).toBe(false);
    expect(DecisionTimelineEntrySchema.safeParse({
      operationalEventId: eventId,
      ticketId: "TKT-0001",
      sequence: 1,
      occurredAt: "2026-08-10T10:00:00.000Z",
      actor: "support-lead",
      action: "ticket-updated",
      outcome: "success",
      references: { messageId },
      rawCustomerBody: "must not enter the timeline",
    }).success).toBe(false);
  });

  it("normalizes request objects into stable key-sorted JSON", () => {
    expect(canonicalOperationalRequestJson({ z: [true, { b: 2, a: 1 }], a: "value" }))
      .toBe('{"a":"value","z":[true,{"a":1,"b":2}]}');
  });

  it("validates event, ticket, request-hash, revision, and idempotency-record boundaries", () => {
    expect(RequestHashSchema.safeParse(requestHash).success).toBe(true);
    expect(RequestHashSchema.safeParse("abc").success).toBe(false);
    expect(RevisionNumberSchema.safeParse(-1).success).toBe(false);
    expect(OperationalEventSchema.safeParse({
      id: "not-an-event-id", ticketId: "TKT-0001", sequence: 1,
      occurredAt: "2026-08-10T10:00:00.000Z", actor: "support-lead",
      action: "ticket-updated", commandId, facts: {},
    }).success).toBe(false);
    expect(OperationalEventSchema.safeParse({
      id: eventId, ticketId: "ticket-1", sequence: 1,
      occurredAt: "2026-08-10T10:00:00.000Z", actor: "support-lead",
      action: "ticket-updated", commandId, facts: {},
    }).success).toBe(false);
    expect(CommandIdempotencyRecordSchema.safeParse({
      commandId, operation: "record-diagnosis", requestHash,
      result: { operation: "record-diagnosis", tickets: [{ ticketId: "TKT-0001", operationalEventIds: [eventId], resultingRevision: 2 }] },
      createdAt: "2026-08-10T10:00:00.000Z",
    }).success).toBe(true);
  });

  it("accepts only closed sanitized operational facts", () => {
    const base = { id: eventId, ticketId: "TKT-0001", sequence: 1, occurredAt: "2026-08-10T10:00:00.000Z", actor: "support-lead", action: "ticket-updated", commandId };
    expect(OperationalEventSchema.safeParse({ ...base, facts: { count: 2, approved: true, evidence: ["request-id"] } }).success).toBe(true);
    expect(OperationalEventSchema.safeParse({ ...base, action: "customer-reply-received", facts: { messageId } }).success).toBe(true);
    expect(OperationalEventSchema.safeParse({ ...base, action: "customer-response-sent", facts: { messageId } }).success).toBe(true);
    for (const event of [
      { ...base, facts: { messageId } },
      { ...base, action: "customer-reply-received", facts: {} },
      { ...base, action: "customer-reply-received", facts: { messageId, status: "received" } },
      { ...base, action: "customer-response-sent", facts: { messageId: "message-1" } },
    ]) expect(OperationalEventSchema.safeParse(event).success).toBe(false);
    for (const facts of [
      { body: "Customer body must not be copied." },
      { content: "Customer content must not be copied." },
      { message: "Customer message must not be copied." },
      { customerMessage: "Customer message must not be copied." },
      { response: "Customer response must not be copied." },
      { customerResponse: "A customer response must not be copied." },
      { prompt: "system instructions" },
      { reasoning: "hidden reasoning" },
      { credential: "secret" },
      { path: "C:\\sensitive" },
      { nested: { unsafe: Infinity } },
      { unexpected: "Unknown fact keys are rejected." },
    ]) expect(OperationalEventSchema.safeParse({ ...base, facts }).success).toBe(false);
  });

  it("validates every approved sanitized decision-trace variant", () => {
    const base = { id: "66666666-6666-4666-8666-666666666666", operationalEventId: eventId, ticketId: "TKT-0001", occurredAt: "2026-08-10T10:00:00.000Z", actor: "support-lead" };
    for (const trace of [
      { ...base, traceType: "classification", category: "api", priority: "P2", team: "api-platform", confidence: 0.9, reasons: ["API response evidence"] },
      { ...base, traceType: "evidence", requiredEvidenceIds: ["request-id"], providedEvidenceIds: ["request-id"], missingEvidenceIds: [] },
      { ...base, traceType: "known-cause", knownCause: "api-credential-rotation", knownEventId: "API-123", matchReasons: ["credential rotation matches"] },
      { ...base, traceType: "lifecycle", stage: "diagnosis-recorded", outcome: "success", reason: "Diagnosis recorded." },
      { ...base, traceType: "provider-telemetry", provider: "openai", model: "gpt-5", status: "used", latencyMs: 23, inputTokens: 10, outputTokens: 5 },
    ]) expect(DecisionTraceEventSchema.safeParse(trace).success).toBe(true);
    expect(DecisionTraceEventSchema.safeParse({ ...base, traceType: "classification", category: "api", priority: "P2", team: "api-platform", confidence: 0.9, reasons: ["raw system prompt"] }).success).toBe(false);
  });

  it("requires workflow snapshots to retain ticket ownership, unique events, and sequence order", () => {
    const event = { id: eventId, ticketId: "TKT-0001", sequence: 2, occurredAt: "2026-08-10T10:00:00.000Z", actor: "support-lead", action: "ticket-updated", commandId, facts: {} };
    const snapshot = {
      ticket,
      ticketRevisions: [],
      recommendations: [],
      recommendationRevisions: [],
      messages: [],
      diagnoses: [],
      events: [event],
      traces: [],
      customerReplyWatermark: { state: "none" },
    };
    expect(OperationalWorkflowSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(OperationalWorkflowSnapshotSchema.safeParse({ ...snapshot, messages: [{ id: messageId, ticketId: "TKT-0002", operationalEventId: eventId, kind: "customer", createdAt: "2026-08-10T10:00:00.000Z", body: "Reply" }] }).success).toBe(false);
    expect(OperationalWorkflowSnapshotSchema.safeParse({ ...snapshot, events: [event, { ...event, sequence: 1 }] }).success).toBe(false);
  });

  it("requires the workflow watermark to name the latest customer message by event sequence", () => {
    const latestMessageId = "23222222-2222-4222-8222-222222222222";
    const events = [
      { id: eventId, ticketId: "TKT-0001", sequence: 1, occurredAt: "2026-08-10T11:00:00.000Z", actor: "customer", action: "customer-reply-received", commandId, facts: { messageId } },
      { id: secondEventId, ticketId: "TKT-0001", sequence: 2, occurredAt: "2026-08-10T09:00:00.000Z", actor: "customer", action: "customer-reply-received", commandId, facts: { messageId: latestMessageId } },
    ];
    const messages = [
      { id: messageId, ticketId: "TKT-0001", operationalEventId: eventId, kind: "customer", createdAt: "2026-08-10T11:00:00.000Z", body: "Earlier by sequence." },
      { id: latestMessageId, ticketId: "TKT-0001", operationalEventId: secondEventId, kind: "customer", createdAt: "2026-08-10T09:00:00.000Z", body: "Latest by sequence." },
    ];
    const snapshot = {
      ticket,
      ticketRevisions: [],
      recommendations: [],
      recommendationRevisions: [],
      messages,
      diagnoses: [],
      events,
      traces: [],
    };
    expect(OperationalWorkflowSnapshotSchema.safeParse({
      ...snapshot,
      customerReplyWatermark: { state: "reply", timestamp: messages[1]!.createdAt, id: latestMessageId },
    }).success).toBe(true);
    expect(OperationalWorkflowSnapshotSchema.safeParse({
      ...snapshot,
      customerReplyWatermark: { state: "reply", timestamp: messages[0]!.createdAt, id: messageId },
    }).success).toBe(false);
  });

  it("requires every snapshot message and message event to form one exact canonical pair", () => {
    const event = {
      id: eventId,
      ticketId: "TKT-0001",
      sequence: 1,
      occurredAt: "2026-08-10T10:00:00.000Z",
      actor: "customer",
      action: "customer-reply-received",
      commandId,
      facts: { messageId },
    };
    const message = {
      id: messageId,
      ticketId: "TKT-0001",
      operationalEventId: eventId,
      kind: "customer",
      createdAt: "2026-08-10T10:00:00.000Z",
      body: "Canonical reply body.",
    };
    const snapshot = {
      ticket,
      ticketRevisions: [],
      recommendations: [],
      recommendationRevisions: [],
      messages: [message],
      diagnoses: [],
      events: [event],
      traces: [],
      customerReplyWatermark: { state: "reply", timestamp: message.createdAt, id: message.id },
    };
    expect(OperationalWorkflowSnapshotSchema.safeParse(snapshot).success).toBe(true);
    for (const invalid of [
      { ...snapshot, messages: [], customerReplyWatermark: { state: "none" } },
      { ...snapshot, events: [{ ...event, facts: { messageId: "24222222-2222-4222-8222-222222222222" } }] },
      { ...snapshot, messages: [{ ...message, kind: "support" }], customerReplyWatermark: { state: "none" } },
      { ...snapshot, events: [{ ...event, action: "ticket-updated", facts: {} }] },
      { ...snapshot, events: [{ ...event, facts: { messageId, status: "received" } }] },
    ]) expect(OperationalWorkflowSnapshotSchema.safeParse(invalid).success).toBe(false);
  });
});
