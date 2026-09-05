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
});
