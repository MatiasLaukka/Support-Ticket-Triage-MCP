import { rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { createTriageServer } from "../src/server.js";
import { createRecoveryFixture, recoveryTicketId } from "./recovery-fixture.js";

const roots: string[] = [];
const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((close) => close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("recovery operation transports", () => {
  it("exposes strict MCP recovery tools with stable post-commit replay envelopes", async () => {
    const fixture = await createRecoveryFixture();
    roots.push(fixture.root);
    cleanup.push(() => fixture.runtime.close());
    const fix = fixture.seedFix({
      fixEventId: "a1000000-0000-4000-8000-000000000001",
      commandId: "a1000000-0000-4000-8000-000000000002",
      occurredAt: "2026-08-21T09:02:00.000Z",
    });
    const server = createTriageServer(fixture.runtime);
    const client = new Client({ name: "recovery-tools-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    cleanup.push(async () => Promise.allSettled([client.close(), server.close()]).then(() => undefined));
    const ineffectiveArguments = {
      commandId: "a1000000-0000-4000-8000-000000000003",
      ticketId: recoveryTicketId,
      diagnosisId: fixture.diagnosis.id,
      fixEventId: fix.id,
      sourceTicketRevision: fixture.ticket.revision,
      sourceConversationWatermark: fixture.watermark,
      actor: "reviewer",
      rationale: "Customer verification shows that this fix attempt was ineffective.",
      verificationEvidence: ["customer-confirmed-not-fixed"],
    };

    const invalid = await client.callTool({
      name: "record_fix_ineffective",
      arguments: { ...ineffectiveArguments, unexpected: true },
    });
    expect(invalid.isError).toBe(true);
    expect(textOf(invalid)).toContain("Input validation error");

    const first = await client.callTool({ name: "record_fix_ineffective", arguments: ineffectiveArguments });
    const replay = await client.callTool({ name: "record_fix_ineffective", arguments: ineffectiveArguments });
    expect(first.isError, textOf(first)).not.toBe(true);
    expect(replay.structuredContent).toEqual(first.structuredContent);
    expect(first.structuredContent).toMatchObject({
      auditEvent: { action: "fix-ineffective" },
      operatorGuidance: expect.any(Object),
      lifecycle: {
        diagnosis: { state: "approved", diagnosisId: fixture.diagnosis.id },
        fix: { state: "ineffective", diagnosisStillAuthoritative: true },
      },
    });

    const invalidationArguments = {
      commandId: "a1000000-0000-4000-8000-000000000004",
      ticketId: recoveryTicketId,
      diagnosisId: fixture.diagnosis.id,
      sourceTicketRevision: fixture.ticket.revision,
      sourceConversationWatermark: fixture.watermark,
      actor: "reviewer",
      reasonCode: "contradictory-evidence",
      rationale: "New verification evidence contradicts the approved diagnosis.",
    };
    const invalidated = await client.callTool({ name: "invalidate_diagnosis", arguments: invalidationArguments });
    const invalidationReplay = await client.callTool({ name: "invalidate_diagnosis", arguments: invalidationArguments });
    expect(invalidated.isError, textOf(invalidated)).not.toBe(true);
    expect(invalidationReplay.structuredContent).toEqual(invalidated.structuredContent);
    expect(invalidated.structuredContent).toMatchObject({
      auditEvent: { action: "diagnosis-invalidated" },
      operatorGuidance: expect.any(Object),
      lifecycle: {
        diagnosis: { state: "invalidated", diagnosisId: fixture.diagnosis.id },
        fix: { diagnosisStillAuthoritative: false },
      },
    });
  });

  it("exposes strict Approval Desk recovery routes with stable post-commit replay envelopes", async () => {
    const fixture = await createRecoveryFixture();
    roots.push(fixture.root);
    cleanup.push(() => fixture.runtime.close());
    const fix = fixture.seedFix({
      fixEventId: "b1000000-0000-4000-8000-000000000001",
      commandId: "b1000000-0000-4000-8000-000000000002",
      occurredAt: "2026-08-21T09:02:00.000Z",
    });
    const server = createApprovalDeskHttpServer(fixture.runtime);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(() => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ineffectivePath = `/api/tickets/${recoveryTicketId}/diagnoses/${fixture.diagnosis.id}/fixes/${fix.id}/ineffective`;
    const ineffectiveBody = {
      sourceTicketRevision: fixture.ticket.revision,
      sourceConversationWatermark: fixture.watermark,
      actor: "reviewer",
      rationale: "Customer verification shows that this fix attempt was ineffective.",
      verificationEvidence: ["customer-confirmed-not-fixed"],
    };

    const invalid = await post(baseUrl, ineffectivePath, { ...ineffectiveBody, unexpected: true }, "b1000000-0000-4000-8000-000000000003");
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_REQUEST");

    const first = await post(baseUrl, ineffectivePath, ineffectiveBody, "b1000000-0000-4000-8000-000000000004");
    const replay = await post(baseUrl, ineffectivePath, ineffectiveBody, "b1000000-0000-4000-8000-000000000004");
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(first.body).toMatchObject({
      auditEvent: { action: "fix-ineffective" },
      operatorGuidance: expect.any(Object),
      lifecycle: { fix: { state: "ineffective", diagnosisStillAuthoritative: true } },
    });

    const invalidationPath = `/api/tickets/${recoveryTicketId}/diagnoses/${fixture.diagnosis.id}/invalidate`;
    const invalidationBody = {
      sourceTicketRevision: fixture.ticket.revision,
      sourceConversationWatermark: fixture.watermark,
      actor: "reviewer",
      reasonCode: "fix-ineffective",
      rationale: "The failed verification materially contradicts the diagnosis.",
    };
    const invalidated = await post(baseUrl, invalidationPath, invalidationBody, "b1000000-0000-4000-8000-000000000005");
    const invalidationReplay = await post(baseUrl, invalidationPath, invalidationBody, "b1000000-0000-4000-8000-000000000005");
    expect(invalidated.status, JSON.stringify(invalidated.body)).toBe(201);
    expect(invalidationReplay.body).toEqual(invalidated.body);
    expect(invalidated.body).toMatchObject({
      auditEvent: { action: "diagnosis-invalidated" },
      operatorGuidance: expect.any(Object),
      lifecycle: {
        diagnosis: { state: "invalidated", diagnosisId: fixture.diagnosis.id },
        fix: { diagnosisStillAuthoritative: false },
      },
    });
  });
});

function textOf(result: any): string {
  return result.content?.find((item: { type?: string }) => item.type === "text")?.text ?? "";
}

async function post(baseUrl: string, path: string, body: unknown, commandId: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": commandId },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}
