import { describe, expect, it } from "vitest";
import { TicketSchema, type ExpectedOutcome, type Ticket } from "../src/domain.js";
import type {
  CompletedDiagnosis,
  KnowledgeCandidate,
  KnowledgeObject,
} from "../src/knowledge-evolution/domain.js";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";
import { buildApprovalDeskRecommendationInput } from "../src/approval-desk/recommendation-builder.js";
import { runDiagnosticEvaluation } from "../src/approval-desk/diagnostic-evaluation.js";
import {
  approvedKnowledgeEvolutionScenarios,
  loadDiagnosticEvaluationScenarios,
} from "../src/approval-desk/diagnostic-evaluation-scenarios.js";

const outcome: ExpectedOutcome = {
  ticketId: "TKT-2103",
  category: "integration",
  acceptablePriorities: ["P2"],
  team: "integrations",
  requiredEscalations: [],
  knowledgeArticleIds: ["webhook-signature-validation"],
};

describe("knowledge evolution harness", () => {
  it("uses only an approved none-required object for a later deterministic match", async () => {
    const fixture = createFixture();
    await fixture.service.discover({ actorId: "support-lead", includeGpt: false });
    const candidate = await fixture.service.getCandidate("known-cause-diagnosis-a");
    const recommendationBeforePromotion = evaluate(ticket("TKT-2103"), outcome);

    const approved = await fixture.service.approve({
      candidateId: candidate.id,
      actorId: "support-lead",
      expectedVersion: candidate.version,
      edits: { evidencePolicy: { mode: "none-required" } },
    });
    const recommendationAfterPromotion = evaluate(ticket("TKT-2103"), outcome, [approved]);

    expect(recommendationBeforePromotion.knownCause).toBeNull();
    expect(recommendationAfterPromotion).toMatchObject({
      knownCause: approved.id,
      supportState: "known-cause",
      missingEvidence: [],
    });
    expect(recommendationAfterPromotion.draftCustomerResponse).toContain(
      "We identified a recurring issue and are reviewing the appropriate correction.",
    );
    expect(recommendationAfterPromotion.draftCustomerResponse).not.toMatch(
      /operator rationale|completed diagnosis|gpt/i,
    );
    expect(evaluate(
      ticket("TKT-2104", "Webhook deliveries fail after a signing-key rotation and are delayed for all stores."),
      { ...outcome, ticketId: "TKT-2104", requiredEscalations: ["outage"] },
      [approved],
    )).toMatchObject({ supportState: "needs-information", knownCause: "webhook-delivery-latency" });
    expect(recommendationBeforePromotion).toEqual(evaluate(ticket("TKT-2103"), outcome));
  });

  it("keeps approved required objects and active outages evidence-gated", async () => {
    const fixture = createFixture();
    await fixture.service.discover({ actorId: "support-lead", includeGpt: false });
    const candidate = await fixture.service.getCandidate("known-cause-diagnosis-a");
    const approved = await fixture.service.approve({
      candidateId: candidate.id,
      actorId: "support-lead",
      expectedVersion: candidate.version,
    });

    const required = evaluate(ticket("TKT-2103"), outcome, [approved]);
    const outage = evaluate(
      ticket("TKT-2104", "Webhook deliveries fail after a signing-key rotation and are delayed for all stores."),
      { ...outcome, ticketId: "TKT-2104", requiredEscalations: ["outage"] },
      [approved],
    );

    expect(required).toMatchObject({
      knownCause: approved.id,
      supportState: "needs-information",
      missingEvidence: [{ id: "request-id" }],
    });
    expect(outage).toMatchObject({
      supportState: "needs-information",
      knownCause: "webhook-delivery-latency",
    });
  });

  it("retains an active known event when an approved none-required trigger also matches", async () => {
    const activeEvent = (await loadDiagnosticEvaluationScenarios()).find(
      (scenario) => scenario.id === "active-known-event",
    )!;
    const approved = approvedKnownCause(
      "known-cause-approved-webhook-delay",
      activeEvent.ticket.description,
    );

    const recommendation = evaluate(activeEvent.ticket, activeEvent.outcome!, [approved]);

    expect(recommendation).toMatchObject({
      knownCause: "webhook-delivery-latency",
      knownEventId: "EVT-2026-06-10-WEBHOOK-LATENCY",
      supportState: "needs-information",
    });
    expect(recommendation.supportState).not.toBe("known-cause");
  });

  it("uses approved reuse with a permitted resolved known event", () => {
    const resolvedTicket = TicketSchema.parse({
      ...ticket("TKT-1030", "A subscriber replied STOP, but the profile still appears eligible for the next SMS campaign."),
      createdAt: "2026-06-10T06:15:00.000Z",
      updatedAt: "2026-06-10T06:30:00.000Z",
      subject: "SMS opt-out not reflected on profile",
    });
    const approved = approvedKnownCause(
      "known-cause-approved-sms-consent",
      resolvedTicket.description,
    );

    const recommendation = evaluate(resolvedTicket, {
      ticketId: resolvedTicket.id,
      category: "other",
      acceptablePriorities: ["P2"],
      team: "support",
      requiredEscalations: [],
      knowledgeArticleIds: ["sms-compliance", "profile-sync-issues"],
    }, [approved]);

    expect(recommendation).toMatchObject({
      knownCause: approved.id,
      knownEventId: "EVT-2026-06-10-SMS-CONSENT-SYNC",
      supportState: "known-cause",
      missingEvidence: [],
    });
  });

  it("rejects empty approved triggers and expired approved time windows", () => {
    const unrelatedBillingTicket = TicketSchema.parse({
      ...ticket("TKT-2199", "Where can I download my billing invoice?"),
      subject: "Billing invoice export",
      tags: ["billing"],
    });
    const punctuationOnly = {
      ...approvedKnownCause("known-cause-punctuation-only", "!!!"),
      timeConstraints: ["Apply only when the trigger matches."],
    };
    const expired = {
      ...approvedKnownCause("known-cause-expired-billing", "billing invoice export"),
      timeConstraints: ["2026-06-01T00:00:00.000Z/2026-06-02T00:00:00.000Z"],
    };
    const billingOutcome: ExpectedOutcome = {
      ticketId: unrelatedBillingTicket.id,
      category: "billing",
      acceptablePriorities: ["P3"],
      team: "support",
      requiredEscalations: [],
      knowledgeArticleIds: ["billing-and-invoices"],
    };

    expect(evaluate(unrelatedBillingTicket, billingOutcome, [punctuationOnly]).knownCause).toBeNull();
    expect(evaluate(unrelatedBillingTicket, billingOutcome, [expired]).knownCause).toBeNull();
  });

  it("keeps malformed GPT drafts, rejected candidates, and candidate-only state out of routing", async () => {
    const fixture = createFixture({ malformedDraft: true });
    await fixture.service.discover({ actorId: "support-lead", includeGpt: true });
    const candidate = await fixture.service.getCandidate("known-cause-diagnosis-a");
    const beforeRejection = evaluate(ticket("TKT-2103"), outcome);

    await fixture.service.reject({
      candidateId: candidate.id,
      actorId: "support-lead",
      expectedVersion: candidate.version,
      reason: "Needs a verified customer-safe workflow.",
    });
    const afterRejection = evaluate(ticket("TKT-2103"), outcome);

    await expect(
      fixture.service.getCandidate("known-cause-gpt-diagnosis-a"),
    ).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    expect(beforeRejection).toEqual(afterRejection);
    expect(afterRejection.knownCause).toBeNull();
    await expect(fixture.objects.listApproved()).resolves.toEqual([]);
  });

  it("uses the shared diagnostic evaluation path for approved-object fixtures", () => {
    const report = runDiagnosticEvaluation(approvedKnowledgeEvolutionScenarios());

    expect(report.scenarioCount).toBe(1);
    expect(report.observations[0]?.failures).toEqual([]);
    expect(report.observations[0]).toMatchObject({
      knownCause: "known-cause-webhook-signing-key",
      supportState: "known-cause",
    });
  });
});

function evaluate(
  ticketValue: Ticket,
  expected: ExpectedOutcome,
  approvedObjects: readonly KnowledgeObject[] = [],
) {
  const input = {
    ticket: ticketValue,
    outcome: expected,
    actor: "knowledge-evolution-harness",
    approvedObjects,
  };
  return buildApprovalDeskRecommendationInput(
    input as Parameters<typeof buildApprovalDeskRecommendationInput>[0],
  );
}

function createFixture(options: { malformedDraft?: boolean } = {}) {
  const diagnoses: CompletedDiagnosis[] = [
    diagnosis("diagnosis-a", "TKT-2101"),
    diagnosis("diagnosis-b", "TKT-2102"),
  ];
  const tickets = [
    ticket("TKT-2101"),
    ticket("TKT-2102", "Webhook deliveries fail after a signing-key rotation."),
  ];
  const candidates: KnowledgeCandidate[] = [];
  const approved: KnowledgeObject[] = [];
  const objects = {
    async listCandidates() { return candidates; },
    async getCandidate(id: string) {
      const candidate = candidates.find((item) => item.id === id);
      if (candidate === undefined) throw repositoryError("Knowledge candidate was not found.");
      return candidate;
    },
    async saveCandidate(candidate: KnowledgeCandidate) { candidates.push(candidate); },
    async removeCandidate(candidateId: string) {
      const index = candidates.findIndex((item) => item.id === candidateId);
      if (index < 0) throw repositoryError("Knowledge candidate was not found.");
      candidates.splice(index, 1);
    },
    async listApproved() { return approved; },
    async promote(candidateId: string, object: KnowledgeObject) {
      if (candidateId !== object.id) throw repositoryError("Knowledge object does not match the candidate.");
      approved.push(object);
      return object;
    },
    async removeApproved(candidateId: string) {
      const index = approved.findIndex((item) => item.id === candidateId);
      if (index < 0) throw repositoryError("Approved knowledge object was not found.");
      approved.splice(index, 1);
    },
  };
  const events: KnowledgeAuditEvent[] = [];
  const service = new KnowledgeEvolutionService({
    tickets: {
      async snapshot() { return tickets; },
      async get(ticketId: string) {
        const found = tickets.find((item) => item.id === ticketId);
        if (found === undefined) throw repositoryError("Ticket was not found.");
        return found;
      },
    },
    knowledge: { async list() { return []; } },
    diagnoses: { async list() { return diagnoses; } },
    objects,
    audits: {
      async append(event) { events.push(event); },
      async list(filters: { candidateId?: string } = {}) {
        return events.filter((event) =>
          filters.candidateId === undefined || event.candidateId === filters.candidateId,
        );
      },
      async appendIfNoPriorAction(event) {
        if (events.some((item) => item.action === event.action && item.candidateId === event.candidateId)) return false;
        events.push(event);
        return true;
      },
    },
    ...(options.malformedDraft
      ? { draftProvider: { enabled: true, async draft() { return { outputText: "not-json" }; } } }
      : {}),
    promotionAuthorizer: (actorId) => actorId === "support-lead",
    now: () => new Date("2026-07-29T12:00:00.000Z"),
    nextAuditId: (() => { let index = 0; return () => `audit-${++index}`; })(),
  });
  return { service, objects };
}

function diagnosis(id: string, ticketId: string): CompletedDiagnosis {
  return {
    id,
    ticketId,
    problem: "Webhook deliveries fail after a signing-key rotation.",
    symptoms: ["Webhook deliveries fail after a signing-key rotation."],
    evidenceReferences: [{ id: "request-id", labelAtDiagnosis: "Webhook request ID", source: "ticket", sourceRef: ticketId }],
    ownerTeam: "integrations",
    fixSteps: ["Refresh the signing key in the webhook integration."],
    verificationSteps: ["Verify a newly delivered webhook is accepted."],
    completedAt: "2026-07-29T10:00:00.000Z",
  };
}

function ticket(id: string, description = "Webhook deliveries fail after a signing-key rotation."): Ticket {
  return TicketSchema.parse({
    id,
    createdAt: "2026-07-29T09:00:00.000Z",
    updatedAt: "2026-07-29T09:00:00.000Z",
    customer: { name: "Example", plan: "starter", region: "eu", vip: false },
    subject: description,
    description,
    status: "triage",
    tags: ["webhook"],
    sla: { responseDueAt: "2026-07-29T12:00:00.000Z", breached: false },
    revision: 0,
  });
}

function approvedKnownCause(id: string, triggerPattern: string): KnowledgeObject {
  return {
    id,
    kind: "known-cause",
    name: "Approved webhook delivery guidance",
    summary: "A recurring webhook delivery condition.",
    triggerPatterns: [triggerPattern],
    evidencePolicy: { mode: "none-required" },
    timeConstraints: ["Apply only when the trigger matches."],
    diagnosticSteps: ["Review the approved support path."],
    fixSteps: ["Use the documented correction."],
    verificationSteps: ["Confirm the next delivery."],
    customerSafeExplanation: "We identified a recurring delivery condition and are reviewing the safe correction.",
    operatorRationale: "Operator-only approved rationale.",
    owner: "integrations",
    version: 1,
    status: "approved",
    supportingDiagnosisIds: ["diagnosis-a"],
    supportingTicketIds: ["TKT-2101"],
    provenance: { source: "completed-diagnoses", recordedAt: "2026-07-29T12:00:00.000Z" },
    approval: { approvedBy: "support-lead", approvedAt: "2026-07-29T12:01:00.000Z" },
  };
}

function repositoryError(message: string) {
  return Object.assign(new Error(message), { code: "REPOSITORY_ERROR" });
}
