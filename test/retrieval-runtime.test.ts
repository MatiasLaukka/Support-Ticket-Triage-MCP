import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createRuntimeDependencies, parseRetrievalMode } from "../src/runtime.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { TicketSchema } from "../src/domain.js";
import { evaluateTicketCommand } from "../src/evaluation-command.js";

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
    const shadowResult = await evaluateTicketCommand({ ...base, retrievalObserver: { observe: async () => { observed += 1; throw new Error("shadow failure"); }, recent: () => [], close: async () => undefined } }, { ticketId: ticket.id, aiPreference: "deterministic", responseStyle: "auto" }, "40000000-0000-4000-8000-000000000002");
    expect(observed).toBe(1);
    expect(shadowResult).toEqual(offResult);
  });
});
