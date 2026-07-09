import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  CategorySchema,
  PrioritySchema,
  RequiredEscalationSchema,
  TeamSchema,
  TicketIdSchema,
  type ExpectedOutcome,
  type Ticket,
} from "../domain.js";
import type { SubmitRecommendationInput } from "../triage-service.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const CUSTOMER_RESPONSE_TEMPLATES: Readonly<Record<string, string>> = {
  "account-access":
    "Please confirm the affected user, workspace, sign-in method, last successful login time, and whether SSO or identity-provider settings changed recently.",
  "api-errors":
    "Please share the affected endpoint, status code, request identifier, region, timestamp, and whether the same request fails repeatedly or only intermittently.",
  "billing-refunds":
    "Please share the invoice identifier, charge timestamp, payment status, and any duplicate charge references so we can match the billing records before proposing a refund action.",
  "incident-response":
    "We are correlating related reports by service, region, status code, and time window, and we will keep the update focused on confirmed customer-safe status details.",
  "integration-webhooks":
    "Please share the affected endpoint URL, delivery ID, failure timestamp, and any recent changes to the signing secret, signature verification, or raw body handling. We will compare the event creation time with the delivery timing and check whether signature validation is rejecting the payload.",
  performance:
    "Please share the affected workflow, dataset size, observed duration, normal baseline, and time window so we can distinguish a broad degradation from a single expensive operation.",
  "security-escalation":
    "Please avoid sending secrets in the ticket. Share the suspected exposure time, affected accounts or tokens, and any access-scope evidence so we can route the case safely.",
  "sla-policy":
    "We are checking the response deadline and current SLA risk so the next action is prioritized consistently.",
  "triage-policy":
    "Please include the expected behavior, actual behavior, timestamps, and reproduction steps for the reported issue.",
  "vip-communications":
    "Please share the business impact and preferred update cadence so we can acknowledge urgency while keeping the technical severity tied to evidence.",
};

const ExpectedOutcomeSchema = z
  .object({
    ticketId: TicketIdSchema,
    category: CategorySchema,
    acceptablePriorities: z.array(PrioritySchema).min(1),
    team: TeamSchema,
    requiredEscalations: z.array(RequiredEscalationSchema),
    knowledgeArticleIds: z.array(SlugSchema),
    duplicateGroup: z.string().trim().min(1).optional(),
  })
  .strict();

const ExpectedOutcomesSchema = z.array(ExpectedOutcomeSchema);

export async function loadExpectedOutcomes(
  path: string,
): Promise<ReadonlyMap<string, ExpectedOutcome>> {
  const raw = await readFile(path, "utf8");
  const outcomes = ExpectedOutcomesSchema.parse(JSON.parse(raw));
  const byTicketId = new Map<string, ExpectedOutcome>();
  for (const outcome of outcomes) {
    if (byTicketId.has(outcome.ticketId)) {
      throw new Error(`Duplicate expected outcome for ${outcome.ticketId}.`);
    }
    byTicketId.set(outcome.ticketId, outcome);
  }
  return byTicketId;
}

export function buildApprovalDeskRecommendationInput(input: {
  ticket: Ticket;
  outcome?: ExpectedOutcome;
  actor: string;
}): Omit<SubmitRecommendationInput, "submittedAt"> {
  const { ticket, outcome, actor } = input;
  if (outcome === undefined) {
    throw new Error(`No expected outcome exists for ${ticket.id}.`);
  }
  if (outcome.ticketId !== ticket.id) {
    throw new Error(
      `Expected outcome ${outcome.ticketId} does not match ticket ${ticket.id}.`,
    );
  }

  const escalationReasons = outcome.requiredEscalations;
  const knowledgeArticleIds = outcome.knowledgeArticleIds;

  return {
    ticketId: ticket.id,
    sourceRevision: ticket.revision,
    category: outcome.category,
    priority: outcome.acceptablePriorities[0],
    team: outcome.team,
    tags: buildTags(ticket, outcome),
    duplicateCandidates: [],
    outageRisk: escalationReasons.includes("outage") ? "likely" : "none",
    securityRisk: escalationReasons.includes("security") ? "possible" : "none",
    slaRisk: escalationReasons.includes("sla") ? "likely" : "none",
    missingInformation: escalationReasons.includes("missing-information")
      ? [`Confirm the missing evidence for ${ticket.id} before approval.`]
      : [],
    knowledgeArticleIds,
    draftCustomerResponse: buildDraftCustomerResponse(
      ticket.id,
      knowledgeArticleIds,
    ),
    rationale: `${ticket.id} matches expected ${outcome.category} routing to ${outcome.team} with knowledge ${knowledgeArticleIds.join(
      ", ",
    )}.`,
    confidence: 0.95,
    recommendedNextAction:
      "Review the supporting evidence, then approve or reject this recommendation.",
    escalationRequired: escalationReasons.length > 0,
    escalationReasons,
    actor,
  };
}

function buildTags(ticket: Ticket, outcome: ExpectedOutcome): string[] {
  return unique([
    ...ticket.tags,
    outcome.category,
    ...(outcome.requiredEscalations.includes("policy-conflict")
      ? ["policy-conflict"]
      : []),
  ]);
}

function buildDraftCustomerResponse(
  ticketId: string,
  knowledgeArticleIds: readonly string[],
): string {
  return `We are investigating ${ticketId}. ${formatCustomerGuidance(
    knowledgeArticleIds,
  )} We will share the next update once we have confirmed the details.`;
}

function formatCustomerGuidance(knowledgeArticleIds: readonly string[]): string {
  const guidance = knowledgeArticleIds.map(
    (id) =>
      CUSTOMER_RESPONSE_TEMPLATES[id] ??
      "Please share the support details relevant to this request.",
  );
  return unique(guidance).join(" ");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
