import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteLearningLedger } from "../src/knowledge-evolution/sqlite-learning-ledger.js";
import { SqliteKnowledgeEvolutionStore } from "../src/knowledge-evolution/sqlite-knowledge-evolution-store.js";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";
import type { KnowledgeCandidate, KnowledgeObject } from "../src/knowledge-evolution/domain.js";
import type { LearningEvent } from "../src/knowledge-evolution/learning-ledger.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const candidate: KnowledgeCandidate = {
  id: "known-cause-api-credential-rotation", kind: "known-cause", name: "Stale API credential after rotation",
  summary: "A deployed service can retain a credential that was rotated.", triggerPatterns: ["Requests began returning 401 after credential rotation."],
  evidencePolicy: { mode: "required", evidenceIds: ["request-id"] }, timeConstraints: ["Applies only after credential rotation."],
  diagnosticSteps: ["Compare the deployment credential version with the active version."], fixSteps: ["Refresh the service credential in the deployment secret store."],
  verificationSteps: ["Confirm a new request succeeds with the refreshed credential."], customerSafeExplanation: "We found a configuration mismatch and are refreshing it.",
  operatorRationale: "The completed diagnosis ties the 401 errors to a stale deployment credential.", owner: "api-platform", version: 1,
  status: "candidate", supportingDiagnosisIds: ["diagnosis-001"], supportingTicketIds: ["TKT-1001"],
  provenance: { source: "completed-diagnoses", recordedAt: "2026-08-07T10:00:00.000Z" }, deterministicScores: { confidence: 0.9, support: 1 },
  deterministicReasons: ["Completed diagnosis support is available."], contradictions: [], validationStatus: "valid",
  evidencePolicyMetadata: { derivedEvidenceIds: ["request-id"], operatorAddedEvidenceIds: [] },
  objectId: "known-cause-api-credential-rotation",
  sourceVersion: 1,
};
const approved: KnowledgeObject = {
  id: candidate.id, kind: candidate.kind, name: candidate.name, summary: candidate.summary, triggerPatterns: candidate.triggerPatterns,
  evidencePolicy: candidate.evidencePolicy as { mode: "required"; evidenceIds: string[] }, timeConstraints: candidate.timeConstraints, diagnosticSteps: candidate.diagnosticSteps,
  fixSteps: candidate.fixSteps, verificationSteps: candidate.verificationSteps, customerSafeExplanation: candidate.customerSafeExplanation,
  operatorRationale: candidate.operatorRationale, owner: candidate.owner, version: 1, status: "approved",
  supportingDiagnosisIds: candidate.supportingDiagnosisIds, supportingTicketIds: candidate.supportingTicketIds, provenance: candidate.provenance,
  approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T10:05:00.000Z" },
  learningGovernance: "ledger",
};
const audit: KnowledgeAuditEvent = {
  id: "audit-promotion-001", objectId: candidate.id, candidateId: candidate.id, action: "approved", actor: "support-lead",
  timestamp: "2026-08-07T10:05:00.000Z", supportIds: ["diagnosis-001", "TKT-1001"], scores: { confidence: 0.9 },
  provenanceSummary: "completed-diagnoses", reviewedFields: [], result: "approved", notes: "Operator approved the candidate.",
};

function versionEvent(
  eventType: "candidate-promoted" | "knowledge-version-superseded" | "knowledge-version-reactivated",
  sourceVersion: number,
  correlationId: string,
  occurredAt: string,
  replacementVersion?: number,
): LearningEvent {
  return eventType === "candidate-promoted"
    ? {
        id: "e239b7c0-49d6-4d39-bff6-33c75146e661", occurredAt, actor: "support-lead", correlationId,
        candidateId: "known-cause-api-credential-rotation-revision", objectId: candidate.id, sourceVersion,
        eventType, payload: { maturity: "promoted" as const, health: "active" as const, provenance: "Operator approved the replacement." },
      }
    : eventType === "knowledge-version-superseded" ? {
        id: "e239b7c0-49d6-4d39-bff6-33c75146e662", occurredAt, actor: "support-lead", correlationId,
        objectId: candidate.id, sourceVersion, eventType,
        payload: { health: "superseded" as const, replacementVersion: replacementVersion!, provenance: "Operator superseded the prior version." },
      } : {
        id: "e239b7c0-49d6-4d39-bff6-33c75146e663", occurredAt, actor: "support-lead", correlationId,
        objectId: candidate.id, sourceVersion, eventType,
        payload: { health: "active" as const, reactivatedVersion: sourceVersion, provenance: "Operator reactivated the historical version." },
      };
}

async function createStore(options: ConstructorParameters<typeof SqliteKnowledgeEvolutionStore>[1] = {}) {
  const root = mkdtempSync(join(tmpdir(), "triage-knowledge-store-"));
  roots.push(root);
  const ledger = new SqliteLearningLedger(join(root, "learning.sqlite"));
  await ledger.initialize();
  const store = new SqliteKnowledgeEvolutionStore(ledger.getDatabase(), options);
  await store.initialize();
  return { ledger, store };
}

describe("SqliteKnowledgeEvolutionStore", () => {
  it("keeps immutable replacement history and reconstructs the historical head", async () => {
    const { ledger, store } = await createStore();
    await store.saveCandidate(candidate);
    await store.promoteWithAudit(candidate.id, approved, candidate.version, audit);

    const replacementCandidate = { ...candidate, id: "known-cause-api-credential-rotation-revision", objectId: candidate.id, sourceVersion: 1, version: 1 };
    await store.saveCandidate(replacementCandidate);
    const correlationId = "d4d7ee66-5bf3-41dc-8c9a-0bd827cd4444";
    const replacement = await store.promoteReplacement({
      candidateId: replacementCandidate.id,
      approved: { ...approved, id: candidate.id, summary: "A revised credential rotation guide.", approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T11:05:00.000Z" } },
      expectedCandidateVersion: 1,
      expectedHeadVersion: 1,
      promotionAudit: { ...audit, id: "audit-promotion-002", candidateId: replacementCandidate.id, timestamp: "2026-08-07T11:05:00.000Z" },
      supersededEvent: versionEvent("knowledge-version-superseded", 1, correlationId, "2026-08-07T11:05:00.000Z", 2),
      promotionEvent: versionEvent("candidate-promoted", 2, correlationId, "2026-08-07T11:05:00.000Z"),
    });

    expect(replacement).toMatchObject({ version: 2, learningGovernance: "ledger" });
    await expect(store.listVersions(candidate.id)).resolves.toMatchObject([{ version: 1 }, { version: 2 }]);
    await expect(store.listApproved()).resolves.toMatchObject([{ version: 2 }]);
    await expect(store.listHeadMappingsAsOf("2026-08-07T10:30:00.000Z")).resolves.toEqual(new Map([[candidate.id, 1]]));
    const snapshot = await store.snapshotForReuse("2026-08-07T10:30:00.000Z");
    expect(snapshot.versions).toMatchObject([{ version: 1 }]);
    expect(snapshot.heads).toEqual(new Map([[candidate.id, 1]]));
    expect(snapshot.events.every((event) => event.occurredAt <= "2026-08-07T10:30:00.000Z")).toBe(true);
    ledger.close();
  });

  it("uses UTC instants for offset-form as-of snapshots so future versions, heads, and events do not leak", async () => {
    const { ledger, store } = await createStore();
    await store.saveCandidate(candidate);
    await store.promoteWithAudit(candidate.id, approved, candidate.version, audit);
    const revision = { ...candidate, id: "known-cause-api-credential-rotation-revision", objectId: candidate.id, sourceVersion: 1, version: 1 };
    await store.saveCandidate(revision);
    await store.promoteReplacement(replacementPromotion(revision, "2026-08-07T11:05:00.000Z"));

    const asOf = "2026-08-07T13:30:00.000+03:00"; // 10:30Z; replacement is 11:05Z.
    await expect(store.listVersionsAsOf(asOf)).resolves.toMatchObject([{ version: 1 }]);
    await expect(store.listHeadMappingsAsOf(asOf)).resolves.toEqual(new Map([[candidate.id, 1]]));
    const snapshot = await store.snapshotForReuse(asOf);
    expect(snapshot.versions).toMatchObject([{ version: 1 }]);
    expect(snapshot.heads).toEqual(new Map([[candidate.id, 1]]));
    expect(snapshot.events).toHaveLength(1);
    ledger.close();
  });

  it("rejects an offset-form reactivation that is instant-earlier than the current version and leaves the historical snapshot isolated", async () => {
    const { ledger, store } = await createStore({ reactivationAuthorizer: (actor) => actor === "support-lead" });
    await store.saveCandidate(candidate);
    await store.promoteWithAudit(candidate.id, approved, candidate.version, audit);
    const revision = { ...candidate, id: "known-cause-api-credential-rotation-revision", objectId: candidate.id, sourceVersion: 1, version: 1 };
    await store.saveCandidate(revision);
    await store.promoteReplacement(replacementPromotion(revision, "2026-08-07T11:05:00.000Z"));
    const reason = "The reactivation must not be backdated by an offset.";
    const occurredAt = "2026-08-07T12:00:00.000+02:00"; // 10:00Z; before v2 at 11:05Z.
    const events = reactivationEventsAt(reason, occurredAt);

    await expect(store.reactivateVersion({
      objectId: candidate.id, sourceVersion: 1, expectedHeadVersion: 2, actorId: "support-lead", reason, occurredAt,
      ...events,
    })).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    const snapshot = await store.snapshotForReuse("2026-08-07T13:30:00.000+03:00");
    expect(snapshot.versions).toMatchObject([{ version: 1 }]);
    expect(snapshot.heads).toEqual(new Map([[candidate.id, 1]]));
    expect(snapshot.events).toHaveLength(1);
    ledger.close();
  });

  it("reactivates an existing version only with an authorized compare-and-swap head", async () => {
    const { ledger, store } = await createStore({ reactivationAuthorizer: (actor) => actor === "support-lead" });
    await store.saveCandidate(candidate);
    await store.promoteWithAudit(candidate.id, approved, candidate.version, audit);
    const replacementCandidate = { ...candidate, id: "known-cause-api-credential-rotation-revision", objectId: candidate.id, sourceVersion: 1, version: 1 };
    await store.saveCandidate(replacementCandidate);
    await store.promoteReplacement({
      candidateId: replacementCandidate.id,
      approved: { ...approved, id: candidate.id, approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T11:05:00.000Z" } },
      expectedCandidateVersion: 1, expectedHeadVersion: 1,
      promotionAudit: { ...audit, id: "audit-promotion-002", candidateId: replacementCandidate.id, timestamp: "2026-08-07T11:05:00.000Z" },
      supersededEvent: versionEvent("knowledge-version-superseded", 1, "d4d7ee66-5bf3-41dc-8c9a-0bd827cd4444", "2026-08-07T11:05:00.000Z", 2),
      promotionEvent: versionEvent("candidate-promoted", 2, "d4d7ee66-5bf3-41dc-8c9a-0bd827cd4444", "2026-08-07T11:05:00.000Z"),
    });
    const displacedReason = "The prior version remains the controlled guidance.";
    await expect(store.reactivateVersion({
      objectId: candidate.id, sourceVersion: 1, expectedHeadVersion: 2, actorId: "support-lead", reason: displacedReason, occurredAt: "2026-08-07T10:30:00.000Z",
      supersededEvent: transitionEvent(versionEvent("knowledge-version-superseded", 2, "4a0e71a2-3d34-4de2-a473-52ed9e777e26", "2026-08-07T10:30:00.000Z", 1), { id: "e239b7c0-49d6-4d39-bff6-33c75146e667", payload: { health: "superseded", replacementVersion: 1, provenance: displacedReason } }),
      reactivatedEvent: transitionEvent(versionEvent("knowledge-version-reactivated", 1, "4a0e71a2-3d34-4de2-a473-52ed9e777e26", "2026-08-07T10:30:00.000Z"), { id: "e239b7c0-49d6-4d39-bff6-33c75146e668", payload: { health: "active", reactivatedVersion: 1, provenance: displacedReason } }),
    })).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(store.listHeadMappings()).resolves.toEqual(new Map([[candidate.id, 2]]));

    const correlationId = "b2037092-30bb-4c2b-8f32-2c9d5edf806f";
    const restored = await store.reactivateVersion({
      objectId: candidate.id, sourceVersion: 1, expectedHeadVersion: 2, actorId: "support-lead", reason: displacedReason, occurredAt: "2026-08-07T12:00:00.000Z",
      supersededEvent: transitionEvent(versionEvent("knowledge-version-superseded", 2, correlationId, "2026-08-07T12:00:00.000Z", 1), { id: "e239b7c0-49d6-4d39-bff6-33c75146e664", payload: { health: "superseded", replacementVersion: 1, provenance: displacedReason } }),
      reactivatedEvent: transitionEvent(versionEvent("knowledge-version-reactivated", 1, correlationId, "2026-08-07T12:00:00.000Z"), { payload: { health: "active", reactivatedVersion: 1, provenance: displacedReason } }),
    });

    expect(restored.version).toBe(1);
    await expect(store.listHeadMappings()).resolves.toEqual(new Map([[candidate.id, 1]]));
    const targetReason = "The replacement is being checked before its approval time.";
    await expect(store.reactivateVersion({
      objectId: candidate.id, sourceVersion: 2, expectedHeadVersion: 1, actorId: "support-lead", reason: targetReason, occurredAt: "2026-08-07T10:30:00.000Z",
      supersededEvent: transitionEvent(versionEvent("knowledge-version-superseded", 1, "fa981a8c-559b-49f2-a793-e76aa299c288", "2026-08-07T10:30:00.000Z", 2), { id: "e239b7c0-49d6-4d39-bff6-33c75146e669", payload: { health: "superseded", replacementVersion: 2, provenance: targetReason } }),
      reactivatedEvent: transitionEvent(versionEvent("knowledge-version-reactivated", 2, "fa981a8c-559b-49f2-a793-e76aa299c288", "2026-08-07T10:30:00.000Z"), { id: "e239b7c0-49d6-4d39-bff6-33c75146e670", payload: { health: "active", reactivatedVersion: 2, provenance: targetReason } }),
    })).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(store.reactivateVersion({
      objectId: candidate.id, sourceVersion: 1, expectedHeadVersion: 2, actorId: "support-lead", reason: "Stale retry.", occurredAt: "2026-08-07T12:05:00.000Z",
      supersededEvent: transitionEvent(versionEvent("knowledge-version-superseded", 2, "1a2bc478-d148-4499-91a2-97f6ba03b714", "2026-08-07T12:05:00.000Z", 1), { id: "e239b7c0-49d6-4d39-bff6-33c75146e665", payload: { health: "superseded", replacementVersion: 1, provenance: "Stale retry." } }),
      reactivatedEvent: transitionEvent(versionEvent("knowledge-version-reactivated", 1, "1a2bc478-d148-4499-91a2-97f6ba03b714", "2026-08-07T12:05:00.000Z"), { id: "e239b7c0-49d6-4d39-bff6-33c75146e666", payload: { health: "active", reactivatedVersion: 1, provenance: "Stale retry." } }),
    })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    ledger.close();
  });

  it("rejects forged replacement event provenance without changing versions, heads, audits, or ledger events", async () => {
    const cases = [
      (events: ReturnType<typeof replacementEvents>) => ({ ...events, supersededEvent: { ...events.supersededEvent, correlationId: "7c438ae3-4f47-4974-bdcc-51b827ee8d72" } }),
      (events: ReturnType<typeof replacementEvents>) => ({ ...events, promotionEvent: { ...events.promotionEvent, occurredAt: "2026-08-07T11:06:00.000Z" } }),
      (events: ReturnType<typeof replacementEvents>) => ({ ...events, promotionEvent: { ...events.promotionEvent, actor: "untrusted-actor" } }),
      (events: ReturnType<typeof replacementEvents>) => ({ ...events, promotionEvent: { ...events.promotionEvent, candidateId: "different-candidate" } }),
    ];
    for (const mutate of cases) {
      const { ledger, store } = await createStore();
      await store.saveCandidate(candidate);
      await store.promoteWithAudit(candidate.id, approved, candidate.version, audit);
      const revision = { ...candidate, id: "known-cause-api-credential-rotation-revision", objectId: candidate.id, sourceVersion: 1, version: 1 };
      await store.saveCandidate(revision);
      const events = replacementEvents();
      await expect(store.promoteReplacement({
        candidateId: revision.id,
        approved: { ...approved, approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T11:05:00.000Z" } },
        expectedCandidateVersion: 1, expectedHeadVersion: 1,
        promotionAudit: { ...audit, id: "audit-promotion-002", candidateId: revision.id, timestamp: "2026-08-07T11:05:00.000Z" },
        ...mutate(events),
      })).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
      await expect(store.listVersions(candidate.id)).resolves.toHaveLength(1);
      await expect(store.listHeadMappings()).resolves.toEqual(new Map([[candidate.id, 1]]));
      await expect(store.list({ action: "approved" })).resolves.toEqual([audit]);
      await expect(ledger.list({ eventType: "candidate-promoted" })).resolves.toHaveLength(1);
      ledger.close();
    }
  });

  it("rejects forged reactivation event provenance without changing the active head", async () => {
    const reason = "The prior version remains the controlled guidance.";
    const cases: Array<(events: ReturnType<typeof reactivationEvents>) => ReturnType<typeof reactivationEvents>> = [
      (events) => ({ ...events, supersededEvent: transitionEvent(events.supersededEvent, { correlationId: "2c276ea1-c23f-440f-9016-48d8a1dd4c1d" }) }),
      (events) => ({ ...events, reactivatedEvent: transitionEvent(events.reactivatedEvent, { occurredAt: "2026-08-07T12:01:00.000Z" }) }),
      (events) => ({ ...events, reactivatedEvent: transitionEvent(events.reactivatedEvent, { actor: "untrusted-actor" }) }),
      (events) => ({ ...events, reactivatedEvent: transitionEvent(events.reactivatedEvent, { payload: { health: "active", reactivatedVersion: 1, provenance: "forged reason" } }) }),
    ];
    for (const mutate of cases) {
      const { ledger, store } = await createStore({ reactivationAuthorizer: (actor) => actor === "support-lead" });
      await store.saveCandidate(candidate);
      await store.promoteWithAudit(candidate.id, approved, candidate.version, audit);
      const revision = { ...candidate, id: "known-cause-api-credential-rotation-revision", objectId: candidate.id, sourceVersion: 1, version: 1 };
      await store.saveCandidate(revision);
      const replacementTransition = replacementEvents();
      await store.promoteReplacement({
        candidateId: revision.id,
        approved: { ...approved, approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T11:05:00.000Z" } },
        expectedCandidateVersion: 1, expectedHeadVersion: 1,
        promotionAudit: { ...audit, id: "audit-promotion-002", candidateId: revision.id, timestamp: "2026-08-07T11:05:00.000Z" },
        ...replacementTransition,
      });
      await expect(store.reactivateVersion({
        objectId: candidate.id, sourceVersion: 1, expectedHeadVersion: 2, actorId: "support-lead", reason, occurredAt: "2026-08-07T12:00:00.000Z",
        ...mutate(reactivationEvents(reason)),
      })).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
      await expect(store.listHeadMappings()).resolves.toEqual(new Map([[candidate.id, 2]]));
      await expect(store.listVersions(candidate.id)).resolves.toHaveLength(2);
      ledger.close();
    }
  });

  it("round trips candidates, immutable approvals, audit, and promotion learning event after reopen", async () => {
    const first = await createStore();
    await first.store.saveCandidate(candidate);
    await first.store.promoteWithAudit(candidate.id, approved, candidate.version, audit);
    first.ledger.close();

    const reopenedLedger = new SqliteLearningLedger(join(roots[0]!, "learning.sqlite"));
    await reopenedLedger.initialize();
    const reopened = new SqliteKnowledgeEvolutionStore(reopenedLedger.getDatabase());
    await reopened.initialize();
    await expect(reopened.listCandidates()).resolves.toEqual([candidate]);
    await expect(reopened.listApproved()).resolves.toEqual([approved]);
    await expect(reopened.list({ action: "approved" })).resolves.toEqual([audit]);
    await expect(reopenedLedger.list({ eventType: "candidate-promoted" })).resolves.toHaveLength(1);
    reopenedLedger.close();
  });

  it("rejects stale candidate versions and keeps the version immutable", async () => {
    const { ledger, store } = await createStore();
    await store.saveCandidate(candidate);
    await expect(store.promote(candidate.id, approved, candidate.version + 1)).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    await store.promote(candidate.id, approved, candidate.version);
    await expect(store.promote(candidate.id, approved, candidate.version)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(store.listApproved()).resolves.toEqual([approved]);
    ledger.close();
  });

  it("rolls back candidate promotion when its audit cannot be persisted", async () => {
    const { ledger, store } = await createStore();
    await store.saveCandidate(candidate);
    await store.append(audit);
    const conflictingAudit = { ...audit, actor: "different-operator" };
    await expect(store.promoteWithAudit(candidate.id, approved, candidate.version, conflictingAudit)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(store.listApproved()).resolves.toEqual([]);
    await expect(store.list({ action: "approved" })).resolves.toEqual([audit]);
    await expect(ledger.list({ eventType: "candidate-promoted" })).resolves.toEqual([]);
    ledger.close();
  });

  it("enforces new SQLite write provenance and normalizes legacy SQLite payloads without rewriting them", async () => {
    const { ledger, store } = await createStore();
    const database = ledger.getDatabase();
    const { objectId: _legacyObjectId, sourceVersion: _legacySourceVersion, ...candidateWithoutLineage } = candidate;
    const { learningGovernance: _legacyGovernance, ...approvedWithoutGovernance } = approved;

    await expect(store.saveCandidate({ ...candidateWithoutLineage, id: "new-candidate-without-lineage" })).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    database.prepare("INSERT INTO knowledge_candidates(id, version, recorded_at, payload_json) VALUES (?, ?, ?, ?)")
      .run("legacy-candidate", 1, candidate.provenance.recordedAt, JSON.stringify({ ...candidateWithoutLineage, id: "legacy-candidate" }));
    database.prepare("INSERT INTO knowledge_versions(object_id, version, approved_at, approved_at_epoch, payload_json) VALUES (?, ?, ?, ?, ?)")
      .run("legacy-object", 1, "2026-08-07T10:05:00.000Z", Date.parse("2026-08-07T10:05:00.000Z"), JSON.stringify({ ...approvedWithoutGovernance, id: "legacy-object" }));

    await expect(store.getCandidate("legacy-candidate")).resolves.toMatchObject({ objectId: "legacy-candidate", sourceVersion: 1 });
    await expect(store.listApproved()).resolves.toMatchObject([{ id: "legacy-object", learningGovernance: "legacy" }]);
    const rawCandidate = database.prepare("SELECT payload_json FROM knowledge_candidates WHERE id = ?").get("legacy-candidate") as { payload_json: string };
    const rawObject = database.prepare("SELECT payload_json FROM knowledge_versions WHERE object_id = ?").get("legacy-object") as { payload_json: string };
    expect(JSON.parse(rawCandidate.payload_json)).not.toHaveProperty("objectId");
    expect(JSON.parse(rawObject.payload_json)).not.toHaveProperty("learningGovernance");
    ledger.close();
  });
});

function replacementEvents() {
  const correlationId = "d4d7ee66-5bf3-41dc-8c9a-0bd827cd4444";
  return {
    supersededEvent: versionEvent("knowledge-version-superseded", 1, correlationId, "2026-08-07T11:05:00.000Z", 2),
    promotionEvent: versionEvent("candidate-promoted", 2, correlationId, "2026-08-07T11:05:00.000Z"),
  };
}

function replacementPromotion(revision: KnowledgeCandidate, approvedAt: string) {
  const correlationId = "d4d7ee66-5bf3-41dc-8c9a-0bd827cd4444";
  return {
    candidateId: revision.id,
    approved: { ...approved, approval: { approvedBy: "support-lead", approvedAt } },
    expectedCandidateVersion: 1,
    expectedHeadVersion: 1,
    promotionAudit: { ...audit, id: "audit-promotion-002", candidateId: revision.id, timestamp: approvedAt },
    supersededEvent: versionEvent("knowledge-version-superseded", 1, correlationId, approvedAt, 2),
    promotionEvent: versionEvent("candidate-promoted", 2, correlationId, approvedAt),
  };
}

function transitionEvent(base: LearningEvent, patch: Record<string, unknown>): LearningEvent {
  return { ...base, ...patch } as LearningEvent;
}

function reactivationEvents(reason: string) {
  return reactivationEventsAt(reason, "2026-08-07T12:00:00.000Z");
}

function reactivationEventsAt(reason: string, occurredAt: string) {
  const correlationId = "b2037092-30bb-4c2b-8f32-2c9d5edf806f";
  return {
    supersededEvent: transitionEvent(versionEvent("knowledge-version-superseded", 2, correlationId, occurredAt, 1), { id: "e239b7c0-49d6-4d39-bff6-33c75146e671", payload: { health: "superseded", replacementVersion: 1, provenance: reason } }),
    reactivatedEvent: transitionEvent(versionEvent("knowledge-version-reactivated", 1, correlationId, occurredAt), { id: "e239b7c0-49d6-4d39-bff6-33c75146e672", payload: { health: "active", reactivatedVersion: 1, provenance: reason } }),
  };
}
