import type {
  ApprovedField,
  Ticket,
  TriageRecommendation,
} from "./domain.js";
import { DomainError } from "./errors.js";

export interface EscalationDecision {
  required: boolean;
  reasons: string[];
  requiredTeam?: "security" | "incident-response";
}

const APPROVABLE_FIELDS = new Set<ApprovedField>([
  "category",
  "priority",
  "team",
  "assignee",
  "status",
  "tags",
  "customerResponse",
]);

export function evaluateEscalation(
  recommendation: TriageRecommendation,
  now: Date,
  ticket: Ticket,
): EscalationDecision {
  const reasons: string[] = [];
  let requiredTeam: EscalationDecision["requiredTeam"];

  if (recommendation.securityRisk !== "none") {
    reasons.push("security");
    requiredTeam = "security";
  }

  if (
    recommendation.outageRisk === "likely" ||
    recommendation.outageRisk === "confirmed"
  ) {
    reasons.push("outage");
    requiredTeam ??= "incident-response";
  }

  if (recommendation.confidence < 0.75) {
    reasons.push("low-confidence");
  }

  const warningDeadline = now.getTime() + 60 * 60 * 1000;
  if (
    ticket.sla.breached ||
    new Date(ticket.sla.responseDueAt).getTime() <= warningDeadline
  ) {
    reasons.push("sla");
  }

  const highImpact =
    recommendation.priority === "P1" ||
    recommendation.priority === "P2" ||
    recommendation.securityRisk !== "none" ||
    recommendation.outageRisk !== "none";
  if (highImpact && recommendation.missingInformation.length > 0) {
    reasons.push("missing-information");
  }

  if (recommendation.escalationReasons.includes("policy-conflict")) {
    reasons.push("policy-conflict");
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    required: uniqueReasons.length > 0,
    reasons: uniqueReasons,
    ...(requiredTeam === undefined ? {} : { requiredTeam }),
  };
}

export function validateApprovedFields(
  _recommendation: TriageRecommendation,
  approvedFields: readonly string[],
): void {
  if (approvedFields.length === 0) {
    throw new DomainError(
      "At least one approved field is required.",
      "INVALID_APPROVED_FIELDS",
    );
  }

  if (new Set(approvedFields).size !== approvedFields.length) {
    throw new DomainError(
      "Approved fields must be unique.",
      "INVALID_APPROVED_FIELDS",
    );
  }

  const unknownField = approvedFields.find(
    (field) => !APPROVABLE_FIELDS.has(field as ApprovedField),
  );
  if (unknownField !== undefined) {
    throw new DomainError(
      `Field is not approvable: ${unknownField}`,
      "INVALID_APPROVED_FIELDS",
    );
  }
}
