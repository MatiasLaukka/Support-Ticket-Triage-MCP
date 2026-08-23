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
import {
  buildTicketWorkflowReadModel,
  buildTicketWorkflowReadModelFromSnapshot,
} from "../src/approval-desk/workflow-read-model.js";
import { OperationalWorkflowSnapshotSchema } from "../src/operational/domain.js";

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

  it("uses the same lifecycle builder for legacy and operational empty snapshots", () => {
    const legacy = buildTicketWorkflowReadModel({
      ticket,
      recommendations: [],
      audits: [],
    });
    const snapshot = OperationalWorkflowSnapshotSchema.parse({
      ticket,
      ticketRevisions: [],
      recommendations: [],
      recommendationRevisions: [],
      messages: [],
      diagnoses: [],
      events: [],
      traces: [],
      customerReplyWatermark: { state: "none" },
    });
    const operational = buildTicketWorkflowReadModelFromSnapshot(snapshot);

    expect(operational.lifecycle).toEqual(legacy.lifecycle);
    expect(operational.lifecycle.phase).toBe("evaluation-needed");
  });

  it("projects persisted ambiguity without imposing an attempt-count limit", () => {
    const approvedRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      resolution: "approved",
    });
    const diagnosis = AuditEventSchema.parse({
      id: "30000000-0000-4000-8000-000000000001",
      timestamp: "2026-06-10T09:01:00.000Z",
      actor: "product-support",
      action: "diagnosis-completed",
      ticketId: ticket.id,
      before: {},
      after: {
        diagnosis: {
          status: "completed",
          causeType: "performance",
          customerSafeSummary: "Two evidence-backed causes remain plausible.",
          evidenceUsed: ["browser comparison", "console trace"],
          confidence: "likely",
          owner: "engineering",
          recommendedNextAction: "Collect one more discriminating trace.",
          doNotSay: ["Do not claim a final root cause."],
          diagnosticState: {
            state: "ambiguous",
            hypotheses: [{
              id: "browser-session",
              label: "Browser session",
              status: "plausible",
              evidenceUsed: ["browser comparison"],
              evidenceToConfirm: ["session-specific trace"],
            }],
            evidenceToRequest: ["Capture the session-specific trace."],
            diagnosticAttempts: 7,
          },
        },
      },
      rationale: "A useful ambiguity round remains open under backend policy.",
      knowledgeArticleIds: [],
      result: "success",
    });

    const lifecycle = buildTicketLifecycleView({
      ticket,
      recommendations: [approvedRecommendation],
      audits: [diagnosis],
    });

    expect(lifecycle.phase).toBe("evaluation-needed");
    expect(lifecycle.diagnosticInvestigation.state).toBe("ambiguous");
    expect(lifecycle.primaryAction.kind).toBe("evaluate-ticket");
    expect(lifecycle.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "evaluate-ticket", availability: "primary" }),
      expect.objectContaining({ kind: "review-diagnosis", availability: "blocked" }),
      expect.objectContaining({ kind: "revalidate-diagnosis", availability: "blocked" }),
      expect.objectContaining({ kind: "reject-diagnosis", availability: "blocked" }),
    ]));
  });

  it("hands a newly evaluated complete-evidence cycle to diagnosis after ambiguity is clarified", () => {
    const initialRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      id: "30000000-0000-4000-8000-000000000030",
      resolution: "approved",
      supportState: "diagnosing",
      sourceRevision: ticket.revision,
      missingEvidence: [],
      createdAt: "2026-06-10T09:00:00.000Z",
    });
    const nextRecommendation = TriageRecommendationSchema.parse({
      ...initialRecommendation,
      id: "30000000-0000-4000-8000-000000000031",
      createdAt: "2026-06-10T09:04:00.000Z",
    });
    const diagnosis = AuditEventSchema.parse({
      id: "30000000-0000-4000-8000-000000000032",
      timestamp: "2026-06-10T09:01:00.000Z",
      actor: "product-support",
      action: "diagnosis-completed",
      ticketId: ticket.id,
      before: {},
      after: {
        diagnosis: {
          status: "completed",
          causeType: "performance",
          customerSafeSummary: "Two causes remain plausible.",
          evidenceUsed: ["campaign editor loading symptoms"],
          confidence: "likely",
          owner: "engineering",
          recommendedNextAction: "Collect discriminating evidence.",
          doNotSay: ["Do not call this confirmed."],
          diagnosticState: {
            state: "ambiguous",
            hypotheses: [
              {
                id: "browser-session",
                label: "Browser/session issue",
                status: "plausible",
                evidenceUsed: ["campaign editor loading symptoms"],
                evidenceToConfirm: ["The editor works in another browser."],
              },
              {
                id: "frontend-loading",
                label: "Frontend loading issue",
                status: "plausible",
                evidenceUsed: ["campaign editor loading symptoms"],
                evidenceToConfirm: ["The editor fails across browsers."],
              },
            ],
            evidenceToRequest: ["Try another browser."],
            diagnosticAttempts: 0,
          },
        },
      },
      rationale: "A bounded ambiguous diagnosis was recorded.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const reply = AuditEventSchema.parse({
      id: "30000000-0000-4000-8000-000000000033",
      timestamp: "2026-06-10T09:03:00.000Z",
      actor: "Jamie Lee",
      action: "customer-reply-received",
      ticketId: ticket.id,
      before: {},
      after: {
        body: "The editor is still blank in a private window, Microsoft Edge, and for another admin; the console shows ChunkLoadError.",
        source: "demo-auto-reply",
      },
      rationale: "The customer supplied the requested diagnostic evidence.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const audits = [
      AuditEventSchema.parse({
        id: "30000000-0000-4000-8000-000000000034",
        timestamp: initialRecommendation.createdAt,
        actor: "approval-desk",
        action: "recommendation-submitted",
        ticketId: ticket.id,
        recommendationId: initialRecommendation.id,
        before: {},
        after: {},
        rationale: "Initial diagnosis-ready recommendation.",
        knowledgeArticleIds: [],
        result: "success",
      }),
      AuditEventSchema.parse({
        id: "30000000-0000-4000-8000-000000000035",
        timestamp: "2026-06-10T09:00:01.000Z",
        actor: "approval-desk",
        action: "customer-response-sent",
        ticketId: ticket.id,
        recommendationId: initialRecommendation.id,
        before: {},
        after: { sentAt: "2026-06-10T09:00:01.000Z" },
        rationale: "The initial response was sent.",
        knowledgeArticleIds: [],
        result: "success",
      }),
      diagnosis,
      reply,
      AuditEventSchema.parse({
        id: "30000000-0000-4000-8000-000000000036",
        timestamp: nextRecommendation.createdAt,
        actor: "approval-desk",
        action: "recommendation-submitted",
        ticketId: ticket.id,
        recommendationId: nextRecommendation.id,
        before: {},
        after: {},
        rationale: "The diagnostic evidence was evaluated.",
        knowledgeArticleIds: [],
        result: "success",
      }),
      AuditEventSchema.parse({
        id: "30000000-0000-4000-8000-000000000037",
        timestamp: "2026-06-10T09:05:00.000Z",
        actor: "approval-desk",
        action: "customer-response-sent",
        ticketId: ticket.id,
        recommendationId: nextRecommendation.id,
        before: {},
        after: { sentAt: "2026-06-10T09:05:00.000Z" },
        rationale: "The clarification response was sent.",
        knowledgeArticleIds: [],
        result: "success",
      }),
    ];

    const workflow = buildTicketWorkflowReadModel({
      ticket,
      recommendations: [initialRecommendation, nextRecommendation],
      audits: [...audits.slice(0, 3), reply, ...audits.slice(4)],
    });

    expect(workflow.lifecycle.phase).toBe("diagnosis-ready");
    expect(workflow.lifecycle.primaryAction).toMatchObject({
      kind: "record-diagnosis",
      availability: "primary",
    });
    expect(workflow.operatorGuidance.nextAction).toBe("record-diagnosis");
  });

  it("keeps lifecycle and operator guidance aligned after diagnosis rejection", () => {
    const approvedRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      resolution: "approved",
    });
    const diagnosis = AuditEventSchema.parse({
      id: "30000000-0000-4000-8000-000000000010",
      timestamp: "2026-06-10T09:01:00.000Z",
      actor: "product-support",
      action: "diagnosis-completed",
      ticketId: ticket.id,
      before: {},
      after: {
        diagnosis: {
          status: "completed",
          causeType: "performance",
          customerSafeSummary: "The checkout processing path may be delayed.",
          evidenceUsed: ["request trace"],
          confidence: "likely",
          owner: "engineering",
          recommendedNextAction: "Collect discriminating evidence.",
          doNotSay: ["Do not call this confirmed."],
        },
      },
      rationale: "Initial diagnosis recorded for review.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const rejected = AuditEventSchema.parse({
      id: "30000000-0000-4000-8000-000000000011",
      timestamp: "2026-06-10T09:02:00.000Z",
      actor: "product-support",
      action: "diagnosis-reviewed",
      ticketId: ticket.id,
      before: { diagnosisId: diagnosis.id },
      after: {
        diagnosisReview: {
          decision: "reject",
          diagnosisId: diagnosis.id,
          ticketId: ticket.id,
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: { state: "none" },
          editedDiagnosis: diagnosis.after.diagnosis,
          actor: "product-support",
          rationale: "The evidence does not support this diagnosis.",
          reviewedAt: "2026-06-10T09:02:00.000Z",
        },
      },
      rationale: "The evidence does not support this diagnosis.",
      knowledgeArticleIds: [],
      result: "success",
    });

    const lifecycle = buildTicketLifecycleView({
      ticket,
      recommendations: [approvedRecommendation],
      audits: [diagnosis, rejected],
    });
    const workflow = buildTicketWorkflowReadModel({
      ticket,
      recommendations: [approvedRecommendation],
      audits: [diagnosis, rejected],
    });

    expect(lifecycle.phase).toBe("evaluation-needed");
    expect(lifecycle.primaryAction).toMatchObject({ kind: "evaluate-ticket", availability: "primary" });
    expect(lifecycle.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "evaluate-ticket", availability: "primary" }),
      expect.objectContaining({ kind: "review-diagnosis", availability: "blocked" }),
      expect.objectContaining({ kind: "revalidate-diagnosis", availability: "blocked" }),
      expect.objectContaining({ kind: "reject-diagnosis", availability: "completed" }),
    ]));
    expect(workflow.operatorGuidance.nextAction).toBe("evaluate-ticket");
    expect(workflow.operatorGuidance.requiredReview).toBeUndefined();
  });

  it("keeps evaluation primary while an approved likely diagnosis awaits confirmation", () => {
    const awaitingEvidenceRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      resolution: "approved",
      requiredEvidence: [{
        id: "confirmation-trace",
        label: "Confirmation trace",
        aliases: [],
        customerQuestion: "Share the confirmation trace.",
        source: "policy",
      }],
      missingEvidence: [{
        id: "confirmation-trace",
        label: "Confirmation trace",
        aliases: [],
        customerQuestion: "Share the confirmation trace.",
        source: "policy",
      }],
    });
    const diagnosis = AuditEventSchema.parse({
      id: "30000000-0000-4000-8000-000000000020",
      timestamp: "2026-06-10T09:01:00.000Z",
      actor: "product-support",
      action: "diagnosis-completed",
      ticketId: ticket.id,
      before: {},
      after: {
        diagnosis: {
          status: "completed",
          causeType: "performance",
          customerSafeSummary: "The processing path is likely delayed.",
          evidenceUsed: ["request trace"],
          confidence: "likely",
          owner: "engineering",
          recommendedNextAction: "Collect the confirmation trace.",
          doNotSay: ["Do not call this confirmed."],
        },
      },
      rationale: "Likely diagnosis recorded.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const review = AuditEventSchema.parse({
      id: "30000000-0000-4000-8000-000000000021",
      timestamp: "2026-06-10T09:02:00.000Z",
      actor: "product-support",
      action: "diagnosis-reviewed",
      ticketId: ticket.id,
      before: { diagnosisId: diagnosis.id },
      after: {
        diagnosisReview: {
          decision: "approve",
          diagnosisId: diagnosis.id,
          ticketId: ticket.id,
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: { state: "none" },
          editedDiagnosis: diagnosis.after.diagnosis,
          actor: "product-support",
          rationale: "The likely diagnosis is ready for confirmation.",
          reviewedAt: "2026-06-10T09:02:00.000Z",
        },
      },
      rationale: "The likely diagnosis is ready for confirmation.",
      knowledgeArticleIds: [],
      result: "success",
    });

    const lifecycle = buildTicketLifecycleView({
      ticket,
      recommendations: [awaitingEvidenceRecommendation],
      audits: [diagnosis, review],
    });

    expect(lifecycle.phase).toBe("awaiting-confirmation");
    expect(lifecycle.primaryAction).toMatchObject({
      kind: "evaluate-ticket",
      availability: "primary",
    });
    expect(lifecycle.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "evaluate-ticket", availability: "primary" }),
      expect.objectContaining({ kind: "review-diagnosis", availability: "blocked" }),
      expect.objectContaining({ kind: "revalidate-diagnosis", availability: "blocked" }),
    ]));
  });
});
