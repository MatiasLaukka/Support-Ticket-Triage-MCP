import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { DomainError } from "../errors.js";
import { KnowledgeCandidateSchema, KnowledgeObjectSchema, type KnowledgeCandidate, type KnowledgeObject } from "./domain.js";
import { KnowledgeAuditEventSchema, type KnowledgeAuditEvent, type KnowledgeAuditFilters } from "./knowledge-audit-repository.js";
import { LearningEventSchema, type LearningEvent } from "./learning-ledger.js";
import { repositoryError } from "./repository-utils.js";

interface JsonRow { payload_json: string; }
interface AuditRow { payload_json: string; }

export class SqliteKnowledgeEvolutionStore {
  constructor(private readonly database: Database.Database) {}

  async initialize(): Promise<void> {
    try {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_candidates (
          id TEXT PRIMARY KEY NOT NULL,
          version INTEGER NOT NULL,
          recorded_at TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS knowledge_versions (
          object_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          approved_at TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (object_id, version)
        );
        CREATE TABLE IF NOT EXISTS knowledge_audits (
          id TEXT PRIMARY KEY NOT NULL,
          object_id TEXT,
          candidate_id TEXT,
          action TEXT NOT NULL,
          actor TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          learning_event_id TEXT
        );
        CREATE INDEX IF NOT EXISTS knowledge_candidates_recorded_idx ON knowledge_candidates(recorded_at, id);
        CREATE INDEX IF NOT EXISTS knowledge_versions_object_idx ON knowledge_versions(object_id, version DESC);
        CREATE INDEX IF NOT EXISTS knowledge_audits_candidate_idx ON knowledge_audits(candidate_id, action);
      `);
    } catch (error) {
      throw repositoryError(`Knowledge evolution SQLite schema could not be initialized: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async listCandidates(): Promise<KnowledgeCandidate[]> {
    const rows = this.database.prepare("SELECT payload_json FROM knowledge_candidates ORDER BY recorded_at ASC, id ASC").all() as JsonRow[];
    return rows.map((row) => this.parseCandidate(row.payload_json));
  }

  async getCandidate(id: string): Promise<KnowledgeCandidate> {
    const row = this.database.prepare("SELECT payload_json FROM knowledge_candidates WHERE id = ?").get(id) as JsonRow | undefined;
    if (row === undefined) throw repositoryError("Knowledge candidate was not found.");
    return this.parseCandidate(row.payload_json);
  }

  async saveCandidate(candidate: KnowledgeCandidate): Promise<void> {
    const parsed = KnowledgeCandidateSchema.safeParse(candidate);
    if (!parsed.success) throw repositoryError("Repository data is invalid.");
    try {
      this.database.prepare(`INSERT INTO knowledge_candidates(id, version, recorded_at, payload_json) VALUES (?, ?, ?, ?)`)
        .run(parsed.data.id, parsed.data.version, parsed.data.provenance.recordedAt, JSON.stringify(parsed.data));
    } catch (error) {
      if (isUniqueViolation(error)) throw repositoryError("Knowledge candidate already exists.");
      throw repositoryError("Knowledge candidate could not be persisted.");
    }
  }

  async removeCandidate(candidateId: string): Promise<void> {
    const result = this.database.prepare("DELETE FROM knowledge_candidates WHERE id = ?").run(candidateId);
    if (result.changes === 0) throw repositoryError("Knowledge candidate was not found.");
  }

  async listApproved(): Promise<KnowledgeObject[]> {
    const rows = this.database.prepare(`
      SELECT payload_json FROM knowledge_versions AS versions
      WHERE version = (SELECT MAX(other.version) FROM knowledge_versions AS other WHERE other.object_id = versions.object_id)
      ORDER BY approved_at ASC, object_id ASC
    `).all() as JsonRow[];
    return rows.map((row) => this.parseObject(row.payload_json));
  }

  async promote(candidateId: string, approved: KnowledgeObject, expectedCandidateVersion?: number): Promise<KnowledgeObject> {
    return this.promoteInternal(candidateId, approved, expectedCandidateVersion, undefined);
  }

  async promoteWithAudit(
    candidateId: string,
    approved: KnowledgeObject,
    expectedCandidateVersion: number | undefined,
    audit: KnowledgeAuditEvent,
  ): Promise<KnowledgeObject> {
    return this.promoteInternal(candidateId, approved, expectedCandidateVersion, audit);
  }

  async removeApproved(candidateId: string): Promise<void> {
    const result = this.database.prepare("DELETE FROM knowledge_versions WHERE object_id = ?").run(candidateId);
    if (result.changes === 0) throw repositoryError("Approved knowledge object was not found.");
  }

  async append(event: KnowledgeAuditEvent): Promise<void> {
    const parsed = KnowledgeAuditEventSchema.safeParse(event);
    if (!parsed.success) throw repositoryError("Repository data is invalid.");
    this.insertAudit(parsed.data);
  }

  async appendIfNoPriorAction(event: KnowledgeAuditEvent): Promise<boolean> {
    const parsed = KnowledgeAuditEventSchema.safeParse(event);
    if (!parsed.success || parsed.data.candidateId === undefined) throw repositoryError("Repository data is invalid.");
    const prior = this.database.prepare("SELECT 1 AS found FROM knowledge_audits WHERE candidate_id = ? AND action = ? LIMIT 1")
      .get(parsed.data.candidateId, parsed.data.action) as { found?: number } | undefined;
    if (prior?.found === 1) return false;
    this.insertAudit(parsed.data);
    return true;
  }

  async list(filters: KnowledgeAuditFilters = {}): Promise<KnowledgeAuditEvent[]> {
    const clauses: string[] = [];
    const values: string[] = [];
    for (const [column, value] of [
      ["object_id", filters.objectId],
      ["candidate_id", filters.candidateId],
      ["action", filters.action],
      ["actor", filters.actor],
    ] as const) {
      if (value !== undefined) { clauses.push(`${column} = ?`); values.push(value); }
    }
    const where = clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`;
    const rows = this.database.prepare(`SELECT payload_json FROM knowledge_audits ${where} ORDER BY rowid ASC`).all(...values) as AuditRow[];
    return rows.map((row) => this.parseAudit(row.payload_json));
  }

  private async promoteInternal(
    candidateId: string,
    approved: KnowledgeObject,
    expectedCandidateVersion: number | undefined,
    audit: KnowledgeAuditEvent | undefined,
  ): Promise<KnowledgeObject> {
    const parsed = KnowledgeObjectSchema.safeParse(approved);
    if (!parsed.success || candidateId !== parsed.data.id || parsed.data.status !== "approved") {
      throw repositoryError("Knowledge object does not match the candidate being promoted.");
    }
    if (audit !== undefined && !KnowledgeAuditEventSchema.safeParse(audit).success) {
      throw repositoryError("Promotion audit is invalid.");
    }
    const approval = parsed.data.approval;
    if (approval === undefined) throw repositoryError("Approved knowledge objects require approval metadata.");
    try {
      const transaction = this.database.transaction(() => {
        const candidateRow = this.database.prepare("SELECT version FROM knowledge_candidates WHERE id = ?").get(candidateId) as { version?: number } | undefined;
        if (candidateRow === undefined) throw repositoryError("Knowledge candidate was not found.");
        if (expectedCandidateVersion !== undefined && candidateRow.version !== expectedCandidateVersion) {
          throw new DomainError("Knowledge candidate version is stale.", "STALE_APPROVAL");
        }
        const existing = this.database.prepare("SELECT 1 AS found FROM knowledge_versions WHERE object_id = ? LIMIT 1").get(candidateId) as { found?: number } | undefined;
        if (existing?.found === 1) throw repositoryError("Knowledge candidate has already been promoted.");
        this.database.prepare("INSERT INTO knowledge_versions(object_id, version, approved_at, payload_json) VALUES (?, ?, ?, ?)")
          .run(parsed.data.id, parsed.data.version, approval.approvedAt, JSON.stringify(parsed.data));
        if (audit !== undefined) {
          this.insertAudit(audit);
          const learningEvent: LearningEvent = {
            id: randomUUID(),
            occurredAt: approval.approvedAt,
            actor: approval.approvedBy,
            correlationId: randomUUID(),
            candidateId,
            objectId: parsed.data.id,
            sourceVersion: parsed.data.version,
            eventType: "candidate-promoted",
            payload: {
              maturity: "promoted",
              health: "active",
              provenance: "Operator approved a knowledge-object version.",
            },
          };
          const eventParsed = LearningEventSchema.safeParse(learningEvent);
          if (!eventParsed.success) throw repositoryError("Promotion learning event is invalid.");
          this.database.prepare(`
            INSERT INTO learning_events(id, occurred_at, event_type, actor, correlation_id, candidate_id, object_id, source_version, payload_json, event_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            learningEvent.id,
            learningEvent.occurredAt,
            learningEvent.eventType,
            learningEvent.actor,
            learningEvent.correlationId,
            learningEvent.candidateId,
            learningEvent.objectId,
            learningEvent.sourceVersion,
            JSON.stringify(learningEvent.payload),
            JSON.stringify(learningEvent),
          );
        }
      });
      transaction();
      return parsed.data;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof Error && error.name === "DomainError") throw error;
      if (isUniqueViolation(error)) throw repositoryError("Knowledge candidate has already been promoted.");
      if (error instanceof DomainError) throw error;
      throw repositoryError("Knowledge candidate promotion could not be persisted.");
    }
  }

  private insertAudit(event: KnowledgeAuditEvent): void {
    const payload = JSON.stringify(event);
    const prior = this.database.prepare("SELECT payload_json FROM knowledge_audits WHERE id = ?").get(event.id) as AuditRow | undefined;
    if (prior !== undefined) {
      if (prior.payload_json !== payload) throw repositoryError("Knowledge audit ID conflicts with existing content.");
      return;
    }
    try {
      this.database.prepare(`INSERT INTO knowledge_audits(id, object_id, candidate_id, action, actor, timestamp, payload_json, learning_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`)
        .run(event.id, event.objectId ?? null, event.candidateId ?? null, event.action, event.actor, event.timestamp, payload);
    } catch (error) {
      if (isUniqueViolation(error)) throw repositoryError("Knowledge audit event already exists.");
      throw repositoryError("Knowledge audit event could not be persisted.");
    }
  }

  private parseCandidate(value: string): KnowledgeCandidate {
    const parsed = KnowledgeCandidateSchema.safeParse(parseJson(value));
    if (!parsed.success) throw repositoryError("Knowledge candidate data is invalid.");
    return parsed.data;
  }

  private parseObject(value: string): KnowledgeObject {
    const parsed = KnowledgeObjectSchema.safeParse(parseJson(value));
    if (!parsed.success) throw repositoryError("Knowledge object data is invalid.");
    return parsed.data;
  }

  private parseAudit(value: string): KnowledgeAuditEvent {
    const parsed = KnowledgeAuditEventSchema.safeParse(parseJson(value));
    if (!parsed.success) throw repositoryError("Knowledge audit data is invalid.");
    return parsed.data;
  }
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw repositoryError("Knowledge evolution data is malformed."); }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}
