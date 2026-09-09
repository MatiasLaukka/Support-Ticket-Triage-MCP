import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { openReliabilityRuntime } from "./reliability-runtime-fixture.js";

const activeRuntimes: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(activeRuntimes.splice(0).map((runtime) => runtime.close()));
});

describe("reliability lifecycle command replay", () => {
  it("replays identical direct response commands and conflicts on changed response intent", async () => {
    const harness = await openReliabilityRuntime({ enableDemoInjectors: true });
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"] as ("customerResponse")[],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true as const,
      },
    );
    expect(approved.status).toBe(200);

    const commandId = randomUUID();
    const first = await harness.runtime.service.markResponseSent({
      ticketId: "TKT-1001",
      recommendationId: recommendation.id,
      actor: "reviewer",
      sentAt: "2026-08-13T09:00:00.000Z",
      customerResponse: recommendation.draftCustomerResponse,
    }, { commandId });
    await harness.restart();
    await expect(harness.runtime.service.markResponseSent({
      ticketId: "TKT-1001",
      recommendationId: recommendation.id,
      actor: "reviewer",
      sentAt: "2026-08-13T09:00:00.000Z",
      customerResponse: recommendation.draftCustomerResponse,
    }, { commandId })).resolves.toEqual(first);

    await expect(harness.runtime.service.markResponseSent({
      ticketId: "TKT-1001",
      recommendationId: recommendation.id,
      actor: "reviewer",
      sentAt: "2026-08-13T09:00:00.000Z",
      customerResponse: `${recommendation.draftCustomerResponse} Changed`,
    }, { commandId })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects a legacy lifecycle receipt before parsing the current result contract", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const commandId = randomUUID();
    const before = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1001");
    insertLegacyReceipt(harness.root, commandId, "mark-response-sent", {
      operation: "mark-response-sent",
      tickets: [{
        ticketId: "TKT-1001",
        operationalEventIds: [randomUUID()],
        resultingRevision: null,
      }],
    });

    await expect(harness.runtime.service.markResponseSent({
      ticketId: "TKT-1001",
      recommendationId: "10000000-0000-4000-8000-000000000001",
      actor: "reviewer",
      sentAt: "2026-08-13T09:00:00.000Z",
      customerResponse: "The issue is resolved.",
    }, { commandId })).rejects.toMatchObject({
      code: "LEGACY_REPLAY_UNAVAILABLE",
    });
    expect((harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1001")).toEqual(before);
  });

  it("keeps direct and workflow response commands distinct under one key", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
    );
    expect(approved.status).toBe(200);

    const commandId = randomUUID();
    await harness.runtime.service.markResponseSent({
      ticketId: "TKT-1001",
      recommendationId: recommendation.id,
      actor: "reviewer",
      sentAt: "2026-08-13T09:00:00.000Z",
      customerResponse: recommendation.draftCustomerResponse,
    }, { commandId });

    await expect(harness.runtime.service.markResponseSentFromWorkflow({
      ticketId: "TKT-1001",
      recommendationId: recommendation.id,
      actor: "reviewer",
      automaticReplyEnabled: false,
    }, { commandId })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("replays the original reply audit after later conversation activity", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const key = randomUUID();
    const input = { actor: "reviewer", body: "The campaign page is blank." };
    const path = "/api/tickets/TKT-1010/customer-replies";

    const first = await harness.post(path, input, key);
    const receipt = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readCommandReceipt(key);
    const later = await harness.post(path, {
      actor: "reviewer",
      body: "It is still blank.",
    });
    const replay = await harness.post(path, input, key);

    expect(first.status).toBe(201);
    expect(receipt?.requestHashVersion).toBe(2);
    expect(later.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.auditEvent).toEqual(first.body.auditEvent);
    const audits = await harness.runtime.audits.list("TKT-1010");
    expect(audits.filter((audit) => audit.action === "customer-reply-received"))
      .toHaveLength(2);
  });

  it("replays demo internal confirmation before deriving later diagnosis state", async () => {
    const harness = await openReliabilityRuntime({ enableDemoInjectors: true });
    activeRuntimes.push(harness);
    await harness.runtime.service.recordDiagnosis({
      ticketId: "TKT-1010",
      actor: "product-support",
      diagnosedAt: "2026-08-13T09:00:00.000Z",
      diagnosis: {
        status: "completed",
        causeType: "configuration",
        customerSafeSummary: "A configuration mismatch affects the campaign editor.",
        evidenceUsed: ["request-trace"],
        confidence: "likely",
        owner: "engineering",
        recommendedNextAction: "Apply the governed configuration update.",
        doNotSay: [],
      },
      knowledgeArticleIds: ["api-errors"],
    }, { commandId: randomUUID() });

    const commandId = randomUUID();
    const path = "/api/demo/tickets/TKT-1010/inject";
    const input = {
      action: "internal-confirmation",
      actor: "product-support",
      rationale: "The internal platform check confirms the diagnosis.",
    };
    const first = await harness.post(path, input, commandId);
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    await harness.runtime.service.addCustomerReply({
      ticketId: "TKT-1010",
      actor: "customer",
      body: "The same issue is still present.",
      receivedAt: "2026-08-13T09:01:00.000Z",
    }, { commandId: randomUUID() });

    const replay = await harness.post(path, input, commandId);
    expect(replay.status).toBe(201);
    expect(replay.body.auditEvent).toEqual(first.body.auditEvent);
    const audits = await harness.runtime.audits.list("TKT-1010");
    expect(audits.filter((audit) => audit.action === "diagnosis-reviewed")).toHaveLength(1);
  });

  it("rejects a lifecycle receipt whose audit event reference cannot be resolved", async () => {
    const harness = await openReliabilityRuntime({ enableDemoInjectors: true });
    activeRuntimes.push(harness);
    await harness.runtime.service.recordDiagnosis({
      ticketId: "TKT-1010",
      actor: "product-support",
      diagnosedAt: "2026-08-13T09:00:00.000Z",
      diagnosis: {
        status: "completed",
        causeType: "configuration",
        customerSafeSummary: "A configuration mismatch affects the campaign editor.",
        evidenceUsed: ["request-trace"],
        confidence: "likely",
        owner: "engineering",
        recommendedNextAction: "Apply the governed configuration update.",
        doNotSay: [],
      },
      knowledgeArticleIds: ["api-errors"],
    }, { commandId: randomUUID() });

    const commandId = randomUUID();
    const path = "/api/demo/tickets/TKT-1010/inject";
    const input = {
      action: "internal-confirmation",
      actor: "product-support",
      rationale: "The internal platform check confirms the diagnosis.",
    };
    const first = await harness.post(path, input, commandId);
    expect(first.status).toBe(201);

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as {
        tickets: Array<{ operationalEventIds: string[] }>;
        lifecycleAuditEvents: Array<{ id: string }>;
      };
      const missingEventId = randomUUID();
      receipt.tickets[0]!.operationalEventIds[0] = missingEventId;
      receipt.lifecycleAuditEvents[0]!.id = missingEventId;
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    const replay = await harness.post(path, input, commandId);
    expect(replay.status).toBe(500);
    expect(replay.body).toMatchObject({
      error: { code: "OPERATIONAL_INTEGRITY_ERROR" },
    });
    expect((harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1010").events
      .filter(({ action }) => action === "diagnosis-reviewed"))
      .toHaveLength(1);
  });

  it("rejects a receipt whose immutable reply reference no longer exists", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const commandId = randomUUID();
    const path = "/api/tickets/TKT-1010/customer-replies";
    const input = { actor: "reviewer", body: "The campaign page is blank." };

    const first = await harness.post(path, input, commandId);
    expect(first.status).toBe(201);

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as { messageId?: string };
      receipt.messageId = randomUUID();
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    const replay = await harness.post(path, input, commandId);
    expect(replay.status).toBe(500);
    expect(replay.body).toMatchObject({
      error: { code: "OPERATIONAL_INTEGRITY_ERROR" },
    });
  });

  it("uses a v2 receipt for recommendation approval", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1010/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const key = randomUUID();
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1010",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
      key,
    );
    const receipt = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readCommandReceipt(key);

    expect(approved.status).toBe(200);
    expect(receipt?.requestHashVersion).toBe(2);
  });

  it("resumes a persisted automatic-reply child after the parent committed", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
    );
    expect(approved.status).toBe(200);

    const parentCommandId = randomUUID();
    const markBody = {
      ticketId: "TKT-1001",
      actor: "reviewer",
    };
    const childFailure = vi
      .spyOn(harness.runtime.service, "addCustomerReply")
      .mockRejectedValueOnce(new Error("simulated child interruption"));
    const first = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      markBody,
      parentCommandId,
    );
    childFailure.mockRestore();

    expect(first.status).toBe(500);
    const beforeRestart = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1001");
    expect(beforeRestart.events.filter((event) => event.commandId === parentCommandId))
      .toHaveLength(1);
    expect(beforeRestart.messages.filter((message) => message.kind === "customer"))
      .toHaveLength(0);

    harness.advance(60_000);
    await harness.restart();

    const retry = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      markBody,
      parentCommandId,
    );
    expect(retry.status).toBe(200);
    expect(retry.body.automaticReply).toMatchObject({
      action: "customer-reply-received",
    });

    const replay = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      markBody,
      parentCommandId,
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(retry.body);
    const afterRetry = (harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1001");
    expect(afterRetry.events.filter((event) => event.commandId === parentCommandId))
      .toHaveLength(1);
    expect(afterRetry.events.filter((event) => event.action === "customer-reply-received"))
      .toHaveLength(1);
  });

  it("rejects a tampered automatic-reply enablement before resuming the child", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
    );
    expect(approved.status).toBe(200);

    const commandId = randomUUID();
    const childFailure = vi
      .spyOn(harness.runtime.service, "addCustomerReply")
      .mockRejectedValueOnce(new Error("simulated child interruption"));
    const first = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    childFailure.mockRestore();
    expect(first.status).toBe(500);

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as {
        automaticCustomerReplyEnabled?: boolean;
        automaticCustomerReplyIntent?: unknown;
      };
      receipt.automaticCustomerReplyEnabled = false;
      receipt.automaticCustomerReplyIntent = { kind: "none" };
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    const replay = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    expect(replay.status).toBe(500);
    expect(replay.body).toMatchObject({
      error: { code: "OPERATIONAL_INTEGRITY_ERROR" },
    });
    expect((harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1001").messages.filter(({ kind }) => kind === "customer"))
      .toHaveLength(0);
  });

  it("rejects a source snapshot tamper before dispatching an automatic-reply child", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
    );
    expect(approved.status).toBe(200);

    const commandId = randomUUID();
    const childFailure = vi
      .spyOn(harness.runtime.service, "addCustomerReply")
      .mockRejectedValueOnce(new Error("simulated child interruption"));
    const first = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    childFailure.mockRestore();
    expect(first.status).toBe(500);

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as {
        automaticCustomerReplyTicketSnapshot: { requester?: { name: string } };
        automaticCustomerReplyIntent?: { actor: string };
      };
      receipt.automaticCustomerReplyTicketSnapshot.requester!.name = "Tampered Actor";
      receipt.automaticCustomerReplyIntent!.actor = "Tampered Actor";
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    const replay = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    expect(replay.status).toBe(500);
    expect(replay.body).toMatchObject({
      error: { code: "OPERATIONAL_INTEGRITY_ERROR" },
    });
    expect((harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1001").messages.filter(({ kind }) => kind === "customer"))
      .toHaveLength(0);
  });

  it("treats automatic-reply enablement as command intent", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
    );
    expect(approved.status).toBe(200);

    const commandId = randomUUID();
    const path = `/api/recommendations/${recommendation.id}/mark-sent`;
    const disabled = await harness.post(path, {
      ticketId: "TKT-1001",
      actor: "reviewer",
      automaticReplyEnabled: false,
    }, commandId);
    expect(disabled.status).toBe(200);
    expect(disabled.body.automaticReply).toBeUndefined();

    const changedIntent = await harness.post(path, {
      ticketId: "TKT-1001",
      actor: "reviewer",
      automaticReplyEnabled: true,
    }, commandId);
    expect(changedIntent.status).toBe(409);
    expect((changedIntent.body as { error: { code: string } }).error.code)
      .toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects a persisted automatic-reply intent with a non-derived child key", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
    );
    expect(approved.status).toBe(200);

    const commandId = randomUUID();
    const sent = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    expect(sent.status).toBe(200);

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as { automaticCustomerReplyIntent?: { commandId?: string } };
      receipt.automaticCustomerReplyIntent!.commandId = randomUUID();
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    const replay = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    expect(replay.status).toBe(500);
    expect(replay.body).toMatchObject({
      error: { code: "OPERATIONAL_INTEGRITY_ERROR" },
    });
  });

  it("rejects an automatic-reply intent with altered ticket and payload before child dispatch", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
    );
    expect(approved.status).toBe(200);

    const commandId = randomUUID();
    const path = `/api/recommendations/${recommendation.id}/mark-sent`;
    const sent = await harness.post(
      path,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    expect(sent.status).toBe(200);

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as { automaticCustomerReplyIntent?: { ticketId?: string; body?: string } };
      receipt.automaticCustomerReplyIntent!.ticketId = "TKT-1010";
      receipt.automaticCustomerReplyIntent!.body = "Tampered reply payload.";
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    const replay = await harness.post(path, { ticketId: "TKT-1001", actor: "reviewer" }, commandId);
    expect(replay.status).toBe(500);
    expect(replay.body).toMatchObject({
      error: { code: "OPERATIONAL_INTEGRITY_ERROR" },
    });
  });

  it("rejects a parent receipt whose automatic-reply intent was removed", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const approved = await harness.post(
      `/api/recommendations/${recommendation.id}/approve`,
      {
        ticketId: "TKT-1001",
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        confirm: true,
      },
    );
    expect(approved.status).toBe(200);

    const commandId = randomUUID();
    const sent = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    expect(sent.status).toBe(200);

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as { automaticCustomerReplyIntent?: unknown };
      delete receipt.automaticCustomerReplyIntent;
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    const replay = await harness.post(
      `/api/recommendations/${recommendation.id}/mark-sent`,
      { ticketId: "TKT-1001", actor: "reviewer" },
      commandId,
    );
    expect(replay.status).toBe(500);
    expect(replay.body).toMatchObject({
      error: { code: "OPERATIONAL_INTEGRITY_ERROR" },
    });
  });

  it("rejects a composite receipt whose immutable pre-send references were removed", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1027/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const commandId = randomUUID();
    const input = {
      approval: {
        ticketId: "TKT-1027" as const,
        recommendationId: recommendation.id,
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"] as ("customerResponse")[],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        approvedAt: "2026-08-13T09:00:00.000Z",
        confirm: true as const,
      },
      responseSent: {
        ticketId: "TKT-1027" as const,
        recommendationId: recommendation.id,
        actor: "reviewer",
        sentAt: "2026-08-13T09:00:01.000Z",
        customerResponse: recommendation.draftCustomerResponse,
      },
    };
    const first = await harness.runtime.service.approveAndMarkResponseSent(input, { commandId });
    expect(first.sentEvent.action).toBe("customer-response-sent");

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as { auditsBeforeSentEventIds?: unknown };
      delete receipt.auditsBeforeSentEventIds;
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    await expect(harness.runtime.service.approveAndMarkResponseSent(input, { commandId }))
      .rejects.toMatchObject({ code: "PERSISTENCE_ERROR" });
  });

  it("rejects a composite receipt with a tampered automatic-reply source snapshot", async () => {
    const harness = await openReliabilityRuntime();
    activeRuntimes.push(harness);
    const evaluated = await harness.post(
      "/api/tickets/TKT-1001/recommendations",
      { actor: "approval-desk", aiPreference: "deterministic" },
    );
    const recommendation = evaluated.body.recommendation as {
      id: string;
      sourceRevision: number;
      draftCustomerResponse: string;
    };
    const commandId = randomUUID();
    const input = {
      approval: {
        ticketId: "TKT-1001" as const,
        recommendationId: recommendation.id,
        expectedRevision: recommendation.sourceRevision,
        approvedFields: ["customerResponse"] as ("customerResponse")[],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "reviewer",
        approvedAt: "2026-08-13T09:00:00.000Z",
        confirm: true as const,
      },
      responseSent: {
        ticketId: "TKT-1001" as const,
        recommendationId: recommendation.id,
        actor: "reviewer",
        sentAt: "2026-08-13T09:00:01.000Z",
        customerResponse: recommendation.draftCustomerResponse,
      },
    };
    const first = await harness.runtime.service.approveAndMarkResponseSent(input, { commandId });
    expect(first.automaticReply).toBeDefined();

    const database = new Database(`${harness.root}/operational.sqlite`);
    try {
      const receipt = JSON.parse(
        (database.prepare(
          "SELECT result_json FROM command_idempotency WHERE command_id = ?",
        ).get(commandId) as { result_json: string }).result_json,
      ) as {
        automaticCustomerReplyTicketSnapshot?: { requester?: { name: string } };
        automaticCustomerReplyIntent?: { kind: string; actor?: string };
      };
      receipt.automaticCustomerReplyTicketSnapshot!.requester!.name = "Tampered Actor";
      expect(receipt.automaticCustomerReplyIntent?.kind).toBe("add-customer-reply");
      receipt.automaticCustomerReplyIntent!.actor = "Tampered Actor";
      database.prepare(
        "UPDATE command_idempotency SET result_json = ? WHERE command_id = ?",
      ).run(JSON.stringify(receipt), commandId);
    } finally {
      database.close();
    }

    await expect(harness.runtime.service.approveAndMarkResponseSent(input, { commandId }))
      .rejects.toMatchObject({ code: "PERSISTENCE_ERROR" });
    expect((harness.runtime.operationalStore as OperationalSqliteStore)
      .readWorkflowSnapshot("TKT-1001").messages.filter(({ kind }) => kind === "customer"))
      .toHaveLength(1);
  });
});

function insertLegacyReceipt(
  root: string,
  commandId: string,
  operation: string,
  result: unknown,
): void {
  const database = new Database(`${root}/operational.sqlite`);
  try {
    database.prepare(`
      INSERT INTO command_idempotency(
        command_id, operation, request_hash, request_hash_version, result_json, created_at
      ) VALUES (?, ?, ?, 1, ?, ?)
    `).run(
      commandId,
      operation,
      "c".repeat(64),
      JSON.stringify(result),
      "2026-09-05T10:00:00.000Z",
    );
  } finally {
    database.close();
  }
}
