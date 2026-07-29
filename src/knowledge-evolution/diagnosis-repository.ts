import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { CompletedDiagnosisSchema, type CompletedDiagnosis } from "./domain.js";
import { isMissing, listJson, readJson, repositoryError, serialize, writeNewJson } from "./repository-utils.js";
import { DomainError } from "../errors.js";

export class DiagnosisRepository {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  async save(record: CompletedDiagnosis): Promise<void> { return serialize(this.root, () => writeNewJson(this.root, record, CompletedDiagnosisSchema)); }
  async remove(id: string): Promise<void> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw repositoryError("Repository path is not allowed.");
    return serialize(this.root, async () => {
      const file = resolve(this.root, `${id}.json`);
      try {
        const record = await readJson(file, CompletedDiagnosisSchema);
        if (record.id !== id) throw repositoryError("Completed diagnosis does not match the persisted record.");
        await rm(file);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        if (isMissing(error)) throw repositoryError("Completed diagnosis was not found.");
        throw repositoryError("Completed diagnosis could not be removed.");
      }
    });
  }
  async list(): Promise<CompletedDiagnosis[]> { return serialize(this.root, () => listJson(this.root, CompletedDiagnosisSchema, (a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id))); }
}
