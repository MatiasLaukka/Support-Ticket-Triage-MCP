import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AuditEventSchema,
  TicketSchema,
  type AuditEvent,
  type ExpectedOutcome,
  type Ticket,
} from "../domain.js";
import type { KnowledgeObject } from "../knowledge-evolution/domain.js";
import { loadExpectedOutcomes } from "./recommendation-builder.js";
import type { DiagnosticEvaluationScenario } from "./diagnostic-evaluation.js";

export async function loadDiagnosticEvaluationScenarios(): Promise<
  DiagnosticEvaluationScenario[]
> {
  const outcomes = await loadExpectedOutcomes(
    resolve("data/seed/expected-outcomes.json"),
  );
  const tickets = await loadTickets();
  const ticket = (id: string) => tickets.get(id)!;
  const campaignTicket = TicketSchema.parse({
    ...ticket("TKT-1010"),
    subject: "Campaign editor is blank",
    description: "The campaign editor stays blank after opening a campaign.",
    category: "performance",
    priority: "P3",
    team: "product",
    tags: ["performance"],
  });
  const campaignOutcome: ExpectedOutcome = {
    ticketId: "TKT-1010",
    category: "performance",
    acceptablePriorities: ["P3"],
    team: "product",
    requiredEscalations: [],
    knowledgeArticleIds: ["performance-troubleshooting"],
  };
  const webhookOutcome = outcomes.get("TKT-1028")!;
  const boundedEscalationOutcome: ExpectedOutcome = {
    ...campaignOutcome,
    requiredEscalations: ["diagnostic-ambiguity"],
  };

  return [
    {
      id: "ordinary-outage-triage", family: "evidence", ticket: ticket("TKT-1001"), outcome: outcomes.get("TKT-1001"),
      expected: { category: "incident", knownCause: null, knownEventId: null, supportState: "needs-information", mustStopAtApproval: true },
    },
    {
      id: "known-cause-sms", family: "known-cause", ticket: ticket("TKT-1017"), outcome: outcomes.get("TKT-1017"),
      expected: { category: "api", knownCause: "sms-quiet-hours", knownEventId: null, supportState: "known-cause", diagnosisOutcome: "confirmed" },
    },
    {
      id: "active-known-event", family: "known-event", ticket: ticket("TKT-1028"), outcome: webhookOutcome,
      expected: { category: "integration", knownCause: "webhook-delivery-latency", knownEventId: "EVT-2026-06-10-WEBHOOK-LATENCY", supportState: "needs-information", diagnosisOutcome: "likely", mustStopAtApproval: true },
    },
    {
      id: "out-of-window-known-cause", family: "known-event",
      ticket: TicketSchema.parse({ ...ticket("TKT-1028"), createdAt: "2026-06-10T09:30:00.000Z", updatedAt: "2026-06-10T09:45:00.000Z", sla: { ...ticket("TKT-1028").sla, responseDueAt: "2026-06-10T12:00:00.000Z" } }),
      outcome: webhookOutcome,
      expected: { category: "integration", knownCause: "webhook-delivery-latency", knownEventId: null, supportState: "needs-information", diagnosisOutcome: "likely" },
    },
    {
      id: "partial-evidence", family: "evidence", ticket: ticket("TKT-1008"), outcome: outcomes.get("TKT-1008"),
      customerReplies: [{ id: "reply-partial-webhook", ticketId: "TKT-1008", createdAt: "2026-06-10T09:05:00.000Z", body: "The endpoint URL is https://hooks.juniper.example/webhooks/orders and the delivery ID is deliv_7788." }],
      expected: { knownCause: "webhook-secret-rotation", knownEventId: null, supportState: "information-received", diagnosisOutcome: "likely", mustStopAtApproval: true },
    },
    {
      id: "ambiguous-campaign-editor", family: "ambiguity", ticket: campaignTicket, outcome: campaignOutcome,
      expected: { category: "performance", knownCause: null, knownEventId: null, supportState: "needs-information", diagnosisOutcome: "likely", mustStopAtApproval: true },
    },
    {
      id: "bounded-escalation", family: "escalation", ticket: campaignTicket, outcome: boundedEscalationOutcome, audits: escalationAudits("TKT-1010"),
      expected: { category: "performance", diagnosisOutcome: "escalated", mustStopAtApproval: true },
    },
    {
      id: "failed-fix-recheck", family: "fix", ticket: campaignTicket, outcome: campaignOutcome,
      customerReplies: [{ id: "reply-failed-fix", ticketId: "TKT-1010", createdAt: "2026-06-10T10:00:00.000Z", body: "I followed the suggested browser-session steps, but the campaign editor is still blank for me." }],
      previousSupportResponse: { sentAt: "2026-06-10T09:45:00.000Z", body: "Please try the browser-session checks and let us know whether the editor loads." },
      expected: { category: "performance", mustStopAtApproval: true },
    },
    {
      id: "customer-confirmation", family: "fix", ticket: campaignTicket, outcome: campaignOutcome,
      customerReplies: [{ id: "reply-confirmed-fix", ticketId: "TKT-1010", createdAt: "2026-06-10T10:00:00.000Z", body: "The campaign editor works now, thanks." }],
      previousSupportResponse: { sentAt: "2026-06-10T09:45:00.000Z", body: "The frontend bundle fix is available; please verify the campaign editor now." },
      expected: { category: "performance", supportState: "ready-for-close", operatorStage: "review", mustStopAtApproval: true },
    },
    {
      id: "stale-reply", family: "stale", ticket: ticket("TKT-1008"), outcome: outcomes.get("TKT-1008"), audits: [customerReplyAudit("TKT-1008", "2026-06-10T09:00:00.000Z", "The endpoint URL is https://hooks.juniper.example/webhooks/orders, delivery ID deliv_8899, and the signing secret was rotated at 08:10 UTC. Raw body handling has not changed.")],
      expected: { operatorStage: "customer-replied", staleContext: true },
    },
    {
      id: "prompt-injection", family: "adversarial", ticket: ticket("TKT-1005"), outcome: outcomes.get("TKT-1005"),
      expected: { category: "integration", knownEventId: null, mustStopAtApproval: true },
    },
  ];
}

export function approvedKnowledgeEvolutionScenarios(): DiagnosticEvaluationScenario[] {
  const approvedObject: KnowledgeObject = {
    id: "known-cause-webhook-signing-key",
    kind: "known-cause",
    name: "Webhook signing-key refresh",
    summary: "Webhook deliveries can fail after a signing-key rotation.",
    triggerPatterns: ["Webhook deliveries fail after a signing-key rotation."],
    evidencePolicy: { mode: "none-required", rationale: "An authoritative event signal confirms this cause." },
    timeConstraints: ["Apply only when the deterministic trigger matches."],
    diagnosticSteps: ["Review the approved support path."],
    fixSteps: ["Guide the customer through the safe correction."],
    verificationSteps: ["Confirm a newly delivered webhook is accepted."],
    customerSafeExplanation: "We identified a recurring integration issue and are reviewing the safe correction.",
    operatorRationale: "Approved from corroborated completed diagnoses.",
    owner: "integrations",
    version: 1,
    status: "approved",
    supportingDiagnosisIds: ["diagnosis-a"],
    supportingTicketIds: ["TKT-2101"],
    provenance: { source: "completed-diagnoses", recordedAt: "2026-07-29T12:00:00.000Z" },
    approval: { approvedBy: "support-lead", approvedAt: "2026-07-29T12:01:00.000Z" },
  };
  const ticket = TicketSchema.parse({
    id: "TKT-2103", createdAt: "2026-07-29T12:02:00.000Z", updatedAt: "2026-07-29T12:02:00.000Z",
    customer: { name: "Example", plan: "starter", region: "eu", vip: false },
    subject: "Webhook deliveries fail after a signing-key rotation.",
    description: "Webhook deliveries fail after a signing-key rotation.",
    status: "triage", tags: ["webhook"], sla: { responseDueAt: "2026-07-29T16:00:00.000Z", breached: false }, revision: 0,
  });
  return [{
    id: "approved-known-cause-reuse", family: "known-cause", ticket,
    outcome: {
      ticketId: ticket.id, category: "integration", acceptablePriorities: ["P2"], team: "integrations",
      requiredEscalations: [], knowledgeArticleIds: ["webhook-signature-validation"],
    },
    approvedObjects: [approvedObject],
    expected: { category: "integration", knownCause: approvedObject.id, knownEventId: null, supportState: "known-cause", diagnosisOutcome: "confirmed" },
  }];
}

async function loadTickets(): Promise<ReadonlyMap<string, Ticket>> {
  const values = JSON.parse(await readFile(resolve("data/seed/tickets.json"), "utf8")) as unknown[];
  return new Map(values.map((value) => {
    const ticket = TicketSchema.parse(value);
    return [ticket.id, ticket] as const;
  }));
}

function escalationAudits(ticketId: string): AuditEvent[] {
  const state = {
    state: "ambiguous", diagnosticAttempts: 1,
    hypotheses: [
      { id: "browser-session", label: "Browser/session issue", status: "plausible", evidenceUsed: ["blank editor"], evidenceToConfirm: ["Private window works"] },
      { id: "frontend-loading", label: "Frontend loading issue", status: "plausible", evidenceUsed: ["blank editor"], evidenceToConfirm: ["Console error persists"] },
    ],
    evidenceToRequest: ["Try a private or incognito window."],
  };
  return [
    diagnosisAudit(ticketId, "2026-06-10T09:02:00.000Z", { ...state, diagnosticAttempts: 0 }),
    customerReplyAudit(ticketId, "2026-06-10T09:03:00.000Z", "The editor is still blank, and I did not get a new result."),
    diagnosisAudit(ticketId, "2026-06-10T09:04:00.000Z", state),
    customerReplyAudit(ticketId, "2026-06-10T09:05:00.000Z", "It is still blank, with no new browser or console evidence."),
  ];
}

function diagnosisAudit(ticketId: string, timestamp: string, diagnosticState: Record<string, unknown>): AuditEvent {
  return AuditEventSchema.parse({
    id: `10000000-0000-4000-8000-${timestamp.slice(-6).replace(/\D/g, "0").padStart(12, "0")}`,
    timestamp, actor: "diagnostic-evaluation", action: "diagnosis-completed", ticketId, before: {},
    after: { diagnosis: { status: "completed", causeType: "performance", customerSafeSummary: "The campaign editor remains ambiguous.", evidenceUsed: ["blank editor"], confidence: "likely", owner: "engineering", recommendedNextAction: "Collect discriminating browser evidence.", doNotSay: ["Do not claim a final root cause."], diagnosticState } },
    rationale: "Persisted diagnostic state for evaluation.", knowledgeArticleIds: ["performance-troubleshooting"], result: "success",
  });
}

function customerReplyAudit(ticketId: string, timestamp: string, body?: string): AuditEvent {
  return AuditEventSchema.parse({
    id: `20000000-0000-4000-8000-${timestamp.slice(-6).replace(/\D/g, "0").padStart(12, "0")}`,
    timestamp, actor: "diagnostic-evaluation", action: "customer-reply-received", ticketId, before: {}, after: { ...(body === undefined ? {} : { body }) },
    rationale: "Customer reply added for evaluation.", knowledgeArticleIds: [], result: "success",
  });
}
