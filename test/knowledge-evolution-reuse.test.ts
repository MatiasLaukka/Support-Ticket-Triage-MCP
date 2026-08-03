import { describe, expect, it } from "vitest";
import { TicketSchema, type ExpectedOutcome, type Ticket } from "../src/domain.js";
import { buildApprovalDeskRecommendationInput } from "../src/approval-desk/recommendation-builder.js";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";
import type {
  CompletedDiagnosis,
  KnowledgeCandidate,
  KnowledgeObject,
} from "../src/knowledge-evolution/domain.js";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";

const outcomeFor = (ticketId: string): ExpectedOutcome => ({
  ticketId,
  category: "api",
  acceptablePriorities: ["P2"],
  team: "api-platform",
  requiredEscalations: [],
  knowledgeArticleIds: ["api-reference"],
});

describe("governed knowledge-object reuse", () => {
  it("keeps a matching ticket evidence-gated, then selects the approved cause after evidence arrives", async () => {
    const fixture = createFixture();
    const service = fixture.service();
    const laterTicket = ticket("TKT-2103");

    await service.discover({ actorId: "support-lead", includeGpt: false });
    const candidate = await service.getCandidate("known-cause-diagnosis-a");
    expect(candidate.evidencePolicy).toEqual({ mode: "required", evidenceIds: ["request-id"] });

    const beforePromotion = evaluate(laterTicket, outcomeFor(laterTicket.id));
    expect(beforePromotion).toMatchObject({
      knownCause: null,
      supportState: "needs-information",
    });
    expect(beforePromotion.missingEvidence?.map(({ id }) => id)).toContain("request-id");

    const approved = await service.approve({
      candidateId: candidate.id,
      actorId: "support-lead",
      expectedVersion: candidate.version,
      edits: { evidencePolicy: { mode: "required", evidenceIds: ["request-id"] } },
    });
    const persistedApproved = (await fixture.objects.listApproved())[0];
    expect(persistedApproved).toEqual(approved);

    const withoutEvidence = evaluate(laterTicket, outcomeFor(laterTicket.id), [persistedApproved!]);
    expect(withoutEvidence).toMatchObject({
      knownCause: approved.id,
      supportState: "needs-information",
    });
    expect(withoutEvidence.missingEvidence?.map(({ id }) => id)).toEqual(["request-id"]);

    const withEvidence = evaluate(
      laterTicket,
      outcomeFor(laterTicket.id),
      [persistedApproved!],
      [{
        id: "reply-2103",
        ticketId: laterTicket.id,
        createdAt: "2026-07-29T13:00:00.000Z",
        body: "Request ID: req_2103 confirms the failed API call.",
      }],
    );
    expect(withEvidence).toMatchObject({
      knownCause: approved.id,
      supportState: "known-cause",
      missingEvidence: [],
    });
  });

  it("blocks an evidence-less diagnosis from promotion and preserves the original diagnosis when rejected", async () => {
    const fixture = createFixture({ noReferences: true });
    const service = fixture.service();
    const originalDiagnosis = structuredClone(fixture.diagnoses[0]);

    await service.discover({ actorId: "support-lead", includeGpt: false });
    const candidate = await service.getCandidate("known-cause-diagnosis-a");
    expect(candidate).toMatchObject({
      evidencePolicy: { mode: "undecided" },
      validationStatus: "invalid",
    });
    await expect(service.approve({
      candidateId: candidate.id,
      actorId: "support-lead",
      expectedVersion: candidate.version,
    })).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });

    await service.reject({
      candidateId: candidate.id,
      actorId: "support-lead",
      expectedVersion: candidate.version,
      reason: "The diagnosis needs an observed catalog evidence reference before reuse.",
    });
    expect(fixture.diagnoses[0]).toEqual(originalDiagnosis);
    await expect(fixture.objects.listApproved()).resolves.toEqual([]);
  });

  it("preserves a legacy diagnosis without references and keeps deprecated policies readable but non-promotable", async () => {
    const legacy = createFixture({ legacyEvidence: true });
    const service = legacy.service();
    await service.discover({ actorId: "support-lead", includeGpt: false });
    const candidate = await service.getCandidate("known-cause-diagnosis-a");
    expect(legacy.diagnoses[0]?.evidenceUsed).toEqual(["Legacy request identifier supplied by the customer."]);
    await expect(service.getCandidate("known-cause-diagnosis-a")).resolves.toMatchObject({
      evidencePolicy: { mode: "undecided" },
      validationStatus: "invalid",
    });
    await expect(service.approve({
      candidateId: candidate.id,
      actorId: "support-lead",
      expectedVersion: candidate.version,
      edits: { evidencePolicy: { mode: "required", evidenceIds: ["legacy-browser-details"] } },
    })).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });

    const deprecated = {
      ...approvedKnownCause("known-cause-deprecated", "Credential refresh requests return 401 after deployment credential rotation."),
      evidencePolicy: { mode: "required" as const, evidenceIds: ["legacy-browser-details"] },
    } as KnowledgeObject;
    const laterTicket = ticket("TKT-2103");
    expect(() => evaluate(laterTicket, outcomeFor(laterTicket.id), [deprecated])).not.toThrow();
    expect(evaluate(laterTicket, outcomeFor(laterTicket.id), [deprecated])).toMatchObject({
      knownCause: deprecated.id,
      supportState: "needs-information",
    });
  });
});

function evaluate(
  ticketValue: Ticket,
  outcome: ExpectedOutcome,
  approvedObjects: readonly KnowledgeObject[] = [],
  customerReplies: readonly { id: string; ticketId: string; createdAt: string; body: string }[] = [],
) {
  return buildApprovalDeskRecommendationInput({
    ticket: ticketValue,
    outcome,
    actor: "knowledge-evolution-reuse-test",
    approvedObjects,
    customerReplies,
  });
}

function createFixture(options: { noReferences?: boolean; legacyEvidence?: boolean } = {}) {
  const diagnoses: CompletedDiagnosis[] = [
    diagnosis("diagnosis-a", "TKT-2101", options),
    diagnosis("diagnosis-b", "TKT-2102", options),
  ];
  const tickets = [ticket("TKT-2101"), ticket("TKT-2102")];
  const candidates: KnowledgeCandidate[] = [];
  const approved: KnowledgeObject[] = [];
  const events: KnowledgeAuditEvent[] = [];
  const objects = {
    async listCandidates() { return candidates; },
    async getCandidate(id: string) {
      const candidate = candidates.find((item) => item.id === id);
      if (candidate === undefined) throw repositoryError("Knowledge candidate was not found.");
      return candidate;
    },
    async saveCandidate(candidate: KnowledgeCandidate) { candidates.push(candidate); },
    async removeCandidate(id: string) { const index = candidates.findIndex((item) => item.id === id); if (index >= 0) candidates.splice(index, 1); },
    async listApproved() { return approved; },
    async promote(candidateId: string, object: KnowledgeObject) { if (candidateId !== object.id) throw repositoryError("Knowledge object does not match candidate."); approved.push(object); return object; },
    async removeApproved(id: string) { const index = approved.findIndex((item) => item.id === id); if (index >= 0) approved.splice(index, 1); },
  };
  const service = new KnowledgeEvolutionService({
    tickets: {
      async snapshot() { return tickets; },
      async get(id: string) { const found = tickets.find((item) => item.id === id); if (found === undefined) throw repositoryError("Ticket was not found."); return found; },
    },
    knowledge: { async list() { return [{ id: "api-reference", title: "API reference", tags: ["api"], body: "Review API request evidence." }]; } },
    diagnoses: { async list() { return diagnoses; } },
    objects,
    audits: {
      async append(event: KnowledgeAuditEvent) { events.push(event); },
      async list(filters: { candidateId?: string; action?: string } = {}) { return events.filter((event) => (filters.candidateId === undefined || event.candidateId === filters.candidateId) && (filters.action === undefined || event.action === filters.action)); },
      async appendIfNoPriorAction(event: KnowledgeAuditEvent) { if (events.some((item) => item.candidateId === event.candidateId && item.action === event.action)) return false; events.push(event); return true; },
    },
    promotionAuthorizer: (actorId) => actorId === "support-lead",
    now: () => new Date("2026-07-29T12:00:00.000Z"),
    nextAuditId: (() => { let value = 0; return () => `audit-${++value}`; })(),
  });
  return { service: () => service, diagnoses, objects };
}

function diagnosis(id: string, ticketId: string, options: { noReferences?: boolean; legacyEvidence?: boolean }): CompletedDiagnosis {
  return {
    id,
    ticketId,
    problem: "Credential refresh requests return 401 after deployment credential rotation.",
    symptoms: ["Credential refresh requests return 401 after deployment credential rotation."],
    ...(options.legacyEvidence
      ? {
          evidenceUsed: ["Legacy request identifier supplied by the customer."],
          evidenceIds: ["legacy-synthetic-evidence"],
        }
      : options.noReferences
        ? { evidenceUsed: ["The customer supplied a request ID."] }
        : { evidenceReferences: [{ id: "request-id", labelAtDiagnosis: "API request ID", source: "ticket", sourceRef: ticketId }] }),
    ownerTeam: "api-platform",
    fixSteps: ["Refresh the deployment credential."],
    verificationSteps: ["Confirm a new request succeeds."],
    completedAt: "2026-07-29T10:00:00.000Z",
  };
}

function ticket(id: string): Ticket {
  return TicketSchema.parse({
    id,
    createdAt: "2026-07-29T09:00:00.000Z",
    updatedAt: "2026-07-29T09:00:00.000Z",
    customer: { name: "Example", plan: "starter", region: "eu", vip: false },
    subject: "Credential refresh requests return 401 after deployment credential rotation.",
    description: "Credential refresh requests return 401 after deployment credential rotation.",
    status: "triage",
    tags: ["credential-rotation"],
    sla: { responseDueAt: "2026-07-29T12:00:00.000Z", breached: false },
    revision: 0,
  });
}

function approvedKnownCause(id: string, triggerPattern: string): KnowledgeObject {
  return {
    id,
    kind: "known-cause",
    name: "Approved credential rotation guidance",
    summary: "A recurring credential rotation condition.",
    triggerPatterns: [triggerPattern],
    evidencePolicy: { mode: "none-required", rationale: "The operator approved this documented support path." },
    timeConstraints: ["Apply only when the trigger matches."],
    diagnosticSteps: ["Review the approved support path."],
    fixSteps: ["Refresh the deployment credential."],
    verificationSteps: ["Confirm the next request succeeds."],
    customerSafeExplanation: "We identified a recurring credential condition and are reviewing the safe correction.",
    operatorRationale: "Operator-approved rationale.",
    owner: "api-platform",
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
