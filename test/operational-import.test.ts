import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeOperationalStore,
  importOperationalData,
  initializeOperationalNative,
  recordImportSkip,
  validateImport,
  type OperationalImportAggregate,
} from "../src/operational/import.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { TicketSchema, TriageRecommendationSchema } from "../src/domain.js";

const roots: string[] = [];
const stores: OperationalSqliteStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("operational import and cutover", () => {
  it("validates every source aggregate in a dry run without writing", () => {
    const store = openStore();
    const report = validateImport({ store, aggregates: [aggregate()] });

    expect(report).toEqual({
      valid: true,
      discoveredSourceIds: ["legacy-ticket-TKT-0001"],
      aggregates: [{ sourceId: "legacy-ticket-TKT-0001", status: "valid", issues: [] }],
    });
    expect(store.readImportState()).toBe("empty");
    expect(() => store.readTicket("TKT-0001")).toThrow("not found");
  });

  it("preserves source records and assigns causal sequences from append order on a safe rerun", () => {
    const store = openStore();
    const source = aggregate();

    expect(importOperationalData({ store, aggregates: [source] })).toEqual({
      state: "imported",
      importedSourceIds: [source.sourceId],
      alreadyImportedSourceIds: [],
      conflicts: [],
      invalid: [],
    });

    const snapshot = store.readWorkflowSnapshot(source.ticket.id);
    expect(snapshot.ticket).toEqual(source.ticket);
    expect(snapshot.events.map(({ id, sequence, actor, occurredAt }) => ({ id, sequence, actor, occurredAt }))).toEqual([
      {
        id: "10000000-0000-4000-8000-000000000001",
        sequence: 1,
        actor: "legacy-agent-a",
        occurredAt: "2026-08-10T12:00:00.000Z",
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        sequence: 2,
        actor: "legacy-agent-b",
        occurredAt: "2026-08-10T11:00:00.000Z",
      },
    ]);
    expect(snapshot.events.map((event) => event.facts.reasonCode)).toEqual([
      "legacy-import",
      "legacy-import",
    ]);
    expect(snapshot.ticketRevisions).toEqual(source.ticketRevisions);
    expect(snapshot.recommendations).toEqual(source.recommendations);
    expect(snapshot.recommendationRevisions).toEqual(source.recommendationRevisions);
    expect(snapshot.traces).toEqual([]);

    expect(importOperationalData({ store, aggregates: [source] })).toEqual({
      state: "imported",
      importedSourceIds: [],
      alreadyImportedSourceIds: [source.sourceId],
      conflicts: [],
      invalid: [],
    });
    expect(store.readWorkflowSnapshot(source.ticket.id).events).toHaveLength(2);
  });

  it("treats the discovered aggregate manifest as an order-independent rerun set", () => {
    const store = openStore();
    const first = aggregate({ sourceId: "legacy-first" });
    const second = aggregate({
      sourceId: "legacy-second",
      ticketId: "TKT-0002",
      recommendationId: "60000000-0000-4000-8000-000000000011",
      eventIds: [
        "60000000-0000-4000-8000-000000000001",
        "60000000-0000-4000-8000-000000000002",
      ],
      commandIds: [
        "60000000-0000-4000-8000-000000000021",
        "60000000-0000-4000-8000-000000000022",
      ],
    });
    expect(importOperationalData({ store, aggregates: [first, second] }).state).toBe("imported");

    expect(importOperationalData({ store, aggregates: [second, first] })).toMatchObject({
      state: "imported",
      importedSourceIds: [],
      alreadyImportedSourceIds: ["legacy-second", "legacy-first"],
      conflicts: [],
    });
  });

  it("uses a durable source hash for reruns after live state changes and retains legacy provenance", () => {
    const store = openStore();
    const source = aggregate();
    importOperationalData({ store, aggregates: [source] });
    expect(store.listImportSources()).toEqual([{
      sourceId: source.sourceId,
      ticketId: source.ticket.id,
      provenance: "legacy",
      aggregateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }]);

    store.transaction((unit) => {
      const current = unit.readTicket("TKT-0001");
      const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
      const eventId = "70000000-0000-4000-8000-000000000001";
      const updated = TicketSchema.parse({
        ...current,
        subject: "Legitimate post-cutover mutation",
        revision: 3,
        updatedAt: "2026-08-11T12:00:00.000Z",
      });
      unit.updateTicket(updated, 2);
      unit.appendTicketRevision({
        ticketId: updated.id,
        revision: updated.revision,
        ticket: updated,
        operationalEventId: eventId,
        createdAt: updated.updatedAt,
      });
      unit.appendEvent({
        id: eventId,
        ticketId: updated.id,
        sequence: sequence!,
        occurredAt: updated.updatedAt,
        actor: "native-agent",
        action: "ticket-updated",
        commandId: "70000000-0000-4000-8000-000000000002",
        facts: { reasonCode: "native-operation", revision: 3 },
      });
    });

    expect(importOperationalData({ store, aggregates: [source] })).toMatchObject({
      state: "imported",
      importedSourceIds: [],
      alreadyImportedSourceIds: [source.sourceId],
      conflicts: [],
    });
    expect(() => importOperationalData({
      store,
      aggregates: [{ ...source, ticket: { ...source.ticket, subject: "Changed legacy source" } }],
    })).toThrow(/manifest differs/i);
  });

  it("commits the final source marker and imported cutover state atomically", () => {
    const store = openStore();
    const manifest = [{
      sourceId: "legacy-atomic",
      ticketId: "TKT-0001" as const,
      provenance: "legacy" as const,
      aggregateHash: "a".repeat(64),
    }];
    store.transaction((unit) => {
      unit.transitionImportState("empty", "import-in-progress");
      unit.writeImportManifest(manifest);
    });

    expect(() => store.transaction((unit) => {
      unit.markImportedSource("legacy-atomic");
      unit.completeImportIfReady();
      throw new Error("simulated process failure before commit");
    })).toThrow("simulated process failure");
    expect(store.readImportState()).toBe("import-in-progress");
    expect(store.listImportedSourceIds()).toEqual([]);

    store.transaction((unit) => {
      unit.markImportedSource("legacy-atomic");
      unit.completeImportIfReady();
    });
    expect(store.readImportState()).toBe("imported");
    expect(store.listImportedSourceIds()).toEqual(["legacy-atomic"]);
  });

  it("isolates a conflicting aggregate and keeps partial imports mutation-blocked", () => {
    const store = openStore();
    const conflicting = aggregate({ sourceId: "legacy-conflict" });
    store.transaction((unit) => unit.insertTicket({
      ...conflicting.ticket,
      subject: "Different existing aggregate",
    }));
    const valid = aggregate({
      sourceId: "legacy-valid",
      ticketId: "TKT-0002",
      recommendationId: "20000000-0000-4000-8000-000000000011",
      eventIds: [
        "20000000-0000-4000-8000-000000000001",
        "20000000-0000-4000-8000-000000000002",
      ],
      commandIds: [
        "20000000-0000-4000-8000-000000000021",
        "20000000-0000-4000-8000-000000000022",
      ],
    });

    const summary = importOperationalData({ store, aggregates: [conflicting, valid] });

    expect(summary).toMatchObject({
      state: "import-in-progress",
      importedSourceIds: ["legacy-valid"],
      conflicts: [{ sourceId: "legacy-conflict", code: "AGGREGATE_CONFLICT" }],
    });
    expect(store.readTicket("TKT-0001").subject).toBe("Different existing aggregate");
    expect(store.readTicket("TKT-0002")).toEqual(valid.ticket);
    const runtimeStore = createRuntimeOperationalStore(store);
    expect(runtimeStore.readTicket("TKT-0002")).toEqual(valid.ticket);
    expect(() => runtimeStore.transaction((unit) => unit.insertTicket(ticket("TKT-0003"))))
      .toThrow(/import-in-progress.*initialize or complete the operational import/i);
  });

  it("rolls back a cross-ticket event ID conflict and continues later aggregate batches", () => {
    const store = openStore();
    const collidingEventId = "50000000-0000-4000-8000-000000000001";
    store.transaction((unit) => {
      unit.insertTicket(ticket("TKT-0001"));
      const [sequence] = unit.allocateEventSequences("TKT-0001", 1);
      unit.appendEvent({
        id: collidingEventId,
        ticketId: "TKT-0001",
        sequence: sequence!,
        occurredAt: "2026-08-10T10:00:00.000Z",
        actor: "native-agent",
        action: "ticket-updated",
        commandId: "50000000-0000-4000-8000-000000000002",
        facts: { reasonCode: "native-operation", revision: 2 },
      });
    });
    const conflicting = aggregate({
      sourceId: "legacy-id-conflict",
      ticketId: "TKT-0002",
      recommendationId: "50000000-0000-4000-8000-000000000011",
      eventIds: [collidingEventId, "50000000-0000-4000-8000-000000000012"],
      commandIds: [
        "50000000-0000-4000-8000-000000000021",
        "50000000-0000-4000-8000-000000000022",
      ],
    });
    const valid = aggregate({
      sourceId: "legacy-after-conflict",
      ticketId: "TKT-0003",
      recommendationId: "50000000-0000-4000-8000-000000000031",
      eventIds: [
        "50000000-0000-4000-8000-000000000032",
        "50000000-0000-4000-8000-000000000033",
      ],
      commandIds: [
        "50000000-0000-4000-8000-000000000041",
        "50000000-0000-4000-8000-000000000042",
      ],
    });

    const summary = importOperationalData({ store, aggregates: [conflicting, valid] });

    expect(summary).toMatchObject({
      state: "import-in-progress",
      importedSourceIds: ["legacy-after-conflict"],
      conflicts: [{ sourceId: "legacy-id-conflict", code: "AGGREGATE_CONFLICT" }],
    });
    expect(() => store.readTicket("TKT-0002")).toThrow("not found");
    expect(store.readTicket("TKT-0003")).toEqual(valid.ticket);
  });

  it("durably records an explicit skip and completes a partial import after restart", () => {
    const root = temporaryRoot();
    const path = join(root, "operational.sqlite");
    let store = OperationalSqliteStore.open(path);
    stores.push(store);
    store.initialize();
    const conflicting = aggregate({ sourceId: "legacy-conflict" });
    store.transaction((unit) => unit.insertTicket({ ...conflicting.ticket, subject: "Conflict" }));
    importOperationalData({ store, aggregates: [conflicting] });

    recordImportSkip({
      store,
      resolution: {
        sourceId: "legacy-conflict",
        reason: "Operator confirmed the existing native aggregate is authoritative.",
        actor: "migration-owner",
        resolvedAt: "2026-08-11T09:00:00.000Z",
        commandId: "30000000-0000-4000-8000-000000000001",
        correlationId: "30000000-0000-4000-8000-000000000002",
      },
    });
    expect(store.readImportState()).toBe("imported");
    expect(store.listImportResolutions()).toEqual([{
      sourceId: "legacy-conflict",
      reason: "Operator confirmed the existing native aggregate is authoritative.",
      actor: "migration-owner",
      resolvedAt: "2026-08-11T09:00:00.000Z",
      commandId: "30000000-0000-4000-8000-000000000001",
      correlationId: "30000000-0000-4000-8000-000000000002",
    }]);

    store.close();
    stores.splice(stores.indexOf(store), 1);
    store = OperationalSqliteStore.open(path);
    stores.push(store);
    store.initialize();
    expect(store.readImportState()).toBe("imported");
    expect(store.listImportResolutions()).toHaveLength(1);
    expect(() => recordImportSkip({
      store,
      resolution: {
        sourceId: "legacy-conflict",
        reason: "A conflicting second resolution must not replace history.",
        actor: "migration-owner",
        resolvedAt: "2026-08-11T10:00:00.000Z",
        commandId: "30000000-0000-4000-8000-000000000001",
        correlationId: "30000000-0000-4000-8000-000000000003",
      },
    })).toThrow(/already recorded/i);
  });

  it("rejects unsafe source trace history before any aggregate write", () => {
    const store = openStore();
    const source = aggregate() as unknown as Record<string, unknown>;
    source.traces = [{
      id: "40000000-0000-4000-8000-000000000001",
      operationalEventId: "10000000-0000-4000-8000-000000000001",
      ticketId: "TKT-0001",
      occurredAt: "2026-08-10T12:00:00.000Z",
      actor: "legacy-agent-a",
      traceType: "provider-telemetry",
      provider: "openai",
      status: "used",
      fallbackReason: "hidden reasoning: secret",
    }];

    const report = validateImport({ store, aggregates: [source] });
    expect(report.valid).toBe(false);
    expect(report.aggregates).toMatchObject([{ sourceId: "legacy-ticket-TKT-0001", status: "invalid" }]);
    const summary = importOperationalData({ store, aggregates: [source] });
    expect(summary).toMatchObject({ state: "import-in-progress", importedSourceIds: [], invalid: [{ sourceId: "legacy-ticket-TKT-0001" }] });
    expect(() => store.readTicket("TKT-0001")).toThrow("not found");
  });

  it("initializes only an empty native database and refuses recognizable legacy files", () => {
    const store = openStore();
    const root = temporaryRoot();
    const legacyFile = join(root, "events.jsonl");
    writeFileSync(legacyFile, "{}\n", "utf8");

    expect(() => initializeOperationalNative({ store, legacyPaths: [legacyFile] }))
      .toThrow(/legacy operational files.*import/i);
    expect(store.readImportState()).toBe("empty");

    rmSync(legacyFile);
    initializeOperationalNative({ store, legacyPaths: [legacyFile] });
    expect(store.readImportState()).toBe("native");
    const runtimeStore = createRuntimeOperationalStore(store);
    runtimeStore.transaction((unit) => unit.insertTicket(ticket("TKT-0003")));
    expect(runtimeStore.readTicket("TKT-0003").id).toBe("TKT-0003");
    expect(() => initializeOperationalNative({ store, legacyPaths: [] })).toThrow(/only.*empty/i);
  });

  it("makes the native package CLI discover the TicketRepository tickets.json source", () => {
    const root = temporaryRoot();
    const dataRoot = join(root, "runtime");
    const databasePath = join(root, "operational.sqlite");
    mkdirSync(dataRoot, { recursive: true });
    writeFileSync(join(dataRoot, "tickets.json"), "[]\n", "utf8");

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "src", "operational", "import.js"), "initialize-native"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          TRIAGE_DATA_ROOT: dataRoot,
          OPERATIONAL_DB_PATH: databasePath,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/legacy operational files.*import/i);
    const store = OperationalSqliteStore.open(databasePath);
    stores.push(store);
    store.initialize();
    expect(store.readImportState()).toBe("empty");
  });
});

function openStore(): OperationalSqliteStore {
  const root = temporaryRoot();
  const store = OperationalSqliteStore.open(join(root, "operational.sqlite"));
  stores.push(store);
  store.initialize();
  return store;
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "triage-operational-import-"));
  roots.push(root);
  return root;
}

function ticket(id: "TKT-0001" | "TKT-0002" | "TKT-0003") {
  return TicketSchema.parse({
    id,
    revision: 2,
    customer: { name: "Northstar", plan: "enterprise", region: "eu", vip: false },
    requester: { name: "Ari", role: "Engineer", department: "Platform", technicalLevel: "technical", seniority: "manager" },
    subject: "Legacy API incident",
    description: "Accepted API requests are delayed.",
    status: "in-progress",
    category: "api",
    priority: "P2",
    team: "api-platform",
    assignee: "legacy-agent@example.test",
    tags: ["api", "legacy"],
    relatedTicketIds: [],
    sla: { responseDueAt: "2026-08-12T00:00:00.000Z", breached: false },
    createdAt: "2026-08-10T08:00:00.000Z",
    updatedAt: "2026-08-10T11:00:00.000Z",
  });
}

function aggregate(options: {
  sourceId?: string;
  ticketId?: "TKT-0001" | "TKT-0002" | "TKT-0003";
  recommendationId?: string;
  eventIds?: readonly [string, string];
  commandIds?: readonly [string, string];
} = {}): OperationalImportAggregate {
  const ticketId = options.ticketId ?? "TKT-0001";
  const recommendationId = options.recommendationId ?? "10000000-0000-4000-8000-000000000011";
  const eventIds = options.eventIds ?? [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
  ];
  const commandIds = options.commandIds ?? [
    "10000000-0000-4000-8000-000000000021",
    "10000000-0000-4000-8000-000000000022",
  ];
  const sourceTicket = ticket(ticketId);
  const recommendation = TriageRecommendationSchema.parse({
    id: recommendationId,
    ticketId,
    sourceRevision: 1,
    category: "api",
    priority: "P2",
    team: "api-platform",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "possible",
    missingInformation: [],
    knowledgeArticleIds: ["api-reference"],
    draftCustomerResponse: "We are investigating the accepted request delay.",
    rationale: "Legacy operator evaluation.",
    confidence: 0.9,
    recommendedNextAction: "Inspect the delayed request.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "approved",
    createdAt: "2026-08-10T12:00:00.000Z",
  });
  return {
    sourceId: options.sourceId ?? `legacy-ticket-${ticketId}`,
    provenance: "legacy",
    ticket: sourceTicket,
    events: [
      {
        provenance: "legacy",
        id: eventIds[0],
        ticketId,
        occurredAt: "2026-08-10T12:00:00.000Z",
        actor: "legacy-agent-a",
        action: "recommendation-submitted",
        commandId: commandIds[0],
        facts: { reasonCode: "legacy-import" },
      },
      {
        provenance: "legacy",
        id: eventIds[1],
        ticketId,
        occurredAt: "2026-08-10T11:00:00.000Z",
        actor: "legacy-agent-b",
        action: "ticket-updated",
        commandId: commandIds[1],
        facts: { reasonCode: "legacy-import", revision: 2 },
      },
    ],
    ticketRevisions: [{
      ticketId,
      revision: 2,
      ticket: sourceTicket,
      operationalEventId: eventIds[1],
      createdAt: "2026-08-10T11:00:00.000Z",
    }],
    messages: [],
    recommendations: [recommendation],
    recommendationRevisions: [{
      recommendation,
      operationalEventId: eventIds[0],
      createdAt: "2026-08-10T12:00:00.000Z",
    }],
    diagnoses: [],
    traces: [],
  };
}
