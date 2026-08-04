import type { AuditEvent } from "../domain.js";
import type { QueueMetrics } from "../metrics.js";

export interface AutomationEvidenceReport {
  generatedAt: string;
  summary: QueueMetrics & {
    lowConfidenceCount: number;
    auditEvents: number;
    safetyBlocks: number;
    activeGuardrails: number;
  };
  guardrails: EvidenceGuardrail[];
  recentActivity: EvidenceActivity[];
  metrics: QueueMetrics;
}

export interface EvidenceGuardrail {
  id:
    | "submission-is-not-mutation"
    | "explicit-approval"
    | "edited-customer-response"
    | "rejection-feedback"
    | "untrusted-ticket-text"
    | "stale-and-replay-protection";
  label: string;
  status: "active";
  evidence: string;
}

export interface EvidenceActivity {
  timestamp: string;
  action: AuditEvent["action"];
  ticketId?: string;
  recommendationId?: string;
  result: AuditEvent["result"];
}

export interface AutomationEvidenceInput {
  metrics: QueueMetrics;
  audits: readonly AuditEvent[];
  generatedAt: string;
}

const GUARDRAILS: readonly EvidenceGuardrail[] = [
  {
    id: "submission-is-not-mutation",
    label: "Submission is not mutation",
    status: "active",
    evidence:
      "Recommendation submission stores pending evidence and does not mutate tickets.",
  },
  {
    id: "explicit-approval",
    label: "Explicit approval",
    status: "active",
    evidence:
      "Approval requires actor, selected fields, source revision, and confirm true.",
  },
  {
    id: "edited-customer-response",
    label: "Edited customer response",
    status: "active",
    evidence:
      "Customer response approval requires nonblank reviewer-edited text.",
  },
  {
    id: "rejection-feedback",
    label: "Rejection feedback",
    status: "active",
    evidence: "Recommendation rejection requires actor and nonblank feedback.",
  },
  {
    id: "untrusted-ticket-text",
    label: "Untrusted ticket text",
    status: "active",
    evidence:
      "Ticket text is treated as evidence and cannot authorize repository mutation.",
  },
  {
    id: "stale-and-replay-protection",
    label: "Stale and replay protection",
    status: "active",
    evidence:
      "Finalizers reject stale revisions and already-resolved recommendations.",
  },
];

export function buildAutomationEvidenceReport(
  input: AutomationEvidenceInput,
): AutomationEvidenceReport {
  const recentActivity = input.audits
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.timestamp) - Date.parse(left.timestamp),
    )
    .slice(0, 8)
    .map(toEvidenceActivity);

  const metrics = cloneMetrics(input.metrics);
  const confidenceBandCounts = metrics.confidenceBandCounts ?? {
    low: 0,
    medium: 0,
    high: 0,
  };
  const summaryMetrics = cloneMetrics(metrics);
  return {
    generatedAt: input.generatedAt,
    summary: {
      ...summaryMetrics,
      averageApprovedConfidence: summaryMetrics.averageApprovedConfidence ?? null,
      confidenceBandCounts: { ...confidenceBandCounts },
      potentialMinutesSaved: summaryMetrics.potentialMinutesSaved ?? 0,
      lowConfidenceCount: confidenceBandCounts.low,
      auditEvents: input.audits.length,
      safetyBlocks: input.audits.filter(isSafetyBlock).length,
      activeGuardrails: GUARDRAILS.length,
    },
    guardrails: GUARDRAILS.map((guardrail) => ({ ...guardrail })),
    recentActivity,
    metrics,
  };
}

function toEvidenceActivity(event: AuditEvent): EvidenceActivity {
  return {
    timestamp: event.timestamp,
    action: event.action,
    ticketId: event.ticketId,
    recommendationId: event.recommendationId,
    result: event.result,
  };
}

function isSafetyBlock(event: AuditEvent): boolean {
  return event.result === "rejected" && event.action === "approval-rejected";
}

function cloneMetrics(metrics: QueueMetrics): QueueMetrics {
  return {
    ...metrics,
    ticketsByCategory: { ...metrics.ticketsByCategory },
    ticketsByPriority: { ...metrics.ticketsByPriority },
    ticketsByTeam: { ...metrics.ticketsByTeam },
    escalationCounts: { ...metrics.escalationCounts },
    ...(metrics.confidenceBandCounts === undefined
      ? {}
      : { confidenceBandCounts: { ...metrics.confidenceBandCounts } }),
  };
}
