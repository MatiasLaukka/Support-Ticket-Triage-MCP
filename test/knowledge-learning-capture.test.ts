import { describe, expect, it } from "vitest";
import { AuditEventSchema, type AuditEvent } from "../src/domain.js";
import { LearningLedgerError, type LearningEvent, type LearningLedger } from "../src/knowledge-evolution/learning-ledger.js";
import { LearningCaptureService } from "../src/knowledge-evolution/learning-capture.js";
import { TriageService } from "../src/triage-service.js";

const diagnosis = AuditEventSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  timestamp: "2026-08-07T10:00:00.000Z",
  actor: "support-lead",
  action: "diagnosis-completed",
  ticketId: "TKT-1001",
  before: {},
  after: { diagnosis: { evidenceReferences: [{ id: "request-id" }] } },
  rationale: "Diagnosis completed from trusted support context.",
  knowledgeArticleIds: ["event-tracking-debugging"],
  result: "success",
});

const review = AuditEventSchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  timestamp: "2026-08-07T10:01:00.000Z",
  actor: "support-lead",
  action: "diagnosis-reviewed",
  ticketId: "TKT-1001",
  before: { diagnosisId: diagnosis.id },
  after: { diagnosisReview: { decision: "approve" } },
  rationale: "Diagnosis approved by the operator.",
  knowledgeArticleIds: ["event-tracking-debugging"],
  result: "success",
});

const fix = AuditEventSchema.parse({
  id: "33333333-3333-4333-8333-333333333333",
  timestamp: "2026-08-07T10:02:00.000Z",
  actor: "support-lead",
  action: "fix-available",
  ticketId: "TKT-1001",
  before: { diagnosisId: diagnosis.id },
  after: { diagnosisId: diagnosis.id },
  rationale: "Fix or mitigation is available for customer verification.",
  knowledgeArticleIds: ["event-tracking-debugging"],
  result: "success",
});

const close = AuditEventSchema.parse({
  id: "44444444-4444-4444-8444-444444444444",
  timestamp: "2026-08-07T10:03:00.000Z",
  actor: "support-lead",
  action: "ticket-updated",
  ticketId: "TKT-1001",
  before: { status: "ready-for-close" },
  after: { status: "resolved" },
  rationale: "Ticket closed after the customer confirmed resolution and the closing response was sent.",
  knowledgeArticleIds: ["event-tracking-debugging"],
  result: "success",
});

const escalated = AuditEventSchema.parse({
  ...diagnosis,
  id: "55555555-5555-4555-8555-555555555555",
  action: "diagnostic-escalated",
});

class RecordingLedger implements LearningLedger {
  readonly events: LearningEvent[] = [];
  async initialize(): Promise<void> {}
  async append(event: LearningEvent): Promise<void> {
    if (!this.events.some((prior) => prior.id === event.id)) this.events.push(event);
  }
  async appendBatch(events: readonly LearningEvent[]): Promise<void> { for (const event of events) await this.append(event); }
  async list(): Promise<LearningEvent[]> { return this.events.map((event) => JSON.parse(JSON.stringify(event)) as LearningEvent); }
  async has(id: string): Promise<boolean> { return this.events.some((event) => event.id === id); }
}

describe("LearningCaptureService", () => {
  it("captures diagnosis, approval, fix, and customer-confirmed outcome without raw audit content", async () => {
    const ledger = new RecordingLedger();
    const service = new LearningCaptureService(ledger);
    await service.recordAuditOutcome(diagnosis);
    await service.recordAuditOutcome(review, { diagnosisId: diagnosis.id, evidenceIds: ["request-id"] });
    await service.recordAuditOutcome(fix, { diagnosisId: diagnosis.id, evidenceIds: ["request-id"] });
    await service.recordAuditOutcome(close, { diagnosisId: diagnosis.id, evidenceIds: ["request-id"], verificationType: "customer-confirmed" });

    await expect(ledger.list()).resolves.toMatchObject([
      { id: diagnosis.id, eventType: "diagnosis-recorded", diagnosisId: diagnosis.id },
      { id: review.id, eventType: "diagnosis-approved", diagnosisId: diagnosis.id },
      { id: fix.id, eventType: "fix-available", diagnosisId: diagnosis.id },
      { id: close.id, eventType: "outcome-verified", diagnosisId: diagnosis.id, payload: { verificationType: "customer-confirmed" } },
    ]);
    expect(JSON.stringify(await ledger.list())).not.toMatch(/diagnosisReview|trusted support context/);
  });

  it("supports technically verified outcomes and excludes escalated diagnoses from verification", async () => {
    const ledger = new RecordingLedger();
    const service = new LearningCaptureService(ledger);
    await service.recordAuditOutcome(escalated);
    await service.recordAuditOutcome(close, { diagnosisId: escalated.id, verificationType: "technically-verified" });

    await expect(ledger.list()).resolves.toMatchObject([
      { eventType: "diagnosis-recorded" },
      { eventType: "outcome-verified", payload: { verificationType: "technically-verified" } },
    ]);
  });

  it("remains idempotent when an operational audit is delivered twice", async () => {
    const ledger = new RecordingLedger();
    const service = new LearningCaptureService(ledger);
    await service.recordAuditOutcome(diagnosis);
    await service.recordAuditOutcome(diagnosis);
    await expect(ledger.list()).resolves.toHaveLength(1);
  });

  it("surfaces ledger failures for the operational service to isolate", async () => {
    const failing: LearningLedger = {
      initialize: async () => undefined,
      append: async () => { throw new LearningLedgerError("offline", "PERSISTENCE_ERROR"); },
      appendBatch: async () => undefined,
      list: async () => [],
      has: async () => false,
    };
    await expect(new LearningCaptureService(failing).recordAuditOutcome(diagnosis)).rejects.toMatchObject({ code: "PERSISTENCE_ERROR" });
  });

  it("keeps a successful diagnosis operationally committed when learning capture is unavailable", async () => {
    const audits: AuditEvent[] = [];
    const unavailable: LearningLedger = {
      initialize: async () => undefined,
      append: async () => { throw new LearningLedgerError("offline", "PERSISTENCE_ERROR"); },
      appendBatch: async () => undefined,
      list: async () => [],
      has: async () => false,
    };
    const service = new TriageService({
      tickets: {
        async get() { return { id: "TKT-1001", revision: 0, status: "in-progress", updatedAt: "2026-08-07T10:00:00.000Z" } as never; },
        async update() { throw new Error("not used"); },
        async updateWithCommit() { throw new Error("not used"); },
      },
      recommendations: { async list() { return []; }, async create() {}, async get() { throw new Error("not used"); }, async deletePending() {}, async transitionResolution() {}, async markResolved() {} },
      audit: {
        async append(event: AuditEvent) { audits.push(event); },
        async appendBatch(events: readonly AuditEvent[]) { audits.push(...events); },
        async list() { return audits; },
      },
      diagnoses: { async save() {}, async remove() {} },
      learningCapture: new LearningCaptureService(unavailable),
      now: () => new Date("2026-08-07T10:00:00.000Z"),
      uuid: (() => { let index = 0; return () => `${String(++index).padStart(8, "0")}-1111-4111-8111-111111111111`; })(),
    });

    await expect(service.recordDiagnosis({
      ticketId: "TKT-1001",
      actor: "support-lead",
      diagnosedAt: "2026-08-07T10:00:00.000Z",
      diagnosis: {
        status: "completed",
        causeType: "configuration",
        customerSafeSummary: "The deployment retained an older configuration.",
        evidenceUsed: ["Request ID"],
        evidenceReferences: [{ id: "request-id", labelAtDiagnosis: "Request ID", source: "ticket" }],
        confidence: "confirmed",
        owner: "engineering",
        recommendedNextAction: "Apply the governed configuration correction.",
        doNotSay: [],
      },
      knowledgeArticleIds: ["event-tracking-debugging"],
    })).resolves.toMatchObject({ action: "diagnosis-completed", result: "success" });
    expect(audits.map((event) => event.action)).toEqual(["diagnosis-completed", "learning-capture-failed"]);
    expect(audits[1]).toMatchObject({ result: "rejected", rejectionReason: "Learning ledger capture failed." });
  });
});
