import {
  ApprovedFieldSchema,
  type TicketId,
} from "../domain.js";
import { DomainError } from "../errors.js";
import {
  DecisionTimelineEntrySchema,
  type DecisionTimelineEntry,
  type DecisionTraceEvent,
  type OperationalWorkflowSnapshot,
} from "./domain.js";
import { OperationalStoreError } from "./unit-of-work.js";

export const DECISION_TIMELINE_READ_ERROR_MESSAGE =
  "Decision timeline is temporarily unavailable. Retry the workflow read.";

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
  try {
    return buildDecisionTimeline(await source.readWorkflowSnapshot(ticketId));
  } catch (error) {
    if (!(error instanceof OperationalStoreError)) throw error;
    if (error.code === "NOT_FOUND") {
      throw new DomainError(`Ticket ${ticketId} was not found.`, "TICKET_NOT_FOUND");
    }
    throw new DomainError(DECISION_TIMELINE_READ_ERROR_MESSAGE, "REPOSITORY_ERROR");
  }
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
      const classificationTraces = eventTraces.filter(
        (trace): trace is Extract<DecisionTraceEvent, { traceType: "classification" }> =>
          trace.traceType === "classification",
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
      const reasons = stableUnique([
        ...classificationTraces.flatMap(({ reasons: traceReasons }) => traceReasons),
        ...lifecycleTraces.flatMap(({ reason: traceReason }) =>
          traceReason === undefined ? [] : [traceReason]
        ),
        ...(reason === undefined ? [] : [reason]),
      ]);
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
        category: categoryFor(event.action, lifecycleTraces.map(({ stage }) => stage)),
        outcome: lifecycleTraces.some(({ outcome }) => outcome === "rejected")
          || [
            "recommendation-rejected",
            "approval-rejected",
            "learning-capture-failed",
          ].includes(event.action)
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
        ...(reasons.length === 0 ? {} : { reasons }),
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
  lifecycleStages: readonly string[],
): DecisionTimelineEntry["category"] {
  if (["recommendation-submitted", "recommendation-superseded"].includes(action)) {
    return "evaluation";
  }
  if ([
    "recommendation-approved",
    "recommendation-rejected",
    "recommendation-canceled",
    "approval-rejected",
  ].includes(action)) return "approval";
  if (["customer-response-sent", "customer-reply-received"].includes(action)) {
    return "customer-response";
  }
  if ([
    "diagnosis-completed",
    "diagnosis-reviewed",
    "diagnostic-escalated",
  ].includes(action)) return "diagnosis";
  if (["fix-available", "platform-mitigation-available"].includes(action)) {
    return "fix-or-mitigation";
  }
  if (action === "ticket-updated") {
    for (const stage of lifecycleStages) {
      const stagedCategory = genericStageCategory(stage);
      if (stagedCategory !== undefined) return stagedCategory;
    }
  }
  if (["learning-capture-succeeded", "learning-capture-failed"].includes(action)) {
    return "evidence";
  }
  return "evaluation";
}

function genericStageCategory(
  stage: string,
): DecisionTimelineEntry["category"] | undefined {
  if (/evidence/.test(stage)) return "evidence";
  if (/(?:verification|verified)/.test(stage)) return "verification";
  if (/(?:closure|closed)/.test(stage)) return "closure";
  if (/(?:fix|mitigation)/.test(stage)) return "fix-or-mitigation";
  if (/diagnos/.test(stage)) return "diagnosis";
  if (/approv|reject|cancel/.test(stage)) return "approval";
  if (/(?:customer|response|reply)/.test(stage)) return "customer-response";
  if (/evaluat|recommendation/.test(stage)) return "evaluation";
  return undefined;
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
