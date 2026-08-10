import { describe, expect, it } from "vitest";
import {
  CommandIdSchema,
  ConversationMessageSchema,
  DecisionTimelineEntrySchema,
  ImportStateSchema,
  LearningCaptureEnvelopeSchema,
  OperationalEventSchema,
  OperationalOutboxRowSchema,
  OperationalResultReferenceSchema,
  TicketRevisionSchema,
  canonicalOperationalRequestJson,
} from "../src/operational/domain.js";

const eventId = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";

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
      commandId: "33333333-3333-4333-8333-333333333333",
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
      operationalEventIds: [eventId],
      ticketId: "TKT-0001",
      diagnosisId: "diagnosis-001",
    }).success).toBe(true);
    expect(OperationalResultReferenceSchema.safeParse({
      operation: "record-diagnosis",
      operationalEventIds: [],
      ticketId: "TKT-0001",
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
});
