import type { AuditEvent, Ticket, TriageRecommendation } from "../domain.js";
import type { DiagnosisContext, FixContext } from "../triage-service.js";
import { diagnoseFromPlaybook } from "./diagnostic-playbooks.js";
import { getKnownCause } from "./known-cause-catalog.js";
import { getKnownEvent } from "./known-event-catalog.js";
import {
  advanceDiagnosticState,
  DiagnosticStateSnapshotSchema,
  type DiagnosticStateSnapshot,
} from "./diagnostic-state.js";
import {
  DiagnosisReviewDecisionSchema,
  latestStrictDiagnosisReviewRecord,
  strictDiagnosisReviewRecord,
} from "./diagnosis-review.js";
import {
  compareAuditCausalOrder,
  latestAuditPosition,
  type AuditCausalPosition,
} from "./workflow-causal-context.js";
export { hasCustomerReplyAfterRecommendation } from "./workflow-causal-context.js";

export function diagnosisContextForTicket(
  ticket: Ticket,
  recommendation: TriageRecommendation,
  audits: readonly AuditEvent[] = [],
): DiagnosisContext {
  const playbookDiagnosis = diagnoseFromPlaybook({
    ticket,
    recommendation,
    customerReplyText: customerReplyTextFromAudits(ticket.id, audits),
  });
  if (playbookDiagnosis !== undefined) {
    const diagnosis = applyPersistedDiagnosticState(playbookDiagnosis, ticket.id, audits);
    if ((recommendation.missingEvidence?.length ?? 0) === 0) return diagnosis;
    return {
      ...diagnosis,
      confidence: "likely",
      doNotSay: [
        ...diagnosis.doNotSay,
        "Do not confirm the playbook diagnosis while required evidence is missing.",
      ],
      ...(diagnosis.diagnosticState?.state === "confirmed"
        ? {
            diagnosticState: {
              ...diagnosis.diagnosticState,
              state: "working-diagnosis" as const,
              hypotheses: diagnosis.diagnosticState.hypotheses.map((hypothesis) => ({
                ...hypothesis,
                status: hypothesis.status === "confirmed" ? "leading" as const : hypothesis.status,
              })),
              evidenceToRequest: (recommendation.missingEvidence ?? []).map(({ label }) => label),
            },
          }
        : {}),
    };
  }

  if ((recommendation.missingEvidence?.length ?? 0) > 0) {
    return {
      status: "completed",
      causeType: recommendation.category === "security" ? "security" : "configuration",
      customerSafeSummary:
        "We need the requested evidence before confirming whether the reported issue matches a known cause or platform event.",
      evidenceUsed: providedEvidenceLabels(recommendation, "provided customer evidence"),
      confidence: "likely",
      owner: recommendation.category === "integration" ? "integration-partner" : "support",
      recommendedNextAction:
        "Collect the requested evidence before confirming a root cause or advancing platform-fix work.",
      doNotSay: [
        "Do not present a known cause or investigating event as a confirmed root cause while required evidence is missing.",
      ],
    };
  }

  const knownEvent = getKnownEvent(recommendation.knownEventId);
  if (knownEvent?.status === "active") {
    return {
      status: "completed",
      causeType: "platform-delay",
      customerSafeSummary: knownEvent.customerSafeSummary,
      evidenceUsed: providedEvidenceLabels(recommendation, knownEvent.label),
      confidence: "likely",
      owner: "engineering",
      knownEventId: knownEvent.id,
      knownEventMatchReasons: recommendation.knownEventMatchReasons,
      recommendedNextAction:
        "Continue platform mitigation, then ask the customer to verify the affected webhook deliveries.",
      doNotSay: [
        "Do not claim the incident is resolved until the event status changes and the customer verifies recovery.",
      ],
    };
  }
  if (knownEvent?.status === "investigating") {
    return {
      status: "completed",
      causeType: "platform-delay",
      customerSafeSummary: knownEvent.customerSafeSummary,
      evidenceUsed: providedEvidenceLabels(recommendation, knownEvent.label),
      confidence: "likely",
      owner: "engineering",
      knownEventId: knownEvent.id,
      knownEventMatchReasons: recommendation.knownEventMatchReasons,
      recommendedNextAction:
        "Keep the ticket in diagnostic review while the possible event is confirmed or ruled out.",
      doNotSay: [
        "Do not present the investigating event as a confirmed root cause.",
      ],
    };
  }

  if (
    recommendation.supportState === "known-cause" &&
    recommendation.knownCause !== undefined &&
    recommendation.knownCause !== null
  ) {
    const knownCause = getKnownCause(recommendation.knownCause);
    if (knownCause !== undefined) {
      return {
        status: "completed",
        causeType: recommendation.category === "integration" ? "integration" : "configuration",
        customerSafeSummary: knownCause.problemSummary,
        evidenceUsed: providedEvidenceLabels(recommendation, knownCause.label),
        confidence: "confirmed",
        owner: recommendation.team === "integrations" ? "integration-partner" : "support",
        ...(recommendation.knownEventId === undefined ||
        recommendation.knownEventId === null
          ? {}
          : {
              knownEventId: recommendation.knownEventId,
              knownEventMatchReasons: recommendation.knownEventMatchReasons,
            }),
        recommendedNextAction: knownCause.nextStep,
        doNotSay: [
          "Do not ask for unrelated diagnostics after a known cause is confirmed.",
        ],
      };
    }
    return {
      status: "completed",
      causeType: recommendation.category === "integration" ? "integration" : "configuration",
      customerSafeSummary:
        "The ticket matches an approved documented support path and the next safe correction is ready to review.",
      evidenceUsed: providedEvidenceLabels(recommendation, "approved known-cause match"),
      confidence: "confirmed",
      owner: recommendation.team === "integrations" ? "integration-partner" : "support",
      recommendedNextAction:
        "Use the approved customer-safe guidance and confirm the requested result.",
      doNotSay: [
        "Do not expose internal candidate rationale or detection details to the customer.",
      ],
    };
  }

  if (recommendation.supportState === "waiting-on-platform-fix") {
    return {
      status: "completed",
      causeType: "platform-delay",
      customerSafeSummary:
        "The evidence points to a platform-side processing delay affecting checkout event processing and profile timeline updates.",
      evidenceUsed: providedEvidenceLabels(recommendation, "provided customer evidence"),
      confidence: "likely",
      owner: "engineering",
      recommendedNextAction:
        "Complete platform mitigation before asking the customer to verify the affected examples.",
      doNotSay: ["Do not claim a final root cause until mitigation is available."],
    };
  }

  return {
    status: "completed",
    causeType: recommendation.category === "security" ? "security" : "configuration",
    customerSafeSummary:
      "The support team has completed the investigation and identified the most likely cause from the provided evidence.",
    evidenceUsed: providedEvidenceLabels(
      recommendation,
      recommendation.knownCause === undefined || recommendation.knownCause === null
        ? "provided customer evidence"
        : "known cause match",
    ),
    confidence: "likely",
    owner: recommendation.category === "integration" ? "integration-partner" : "support",
    recommendedNextAction:
      "Share the diagnosis with the customer and explain the next safe action.",
    doNotSay: ["Do not claim a fix until a fix event is recorded."],
  };
}

/** Parse a persisted diagnosis exactly as recorded in the workflow audit. */
export function diagnosisContextFromAudit(
  event: AuditEvent | undefined,
): DiagnosisContext | undefined {
  if (event === undefined) {
    return undefined;
  }
  const diagnosisValue = diagnosisValueFromAudit(event);
  if (diagnosisValue === undefined) return undefined;
  const value = diagnosisValue as Partial<DiagnosisContext>;
  if (
    value.status !== "completed" ||
    typeof value.causeType !== "string" ||
    typeof value.customerSafeSummary !== "string" ||
    !Array.isArray(value.evidenceUsed) ||
    (value.confidence !== "likely" && value.confidence !== "confirmed") ||
    typeof value.owner !== "string" ||
    typeof value.recommendedNextAction !== "string" ||
    !Array.isArray(value.doNotSay)
  ) {
    return undefined;
  }
  return {
    status: "completed",
    causeType: value.causeType as DiagnosisContext["causeType"],
    customerSafeSummary: value.customerSafeSummary,
    evidenceUsed: value.evidenceUsed.filter(
      (item): item is string => typeof item === "string",
    ),
    confidence: value.confidence,
    owner: value.owner as DiagnosisContext["owner"],
    recommendedNextAction: value.recommendedNextAction,
    doNotSay: value.doNotSay.filter(
      (item): item is string => typeof item === "string",
    ),
    ...(typeof value.knownEventId === "string"
      ? { knownEventId: value.knownEventId }
      : {}),
    ...(Array.isArray(value.knownEventMatchReasons)
      ? {
          knownEventMatchReasons: value.knownEventMatchReasons.filter(
            (item): item is string => typeof item === "string",
          ),
        }
      : {}),
    ...(DiagnosticStateSnapshotSchema.safeParse(value.diagnosticState).success
      ? { diagnosticState: DiagnosticStateSnapshotSchema.parse(value.diagnosticState) }
      : {}),
  };
}

function applyPersistedDiagnosticState(
  diagnosis: DiagnosisContext,
  ticketId: string,
  audits: readonly AuditEvent[],
): DiagnosisContext {
  const latest = latestDiagnosticSnapshot(audits, ticketId);
  if (latest === undefined || diagnosis.diagnosticState === undefined) {
    return diagnosis;
  }

  const replyText = customerReplyTextAfter(
    ticketId,
    audits,
    latest.position,
  );
  if (replyText.trim() === "") {
    return { ...diagnosis, diagnosticState: latest.snapshot };
  }

  if (diagnosis.diagnosticState.state === "confirmed") {
    return diagnosis;
  }

  const nextState = advanceDiagnosticState({
    current: latest.snapshot,
    customerReplyText: replyText,
    contradicted: containsContradictoryEvidence(replyText),
  });
  return {
    ...diagnosis,
    confidence: nextState.state === "confirmed" ? "confirmed" : "likely",
    diagnosticState: nextState,
  };
}

function latestDiagnosticSnapshot(
  audits: readonly AuditEvent[],
  ticketId: string,
): { snapshot: DiagnosticStateSnapshot; position: AuditCausalPosition } | undefined {
  return audits
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event, index }) =>
        event.ticketId === ticketId &&
        (event.action === "diagnosis-completed" ||
          event.action === "diagnostic-escalated" ||
          (event.action === "diagnosis-reviewed" &&
            strictDiagnosisReviewRecord(audits, { event, index }) !== undefined)) &&
        diagnosisValueFromAudit(event) !== undefined,
    )
    .sort(
      (left, right) =>
        compareAuditCausalOrder(right, left),
    )
    .map(({ event, index }) => {
      const diagnosis = diagnosisValueFromAudit(event);
      if (diagnosis === undefined) return undefined;
      const parsed = DiagnosticStateSnapshotSchema.safeParse(
        (diagnosis as { diagnosticState?: unknown }).diagnosticState,
      );
      return parsed.success
        ? { snapshot: parsed.data, position: { event, index } }
        : undefined;
    })
    .find((value): value is { snapshot: DiagnosticStateSnapshot; position: AuditCausalPosition } => value !== undefined);
}

function customerReplyTextAfter(
  ticketId: string,
  audits: readonly AuditEvent[],
  diagnosisPosition: AuditCausalPosition,
): string {
  return audits
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event, index }) =>
        event.ticketId === ticketId &&
        event.action === "customer-reply-received" &&
        compareAuditCausalOrder({ event, index }, diagnosisPosition) > 0 &&
        typeof event.after.body === "string",
    )
    .sort(compareAuditCausalOrder)
    .map(({ event }) => event.after.body as string)
    .join("\n\n");
}

function containsContradictoryEvidence(value: string): boolean {
  return /\b(?:works|loads|opens)\b/i.test(value) &&
    /\b(?:still blank|also blank|fails in the same|does not load in the same)\b/i.test(value);
}

export function fixContextForTicket(
  diagnosisEvent: AuditEvent | undefined,
): FixContext {
  if (diagnosisEvent === undefined) {
    return {
      status: "available",
      customerSafeSummary:
        "A reviewed mitigation will be shared after the diagnosis is approved.",
      customerAction: "Please wait for the reviewed support update.",
      verificationRequest:
        "No verification is requested until the diagnosis and mitigation are approved.",
    };
  }
  const diagnosis = diagnosisFromAudit(diagnosisEvent);
  if (isCampaignEditorDiagnosis(diagnosis)) {
    return {
      status: "available",
      customerSafeSummary:
        "The campaign editor loading mitigation has been applied for the affected campaign.",
      customerAction:
        "Please reopen the Summer Flash Sale campaign editor in Chrome and try editing the campaign again.",
      verificationRequest:
        "Let us know whether the editor now loads normally or if the blank page still appears.",
    };
  }

  if (diagnosis?.causeType === "platform-delay") {
    return {
      status: "available",
      customerSafeSummary:
        "The event-processing delay mitigation has been applied for the affected store events.",
      customerAction:
        "Please check the affected profile timelines again using the same store URL, profile, and event example you shared with us.",
      verificationRequest:
        "Let us know whether the delayed checkout events now appear correctly or if any examples are still missing.",
    };
  }

  const diagnosisSummary =
    diagnosis !== undefined && typeof diagnosis.customerSafeSummary === "string"
      ? diagnosis.customerSafeSummary
      : "the diagnosed issue";

  return {
    status: "available",
    customerSafeSummary: `A fix or mitigation is now available for ${diagnosisSummary}`,
    customerAction:
      "Please retry the affected workflow using the same example you shared with us.",
    verificationRequest:
      "Let us know whether the issue is resolved or if you still see the same behavior.",
  };
}

/** Parse a persisted fix exactly as recorded in the workflow audit. */
export function fixContextFromAudit(
  event: AuditEvent | undefined,
): FixContext | undefined {
  if (
    event === undefined ||
    typeof event.after.fix !== "object" ||
    event.after.fix === null
  ) {
    return undefined;
  }
  const value = event.after.fix as Partial<FixContext>;
  if (
    value.status !== "available" ||
    typeof value.customerSafeSummary !== "string" ||
    typeof value.customerAction !== "string" ||
    typeof value.verificationRequest !== "string"
  ) {
    return undefined;
  }
  return {
    status: "available",
    customerSafeSummary: value.customerSafeSummary,
    customerAction: value.customerAction,
    verificationRequest: value.verificationRequest,
  };
}

export interface PersistedDiagnosticContext<T> {
  event: AuditEvent;
  position: AuditCausalPosition;
  context: T;
}

export interface PersistedDiagnosticWorkflowContext {
  diagnosis?: PersistedDiagnosticContext<DiagnosisContext>;
  fix?: PersistedDiagnosticContext<FixContext>;
  latestCustomerReply?: AuditCausalPosition;
}

/**
 * Select the current persisted diagnostic context from causal audit order.
 *
 * A customer reply that is appended after a diagnosis or fix invalidates that
 * context unless it is a status or explanation question that can safely reuse
 * the current context. This is the shared read boundary for transports and
 * customer-drafting code; timestamps never decide lifecycle freshness alone.
 */
export function selectPersistedDiagnosticWorkflowContext(
  audits: readonly AuditEvent[],
): PersistedDiagnosticWorkflowContext {
  const latestCustomerReply = latestAuditPosition(
    audits,
    (event) => event.action === "customer-reply-received",
  );
  const diagnosis = currentPersistedContext(
    audits,
    (event) =>
      isPersistedDiagnosisContextEvent(event, audits),
    diagnosisContextFromAudit,
  );
  const fix = currentPersistedContext(
    audits,
    (event) => event.action === "fix-available",
    fixContextFromAudit,
  );
  return {
    ...(diagnosis === undefined ? {} : { diagnosis }),
    ...(fix === undefined ? {} : { fix }),
    ...(latestCustomerReply === undefined ? {} : { latestCustomerReply }),
  };
}

function isPersistedDiagnosisContextEvent(
  event: AuditEvent,
  audits: readonly AuditEvent[],
): boolean {
  if (
    (event.action === "diagnosis-completed" ||
      event.action === "diagnostic-escalated") &&
    typeof event.after.diagnosis === "object" &&
    event.after.diagnosis !== null
  ) {
    const latestReview = latestStrictDiagnosisReviewRecord(audits, event.id);
    return latestReview?.review.decision !== "reject" &&
      diagnosisContextFromAudit(event) !== undefined;
  }
  const position = audits.findIndex((candidate) => candidate.id === event.id);
  const review = position < 0
    ? undefined
    : strictDiagnosisReviewRecord(audits, { event, index: position });
  if (
    review === undefined ||
    (review.review.decision !== "approve" && review.review.decision !== "revalidate") ||
    diagnosisContextFromAudit(event) === undefined
  ) {
    return false;
  }
  return true;
}

/** Return the latest fix that is still current for the conversation. */
export function latestFixContextFromAudits(
  audits: readonly AuditEvent[],
): FixContext | undefined {
  return selectPersistedDiagnosticWorkflowContext(audits).fix?.context;
}

function currentPersistedContext<T>(
  audits: readonly AuditEvent[],
  matches: (event: AuditEvent) => boolean,
  parse: (event: AuditEvent | undefined) => T | undefined,
): PersistedDiagnosticContext<T> | undefined {
  const latest = latestAuditPosition(audits, matches);
  if (latest === undefined || hasSupersedingCustomerReply(audits, latest)) {
    return undefined;
  }
  const context = parse(latest.event);
  return context === undefined
    ? undefined
    : { event: latest.event, position: latest, context };
}

function hasSupersedingCustomerReply(
  audits: readonly AuditEvent[],
  context: AuditCausalPosition,
): boolean {
  return audits.some((candidate, index) => {
    if (candidate.action !== "customer-reply-received") return false;
    if (
      compareAuditCausalOrder(
        { event: candidate, index },
        context,
      ) <= 0
    ) return false;
    const body = typeof candidate.after.body === "string"
      ? candidate.after.body
      : "";
    return !customerReplyCanUseExistingContext(body);
  });
}

function customerReplyCanUseExistingContext(value: string): boolean {
  return /\b(?:how long|eta|estimated time|when (?:will|can|should)|any update|status update|what'?s (?:the )?(?:current )?status|current status(?: of (?:the )?ticket)?|wait for (?:a )?fix|fix be ready|fixed|resolved)\b/i.test(value) ||
    /\b(?:what'?s|what is|whats)\s+(?:the\s+)?(?:problem|issue|wrong|happening|going on|cause)|\bwhy\s+(?:is|are|did|does|do)\b.{0,80}\b(?:happening|broken|failing|delayed|missing|not working|not showing)|\bwhat happened\b|\bwhat caused\b|\broot cause\b/i.test(value);
}

function diagnosisFromAudit(event: AuditEvent): Record<string, unknown> | undefined {
  return diagnosisValueFromAudit(event);
}

function diagnosisValueFromAudit(
  event: AuditEvent,
): Record<string, unknown> | undefined {
  if (typeof event.after.diagnosis === "object" && event.after.diagnosis !== null) {
    return event.after.diagnosis as Record<string, unknown>;
  }
  const review = event.after.diagnosisReview;
  if (typeof review !== "object" || review === null) return undefined;
  const parsedReview = DiagnosisReviewDecisionSchema.safeParse(review);
  if (
    !parsedReview.success ||
    (parsedReview.data.decision !== "approve" &&
      parsedReview.data.decision !== "revalidate")
  ) {
    return undefined;
  }
  const editedDiagnosis = parsedReview.data.editedDiagnosis;
  return typeof editedDiagnosis === "object" && editedDiagnosis !== null
    ? editedDiagnosis as Record<string, unknown>
    : undefined;
}

function isCampaignEditorDiagnosis(
  diagnosis: Record<string, unknown> | undefined,
): boolean {
  return (
    diagnosis?.causeType === "performance" &&
    diagnosis?.owner === "engineering" &&
    typeof diagnosis.customerSafeSummary === "string" &&
    /\bcampaign editor\b/i.test(diagnosis.customerSafeSummary)
  );
}

function providedEvidenceLabels(
  recommendation: TriageRecommendation,
  fallback: string,
): string[] {
  const labels = recommendation.providedEvidence?.map((item) => item.label) ?? [];
  return labels.length > 0 ? labels : [fallback];
}

function customerReplyTextFromAudits(
  ticketId: string,
  audits: readonly AuditEvent[],
): string {
  return audits
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.ticketId === ticketId &&
        event.action === "customer-reply-received" &&
        typeof event.after.body === "string",
    )
    .sort(compareAuditCausalOrder)
    .map(({ event }) => event.after.body as string)
    .join("\n\n");
}
