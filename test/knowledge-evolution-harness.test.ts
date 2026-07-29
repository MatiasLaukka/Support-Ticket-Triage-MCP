import { describe, expect, it } from "vitest";
import { TicketSchema, type ExpectedOutcome, type Ticket } from "../src/domain.js";
import type {
  CompletedDiagnosis,
  KnowledgeCandidate,
  KnowledgeObject,
} from "../src/knowledge-evolution/domain.js";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";
import { buildApprovalDeskRecommendationInput } from "../src/approval-desk/recommendation-builder.js";
import { runDiagnosticEvaluation } from "../src/approval-desk/diagnostic-evaluation.js";
import { approvedKnowledgeEvolutionScenarios } from "../src/approval-desk/diagnostic-evaluation-scenarios.js";

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
    )).toMatchObject({ supportState: "needs-information", knownCause: approved.id });
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
      knownCause: approved.id,
    });
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
  const events: Array<{ action: string; candidateId?: string }> = [];
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
      async appendIfNoPriorAction(event) {
        if (events.some((item) => item.action === event.action && item.candidateId === event.candidateId)) return false;
        events.push(event);
        return true;
      },
    },
    ...(options.malformedDraft
      ? { draftProvider: { enabled: true, async draft() { return { outputText: "not-json" }; } } }
      : {}),
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
    evidenceIds: ["request-id"],
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

function repositoryError(message: string) {
  return Object.assign(new Error(message), { code: "REPOSITORY_ERROR" });
}
