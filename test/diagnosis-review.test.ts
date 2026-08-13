import { describe, expect, it } from "vitest";
import { AuditEventSchema } from "../src/domain.js";
import { buildConversationTimeline } from "../src/approval-desk/conversation-history.js";
import {
  compareIsoInstants,
  DiagnosisImpactSetSchema,
  DiagnosisReviewDecisionSchema,
  DiagnosisReviewSnapshotSchema,
  diagnosisReviewViews,
  isDiagnosisStale,
  latestDiagnosisReview,
} from "../src/approval-desk/diagnosis-review.js";
import { selectPersistedDiagnosticWorkflowContext } from "../src/approval-desk/diagnostic-workflow.js";
import {
  OperationalDiagnosisRecordSchema,
  type OperationalWorkflowSnapshot,
} from "../src/operational/domain.js";

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
  it("uses the operational child original while preserving causally valid review events", () => {
    const original = originalDiagnosisAudit();
    const record = operationalDiagnosisRecord(original);
    const milestone = AuditEventSchema.parse({
      ...original,
      after: { diagnosisOutcome: "confirmed", sourceRevision: 2 },
      rationale: "Operational diagnosis-completed event.",
      knowledgeArticleIds: [],
    });
    const approved = AuditEventSchema.parse({
      ...reviewAudit({ rationale: "The persisted evidence supports this diagnosis." }),
      before: { diagnosisId: original.id },
    });

    const [view] = diagnosisReviewViews({
      ticket: { id: "TKT-1001", revision: 2 },
      audits: [milestone, approved],
      originalDiagnoses: [record],
    });

    expect(view?.originalDiagnosis).toEqual(original);
    expect(view?.reviews).toEqual([
      expect.objectContaining({ decision: "approve", diagnosisId: original.id }),
    ]);
    expect(view?.latestReview).toMatchObject({ decision: "approve" });
  });

  it("fails closed when an operational diagnosis milestone has no canonical child", () => {
    const original = originalDiagnosisAudit();
    const milestone = AuditEventSchema.parse({
      ...original,
      after: { diagnosisOutcome: "confirmed", sourceRevision: 2 },
      rationale: "Operational diagnosis-completed event.",
      knowledgeArticleIds: [],
    });

    expect(() => diagnosisReviewViews({
      ticket: { id: "TKT-1001", revision: 2 },
      audits: [milestone],
      originalDiagnoses: [],
    })).toThrow(expect.objectContaining({
      code: "REPOSITORY_ERROR",
      message: "Operational diagnosis persistence is inconsistent.",
    }));
  });

  it("fails closed when an operational diagnosis child has no lifecycle milestone", () => {
    const original = originalDiagnosisAudit();

    expect(() => diagnosisReviewViews({
      ticket: { id: "TKT-1001", revision: 2 },
      audits: [],
      originalDiagnoses: [operationalDiagnosisRecord(original)],
    })).toThrow(expect.objectContaining({
      code: "REPOSITORY_ERROR",
      message: "Operational diagnosis persistence is inconsistent.",
    }));
  });

  it("retains audit-only diagnosis fixtures when operational children are absent", () => {
    const original = originalDiagnosisAudit();

    expect(diagnosisReviewViews({
      ticket: { id: "TKT-1001", revision: 2 },
      audits: [original],
    })).toEqual([
      expect.objectContaining({ originalDiagnosis: original }),
    ]);
  });

  it("keeps a rejected diagnosis as exclusion context without treating it as authoritative", () => {
    const original = AuditEventSchema.parse({
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
    const rejected = AuditEventSchema.parse({
      ...reviewAudit({
        decision: "reject",
        rationale: "The evidence does not support this diagnosis.",
        reviewedAt: "2026-06-10T10:02:00.000Z",
      }),
      before: { diagnosisId: original.id },
    });

    const context = selectPersistedDiagnosticWorkflowContext([original, rejected]);

    expect(context.diagnosis).toBeUndefined();
    expect(context.rejectedDiagnosis).toMatchObject({
      context: diagnosis,
      review: { decision: "reject" },
    });
  });

  it("compares sub-millisecond ISO instants exactly across offsets", () => {
    expect(
      compareIsoInstants(
        "2026-06-10T10:00:00.0009Z",
        "2026-06-10T12:00:00.0008+02:00",
      ),
    ).toBe(1);
  });

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

  it("marks a diagnosis stale when a reply watermark has the same timestamp but a different ID", () => {
    expect(
      isDiagnosisStale({
        diagnosisTimestamp: "2026-06-10T10:00:00.000Z",
        diagnosisTicketRevision: 2,
        diagnosisReplyWatermark: "2026-06-10T10:00:00.000Z",
        currentTicketRevision: 2,
        latestReplyAt: "2026-06-10T10:00:00.000Z",
        diagnosisConversationWatermark: {
          state: "reply",
          timestamp: "2026-06-10T10:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
        },
        latestConversationWatermark: {
          state: "reply",
          timestamp: "2026-06-10T10:00:00.000Z",
          id: "55555555-5555-4555-8555-555555555555",
        },
      }),
    ).toMatchObject({ stale: true, staleReasons: ["newer-customer-reply"] });
  });

  it("marks a diagnosis stale when a causally newer reply has an older reported timestamp", () => {
    expect(
      isDiagnosisStale({
        diagnosisTimestamp: "2026-06-10T10:00:00.000Z",
        diagnosisTicketRevision: 2,
        currentTicketRevision: 2,
        diagnosisConversationWatermark: {
          state: "reply",
          timestamp: "2026-06-10T09:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
        },
        latestConversationWatermark: {
          state: "reply",
          timestamp: "2026-06-10T08:59:00.000Z",
          id: "55555555-5555-4555-8555-555555555555",
        },
      }),
    ).toMatchObject({ stale: true, staleReasons: ["newer-customer-reply"] });
  });

  it("compares valid timestamps chronologically across offsets", () => {
    expect(
      isDiagnosisStale({
        diagnosisTimestamp: "2026-06-10T10:00:00.000+02:00",
        diagnosisTicketRevision: 2,
        currentTicketRevision: 2,
        latestReplyAt: "2026-06-10T08:30:00.000Z",
      }),
    ).toMatchObject({ stale: true, staleReasons: ["newer-customer-reply"] });
  });

  it("marks sub-millisecond newer customer replies as stale", () => {
    expect(
      isDiagnosisStale({
        diagnosisTimestamp: "2026-06-10T10:00:00.0001Z",
        diagnosisTicketRevision: 2,
        currentTicketRevision: 2,
        latestReplyAt: "2026-06-10T10:00:00.0009Z",
      }),
    ).toMatchObject({ stale: true, staleReasons: ["newer-customer-reply"] });
  });

  it("compares valid minute-precision ISO instants", () => {
    expect(
      isDiagnosisStale({
        diagnosisTimestamp: "2026-06-10T10:00Z",
        diagnosisTicketRevision: 2,
        currentTicketRevision: 2,
        latestReplyAt: "2026-06-10T10:01Z",
      }),
    ).toMatchObject({ stale: true, staleReasons: ["newer-customer-reply"] });
  });

  it("rejects invalid staleness timestamps and stale-reason values", () => {
    expect(() =>
      isDiagnosisStale({
        diagnosisTimestamp: "not-an-instant",
        diagnosisTicketRevision: 2,
        currentTicketRevision: 2,
      }),
    ).toThrow();

    expect(() =>
      DiagnosisReviewSnapshotSchema.parse({
        originalDiagnosis: AuditEventSchema.parse({
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
        }),
        latestReview: null,
        stale: true,
        staleReasons: ["not-a-stale-reason"],
        sourceTicketRevision: 2,
        sourceConversationWatermark: { state: "none" },
      }),
    ).toThrow();
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

  it("rejects an original diagnosis audit whose diagnosis payload is malformed", () => {
    const malformed = AuditEventSchema.parse({
      id: "22222222-2222-4222-8222-222222222222",
      timestamp: "2026-06-10T10:00:00.000Z",
      actor: "support-agent",
      action: "diagnosis-completed",
      ticketId: "TKT-1001",
      before: {},
      after: { diagnosis: { status: "completed" } },
      rationale: "Diagnosis completed from trusted support context.",
      knowledgeArticleIds: [],
      result: "success",
    });

    expect(() =>
      DiagnosisReviewSnapshotSchema.parse({
        originalDiagnosis: malformed,
        latestReview: null,
        stale: false,
        staleReasons: [],
        sourceTicketRevision: 2,
        sourceConversationWatermark: { state: "none" },
      }),
    ).toThrow(/diagnosis/i);
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
      latestDiagnosisReview([earlier, later], "22222222-2222-4222-8222-222222222222"),
    ).toMatchObject({ decision: "revalidate" });
  });

  it("selects the latest review chronologically when valid offsets sort differently as text", () => {
    const earlier = AuditEventSchema.parse({
      ...reviewAudit({
        decision: "reject",
        rationale: "The first review found incomplete evidence.",
        reviewedAt: "2026-06-10T12:30:00.000+02:00",
      }),
      timestamp: "2026-06-10T12:30:00.000+02:00",
    });
    const later = AuditEventSchema.parse({
      ...reviewAudit({
        decision: "revalidate",
        rationale: "The later review confirms the same diagnosis.",
        reviewedAt: "2026-06-10T11:00:00.000Z",
      }),
      id: "44444444-4444-4444-8444-444444444444",
      timestamp: "2026-06-10T11:00:00.000Z",
      after: {
        diagnosisReview: reviewDecision({
          decision: "revalidate",
          rationale: "The later review confirms the same diagnosis.",
          reviewedAt: "2026-06-10T11:00:00.000Z",
        }),
      },
    });

    expect(
      latestDiagnosisReview([earlier, later], "22222222-2222-4222-8222-222222222222"),
    ).toMatchObject({ decision: "revalidate" });
  });

  it("selects the later review when only sub-millisecond precision differs", () => {
    const later = AuditEventSchema.parse({
      ...reviewAudit({
        decision: "revalidate",
        rationale: "The later review confirms the diagnosis.",
        reviewedAt: "2026-06-10T10:00:00.0009Z",
      }),
      id: "44444444-4444-4444-8444-444444444444",
      timestamp: "2026-06-10T10:00:00.0009Z",
      after: {
        diagnosisReview: reviewDecision({
          decision: "revalidate",
          rationale: "The later review confirms the diagnosis.",
          reviewedAt: "2026-06-10T10:00:00.0009Z",
        }),
      },
    });
    const earlier = AuditEventSchema.parse({
      ...reviewAudit({
        decision: "reject",
        rationale: "The earlier review found incomplete evidence.",
        reviewedAt: "2026-06-10T10:00:00.0001Z",
      }),
      timestamp: "2026-06-10T10:00:00.0001Z",
    });

    expect(
      latestDiagnosisReview([earlier, later], "22222222-2222-4222-8222-222222222222"),
    ).toMatchObject({ decision: "revalidate" });
  });

  it("accepts an audit timestamp that represents the same reviewed instant in another offset", () => {
    const semanticallyEqual = AuditEventSchema.parse({
      ...reviewAudit({ reviewedAt: "2026-06-10T10:00:00.000Z" }),
      timestamp: "2026-06-10T12:00:00.000+02:00",
      after: { diagnosisReview: reviewDecision({ reviewedAt: "2026-06-10T10:00:00.000Z" }) },
    });

    expect(
      latestDiagnosisReview([semanticallyEqual], "22222222-2222-4222-8222-222222222222"),
    ).toMatchObject({ decision: "approve" });
  });

  it("does not associate audit and review timestamps that differ below a millisecond", () => {
    const subtlyDifferent = AuditEventSchema.parse({
      ...reviewAudit({ reviewedAt: "2026-06-10T10:00:00.0009Z" }),
      timestamp: "2026-06-10T10:00:00.0001Z",
      after: { diagnosisReview: reviewDecision({ reviewedAt: "2026-06-10T10:00:00.0009Z" }) },
    });

    expect(
      latestDiagnosisReview([subtlyDifferent], "22222222-2222-4222-8222-222222222222"),
    ).toBeUndefined();
  });

  it("ignores review audits whose outer ticket, actor, or timestamp does not match the review", () => {
    const mismatched = AuditEventSchema.parse({
      ...reviewAudit({ rationale: "The diagnosis is ready for approval." }),
      actor: "different-actor",
    });

    expect(
      latestDiagnosisReview([mismatched], "22222222-2222-4222-8222-222222222222"),
    ).toBeUndefined();
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

function originalDiagnosisAudit() {
  return AuditEventSchema.parse({
    id: "22222222-2222-4222-8222-222222222222",
    timestamp: "2026-06-10T10:00:00.000Z",
    actor: "support-agent",
    action: "diagnosis-completed",
    ticketId: "TKT-1001",
    before: {},
    after: {
      diagnosis,
      sourceTicketRevision: 2,
      sourceConversationWatermark,
    },
    rationale: "Diagnosis completed from trusted support context.",
    knowledgeArticleIds: ["integration-troubleshooting"],
    result: "success",
  });
}

function operationalDiagnosisRecord(
  originalAudit: ReturnType<typeof originalDiagnosisAudit>,
): OperationalWorkflowSnapshot["diagnoses"][number] {
  return OperationalDiagnosisRecordSchema.parse({
    diagnosis: {
      id: `diagnosis-${originalAudit.id}`,
      ticketId: originalAudit.ticketId,
      problem: diagnosis.customerSafeSummary,
      symptoms: ["Checkout events are missing."],
      evidenceUsed: diagnosis.evidenceUsed,
      ownerTeam: "api-platform",
      fixSteps: [diagnosis.recommendedNextAction],
      verificationSteps: ["Confirm checkout events appear after the fix."],
      completedAt: originalAudit.timestamp,
    },
    originalAudit,
    operationalEventId: originalAudit.id,
  });
}
