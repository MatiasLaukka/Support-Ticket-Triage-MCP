import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { DomainError } from "../errors.js";
import { KnowledgeCandidateReadSchema, KnowledgeCandidateWriteSchema, KnowledgeObjectReadSchema, KnowledgeObjectWriteSchema, type KnowledgeCandidate, type KnowledgeObject } from "./domain.js";
import { isMissing, listJson, readJson, repositoryError, serialize, writeNewJson } from "./repository-utils.js";
import type { KnowledgeReuseSnapshot, KnowledgeVersionStore } from "./knowledge-version-store.js";

const order = <T extends { id: string; provenance: { recordedAt: string } }>(a: T, b: T) => a.provenance.recordedAt.localeCompare(b.provenance.recordedAt) || a.id.localeCompare(b.id);

export class KnowledgeObjectRepository {
  private readonly candidatesRoot: string;
  private readonly approvedRoot: string;
  constructor(candidatesRoot: string, approvedRoot: string) { this.candidatesRoot = resolve(candidatesRoot); this.approvedRoot = resolve(approvedRoot); }
  async listCandidates(): Promise<KnowledgeCandidate[]> { return serialize(this.candidatesRoot, () => listJson(this.candidatesRoot, KnowledgeCandidateReadSchema, order)); }
  async getCandidate(id: string): Promise<KnowledgeCandidate> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw repositoryError("Repository path is not allowed.");
    try { return await serialize(this.candidatesRoot, () => readJson(resolve(this.candidatesRoot, `${id}.json`), KnowledgeCandidateReadSchema)); }
    catch (error) { if (isMissing(error)) throw repositoryError("Knowledge candidate was not found."); throw error; }
  }
  async saveCandidate(candidate: KnowledgeCandidate): Promise<void> { return serialize(this.candidatesRoot, () => writeNewJson(this.candidatesRoot, candidate, KnowledgeCandidateWriteSchema)); }
  async removeCandidate(candidateId: string): Promise<void> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateId)) throw repositoryError("Repository path is not allowed.");
    return serialize(resolve(this.candidatesRoot, ".."), async () => {
      const file = resolve(this.candidatesRoot, `${candidateId}.json`);
      const candidate = await readJson(file, KnowledgeCandidateReadSchema);
      if (candidate.id !== candidateId) throw repositoryError("Knowledge candidate does not match the persisted record.");
      try { await rm(file); }
      catch (error) { if (isMissing(error)) throw repositoryError("Knowledge candidate was not found."); throw repositoryError("Knowledge candidate could not be removed."); }
    });
  }
  async promote(candidateId: string, approved: KnowledgeObject, expectedCandidateVersion?: number): Promise<KnowledgeObject> {
    if (candidateId !== approved.id || approved.version !== 1 || approved.status !== "approved") throw repositoryError("Knowledge object does not match the candidate being promoted.");
    return serialize(resolve(this.candidatesRoot, ".."), async () => {
      const candidate = await this.getCandidate(candidateId);
      if (candidate.id !== candidateId) throw repositoryError("Knowledge object does not match the candidate being promoted.");
      if (expectedCandidateVersion !== undefined && candidate.version !== expectedCandidateVersion) {
        throw new DomainError("Knowledge candidate version is stale.", "STALE_APPROVAL");
      }
      try { await writeNewJson(this.approvedRoot, approved, KnowledgeObjectWriteSchema); }
      catch (error) { if (error instanceof DomainError && error.code === "REPOSITORY_ERROR") throw repositoryError("Knowledge candidate has already been promoted."); throw error; }
      return KnowledgeObjectWriteSchema.parse(approved);
    });
  }
  async removeApproved(candidateId: string): Promise<void> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateId)) throw repositoryError("Repository path is not allowed.");
    return serialize(resolve(this.candidatesRoot, ".."), async () => {
      const file = resolve(this.approvedRoot, `${candidateId}.json`);
      const approved = await readJson(file, KnowledgeObjectReadSchema);
      if (approved.id !== candidateId) throw repositoryError("Knowledge object does not match the promoted candidate.");
      try { await rm(file); }
      catch (error) { if (isMissing(error)) throw repositoryError("Approved knowledge object was not found."); throw repositoryError("Approved knowledge object could not be removed."); }
    });
  }
  async listApproved(): Promise<KnowledgeObject[]> { return serialize(this.approvedRoot, () => listJson(this.approvedRoot, KnowledgeObjectReadSchema, order)); }
  async listVersions(objectId: string): Promise<KnowledgeObject[]> {
    return (await this.listApproved()).filter((object) => object.id === objectId);
  }
  async listVersionsAsOf(asOf: string): Promise<KnowledgeObject[]> {
    return (await this.listApproved()).filter((object) => object.approval?.approvedAt !== undefined && object.approval.approvedAt <= asOf);
  }
  async listHeadMappings(): Promise<ReadonlyMap<string, number>> {
    return new Map((await this.listApproved()).map((object) => [object.id, object.version]));
  }
  async listHeadMappingsAsOf(asOf: string): Promise<ReadonlyMap<string, number>> {
    return new Map((await this.listVersionsAsOf(asOf)).map((object) => [object.id, object.version]));
  }
  async snapshotForReuse(asOf: string): Promise<KnowledgeReuseSnapshot> {
    const versions = await this.listVersionsAsOf(asOf);
    return { events: [], versions, heads: new Map(versions.map((object) => [object.id, object.version])) };
  }
  async promoteReplacement(_input: Parameters<KnowledgeVersionStore["promoteReplacement"]>[0]): Promise<KnowledgeObject> {
    throw new DomainError("JSON storage does not support version transitions.", "UNSUPPORTED_VERSION_TRANSITION");
  }
  async reactivateVersion(_input: Parameters<KnowledgeVersionStore["reactivateVersion"]>[0]): Promise<KnowledgeObject> {
    throw new DomainError("JSON storage does not support version transitions.", "UNSUPPORTED_VERSION_TRANSITION");
  }
}
