import {
  ApprovedFieldSchema,
  type TicketId,
} from "../domain.js";
import {
  DecisionTimelineEntrySchema,
  type DecisionTimelineEntry,
  type DecisionTraceEvent,
  type OperationalWorkflowSnapshot,
} from "./domain.js";

export interface DecisionTimelineSource {
  readWorkflowSnapshot(
    ticketId: TicketId,
  ): OperationalWorkflowSnapshot | Promise<OperationalWorkflowSnapshot>;
}

/** Read one safe causal timeline from the operational event spine. */
export async function readDecisionTimeline(
  ticketId: TicketId,
  source: DecisionTimelineSource,
): Promise<DecisionTimelineEntry[]> {
  return buildDecisionTimeline(await source.readWorkflowSnapshot(ticketId));
}

/**
 * Project an already validated workflow snapshot without copying mutable or
 * customer-authored payloads into the timeline.
 */
export function buildDecisionTimeline(
  snapshot: OperationalWorkflowSnapshot,
): DecisionTimelineEntry[] {
  const ticketRevisions = byOperationalEventId(snapshot.ticketRevisions);
  const recommendationRevisions = byOperationalEventId(snapshot.recommendationRevisions);
  const messages = byOperationalEventId(snapshot.messages);
  const diagnoses = byOperationalEventId(snapshot.diagnoses);
  const traces = tracesByOperationalEventId(snapshot.traces);

  return [...snapshot.events]
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => {
      const eventTraces = traces.get(event.id) ?? [];
      const recommendationRevision = recommendationRevisions.get(event.id)?.[0];
      const recommendation = recommendationRevision?.recommendation;
      const diagnosis = diagnoses.get(event.id)?.[0]?.diagnosis;
      const message = messages.get(event.id)?.[0];
      const ticketRevision = ticketRevisions.get(event.id)?.[0];
      const evidenceTraces = eventTraces.filter(
        (trace): trace is Extract<DecisionTraceEvent, { traceType: "evidence" }> =>
          trace.traceType === "evidence",
      );
      const lifecycleTraces = eventTraces.filter(
        (trace): trace is Extract<DecisionTraceEvent, { traceType: "lifecycle" }> =>
          trace.traceType === "lifecycle",
      );
      const telemetryTraces = eventTraces.filter(
        (trace): trace is Extract<DecisionTraceEvent, { traceType: "provider-telemetry" }> =>
          trace.traceType === "provider-telemetry",
      );
      const evidenceIds = stableUnique([
        ...evidenceTraces.flatMap(({ providedEvidenceIds }) => providedEvidenceIds),
        ...(diagnosis?.evidenceReferences?.map(({ id }) => id) ?? []),
      ]);
      const missingEvidenceIds = stableUnique(
        evidenceTraces.flatMap(({ missingEvidenceIds: ids }) => ids),
      );
      const articleIds = stableUnique([
        ...(recommendation?.knowledgeArticleIds ?? []),
        ...safeStringArray(event.facts.knowledgeArticleIds),
      ]);
      const reason = lifecycleTraces.find(({ reason }) => reason !== undefined)?.reason
        ?? safeString(event.facts.reasonCode);
      const fallbackReason = telemetryTraces.find(
        (trace) => trace.fallbackReason !== undefined,
      )?.fallbackReason;
      const approval = approvalProjection(event.action, event.facts, reason);
      const recommendationId = recommendation?.id ?? message?.recommendationId;

      return DecisionTimelineEntrySchema.parse({
        operationalEventId: event.id,
        ticketId: event.ticketId,
        sequence: event.sequence,
        occurredAt: event.occurredAt,
        actor: event.actor,
        action: event.action,
        category: categoryFor(event.action),
        outcome: lifecycleTraces.some(({ outcome }) => outcome === "rejected")
          || event.action === "approval-rejected"
          || event.action === "learning-capture-failed"
          ? "rejected"
          : "success",
        references: {
          ...(ticketRevision === undefined ? {} : { ticketRevision: ticketRevision.revision }),
          ...(recommendationId === undefined ? {} : { recommendationId }),
          ...(diagnosis === undefined ? {} : { diagnosisId: diagnosis.id }),
          ...(message === undefined ? {} : { messageId: message.id }),
        },
        ...(evidenceIds.length === 0 ? {} : { evidenceIds }),
        ...(missingEvidenceIds.length === 0 ? {} : { missingEvidenceIds }),
        ...(approval === undefined ? {} : { approval }),
        ...(articleIds.length === 0 && recommendation?.knownCauseRef === undefined
          ? {}
          : {
              knowledge: {
                articleIds,
                ...(recommendation?.knownCauseRef === undefined
                  ? {}
                  : { object: recommendation.knownCauseRef }),
              },
            }),
        ...(fallbackReason === undefined ? {} : { fallbackReason }),
        ...(telemetryTraces.length === 0
          ? {}
          : {
              providerTelemetry: telemetryTraces.map((trace) => ({
                provider: trace.provider,
                status: trace.status,
                ...(trace.model === undefined ? {} : { model: trace.model }),
                ...(trace.latencyMs === undefined ? {} : { latencyMs: trace.latencyMs }),
                ...(trace.inputTokens === undefined ? {} : { inputTokens: trace.inputTokens }),
                ...(trace.outputTokens === undefined ? {} : { outputTokens: trace.outputTokens }),
              })),
            }),
        ...(reason === undefined ? {} : { reason }),
      });
    });
}

function byOperationalEventId<T extends { readonly operationalEventId: string }>(
  records: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const related = grouped.get(record.operationalEventId) ?? [];
    related.push(record);
    grouped.set(record.operationalEventId, related);
  }
  return grouped;
}

function tracesByOperationalEventId(
  traces: readonly DecisionTraceEvent[],
): Map<string, DecisionTraceEvent[]> {
  return byOperationalEventId(traces);
}

function categoryFor(
  action: DecisionTimelineEntry["action"],
): DecisionTimelineEntry["category"] {
  if (["recommendation-submitted", "recommendation-superseded"].includes(action)) {
    return "recommendation";
  }
  if ([
    "recommendation-approved",
    "recommendation-rejected",
    "recommendation-canceled",
    "approval-rejected",
  ].includes(action)) return "approval";
  if (["customer-response-sent", "customer-reply-received"].includes(action)) {
    return "conversation";
  }
  if ([
    "diagnosis-completed",
    "diagnosis-reviewed",
    "diagnostic-escalated",
    "fix-available",
    "platform-mitigation-available",
  ].includes(action)) return "diagnosis";
  return "resolution";
}

function approvalProjection(
  action: DecisionTimelineEntry["action"],
  facts: Readonly<Record<string, unknown>>,
  reason: string | undefined,
): DecisionTimelineEntry["approval"] {
  const decision = action === "recommendation-approved"
    ? "approved"
    : action === "recommendation-rejected" || action === "approval-rejected"
      ? "rejected"
      : action === "recommendation-canceled"
        ? "canceled"
        : action === "recommendation-superseded"
          ? "superseded"
          : undefined;
  if (decision === undefined) return undefined;
  const fields = Array.isArray(facts.approvedFields)
    ? facts.approvedFields.flatMap((field) => {
        const parsed = ApprovedFieldSchema.safeParse(field);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  return {
    decision,
    ...(fields.length === 0 ? {} : { fields: stableUnique(fields) }),
    ...(reason === undefined ? {} : { reason }),
  };
}

function stableUnique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
