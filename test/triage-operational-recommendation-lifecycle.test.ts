import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApprovalSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type Approval,
  type Ticket,
  type TriageRecommendation,
} from "../src/domain.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { hasCustomerReplyAfterRecommendation } from "../src/approval-desk/workflow-causal-context.js";
import {
  TriageService,
  derivedOperationalCommandContext,
} from "../src/triage-service.js";

const ticketId = "TKT-4301" as const;
const recommendationId = "10000000-0000-4000-8000-000000000001";
const seedCommandId = "20000000-0000-4000-8000-000000000001";
const seedEventId = "30000000-0000-4000-8000-000000000001";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("transactional operational recommendation lifecycle", () => {
  it("atomically approves field overrides with ticket and recommendation revisions", async () => {
    const harness = openHarness("pending");
    try {
      const commandId = command(10);
      const result = await harness.service.approve(approval({
        approvedFields: ["priority", "assignee", "tags"],
        fieldOverrides: {
          priority: "P2",
          assignee: "reviewed-owner@example.test",
          tags: ["reviewed", "api"],
        },
      }), { commandId });

      expect(result.ticket).toMatchObject({
        revision: 1,
        priority: "P2",
        assignee: "reviewed-owner@example.test",
        tags: ["reviewed", "api"],
      });
      expect(result.auditEvent).toMatchObject({
        before: {
          priority: "P3",
          assignee: "current-owner@example.test",
          tags: ["existing"],
        },
        after: {
          priority: "P2",
          assignee: "reviewed-owner@example.test",
          tags: ["reviewed", "api"],
        },
      });
      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      expect(snapshot.ticket).toEqual(result.ticket);
      expect(snapshot.recommendations.find(({ id }) => id === recommendationId)?.resolution)
        .toBe("approved");
      expect(snapshot.ticketRevisions).toHaveLength(1);
      expect(snapshot.recommendationRevisions).toHaveLength(2);
      expect(snapshot.events.filter((event) => event.commandId === commandId).map(({ action }) => action))
        .toEqual(["recommendation-approved"]);
      expect(snapshot.traces.filter(({ operationalEventId }) =>
        snapshot.events.some((event) => event.commandId === commandId && event.id === operationalEventId),
      )).toMatchObject([{ traceType: "lifecycle", stage: "recommendation-approved", outcome: "success" }]);

      const beforeReplay = structuredClone(snapshot);
      await expect(harness.service.approve(approval({
        approvedFields: ["priority", "assignee", "tags"],
        fieldOverrides: {
          priority: "P2",
          assignee: "reviewed-owner@example.test",
          tags: ["reviewed", "api"],
        },
      }), { commandId })).resolves.toEqual(result);
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(beforeReplay);
    } finally {
      harness.store.close();
    }
  });

  it.each([
    {
      label: "reject",
      resolution: "pending" as const,
      action: "recommendation-rejected" as const,
      resultingResolution: "rejected" as const,
      invoke: (service: TriageService, commandId: string) => service.reject({
        recommendationId,
        ticketId,
        actor: "reviewer",
        feedback: "The routing evidence is incomplete.",
        rejectedAt: "2026-08-11T12:10:00.000Z",
      }, { commandId }),
    },
    {
      label: "cancel",
      resolution: "approved" as const,
      action: "recommendation-canceled" as const,
      resultingResolution: "canceled" as const,
      invoke: (service: TriageService, commandId: string) => service.cancelApproval({
        recommendationId,
        ticketId,
        actor: "reviewer",
        reason: "A new review is required.",
        canceledAt: "2026-08-11T12:10:00.000Z",
      }, { commandId }),
    },
    {
      label: "supersede",
      resolution: "pending" as const,
      action: "recommendation-superseded" as const,
      resultingResolution: "superseded" as const,
      invoke: (service: TriageService, commandId: string) => service.supersedeRecommendation({
        recommendationId,
        ticketId,
        actor: "reviewer",
        reason: "A newer recommendation is required.",
        supersededAt: "2026-08-11T12:10:00.000Z",
      }, { commandId }),
    },
  ])("atomically persists and replays $label lifecycle transitions", async (testCase) => {
    const harness = openHarness(testCase.resolution);
    try {
      const commandId = command(20);
      const first = await testCase.invoke(harness.service, commandId);
      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      expect(snapshot.ticket.revision).toBe(0);
      expect(snapshot.ticketRevisions).toEqual([]);
      expect(snapshot.recommendations[0]?.resolution).toBe(testCase.resultingResolution);
      expect(snapshot.recommendationRevisions).toHaveLength(2);
      expect(snapshot.events.filter((event) => event.commandId === commandId).map(({ action }) => action))
        .toEqual([testCase.action]);
      expect(snapshot.traces.at(-1)).toMatchObject({
        traceType: "lifecycle",
        stage: testCase.action,
        outcome: "success",
      });

      await expect(testCase.invoke(harness.service, commandId)).resolves.toEqual(first);
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(snapshot);
    } finally {
      harness.store.close();
    }
  });

  it("stores a sent response body only in a canonical support message", async () => {
    const harness = openHarness("approved");
    try {
      const commandId = command(30);
      const sent = await harness.service.markResponseSent({
        recommendationId,
        ticketId,
        actor: "support-agent",
        sentAt: "2026-08-11T12:20:00.000Z",
        customerResponse: "The reviewed response is ready.",
      }, { commandId });
      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      const [event] = snapshot.events.filter((candidate) => candidate.commandId === commandId);
      expect(event).toMatchObject({
        action: "customer-response-sent",
        facts: { messageId: snapshot.messages[0]?.id },
      });
      expect(Object.keys(event!.facts)).toEqual(["messageId"]);
      expect(snapshot.messages).toMatchObject([{
        kind: "support",
        body: "The reviewed response is ready.",
        recommendationId,
        operationalEventId: event!.id,
      }]);
      expect(snapshot.recommendationRevisions).toHaveLength(1);
      expect(snapshot.traces).toMatchObject([{
        traceType: "lifecycle",
        stage: "customer-response-sent",
        outcome: "success",
      }]);
      expect(sent).toMatchObject({
        id: event!.id,
        action: "customer-response-sent",
        after: { customerResponse: "The reviewed response is ready." },
      });

      await expect(harness.service.markResponseSent({
        recommendationId,
        ticketId,
        actor: "support-agent",
        sentAt: "2026-08-11T12:20:00.000Z",
        customerResponse: "The reviewed response is ready.",
      }, { commandId })).resolves.toEqual(sent);
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(snapshot);
    } finally {
      harness.store.close();
    }
  });

  it("rejects a second response command from the transaction-local sent-message state", async () => {
    const harness = openHarness("approved");
    try {
      const input = {
        recommendationId,
        ticketId,
        actor: "support-agent",
        sentAt: "2026-08-11T12:20:00.000Z",
        customerResponse: "The reviewed response is ready.",
      };
      await harness.service.markResponseSent(input, { commandId: command(31) });
      const before = harness.store.readWorkflowSnapshot(ticketId);

      await expect(harness.service.markResponseSent({
        ...input,
        sentAt: "2026-08-11T12:21:00.000Z",
      }, { commandId: command(32) })).rejects.toMatchObject({
        code: "STALE_APPROVAL",
      });
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(before);
    } finally {
      harness.store.close();
    }
  });

  it("rejects a sent response after a causally newer customer reply", async () => {
    const harness = openHarness("approved");
    try {
      appendCustomerReply(harness.store);
      const before = harness.store.readWorkflowSnapshot(ticketId);
      const commandId = command(33);
      await expect(harness.service.markResponseSent({
        recommendationId,
        ticketId,
        actor: "support-agent",
        sentAt: "2026-08-11T12:20:00.000Z",
        customerResponse: "The reviewed response is ready.",
      }, { commandId })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(before);
    } finally {
      harness.store.close();
    }
  });

  it("commits composed approval then response send in one ordered command", async () => {
    const harness = openHarness("pending");
    try {
      const commandId = command(40);
      const input = {
        approval: approval({
          approvedFields: ["customerResponse"],
          editedCustomerResponse: "The reviewed response is ready.",
        }),
        responseSent: {
          recommendationId,
          ticketId,
          actor: "reviewer",
          sentAt: "2026-08-11T12:31:00.000Z",
          customerResponse: "The reviewed response is ready.",
        },
      };
      const result = await harness.service.approveAndMarkResponseSent(input, { commandId });
      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      expect(snapshot.ticket.revision).toBe(0);
      expect(snapshot.recommendations[0]?.resolution).toBe("approved");
      expect(snapshot.events.filter((event) => event.commandId === commandId).map(({ action, sequence }) => ({ action, sequence })))
        .toEqual([
          { action: "recommendation-approved", sequence: 2 },
          { action: "customer-response-sent", sequence: 3 },
        ]);
      expect(snapshot.messages).toMatchObject([{
        kind: "support",
        body: "The reviewed response is ready.",
        recommendationId,
      }]);
      expect(snapshot.recommendationRevisions).toHaveLength(2);
      expect(snapshot.traces.map(({ traceType }) => traceType)).toEqual(["lifecycle", "lifecycle"]);
      expect(result).toMatchObject({
        ticket: { revision: 0 },
        approvalEvent: { action: "recommendation-approved" },
        sentEvent: { action: "customer-response-sent" },
      });
      expect(result.auditsBeforeSent.map(({ action }) => action)).toEqual([
        "recommendation-submitted",
        "recommendation-approved",
      ]);

      await expect(harness.service.approveAndMarkResponseSent(input, { commandId }))
        .resolves.toEqual(result);
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(snapshot);
    } finally {
      harness.store.close();
    }
  });

  it("replays the exact composed result after its deterministic automatic-reply child commits", async () => {
    const harness = openHarness("pending");
    try {
      const parentCommandId = command(41);
      const input = {
        approval: approval({
          approvedFields: ["customerResponse"],
          editedCustomerResponse: "The reviewed response is ready.",
        }),
        responseSent: {
          recommendationId,
          ticketId,
          actor: "reviewer",
          sentAt: "2026-08-11T12:31:00.000Z",
          customerResponse: "The reviewed response is ready.",
        },
      };
      const automaticReplyInput = {
        ticketId,
        actor: "Northstar",
        body: "The failure still occurs after the reviewed response.",
        receivedAt: "2026-08-11T12:31:00.001Z",
        source: "demo-auto-reply",
      } as const;
      const childContext = derivedOperationalCommandContext(
        parentCommandId,
        "automatic-customer-reply",
      );
      const invokeComposed = async () => {
        const completed = await harness.service.approveAndMarkResponseSent(
          input,
          { commandId: parentCommandId },
        );
        const automaticReply = hasCustomerReplyAfterRecommendation(
          completed.auditsBeforeSent,
          makeRecommendation("approved"),
        )
          ? undefined
          : await harness.service.addCustomerReply(automaticReplyInput, childContext);
        return {
          ...completed,
          ...(automaticReply === undefined ? {} : { automaticReply }),
        };
      };

      const first = await invokeComposed();
      const afterFirst = harness.store.readWorkflowSnapshot(ticketId);
      expect(first).toHaveProperty("automaticReply.action", "customer-reply-received");

      await expect(invokeComposed()).resolves.toEqual(first);
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(afterFirst);
    } finally {
      harness.store.close();
    }
  });

  it("rolls back aggregate, revision, event, trace, and ticket writes on an inner failure", async () => {
    const harness = openHarness("pending", { failTrace: true });
    try {
      const before = harness.store.readWorkflowSnapshot(ticketId);
      await expect(harness.service.approve(approval({ approvedFields: ["priority"] }), {
        commandId: command(50),
      })).rejects.toThrow("injected lifecycle trace failure");
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(before);
    } finally {
      harness.store.close();
    }
  });

  it("rolls back a canonical support message when its lifecycle trace fails", async () => {
    const harness = openHarness("approved", { failTrace: true });
    try {
      const before = harness.store.readWorkflowSnapshot(ticketId);
      await expect(harness.service.markResponseSent({
        recommendationId,
        ticketId,
        actor: "support-agent",
        sentAt: "2026-08-11T12:20:00.000Z",
        customerResponse: "The reviewed response is ready.",
      }, { commandId: command(51) })).rejects.toThrow("injected lifecycle trace failure");
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(before);
    } finally {
      harness.store.close();
    }
  });

  it("revalidates stale ticket revision and recommendation state inside the transaction without partial writes", async () => {
    const harness = openHarness("pending", { advanceTicketBeforeCommand: true });
    try {
      const commandId = command(60);
      await expect(harness.service.approve(approval({ approvedFields: ["priority"] }), { commandId }))
        .rejects.toMatchObject({ code: "STALE_APPROVAL" });
      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      expect(snapshot.recommendations[0]?.resolution).toBe("pending");
      expect(snapshot.recommendationRevisions).toHaveLength(1);
      expect(snapshot.events.filter((event) => event.commandId === commandId)).toEqual([]);
    } finally {
      harness.store.close();
    }
  });

  it("replays the immutable no-ticket-change approval snapshot after a later ticket mutation", async () => {
    const harness = openHarness("pending");
    try {
      const commandId = command(59);
      const input = approval({
        approvedFields: ["customerResponse"],
        editedCustomerResponse: "The reviewed response is ready.",
      });
      const first = await harness.service.approve(input, { commandId });
      expect(first.ticket.revision).toBe(0);
      advanceTicket(harness.store);
      expect(harness.store.readWorkflowSnapshot(ticketId).ticket.revision).toBe(1);
      await expect(harness.service.approve(input, { commandId })).resolves.toEqual(first);
    } finally {
      harness.store.close();
    }
  });

  it("rejects approval after a causally newer customer reply without supersession side effects", async () => {
    const harness = openHarness("pending");
    try {
      appendCustomerReply(harness.store);
      const before = harness.store.readWorkflowSnapshot(ticketId);
      const commandId = command(61);
      await expect(harness.service.approve(approval(), { commandId }))
        .rejects.toMatchObject({ code: "STALE_APPROVAL" });
      const after = harness.store.readWorkflowSnapshot(ticketId);
      expect(after).toEqual(before);
      expect(after.events.filter((event) => event.commandId === commandId)).toEqual([]);
      expect(after.recommendations[0]?.resolution).toBe("pending");
    } finally {
      harness.store.close();
    }
  });

  it.each([
    ["reject", "approved" as const, (service: TriageService, commandId: string) => service.reject({
      recommendationId, ticketId, actor: "reviewer", feedback: "Not valid.", rejectedAt: "2026-08-11T12:10:00.000Z",
    }, { commandId })],
    ["cancel", "pending" as const, (service: TriageService, commandId: string) => service.cancelApproval({
      recommendationId, ticketId, actor: "reviewer", reason: "Not valid.", canceledAt: "2026-08-11T12:10:00.000Z",
    }, { commandId })],
    ["supersede", "approved" as const, (service: TriageService, commandId: string) => service.supersedeRecommendation({
      recommendationId, ticketId, actor: "reviewer", reason: "Not valid.", supersededAt: "2026-08-11T12:10:00.000Z",
    }, { commandId })],
  ])("rejects stale %s lifecycle state without partial writes", async (_label, resolution, invoke) => {
    const harness = openHarness(resolution);
    try {
      const before = harness.store.readWorkflowSnapshot(ticketId);
      await expect(invoke(harness.service, command(62))).rejects.toMatchObject({
        code: "STALE_APPROVAL",
      });
      expect(harness.store.readWorkflowSnapshot(ticketId)).toEqual(before);
    } finally {
      harness.store.close();
    }
  });

  it("preserves approval and response gates without partial writes", async () => {
    const pending = openHarness("pending");
    const approved = openHarness("approved");
    try {
      const approvalCommand = command(70);
      await expect(pending.service.approve(approval({
        approvedFields: ["status"],
      }), { commandId: approvalCommand })).rejects.toMatchObject({
        code: "INVALID_APPROVAL_FIELDS",
      });
      expect(pending.store.readWorkflowSnapshot(ticketId).events.filter(
        (event) => event.commandId === approvalCommand,
      )).toEqual([]);

      const sentCommand = command(71);
      await expect(approved.service.markResponseSent({
        recommendationId,
        ticketId,
        actor: "support-agent",
        sentAt: "2026-08-11T12:40:00.000Z",
        customerResponse: "A different, unapproved response.",
      }, { commandId: sentCommand })).rejects.toMatchObject({
        code: "INVALID_APPROVAL_FIELDS",
      });
      expect(approved.store.readWorkflowSnapshot(ticketId).events.filter(
        (event) => event.commandId === sentCommand,
      )).toEqual([]);
    } finally {
      pending.store.close();
      approved.store.close();
    }
  });
});

function openHarness(
  resolution: TriageRecommendation["resolution"],
  options: { failTrace?: boolean; advanceTicketBeforeCommand?: boolean } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "triage-operational-lifecycle-"));
  temporaryRoots.push(root);
  const store = OperationalSqliteStore.open(join(root, "operational.sqlite"));
  store.initialize();
  const ticket = makeTicket();
  store.transaction((unit) => {
    unit.insertTicket(ticket);
    const [sequence] = unit.allocateEventSequences(ticketId, 1);
    unit.appendEvent({
      id: seedEventId,
      ticketId,
      sequence: sequence!,
      occurredAt: "2026-08-11T12:00:00.000Z",
      actor: "seed",
      action: "recommendation-submitted",
      commandId: seedCommandId,
      facts: { status: resolution, sourceRevision: ticket.revision },
    });
    const recommendation = makeRecommendation(resolution);
    unit.insertRecommendation(recommendation);
    unit.appendRecommendationRevision({
      recommendation,
      operationalEventId: seedEventId,
      createdAt: recommendation.createdAt,
    });
  });

  let armed = options.advanceTicketBeforeCommand === true;
  const operationalStore = options.failTrace === true || armed
    ? ({
        readTicket: store.readTicket.bind(store),
        readWorkflowSnapshot: store.readWorkflowSnapshot.bind(store),
        transaction<T>(work: (unit: any) => T): T {
          if (armed) {
            armed = false;
            store.transaction((unit) => {
              const current = unit.readTicket(ticketId);
              const eventId = "30000000-0000-4000-8000-000000000099";
              const [sequence] = unit.allocateEventSequences(ticketId, 1);
              const updated = TicketSchema.parse({
                ...current,
                revision: current.revision + 1,
                updatedAt: "2026-08-11T12:05:00.000Z",
                assignee: "concurrent-owner@example.test",
              });
              unit.appendEvent({
                id: eventId,
                ticketId,
                sequence: sequence!,
                occurredAt: updated.updatedAt,
                actor: "concurrent",
                action: "ticket-updated",
                commandId: command(99),
                facts: { expectedRevision: current.revision, revision: updated.revision },
              });
              unit.updateTicket(updated, current.revision);
              unit.appendTicketRevision({
                ticketId,
                revision: updated.revision,
                ticket: updated,
                operationalEventId: eventId,
                createdAt: updated.updatedAt,
              });
            });
          }
          return store.transaction((unit) => {
            if (options.failTrace !== true) return work(unit);
            const original = unit.appendTrace.bind(unit);
            unit.appendTrace = () => { throw new Error("injected lifecycle trace failure"); };
            try {
              return work(unit);
            } finally {
              unit.appendTrace = original;
            }
          });
        },
      } as unknown as OperationalSqliteStore)
    : store;

  let uuidCounter = 100;
  const service = new TriageService({
    tickets: rejectingLegacyTicketStore(ticket),
    recommendations: rejectingLegacyRecommendationStore(),
    audit: rejectingLegacyAuditStore(),
    operationalStore,
    uuid: () => `50000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
  });
  return { service, store };
}

function approval(overrides: Partial<Approval> = {}): Approval {
  return ApprovalSchema.parse({
    recommendationId,
    ticketId,
    expectedRevision: 0,
    approvedFields: ["priority"],
    actor: "reviewer",
    confirm: true,
    approvedAt: "2026-08-11T12:10:00.000Z",
    ...overrides,
  });
}

function makeTicket(): Ticket {
  return TicketSchema.parse({
    id: ticketId,
    revision: 0,
    customer: { name: "Northstar", plan: "enterprise", region: "eu", vip: false },
    subject: "API requests fail",
    description: "Requests return a server error.",
    status: "triage",
    category: "api",
    priority: "P3",
    team: "api-platform",
    assignee: "current-owner@example.test",
    tags: ["existing"],
    relatedTicketIds: [],
    sla: { responseDueAt: "2026-08-12T00:00:00.000Z", breached: false },
    createdAt: "2026-08-10T06:00:00.000Z",
    updatedAt: "2026-08-10T06:00:00.000Z",
  });
}

function makeRecommendation(resolution: TriageRecommendation["resolution"]): TriageRecommendation {
  return TriageRecommendationSchema.parse({
    id: recommendationId,
    ticketId,
    sourceRevision: 0,
    category: "api",
    priority: "P1",
    team: "api-platform",
    assignee: "recommended-owner@example.test",
    tags: ["recommended"],
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    knowledgeArticleIds: ["api-errors"],
    draftCustomerResponse: "The reviewed response is ready.",
    rationale: "API errors require platform review.",
    confidence: 0.8,
    recommendedNextAction: "Review request logs.",
    escalationRequired: false,
    escalationReasons: [],
    resolution,
    createdAt: "2026-08-11T12:00:00.000Z",
  });
}

function command(index: number): string {
  return `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function appendCustomerReply(store: OperationalSqliteStore): void {
  store.transaction((unit) => {
    const eventId = "30000000-0000-4000-8000-000000000098";
    const messageId = "40000000-0000-4000-8000-000000000098";
    const [sequence] = unit.allocateEventSequences(ticketId, 1);
    unit.appendEvent({
      id: eventId,
      ticketId,
      sequence: sequence!,
      occurredAt: "2026-08-11T12:05:00.000Z",
      actor: "customer",
      action: "customer-reply-received",
      commandId: command(98),
      facts: { messageId },
    });
    unit.insertMessage({
      id: messageId,
      ticketId,
      operationalEventId: eventId,
      kind: "customer",
      createdAt: "2026-08-11T12:05:00.000Z",
      body: "The failure changed after the recommendation.",
    });
  });
}

function advanceTicket(store: OperationalSqliteStore): void {
  store.transaction((unit) => {
    const current = unit.readTicket(ticketId);
    const eventId = "30000000-0000-4000-8000-000000000097";
    const [sequence] = unit.allocateEventSequences(ticketId, 1);
    const updated = TicketSchema.parse({
      ...current,
      revision: current.revision + 1,
      updatedAt: "2026-08-11T12:50:00.000Z",
      assignee: "later-owner@example.test",
    });
    unit.appendEvent({
      id: eventId,
      ticketId,
      sequence: sequence!,
      occurredAt: updated.updatedAt,
      actor: "later-command",
      action: "ticket-updated",
      commandId: command(97),
      facts: { expectedRevision: current.revision, revision: updated.revision },
    });
    unit.updateTicket(updated, current.revision);
    unit.appendTicketRevision({
      ticketId,
      revision: updated.revision,
      ticket: updated,
      operationalEventId: eventId,
      createdAt: updated.updatedAt,
    });
  });
}

function rejectingLegacyTicketStore(ticket: Ticket): any {
  return {
    get: async () => structuredClone(ticket),
    update: async () => { throw new Error("legacy ticket write used"); },
    updateWithCommit: async () => { throw new Error("legacy ticket write used"); },
  };
}

function rejectingLegacyRecommendationStore(): any {
  return {
    create: async () => { throw new Error("legacy recommendation write used"); },
    get: async () => { throw new Error("legacy recommendation read used"); },
    list: async () => [],
    deletePending: async () => { throw new Error("legacy recommendation write used"); },
    transitionResolution: async () => { throw new Error("legacy recommendation write used"); },
    markResolved: async () => { throw new Error("legacy recommendation write used"); },
  };
}

function rejectingLegacyAuditStore(): any {
  return {
    append: async () => { throw new Error("legacy audit write used"); },
    appendBatch: async () => { throw new Error("legacy audit write used"); },
    list: async () => { throw new Error("legacy audit read used"); },
  };
}
