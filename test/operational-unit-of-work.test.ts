import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompletedDiagnosisSchema } from "../src/knowledge-evolution/domain.js";
import { TicketSchema, TriageRecommendationSchema, type Ticket } from "../src/domain.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";

const commandId = "33333333-3333-4333-8333-333333333333";
const eventIds = [
  "11111111-1111-4111-8111-111111111111",
  "12111111-1111-4111-8111-111111111111",
  "13111111-1111-4111-8111-111111111111",
  "14111111-1111-4111-8111-111111111111",
] as const;
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryDatabasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "operational-uow-"));
  temporaryRoots.push(root);
  return join(root, "operational.sqlite");
}

describe("OperationalUnitOfWork", () => {
  it("allocates and consumes independent contiguous ranges per ticket in explicit order", () => {
    const store = openedStore();
    store.transaction((unit) => {
      unit.insertTicket(ticket("TKT-0001"));
      unit.insertTicket(ticket("TKT-0002"));
      expect(unit.allocateEventSequences("TKT-0001", 2)).toEqual([1, 2]);
      expect(unit.allocateEventSequences("TKT-0002", 2)).toEqual([1, 2]);
      unit.appendEvent(event("TKT-0001", 1, eventIds[0]));
      unit.appendEvent(event("TKT-0002", 1, eventIds[2]));
      unit.appendEvent(event("TKT-0001", 2, eventIds[1]));
      unit.appendEvent(event("TKT-0002", 2, eventIds[3]));
    });

    expect(store.readWorkflowSnapshot("TKT-0001").events.map(({ sequence }) => sequence))
      .toEqual([1, 2]);
    expect(store.readWorkflowSnapshot("TKT-0002").events.map(({ sequence }) => sequence))
      .toEqual([1, 2]);

    expect(() => store.transaction((unit) => {
      expect(unit.allocateEventSequences("TKT-0001", 2)).toEqual([3, 4]);
      unit.appendEvent(event("TKT-0001", 4, "15111111-1111-4111-8111-111111111111"));
    })).toThrow(/allocated order/i);
    expect(store.readWorkflowSnapshot("TKT-0001").events.map(({ sequence }) => sequence))
      .toEqual([1, 2]);
    store.close();
  });

  it("persists typed aggregate records and reloads a causally ordered snapshot after restart", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path);
    store.initialize();
    const canonicalTicket = ticket("TKT-0001");
    const recommendation = recommendationFor(canonicalTicket);
    const diagnosis = CompletedDiagnosisSchema.parse({
      id: "diagnosis-001",
      ticketId: canonicalTicket.id,
      problem: "API requests fail after rotating credentials.",
      symptoms: ["Requests return 401 after rotation."],
      evidenceUsed: ["Request ID req-123 returned 401."],
      evidenceReferences: [{ id: "request-id", labelAtDiagnosis: "Request ID", source: "reply", sourceRef: "reply-123" }],
      ownerTeam: "api-platform",
      fixSteps: ["Refresh the service credential in the deployment secret store."],
      verificationSteps: ["Confirm a new request succeeds with the refreshed credential."],
      completedAt: "2026-08-10T10:02:00.000Z",
    });

    store.transaction((unit) => {
      unit.insertTicket(canonicalTicket);
      expect(unit.allocateEventSequences(canonicalTicket.id, 3)).toEqual([1, 2, 3]);
      unit.appendEvent(event(canonicalTicket.id, 1, eventIds[0], "2026-08-10T10:03:00.000Z", "customer-reply-received"));
      unit.appendEvent(event(canonicalTicket.id, 2, eventIds[1], "2026-08-10T10:01:00.000Z", "recommendation-submitted"));
      unit.appendEvent(event(canonicalTicket.id, 3, eventIds[2], "2026-08-10T10:02:00.000Z", "diagnosis-completed"));
      unit.appendTicketRevision({
        ticketId: canonicalTicket.id,
        revision: canonicalTicket.revision,
        ticket: canonicalTicket,
        operationalEventId: eventIds[0],
        createdAt: "2026-08-10T10:03:00.000Z",
      });
      unit.insertMessage({
        id: "22222222-2222-4222-8222-222222222222",
        ticketId: canonicalTicket.id,
        operationalEventId: eventIds[0],
        kind: "customer",
        createdAt: "2026-08-10T10:03:00.000Z",
        body: "Request req-123 still returns 401.",
      });
      unit.insertRecommendation(recommendation);
      unit.appendRecommendationRevision({
        recommendation,
        operationalEventId: eventIds[1],
        createdAt: "2026-08-10T10:01:00.000Z",
      });
      unit.insertDiagnosis({ diagnosis, operationalEventId: eventIds[2] });
      unit.appendTrace({
        id: "66666666-6666-4666-8666-666666666666",
        operationalEventId: eventIds[1],
        ticketId: canonicalTicket.id,
        occurredAt: "2026-08-10T10:01:00.000Z",
        actor: "support-lead",
        traceType: "classification",
        category: "api",
        priority: "P2",
        team: "api-platform",
        confidence: 0.9,
        reasons: ["API response evidence"],
      });

      expect(unit.readTicket(canonicalTicket.id)).toEqual(canonicalTicket);
      expect(unit.readRecommendation(recommendation.id)).toEqual(recommendation);
      expect(unit.readDiagnosis(diagnosis.id)).toEqual(diagnosis);
    });

    const beforeRestart = store.readTicketAggregate(canonicalTicket.id);
    expect(beforeRestart.events.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    expect(beforeRestart.recommendations).toEqual([recommendation]);
    expect(beforeRestart.messages.map(({ body }) => body)).toEqual(["Request req-123 still returns 401."]);
    expect(beforeRestart.customerReplyWatermark).toEqual({
      state: "reply",
      timestamp: "2026-08-10T10:03:00.000Z",
      id: "22222222-2222-4222-8222-222222222222",
    });
    expect(store.readRecommendation(recommendation.id)).toEqual(recommendation);
    expect(store.readDiagnosis(diagnosis.id)).toEqual(diagnosis);
    store.close();

    const reopened = OperationalSqliteStore.open(path);
    reopened.initialize();
    expect(reopened.readTicketAggregate(canonicalTicket.id)).toEqual(beforeRestart);
    reopened.close();
  });

  it("keeps committed events and traces append-only at the database boundary", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path);
    store.initialize();
    store.transaction((unit) => {
      unit.insertTicket(ticket("TKT-0001"));
      unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent(event("TKT-0001", 1, eventIds[0]));
      unit.appendTrace({
        id: "66666666-6666-4666-8666-666666666666",
        operationalEventId: eventIds[0],
        ticketId: "TKT-0001",
        occurredAt: "2026-08-10T10:00:00.000Z",
        actor: "support-lead",
        traceType: "lifecycle",
        stage: "ticket-updated",
        outcome: "success",
        reason: "Ticket updated.",
      });
    });

    const raw = new Database(path);
    expect(() => raw.prepare("UPDATE operational_events SET actor = 'other' WHERE id = ?").run(eventIds[0]))
      .toThrow(/append-only/i);
    expect(() => raw.prepare("DELETE FROM decision_trace_events WHERE id = ?").run("66666666-6666-4666-8666-666666666666"))
      .toThrow(/append-only/i);
    raw.close();
    store.close();
  });

  it("serializes two connections into contiguous sequences and rejects a stale ticket revision", () => {
    const path = temporaryDatabasePath();
    const first = OperationalSqliteStore.open(path);
    const second = OperationalSqliteStore.open(path);
    first.initialize();
    second.initialize();
    first.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));

    const firstSnapshot = first.readTicket("TKT-0001");
    const staleSnapshot = second.readTicket("TKT-0001");
    first.transaction((unit) => {
      expect(unit.allocateEventSequences("TKT-0001", 1)).toEqual([1]);
      unit.appendEvent(event("TKT-0001", 1, eventIds[0]));
      unit.updateTicket({
        ...firstSnapshot,
        revision: 1,
        status: "in-progress",
        updatedAt: "2026-08-10T10:00:00.000Z",
      }, firstSnapshot.revision);
    });
    second.transaction((unit) => {
      expect(unit.allocateEventSequences("TKT-0001", 1)).toEqual([2]);
      unit.appendEvent(event("TKT-0001", 2, eventIds[1]));
    });

    expect(() => second.transaction((unit) => unit.updateTicket({
      ...staleSnapshot,
      revision: 1,
      status: "waiting-customer",
      updatedAt: "2026-08-10T10:01:00.000Z",
    }, staleSnapshot.revision))).toThrow(/stale/i);
    expect(first.readTicketAggregate("TKT-0001").events.map(({ sequence }) => sequence))
      .toEqual([1, 2]);
    expect(first.readTicket("TKT-0001")).toMatchObject({ revision: 1, status: "in-progress" });
    first.close();
    second.close();
  });
});

function openedStore(): OperationalSqliteStore {
  const store = OperationalSqliteStore.open(temporaryDatabasePath());
  store.initialize();
  return store;
}

function ticket(id: "TKT-0001" | "TKT-0002"): Ticket {
  return TicketSchema.parse({
    id,
    createdAt: "2026-08-10T09:00:00.000Z",
    updatedAt: "2026-08-10T09:00:00.000Z",
    customer: { name: "Ada", plan: "Pro", region: "EU", vip: false },
    subject: "Requests fail",
    description: "Requests return 401 after credential rotation.",
    status: "triage",
    tags: [],
    sla: { responseDueAt: "2026-08-10T11:00:00.000Z", breached: false },
    relatedTicketIds: [],
    revision: 0,
  });
}

function recommendationFor(value: Ticket) {
  return TriageRecommendationSchema.parse({
    id: "10000000-0000-4000-8000-000000000001",
    ticketId: value.id,
    sourceRevision: value.revision,
    category: "api",
    priority: "P2",
    team: "api-platform",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    supportState: "diagnosing",
    requiredEvidence: [],
    providedEvidence: [],
    missingEvidence: [],
    knowledgeArticleIds: ["api-auth"],
    draftCustomerResponse: "We are reviewing the credential evidence.",
    rationale: "The ticket matches API credential rotation.",
    confidence: 0.9,
    recommendedNextAction: "Compare the active credential version.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "pending",
    createdAt: "2026-08-10T10:01:00.000Z",
  });
}

function event(
  ticketId: string,
  sequence: number,
  id: string,
  occurredAt = "2026-08-10T10:00:00.000Z",
  action: "ticket-updated" | "customer-reply-received" | "recommendation-submitted" | "diagnosis-completed" = "ticket-updated",
) {
  return {
    id,
    ticketId,
    sequence,
    occurredAt,
    actor: "support-lead",
    action,
    commandId,
    facts: {},
  };
}
