import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type AuditEvent,
  type Ticket,
  type TriageRecommendation,
} from "../src/domain.js";
import {
  buildOperatorGuidance,
  closeBlockers,
  diagnosisBlockers,
  fixBlockers,
  latestAuthoritativeDiagnosis,
  latestDiagnosisAudit,
} from "../src/approval-desk/workflow-guidance.js";
import { buildTicketLifecycleView } from "../src/approval-desk/lifecycle.js";
import type { KnowledgeCandidate } from "../src/knowledge-evolution/domain.js";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";

const ticketId = "TKT-1001" as const;
const recommendationId = "10000000-0000-4000-8000-000000000001";

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return TicketSchema.parse({
    id: ticketId,
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-10T08:30:00.000Z",
    customer: {
      name: "Northstar Labs",
      plan: "enterprise",
      region: "eu-west",
      vip: false,
    },
    subject: "API requests are delayed",
    description: "Requests complete later than expected.",
    status: "triage",
    category: "api",
    priority: "P3",
    team: "api-platform",
    assignee: "owner@example.test",
    tags: ["api"],
    sla: {
      responseDueAt: "2026-06-10T12:00:00.000Z",
      breached: false,
    },
    relatedTicketIds: [],
    revision: 2,
    ...overrides,
  });
}

function recommendation(
  overrides: Partial<TriageRecommendation> = {},
): TriageRecommendation {
  return TriageRecommendationSchema.parse({
    id: recommendationId,
    ticketId,
    sourceRevision: 2,
    category: "api",
    priority: "P3",
    team: "api-platform",
    assignee: "owner@example.test",
    ticketStatus: "triage",
    tags: ["api"],
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "possible",
    missingInformation: [],
    supportState: "diagnosing",
    requiredEvidence: [],
    providedEvidence: [],
    missingEvidence: [],
    knowledgeArticleIds: ["api-reference"],
    draftCustomerResponse: "We are checking the delayed requests.",
    rationale: "The ticket needs a governed support evaluation.",
    confidence: 0.9,
    recommendedNextAction: "Review the request timeline.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "approved",
    createdAt: "2026-06-10T09:00:00.000Z",
    ...overrides,
  });
}

let nextAuditId = 1;

function audit(
  action: AuditEvent["action"],
  timestamp: string,
  overrides: Partial<AuditEvent> = {},
): AuditEvent {
  return AuditEventSchema.parse({
    id: `20000000-0000-4000-8000-${String(nextAuditId++).padStart(12, "0")}`,
    timestamp,
    actor: "casey",
    action,
    ticketId,
    before: {},
    after: {},
    rationale: "Recorded workflow test context.",
    knowledgeArticleIds: [],
    result: "success",
    ...overrides,
  });
}

type WorkflowInput = Parameters<typeof buildOperatorGuidance>[0];

function emptyWorkflow(): WorkflowInput {
  return { ticket: ticket(), recommendations: [], audits: [] };
}

function actionablePatternCandidate(): KnowledgeCandidate {
  return {
    id: "candidate-1",
    kind: "known-cause",
    name: "Recurring event delay",
    summary: "The same event processing delay recurs.",
    triggerPatterns: ["event delay"],
    evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
    timeConstraints: ["Use when the cited event evidence is present."],
    diagnosticSteps: ["Compare the event evidence with the prior diagnosis."],
    fixSteps: ["Apply the governed mitigation."],
    verificationSteps: ["Ask the customer to retry the affected event."],
    customerSafeExplanation: "We identified a recurring issue and are reviewing the next safe step.",
    operatorRationale: "The candidate is supported by a completed diagnosis.",
    owner: "api-platform",
    version: 1,
    supportingDiagnosisIds: ["diagnosis-20000000-0000-4000-8000-000000000001"],
    supportingTicketIds: [ticketId],
    provenance: { source: "test", recordedAt: "2026-08-04T10:00:00.000Z" },
    status: "candidate",
    deterministicScores: { confidence: 0.9, support: 2 },
    deterministicReasons: ["The completed diagnosis repeats."],
    discovery: {
      score: 0.9,
      reasons: ["The completed diagnosis repeats."],
      support: [],
      supportCount: 2,
      contradictions: [],
      meetsAlertThreshold: true,
    },
    contradictions: [],
    validationStatus: "valid",
    evidencePolicyMetadata: { derivedEvidenceIds: ["request-id"], operatorAddedEvidenceIds: [] },
  };
}

function patternAudit(): KnowledgeAuditEvent {
  return {
    id: "candidate-audit-1",
    candidateId: "candidate-1",
    action: "candidate-created",
    actor: "casey",
    timestamp: "2026-06-10T09:04:00.000Z",
    supportIds: ["TKT-1001"],
    reviewedFields: [],
    result: "candidate-created",
  };
}

function pendingRecommendationWorkflow(): WorkflowInput {
  return {
    ticket: ticket(),
    recommendations: [
      recommendation({
        category: "incident",
        priority: "P1",
        team: "incident-response",
        resolution: "pending",
      }),
    ],
    audits: [],
  };
}

function repliedWorkflow(): WorkflowInput {
  return {
    ticket: ticket(),
    recommendations: [recommendation()],
    audits: [audit("customer-reply-received", "2026-06-10T09:01:00.000Z")],
  };
}

function diagnosisReadyWorkflow(): WorkflowInput {
  return {
    ticket: ticket(),
    recommendations: [recommendation()],
    audits: [
      audit("customer-response-sent", "2026-06-10T09:01:00.000Z", {
        recommendationId,
        after: { sentAt: "2026-06-10T09:01:00.000Z" },
      }),
    ],
  };
}

function confirmedEngineeringDiagnosisWorkflow(): WorkflowInput {
  const input = diagnosisReadyWorkflow();
  const diagnosis = diagnosisAudit({
    timestamp: "2026-06-10T09:02:00.000Z",
    confidence: "confirmed",
    owner: "engineering",
  });
  return {
    ...input,
    audits: [
      ...input.audits,
      diagnosis,
      diagnosisReviewAudit(diagnosis, "2026-06-10T09:02:30.000Z"),
      sentAudit("2026-06-10T09:03:00.000Z"),
    ],
  };
}

function diagnosisRecordedWorkflow(): WorkflowInput {
  const input = diagnosisReadyWorkflow();
  return {
    ...input,
    audits: [
      audit("recommendation-submitted", "2026-06-10T09:00:00.000Z", {
        recommendationId,
      }),
      ...input.audits,
      diagnosisAudit({
        timestamp: "2026-06-10T09:02:00.000Z",
        confidence: "likely",
        owner: "support",
      }),
    ],
  };
}

function verificationWorkflow(): WorkflowInput {
  const input = confirmedEngineeringDiagnosisWorkflow();
  return {
    ...input,
    audits: [
      audit("recommendation-submitted", "2026-06-10T09:00:00.000Z", {
        recommendationId,
      }),
      ...input.audits,
      audit("fix-available", "2026-06-10T09:03:00.000Z", {
        after: { fix: { status: "available" } },
      }),
    ],
  };
}

function fixResponsePendingWorkflow(): WorkflowInput {
  const input = confirmedEngineeringDiagnosisWorkflow();
  return {
    ...input,
    recommendations: [
      recommendation({
        id: "10000000-0000-4000-8000-000000000002",
        resolution: "pending",
        supportState: "ready-for-close",
        createdAt: "2026-06-10T09:04:00.000Z",
      }),
    ],
    audits: [
      ...input.audits,
      audit("fix-available", "2026-06-10T09:03:00.000Z", {
        after: { fix: { status: "available" } },
      }),
    ],
  };
}

function waitingCustomerWorkflow(): WorkflowInput {
  return {
    ticket: ticket(),
    recommendations: [
      recommendation({
        supportState: "needs-information",
        missingEvidence: [evidenceRequirement()],
      }),
    ],
    audits: [
      audit("customer-response-sent", "2026-06-10T09:01:00.000Z", {
        recommendationId,
        after: { sentAt: "2026-06-10T09:01:00.000Z" },
      }),
    ],
  };
}

function closingResponseSentWorkflow(): WorkflowInput {
  return {
    ticket: ticket(),
    recommendations: [recommendation({ supportState: "ready-for-close" })],
    audits: [
      audit("customer-response-sent", "2026-06-10T09:01:00.000Z", {
        recommendationId,
        after: { sentAt: "2026-06-10T09:01:00.000Z" },
      }),
    ],
  };
}

function resolvedWorkflow(): WorkflowInput {
  return {
    ...closingResponseSentWorkflow(),
    ticket: ticket({ status: "resolved" }),
  };
}

function evidenceRequirement() {
  return {
    id: "request-id",
    label: "Request ID",
    customerQuestion: "What is the request ID?",
    aliases: ["request id"],
    source: "knowledge" as const,
  };
}

function sentAudit(
  sentAt: string,
  id = recommendationId,
): AuditEvent {
  return audit("customer-response-sent", sentAt, {
    recommendationId: id,
    after: { sentAt },
  });
}

function diagnosisAudit(input: {
  timestamp: string;
  confidence: "confirmed" | "likely";
  owner: "engineering" | "integration-partner" | "support";
  diagnosticState?: unknown;
}): AuditEvent {
  return audit("diagnosis-completed", input.timestamp, {
    after: {
      diagnosis: {
        status: "completed",
        causeType: "platform-delay",
        customerSafeSummary: "A platform processing delay caused the reported issue.",
        evidenceUsed: ["request trace"],
        confidence: input.confidence,
        owner: input.owner,
        recommendedNextAction: "Apply the governed mitigation.",
        doNotSay: [],
        ...(input.diagnosticState === undefined
          ? {}
          : { diagnosticState: input.diagnosticState }),
      },
    },
  });
}

function diagnosisReviewAudit(
  diagnosis: AuditEvent,
  reviewedAt: string,
  decision: "approve" | "reject" | "revalidate" = "approve",
  sourceConversationWatermark:
    | { state: "none" }
    | { state: "reply"; timestamp: string; id: string } = { state: "none" },
  sourceTicketRevision = 2,
): AuditEvent {
  return audit("diagnosis-reviewed", reviewedAt, {
    actor: "casey",
    before: { diagnosisId: diagnosis.id },
    after: {
      diagnosisReview: {
        decision,
        diagnosisId: diagnosis.id,
        ticketId,
        sourceTicketRevision,
        sourceConversationWatermark,
        editedDiagnosis: diagnosis.after.diagnosis,
        actor: "casey",
        ...(decision === "approve"
          ? {}
          : { rationale: "The reviewed context supports this decision." }),
        reviewedAt,
      },
    },
  });
}

function escalatedDiagnosisAudit(
  timestamp = "2026-06-10T09:02:00.000Z",
): AuditEvent {
  return audit("diagnostic-escalated", timestamp, {
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
          evidenceToRequest: ["No further automated questions."],
        },
      },
    },
  });
}

describe("buildOperatorGuidance", () => {
  it.each([
    {
      name: "active",
      input: emptyWorkflow(),
      stage: "active",
      nextAction: "evaluate-ticket",
      unlocksTool: "evaluate_ticket",
      approval: { required: false, fields: [] },
    },
    {
      name: "review",
      input: pendingRecommendationWorkflow(),
      stage: "review",
      nextAction: "review-recommendation",
      unlocksTool: "mark_response_done",
      approval: {
        required: true,
        fields: ["category", "priority", "team", "customerResponse"],
      },
    },
    {
      name: "customer-replied",
      input: repliedWorkflow(),
      stage: "customer-replied",
      nextAction: "evaluate-ticket",
      unlocksTool: "evaluate_ticket",
      approval: { required: false, fields: [] },
    },
    {
      name: "fix-ready",
      input: confirmedEngineeringDiagnosisWorkflow(),
      stage: "fix-ready",
      nextAction: "mark-fix-available",
      unlocksTool: "mark_fix_available",
      approval: { required: false, fields: [] },
    },
    {
      name: "verification",
      input: verificationWorkflow(),
      stage: "verification",
      nextAction: "evaluate-ticket",
      unlocksTool: "evaluate_ticket",
      approval: { required: false, fields: [] },
    },
    {
      name: "diagnosis-recorded",
      input: diagnosisRecordedWorkflow(),
      stage: "diagnosis-recorded",
      nextAction: "review-diagnosis",
      unlocksTool: "review_diagnosis",
      approval: { required: true, fields: [] },
    },
    {
      name: "diagnosis-ready",
      input: diagnosisReadyWorkflow(),
      stage: "diagnosis-ready",
      nextAction: "record-diagnosis",
      unlocksTool: "record_diagnosis",
      approval: { required: false, fields: [] },
    },
    {
      name: "waiting-customer",
      input: waitingCustomerWorkflow(),
      stage: "waiting-customer",
      nextAction: "wait-for-customer",
      unlocksTool: undefined,
      approval: { required: false, fields: [] },
    },
    {
      name: "ready-for-close",
      input: closingResponseSentWorkflow(),
      stage: "ready-for-close",
      nextAction: "close-ticket",
      unlocksTool: "close_ticket",
      approval: { required: false, fields: [] },
    },
    {
      name: "closed",
      input: resolvedWorkflow(),
      stage: "closed",
      nextAction: "none",
      unlocksTool: undefined,
      approval: { required: false, fields: [] },
    },
  ] as const)("returns exact $name precedence guidance", (expected) => {
    const guidance = buildOperatorGuidance(expected.input);
    expect(guidance.stage).toBe(expected.stage);
    expect(guidance.nextAction).toBe(expected.nextAction);
    expect(guidance.approval).toEqual(expected.approval);
    if (expected.unlocksTool === undefined) {
      expect(guidance).not.toHaveProperty("unlocksTool");
    } else {
      expect(guidance.unlocksTool).toBe(expected.unlocksTool);
    }
    expect(guidance.reason).not.toBe("");
    expect(guidance.blockers).toEqual(expect.any(Array));
  });

  it("keeps pending review ahead of fix-ready verification context", () => {
    const input = fixResponsePendingWorkflow();
    const guidance = buildOperatorGuidance(input);
    expect(guidance.stage).toBe("review");
    expect(guidance.nextAction).toBe("review-recommendation");
    expect(guidance.unlocksTool).toBe("mark_response_done");
    expect(guidance.approval.required).toBe(true);
  });

  it("requires reevaluation when a customer reply is newer than a pending recommendation", () => {
    const pending = pendingRecommendationWorkflow();
    const input = {
      ...pending,
      audits: [
        ...pending.audits,
        audit("customer-reply-received", "2026-06-10T09:01:00.000Z"),
      ],
    };

    const guidance = buildOperatorGuidance(input);

    expect(guidance).toMatchObject({
      stage: "customer-replied",
      nextAction: "evaluate-ticket",
      approval: { required: false, fields: [] },
      unlocksTool: "evaluate_ticket",
    });
  });

  it("requires governed review after a diagnosis is recorded", () => {
    const guidance = buildOperatorGuidance(diagnosisRecordedWorkflow());
    expect(guidance.stage).toBe("diagnosis-recorded");
    expect(guidance.changed).not.toBe("");
    expect(guidance.reason).not.toBe("");
    expect(guidance.nextAction).toBe("review-diagnosis");
    expect(guidance.approval).toEqual({ required: true, fields: [] });
    expect(guidance.unlocksTool).toBe("review_diagnosis");
    expect(guidance.blockers).toEqual([]);
  });

  it("keeps an actionable pattern advisory while the source ticket remains fix-ready", () => {
    const input = confirmedEngineeringDiagnosisWorkflow();
    const diagnosis = latestDiagnosisAudit(input.audits)!;
    const pattern = actionablePatternCandidate();
    const workflow = {
      ...input,
      knowledgeEvolution: {
        candidates: [{
          ...pattern,
          supportingDiagnosisIds: [`diagnosis-${diagnosis.id}`],
        }],
        audits: [patternAudit()],
      },
    };
    const guidance = buildOperatorGuidance(workflow);
    const lifecycle = buildTicketLifecycleView(workflow);

    expect(guidance).toMatchObject({
      stage: "fix-ready",
      nextAction: "mark-fix-available",
      knowledgePattern: {
        state: "pending",
        actionable: true,
        candidateId: "candidate-1",
      },
    });
    expect(guidance.requiredReview).toBeUndefined();
    expect(lifecycle.phase).toBe("awaiting-fix");
    expect(lifecycle.primaryAction.kind).toBe("record-fix-available");
    expect(lifecycle.knowledge).toMatchObject({
      state: "pending",
      actionable: true,
      secondaryAction: "review-pattern",
    });
    expect(lifecycle.actions.map(({ kind }) => kind)).toEqual([
      "record-fix-available",
      "apply-scoped-fix",
      "review-pattern",
    ]);
  });

  it("preserves reviewed non-actionable pattern metadata without adding an action", () => {
    const input = confirmedEngineeringDiagnosisWorkflow();
    const diagnosis = latestDiagnosisAudit(input.audits)!;
    const pattern = actionablePatternCandidate();
    const workflow = {
      ...input,
      knowledgeEvolution: {
        candidates: [{
          ...pattern,
          supportingDiagnosisIds: [`diagnosis-${diagnosis.id}`],
        }],
        audits: [{
          ...patternAudit(),
          action: "approved",
          result: "approved",
        }],
      },
    };

    const guidance = buildOperatorGuidance(workflow);
    const lifecycle = buildTicketLifecycleView(workflow);

    expect(guidance).toMatchObject({
      stage: "fix-ready",
      nextAction: "mark-fix-available",
      knowledgePattern: {
        state: "approved",
        actionable: false,
        candidateId: "candidate-1",
      },
    });
    expect(lifecycle.primaryAction.kind).toBe("record-fix-available");
    expect(lifecycle.knowledge).toMatchObject({
      state: "approved",
      actionable: false,
    });
    expect(lifecycle.actions.map(({ kind }) => kind)).toEqual([
      "record-fix-available",
      "apply-scoped-fix",
    ]);
  });

  it("requires a fresh evaluation after platform mitigation is recorded", () => {
    const input = diagnosisReadyWorkflow();
    input.recommendations = [recommendation({
      supportState: "waiting-on-platform-fix",
      knownEventId: "EVT-2026-06-10-WEBHOOK-LATENCY",
    })];
    input.audits = [
      ...input.audits,
      audit("platform-mitigation-available", "2026-06-10T09:02:00.000Z", {
        after: {
          eventId: "EVT-2026-06-10-WEBHOOK-LATENCY",
          status: "available",
        },
      }),
    ];

    expect(buildOperatorGuidance(input)).toMatchObject({
      nextAction: "evaluate-ticket",
      unlocksTool: "evaluate_ticket",
      reason: "Platform mitigation was recorded; evaluate the current context before requesting verification.",
    });
  });

  it("continues evidence evaluation instead of offering ambiguous diagnoses for review", () => {
    const input = diagnosisRecordedWorkflow();
    input.audits = [
      ...input.audits.slice(0, -1),
      diagnosisAudit({
        timestamp: "2026-06-10T09:02:00.000Z",
        confidence: "likely",
        owner: "support",
        diagnosticState: {
          state: "ambiguous",
          diagnosticAttempts: 1,
          hypotheses: [
            {
              id: "browser-session",
              label: "Browser session issue",
              status: "plausible",
              evidenceUsed: ["Blank campaign editor"],
              evidenceToConfirm: ["Private window result"],
            },
          ],
          evidenceToRequest: ["Private window result"],
        },
      }),
    ];

    expect(buildOperatorGuidance(input)).toMatchObject({
      stage: "diagnosis-recorded",
      nextAction: "evaluate-ticket",
      approval: { required: false, fields: [] },
      unlocksTool: "evaluate_ticket",
      customerNextStep:
        "Reply with the targeted diagnostic details: Private window result",
    });
  });

  it("requires revalidation when a reviewed diagnosis is stale after a ticket revision change", () => {
    const diagnosis = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const input: WorkflowInput = {
      ticket: ticket({ revision: 3 }),
      recommendations: [
        recommendation({ createdAt: "2026-06-10T09:04:00.000Z" }),
      ],
      audits: [
        sentAudit("2026-06-10T09:01:00.000Z"),
        diagnosis,
        diagnosisReviewAudit(
          diagnosis,
          "2026-06-10T09:03:00.000Z",
          "approve",
          { state: "none" },
          2,
        ),
        sentAudit("2026-06-10T09:05:00.000Z"),
      ],
    };

    expect(buildOperatorGuidance(input)).toMatchObject({
      stage: "diagnosis-recorded",
      nextAction: "review-diagnosis",
      approval: { required: true, fields: [] },
      unlocksTool: "review_diagnosis",
    });
  });

  it("requires revalidation when a customer reply made a review stale without changing ticket fields", () => {
    const diagnosis = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const customerReply = audit(
      "customer-reply-received",
      "2026-06-10T09:04:00.000Z",
      { actor: "Maya Chen", after: { body: "The mitigation worked." } },
    );
    const readyToClose = recommendation({
      supportState: "ready-for-close",
      createdAt: "2026-06-10T09:05:00.000Z",
    });
    const input: WorkflowInput = {
      ticket: ticket({ revision: 2 }),
      recommendations: [readyToClose],
      audits: [
        diagnosis,
        diagnosisReviewAudit(diagnosis, "2026-06-10T09:03:00.000Z"),
        customerReply,
        audit("recommendation-submitted", "2026-06-10T09:05:00.000Z", {
          recommendationId: readyToClose.id,
        }),
        sentAudit("2026-06-10T09:06:00.000Z", readyToClose.id),
      ],
    };

    expect(buildOperatorGuidance(input)).toMatchObject({
      stage: "diagnosis-recorded",
      nextAction: "review-diagnosis",
      approval: { required: true, fields: [] },
      unlocksTool: "review_diagnosis",
    });
  });

  it("allows a revalidated diagnosis to unlock a fix after its diagnosis response was already sent", () => {
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const initialReview = diagnosisReviewAudit(
      original,
      "2026-06-10T09:03:00.000Z",
    );
    const revalidation = diagnosisReviewAudit(
      original,
      "2026-06-10T09:06:00.000Z",
      "revalidate",
      { state: "none" },
      3,
    );

    expect(
      fixBlockers({
        ticket: ticket({ revision: 3 }),
        audits: [
          original,
          initialReview,
          sentAudit("2026-06-10T09:05:00.000Z"),
          revalidation,
        ],
      }),
    ).toEqual([]);
  });

  it("returns safe backend-owned verification transition copy", () => {
    const guidance = buildOperatorGuidance(verificationWorkflow());
    expect(guidance.stage).toBe("verification");
    expect(guidance.changed).not.toBe("");
    expect(guidance.reason).not.toBe("");
    expect(guidance.customerNextStep).not.toBe("");
    expect(guidance.nextAction).toBe("evaluate-ticket");
    expect(guidance.approval).toEqual({ required: false, fields: [] });
    expect(guidance.unlocksTool).toBe("evaluate_ticket");
    expect(guidance.blockers).toEqual([]);
  });

  it("orders equal-time diagnosis transitions by audit index", () => {
    const input = diagnosisRecordedWorkflow();
    const submitted = audit(
      "recommendation-submitted",
      "2026-06-10T09:02:00.000Z",
      { recommendationId },
    );
    const diagnosis = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "likely",
      owner: "support",
    });
    input.recommendations = [
      recommendation({ createdAt: "2026-06-10T09:02:00.000Z" }),
    ];
    input.audits = [sentAudit("2026-06-10T09:01:00.000Z"), submitted, diagnosis];
    expect(buildOperatorGuidance(input).stage).toBe("diagnosis-recorded");

    input.audits = [sentAudit("2026-06-10T09:01:00.000Z"), diagnosis, submitted];
    expect(buildOperatorGuidance(input).stage).toBe("waiting-customer");
  });

  it("orders workflow transitions chronologically when valid offsets differ", () => {
    const input = diagnosisRecordedWorkflow();
    const submitted = audit(
      "recommendation-submitted",
      "2026-06-10T08:00:00.500Z",
      { recommendationId },
    );
    const diagnosis = diagnosisAudit({
      timestamp: "2026-06-10T09:00:00.000+02:00",
      confidence: "likely",
      owner: "support",
    });
    input.recommendations = [
      recommendation({ createdAt: "2026-06-10T08:00:00.500Z" }),
    ];
    input.audits = [sentAudit("2026-06-10T06:00:00.000Z"), diagnosis, submitted];

    expect(buildOperatorGuidance(input).stage).toBe("waiting-customer");
  });

  it("orders equal-time fix transitions by audit index", () => {
    const input = verificationWorkflow();
    const submitted = audit(
      "recommendation-submitted",
      "2026-06-10T09:03:00.000Z",
      { recommendationId },
    );
    const fix = audit("fix-available", "2026-06-10T09:03:00.000Z", {
      after: { fix: { status: "available" } },
    });
    input.recommendations = [
      recommendation({ createdAt: "2026-06-10T09:03:00.000Z" }),
    ];
    input.audits = [
      sentAudit("2026-06-10T09:01:00.000Z"),
      diagnosisAudit({
        timestamp: "2026-06-10T09:02:00.000Z",
        confidence: "confirmed",
        owner: "engineering",
      }),
      submitted,
      fix,
    ];
    expect(buildOperatorGuidance(input).stage).toBe("verification");

    input.audits = [
      sentAudit("2026-06-10T09:01:00.000Z"),
      diagnosisAudit({
        timestamp: "2026-06-10T09:02:00.000Z",
        confidence: "confirmed",
        owner: "engineering",
      }),
      fix,
      submitted,
    ];
    expect(buildOperatorGuidance(input).stage).toBe("waiting-customer");
  });

  it.each([
    ["diagnosis-recorded", diagnosisRecordedWorkflow()],
    ["verification", verificationWorkflow()],
  ] as const)("stops the %s transition after a newer recommendation", (_stage, input) => {
    const newer = recommendation({
      id: "10000000-0000-4000-8000-000000000099",
      createdAt: "2026-06-10T09:04:00.000Z",
    });
    input.recommendations = [newer];
    input.audits = [
      ...input.audits,
      audit("recommendation-submitted", newer.createdAt, {
        recommendationId: newer.id,
      }),
    ];

    expect(buildOperatorGuidance(input).stage).toBe("active");
  });

  it("names exact fields awaiting approval", () => {
    const guidance = buildOperatorGuidance(pendingRecommendationWorkflow());
    expect(guidance.approval).toEqual({
      required: true,
      fields: ["category", "priority", "team", "customerResponse"],
    });
    expect(guidance.unlocksTool).toBe("mark_response_done");
  });

  it("excludes omitted and unchanged optional fields from approval", () => {
    const input = pendingRecommendationWorkflow();
    input.recommendations = [
      recommendation({
        resolution: "pending",
        assignee: undefined,
        ticketStatus: undefined,
        tags: undefined,
      }),
    ];

    expect(buildOperatorGuidance(input).approval.fields).toEqual([
      "customerResponse",
    ]);
  });

  it("normalizes absent ticket and null recommendation assignees", () => {
    const input = pendingRecommendationWorkflow();
    input.ticket = ticket({ assignee: undefined });
    input.recommendations = [
      recommendation({
        resolution: "pending",
        assignee: null,
      }),
    ];

    expect(buildOperatorGuidance(input).approval.fields).toEqual([
      "customerResponse",
    ]);
  });

  it("includes changed assignee and status but excludes unchanged tags", () => {
    const input = pendingRecommendationWorkflow();
    input.recommendations = [
      recommendation({
        resolution: "pending",
        assignee: "new-owner@example.test",
        ticketStatus: "in-progress",
        tags: ["api"],
      }),
    ];

    expect(buildOperatorGuidance(input).approval.fields).toEqual([
      "assignee",
      "status",
      "customerResponse",
    ]);
  });

  it.each([
    {
      name: "unchanged tags",
      tags: ["api", "delay"],
      includesTags: false,
    },
    {
      name: "changed tag order",
      tags: ["delay", "api"],
      includesTags: true,
    },
  ] as const)("applies ordered-array semantics to $name", ({ tags, includesTags }) => {
    const input = pendingRecommendationWorkflow();
    input.ticket = ticket({ tags: ["api", "delay"] });
    input.recommendations = [
      recommendation({ resolution: "pending", tags: [...tags] }),
    ];

    const fields = buildOperatorGuidance(input).approval.fields;
    expect(fields.includes("tags")).toBe(includesTags);
    expect(fields.at(-1)).toBe("customerResponse");
  });

  it("always returns customerResponse last when every proposed field changes", () => {
    const guidance = buildOperatorGuidance({
      ticket: ticket(),
      recommendations: [
        recommendation({
          resolution: "pending",
          category: "incident",
          priority: "P1",
          team: "incident-response",
          assignee: "new-owner@example.test",
          ticketStatus: "in-progress",
          tags: ["incident"],
        }),
      ],
      audits: [],
    });

    expect(guidance.approval.fields).toEqual([
      "category",
      "priority",
      "team",
      "assignee",
      "status",
      "tags",
      "customerResponse",
    ]);
  });

  it("orders equal-time recommendations by submitted audit index", () => {
    const earlier = recommendation({
      id: "10000000-0000-4000-8000-000000000010",
      resolution: "approved",
    });
    const later = recommendation({
      id: "10000000-0000-4000-8000-000000000009",
      resolution: "pending",
    });
    const input = {
      ticket: ticket(),
      recommendations: [later, earlier],
      audits: [
        audit("recommendation-submitted", earlier.createdAt, {
          recommendationId: earlier.id,
        }),
        audit("recommendation-submitted", later.createdAt, {
          recommendationId: later.id,
        }),
      ],
    };

    expect(buildOperatorGuidance(input).stage).toBe("review");
  });

  it("resolves the remaining recommendation tie by descending ID", () => {
    const lower = recommendation({
      id: "10000000-0000-4000-8000-000000000009",
      resolution: "approved",
    });
    const higher = recommendation({
      id: "10000000-0000-4000-8000-000000000010",
      resolution: "pending",
    });

    expect(
      buildOperatorGuidance({
        ticket: ticket(),
        recommendations: [lower, higher],
        audits: [],
      }).stage,
    ).toBe("review");
  });

  it("resolves equal diagnosis timestamps by later audit index", () => {
    const input = diagnosisReadyWorkflow();
    const likely = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "likely",
      owner: "support",
    });
    const confirmed = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    input.audits = [
      ...input.audits,
      likely,
      confirmed,
      diagnosisReviewAudit(confirmed, "2026-06-10T09:02:30.000Z"),
      sentAudit("2026-06-10T09:03:00.000Z"),
    ];

    expect(buildOperatorGuidance(input).stage).toBe("fix-ready");
  });

  it("uses strict newer-than comparisons at equal timestamps", () => {
    const replyEqual = {
      ticket: ticket(),
      recommendations: [recommendation()],
      audits: [
        audit("customer-reply-received", "2026-06-10T09:00:00.000Z"),
      ],
    };
    expect(buildOperatorGuidance(replyEqual).stage).toBe("active");

    const diagnosisEqual = diagnosisReadyWorkflow();
    const equalDiagnosis = diagnosisAudit({
      timestamp: "2026-06-10T09:01:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    diagnosisEqual.audits = [
      equalDiagnosis,
      diagnosisReviewAudit(equalDiagnosis, "2026-06-10T09:01:00.000Z"),
      sentAudit("2026-06-10T09:01:00.000Z"),
    ];
    expect(buildOperatorGuidance(diagnosisEqual).stage).toBe("fix-ready");

    const fixEqual = confirmedEngineeringDiagnosisWorkflow();
    fixEqual.audits = [
      sentAudit("2026-06-10T09:01:00.000Z"),
      diagnosisAudit({
        timestamp: "2026-06-10T09:02:00.000Z",
        confidence: "confirmed",
        owner: "engineering",
      }),
      audit("fix-available", "2026-06-10T09:02:00.000Z", {
        after: { fix: { status: "available" } },
      }),
    ];
    expect(buildOperatorGuidance(fixEqual).stage).toBe("verification");
  });

  it("surfaces targeted evidence for an ambiguous diagnostic context", () => {
    const input = waitingCustomerWorkflow();
    input.recommendations = [
      recommendation({
        category: "performance",
        team: "product",
        supportState: "needs-information",
        missingEvidence: [evidenceRequirement()],
        knowledgeArticleIds: ["performance-troubleshooting"],
      }),
    ];

    const guidance = buildOperatorGuidance(input);

    expect(guidance.stage).toBe("waiting-customer");
    expect(guidance.nextAction).toBe("wait-for-customer");
    expect(guidance.customerNextStep).toMatch(/private|incognito/i);
  });

  it("uses first-match precedence for resolved and ready-to-close tickets", () => {
    expect(buildOperatorGuidance(resolvedWorkflow()).stage).toBe("closed");
    expect(buildOperatorGuidance(closingResponseSentWorkflow()).stage).toBe(
      "ready-for-close",
    );
  });
});

describe("shared lifecycle blockers", () => {
  it("selects only an approved current diagnosis as authoritative", () => {
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    expect(latestAuthoritativeDiagnosis(ticketId, [original])).toBeUndefined();

    const review = diagnosisReviewAudit(original, "2026-06-10T09:03:00.000Z");
    expect(latestAuthoritativeDiagnosis(ticketId, [original, review])).toMatchObject({
      diagnosisId: original.id,
      diagnosis: { confidence: "confirmed", owner: "engineering" },
      review: { decision: "approve" },
    });
  });

  it("uses only the strictly associated review audit as the authority position", () => {
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const validReview = diagnosisReviewAudit(
      original,
      "2026-06-10T09:03:00.000Z",
    );
    const mismatchedOuterAudit = AuditEventSchema.parse({
      ...validReview,
      id: "29999999-9999-4999-8999-999999999999",
      actor: "different-actor",
    });

    expect(
      latestAuthoritativeDiagnosis(ticketId, [
        original,
        validReview,
        mismatchedOuterAudit,
      ])?.reviewAudit.id,
    ).toBe(validReview.id);
  });

  it("does not let a review linked to another diagnosis unlock fix or closure", () => {
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const mislinkedReview = AuditEventSchema.parse({
      ...diagnosisReviewAudit(original, "2026-06-10T09:03:00.000Z"),
      before: { diagnosisId: "29999999-9999-4999-8999-999999999999" },
    });
    const audits = [
      original,
      mislinkedReview,
      sentAudit("2026-06-10T09:04:00.000Z"),
    ];

    expect(latestAuthoritativeDiagnosis(ticketId, audits)).toBeUndefined();
    expect(fixBlockers({ ticket: ticket(), audits })).toContain(
      "An approved current diagnosis is required before marking a fix available.",
    );
    expect(
      closeBlockers({
        ticket: ticket(),
        recommendation: recommendation({ supportState: "ready-for-close" }),
        audits,
      }),
    ).toContain("A current approved diagnosis is required before ticket closure.");
  });

  it("invalidates an older review when a causally later diagnosis is backdated", () => {
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const review = diagnosisReviewAudit(original, "2026-06-10T09:03:00.000Z");
    const replacement = diagnosisAudit({
      timestamp: "2026-06-10T09:01:00.000Z",
      confidence: "likely",
      owner: "support",
    });

    expect(latestDiagnosisAudit([original, review, replacement])?.id).toBe(
      replacement.id,
    );
    expect(
      latestAuthoritativeDiagnosis(ticketId, [original, review, replacement]),
    ).toBeUndefined();
  });

  it("does not let an older fix bypass a causally later unreviewed diagnosis at closure", () => {
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const review = diagnosisReviewAudit(original, "2026-06-10T09:03:00.000Z");
    const fix = audit("fix-available", "2026-06-10T09:04:00.000Z", {
      after: { fix: { status: "available" } },
    });
    const replacement = diagnosisAudit({
      timestamp: "2026-06-10T09:01:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });

    expect(
      closeBlockers({
        ticket: ticket(),
        recommendation: recommendation({ supportState: "ready-for-close" }),
        audits: [
          original,
          review,
          fix,
          replacement,
          sentAudit("2026-06-10T09:05:00.000Z"),
        ],
      }),
    ).toContain("A current approved diagnosis is required before ticket closure.");
  });

  it("invalidates a review when a causally later customer reply is backdated", () => {
    const firstReply = audit("customer-reply-received", "2026-06-10T09:00:00.000Z", {
      actor: "Maya Chen",
      after: { body: "The original trace still reproduces the issue." },
    });
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const review = diagnosisReviewAudit(
      original,
      "2026-06-10T09:03:00.000Z",
      "approve",
      { state: "reply", timestamp: firstReply.timestamp, id: firstReply.id },
    );
    const sent = sentAudit("2026-06-10T09:04:00.000Z");
    const backdatedReply = audit(
      "customer-reply-received",
      "2026-06-10T08:59:00.000Z",
      {
        actor: "Maya Chen",
        after: { body: "A causally newer reply reports different behavior." },
      },
    );
    const audits = [firstReply, original, review, sent, backdatedReply];

    expect(latestAuthoritativeDiagnosis(ticketId, audits)).toBeUndefined();
    expect(fixBlockers({ ticket: ticket(), audits })).toContain(
      "An approved current diagnosis is required before marking a fix available.",
    );
    expect(
      closeBlockers({
        ticket: ticket(),
        recommendation: recommendation({ supportState: "ready-for-close" }),
        audits,
      }),
    ).toContain("A current approved diagnosis is required before ticket closure.");
  });

  it("requires evaluation after a causally later backdated reply", () => {
    const sent = sentAudit("2026-06-10T10:00:00.0008+02:00");
    const laterPersistedReply = audit(
      "customer-reply-received",
      "2026-06-10T07:59:59.9999Z",
      {
        actor: "Maya Chen",
        after: { body: "The issue still occurs after the last response." },
      },
    );

    expect(
      diagnosisBlockers({
        recommendation: recommendation(),
        audits: [sent, laterPersistedReply],
      }),
    ).toContain("Evaluate the latest customer reply before diagnosis.");
  });

  it("does not let an earlier fix bypass closure after a causally later customer reply", () => {
    const firstReply = audit("customer-reply-received", "2026-06-10T09:00:00.000Z", {
      actor: "Maya Chen",
      after: { body: "The original trace still reproduces the issue." },
    });
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const review = diagnosisReviewAudit(
      original,
      "2026-06-10T09:03:00.000Z",
      "approve",
      { state: "reply", timestamp: firstReply.timestamp, id: firstReply.id },
    );
    const diagnosisSent = sentAudit("2026-06-10T09:04:00.000Z");
    const fix = audit("fix-available", "2026-06-10T09:05:00.000Z", {
      after: { fix: { status: "available" } },
    });
    const backdatedReply = audit(
      "customer-reply-received",
      "2026-06-10T08:59:00.000Z",
      {
        actor: "Maya Chen",
        after: { body: "The issue changed after the recorded fix." },
      },
    );
    const readyResponse = sentAudit("2026-06-10T09:06:00.000Z");

    expect(
      closeBlockers({
        ticket: ticket(),
        recommendation: recommendation({ supportState: "ready-for-close" }),
        audits: [
          firstReply,
          original,
          review,
          diagnosisSent,
          fix,
          backdatedReply,
          readyResponse,
        ],
      }),
    ).toContain("A current approved diagnosis is required before ticket closure.");
  });

  it("does not let an ungoverned fix after a newer reply bypass closure", () => {
    const firstReply = audit("customer-reply-received", "2026-06-10T09:00:00.000Z");
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    const review = diagnosisReviewAudit(
      original,
      "2026-06-10T09:03:00.000Z",
      "approve",
      { state: "reply", timestamp: firstReply.timestamp, id: firstReply.id },
    );
    const newerReply = audit("customer-reply-received", "2026-06-10T09:04:00.000Z");
    const ungovernedFix = audit("fix-available", "2026-06-10T09:05:00.000Z", {
      after: { fix: { status: "available" } },
    });

    expect(
      closeBlockers({
        ticket: ticket(),
        recommendation: recommendation({ supportState: "ready-for-close" }),
        audits: [
          firstReply,
          original,
          review,
          sentAudit("2026-06-10T09:03:30.000Z"),
          newerReply,
          ungovernedFix,
          sentAudit("2026-06-10T09:06:00.000Z"),
        ],
      }),
    ).toContain("A current approved diagnosis is required before ticket closure.");
  });

  it("blocks a fix when the diagnosis is unreviewed or its review is stale", () => {
    const original = diagnosisAudit({
      timestamp: "2026-06-10T09:02:00.000Z",
      confidence: "confirmed",
      owner: "engineering",
    });
    expect(fixBlockers({ ticket: ticket(), audits: [original] })).toContain(
      "An approved current diagnosis is required before marking a fix available.",
    );

    const review = diagnosisReviewAudit(original, "2026-06-10T09:03:00.000Z");
    const newerReply = audit("customer-reply-received", "2026-06-10T09:04:00.000Z", {
      actor: "Maya Chen",
      after: { body: "The symptoms changed after the review." },
    });
    expect(fixBlockers({ ticket: ticket(), audits: [original, review, newerReply] })).toContain(
      "An approved current diagnosis is required before marking a fix available.",
    );
  });

  it("blocks fix and closure gates after the reviewed ticket revision changes", () => {
    const input = confirmedEngineeringDiagnosisWorkflow();
    const revisedTicket = ticket({ revision: 3 });

    expect(fixBlockers({ ticket: revisedTicket, audits: input.audits })).toContain(
      "An approved current diagnosis is required before marking a fix available.",
    );
    expect(
      closeBlockers({
        ticket: revisedTicket,
        recommendation: recommendation({ supportState: "ready-for-close" }),
        audits: input.audits,
      }),
    ).toContain("A current approved diagnosis is required before ticket closure.");
  });

  it("returns exact diagnosis blocker arrays in enforced order", () => {
    expect(diagnosisBlockers({ recommendation: undefined, audits: [] })).toEqual([
      "A completed evaluation is required before diagnosis.",
    ]);

    expect(
      diagnosisBlockers({
        recommendation: recommendation({
          missingEvidence: [evidenceRequirement()],
          supportState: "needs-information",
        }),
        audits: [],
      }),
    ).toEqual([
      "Diagnosis requires all required evidence to be gathered.",
      "Diagnosis requires a diagnosis-ready ticket state.",
      "The evaluated response must be marked done before diagnosis.",
    ]);

    expect(
      diagnosisBlockers({
        recommendation: recommendation(),
        audits: [
          sentAudit("2026-06-10T09:01:00.000Z"),
          audit("customer-reply-received", "2026-06-10T09:02:00.000Z"),
        ],
      }),
    ).toEqual(["Evaluate the latest customer reply before diagnosis."]);

    expect(
      diagnosisBlockers({
        recommendation: recommendation(),
        audits: [
          sentAudit("2026-06-10T09:01:00.000Z"),
          diagnosisAudit({
            timestamp: "2026-06-10T09:02:00.000Z",
            confidence: "likely",
            owner: "support",
          }),
        ],
      }),
    ).toEqual([
      "Diagnosis has already been recorded for the latest context.",
    ]);

    const ready = diagnosisReadyWorkflow();
    expect(
      diagnosisBlockers({
        recommendation: ready.recommendations[0],
        audits: ready.audits,
      }),
    ).toEqual([]);
  });

  it("returns exact fix blocker arrays in enforced order", () => {
    expect(fixBlockers({ ticket: ticket(), audits: [] })).toEqual([
      "A completed diagnosis is required before marking a fix available.",
    ]);

    expect(
      fixBlockers({
        ticket: ticket(),
        audits: [
          diagnosisAudit({
            timestamp: "2026-06-10T09:02:00.000Z",
            confidence: "likely",
            owner: "support",
          }),
          audit("fix-available", "2026-06-10T09:03:00.000Z", {
            after: { fix: { status: "available" } },
          }),
        ],
      }),
    ).toEqual([
      "An approved current diagnosis is required before marking a fix available.",
      "A confirmed diagnosis is required before marking a fix available.",
      "This confirmed diagnosis does not require a platform fix.",
      "A fix has already been recorded for the latest diagnosis.",
      "Send the diagnosis response before marking a fix available.",
    ]);

    const input = confirmedEngineeringDiagnosisWorkflow();
    expect(fixBlockers({ ticket: input.ticket, audits: input.audits })).toEqual([]);
  });

  it("blocks fixes when a diagnosis still has unresolved plausible causes", () => {
    const input = confirmedEngineeringDiagnosisWorkflow();
    const sent = input.audits[0];
    const diagnosisResponse = input.audits.at(-1)!;
    expect(sent).toBeDefined();
    expect(diagnosisResponse).toBeDefined();
    input.audits = [
      sent,
      audit("diagnosis-completed", "2026-06-10T09:02:00.000Z", {
        after: {
          diagnosis: {
            status: "completed",
            confidence: "confirmed",
            owner: "engineering",
            customerSafeSummary: "The editor remains ambiguous.",
            diagnosticState: {
              state: "ambiguous",
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
              evidenceToRequest: ["Try a private window."],
            },
          },
        },
      }),
      diagnosisResponse,
    ];

    expect(fixBlockers({ ticket: input.ticket, audits: input.audits })).toEqual([
      "An approved current diagnosis is required before marking a fix available.",
      "A diagnosis with unresolved plausible causes cannot unlock a fix.",
    ]);
  });

  it("blocks fixes after diagnostic ambiguity is escalated", () => {
    const diagnosis = escalatedDiagnosisAudit();
    expect(
      fixBlockers({
        ticket: ticket(),
        audits: [
          diagnosis,
          sentAudit("2026-06-10T09:03:00.000Z"),
        ],
      }),
    ).toContain("An escalated diagnosis cannot unlock a fix.");
  });

  it("returns exact close blocker arrays in enforced order", () => {
    expect(
      closeBlockers({
        ticket: ticket({ status: "resolved" }),
        recommendation: undefined,
        audits: [],
      }),
    ).toEqual([
      "Ticket is already closed.",
      "Ticket must have a ready-to-close recommendation before it can be closed.",
      "The ready-to-close response must be marked done before the ticket can be closed.",
    ]);

    expect(
      closeBlockers({
        ticket: ticket(),
        recommendation: recommendation({ supportState: "ready-for-close" }),
        audits: [],
      }),
    ).toEqual([
      "The ready-to-close response must be marked done before the ticket can be closed.",
    ]);

    const input = closingResponseSentWorkflow();
    expect(
      closeBlockers({
        ticket: input.ticket,
        recommendation: input.recommendations[0],
        audits: input.audits,
      }),
    ).toEqual([]);
  });

  it("blocks closure while the latest diagnosis remains ambiguous", () => {
    const input = closingResponseSentWorkflow();
    input.audits = [
      ...input.audits,
      audit("diagnosis-completed", "2026-06-10T09:02:00.000Z", {
        after: {
          diagnosis: {
            status: "completed",
            confidence: "likely",
            owner: "engineering",
            diagnosticState: {
              state: "ambiguous",
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
              evidenceToRequest: ["Try a private window."],
            },
          },
        },
      }),
    ];

    expect(
      closeBlockers({
        ticket: input.ticket,
        recommendation: input.recommendations[0],
        audits: input.audits,
      }),
    ).toContain("An ambiguous diagnosis cannot unlock ticket closure.");
  });

  it("blocks closure after diagnostic ambiguity is escalated", () => {
    const input = closingResponseSentWorkflow();
    input.audits = [
      ...input.audits,
      escalatedDiagnosisAudit(),
    ];

    expect(
      closeBlockers({
        ticket: input.ticket,
        recommendation: input.recommendations[0],
        audits: input.audits,
      }),
    ).toContain("An escalated diagnosis cannot unlock ticket closure.");
  });

  it("stops at specialist review after an escalated diagnosis", () => {
    const input: WorkflowInput = {
      ticket: ticket(),
      recommendations: [
        recommendation({
          team: "product",
          ticketStatus: "in-progress",
          supportState: "escalated",
          escalationRequired: true,
          escalationReasons: ["diagnostic-ambiguity"],
        }),
      ],
      audits: [
        sentAudit("2026-06-10T09:01:00.000Z"),
        escalatedDiagnosisAudit("2026-06-10T09:02:00.000Z"),
      ],
    };

    expect(buildOperatorGuidance(input)).toMatchObject({
      stage: "escalated",
      nextAction: "specialist-review",
      approval: { required: false, fields: [] },
      customerNextStep:
        "No further diagnostic action is required from you right now; support will update you after specialist review.",
    });
  });
});
