import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  TicketSchema,
  TriageRecommendationSchema,
} from "../src/domain.js";
import {
  LifecycleViewSchema,
  buildTicketLifecycleView,
} from "../src/approval-desk/lifecycle.js";

const ticket = TicketSchema.parse({
  id: "TKT-1001",
  createdAt: "2026-06-10T08:25:00.000Z",
  updatedAt: "2026-06-10T08:30:00.000Z",
  customer: { name: "Maple Studio", plan: "starter", region: "eu", vip: false },
  subject: "Checkout event missing",
  description: "A checkout event is missing from the profile timeline.",
  status: "in-progress",
  category: "incident",
  priority: "P1",
  team: "incident-response",
  tags: ["incident"],
  sla: { responseDueAt: "2026-06-10T12:00:00.000Z", breached: false },
  relatedTicketIds: [],
  revision: 2,
});

const recommendation = TriageRecommendationSchema.parse({
  id: "10000000-0000-4000-8000-000000000001",
  ticketId: ticket.id,
  sourceRevision: ticket.revision,
  category: ticket.category,
  priority: ticket.priority,
  team: ticket.team,
  tags: ticket.tags,
  duplicateCandidates: [],
  outageRisk: "none",
  securityRisk: "none",
  slaRisk: "none",
  missingInformation: [],
  supportState: "ready-for-approval",
  requiredEvidence: [],
  providedEvidence: [],
  missingEvidence: [],
  knowledgeArticleIds: [],
  draftCustomerResponse: "We are reviewing the reported event.",
  rationale: "The ticket is ready for governed review.",
  confidence: 0.9,
  recommendedNextAction: "Review and send the response.",
  escalationRequired: false,
  escalationReasons: [],
  resolution: "pending",
  createdAt: "2026-06-10T09:00:00.000Z",
});

describe("lifecycle projection", () => {
  it("has a strict additive contract and exposes evaluation-needed without a recommendation", () => {
    const lifecycle = buildTicketLifecycleView({ ticket, recommendations: [], audits: [] });

    expect(LifecycleViewSchema.parse(lifecycle)).toEqual(lifecycle);
    expect(lifecycle.phase).toBe("evaluation-needed");
    expect(lifecycle.primaryAction.kind).toBe("evaluate-ticket");
    expect(lifecycle.diagnosis.state).toBe("none");
    expect(lifecycle.fix.state).toBe("none");
  });

  it("represents a pending recommendation as review, not as a browser-inferred state", () => {
    const submitted = AuditEventSchema.parse({
      id: "20000000-0000-4000-8000-000000000001",
      timestamp: recommendation.createdAt,
      actor: "support",
      action: "recommendation-submitted",
      ticketId: ticket.id,
      recommendationId: recommendation.id,
      before: {},
      after: {},
      rationale: recommendation.rationale,
      knowledgeArticleIds: [],
      result: "success",
    });
    const lifecycle = buildTicketLifecycleView({
      ticket,
      recommendations: [recommendation],
      audits: [submitted],
    });

    expect(lifecycle.phase).toBe("recommendation-review");
    expect(lifecycle.primaryAction.kind).toBe("review-recommendation");
    expect(lifecycle.current.recommendationId).toBe(recommendation.id);
  });
});
