import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TicketSchema,
  TriageRecommendationSchema,
  type Ticket,
  type TriageRecommendation,
} from "../src/domain.js";
import {
  canonicalRequestHash,
  type OperationalCommandContext,
} from "../src/operational/idempotency.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import {
  TriageService,
  type SubmitEvaluationInput,
  type SubmitRecommendationInput,
} from "../src/triage-service.js";

const ticketId = "TKT-4001" as const;
const oldRecommendationId = "10000000-0000-4000-8000-000000000001";
const secondOldRecommendationId = "10000000-0000-4000-8000-000000000002";
const commandId = "20000000-0000-4000-8000-000000000001";
const seedCommandId = "20000000-0000-4000-8000-000000000002";
const customerMessageId = "30000000-0000-4000-8000-000000000001";
const seedEventId = "40000000-0000-4000-8000-000000000001";
const customerReplyEventId = "40000000-0000-4000-8000-000000000002";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("transactional operational evaluation", () => {
  it("commits recommendation, supersession revisions, causal events, and typed traces as one command", async () => {
    const harness = openHarness();
    try {
      const input = evaluationInput();
      const result = await harness.service.submitEvaluation(input, { commandId });
      expect(result.recommendation.resolution).toBe("pending");
      expect(result.recommendations.map(({ id }) => id)).toEqual([
        oldRecommendationId,
        result.recommendation.id,
      ]);

      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      const commandEvents = snapshot.events.filter((event) => event.commandId === commandId);
      expect(commandEvents).toHaveLength(2);
      expect(commandEvents.map(({ sequence }) => sequence)).toEqual([
        commandEvents[0]!.sequence,
        commandEvents[0]!.sequence + 1,
      ]);
      expect(snapshot.recommendationRevisions.filter(({ operationalEventId }) =>
        commandEvents.some((event) => event.id === operationalEventId),
      )).toHaveLength(2);
      expect(snapshot.traces.filter(({ operationalEventId }) =>
        commandEvents.some((event) => event.id === operationalEventId),
      ).map(({ traceType }) => traceType)).toEqual([
        "classification",
        "evidence",
        "lifecycle",
      ]);
      expect(snapshot.recommendations.find(({ id }) => id === oldRecommendationId)?.resolution)
        .toBe("superseded");
      expect(snapshot.recommendations.find(({ id }) => id === result.recommendation.id)?.resolution)
        .toBe("pending");
    } finally {
      harness.store.close();
    }
  });

  it("deduplicates repeated classifier trace reasons in stable first-seen order", async () => {
    const harness = openHarness();
    try {
      const result = await harness.service.submitEvaluation({
        ...evaluationInput(),
        classificationSignals: [
          { ruleId: "signal-a", target: "classifier", weight: 1, reason: "same reason" },
          { ruleId: "signal-b", target: "classifier", weight: 0.5, reason: "first unique reason" },
          { ruleId: "signal-c", target: "classifier", weight: 0.25, reason: "same reason" },
        ],
      }, { commandId });
      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      const classification = snapshot.traces.find(({ traceType }) => traceType === "classification");
      expect(classification).toMatchObject({
        reasons: ["same reason", "first unique reason"],
      });
      expect(result.recommendation.classificationSignals).toHaveLength(3);
    } finally {
      harness.store.close();
    }
  });

  it("accepts an explicit command context on direct submit and persists the same atomic write set", async () => {
    const harness = openHarness();
    try {
      const { evaluatedCustomerReplyWatermark: _watermark, ...input } = evaluationInput();
      const recommendation = await harness.service.submit(input as SubmitRecommendationInput, { commandId });
      expect(recommendation.resolution).toBe("pending");
      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      expect(snapshot.recommendations.some(({ id }) => id === recommendation.id)).toBe(true);
      expect(snapshot.events.filter((event) => event.commandId === commandId)).toHaveLength(1);
    } finally {
      harness.store.close();
    }
  });

  it("rejects an audit-event reply watermark once the operational snapshot is canonically message-backed", async () => {
    const harness = openHarness();
    try {
      const input = evaluationInput();
      await expect(harness.service.submitEvaluation({
        ...input,
        evaluatedCustomerReplyWatermark: {
          state: "reply",
          id: customerReplyEventId,
          timestamp: "2026-08-10T09:05:00.000Z",
        },
      }, { commandId })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
      expect(harness.store.readWorkflowSnapshot(ticketId).events.filter(
        (event) => event.commandId === commandId,
      )).toEqual([]);
    } finally {
      harness.store.close();
    }
  });

  it("replays the original evaluation result without creating another recommendation or event set", async () => {
    const harness = openHarness();
    try {
      const input = evaluationInput();
      const first = await harness.service.submitEvaluation(input, { commandId });
      const before = harness.store.readWorkflowSnapshot(ticketId);
      const replay = await harness.service.submitEvaluation(input, { commandId });
      const after = harness.store.readWorkflowSnapshot(ticketId);

      expect(replay.recommendation).toEqual(first.recommendation);
      expect(replay.recommendations).toEqual(first.recommendations);
      expect(after.events).toEqual(before.events);
      expect(after.recommendationRevisions).toEqual(before.recommendationRevisions);
      expect(after.traces).toEqual(before.traces);
    } finally {
      harness.store.close();
    }
  });

  it("preserves ordered recommendationIds when one evaluation supersedes multiple pending recommendations", async () => {
    const harness = openHarness({ multiSupersession: true });
    try {
      const result = await harness.service.submitEvaluation(evaluationInput(), { commandId });
      expect(result.recommendations.map(({ id }) => id)).toEqual([
        oldRecommendationId,
        secondOldRecommendationId,
        result.recommendation.id,
      ]);
      const commandEvents = harness.store.readWorkflowSnapshot(ticketId).events
        .filter((event) => event.commandId === commandId);
      expect(commandEvents).toHaveLength(3);
      expect(commandEvents.map(({ action }) => action)).toEqual([
        "recommendation-submitted",
        "recommendation-superseded",
        "recommendation-superseded",
      ]);
      const replay = await harness.service.submitEvaluation(evaluationInput(), { commandId });
      expect(replay.recommendation).toEqual(result.recommendation);
      expect(replay.recommendations).toEqual(result.recommendations);
    } finally {
      harness.store.close();
    }
  });

  it("rolls back every evaluation child write when a typed trace write fails", async () => {
    const harness = openHarness({ failTrace: true });
    try {
      await expect(harness.service.submitEvaluation(evaluationInput(), { commandId }))
        .rejects.toThrow("injected trace failure");
      const snapshot = harness.store.readWorkflowSnapshot(ticketId);
      expect(snapshot.events.filter(({ commandId: id }) => id === commandId)).toEqual([]);
      expect(snapshot.recommendations.map(({ id }) => id)).toEqual([oldRecommendationId]);
      expect(snapshot.recommendationRevisions).toHaveLength(1);
      expect(snapshot.traces).toEqual([]);
    } finally {
      harness.store.close();
    }
  });

  it.each([
    ["source revision", (store: OperationalSqliteStore) => {
      store.transaction((unit) => {
        const current = unit.readTicket(ticketId);
        const [sequence] = unit.allocateEventSequences(ticketId, 1);
        const updated = TicketSchema.parse({
          ...current,
          revision: current.revision + 1,
          updatedAt: "2026-08-11T10:00:00.000Z",
          assignee: "concurrent@example.test",
        });
        unit.appendEvent({
          id: "40000000-0000-4000-8000-000000000003",
          ticketId,
          sequence: sequence!,
          occurredAt: updated.updatedAt,
          actor: "concurrent",
          action: "ticket-updated",
          commandId: seedCommandId,
          facts: { expectedRevision: current.revision, revision: updated.revision },
        });
        unit.updateTicket(updated, current.revision);
        unit.appendTicketRevision({
          ticketId,
          revision: updated.revision,
          ticket: updated,
          operationalEventId: "40000000-0000-4000-8000-000000000003",
          createdAt: updated.updatedAt,
        });
      });
    }],
    ["customer reply watermark", (store: OperationalSqliteStore) => {
      store.transaction((unit) => {
        const [sequence] = unit.allocateEventSequences(ticketId, 1);
        unit.appendEvent({
          id: "40000000-0000-4000-8000-000000000004",
          ticketId,
          sequence: sequence!,
          occurredAt: "2026-08-11T10:00:00.000Z",
          actor: "customer",
          action: "customer-reply-received",
          commandId: seedCommandId,
          facts: { messageId: "30000000-0000-4000-8000-000000000002" },
        });
        unit.insertMessage({
          id: "30000000-0000-4000-8000-000000000002",
          ticketId,
          operationalEventId: "40000000-0000-4000-8000-000000000004",
          kind: "customer",
          createdAt: "2026-08-11T10:00:00.000Z",
          body: "The error changed while evaluation was running.",
        });
      });
    }],
  ] as const)("rejects a stale %s evaluation without partial operational writes", async (_label, mutate) => {
    const harness = openHarness({ beforeCommit: mutate });
    try {
      const input = evaluationInput();
      const before = harness.store.readWorkflowSnapshot(ticketId);
      await expect(harness.service.submitEvaluation(input, { commandId })).rejects.toMatchObject({
        code: "STALE_APPROVAL",
      });
      const after = harness.store.readWorkflowSnapshot(ticketId);
      expect(after.recommendations).toEqual(before.recommendations);
      expect(after.recommendationRevisions).toEqual(before.recommendationRevisions);
      expect(after.events.filter(({ commandId: id }) => id === commandId)).toEqual([]);
    } finally {
      harness.store.close();
    }
  });
});

function openHarness(options: {
  failTrace?: boolean;
  multiSupersession?: boolean;
  beforeCommit?: (store: OperationalSqliteStore) => void;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "triage-operational-evaluation-"));
  temporaryRoots.push(root);
  const store = OperationalSqliteStore.open(join(root, "operational.sqlite"));
  store.initialize();
  const ticket = makeTicket();
  store.transaction((unit) => {
    unit.insertTicket(ticket);
    const sequences = unit.allocateEventSequences(ticketId, options.multiSupersession ? 3 : 2);
    const seedSequence = sequences[0]!;
    unit.appendEvent({
      id: seedEventId,
      ticketId,
      sequence: seedSequence,
      occurredAt: "2026-08-10T09:00:00.000Z",
      actor: "seed",
      action: "recommendation-submitted",
      commandId: seedCommandId,
      facts: { status: "pending", sourceRevision: ticket.revision },
    });
    const oldRecommendation = makeRecommendation(ticket, oldRecommendationId, "2026-08-10T09:00:00.000Z");
    unit.insertRecommendation(oldRecommendation);
    unit.appendRecommendationRevision({
      recommendation: oldRecommendation,
      operationalEventId: seedEventId,
      createdAt: oldRecommendation.createdAt,
    });
    if (options.multiSupersession) {
      const secondRecommendation = makeRecommendation(ticket, secondOldRecommendationId, "2026-08-10T09:01:00.000Z");
      unit.appendEvent({
        id: "40000000-0000-4000-8000-000000000005",
        ticketId,
        sequence: sequences[1]!,
        occurredAt: secondRecommendation.createdAt,
        actor: "seed",
        action: "recommendation-submitted",
        commandId: seedCommandId,
        facts: { status: "pending", sourceRevision: ticket.revision },
      });
      unit.insertRecommendation(secondRecommendation);
      unit.appendRecommendationRevision({
        recommendation: secondRecommendation,
        operationalEventId: "40000000-0000-4000-8000-000000000005",
        createdAt: secondRecommendation.createdAt,
      });
    }
    unit.appendEvent({
      id: customerReplyEventId,
      ticketId,
      sequence: options.multiSupersession ? sequences[2]! : sequences[1]!,
      occurredAt: "2026-08-10T09:05:00.000Z",
      actor: "customer",
      action: "customer-reply-received",
      commandId: seedCommandId,
      facts: { messageId: customerMessageId },
    });
    unit.insertMessage({
      id: customerMessageId,
      ticketId,
      operationalEventId: customerReplyEventId,
      kind: "customer",
      createdAt: "2026-08-10T09:05:00.000Z",
      body: "The API still returns 503.",
    });
  });
  const ids = [
    "50000000-0000-4000-8000-000000000001",
    "50000000-0000-4000-8000-000000000002",
    "50000000-0000-4000-8000-000000000003",
    "50000000-0000-4000-8000-000000000004",
    "50000000-0000-4000-8000-000000000005",
    "50000000-0000-4000-8000-000000000006",
    "50000000-0000-4000-8000-000000000007",
    "50000000-0000-4000-8000-000000000008",
    "50000000-0000-4000-8000-000000000009",
    "50000000-0000-4000-8000-000000000010",
  ];
  const service = new TriageService({
    tickets: legacyTicketStore(ticket),
    recommendations: legacyRecommendationStore(),
    audit: legacyAuditStore(),
    operationalStore: options.failTrace
      ? failingTraceStore(store)
      : options.beforeCommit === undefined
        ? store
        : mutatingStore(store, options.beforeCommit),
    uuid: () => ids.shift() ?? "50000000-0000-4000-8000-000000000099",
    now: () => new Date("2026-08-11T10:00:00.000Z"),
  });
  return { service, store };
}

function mutatingStore(
  store: OperationalSqliteStore,
  mutate: (store: OperationalSqliteStore) => void,
): OperationalSqliteStore {
  let armed = true;
  return {
    readTicket: store.readTicket.bind(store),
    readWorkflowSnapshot: store.readWorkflowSnapshot.bind(store),
    transaction<T>(work: (unit: any) => T): T {
      if (armed) {
        armed = false;
        mutate(store);
      }
      return store.transaction(work);
    },
  } as unknown as OperationalSqliteStore;
}

function failingTraceStore(store: OperationalSqliteStore): OperationalSqliteStore {
  return {
    readTicket: store.readTicket.bind(store),
    readWorkflowSnapshot: store.readWorkflowSnapshot.bind(store),
    transaction<T>(work: (unit: any) => T): T {
      return store.transaction((unit) => {
        const original = unit.appendTrace.bind(unit);
        unit.appendTrace = () => { throw new Error("injected trace failure"); };
        try { return work(unit); } finally { unit.appendTrace = original; }
      });
    },
  } as unknown as OperationalSqliteStore;
}

function evaluationInput(): SubmitEvaluationInput {
  return {
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
    requiredEvidence: [],
    providedEvidence: [],
    missingEvidence: [],
    knowledgeArticleIds: ["api-errors"],
    draftCustomerResponse: "We are investigating the API errors.",
    rationale: "The API failure remains reproducible.",
    confidence: 0.8,
    recommendedNextAction: "Review the API error logs.",
    actor: "operator",
    submittedAt: "2026-08-11T10:00:00.000Z",
    evaluatedCustomerReplyWatermark: {
      state: "reply",
      id: customerMessageId,
      timestamp: "2026-08-10T09:05:00.000Z",
    },
  };
}

function makeTicket(): Ticket {
  return TicketSchema.parse({
    id: ticketId,
    createdAt: "2026-08-10T08:00:00.000Z",
    updatedAt: "2026-08-10T08:30:00.000Z",
    customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
    subject: "API requests return 503",
    description: "Production requests fail consistently.",
    status: "triage",
    category: "api",
    priority: "P3",
    team: "api-platform",
    assignee: "current-owner@example.test",
    tags: ["existing"],
    sla: { responseDueAt: "2026-08-10T12:00:00.000Z", breached: false },
    revision: 0,
  });
}

function makeRecommendation(ticket: Ticket, id: string, createdAt: string, resolution: "pending" | "superseded" = "pending"): TriageRecommendation {
  return TriageRecommendationSchema.parse({
    id,
    ticketId: ticket.id,
    sourceRevision: ticket.revision,
    category: "api",
    priority: "P2",
    team: "api-platform",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    knowledgeArticleIds: ["api-errors"],
    draftCustomerResponse: "We are investigating the API errors.",
    rationale: "The API failure remains reproducible.",
    confidence: 0.8,
    recommendedNextAction: "Review the API error logs.",
    escalationRequired: false,
    escalationReasons: [],
    resolution,
    createdAt,
  });
}

function legacyTicketStore(ticket: Ticket): any {
  return {
    get: async () => structuredClone(ticket),
    update: async () => structuredClone(ticket),
    updateWithCommit: async () => ({ ticket: structuredClone(ticket), result: undefined }),
  };
}

function legacyRecommendationStore(): any {
  return {
    create: async () => undefined,
    get: async () => { throw new Error("legacy recommendation store must not be used"); },
    list: async () => [],
    deletePending: async () => undefined,
    transitionResolution: async () => undefined,
    markResolved: async () => undefined,
  };
}

function legacyAuditStore(): any {
  return {
    append: async () => { throw new Error("legacy audit store must not be used"); },
    appendBatch: async () => undefined,
    list: async () => [],
  };
}
