import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import { openReliabilityRuntime } from "./reliability-runtime-fixture.js";
import {
  createControlledClassificationProvider,
  createControlledDraftProvider,
} from "../src/approval-desk/controlled-evaluation-providers.js";
import type { ClassificationReasoningProvider } from "../src/approval-desk/classification-reasoning-provider.js";
import type { TaxonomyReasoningProvider } from "../src/taxonomy-reasoning-provider.js";
import { OperationalUnitOfWork } from "../src/operational/unit-of-work.js";
import { canonicalRequestHashV2 } from "../src/operational/idempotency.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTriageServer } from "../src/server.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { TicketSchema } from "../src/domain.js";

const activeRuntimes: Array<{ close(): Promise<void> }> = [];
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(activeRuntimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("reliability command replay", () => {
  it("persists advisory taxonomy atomically and does not call its provider on replay", async () => {
    let taxonomyCalls = 0;
    const taxonomyReasoningProvider: TaxonomyReasoningProvider = {
      async reason() {
        taxonomyCalls += 1;
        return {
          candidate: {
            primaryProductSurface: { domain: "messaging", area: "sms" },
            secondaryProductSurfaces: [],
            problemClasses: ["expected-behavior"],
          },
          rationale: "The ticket identifies a messaging surface.",
          telemetry: { model: "taxonomy-test-model", latencyMs: 1 },
        };
      },
    };
    const harness = await openReliabilityRuntime({ taxonomyReasoningProvider });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = {
      actor: "approval-desk",
      aiPreference: "auto",
      taxonomyPreference: "gpt-preferred",
    };

    const first = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    const snapshot = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1010");
    const retry = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(taxonomyCalls).toBe(1);
    expect(snapshot.diagnosticTaxonomyRevisions).toHaveLength(1);
    expect(snapshot.diagnosticTaxonomyRevisions[0]?.context.basis.source).toBe("initial-classification");
    expect(snapshot.recommendationRevisions.at(-1)?.recommendation.aiExecutionTrace?.taxonomy)
      .toMatchObject({ status: "used", canonicalSource: "gpt", model: "taxonomy-test-model" });
    const taxonomyEvent = snapshot.events
      .filter(({ commandId }) => commandId === key && commandId !== undefined)
      .some(({ action }) => action === "diagnostic-taxonomy-revised");
    expect(taxonomyEvent).toBe(true);
    expect((harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1010").events)
      .toEqual(snapshot.events);
  });

  it("does not create a taxonomy revision for order-only candidate changes", async () => {
    let call = 0;
    const taxonomyReasoningProvider: TaxonomyReasoningProvider = {
      async reason() {
        call += 1;
        const secondaryProductSurfaces = call === 1
          ? [
              { domain: "customer-data" as const, area: "profiles" as const },
              { domain: "automation" as const, area: "flows" as const },
            ]
          : [
              { domain: "automation" as const, area: "flows" as const },
              { domain: "customer-data" as const, area: "profiles" as const },
            ];
        return {
          candidate: {
            primaryProductSurface: { domain: "messaging" as const, area: "sms" as const },
            secondaryProductSurfaces,
            problemClasses: call === 1
              ? ["expected-behavior" as const, "degraded-performance" as const]
              : ["degraded-performance" as const, "expected-behavior" as const],
          },
          rationale: "The ticket identifies a messaging surface.",
          telemetry: { model: "taxonomy-test-model", latencyMs: 1 },
        };
      },
    };
    const harness = await openReliabilityRuntime({ taxonomyReasoningProvider });
    activeRuntimes.push(harness);
    const first = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto", taxonomyPreference: "gpt-preferred" },
      randomUUID(),
    );
    const second = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto", taxonomyPreference: "gpt-preferred" },
      randomUUID(),
    );
    const snapshot = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1010");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(call).toBe(2);
    expect(snapshot.diagnosticTaxonomyRevisions).toHaveLength(1);
  });

  it("replays evaluation after time and runtime advance", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "approval-desk", aiPreference: "deterministic" };

    const first = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(first.status).toBe(201);
    harness.advance(60_000);
    const retry = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(retry.status).toBe(201);
    expect(retry.body.recommendation).toEqual(first.body.recommendation);
    await harness.restart();
    const restarted = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(restarted.body.recommendation).toEqual(first.body.recommendation);
    expect((await harness.runtime.recommendations.list())
      .filter((recommendation) => recommendation.ticketId === "TKT-1010")).toHaveLength(1);
  });

  it("preserves pre-B2 v2 identity for omitted and equivalent taxonomy preference", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const key = randomUUID();
    const first = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
      key,
    );
    const receipt = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readCommandReceipt(key);
    expect(first.status).toBe(201);
    expect(receipt?.requestHash).toBe(canonicalRequestHashV2("evaluate-ticket", {
      ticketId: "TKT-1010",
      actor: "approval-desk",
      responseStyle: "auto",
      aiPreference: "deterministic",
      customerReplies: [],
    }));
    const equivalent = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic", taxonomyPreference: "deterministic" },
      key,
    );
    expect(equivalent.status).toBe(201);
    expect(equivalent.body.recommendation).toEqual(first.body.recommendation);
  });

  it("does not call providers again for a committed replay", async () => {
    const classification = createControlledClassificationProvider();
    const drafting = createControlledDraftProvider();
    let classificationCalls = 0;
    let draftingCalls = 0;
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: {
        async reason(input) {
          classificationCalls += 1;
          return classification.reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          draftingCalls += 1;
          return drafting.draft(input);
        },
      },
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "approval-desk", aiPreference: "auto" };
    const first = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    const retry = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.recommendation).toEqual(first.body.recommendation);
    expect(classificationCalls).toBe(1);
    expect(draftingCalls).toBe(1);
  });

  it("rejects a changed HTTP body for a committed key before provider work or mutation", async () => {
    let providerCalls = 0;
    const classification = createControlledClassificationProvider();
    const drafting = createControlledDraftProvider();
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: {
        async reason(input) {
          providerCalls += 1;
          return classification.reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          providerCalls += 1;
          return drafting.draft(input);
        },
      },
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const first = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto" },
      key,
    );
    const snapshot = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1010");
    const callsAfterFirst = providerCalls;
    const conflict = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto", responseStyle: "concise" },
      key,
    );

    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(providerCalls).toBe(callsAfterFirst);
    expect((harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1010")).toEqual(snapshot);
  });

  it("rejects a changed MCP body for a committed key before provider work or mutation", async () => {
    let providerCalls = 0;
    const classification = createControlledClassificationProvider();
    const drafting = createControlledDraftProvider();
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const server = createTriageServer({
      ...harness.runtime,
      classificationReasoningProvider: {
        async reason(input) {
          providerCalls += 1;
          return classification.reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          providerCalls += 1;
          return drafting.draft(input);
        },
      },
    });
    const client = new Client({ name: "reliability-mcp-changed", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const key = randomUUID();
      const first = await client.callTool({
        name: "evaluate_ticket",
        arguments: { commandId: key, ticketId: "TKT-1010", actor: "approval-desk", aiPreference: "auto" },
      });
      const snapshot = (harness.runtime.operationalStore as OperationalSqliteStore)
        .readWorkflowSnapshot("TKT-1010");
      const callsAfterFirst = providerCalls;
      const conflict = await client.callTool({
        name: "evaluate_ticket",
        arguments: {
          commandId: key,
          ticketId: "TKT-1010",
          actor: "approval-desk",
          aiPreference: "auto",
          responseStyle: "concise",
        },
      });

      expect(first.isError).not.toBe(true);
      expect(conflict.isError).toBe(true);
      expect(JSON.stringify(conflict.content)).toContain("IDEMPOTENCY_CONFLICT");
      expect(providerCalls).toBe(callsAfterFirst);
      expect((harness.runtime.operationalStore as OperationalSqliteStore)
        .readWorkflowSnapshot("TKT-1010")).toEqual(snapshot);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("rejects an HTTP reuse of a version-1 receipt before provider work or mutation", async () => {
    let providerCalls = 0;
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: {
        async reason(input) {
          providerCalls += 1;
          return createControlledClassificationProvider().reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          providerCalls += 1;
          return createControlledDraftProvider().draft(input);
        },
      },
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    insertLegacyEvaluationReceipt(harness.root, key);
    const before = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1010");

    const response = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto" },
      key,
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: "LEGACY_REPLAY_UNAVAILABLE" });
    expect(providerCalls).toBe(0);
    expect((harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1010")).toEqual(before);
  });

  it("rejects an MCP reuse of a version-1 receipt before provider work or mutation", async () => {
    let providerCalls = 0;
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const server = createTriageServer({
      ...harness.runtime,
      classificationReasoningProvider: {
        async reason(input) {
          providerCalls += 1;
          return createControlledClassificationProvider().reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          providerCalls += 1;
          return createControlledDraftProvider().draft(input);
        },
      },
    });
    const client = new Client({ name: "reliability-mcp-legacy", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const key = randomUUID();
      insertLegacyEvaluationReceipt(harness.root, key);
      const before = (harness.runtime.operationalStore as OperationalSqliteStore)
        .readWorkflowSnapshot("TKT-1010");
      const response = await client.callTool({
        name: "evaluate_ticket",
        arguments: { commandId: key, ticketId: "TKT-1010", actor: "approval-desk", aiPreference: "auto" },
      });

      expect(response.isError).toBe(true);
      expect(JSON.stringify(response.content)).toContain("LEGACY_REPLAY_UNAVAILABLE");
      expect(providerCalls).toBe(0);
      expect((harness.runtime.operationalStore as OperationalSqliteStore)
        .readWorkflowSnapshot("TKT-1010")).toEqual(before);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("keeps legacy rejection and v2 replay stable across a runtime restart", async () => {
    let providerCalls = 0;
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: {
        async reason(input) {
          providerCalls += 1;
          return createControlledClassificationProvider().reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          providerCalls += 1;
          return createControlledDraftProvider().draft(input);
        },
      },
    });
    activeRuntimes.push(harness);
    const legacyKey = randomUUID();
    insertLegacyEvaluationReceipt(harness.root, legacyKey);
    const legacyInput = { actor: "approval-desk", aiPreference: "auto" };

    const legacyBeforeRestart = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      legacyInput,
      legacyKey,
    );
    expect(legacyBeforeRestart.status).toBe(409);
    await harness.restart();
    const legacyAfterRestart = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      legacyInput,
      legacyKey,
    );
    expect(legacyAfterRestart.status).toBe(409);
    expect(legacyAfterRestart.body.error).toMatchObject({ code: "LEGACY_REPLAY_UNAVAILABLE" });
    expect(providerCalls).toBe(0);

    const v2Key = randomUUID();
    const committed = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
      v2Key,
    );
    const receipt = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readCommandReceipt(v2Key);
    await harness.restart();
    const replay = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
      v2Key,
    );

    expect(committed.status).toBe(201);
    expect(receipt?.requestHashVersion).toBe(2);
    expect(replay.status).toBe(201);
    expect(replay.body.recommendation).toEqual(committed.body.recommendation);
  });

  it("preserves populated v3 history, revisions, receipt, and outbox bytes during v4 migration", async () => {
    const root = await mkdtemp(join(tmpdir(), "triage-r1-v3-migration-"));
    temporaryRoots.push(root);
    const path = join(root, "operational.sqlite");
    const initialized = OperationalSqliteStore.open(path);
    initialized.initialize();
    initialized.close();

    const ticketId = "TKT-1010";
    const eventId = "a1000000-0000-4000-8000-000000000001";
    const recommendationId = "a2000000-0000-4000-8000-000000000001";
    const receiptId = "a3000000-0000-4000-8000-000000000001";
    const outboxId = "a4000000-0000-4000-8000-000000000001";
    const deliveryKey = "a5000000-0000-4000-8000-000000000001";
    const ticket = TicketSchema.parse({
      id: ticketId,
      createdAt: "2026-09-08T07:00:00.000Z",
      updatedAt: "2026-09-08T08:00:00.000Z",
      customer: { name: "Migration fixture", plan: "starter", region: "eu", vip: false },
      subject: "Migration fixture",
      description: "Representative populated v3 ticket.",
      status: "in-progress",
      tags: ["migration-fixture"],
      sla: { responseDueAt: "2026-09-08T12:00:00.000Z", breached: false },
      revision: 1,
    });
    const eventJson = JSON.stringify({ id: eventId, ticketId, sequence: 1, action: "ticket-updated" });
    const ticketRevisionJson = JSON.stringify({ ...ticket, revision: 1 });
    const recommendationJson = JSON.stringify({ id: recommendationId, ticketId, sourceRevision: 1 });
    const recommendationRevisionJson = JSON.stringify({ id: recommendationId, eventId, revision: 1 });
    const resultJson = JSON.stringify({ operation: "evaluate-ticket", tickets: [{ ticketId, operationalEventIds: [eventId], resultingRevision: 1 }] });
    const envelopeJson = JSON.stringify({
      operationalEventId: eventId,
      deliveryKey,
      eventType: "diagnosis-recorded",
      occurredAt: "2026-09-08T08:00:00.000Z",
      actor: "support-lead",
      ticketId,
      diagnosisId: "diagnosis-migration-fixture",
      evidenceIds: ["request-trace"],
      knowledgeArticleIds: ["api-reference"],
      provenance: "Representative populated v3 envelope.",
    });
    const beforeDatabase = new Database(path);
    beforeDatabase.exec("BEGIN");
    beforeDatabase.prepare("INSERT INTO tickets(id, revision, updated_at, payload_json) VALUES (?, ?, ?, ?)")
      .run(ticket.id, ticket.revision, ticket.updatedAt, JSON.stringify(ticket));
    beforeDatabase.prepare(`
      INSERT INTO operational_events(id, ticket_id, sequence, occurred_at, actor, action, command_id, facts_json, event_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, ticketId, 1, "2026-09-08T08:00:00.000Z", "support-lead", "ticket-updated", receiptId, JSON.stringify({ status: "in-progress" }), eventJson);
    beforeDatabase.prepare(`
      INSERT INTO ticket_revisions(ticket_id, revision, operational_event_id, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(ticketId, 1, eventId, "2026-09-08T08:00:00.000Z", ticketRevisionJson);
    beforeDatabase.prepare(`
      INSERT INTO recommendations(id, ticket_id, source_revision, resolution, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(recommendationId, ticketId, 1, "pending", "2026-09-08T08:00:00.000Z", recommendationJson);
    beforeDatabase.prepare(`
      INSERT INTO recommendation_revisions(recommendation_id, ticket_id, operational_event_id, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(recommendationId, ticketId, eventId, "2026-09-08T08:00:00.000Z", recommendationRevisionJson);
    beforeDatabase.prepare(`
      INSERT INTO command_idempotency(command_id, operation, request_hash, result_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(receiptId, "evaluate-ticket", "b".repeat(64), resultJson, "2026-09-08T08:00:00.000Z");
    beforeDatabase.prepare(`
      INSERT INTO learning_capture_outbox(id, operational_event_id, delivery_key, status, attempts, created_at, envelope_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(outboxId, eventId, deliveryKey, "pending", 0, "2026-09-08T08:00:00.000Z", envelopeJson);
    beforeDatabase.exec("COMMIT");
    const before = {
      events: beforeDatabase.prepare("SELECT id, ticket_id, sequence, occurred_at, actor, action, command_id, facts_json, event_json FROM operational_events").all(),
      ticketRevisions: beforeDatabase.prepare("SELECT ticket_id, revision, operational_event_id, created_at, payload_json FROM ticket_revisions").all(),
      recommendationRevisions: beforeDatabase.prepare("SELECT recommendation_id, ticket_id, operational_event_id, created_at, payload_json FROM recommendation_revisions").all(),
      receipts: beforeDatabase.prepare("SELECT command_id, operation, request_hash, result_json, created_at FROM command_idempotency").all(),
      outbox: beforeDatabase.prepare("SELECT id, operational_event_id, delivery_key, status, attempts, created_at, claimed_by, claimed_at, delivered_at, error_code, envelope_json FROM learning_capture_outbox").all(),
    };
    beforeDatabase.close();

    downgradeToV3(path);
    const migrated = OperationalSqliteStore.open(path);
    migrated.initialize();
    migrated.close();

    const afterDatabase = new Database(path, { readonly: true });
    try {
      expect(afterDatabase.prepare("SELECT value FROM operational_metadata WHERE key = 'schema_version'").get())
        .toEqual({ value: "4" });
      expect(afterDatabase.prepare("SELECT request_hash_version FROM command_idempotency WHERE command_id = ?").get(receiptId))
        .toEqual({ request_hash_version: 1 });
      expect({
        events: afterDatabase.prepare("SELECT id, ticket_id, sequence, occurred_at, actor, action, command_id, facts_json, event_json FROM operational_events").all(),
        ticketRevisions: afterDatabase.prepare("SELECT ticket_id, revision, operational_event_id, created_at, payload_json FROM ticket_revisions").all(),
        recommendationRevisions: afterDatabase.prepare("SELECT recommendation_id, ticket_id, operational_event_id, created_at, payload_json FROM recommendation_revisions").all(),
        receipts: afterDatabase.prepare("SELECT command_id, operation, request_hash, result_json, created_at FROM command_idempotency").all(),
        outbox: afterDatabase.prepare("SELECT id, operational_event_id, delivery_key, status, attempts, created_at, claimed_by, claimed_at, delivered_at, error_code, envelope_json FROM learning_capture_outbox").all(),
      }).toEqual(before);
    } finally {
      afterDatabase.close();
    }
  });

  it("shares the frozen evaluation preparation and replay across HTTP and MCP", async () => {
    const classification = createControlledClassificationProvider();
    const drafting = createControlledDraftProvider();
    let providerCalls = 0;
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: {
        async reason(input) {
          providerCalls += 1;
          return classification.reason(input);
        },
      },
      draftProvider: {
        async draft(input) {
          providerCalls += 1;
          return drafting.draft(input);
        },
      },
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const first = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto" },
      key,
    );
    const server = createTriageServer(harness.runtime);
    const client = new Client({ name: "reliability-mcp", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const replay = await client.callTool({
        name: "evaluate_ticket",
        arguments: {
          commandId: key,
          ticketId: "TKT-1010",
          actor: "approval-desk",
          aiPreference: "auto",
        },
      });
      expect(first.status).toBe(201);
      expect(replay.isError).not.toBe(true);
      expect((replay.structuredContent as { recommendation: unknown }).recommendation)
        .toEqual(first.body.recommendation);
      expect(providerCalls).toBe(2);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("joins same-key evaluations and conflicts on changed intent while preparation is in flight", async () => {
    const base = createControlledClassificationProvider();
    const entered = deferred();
    let calls = 0;
    const classification: ClassificationReasoningProvider = {
      async reason(input) {
        calls += 1;
        entered.resolve();
        await entered.releasePromise;
        return base.reason(input);
      },
    };
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "approval-desk", aiPreference: "auto" };
    const firstPromise = harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    await entered.reached;
    const joinedPromise = harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    const conflict = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { ...input, responseStyle: "concise" },
      key,
    );
    expect(conflict.status).toBe(409);
    expect((conflict.body.error as { code: string }).code).toBe("IDEMPOTENCY_CONFLICT");
    entered.release();
    const [first, joined] = await Promise.all([firstPromise, joinedPromise]);
    expect(first.status).toBe(201);
    expect(joined.status).toBe(201);
    expect(joined.body.recommendation).toEqual(first.body.recommendation);
    expect(calls).toBe(1);
  });

  it("uses the HTTP fallback evaluation guard when dependencies omit one", async () => {
    const base = createControlledClassificationProvider();
    const entered = deferred();
    let calls = 0;
    const classification: ClassificationReasoningProvider = {
      async reason(input) {
        calls += 1;
        if (calls === 1) {
          entered.resolve();
          await entered.releasePromise;
        }
        return base.reason(input);
      },
    };
    const harness = await openReliabilityRuntime({
      omitEvaluationGuard: true,
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    activeRuntimes.push(harness);
    const body = { actor: "approval-desk", aiPreference: "gpt-preferred" };
    const firstPromise = harness.post(
      "/api/tickets/TKT-1010/recommendations",
      body,
      randomUUID(),
    );
    await entered.reached;
    const second = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      body,
      randomUUID(),
    );
    entered.release();
    await expect(firstPromise).resolves.toMatchObject({ status: 201 });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: "EVALUATION_IN_PROGRESS" });
    expect(calls).toBe(1);
  });

  it("rejects an evaluation whose source gains a reply during provider work without a receipt", async () => {
    const base = createControlledClassificationProvider();
    const entered = deferred();
    const classification: ClassificationReasoningProvider = {
      async reason(input) {
        entered.resolve();
        await entered.releasePromise;
        return base.reason(input);
      },
    };
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    activeRuntimes.push(harness);
    const key = randomUUID();
    const evaluation = harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "auto" },
      key,
    );
    await entered.reached;
    const reply = await harness.post(
      "/api/tickets/TKT-1010/customer-replies",
      { actor: "Jamie Lee", body: "The issue is still failing." },
    );
    expect(reply.status).toBe(201);
    entered.release();
    const result = await evaluation;
    expect(result.status).toBe(409);
    expect((result.body.error as { code: string }).code).toBe("STALE_APPROVAL");
    const store = harness.runtime.operationalStore as typeof harness.runtime.operationalStore & {
      readCommandReceipt(commandId: string): unknown;
    };
    expect(store.readCommandReceipt(key)).toBeUndefined();
  });

  it("rolls back the write set when receipt persistence fails before commit", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const key = randomUUID();
    const persist = vi.spyOn(OperationalUnitOfWork.prototype, "persistCommandResult")
      .mockImplementationOnce(() => { throw new Error("injected receipt failure"); });
    try {
      const failed = await harness.post(
        "/api/tickets/TKT-1010/recommendations",
        { actor: "approval-desk", aiPreference: "deterministic" },
        key,
      );
      expect(failed.status).toBe(500);
    } finally {
      persist.mockRestore();
    }
    const store = harness.runtime.operationalStore as typeof harness.runtime.operationalStore & {
      readCommandReceipt(commandId: string): unknown;
    };
    expect(store.readCommandReceipt(key)).toBeUndefined();
    const retry = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
      key,
    );
    expect(retry.status).toBe(201);
  });

  it("replays the original immutable result after the ticket advances", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "approval-desk", aiPreference: "deterministic" };
    const first = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(first.status).toBe(201);
    const reply = await harness.post(
      "/api/tickets/TKT-1010/customer-replies",
      { actor: "Jamie Lee", body: "The issue is still failing." },
    );
    expect(reply.status).toBe(201);
    const replay = await harness.post("/api/tickets/TKT-1010/recommendations", input, key);
    expect(replay.status).toBe(201);
    expect(replay.body.recommendation).toEqual(first.body.recommendation);
  });

  it("allows two runtime instances to race provider work but commits one receipt and write set", async () => {
    const base = createControlledClassificationProvider();
    const entered = deferred();
    let providerCalls = 0;
    const classification: ClassificationReasoningProvider = {
      async reason(input) {
        providerCalls += 1;
        if (providerCalls === 2) entered.resolve();
        await entered.releasePromise;
        return base.reason(input);
      },
    };
    const harness = await openReliabilityRuntime({
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    activeRuntimes.push(harness);

    const secondRoot = await mkdtemp(join(tmpdir(), "triage-r1-second-"));
    const sharedStore = OperationalSqliteStore.open(join(harness.root, "operational.sqlite"));
    sharedStore.initialize();
    const secondRuntime = await createRuntimeDependencies({
      env: {
        TRIAGE_DATA_ROOT: secondRoot,
        TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
        TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
        OPERATIONAL_DB_PATH: join(harness.root, "operational.sqlite"),
      },
      operationalStore: sharedStore,
      now: () => new Date("2026-08-13T09:00:00.000Z"),
    });
    const secondServer = createApprovalDeskHttpServer(secondRuntime, {
      classificationReasoningProvider: classification,
      draftProvider: createControlledDraftProvider(),
    });
    await listen(secondServer);
    activeRuntimes.push({
      async close() {
        await closeServer(secondServer);
        await secondRuntime.close();
        await rm(secondRoot, { recursive: true, force: true });
      },
    });
    const address = secondServer.address();
    if (address === null || typeof address === "string") throw new Error("No second HTTP port");
    const key = randomUUID();
    const body = { actor: "approval-desk", aiPreference: "auto" };
    const first = harness.post("/api/tickets/TKT-1010/recommendations", body, key);
    const second = postToServer(address.port, "/api/tickets/TKT-1010/recommendations", body, key);
    await entered.reached;
    entered.release();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.status).toBe(201);
    expect(secondResult.status).toBe(201);
    expect(secondResult.body.recommendation).toEqual(firstResult.body.recommendation);
    expect(providerCalls).toBe(2);
    expect((await harness.runtime.recommendations.list())
      .filter((recommendation) => recommendation.ticketId === "TKT-1010")).toHaveLength(1);
  });
});

function deferred() {
  let resolveReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => { resolveReached = resolve; });
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  return {
    reached,
    releasePromise,
    release,
    resolve: resolveReached,
  };
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

async function postToServer(
  port: number,
  path: string,
  body: unknown,
  key: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function insertLegacyEvaluationReceipt(root: string, commandId: string): void {
  const database = new Database(join(root, "operational.sqlite"));
  try {
    database.prepare(`
      INSERT INTO command_idempotency(
        command_id, operation, request_hash, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      commandId,
      "evaluate-ticket",
      "c".repeat(64),
      JSON.stringify({
        operation: "evaluate-ticket",
        tickets: [{
          ticketId: "TKT-1010",
          operationalEventIds: ["33333333-3333-4333-8333-333333333338"],
          resultingRevision: null,
        }],
      }),
      "2026-09-05T10:00:00.000Z",
    );
  } finally {
    database.close();
  }
}

function downgradeToV3(databasePath: string): void {
  const database = new Database(databasePath);
  try {
    database.exec(`
      ALTER TABLE command_idempotency RENAME TO command_idempotency_v4;
      CREATE TABLE command_idempotency (
        command_id TEXT PRIMARY KEY NOT NULL,
        operation TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO command_idempotency(command_id, operation, request_hash, result_json, created_at)
      SELECT command_id, operation, request_hash, result_json, created_at
      FROM command_idempotency_v4;
      DROP TABLE command_idempotency_v4;
      CREATE INDEX command_idempotency_operation_idx ON command_idempotency(operation, command_id);
    `);
    database.prepare("DELETE FROM schema_migrations WHERE version > 3").run();
    database.prepare("UPDATE operational_metadata SET value = '3' WHERE key = 'schema_version'").run();
  } finally {
    database.close();
  }
}
