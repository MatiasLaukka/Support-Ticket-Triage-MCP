import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TicketSchema, type Ticket } from "../src/domain.js";
import {
  canonicalRequestHash,
  type OperationalCommandContext,
} from "../src/operational/idempotency.js";
import {
  OperationalSqliteStore,
} from "../src/operational/sqlite-store.js";

const commandIds = {
  single: "33333333-3333-4333-8333-333333333333",
  compound: "43333333-3333-4333-8333-333333333333",
  multiTicket: "53333333-3333-4333-8333-333333333333",
  rollback: "63333333-3333-4333-8333-333333333333",
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
} as const;
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
        resultingRevision: 1,
      }],
      messageId: "22222222-2222-4222-8222-222222222222",
    };

    store.transaction((unit) => {
      expect(unit.beginCommand(commandIds.compound, "approve-and-send", request)).toBe("new");
      const sequences = unit.allocateEventSequences("TKT-0001", 2);
      unit.appendEvent(event("TKT-0001", sequences[0]!, eventIds.compoundFirst, commandIds.compound));
      unit.appendEvent(event("TKT-0001", sequences[1]!, eventIds.compoundSecond, commandIds.compound));
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
      diagnosisId: "diagnosis-rollback",
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
