import type { DraftCustomerResponseCheck } from "../domain.js";
import type { CustomerResponseDraftInput } from "./draft-response-provider.js";

export interface DraftObligation {
  id: string;
  kind: "concept" | "evidence" | "escalation" | "lifecycle" | "diagnosis" | "fix";
  customerText: string;
  aliases: readonly string[];
  hard: boolean;
}

export interface DraftContractInput {
  input: CustomerResponseDraftInput;
  response: string;
  assistText: string;
}

export interface DraftContractResult {
  checks: DraftCustomerResponseCheck[];
  blockingMessages: string[];
  failedObligationIds: string[];
}

const WEBHOOK_SIGNATURE_ALIASES = [
  "webhook signature",
  "signature validation",
  "signature failure",
  "signature failures",
];

const INCIDENT_REVIEW_ALIASES = ["incident review", "platform review"];
const CUSTOMER_CONFIRMATION_ALIASES = [
  "resolved it",
  "working again",
  "working now",
];

const ESCALATION_OBLIGATIONS: Readonly<Record<
  CustomerResponseDraftInput["outcome"]["requiredEscalations"][number],
  Omit<DraftObligation, "id"> | undefined
>> = {
  security: {
    kind: "escalation",
    customerText: "State that the issue is receiving specialist security review.",
    aliases: ["security review", "security specialist"],
    hard: true,
  },
  outage: {
    kind: "escalation",
    customerText: "State that the issue is under incident or platform review.",
    aliases: INCIDENT_REVIEW_ALIASES,
    hard: true,
  },
  // These remain authoritative workflow gates, but have no customer-facing
  // disclosure requirement: wording must not expose internal confidence,
  // SLA, policy, or diagnostic-routing details. Missing-information is
  // represented by the evidence obligations above.
  "low-confidence": undefined,
  sla: undefined,
  "missing-information": undefined,
  "diagnostic-ambiguity": undefined,
  "policy-conflict": undefined,
};

export function buildDraftObligations(
  input: CustomerResponseDraftInput,
): DraftObligation[] {
  const obligations: DraftObligation[] = [];
  const authoritativeText = [
    input.ticket.subject,
    input.ticket.description,
    input.deterministicDraft,
  ].join(" ");

  if (
    !isCustomerConfirmedReadyForClose(input) &&
    input.evidenceReadiness?.knownEventId == null &&
    !input.outcome.requiredEscalations.includes("outage") &&
    /\b(?:webhook|signature)\b/i.test(authoritativeText)
  ) {
    obligations.push({
      id: "concept:webhook-signature",
      kind: "concept",
      customerText: "Acknowledge the webhook signature issue.",
      aliases: WEBHOOK_SIGNATURE_ALIASES,
      hard: true,
    });
  }

  for (const requirement of input.evidenceReadiness?.missingEvidence ?? []) {
    obligations.push({
      id: `evidence:${requirement.id}`,
      kind: "evidence",
      customerText: `Request ${requirement.customerQuestion}.`,
      aliases: [requirement.customerQuestion, requirement.label, ...requirement.aliases],
      hard: false,
    });
  }

  const escalationReasons = new Set(input.outcome.requiredEscalations);
  if (input.evidenceReadiness?.knownEventId != null) {
    escalationReasons.add("outage");
  }
  for (const reason of escalationReasons) {
    const obligation = ESCALATION_OBLIGATIONS[reason];
    if (obligation === undefined) continue;
    const id = reason === "outage"
      ? "escalation:incident-review"
      : "escalation:security-review";
    if (!obligations.some((candidate) => candidate.id === id)) {
      obligations.push({ id, ...obligation });
    }
  }

  if (isCustomerConfirmedReadyForClose(input)) {
    obligations.push({
      id: "lifecycle:customer-confirmation",
      kind: "lifecycle",
      customerText: "Acknowledge the customer's confirmation that the issue is resolved.",
      aliases: CUSTOMER_CONFIRMATION_ALIASES,
      hard: true,
    });
  }

  if (
    input.conversationContext?.turnType === "status-follow-up" ||
    input.conversationContext?.turnType === "explanation-request"
  ) {
    for (const requirement of input.evidenceReadiness?.providedEvidence ?? []) {
      obligations.push({
        id: `evidence:no-repeat:${requirement.id}`,
        kind: "evidence",
        customerText: `Do not request ${requirement.label} again.`,
        aliases: [requirement.customerQuestion, requirement.label, ...requirement.aliases],
        hard: true,
      });
    }
  }

  if (input.diagnosisContext !== undefined) {
    obligations.push({
      id: "diagnosis:customer-safe-update",
      kind: "diagnosis",
      customerText: "Keep the customer update consistent with the recorded diagnosis.",
      aliases: [],
      hard: false,
    });
  }
  if (input.fixContext !== undefined) {
    obligations.push({
      id: "fix:customer-safe-update",
      kind: "fix",
      customerText: "Keep the customer update consistent with the available fix.",
      aliases: [],
      hard: false,
    });
  }

  return obligations;
}

export function validateDraftContract(input: DraftContractInput): DraftContractResult {
  // The contract governs the customer-facing candidate. Assist content is
  // reviewer-facing and must never satisfy or violate its response obligations.
  const searchableText = ` ${normalize(input.response)} `;
  const checks: DraftCustomerResponseCheck[] = [];
  const blockingMessages: string[] = [];
  const failedObligationIds: string[] = [];

  for (const obligation of buildDraftObligations(input.input)) {
    const passed = obligation.id.startsWith("evidence:no-repeat:")
      ? !containsEvidenceRequest(searchableText, obligation.aliases)
      : obligation.aliases.length === 0 || containsAlias(searchableText, obligation.aliases);
    const message = passed
      ? "Passed."
      : obligationFailureMessage(obligation);
    checks.push({
      id: obligation.id.replace(/:/g, "-"),
      label: obligation.customerText,
      status: passed ? "pass" : "warn",
      message,
    });
    if (!passed) {
      failedObligationIds.push(obligation.id);
      if (obligation.hard) blockingMessages.push(message);
    }
  }

  return { checks, blockingMessages, failedObligationIds };
}

function isCustomerConfirmedReadyForClose(input: CustomerResponseDraftInput): boolean {
  return input.evidenceReadiness?.supportState === "ready-for-close" &&
    input.conversationContext?.turnType === "customer-confirmed";
}

function containsEvidenceRequest(text: string, aliases: readonly string[]): boolean {
  if (!/\b(?:please share|please send|send us|can you(?: please)? (?:share|send|provide)|could you(?: please)? (?:share|send|provide)|share (?:your|the)|provide (?:your|the))\b/.test(text)) {
    return false;
  }
  return containsAlias(text, aliases);
}

function containsAlias(text: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return normalizedAlias.length > 0 && text.includes(` ${normalizedAlias} `);
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function obligationFailureMessage(obligation: DraftObligation): string {
  switch (obligation.kind) {
    case "escalation":
      return "The draft omitted the required escalation wording.";
    case "evidence":
      return obligation.id.startsWith("evidence:no-repeat:")
        ? "The draft repeated a request for evidence already provided."
        : "The draft omitted a required evidence request.";
    case "lifecycle":
      return "The draft omitted the required customer-confirmation acknowledgement.";
    case "concept":
      return "The draft omitted a required customer-safe concept.";
    case "diagnosis":
      return "The draft did not include a diagnosis update.";
    case "fix":
      return "The draft did not include a fix update.";
  }
}
