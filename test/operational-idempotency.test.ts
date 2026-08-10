import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TicketSchema,
  TriageRecommendationSchema,
  type Ticket,
  type TicketId,
} from "../src/domain.js";
import { CompletedDiagnosisSchema } from "../src/knowledge-evolution/domain.js";
import {
  canonicalRequestHash,
  type OperationalCommandContext,
} from "../src/operational/idempotency.js";
import { OperationalResultReferenceSchema } from "../src/operational/domain.js";
import {
  OperationalSqliteStore,
} from "../src/operational/sqlite-store.js";
import type { OperationalUnitOfWork } from "../src/operational/unit-of-work.js";

const commandIds = {
  single: "33333333-3333-4333-8333-333333333333",
  compound: "43333333-3333-4333-8333-333333333333",
  multiTicket: "53333333-3333-4333-8333-333333333333",
  rollback: "63333333-3333-4333-8333-333333333333",
  semantic: "73333333-3333-4333-8333-333333333333",
  pluralRecommendation: "83333333-3333-4333-8333-333333333333",
} as const;
const eventIds = {
  seed: "01111111-1111-4111-8111-111111111111",
  single: "11111111-1111-4111-8111-111111111111",
  compoundFirst: "21111111-1111-4111-8111-111111111111",
  compoundSecond: "31111111-1111-4111-8111-111111111111",
  firstTicketFirst: "41111111-1111-4111-8111-111111111111",
  firstTicketSecond: "51111111-1111-4111-8111-111111111111",
  secondTicketFirst: "61111111-1111-4111-8111-111111111111",
  secondTicketSecond: "71111111-1111-4111-8111-111111111111",
  rollbackFirst: "81111111-1111-4111-8111-111111111111",
  rollbackSecond: "91111111-1111-4111-8111-111111111111",
  semanticRevision: "a1111111-1111-4111-8111-111111111111",
  semanticMessage: "b1111111-1111-4111-8111-111111111111",
  semanticRecommendation: "c1111111-1111-4111-8111-111111111111",
  semanticDiagnosis: "d1111111-1111-4111-8111-111111111111",
  pluralFirst: "e1111111-1111-4111-8111-111111111111",
  pluralSecond: "f1111111-1111-4111-8111-111111111111",
  pluralThird: "a2111111-1111-4111-8111-111111111111",
  wrongTicket: "b2111111-1111-4111-8111-111111111111",
} as const;
const messageId = "22222222-2222-4222-8222-222222222222";
const secondMessageId = "32222222-2222-4222-8222-222222222222";
const recommendationId = "10000000-0000-4000-8000-000000000001";
const secondRecommendationId = "10000000-0000-4000-8000-000000000002";
const thirdRecommendationId = "10000000-0000-4000-8000-000000000003";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("canonicalRequestHash", () => {
  it("hashes the operation and normalized semantic request deterministically", () => {
    expect(canonicalRequestHash("ticket-update", { z: 2, a: "alpha" })).toBe(
      "6d8f02ef3c599d6be56fa0cc01537b0b9e150089904a69dd20bea2363457e8b6",
    );
    expect(canonicalRequestHash("ticket-update", { a: "alpha", z: 2 })).toBe(
      canonicalRequestHash("ticket-update", { z: 2, a: "alpha", omitted: undefined }),
    );
    expect(canonicalRequestHash("ticket-close", { a: "alpha", z: 2 })).not.toBe(
      canonicalRequestHash("ticket-update", { a: "alpha", z: 2 }),
    );
  });

  it("projects retry and server-generated metadata out of the semantic request", () => {
    const semanticRequest = {
      ticketId: "TKT-0001",
      expectedRevision: 3,
      status: "in-progress",
    };
    expect(canonicalRequestHash("ticket-update", {
      ...semanticRequest,
      commandId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "first-transport-key",
      eventId: "11111111-1111-4111-8111-111111111111",
      operationalEventId: "21111111-1111-4111-8111-111111111111",
      occurredAt: "2026-08-10T10:00:00.000Z",
      attemptTimestamp: "2026-08-10T10:00:01.000Z",
      retry: 1,
      retryAttempt: 1,
      transportRequestId: "provider-request-first",
    })).toBe(canonicalRequestHash("ticket-update", {
      ...semanticRequest,
      commandId: "43333333-3333-4333-8333-333333333333",
      idempotencyKey: "second-transport-key",
      eventId: "31111111-1111-4111-8111-111111111111",
      operationalEventId: "41111111-1111-4111-8111-111111111111",
      occurredAt: "2026-08-10T10:05:00.000Z",
      attemptTimestamp: "2026-08-10T10:05:01.000Z",
      retry: 2,
      retryAttempt: 2,
      transportRequestId: "provider-request-second",
    }));
  });

  it.each([
    ["Date", new Date("2026-08-10T10:00:00.000Z")],
    ["Map", new Map([["ticketId", "TKT-0001"]])],
    ["Set", new Set(["TKT-0001"])],
    ["RegExp", /TKT-0001/],
    ["class instance", new (class SemanticRequest {
      readonly ticketId = "TKT-0001";
    })()],
  ])("rejects non-canonical %s request values instead of hashing them as plain objects", (_label, value) => {
    expect(() => canonicalRequestHash("ticket-update", { value })).toThrow(/plain|canonical|json/i);
  });

  it("keeps a parsed __proto__ semantic key distinct from an empty request", () => {
    const request = JSON.parse('{"__proto__":{"ticketId":"TKT-0001"}}') as unknown;
    expect(canonicalRequestHash("ticket-update", request)).not.toBe(
      canonicalRequestHash("ticket-update", {}),
    );
  });

  it.each([
    ["string expando", (value: unknown[]) => { Object.defineProperty(value, "semantic", { value: 2, enumerable: true }); }],
    ["symbol expando", (value: unknown[]) => { Object.defineProperty(value, Symbol("semantic"), { value: 2, enumerable: true }); }],
    ["accessor index", (value: unknown[]) => { Object.defineProperty(value, "0", { get: () => 1, enumerable: true }); }],
    ["non-enumerable index", (value: unknown[]) => { Object.defineProperty(value, "0", { value: 1, enumerable: false }); }],
    ["non-writable index", (value: unknown[]) => { Object.defineProperty(value, "0", { writable: false }); }],
    ["non-writable length", (value: unknown[]) => { Object.defineProperty(value, "length", { writable: false }); }],
    ["non-enumerable expando", (value: unknown[]) => { Object.defineProperty(value, "semantic", { value: 2, enumerable: false }); }],
  ])("rejects an array with a %s instead of hashing it like the dense array", (_label, mutate) => {
    const request: unknown[] = [1];
    mutate(request);
    expect(() => canonicalRequestHash("ticket-update", { request })).toThrow(/array|canonical|data|propert/i);
  });
});

describe("recommendation result references", () => {
  const baseResult = {
    operation: "ticket-update" as const,
    tickets: [{
      ticketId: "TKT-0001" as const,
      operationalEventIds: [eventIds.single],
      resultingRevision: null,
    }],
  };

  it("accepts a singular recommendation reference for exactly one aggregate", () => {
    expect(OperationalResultReferenceSchema.safeParse({
      ...baseResult,
      recommendationId,
    }).success).toBe(true);
  });

  it("accepts an ordered plural recommendation reference for multiple aggregates", () => {
    expect(OperationalResultReferenceSchema.safeParse({
      ...baseResult,
      recommendationIds: [recommendationId, secondRecommendationId],
    }).success).toBe(true);
  });

  it.each([
    ["both singular and plural", { recommendationId, recommendationIds: [recommendationId, secondRecommendationId] }],
    ["one plural ID", { recommendationIds: [recommendationId] }],
    ["duplicate plural IDs", { recommendationIds: [recommendationId, recommendationId] }],
  ])("rejects %s recommendation result references", (_label, fields) => {
    expect(OperationalResultReferenceSchema.safeParse({ ...baseResult, ...fields }).success).toBe(false);
  });
});

describe("persistent operational command idempotency", () => {
  it("replays the original immutable semantic result for the same command and hash after restart", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path);
    store.initialize();
    store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));

    const context: OperationalCommandContext = { commandId: commandIds.single };
    const request = { ticketId: "TKT-0001", expectedRevision: 0, status: "in-progress" };
    const hash = canonicalRequestHash("ticket-update", request);
    const originalResult = {
      operation: "ticket-update",
      tickets: [{
        ticketId: "TKT-0001" as const,
        operationalEventIds: [eventIds.single],
        resultingRevision: 1,
      }],
    };

    store.transaction((unit) => {
      expect(unit.beginCommand(context.commandId, "ticket-update", request)).toBe("new");
      const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, context.commandId));
      const updatedTicket = {
        ...unit.readTicket("TKT-0001"),
        revision: 1,
        status: "in-progress" as const,
        updatedAt: "2026-08-10T10:00:00.000Z",
      };
      unit.updateTicket(updatedTicket, 0);
      unit.appendTicketRevision({
        ticketId: updatedTicket.id,
        revision: updatedTicket.revision,
        ticket: updatedTicket,
        operationalEventId: eventIds.single,
        createdAt: updatedTicket.updatedAt,
      });
      unit.persistCommandResult(context.commandId, hash, originalResult);
    });
    store.transaction((unit) => {
      const current = unit.readTicket("TKT-0001");
      const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent(event("TKT-0001", sequence!, eventIds.compoundFirst, commandIds.compound));
      const laterTicket = {
        ...current,
        revision: 2,
        status: "waiting-customer" as const,
        updatedAt: "2026-08-10T10:05:00.000Z",
      };
      unit.updateTicket(laterTicket, current.revision);
      unit.appendTicketRevision({
        ticketId: laterTicket.id,
        revision: laterTicket.revision,
        ticket: laterTicket,
        operationalEventId: eventIds.compoundFirst,
        createdAt: laterTicket.updatedAt,
      });
    });
    store.close();

    const reopened = OperationalSqliteStore.open(path);
    try {
      reopened.initialize();
      const replay = reopened.transaction((unit) =>
        unit.beginCommand(context.commandId, "ticket-update", {
          status: "in-progress",
          ticketId: "TKT-0001",
          expectedRevision: 0,
        }));
      expect(replay).toEqual({ result: originalResult });
      expect(replay).not.toBe("new");
      if (replay !== "new") {
        expect(Object.isFrozen(replay)).toBe(true);
        expect(Object.isFrozen(replay.result)).toBe(true);
        expect(Object.isFrozen(replay.result.tickets)).toBe(true);
      }
      const current = reopened.readWorkflowSnapshot("TKT-0001");
      expect(current.ticket.revision).toBe(2);
      expect(current.events.map(({ id }) => id))
        .toEqual([eventIds.single, eventIds.compoundFirst]);
    } finally {
      reopened.close();
    }
  });

  it("rejects command reuse with different input or operation and rolls back writes made in the transaction", () => {
    const store = openedStore();
    store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
    const originalRequest = { ticketId: "TKT-0001", expectedRevision: 0 };
    const originalHash = canonicalRequestHash("ticket-update", originalRequest);
    store.transaction((unit) => {
      expect(unit.beginCommand(commandIds.single, "ticket-update", originalRequest)).toBe("new");
      const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
      unit.persistCommandResult(commandIds.single, originalHash, {
        operation: "ticket-update",
        tickets: [{
          ticketId: "TKT-0001",
          operationalEventIds: [eventIds.single],
          resultingRevision: null,
        }],
      });
    });

    expect(() => store.transaction((unit) => {
      const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent(event(
        "TKT-0001",
        sequence!,
        eventIds.compoundFirst,
        commandIds.single,
      ));
      unit.beginCommand(commandIds.single, "ticket-update", {
        ticketId: "TKT-0001",
        expectedRevision: 1,
      });
    })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));

    expect(() => store.transaction((unit) =>
      unit.beginCommand(commandIds.single, "ticket-close", originalRequest)))
      .toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
    expect(store.readWorkflowSnapshot("TKT-0001").events.map(({ id, sequence }) => ({ id, sequence })))
      .toEqual([{ id: eventIds.single, sequence: 1 }]);
    store.close();
  });

  it("closes a new command against event and non-event writes after its result is persisted", () => {
    const store = openedStore();
    try {
      store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
      const request = { ticketId: "TKT-0001" };
      const hash = canonicalRequestHash("ticket-update", request);

      expect(() => store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
        const sequences = unit.allocateEventSequences("TKT-0001", 2);
        unit.appendEvent(event("TKT-0001", sequences[0]!, eventIds.single, commandIds.single));
        unit.persistCommandResult(commandIds.single, hash, {
          operation: "ticket-update",
          tickets: [{
            ticketId: "TKT-0001",
            operationalEventIds: [eventIds.single],
            resultingRevision: null,
          }],
        });
        unit.appendEvent(event(
          "TKT-0001",
          sequences[1]!,
          eventIds.compoundFirst,
          commandIds.single,
        ));
      })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
      expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);

      expect(() => store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
        const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
        unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
        unit.persistCommandResult(commandIds.single, hash, {
          operation: "ticket-update",
          tickets: [{
            ticketId: "TKT-0001",
            operationalEventIds: [eventIds.single],
            resultingRevision: null,
          }],
        });
        unit.insertMessage({
          id: "22222222-2222-4222-8222-222222222222",
          ticketId: "TKT-0001",
          operationalEventId: eventIds.single,
          kind: "customer",
          createdAt: "2026-08-10T10:00:00.000Z",
          body: "This write must not escape the closed command result.",
        });
      })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
      expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("makes a replay transaction read-only before and after the replay check", () => {
    const store = openedStore();
    try {
      store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
      const request = { ticketId: "TKT-0001" };
      const hash = canonicalRequestHash("ticket-update", request);
      store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
        const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
        unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
        unit.persistCommandResult(commandIds.single, hash, {
          operation: "ticket-update",
          tickets: [{
            ticketId: "TKT-0001",
            operationalEventIds: [eventIds.single],
            resultingRevision: null,
          }],
        });
      });

      expect(() => store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.single, "ticket-update", request)).not.toBe("new");
        const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
        unit.appendEvent(event(
          "TKT-0001",
          sequence!,
          eventIds.compoundFirst,
          commandIds.single,
        ));
      })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
      expect(store.readWorkflowSnapshot("TKT-0001").events.map(({ id }) => id))
        .toEqual([eventIds.single]);

      expect(() => store.transaction((unit) => {
        unit.insertTicket(ticket("TKT-0002"));
        unit.beginCommand(commandIds.single, "ticket-update", request);
      })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
      expect(() => store.readTicket("TKT-0002")).toThrow(/not found/i);
    } finally {
      store.close();
    }
  });

  it("persists and replays an ordered multi-event result without appending a second event set", () => {
    const store = openedStore();
    store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
    const request = { ticketId: "TKT-0001", recommendationId: "rec-001" };
    const hash = canonicalRequestHash("approve-and-send", request);
    const result = {
      operation: "approve-and-send",
      tickets: [{
        ticketId: "TKT-0001" as const,
        operationalEventIds: [eventIds.compoundFirst, eventIds.compoundSecond],
        resultingRevision: null,
      }],
      messageId,
    };

    store.transaction((unit) => {
      expect(unit.beginCommand(commandIds.compound, "approve-and-send", request)).toBe("new");
      const sequences = unit.allocateEventSequences("TKT-0001", 2);
      unit.appendEvent(event("TKT-0001", sequences[0]!, eventIds.compoundFirst, commandIds.compound));
      unit.appendEvent(event("TKT-0001", sequences[1]!, eventIds.compoundSecond, commandIds.compound));
      unit.insertMessage({
        id: messageId,
        ticketId: "TKT-0001",
        operationalEventId: eventIds.compoundSecond,
        kind: "support",
        createdAt: "2026-08-10T10:00:00.000Z",
        body: "The approved response was sent.",
      });
      unit.persistCommandResult(commandIds.compound, hash, result);
    });

    expect(store.transaction((unit) =>
      unit.beginCommand(commandIds.compound, "approve-and-send", request)))
      .toEqual({ result });
    expect(store.readWorkflowSnapshot("TKT-0001").events.map(({ id, sequence }) => ({ id, sequence })))
      .toEqual([
        { id: eventIds.compoundFirst, sequence: 1 },
        { id: eventIds.compoundSecond, sequence: 2 },
      ]);
    store.close();
  });

  it("rolls back when the semantic result omits an event written by the command", () => {
    const store = openedStore();
    try {
      store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
      const request = { ticketId: "TKT-0001", recommendationId: "rec-incomplete" };
      const hash = canonicalRequestHash("approve-and-send", request);

      expect(() => store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.compound, "approve-and-send", request)).toBe("new");
        const sequences = unit.allocateEventSequences("TKT-0001", 2);
        unit.appendEvent(event("TKT-0001", sequences[0]!, eventIds.compoundFirst, commandIds.compound));
        unit.appendEvent(event("TKT-0001", sequences[1]!, eventIds.compoundSecond, commandIds.compound));
        unit.persistCommandResult(commandIds.compound, hash, {
          operation: "approve-and-send",
          tickets: [{
            ticketId: "TKT-0001",
            operationalEventIds: [eventIds.compoundFirst],
            resultingRevision: null,
          }],
        });
      })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
      expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("keeps multi-ticket causal ranges separate while committing and replaying one atomic command", () => {
    const store = openedStore();
    store.transaction((unit) => {
      unit.insertTicket(ticket("TKT-0001"));
      unit.insertTicket(ticket("TKT-0002"));
      const [seedSequence] = unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent(event("TKT-0001", seedSequence!, eventIds.seed, commandIds.single));
    });
    const request = { diagnosisId: "diagnosis-001", ticketIds: ["TKT-0001", "TKT-0002"] };
    const hash = canonicalRequestHash("apply-diagnosis-fix", request);
    const result = {
      operation: "apply-diagnosis-fix",
      tickets: [
        {
          ticketId: "TKT-0001" as const,
          operationalEventIds: [eventIds.firstTicketFirst, eventIds.firstTicketSecond],
          resultingRevision: 1,
        },
        {
          ticketId: "TKT-0002" as const,
          operationalEventIds: [eventIds.secondTicketFirst, eventIds.secondTicketSecond],
          resultingRevision: 1,
        },
      ],
      diagnosisId: "diagnosis-001",
    };

    store.transaction((unit) => {
      expect(unit.beginCommand(commandIds.multiTicket, "apply-diagnosis-fix", request)).toBe("new");
      expect(unit.allocateEventSequences("TKT-0001", 2)).toEqual([2, 3]);
      expect(unit.allocateEventSequences("TKT-0002", 2)).toEqual([1, 2]);
      unit.appendEvent(event("TKT-0001", 2, eventIds.firstTicketFirst, commandIds.multiTicket));
      unit.appendEvent(event("TKT-0002", 1, eventIds.secondTicketFirst, commandIds.multiTicket));
      unit.appendEvent(event("TKT-0001", 3, eventIds.firstTicketSecond, commandIds.multiTicket));
      unit.appendEvent(event("TKT-0002", 2, eventIds.secondTicketSecond, commandIds.multiTicket));
      const firstUpdated = advanceTicket(unit.readTicket("TKT-0001"), "in-progress");
      const secondUpdated = advanceTicket(unit.readTicket("TKT-0002"), "in-progress");
      unit.updateTicket(firstUpdated, 0);
      unit.updateTicket(secondUpdated, 0);
      unit.appendTicketRevision({
        ticketId: firstUpdated.id,
        revision: firstUpdated.revision,
        ticket: firstUpdated,
        operationalEventId: eventIds.firstTicketSecond,
        createdAt: firstUpdated.updatedAt,
      });
      unit.appendTicketRevision({
        ticketId: secondUpdated.id,
        revision: secondUpdated.revision,
        ticket: secondUpdated,
        operationalEventId: eventIds.secondTicketSecond,
        createdAt: secondUpdated.updatedAt,
      });
      unit.insertDiagnosis({
        diagnosis: diagnosisFor("TKT-0001", "diagnosis-001"),
        operationalEventId: eventIds.firstTicketFirst,
      });
      unit.persistCommandResult(commandIds.multiTicket, hash, result);
    });

    expect(store.transaction((unit) =>
      unit.beginCommand(commandIds.multiTicket, "apply-diagnosis-fix", request)))
      .toEqual({ result });
    expect(store.readWorkflowSnapshot("TKT-0001").events.map(({ sequence }) => sequence))
      .toEqual([1, 2, 3]);
    expect(store.readWorkflowSnapshot("TKT-0002").events.map(({ sequence }) => sequence))
      .toEqual([1, 2]);
    store.close();
  });

  it("binds every semantic result reference to records written by the command", () => {
    const store = openedStore();
    try {
      store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
      const request = { ticketId: "TKT-0001", expectedRevision: 0 };
      const hash = canonicalRequestHash("ticket-update", request);
      const result = {
        operation: "ticket-update",
        tickets: [{
          ticketId: "TKT-0001" as const,
          operationalEventIds: [
            eventIds.semanticRevision,
            eventIds.semanticMessage,
            eventIds.semanticRecommendation,
            eventIds.semanticDiagnosis,
          ],
          resultingRevision: 1,
        }],
        messageId,
        recommendationId,
        diagnosisId: "diagnosis-semantic",
      };

      store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.semantic, "ticket-update", request)).toBe("new");
        const sequences = unit.allocateEventSequences("TKT-0001", 4);
        const semanticEventIds = result.tickets[0].operationalEventIds;
        semanticEventIds.forEach((id, index) => {
          unit.appendEvent(event("TKT-0001", sequences[index]!, id, commandIds.semantic));
        });
        const updated = advanceTicket(unit.readTicket("TKT-0001"), "in-progress");
        unit.updateTicket(updated, 0);
        unit.appendTicketRevision({
          ticketId: updated.id,
          revision: updated.revision,
          ticket: updated,
          operationalEventId: eventIds.semanticRevision,
          createdAt: updated.updatedAt,
        });
        unit.insertMessage({
          id: messageId,
          ticketId: updated.id,
          operationalEventId: eventIds.semanticMessage,
          kind: "customer",
          createdAt: "2026-08-10T10:00:00.000Z",
          body: "The credential refresh still fails.",
        });
        const recommendation = recommendationFor(updated, recommendationId);
        unit.insertRecommendation(recommendation);
        unit.appendRecommendationRevision({
          recommendation,
          operationalEventId: eventIds.semanticRecommendation,
          createdAt: "2026-08-10T10:00:00.000Z",
        });
        unit.insertDiagnosis({
          diagnosis: diagnosisFor(updated.id, "diagnosis-semantic"),
          operationalEventId: eventIds.semanticDiagnosis,
        });
        unit.appendTrace(decisionTrace(updated.id, eventIds.semanticDiagnosis));
        unit.persistCommandResult(commandIds.semantic, hash, result);
      });

      expect(store.transaction((unit) =>
        unit.beginCommand(commandIds.semantic, "ticket-update", request)))
        .toEqual({ result });
    } finally {
      store.close();
    }
  });

  it("persists and replays an ordered plural recommendation result without duplicate retries", () => {
    const path = temporaryDatabasePath();
    const store = OperationalSqliteStore.open(path);
    const request = { ticketId: "TKT-0001", supersedes: [secondRecommendationId, thirdRecommendationId] };
    const hash = canonicalRequestHash("recommendation-refresh", request);
    const result = {
      operation: "recommendation-refresh",
      tickets: [{
        ticketId: "TKT-0001" as const,
        operationalEventIds: [eventIds.pluralFirst, eventIds.pluralSecond, eventIds.pluralThird],
        resultingRevision: null,
      }],
      recommendationIds: [recommendationId, secondRecommendationId, thirdRecommendationId],
    };
    try {
      store.initialize();
      store.transaction((unit) => {
        unit.insertTicket(ticket("TKT-0001"));
        const sequences = unit.allocateEventSequences("TKT-0001", 2);
        unit.appendEvent(event("TKT-0001", sequences[0]!, eventIds.compoundFirst, commandIds.compound));
        unit.appendEvent(event("TKT-0001", sequences[1]!, eventIds.compoundSecond, commandIds.compound));
        const current = unit.readTicket("TKT-0001");
        for (const id of [secondRecommendationId, thirdRecommendationId]) {
          unit.insertRecommendation(recommendationFor(current, id));
        }
      });

      store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.pluralRecommendation, "recommendation-refresh", request)).toBe("new");
        const sequences = unit.allocateEventSequences("TKT-0001", 3);
        unit.appendEvent(event("TKT-0001", sequences[0]!, eventIds.pluralFirst, commandIds.pluralRecommendation));
        unit.appendEvent(event("TKT-0001", sequences[1]!, eventIds.pluralSecond, commandIds.pluralRecommendation));
        unit.appendEvent(event("TKT-0001", sequences[2]!, eventIds.pluralThird, commandIds.pluralRecommendation));
        const current = unit.readTicket("TKT-0001");
        const created = recommendationFor(current, recommendationId);
        unit.insertRecommendation(created);
        unit.appendRecommendationRevision({
          recommendation: created,
          operationalEventId: eventIds.pluralFirst,
          createdAt: "2026-08-10T10:00:00.000Z",
        });
        for (const [id, operationalEventId] of [
          [secondRecommendationId, eventIds.pluralSecond],
          [thirdRecommendationId, eventIds.pluralThird],
        ] as const) {
          unit.appendRecommendationRevision({
            recommendation: recommendationFor(current, id),
            operationalEventId,
            createdAt: "2026-08-10T10:00:00.000Z",
          });
        }
        unit.persistCommandResult(commandIds.pluralRecommendation, hash, result);
      });

      const beforeRetry = store.readWorkflowSnapshot("TKT-0001");
      expect(beforeRetry.recommendations.map(({ id }) => id)).toEqual([
        recommendationId,
        secondRecommendationId,
        thirdRecommendationId,
      ]);
      store.close();

      const reopened = OperationalSqliteStore.open(path);
      try {
        reopened.initialize();
        const replay = reopened.transaction((unit) =>
          unit.beginCommand(commandIds.pluralRecommendation, "recommendation-refresh", request))
        expect(replay).toEqual({ result });
        if (typeof replay !== "string") {
          expect(Object.isFrozen(replay.result.recommendationIds)).toBe(true);
          expect(() => (replay.result.recommendationIds as string[]).push("20000000-0000-4000-8000-000000000001"))
            .toThrow();
        }
        const afterRetry = reopened.readWorkflowSnapshot("TKT-0001");
        expect(afterRetry.events.map(({ id }) => id)).toEqual(beforeRetry.events.map(({ id }) => id));
        expect(afterRetry.recommendationRevisions).toHaveLength(beforeRetry.recommendationRevisions.length);
        expect(afterRetry.recommendations).toHaveLength(beforeRetry.recommendations.length);
      } finally {
        reopened.close();
      }
    } finally {
      if (store) {
        try { store.close(); } catch { /* already closed for restart replay */ }
      }
    }
  });

  it.each([
    ["wrong causal order", [recommendationId, thirdRecommendationId, secondRecommendationId]],
    ["an omitted aggregate", [recommendationId, secondRecommendationId]],
  ] as const)("rejects a plural recommendation result with %s", (_label, recommendationIds) => {
    const store = openedStore();
    try {
      store.transaction((unit) => {
        unit.insertTicket(ticket("TKT-0001"));
        const sequences = unit.allocateEventSequences("TKT-0001", 2);
        unit.appendEvent(event("TKT-0001", sequences[0]!, eventIds.compoundFirst, commandIds.compound));
        unit.appendEvent(event("TKT-0001", sequences[1]!, eventIds.compoundSecond, commandIds.compound));
        const current = unit.readTicket("TKT-0001");
        unit.insertRecommendation(recommendationFor(current, secondRecommendationId));
        unit.insertRecommendation(recommendationFor(current, thirdRecommendationId));
      });
      const request = { ticketId: "TKT-0001", supersedes: [secondRecommendationId, thirdRecommendationId] };
      const hash = canonicalRequestHash("recommendation-refresh", request);
      expect(() => store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.pluralRecommendation, "recommendation-refresh", request)).toBe("new");
        const sequences = unit.allocateEventSequences("TKT-0001", 3);
        unit.appendEvent(event("TKT-0001", sequences[0]!, eventIds.pluralFirst, commandIds.pluralRecommendation));
        unit.appendEvent(event("TKT-0001", sequences[1]!, eventIds.pluralSecond, commandIds.pluralRecommendation));
        unit.appendEvent(event("TKT-0001", sequences[2]!, eventIds.pluralThird, commandIds.pluralRecommendation));
        const current = unit.readTicket("TKT-0001");
        const created = recommendationFor(current, recommendationId);
        unit.insertRecommendation(created);
        for (const [id, operationalEventId] of [
          [recommendationId, eventIds.pluralFirst],
          [secondRecommendationId, eventIds.pluralSecond],
          [thirdRecommendationId, eventIds.pluralThird],
        ] as const) {
          unit.appendRecommendationRevision({
            recommendation: recommendationFor(current, id),
            operationalEventId,
            createdAt: "2026-08-10T10:00:00.000Z",
          });
        }
        unit.persistCommandResult(commandIds.pluralRecommendation, hash, {
          operation: "recommendation-refresh",
          tickets: [{
            ticketId: "TKT-0001",
            operationalEventIds: [eventIds.pluralFirst, eventIds.pluralSecond, eventIds.pluralThird],
            resultingRevision: null,
          }],
          recommendationIds: [...recommendationIds],
        });
      })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
      expect(store.readWorkflowSnapshot("TKT-0001").events.map(({ id }) => id))
        .toEqual([eventIds.compoundFirst, eventIds.compoundSecond]);
    } finally {
      store.close();
    }
  });

  it("rejects a newly inserted recommendation aggregate without a current-command revision", () => {
    const store = openedStore();
    try {
      store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
      const request = { ticketId: "TKT-0001" };
      const hash = canonicalRequestHash("recommendation-refresh", request);
      expect(() => store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.pluralRecommendation, "recommendation-refresh", request)).toBe("new");
        const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
        unit.appendEvent(event("TKT-0001", sequence!, eventIds.pluralFirst, commandIds.pluralRecommendation));
        unit.insertRecommendation(recommendationFor(unit.readTicket("TKT-0001"), recommendationId));
        unit.persistCommandResult(commandIds.pluralRecommendation, hash, {
          operation: "recommendation-refresh",
          tickets: [{
            ticketId: "TKT-0001",
            operationalEventIds: [eventIds.pluralFirst],
            resultingRevision: null,
          }],
          recommendationId,
        });
      })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
      expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);
    } finally {
      store.close();
    }
  });

  it.each([null, 2] as const)(
    "rejects resulting revision %s when the command wrote ticket revision 1",
    (resultingRevision) => {
      const store = openedStore();
      try {
        store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
        const request = { ticketId: "TKT-0001", expectedRevision: 0 };
        const hash = canonicalRequestHash("ticket-update", request);

        expect(() => store.transaction((unit) => {
          expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
          const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
          unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
          const updated = advanceTicket(unit.readTicket("TKT-0001"), "in-progress");
          unit.updateTicket(updated, 0);
          unit.appendTicketRevision({
            ticketId: updated.id,
            revision: updated.revision,
            ticket: updated,
            operationalEventId: eventIds.single,
            createdAt: updated.updatedAt,
          });
          unit.persistCommandResult(commandIds.single, hash, {
            operation: "ticket-update",
            tickets: [{
              ticketId: "TKT-0001",
              operationalEventIds: [eventIds.single],
              resultingRevision,
            }],
          });
        })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
        expect(store.readTicket("TKT-0001").revision).toBe(0);
      } finally {
        store.close();
      }
    },
  );

  it.each(["message", "recommendation", "diagnosis"] as const)(
    "rejects a missing %s result reference",
    (kind) => {
      const store = openedStore();
      try {
        store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
        const request = { ticketId: "TKT-0001" };
        const hash = canonicalRequestHash("ticket-update", request);
        expect(() => store.transaction((unit) => {
          expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
          const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
          unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
          unit.persistCommandResult(
            commandIds.single,
            hash,
            resultWithReference(kind, "TKT-0001", eventIds.single),
          );
        })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
        expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);
      } finally {
        store.close();
      }
    },
  );

  it("rejects a transaction-local decision trace linked to an event not written by the claimed command", () => {
    const store = openedStore();
    try {
      store.transaction((unit) => {
        unit.insertTicket(ticket("TKT-0001"));
        const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
        unit.appendEvent(event("TKT-0001", sequence!, eventIds.seed, commandIds.compound));
      });
      const request = { ticketId: "TKT-0001" };
      const hash = canonicalRequestHash("ticket-update", request);
      expect(() => store.transaction((unit) => {
        expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
        const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
        unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
        unit.appendTrace(decisionTrace("TKT-0001", eventIds.seed));
        unit.persistCommandResult(commandIds.single, hash, {
          operation: "ticket-update",
          tickets: [{
            ticketId: "TKT-0001",
            operationalEventIds: [eventIds.single],
            resultingRevision: null,
          }],
        });
      })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
      const snapshot = store.readWorkflowSnapshot("TKT-0001");
      expect(snapshot.events.map(({ id }) => id)).toEqual([eventIds.seed]);
      expect(snapshot.traces).toEqual([]);
    } finally {
      store.close();
    }
  });

  it.each(["message", "recommendation", "diagnosis"] as const)(
    "rejects an omitted %s result reference when the command wrote that record",
    (kind) => {
      const store = openedStore();
      try {
        store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
        const request = { ticketId: "TKT-0001" };
        const hash = canonicalRequestHash("ticket-update", request);
        expect(() => store.transaction((unit) => {
          expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
          const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
          unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
          writeSemanticReference(unit, kind, "TKT-0001", eventIds.single);
          unit.persistCommandResult(commandIds.single, hash, {
            operation: "ticket-update",
            tickets: [{
              ticketId: "TKT-0001",
              operationalEventIds: [eventIds.single],
              resultingRevision: null,
            }],
          });
        })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
        expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);
      } finally {
        store.close();
      }
    },
  );

  it.each(["message", "recommendation", "diagnosis"] as const)(
    "rejects a %s result reference owned by another ticket and command",
    (kind) => {
      const store = openedStore();
      try {
        store.transaction((unit) => {
          unit.insertTicket(ticket("TKT-0001"));
          unit.insertTicket(ticket("TKT-0002"));
        });
        store.transaction((unit) => seedWrongTicketReference(unit, kind));
        const request = { ticketId: "TKT-0001" };
        const hash = canonicalRequestHash("ticket-update", request);

        expect(() => store.transaction((unit) => {
          expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
          const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
          unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
          unit.persistCommandResult(
            commandIds.single,
            hash,
            resultWithReference(kind, "TKT-0001", eventIds.single),
          );
        })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
        expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);
      } finally {
        store.close();
      }
    },
  );

  it.each(["message", "recommendation", "diagnosis"] as const)(
    "rejects restart-time adoption of a pre-existing unbound %s write set",
    (kind) => {
      const path = temporaryDatabasePath();
      const store = OperationalSqliteStore.open(path);
      store.initialize();
      store.transaction((unit) => {
        unit.insertTicket(ticket("TKT-0001"));
        const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
        unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
        writeSemanticReference(unit, kind, "TKT-0001", eventIds.single);
      });
      store.close();

      const reopened = OperationalSqliteStore.open(path);
      try {
        reopened.initialize();
        const request = { ticketId: "TKT-0001" };
        const hash = canonicalRequestHash("ticket-update", request);
        expect(() => reopened.transaction((unit) => {
          expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
          unit.persistCommandResult(
            commandIds.single,
            hash,
            resultWithReference(kind, "TKT-0001", eventIds.single),
          );
        })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
        expect(reopened.readWorkflowSnapshot("TKT-0001").events.map(({ id }) => id))
          .toEqual([eventIds.single]);
        expect(() => reopened.transaction((unit) => {
          expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
          throw new Error("rollback claim probe");
        })).toThrow("rollback claim probe");
      } finally {
        reopened.close();
      }
    },
  );

  it.each(["message", "recommendation", "diagnosis"] as const)(
    "rejects two same-command %s writes because one result reference cannot represent both",
    (kind) => {
      const store = openedStore();
      try {
        store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));
        const request = { ticketId: "TKT-0001" };
        const hash = canonicalRequestHash("ticket-update", request);
        expect(() => store.transaction((unit) => {
          expect(unit.beginCommand(commandIds.single, "ticket-update", request)).toBe("new");
          const sequences = unit.allocateEventSequences("TKT-0001", 2);
          unit.appendEvent(event(
            "TKT-0001",
            sequences[0]!,
            eventIds.semanticMessage,
            commandIds.single,
          ));
          unit.appendEvent(event(
            "TKT-0001",
            sequences[1]!,
            eventIds.semanticRecommendation,
            commandIds.single,
          ));
          writeSemanticReference(unit, kind, "TKT-0001", eventIds.semanticMessage, "first");
          writeSemanticReference(unit, kind, "TKT-0001", eventIds.semanticRecommendation, "second");
          unit.persistCommandResult(commandIds.single, hash, {
            ...resultWithReference(kind, "TKT-0001", eventIds.semanticMessage),
            tickets: [{
              ticketId: "TKT-0001",
              operationalEventIds: [eventIds.semanticMessage, eventIds.semanticRecommendation],
              resultingRevision: null,
            }],
          });
        })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
        expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);
      } finally {
        store.close();
      }
    },
  );

  it("rolls back every ticket event and the command result when an atomic multi-ticket command fails", () => {
    const store = openedStore();
    store.transaction((unit) => {
      unit.insertTicket(ticket("TKT-0001"));
      unit.insertTicket(ticket("TKT-0002"));
    });
    const request = { diagnosisId: "diagnosis-rollback", ticketIds: ["TKT-0001", "TKT-0002"] };
    const hash = canonicalRequestHash("apply-diagnosis-fix", request);
    const result = {
      operation: "apply-diagnosis-fix",
      tickets: [
        {
          ticketId: "TKT-0001" as const,
          operationalEventIds: [eventIds.rollbackFirst],
          resultingRevision: null,
        },
        {
          ticketId: "TKT-0002" as const,
          operationalEventIds: [eventIds.rollbackSecond],
          resultingRevision: null,
        },
      ],
    };

    expect(() => store.transaction((unit) => {
      expect(unit.beginCommand(commandIds.rollback, "apply-diagnosis-fix", request)).toBe("new");
      const [firstSequence] = unit.allocateEventSequences("TKT-0001", 1);
      const [secondSequence] = unit.allocateEventSequences("TKT-0002", 1);
      unit.appendEvent(event("TKT-0001", firstSequence!, eventIds.rollbackFirst, commandIds.rollback));
      unit.appendEvent(event("TKT-0002", secondSequence!, eventIds.rollbackSecond, commandIds.rollback));
      unit.persistCommandResult(commandIds.rollback, hash, result);
      throw new Error("injected multi-ticket failure");
    })).toThrow("injected multi-ticket failure");

    expect(store.readWorkflowSnapshot("TKT-0001").events).toEqual([]);
    expect(store.readWorkflowSnapshot("TKT-0002").events).toEqual([]);
    store.transaction((unit) => {
      expect(unit.beginCommand(commandIds.rollback, "apply-diagnosis-fix", request)).toBe("new");
      const [firstSequence] = unit.allocateEventSequences("TKT-0001", 1);
      const [secondSequence] = unit.allocateEventSequences("TKT-0002", 1);
      unit.appendEvent(event("TKT-0001", firstSequence!, eventIds.rollbackFirst, commandIds.rollback));
      unit.appendEvent(event("TKT-0002", secondSequence!, eventIds.rollbackSecond, commandIds.rollback));
      unit.persistCommandResult(commandIds.rollback, hash, result);
    });
    expect(store.transaction((unit) =>
      unit.beginCommand(commandIds.rollback, "apply-diagnosis-fix", request)))
      .toEqual({ result });
    store.close();
  });

  it("refuses to commit a claimed command without its durable result", () => {
    const store = openedStore();
    store.transaction((unit) => unit.insertTicket(ticket("TKT-0001")));

    expect(() => store.transaction((unit) => {
      expect(unit.beginCommand(commandIds.single, "ticket-update", { ticketId: "TKT-0001" }))
        .toBe("new");
    })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
    store.transaction((unit) => {
      expect(unit.beginCommand(commandIds.single, "ticket-update", { ticketId: "TKT-0001" }))
        .toBe("new");
      const hash = canonicalRequestHash("ticket-update", { ticketId: "TKT-0001" });
      const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent(event("TKT-0001", sequence!, eventIds.single, commandIds.single));
      unit.persistCommandResult(commandIds.single, hash, {
        operation: "ticket-update",
        tickets: [{
          ticketId: "TKT-0001",
          operationalEventIds: [eventIds.single],
          resultingRevision: null,
        }],
      });
    });
    expect(store.transaction((unit) =>
      unit.beginCommand(commandIds.single, "ticket-update", { ticketId: "TKT-0001" })))
      .not.toBe("new");
    store.close();
  });
});

function temporaryDatabasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "operational-idempotency-"));
  temporaryRoots.push(root);
  return join(root, "operational.sqlite");
}

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

function event(
  ticketId: "TKT-0001" | "TKT-0002",
  sequence: number,
  id: string,
  commandId: string,
) {
  return {
    id,
    ticketId,
    sequence,
    occurredAt: "2026-08-10T10:00:00.000Z",
    actor: "support-lead",
    action: "ticket-updated" as const,
    commandId,
    facts: {},
  };
}

function advanceTicket(value: Ticket, status: "in-progress" | "waiting-customer"): Ticket {
  return TicketSchema.parse({
    ...value,
    revision: value.revision + 1,
    status,
    updatedAt: "2026-08-10T10:00:00.000Z",
  });
}

function recommendationFor(value: Ticket, id: string) {
  return TriageRecommendationSchema.parse({
    id,
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
    createdAt: "2026-08-10T10:00:00.000Z",
  });
}

function diagnosisFor(ticketId: TicketId, id: string) {
  return CompletedDiagnosisSchema.parse({
    id,
    ticketId,
    problem: "API requests fail after rotating credentials.",
    symptoms: ["Requests return 401 after rotation."],
    evidenceUsed: ["Request ID req-123 returned 401."],
    evidenceReferences: [{
      id: "request-id",
      labelAtDiagnosis: "Request ID",
      source: "reply",
      sourceRef: "reply-123",
    }],
    ownerTeam: "api-platform",
    fixSteps: ["Refresh the service credential in the deployment secret store."],
    verificationSteps: ["Confirm a request succeeds with the refreshed credential."],
    completedAt: "2026-08-10T10:00:00.000Z",
  });
}

function resultWithReference(
  kind: "message" | "recommendation" | "diagnosis",
  ticketId: "TKT-0001" | "TKT-0002",
  operationalEventId: string,
) {
  const base = {
    operation: "ticket-update" as const,
    tickets: [{
      ticketId,
      operationalEventIds: [operationalEventId],
      resultingRevision: null,
    }],
  };
  if (kind === "message") return { ...base, messageId };
  if (kind === "recommendation") return { ...base, recommendationId };
  return { ...base, diagnosisId: "diagnosis-semantic" };
}

function seedWrongTicketReference(
  unit: OperationalUnitOfWork,
  kind: "message" | "recommendation" | "diagnosis",
): void {
  const [sequence] = unit.allocateEventSequences("TKT-0002", 1);
  unit.appendEvent(event("TKT-0002", sequence!, eventIds.wrongTicket, commandIds.compound));
  if (kind === "message") {
    unit.insertMessage({
      id: messageId,
      ticketId: "TKT-0002",
      operationalEventId: eventIds.wrongTicket,
      kind: "customer",
      createdAt: "2026-08-10T10:00:00.000Z",
      body: "This message belongs to the other ticket.",
    });
    return;
  }
  if (kind === "recommendation") {
    const recommendation = recommendationFor(unit.readTicket("TKT-0002"), recommendationId);
    unit.insertRecommendation(recommendation);
    unit.appendRecommendationRevision({
      recommendation,
      operationalEventId: eventIds.wrongTicket,
      createdAt: "2026-08-10T10:00:00.000Z",
    });
    return;
  }
  unit.insertDiagnosis({
    diagnosis: diagnosisFor("TKT-0002", "diagnosis-semantic"),
    operationalEventId: eventIds.wrongTicket,
  });
}

function writeSemanticReference(
  unit: OperationalUnitOfWork,
  kind: "message" | "recommendation" | "diagnosis",
  ticketId: "TKT-0001" | "TKT-0002",
  operationalEventId: string,
  ordinal: "first" | "second" = "first",
): void {
  if (kind === "message") {
    unit.insertMessage({
      id: ordinal === "first" ? messageId : secondMessageId,
      ticketId,
      operationalEventId,
      kind: "customer",
      createdAt: "2026-08-10T10:00:00.000Z",
      body: "This command wrote a canonical message.",
    });
    return;
  }
  if (kind === "recommendation") {
    const recommendation = recommendationFor(
      unit.readTicket(ticketId),
      ordinal === "first" ? recommendationId : secondRecommendationId,
    );
    unit.insertRecommendation(recommendation);
    unit.appendRecommendationRevision({
      recommendation,
      operationalEventId,
      createdAt: "2026-08-10T10:00:00.000Z",
    });
    return;
  }
  unit.insertDiagnosis({
    diagnosis: diagnosisFor(
      ticketId,
      ordinal === "first" ? "diagnosis-semantic" : "diagnosis-semantic-second",
    ),
    operationalEventId,
  });
}

function decisionTrace(ticketId: string, operationalEventId: string) {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    operationalEventId,
    ticketId,
    occurredAt: "2026-08-10T10:00:00.000Z",
    actor: "support-lead" as const,
    traceType: "classification" as const,
    category: "api" as const,
    priority: "P2" as const,
    team: "api-platform" as const,
    confidence: 0.9,
    reasons: ["API response evidence"],
  };
}
