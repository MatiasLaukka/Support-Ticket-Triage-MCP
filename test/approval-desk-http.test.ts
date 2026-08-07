import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import {
  AuditEventSchema,
  TriageRecommendationSchema,
  type Ticket,
} from "../src/domain.js";
import {
  customerReplyWatermarkFromAudits,
  type DiagnosisContext,
  type FixContext,
} from "../src/triage-service.js";
import { DomainError } from "../src/errors.js";
import { evaluateTicketWithAi } from "../src/approval-desk/ai-evaluation.js";
import type { ClassificationReasoningProvider } from "../src/approval-desk/classification-reasoning-provider.js";
import type { CustomerResponseDraftProvider } from "../src/approval-desk/draft-response-provider.js";
import type { CandidateDraftProvider } from "../src/knowledge-evolution/candidate-draft-provider.js";
import { KnowledgeCandidateWriteSchema } from "../src/knowledge-evolution/domain.js";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTriageServer } from "../src/server.js";
import type { ReusableKnowledgeResult } from "../src/knowledge-evolution/reusable-context.js";

const now = new Date("2026-06-10T09:00:00.000Z");
const temporaryRoots: string[] = [];
const servers: Array<ReturnType<typeof createApprovalDeskHttpServer>> = [];
const ledgers: Array<{ close: () => void }> = [];

function mcpText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

const parityDraftProvider: CustomerResponseDraftProvider = {
  async draft() {
    return {
      source: "openai",
      response: "We are checking the campaign editor loading path and will update you shortly.",
      assist: {
        source: "openai",
        missingInfoSuggestions: ["Share a screenshot of the loading state."],
        investigationSteps: ["Review the campaign editor loading path."],
        tone: "empathetic",
        recommendedTone: "empathetic",
        selectedTone: "empathetic",
        toneReason: "The customer reports an interrupted campaign workflow.",
        audience: "merchant-admin",
        checks: [],
      },
    };
  },
};

const parityClassificationProvider: ClassificationReasoningProvider = {
  async reason() {
    return {
      reasoning: {
        issueType: "campaign-editor",
        candidateCategory: "performance",
        candidateTeam: "product",
        candidatePriority: "P2",
        knowledgeArticleIds: ["campaign-send-failures"],
        confidence: 0.9,
        evidence: ["editor never finishes loading"],
        missingEvidenceThatWouldChangeClassification: [],
        explanation: "The reply describes a campaign editor loading failure.",
      },
      telemetry: { model: "gpt-stub", latencyMs: 1 },
    };
  },
};

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
  for (const ledger of ledgers.splice(0)) ledger.close();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("createApprovalDeskHttpServer", () => {
  it("does not pass stale fix context into HTTP evaluation after a causally later backdated reply", async () => {
    const observedFixContexts: Array<FixContext | undefined> = [];
    const { deps, json } = await startFixture({
      draftProvider: {
        async draft(input) {
          observedFixContexts.push(input.fixContext);
          return parityDraftProvider.draft(input);
        },
      },
    });
    await deps.audits.append(AuditEventSchema.parse({
      id: "60000000-0000-4000-8000-000000000011",
      timestamp: "2026-06-10T10:00:00.0008+02:00",
      actor: "product-support",
      action: "fix-available",
      ticketId: "TKT-1010",
      before: {},
      after: {
        fix: {
          status: "available",
          customerSafeSummary: "The mitigation is available.",
          customerAction: "Retry the affected workflow.",
          verificationRequest: "Confirm whether the issue remains.",
        },
      },
      rationale: "The confirmed mitigation is available.",
      knowledgeArticleIds: [],
      result: "success",
    }));
    await deps.audits.append(AuditEventSchema.parse({
      id: "60000000-0000-4000-8000-000000000012",
      timestamp: "2026-06-10T07:59:59.9999Z",
      actor: "Jamie Lee",
      action: "customer-reply-received",
      ticketId: "TKT-1010",
      before: {},
      after: {
        body: "The issue is still failing after the mitigation.",
        source: "manual",
      },
      rationale: "Customer supplied a later follow-up.",
      knowledgeArticleIds: [],
      result: "success",
    }));

    const evaluation = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk", aiPreference: "gpt-preferred" }),
    });

    expect(evaluation.status, JSON.stringify(evaluation.body)).toBe(201);
    expect(observedFixContexts).toEqual([undefined]);
  });

  it("passes the same strictly revalidated diagnosis context through HTTP and MCP evaluation", async () => {
    const httpContexts: Array<DiagnosisContext | undefined> = [];
    const mcpContexts: Array<DiagnosisContext | undefined> = [];
    const { deps, json } = await startFixture({
      draftProvider: {
        async draft(input) {
          httpContexts.push(input.diagnosisContext);
          return parityDraftProvider.draft(input);
        },
      },
    });
    const mcpDraftProvider: CustomerResponseDraftProvider = {
      async draft(input) {
        mcpContexts.push(input.diagnosisContext);
        return parityDraftProvider.draft(input);
      },
    };
    const ticket = await deps.tickets.get("TKT-1010");
    const diagnosis: DiagnosisContext = {
      status: "completed",
      causeType: "performance",
      customerSafeSummary: "The confirmed editor diagnosis is ready for follow-up.",
      evidenceUsed: ["The editor remains blank in Chrome."],
      evidenceReferences: [],
      confidence: "confirmed",
      owner: "engineering",
      recommendedNextAction: "Share the governed remediation update.",
      doNotSay: ["Do not expose internal diagnostic notes."],
    };
    const original = AuditEventSchema.parse({
      id: "61000000-0000-4000-8000-000000000001",
      timestamp: "2026-06-10T09:00:00.0000Z",
      actor: "product-support",
      action: "diagnosis-completed",
      ticketId: ticket.id,
      before: {},
      after: {
        diagnosis,
        sourceTicketRevision: ticket.revision,
        sourceConversationWatermark: { state: "none" },
      },
      rationale: "The original diagnosis was recorded.",
      knowledgeArticleIds: ["performance-troubleshooting"],
      result: "success",
    });
    const reply = AuditEventSchema.parse({
      id: "61000000-0000-4000-8000-000000000002",
      timestamp: "2026-06-10T08:59:59.9999+00:00",
      actor: ticket.customer.name,
      action: "customer-reply-received",
      ticketId: ticket.id,
      before: {},
      after: { body: "The editor still remains blank.", source: "manual" },
      rationale: "The customer confirmed the same behavior.",
      knowledgeArticleIds: [],
      result: "success",
    });
    await deps.audits.append(original);
    await deps.audits.append(reply);
    await deps.service.reviewDiagnosis({
      decision: "revalidate",
      diagnosisId: original.id,
      ticketId: ticket.id,
      sourceTicketRevision: ticket.revision,
      sourceConversationWatermark: customerReplyWatermarkFromAudits(
        await deps.audits.list(ticket.id),
      ),
      editedDiagnosis: diagnosis,
      actor: "casey",
      rationale: "The customer reply confirms the original diagnosis.",
      reviewedAt: "2026-06-10T10:00:00.0008+02:00",
    });

    const httpEvaluation = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk", aiPreference: "gpt-preferred" }),
    });
    expect(httpEvaluation.status, JSON.stringify(httpEvaluation.body)).toBe(201);

    const server = createTriageServer({ ...deps, draftProvider: mcpDraftProvider });
    const client = new Client({ name: "revalidated-context-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcpEvaluation = await client.callTool({
        name: "evaluate_ticket",
        arguments: {
          ticketId: ticket.id,
          actor: "approval-desk",
          aiPreference: "gpt-preferred",
        },
      });
      expect(mcpEvaluation.isError, mcpText(mcpEvaluation as any)).not.toBe(true);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }

    expect(httpContexts).toEqual([diagnosis]);
    expect(mcpContexts).toEqual(httpContexts);
  });

  it("keeps MCP and HTTP knowledge discovery and review results equivalent", async () => {
    const { deps, json } = await startFixture();
    await seedKnowledgeCandidateSupport(deps);
    installGptKnowledgeDraftProvider(deps);

    const server = createTriageServer(deps);
    const client = new Client({ name: "knowledge-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const mcp = await client.callTool({
        name: "discover_knowledge_candidates",
        arguments: { actor: "reviewer", includeGpt: true },
      });
      const readOnlyDiscovery = await json("/api/knowledge-candidates?actor=reviewer&includeGpt=true");
      const http = await json("/api/knowledge-candidates", {
        method: "POST",
        body: JSON.stringify({ actor: "reviewer", includeGpt: true }),
      });

      expect(readOnlyDiscovery.status).toBe(404);
      expect(http.status).toBe(200);
      expect(mcp.structuredContent).toMatchObject({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            id: "known-cause-diagnosis-a",
            validationStatus: "valid",
          }),
        ]),
      });
      expect(http.body.candidates).toEqual(
        (mcp.structuredContent as { candidates: unknown[] }).candidates,
      );
      expect(http.body.gptAdvisory).toEqual({ requested: true, status: "used", candidateId: "known-cause-gpt-diagnosis-a" });

      const candidate = http.body.candidates.find((item: { id: string }) => item.id === "known-cause-diagnosis-a");
      const gptCandidate = http.body.candidates.find((item: { id: string }) => item.id === "known-cause-gpt-diagnosis-a");
      expect(candidate).toBeDefined();
      expect(gptCandidate).toBeDefined();
      expect(gptCandidate).toMatchObject({
        gptAdvisory: {
          status: "used",
          confidence: 0.91,
          rationale: "Completed diagnosis support identifies a repeatable credential rotation issue.",
        },
        deterministic: { meetsAlertThreshold: true },
      });
      expect(gptCandidate.support).toEqual(expect.arrayContaining([
        expect.objectContaining({ diagnosisId: "diagnosis-a", ticketId: "TKT-1001", score: expect.any(Number) }),
        expect.objectContaining({ diagnosisId: "diagnosis-b", ticketId: "TKT-1002", score: expect.any(Number) }),
      ]));
      const malformedMcpApproval = await client.callTool({
        name: "approve_knowledge_candidate",
        arguments: { candidateId: gptCandidate.id, actor: "", expectedVersion: gptCandidate.version },
      });
      const malformedHttpApproval = await json(`/api/knowledge-candidates/${gptCandidate.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ candidateId: gptCandidate.id, actor: "", expectedVersion: gptCandidate.version }),
      });
      expect(malformedMcpApproval.isError).toBe(true);
      expect(mcpText(malformedMcpApproval as any)).toContain("Input validation error");
      expect(malformedHttpApproval.body.error.code).toBe("INVALID_REQUEST");

      const staleMcpRejection = await client.callTool({
        name: "reject_knowledge_candidate",
        arguments: { candidateId: gptCandidate.id, actor: "reviewer", expectedVersion: gptCandidate.version + 1, reason: "Need a second reviewer." },
      });
      const staleHttpRejection = await json(`/api/knowledge-candidates/${gptCandidate.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ actor: "reviewer", expectedVersion: gptCandidate.version + 1, reason: "Need a second reviewer." }),
      });
      expect(staleMcpRejection.isError).toBe(true);
      expect(mcpText(staleMcpRejection as any)).toBe("STALE_APPROVAL: Knowledge candidate version is stale.");
      expect(staleHttpRejection.body.error.code).toBe("STALE_APPROVAL");
      const rejected = await json(`/api/knowledge-candidates/${candidate.id}/reject`, {
        method: "POST",
        body: JSON.stringify({
          actor: "reviewer",
          expectedVersion: candidate.version,
          reason: "Need a second reviewer.",
        }),
      });
      expect(rejected.status).toBe(200);
      expect(rejected.body).toEqual({ candidateId: candidate.id, rejected: true });
      const mcpRejected = await client.callTool({
        name: "reject_knowledge_candidate",
        arguments: {
          candidateId: gptCandidate.id,
          actor: "reviewer",
          expectedVersion: gptCandidate.version,
          reason: "Need a second reviewer.",
        },
      });
      expect(mcpRejected.structuredContent).toEqual({ candidateId: gptCandidate.id, rejected: true });
      await expect(deps.knowledgeEvolution.objects.listApproved()).resolves.toEqual([]);

      const approved = await json(`/api/knowledge-candidates/${candidate.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          actor: "reviewer",
          expectedVersion: candidate.version,
        }),
      });
      expect(approved.status, JSON.stringify(approved.body)).toBe(409);
      expect(approved.body.error.code).toBe("STALE_APPROVAL");
      const mcpApproved = await client.callTool({
        name: "approve_knowledge_candidate",
        arguments: {
          candidateId: gptCandidate.id,
          actor: "reviewer",
          expectedVersion: gptCandidate.version,
        },
      });
      expect(mcpApproved.isError).toBe(true);
      expect(mcpText(mcpApproved as any)).toContain("terminal review state");
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("rejects malformed and stale knowledge review actions", async () => {
    const { deps, json } = await startFixture();
    await seedKnowledgeCandidateSupport(deps);
    const discovery = await json("/api/knowledge-candidates", {
      method: "POST",
      body: JSON.stringify({ actor: "reviewer", includeGpt: false }),
    });
    const candidate = discovery.body.candidates[0];

    const malformed = await json(`/api/knowledge-candidates/${candidate.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ actor: "", expectedVersion: candidate.version }),
    });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_REQUEST");

    const stale = await json(`/api/knowledge-candidates/${candidate.id}/reject`, {
      method: "POST",
      body: JSON.stringify({
        actor: "reviewer",
        expectedVersion: candidate.version + 1,
        reason: "Needs more corroboration.",
      }),
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STALE_APPROVAL");
  });

  it("returns equivalent independent MCP and HTTP outcomes for governed knowledge actions", async () => {
    const actions = [
      { kind: "approve" as const, actor: "reviewer", expectedVersion: 1, edits: { summary: "A deployed service can retain a credential after rotation." } },
      { kind: "reject" as const, actor: "reviewer", expectedVersion: 1, reason: "Need a second reviewer." },
      { kind: "approve" as const, actor: "", expectedVersion: 1 },
      { kind: "reject" as const, actor: "reviewer", expectedVersion: 2, reason: "Need a second reviewer." },
    ];

    for (const action of actions) {
      await expect(runHttpKnowledgeAction(action)).resolves.toEqual(
        await runMcpKnowledgeAction(action),
      );
    }
  });

  it("lists immutable diagnosis history through the HTTP read endpoint without mutating it", async () => {
    const { deps, json } = await startFixture();
    const original = await recordCurrentDiagnosis(deps, "TKT-1001");
    const before = await deps.audits.list("TKT-1001");

    const response = await json("/api/tickets/TKT-1001/diagnoses");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      diagnoses: [
        {
          originalDiagnosis: { id: original.id, action: "diagnosis-completed" },
          reviews: [],
          latestReview: null,
          stale: false,
          staleReasons: [],
          sourceTicketRevision: 2,
          sourceConversationWatermark: { state: "none" },
        },
      ],
    });
    await expect(deps.audits.list("TKT-1001")).resolves.toEqual(before);
  });

  it("records a diagnosis review through HTTP and returns the updated causal view", async () => {
    const { deps, json } = await startFixture();
    const original = await recordCurrentDiagnosis(deps, "TKT-1001");
    const ticket = await deps.tickets.get("TKT-1001");

    const response = await json(
      `/api/tickets/TKT-1001/diagnoses/${original.id}/review`,
      {
        method: "POST",
        body: JSON.stringify({
          decision: "approve",
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: { state: "none" },
          editedDiagnosis: original.after.diagnosis,
          actor: "casey",
        }),
      },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body).toMatchObject({
      auditEvent: {
        action: "diagnosis-reviewed",
        before: { diagnosisId: original.id },
        after: {
          diagnosisReview: {
            diagnosisId: original.id,
            decision: "approve",
            actor: "casey",
          },
        },
      },
      diagnoses: [
        {
          originalDiagnosis: { id: original.id },
          reviews: [expect.objectContaining({ decision: "approve" })],
          latestReview: expect.objectContaining({ decision: "approve" }),
          stale: false,
        },
      ],
    });
    await expect(deps.audits.list("TKT-1001")).resolves.toEqual(
      expect.arrayContaining([original]),
    );
  });

  it("shows a causally revalidated diagnosis as current against its new customer-reply watermark", async () => {
    const { deps, json } = await startFixture();
    const original = await recordCurrentDiagnosis(deps, "TKT-1001");
    await deps.service.addCustomerReply({
      ticketId: "TKT-1001",
      actor: "Maya Chen",
      body: "The same diagnosed failure still reproduces with the new trace.",
      receivedAt: "2026-06-10T08:59:59.9999Z",
      source: "revalidation-test",
    });
    const [ticket, audits] = await Promise.all([
      deps.tickets.get("TKT-1001"),
      deps.audits.list("TKT-1001"),
    ]);

    const response = await json(
      `/api/tickets/TKT-1001/diagnoses/${original.id}/review`,
      {
        method: "POST",
        body: JSON.stringify({
          decision: "revalidate",
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: customerReplyWatermarkFromAudits(audits),
          editedDiagnosis: original.after.diagnosis,
          actor: "casey",
          rationale: "The new customer evidence confirms the unchanged diagnosis.",
        }),
      },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body).toMatchObject({
      diagnoses: [
        {
          originalDiagnosis: { id: original.id },
          latestReview: expect.objectContaining({ decision: "revalidate" }),
          stale: false,
          staleReasons: [],
          sourceConversationWatermark: customerReplyWatermarkFromAudits(audits),
        },
      ],
    });
  });

  it("applies a reviewed diagnosis fix to the selected impact set without closing the ticket", async () => {
    const { deps, json } = await startFixture();
    const original = await recordCurrentDiagnosis(deps, "TKT-1001");
    const ticket = await deps.tickets.get("TKT-1001");
    const review = await json(
      `/api/tickets/TKT-1001/diagnoses/${original.id}/review`,
      {
        method: "POST",
        body: JSON.stringify({
          decision: "approve",
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: { state: "none" },
          editedDiagnosis: original.after.diagnosis,
          actor: "casey",
        }),
      },
    );
    expect(review.status, JSON.stringify(review.body)).toBe(201);
    await appendDiagnosisResponseForTransport(deps, "TKT-1001");

    const response = await json(
      `/api/tickets/TKT-1001/diagnoses/${original.id}/fix`,
      {
        method: "POST",
        body: JSON.stringify({
          actor: "casey",
          impactSet: {
            actor: "casey",
            rationale: "The confirmed diagnosis applies to the selected ticket.",
            tickets: [
              {
                ticketId: "TKT-1001",
                reason: "The source ticket reproduced the reviewed diagnosis.",
              },
              {
                ticketId: "TKT-1002",
                reason: "The matching active ticket is part of the approved impact set.",
              },
            ],
          },
        }),
      },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.auditEvents).toEqual(
      expect.arrayContaining([
      expect.objectContaining({
        action: "fix-available",
        ticketId: "TKT-1001",
        after: expect.objectContaining({ diagnosisId: original.id }),
      }),
        expect.objectContaining({
          action: "fix-available",
          ticketId: "TKT-1002",
          after: expect.objectContaining({ diagnosisId: original.id }),
        }),
      ]),
    );
    expect(response.body.auditEvents).toHaveLength(2);
    const [sourceTicket, relatedTicket] = await Promise.all([
      deps.tickets.get("TKT-1001"),
      deps.tickets.get("TKT-1002"),
    ]);
    expect(sourceTicket.status).toBe("triage");
    expect(relatedTicket.status).not.toBe("resolved");
  });

  it("returns the same stale-review domain error from HTTP and MCP after a causally later backdated reply", async () => {
    const { deps, json } = await startFixture();
    const original = await recordCurrentDiagnosis(deps, "TKT-1001");
    const ticket = await deps.tickets.get("TKT-1001");
    await deps.service.addCustomerReply({
      ticketId: "TKT-1001",
      actor: "Maya Chen",
      body: "A later reply changes the diagnostic context.",
      receivedAt: "2026-06-10T08:59:59.9999Z",
      source: "parity-test",
    });
    const staleView = await json("/api/tickets/TKT-1001/diagnoses");
    const reviewInput = {
      decision: "approve",
      diagnosisId: original.id,
      ticketId: "TKT-1001",
      sourceTicketRevision: ticket.revision,
      sourceConversationWatermark: { state: "none" },
      editedDiagnosis: original.after.diagnosis,
      actor: "casey",
    };

    const http = await json(
      `/api/tickets/TKT-1001/diagnoses/${original.id}/review`,
      {
        method: "POST",
        body: JSON.stringify({
          ...reviewInput,
          diagnosisId: undefined,
          ticketId: undefined,
        }),
      },
    );
    const server = createTriageServer(deps);
    const client = new Client({ name: "stale-review-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcp = await client.callTool({
        name: "review_diagnosis",
        arguments: reviewInput,
      });

      expect(http.status).toBe(409);
      expect(staleView.status).toBe(200);
      expect(staleView.body).toMatchObject({
        diagnoses: [
          {
            originalDiagnosis: { id: original.id },
            stale: true,
            staleReasons: ["newer-customer-reply"],
          },
        ],
      });
      expect(http.body).toEqual({
        error: {
          code: "STALE_APPROVAL",
          message: "Diagnosis review conversation snapshot is stale.",
        },
      });
      expect(mcp.isError).toBe(true);
      expect(mcpText(mcp as any)).toBe(
        "STALE_APPROVAL: Diagnosis review conversation snapshot is stale.",
      );
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("keeps strict revalidation rationale errors safe and equivalent across HTTP and MCP", async () => {
    const { deps, json } = await startFixture();
    const original = await recordCurrentDiagnosis(deps, "TKT-1001");
    const ticket = await deps.tickets.get("TKT-1001");
    const reviewInput = {
      decision: "revalidate",
      diagnosisId: original.id,
      ticketId: "TKT-1001",
      sourceTicketRevision: ticket.revision,
      sourceConversationWatermark: { state: "none" },
      editedDiagnosis: original.after.diagnosis,
      actor: "casey",
    };

    const http = await json(
      `/api/tickets/TKT-1001/diagnoses/${original.id}/review`,
      {
        method: "POST",
        body: JSON.stringify({
          ...reviewInput,
          diagnosisId: undefined,
          ticketId: undefined,
        }),
      },
    );
    const server = createTriageServer(deps);
    const client = new Client({ name: "review-rationale-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcp = await client.callTool({
        name: "review_diagnosis",
        arguments: reviewInput,
      });

      expect(http.status).toBe(400);
      expect(http.body).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: "Reject and revalidate diagnosis reviews require a rationale.",
        },
      });
      expect(mcp.isError).toBe(true);
      expect(mcpText(mcp as any)).toBe(
        "INVALID_REQUEST: Reject and revalidate diagnosis reviews require a rationale.",
      );
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("rejects duplicate impact selections consistently before either transport applies a fix", async () => {
    const { deps, json } = await startFixture();
    const original = await recordCurrentDiagnosis(deps, "TKT-1001");
    const impactSet = {
      actor: "casey",
      rationale: "The selected tickets share the diagnosis.",
      tickets: [
        { ticketId: "TKT-1001", reason: "The source ticket is affected." },
        { ticketId: "TKT-1001", reason: "This duplicate must be rejected." },
      ],
    };

    const http = await json(
      `/api/tickets/TKT-1001/diagnoses/${original.id}/fix`,
      {
        method: "POST",
        body: JSON.stringify({ actor: "casey", impactSet }),
      },
    );
    const server = createTriageServer(deps);
    const client = new Client({ name: "impact-set-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcp = await client.callTool({
        name: "apply_diagnosis_fix",
        arguments: {
          diagnosisId: original.id,
          sourceTicketId: "TKT-1001",
          actor: "casey",
          impactSet,
        },
      });

      expect(http.status).toBe(400);
      expect(http.body).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: "Impact-set ticket IDs must be unique.",
        },
      });
      expect(mcp.isError).toBe(true);
      expect(mcpText(mcp as any)).toContain("Input validation error");
      expect(mcpText(mcp as any)).toContain("Impact-set ticket IDs must be unique.");
      await expect(deps.audits.list("TKT-1001")).resolves.toEqual([
        original,
      ]);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("returns the same source-selection error when an impact set omits its source ticket", async () => {
    const { deps, json } = await startFixture();
    const original = await recordCurrentDiagnosis(deps, "TKT-1001");
    const impactSet = {
      actor: "casey",
      rationale: "A related ticket was selected, but the source was omitted.",
      tickets: [
        { ticketId: "TKT-1002", reason: "This is the other affected ticket." },
      ],
    };

    const http = await json(
      `/api/tickets/TKT-1001/diagnoses/${original.id}/fix`,
      {
        method: "POST",
        body: JSON.stringify({ actor: "casey", impactSet }),
      },
    );
    const server = createTriageServer(deps);
    const client = new Client({ name: "missing-source-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcp = await client.callTool({
        name: "apply_diagnosis_fix",
        arguments: {
          diagnosisId: original.id,
          sourceTicketId: "TKT-1001",
          actor: "casey",
          impactSet,
        },
      });

      expect(http.status).toBe(400);
      expect(http.body).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: "The source ticket must be explicitly selected in the impact set.",
        },
      });
      expect(mcp.isError).toBe(true);
      expect(mcpText(mcp as any)).toBe(
        "INVALID_REQUEST: The source ticket must be explicitly selected in the impact set.",
      );
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("serves the temporary Approval Desk UI", async () => {
    const { baseUrl } = await startFixture();

    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(body).toContain("Approval Desk");
  });

  it("lists and reads tickets with audits", async () => {
    const { json } = await startFixture();

    const list = await json("/api/tickets?status=triage&limit=2");
    const detail = await json("/api/tickets/TKT-1005");

    expect(list.status).toBe(200);
    expect(list.body.total).toBe(13);
    expect(list.body.items).toHaveLength(2);
    expect(detail.status).toBe(200);
    expect(detail.body.ticket).toMatchObject({
      id: "TKT-1005",
      revision: 0,
    });
    expect(detail.body.audits).toMatchObject({
      total: 0,
      offset: 0,
      limit: 10,
      events: [],
    });
    expect(detail.body.conversationHistory).toEqual([]);
  });

  it("includes recommendation summaries in ticket list responses", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const list = await json("/api/tickets?status=triage&limit=20");

    const item = list.body.items.find((ticket: any) => ticket.id === "TKT-1005");
    expect(item.recommendationSummary).toMatchObject({
      latestRecommendationId: created.body.recommendation.id,
      latestResolution: "pending",
      hasPendingRecommendation: true,
      hasApprovedRecommendation: false,
      workflowState: "draft-ready",
    });
  });

  it("includes latest recommendation in ticket detail responses", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const detail = await json("/api/tickets/TKT-1005");

    expect(detail.body.recommendationSummary).toMatchObject({
      latestRecommendationId: created.body.recommendation.id,
      latestResolution: "pending",
      workflowState: "draft-ready",
    });
    expect(detail.body.latestRecommendation).toMatchObject({
      id: created.body.recommendation.id,
      ticketId: "TKT-1005",
      resolution: "pending",
    });
    expect(detail.body.conversationHistory).toEqual([
      expect.objectContaining({
        action: "recommendation-submitted",
        actor: "approval-desk",
        summary: "Recommendation prepared for review.",
        recommendationId: created.body.recommendation.id,
      }),
    ]);
  });

  it("uses causal recommendation submission order consistently in HTTP and MCP workflow reads", async () => {
    const { deps, json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const first = TriageRecommendationSchema.parse(created.body.recommendation);
    const causallyLater = TriageRecommendationSchema.parse({
      ...first,
      id: "90000000-0000-4000-8000-000000000001",
      createdAt: "2026-06-10T08:59:59.9999+00:00",
      draftCustomerResponse: "This later audit must become the current draft.",
    });
    await deps.recommendations.create(causallyLater);
    await deps.audits.append(AuditEventSchema.parse({
      id: "90000000-0000-4000-8000-000000000002",
      timestamp: causallyLater.createdAt,
      actor: "approval-desk",
      action: "recommendation-submitted",
      ticketId: causallyLater.ticketId,
      recommendationId: causallyLater.id,
      before: {},
      after: { resolution: "pending" },
      rationale: "A later persisted recommendation replaces the earlier draft.",
      knowledgeArticleIds: causallyLater.knowledgeArticleIds,
      result: "success",
    }));

    const httpDetail = await json("/api/tickets/TKT-1005");
    const server = createTriageServer(deps);
    const client = new Client({ name: "causal-read-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcpWorkflow = await client.callTool({
        name: "get_ticket_workflow",
        arguments: { id: "TKT-1005" },
      });

      expect(httpDetail.body.latestRecommendation.id).toBe(causallyLater.id);
      expect((mcpWorkflow.structuredContent as any).latestRecommendation.id).toBe(
        causallyLater.id,
      );
      expect(httpDetail.body.recommendationSummary).toEqual(
        JSON.parse(JSON.stringify(
          (mcpWorkflow.structuredContent as any).recommendationSummary,
        )),
      );
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("exposes the same knowledge-pattern gate in HTTP and MCP workflow reads", async () => {
    const { deps, json } = await startFixture();
    const ticket = await deps.tickets.get("TKT-1001");
    const recommendation = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", recommendation.body.recommendation, false);

    const diagnosis = {
      status: "completed" as const,
      causeType: "performance" as const,
      customerSafeSummary: "The platform is delaying event processing.",
      evidenceUsed: ["The event timeline shows the same processing delay."],
      evidenceReferences: [],
      confidence: "confirmed" as const,
      owner: "engineering" as const,
      recommendedNextAction: "Review the platform mitigation signal.",
      doNotSay: [],
    } satisfies DiagnosisContext;
    const originalDiagnosis = AuditEventSchema.parse({
      id: "71000000-0000-4000-8000-000000000001",
      timestamp: "2026-06-10T09:10:00.000Z",
      actor: "product-support",
      action: "diagnosis-completed",
      ticketId: "TKT-1001",
      before: {},
      after: {
        diagnosis,
        sourceTicketRevision: ticket.revision,
        sourceConversationWatermark: { state: "none" },
      },
      rationale: "The evidence supports a confirmed platform delay.",
      knowledgeArticleIds: ["event-tracking-debugging"],
      result: "success",
    });
    await deps.audits.append(originalDiagnosis);
    await deps.service.reviewDiagnosis({
      decision: "revalidate",
      diagnosisId: originalDiagnosis.id,
      ticketId: "TKT-1001",
      sourceTicketRevision: ticket.revision,
      sourceConversationWatermark: { state: "none" },
      editedDiagnosis: diagnosis,
      actor: "reviewer",
      rationale: "The diagnosis is current and supported.",
      reviewedAt: "2026-06-10T09:11:00.000Z",
    });
    await deps.knowledgeEvolution.objects.saveCandidate(KnowledgeCandidateWriteSchema.parse({
      id: "known-cause-platform-delay",
      kind: "known-cause",
      name: "Recurring platform event delay",
      summary: "Event processing can be delayed during a platform incident.",
      triggerPatterns: ["event processing delay"],
      evidencePolicy: { mode: "undecided" },
      timeConstraints: ["During an active platform incident."],
      diagnosticSteps: ["Compare the event timeline with the active incident."],
      fixSteps: ["Apply the platform mitigation workflow."],
      verificationSteps: ["Confirm event processing resumes."],
      customerSafeExplanation: "We are reviewing a platform processing delay.",
      operatorRationale: "The repeated diagnosis supports a reusable platform-delay workflow.",
      owner: "api-platform",
      version: 1,
      objectId: "known-cause-platform-delay",
      sourceVersion: 1,
      supportingDiagnosisIds: [`diagnosis-${originalDiagnosis.id}`],
      supportingTicketIds: ["TKT-1001", "TKT-1002"],
      provenance: {
        source: "deterministic discovery",
        recordedAt: "2026-06-10T09:12:00.000Z",
      },
      status: "candidate",
      deterministicScores: { confidence: 0.8, support: 2 },
      deterministicReasons: ["shared platform-delay diagnosis"],
      contradictions: [],
      validationStatus: "valid",
      evidencePolicyMetadata: { derivedEvidenceIds: [], operatorAddedEvidenceIds: [] },
      discovery: {
        score: 0.8,
        reasons: ["shared platform-delay diagnosis"],
        support: [
          {
            source: "completed-diagnosis",
            diagnosisId: `diagnosis-${originalDiagnosis.id}`,
            ticketId: "TKT-1001",
            score: 0.8,
            reasons: ["shared diagnosis"],
          },
          {
            source: "open-ticket",
            ticketId: "TKT-1002",
            score: 0.4,
            reasons: ["ticket similarity"],
          },
        ],
        supportCount: 2,
        contradictions: [],
        meetsAlertThreshold: true,
      },
    }));

    const http = await json("/api/tickets/TKT-1001");
    const server = createTriageServer(deps);
    const client = new Client({ name: "knowledge-pattern-read-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcp = await client.callTool({
        name: "get_ticket_workflow",
        arguments: { id: "TKT-1001" },
      });
      const mcpWorkflow = mcp.structuredContent as any;
      expect(http.body.operatorGuidance).toMatchObject({
        stage: "pattern-review",
        nextAction: "review-pattern",
        knowledgePattern: {
          state: "pending",
          actionable: true,
          candidateId: "known-cause-platform-delay",
        },
      });
      expect(http.body.operatorGuidance).toEqual(
        JSON.parse(JSON.stringify(mcpWorkflow.operatorGuidance)),
      );
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("exposes the same specialist-review guidance as MCP reads", async () => {
    const { deps, json } = await startFixture();
    await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const current = (await deps.recommendations.list()).find(
      (recommendation) => recommendation.ticketId === "TKT-1001",
    );
    expect(current).toBeDefined();
    const escalation = {
      ...current!,
      id: "40000000-0000-4000-8000-000000000010",
      supportState: "escalated" as const,
      ticketStatus: "in-progress" as const,
      team: "product" as const,
      escalationRequired: true,
      escalationReasons: ["diagnostic-ambiguity" as const],
      resolution: "approved" as const,
      createdAt: "2026-06-10T09:03:00.000Z",
    };
    await deps.recommendations.create(escalation);
    await deps.audits.append(
      AuditEventSchema.parse({
        id: "40000000-0000-4000-8000-000000000011",
        timestamp: "2026-06-10T09:03:00.000Z",
        actor: "casey",
        action: "recommendation-submitted",
        ticketId: "TKT-1001",
        recommendationId: escalation.id,
        before: {},
        after: {},
        rationale: "Escalated recommendation submitted for approval.",
        knowledgeArticleIds: [],
        result: "success",
      }),
    );
    await deps.audits.append(
      AuditEventSchema.parse({
        id: "40000000-0000-4000-8000-000000000012",
        timestamp: "2026-06-10T09:04:00.000Z",
        actor: "casey",
        action: "customer-response-sent",
        ticketId: "TKT-1001",
        recommendationId: escalation.id,
        before: {},
        after: { sentAt: "2026-06-10T09:04:00.000Z" },
        rationale: "Sent the approved specialist escalation response.",
        knowledgeArticleIds: [],
        result: "success",
      }),
    );
    await deps.audits.append(
      AuditEventSchema.parse({
        id: "40000000-0000-4000-8000-000000000013",
        timestamp: "2026-06-10T09:05:00.000Z",
        actor: "casey",
        action: "diagnostic-escalated",
        ticketId: "TKT-1001",
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
      }),
    );

    const detail = await json("/api/tickets/TKT-1001");
    expect(detail.body).toMatchObject({
      latestRecommendation: {
        supportState: "escalated",
        team: "product",
        ticketStatus: "in-progress",
      },
      operatorGuidance: {
        stage: "escalated",
        nextAction: "specialist-review",
      },
    });
  });

  it("maps missing tickets to 404", async () => {
    const { json } = await startFixture();

    const missing = await json("/api/tickets/TKT-9999");

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: {
        code: "TICKET_NOT_FOUND",
        message: "Ticket was not found.",
      },
    });
  });

  it("maps missing recommendations to 404", async () => {
    const { json } = await startFixture();

    const missing = await json(
      "/api/recommendations/11111111-1111-4111-8111-111111111111",
    );

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: {
        code: "RECOMMENDATION_NOT_FOUND",
        message: "Recommendation was not found.",
      },
    });
  });

  it("creates a pending flow recommendation without mutating the ticket", async () => {
    const { deps, json } = await startFixture();

    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation).toMatchObject({
      ticketId: "TKT-1005",
      sourceRevision: 0,
      category: "integration",
      team: "integrations",
      resolution: "pending",
      createdAt: now.toISOString(),
    });
    expect((await deps.tickets.get("TKT-1005")).revision).toBe(0);
  });

  it("matches shared AI evaluation with identical providers and conversation input", async () => {
    const { deps, json } = await startFixture({
      classificationReasoningProvider: parityClassificationProvider,
      draftProvider: parityDraftProvider,
    });
    const customerReplies = [{
      id: "parity-campaign-editor",
      createdAt: "2026-06-10T09:05:00.000Z",
      body: "The campaign editor content area never finishes loading.",
    }];
    const ticket = await deps.tickets.get("TKT-1010");
    const direct = await evaluateTicketWithAi({
      ticket,
      actor: "skill-showcase",
      allKnowledgeArticles: await deps.knowledge.list(),
      customerReplies: customerReplies.map((reply) => ({ ...reply, ticketId: ticket.id })),
      aiPreference: "gpt-preferred",
      responseStyle: "auto",
      classificationProvider: parityClassificationProvider,
      draftProvider: parityDraftProvider,
    });

    const created = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "skill-showcase",
        customerReplies,
        aiPreference: "gpt-preferred",
        responseStyle: "auto",
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation).toMatchObject({
      category: direct.category,
      team: direct.team,
      aiExecutionTrace: direct.aiExecutionTrace,
    });
  });

  it("rejects unsupported aiPreference in recommendation requests", async () => {
    const { json } = await startFixture();
    const response = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ aiPreference: "required" }),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("Invalid option");
  });

  it("passes customer reply context into lifecycle-aware recommendation creation", async () => {
    const { json } = await startFixture();

    const created = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "approval-desk",
        customerReplies: [
          {
            id: "demo-reply-1",
            createdAt: "2026-06-10T09:05:00.000Z",
            body:
              "Endpoint URL is https://hooks.juniper.example/webhooks/orders and delivery ID is deliv_7788.",
          },
        ],
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation).toMatchObject({
      ticketId: "TKT-1008",
      supportState: "information-received",
    });
    expect(created.body.recommendation.providedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "endpoint-url" }),
        expect.objectContaining({ id: "delivery-id" }),
      ]),
    );
    expect(created.body.recommendation.missingEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "raw-body-change-status" }),
      ]),
    );
  });

  it("creates a TKT-1010 recommendation after complete blank-page evidence without missing knowledge", async () => {
    const { deps, json } = await startFixture();
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));

    const created = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "approval-desk",
        customerReplies: [
          {
            id: "reply-complete-blank-page-evidence",
            createdAt: "2026-06-10T09:35:00.000Z",
            body:
              "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
          },
        ],
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation).toMatchObject({
      ticketId: "TKT-1010",
      category: "performance",
      supportState: "diagnosing",
    });
    expect(created.body.recommendation.knowledgeArticleIds).toContain(
      "performance-troubleshooting",
    );
  });

  it("records diagnosis only after a done response with complete evidence", async () => {
    const { deps, json } = await startFixture();
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));
    const created = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "approval-desk",
        customerReplies: [
          {
            id: "reply-complete-blank-page-evidence",
            createdAt: "2026-06-10T09:35:00.000Z",
            body:
              "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
          },
        ],
      }),
    });
    const recommendation = created.body.recommendation;
    const approved = await json(`/api/recommendations/${recommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        expectedRevision: 1,
        approvedFields: ["category", "priority", "team", "customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    expect(approved.status).toBe(200);
    const sent = await json(`/api/recommendations/${recommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        actor: "matias-reviewer",
      }),
    });
    expect(sent.status).toBe(200);

    const diagnosis = await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(diagnosis.status).toBe(201);
    expect(diagnosis.body.auditEvent).toMatchObject({
      action: "diagnosis-completed",
      actor: "product-support",
      ticketId: "TKT-1010",
      after: {
        diagnosis: {
          status: "completed",
          causeType: "performance",
          confidence: "likely",
          owner: "engineering",
        },
      },
    });
    expect(diagnosis.body.auditEvent.after.diagnosis.customerSafeSummary).toContain(
      "campaign editor",
    );
  });

  it("rejects diagnosis when required evidence is still missing", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", created.body.recommendation);

    const diagnosis = await json("/api/tickets/TKT-1001/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(diagnosis.status).toBe(400);
    expect(diagnosis.body.error.message).toContain(
      "all required evidence to be gathered",
    );
  });

  it("blocks HTTP diagnosis after a causally later backdated customer reply", async () => {
    const { deps, json } = await startFixture();
    const created = await json("/api/tickets/TKT-1017/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1017", created.body.recommendation);
    await deps.audits.append(AuditEventSchema.parse({
      id: "60000000-0000-4000-8000-000000000099",
      timestamp: "2026-06-10T07:59:59.9999Z",
      actor: "Nina Brooks",
      action: "customer-reply-received",
      ticketId: "TKT-1017",
      before: {},
      after: { body: "The SMS delivery is still delayed.", source: "manual" },
      rationale: "The customer added new diagnostic context.",
      knowledgeArticleIds: [],
      result: "success",
    }));

    const diagnosis = await json("/api/tickets/TKT-1017/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(diagnosis.status).toBe(400);
    expect(diagnosis.body.error.message).toBe(
      "Evaluate the latest customer reply before diagnosis.",
    );
  });

  it("rejects an HTTP diagnosis when a reply arrives after the adapter preview", async () => {
    const { deps, json } = await startFixture();
    const created = await json("/api/tickets/TKT-1017/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1017", created.body.recommendation);
    const original = deps.service.recordDiagnosis.bind(deps.service);
    vi.spyOn(deps.service, "recordDiagnosis").mockImplementation(async (input) => {
      await deps.service.addCustomerReply({
        ticketId: input.ticketId,
        actor: "Nina Brooks",
        body: "A new reply arrived after the diagnosis preview.",
        receivedAt: "2026-06-10T09:00:00.0001Z",
        source: "race-regression",
      });
      return original(input);
    });

    const diagnosis = await json("/api/tickets/TKT-1017/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(diagnosis.status).toBe(409);
    expect(diagnosis.body.error).toMatchObject({
      code: "STALE_APPROVAL",
      message: "Diagnosis customer reply snapshot is stale.",
    });
    expect(
      (await deps.audits.list("TKT-1017")).filter(
        (event) => event.action === "diagnosis-completed",
      ),
    ).toEqual([]);
  });

  it("allows known-cause diagnosis without extra evidence gathering", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1017/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(created.body.recommendation).toMatchObject({
      supportState: "known-cause",
      knownCause: "sms-quiet-hours",
    });
    await approveAndSend(json, "TKT-1017", created.body.recommendation);

    const diagnosis = await json("/api/tickets/TKT-1017/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(diagnosis.status).toBe(201);
    expect(diagnosis.body.auditEvent.action).toBe("diagnosis-completed");

    const update = await json("/api/tickets/TKT-1017/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const draft = update.body.recommendation.draftCustomerResponse;
    expect(draft).toContain("quiet-hour protection");
    expect(draft).toContain("restricted sending hours");
    expect(draft).toContain("reschedule");
    expect(draft).not.toContain("platform-side processing delay");
    expect(draft).not.toContain("the customer");
  });

  it("does not treat a probable known cause as diagnosis-ready while evidence is missing", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(created.body.recommendation).toMatchObject({
      supportState: "needs-information",
      knownCause: "webhook-secret-rotation",
    });
    expect(created.body.recommendation.missingEvidence.length).toBeGreaterThan(0);
    await approveAndSend(json, "TKT-1008", created.body.recommendation);

    const diagnosis = await json("/api/tickets/TKT-1008/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(diagnosis.status).toBe(400);
    expect(diagnosis.body.error.message).toContain(
      "all required evidence to be gathered",
    );
  });

  it("uses recorded diagnosis context in the next customer response draft", async () => {
    const { deps, json } = await startFixture();
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));
    await json("/api/tickets/TKT-1010/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Mia Johnson",
        source: "manual",
        body:
          "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
      }),
    });
    const first = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const firstRecommendation = first.body.recommendation;
    await json(`/api/recommendations/${firstRecommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        expectedRevision: await ticketRevision(json, "TKT-1010"),
        approvedFields: ["customerResponse"],
        editedCustomerResponse: firstRecommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    await json(`/api/recommendations/${firstRecommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        actor: "matias-reviewer",
      }),
    });
    const likelyDiagnosis = await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    expect(likelyDiagnosis.body.auditEvent.after.diagnosis).toMatchObject({
      confidence: "likely",
      diagnosticState: {
        state: "ambiguous",
        hypotheses: expect.arrayContaining([
          expect.objectContaining({ id: "browser-session", status: "plausible" }),
          expect.objectContaining({ id: "frontend-loading", status: "plausible" }),
        ]),
        evidenceToRequest: expect.arrayContaining([
          expect.stringMatching(/private|incognito/i),
        ]),
      },
    });

    const afterDiagnosis = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    expect(afterDiagnosis.status).toBe(201);
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).toContain(
      "campaign editor loading",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).toContain(
      "private or incognito window",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).toContain(
      "different browser",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).toContain(
      "browser console error",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).toContain(
      "frontend loading issue",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).not.toContain(
      "most likely cause",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).not.toContain(
      "We based this on",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).not.toContain(
      "applying the mitigation",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).not.toContain(
      "Please share a screenshot",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).not.toContain(
      "delayed events",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).not.toContain(
      "profile timelines",
    );
    expect(afterDiagnosis.body.recommendation.draftCustomerResponse).not.toContain(
      "Please share",
    );
  });

  it("uses the latest evaluated recommendation for diagnosis after automatic replies", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));

    const initial = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1010", initial.body.recommendation);
    currentNow = new Date("2026-06-10T09:05:00.000Z");
    await json("/api/tickets/TKT-1010/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Mia Johnson",
        source: "manual",
        body:
          "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
      }),
    });
    currentNow = new Date("2026-06-10T09:06:00.000Z");
    const completeEvidence = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1010", completeEvidence.body.recommendation);
    currentNow = new Date("2026-06-10T09:07:00.000Z");
    const latestCustomerReply = await json("/api/tickets/TKT-1010");
    if (
      latestCustomerReply.body.recommendationSummary.workflowState ===
      "customer-replied"
    ) {
      const refreshed = await json("/api/tickets/TKT-1010/recommendations", {
        method: "POST",
        body: JSON.stringify({ actor: "approval-desk" }),
      });
      await approveAndSend(json, "TKT-1010", refreshed.body.recommendation);
      currentNow = new Date("2026-06-10T09:08:00.000Z");
    }

    const diagnosis = await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(diagnosis.status).toBe(201);
    expect(diagnosis.body.auditEvent.after.diagnosis).toMatchObject({
      confidence: "likely",
      causeType: "performance",
    });
  });

  it("keeps internal diagnosis next actions out of customer update drafts", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { json } = await startFixture({}, { now: () => currentNow });

    const first = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const firstRecommendation = first.body.recommendation;
    await approveAndSend(json, "TKT-1001", firstRecommendation);

    currentNow = new Date("2026-06-10T09:05:00.000Z");
    await json("/api/tickets/TKT-1001/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Maya Chen",
        body: "The affected store URL is https://store.example.test. One affected profile email is customer@example.test.",
        source: "manual",
      }),
    });
    currentNow = new Date("2026-06-10T09:06:00.000Z");
    const partial = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", partial.body.recommendation);

    currentNow = new Date("2026-06-10T09:10:00.000Z");
    await json("/api/tickets/TKT-1001/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Maya Chen",
        body: "The event ID is evt_12345. The request ID is req_12345. The API response status is 400 validation_error.",
        source: "manual",
      }),
    });
    currentNow = new Date("2026-06-10T09:11:00.000Z");
    const complete = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", complete.body.recommendation);

    currentNow = new Date("2026-06-10T09:15:00.000Z");
    await json("/api/tickets/TKT-1001/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    currentNow = new Date("2026-06-10T09:16:00.000Z");
    const update = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const draft = update.body.recommendation.draftCustomerResponse;
    expect(draft).toContain(
      "platform-side processing delay affecting checkout event processing and profile timeline updates",
    );
    expect(draft).toContain("working diagnosis");
    expect(draft).not.toContain("completed the investigation");
    expect(draft).not.toContain("We based this on");
    expect(draft).not.toContain("applying the mitigation");
    expect(draft).not.toContain("Complete platform mitigation");
    expect(draft).not.toContain("before asking the customer");
    expect(draft).not.toContain("customer's expected results");
    expect(draft).not.toContain("when there is something ready");
    expect(update.body.recommendation.draftCustomerResponseChecks).toContainEqual(
      expect.objectContaining({
        id: "customer-addressed-directly",
        status: "pass",
      }),
    );
  });

  it("keeps TKT-1008 on the webhook secret-rotation known cause after complete evidence", async () => {
    const { json } = await startFixture();
    const first = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1008", first.body.recommendation);
    await json("/api/tickets/TKT-1008/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Juniper Retail",
        source: "manual",
        body:
          "The endpoint URL is https://hooks.example.test/webhooks/orders. The delivery ID is deliv_7788. We rotated the signing secret yesterday at 08:10 UTC. Raw body handling has not changed since yesterday.",
      }),
    });

    const second = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    expect(second.status).toBe(201);
    expect(second.body.recommendation).toMatchObject({
      supportState: "known-cause",
      knownCause: "webhook-secret-rotation",
      missingEvidence: [],
    });
    expect(second.body.recommendation.draftCustomerResponse).toContain(
      "current signing secret",
    );
    expect(second.body.recommendation.draftCustomerResponse).not.toContain(
      "ecommerce platform",
    );
  });

  it("does not loop on TKT-1007 after the customer gives rotated signing-secret time", async () => {
    const { json } = await startFixture();
    const first = await json("/api/tickets/TKT-1007/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1007", first.body.recommendation);
    await json("/api/tickets/TKT-1007/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Orbit Commerce",
        source: "manual",
        body: [
          "I found the remaining details:",
          "- The failure timestamp was 2026-06-10 09:15 UTC",
          "- We rotated the signing secret yesterday at 08:10 UTC",
          "- The timestamp tolerance configured for verification is five minutes",
          "- The endpoint response code is HTTP 401",
          "- Raw body handling has not changed since yesterday",
        ].join("\n"),
      }),
    });

    const second = await json("/api/tickets/TKT-1007/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    expect(second.status).toBe(201);
    expect(second.body.recommendation.providedEvidence.map((item: any) => item.id)).toContain(
      "signing-secret-rotation-time",
    );
    expect(second.body.recommendation.missingEvidence.map((item: any) => item.id)).not.toContain(
      "signing-secret-rotation-time",
    );
    expect(second.body.recommendation.draftCustomerResponse).not.toContain(
      "signing secret rotation time, without sharing the secret value",
    );
  });

  it("uses a customer-safe platform delay fix summary", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    const diagnosisRecommendation = await createDiagnosedPlatformDelayTicket(
      json,
      (value) => {
        currentNow = new Date(value);
      },
    );

    await approveAndSend(json, "TKT-1001", diagnosisRecommendation);
    currentNow = new Date("2026-06-10T09:17:00.000Z");
    await json("/api/tickets/TKT-1001/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Maya Chen",
        body: "This affects multiple EU stores. The tracking calls were accepted successfully by the API, but the checkout events are still missing from the profile timelines.",
        source: "manual",
      }),
    });
    currentNow = new Date("2026-06-10T09:18:00.000Z");
    const confirmed = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", confirmed.body.recommendation);
    currentNow = new Date("2026-06-10T09:19:00.000Z");
    const confirmedDiagnosis = await json("/api/tickets/TKT-1001/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    expect(confirmedDiagnosis.status, JSON.stringify(confirmedDiagnosis.body)).toBe(201);
    expect(confirmedDiagnosis.body.auditEvent.after.diagnosis).toMatchObject({
      confidence: "confirmed",
      causeType: "platform-delay",
    });
    currentNow = new Date("2026-06-10T09:20:00.000Z");
    const confirmedDiagnosisDraft = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", confirmedDiagnosisDraft.body.recommendation);
    await approveLatestDiagnosis(deps, "TKT-1001");
    currentNow = new Date("2026-06-10T09:21:00.000Z");
    const fix = await json("/api/tickets/TKT-1001/fix", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    expect(fix.status).toBe(201);

    const afterFix = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const draft = afterFix.body.recommendation.draftCustomerResponse;
    expect(draft).toContain(
      "The event-processing delay mitigation has been applied",
    );
    expect(draft).toContain(
      "Please check the affected profile timelines again",
    );
    expect(draft).not.toContain("available for The evidence points");
    expect(draft).not.toContain("the customer's expected results");
  });

  it("answers customer questions from the confirmed diagnosis instead of reverting to pre-diagnosis wording", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { json } = await startFixture({}, { now: () => currentNow });
    const diagnosisRecommendation = await createDiagnosedPlatformDelayTicket(
      json,
      (value) => {
        currentNow = new Date(value);
      },
    );

    await approveAndSend(json, "TKT-1001", diagnosisRecommendation);
    currentNow = new Date("2026-06-10T09:17:00.000Z");
    await json("/api/tickets/TKT-1001/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Maya Chen",
        body: "This affects multiple EU stores. The tracking calls were accepted successfully by the API, but the checkout events are still missing from the profile timelines.",
        source: "manual",
      }),
    });
    currentNow = new Date("2026-06-10T09:18:00.000Z");
    const confirmed = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", confirmed.body.recommendation);
    currentNow = new Date("2026-06-10T09:19:00.000Z");
    const confirmedDiagnosis = await json("/api/tickets/TKT-1001/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    expect(confirmedDiagnosis.status, JSON.stringify(confirmedDiagnosis.body)).toBe(201);

    currentNow = new Date("2026-06-10T09:20:00.000Z");
    const diagnosisUpdate = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const diagnosisDraft =
      diagnosisUpdate.body.recommendation.draftCustomerResponse;
    expect(diagnosisDraft).toContain(
      "The examples show accepted events that were delayed before appearing in profile timelines.",
    );
    expect(diagnosisDraft).not.toContain("We based this on");
    await approveAndSend(
      json,
      "TKT-1001",
      diagnosisUpdate.body.recommendation,
    );

    currentNow = new Date("2026-06-10T09:21:00.000Z");
    await json("/api/tickets/TKT-1001/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Maya Chen",
        body: "Okay. What is the problem?",
        source: "manual",
      }),
    });
    currentNow = new Date("2026-06-10T09:22:00.000Z");
    const explanation = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const explanationDraft =
      explanation.body.recommendation.draftCustomerResponse;

    expect(explanationDraft).toContain(
      "the examples point to a delay after the events were accepted",
    );
    expect(explanationDraft).toContain(
      "enough confidence to treat this as a platform-side processing delay",
    );
    expect(explanationDraft).not.toContain("not yet a confirmed root cause");
    expect(explanationDraft).not.toContain("please share:");
  });

  it("rejects fix before diagnosis is recorded", async () => {
    const { deps, json } = await startFixture();
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));
    const created = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "approval-desk",
        customerReplies: [
          {
            id: "reply-complete-blank-page-evidence",
            createdAt: "2026-06-10T09:35:00.000Z",
            body:
              "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
          },
        ],
      }),
    });
    const recommendation = created.body.recommendation;
    await json(`/api/recommendations/${recommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        expectedRevision: 1,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    await json(`/api/recommendations/${recommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        actor: "matias-reviewer",
      }),
    });

    const fix = await json("/api/tickets/TKT-1010/fix", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(fix.status).toBe(400);
    expect(fix.body.error.message).toBe(
      "A completed diagnosis is required before marking a fix available.",
    );
  });

  it("rejects fix while the latest diagnosis is ambiguous and unreviewed", async () => {
    const { deps, json } = await startFixture();
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));
    await json("/api/tickets/TKT-1010/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Mia Johnson",
        source: "manual",
        body:
          "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
      }),
    });
    const first = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const firstRecommendation = first.body.recommendation;
    await json(`/api/recommendations/${firstRecommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        expectedRevision: 1,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: firstRecommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    await json(`/api/recommendations/${firstRecommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({ ticketId: "TKT-1010", actor: "matias-reviewer" }),
    });
    await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    const diagnosisDraft = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const diagnosisRecommendation = diagnosisDraft.body.recommendation;
    await json(`/api/recommendations/${diagnosisRecommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        expectedRevision: await ticketRevision(json, "TKT-1010"),
        approvedFields: ["customerResponse"],
        editedCustomerResponse: diagnosisRecommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    const likelyDiagnosisSent = await json(`/api/recommendations/${diagnosisRecommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({ ticketId: "TKT-1010", actor: "matias-reviewer" }),
    });
    expect(likelyDiagnosisSent.body.automaticReply).toMatchObject({
      action: "customer-reply-received",
      actor: "Jamie Lee",
      after: {
        source: "demo-auto-reply",
      },
    });
    expect(likelyDiagnosisSent.body.automaticReply.after.body).toContain(
      "private",
    );
    expect(likelyDiagnosisSent.body.automaticReply.after.body).toContain(
      "Microsoft Edge",
    );
    expect(likelyDiagnosisSent.body.automaticReply.after.body).toContain(
      "another admin",
    );
    expect(likelyDiagnosisSent.body.automaticReply.after.body).toContain(
      "ChunkLoadError",
    );
    expect(likelyDiagnosisSent.body.automaticReply.after.body).not.toMatch(
      /available for this ticket/i,
    );
    const fix = await json("/api/tickets/TKT-1010/fix", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(fix.status).toBe(400);
    expect(fix.body.error.message).toBe(
      "An approved current diagnosis is required before marking a fix available.",
    );
  });

  it("confirms TKT-1010 frontend loading evidence before allowing a fix", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));
    await json("/api/tickets/TKT-1010/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Mia Johnson",
        source: "manual",
        body:
          "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
      }),
    });
    const first = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const firstRecommendation = first.body.recommendation;
    await approveAndSend(json, "TKT-1010", firstRecommendation);
    await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    const diagnosisDraft = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1010", diagnosisDraft.body.recommendation);
    currentNow = new Date("2026-06-10T09:05:00.000Z");
    const confirmedEvaluation = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(confirmedEvaluation.body.recommendation.draftCustomerResponse).not.toContain(
      "Please try these quick browser-session checks first",
    );
    await approveAndSend(json, "TKT-1010", confirmedEvaluation.body.recommendation);

    const confirmedDiagnosis = await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(confirmedDiagnosis.status, JSON.stringify(confirmedDiagnosis.body)).toBe(201);
    expect(confirmedDiagnosis.body.auditEvent.after.diagnosis).toMatchObject({
      confidence: "confirmed",
      owner: "engineering",
    });
    expect(
      confirmedDiagnosis.body.auditEvent.after.diagnosis.customerSafeSummary,
    ).toContain("frontend loading issue");
    const confirmedDiagnosisDraft = await json(
      "/api/tickets/TKT-1010/recommendations",
      {
        method: "POST",
        body: JSON.stringify({ actor: "approval-desk" }),
      },
    );
    expect(
      confirmedDiagnosisDraft.body.recommendation.draftCustomerResponse,
    ).toContain("frontend loading issue");
    expect(
      confirmedDiagnosisDraft.body.recommendation.draftCustomerResponse,
    ).not.toContain("Please try these quick browser-session checks first");
    await approveAndSend(
      json,
      "TKT-1010",
      confirmedDiagnosisDraft.body.recommendation,
    );
    await approveLatestDiagnosis(deps, "TKT-1010");
    const fix = await json("/api/tickets/TKT-1010/fix", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    expect(fix.status).toBe(201);

    const afterFix = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    expect(afterFix.status).toBe(201);
    expect(afterFix.body.recommendation.draftCustomerResponse).toContain(
      "mitigation has been applied",
    );
    expect(afterFix.body.recommendation.draftCustomerResponse).toContain(
      "Let us know whether the editor now loads normally",
    );
    expect(afterFix.body.recommendation.draftCustomerResponse).not.toContain(
      "Please share",
    );
  });

  it("rejects fix when a confirmed TKT-1010 diagnosis does not need a platform fix", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));
    await json("/api/tickets/TKT-1010/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Mia Johnson",
        source: "manual",
        body:
          "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
      }),
    });
    const first = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1010", first.body.recommendation);
    await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    const diagnosisDraft = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await json(`/api/recommendations/${diagnosisDraft.body.recommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        expectedRevision: await ticketRevision(json, "TKT-1010"),
        approvedFields: ["customerResponse"],
        editedCustomerResponse: diagnosisDraft.body.recommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    await deps.service.markResponseSent({
      recommendationId: diagnosisDraft.body.recommendation.id,
      ticketId: "TKT-1010",
      actor: "matias-reviewer",
      sentAt: currentNow.toISOString(),
      customerResponse: diagnosisDraft.body.recommendation.draftCustomerResponse,
    });
    currentNow = new Date("2026-06-10T09:05:00.000Z");
    await json("/api/tickets/TKT-1010/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Mia Johnson",
        source: "manual",
        body:
          "The campaign editor works in a private/incognito window, so this seems tied to my browser session.",
      }),
    });
    const confirmedEvaluation = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1010", confirmedEvaluation.body.recommendation);
    const confirmedDiagnosis = await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    expect(confirmedDiagnosis.status).toBe(201);
    expect(confirmedDiagnosis.body.auditEvent.after.diagnosis).toMatchObject({
      confidence: "confirmed",
      owner: "customer",
    });
    const confirmedDiagnosisDraft = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(
      confirmedDiagnosisDraft.body.recommendation.draftCustomerResponse,
    ).toContain("browser session");
    expect(
      confirmedDiagnosisDraft.body.recommendation.draftCustomerResponse,
    ).toContain("clear site data");
    expect(
      confirmedDiagnosisDraft.body.recommendation.draftCustomerResponse,
    ).not.toContain("frontend engineering");
    await approveAndSend(json, "TKT-1010", confirmedDiagnosisDraft.body.recommendation);
    await approveLatestDiagnosis(deps, "TKT-1010");

    const fix = await json("/api/tickets/TKT-1010/fix", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });

    expect(fix.status).toBe(400);
    expect(fix.body.error.message).toBe(
      "This confirmed diagnosis does not require a platform fix.",
    );
  });

  it("automatically adds a ticket-specific customer reply after a fix response is done", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    await deps.tickets.update("TKT-1010", 0, (ticket) => ({
      ...ticket,
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...ticket.tags, "performance"],
    }));
    await json("/api/tickets/TKT-1010/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Mia Johnson",
        source: "manual",
        body:
          "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.",
      }),
    });
    const first = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const firstRecommendation = first.body.recommendation;
    await approveAndSend(json, "TKT-1010", firstRecommendation);
    await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    const diagnosisDraft = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const diagnosisRecommendation = diagnosisDraft.body.recommendation;
    await approveAndSend(json, "TKT-1010", diagnosisRecommendation);
    currentNow = new Date("2026-06-10T09:05:00.000Z");
    const confirmedEvaluation = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1010", confirmedEvaluation.body.recommendation);
    const confirmedDiagnosis = await json("/api/tickets/TKT-1010/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    expect(confirmedDiagnosis.status).toBe(201);
    const confirmedDiagnosisDraft = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1010", confirmedDiagnosisDraft.body.recommendation);
    await approveLatestDiagnosis(deps, "TKT-1010");
    await json("/api/tickets/TKT-1010/fix", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    const fixDraft = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const fixRecommendation = fixDraft.body.recommendation;
    await json(`/api/recommendations/${fixRecommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1010",
        expectedRevision: await ticketRevision(json, "TKT-1010"),
        approvedFields: ["customerResponse"],
        editedCustomerResponse: fixRecommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });

    const sent = await json(`/api/recommendations/${fixRecommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({ ticketId: "TKT-1010", actor: "matias-reviewer" }),
    });
    const detail = await json("/api/tickets/TKT-1010");

    expect(sent.status).toBe(200);
    expect(sent.body.automaticReply).toMatchObject({
      action: "customer-reply-received",
      after: {
        body: expect.stringContaining("It works now"),
        source: "demo-auto-reply",
      },
    });
    expect(detail.body.recommendationSummary.workflowState).toBe("customer-replied");
    expect(detail.body.conversationTimeline).toContainEqual(
      expect.objectContaining({
        kind: "customer-reply",
        body: expect.stringContaining("It works now"),
      }),
    );
  });

  it("automatically adds ticket-specific evidence replies after an information request is done", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { json } = await startFixture({}, { now: () => currentNow });
    const created = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const recommendation = created.body.recommendation;
    await json(`/api/recommendations/${recommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1008",
        expectedRevision: await ticketRevision(json, "TKT-1008"),
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    currentNow = new Date("2026-06-10T09:05:00.000Z");

    const sent = await json(`/api/recommendations/${recommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({ ticketId: "TKT-1008", actor: "matias-reviewer" }),
    });
    const detail = await json("/api/tickets/TKT-1008");

    expect(sent.status).toBe(200);
    expect(sent.body.automaticReply).toMatchObject({
      action: "customer-reply-received",
      actor: "Lina Weber",
      after: {
        body: expect.stringContaining("webhook"),
        source: "demo-auto-reply",
      },
    });
    expect(sent.body.automaticReply.after.body).toContain("endpoint");
    expect(sent.body.automaticReply.after.body).toContain("delivery");
    expect(sent.body.automaticReply.after.body).not.toContain(
      "It works now",
    );
    expect(detail.body.recommendationSummary.workflowState).toBe(
      "customer-replied",
    );
    expect(detail.body.conversationTimeline).toContainEqual(
      expect.objectContaining({
        kind: "customer-reply",
        body: expect.stringContaining("webhook"),
      }),
    );
  });

  it("can disable automatic replies for an Approval Desk testing run", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const recommendation = created.body.recommendation;
    await json(`/api/recommendations/${recommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1008",
        expectedRevision: await ticketRevision(json, "TKT-1008"),
        approvedFields: ["customerResponse"],
        editedCustomerResponse: recommendation.draftCustomerResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });

    const sent = await json(`/api/recommendations/${recommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1008",
        actor: "matias-reviewer",
        automaticReplyEnabled: false,
      }),
    });
    const detail = await json("/api/tickets/TKT-1008");

    expect(sent.status).toBe(200);
    expect(sent.body.automaticReply).toBeUndefined();
    expect(detail.body.conversationTimeline).not.toContainEqual(
      expect.objectContaining({ kind: "customer-reply" }),
    );
  });

  it("closes a ready-for-close ticket after the closing response is sent", async () => {
    let currentNow = new Date("2026-06-10T09:00:00.000Z");
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    const diagnosisRecommendation = await createDiagnosedPlatformDelayTicket(
      json,
      (value) => {
        currentNow = new Date(value);
      },
    );
    await approveAndSend(json, "TKT-1001", diagnosisRecommendation);
    currentNow = new Date("2026-06-10T09:17:00.000Z");
    await json("/api/tickets/TKT-1001/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Maya Chen",
        body:
          "This affects multiple EU stores. The tracking calls were accepted successfully by the API, but the checkout events are still missing from the profile timelines.",
        source: "manual",
      }),
    });
    currentNow = new Date("2026-06-10T09:18:00.000Z");
    const confirmed = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", confirmed.body.recommendation);
    currentNow = new Date("2026-06-10T09:19:00.000Z");
    await json("/api/tickets/TKT-1001/diagnosis", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    currentNow = new Date("2026-06-10T09:20:00.000Z");
    const diagnosisUpdate = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", diagnosisUpdate.body.recommendation);
    await approveLatestDiagnosis(deps, "TKT-1001");
    currentNow = new Date("2026-06-10T09:21:00.000Z");
    await json("/api/tickets/TKT-1001/fix", {
      method: "POST",
      body: JSON.stringify({ actor: "product-support" }),
    });
    currentNow = new Date("2026-06-10T09:22:00.000Z");
    const fixDraft = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1001", fixDraft.body.recommendation);
    currentNow = new Date("2026-06-10T09:23:00.000Z");
    await json("/api/tickets/TKT-1001/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Maya Chen",
        body: "That fixed it. Thanks for the help!",
        source: "manual",
      }),
    });
    currentNow = new Date("2026-06-10T09:24:00.000Z");
    const closingDraft = await json("/api/tickets/TKT-1001/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(closingDraft.body.recommendation.supportState).toBe("ready-for-close");
    await approveAndSend(json, "TKT-1001", closingDraft.body.recommendation);
    await approveLatestDiagnosis(deps, "TKT-1001");
    currentNow = new Date("2026-06-10T09:25:00.000Z");

    const close = await json("/api/tickets/TKT-1001/close", {
      method: "POST",
      body: JSON.stringify({ actor: "matias-reviewer" }),
    });
    const detail = await json("/api/tickets/TKT-1001");

    expect(close.status).toBe(200);
    expect(close.body.ticket).toMatchObject({
      id: "TKT-1001",
      status: "resolved",
    });
    expect(close.body.auditEvent).toMatchObject({
      action: "ticket-updated",
      actor: "matias-reviewer",
      ticketId: "TKT-1001",
      recommendationId: closingDraft.body.recommendation.id,
      after: {
        status: "resolved",
        closedAt: "2026-06-10T09:25:00.000Z",
      },
    });
    expect(detail.body.recommendationSummary.workflowState).toBe("resolved");
    expect(detail.body.conversationTimeline).toContainEqual(
      expect.objectContaining({
        kind: "customer-reply",
        body: expect.stringContaining("That fixed it"),
      }),
    );
    expect(await deps.tickets.get("TKT-1001")).toMatchObject({
      status: "resolved",
    });
  });

  it("delegates HTTP closure authority to the serialized service transition", async () => {
    const { deps, json } = await startFixture();
    const close = vi.spyOn(deps.service, "closeTicket").mockRejectedValue(
      new DomainError(
        "Evaluate the latest customer reply before closing the ticket.",
        "INVALID_APPROVAL_FIELDS",
      ),
    );

    const response = await json("/api/tickets/TKT-1001/close", {
      method: "POST",
      body: JSON.stringify({ actor: "matias-reviewer" }),
    });

    expect(close).toHaveBeenCalledWith({
      ticketId: "TKT-1001",
      actor: "matias-reviewer",
      closedAt: now.toISOString(),
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      "Evaluate the latest customer reply before closing the ticket.",
    );
  });

  it("rejects an HTTP close when a reply arrives after the adapter preview", async () => {
    const { deps, json } = await startFixture();
    await seedReadyToCloseWorkflow(deps, "TKT-1001");
    const original = deps.service.closeTicket.bind(deps.service);
    vi.spyOn(deps.service, "closeTicket").mockImplementation(async (input) => {
      await deps.service.addCustomerReply({
        ticketId: input.ticketId,
        actor: "Maya Chen",
        body: "A new reply arrived after the HTTP close preview.",
        receivedAt: "2026-06-10T09:02:00.0001Z",
        source: "race-regression",
      });
      return original(input);
    });

    const response = await json("/api/tickets/TKT-1001/close", {
      method: "POST",
      body: JSON.stringify({ actor: "matias-reviewer" }),
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "INVALID_APPROVAL_FIELDS",
      message: "Evaluate the latest customer reply before closing the ticket.",
    });
    await expect(deps.tickets.get("TKT-1001")).resolves.toMatchObject({
      status: "triage",
    });
  });

  it("rejects closing before a ready-for-close response has been sent", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await approveAndSend(json, "TKT-1005", created.body.recommendation);

    const close = await json("/api/tickets/TKT-1005/close", {
      method: "POST",
      body: JSON.stringify({ actor: "matias-reviewer" }),
    });

    expect(close.status).toBe(400);
    expect(close.body.error.message).toContain("ready-to-close");
  });

  it("creates recommendations with a provider draft from cited knowledge", async () => {
    const seenArticleBodies: string[] = [];
    const seenResponseStyles: string[] = [];
    const { json } = await startFixture({
      draftProvider: {
        draft: async (input) => {
          seenArticleBodies.push(
            ...input.knowledgeArticles.map((article) => article.body),
          );
          seenResponseStyles.push(input.responseStyle);
          return {
            source: "openai",
            response:
              "We are checking the webhook signature validation, delivery timestamp, endpoint response, and signing configuration before recommending the next update.",
            assist: {
              source: "openai",
              missingInfoSuggestions: [
                "Share the delivery ID.",
                "Share the endpoint URL.",
              ],
              investigationSteps: [
                "Compare the signed payload with delivery headers.",
              ],
              tone: "technical",
              recommendedTone: "technical",
              selectedTone: "technical",
              toneReason:
                "Requester is a developer working on webhook verification.",
              audience: "developer",
              checks: [],
            },
          };
        },
      },
    });

    const created = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "approval-desk",
        responseStyle: "technical",
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation).toMatchObject({
      ticketId: "TKT-1008",
      draftCustomerResponseSource: "openai",
      draftCustomerResponseStyle: "technical",
      draftCustomerResponse:
        "We are checking the webhook signature validation, delivery timestamp, endpoint response, and signing configuration before recommending the next update.\n\nKind regards,\nSupport Team\nNorthstar Marketing Support",
      gptAssist: {
        source: "openai",
        tone: "technical",
        recommendedTone: "technical",
        selectedTone: "technical",
        toneReason:
          "Requester is a developer working on webhook verification.",
        audience: "developer",
        missingInfoSuggestions: [
          "Share the delivery ID.",
          "Share the endpoint URL.",
        ],
      },
    });
    expect(created.body.recommendation.draftCustomerResponseChecks).toContainEqual(
      expect.objectContaining({
        id: "no-internal-article-ids",
        status: "pass",
      }),
    );
    expect(seenArticleBodies.join("\n")).toContain("webhook");
    expect(seenResponseStyles).toEqual(["technical"]);
  });

  it("marks an approved recommendation as sent at the reviewer click time", async () => {
    let currentNow = now;
    const { json } = await startFixture({}, { now: () => currentNow });
    const approvedResponse =
      "Hi Prompt Streetwear, we reviewed this response and it is ready to send.";
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const approved = await json(
      `/api/recommendations/${created.body.recommendation.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          expectedRevision: 0,
          approvedFields: ["customerResponse"],
          editedCustomerResponse: approvedResponse,
          actor: "matias-reviewer",
          confirm: true,
        }),
      },
    );
    currentNow = new Date("2026-06-10T10:00:00.000Z");

    const sent = await json(
      `/api/recommendations/${created.body.recommendation.id}/mark-sent`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          actor: "approval-desk",
        }),
      },
    );
    const detail = await json("/api/tickets/TKT-1005");

    expect(approved.status).toBe(200);
    expect(sent.status).toBe(200);
    expect(sent.body.auditEvent).toMatchObject({
      action: "customer-response-sent",
      timestamp: "2026-06-10T10:00:00.000Z",
      after: {
        sentAt: "2026-06-10T10:00:00.000Z",
        customerResponse: approvedResponse,
      },
    });
    expect(detail.body.recommendationSummary).toMatchObject({
      latestRecommendationId: created.body.recommendation.id,
      latestResolution: "approved",
      workflowState: "customer-replied",
      hasSentResponse: true,
      hasCustomerReply: true,
      latestSentAt: "2026-06-10T10:00:00.000Z",
    });
    expect(sent.body.automaticReply).toMatchObject({
      action: "customer-reply-received",
      after: {
        source: "demo-auto-reply",
      },
    });
    expect(detail.body.conversationTimeline).toContainEqual(
      expect.objectContaining({
        kind: "support-response-sent",
        timestamp: "2026-06-10T10:00:00.000Z",
        recommendationId: created.body.recommendation.id,
        body: approvedResponse,
      }),
    );
    expect(detail.body.recommendationHistory).toMatchObject([
      {
        id: created.body.recommendation.id,
        resolution: "approved",
      },
    ]);
  });

  it("rejects mark-sent when the customer response was not approved", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await json(`/api/recommendations/${created.body.recommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1005",
        expectedRevision: 0,
        approvedFields: ["category"],
        actor: "matias-reviewer",
        confirm: true,
      }),
    });

    const sent = await json(
      `/api/recommendations/${created.body.recommendation.id}/mark-sent`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          actor: "approval-desk",
        }),
      },
    );
    const detail = await json("/api/tickets/TKT-1005");

    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message:
          "Customer response must be approved before it can be marked sent.",
      },
    });
    expect(detail.body.audits.events).not.toContainEqual(
      expect.objectContaining({ action: "customer-response-sent" }),
    );
  });

  it("rejects duplicate mark-sent requests for the same recommendation", async () => {
    const { json } = await startFixture();
    const approvedResponse =
      "Hi Prompt Streetwear, we reviewed this response and it is ready to send.";
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await json(`/api/recommendations/${created.body.recommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1005",
        expectedRevision: 0,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: approvedResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    await json(`/api/recommendations/${created.body.recommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1005",
        actor: "approval-desk",
      }),
    });

    const duplicate = await json(
      `/api/recommendations/${created.body.recommendation.id}/mark-sent`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          actor: "approval-desk",
        }),
      },
    );
    const detail = await json("/api/tickets/TKT-1005");

    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Customer response has already been marked sent.",
      },
    });
    expect(
      detail.body.audits.events.filter(
        (event: any) => event.action === "customer-response-sent",
      ),
    ).toHaveLength(1);
  });

  it("records a customer reply after a sent response and marks the ticket customer-replied", async () => {
    let currentNow = now;
    const { json } = await startFixture({}, { now: () => currentNow });
    const approvedResponse =
      "Hi Prompt Streetwear, we reviewed this response and it is ready to send.";
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await json(`/api/recommendations/${created.body.recommendation.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1005",
        expectedRevision: 0,
        approvedFields: ["customerResponse"],
        editedCustomerResponse: approvedResponse,
        actor: "matias-reviewer",
        confirm: true,
      }),
    });
    await json(`/api/recommendations/${created.body.recommendation.id}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({
        ticketId: "TKT-1005",
        actor: "approval-desk",
      }),
    });
    currentNow = new Date("2026-06-10T09:06:00.000Z");

    const reply = await json("/api/tickets/TKT-1005/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Maya Chen",
        body: "Thanks, I tried the suggested checks and the flow is still not working.",
        source: "email",
      }),
    });
    const detail = await json("/api/tickets/TKT-1005");

    expect(reply.status).toBe(201);
    expect(reply.body.auditEvent).toMatchObject({
      action: "customer-reply-received",
      timestamp: "2026-06-10T09:06:00.000Z",
      actor: "Maya Chen",
      after: {
        body: "Thanks, I tried the suggested checks and the flow is still not working.",
        source: "email",
      },
    });
    expect(detail.body.recommendationSummary).toMatchObject({
      workflowState: "customer-replied",
      hasSentResponse: true,
      hasCustomerReply: true,
      latestSentAt: "2026-06-10T09:00:00.000Z",
      latestCustomerReplyAt: "2026-06-10T09:06:00.000Z",
    });
    expect(detail.body.conversationTimeline).toContainEqual(
      expect.objectContaining({
        kind: "customer-reply",
        timestamp: "2026-06-10T09:06:00.000Z",
        actor: "Maya Chen",
        body: "Thanks, I tried the suggested checks and the flow is still not working.",
      }),
    );
  });

  it("supersedes an earlier pending recommendation when creating after a customer reply", async () => {
    let currentNow = now;
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    const first = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    currentNow = new Date("2026-06-10T09:02:00.000Z");
    await json("/api/tickets/TKT-1008/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Dev Support",
        body:
          "Endpoint URL is https://hooks.juniper.example/webhooks/orders and delivery ID is deliv_7788.",
      }),
    });
    currentNow = new Date("2026-06-10T09:03:00.000Z");

    const second = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const detail = await json("/api/tickets/TKT-1008");

    expect(second.status).toBe(201);
    expect(await deps.recommendations.get(first.body.recommendation.id)).toMatchObject({
      resolution: "superseded",
    });
    expect(second.body.recommendation).toMatchObject({
      ticketId: "TKT-1008",
      resolution: "pending",
      supportState: "information-received",
    });
    expect(second.body.recommendation.providedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "endpoint-url" }),
        expect.objectContaining({ id: "delivery-id" }),
      ]),
    );
    expect(detail.body.recommendationSummary).toMatchObject({
      latestRecommendationId: second.body.recommendation.id,
      workflowState: "draft-ready",
      hasPendingRecommendation: true,
    });
    expect(detail.body.recommendationHistory).toMatchObject([
      {
        id: second.body.recommendation.id,
        resolution: "pending",
      },
      {
        id: first.body.recommendation.id,
        resolution: "superseded",
      },
    ]);
  });

  it("uses multiple customer replies to complete known-cause evidence", async () => {
    let currentNow = now;
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    const first = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    currentNow = new Date("2026-06-10T09:02:00.000Z");
    await json("/api/tickets/TKT-1008/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Dev Support",
        body:
          "Endpoint URL is https://hooks.juniper.example/webhooks/orders and delivery ID is deliv_7788.",
      }),
    });
    currentNow = new Date("2026-06-10T09:03:00.000Z");
    await json("/api/tickets/TKT-1008/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Dev Support",
        body:
          "We rotated the signing secret yesterday at 08:10 UTC. Raw body handling has not changed since yesterday.",
      }),
    });
    currentNow = new Date("2026-06-10T09:04:00.000Z");

    const second = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    expect(second.status).toBe(201);
    expect(await deps.recommendations.get(first.body.recommendation.id)).toMatchObject({
      resolution: "superseded",
    });
    expect(second.body.recommendation).toMatchObject({
      supportState: "known-cause",
      knownCause: "webhook-secret-rotation",
      missingEvidence: [],
    });
    expect(second.body.recommendation.providedEvidence.map((item: any) => item.id)).toEqual(
      expect.arrayContaining([
        "endpoint-url",
        "delivery-id",
        "signing-secret-rotation-time",
        "raw-body-change-status",
      ]),
    );
  });

  it("keeps the earlier pending recommendation when replacement creation fails", async () => {
    let currentNow = now;
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    const first = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    currentNow = new Date("2026-06-10T09:02:00.000Z");
    await json("/api/tickets/TKT-1008/customer-replies", {
      method: "POST",
      body: JSON.stringify({
        actor: "Dev Support",
        body:
          "Endpoint URL is https://hooks.juniper.example/webhooks/orders and delivery ID is deliv_7788.",
      }),
    });
    deps.service.submit = async () => {
      throw new Error("submit failed");
    };

    const response = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    expect(response.status).toBe(500);
    expect(await deps.recommendations.get(first.body.recommendation.id)).toMatchObject({
      resolution: "pending",
    });
    expect(await deps.recommendations.list()).toHaveLength(1);
    expect(await deps.audits.list("TKT-1008")).not.toContainEqual(
      expect.objectContaining({ action: "recommendation-superseded" }),
    );
  });

  it("does not supersede a pending recommendation when create is clicked twice without a new reply", async () => {
    let currentNow = now;
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    const first = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    currentNow = new Date("2026-06-10T09:01:00.000Z");

    const second = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    const detail = await json("/api/tickets/TKT-1005");

    expect(second.status).toBe(201);
    expect(await deps.recommendations.get(first.body.recommendation.id)).toMatchObject({
      resolution: "pending",
    });
    expect(detail.body.recommendationSummary).toMatchObject({
      latestRecommendationId: second.body.recommendation.id,
      workflowState: "draft-ready",
      hasPendingRecommendation: true,
    });
    expect(detail.body.recommendationHistory).toMatchObject([
      {
        id: second.body.recommendation.id,
        resolution: "pending",
      },
      {
        id: first.body.recommendation.id,
        resolution: "pending",
      },
    ]);
  });

  it("does not supersede a pending recommendation from body-only customer reply context", async () => {
    let currentNow = now;
    const { deps, json } = await startFixture({}, { now: () => currentNow });
    const first = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    currentNow = new Date("2026-06-10T09:02:00.000Z");

    const second = await json("/api/tickets/TKT-1008/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "approval-desk",
        customerReplies: [
          {
            id: "body-only-reply",
            createdAt: "2026-06-10T09:01:00.000Z",
            body:
              "Endpoint URL is https://hooks.juniper.example/webhooks/orders and delivery ID is deliv_7788.",
          },
        ],
      }),
    });
    const detail = await json("/api/tickets/TKT-1008");

    expect(second.status).toBe(201);
    expect(await deps.recommendations.get(first.body.recommendation.id)).toMatchObject({
      resolution: "pending",
    });
    expect(second.body.recommendation.providedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "endpoint-url" }),
        expect.objectContaining({ id: "delivery-id" }),
      ]),
    );
    expect(detail.body.recommendationHistory).toMatchObject([
      {
        id: second.body.recommendation.id,
        resolution: "pending",
      },
      {
        id: first.body.recommendation.id,
        resolution: "pending",
      },
    ]);
  });

  it("uses classifier routing and classifier-selected knowledge by default", async () => {
    const seenArticleIds: string[][] = [];
    const { json } = await startFixture({
      draftProvider: {
        draft: async (input) => {
          seenArticleIds.push(input.knowledgeArticles.map(({ id }) => id));
          throw new Error("Use the deterministic fallback after capturing articles.");
        },
      },
    });

    const created = await json("/api/tickets/TKT-1004/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation).toMatchObject({
      category: "security",
      priority: "P1",
      team: "security",
      knowledgeArticleIds: ["security-incident-response"],
      classificationSignals: expect.arrayContaining([
        expect.objectContaining({ target: "risk:security" }),
      ]),
    });
    expect(seenArticleIds).toEqual([["security-incident-response"]]);
  });

  it("passes GPT advisory classification signals from the reasoning provider into recommendation creation", async () => {
    const { json } = await startFixture({
      classificationReasoningProvider: {
        async reason() {
          return {
            reasoning: {
              issueType: "campaign-editor",
              candidateCategory: "performance",
              candidateTeam: "product",
              knowledgeArticleIds: ["campaign-send-failures"],
              confidence: 0.9,
              evidence: ["customer says the campaign editor page stays blank"],
              missingEvidenceThatWouldChangeClassification: [],
              explanation: "The reply describes a campaign editor loading failure.",
            },
            telemetry: { model: "gpt-5.6-luna", latencyMs: 1 },
          };
        },
      },
    });

    const created = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "approval-desk",
        customerReplies: [
          {
            id: "demo-reply-1",
            createdAt: "2026-06-10T09:05:00.000Z",
            body: "The editor opens but the content area never finishes loading after I click Edit.",
          },
        ],
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation).toMatchObject({
      category: "performance",
      team: "product",
      knowledgeArticleIds: ["campaign-send-failures"],
    });
    expect(created.body.recommendation.classificationSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "gpt-advisory-campaign-editor-category",
          target: "category:performance",
        }),
      ]),
    );
  });

  it("accepts auto draft style and returns the resolved recommended style", async () => {
    const { json } = await startFixture();

    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "approval-desk",
        responseStyle: "auto",
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation).toMatchObject({
      ticketId: "TKT-1005",
      draftCustomerResponseStyle: "empathetic",
      gptAssist: {
        recommendedTone: "empathetic",
        selectedTone: "empathetic",
        toneReason: expect.stringContaining("Marketing Coordinator"),
      },
    });
  });

  it("adds reviewer and company sign-off to created customer drafts", async () => {
    const { json } = await startFixture();

    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({
        actor: "Matias Laukka",
        responseStyle: "auto",
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.recommendation.draftCustomerResponse).toContain(
      "Kind regards,\nMatias Laukka\nNorthstar Marketing Support",
    );
  });

  it("reports automation evidence after recommendation submission", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const evidence = await json("/api/evidence");

    expect(evidence.status).toBe(200);
    expect(evidence.body.generatedAt).toBe(now.toISOString());
    expect(evidence.body.summary).toMatchObject({
      openTickets: 29,
      pendingRecommendations: 1,
      approvedRecommendations: 0,
      rejectedRecommendations: 0,
      estimatedMinutesSaved: 0,
      averageConfidence: 0.95,
      averageApprovedConfidence: null,
      lowConfidenceCount: 0,
      confidenceBandCounts: { low: 0, medium: 0, high: 1 },
      potentialMinutesSaved: 8,
      auditEvents: 1,
      safetyBlocks: 0,
      activeGuardrails: 6,
    });
    expect(evidence.body.guardrails).toContainEqual(
      expect.objectContaining({
        id: "submission-is-not-mutation",
        status: "active",
      }),
    );
    expect(evidence.body.recentActivity).toContainEqual(
      expect.objectContaining({
        action: "recommendation-submitted",
        recommendationId: created.body.recommendation.id,
        result: "success",
      }),
    );
  });

  it("rejects oversized JSON request bodies before normal route handling", async () => {
    const { deps, json } = await startFixture();

    const oversized = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "x".repeat(65_536) }),
    });

    expect(oversized.status).toBe(400);
    expect(oversized.body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Request body must be 65536 bytes or less.",
      },
    });
    expect(await deps.recommendations.list()).toEqual([]);
    expect(
      await deps.audits.listPage({ ticketId: "TKT-1005", offset: 0, limit: 10 }),
    ).toMatchObject({ total: 0, events: [] });
  });

  it("maps stale approval to 409 and exposes the safety block in evidence", async () => {
    const { deps, json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    await deps.tickets.update("TKT-1005", 0, (ticket) => ({
      ...ticket,
      assignee: "concurrent-reviewer@example.test",
    }));

    const stale = await json(
      `/api/recommendations/${created.body.recommendation.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          expectedRevision: 0,
          approvedFields: ["category"],
          actor: "matias-reviewer",
          confirm: true,
        }),
      },
    );
    const detail = await json("/api/tickets/TKT-1005");
    const evidence = await json("/api/evidence");

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STALE_APPROVAL");
    expect(detail.body.audits.events).toEqual([
      expect.objectContaining({
        action: "recommendation-submitted",
        result: "success",
      }),
      expect.objectContaining({
        action: "approval-rejected",
        recommendationId: created.body.recommendation.id,
        result: "rejected",
      }),
    ]);
    expect(evidence.status).toBe(200);
    expect(evidence.body.summary.safetyBlocks).toBe(1);
    expect(evidence.body.recentActivity).toContainEqual(
      expect.objectContaining({
        action: "approval-rejected",
        recommendationId: created.body.recommendation.id,
        result: "rejected",
      }),
    );
  });

  it("counts evidence audit events and safety blocks beyond the first audit page", async () => {
    const { deps, json } = await startFixture();
    for (let index = 0; index < 51; index += 1) {
      const suffix = index.toString(16).padStart(12, "0");
      await deps.audits.append(
        AuditEventSchema.parse({
          id: `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`,
          timestamp: now.toISOString(),
          actor: "approval-desk",
          action: "approval-rejected",
          ticketId: "TKT-1005",
          recommendationId: `bbbbbbbb-bbbb-4bbb-8bbb-${suffix}`,
          before: {},
          after: {},
          rationale: "Approval revision is stale.",
          knowledgeArticleIds: [],
          result: "rejected",
          rejectionReason: "Approval revision is stale.",
        }),
      );
    }

    const evidence = await json("/api/evidence");

    expect(evidence.status).toBe(200);
    expect(evidence.body.summary.auditEvents).toBe(51);
    expect(evidence.body.summary.safetyBlocks).toBe(51);
  });

  it("approves selected fields and records the reviewer audit", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const approved = await json(
      `/api/recommendations/${created.body.recommendation.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          expectedRevision: 0,
          approvedFields: ["category", "priority", "team"],
          actor: "matias-reviewer",
          confirm: true,
        }),
      },
    );

    expect(approved.status).toBe(200);
    expect(approved.body.ticket).toMatchObject({
      id: "TKT-1005",
      revision: 1,
      category: "integration",
      priority: "P2",
      team: "integrations",
    });
    expect(approved.body.auditEvent).toMatchObject({
      action: "recommendation-approved",
      actor: "matias-reviewer",
    });
  });

  it("cancels an approved recommendation and returns the ticket workflow to active", async () => {
    const { deps, json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const approved = await json(
      `/api/recommendations/${created.body.recommendation.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          expectedRevision: 0,
          approvedFields: ["category"],
          actor: "matias-reviewer",
          confirm: true,
        }),
      },
    );
    expect(approved.status).toBe(200);

    const canceled = await json(
      `/api/recommendations/${created.body.recommendation.id}/cancel-approval`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          actor: "matias-reviewer",
          reason: "Replacing the approved recommendation with a better draft.",
        }),
      },
    );

    expect(canceled.status).toBe(200);
    expect(canceled.body.auditEvent).toMatchObject({
      action: "recommendation-canceled",
      actor: "matias-reviewer",
      before: { resolution: "approved" },
      after: { resolution: "canceled" },
    });
    expect((await deps.recommendations.get(created.body.recommendation.id))).toMatchObject({
      resolution: "canceled",
    });

    const detail = await json("/api/tickets/TKT-1005");
    expect(detail.body.recommendationSummary).toMatchObject({
      hasPendingRecommendation: false,
      hasApprovedRecommendation: false,
      workflowState: "active",
    });
    expect(detail.body).not.toHaveProperty("latestRecommendation");
  });

  it("approves reviewer-edited field values through the local API", async () => {
    const { json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const approved = await json(
      `/api/recommendations/${created.body.recommendation.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          expectedRevision: 0,
          approvedFields: ["category", "priority", "team"],
          fieldOverrides: {
            category: "incident",
            priority: "P1",
            team: "incident-response",
          },
          actor: "matias-reviewer",
          confirm: true,
        }),
      },
    );

    expect(approved.status).toBe(200);
    expect(approved.body.ticket).toMatchObject({
      id: "TKT-1005",
      revision: 1,
      category: "incident",
      priority: "P1",
      team: "incident-response",
    });
    expect(approved.body.auditEvent.after).toMatchObject({
      category: "incident",
      priority: "P1",
      team: "incident-response",
    });
  });

  it("rejects customer response approval without edited customer text", async () => {
    const { deps, json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const rejected = await json(
      `/api/recommendations/${created.body.recommendation.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          expectedRevision: 0,
          approvedFields: ["customerResponse"],
          actor: "matias-reviewer",
          confirm: true,
        }),
      },
    );

    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "editedCustomerResponse is required when customerResponse is approved.",
      },
    });
    expect((await deps.recommendations.get(created.body.recommendation.id))).toMatchObject({
      resolution: "pending",
    });
    expect((await deps.tickets.get("TKT-1005")).revision).toBe(0);
  });

  it("rejects with feedback and leaves the ticket unchanged", async () => {
    const { deps, json } = await startFixture();
    const created = await json("/api/tickets/TKT-1005/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });

    const rejected = await json(
      `/api/recommendations/${created.body.recommendation.id}/reject`,
      {
        method: "POST",
        body: JSON.stringify({
          ticketId: "TKT-1005",
          actor: "matias-reviewer",
          feedback: "Needs a human-written customer response first.",
        }),
      },
    );

    expect(rejected.status).toBe(200);
    expect(rejected.body.auditEvent).toMatchObject({
      action: "recommendation-rejected",
      actor: "matias-reviewer",
      result: "success",
      rationale: "Needs a human-written customer response first.",
    });
    expect((await deps.recommendations.get(created.body.recommendation.id))).toMatchObject({
      resolution: "rejected",
    });
    expect((await deps.tickets.get("TKT-1005")).revision).toBe(0);
  });
  it("routes the same unavailable reusable-knowledge snapshot through HTTP and MCP evaluation", async () => {
    const { deps, json } = await startFixture();
    const calls: string[] = [];
    deps.knowledgeEvolution.service.listReusableApproved = async ({ asOf }) => {
      calls.push(asOf);
      return {
        status: "ledger-unavailable",
        contexts: [],
        issues: [{ scope: "snapshot", code: "ledger-read-failed" }],
      };
    };

    const http = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(http.status, JSON.stringify(http.body)).toBe(201);
    expect(http.body.recommendation).toMatchObject({
      learnedContext: {
        status: "ledger-unavailable",
        issues: [{ scope: "snapshot", code: "ledger-read-failed" }],
      },
    });
    expect(http.body.recommendation.knownCauseRef).toBeUndefined();

    const server = createTriageServer(deps);
    const client = new Client({ name: "reusable-context-parity", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcp = await client.callTool({
        name: "evaluate_ticket",
        arguments: { ticketId: "TKT-1010", actor: "approval-desk", aiPreference: "deterministic" },
      });
      expect(mcp.isError, mcpText(mcp as any)).not.toBe(true);
      expect(mcp.structuredContent).toMatchObject({
        recommendation: {
          learnedContext: {
            status: "ledger-unavailable",
            issues: [{ scope: "snapshot", code: "ledger-read-failed" }],
          },
        },
      });
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
    expect(calls).toEqual([now.toISOString(), now.toISOString()]);
  });

  it("pins an existing recommendation to v1 and only uses v2 after an explicit HTTP or MCP re-evaluation", async () => {
    const { deps, json } = await startFixture();
    let current = reusableCampaignEditorKnowledge(1);
    deps.knowledgeEvolution.service.listReusableApproved = async () => current;

    const first = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.recommendation.knownCauseRef).toEqual({
      objectId: "campaign-editor-guidance", version: 1,
    });

    current = reusableCampaignEditorKnowledge(2);
    expect(await deps.recommendations.get(first.body.recommendation.id)).toMatchObject({
      knownCauseRef: { objectId: "campaign-editor-guidance", version: 1 },
    });

    const reevaluated = await json("/api/tickets/TKT-1010/recommendations", {
      method: "POST",
      body: JSON.stringify({ actor: "approval-desk" }),
    });
    expect(reevaluated.status, JSON.stringify(reevaluated.body)).toBe(201);
    expect(reevaluated.body.recommendation.knownCauseRef).toEqual({
      objectId: "campaign-editor-guidance", version: 2,
    });

    const server = createTriageServer(deps);
    const client = new Client({ name: "knowledge-version-pinning", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const mcp = await client.callTool({
        name: "evaluate_ticket",
        arguments: { ticketId: "TKT-1010", actor: "approval-desk", aiPreference: "deterministic" },
      });
      expect(mcp.isError, mcpText(mcp as any)).not.toBe(true);
      expect(mcp.structuredContent).toMatchObject({
        recommendation: { knownCauseRef: { objectId: "campaign-editor-guidance", version: 2 } },
      });
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
    expect(await deps.recommendations.get(first.body.recommendation.id)).toMatchObject({
      knownCauseRef: { objectId: "campaign-editor-guidance", version: 1 },
    });
  });
});

function reusableCampaignEditorKnowledge(version: number): ReusableKnowledgeResult {
  return {
    status: "available",
    contexts: [{
      object: {
        id: "campaign-editor-guidance", version, learningGovernance: "ledger", kind: "known-cause",
        name: "Campaign editor guidance", summary: "Controlled campaign editor recovery path.",
        triggerPatterns: ["problem"],
        evidencePolicy: { mode: "none-required", rationale: "The approved path can be applied immediately." },
        timeConstraints: [], diagnosticSteps: ["Confirm the reported editor state."],
        fixSteps: ["Use the controlled recovery path."], verificationSteps: ["Confirm the editor loads."],
        customerSafeExplanation: "We can apply the documented campaign editor path.",
        operatorRationale: "Approved exact-version test guidance.", owner: "product",
        supportingDiagnosisIds: ["diagnosis-001"], supportingTicketIds: ["TKT-1010"],
        provenance: { source: "test", recordedAt: "2026-06-10T08:00:00.000Z" }, status: "approved",
        approval: { approvedBy: "support-lead", approvedAt: "2026-06-10T08:00:00.000Z" },
      },
      version,
      learning: { maturity: "promoted", health: "active", eligibleForReuse: true },
      eligibilitySource: "ledger-active",
    }],
    issues: [],
  };
}

async function startFixture(
  options: Parameters<typeof createApprovalDeskHttpServer>[1] = {},
  fixtureOptions: { now?: () => Date } = {},
): Promise<{
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>;
  baseUrl: string;
  json: (
    path: string,
    init?: RequestInit,
  ) => Promise<{ status: number; body: any; response: Response }>;
}> {
  const dataRoot = await mkdtemp(join(tmpdir(), "approval-desk-http-"));
  temporaryRoots.push(dataRoot);
  const deps = await createRuntimeDependencies({
    env: {
      TRIAGE_DATA_ROOT: dataRoot,
      TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
    },
    now: fixtureOptions.now ?? (() => now),
  });
  ledgers.push(deps.knowledgeEvolution.ledger);
  const server = createApprovalDeskHttpServer(deps, options);
  servers.push(server);
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    deps,
    baseUrl,
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

async function seedKnowledgeCandidateSupport(
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>,
): Promise<void> {
  await Promise.all([
    deps.knowledgeEvolution.diagnoses.save({
      id: "diagnosis-a",
      ticketId: "TKT-1001",
      problem: "The API request is rejected after rotating a credential.",
      symptoms: ["Requests return a credential validation failure after rotation."],
      evidenceReferences: [{ id: "key-identifier", labelAtDiagnosis: "Rotated credential identifier", source: "ticket", sourceRef: "TKT-1001" }],
      ownerTeam: "api-platform",
      fixSteps: ["Refresh the deployed credential configuration."],
      verificationSteps: ["Confirm a new request succeeds."],
      completedAt: "2026-06-10T08:00:00.000Z",
    }),
    deps.knowledgeEvolution.diagnoses.save({
      id: "diagnosis-b",
      ticketId: "TKT-1002",
      problem: "The API request is rejected after rotating a credential.",
      symptoms: ["Requests return a credential validation failure after rotation."],
      evidenceReferences: [{ id: "key-identifier", labelAtDiagnosis: "Rotated credential identifier", source: "ticket", sourceRef: "TKT-1002" }],
      ownerTeam: "api-platform",
      fixSteps: ["Refresh the deployed credential configuration."],
      verificationSteps: ["Confirm a new request succeeds."],
      completedAt: "2026-06-10T08:01:00.000Z",
    }),
  ]);
}

function installGptKnowledgeDraftProvider(
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>,
): void {
  const provider: CandidateDraftProvider = {
    enabled: true,
    async draft() {
      return {
        outputText: JSON.stringify({
          kind: "known-cause",
          name: "Recurring credential rotation issue",
          summary: "A deployed service can retain an earlier credential after rotation.",
          triggerPatterns: ["Requests return a credential validation failure after rotation."],
          evidencePolicy: { mode: "required", evidenceIds: ["key-identifier"] },
          knowledgeArticleIds: [],
          timeConstraints: ["Apply after a credential rotation."],
          diagnosticSteps: ["Compare the deployed credential with the active credential."],
          fixSteps: ["Refresh the deployed credential configuration."],
          verificationSteps: ["Confirm a new request succeeds."],
          customerSafeExplanation: "We found a configuration mismatch and are reviewing the correction.",
          operatorRationale: "Completed diagnosis support identifies a repeatable credential rotation issue.",
          confidence: 0.91,
          rationale: "Completed diagnosis support identifies a repeatable credential rotation issue.",
          supportingDiagnosisIds: ["diagnosis-a", "diagnosis-b"],
          supportingTicketIds: ["TKT-1001", "TKT-1002"],
          contradictions: [],
        }),
        provenance: {
          provider: "openai",
          model: "controlled-local-simulation",
          rationale: "Completed diagnosis support identifies a repeatable credential rotation issue.",
        },
      };
    },
  };
  deps.knowledgeEvolution.service = new KnowledgeEvolutionService({
    tickets: deps.tickets,
    knowledge: deps.knowledge,
    diagnoses: deps.knowledgeEvolution.diagnoses,
    objects: deps.knowledgeEvolution.objects,
    audits: deps.knowledgeEvolution.audits,
    draftProvider: provider,
    promotionAuthorizer: (actorId) => ["reviewer", "approval-desk", "support-lead"].includes(actorId),
    now: deps.now,
  });
}

type KnowledgeAction =
  | { kind: "approve"; actor: string; expectedVersion: number; edits?: { summary: string } }
  | { kind: "reject"; actor: string; expectedVersion: number; reason?: string };

async function runHttpKnowledgeAction(action: KnowledgeAction): Promise<unknown> {
  const { deps, json } = await startFixture();
  await seedKnowledgeCandidateSupport(deps);
  await json("/api/knowledge-candidates", {
    method: "POST",
    body: JSON.stringify({ actor: "reviewer", includeGpt: false }),
  });
  const candidateId = "known-cause-diagnosis-a";
  const { kind, ...body } = action;
  const response = await json(`/api/knowledge-candidates/${candidateId}/${action.kind}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return normalizeHttpKnowledgeOutcome(response.status, response.body);
}

async function runMcpKnowledgeAction(action: KnowledgeAction): Promise<unknown> {
  const { deps } = await startFixture();
  await seedKnowledgeCandidateSupport(deps);
  const server = createTriageServer(deps);
  const client = new Client({ name: "knowledge-action-parity", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await client.callTool({
      name: "discover_knowledge_candidates",
      arguments: { actor: "reviewer", includeGpt: false },
    });
    const { kind, ...input } = action;
    const result = await client.callTool({
      name: `${action.kind}_knowledge_candidate`,
      arguments: { candidateId: "known-cause-diagnosis-a", ...input },
    });
    if (result.isError === true) {
      const text = mcpText(result as any);
      return { ok: false, code: text.startsWith("STALE_APPROVAL:") ? "STALE_APPROVAL" : "INVALID_REQUEST" };
    }
    const value = result.structuredContent as any;
    return action.kind === "approve"
      ? { ok: true, object: { id: value.object.id, status: value.object.status, version: value.object.version } }
      : { ok: true, candidateId: value.candidateId, rejected: value.rejected };
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

function normalizeHttpKnowledgeOutcome(status: number, body: any): unknown {
  if (status !== 200) return { ok: false, code: body.error.code };
  return body.object === undefined
    ? { ok: true, candidateId: body.candidateId, rejected: body.rejected }
    : { ok: true, object: { id: body.object.id, status: body.object.status, version: body.object.version } };
}

async function ticketRevision(
  json: Awaited<ReturnType<typeof startFixture>>["json"],
  ticketId: string,
): Promise<number> {
  const detail = await json(`/api/tickets/${ticketId}`);
  return detail.body.ticket.revision;
}

async function seedReadyToCloseWorkflow(
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>,
  ticketId: Ticket["id"],
): Promise<void> {
  const ticket = await deps.tickets.get(ticketId);
  const recommendation = TriageRecommendationSchema.parse({
    id: "88888888-8888-4888-8888-888888888888",
    ticketId,
    sourceRevision: ticket.revision,
    category: "incident",
    priority: "P1",
    team: "incident-response",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    supportState: "ready-for-close",
    knowledgeArticleIds: [],
    draftCustomerResponse: "Thanks for confirming that the issue is resolved.",
    rationale: "The customer-confirmed workflow is ready to close.",
    confidence: 0.9,
    recommendedNextAction: "Close the ticket.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "approved",
    createdAt: "2026-06-10T09:00:00.000Z",
  });
  await deps.recommendations.create(recommendation);
  await deps.audits.append(AuditEventSchema.parse({
    id: "88888888-8888-4888-8888-888888888889",
    timestamp: "2026-06-10T09:00:00.000Z",
    actor: "approval-desk",
    action: "recommendation-submitted",
    ticketId,
    recommendationId: recommendation.id,
    before: {},
    after: {},
    rationale: "Closing recommendation was submitted.",
    knowledgeArticleIds: [],
    result: "success",
  }));
  await deps.audits.append(AuditEventSchema.parse({
    id: "88888888-8888-4888-8888-888888888890",
    timestamp: "2026-06-10T09:01:00.000Z",
    actor: "matias-reviewer",
    action: "customer-response-sent",
    ticketId,
    recommendationId: recommendation.id,
    before: {},
    after: {
      sentAt: "2026-06-10T09:01:00.000Z",
      customerResponse: recommendation.draftCustomerResponse,
    },
    rationale: "Closing response was sent.",
    knowledgeArticleIds: [],
    result: "success",
  }));
}

async function approveLatestDiagnosis(
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>,
  ticketId: Ticket["id"],
): Promise<void> {
  const [ticket, audits] = await Promise.all([
    deps.tickets.get(ticketId),
    deps.audits.list(ticketId),
  ]);
  const original = audits.filter(
    (event) =>
      event.action === "diagnosis-completed" ||
      event.action === "diagnostic-escalated",
  ).at(-1)!;
  await deps.service.reviewDiagnosis({
    decision: "revalidate",
    diagnosisId: original.id,
    ticketId,
    sourceTicketRevision: ticket.revision,
    sourceConversationWatermark: customerReplyWatermarkFromAudits(audits),
    editedDiagnosis: original.after.diagnosis as DiagnosisContext,
    actor: "matias-reviewer",
    rationale: "The current ticket context still supports the unchanged diagnosis.",
    reviewedAt: audits.at(-1)?.timestamp ?? now.toISOString(),
  });
}

async function recordCurrentDiagnosis(
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>,
  ticketId: Ticket["id"],
) {
  return deps.service.recordDiagnosis({
    ticketId,
    actor: "casey",
    diagnosedAt: now.toISOString(),
    diagnosis: {
      status: "completed",
      causeType: "configuration",
      customerSafeSummary: "The reviewed configuration diagnosis is ready for the operator.",
      evidenceUsed: ["request trace"],
      confidence: "confirmed",
      owner: "engineering",
      recommendedNextAction: "Apply the governed configuration change.",
      doNotSay: ["Do not expose internal diagnostic notes."],
    },
    knowledgeArticleIds: ["api-reference"],
  });
}

async function appendDiagnosisResponseForTransport(
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>,
  ticketId: Ticket["id"],
): Promise<void> {
  await deps.audits.append(AuditEventSchema.parse({
    id: "70000000-0000-4000-8000-000000000001",
    timestamp: "2026-06-10T08:59:59.9999Z",
    actor: "casey",
    action: "customer-response-sent",
    ticketId,
    before: {},
    after: { sentAt: "2026-06-10T08:59:59.9999Z" },
    rationale: "The reviewed diagnosis update was sent to the customer.",
    knowledgeArticleIds: ["api-reference"],
    result: "success",
  }));
}

async function approveAndSend(
  json: Awaited<ReturnType<typeof startFixture>>["json"],
  ticketId: string,
  recommendation: { id: string; draftCustomerResponse: string },
  automaticReplyEnabled?: boolean,
): Promise<void> {
  const approved = await json(`/api/recommendations/${recommendation.id}/approve`, {
    method: "POST",
    body: JSON.stringify({
      ticketId,
      expectedRevision: await ticketRevision(json, ticketId),
      approvedFields: ["customerResponse"],
      editedCustomerResponse: recommendation.draftCustomerResponse,
      actor: "matias-reviewer",
      confirm: true,
    }),
  });
  expect(approved.status).toBe(200);
  const sent = await json(`/api/recommendations/${recommendation.id}/mark-sent`, {
    method: "POST",
    body: JSON.stringify({
      ticketId,
      actor: "matias-reviewer",
      ...(automaticReplyEnabled === undefined ? {} : { automaticReplyEnabled }),
    }),
  });
  expect(sent.status).toBe(200);
}

async function createDiagnosedPlatformDelayTicket(
  json: Awaited<ReturnType<typeof startFixture>>["json"],
  setNow: (value: string) => void = () => {},
): Promise<{ id: string; draftCustomerResponse: string }> {
  setNow("2026-06-10T09:00:00.000Z");
  const first = await json("/api/tickets/TKT-1001/recommendations", {
    method: "POST",
    body: JSON.stringify({ actor: "approval-desk" }),
  });
  await approveAndSend(json, "TKT-1001", first.body.recommendation);

  setNow("2026-06-10T09:05:00.000Z");
  await json("/api/tickets/TKT-1001/customer-replies", {
    method: "POST",
    body: JSON.stringify({
      actor: "Maya Chen",
      body: "The affected store URL is https://store.example.test. One affected profile email is customer@example.test.",
      source: "manual",
    }),
  });
  setNow("2026-06-10T09:06:00.000Z");
  const partial = await json("/api/tickets/TKT-1001/recommendations", {
    method: "POST",
    body: JSON.stringify({ actor: "approval-desk" }),
  });
  await approveAndSend(json, "TKT-1001", partial.body.recommendation);

  setNow("2026-06-10T09:10:00.000Z");
  await json("/api/tickets/TKT-1001/customer-replies", {
    method: "POST",
    body: JSON.stringify({
      actor: "Maya Chen",
      body: "The event ID is evt_12345. The request ID is req_12345. The API response status is 400 validation_error.",
      source: "manual",
    }),
  });
  setNow("2026-06-10T09:11:00.000Z");
  const complete = await json("/api/tickets/TKT-1001/recommendations", {
    method: "POST",
    body: JSON.stringify({ actor: "approval-desk" }),
  });
  await approveAndSend(json, "TKT-1001", complete.body.recommendation);

  setNow("2026-06-10T09:15:00.000Z");
  const diagnosis = await json("/api/tickets/TKT-1001/diagnosis", {
    method: "POST",
    body: JSON.stringify({ actor: "product-support" }),
  });
  expect(diagnosis.status).toBe(201);
  setNow("2026-06-10T09:16:00.000Z");
  const update = await json("/api/tickets/TKT-1001/recommendations", {
    method: "POST",
    body: JSON.stringify({ actor: "approval-desk" }),
  });
  expect(update.status).toBe(201);
  return update.body.recommendation;
}
