import { describe, expect, it } from "vitest";
import {
  TicketSchema,
  TriageRecommendationSchema,
} from "../src/domain.js";
import { diagnosisContextForTicket } from "../src/approval-desk/diagnostic-workflow.js";

describe("integration diagnostic playbooks", () => {
  it("describes the Browse Abandonment trigger issue instead of using a generic diagnosis", () => {
    const ticket = TicketSchema.parse({
      id: "TKT-1005",
      createdAt: "2026-06-10T08:10:00.000Z",
      updatedAt: "2026-06-10T10:10:00.000Z",
      customer: { name: "Prompt Streetwear", plan: "growth", region: "us-east", vip: false },
      subject: "Browse Abandonment flow skipped new profiles",
      description: "New profiles with Viewed Product events are not entering the Browse Abandonment flow.",
      status: "triage",
      category: "integration",
      priority: "P2",
      team: "integrations",
      tags: ["flow", "events"],
      sla: { responseDueAt: "2026-06-10T12:00:00.000Z", breached: false },
      relatedTicketIds: [],
      revision: 1,
    });
    const recommendation = TriageRecommendationSchema.parse({
      id: "10000000-0000-4000-8000-000000001005",
      ticketId: ticket.id,
      sourceRevision: ticket.revision,
      category: "integration",
      priority: "P2",
      team: "integrations",
      tags: ["flow", "events"],
      duplicateCandidates: [],
      outageRisk: "none",
      securityRisk: "none",
      slaRisk: "none",
      missingInformation: [],
      supportState: "diagnosing",
      requiredEvidence: [],
      providedEvidence: [],
      missingEvidence: [],
      knowledgeArticleIds: ["flow-trigger-troubleshooting", "event-tracking-debugging"],
      draftCustomerResponse: "We are checking the flow trigger.",
      rationale: "The flow and event symptoms match the integration playbook.",
      confidence: 0.9,
      recommendedNextAction: "Review the flow trigger and event eligibility.",
      escalationRequired: false,
      escalationReasons: [],
      resolution: "pending",
      createdAt: "2026-06-10T10:10:00.000Z",
    });

    const diagnosis = diagnosisContextForTicket(ticket, recommendation);

    expect(diagnosis.confidence).toBe("likely");
    expect(diagnosis.customerSafeSummary).toMatch(/Viewed Product.*Browse Abandonment flow/i);
    expect(diagnosis.customerSafeSummary).not.toContain("most likely cause from the provided evidence");
    expect(diagnosis.owner).toBe("integration-partner");
  });

  it.each([
    [
      "TKT-1013",
      "Deliverability dropped after a sending domain change",
      "Bounce rates increased after we changed the branded sending domain.",
      "email-deliverability",
      "performance",
      "The evidence points to a sending-domain deliverability degradation that should be compared with bounce and suppression patterns.",
    ],
    [
      "TKT-1004",
      "Private API key may be exposed in shared connector logs",
      "A private API key may have been pasted into a shared integration log bundle.",
      "security-incident-response",
      "security",
      "The evidence supports treating this as a potential credential-exposure incident requiring security containment and audit review.",
    ],
    [
      "TKT-1022",
      "Segment count differs from the saved export",
      "The segment count is lower than the saved export after a rule edit.",
      "segmentation-audience-rules",
      "configuration",
      "The evidence points to a segment rule or recalculation mismatch affecting the observed audience count.",
    ],
    [
      "TKT-1006",
      "VIP executive wants coupon pool fixed before launch",
      "Coupon codes are not attaching to preview emails before the summer campaign launch.",
      "coupon-catalog-sync",
      "configuration",
      "The evidence points to coupon or catalog data being out of sync with the campaign or product configuration.",
    ],
    [
      "TKT-1021",
      "Campaign audience snapshot is stuck",
      "A campaign audience snapshot has not finished calculating.",
      "campaign-send-failures",
      "configuration",
      "The evidence points to a campaign preparation or send-status problem that needs the campaign and audience state compared.",
    ],
    [
      "TKT-1020",
      "Product catalog sync is delayed",
      "New products from Shopify take more than six hours to appear in the campaign product block.",
      "shopify-integration-sync",
      "integration",
      "The evidence points to an ecommerce integration synchronization mismatch affecting the reported object.",
    ],
    [
      "TKT-1030",
      "SMS opt-out not reflected on profile",
      "A subscriber replied STOP, but the profile still appears eligible for the next SMS campaign.",
      "sms-compliance",
      "configuration",
      "The evidence points to an SMS eligibility or compliance rule affecting the reported recipient.",
    ],
  ])(
    "uses an article-backed diagnostic playbook for %s",
    (ticketId, subject, description, articleId, causeType, expectedSummary) => {
      const ticket = TicketSchema.parse({
        id: ticketId,
        createdAt: "2026-06-10T08:10:00.000Z",
        updatedAt: "2026-06-10T10:10:00.000Z",
        customer: { name: "Example Customer", plan: "growth", region: "us-east", vip: false },
        subject,
        description,
        status: "triage",
        category: causeType === "performance" ? "performance" : "account-access",
        priority: "P2",
        team: causeType === "performance" ? "product" : "support",
        tags: ["support"],
        sla: { responseDueAt: "2026-06-10T12:00:00.000Z", breached: false },
        relatedTicketIds: [],
        revision: 1,
      });
      const recommendation = TriageRecommendationSchema.parse({
        id: `10000000-0000-4000-8000-00000000${ticketId.slice(-4)}`,
        ticketId: ticket.id,
        sourceRevision: ticket.revision,
        category: ticket.category,
        priority: "P2",
        team: ticket.team,
        tags: ticket.tags,
        duplicateCandidates: [],
        outageRisk: "none",
        securityRisk: "none",
        slaRisk: "none",
        missingInformation: [],
        supportState: "diagnosing",
        requiredEvidence: [],
        providedEvidence: [],
        missingEvidence: [],
        knowledgeArticleIds: [articleId],
        draftCustomerResponse: "We are reviewing the supporting evidence.",
        rationale: "The article-backed symptoms match the diagnostic playbook.",
        confidence: 0.9,
        recommendedNextAction: "Review the supporting evidence.",
        escalationRequired: false,
        escalationReasons: [],
        resolution: "pending",
        createdAt: "2026-06-10T10:10:00.000Z",
      });

      const diagnosis = diagnosisContextForTicket(ticket, recommendation);

      expect(diagnosis.causeType).toBe(causeType);
      expect(diagnosis.customerSafeSummary).toBe(expectedSummary);
      expect(diagnosis.customerSafeSummary).not.toContain("most likely cause from the provided evidence");
      expect(diagnosis.confidence).toBe("likely");
    },
  );

  it.each([
    ["TKT-1010", "Problem", "It does not work."],
    ["TKT-1026", "Email issue", "Email issue"],
  ])("keeps intentionally vague %s evidence-gated", (ticketId, subject, description) => {
    const ticket = TicketSchema.parse({
      id: ticketId,
      createdAt: "2026-06-10T08:10:00.000Z",
      updatedAt: "2026-06-10T10:10:00.000Z",
      customer: { name: "Vague Customer", plan: "growth", region: "us-east", vip: false },
      subject,
      description,
      status: "triage",
      category: "other",
      priority: "P3",
      team: "support",
      tags: ["vague"],
      sla: { responseDueAt: "2026-06-10T12:00:00.000Z", breached: false },
      relatedTicketIds: [],
      revision: 1,
    });
    const recommendation = TriageRecommendationSchema.parse({
      id: `10000000-0000-4000-8000-00000000${ticketId.slice(-4)}`,
      ticketId: ticket.id,
      sourceRevision: ticket.revision,
      category: "other",
      priority: "P3",
      team: "support",
      tags: ticket.tags,
      duplicateCandidates: [],
      outageRisk: "none",
      securityRisk: "none",
      slaRisk: "none",
      missingInformation: ["what you were trying to do"],
      supportState: "needs-information",
      requiredEvidence: [],
      providedEvidence: [],
      missingEvidence: [{
        id: "problem-summary",
        label: "Problem summary",
        customerQuestion: "what you were trying to do, what happened, and where it happened",
        aliases: ["problem"],
        source: "policy",
      }],
      knowledgeArticleIds: [],
      draftCustomerResponse: "Please share more detail.",
      rationale: "The ticket is intentionally vague.",
      confidence: 0.5,
      recommendedNextAction: "Collect the missing evidence.",
      escalationRequired: false,
      escalationReasons: [],
      resolution: "pending",
      createdAt: "2026-06-10T10:10:00.000Z",
    });

    const diagnosis = diagnosisContextForTicket(ticket, recommendation);

    expect(diagnosis.customerSafeSummary).toContain("requested evidence");
    expect(diagnosis.confidence).toBe("likely");
    expect(diagnosis.customerSafeSummary).not.toContain("deliverability");
  });
});
