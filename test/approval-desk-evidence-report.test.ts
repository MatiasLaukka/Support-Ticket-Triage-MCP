import { describe, expect, it } from "vitest";
import type { AuditEvent, Ticket, TriageRecommendation } from "../src/domain.js";
import type { QueueMetrics } from "../src/metrics.js";
import {
  buildAutomationEvidenceReport,
  type EvidenceAuditEvent,
} from "../src/approval-desk/evidence-report.js";

const generatedAt = "2026-06-10T09:00:00.000Z";

describe("buildAutomationEvidenceReport", () => {
  it("summarizes metrics, audits, guardrails, and recent activity", () => {
    const metrics = makeMetrics({
      openTickets: 7,
      pendingRecommendations: 1,
      approvedRecommendations: 2,
      rejectedRecommendations: 1,
      estimatedMinutesSaved: 16,
    });

    const report = buildAutomationEvidenceReport({
      metrics,
      tickets: [makeTicket("TKT-1001"), makeTicket("TKT-1002")],
      recommendations: [
        makeRecommendation("11111111-1111-4111-8111-111111111111", "approved"),
        makeRecommendation("22222222-2222-4222-8222-222222222222", "rejected"),
        makeRecommendation("33333333-3333-4333-8333-333333333333", "pending"),
      ],
      audits: [
        makeAudit({
          action: "recommendation-approved",
          recommendationId: "11111111-1111-4111-8111-111111111111",
          result: "success",
          timestamp: "2026-06-10T09:05:00.000Z",
        }),
        makeAudit({
          action: "approval-rejected",
          recommendationId: "11111111-1111-4111-8111-111111111111",
          result: "rejected",
          timestamp: "2026-06-10T09:04:00.000Z",
          rejectionReason: "Approval revision is stale.",
        }),
      ],
      generatedAt,
    });

    expect(report.generatedAt).toBe(generatedAt);
    expect(report.summary).toEqual({
      openTickets: 7,
      pendingRecommendations: 1,
      approvedRecommendations: 2,
      rejectedRecommendations: 1,
      estimatedMinutesSaved: 16,
      auditEvents: 2,
      safetyBlocks: 1,
      activeGuardrails: 6,
    });
    expect(report.guardrails.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "submission-is-not-mutation", status: "active" },
      { id: "explicit-approval", status: "active" },
      { id: "edited-customer-response", status: "active" },
      { id: "rejection-feedback", status: "active" },
      { id: "untrusted-ticket-text", status: "active" },
      { id: "stale-and-replay-protection", status: "active" },
    ]);
    expect(report.recentActivity).toEqual([
      {
        timestamp: "2026-06-10T09:05:00.000Z",
        action: "recommendation-approved",
        ticketId: "TKT-1001",
        recommendationId: "11111111-1111-4111-8111-111111111111",
        result: "success",
      },
      {
        timestamp: "2026-06-10T09:04:00.000Z",
        action: "approval-rejected",
        ticketId: "TKT-1001",
        recommendationId: "11111111-1111-4111-8111-111111111111",
        result: "rejected",
      },
    ]);
    expect(report.metrics).toBe(metrics);
  });

  it("counts only provable blocked safety outcomes", () => {
    const report = buildAutomationEvidenceReport({
      metrics: makeMetrics(),
      tickets: [],
      recommendations: [],
      audits: [
        makeAudit({ action: "recommendation-rejected", result: "success" }),
        makeAudit({ action: "recommendation-approved", result: "failure" }),
        makeAudit({ action: "approval-rejected", result: "rejected" }),
        makeAudit({ action: "recommendation-approved", result: "success" }),
      ],
      generatedAt,
    });

    expect(report.summary.safetyBlocks).toBe(2);
  });

  it("sorts recent activity newest-first and limits it to eight events", () => {
    const audits = Array.from({ length: 10 }, (_, index) =>
      makeAudit({
        id: `99999999-9999-4999-8999-9999999999${index.toString().padStart(2, "0")}`,
        timestamp: `2026-06-10T09:${index.toString().padStart(2, "0")}:00.000Z`,
      }),
    );

    const report = buildAutomationEvidenceReport({
      metrics: makeMetrics(),
      tickets: [],
      recommendations: [],
      audits,
      generatedAt,
    });

    expect(report.recentActivity).toHaveLength(8);
    expect(report.recentActivity.map(({ timestamp }) => timestamp)).toEqual([
      "2026-06-10T09:09:00.000Z",
      "2026-06-10T09:08:00.000Z",
      "2026-06-10T09:07:00.000Z",
      "2026-06-10T09:06:00.000Z",
      "2026-06-10T09:05:00.000Z",
      "2026-06-10T09:04:00.000Z",
      "2026-06-10T09:03:00.000Z",
      "2026-06-10T09:02:00.000Z",
    ]);
  });
});

function makeMetrics(overrides: Partial<QueueMetrics> = {}): QueueMetrics {
  return {
    generatedAt,
    openTickets: 0,
    untriagedTickets: 0,
    slaBreachedTickets: 0,
    slaAtRiskTickets: 0,
    ticketsByCategory: {},
    ticketsByPriority: {},
    ticketsByTeam: {},
    submittedRecommendations: 0,
    pendingRecommendations: 0,
    approvedRecommendations: 0,
    rejectedRecommendations: 0,
    acceptanceRate: null,
    rejectionRate: null,
    averageConfidence: null,
    escalationCounts: { total: 0 },
    minutesPerAcceptedRecommendation: 8,
    estimatedMinutesSaved: 0,
    ...overrides,
  };
}

function makeTicket(id: Ticket["id"]): Ticket {
  return {
    id,
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-10T08:30:00.000Z",
    customer: {
      name: "Northstar",
      plan: "enterprise",
      region: "eu",
      vip: false,
    },
    subject: "Login issue",
    description: "Cannot log in.",
    status: "triage",
    category: "authentication",
    priority: "P2",
    team: "identity",
    tags: [],
    sla: {
      responseDueAt: "2026-06-10T10:00:00.000Z",
      breached: false,
    },
    relatedTicketIds: [],
    revision: 0,
  };
}

function makeRecommendation(
  id: TriageRecommendation["id"],
  resolution: TriageRecommendation["resolution"],
): TriageRecommendation {
  return {
    id,
    ticketId: "TKT-1001",
    sourceRevision: 0,
    category: "authentication",
    priority: "P2",
    team: "identity",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    knowledgeArticleIds: ["account-access"],
    draftCustomerResponse: "We are investigating.",
    rationale: "Account access routing.",
    confidence: 0.9,
    recommendedNextAction: "Review evidence.",
    escalationRequired: false,
    escalationReasons: [],
    resolution,
    createdAt: "2026-06-10T09:00:00.000Z",
  };
}

function makeAudit(
  overrides: Partial<Omit<AuditEvent, "result">> & {
    result?: AuditEvent["result"] | "failure";
  },
): EvidenceAuditEvent {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    timestamp: "2026-06-10T09:00:00.000Z",
    actor: "approval-desk",
    action: "recommendation-approved",
    ticketId: "TKT-1001",
    recommendationId: "11111111-1111-4111-8111-111111111111",
    before: {},
    after: {},
    rationale: "Reviewed.",
    knowledgeArticleIds: ["account-access"],
    result: "success",
    ...overrides,
  };
}
