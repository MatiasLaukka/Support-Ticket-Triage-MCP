import { mkdtemp, mkdir, open as openFile, readFile, rm, symlink, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DomainError } from "../src/errors.js";
import { DiagnosisRepository } from "../src/knowledge-evolution/diagnosis-repository.js";
import { KnowledgeAuditRepository, type KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";
import { KnowledgeObjectRepository } from "../src/knowledge-evolution/knowledge-object-repository.js";
import type { CompletedDiagnosis, KnowledgeCandidate, KnowledgeObject } from "../src/knowledge-evolution/domain.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "knowledge-evolution-"));
  roots.push(value);
  return value;
}

const diagnosis: CompletedDiagnosis = {
  id: "diagnosis-001", ticketId: "TKT-0001", problem: "API requests fail after rotating credentials.",
  symptoms: ["Requests return 401 after rotation."], evidenceIds: ["evidence-001"], ownerTeam: "api-platform",
  fixSteps: ["Refresh the service credential in the deployment secret store."],
  verificationSteps: ["Confirm a new request succeeds with the refreshed credential."], completedAt: "2026-07-29T10:00:00.000Z",
};
const candidate: KnowledgeCandidate = {
  id: "known-cause-api-credential-rotation", kind: "known-cause", name: "Stale API credential after rotation",
  summary: "A deployed service can retain a credential that was rotated.", triggerPatterns: ["Requests began returning 401 after credential rotation."],
  evidencePolicy: { mode: "required" as const, evidenceIds: ["evidence-001"] }, timeConstraints: ["Applies only after credential rotation."],
  diagnosticSteps: ["Compare the deployment credential version with the active version."], fixSteps: ["Refresh the service credential in the deployment secret store."],
  verificationSteps: ["Confirm a new request succeeds with the refreshed credential."], customerSafeExplanation: "We found a configuration mismatch and are refreshing it.",
  operatorRationale: "The completed diagnosis ties the 401 errors to a stale deployment credential.", owner: "api-platform", version: 4,
  status: "candidate" as const, supportingDiagnosisIds: ["diagnosis-001"], supportingTicketIds: ["TKT-0001"],
  provenance: { source: "completed-diagnoses", recordedAt: "2026-07-29T10:05:00.000Z" },
  deterministicScores: { confidence: 0.9, support: 1 }, deterministicReasons: ["Two diagnoses share the same evidence-backed fix."], contradictions: [], validationStatus: "valid" as const,
  evidencePolicyMetadata: { derivedEvidenceIds: ["evidence-001"], operatorAddedEvidenceIds: [] },
  objectId: "known-cause-api-credential-rotation",
  sourceVersion: 1,
};
const { deterministicScores: _scores, deterministicReasons: _reasons, contradictions: _contradictions, validationStatus: _validation, evidencePolicyMetadata: _metadata, evidencePolicy: candidateEvidencePolicy, objectId: _objectId, sourceVersion: _sourceVersion, ...candidateFields } = candidate;
const approved: KnowledgeObject = {
  ...candidateFields, evidencePolicy: candidateEvidencePolicy as { mode: "required"; evidenceIds: string[] }, status: "approved" as const, version: 1,
  approval: { approvedBy: "support-lead", approvedAt: "2026-07-29T10:06:00.000Z" },
  learningGovernance: "ledger",
};

describe("knowledge evolution repositories", () => {
  it("round trips immutable diagnoses in deterministic order and rejects duplicates", async () => {
    const repository = new DiagnosisRepository(join(await root(), "diagnoses"));
    await repository.save({ ...diagnosis, id: "diagnosis-002", completedAt: "2026-07-29T11:00:00.000Z" });
    await repository.save(diagnosis);
    await expect(repository.save(diagnosis)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(repository.list()).resolves.toMatchObject([diagnosis, { id: "diagnosis-002" }]);
  });

  it("loads legacy diagnosis records without structured evidence references", async () => {
    const storage = await root();
    const diagnoses = join(storage, "diagnoses");
    await mkdir(diagnoses, { recursive: true });
    await writeFile(join(diagnoses, "diagnosis-001.json"), JSON.stringify(diagnosis));

    await expect(new DiagnosisRepository(diagnoses).list()).resolves.toEqual([{
      ...diagnosis,
      evidenceUsed: [],
      evidenceReferences: [],
    }]);
  });

  it("removes a persisted diagnosis so a failed audit can be retried without a duplicate", async () => {
    const repository = new DiagnosisRepository(join(await root(), "diagnoses"));
    await repository.save(diagnosis);

    await repository.remove(diagnosis.id);

    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.save(diagnosis)).resolves.toBeUndefined();
  });

  it("rejects records whose serialized form exceeds the safe read limit", async () => {
    const repository = new DiagnosisRepository(join(await root(), "diagnoses"));
    const oversized = { ...diagnosis, symptoms: Array.from({ length: 1_100 }, (_, index) => `${index}-${"x".repeat(995)}`) };
    await expect(repository.save(oversized)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(repository.list()).resolves.toEqual([]);
  });

  it("rejects malformed diagnosis data and linked repository paths", async () => {
    const storage = await root();
    const repository = new DiagnosisRepository(join(storage, "diagnoses"));
    await mkdir(join(storage, "diagnoses"), { recursive: true });
    await writeFile(join(storage, "diagnoses", "diagnosis-001.json"), "{bad json");
    await expect(repository.list()).rejects.toMatchObject({ code: "REPOSITORY_ERROR" } satisfies Partial<DomainError>);
    const linked = join(storage, "linked");
    await symlink(join(storage, "diagnoses"), linked, "junction");
    await expect(new DiagnosisRepository(linked).list()).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
  });

  it("returns empty collections for missing roots and rejects malformed candidate and audit records", async () => {
    const storage = await root();
    await expect(new DiagnosisRepository(join(storage, "missing-diagnoses")).list()).resolves.toEqual([]);
    await expect(new KnowledgeObjectRepository(join(storage, "missing-candidates"), join(storage, "missing-approved")).listApproved()).resolves.toEqual([]);
    await expect(new KnowledgeAuditRepository(join(storage, "missing-audit", "events.jsonl")).list()).resolves.toEqual([]);
    const candidates = join(storage, "candidates");
    await mkdir(candidates);
    await writeFile(join(candidates, `${candidate.id}.json`), "{}");
    await expect(new KnowledgeObjectRepository(candidates, join(storage, "approved")).listCandidates()).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    const auditFile = join(storage, "audit", "events.jsonl");
    await mkdir(resolve(auditFile, ".."), { recursive: true });
    await writeFile(auditFile, "{}\n");
    await expect(new KnowledgeAuditRepository(auditFile).list()).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
  });

  it("keeps candidates and approved objects separate while promotion preserves candidates", async () => {
    const storage = await root();
    const repository = new KnowledgeObjectRepository(join(storage, "candidates"), join(storage, "approved"));
    await repository.saveCandidate(candidate);
    await expect(repository.promote(candidate.id, approved, candidate.version + 1)).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    await expect(repository.listApproved()).resolves.toEqual([]);
    await expect(repository.promote(candidate.id, approved)).resolves.toMatchObject({ ...approved, version: 1 });
    await expect(repository.listCandidates()).resolves.toMatchObject([candidate]);
    await expect(repository.listApproved()).resolves.toMatchObject([{ ...approved, version: 1 }]);
    await expect(repository.promote(candidate.id, approved)).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    await expect(repository.promote("other-candidate", approved)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    const staleCandidateFileId = "stale-known-cause";
    const staleCandidate: KnowledgeCandidate = { ...candidate, id: "different-internal-candidate-id" };
    await writeFile(join(storage, "candidates", `${staleCandidateFileId}.json`), JSON.stringify(staleCandidate));
    const staleApproved: KnowledgeObject = { ...approved, id: staleCandidateFileId };
    await expect(repository.promote(staleCandidateFileId, staleApproved)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
  });

  it("requires provenance on new JSON writes and normalizes legacy persisted records without rewriting them", async () => {
    const storage = await root();
    const candidates = join(storage, "candidates");
    const approvedRoot = join(storage, "approved");
    const repository = new KnowledgeObjectRepository(candidates, approvedRoot);
    const { objectId: _legacyObjectId, sourceVersion: _legacySourceVersion, ...candidateWithoutLineage } = candidate;
    const { learningGovernance: _legacyGovernance, ...approvedWithoutGovernance } = approved;

    await expect(repository.saveCandidate({ ...candidateWithoutLineage, id: "new-candidate-without-lineage" })).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await repository.saveCandidate(candidate);
    await expect(repository.promote(candidate.id, approvedWithoutGovernance)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });

    await mkdir(candidates, { recursive: true });
    await mkdir(approvedRoot, { recursive: true });
    const legacyCandidate = { ...candidateWithoutLineage, id: "legacy-candidate" };
    const legacyObject = { ...approvedWithoutGovernance, id: "legacy-object" };
    await writeFile(join(candidates, "legacy-candidate.json"), JSON.stringify(legacyCandidate));
    await writeFile(join(approvedRoot, "legacy-object.json"), JSON.stringify(legacyObject));

    await expect(repository.getCandidate("legacy-candidate")).resolves.toMatchObject({ objectId: "legacy-candidate", sourceVersion: 1 });
    await expect(repository.listApproved()).resolves.toMatchObject([{ id: "legacy-object", learningGovernance: "legacy" }]);
    expect(JSON.parse(await readFile(join(candidates, "legacy-candidate.json"), "utf8"))).not.toHaveProperty("objectId");
    expect(JSON.parse(await readFile(join(approvedRoot, "legacy-object.json"), "utf8"))).not.toHaveProperty("learningGovernance");
  });

  it("keeps JSON version transitions explicitly unsupported while retaining the legacy v1 read path", async () => {
    const storage = await root();
    const repository = new KnowledgeObjectRepository(join(storage, "candidates"), join(storage, "approved"));
    await repository.saveCandidate(candidate);
    await repository.promote(candidate.id, approved);

    await expect(repository.promoteReplacement({} as never)).rejects.toMatchObject({ code: "UNSUPPORTED_VERSION_TRANSITION" });
    await expect(repository.reactivateVersion({} as never)).rejects.toMatchObject({ code: "UNSUPPORTED_VERSION_TRANSITION" });
    await expect(repository.listHeadMappings()).resolves.toEqual(new Map([[approved.id, 1]]));
  });

  it("removes only the approved object created by a recoverable promotion", async () => {
    const storage = await root();
    const repository = new KnowledgeObjectRepository(join(storage, "candidates"), join(storage, "approved"));
    await repository.saveCandidate(candidate);
    await repository.promote(candidate.id, approved);

    await repository.removeApproved(candidate.id);

    await expect(repository.listApproved()).resolves.toEqual([]);
    await expect(repository.listCandidates()).resolves.toEqual([candidate]);
  });

  it("removes only the candidate whose creation audit could not be persisted", async () => {
    const storage = await root();
    const repository = new KnowledgeObjectRepository(join(storage, "candidates"), join(storage, "approved"));
    await repository.saveCandidate(candidate);

    await repository.removeCandidate(candidate.id);

    await expect(repository.listCandidates()).resolves.toEqual([]);
    await expect(repository.listApproved()).resolves.toEqual([]);
  });

  it("serializes concurrent audit appends and filters without requiring a ticket ID", async () => {
    const repository = new KnowledgeAuditRepository(join(await root(), "audit", "events.jsonl"));
    const events = ["candidate-created", "approved"].map((action, index) => ({
      id: `audit-${index + 1}`, objectId: candidate.id, action, actor: "support-lead", timestamp: `2026-07-29T10:0${index}:00.000Z`,
      supportIds: ["diagnosis-001"], scores: { confidence: 0.9 }, provenanceSummary: "completed-diagnoses", reviewedFields: ["summary"], result: index === 0 ? "candidate-created" : "approved",
    }));
    await Promise.all(events.map((event) => repository.append(event)));
    await expect(repository.list({ objectId: candidate.id, action: "approved" })).resolves.toEqual([events[1]]);
  });

  it("round trips approved evidence policy provenance in audit metadata", async () => {
    const repository = new KnowledgeAuditRepository(join(await root(), "audit", "events.jsonl"));
    const event: KnowledgeAuditEvent = {
      id: "audit-approved-policy", objectId: candidate.id, candidateId: candidate.id, action: "approved",
      actor: "support-lead", timestamp: "2026-07-29T10:06:00.000Z", supportIds: ["diagnosis-001"], reviewedFields: ["evidencePolicy"], result: "approved",
      evidencePolicyMetadata: {
        approvedPolicy: { mode: "required", evidenceIds: ["request-id"] },
        derivedEvidenceIds: ["request-id"], operatorAddedEvidenceIds: [],
      },
    };
    await repository.append(event);
    await expect(repository.list({ action: "approved" })).resolves.toEqual([event]);
  });

  it("atomically compares and appends a terminal action once", async () => {
    const repository = new KnowledgeAuditRepository(join(await root(), "audit", "events.jsonl"));
    const event = { id: "audit-rejected-1", candidateId: candidate.id, action: "rejected", actor: "support-lead", timestamp: "2026-07-29T10:00:00.000Z", supportIds: ["diagnosis-001"], reviewedFields: [], result: "rejected", rejectionReason: "Needs more corroboration." };

    const results = await Promise.all([
      repository.appendIfNoPriorAction(event),
      repository.appendIfNoPriorAction({ ...event, id: "audit-rejected-2" }),
    ]);

    expect(results.sort()).toEqual([false, true]);
    await expect(repository.list({ candidateId: candidate.id, action: "rejected" })).resolves.toEqual([event]);
  });

  it("rolls an audit file back when syncing an appended event fails", async () => {
    const auditFile = join(await root(), "audit", "events.jsonl");
    const event = { id: "audit-existing", objectId: candidate.id, action: "candidate-created", actor: "support-lead", timestamp: "2026-07-29T10:00:00.000Z", supportIds: ["diagnosis-001"], reviewedFields: ["summary"], result: "candidate-created" };
    await new KnowledgeAuditRepository(auditFile).append(event);
    const failingFileSystem = {
      open: (async (path: string, flags: string) => {
        const handle = await openFile(path, flags);
        if (flags !== "a+") return handle;
        return new Proxy(handle, {
          get(target, property) {
            if (property === "sync") return async () => { throw new Error("simulated sync failure"); };
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as FileHandle;
      }) as typeof openFile,
    };
    const failingRepository = new KnowledgeAuditRepository(auditFile, failingFileSystem);
    await expect(failingRepository.append({ ...event, id: "audit-failed", action: "approved", result: "approved" })).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(new KnowledgeAuditRepository(auditFile).list()).resolves.toEqual([event]);
  });
});
