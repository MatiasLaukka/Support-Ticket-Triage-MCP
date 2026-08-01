import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type TriageRecommendation,
} from "../src/domain.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import {
  customerReplyWatermarkFromAudits,
  type DiagnosisContext,
  type SubmitEvaluationInput,
} from "../src/triage-service.js";
import {
  diagnosisContextForTicket,
  diagnosisContextFromAudit,
  latestFixContextFromAudits,
  selectPersistedDiagnosticWorkflowContext,
} from "../src/approval-desk/diagnostic-workflow.js";
import { diagnosisReviewViews } from "../src/approval-desk/diagnosis-review.js";
import { latestAuthoritativeDiagnosis } from "../src/approval-desk/workflow-guidance.js";

const ticket = TicketSchema.parse({
  id: "TKT-1010",
  createdAt: "2026-06-10T08:25:00.000Z",
  updatedAt: "2026-06-10T08:30:00.000Z",
  customer: {
    name: "Maple Studio",
    plan: "starter",
    region: "us-west",
    vip: false,
  },
  subject: "Campaign editor is blank",
  description: "The campaign editor stays blank after opening a campaign.",
  status: "in-progress",
  category: "performance",
  priority: "P3",
  team: "product",
  tags: ["performance"],
  sla: {
    responseDueAt: "2026-06-10T12:00:00.000Z",
    breached: false,
  },
  relatedTicketIds: [],
  revision: 2,
});

const recommendation = TriageRecommendationSchema.parse({
  id: "10000000-0000-4000-8000-000000000010",
  ticketId: "TKT-1010",
  sourceRevision: 2,
  category: "performance",
  priority: "P3",
  team: "product",
  tags: ["performance"],
  duplicateCandidates: [],
  outageRisk: "none",
  securityRisk: "none",
  slaRisk: "none",
  missingInformation: [],
  supportState: "diagnosing",
  requiredEvidence: [],
  providedEvidence: [],
  missingEvidence: [],
  knowledgeArticleIds: ["performance-troubleshooting"],
  draftCustomerResponse: "We are investigating the campaign editor.",
  rationale: "The campaign editor symptoms match the performance playbook.",
  confidence: 0.9,
  recommendedNextAction: "Record the diagnosis after the approved response.",
  escalationRequired: false,
  escalationReasons: [],
  resolution: "approved",
  createdAt: "2026-06-10T09:00:00.000Z",
});

let nextAuditId = 1;

function auditId(prefix: string): string {
  return `${prefix}-0000-4000-8000-${String(nextAuditId++).padStart(12, "0")}`;
}

function diagnosisAudit(
  timestamp: string,
  diagnosticState: Record<string, unknown>,
) {
  return AuditEventSchema.parse({
    id: auditId("20000000"),
    timestamp,
    actor: "product-support",
    action: "diagnosis-completed",
    ticketId: ticket.id,
    before: {},
    after: {
      diagnosis: {
        status: "completed",
        causeType: "performance",
        customerSafeSummary: "The campaign editor remains ambiguous.",
        evidenceUsed: ["blank editor"],
        confidence: "likely",
        owner: "engineering",
        recommendedNextAction: "Collect discriminating browser evidence.",
        doNotSay: ["Do not claim a final root cause."],
        diagnosticState,
      },
    },
    rationale: "Persisted diagnostic context for the next evaluation.",
    knowledgeArticleIds: ["performance-troubleshooting"],
    result: "success",
  });
}

function customerReply(timestamp: string, body: string) {
  return AuditEventSchema.parse({
    id: auditId("30000000"),
    timestamp,
    actor: "Jamie Lee",
    action: "customer-reply-received",
    ticketId: ticket.id,
    before: {},
    after: { body },
    rationale: "Customer supplied diagnostic follow-up evidence.",
    knowledgeArticleIds: [],
    result: "success",
  });
}

function fixAudit(timestamp: string) {
  return AuditEventSchema.parse({
    id: auditId("50000000"),
    timestamp,
    actor: "product-support",
    action: "fix-available",
    ticketId: ticket.id,
    before: {},
    after: {
      fix: {
        status: "available",
        customerSafeSummary: "A governed mitigation is available.",
        customerAction: "Retry the affected campaign editor.",
        verificationRequest: "Tell us whether the editor still appears blank.",
      },
    },
    rationale: "Persisted fix context for the next evaluation.",
    knowledgeArticleIds: ["performance-troubleshooting"],
    result: "success",
  });
}

const ambiguousState = {
  state: "ambiguous",
  diagnosticAttempts: 0,
  hypotheses: [
    {
      id: "browser-session",
      label: "Browser/session issue",
      status: "plausible",
      evidenceUsed: ["blank editor"],
      evidenceToConfirm: ["Private window works"],
    },
    {
      id: "frontend-loading",
      label: "Frontend loading issue",
      status: "plausible",
      evidenceUsed: ["blank editor"],
      evidenceToConfirm: ["Console error persists"],
    },
  ],
  evidenceToRequest: ["Try a private or incognito window."],
};

describe("diagnosisContextForTicket", () => {
  it("selects the edited diagnosis context from a governed review audit", () => {
    const reviewedAt = "2026-06-10T09:05:00.000Z";
    const original = diagnosisAudit("2026-06-10T09:02:00.000Z", ambiguousState);
    const editedDiagnosis = {
      ...(original.after.diagnosis as Record<string, unknown>),
      customerSafeSummary: "The reviewed diagnosis uses customer-safe wording.",
    };
    const review = AuditEventSchema.parse({
      id: auditId("40000000"),
      timestamp: reviewedAt,
      actor: "casey",
      action: "diagnosis-reviewed",
      ticketId: ticket.id,
      before: { diagnosisId: original.id },
      after: {
        diagnosisReview: {
          decision: "approve",
          diagnosisId: original.id,
          ticketId: ticket.id,
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: { state: "none" },
          editedDiagnosis,
          actor: "casey",
          reviewedAt,
        },
      },
      rationale: "Diagnosis reviewed by the operator.",
      knowledgeArticleIds: [],
      result: "success",
    });

    expect(diagnosisContextFromAudit(review)).toMatchObject({
      customerSafeSummary: "The reviewed diagnosis uses customer-safe wording.",
      diagnosticState: { state: "ambiguous" },
    });
  });

  it("does not select edited diagnosis context from a rejected review", () => {
    const reviewedAt = "2026-06-10T09:05:00.000Z";
    const original = diagnosisAudit("2026-06-10T09:02:00.000Z", ambiguousState);
    const review = AuditEventSchema.parse({
      id: auditId("40000000"),
      timestamp: reviewedAt,
      actor: "casey",
      action: "diagnosis-reviewed",
      ticketId: ticket.id,
      before: { diagnosisId: original.id },
      after: {
        diagnosisReview: {
          decision: "reject",
          diagnosisId: original.id,
          ticketId: ticket.id,
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: { state: "none" },
          editedDiagnosis: {
            ...(original.after.diagnosis as Record<string, unknown>),
            customerSafeSummary: "Rejected context must not drive evaluation.",
          },
          actor: "casey",
          rationale: "The edited diagnosis is not supported by the evidence.",
          reviewedAt,
        },
      },
      rationale: "Diagnosis rejected by the operator.",
      knowledgeArticleIds: [],
      result: "success",
    });

    expect(diagnosisContextFromAudit(review)).toBeUndefined();
    expect(
      selectPersistedDiagnosticWorkflowContext([original, review]).diagnosis,
    ).toBeUndefined();
  });

  it("selects only a strictly associated revalidation as the current persisted diagnosis context", () => {
    const original = diagnosisAudit("2026-06-10T09:02:00.000Z", ambiguousState);
    const reply = customerReply(
      "2026-06-10T08:59:59.9999+00:00",
      "The same behavior is still happening after the first investigation.",
    );
    const revalidatedAt = "2026-06-10T10:00:00.0008+02:00";
    const editedDiagnosis = {
      ...(original.after.diagnosis as Record<string, unknown>),
      customerSafeSummary: "The revalidated diagnosis remains customer-safe.",
    };
    const revalidated = AuditEventSchema.parse({
      id: auditId("40000000"),
      timestamp: revalidatedAt,
      actor: "casey",
      action: "diagnosis-reviewed",
      ticketId: ticket.id,
      before: { diagnosisId: original.id },
      after: {
        diagnosisReview: {
          decision: "revalidate",
          diagnosisId: original.id,
          ticketId: ticket.id,
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: {
            state: "reply",
            id: reply.id,
            timestamp: reply.timestamp,
          },
          editedDiagnosis,
          actor: "casey",
          rationale: "The later reply supports the existing diagnosis.",
          reviewedAt: revalidatedAt,
        },
      },
      rationale: "Diagnosis revalidated by the operator.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const malformedLaterReview = AuditEventSchema.parse({
      ...revalidated,
      id: auditId("40000000"),
      actor: "not-casey",
      after: {
        diagnosisReview: {
          decision: "approve",
          diagnosisId: original.id,
          ticketId: ticket.id,
          sourceTicketRevision: ticket.revision,
          sourceConversationWatermark: {
            state: "reply",
            id: reply.id,
            timestamp: reply.timestamp,
          },
          editedDiagnosis,
          actor: "casey",
          rationale: undefined,
          reviewedAt: "2026-06-10T10:00:00.0009+02:00",
        },
      },
      timestamp: "2026-06-10T10:00:00.0009+02:00",
    });

    const context = selectPersistedDiagnosticWorkflowContext([
      original,
      reply,
      revalidated,
      malformedLaterReview,
    ]);

    expect(context.diagnosis).toMatchObject({
      event: { id: revalidated.id },
      context: {
        customerSafeSummary: "The revalidated diagnosis remains customer-safe.",
      },
    });
  });

  it("projects an active known event into the existing platform-delay diagnosis", () => {
    const eventTicket = TicketSchema.parse({
      ...ticket,
      id: "TKT-1028",
      createdAt: "2026-06-10T06:35:00.000Z",
      updatedAt: "2026-06-10T07:45:00.000Z",
      subject: "Webhook deliveries delayed by ten minutes",
      description: "Order webhooks arrive late after the source event.",
      category: "integration",
      priority: "P2",
      team: "integrations",
      tags: ["webhook", "delivery", "latency"],
      sla: { ...ticket.sla, responseDueAt: "2026-06-10T11:50:00.000Z" },
    });
    const eventRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      ticketId: "TKT-1028",
      supportState: "known-cause",
      knownCause: "webhook-delivery-latency",
      knownEventId: "EVT-2026-06-10-WEBHOOK-LATENCY",
      knownEventMatchReasons: ["known-cause", "service", "symptom", "time-window"],
      category: "integration",
      priority: "P2",
      team: "integrations",
      knowledgeArticleIds: ["webhook-signature-validation"],
    });

    expect(diagnosisContextForTicket(eventTicket, eventRecommendation)).toMatchObject({
      causeType: "platform-delay",
      confidence: "likely",
      owner: "engineering",
      knownEventId: "EVT-2026-06-10-WEBHOOK-LATENCY",
      knownEventMatchReasons: expect.arrayContaining(["time-window"]),
    });
  });

  it("uses a resolved known event as confirmed known-cause guidance", () => {
    const eventTicket = TicketSchema.parse({
      ...ticket,
      id: "TKT-1030",
      createdAt: "2026-06-10T06:15:00.000Z",
      updatedAt: "2026-06-10T07:25:00.000Z",
      subject: "SMS opt-out not reflected on profile",
      description: "A subscriber replied STOP but remains eligible.",
      category: "api",
      priority: "P3",
      team: "api-platform",
      tags: ["sms", "opt-out", "consent"],
      sla: { ...ticket.sla, responseDueAt: "2026-06-10T13:40:00.000Z" },
    });
    const eventRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      ticketId: "TKT-1030",
      supportState: "known-cause",
      knownCause: "sms-stop-sync-delay",
      knownEventId: "EVT-2026-06-10-SMS-CONSENT-SYNC",
      category: "api",
      priority: "P3",
      team: "api-platform",
      knowledgeArticleIds: ["sms-compliance", "profile-sync-issues"],
    });

    expect(diagnosisContextForTicket(eventTicket, eventRecommendation)).toMatchObject({
      confidence: "confirmed",
      customerSafeSummary: expect.stringContaining("consent-state sync issue"),
    });
  });

  it("does not confirm a required-evidence known cause while evidence is missing", () => {
    const gatedRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      supportState: "known-cause",
      knownCause: "webhook-secret-rotation",
      category: "integration",
      team: "integrations",
      knowledgeArticleIds: ["webhook-signature-validation"],
      requiredEvidence: [
        {
          id: "delivery-id",
          label: "Delivery ID",
          customerQuestion: "delivery ID",
          aliases: ["delivery id", "webhook delivery"],
          source: "known-cause",
        },
      ],
      missingEvidence: [
        {
          id: "delivery-id",
          label: "Delivery ID",
          customerQuestion: "delivery ID",
          aliases: ["delivery id", "webhook delivery"],
          source: "known-cause",
        },
      ],
    });

    expect(diagnosisContextForTicket(ticket, gatedRecommendation)).toMatchObject({
      confidence: "likely",
      customerSafeSummary: expect.not.stringContaining("post-rotation issue"),
    });
  });

  it("does not let a playbook confirm a diagnosis while required evidence is missing", () => {
    const gatedRecommendation = TriageRecommendationSchema.parse({
      ...recommendation,
      requiredEvidence: [
        {
          id: "browser-session-details",
          label: "Browser or session details",
          customerQuestion: "browser details",
          aliases: ["browser", "session"],
          source: "policy",
        },
      ],
      missingEvidence: [
        {
          id: "browser-session-details",
          label: "Browser or session details",
          customerQuestion: "browser details",
          aliases: ["browser", "session"],
          source: "policy",
        },
      ],
    });

    expect(
      diagnosisContextForTicket(ticket, gatedRecommendation, [
        customerReply(
          "2026-06-10T09:03:00.000Z",
          "The editor is still blank in a private window and another browser for another admin, and the console shows ChunkLoadError.",
        ),
      ]),
    ).toMatchObject({ confidence: "likely" });
  });

  it("escalates after two persisted non-discriminating diagnostic cycles", () => {
    const first = diagnosisAudit("2026-06-10T09:02:00.000Z", ambiguousState);
    const firstReply = customerReply(
      "2026-06-10T09:03:00.000Z",
      "The editor is still blank, and I did not get a new result.",
    );
    const second = diagnosisAudit("2026-06-10T09:04:00.000Z", {
      ...ambiguousState,
      diagnosticAttempts: 1,
    });
    const secondReply = customerReply(
      "2026-06-10T09:05:00.000Z",
      "It is still blank, with no new browser or console evidence.",
    );

    const diagnosis = diagnosisContextForTicket(ticket, recommendation, [
      first,
      firstReply,
      second,
      secondReply,
    ]);

    expect(diagnosis).toMatchObject({
      confidence: "likely",
      diagnosticState: {
        state: "escalated",
        escalationReason: "diagnostic-ambiguity",
        specialistTeam: "product",
        diagnosticAttempts: 2,
      },
    });
  });

  it("confirms the browser-session hypothesis when a discriminating reply arrives", () => {
    const diagnosis = diagnosisContextForTicket(ticket, recommendation, [
      diagnosisAudit("2026-06-10T09:02:00.000Z", ambiguousState),
      customerReply(
        "2026-06-10T09:03:00.000Z",
        "The campaign editor works in a private window.",
      ),
    ]);

    expect(diagnosis).toMatchObject({
      confidence: "confirmed",
      diagnosticState: {
        state: "confirmed",
        hypotheses: expect.arrayContaining([
          expect.objectContaining({ id: "browser-session", status: "confirmed" }),
          expect.objectContaining({ id: "frontend-loading", status: "ruled-out" }),
        ]),
      },
    });
  });

  it("advances persisted diagnostic state across offset and sub-millisecond timestamps", () => {
    const diagnosis = diagnosisContextForTicket(ticket, recommendation, [
      diagnosisAudit("2026-06-10T12:00:00.0008+02:00", ambiguousState),
      customerReply(
        "2026-06-10T10:00:00.0009Z",
        "The campaign editor works in a private window.",
      ),
    ]);

    expect(diagnosis).toMatchObject({
      confidence: "confirmed",
      diagnosticState: { state: "confirmed" },
    });
  });

  it("advances diagnostic state from a causally later backdated reply", () => {
    const diagnosis = diagnosisContextForTicket(ticket, recommendation, [
      diagnosisAudit("2026-06-10T10:00:00.0009Z", ambiguousState),
      customerReply(
        "2026-06-10T10:00:00.0001Z",
        "The campaign editor works in a private window.",
      ),
    ]);

    expect(diagnosis).toMatchObject({
      confidence: "confirmed",
      diagnosticState: { state: "confirmed" },
    });
  });

  it("invalidates fix context after a causally later backdated reply", () => {
    expect(
      latestFixContextFromAudits([
        fixAudit("2026-06-10T10:00:00.0009Z"),
        customerReply(
          "2026-06-10T10:00:00.0001Z",
          "The campaign editor is still blank after the mitigation.",
        ),
      ]),
    ).toBeUndefined();
  });
});

describe("governed diagnosis review lifecycle", () => {
  it("keeps a complete-evidence diagnosis review, selected fix, revalidation, and closure causally ordered", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "diagnosis-review-lifecycle-"));
    let currentNow = "2026-06-10T09:00:00.000Z";
    try {
      const deps = await createRuntimeDependencies({
        env: {
          TRIAGE_DATA_ROOT: dataRoot,
          TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
          TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
        },
        now: () => new Date(currentNow),
      });
      const service = deps.service;
      const evidence = [{
        id: "event-and-request-identifiers",
        label: "Affected event and request identifiers",
        customerQuestion: "Share the affected event ID and request ID.",
        aliases: ["event id", "request id"],
        source: "policy" as const,
      }];
      const diagnosis: DiagnosisContext = {
        status: "completed",
        causeType: "platform-delay",
        customerSafeSummary:
          "The supplied examples confirm a delay after checkout events were accepted for processing.",
        evidenceUsed: ["affected event ID", "request ID", "accepted API response"],
        confidence: "confirmed",
        owner: "engineering",
        recommendedNextAction:
          "Apply the governed event-processing mitigation and ask the customer to verify the affected timelines.",
        doNotSay: ["Do not expose internal incident reasoning."],
      };

      currentNow = "2026-06-10T09:01:00.000Z";
      await service.addCustomerReply({
        ticketId: "TKT-1001",
        actor: "Maya Chen",
        body:
          "The affected store is northstar.example.test. Event ID evt_12345 and request ID req_12345 were accepted, but checkout events are missing from profile timelines.",
        source: "manual",
        receivedAt: currentNow,
      });
      const firstTicket = await deps.tickets.get("TKT-1001");
      const evidenceRecommendation = await submitEvaluation({
        deps,
        ticketId: "TKT-1001",
        sourceRevision: firstTicket.revision,
        submittedAt: "2026-06-10T09:02:00.000Z",
        watermark: customerReplyWatermarkFromAudits(await deps.audits.list("TKT-1001")),
        supportState: "diagnosing",
        requiredEvidence: evidence,
        providedEvidence: evidence,
        missingEvidence: [],
        customerResponse:
          "Thank you for the affected event and request identifiers. We have enough information to continue the investigation.",
      });
      await approveAndSendForLifecycle({
        deps,
        recommendation: evidenceRecommendation,
        timestamp: "2026-06-10T09:03:00.000Z",
      });
      const diagnosisTicket = await deps.tickets.get("TKT-1001");

      currentNow = "2026-06-10T09:04:00.000Z";
      const recordedDiagnosis = await service.recordDiagnosis({
        ticketId: "TKT-1001",
        actor: "product-support",
        diagnosedAt: currentNow,
        diagnosis,
        knowledgeArticleIds: ["event-tracking-debugging"],
        sourceWorkflow: {
          recommendationId: evidenceRecommendation.id,
          ticketRevision: diagnosisTicket.revision,
          customerReplyWatermark: customerReplyWatermarkFromAudits(
            await deps.audits.list("TKT-1001"),
          ),
        },
      });
      const approvedReview = await service.reviewDiagnosis({
        decision: "approve",
        diagnosisId: recordedDiagnosis.id,
        ticketId: "TKT-1001",
        sourceTicketRevision: diagnosisTicket.revision,
        sourceConversationWatermark: customerReplyWatermarkFromAudits(
          await deps.audits.list("TKT-1001"),
        ),
        editedDiagnosis: diagnosis,
        actor: "casey",
        reviewedAt: "2026-06-10T09:05:00.000Z",
      });

      const diagnosticResponse = await submitEvaluation({
        deps,
        ticketId: "TKT-1001",
        sourceRevision: diagnosisTicket.revision,
        submittedAt: "2026-06-10T09:06:00.000Z",
        watermark: customerReplyWatermarkFromAudits(await deps.audits.list("TKT-1001")),
        supportState: "waiting-on-platform-fix",
        requiredEvidence: evidence,
        providedEvidence: evidence,
        missingEvidence: [],
        customerResponse:
          "We identified a processing delay affecting the supplied checkout-event examples and are applying the correction.",
      });
      await approveAndSendForLifecycle({
        deps,
        recommendation: diagnosticResponse,
        timestamp: "2026-06-10T09:07:00.000Z",
      });
      expect(
        latestAuthoritativeDiagnosis(
          "TKT-1001",
          await deps.audits.list("TKT-1001"),
        ),
      ).toMatchObject({ diagnosisId: recordedDiagnosis.id });

      currentNow = "2026-06-10T09:08:00.000Z";
      const fixAudits = await service.applyDiagnosisFix({
        diagnosisId: recordedDiagnosis.id,
        sourceTicketId: "TKT-1001",
        impactSet: {
          actor: "product-support",
          rationale:
            "The source ticket and the selected related ticket share the confirmed event-processing diagnosis.",
          tickets: [
            {
              ticketId: "TKT-1001",
              reason: "The source ticket supplied the confirmed event and request evidence.",
            },
            {
              ticketId: "TKT-1002",
              reason: "The operator selected the related checkout-event report for the same governed mitigation.",
            },
          ],
        },
        actor: "product-support",
        fixedAt: currentNow,
      });

      expect(fixAudits).toHaveLength(2);
      expect(fixAudits.map((event) => event.ticketId)).toEqual(["TKT-1001", "TKT-1002"]);
      expect((await deps.tickets.get("TKT-1001")).status).not.toBe("resolved");
      await expect(
        service.closeTicket({
          ticketId: "TKT-1001",
          actor: "casey",
          closedAt: "2026-06-10T09:08:30.000Z",
        }),
      ).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });

      const verificationResponse = await submitEvaluation({
        deps,
        ticketId: "TKT-1001",
        sourceRevision: diagnosisTicket.revision,
        submittedAt: "2026-06-10T09:09:00.000Z",
        watermark: customerReplyWatermarkFromAudits(await deps.audits.list("TKT-1001")),
        supportState: "waiting-on-customer-action",
        requiredEvidence: evidence,
        providedEvidence: evidence,
        missingEvidence: [],
        customerResponse:
          "The event-processing correction is available. Please check the affected profile timelines and let us know whether the events now appear.",
      });
      await approveAndSendForLifecycle({
        deps,
        recommendation: verificationResponse,
        timestamp: "2026-06-10T09:10:00.000Z",
      });

      currentNow = "2026-06-10T09:11:00.000Z";
      const confirmationReply = await service.addCustomerReply({
        ticketId: "TKT-1001",
        actor: "Maya Chen",
        body: "The checkout events are appearing in the affected profile timelines now. Thank you.",
        source: "manual",
        receivedAt: currentNow,
      });
      await expect(
        service.applyDiagnosisFix({
          diagnosisId: recordedDiagnosis.id,
          sourceTicketId: "TKT-1001",
          impactSet: {
            actor: "product-support",
            rationale: "This deliberately attempts to reuse the review that predates the customer confirmation.",
            tickets: [{
              ticketId: "TKT-1001",
              reason: "The source ticket was selected.",
            }],
          },
          actor: "product-support",
          fixedAt: "2026-06-10T09:11:30.000Z",
        }),
      ).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });

      const revalidatedReview = await service.reviewDiagnosis({
        decision: "revalidate",
        diagnosisId: recordedDiagnosis.id,
        ticketId: "TKT-1001",
        sourceTicketRevision: diagnosisTicket.revision,
        sourceConversationWatermark: customerReplyWatermarkFromAudits(
          await deps.audits.list("TKT-1001"),
        ),
        editedDiagnosis: diagnosis,
        actor: "casey",
        rationale: "The customer confirmation is consistent with the reviewed diagnosis and recorded mitigation.",
        reviewedAt: "2026-06-10T09:12:00.000Z",
      });
      expect(
        diagnosisReviewViews({
          ticket: await deps.tickets.get("TKT-1001"),
          audits: await deps.audits.list("TKT-1001"),
        }),
      ).toEqual(expect.arrayContaining([
        expect.objectContaining({
          originalDiagnosis: expect.objectContaining({ id: recordedDiagnosis.id }),
          latestReview: expect.objectContaining({
            decision: "revalidate",
            sourceConversationWatermark: expect.objectContaining({
              state: "reply",
              id: confirmationReply.id,
            }),
          }),
          stale: false,
        }),
      ]));

      const readyToClose = await submitEvaluation({
        deps,
        ticketId: "TKT-1001",
        sourceRevision: diagnosisTicket.revision,
        submittedAt: "2026-06-10T09:13:00.000Z",
        watermark: customerReplyWatermarkFromAudits(await deps.audits.list("TKT-1001")),
        supportState: "ready-for-close",
        requiredEvidence: evidence,
        providedEvidence: evidence,
        missingEvidence: [],
        customerResponse:
          "Thank you for confirming that the affected events are now appearing. We will close this support request.",
      });
      await approveAndSendForLifecycle({
        deps,
        recommendation: readyToClose,
        timestamp: "2026-06-10T09:14:00.000Z",
      });
      const closed = await service.closeTicket({
        ticketId: "TKT-1001",
        actor: "casey",
        closedAt: "2026-06-10T09:15:00.000Z",
      });

      const audits = await deps.audits.list("TKT-1001");
      const actions = audits.map((event) => event.action);
      expect(actions).toEqual(expect.arrayContaining([
        "customer-reply-received",
        "diagnosis-completed",
        "diagnosis-reviewed",
        "fix-available",
        "ticket-updated",
      ]));
      expect(actions.indexOf("diagnosis-completed")).toBeLessThan(
        actions.indexOf("diagnosis-reviewed"),
      );
      expect(actions.indexOf("diagnosis-reviewed")).toBeLessThan(
        actions.indexOf("fix-available"),
      );
      expect(auditIndex(audits, approvedReview.id)).toBeLessThan(
        auditIndex(audits, fixAudits[0]!.id),
      );
      expect(auditIndex(audits, confirmationReply.id)).toBeLessThan(
        auditIndex(audits, revalidatedReview.id),
      );
      expect(audits.at(-1)).toMatchObject({ id: closed.auditEvent.id });
      expect(closed.ticket.status).toBe("resolved");

      const diagnoses = diagnosisReviewViews({ ticket: closed.ticket, audits });
      expect(diagnoses).toEqual(expect.arrayContaining([
        expect.objectContaining({
          originalDiagnosis: expect.objectContaining({ id: recordedDiagnosis.id }),
          latestReview: expect.objectContaining({
            decision: "revalidate",
            sourceConversationWatermark: expect.objectContaining({
              state: "reply",
              id: confirmationReply.id,
            }),
          }),
          stale: true,
          staleReasons: ["newer-ticket-revision"],
        }),
      ]));
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});

async function submitEvaluation(input: {
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>;
  ticketId: "TKT-1001";
  sourceRevision: number;
  submittedAt: string;
  watermark: SubmitEvaluationInput["evaluatedCustomerReplyWatermark"];
  supportState: NonNullable<SubmitEvaluationInput["supportState"]>;
  requiredEvidence: NonNullable<SubmitEvaluationInput["requiredEvidence"]>;
  providedEvidence: NonNullable<SubmitEvaluationInput["providedEvidence"]>;
  missingEvidence: NonNullable<SubmitEvaluationInput["missingEvidence"]>;
  customerResponse: string;
}): Promise<TriageRecommendation> {
  const result = await input.deps.service.submitEvaluation({
    ticketId: input.ticketId,
    sourceRevision: input.sourceRevision,
    category: "incident",
    priority: "P1",
    team: "incident-response",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    supportState: input.supportState,
    requiredEvidence: input.requiredEvidence,
    providedEvidence: input.providedEvidence,
    missingEvidence: input.missingEvidence,
    knowledgeArticleIds: ["event-tracking-debugging"],
    draftCustomerResponse: input.customerResponse,
    rationale: "The ordered lifecycle fixture has the required customer evidence and reviewed diagnosis context.",
    confidence: 0.96,
    recommendedNextAction: "Continue the governed support lifecycle.",
    escalationReasons: [],
    actor: "approval-desk",
    submittedAt: input.submittedAt,
    evaluatedCustomerReplyWatermark: input.watermark,
  });
  return result.recommendation;
}

async function approveAndSendForLifecycle(input: {
  deps: Awaited<ReturnType<typeof createRuntimeDependencies>>;
  recommendation: TriageRecommendation;
  timestamp: string;
}): Promise<void> {
  await input.deps.service.approveAndMarkResponseSent({
    approval: {
      recommendationId: input.recommendation.id,
      ticketId: input.recommendation.ticketId,
      expectedRevision: input.recommendation.sourceRevision,
      approvedFields: ["customerResponse"],
      editedCustomerResponse: input.recommendation.draftCustomerResponse,
      actor: "casey",
      confirm: true,
      approvedAt: input.timestamp,
    },
    responseSent: {
      recommendationId: input.recommendation.id,
      ticketId: input.recommendation.ticketId,
      actor: "casey",
      sentAt: input.timestamp,
      customerResponse: input.recommendation.draftCustomerResponse,
    },
  });
}

function auditIndex(audits: readonly { id: string }[], auditId: string): number {
  const index = audits.findIndex((event) => event.id === auditId);
  if (index < 0) throw new Error(`Expected audit ${auditId} to be persisted.`);
  return index;
}
