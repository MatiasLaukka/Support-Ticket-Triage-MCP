import type {
  ExpectedOutcome,
  Ticket,
  TriageRecommendation,
} from "../domain.js";
import { TriageRecommendationSchema } from "../domain.js";
import { diagnosisContextForTicket } from "./diagnostic-workflow.js";
import { buildApprovalDeskRecommendationInput } from "./recommendation-builder.js";
import { buildOperatorGuidance } from "./workflow-guidance.js";

export interface SeedTicketLifecycleObservation {
  ticketId: string;
  seedStatus: Ticket["status"];
  category: Ticket["category"];
  priority: TriageRecommendation["priority"];
  team: TriageRecommendation["team"];
  knownCause: string | null;
  knownEventId: string | null;
  supportState: TriageRecommendation["supportState"] | null;
  missingEvidence: string[];
  diagnosisOutcome: "confirmed" | "likely" | "escalated";
  operatorStage: ReturnType<typeof buildOperatorGuidance>["stage"];
  operatorNextAction: ReturnType<typeof buildOperatorGuidance>["nextAction"];
  lifecycleGate: "evidence-required" | "evidence-complete" | "known-cause" | "known-event-with-evidence";
  lifecycleInvariantMismatches: string[];
  classificationMismatches: string[];
}

export interface SeedTicketLifecycleReport {
  ticketCount: number;
  classificationContractPassCount: number;
  baselineMissingEvidenceCount: number;
  knownCauseCount: number;
  knownEventCount: number;
  closedSeedTicketCount: number;
  lifecycleInvariantPassCount: number;
  observations: SeedTicketLifecycleObservation[];
}

export function auditSeedTicketLifecycles(
  tickets: readonly Ticket[],
  outcomes: ReadonlyMap<string, ExpectedOutcome>,
): SeedTicketLifecycleReport {
  const observations = tickets.map((ticket, index) =>
    observeTicket(ticket, outcomes.get(ticket.id), index),
  );
  return {
    ticketCount: observations.length,
    classificationContractPassCount: observations.filter(
      ({ classificationMismatches }) => classificationMismatches.length === 0,
    ).length,
    baselineMissingEvidenceCount: observations.filter(
      ({ missingEvidence }) => missingEvidence.length > 0,
    ).length,
    knownCauseCount: observations.filter(({ knownCause }) => knownCause !== null).length,
    knownEventCount: observations.filter(({ knownEventId }) => knownEventId !== null).length,
    closedSeedTicketCount: observations.filter(({ seedStatus }) => seedStatus === "resolved").length,
    lifecycleInvariantPassCount: observations.filter(
      ({ lifecycleInvariantMismatches }) => lifecycleInvariantMismatches.length === 0,
    ).length,
    observations,
  };
}

function observeTicket(
  ticket: Ticket,
  outcome: ExpectedOutcome | undefined,
  index: number,
): SeedTicketLifecycleObservation {
  const { actor: _actor, ...input } = buildApprovalDeskRecommendationInput({
    ticket,
    actor: "all-ticket-lifecycle-audit",
  });
  const recommendation = TriageRecommendationSchema.parse({
    ...input,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    resolution: "pending",
    createdAt: ticket.updatedAt,
  });
  const diagnosis = diagnosisContextForTicket(ticket, recommendation, []);
  const guidance = buildOperatorGuidance({
    ticket,
    recommendations: [recommendation],
    audits: [],
  });

  const missingEvidence = (recommendation.missingEvidence ?? []).map(({ label }) => label);
  const lifecycleGate = missingEvidence.length > 0
    ? recommendation.knownEventId === undefined || recommendation.knownEventId === null
      ? "evidence-required" as const
      : "known-event-with-evidence" as const
    : recommendation.knownCause === undefined || recommendation.knownCause === null
      ? "evidence-complete" as const
      : "known-cause" as const;
  const lifecycleInvariantMismatches = lifecycleInvariantFailures({
    ticket,
    recommendation,
    guidance,
    missingEvidence,
  });

  return {
    ticketId: ticket.id,
    seedStatus: ticket.status,
    category: recommendation.category,
    priority: recommendation.priority,
    team: recommendation.team,
    knownCause: recommendation.knownCause ?? null,
    knownEventId: recommendation.knownEventId ?? null,
    supportState: recommendation.supportState ?? null,
    missingEvidence,
    diagnosisOutcome: diagnosis.diagnosticState?.state === "escalated"
      ? "escalated"
      : diagnosis.confidence,
    operatorStage: guidance.stage,
    operatorNextAction: guidance.nextAction,
    lifecycleGate,
    lifecycleInvariantMismatches,
    classificationMismatches: compareClassification(recommendation, outcome),
  };
}

function lifecycleInvariantFailures(input: {
  ticket: Ticket;
  recommendation: TriageRecommendation;
  guidance: ReturnType<typeof buildOperatorGuidance>;
  missingEvidence: readonly string[];
}): string[] {
  const failures: string[] = [];
  const evidenceBlockedState = ["needs-information", "information-received"].includes(
    input.recommendation.supportState ?? "",
  );
  if (input.missingEvidence.length > 0 && !evidenceBlockedState) {
    failures.push("missing evidence must keep the support state evidence-gated");
  }
  if (
    input.missingEvidence.length > 0 &&
    input.recommendation.supportState === "waiting-on-platform-fix"
  ) {
    failures.push("waiting-on-platform-fix requires zero missing evidence");
  }
  if (input.ticket.status === "resolved" && input.guidance.nextAction !== "none") {
    failures.push("resolved tickets must not expose another operator action");
  }
  return failures;
}

function compareClassification(
  recommendation: TriageRecommendation,
  outcome: ExpectedOutcome | undefined,
): string[] {
  if (outcome === undefined) return ["missing expected outcome"];
  const mismatches: string[] = [];
  if (recommendation.category !== outcome.category) {
    mismatches.push(`category expected ${outcome.category}, got ${recommendation.category}`);
  }
  if (!outcome.acceptablePriorities.includes(recommendation.priority)) {
    mismatches.push(`priority expected ${outcome.acceptablePriorities.join(" or ")}, got ${recommendation.priority}`);
  }
  if (recommendation.team !== outcome.team) {
    mismatches.push(`team expected ${outcome.team}, got ${recommendation.team}`);
  }
  for (const escalation of outcome.requiredEscalations) {
    if (!recommendation.escalationReasons.includes(escalation)) {
      mismatches.push(`missing escalation ${escalation}`);
    }
  }
  for (const articleId of outcome.knowledgeArticleIds) {
    if (!recommendation.knowledgeArticleIds.includes(articleId)) {
      mismatches.push(`missing article ${articleId}`);
    }
  }
  return mismatches;
}
