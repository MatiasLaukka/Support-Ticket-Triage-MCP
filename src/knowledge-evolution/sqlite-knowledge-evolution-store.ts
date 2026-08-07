import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { DomainError } from "../errors.js";
import { KnowledgeCandidateReadSchema, KnowledgeCandidateWriteSchema, KnowledgeObjectReadSchema, KnowledgeObjectWriteSchema, type KnowledgeCandidate, type KnowledgeObject } from "./domain.js";
import { KnowledgeAuditEventSchema, type KnowledgeAuditEvent, type KnowledgeAuditFilters } from "./knowledge-audit-repository.js";
import { LearningEventSchema, type LearningEvent } from "./learning-ledger.js";
import type { KnowledgeReuseSnapshot, KnowledgeVersionStore } from "./knowledge-version-store.js";
import { repositoryError } from "./repository-utils.js";

interface JsonRow { payload_json: string; }
interface AuditRow { payload_json: string; }
interface EventRow { event_json: string; }
interface HeadTransitionRow { object_id: string; to_version: number; }
interface HeadRow { object_id: string; version: number; }
interface VersionRow extends JsonRow { approved_at: string; }
type SupersededEvent = Extract<LearningEvent, { eventType: "knowledge-version-superseded" }>;
type PromotedEvent = Extract<LearningEvent, { eventType: "candidate-promoted" }>;
type ReactivatedEvent = Extract<LearningEvent, { eventType: "knowledge-version-reactivated" }>;

export class SqliteKnowledgeEvolutionStore implements KnowledgeVersionStore {
  constructor(
    private readonly database: Database.Database,
    private readonly options: { reactivationAuthorizer?: (actorId: string) => boolean } = {},
  ) {}

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
          learning_governance TEXT NOT NULL DEFAULT 'legacy',
          payload_json TEXT NOT NULL,
          PRIMARY KEY (object_id, version)
        );
        CREATE TABLE IF NOT EXISTS knowledge_object_heads (
          object_id TEXT PRIMARY KEY NOT NULL,
          version INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS knowledge_head_transitions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          object_id TEXT NOT NULL,
          from_version INTEGER,
          to_version INTEGER NOT NULL,
          transition_kind TEXT NOT NULL,
          effective_at TEXT NOT NULL,
          correlation_id TEXT NOT NULL
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
        CREATE INDEX IF NOT EXISTS knowledge_versions_effective_idx ON knowledge_versions(approved_at, object_id, version);
        CREATE INDEX IF NOT EXISTS knowledge_head_transitions_asof_idx ON knowledge_head_transitions(effective_at, object_id, id);
        CREATE INDEX IF NOT EXISTS knowledge_audits_candidate_idx ON knowledge_audits(candidate_id, action);
      `);
      this.ensureColumn("knowledge_versions", "learning_governance", "TEXT NOT NULL DEFAULT 'legacy'");
      this.database.exec(`
        INSERT OR IGNORE INTO knowledge_object_heads(object_id, version)
        SELECT object_id, MAX(version) FROM knowledge_versions GROUP BY object_id;
        INSERT INTO knowledge_head_transitions(object_id, from_version, to_version, transition_kind, effective_at, correlation_id)
        SELECT versions.object_id, NULL, heads.version, 'legacy-backfill', versions.approved_at, '00000000-0000-4000-8000-000000000000'
        FROM knowledge_object_heads AS heads
        JOIN knowledge_versions AS versions ON versions.object_id = heads.object_id AND versions.version = heads.version
        WHERE NOT EXISTS (SELECT 1 FROM knowledge_head_transitions AS transitions WHERE transitions.object_id = heads.object_id);
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
    const parsed = KnowledgeCandidateWriteSchema.safeParse(candidate);
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
      SELECT versions.payload_json FROM knowledge_versions AS versions
      LEFT JOIN knowledge_object_heads AS heads ON heads.object_id = versions.object_id
      WHERE heads.version = versions.version
        OR (heads.object_id IS NULL AND versions.learning_governance = 'legacy'
          AND versions.version = (SELECT MAX(legacy_versions.version) FROM knowledge_versions AS legacy_versions WHERE legacy_versions.object_id = versions.object_id))
      ORDER BY versions.approved_at ASC, versions.object_id ASC
    `).all() as JsonRow[];
    return rows.map((row) => this.parseObject(row.payload_json));
  }

  async listVersions(objectId: string): Promise<KnowledgeObject[]> {
    const rows = this.database.prepare("SELECT payload_json FROM knowledge_versions WHERE object_id = ? ORDER BY version ASC").all(objectId) as JsonRow[];
    return rows.map((row) => this.parseObject(row.payload_json));
  }

  async listVersionsAsOf(asOf: string): Promise<KnowledgeObject[]> {
    const rows = this.database.prepare("SELECT payload_json FROM knowledge_versions WHERE approved_at <= ? ORDER BY approved_at ASC, object_id ASC, version ASC").all(asOf) as JsonRow[];
    return rows.map((row) => this.parseObject(row.payload_json));
  }

  async listHeadMappings(): Promise<ReadonlyMap<string, number>> {
    return this.readHeads("SELECT object_id, version FROM knowledge_object_heads ORDER BY object_id ASC");
  }

  async listHeadMappingsAsOf(asOf: string): Promise<ReadonlyMap<string, number>> {
    return this.replayHeads(asOf);
  }

  async snapshotForReuse(asOf: string): Promise<KnowledgeReuseSnapshot> {
    const transaction = this.database.transaction(() => {
      const versions = this.database.prepare("SELECT payload_json FROM knowledge_versions WHERE approved_at <= ? ORDER BY approved_at ASC, object_id ASC, version ASC")
        .all(asOf) as JsonRow[];
      const transitionRows = this.database.prepare(`SELECT object_id, to_version FROM knowledge_head_transitions
        WHERE effective_at <= ? ORDER BY effective_at ASC, id ASC`).all(asOf) as HeadTransitionRow[];
      const heads = new Map<string, number>();
      for (const transition of transitionRows) heads.set(transition.object_id, transition.to_version);
      const eventRows = this.database.prepare("SELECT event_json FROM learning_events WHERE occurred_at <= ? ORDER BY occurred_at ASC, id ASC")
        .all(asOf) as EventRow[];
      return {
        versions: versions.map((row) => this.parseObject(row.payload_json)),
        heads,
        events: eventRows.map((row) => this.parseLearningEvent(row.event_json)),
      } satisfies KnowledgeReuseSnapshot;
    });
    return transaction();
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

  async promoteReplacement(input: Parameters<KnowledgeVersionStore["promoteReplacement"]>[0]): Promise<KnowledgeObject> {
    const { candidateId, expectedCandidateVersion, expectedHeadVersion, promotionAudit, supersededEvent, promotionEvent } = input;
    const parsed = KnowledgeObjectWriteSchema.safeParse({ ...input.approved, version: expectedHeadVersion + 1, learningGovernance: "ledger" });
    if (!parsed.success || parsed.data.status !== "approved") throw repositoryError("Replacement knowledge object is invalid.");
    const approval = parsed.data.approval;
    if (approval === undefined) throw repositoryError("Approved knowledge objects require approval metadata.");
    const supersession = this.parseSupersededEvent(supersededEvent, parsed.data.id, expectedHeadVersion);
    const promotion = this.parsePromotedEvent(promotionEvent, parsed.data.id, expectedHeadVersion + 1);
    const audit = KnowledgeAuditEventSchema.safeParse(promotionAudit);
    if (!audit.success || audit.data.action !== "approved" || audit.data.candidateId !== candidateId || audit.data.objectId !== parsed.data.id ||
      audit.data.actor !== approval.approvedBy || audit.data.timestamp !== approval.approvedAt ||
      supersession.correlationId !== promotion.correlationId ||
      supersession.occurredAt !== approval.approvedAt || promotion.occurredAt !== approval.approvedAt ||
      supersession.actor !== approval.approvedBy || promotion.actor !== approval.approvedBy ||
      supersession.candidateId !== undefined || promotion.candidateId !== candidateId ||
      supersession.payload.replacementVersion !== expectedHeadVersion + 1) {
      throw repositoryError("Promotion audit is invalid.");
    }
    try {
      const transaction = this.database.transaction(() => {
        const candidateRow = this.database.prepare("SELECT version, payload_json FROM knowledge_candidates WHERE id = ?").get(candidateId) as { version?: number; payload_json?: string } | undefined;
        if (candidateRow === undefined || candidateRow.payload_json === undefined) throw repositoryError("Knowledge candidate was not found.");
        if (candidateRow.version !== expectedCandidateVersion) throw new DomainError("Knowledge candidate version is stale.", "STALE_APPROVAL");
        const candidate = this.parseCandidate(candidateRow.payload_json);
        if (candidate.objectId !== parsed.data.id || candidate.sourceVersion !== expectedHeadVersion) {
          throw repositoryError("Knowledge replacement candidate does not match the current head.");
        }
        this.assertHead(parsed.data.id, expectedHeadVersion);
        this.database.prepare("INSERT INTO knowledge_versions(object_id, version, approved_at, learning_governance, payload_json) VALUES (?, ?, ?, ?, ?)")
          .run(parsed.data.id, parsed.data.version, approval.approvedAt, "ledger", JSON.stringify(parsed.data));
        const updated = this.database.prepare("UPDATE knowledge_object_heads SET version = ? WHERE object_id = ? AND version = ?")
          .run(parsed.data.version, parsed.data.id, expectedHeadVersion);
        if (updated.changes !== 1) throw new DomainError("Knowledge object head is stale.", "STALE_APPROVAL");
        this.insertTransition(parsed.data.id, expectedHeadVersion, parsed.data.version, "replacement", approval.approvedAt, promotion.correlationId);
        this.insertAudit(promotionAudit);
        this.insertLearningEvent(supersededEvent);
        this.insertLearningEvent(promotionEvent);
      });
      transaction();
      return parsed.data;
    } catch (error) { throw this.mapPromotionError(error); }
  }

  async reactivateVersion(input: Parameters<KnowledgeVersionStore["reactivateVersion"]>[0]): Promise<KnowledgeObject> {
    if (this.options.reactivationAuthorizer?.(input.actorId.trim()) !== true) {
      throw new DomainError("Actor is not authorized to reactivate knowledge versions.", "INVALID_APPROVAL_FIELDS");
    }
    if (input.actorId.trim() === "" || input.reason.trim() === "") throw new DomainError("An actor and reason are required for reactivation.", "INVALID_APPROVAL_FIELDS");
    const actorId = input.actorId.trim();
    const reason = input.reason.trim();
    const supersession = this.parseSupersededEvent(input.supersededEvent, input.objectId, input.expectedHeadVersion);
    const reactivation = this.parseReactivatedEvent(input.reactivatedEvent, input.objectId, input.sourceVersion);
    if (supersession.correlationId !== reactivation.correlationId ||
      supersession.occurredAt !== input.occurredAt || reactivation.occurredAt !== input.occurredAt ||
      supersession.actor !== actorId || reactivation.actor !== actorId ||
      supersession.candidateId !== undefined || reactivation.candidateId !== undefined ||
      supersession.payload.replacementVersion !== input.sourceVersion ||
      supersession.payload.provenance !== reason || reactivation.payload.provenance !== reason) {
      throw repositoryError("Reactivation events do not match the requested transition.");
    }
    try {
      const transaction = this.database.transaction(() => {
        this.assertHead(input.objectId, input.expectedHeadVersion);
        const target = this.database.prepare("SELECT payload_json, approved_at FROM knowledge_versions WHERE object_id = ? AND version = ?").get(input.objectId, input.sourceVersion) as VersionRow | undefined;
        if (target === undefined) throw repositoryError("Knowledge version was not found.");
        const displaced = this.database.prepare("SELECT approved_at FROM knowledge_versions WHERE object_id = ? AND version = ?").get(input.objectId, input.expectedHeadVersion) as { approved_at?: string } | undefined;
        const latestTransition = this.database.prepare("SELECT effective_at FROM knowledge_head_transitions WHERE object_id = ? ORDER BY effective_at DESC, id DESC LIMIT 1").get(input.objectId) as { effective_at?: string } | undefined;
        if (displaced?.approved_at === undefined || latestTransition?.effective_at === undefined ||
          input.occurredAt < target.approved_at || input.occurredAt < displaced.approved_at || input.occurredAt < latestTransition.effective_at) {
          throw repositoryError("Knowledge reactivation cannot precede an effective version transition.");
        }
        const updated = this.database.prepare("UPDATE knowledge_object_heads SET version = ? WHERE object_id = ? AND version = ?")
          .run(input.sourceVersion, input.objectId, input.expectedHeadVersion);
        if (updated.changes !== 1) throw new DomainError("Knowledge object head is stale.", "STALE_APPROVAL");
        this.insertTransition(input.objectId, input.expectedHeadVersion, input.sourceVersion, "reactivation", input.occurredAt, reactivation.correlationId);
        this.insertLearningEvent(input.supersededEvent);
        this.insertLearningEvent(input.reactivatedEvent);
      });
      transaction();
      return (await this.listVersions(input.objectId)).find((object) => object.version === input.sourceVersion)!;
    } catch (error) { throw this.mapPromotionError(error); }
  }

  async removeApproved(candidateId: string): Promise<void> {
    void candidateId;
    throw new DomainError("Immutable SQLite knowledge versions cannot be removed.", "UNSUPPORTED_VERSION_TRANSITION");
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
    const parsed = KnowledgeObjectWriteSchema.safeParse(approved);
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
        this.database.prepare("INSERT INTO knowledge_versions(object_id, version, approved_at, learning_governance, payload_json) VALUES (?, ?, ?, ?, ?)")
          .run(parsed.data.id, parsed.data.version, approval.approvedAt, "ledger", JSON.stringify(parsed.data));
        this.database.prepare("INSERT INTO knowledge_object_heads(object_id, version) VALUES (?, ?)").run(parsed.data.id, parsed.data.version);
        const correlationId = randomUUID();
        this.insertTransition(parsed.data.id, null, parsed.data.version, "initial-promotion", approval.approvedAt, correlationId);
        if (audit !== undefined) {
          this.insertAudit(audit);
          const learningEvent: LearningEvent = {
            id: randomUUID(),
            occurredAt: approval.approvedAt,
            actor: approval.approvedBy,
            correlationId,
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

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private async readHeads(query: string, ...params: unknown[]): Promise<ReadonlyMap<string, number>> {
    const rows = this.database.prepare(query).all(...params) as HeadRow[];
    return new Map(rows.map((row) => [row.object_id, row.version]));
  }

  private async replayHeads(asOf: string): Promise<ReadonlyMap<string, number>> {
    const rows = this.database.prepare(`SELECT object_id, to_version FROM knowledge_head_transitions
      WHERE effective_at <= ? ORDER BY effective_at ASC, id ASC`).all(asOf) as HeadTransitionRow[];
    return new Map(rows.map((row) => [row.object_id, row.to_version]));
  }

  private assertHead(objectId: string, expectedVersion: number): void {
    const head = this.database.prepare("SELECT version FROM knowledge_object_heads WHERE object_id = ?").get(objectId) as { version?: number } | undefined;
    if (head === undefined || head.version !== expectedVersion) throw new DomainError("Knowledge object head is stale.", "STALE_APPROVAL");
  }

  private insertTransition(objectId: string, fromVersion: number | null, toVersion: number, kind: string, effectiveAt: string, correlationId: string): void {
    this.database.prepare(`INSERT INTO knowledge_head_transitions(object_id, from_version, to_version, transition_kind, effective_at, correlation_id)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(objectId, fromVersion, toVersion, kind, effectiveAt, correlationId);
  }

  private parseSupersededEvent(event: LearningEvent, objectId: string, sourceVersion: number): SupersededEvent {
    const parsed = LearningEventSchema.safeParse(event);
    if (!parsed.success || parsed.data.eventType !== "knowledge-version-superseded" || parsed.data.objectId !== objectId || parsed.data.sourceVersion !== sourceVersion) {
      throw repositoryError("Knowledge version transition event is invalid.");
    }
    return parsed.data;
  }

  private parsePromotedEvent(event: LearningEvent, objectId: string, sourceVersion: number): PromotedEvent {
    const parsed = LearningEventSchema.safeParse(event);
    if (!parsed.success || parsed.data.eventType !== "candidate-promoted" || parsed.data.objectId !== objectId || parsed.data.sourceVersion !== sourceVersion) {
      throw repositoryError("Knowledge version transition event is invalid.");
    }
    return parsed.data;
  }

  private parseReactivatedEvent(event: LearningEvent, objectId: string, sourceVersion: number): ReactivatedEvent {
    const parsed = LearningEventSchema.safeParse(event);
    if (!parsed.success || parsed.data.eventType !== "knowledge-version-reactivated" || parsed.data.objectId !== objectId || parsed.data.sourceVersion !== sourceVersion) {
      throw repositoryError("Knowledge version transition event is invalid.");
    }
    return parsed.data;
  }

  private insertLearningEvent(event: LearningEvent): void {
    const parsed = LearningEventSchema.safeParse(event);
    if (!parsed.success) throw repositoryError("Knowledge learning event is invalid.");
    this.database.prepare(`INSERT INTO learning_events(id, occurred_at, event_type, actor, correlation_id, candidate_id, object_id, source_version, payload_json, event_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(parsed.data.id, parsed.data.occurredAt, parsed.data.eventType, parsed.data.actor, parsed.data.correlationId,
        parsed.data.candidateId ?? null, parsed.data.objectId ?? null, parsed.data.sourceVersion ?? null,
        JSON.stringify(parsed.data.payload), JSON.stringify(parsed.data));
  }

  private parseLearningEvent(value: string): LearningEvent {
    const parsed = LearningEventSchema.safeParse(parseJson(value));
    if (!parsed.success) throw repositoryError("Learning event data is invalid.");
    return parsed.data;
  }

  private mapPromotionError(error: unknown): Error {
    if (error instanceof DomainError) return error;
    if (error instanceof Error && error.name === "DomainError") return error;
    if (isUniqueViolation(error)) return repositoryError("Knowledge version transition conflicts with existing content.");
    return repositoryError("Knowledge version transition could not be persisted.");
  }

  private parseCandidate(value: string): KnowledgeCandidate {
    const parsed = KnowledgeCandidateReadSchema.safeParse(parseJson(value));
    if (!parsed.success) throw repositoryError("Knowledge candidate data is invalid.");
    return parsed.data;
  }

  private parseObject(value: string): KnowledgeObject {
    const parsed = KnowledgeObjectReadSchema.safeParse(parseJson(value));
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
