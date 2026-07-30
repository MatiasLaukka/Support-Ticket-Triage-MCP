import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  TicketSchema,
  TriageRecommendationSchema,
} from "../src/domain.js";
import { automaticReplyForTicket } from "../src/approval-desk/automatic-customer-replies.js";

describe("automatic customer replies", () => {
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
});
