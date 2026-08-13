import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TicketSchema, TriageRecommendationSchema } from "../src/domain.js";
import { CompletedDiagnosisSchema } from "../src/knowledge-evolution/domain.js";
import {
  DecisionTimelineEntrySchema,
  DecisionTraceEventSchema,
  OperationalEventSchema,
} from "../src/operational/domain.js";
import { buildDecisionTimeline, readDecisionTimeline } from "../src/operational/timeline.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { buildTicketWorkflowReadModelFromSnapshot } from "../src/approval-desk/workflow-read-model.js";

const ticketId = "TKT-7701" as const;
const eventIds = [
  "77000000-0000-4000-8000-000000000001",
  "77000000-0000-4000-8000-000000000002",
  "77000000-0000-4000-8000-000000000003",
  "77000000-0000-4000-8000-000000000004",
] as const;
const recommendationId = "77100000-0000-4000-8000-000000000001";
const messageId = "77200000-0000-4000-8000-000000000001";
const commandId = "77300000-0000-4000-8000-000000000001";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("causal Decision Timeline", () => {
  it("uses event sequence and joins safe related decision data only through event IDs", async () => {
    const { store } = seededTimelineStore();
    try {
      const timeline = await readDecisionTimeline(ticketId, store);

      expect(timeline.map(({ operationalEventId, sequence, action }) => ({
        operationalEventId,
        sequence,
        action,
      }))).toEqual([
        { operationalEventId: eventIds[0], sequence: 1, action: "recommendation-submitted" },
        { operationalEventId: eventIds[1], sequence: 2, action: "recommendation-approved" },
        { operationalEventId: eventIds[2], sequence: 3, action: "diagnosis-completed" },
        { operationalEventId: eventIds[3], sequence: 4, action: "customer-reply-received" },
      ]);
      expect(timeline[0]).toMatchObject({
        category: "evaluation",
        actor: "triage-engine",
        occurredAt: "2026-08-11T12:00:00.000Z",
        outcome: "success",
        references: { recommendationId },
        evidenceIds: ["request-id"],
        missingEvidenceIds: ["log-bundle"],
        knowledge: {
          articleIds: ["api-auth"],
          object: { objectId: "credential-rotation", version: 2 },
        },
        fallbackReason: "Provider was unavailable; deterministic evaluation was used.",
        providerTelemetry: [{
          provider: "fallback",
          status: "fallback",
          model: "gpt-5-mini",
          latencyMs: 25,
          inputTokens: 14,
          outputTokens: 5,
        }],
      });
      expect(timeline[1]).toMatchObject({
        category: "approval",
        references: { recommendationId },
        approval: {
          decision: "approved",
          fields: ["category", "customerResponse"],
        },
      });
      expect(timeline[2]).toMatchObject({
        category: "diagnosis",
        references: { diagnosisId: `diagnosis-${eventIds[2]}` },
        evidenceIds: ["request-id"],
      });
      expect(timeline[3]).toMatchObject({
        category: "customer-response",
        references: { messageId },
      });

      const serialized = JSON.stringify(timeline);
      for (const forbidden of [
        "RAW_CUSTOMER_BODY_SENTINEL",
        "RAW_SUPPORT_DRAFT_SENTINEL",
        "HIDDEN_REASONING_SENTINEL",
        "CREDENTIAL_SENTINEL",
        "RAW_PROVIDER_PAYLOAD_SENTINEL",
      ]) expect(serialized).not.toContain(forbidden);
      expect(serialized).not.toContain("body");
      expect(serialized).not.toContain("prompt");
      expect(serialized).not.toContain("reasoning");
    } finally {
      store.close();
    }
  });

  it("adds the same immutable timeline to the canonical shared workflow read model", async () => {
    const { store } = seededTimelineStore();
    try {
      const snapshot = store.readWorkflowSnapshot(ticketId);
      const direct = await readDecisionTimeline(ticketId, store);
      const workflow = buildTicketWorkflowReadModelFromSnapshot(snapshot);

      expect(workflow.decisionTimeline).toEqual(direct);
      expect(workflow.decisionTimeline).not.toBe(direct);
      expect(workflow.decisionTimeline[0]).toMatchObject({
        operationalEventId: eventIds[0],
        category: "evaluation",
      });
    } finally {
      store.close();
    }
  });

  it("rejects prompt, reasoning, and credential sentinels at persisted and emitted identity boundaries", () => {
    const safeEvent = {
      id: eventIds[0],
      ticketId,
      sequence: 1,
      occurredAt: "2026-08-11T12:00:00.000Z",
      actor: "triage-engine",
      action: "recommendation-submitted",
      commandId,
      facts: { outcome: "pending" },
    } as const;
    const safeTrace = {
      id: "77400000-0000-4000-8000-000000000010",
      operationalEventId: eventIds[0],
      ticketId,
      occurredAt: "2026-08-11T12:00:00.000Z",
      actor: "triage-engine",
      traceType: "provider-telemetry",
      provider: "openai",
      status: "used",
      model: "gpt-5-mini",
    } as const;
    const safeTimelineEntry = {
      operationalEventId: eventIds[0],
      ticketId,
      sequence: 1,
      occurredAt: "2026-08-11T12:00:00.000Z",
      actor: "triage-engine",
      action: "recommendation-submitted",
      category: "evaluation",
      outcome: "success",
      references: {},
      providerTelemetry: [{ provider: "openai", status: "used", model: "gpt-5-mini" }],
    } as const;

    expect(OperationalEventSchema.safeParse({
      ...safeEvent,
      actor: "system prompt: RAW_PROMPT_ACTOR_SENTINEL",
    }).success).toBe(false);
    expect(DecisionTraceEventSchema.safeParse({
      ...safeTrace,
      actor: "hidden reasoning RAW_REASONING_ACTOR_SENTINEL",
    }).success).toBe(false);
    expect(DecisionTraceEventSchema.safeParse({
      ...safeTrace,
      model: "sk-CREDENTIAL_MODEL_SENTINEL",
    }).success).toBe(false);
    expect(DecisionTimelineEntrySchema.safeParse({
      ...safeTimelineEntry,
      actor: "developer instructions RAW_PROMPT_DTO_SENTINEL",
    }).success).toBe(false);
    expect(DecisionTimelineEntrySchema.safeParse({
      ...safeTimelineEntry,
      providerTelemetry: [{
        provider: "openai",
        status: "used",
        model: "sk-CREDENTIAL_DTO_SENTINEL",
      }],
    }).success).toBe(false);

    const { store } = seededTimelineStore();
    try {
      const before = store.readWorkflowSnapshot(ticketId);
      expect(() => store.transaction((unit) => {
        const [sequence] = unit.allocateEventSequences(ticketId, 1);
        unit.appendEvent({
          ...safeEvent,
          id: "77500000-0000-4000-8000-000000000001",
          sequence: sequence!,
          actor: "system prompt: RAW_PERSISTED_EVENT_ACTOR_SENTINEL",
        });
      })).toThrow();
      expect(() => store.transaction((unit) => {
        unit.appendTrace({
          ...safeTrace,
          id: "77500000-0000-4000-8000-000000000002",
          model: "sk-PERSISTED_TRACE_MODEL_SENTINEL",
        });
      })).toThrow();
      expect(store.readWorkflowSnapshot(ticketId)).toEqual(before);
    } finally {
      store.close();
    }
  });

  it("preserves the planned milestone taxonomy and uses lifecycle stage for generic actions", () => {
    const { store } = seededTimelineStore();
    try {
      const base = store.readWorkflowSnapshot(ticketId);
      const generic = (index: number, stage: string) => ({
        id: `77900000-0000-4000-8000-00000000000${index}`,
        ticketId,
        sequence: 10 + index,
        occurredAt: `2026-08-11T13:0${index}:00.000Z`,
        actor: "workflow-engine",
        action: "ticket-updated" as const,
        commandId,
        facts: { outcome: "recorded" },
        stage,
      });
      const genericEvents = [
        generic(1, "evidence-collected"),
        generic(2, "outcome-verified"),
        generic(3, "ticket-closed"),
      ];
      const stagedEvents = [
        {
          ...generic(4, "fix-available"),
          action: "fix-available" as const,
        },
        ...genericEvents,
        {
          ...generic(5, "recommendation-rejected"),
          action: "recommendation-rejected" as const,
          facts: {
            resolution: "rejected",
            reasonCode: "The evidence does not support approval.",
          },
        },
      ];
      const timeline = buildDecisionTimeline({
        ...base,
        events: [
          ...base.events,
          ...stagedEvents.map(({ stage: _stage, ...event }) => event),
        ],
        traces: [
          ...base.traces,
          ...stagedEvents.map((item, index) => ({
            id: `77800000-0000-4000-8000-00000000000${index + 1}`,
            operationalEventId: item.id,
            ticketId,
            occurredAt: item.occurredAt,
            actor: item.actor,
            traceType: "lifecycle" as const,
            stage: item.stage,
            outcome: "success" as const,
          })),
        ],
      } as any);

      expect(timeline.map(({ category }) => category)).toEqual([
        "evaluation",
        "approval",
        "diagnosis",
        "customer-response",
        "evidence",
        "verification",
        "closure",
        "fix-or-mitigation",
        "approval",
      ]);
      expect(timeline.at(-1)).toMatchObject({
        outcome: "rejected",
        approval: {
          decision: "rejected",
          reason: "The evidence does not support approval.",
        },
      });
    } finally {
      store.close();
    }
  });
});

function seededTimelineStore(): { store: OperationalSqliteStore } {
  const root = mkdtempSync(join(tmpdir(), "decision-timeline-"));
  temporaryRoots.push(root);
  const store = OperationalSqliteStore.open(join(root, "operational.sqlite"));
  store.initialize();
  const ticket = TicketSchema.parse({
    id: ticketId,
    createdAt: "2026-08-11T06:00:00.000Z",
    updatedAt: "2026-08-11T06:00:00.000Z",
    customer: { name: "Northstar", plan: "enterprise", region: "eu", vip: false },
    subject: "API request fails",
    description: "CREDENTIAL_SENTINEL must remain outside the timeline.",
    status: "triage",
    tags: [],
    sla: { responseDueAt: "2026-08-12T00:00:00.000Z", breached: false },
    relatedTicketIds: [],
    revision: 0,
  });
  const pendingRecommendation = TriageRecommendationSchema.parse({
    id: recommendationId,
    ticketId,
    sourceRevision: 0,
    category: "api",
    priority: "P2",
    team: "api-platform",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "none",
    missingInformation: [],
    knownCause: "credential-rotation",
    knownCauseRef: { objectId: "credential-rotation", version: 2 },
    requiredEvidence: [requirement("request-id"), requirement("log-bundle")],
    providedEvidence: [requirement("request-id")],
    missingEvidence: [requirement("log-bundle")],
    knowledgeArticleIds: ["api-auth"],
    draftCustomerResponse: "RAW_SUPPORT_DRAFT_SENTINEL",
    rationale: "HIDDEN_REASONING_SENTINEL",
    aiExecutionTrace: {
      preference: "gpt-preferred",
      classification: {
        status: "fallback",
        model: "gpt-5-mini",
        latencyMs: 25,
        usage: { inputTokens: 14, outputTokens: 5, totalTokens: 19 },
        fallback: {
          category: "provider-error",
          message: "Provider was unavailable; deterministic evaluation was used.",
        },
        acceptedSignals: [],
        rejectedAdvice: [],
        deterministicOverrides: ["RAW_PROVIDER_PAYLOAD_SENTINEL"],
        finalOutcome: {
          category: "api",
          team: "api-platform",
          priority: "P2",
          knowledgeArticleIds: ["api-auth"],
          confidence: 0.9,
          escalationReasons: [],
        },
      },
      drafting: {
        status: "skipped",
        source: "deterministic",
        requestedStyle: "auto",
        recommendedStyle: "balanced",
        selectedStyle: "balanced",
        checks: [],
      },
    },
    confidence: 0.9,
    recommendedNextAction: "Review the evidence.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "pending",
    createdAt: "2026-08-11T12:00:00.000Z",
  });
  const approvedRecommendation = TriageRecommendationSchema.parse({
    ...pendingRecommendation,
    resolution: "approved",
  });
  const diagnosis = CompletedDiagnosisSchema.parse({
    id: `diagnosis-${eventIds[2]}`,
    ticketId,
    problem: "HIDDEN_REASONING_SENTINEL diagnosis detail.",
    symptoms: ["Requests fail."],
    evidenceUsed: ["Request ID was reviewed."],
    evidenceReferences: [{
      id: "request-id",
      labelAtDiagnosis: "Request ID",
      source: "operator",
    }],
    ownerTeam: "api-platform",
    fixSteps: ["Rotate the credential."],
    verificationSteps: ["Verify a successful request."],
    completedAt: "2026-08-11T10:00:00.000Z",
  });

  store.transaction((unit) => {
    unit.insertTicket(ticket);
    const sequences = unit.allocateEventSequences(ticketId, eventIds.length);
    unit.appendEvent(event(0, sequences[0]!, "2026-08-11T12:00:00.000Z", "triage-engine", "recommendation-submitted", {
      sourceRevision: 0,
      outcome: "pending",
    }));
    unit.insertRecommendation(approvedRecommendation);
    unit.appendRecommendationRevision({
      recommendation: pendingRecommendation,
      operationalEventId: eventIds[0],
      createdAt: pendingRecommendation.createdAt,
    });
    unit.appendTrace({
      id: "77400000-0000-4000-8000-000000000001",
      operationalEventId: eventIds[0],
      ticketId,
      occurredAt: "2026-08-11T12:00:00.000Z",
      actor: "triage-engine",
      traceType: "evidence",
      requiredEvidenceIds: ["request-id", "log-bundle"],
      providedEvidenceIds: ["request-id"],
      missingEvidenceIds: ["log-bundle"],
    });
    unit.appendTrace({
      id: "77400000-0000-4000-8000-000000000002",
      operationalEventId: eventIds[0],
      ticketId,
      occurredAt: "2026-08-11T12:00:00.000Z",
      actor: "triage-engine",
      traceType: "provider-telemetry",
      provider: "fallback",
      status: "fallback",
      model: "gpt-5-mini",
      latencyMs: 25,
      inputTokens: 14,
      outputTokens: 5,
      fallbackReason: "Provider was unavailable; deterministic evaluation was used.",
    });
    unit.appendEvent(event(1, sequences[1]!, "2026-08-11T11:00:00.000Z", "support-lead", "recommendation-approved", {
      approved: true,
      approvedFields: ["category", "customerResponse"],
    }));
    unit.appendRecommendationRevision({
      recommendation: approvedRecommendation,
      operationalEventId: eventIds[1],
      createdAt: "2026-08-11T11:00:00.000Z",
    });
    unit.appendEvent(event(2, sequences[2]!, "2026-08-11T10:00:00.000Z", "diagnostic-engine", "diagnosis-completed", {
      diagnosisOutcome: "completed",
      knowledgeArticleIds: ["api-auth"],
    }));
    unit.insertDiagnosis({
      diagnosis,
      operationalEventId: eventIds[2],
      originalAudit: {
        id: eventIds[2],
        timestamp: "2026-08-11T10:00:00.000Z",
        actor: "diagnostic-engine",
        action: "diagnosis-completed",
        ticketId,
        before: {},
        after: { diagnosis: diagnosisContext() },
        rationale: "Diagnosis completed from trusted support context.",
        knowledgeArticleIds: ["api-auth"],
        result: "success",
      },
    });
    unit.appendTrace({
      id: "77400000-0000-4000-8000-000000000003",
      operationalEventId: eventIds[2],
      ticketId,
      occurredAt: "2026-08-11T10:00:00.000Z",
      actor: "diagnostic-engine",
      traceType: "evidence",
      requiredEvidenceIds: [],
      providedEvidenceIds: ["request-id"],
      missingEvidenceIds: [],
    });
    unit.appendEvent(event(3, sequences[3]!, "2026-08-11T07:00:00.000Z", "customer", "customer-reply-received", {
      messageId,
    }));
    unit.insertMessage({
      id: messageId,
      ticketId,
      operationalEventId: eventIds[3],
      kind: "customer",
      createdAt: "2026-08-11T07:00:00.000Z",
      body: "RAW_CUSTOMER_BODY_SENTINEL",
    });
  });
  return { store };
}

function diagnosisContext() {
  return {
    status: "completed" as const,
    causeType: "configuration" as const,
    customerSafeSummary: "Credential rotation caused request failures.",
    evidenceUsed: ["Request ID was reviewed."],
    evidenceReferences: [{ id: "request-id", labelAtDiagnosis: "Request ID", source: "operator" as const }],
    confidence: "confirmed" as const,
    owner: "engineering" as const,
    recommendedNextAction: "Rotate the credential.",
    doNotSay: [],
  };
}

function event(
  index: number,
  sequence: number,
  occurredAt: string,
  actor: string,
  action: "recommendation-submitted" | "recommendation-approved" | "diagnosis-completed" | "customer-reply-received",
  facts: Readonly<Record<string, unknown>>,
) {
  return {
    id: eventIds[index]!,
    ticketId,
    sequence,
    occurredAt,
    actor,
    action,
    commandId,
    facts,
  };
}

function requirement(id: "request-id" | "log-bundle") {
  return {
    id,
    label: id === "request-id" ? "Request ID" : "Log bundle",
    customerQuestion: `Please provide ${id}.`,
    aliases: [],
    source: "knowledge" as const,
  };
}
