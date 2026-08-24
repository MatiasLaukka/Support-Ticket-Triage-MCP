import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DiagnosticTaxonomyRevisionSchema,
  OperationalWorkflowSnapshotSchema,
} from "../src/operational/domain.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";

const roots: string[] = [];
const stores: OperationalSqliteStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("operational diagnostic taxonomy persistence", () => {
  it("appends a valid first revision and returns immutable history in ascending order", () => {
    const path = databasePath();
    const store = openStore(path);
    const first = taxonomyRevision(1, "11111111-1111-4111-8111-111111111111");
    const second = taxonomyRevision(2, "22222222-2222-4222-8222-222222222222");
    store.transaction((unit) => {
      unit.insertTicket(ticket());
      unit.allocateEventSequences("TKT-0001", 2);
      appendTaxonomyEvent(unit, first.operationalEventId, 1, first.createdAt);
      unit.appendDiagnosticTaxonomyRevision(first);
      appendTaxonomyEvent(unit, second.operationalEventId, 2, second.createdAt);
      unit.appendDiagnosticTaxonomyRevision(second);
    });

    expect(store.readWorkflowSnapshot("TKT-0001").diagnosticTaxonomyRevisions)
      .toEqual([first, second]);
    store.close();
  });

  it.each([
    ["missing event", (unit: any, revision: ReturnType<typeof taxonomyRevision>) => {
      unit.insertTicket(ticket());
      unit.appendDiagnosticTaxonomyRevision(revision);
    }],
    ["wrong event action", (unit: any, revision: ReturnType<typeof taxonomyRevision>) => {
      unit.insertTicket(ticket());
      unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent({
        ...event(revision.operationalEventId, "TKT-0001", 1, revision.createdAt),
        action: "diagnosis-completed",
      });
      unit.appendDiagnosticTaxonomyRevision(revision);
    }],
    ["different ticket", (unit: any, revision: ReturnType<typeof taxonomyRevision>) => {
      unit.insertTicket(ticket());
      unit.insertTicket({ ...ticket(), id: "TKT-0002", subject: "Second ticket" });
      unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent(event(revision.operationalEventId, "TKT-0001", 1, revision.createdAt));
      unit.appendDiagnosticTaxonomyRevision({ ...revision, ticketId: "TKT-0002" });
    }],
  ])("rejects a taxonomy revision with %s", (_name, build) => {
    const path = databasePath();
    const store = openStore(path);
    const revision = taxonomyRevision(1, "33333333-3333-4333-8333-333333333333");
    expect(() => store.transaction((unit) => build(unit, revision))).toThrow();
    store.close();
  });

  it("rejects multiple revisions linked to one operational event", () => {
    const path = databasePath();
    const store = openStore(path);
    const first = taxonomyRevision(1, "44444444-4444-4444-8444-444444444444");
    expect(() => store.transaction((unit) => {
      unit.insertTicket(ticket());
      unit.allocateEventSequences("TKT-0001", 1);
      appendTaxonomyEvent(unit, first.operationalEventId, 1, first.createdAt);
      unit.appendDiagnosticTaxonomyRevision(first);
      unit.appendDiagnosticTaxonomyRevision({ ...first, id: "55555555-5555-4555-8555-555555555555", revision: 2 });
    })).toThrow();
    store.close();
  });

  it.each([
    ["duplicate", 1],
    ["gap", 3],
  ])("rejects a %s revision number", (_name, revisionNumber) => {
    const path = databasePath();
    const store = openStore(path);
    const first = taxonomyRevision(1, "66666666-6666-4666-8666-666666666666");
    store.transaction((unit) => {
      unit.insertTicket(ticket());
      unit.allocateEventSequences("TKT-0001", 1);
      appendTaxonomyEvent(unit, first.operationalEventId, 1, first.createdAt);
      unit.appendDiagnosticTaxonomyRevision(first);
    });
    expect(() => store.transaction((unit) => {
      const next = taxonomyRevision(revisionNumber, "77777777-7777-4777-8777-777777777777");
      unit.allocateEventSequences("TKT-0001", 1);
      appendTaxonomyEvent(unit, next.operationalEventId, 2, next.createdAt);
      unit.appendDiagnosticTaxonomyRevision(next);
    })).toThrow();
    store.close();
  });

  it("rejects invalid taxonomy context through the shared taxonomy schema", () => {
    expect(() => DiagnosticTaxonomyRevisionSchema.parse({
      ...taxonomyRevision(1, "88888888-8888-4888-8888-888888888888"),
      context: {
        ...taxonomyRevision(1, "88888888-8888-4888-8888-888888888888").context,
        support: { productSurface: "established", problemClass: "unsupported" },
      },
    })).toThrow();
  });

  it("rolls back taxonomy writes and event sequences atomically", () => {
    const path = databasePath();
    const store = openStore(path);
    const invalid = taxonomyRevision(1, "99999999-9999-4999-8999-999999999999");
    expect(() => store.transaction((unit) => {
      unit.insertTicket(ticket());
      unit.allocateEventSequences("TKT-0001", 1);
      appendTaxonomyEvent(unit, invalid.operationalEventId, 1, invalid.createdAt);
      unit.appendDiagnosticTaxonomyRevision({
        ...invalid,
        context: { ...invalid.context, support: { productSurface: "established", problemClass: "invalid" as never } },
      });
    })).toThrow();
    expect(() => store.readWorkflowSnapshot("TKT-0001")).toThrow();

    const valid = taxonomyRevision(1, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    store.transaction((unit) => {
      unit.insertTicket(ticket());
      unit.allocateEventSequences("TKT-0001", 1);
      appendTaxonomyEvent(unit, valid.operationalEventId, 1, valid.createdAt);
      unit.appendDiagnosticTaxonomyRevision(valid);
    });
    expect(store.readWorkflowSnapshot("TKT-0001").events[0]?.sequence).toBe(1);
    store.close();
  });

  it("preserves taxonomy history across restart", () => {
    const path = databasePath();
    const store = openStore(path);
    const revision = taxonomyRevision(1, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    store.transaction((unit) => {
      unit.insertTicket(ticket());
      unit.allocateEventSequences("TKT-0001", 1);
      appendTaxonomyEvent(unit, revision.operationalEventId, 1, revision.createdAt);
      unit.appendDiagnosticTaxonomyRevision(revision);
    });
    const beforeRestart = store.readWorkflowSnapshot("TKT-0001");
    store.close();
    const reopened = openStore(path);
    expect(reopened.readWorkflowSnapshot("TKT-0001").diagnosticTaxonomyRevisions)
      .toEqual(beforeRestart.diagnosticTaxonomyRevisions);
    reopened.close();
  });

  it("rejects orphaned and misordered taxonomy history in snapshots", () => {
    const base = snapshotBase();
    const first = taxonomyRevision(1, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    const orphan = { ...first, operationalEventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
    expect(OperationalWorkflowSnapshotSchema.safeParse({
      ...base,
      diagnosticTaxonomyRevisions: [orphan],
    }).success).toBe(false);
    expect(OperationalWorkflowSnapshotSchema.safeParse({
      ...base,
      events: [event(first.operationalEventId, "TKT-0001", 1, first.createdAt)],
      diagnosticTaxonomyRevisions: [{ ...first, revision: 2 }],
    }).success).toBe(false);
  });
});

function openStore(path: string): OperationalSqliteStore {
  const store = OperationalSqliteStore.open(path);
  store.initialize();
  stores.push(store);
  return store;
}

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "operational-taxonomy-"));
  roots.push(root);
  return join(root, "operational.sqlite");
}

function taxonomyRevision(revision: number, operationalEventId: string) {
  return {
    id: `taxonomy-${revision}-${operationalEventId.slice(0, 8)}`,
    ticketId: "TKT-0001" as const,
    revision,
    operationalEventId,
    createdAt: `2026-08-24T20:0${revision}:00.000Z`,
    context: {
      primaryProductSurface: { domain: "integrations" as const, area: "shopify" as const },
      secondaryProductSurfaces: [],
      problemClasses: ["data-integrity" as const],
      support: { productSurface: "supported" as const, problemClass: "tentative" as const },
      basis: {
        source: "diagnosis" as const,
        evidenceIds: ["evidence-1"],
        knowledgeArticleIds: ["shopify-integration-sync"],
        playbookIds: ["shopify-catalog"],
        knownCauseIds: [],
        explanation: "The diagnosis identifies a Shopify catalog synchronization boundary.",
      },
    },
  };
}

function appendTaxonomyEvent(unit: any, id: string, sequence: number, occurredAt: string): void {
  unit.appendEvent(event(id, "TKT-0001", sequence, occurredAt));
}

function event(id: string, ticketId: string, sequence: number, occurredAt: string) {
  return {
    id,
    ticketId,
    sequence,
    occurredAt,
    actor: "support-lead",
    action: "diagnostic-taxonomy-revised" as const,
    commandId: `eeeeeeee-eeee-4eee-8eee-${id.slice(-12)}`,
    facts: { revision: sequence },
  };
}

function ticket() {
  return {
    id: "TKT-0001" as const,
    createdAt: "2026-08-24T19:00:00.000Z",
    updatedAt: "2026-08-24T19:00:00.000Z",
    customer: { name: "Ada", plan: "Pro", region: "EU", vip: false },
    subject: "Catalog sync is delayed",
    description: "Shopify products are delayed in the catalog.",
    status: "triage" as const,
    tags: [],
    sla: { responseDueAt: "2026-08-24T21:00:00.000Z", breached: false },
    relatedTicketIds: [],
    revision: 0,
  };
}

function snapshotBase() {
  const currentTicket = ticket();
  return {
    ticket: currentTicket,
    ticketRevisions: [],
    recommendations: [],
    recommendationRevisions: [],
    messages: [],
    diagnoses: [],
    events: [],
    traces: [],
    customerReplyWatermark: { state: "none" as const },
  };
}
