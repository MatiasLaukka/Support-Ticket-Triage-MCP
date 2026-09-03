import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type AuditEvent,
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

function matrixRecommendation(
  overrides: Partial<typeof recommendation> = {},
) {
  return TriageRecommendationSchema.parse({
    ...recommendation,
    id: "10000000-0000-4000-8000-000000000002",
    resolution: "approved",
    supportState: "diagnosing",
    ...overrides,
  });
}

function matrixAudit(
  id: string,
  action: AuditEvent["action"],
  timestamp: string,
  overrides: Partial<AuditEvent> = {},
) {
  return AuditEventSchema.parse({
    id,
    timestamp,
    actor: "approval-desk",
    action,
    ticketId: ticket.id,
    before: {},
    after: {},
    rationale: "Lifecycle matrix fixture.",
    knowledgeArticleIds: [],
    result: "success",
    ...overrides,
  });
}

function matrixSubmission(recommendationId: string, timestamp = "2026-06-10T09:00:00.000Z") {
  return matrixAudit(
    `40000000-0000-4000-8000-${recommendationId.slice(-12)}`,
    "recommendation-submitted",
    timestamp,
    { recommendationId },
  );
}

function matrixResponse(recommendationId: string, timestamp = "2026-06-10T09:01:00.000Z") {
  return matrixAudit(
    `50000000-0000-4000-8000-${recommendationId.slice(-12)}`,
    "customer-response-sent",
    timestamp,
    {
      recommendationId,
      after: { sentAt: timestamp },
    },
  );
}

function matrixDiagnosis(
  id: string,
  timestamp: string,
  confidence: "confirmed" | "likely" = "confirmed",
  owner: "engineering" | "support" | "customer" = "engineering",
  diagnosticState?: Record<string, unknown>,
  recommendedNextAction = "Apply the governed mitigation.",
) {
  return matrixAudit(id, "diagnosis-completed", timestamp, {
    after: {
      diagnosis: {
        status: "completed",
        causeType: "performance",
        customerSafeSummary: "The checkout processing path is delayed.",
        evidenceUsed: ["request trace"],
        confidence,
        owner,
        recommendedNextAction,
        doNotSay: ["Do not claim this is resolved."],
        ...(diagnosticState === undefined ? {} : { diagnosticState }),
      },
    },
  });
}

function matrixEscalatedDiagnosis(id: string, timestamp: string) {
  return matrixAudit(id, "diagnostic-escalated", timestamp, {
    after: {
      diagnosis: {
        status: "completed",
        causeType: "performance",
        customerSafeSummary: "Two evidence-backed causes remain plausible.",
        evidenceUsed: ["request trace"],
        confidence: "likely",
        owner: "engineering",
        recommendedNextAction: "Specialist review is required.",
        doNotSay: [],
        diagnosticState: {
          state: "escalated",
          diagnosticAttempts: 2,
          escalationReason: "diagnostic-ambiguity",
          specialistTeam: "product",
          hypotheses: [
            {
              id: "browser-session",
              label: "Browser/session issue",
              status: "plausible",
              evidenceUsed: ["request trace"],
              evidenceToConfirm: ["Private window result"],
            },
            {
              id: "frontend-loading",
              label: "Frontend loading issue",
              status: "plausible",
              evidenceUsed: ["request trace"],
              evidenceToConfirm: ["Console error"],
            },
          ],
          evidenceToRequest: ["No further automated questions."],
        },
      },
    },
  });
}

function matrixDiagnosisReview(
  diagnosis: AuditEvent,
  decision: "approve" | "reject" | "revalidate" = "approve",
  timestamp = "2026-06-10T09:03:00.000Z",
) {
  return matrixAudit(
    `60000000-0000-4000-8000-${diagnosis.id.slice(-12)}`,
    "diagnosis-reviewed",
    timestamp,
    {
      actor: "product-support",
      before: { diagnosisId: diagnosis.id },
      after: {
        diagnosisReview: {
          decision,
          diagnosisId: diagnosis.id,
          ticketId: ticket.id,
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: { state: "none" },
          editedDiagnosis: diagnosis.after.diagnosis,
          actor: "product-support",
          rationale: "Lifecycle matrix review.",
          reviewedAt: timestamp,
        },
      },
    },
  );
}

function matrixViews() {
  const approved = matrixRecommendation();
  const submitted = matrixSubmission(approved.id);
  const sent = matrixResponse(approved.id);
  const diagnosis = matrixDiagnosis(
    "30000000-0000-4000-8000-000000000001",
    "2026-06-10T09:02:00.000Z",
  );
  const likelyDiagnosis = matrixDiagnosis(
    "30000000-0000-4000-8000-000000000002",
    "2026-06-10T09:02:00.000Z",
    "likely",
  );
  const confirmedReview = matrixDiagnosisReview(diagnosis);
  const likelyReview = matrixDiagnosisReview(likelyDiagnosis);
  const withConfirmedDiagnosis = [submitted, sent, diagnosis, confirmedReview];
  return [
    {
      name: "evaluation-needed",
      input: { ticket, recommendations: [], audits: [] },
      expectedPrimary: "evaluate-ticket",
      expectedDescriptors: [
        ["evaluate-ticket", "primary", ["evaluation-required"]],
        ["review-diagnosis", "blocked", ["diagnosis-not-ready"]],
        ["revalidate-diagnosis", "blocked", ["diagnosis-not-ready"]],
        ["reject-diagnosis", "blocked", ["diagnosis-not-ready"]],
      ],
    },
    {
      name: "recommendation-review",
      input: {
        ticket,
        recommendations: [TriageRecommendationSchema.parse({ ...recommendation, resolution: "pending" })],
        audits: [matrixSubmission(recommendation.id)],
      },
      expectedPrimary: "review-recommendation",
      expectedDescriptors: [
        ["review-recommendation", "primary", ["recommendation-approval-required"]],
        ["send-customer-response", "blocked", ["recommendation-approval-required"]],
      ],
    },
    {
      name: "waiting-for-customer",
      input: {
        ticket,
        recommendations: [matrixRecommendation({
          supportState: "needs-information",
          missingEvidence: [{
            id: "request-id",
            label: "Request ID",
            aliases: [],
            customerQuestion: "Share the request ID.",
            source: "policy",
          }],
        })],
        audits: [submitted, sent],
      },
      expectedPrimary: "none",
      expectedDescriptors: [["none", "primary", ["awaiting-customer-reply"]]],
    },
    {
      name: "diagnosis-ready",
      input: { ticket, recommendations: [approved], audits: [submitted, sent] },
      expectedPrimary: "record-diagnosis",
      expectedDescriptors: [
        ["record-diagnosis", "primary", ["diagnosis-ready"]],
        ["review-diagnosis", "blocked", ["diagnosis-not-recorded"]],
        ["revalidate-diagnosis", "blocked", ["diagnosis-not-recorded"]],
        ["reject-diagnosis", "blocked", ["diagnosis-not-recorded"]],
      ],
    },
    {
      name: "diagnosis-review",
      input: { ticket, recommendations: [approved], audits: [...withConfirmedDiagnosis.slice(0, 2), diagnosis] },
      expectedPrimary: "review-diagnosis",
      expectedDescriptors: [
        ["review-diagnosis", "primary", ["diagnosis-not-approved"]],
        ["revalidate-diagnosis", "blocked", ["diagnosis-not-stale"]],
        ["reject-diagnosis", "available", ["operator-review"]],
      ],
    },
    {
      name: "awaiting-confirmation",
      input: {
        ticket,
        recommendations: [matrixRecommendation({
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
        })],
        audits: [submitted, sent, likelyDiagnosis, likelyReview],
      },
      expectedPrimary: "evaluate-ticket",
      expectedDescriptors: [
        ["evaluate-ticket", "primary", ["missing-evidence", "fix-not-available"]],
        ["review-diagnosis", "blocked", ["diagnosis-not-confirmed"]],
        ["revalidate-diagnosis", "blocked", ["diagnosis-not-confirmed"]],
        ["reject-diagnosis", "blocked", ["diagnosis-not-confirmed"]],
      ],
    },
    {
      name: "awaiting-fix",
      input: { ticket, recommendations: [approved], audits: withConfirmedDiagnosis },
      expectedPrimary: "record-fix-available",
      expectedDescriptors: [
        ["record-fix-available", "primary", ["fix-not-available"]],
        ["apply-scoped-fix", "blocked", ["fix-not-available"]],
      ],
    },
    {
      name: "fix-ready",
      input: {
        ticket,
        recommendations: [approved],
        audits: [...withConfirmedDiagnosis, matrixAudit(
          "70000000-0000-4000-8000-000000000001",
          "platform-mitigation-available",
          "2026-06-10T09:04:00.000Z",
          { before: { diagnosisId: diagnosis.id }, after: { fix: { status: "available" } } },
        )],
      },
      expectedPrimary: "apply-scoped-fix",
      expectedDescriptors: [
        ["apply-scoped-fix", "primary", ["fix-ready"]],
        ["record-fix-available", "completed", ["fix-already-available"]],
      ],
    },
    {
      name: "verification",
      input: {
        ticket,
        recommendations: [approved],
        audits: [...withConfirmedDiagnosis, matrixAudit(
          "70000000-0000-4000-8000-000000000002",
          "fix-available",
          "2026-06-10T09:04:00.000Z",
          { before: { diagnosisId: diagnosis.id }, after: { fix: { status: "available" } } },
        )],
      },
      expectedPrimary: "evaluate-ticket",
      expectedDescriptors: [
        ["evaluate-ticket", "primary", ["fix-verification-required"]],
        ["record-fix-ineffective", "available", ["fix-verification-available"]],
      ],
    },
    {
      name: "ready-for-close",
      input: {
        ticket,
        recommendations: [matrixRecommendation({ supportState: "ready-for-close" })],
        audits: [matrixSubmission(approved.id), matrixResponse(approved.id)],
      },
      expectedPrimary: "resolve-ticket",
      expectedDescriptors: [
        ["resolve-ticket", "primary", ["ready-for-close"]],
        ["send-customer-response", "completed", ["response-already-sent"]],
      ],
    },
    {
      name: "escalated",
      input: {
        ticket,
        recommendations: [matrixRecommendation({ supportState: "escalated" })],
        audits: [submitted, sent, matrixAudit(
          "80000000-0000-4000-8000-000000000001",
          "diagnostic-escalated",
          "2026-06-10T09:02:00.000Z",
          { after: { diagnosis: {
            status: "completed",
            causeType: "performance",
            customerSafeSummary: "Two causes remain plausible.",
            evidenceUsed: ["request trace"],
            confidence: "likely",
            owner: "engineering",
            recommendedNextAction: "Specialist review is required.",
            doNotSay: [],
            diagnosticState: {
              state: "escalated",
              hypotheses: [],
              evidenceToRequest: [],
              escalationReason: "diagnostic-ambiguity",
            },
          } } },
        )],
      },
      expectedPrimary: "specialist-review",
      expectedDescriptors: [["specialist-review", "primary", ["specialist-review-required"]]],
    },
    {
      name: "resolved",
      input: { ticket: TicketSchema.parse({ ...ticket, status: "resolved" }), recommendations: [], audits: [] },
      expectedPrimary: "none",
      expectedDescriptors: [
        ["none", "primary", ["already-completed"]],
        ["resolve-ticket", "completed", ["already-completed"]],
      ],
    },
  ] as const;
}

describe("lifecycle projection", () => {
  it.each(matrixViews())("keeps the complete phase/action contract for $name", ({ name, input, expectedPrimary, expectedDescriptors }) => {
    const view = buildTicketLifecycleView(input);

    expect(view.phase, name).toBe(name);
    expect(view.primaryAction).toMatchObject({ kind: expectedPrimary, availability: "primary" });
    expect(view.actions).toEqual(expect.arrayContaining(expectedDescriptors.map(([kind, availability, reasonCodes]) =>
      expect.objectContaining({ kind, availability, reasonCodes }),
    )));
    expect(new Set(view.actions.map(({ kind }) => kind)).size).toBe(view.actions.length);
  });

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

  it("keeps an approved current recommendation on the send path until its response is sent", () => {
    const approvedRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      resolution: "approved",
    });
    const submitted = AuditEventSchema.parse({
      id: "20000000-0000-4000-8000-000000000011",
      timestamp: approvedRecommendation.createdAt,
      actor: "support",
      action: "recommendation-submitted",
      ticketId: ticket.id,
      recommendationId: approvedRecommendation.id,
      before: {},
      after: {},
      rationale: approvedRecommendation.rationale,
      knowledgeArticleIds: [],
      result: "success",
    });

    const lifecycle = buildTicketLifecycleView({
      ticket,
      recommendations: [approvedRecommendation],
      audits: [submitted],
    });

    expect(lifecycle.phase).toBe("recommendation-review");
    expect(lifecycle.primaryAction).toMatchObject({
      kind: "send-customer-response",
      availability: "primary",
    });
    expect(lifecycle.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "send-customer-response",
        availability: "primary",
      }),
    ]));
    expect(lifecycle.response.state).toBe("approved");
    expect(lifecycle.current.recommendationId).toBe(approvedRecommendation.id);
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

  it("does not carry an older sent-response summary onto a newer pending recommendation", () => {
    const firstRecommendation = matrixRecommendation({
      id: "10000000-0000-4000-8000-000000000070",
      resolution: "approved",
      createdAt: "2026-06-10T09:00:00.000Z",
    });
    const secondRecommendation = matrixRecommendation({
      id: "10000000-0000-4000-8000-000000000071",
      resolution: "pending",
      supportState: "information-received",
      createdAt: "2026-06-10T09:03:00.000Z",
    });
    const reply = matrixAudit(
      "60000000-0000-4000-8000-000000000070",
      "customer-reply-received",
      "2026-06-10T09:02:00.000Z",
      {
        after: { body: "Here is the requested evidence." },
      },
    );
    const workflow = buildTicketWorkflowReadModel({
      ticket,
      recommendations: [firstRecommendation, secondRecommendation],
      audits: [
        matrixSubmission(firstRecommendation.id, firstRecommendation.createdAt),
        matrixResponse(firstRecommendation.id, "2026-06-10T09:01:00.000Z"),
        reply,
        matrixSubmission(secondRecommendation.id, secondRecommendation.createdAt),
      ],
    });

    expect(workflow.recommendationSummary).toMatchObject({
      latestRecommendationId: secondRecommendation.id,
      latestResolution: "pending",
      workflowState: "draft-ready",
      hasPendingRecommendation: true,
      hasSentResponse: false,
    });
    expect(workflow.recommendationSummary.latestSentAt).toBeUndefined();
  });

  it.each([
    {
      name: "rejected",
      audit: (diagnosis: AuditEvent) => matrixDiagnosisReview(
        diagnosis,
        "reject",
        "2026-06-10T09:03:00.000Z",
      ),
      reasonCode: "diagnosis-rejected",
    },
    {
      name: "invalidated",
      audit: (diagnosis: AuditEvent) => matrixAudit(
        "30000000-0000-4000-8000-000000000051",
        "diagnosis-invalidated",
        "2026-06-10T09:03:00.000Z",
        {
          before: { diagnosisId: diagnosis.id },
          after: { diagnosisInvalidated: true },
        },
      ),
      reasonCode: "diagnosis-invalidated",
    },
  ])("returns evaluation-needed after a $name escalated diagnosis", ({ audit, reasonCode }) => {
    const escalatedDiagnosis = matrixEscalatedDiagnosis(
      "30000000-0000-4000-8000-000000000050",
      "2026-06-10T09:02:00.000Z",
    );
    const escalationRecommendation = matrixRecommendation({
      supportState: "escalated",
      escalationRequired: true,
      escalationReasons: ["diagnostic-ambiguity"],
    });
    const audits = [escalatedDiagnosis, audit(escalatedDiagnosis)];
    const input = {
      ticket,
      recommendations: [escalationRecommendation],
      audits,
    };

    const lifecycle = buildTicketLifecycleView(input);
    const guidance = buildTicketWorkflowReadModel(input).operatorGuidance;

    expect(lifecycle.phase).toBe("evaluation-needed");
    expect(lifecycle.primaryAction).toMatchObject({
      kind: "evaluate-ticket",
      availability: "primary",
    });
    expect(lifecycle.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "review-diagnosis",
        availability: "blocked",
        reasonCodes: [reasonCode],
      }),
      expect.objectContaining({
        kind: "revalidate-diagnosis",
        availability: "blocked",
        reasonCodes: [reasonCode],
      }),
    ]));
    expect(guidance.nextAction).toBe("evaluate-ticket");
    expect(guidance.requiredReview).toBeUndefined();
  });

  it.each([
    {
      name: "rejected",
      audit: (diagnosis: AuditEvent) => matrixDiagnosisReview(
        diagnosis,
        "reject",
        "2026-06-10T09:03:00.000Z",
      ),
    },
    {
      name: "invalidated",
      audit: (diagnosis: AuditEvent) => matrixAudit(
        "30000000-0000-4000-8000-000000000053",
        "diagnosis-invalidated",
        "2026-06-10T09:03:00.000Z",
        {
          before: { diagnosisId: diagnosis.id },
          after: { diagnosisInvalidated: true },
        },
      ),
    },
  ])("keeps a newer pending recommendation reviewable after a $name escalated diagnosis", ({ audit }) => {
    const escalatedDiagnosis = matrixEscalatedDiagnosis(
      "30000000-0000-4000-8000-000000000052",
      "2026-06-10T09:02:00.000Z",
    );
    const newerRecommendation = matrixRecommendation({
      id: "10000000-0000-4000-8000-000000000053",
      resolution: "pending",
      supportState: "ready-for-approval",
      createdAt: "2026-06-10T09:04:00.000Z",
    });
    const input = {
      ticket,
      recommendations: [newerRecommendation],
      audits: [
        escalatedDiagnosis,
        audit(escalatedDiagnosis),
        matrixSubmission(newerRecommendation.id, newerRecommendation.createdAt),
      ],
    };

    const lifecycle = buildTicketLifecycleView(input);
    const guidance = buildTicketWorkflowReadModel(input).operatorGuidance;

    expect(lifecycle.phase).toBe("recommendation-review");
    expect(lifecycle.primaryAction).toMatchObject({
      kind: "review-recommendation",
      availability: "primary",
    });
    expect(guidance.nextAction).toBe("review-recommendation");
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

  it.each([
    {
      owner: "customer" as const,
      recommendedNextAction: "Ask the customer to confirm whether the issue still reproduces.",
    },
    {
      owner: "support" as const,
      recommendedNextAction: "Verify the documented support-side action, then confirm the outcome.",
    },
  ])("keeps a confirmed $owner diagnosis actionable without inventing a platform fix", ({ owner, recommendedNextAction }) => {
    const approved = matrixRecommendation();
    const diagnosis = matrixDiagnosis(
      `30000000-0000-4000-8000-0000000000${owner === "customer" ? "61" : "62"}`,
      "2026-06-10T09:02:00.000Z",
      "confirmed",
      owner,
      undefined,
      recommendedNextAction,
    );
    const review = matrixDiagnosisReview(
      diagnosis,
      "approve",
      owner === "customer" ? "2026-06-10T09:03:00.000Z" : "2026-06-10T09:03:30.000Z",
    );
    const input = {
      ticket,
      recommendations: [approved],
      audits: [matrixSubmission(approved.id), matrixResponse(approved.id), diagnosis, review],
    };

    const lifecycle = buildTicketLifecycleView(input);
    const workflow = buildTicketWorkflowReadModel(input);

    expect(lifecycle.phase).toBe("verification");
    expect(lifecycle.fix.state).toBe("none");
    expect(lifecycle.fix.reasonCodes).toContain("no-platform-fix-required");
    expect(lifecycle.primaryAction).toMatchObject({
      kind: "evaluate-ticket",
      availability: "primary",
    });
    expect(lifecycle.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "evaluate-ticket", availability: "primary" }),
    ]));
    expect(lifecycle.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "record-fix-available", availability: "primary" }),
      expect.objectContaining({ kind: "apply-scoped-fix", availability: "primary" }),
      expect.objectContaining({ kind: "record-fix-ineffective" }),
    ]));
    expect(workflow.operatorGuidance.nextAction).toBe("evaluate-ticket");
    expect(workflow.operatorGuidance.customerNextStep).toBe(recommendedNextAction);
  });

  it("does not attach an older platform fix to a newer authoritative no-platform-fix diagnosis", () => {
    const approved = matrixRecommendation();
    const engineeringDiagnosis = matrixDiagnosis(
      "30000000-0000-4000-8000-000000000064",
      "2026-06-10T09:02:00.000Z",
      "confirmed",
      "engineering",
    );
    const engineeringReview = matrixDiagnosisReview(
      engineeringDiagnosis,
      "approve",
      "2026-06-10T09:03:00.000Z",
    );
    const oldFix = matrixAudit(
      "70000000-0000-4000-8000-000000000064",
      "fix-available",
      "2026-06-10T09:04:00.000Z",
      {
        before: { diagnosisId: engineeringDiagnosis.id },
        after: { fix: { status: "available" } },
      },
    );
    const supportDiagnosis = matrixDiagnosis(
      "30000000-0000-4000-8000-000000000065",
      "2026-06-10T09:05:00.000Z",
      "confirmed",
      "support",
      undefined,
      "Verify the support-side correction with the customer.",
    );
    const supportReview = matrixDiagnosisReview(
      supportDiagnosis,
      "approve",
      "2026-06-10T09:06:00.000Z",
    );

    const lifecycle = buildTicketLifecycleView({
      ticket,
      recommendations: [approved],
      audits: [
        matrixSubmission(approved.id),
        matrixResponse(approved.id),
        engineeringDiagnosis,
        engineeringReview,
        oldFix,
        supportDiagnosis,
        supportReview,
      ],
    });

    expect(lifecycle.phase).toBe("verification");
    expect(lifecycle.fix).toMatchObject({
      state: "none",
      diagnosisId: supportDiagnosis.id,
      reasonCodes: ["no-platform-fix-required"],
      diagnosisStillAuthoritative: true,
    });
    expect(lifecycle.fix.fixEventId).toBeUndefined();
    expect(lifecycle.current.fixEventId).toBeUndefined();
  });

  it("keeps engineering-owned confirmed diagnoses on the governed awaiting-fix path", () => {
    const approved = matrixRecommendation();
    const diagnosis = matrixDiagnosis(
      "30000000-0000-4000-8000-000000000063",
      "2026-06-10T09:02:00.000Z",
      "confirmed",
      "engineering",
      undefined,
      "Apply the governed mitigation.",
    );
    const review = matrixDiagnosisReview(diagnosis);
    const lifecycle = buildTicketLifecycleView({
      ticket,
      recommendations: [approved],
      audits: [matrixSubmission(approved.id), matrixResponse(approved.id), diagnosis, review],
    });

    expect(lifecycle.phase).toBe("awaiting-fix");
    expect(lifecycle.fix.state).toBe("awaiting");
    expect(lifecycle.primaryAction).toMatchObject({
      kind: "record-fix-available",
      availability: "primary",
    });
  });

  it("correlates a production-shaped platform mitigation through the current known event", () => {
    const knownEventId = "EVT-2026-06-10-WEBHOOK-LATENCY";
    const approved = matrixRecommendation({
      knownEventId,
      supportState: "waiting-on-platform-fix",
    });
    const diagnosis = matrixDiagnosis(
      "30000000-0000-4000-8000-000000000066",
      "2026-06-10T09:02:00.000Z",
      "confirmed",
      "engineering",
    );
    const review = matrixDiagnosisReview(diagnosis);
    const mitigation = matrixAudit(
      "70000000-0000-4000-8000-000000000066",
      "platform-mitigation-available",
      "2026-06-10T09:04:00.000Z",
      {
        before: { eventId: knownEventId, status: "active" },
        after: { eventId: knownEventId, status: "available" },
      },
    );

    const lifecycle = buildTicketLifecycleView({
      ticket,
      recommendations: [approved],
      audits: [
        matrixSubmission(approved.id),
        matrixResponse(approved.id),
        diagnosis,
        review,
        mitigation,
      ],
    });

    expect(lifecycle.phase).toBe("fix-ready");
    expect(lifecycle.fix).toMatchObject({
      state: "available",
      diagnosisId: diagnosis.id,
      fixEventId: mitigation.id,
      diagnosisStillAuthoritative: true,
    });
    expect(lifecycle.primaryAction).toMatchObject({
      kind: "apply-scoped-fix",
      availability: "primary",
    });
    expect(lifecycle.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "apply-scoped-fix", availability: "primary" }),
    ]));
  });
});
