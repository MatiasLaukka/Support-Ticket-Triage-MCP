import { resolve } from "node:path";
import { CompletedDiagnosisSchema, type CompletedDiagnosis } from "./domain.js";
import { isMissing, listJson, readJson, repositoryError, serialize, writeNewJson } from "./repository-utils.js";
import { DomainError } from "../errors.js";

export class DiagnosisRepository {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  async save(record: CompletedDiagnosis): Promise<void> { return serialize(this.root, () => writeNewJson(this.root, record, CompletedDiagnosisSchema)); }
  async list(): Promise<CompletedDiagnosis[]> { return serialize(this.root, () => listJson(this.root, CompletedDiagnosisSchema, (a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id))); }
}
