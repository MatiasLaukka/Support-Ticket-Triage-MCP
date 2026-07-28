import { mkdtemp, mkdir, open as openFile, rm, symlink, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DomainError } from "../src/errors.js";
import { DiagnosisRepository } from "../src/knowledge-evolution/diagnosis-repository.js";
import { KnowledgeAuditRepository } from "../src/knowledge-evolution/knowledge-audit-repository.js";
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
};
const { deterministicScores: _scores, deterministicReasons: _reasons, contradictions: _contradictions, validationStatus: _validation, ...candidateFields } = candidate;
const approved: KnowledgeObject = {
  ...candidateFields, status: "approved" as const, version: 1,
  approval: { approvedBy: "support-lead", approvedAt: "2026-07-29T10:06:00.000Z" },
};

describe("knowledge evolution repositories", () => {
  it("round trips immutable diagnoses in deterministic order and rejects duplicates", async () => {
    const repository = new DiagnosisRepository(join(await root(), "diagnoses"));
    await repository.save({ ...diagnosis, id: "diagnosis-002", completedAt: "2026-07-29T11:00:00.000Z" });
    await repository.save(diagnosis);
    await expect(repository.save(diagnosis)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(repository.list()).resolves.toMatchObject([diagnosis, { id: "diagnosis-002" }]);
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
    await expect(repository.promote(candidate.id, approved)).resolves.toMatchObject({ ...approved, version: 1 });
    await expect(repository.listCandidates()).resolves.toMatchObject([candidate]);
    await expect(repository.listApproved()).resolves.toMatchObject([{ ...approved, version: 1 }]);
    await expect(repository.promote(candidate.id, approved)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    await expect(repository.promote("other-candidate", approved)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
    const staleCandidateFileId = "stale-known-cause";
    const staleCandidate: KnowledgeCandidate = { ...candidate, id: "different-internal-candidate-id" };
    await writeFile(join(storage, "candidates", `${staleCandidateFileId}.json`), JSON.stringify(staleCandidate));
    const staleApproved: KnowledgeObject = { ...approved, id: staleCandidateFileId };
    await expect(repository.promote(staleCandidateFileId, staleApproved)).rejects.toMatchObject({ code: "REPOSITORY_ERROR" });
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

  it("serializes concurrent audit appends and filters without requiring a ticket ID", async () => {
    const repository = new KnowledgeAuditRepository(join(await root(), "audit", "events.jsonl"));
    const events = ["candidate-created", "approved"].map((action, index) => ({
      id: `audit-${index + 1}`, objectId: candidate.id, action, actor: "support-lead", timestamp: `2026-07-29T10:0${index}:00.000Z`,
      supportIds: ["diagnosis-001"], scores: { confidence: 0.9 }, provenanceSummary: "completed-diagnoses", reviewedFields: ["summary"], result: index === 0 ? "candidate-created" : "approved",
    }));
    await Promise.all(events.map((event) => repository.append(event)));
    await expect(repository.list({ objectId: candidate.id, action: "approved" })).resolves.toEqual([events[1]]);
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
