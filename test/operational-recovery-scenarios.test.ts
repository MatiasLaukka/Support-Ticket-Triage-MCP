import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { latestAuthoritativeDiagnosis } from "../src/approval-desk/workflow-guidance.js";
import {
  buildTicketWorkflowReadModel,
  buildTicketWorkflowReadModelFromSnapshot,
} from "../src/approval-desk/workflow-read-model.js";
import { createRecoveryFixture, recoveryTicketId } from "./recovery-fixture.js";

const roots: string[] = [];
const runtimes: Array<{ close(): void }> = [];
let fixtureSequence = 1;

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("operational recovery scenarios", () => {
  it("records an ineffective fix without invalidating the approved diagnosis", async () => {
    const fixture = await setupFixture();
    const fix = fixture.seedFix({ fixEventId: uuid(1), commandId: uuid(2), occurredAt: "2026-08-21T09:02:00.000Z" });
    const input = ineffectiveInput(fixture, fix.id, "2026-08-21T09:03:00.000Z");

    const ineffective = await fixture.runtime.service.recordFixIneffective(input, { commandId: uuid(3) });

    expect(ineffective).toMatchObject({
      action: "fix-ineffective",
      before: { diagnosisId: fixture.diagnosis.id, fixEventId: fix.id },
      after: { outcome: "ineffective", diagnosisStillAuthoritative: true },
    });
    expect(latestAuthoritativeDiagnosis(recoveryTicketId, [fixture.diagnosis, fixture.review, fix, ineffective]))
      .toMatchObject({ diagnosisId: fixture.diagnosis.id });
    expect(await currentLifecycle(fixture)).toMatchObject({
      phase: "evaluation-needed",
      primaryAction: { kind: "evaluate-ticket", reasonCodes: ["fix-ineffective"] },
      diagnosis: { state: "approved", diagnosisId: fixture.diagnosis.id },
      fix: { state: "ineffective", diagnosisStillAuthoritative: true },
    });
    await expect(fixture.runtime.service.recordFixIneffective(
      { ...input, sourceTicketRevision: fixture.ticket.revision + 1 },
      { commandId: uuid(4) },
    )).rejects.toMatchObject({ code: "STALE_APPROVAL" });
  });

  it("requires a separate explicit invalidation after an ineffective fix", async () => {
    const fixture = await setupFixture();
    const fix = fixture.seedFix({ fixEventId: uuid(10), commandId: uuid(11), occurredAt: "2026-08-21T09:02:00.000Z" });
    const ineffective = await fixture.runtime.service.recordFixIneffective(
      ineffectiveInput(fixture, fix.id, "2026-08-21T09:03:00.000Z"),
      { commandId: uuid(12) },
    );

    const invalidated = await fixture.runtime.service.invalidateDiagnosis(
      invalidationInput(fixture, "fix-ineffective", "2026-08-21T09:04:00.000Z"),
      { commandId: uuid(13) },
    );

    expect(invalidated).toMatchObject({
      action: "diagnosis-invalidated",
      before: { diagnosisId: fixture.diagnosis.id },
      after: { diagnosisInvalidated: true, reasonCode: "fix-ineffective" },
    });
    expect(latestAuthoritativeDiagnosis(
      recoveryTicketId,
      [fixture.diagnosis, fixture.review, fix, ineffective, invalidated],
    )).toBeUndefined();
    expect(await currentLifecycle(fixture)).toMatchObject({
      phase: "evaluation-needed",
      primaryAction: { kind: "evaluate-ticket", reasonCodes: ["diagnosis-invalidated", "fix-ineffective"] },
      diagnosis: { state: "invalidated", diagnosisId: fixture.diagnosis.id },
      fix: { state: "ineffective", diagnosisStillAuthoritative: false },
    });
  });

  it("preserves multiple distinct ineffective fix attempts for one authoritative diagnosis", async () => {
    const fixture = await setupFixture();
    const firstFix = fixture.seedFix({
      fixEventId: uuid(20), commandId: uuid(21), occurredAt: "2026-08-21T09:02:00.000Z", summary: "The first mitigation is ready.",
    });
    const firstIneffective = await fixture.runtime.service.recordFixIneffective(
      ineffectiveInput(fixture, firstFix.id, "2026-08-21T09:03:00.000Z"),
      { commandId: uuid(22) },
    );
    const secondFix = fixture.seedFix({
      fixEventId: uuid(23), commandId: uuid(24), occurredAt: "2026-08-21T09:04:00.000Z", summary: "A second distinct mitigation is ready.",
    });

    const secondIneffective = await fixture.runtime.service.recordFixIneffective(
      ineffectiveInput(fixture, secondFix.id, "2026-08-21T09:05:00.000Z"),
      { commandId: uuid(25) },
    );

    expect([firstIneffective.before.fixEventId, secondIneffective.before.fixEventId]).toEqual([firstFix.id, secondFix.id]);
    expect(fixture.runtime.operationalStore!.readWorkflowSnapshot(recoveryTicketId)
      .events.filter(({ action }) => action === "fix-ineffective")).toHaveLength(2);
    expect(latestAuthoritativeDiagnosis(recoveryTicketId, [
      fixture.diagnosis,
      fixture.review,
      firstFix,
      firstIneffective,
      secondFix,
      secondIneffective,
    ]))
      .toMatchObject({ diagnosisId: fixture.diagnosis.id });
  });

  it("allows a new diagnosis to be recorded after explicit invalidation", async () => {
    const fixture = await setupFixture();
    await fixture.runtime.service.invalidateDiagnosis(
      invalidationInput(fixture, "superseded-diagnosis", "2026-08-21T09:02:00.000Z"),
      { commandId: uuid(30) },
    );

    const replacement = await recordReplacementDiagnosis(fixture, uuid(31), "2026-08-21T09:03:00.000Z");

    expect(replacement).toMatchObject({ action: "diagnosis-completed" });
    expect(replacement.id).not.toBe(fixture.diagnosis.id);
    expect(await currentLifecycle(fixture)).toMatchObject({
      phase: "diagnosis-review",
      primaryAction: { kind: "review-diagnosis" },
      diagnosis: { state: "recorded", diagnosisId: replacement.id },
    });
    expect((await fixture.runtime.audits.list(recoveryTicketId)).map(({ action }) => action)).toEqual([
      "diagnosis-completed", "diagnosis-reviewed", "diagnosis-invalidated", "diagnosis-completed",
    ]);
  });

  it("keeps contradictory-evidence invalidation and later diagnosis rejection non-authoritative", async () => {
    const fixture = await setupFixture();
    const invalidated = await fixture.runtime.service.invalidateDiagnosis(
      invalidationInput(fixture, "contradictory-evidence", "2026-08-21T09:02:00.000Z"),
      { commandId: uuid(40) },
    );
    const replacement = await recordReplacementDiagnosis(fixture, uuid(41), "2026-08-21T09:03:00.000Z");
    const rejected = await fixture.runtime.service.reviewDiagnosis({
      decision: "reject",
      diagnosisId: replacement.id,
      ticketId: recoveryTicketId,
      sourceTicketRevision: fixture.ticket.revision,
      sourceConversationWatermark: fixture.watermark,
      editedDiagnosis: replacement.after.diagnosis as never,
      actor: "reviewer",
      rationale: "The configuration evidence does not distinguish the proposed cause.",
      reviewedAt: "2026-08-21T09:04:00.000Z",
    }, { commandId: uuid(42) });
    const audits = await fixture.runtime.audits.list(recoveryTicketId);

    expect(invalidated.after.reasonCode).toBe("contradictory-evidence");
    expect(rejected.after.diagnosisReview).toMatchObject({ decision: "reject" });
    expect(latestAuthoritativeDiagnosis(recoveryTicketId, audits)).toBeUndefined();
  });

  it("preserves the exact original diagnosis and review audit history after recovery", async () => {
    const fixture = await setupFixture();
    const originalDiagnosis = structuredClone(fixture.diagnosis);
    const originalReview = structuredClone(fixture.review);
    const fix = fixture.seedFix({ fixEventId: uuid(50), commandId: uuid(51), occurredAt: "2026-08-21T09:02:00.000Z" });
    const ineffectiveValue = ineffectiveInput(fixture, fix.id, "2026-08-21T09:03:00.000Z");
    const ineffectiveCommandId = uuid(52);
    const ineffective = await fixture.runtime.service.recordFixIneffective(ineffectiveValue, { commandId: ineffectiveCommandId });
    const replay = await fixture.runtime.service.recordFixIneffective(ineffectiveValue, { commandId: ineffectiveCommandId });
    const invalidationValue = invalidationInput(fixture, "contradictory-evidence", "2026-08-21T09:04:00.000Z");
    const invalidationCommandId = uuid(53);
    const invalidated = await fixture.runtime.service.invalidateDiagnosis(invalidationValue, { commandId: invalidationCommandId });
    const invalidationReplay = await fixture.runtime.service.invalidateDiagnosis(invalidationValue, { commandId: invalidationCommandId });
    const audits = await fixture.runtime.audits.list(recoveryTicketId);

    expect(replay).toEqual(ineffective);
    expect(invalidationReplay).toEqual(invalidated);
    const snapshot = fixture.runtime.operationalStore!.readWorkflowSnapshot(recoveryTicketId);
    expect(snapshot.diagnoses.find(({ operationalEventId }) => operationalEventId === originalDiagnosis.id)?.originalAudit)
      .toEqual(originalDiagnosis);
    expect(audits.find(({ id }) => id === originalReview.id)).toEqual(originalReview);
    expect(await fixture.runtime.operationalDiagnoses!.list(recoveryTicketId)).toHaveLength(1);
    expect(audits.map(({ action }) => action)).toEqual([
      "diagnosis-completed", "diagnosis-reviewed", "fix-available", "fix-ineffective", "diagnosis-invalidated",
    ]);
    expect(snapshot.events.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4, 5]);
  });
});

async function setupFixture() {
  const fixture = await createRecoveryFixture();
  roots.push(fixture.root);
  runtimes.push(fixture.runtime);
  return fixture;
}

function ineffectiveInput(fixture: Awaited<ReturnType<typeof createRecoveryFixture>>, fixEventId: string, ineffectiveAt: string) {
  return {
    ticketId: recoveryTicketId,
    diagnosisId: fixture.diagnosis.id,
    fixEventId,
    sourceTicketRevision: fixture.ticket.revision,
    sourceConversationWatermark: fixture.watermark,
    actor: "reviewer",
    rationale: "The mitigation did not change the affected timeline.",
    verificationEvidence: ["customer-confirmed-not-fixed"],
    ineffectiveAt,
  };
}

function invalidationInput(
  fixture: Awaited<ReturnType<typeof createRecoveryFixture>>,
  reasonCode: "contradictory-evidence" | "superseded-diagnosis" | "fix-ineffective",
  invalidatedAt: string,
) {
  return {
    ticketId: recoveryTicketId,
    diagnosisId: fixture.diagnosis.id,
    sourceTicketRevision: fixture.ticket.revision,
    sourceConversationWatermark: fixture.watermark,
    actor: "reviewer",
    reasonCode,
    rationale: "The diagnosis is no longer authoritative for this ticket.",
    invalidatedAt,
  };
}

async function recordReplacementDiagnosis(
  fixture: Awaited<ReturnType<typeof createRecoveryFixture>>,
  commandId: string,
  diagnosedAt: string,
) {
  return fixture.runtime.service.recordDiagnosis({
    ticketId: recoveryTicketId,
    actor: "specialist",
    diagnosedAt,
    diagnosis: {
      status: "completed",
      causeType: "configuration",
      customerSafeSummary: "A replacement configuration hypothesis needs review.",
      evidenceUsed: ["configuration diff"],
      confidence: "confirmed",
      owner: "engineering",
      recommendedNextAction: "Review the replacement diagnosis.",
      doNotSay: ["Do not expose internal configuration values."],
    },
    knowledgeArticleIds: [],
  }, { commandId });
}

async function currentLifecycle(fixture: Awaited<ReturnType<typeof createRecoveryFixture>>) {
  const [ticket, audits, recommendations] = await Promise.all([
    fixture.runtime.tickets.get(recoveryTicketId),
    fixture.runtime.audits.list(recoveryTicketId),
    fixture.runtime.recommendations.list(),
  ]);
  const repositoryLifecycle = buildTicketWorkflowReadModel({ ticket, audits, recommendations }).lifecycle;
  const snapshotLifecycle = buildTicketWorkflowReadModelFromSnapshot(
    fixture.runtime.operationalStore!.readWorkflowSnapshot(recoveryTicketId),
    audits,
  ).lifecycle;
  expect(snapshotLifecycle).toEqual(repositoryLifecycle);
  return repositoryLifecycle;
}

function uuid(value: number): string {
  fixtureSequence += 1;
  return `90000000-0000-4000-8000-${String(value * 100 + fixtureSequence).padStart(12, "0")}`;
}
