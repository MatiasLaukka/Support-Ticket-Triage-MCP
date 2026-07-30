import { describe, expect, it } from "vitest";
import { AuditEventSchema } from "../src/domain.js";
import { buildConversationTimeline } from "../src/approval-desk/conversation-history.js";
import {
  DiagnosisImpactSetSchema,
  DiagnosisReviewDecisionSchema,
  DiagnosisReviewSnapshotSchema,
  isDiagnosisStale,
  latestDiagnosisReview,
} from "../src/approval-desk/diagnosis-review.js";

const diagnosis = {
  status: "completed" as const,
  causeType: "integration" as const,
  customerSafeSummary: "We identified an integration configuration issue.",
  evidenceUsed: ["request ID"],
  confidence: "confirmed" as const,
  owner: "engineering" as const,
  recommendedNextAction: "Apply the approved fix and verify the outcome.",
  doNotSay: [],
};

const sourceConversationWatermark = {
  state: "reply" as const,
  timestamp: "2026-06-10T09:55:00.000Z",
  id: "11111111-1111-4111-8111-111111111111",
};

function reviewDecision(overrides: Record<string, unknown> = {}) {
  return {
    decision: "approve",
    diagnosisId: "22222222-2222-4222-8222-222222222222",
    ticketId: "TKT-1001",
    sourceTicketRevision: 2,
    sourceConversationWatermark,
    editedDiagnosis: diagnosis,
    actor: "support-lead",
    reviewedAt: "2026-06-10T10:01:00.000Z",
    ...overrides,
  };
}

function reviewAudit(overrides: Record<string, unknown> = {}) {
  const review = reviewDecision(overrides);
  return AuditEventSchema.parse({
    id: "33333333-3333-4333-8333-333333333333",
    timestamp: review.reviewedAt,
    actor: review.actor,
    action: "diagnosis-reviewed",
    ticketId: review.ticketId,
    before: {},
    after: { diagnosisReview: review },
    rationale: "The review was recorded without replacing the original diagnosis.",
    knowledgeArticleIds: [],
    result: "success",
  });
}

describe("diagnosis review contracts", () => {
  it("rejects duplicate impact-set ticket IDs", () => {
    expect(() =>
      DiagnosisImpactSetSchema.parse({
        tickets: [
          { ticketId: "TKT-1001", reason: "Same confirmed symptom." },
          { ticketId: "TKT-1001", reason: "Same approved diagnosis." },
        ],
        actor: "support-lead",
        rationale: "The operator selected the related tickets.",
      }),
    ).toThrow(/unique/i);
  });

  it.each(["reject", "revalidate"] as const)(
    "requires rationale for %s decisions",
    (decision) => {
      expect(() =>
        DiagnosisReviewDecisionSchema.parse(
          reviewDecision({ decision, rationale: undefined }),
        ),
      ).toThrow(/rationale/i);
    },
  );

  it("marks a diagnosis stale after a newer customer reply", () => {
    expect(
      isDiagnosisStale({
        diagnosisTimestamp: "2026-06-10T10:00:00.000Z",
        diagnosisTicketRevision: 2,
        diagnosisReplyWatermark: "2026-06-10T09:55:00.000Z",
        currentTicketRevision: 2,
        latestReplyAt: "2026-06-10T10:05:00.000Z",
      }),
    ).toMatchObject({ stale: true, staleReasons: ["newer-customer-reply"] });
  });

  it("keeps a resolved historical diagnosis available for history", () => {
    const originalDiagnosis = AuditEventSchema.parse({
      id: "22222222-2222-4222-8222-222222222222",
      timestamp: "2026-06-10T10:00:00.000Z",
      actor: "support-agent",
      action: "diagnosis-completed",
      ticketId: "TKT-1001",
      before: {},
      after: { diagnosis },
      rationale: "Diagnosis completed from trusted support context.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const freshness = isDiagnosisStale({
      diagnosisTimestamp: originalDiagnosis.timestamp,
      diagnosisTicketRevision: 2,
      currentTicketRevision: 2,
      invalidatingFixAt: "2026-06-10T10:05:00.000Z",
    });

    const snapshot = DiagnosisReviewSnapshotSchema.parse({
      originalDiagnosis,
      latestReview: null,
      stale: freshness.stale,
      staleReasons: freshness.staleReasons,
      sourceTicketRevision: 2,
      sourceConversationWatermark: { state: "none" },
    });

    expect(snapshot.stale).toBe(true);
    expect(snapshot.staleReasons).toContain("invalidating-fix-signal");
    expect(snapshot.originalDiagnosis).toEqual(originalDiagnosis);
  });

  it("returns the most recent review decision for the requested diagnosis", () => {
    const earlier = reviewAudit({
      decision: "reject",
      rationale: "The evidence was incomplete at the first review.",
      reviewedAt: "2026-06-10T10:01:00.000Z",
    });
    const later = AuditEventSchema.parse({
      ...reviewAudit({
        decision: "revalidate",
        rationale: "The updated evidence confirms the same diagnosis.",
        reviewedAt: "2026-06-10T10:02:00.000Z",
      }),
      id: "44444444-4444-4444-8444-444444444444",
      timestamp: "2026-06-10T10:02:00.000Z",
      after: {
        diagnosisReview: reviewDecision({
          decision: "revalidate",
          rationale: "The updated evidence confirms the same diagnosis.",
          reviewedAt: "2026-06-10T10:02:00.000Z",
        }),
      },
    });

    expect(
      latestDiagnosisReview([later, earlier], "22222222-2222-4222-8222-222222222222"),
    ).toMatchObject({ decision: "revalidate" });
  });

  it("keeps diagnosis review audits visible in the ticket history", () => {
    const timeline = buildConversationTimeline({
      ticket: {
        id: "TKT-1001",
        subject: "Checkout events are missing.",
        description: "The event is not visible in the activity timeline.",
        customer: {
          name: "Northstar Apparel",
          plan: "enterprise",
          region: "eu-west",
          vip: false,
        },
        requester: {
          name: "Maya Chen",
          role: "Ecommerce Manager",
          department: "Marketing",
          technicalLevel: "technical",
          seniority: "manager",
        },
        status: "triage",
        category: "incident",
        priority: "P2",
        team: "incident-response",
        tags: [],
        relatedTicketIds: [],
        sla: {
          responseDueAt: "2026-06-10T12:00:00.000Z",
          breached: false,
        },
        revision: 2,
        createdAt: "2026-06-10T09:00:00.000Z",
        updatedAt: "2026-06-10T10:00:00.000Z",
      },
      audits: [reviewAudit({ rationale: "The diagnosis is ready for approval." })],
      recommendations: [],
    });

    expect(timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "recommendation-event",
          action: "diagnosis-reviewed",
          summary: "Diagnosis review was recorded without replacing the original diagnosis.",
        }),
      ]),
    );
  });
});
