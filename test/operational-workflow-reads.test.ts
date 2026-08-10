import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TicketSchema,
  TriageRecommendationSchema,
  type AuditEvent,
  type Ticket,
  type TriageRecommendation,
} from "../src/domain.js";
import {
  buildConversationHistoryFromSnapshot,
  buildConversationTimelineFromSnapshot,
} from "../src/approval-desk/conversation-history.js";
import {
  hasCustomerReplyAfterRecommendationFromSnapshot,
} from "../src/approval-desk/workflow-causal-context.js";
import {
  customerRepliesFromSnapshot,
  latestSupportResponseFromSnapshot,
  summarizeRecommendationsForSnapshot,
} from "../src/approval-desk/workflow-read-model.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import type { OperationalWorkflowSnapshot } from "../src/operational/domain.js";
import type { OperationalUnitOfWork } from "../src/operational/unit-of-work.js";
import { operationalMessageCausalPositions } from "../src/approval-desk/workflow-causal-context.js";
import {
  TriageService,
  customerReplyWatermarkFromSnapshot,
  type AuditStore,
  type RecommendationStore,
  type TicketStore,
} from "../src/triage-service.js";

const ticketId = "TKT-4201" as const;
const firstReplyMessageId = "10000000-0000-4000-8000-000000000001";
const supportMessageId = "10000000-0000-4000-8000-000000000002";
const legacyReplyMessageId = "10000000-0000-4000-8000-000000000003";
const recommendationId = "20000000-0000-4000-8000-000000000001";
const replyCommandId = "30000000-0000-4000-8000-000000000001";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("operational workflow reads", () => {
  it("uses event sequence for causal order while rendering bodies only from canonical message rows", () => {
    const { store, path } = seededWorkflowStore();
    const snapshot = store.readWorkflowSnapshot(ticketId);

    expect(customerReplyWatermarkFromSnapshot(snapshot)).toEqual({
      state: "reply",
      id: legacyReplyMessageId,
      timestamp: "2026-08-10T07:00:00.000Z",
    });
    expect(customerRepliesFromSnapshot(snapshot)).toEqual([
      {
        id: firstReplyMessageId,
        ticketId,
        createdAt: "2026-08-10T11:00:00.000Z",
        body: "First reply in causal order.",
      },
      {
        id: legacyReplyMessageId,
        ticketId,
        createdAt: "2026-08-10T07:00:00.000Z",
        body: "Latest reply by sequence, despite its older timestamp.",
      },
    ]);
    expect(latestSupportResponseFromSnapshot(snapshot)).toEqual({
      sentAt: "2026-08-10T08:00:00.000Z",
      body: "Canonical support response body.",
    });
    expect(hasCustomerReplyAfterRecommendationFromSnapshot(
      snapshot,
      snapshot.recommendations[0]!,
    )).toBe(true);

    const summary = summarizeRecommendationsForSnapshot(snapshot);
    expect(summary.summary).toMatchObject({
      latestRecommendationId: recommendationId,
      workflowState: "customer-replied",
      latestSentAt: "2026-08-10T08:00:00.000Z",
      latestCustomerReplyAt: "2026-08-10T07:00:00.000Z",
    });
    expect(buildConversationHistoryFromSnapshot(snapshot).map(({ action }) => action))
      .toEqual([
        "customer-reply-received",
        "recommendation-submitted",
        "customer-response-sent",
        "customer-reply-received",
      ]);
    expect(buildConversationTimelineFromSnapshot(snapshot).map((item) => item.kind))
      .toEqual([
        "original-ticket",
        "customer-reply",
        "recommendation-event",
        "support-response-sent",
        "customer-reply",
      ]);
    expect(buildConversationTimelineFromSnapshot(snapshot).at(-1)).toMatchObject({
      kind: "customer-reply",
      body: "Latest reply by sequence, despite its older timestamp.",
    });
    expect(snapshot.events.every((event) => !JSON.stringify(event).includes("reply by sequence")))
      .toBe(true);
    expect(snapshot.events.every((event) => !JSON.stringify(event).includes("support response body")))
      .toBe(true);

    store.close();
    const reopened = OperationalSqliteStore.open(path);
    reopened.initialize();
    expect(customerReplyWatermarkFromSnapshot(reopened.readWorkflowSnapshot(ticketId)))
      .toEqual({
        state: "reply",
        id: legacyReplyMessageId,
        timestamp: "2026-08-10T07:00:00.000Z",
      });
    reopened.close();
  });

  it("writes a customer reply as one atomic message, reference-only event, trace, and replay result", async () => {
    const harness = replyHarness();
    try {
      const input = {
        ticketId,
        actor: "customer",
        body: "The failure now includes request req-4201.",
        receivedAt: "2026-08-11T10:00:00.000Z",
        source: "email",
      } as const;
      const first = await harness.service.addCustomerReply(input, { commandId: replyCommandId });
      const beforeReplay = harness.store.readWorkflowSnapshot(ticketId);
      const replay = await harness.service.addCustomerReply({
        ...input,
        // Adapters generate this attempt timestamp; it is not caller-semantic.
        receivedAt: "2026-08-11T10:05:00.000Z",
      }, { commandId: replyCommandId });
      const afterReplay = harness.store.readWorkflowSnapshot(ticketId);

      expect(replay).toEqual(first);
      expect(afterReplay).toEqual(beforeReplay);
      expect(afterReplay.messages).toEqual([
        expect.objectContaining({
          id: "40000000-0000-4000-8000-000000000001",
          kind: "customer",
          body: input.body,
        }),
      ]);
      expect(afterReplay.events).toEqual([
        expect.objectContaining({
          id: "40000000-0000-4000-8000-000000000002",
          sequence: 1,
          action: "customer-reply-received",
          commandId: replyCommandId,
          facts: { messageId: "40000000-0000-4000-8000-000000000001" },
        }),
      ]);
      expect(JSON.stringify(afterReplay.events[0])).not.toContain(input.body);
      expect(afterReplay.traces).toEqual([
        expect.objectContaining({
          operationalEventId: "40000000-0000-4000-8000-000000000002",
          traceType: "lifecycle",
          stage: "customer-reply-received",
          outcome: "success",
        }),
      ]);
      expect(customerReplyWatermarkFromSnapshot(afterReplay)).toEqual({
        state: "reply",
        id: "40000000-0000-4000-8000-000000000001",
        timestamp: input.receivedAt,
      });
    } finally {
      harness.store.close();
    }
  });

  it("rolls back the reply event, canonical message, trace, and command claim together", async () => {
    const harness = replyHarness({ failTrace: true });
    try {
      await expect(harness.service.addCustomerReply({
        ticketId,
        actor: "customer",
        body: "This write must roll back.",
        receivedAt: "2026-08-11T10:00:00.000Z",
      }, { commandId: replyCommandId })).rejects.toThrow("injected reply trace failure");

      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      expect(snapshot.events).toEqual([]);
      expect(snapshot.messages).toEqual([]);
      expect(snapshot.traces).toEqual([]);
      expect(snapshot.customerReplyWatermark).toEqual({ state: "none" });
    } finally {
      harness.store.close();
    }
  });

  it.each([
    ["missing message row", (unit: OperationalUnitOfWork, eventId: string, messageId: string) => {
      appendMessageEvent(unit, eventId, messageId, "customer-reply-received");
    }],
    ["mismatched message ID", (unit: OperationalUnitOfWork, eventId: string, messageId: string) => {
      appendMessageEvent(unit, eventId, messageId, "customer-reply-received");
      insertBoundMessage(unit, eventId, "71000000-0000-4000-8000-000000000099", "customer");
    }],
    ["wrong message kind", (unit: OperationalUnitOfWork, eventId: string, messageId: string) => {
      appendMessageEvent(unit, eventId, messageId, "customer-reply-received");
      insertBoundMessage(unit, eventId, messageId, "support");
    }],
    ["message linked to an unrelated action", (unit: OperationalUnitOfWork, eventId: string, messageId: string) => {
      const [sequence] = unit.allocateEventSequences(ticketId, 1);
      unit.appendEvent(workflowEvent({
        id: eventId,
        sequence: sequence!,
        occurredAt: "2026-08-11T12:00:00.000Z",
        action: "ticket-updated",
        facts: {},
      }));
      insertBoundMessage(unit, eventId, messageId, "customer");
    }],
    ["extra message-event facts", (unit: OperationalUnitOfWork, eventId: string, messageId: string) => {
      const [sequence] = unit.allocateEventSequences(ticketId, 1);
      unit.appendEvent(workflowEvent({
        id: eventId,
        sequence: sequence!,
        occurredAt: "2026-08-11T12:00:00.000Z",
        action: "customer-reply-received",
        facts: { messageId, status: "received" },
      }));
      insertBoundMessage(unit, eventId, messageId, "customer");
    }],
  ] as const)("rejects a transaction with %s", (_label, writeInvalidPair) => {
    const { store } = openStore();
    try {
      store.transaction((unit) => unit.insertTicket(makeTicket()));
      const eventId = "70000000-0000-4000-8000-000000000001";
      const messageId = "71000000-0000-4000-8000-000000000001";
      expect(() => store.transaction((unit) => writeInvalidPair(unit, eventId, messageId)))
        .toThrow();
      expect(store.readWorkflowSnapshot(ticketId)).toMatchObject({
        events: [],
        messages: [],
        customerReplyWatermark: { state: "none" },
      });
    } finally {
      store.close();
    }
  });

  it("defensively ignores an unvalidated message/event pair in read projections", () => {
    const { store } = seededWorkflowStore();
    try {
      const snapshot = store.readWorkflowSnapshot(ticketId);
      const invalid = {
        ...snapshot,
        events: snapshot.events.map((event) => event.id === snapshot.messages.at(-1)!.operationalEventId
          ? { ...event, facts: { messageId: firstReplyMessageId } }
          : event),
      } as unknown as OperationalWorkflowSnapshot;

      expect(operationalMessageCausalPositions(invalid, "customer").map(({ message }) => message.id))
        .toEqual([firstReplyMessageId]);
      expect(customerRepliesFromSnapshot(invalid).map(({ id }) => id))
        .toEqual([firstReplyMessageId]);
      expect(buildConversationTimelineFromSnapshot(invalid))
        .not.toContainEqual(expect.objectContaining({
          kind: "customer-reply",
          body: "Latest reply by sequence, despite its older timestamp.",
        }));
    } finally {
      store.close();
    }
  });
});

function seededWorkflowStore(): { store: OperationalSqliteStore; path: string } {
  const { store, path } = openStore();
  const ticket = makeTicket();
  const recommendation = makeRecommendation();
  store.transaction((unit) => {
    unit.insertTicket(ticket);
    const eventIds = [
      "50000000-0000-4000-8000-000000000001",
      "50000000-0000-4000-8000-000000000002",
      "50000000-0000-4000-8000-000000000003",
      "50000000-0000-4000-8000-000000000004",
    ];
    const sequences = unit.allocateEventSequences(ticketId, eventIds.length);
    unit.appendEvent(workflowEvent({
      id: eventIds[0]!,
      sequence: sequences[0]!,
      occurredAt: "2026-08-10T11:00:00.000Z",
      action: "customer-reply-received",
      facts: { messageId: firstReplyMessageId },
    }));
    unit.insertMessage({
      id: firstReplyMessageId,
      ticketId,
      operationalEventId: eventIds[0]!,
      kind: "customer",
      createdAt: "2026-08-10T11:00:00.000Z",
      body: "First reply in causal order.",
    });
    unit.appendEvent(workflowEvent({
      id: eventIds[1]!,
      sequence: sequences[1]!,
      occurredAt: "2026-08-10T09:00:00.000Z",
      action: "recommendation-submitted",
      facts: { status: "pending", sourceRevision: 0 },
    }));
    unit.insertRecommendation(recommendation);
    unit.appendRecommendationRevision({
      recommendation,
      operationalEventId: eventIds[1]!,
      createdAt: recommendation.createdAt,
    });
    unit.appendEvent(workflowEvent({
      id: eventIds[2]!,
      sequence: sequences[2]!,
      occurredAt: "2026-08-10T08:00:00.000Z",
      action: "customer-response-sent",
      facts: { messageId: supportMessageId },
    }));
    unit.insertMessage({
      id: supportMessageId,
      ticketId,
      operationalEventId: eventIds[2]!,
      kind: "support",
      createdAt: "2026-08-10T08:00:00.000Z",
      body: "Canonical support response body.",
      recommendationId,
    });
    unit.appendEvent(workflowEvent({
      id: eventIds[3]!,
      sequence: sequences[3]!,
      occurredAt: "2026-08-10T07:00:00.000Z",
      action: "customer-reply-received",
      facts: { messageId: legacyReplyMessageId },
    }));
    unit.insertMessage({
      // Imported legacy messages preserve their source audit ID as the message ID.
      id: legacyReplyMessageId,
      ticketId,
      operationalEventId: eventIds[3]!,
      kind: "customer",
      createdAt: "2026-08-10T07:00:00.000Z",
      body: "Latest reply by sequence, despite its older timestamp.",
    });
  });
  return { store, path };
}

function replyHarness(options: { failTrace?: boolean } = {}) {
  const { store } = openStore();
  const ticket = makeTicket();
  store.transaction((unit) => unit.insertTicket(ticket));
  const ids = [
    "40000000-0000-4000-8000-000000000001",
    "40000000-0000-4000-8000-000000000002",
    "40000000-0000-4000-8000-000000000003",
  ];
  const operationalStore = options.failTrace === true
    ? {
        readTicket: store.readTicket.bind(store),
        readWorkflowSnapshot: store.readWorkflowSnapshot.bind(store),
        transaction<T>(work: (unit: any) => T): T {
          return store.transaction((unit) => {
            unit.appendTrace = () => { throw new Error("injected reply trace failure"); };
            return work(unit);
          });
        },
      }
    : store;
  const service = new TriageService({
    tickets: rejectingLegacyTicketStore(ticket),
    recommendations: rejectingLegacyRecommendationStore(),
    audit: rejectingLegacyAuditStore(),
    operationalStore,
    uuid: () => ids.shift() ?? "40000000-0000-4000-8000-000000000099",
  });
  return { service, store };
}

function workflowEvent(input: {
  id: string;
  sequence: number;
  occurredAt: string;
  action: AuditEvent["action"];
  facts: Readonly<Record<string, unknown>>;
}) {
  return {
    id: input.id,
    ticketId,
    sequence: input.sequence,
    occurredAt: input.occurredAt,
    actor: input.action === "customer-response-sent" ? "support" : "customer",
    action: input.action,
    commandId: "60000000-0000-4000-8000-000000000001",
    facts: input.facts,
  };
}

function appendMessageEvent(
  unit: OperationalUnitOfWork,
  eventId: string,
  messageId: string,
  action: "customer-reply-received" | "customer-response-sent",
): void {
  const [sequence] = unit.allocateEventSequences(ticketId, 1);
  unit.appendEvent(workflowEvent({
    id: eventId,
    sequence: sequence!,
    occurredAt: "2026-08-11T12:00:00.000Z",
    action,
    facts: { messageId },
  }));
}

function insertBoundMessage(
  unit: OperationalUnitOfWork,
  operationalEventId: string,
  id: string,
  kind: "customer" | "support",
): void {
  unit.insertMessage({
    id,
    ticketId,
    operationalEventId,
    kind,
    createdAt: "2026-08-11T12:00:00.000Z",
    body: "Canonical message body.",
  });
}

function openStore(): { store: OperationalSqliteStore; path: string } {
  const root = mkdtempSync(join(tmpdir(), "operational-workflow-reads-"));
  temporaryRoots.push(root);
  const path = join(root, "operational.sqlite");
  const store = OperationalSqliteStore.open(path);
  store.initialize();
  return { store, path };
}

function makeTicket(): Ticket {
  return TicketSchema.parse({
    id: ticketId,
    revision: 0,
    customer: { name: "Northstar", plan: "enterprise", region: "eu", vip: false },
    requester: { name: "Maya", role: "Engineer", department: "Platform", technicalLevel: "technical", seniority: "manager" },
    subject: "API requests fail",
    description: "Requests return a server error.",
    status: "triage",
    category: "api",
    priority: "P2",
    team: "api-platform",
    tags: ["api"],
    relatedTicketIds: [],
    sla: { responseDueAt: "2026-08-12T00:00:00.000Z", breached: false },
    createdAt: "2026-08-10T06:00:00.000Z",
    updatedAt: "2026-08-10T06:00:00.000Z",
  });
}

function makeRecommendation(): TriageRecommendation {
  return TriageRecommendationSchema.parse({
    id: recommendationId,
    ticketId,
    sourceRevision: 0,
    category: "api",
    priority: "P2",
    team: "api-platform",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    knowledgeArticleIds: ["api-errors"],
    draftCustomerResponse: "Canonical support response body.",
    rationale: "API errors require platform review.",
    confidence: 0.8,
    recommendedNextAction: "Review request logs.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "approved",
    createdAt: "2026-08-10T09:00:00.000Z",
  });
}

function rejectingLegacyTicketStore(ticket: Ticket): TicketStore {
  return {
    get: async () => ticket,
    update: async () => { throw new Error("legacy ticket write used"); },
    updateWithCommit: async () => { throw new Error("legacy ticket write used"); },
  };
}

function rejectingLegacyRecommendationStore(): RecommendationStore {
  return {
    create: async () => { throw new Error("legacy recommendation write used"); },
    get: async () => { throw new Error("legacy recommendation read used"); },
    list: async () => [],
    deletePending: async () => { throw new Error("legacy recommendation write used"); },
    transitionResolution: async () => { throw new Error("legacy recommendation write used"); },
    markResolved: async () => { throw new Error("legacy recommendation write used"); },
  };
}

function rejectingLegacyAuditStore(): AuditStore {
  return {
    append: async () => { throw new Error("legacy audit write used"); },
    appendBatch: async () => { throw new Error("legacy audit write used"); },
    list: async () => [],
  };
}
