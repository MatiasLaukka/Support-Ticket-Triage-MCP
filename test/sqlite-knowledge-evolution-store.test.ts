import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteLearningLedger } from "../src/knowledge-evolution/sqlite-learning-ledger.js";
import { SqliteKnowledgeEvolutionStore } from "../src/knowledge-evolution/sqlite-knowledge-evolution-store.js";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";
import type { KnowledgeCandidate, KnowledgeObject } from "../src/knowledge-evolution/domain.js";

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
};
const approved: KnowledgeObject = {
  id: candidate.id, kind: candidate.kind, name: candidate.name, summary: candidate.summary, triggerPatterns: candidate.triggerPatterns,
  evidencePolicy: candidate.evidencePolicy as { mode: "required"; evidenceIds: string[] }, timeConstraints: candidate.timeConstraints, diagnosticSteps: candidate.diagnosticSteps,
  fixSteps: candidate.fixSteps, verificationSteps: candidate.verificationSteps, customerSafeExplanation: candidate.customerSafeExplanation,
  operatorRationale: candidate.operatorRationale, owner: candidate.owner, version: 1, status: "approved",
  supportingDiagnosisIds: candidate.supportingDiagnosisIds, supportingTicketIds: candidate.supportingTicketIds, provenance: candidate.provenance,
  approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T10:05:00.000Z" },
};
const audit: KnowledgeAuditEvent = {
  id: "audit-promotion-001", objectId: candidate.id, candidateId: candidate.id, action: "approved", actor: "support-lead",
  timestamp: "2026-08-07T10:05:00.000Z", supportIds: ["diagnosis-001", "TKT-1001"], scores: { confidence: 0.9 },
  provenanceSummary: "completed-diagnoses", reviewedFields: [], result: "approved", notes: "Operator approved the candidate.",
};

async function createStore() {
  const root = mkdtempSync(join(tmpdir(), "triage-knowledge-store-"));
  roots.push(root);
  const ledger = new SqliteLearningLedger(join(root, "learning.sqlite"));
  await ledger.initialize();
  const store = new SqliteKnowledgeEvolutionStore(ledger.getDatabase());
  await store.initialize();
  return { ledger, store };
}

describe("SqliteKnowledgeEvolutionStore", () => {
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
});
