import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createRuntimeDependencies, parseRetrievalMode } from "../src/runtime.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { TicketSchema } from "../src/domain.js";
import { evaluateTicketCommand } from "../src/evaluation-command.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTriageServer } from "../src/server.js";
import { openReliabilityRuntime } from "./reliability-runtime-fixture.js";

describe("retrieval runtime configuration", () => {
  it("defaults to shadow and accepts the explicit off comparison mode", () => {
    expect(parseRetrievalMode({})).toBe("shadow");
    expect(parseRetrievalMode({ TRIAGE_RETRIEVAL_MODE: "off" })).toBe("off");
    expect(parseRetrievalMode({ TRIAGE_RETRIEVAL_MODE: "shadow" })).toBe("shadow");
  });

  it("rejects unsupported retrieval modes instead of silently changing authority", () => {
    expect(() => parseRetrievalMode({ TRIAGE_RETRIEVAL_MODE: "live" })).toThrow(
      "TRIAGE_RETRIEVAL_MODE must be off or shadow.",
    );
  });

  it("constructs the observer in shadow mode and leaves it absent when off", async () => {
    const root = mkdtempSync(join(tmpdir(), "triage-b3-runtime-"));
    const env = {
      TRIAGE_DATA_ROOT: root,
      TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
      TRIAGE_RETRIEVAL_MODE: "off",
    };
    const off = await createRuntimeDependencies({ env });
    expect(off.retrievalObserver).toBeUndefined();
    await off.close();
    const shadow = await createRuntimeDependencies({ env: { ...env, TRIAGE_RETRIEVAL_MODE: "shadow" } });
    expect(shadow.retrievalObserver).toBeDefined();
    await shadow.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("validates an existing retrieval index before publishing startup reconciliation", async () => {
    const root = mkdtempSync(join(tmpdir(), "triage-b3-runtime-validate-"));
    const validate = vi.spyOn(RetrievalStore.prototype, "validate");
    const env = {
      TRIAGE_DATA_ROOT: root,
      TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
      TRIAGE_RETRIEVAL_MODE: "shadow",
    };
    try {
      const runtime = await createRuntimeDependencies({ env });
      expect(validate).toHaveBeenCalled();
      await runtime.close();
    } finally {
      validate.mockRestore();
      try { rmSync(root, { recursive: true, force: true }); } catch { /* Windows may release SQLite handles after the test turn. */ }
    }
  });

  it("keeps runtime commands available and preserves an integrity trace when startup finds a corrupt retrieval index", async () => {
    const root = mkdtempSync(join(tmpdir(), "triage-b3-runtime-corrupt-"));
    const path = join(root, "retrieval.sqlite");
    const corrupted = RetrievalStore.open(path);
    corrupted.initialize();
    const raw = (corrupted as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    raw.prepare("UPDATE retrieval_index_metadata SET value=? WHERE key='corpusHash'").run("not-a-hash");
    corrupted.close();
    const runtime = await createRuntimeDependencies({ env: { TRIAGE_DATA_ROOT: root, TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"), TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"), TRIAGE_RETRIEVAL_MODE: "shadow" } });
    try {
      await runtime.retrievalObserver!.observe({ queryText: "test", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-corrupt-startup");
      expect(runtime.retrievalObserver!.recent()[0]).toMatchObject({ failureCode: "INDEX_INTEGRITY_ERROR" });
    } finally {
      await runtime.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps normal runtime available when retrieval provider configuration is invalid", async () => {
    const root = mkdtempSync(join(tmpdir(), "triage-b3-runtime-invalid-"));
    const env = {
      TRIAGE_DATA_ROOT: root,
      TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
      TRIAGE_RETRIEVAL_MODE: "shadow",
      TRIAGE_EMBEDDING_MODEL: "configured-without-provider-tuple",
    };
    const runtime = await createRuntimeDependencies({ env });
    expect(runtime.retrievalObserver).toBeDefined();
    await expect(runtime.retrievalObserver!.observe({ queryText: "test", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, "cmd-invalid-provider")).resolves.toBeUndefined();
    await runtime.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("preserves the authoritative evaluation result when shadow observation fails", async () => {
    const ticket = TicketSchema.parse({
      id: "TKT-0001",
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
      customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
      subject: "Accepted API requests are delayed",
      description: "Accepted requests remain absent from the profile timeline.",
      status: "triage",
      category: "api",
      priority: "P2",
      team: "api-platform",
      tags: ["api", "delay"],
      sla: { responseDueAt: "2026-09-12T04:00:00.000Z", breached: false },
      relatedTicketIds: [],
      revision: 0,
    });
    const dispatcher = {
      async run(definition: any, raw: unknown, commandId: string) {
        const parsed = definition.parse(raw);
        const prepared = await definition.prepare(parsed);
        const committed = definition.commit({}, prepared, commandId);
        return definition.replay({}, committed, commandId);
      },
    };
    const service = {
      commitOperationalEvaluation: () => ({ committed: true, authority: "unchanged" }),
      replayOperationalEvaluation: (_reader: unknown, result: unknown) => result,
    };
    const base = {
      dispatcher,
      service,
      tickets: { get: async () => ticket },
      audits: { list: async () => [] },
      knowledge: { list: async () => [] },
      knowledgeEvolution: { listReusableApproved: async () => ({ status: "available", contexts: [], issues: [] }) },
      now: () => new Date("2026-09-12T00:00:00.000Z"),
      env: {},
    } as any;
    const offResult = await evaluateTicketCommand(base, { ticketId: ticket.id, aiPreference: "deterministic", responseStyle: "auto" }, "40000000-0000-4000-8000-000000000001");
    let observed = 0;
    let reported = 0;
    const shadowResult = await evaluateTicketCommand({ ...base, retrievalObserver: { observe: async () => { observed += 1; throw new Error("shadow failure"); }, reportFailure: () => { reported += 1; }, recent: () => [], close: async () => undefined } }, { ticketId: ticket.id, aiPreference: "deterministic", responseStyle: "auto" }, "40000000-0000-4000-8000-000000000002");
    await vi.waitFor(() => {
      expect(observed).toBe(1);
      expect(reported).toBe(1);
    });
    expect(shadowResult).toEqual(offResult);
  });

  it("does not hold a committed evaluation open for shadow observation", async () => {
    const ticket = TicketSchema.parse({
      id: "TKT-0002", createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z",
      customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
      subject: "Accepted API requests are delayed", description: "Accepted requests remain absent from the profile timeline.",
      status: "triage", category: "api", priority: "P2", team: "api-platform", tags: ["api", "delay"],
      sla: { responseDueAt: "2026-09-12T04:00:00.000Z", breached: false }, relatedTicketIds: [], revision: 0,
    });
    let observationStarted!: () => void;
    let releaseObservation!: () => void;
    const started = new Promise<void>((resolve) => { observationStarted = resolve; });
    const released = new Promise<void>((resolve) => { releaseObservation = resolve; });
    const base = {
      dispatcher: { async run(definition: any, raw: unknown, commandId: string) { const parsed = definition.parse(raw); const prepared = await definition.prepare(parsed); return definition.replay({}, definition.commit({}, prepared, commandId), commandId); } },
      service: { commitOperationalEvaluation: () => ({ committed: true }), replayOperationalEvaluation: (_reader: unknown, result: unknown) => result },
      tickets: { get: async () => ticket }, audits: { list: async () => [] }, knowledge: { list: async () => [] },
      knowledgeEvolution: { listReusableApproved: async () => ({ status: "available", contexts: [], issues: [] }) }, now: () => new Date("2026-09-12T00:00:00.000Z"), env: {},
      retrievalObserver: { observe: async () => { observationStarted(); await released; }, recent: () => [], close: async () => undefined },
    } as any;

    const command = evaluateTicketCommand(base, { ticketId: ticket.id, aiPreference: "deterministic", responseStyle: "auto" }, "40000000-0000-4000-8000-000000000003");
    await started;
    const completion = await Promise.race([command.then(() => "committed"), new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 0))]);
    expect(completion).toBe("committed");
    releaseObservation();
  });

  it("observes the evaluation basis captured before the commit can advance ticket state", async () => {
    const ticket = TicketSchema.parse({
      id: "TKT-0003", createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z",
      customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
      subject: "Original customer subject", description: "Original customer description.", status: "triage", category: "api", priority: "P2", team: "api-platform", tags: ["api"],
      sla: { responseDueAt: "2026-09-12T04:00:00.000Z", breached: false }, relatedTicketIds: [], revision: 0,
    });
    let observedQuery = "";
    const base = {
      dispatcher: { async run(definition: any, raw: unknown, commandId: string) { const parsed = definition.parse(raw); const prepared = await definition.prepare(parsed); const committed = definition.commit({}, prepared, commandId); ticket.subject = "Later operational subject"; return definition.replay({}, committed, commandId); } },
      service: { commitOperationalEvaluation: () => ({ committed: true }), replayOperationalEvaluation: (_reader: unknown, result: unknown) => result },
      tickets: { get: async () => ticket }, audits: { list: async () => [] }, knowledge: { list: async () => [] },
      knowledgeEvolution: { listReusableApproved: async () => ({ status: "available", contexts: [], issues: [] }) }, now: () => new Date("2026-09-12T00:00:00.000Z"), env: {},
      retrievalObserver: { observe: async (query: { queryText: string }) => { observedQuery = query.queryText; }, recent: () => [], close: async () => undefined },
    } as any;

    await evaluateTicketCommand(base, { ticketId: ticket.id, aiPreference: "deterministic", responseStyle: "auto" }, "40000000-0000-4000-8000-000000000004");
    await vi.waitFor(() => expect(observedQuery).not.toBe(""));
    expect(observedQuery).toContain("Original customer subject");
    expect(observedQuery).not.toContain("Later operational subject");
  });

  it("keeps HTTP and MCP evaluation authority identical while shadow observation is advisory", async () => {
    const off = await openReliabilityRuntime({ environment: { TRIAGE_RETRIEVAL_MODE: "off" } });
    const shadow = await openReliabilityRuntime({ environment: { TRIAGE_RETRIEVAL_MODE: "shadow" } });
    const input = { actor: "approval-desk", aiPreference: "deterministic" };
    const offCommandId = randomUUID();
    const shadowCommandId = randomUUID();
    const server = createTriageServer(shadow.runtime);
    const client = new Client({ name: "retrieval-shadow-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const [offResult, shadowResult] = await Promise.all([
        off.post("/api/tickets/TKT-1010/recommendations", input, offCommandId),
        shadow.post("/api/tickets/TKT-1010/recommendations", input, shadowCommandId),
      ]);
      const replay = await client.callTool({ name: "evaluate_ticket", arguments: { commandId: shadowCommandId, ticketId: "TKT-1010", ...input } });

      expect(offResult.status).toBe(201);
      expect(shadowResult.status).toBe(201);
      expect((replay.structuredContent as { recommendation: unknown }).recommendation).toEqual(shadowResult.body.recommendation);
      const withoutIdentity = ({ id: _id, commandId: _commandId, ...value }: any) => value;
      expect(withoutIdentity(offResult.body.recommendation as any)).toEqual(withoutIdentity(shadowResult.body.recommendation as any));
      await vi.waitFor(() => expect(shadow.runtime.retrievalObserver?.recent()).toHaveLength(1));
      expect(off.runtime.retrievalObserver).toBeUndefined();
      expect((off.runtime.operationalStore as any).readWorkflowSnapshot("TKT-1010").events.map(withoutIdentity))
        .toEqual((shadow.runtime.operationalStore as any).readWorkflowSnapshot("TKT-1010").events.map(withoutIdentity));
      expect((off.runtime.operationalStore as any).readCommandReceipt(offCommandId).requestHash)
        .toEqual((shadow.runtime.operationalStore as any).readCommandReceipt(shadowCommandId).requestHash);
    } finally {
      await Promise.allSettled([client.close(), server.close(), off.close(), shadow.close()]);
    }
  });
});
