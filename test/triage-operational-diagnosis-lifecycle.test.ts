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
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import {
  TriageService,
  type ApplyDiagnosisFixInput,
  type DiagnosisContext,
} from "../src/triage-service.js";

const sourceTicketId = "TKT-4401" as const;
const relatedTicketId = "TKT-4402" as const;
const recommendationId = "10000000-0000-4000-8000-000000004401";
const seedCommandId = "20000000-0000-4000-8000-000000004401";
const seedEventId = "30000000-0000-4000-8000-000000004401";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("transactional operational diagnosis and verification lifecycle", () => {
  it("atomically persists and replays a completed diagnosis without changing the ticket projection", async () => {
    const harness = openHarness();
    try {
      const commandId = command(10);
      const input = recordDiagnosisInput();
      const first = await harness.service.recordDiagnosis(input, { commandId });
      const snapshot = harness.store.readWorkflowSnapshot(sourceTicketId);

      expect(first).toMatchObject({ action: "diagnosis-completed", ticketId: sourceTicketId });
      expect(snapshot.ticket.revision).toBe(0);
      expect(snapshot.ticketRevisions).toEqual([]);
      expect(snapshot.diagnoses).toHaveLength(1);
      expect(snapshot.diagnoses[0]).toMatchObject({
        operationalEventId: first.id,
        diagnosis: { ticketId: sourceTicketId },
        originalAudit: first,
      });
      expect(snapshot.diagnoses[0]?.originalAudit).toEqual(first);
      expect(snapshot.events.filter((event) => event.commandId === commandId)).toMatchObject([{
        id: first.id,
        action: "diagnosis-completed",
        facts: { diagnosisOutcome: "completed", sourceRevision: 0 },
      }]);
      expect(snapshot.traces.filter(({ operationalEventId }) => operationalEventId === first.id))
        .toMatchObject([
          { traceType: "evidence" },
          { traceType: "lifecycle", stage: "diagnosis-completed", outcome: "success" },
        ]);
      expect(harness.store.listPendingOutbox()).toMatchObject([{
        operationalEventId: first.id,
        deliveryKey: first.id,
        envelope: {
          eventType: "diagnosis-recorded",
          diagnosisId: first.id,
          evidenceIds: [],
          knowledgeArticleIds: ["api-errors"],
        },
      }]);

      await expect(harness.service.recordDiagnosis(input, { commandId })).resolves.toEqual(first);
      expect(harness.store.readWorkflowSnapshot(sourceTicketId)).toEqual(snapshot);
    } finally {
      harness.store.close();
    }
  });

  it("persists an escalated diagnosis with its canonical original audit and no ticket revision", async () => {
    const harness = openHarness();
    try {
      const commandId = command(11);
      const escalated = await harness.service.recordDiagnosis({
        ...recordDiagnosisInput(),
        diagnosis: escalatedDiagnosis(),
      }, { commandId });
      const snapshot = harness.store.readWorkflowSnapshot(sourceTicketId);
      expect(escalated.action).toBe("diagnostic-escalated");
      expect(snapshot.diagnoses).toHaveLength(1);
      expect(snapshot.diagnoses[0]).toMatchObject({
        diagnosis: {
          id: `diagnosis-${escalated.id}`,
          ticketId: sourceTicketId,
        },
        originalAudit: escalated,
        operationalEventId: escalated.id,
      });
      expect(snapshot.diagnoses[0]?.originalAudit).toEqual(escalated);
      expect(snapshot.ticketRevisions).toEqual([]);
      expect(snapshot.traces.at(-1)).toMatchObject({
        operationalEventId: escalated.id,
        traceType: "lifecycle",
        stage: "diagnostic-escalated",
      });
      expect(harness.store.listPendingOutbox()).toMatchObject([{
        operationalEventId: escalated.id,
        envelope: { eventType: "diagnosis-recorded", diagnosisId: escalated.id },
      }]);
    } finally {
      harness.store.close();
    }
  });

  it("persists diagnosis approval, rejection, and revalidation as immutable ordered reviews", async () => {
    const approved = openHarness();
    const rejected = openHarness();
    try {
      const original = await approved.service.recordDiagnosis(
        recordDiagnosisInput(),
        { commandId: command(20) },
      );
      const approval = reviewInput(original.id, "approve");
      const approvedReview = await approved.service.reviewDiagnosis(approval, {
        commandId: command(21),
      });
      const customerReply = await approved.service.addCustomerReply({
        ticketId: sourceTicketId,
        actor: "customer",
        body: "The same trace still reproduces the diagnosed failure.",
        receivedAt: "2026-08-11T12:04:00.000Z",
      }, { commandId: command(22) });
      const revalidationInput = reviewInput(original.id, "revalidate", {
        sourceConversationWatermark: {
          state: "reply",
          id: customerReply.id,
          timestamp: customerReply.timestamp,
        },
        reviewedAt: "2026-08-11T12:05:00.000Z",
        rationale: "The new reply confirms the diagnosis remains unchanged.",
      });
      const revalidated = await approved.service.reviewDiagnosis(revalidationInput, {
        commandId: command(23),
      });

      expect([approvedReview, revalidated].map(({ action }) => action)).toEqual([
        "diagnosis-reviewed",
        "diagnosis-reviewed",
      ]);
      expect(approved.store.listPendingOutbox().map(({ envelope }) => envelope.eventType))
        .toEqual(["diagnosis-recorded", "diagnosis-approved"]);
      expect(approved.store.readWorkflowSnapshot(sourceTicketId).events
        .filter(({ action }) => action === "diagnosis-reviewed")
        .map(({ sequence }) => sequence)).toEqual([3, 5]);
      await expect(approved.service.reviewDiagnosis(revalidationInput, {
        commandId: command(23),
      })).resolves.toEqual(revalidated);

      const rejectedOriginal = await rejected.service.recordDiagnosis(
        recordDiagnosisInput(),
        { commandId: command(24) },
      );
      const rejection = await rejected.service.reviewDiagnosis(
        reviewInput(rejectedOriginal.id, "reject", {
          rationale: "The evidence does not support this diagnosis.",
        }),
        { commandId: command(25) },
      );
      expect(rejection).toMatchObject({
        action: "diagnosis-reviewed",
        after: { diagnosisReview: { decision: "reject" } },
      });
    } finally {
      approved.store.close();
      rejected.store.close();
    }
  });

  it("rolls back diagnosis, event, trace, and command result when an inner trace write fails", async () => {
    const harness = openHarness({ failTrace: true });
    try {
      const before = harness.store.readWorkflowSnapshot(sourceTicketId);
      await expect(harness.service.recordDiagnosis(recordDiagnosisInput(), {
        commandId: command(30),
      })).rejects.toThrow("injected diagnosis lifecycle trace failure");
      expect(harness.store.readWorkflowSnapshot(sourceTicketId)).toEqual(before);
    } finally {
      harness.store.close();
    }
  });

  it("applies a scoped fix atomically with independent per-ticket causal ranges and replay references", async () => {
    const harness = openHarness({ relatedTicket: true });
    try {
      const diagnosisId = await prepareAuthoritativeDiagnosisAndResponse(harness, 40);
      const input = applyFixInput(diagnosisId);
      const commandId = command(44);
      const first = await harness.service.applyDiagnosisFix(input, { commandId });
      expect(first.map(({ ticketId }) => ticketId)).toEqual([sourceTicketId, relatedTicketId]);

      const source = harness.store.readWorkflowSnapshot(sourceTicketId);
      const related = harness.store.readWorkflowSnapshot(relatedTicketId);
      const sourceEvents = source.events.filter((event) => event.commandId === commandId);
      const relatedEvents = related.events.filter((event) => event.commandId === commandId);
      expect(sourceEvents.map(({ action }) => action)).toEqual(["fix-available"]);
      expect(relatedEvents.map(({ action }) => action)).toEqual(["fix-available"]);
      expect(source.events.at(-1)?.id).toBe(sourceEvents[0]!.id);
      expect(harness.store.listPendingOutbox().slice(-2).map(({ envelope }) => envelope))
        .toEqual(expect.arrayContaining([
          { eventType: "fix-available", diagnosisId, ticketId: sourceTicketId },
          { eventType: "fix-available", diagnosisId, ticketId: relatedTicketId },
        ].map((expected) => expect.objectContaining(expected))));
      expect(sourceEvents[0]!.sequence).toBe(source.events.at(-2)!.sequence + 1);
      expect(relatedEvents[0]!.sequence).toBe(2);
      expect(source.ticket.revision).toBe(0);
      expect(related.ticket.revision).toBe(0);
      const semanticResult = harness.store.transaction((unit) =>
        unit.readCommandResult(commandId)
      );
      expect(semanticResult?.tickets).toEqual([
        {
          ticketId: sourceTicketId,
          operationalEventIds: [sourceEvents[0]!.id],
          resultingRevision: null,
        },
        {
          ticketId: relatedTicketId,
          operationalEventIds: [relatedEvents[0]!.id],
          resultingRevision: null,
        },
      ]);
      expect(semanticResult?.lifecycleAuditEvents?.map(({ id }) => id)).toEqual([
        sourceEvents[0]!.id,
        relatedEvents[0]!.id,
      ]);

      await expect(harness.service.applyDiagnosisFix(input, { commandId })).resolves.toEqual(first);
      expect(harness.store.readWorkflowSnapshot(sourceTicketId)).toEqual(source);
      expect(harness.store.readWorkflowSnapshot(relatedTicketId)).toEqual(related);
    } finally {
      harness.store.close();
    }
  });

  it("rolls back both ticket ranges when the second ticket trace write fails", async () => {
    const harness = openHarness({ relatedTicket: true, failTraceOnTicket: relatedTicketId });
    try {
      const diagnosisId = await prepareAuthoritativeDiagnosisAndResponse(harness, 45);
      const sourceBefore = harness.store.readWorkflowSnapshot(sourceTicketId);
      const relatedBefore = harness.store.readWorkflowSnapshot(relatedTicketId);
      await expect(harness.service.applyDiagnosisFix(applyFixInput(diagnosisId), {
        commandId: command(49),
      })).rejects.toThrow("injected diagnosis lifecycle trace failure");
      expect(harness.store.readWorkflowSnapshot(sourceTicketId)).toEqual(sourceBefore);
      expect(harness.store.readWorkflowSnapshot(relatedTicketId)).toEqual(relatedBefore);
    } finally {
      harness.store.close();
    }
  });

  it("revalidates every scoped ticket before writing and rolls back the whole fix command", async () => {
    const harness = openHarness({ relatedTicket: true });
    try {
      const diagnosisId = await prepareAuthoritativeDiagnosisAndResponse(harness, 50);
      resolveTicket(harness.store, relatedTicketId);
      const sourceBefore = harness.store.readWorkflowSnapshot(sourceTicketId);
      const relatedBefore = harness.store.readWorkflowSnapshot(relatedTicketId);

      await expect(harness.service.applyDiagnosisFix(applyFixInput(diagnosisId), {
        commandId: command(54),
      })).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });
      expect(harness.store.readWorkflowSnapshot(sourceTicketId)).toEqual(sourceBefore);
      expect(harness.store.readWorkflowSnapshot(relatedTicketId)).toEqual(relatedBefore);
    } finally {
      harness.store.close();
    }
  });

  it("routes the legacy one-ticket fix and active platform mitigation through atomic operational commands", async () => {
    const fixHarness = openHarness();
    const mitigationHarness = openHarness({ supportState: "waiting-on-platform-fix" });
    try {
      const diagnosisId = await prepareAuthoritativeDiagnosisAndResponse(fixHarness, 60);
      const fixed = await fixHarness.service.recordFix({
        ticketId: sourceTicketId,
        actor: "operator",
        fixedAt: "2026-08-11T12:09:00.000Z",
        fix: fixContext(),
        knowledgeArticleIds: ["api-errors"],
      }, { commandId: command(64) });
      expect(fixed).toMatchObject({
        action: "fix-available",
        after: { diagnosisId, sourceTicketId },
      });

      const mitigation = await mitigationHarness.service.recordPlatformMitigation({
        ticketId: sourceTicketId,
        eventId: "EVT-2026-06-10-WEBHOOK-LATENCY",
        actor: "incident-owner",
        recordedAt: "2026-08-11T12:06:00.000Z",
        rationale: "The governed mitigation is available.",
      }, { commandId: command(65) });
      expect(mitigation).toMatchObject({
        action: "platform-mitigation-available",
        after: { eventId: "EVT-2026-06-10-WEBHOOK-LATENCY", status: "available" },
      });
      expect(mitigationHarness.store.readWorkflowSnapshot(sourceTicketId).traces.at(-1))
        .toMatchObject({ traceType: "lifecycle", stage: "platform-mitigation-available" });
      expect(mitigationHarness.store.listPendingOutbox()).toMatchObject([{
        operationalEventId: mitigation.id,
        envelope: {
          eventType: "fix-available",
          knownEventId: "EVT-2026-06-10-WEBHOOK-LATENCY",
          outcomeStatus: "available",
        },
      }]);
    } finally {
      fixHarness.store.close();
      mitigationHarness.store.close();
    }
  });

  it("atomically closes and replays the verified lifecycle with one ticket revision", async () => {
    const harness = openHarness({ supportState: "ready-for-close", resolution: "approved" });
    try {
      const diagnosis = await harness.service.recordDiagnosis(recordDiagnosisInput(), {
        commandId: command(68),
      });
      await harness.service.reviewDiagnosis(reviewInput(diagnosis.id, "approve"), {
        commandId: command(69),
      });
      appendSupportResponse(harness.store, sourceTicketId, recommendationId, 2);
      const commandId = command(70);
      const input = {
        ticketId: sourceTicketId,
        actor: "operator",
        closedAt: "2026-08-11T12:10:00.000Z",
      } as const;
      const first = await harness.service.closeTicket(input, { commandId });
      const snapshot = harness.store.readWorkflowSnapshot(sourceTicketId);
      expect(first.ticket).toMatchObject({ status: "resolved", revision: 1 });
      expect(snapshot.ticket).toEqual(first.ticket);
      expect(snapshot.ticketRevisions).toHaveLength(1);
      expect(snapshot.events.filter((event) => event.commandId === commandId))
        .toMatchObject([{ action: "ticket-updated", facts: { verificationType: "customer-confirmed", revision: 1 } }]);
      expect(snapshot.traces.at(-1)).toMatchObject({
        traceType: "lifecycle",
        stage: "ticket-closed",
        outcome: "success",
      });
      expect(harness.store.listPendingOutbox().at(-1)).toMatchObject({
        operationalEventId: first.auditEvent.id,
        envelope: {
          eventType: "outcome-verified",
          diagnosisId: diagnosis.id,
          verificationType: "customer-confirmed",
          outcomeStatus: "resolved",
        },
      });

      await expect(harness.service.closeTicket(input, { commandId })).resolves.toEqual(first);
      expect(harness.store.readWorkflowSnapshot(sourceTicketId)).toEqual(snapshot);
    } finally {
      harness.store.close();
    }
  });
});

function openHarness(options: {
  relatedTicket?: boolean;
  failTrace?: boolean;
  failTraceOnTicket?: typeof sourceTicketId | typeof relatedTicketId;
  supportState?: TriageRecommendation["supportState"];
  resolution?: TriageRecommendation["resolution"];
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "triage-operational-diagnosis-"));
  temporaryRoots.push(root);
  const store = OperationalSqliteStore.open(join(root, "operational.sqlite"));
  store.initialize();
  const sourceTicket = makeTicket(sourceTicketId);
  const relatedTicket = makeTicket(relatedTicketId);
  store.transaction((unit) => {
    unit.insertTicket(sourceTicket);
    if (options.relatedTicket === true) unit.insertTicket(relatedTicket);
    const [sequence] = unit.allocateEventSequences(sourceTicketId, 1);
    unit.appendEvent({
      id: seedEventId,
      ticketId: sourceTicketId,
      sequence: sequence!,
      occurredAt: "2026-08-11T12:00:00.000Z",
      actor: "seed",
      action: "recommendation-submitted",
      commandId: seedCommandId,
      facts: { status: options.resolution ?? "approved", sourceRevision: 0 },
    });
    const recommendation = makeRecommendation(
      options.supportState,
      options.resolution ?? "approved",
    );
    unit.insertRecommendation(recommendation);
    unit.appendRecommendationRevision({
      recommendation,
      operationalEventId: seedEventId,
      createdAt: recommendation.createdAt,
    });
    if (options.relatedTicket === true) {
      const [relatedSequence] = unit.allocateEventSequences(relatedTicketId, 1);
      unit.appendEvent({
        id: "30000000-0000-4000-8000-000000004402",
        ticketId: relatedTicketId,
        sequence: relatedSequence!,
        occurredAt: "2026-08-11T12:00:00.000Z",
        actor: "seed",
        action: "ticket-updated",
        commandId: seedCommandId,
        facts: { status: "triage", revision: 0 },
      });
    }
  });

  let uuidCounter = 100;
  const operationalStore = options.failTrace === true || options.failTraceOnTicket !== undefined
    ? failingTraceStore(store, options.failTraceOnTicket)
    : store;
  const service = new TriageService({
    tickets: rejectingLegacyTicketStore(sourceTicket),
    recommendations: rejectingLegacyRecommendationStore(),
    audit: rejectingLegacyAuditStore(),
    operationalStore,
    uuid: () => `50000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
  });
  return { service, store };
}

async function prepareAuthoritativeDiagnosisAndResponse(
  harness: ReturnType<typeof openHarness>,
  commandBase: number,
): Promise<string> {
  const original = await harness.service.recordDiagnosis(recordDiagnosisInput(), {
    commandId: command(commandBase),
  });
  await harness.service.reviewDiagnosis(reviewInput(original.id, "approve"), {
    commandId: command(commandBase + 1),
  });
  await harness.service.markResponseSent({
    recommendationId,
    ticketId: sourceTicketId,
    actor: "operator",
    sentAt: "2026-08-11T12:08:00.000Z",
    customerResponse: "The approved diagnosis response was sent.",
  }, { commandId: command(commandBase + 2) });
  return original.id;
}

function recordDiagnosisInput() {
  return {
    ticketId: sourceTicketId,
    actor: "operator",
    diagnosedAt: "2026-08-11T12:02:00.000Z",
    diagnosis: diagnosisContext(),
    knowledgeArticleIds: ["api-errors"],
  };
}

function diagnosisContext(): DiagnosisContext {
  return {
    status: "completed",
    causeType: "configuration",
    customerSafeSummary: "A governed configuration change caused the API failure.",
    evidenceUsed: ["request-trace"],
    confidence: "confirmed",
    owner: "engineering",
    recommendedNextAction: "Apply the governed configuration update.",
    doNotSay: [],
  };
}

function escalatedDiagnosis(): DiagnosisContext {
  return {
    ...diagnosisContext(),
    diagnosticState: {
      state: "escalated",
      hypotheses: [{
        id: "configuration",
        label: "Configuration issue",
        status: "plausible",
        evidenceUsed: ["request-trace"],
        evidenceToConfirm: ["configuration-diff"],
      }],
      evidenceToRequest: ["configuration-diff"],
      diagnosticAttempts: 2,
      escalationReason: "diagnostic-ambiguity",
      specialistTeam: "api-platform",
    },
  };
}

function reviewInput(
  diagnosisId: string,
  decision: "approve" | "reject" | "revalidate",
  overrides: Record<string, unknown> = {},
) {
  return {
    decision,
    diagnosisId,
    ticketId: sourceTicketId,
    sourceTicketRevision: 0,
    sourceConversationWatermark: { state: "none" as const },
    editedDiagnosis: diagnosisContext(),
    actor: "operator",
    reviewedAt: "2026-08-11T12:03:00.000Z",
    ...(decision === "reject" || decision === "revalidate"
      ? { rationale: "The operator recorded the governed review decision." }
      : {}),
    ...overrides,
  };
}

function applyFixInput(diagnosisId: string): ApplyDiagnosisFixInput {
  return {
    diagnosisId,
    sourceTicketId,
    impactSet: {
      actor: "operator",
      rationale: "The confirmed diagnosis affects both selected tickets.",
      tickets: [
        { ticketId: sourceTicketId, reason: "The source ticket reproduced the diagnosis." },
        { ticketId: relatedTicketId, reason: "The same governed symptom was confirmed." },
      ],
    },
    actor: "operator",
    fixedAt: "2026-08-11T12:09:00.000Z",
  };
}

function fixContext() {
  return {
    status: "available" as const,
    customerSafeSummary: "The governed mitigation is available.",
    customerAction: "Please retry the affected API request.",
    verificationRequest: "Let us know whether the request now succeeds.",
  };
}

function makeTicket(id: typeof sourceTicketId | typeof relatedTicketId): Ticket {
  return TicketSchema.parse({
    id,
    revision: 0,
    customer: { name: "Northstar", plan: "enterprise", region: "eu", vip: false },
    subject: "API requests fail",
    description: "Requests return a server error.",
    status: "triage",
    category: "api",
    priority: "P2",
    team: "api-platform",
    assignee: "operator@example.test",
    tags: ["api"],
    relatedTicketIds: id === sourceTicketId ? [relatedTicketId] : [sourceTicketId],
    sla: { responseDueAt: "2026-08-12T00:00:00.000Z", breached: false },
    createdAt: "2026-08-10T06:00:00.000Z",
    updatedAt: "2026-08-10T06:00:00.000Z",
  });
}

function makeRecommendation(
  supportState: TriageRecommendation["supportState"] = "diagnosing",
  resolution: TriageRecommendation["resolution"] = "approved",
): TriageRecommendation {
  return TriageRecommendationSchema.parse({
    id: recommendationId,
    ticketId: sourceTicketId,
    sourceRevision: 0,
    category: "api",
    priority: "P2",
    team: "api-platform",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    supportState,
    knownEventId: supportState === "waiting-on-platform-fix"
      ? "EVT-2026-06-10-WEBHOOK-LATENCY"
      : undefined,
    knowledgeArticleIds: ["api-errors"],
    draftCustomerResponse: supportState === "ready-for-close"
      ? "We have confirmed the issue is resolved."
      : "The approved diagnosis response was sent.",
    rationale: "The governed workflow is ready for the next action.",
    confidence: 0.9,
    recommendedNextAction: "Continue the governed workflow.",
    escalationRequired: false,
    escalationReasons: [],
    resolution,
    createdAt: "2026-08-11T12:00:00.000Z",
  });
}

function appendSupportResponse(
  store: OperationalSqliteStore,
  ticketId: typeof sourceTicketId,
  currentRecommendationId: string,
  commandIndex: number,
): void {
  store.transaction((unit) => {
    const eventId = `30000000-0000-4000-8000-${String(commandIndex).padStart(12, "0")}`;
    const messageId = `40000000-0000-4000-8000-${String(commandIndex).padStart(12, "0")}`;
    const [sequence] = unit.allocateEventSequences(ticketId, 1);
    unit.appendEvent({
      id: eventId,
      ticketId,
      sequence: sequence!,
      occurredAt: "2026-08-11T12:08:00.000Z",
      actor: "operator",
      action: "customer-response-sent",
      commandId: command(commandIndex),
      facts: { messageId },
    });
    unit.insertMessage({
      id: messageId,
      ticketId,
      operationalEventId: eventId,
      kind: "support",
      createdAt: "2026-08-11T12:08:00.000Z",
      body: "We have confirmed the issue is resolved.",
      recommendationId: currentRecommendationId,
    });
  });
}

function resolveTicket(store: OperationalSqliteStore, ticketId: typeof relatedTicketId): void {
  store.transaction((unit) => {
    const current = unit.readTicket(ticketId);
    const eventId = "30000000-0000-4000-8000-000000009999";
    const [sequence] = unit.allocateEventSequences(ticketId, 1);
    const updated = TicketSchema.parse({
      ...current,
      status: "resolved",
      revision: current.revision + 1,
      updatedAt: "2026-08-11T12:08:30.000Z",
    });
    unit.appendEvent({
      id: eventId,
      ticketId,
      sequence: sequence!,
      occurredAt: updated.updatedAt,
      actor: "concurrent",
      action: "ticket-updated",
      commandId: command(99),
      facts: { status: "resolved", expectedRevision: current.revision, revision: updated.revision },
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

function failingTraceStore(
  store: OperationalSqliteStore,
  failOnTicket?: typeof sourceTicketId | typeof relatedTicketId,
): OperationalSqliteStore {
  return {
    readTicket: store.readTicket.bind(store),
    readWorkflowSnapshot: store.readWorkflowSnapshot.bind(store),
    transaction<T>(work: (unit: any) => T): T {
      return store.transaction((unit) => {
        const original = unit.appendTrace.bind(unit);
        unit.appendTrace = (trace: any) => {
          if (failOnTicket === undefined || trace.ticketId === failOnTicket) {
            throw new Error("injected diagnosis lifecycle trace failure");
          }
          original(trace);
        };
        try {
          return work(unit);
        } finally {
          unit.appendTrace = original;
        }
      });
    },
  } as unknown as OperationalSqliteStore;
}

function command(index: number): string {
  return `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
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
    list: async () => { throw new Error("legacy recommendation read used"); },
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
