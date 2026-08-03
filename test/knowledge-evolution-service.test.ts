import { describe, expect, it } from "vitest";
import type { Ticket } from "../src/domain.js";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";
import type { CandidateDraftProvider } from "../src/knowledge-evolution/candidate-draft-provider.js";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";
import type { CompletedDiagnosis, KnowledgeCandidate, KnowledgeObject } from "../src/knowledge-evolution/domain.js";

describe("knowledge evolution service", () => {
  it("loads a legacy diagnosis without turning its synthetic evidence ID into reusable policy", async () => {
    const fixture = createFixture({ legacyEvidence: true });

    const result = await fixture.service().discover({ includeGpt: false, actorId: "support-lead" });

    expect(result.candidates).toHaveLength(1);
    await expect(fixture.service().getCandidate("known-cause-diagnosis-001")).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
  });

  it("discovers and persists deterministic candidates without invoking GPT", async () => {
    const fixture = createFixture();
    const service = fixture.service({ enabled: false, draft: async () => { throw new Error("must not run"); } });

    const result = await service.discover({ includeGpt: false, actorId: "support-lead" });

    expect(result.candidates).toHaveLength(1);
    await expect(service.getCandidate("known-cause-diagnosis-001")).resolves.toMatchObject({
      validationStatus: "valid",
      deterministicScores: { confidence: 0.4, support: 1 },
    });
  });

  it("uses an explicitly requested validated GPT draft and never persists an invalid draft", async () => {
    const fixture = createFixture();
    let invoked = 0;
    const service = fixture.service({
      enabled: true,
      draft: async () => {
        invoked += 1;
        return { outputText: JSON.stringify(gptDraft()), provenance: { provider: "openai", model: "controlled-local-simulation", rationale: "Validated advisory draft." } };
      },
    });

    await service.discover({ includeGpt: true, actorId: "support-lead" });

    expect(invoked).toBe(1);
    await expect(service.getCandidate("known-cause-gpt-diagnosis-001")).resolves.toMatchObject({
      name: "Recurring credential rotation pattern",
      gptProvenance: { provider: "openai" },
    });

    const invalid = createFixture();
    await invalid.service({ enabled: true, draft: async () => ({ outputText: "not-json" }) })
      .discover({ includeGpt: true, actorId: "support-lead" });
    await expect(invalid.service().getCandidate("known-cause-gpt-diagnosis-001")).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
  });

  it("approves an explicitly reviewed version one object while preserving its candidate", async () => {
    const fixture = createFixture();
    const service = fixture.service();
    await service.discover({ includeGpt: false, actorId: "support-lead" });

    const approved = await service.approve({
      candidateId: "known-cause-diagnosis-001",
      actorId: "support-lead",
      expectedVersion: 1,
      edits: { summary: "A rotated credential can remain active in a deployed service." },
    });

    expect(approved).toMatchObject({ status: "approved", version: 1, approval: { approvedBy: "support-lead" } });
    await expect(service.getCandidate("known-cause-diagnosis-001")).resolves.toMatchObject({ status: "candidate", version: 1 });
    await expect(fixture.objects.listApproved()).resolves.toEqual([approved]);
    await expect(fixture.audits.list({ action: "approved" })).resolves.toMatchObject([{
      supportIds: ["diagnosis-001", "TKT-1001"],
      reviewedFields: ["summary"],
      provenanceSummary: "completed-diagnoses",
    }]);
  });

  it("rejects unsupported edits, blank actors, stale versions, and duplicate promotions", async () => {
    const fixture = createFixture();
    const service = fixture.service();
    await service.discover({ includeGpt: false, actorId: "support-lead" });
    const input = { candidateId: "known-cause-diagnosis-001", actorId: "support-lead", expectedVersion: 1 };

    await expect(service.approve({ ...input, edits: { status: "approved" } as never })).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });
    await expect(service.approve({ ...input, actorId: "  " })).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });
    await expect(service.approve({ ...input, expectedVersion: 2 })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    await service.approve(input);
    await expect(service.approve(input)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
  });

  it("removes a promoted object when its mandatory approval audit cannot be appended, allowing a retry", async () => {
    const fixture = createFixture({ failApprovedAuditOnce: true });
    const service = fixture.service();
    const input = { candidateId: "known-cause-diagnosis-001", actorId: "support-lead", expectedVersion: 1 };
    await service.discover({ includeGpt: false, actorId: "support-lead" });

    await expect(service.approve(input)).rejects.toThrow("simulated approval audit failure");
    await expect(fixture.objects.listApproved()).resolves.toEqual([]);

    await expect(service.approve(input)).resolves.toMatchObject({ status: "approved", version: 1 });
    await expect(fixture.audits.list({ action: "approved" })).resolves.toHaveLength(1);
  });

  it("removes a newly persisted candidate when its creation audit fails, allowing discovery to retry", async () => {
    const fixture = createFixture({ failCandidateCreatedAuditOnce: true });
    const service = fixture.service();

    await expect(service.discover({ includeGpt: false, actorId: "support-lead" }))
      .rejects.toThrow("simulated candidate-created audit failure");
    expect(fixture.candidates).toEqual([]);

    await expect(service.discover({ includeGpt: false, actorId: "support-lead" }))
      .resolves.toMatchObject({ candidates: [{ id: "diagnosis-001" }] });
    await expect(fixture.audits.list({ action: "candidate-created" })).resolves.toHaveLength(1);
  });

  it("audits a repeated deterministic candidate ID instead of silently skipping it", async () => {
    const fixture = createFixture();
    const service = fixture.service();
    await service.discover({ includeGpt: false, actorId: "support-lead" });

    await service.discover({ includeGpt: false, actorId: "support-lead" });

    await expect(fixture.audits.list({ action: "candidate-rediscovered" })).resolves.toHaveLength(1);
  });

  it("keeps the matching global diagnosis component in ticket-scoped discovery and excludes unrelated components", async () => {
    const fixture = createFixture({ ticketScopedComponents: true });
    const service = fixture.service();

    const result = await service.discover({
      ticketId: "TKT-1002",
      includeGpt: false,
      actorId: "support-lead",
    });

    expect(result.candidates.map(({ id }) => id)).toEqual(["diagnosis-001"]);
    await expect(service.getCandidate("known-cause-diagnosis-001")).resolves.toMatchObject({
      supportingDiagnosisIds: ["diagnosis-001"],
      supportingTicketIds: expect.arrayContaining(["TKT-1001", "TKT-1002"]),
    });
    await expect(service.getCandidate("known-cause-diagnosis-002")).rejects.toMatchObject({
      code: "REPOSITORY_ERROR",
    });
  });

  it("uses review history to reject a duplicate rejection action", async () => {
    const fixture = createFixture();
    const service = fixture.service();
    const input = { candidateId: "known-cause-diagnosis-001", actorId: "support-lead", reason: "Needs more corroboration.", expectedVersion: 1 };
    await service.discover({ includeGpt: false, actorId: "support-lead" });

    await service.reject(input);
    await expect(service.reject(input)).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    await expect(fixture.audits.list({ action: "rejected" })).resolves.toHaveLength(1);
  });

  it("requires an authorized valid candidate that has not received a terminal review", async () => {
    const fixture = createFixture();
    const service = fixture.service();
    await service.discover({ includeGpt: false, actorId: "support-lead" });
    const input = { candidateId: "known-cause-diagnosis-001", actorId: "support-lead", expectedVersion: 1 };

    await expect(service.approve({ ...input, actorId: "unapproved-actor" })).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });
    await service.reject({ ...input, reason: "Requires a different workflow." });
    await expect(service.approve(input)).rejects.toMatchObject({ code: "STALE_APPROVAL" });

    const invalid = createFixture();
    const invalidService = invalid.service();
    await invalidService.discover({ includeGpt: false, actorId: "support-lead" });
    invalid.candidates[0] = { ...invalid.candidates[0]!, validationStatus: "invalid" };
    await expect(invalidService.approve(input)).rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });
  });

  it("atomically records only one concurrent rejection", async () => {
    const fixture = createFixture({ synchronizeReviewHistory: true });
    const service = fixture.service();
    const input = { candidateId: "known-cause-diagnosis-001", actorId: "support-lead", reason: "Needs more corroboration.", expectedVersion: 1 };
    await service.discover({ includeGpt: false, actorId: "support-lead" });

    const results = await Promise.allSettled([service.reject(input), service.reject(input)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(fixture.audits.list({ action: "rejected" })).resolves.toHaveLength(1);
  });

  it("serializes competing approval and rejection so only one terminal outcome persists", async () => {
    const promotionStarted = deferred();
    const releasePromotion = deferred();
    const fixture = createFixture({
      beforePromote: async () => {
        promotionStarted.resolve();
        await releasePromotion.promise;
      },
    });
    const approvalService = fixture.service();
    const rejectionService = fixture.service();
    const input = { candidateId: "known-cause-diagnosis-001", actorId: "support-lead", expectedVersion: 1 };
    await approvalService.discover({ includeGpt: false, actorId: "support-lead" });

    const approval = approvalService.approve(input);
    await promotionStarted.promise;
    const rejection = rejectionService.reject({ ...input, reason: "A competing reviewer rejected this candidate." });
    const rejectionState = await Promise.race([
      rejection.then(() => "completed", () => "completed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 25)),
    ]);
    releasePromotion.resolve();

    expect(rejectionState).toBe("waiting");
    await expect(approval).resolves.toMatchObject({ status: "approved" });
    await expect(rejection).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    const terminalActions = (await fixture.audits.list({ candidateId: input.candidateId }))
      .filter((event) => ["approved", "rejected", "deferred"].includes(event.action))
      .map((event) => event.action);
    expect(terminalActions).toEqual(["approved"]);
  });

  it("rejects a candidate whose supporting diagnosis ticket is not among its supporting tickets", async () => {
    const fixture = createFixture();
    const service = fixture.service();
    await service.discover({ includeGpt: false, actorId: "support-lead" });
    fixture.candidates[0] = { ...fixture.candidates[0]!, supportingTicketIds: ["TKT-1002"] };

    await expect(service.approve({ candidateId: "known-cause-diagnosis-001", actorId: "support-lead", expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "INVALID_APPROVAL_FIELDS" });
  });

  it("records one terminal rejection without changing candidate lifecycle or recommendations", async () => {
    const fixture = createFixture();
    const service = fixture.service();
    await service.discover({ includeGpt: false, actorId: "support-lead" });
    const candidateId = "known-cause-diagnosis-001";
    const lifecycleBefore = fixture.ticket.lifecycle;

    await service.reject({ candidateId, actorId: "support-lead", reason: "Needs more corroboration.", expectedVersion: 1 });
    await expect(service.defer({ candidateId, actorId: "support-lead", expectedVersion: 1 })).rejects.toMatchObject({ code: "STALE_APPROVAL" });

    await expect(service.getCandidate(candidateId)).resolves.toMatchObject({ status: "candidate" });
    await expect(fixture.audits.list()).resolves.toMatchObject([
      { action: "candidate-created" },
      { action: "rejected", rejectionReason: "Needs more corroboration." },
    ]);
    expect(fixture.ticket.lifecycle).toBe(lifecycleBefore);
  });
});

function createFixture(options: {
  failApprovedAuditOnce?: boolean;
  failCandidateCreatedAuditOnce?: boolean;
  synchronizeReviewHistory?: boolean;
  ticketScopedComponents?: boolean;
  legacyEvidence?: boolean;
  beforePromote?: () => Promise<void>;
} = {}) {
  const diagnosis: CompletedDiagnosis = {
    id: "diagnosis-001", ticketId: "TKT-1001", problem: "API requests fail after rotating a credential.",
    symptoms: ["Requests return 401 after rotation."],
    ...(options.legacyEvidence
      ? { evidenceIds: ["legacy-synthetic-evidence"] }
      : { evidenceReferences: [{ id: "request-id", labelAtDiagnosis: "API request ID", source: "ticket", sourceRef: "TKT-1001" }] }),
    ownerTeam: "api-platform",
    fixSteps: ["Refresh the service credential in the deployment configuration."],
    verificationSteps: ["Confirm a new request succeeds with the refreshed credential."], completedAt: "2026-07-29T10:00:00.000Z",
  };
  const ticket = { ...ticketRecord(), lifecycle: "unchanged" };
  const otherTicket = {
    ...ticketRecord(),
    id: "TKT-1002",
    subject: options.ticketScopedComponents ? "API credential rotation fails" : "Billing export question",
    description: options.ticketScopedComponents
      ? "Requests return 401 after a credential rotation."
      : "A customer needs help locating a billing export.",
    tags: options.ticketScopedComponents ? ["credential-rotation"] : ["billing"],
    lifecycle: "unchanged",
  };
  const unrelatedTicket = {
    ...ticketRecord(),
    id: "TKT-1003",
    subject: "Billing invoice export is unavailable",
    description: "The billing invoice export link is missing.",
    tags: ["billing"],
    lifecycle: "unchanged",
  };
  const diagnoses = [
    diagnosis,
    ...(options.ticketScopedComponents
      ? [{
        ...diagnosis,
        id: "diagnosis-002",
        ticketId: "TKT-1003",
        problem: "The billing invoice export link is missing.",
        symptoms: ["Billing invoice export is unavailable."],
        evidenceReferences: [{ id: "invoice-number", labelAtDiagnosis: "Invoice number", source: "ticket" as const, sourceRef: "TKT-1003" }],
        ownerTeam: "billing" as const,
      }]
      : []),
  ];
  const tickets = [ticket, otherTicket, ...(options.ticketScopedComponents ? [unrelatedTicket] : [])];
  const candidates: KnowledgeCandidate[] = [];
  const approved: KnowledgeObject[] = [];
  const events: KnowledgeAuditEvent[] = [];
  const objects = {
    async listCandidates() { return candidates; },
    async getCandidate(id: string) { const candidate = candidates.find((item) => item.id === id); if (!candidate) throw repositoryError("Knowledge candidate was not found."); return candidate; },
    async saveCandidate(candidate: KnowledgeCandidate) { if (candidates.some((item) => item.id === candidate.id)) throw repositoryError("Duplicate candidate."); candidates.push(candidate); },
    async removeCandidate(candidateId: string) { const index = candidates.findIndex((item) => item.id === candidateId); if (index < 0) throw repositoryError("Candidate was not found."); candidates.splice(index, 1); },
    async listApproved() { return approved; },
    async promote(candidateId: string, object: KnowledgeObject) { if (candidateId !== object.id || approved.some((item) => item.id === object.id)) throw repositoryError("Duplicate promotion."); await options.beforePromote?.(); approved.push(object); return object; },
    async removeApproved(candidateId: string) { const index = approved.findIndex((item) => item.id === candidateId); if (index < 0) throw repositoryError("Approved object was not found."); approved.splice(index, 1); },
  };
  let remainingAuditFailures = options.failApprovedAuditOnce ? 1 : 0;
  let remainingCandidateAuditFailures = options.failCandidateCreatedAuditOnce ? 1 : 0;
  let reviewReaders = 0;
  let releaseReviewReaders: () => void = () => undefined;
  const reviewReadersReady = new Promise<void>((resolve) => { releaseReviewReaders = resolve; });
  const audits = {
    async append(event: KnowledgeAuditEvent) {
      if (event.action === "candidate-created" && remainingCandidateAuditFailures > 0) {
        remainingCandidateAuditFailures -= 1;
        throw new Error("simulated candidate-created audit failure");
      }
      if (event.action === "approved" && remainingAuditFailures > 0) {
        remainingAuditFailures -= 1;
        throw new Error("simulated approval audit failure");
      }
      events.push(event);
    },
    async list(filters: { action?: string; candidateId?: string } = {}) {
      const matches = events.filter((event) => (filters.action === undefined || event.action === filters.action) && (filters.candidateId === undefined || event.candidateId === filters.candidateId));
      if (options.synchronizeReviewHistory && filters.candidateId !== undefined && filters.action === "rejected") {
        reviewReaders += 1;
        if (reviewReaders === 2) releaseReviewReaders();
        await reviewReadersReady;
      }
      return matches;
    },
    async appendIfNoPriorAction(event: KnowledgeAuditEvent) {
      if (events.some((existing) => existing.candidateId === event.candidateId && existing.action === event.action)) return false;
      await this.append(event);
      return true;
    },
  };
  return {
    ticket,
    candidates,
    objects,
    audits,
    service: (draftProvider?: CandidateDraftProvider) => new KnowledgeEvolutionService({
      tickets: {
        async snapshot() { return tickets as unknown as Ticket[]; },
        async get(id: string) {
          const found = tickets.find((item) => item.id === id);
          if (found === undefined) throw repositoryError("Ticket was not found.");
          return found as unknown as Ticket;
        },
      },
      knowledge: { async list() { return [{ id: "credential-rotation", title: "Credential rotation", tags: ["api"], body: "Rotate credentials safely." }]; } },
      diagnoses: { async list() { return diagnoses; } },
      objects,
      audits,
      draftProvider,
      promotionAuthorizer: (actorId) => actorId === "support-lead",
      now: () => new Date("2026-07-29T12:00:00.000Z"),
      nextAuditId: (() => { let value = 0; return () => `audit-${++value}`; })(),
    }),
  };
}

function ticketRecord() {
  return {
    id: "TKT-1001", revision: 0, subject: "API credential rotation fails", description: "Requests return 401 after a credential rotation.",
    status: "in-progress", category: "api", priority: "high", team: "api-platform", tags: ["credential-rotation"],
  };
}

function gptDraft() {
  return {
    kind: "known-cause", name: "Recurring credential rotation pattern", summary: "A deployed service can retain a credential after rotation.",
    triggerPatterns: ["Requests return 401 after a credential rotation."], evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
    knowledgeArticleIds: ["credential-rotation"], timeConstraints: ["Apply only after a credential rotation."],
    diagnosticSteps: ["Compare the deployment credential with the active credential."], fixSteps: ["Refresh the deployment credential."], verificationSteps: ["Confirm a new request succeeds."],
    customerSafeExplanation: "We found a configuration mismatch and are refreshing it.", operatorRationale: "Completed diagnosis support indicates a recurring pattern.",
    confidence: 0.9, rationale: "The completed diagnosis identifies the same evidence-backed condition.", supportingDiagnosisIds: ["diagnosis-001"], supportingTicketIds: ["TKT-1001"], contradictions: [],
  };
}

function repositoryError(message: string) {
  return Object.assign(new Error(message), { code: "REPOSITORY_ERROR" });
}

function deferred() {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
