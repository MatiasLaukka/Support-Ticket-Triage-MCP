import { resolve } from "node:path";
import { DomainError } from "../errors.js";
import { KnowledgeCandidateSchema, KnowledgeObjectSchema, type KnowledgeCandidate, type KnowledgeObject } from "./domain.js";
import { isMissing, listJson, readJson, repositoryError, serialize, writeNewJson } from "./repository-utils.js";

const order = <T extends { id: string; provenance: { recordedAt: string } }>(a: T, b: T) => a.provenance.recordedAt.localeCompare(b.provenance.recordedAt) || a.id.localeCompare(b.id);

export class KnowledgeObjectRepository {
  private readonly candidatesRoot: string;
  private readonly approvedRoot: string;
  constructor(candidatesRoot: string, approvedRoot: string) { this.candidatesRoot = resolve(candidatesRoot); this.approvedRoot = resolve(approvedRoot); }
  async listCandidates(): Promise<KnowledgeCandidate[]> { return serialize(this.candidatesRoot, () => listJson(this.candidatesRoot, KnowledgeCandidateSchema, order)); }
  async getCandidate(id: string): Promise<KnowledgeCandidate> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw repositoryError("Repository path is not allowed.");
    try { return await serialize(this.candidatesRoot, () => readJson(resolve(this.candidatesRoot, `${id}.json`), KnowledgeCandidateSchema)); }
    catch (error) { if (isMissing(error)) throw repositoryError("Knowledge candidate was not found."); throw error; }
  }
  async saveCandidate(candidate: KnowledgeCandidate): Promise<void> { return serialize(this.candidatesRoot, () => writeNewJson(this.candidatesRoot, candidate, KnowledgeCandidateSchema)); }
  async promote(candidateId: string, approved: KnowledgeObject): Promise<KnowledgeObject> {
    if (candidateId !== approved.id || approved.version !== 1 || approved.status !== "approved") throw repositoryError("Knowledge object does not match the candidate being promoted.");
    return serialize(resolve(this.candidatesRoot, ".."), async () => {
      const candidate = await this.getCandidate(candidateId);
      if (candidate.id !== candidateId) throw repositoryError("Knowledge object does not match the candidate being promoted.");
      try { await writeNewJson(this.approvedRoot, approved, KnowledgeObjectSchema); }
      catch (error) { if (error instanceof DomainError && error.code === "REPOSITORY_ERROR") throw repositoryError("Knowledge candidate has already been promoted."); throw error; }
      return KnowledgeObjectSchema.parse(approved);
    });
  }
  async listApproved(): Promise<KnowledgeObject[]> { return serialize(this.approvedRoot, () => listJson(this.approvedRoot, KnowledgeObjectSchema, order)); }
}
