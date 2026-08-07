import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  canonicalLearningJson,
  LearningEventSchema,
  LearningLedgerError,
  type LearningEvent,
  type LearningEventFilters,
  type LearningLedger,
} from "./learning-ledger.js";

interface LearningEventRow {
  id: string;
  event_json: string;
}

export class SqliteLearningLedger implements LearningLedger {
  private readonly database: Database.Database;
  private initialized = false;

  constructor(readonly filePath: string) {
    if (filePath !== ":memory:") mkdirSync(dirname(filePath), { recursive: true });
    try {
      this.database = new Database(filePath);
      this.database.pragma("foreign_keys = ON");
    } catch (error) {
      throw new LearningLedgerError("Learning ledger database could not be opened.", "PERSISTENCE_ERROR", { cause: error });
    }
  }

  async initialize(): Promise<void> {
    try {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS learning_events (
          id TEXT PRIMARY KEY NOT NULL,
          occurred_at TEXT NOT NULL,
          occurred_at_epoch INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          actor TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          ticket_id TEXT,
          diagnosis_id TEXT,
          candidate_id TEXT,
          object_id TEXT,
          source_version INTEGER,
          payload_json TEXT NOT NULL,
          event_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS learning_events_type_idx ON learning_events(event_type);
        CREATE INDEX IF NOT EXISTS learning_events_ticket_idx ON learning_events(ticket_id);
        CREATE INDEX IF NOT EXISTS learning_events_object_idx ON learning_events(object_id);
        CREATE INDEX IF NOT EXISTS learning_events_occurred_epoch_idx ON learning_events(occurred_at_epoch, id);
        INSERT INTO schema_meta(key, value) VALUES ('learning-ledger', '1')
          ON CONFLICT(key) DO NOTHING;
      `);
      this.ensureColumn("learning_events", "occurred_at_epoch", "INTEGER");
      this.backfillEpochs();
      this.initialized = true;
    } catch (error) {
      throw new LearningLedgerError("Learning ledger schema could not be initialized.", "PERSISTENCE_ERROR", { cause: error });
    }
  }

  async append(event: LearningEvent): Promise<void> {
    this.ensureInitialized();
    const parsed = LearningEventSchema.safeParse(event);
    if (!parsed.success) {
      throw new LearningLedgerError("Learning event failed schema validation.", "INVALID_EVENT", { cause: parsed.error });
    }
    try {
      this.appendParsed(parsed.data);
    } catch (error) {
      if (error instanceof LearningLedgerError) throw error;
      throw new LearningLedgerError("Learning event could not be persisted.", "PERSISTENCE_ERROR", { cause: error });
    }
  }

  async appendBatch(events: readonly LearningEvent[]): Promise<void> {
    this.ensureInitialized();
    const parsed = events.map((event) => LearningEventSchema.safeParse(event));
    const invalid = parsed.find((result) => !result.success);
    if (invalid !== undefined && !invalid.success) {
      throw new LearningLedgerError("Learning event batch failed schema validation.", "INVALID_EVENT", { cause: invalid.error });
    }
    try {
      const transaction = this.database.transaction((items: typeof parsed) => {
        for (const result of items) {
          if (!result.success) continue;
          this.appendParsed(result.data);
        }
      });
      transaction(parsed);
    } catch (error) {
      if (error instanceof LearningLedgerError) throw error;
      throw new LearningLedgerError("Learning event batch could not be persisted.", "PERSISTENCE_ERROR", { cause: error });
    }
  }

  async list(filters: LearningEventFilters = {}): Promise<LearningEvent[]> {
    const events = await this.snapshot();
    const occurredAfter = filters.occurredAfter === undefined ? undefined : timestampMs(filters.occurredAfter);
    const occurredBefore = filters.occurredBefore === undefined ? undefined : timestampMs(filters.occurredBefore);
    const eventTypes = filters.eventTypes === undefined ? undefined : new Set(filters.eventTypes);
    return events.filter((event) => {
      if (filters.eventType !== undefined && event.eventType !== filters.eventType) return false;
      if (eventTypes !== undefined && !eventTypes.has(event.eventType)) return false;
      if (filters.ticketId !== undefined && event.ticketId !== filters.ticketId) return false;
      if (filters.diagnosisId !== undefined && event.diagnosisId !== filters.diagnosisId) return false;
      if (filters.candidateId !== undefined && event.candidateId !== filters.candidateId) return false;
      if (filters.objectId !== undefined && event.objectId !== filters.objectId) return false;
      const occurredAt = timestampMs(event.occurredAt);
      if (occurredAfter !== undefined && occurredAt < occurredAfter) return false;
      if (occurredBefore !== undefined && occurredAt > occurredBefore) return false;
      return true;
    });
  }

  async snapshot(): Promise<readonly LearningEvent[]> {
    this.ensureInitialized();
    try {
      const readSnapshot = this.database.transaction(() => {
        const rows = this.database.prepare(
          "SELECT event_json FROM learning_events ORDER BY occurred_at_epoch ASC, id ASC",
        ).all() as Array<{ event_json: string }>;
        return rows.map((row) => {
        let decoded: unknown;
        try {
          decoded = JSON.parse(row.event_json) as unknown;
        } catch (error) {
          throw new LearningLedgerError("Learning ledger contains invalid event JSON.", "PERSISTENCE_ERROR", { cause: error });
        }
        const parsed = LearningEventSchema.safeParse(decoded);
        if (!parsed.success) throw new LearningLedgerError("Learning ledger contains an invalid event.", "PERSISTENCE_ERROR", { cause: parsed.error });
        return parsed.data;
      });
      });
      return readSnapshot();
    } catch (error) {
      if (error instanceof LearningLedgerError) throw error;
      throw new LearningLedgerError("Learning events could not be queried.", "PERSISTENCE_ERROR", { cause: error });
    }
  }

  async has(id: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      const row = this.database.prepare("SELECT 1 AS found FROM learning_events WHERE id = ? LIMIT 1").get(id) as { found?: number } | undefined;
      return row?.found === 1;
    } catch (error) {
      throw new LearningLedgerError("Learning event existence could not be queried.", "PERSISTENCE_ERROR", { cause: error });
    }
  }

  /** Provides the shared handle for the transaction-safe knowledge store. */
  getDatabase(): Database.Database {
    this.ensureInitialized();
    return this.database;
  }

  close(): void {
    if (this.database.open) this.database.close();
  }

  private appendParsed(event: LearningEvent): void {
    const eventJson = canonicalLearningJson(event);
    const prior = this.database.prepare("SELECT id, event_json FROM learning_events WHERE id = ?").get(event.id) as LearningEventRow | undefined;
    if (prior !== undefined) {
      if (prior.event_json !== eventJson) {
        throw new LearningLedgerError(`Learning event ID ${event.id} conflicts with existing content.`, "EVENT_CONFLICT");
      }
      return;
    }
    this.database.prepare(`
      INSERT INTO learning_events (
        id, occurred_at, occurred_at_epoch, event_type, actor, correlation_id,
        ticket_id, diagnosis_id, candidate_id, object_id, source_version,
        payload_json, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.occurredAt,
      timestampMs(event.occurredAt),
      event.eventType,
      event.actor,
      event.correlationId,
      event.ticketId ?? null,
      event.diagnosisId ?? null,
      event.candidateId ?? null,
      event.objectId ?? null,
      event.sourceVersion ?? null,
      canonicalLearningJson(event.payload),
      eventJson,
    );
  }

  private ensureInitialized(): void {
    if (!this.initialized) throw new LearningLedgerError("Learning ledger has not been initialized.", "PERSISTENCE_ERROR");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private backfillEpochs(): void {
    const rows = this.database.prepare("SELECT id, occurred_at FROM learning_events WHERE occurred_at_epoch IS NULL").all() as Array<{ id: string; occurred_at: string }>;
    const update = this.database.prepare("UPDATE learning_events SET occurred_at_epoch = ? WHERE id = ?");
    const transaction = this.database.transaction(() => {
      for (const row of rows) update.run(timestampMs(row.occurred_at), row.id);
    });
    transaction();
  }
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new LearningLedgerError("Learning timestamp is invalid.", "PERSISTENCE_ERROR");
  return parsed;
}
