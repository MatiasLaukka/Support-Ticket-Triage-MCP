import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type EvidenceRequirement,
  type Ticket,
  type TriageRecommendation,
} from "../src/domain.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { automaticReplyForTicket } from "../src/approval-desk/automatic-customer-replies.js";
import { createRuntimeDependencies } from "../src/runtime.js";

const temporaryRoots: string[] = [];
const servers: Array<ReturnType<typeof createApprovalDeskHttpServer>> = [];
const ledgers: Array<{ close: () => void }> = [];

afterEach(async () => {
  await Promise.allSettled(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolveClose, rejectClose) => {
          server.close((error: Error | undefined) =>
            error === undefined ? resolveClose() : rejectClose(error),
          );
        }),
    ),
  );
  for (const ledger of ledgers.splice(0)) {
    ledger.close();
  }
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("automatic customer replies", () => {
  it("uses specific deterministic sentences for every seeded demo evidence requirement", async () => {
    const { deps, json } = await startFixture();
    const requirements = new Map<
      string,
      {
        ticket: Ticket;
        recommendation: TriageRecommendation;
        evidence: EvidenceRequirement;
      }
    >();

    let offset = 0;
    while (true) {
      const page = await deps.tickets.list({ offset, limit: 20 });
      for (const ticket of page.items) {
        const created = await json(`/api/tickets/${ticket.id}/recommendations`, {
          method: "POST",
          body: JSON.stringify({ actor: "approval-desk" }),
        });
        expect(created.status, `Expected evaluation for ${ticket.id}.`).toBe(201);
        const recommendation = TriageRecommendationSchema.parse(created.body.recommendation);
        for (const evidence of recommendation.missingEvidence ?? []) {
          requirements.set(evidence.id, { ticket, recommendation, evidence });
        }
      }
      offset += page.items.length;
      if (offset >= page.total || page.items.length === 0) {
        break;
      }
    }

    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));
    const firstCampaignEditor = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(firstCampaignEditor.status).toBe(201);
    await approveAndSend(
      json,
      "TKT-1010",
      firstCampaignEditor.body.recommendation.id,
      firstCampaignEditor.body.recommendation.draftCustomerResponse,
    );
    const secondCampaignEditor = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(secondCampaignEditor.status).toBe(201);
    const secondRecommendation = TriageRecommendationSchema.parse(
      secondCampaignEditor.body.recommendation,
    );
    for (const evidence of secondRecommendation.missingEvidence ?? []) {
      requirements.set(evidence.id, {
        ticket: TicketSchema.parse(secondCampaignEditor.body.ticket),
        recommendation: secondRecommendation,
        evidence,
      });
    }

    expect(requirements.size).toBeGreaterThan(0);

    for (const [evidenceId, { ticket, recommendation, evidence }] of requirements) {
      const automaticReply = automaticReplyForTicket({
        ticket,
        recommendation: TriageRecommendationSchema.parse({
          ...recommendation,
          missingEvidence: [evidence],
          supportState: "needs-information",
        }),
        auditsBeforeSent: [],
      });

      expect(
        automaticReply,
        `Expected a deterministic automatic reply sentence for ${evidenceId}.`,
      ).toBeDefined();
      expect(automaticReply).not.toContain(`example-${evidenceId}`);
    }
  }, 20000);

  it("does not ask another diagnostic question after specialist escalation", () => {
    const ticket = TicketSchema.parse({
      id: "TKT-1001",
      createdAt: "2026-06-10T08:00:00.000Z",
      updatedAt: "2026-06-10T08:30:00.000Z",
      customer: {
        name: "Northstar Labs",
        plan: "enterprise",
        region: "eu-west",
        vip: false,
      },
      subject: "Campaign editor is blank",
      description: "The campaign editor stays blank.",
      status: "in-progress",
      category: "performance",
      priority: "P2",
      team: "product",
      tags: ["campaign-editor"],
      sla: {
        responseDueAt: "2026-06-10T12:00:00.000Z",
        breached: false,
      },
      relatedTicketIds: [],
      revision: 1,
    });
    const recommendation = TriageRecommendationSchema.parse({
      id: "50000000-0000-4000-8000-000000000001",
      ticketId: ticket.id,
      sourceRevision: ticket.revision,
      category: "performance",
      priority: "P2",
      team: "product",
      ticketStatus: "in-progress",
      tags: ["campaign-editor"],
      duplicateCandidates: [],
      outageRisk: "none",
      securityRisk: "none",
      slaRisk: "none",
      missingInformation: [],
      supportState: "escalated",
      knowledgeArticleIds: ["performance-troubleshooting"],
      draftCustomerResponse: "We escalated this for specialist review.",
      rationale: "The issue needs specialist review.",
      confidence: 0.7,
      recommendedNextAction: "Wait for specialist review.",
      escalationRequired: true,
      escalationReasons: ["diagnostic-ambiguity"],
      resolution: "approved",
      createdAt: "2026-06-10T09:03:00.000Z",
    });
    const escalation = AuditEventSchema.parse({
      id: "50000000-0000-4000-8000-000000000002",
      timestamp: "2026-06-10T09:02:00.000Z",
      actor: "support",
      action: "diagnostic-escalated",
      ticketId: ticket.id,
      before: {},
      after: {
        diagnosis: {
          status: "completed",
          confidence: "likely",
          owner: "engineering",
          diagnosticState: {
            state: "escalated",
            diagnosticAttempts: 2,
            escalationReason: "diagnostic-ambiguity",
            specialistTeam: "product",
            hypotheses: [],
            evidenceToRequest: ["No further automated questions."],
          },
        },
      },
      rationale: "Escalated for specialist review.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const priorDiagnosis = AuditEventSchema.parse({
      ...escalation,
      id: "50000000-0000-4000-8000-000000000003",
      timestamp: "2026-06-10T09:01:00.000Z",
      action: "diagnosis-completed",
      after: {
        diagnosis: {
          status: "completed",
          confidence: "likely",
          owner: "engineering",
          diagnosticState: {
            state: "ambiguous",
            diagnosticAttempts: 1,
            hypotheses: [],
            evidenceToRequest: ["Try a private window."],
          },
        },
      },
      rationale: "Recorded the bounded working diagnosis.",
    });

    expect(
      automaticReplyForTicket({
        ticket,
        recommendation,
        auditsBeforeSent: [priorDiagnosis, escalation],
      }),
    ).toBeUndefined();
  });

  it("does not draft an automatic fix confirmation after a causally later backdated reply", () => {
    const ticket = TicketSchema.parse({
      id: "TKT-1001",
      createdAt: "2026-06-10T08:00:00.000Z",
      updatedAt: "2026-06-10T12:00:00.000Z",
      customer: {
        name: "Northstar Labs",
        plan: "enterprise",
        region: "eu-west",
        vip: false,
      },
      subject: "Campaign editor is blank",
      description: "The campaign editor stays blank.",
      status: "in-progress",
      category: "performance",
      priority: "P2",
      team: "product",
      tags: ["campaign-editor"],
      sla: {
        responseDueAt: "2026-06-10T12:00:00.000Z",
        breached: false,
      },
      relatedTicketIds: [],
      revision: 1,
    });
    const recommendation = TriageRecommendationSchema.parse({
      id: "60000000-0000-4000-8000-000000000001",
      ticketId: ticket.id,
      sourceRevision: ticket.revision,
      category: "performance",
      priority: "P2",
      team: "product",
      ticketStatus: "in-progress",
      tags: ["campaign-editor"],
      duplicateCandidates: [],
      outageRisk: "none",
      securityRisk: "none",
      slaRisk: "none",
      missingInformation: [],
      supportState: "waiting-on-platform-fix",
      knowledgeArticleIds: ["performance-troubleshooting"],
      draftCustomerResponse: "The mitigation is ready for confirmation.",
      rationale: "A fix was recorded for the confirmed diagnosis.",
      confidence: 0.9,
      recommendedNextAction: "Request customer verification.",
      escalationRequired: false,
      escalationReasons: [],
      resolution: "approved",
      createdAt: "2026-06-10T12:00:00.000Z",
    });
    const fix = AuditEventSchema.parse({
      id: "60000000-0000-4000-8000-000000000002",
      timestamp: "2026-06-10T10:00:00.0008+02:00",
      actor: "product-support",
      action: "fix-available",
      ticketId: ticket.id,
      before: {},
      after: {
        fix: {
          status: "available",
          customerSafeSummary: "The mitigation is available.",
          customerAction: "Retry the campaign editor.",
          verificationRequest: "Confirm whether the editor now loads.",
        },
      },
      rationale: "The confirmed mitigation is available.",
      knowledgeArticleIds: ["performance-troubleshooting"],
      result: "success",
    });
    const laterPersistedReply = AuditEventSchema.parse({
      id: "60000000-0000-4000-8000-000000000003",
      timestamp: "2026-06-10T07:59:59.9999Z",
      actor: "Northstar Labs",
      action: "customer-reply-received",
      ticketId: ticket.id,
      before: {},
      after: {
        body: "The campaign editor is still blank after the mitigation.",
        source: "manual",
      },
      rationale: "Customer supplied a later follow-up.",
      knowledgeArticleIds: [],
      result: "success",
    });

    expect(
      automaticReplyForTicket({
        ticket,
        recommendation,
        auditsBeforeSent: [fix, laterPersistedReply],
      }),
    ).toBeUndefined();
  });

  it("uses the persisted recommendation submission position over backdated timestamps", () => {
    const ticket = TicketSchema.parse({
      id: "TKT-1001",
      createdAt: "2026-06-10T08:00:00.000Z",
      updatedAt: "2026-06-10T12:00:00.000Z",
      customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
      subject: "Campaign editor is blank",
      description: "The campaign editor stays blank.",
      status: "in-progress",
      category: "performance",
      priority: "P2",
      team: "product",
      tags: ["campaign-editor"],
      sla: { responseDueAt: "2026-06-10T12:00:00.000Z", breached: false },
      relatedTicketIds: [],
      revision: 1,
    });
    const recommendation = TriageRecommendationSchema.parse({
      id: "70000000-0000-4000-8000-000000000001",
      ticketId: ticket.id,
      sourceRevision: ticket.revision,
      category: "performance",
      priority: "P2",
      team: "product",
      ticketStatus: "in-progress",
      tags: ["campaign-editor"],
      duplicateCandidates: [],
      outageRisk: "none",
      securityRisk: "none",
      slaRisk: "none",
      missingInformation: [],
      supportState: "waiting-on-platform-fix",
      knowledgeArticleIds: ["performance-troubleshooting"],
      draftCustomerResponse: "The mitigation is ready for confirmation.",
      rationale: "A fix was recorded for the confirmed diagnosis.",
      confidence: 0.9,
      recommendedNextAction: "Request customer verification.",
      escalationRequired: false,
      escalationReasons: [],
      resolution: "approved",
      createdAt: "2026-06-10T07:59:59.9999Z",
    });
    const fix = AuditEventSchema.parse({
      id: "70000000-0000-4000-8000-000000000002",
      timestamp: "2026-06-10T10:00:00.0008+02:00",
      actor: "product-support",
      action: "fix-available",
      ticketId: ticket.id,
      before: {},
      after: {
        fix: {
          status: "available",
          customerSafeSummary: "The mitigation is available.",
          customerAction: "Retry the campaign editor.",
          verificationRequest: "Confirm whether the editor now loads.",
        },
      },
      rationale: "The confirmed mitigation is available.",
      knowledgeArticleIds: ["performance-troubleshooting"],
      result: "success",
    });
    const submission = AuditEventSchema.parse({
      id: "70000000-0000-4000-8000-000000000003",
      timestamp: "2026-06-10T07:59:59.9999Z",
      actor: "approval-desk",
      action: "recommendation-submitted",
      ticketId: ticket.id,
      recommendationId: recommendation.id,
      before: {},
      after: {},
      rationale: "The recommendation was submitted after the persisted fix.",
      knowledgeArticleIds: [],
      result: "success",
    });

    expect(
      automaticReplyForTicket({
        ticket,
        recommendation,
        auditsBeforeSent: [fix, submission],
      }),
    ).toBe("It works now. The campaign editor loads normally again. Thanks for the help!");
  });
});

async function startFixture(): Promise<{
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>;
  json: (
    path: string,
    init?: RequestInit,
  ) => Promise<{ status: number; body: any; response: Response }>;
}> {
  const dataRoot = await mkdtemp(join(tmpdir(), "automatic-customer-replies-"));
  temporaryRoots.push(dataRoot);
  const deps = await createRuntimeDependencies({
    legacyFixtureRepositories: true,
    env: {
      TRIAGE_DATA_ROOT: dataRoot,
      TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
    },
    now: () => new Date("2026-06-10T09:00:00.000Z"),
  });
  ledgers.push(deps.knowledgeEvolution.ledger);
  const server = createApprovalDeskHttpServer(deps);
  servers.push(server);
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    deps,
    json: async (path, init) => {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { "content-type": "application/json", ...init?.headers },
        ...init,
      });
      return {
        status: response.status,
        body: await response.json(),
        response,
      };
    },
  };
}

async function approveAndSend(
  json: Awaited<ReturnType<typeof startFixture>>["json"],
  ticketId: string,
  recommendationId: string,
  draftCustomerResponse: string,
): Promise<void> {
  const detail = await json(`/api/tickets/${ticketId}`);
  const approved = await json(`/api/recommendations/${recommendationId}/approve`, {
    method: "POST",
    body: JSON.stringify({
      ticketId,
      expectedRevision: detail.body.ticket.revision,
      approvedFields: ["customerResponse"],
      editedCustomerResponse: draftCustomerResponse,
      actor: "matias-reviewer",
      confirm: true,
    }),
  });
  expect(approved.status).toBe(200);
  const sent = await json(`/api/recommendations/${recommendationId}/mark-sent`, {
    method: "POST",
    body: JSON.stringify({
      ticketId,
      actor: "matias-reviewer",
    }),
  });
  expect(sent.status).toBe(200);
}
