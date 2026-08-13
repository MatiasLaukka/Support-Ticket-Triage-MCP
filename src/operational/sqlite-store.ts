import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Ticket,
  TicketId,
  TriageRecommendation,
} from "../domain.js";
import type { CompletedDiagnosis } from "../knowledge-evolution/domain.js";
import type {
  ImportResolution,
  ImportState,
  OperationalOutboxRow,
  OperationalWorkflowSnapshot,
} from "./domain.js";
import {
  OperationalStoreError,
  OperationalUnitOfWork,
  type OperationalImportSourceMetadata,
} from "./unit-of-work.js";

export { OperationalStoreError } from "./unit-of-work.js";

const CURRENT_SCHEMA_VERSION = 2;
const INITIAL_SCHEMA_VERSION = 1;
const DIAGNOSIS_REVIEW_PAYLOAD_MIGRATION = "immutable-diagnosis-review-payload";
const DEFAULT_BUSY_TIMEOUT_MS = 250;
const REQUIRED_TABLES = [
  "schema_migrations",
  "operational_metadata",
  "command_idempotency",
  "tickets",
  "ticket_revisions",
  "conversation_messages",
  "operational_import_resolutions",
  "recommendations",
  "recommendation_revisions",
  "diagnoses",
  "operational_events",
  "decision_trace_events",
  "learning_capture_outbox",
] as const;

interface OperationalSqliteStoreOptions {
  readonly busyTimeoutMs?: number;
}

interface MigrationRow { version: number; name: string; }
interface MetadataRow { key: string; value: string; }
interface SchemaObjectRow {
  type: string;
  name: string;
  table_name: string;
  sql: string | null;
}

export class OperationalSqliteStore {
  private initialized = false;
  private closed = false;

  private constructor(
    readonly filePath: string,
    private readonly database: Database.Database,
  ) {}

  static open(
    path: string,
    options: OperationalSqliteStoreOptions = {},
  ): OperationalSqliteStore {
    const normalizedPath = path.trim();
    if (normalizedPath === "") {
      throw new OperationalStoreError("Operational database path is required.", "PERSISTENCE_ERROR");
    }
    const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 1 || busyTimeoutMs > 5_000) {
      throw new OperationalStoreError(
        "Operational database busy timeout must be an integer from 1 through 5000 milliseconds.",
        "PERSISTENCE_ERROR",
      );
    }
    if (normalizedPath !== ":memory:") mkdirSync(dirname(normalizedPath), { recursive: true });
    try {
      const database = new Database(normalizedPath);
      database.pragma("foreign_keys = ON");
      database.pragma(`busy_timeout = ${busyTimeoutMs}`);
      return new OperationalSqliteStore(normalizedPath, database);
    } catch (error) {
      throw new OperationalStoreError(
        "Operational database could not be opened.",
        "PERSISTENCE_ERROR",
        { cause: error },
      );
    }
  }

  initialize(): void {
    this.assertOpen();
    if (this.initialized) return;
    const tables = this.tableNames();
    if (!tables.has("schema_migrations")) {
      if (tables.size > 0) {
        throw new OperationalStoreError(
          "Corrupt operational schema: migration metadata is missing.",
          "SCHEMA_ERROR",
        );
      }
      this.applyInitialMigration();
    } else {
      this.validateMigrationTable();
    }
    this.validateCurrentSchema();
    this.initialized = true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.initialized = false;
    if (this.database.open) this.database.close();
  }

  transaction<T>(work: (unit: OperationalUnitOfWork) => T): T {
    this.assertInitialized();
    if (isDeclaredAsync(work)) {
      throw new OperationalStoreError(
        "Operational transactions require a synchronous callback.",
        "ASYNC_TRANSACTION",
      );
    }
    try {
      this.database.exec("BEGIN IMMEDIATE");
    } catch (error) {
      throw this.mapPersistenceError(error, "Operational transaction could not begin");
    }
    const unit = new OperationalUnitOfWork(this.database);
    try {
      const result = work(unit);
      if (isPromiseLike(result)) {
        throw new OperationalStoreError(
          "Operational transaction callbacks must not return a Promise.",
          "ASYNC_TRANSACTION",
        );
      }
      unit.assertReadyToCommit();
      try {
        this.database.exec("COMMIT");
      } catch (error) {
        throw this.mapPersistenceError(error, "Operational transaction could not commit");
      }
      return result;
    } catch (error) {
      if (this.database.inTransaction) {
        try {
          this.database.exec("ROLLBACK");
        } catch {
          // Preserve the authoritative transaction failure.
        }
      }
      throw error;
    } finally {
      unit.closeScope();
    }
  }

  readTicket(ticketId: TicketId): Ticket {
    this.assertInitialized();
    return this.withReader((reader) => reader.readTicket(ticketId));
  }

  readRecommendation(id: string): TriageRecommendation | undefined {
    this.assertInitialized();
    return this.withReader((reader) => reader.readRecommendation(id));
  }

  readDiagnosis(id: string): CompletedDiagnosis | undefined {
    this.assertInitialized();
    return this.withReader((reader) => reader.readDiagnosis(id));
  }

  readWorkflowSnapshot(ticketId: TicketId): OperationalWorkflowSnapshot {
    this.assertInitialized();
    const read = this.database.transaction(() =>
      this.withReader((reader) => reader.readWorkflowSnapshot(ticketId)));
    return read();
  }

  readTicketAggregate(ticketId: TicketId): OperationalWorkflowSnapshot {
    return this.readWorkflowSnapshot(ticketId);
  }

  listWorkflowSnapshots(): OperationalWorkflowSnapshot[] {
    this.assertInitialized();
    const read = this.database.transaction(() => this.withReader((reader) =>
      reader.readTicketIds().map((ticketId) => reader.readWorkflowSnapshot(ticketId))));
    return read();
  }

  readOutbox(id: string): OperationalOutboxRow | undefined {
    this.assertInitialized();
    return this.withReader((reader) => reader.readOutbox(id));
  }

  listPendingOutbox(staleBefore?: string): OperationalOutboxRow[] {
    this.assertInitialized();
    return this.withReader((reader) => reader.listPendingOutbox(staleBefore));
  }

  readImportState(): ImportState {
    this.assertInitialized();
    return this.withReader((reader) => reader.readImportState());
  }

  listImportResolutions(): ImportResolution[] {
    this.assertInitialized();
    return this.withReader((reader) => reader.listImportResolutions());
  }

  listImportSources(): OperationalImportSourceMetadata[] {
    this.assertInitialized();
    return [...(this.withReader((reader) => reader.readImportManifest()) ?? [])];
  }

  listImportedSourceIds(): string[] {
    this.assertInitialized();
    return [...this.withReader((reader) => reader.readImportedSourceIds())];
  }

  assertRuntimeMutationsAllowed(): void {
    const state = this.readImportState();
    if (state === "empty" || state === "import-in-progress") {
      throw new OperationalStoreError(
        `Operational database is ${state}; initialize or complete the operational import before runtime mutations.`,
        "STATE_ERROR",
      );
    }
  }

  private withReader<T>(work: (reader: OperationalUnitOfWork) => T): T {
    const reader = new OperationalUnitOfWork(this.database);
    try {
      return work(reader);
    } finally {
      reader.closeScope();
    }
  }

  private applyInitialMigration(): void {
    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.database.exec(INITIAL_SCHEMA_SQL);
      const appliedAt = new Date().toISOString();
      const insertMigration = this.database.prepare(
        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
      );
      insertMigration.run(INITIAL_SCHEMA_VERSION, "initial-operational-schema", appliedAt);
      insertMigration.run(CURRENT_SCHEMA_VERSION, DIAGNOSIS_REVIEW_PAYLOAD_MIGRATION, appliedAt);
      this.database.prepare(
        "INSERT INTO operational_metadata(key, value) VALUES (?, ?), (?, ?)",
      ).run("schema_version", String(CURRENT_SCHEMA_VERSION), "import_state", "empty");
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) {
        try { this.database.exec("ROLLBACK"); } catch { /* preserve the migration error */ }
      }
      throw new OperationalStoreError(
        "Operational schema migration failed.",
        "SCHEMA_ERROR",
        { cause: error },
      );
    }
  }

  private validateMigrationTable(): void {
    const columns = this.database.prepare("PRAGMA table_info(schema_migrations)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const expected = [
      { name: "version", type: "INTEGER", notnull: 0, pk: 1 },
      { name: "name", type: "TEXT", notnull: 1, pk: 0 },
      { name: "applied_at", type: "TEXT", notnull: 1, pk: 0 },
    ];
    if (JSON.stringify(columns.map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }))) !== JSON.stringify(expected)) {
      throw new OperationalStoreError(
        "Corrupt operational schema: migration metadata has an unexpected structure.",
        "SCHEMA_ERROR",
      );
    }
    const migrations = this.database.prepare(
      "SELECT version, name FROM schema_migrations ORDER BY version ASC",
    ).all() as MigrationRow[];
    const latest = migrations.at(-1)?.version;
    if (latest !== undefined && latest > CURRENT_SCHEMA_VERSION) {
      throw new OperationalStoreError(
        `Operational database uses newer schema version ${latest}; this runtime supports ${CURRENT_SCHEMA_VERSION}.`,
        "SCHEMA_ERROR",
      );
    }
    if (
      migrations.length === 1
      && migrations[0]?.version === INITIAL_SCHEMA_VERSION
      && migrations[0]?.name === "initial-operational-schema"
    ) {
      this.validateLegacySchemaBeforeMigration();
      this.applyDiagnosisReviewPayloadMigration();
      return;
    }
    if (
      migrations.length !== 2
      || migrations[0]?.version !== INITIAL_SCHEMA_VERSION
      || migrations[0]?.name !== "initial-operational-schema"
      || migrations[1]?.version !== CURRENT_SCHEMA_VERSION
      || migrations[1]?.name !== DIAGNOSIS_REVIEW_PAYLOAD_MIGRATION
    ) {
      throw new OperationalStoreError(
        "Corrupt operational schema: migration history is incomplete or inconsistent.",
        "SCHEMA_ERROR",
      );
    }
  }

  private applyDiagnosisReviewPayloadMigration(): void {
    const diagnosisCount = (this.database.prepare(
      "SELECT COUNT(*) AS count FROM diagnoses",
    ).get() as { count: number }).count;
    if (diagnosisCount > 0) {
      throw new OperationalStoreError(
        "Operational diagnosis rows cannot be upgraded losslessly because their original review audits were not stored.",
        "SCHEMA_ERROR",
      );
    }
    try {
      this.database.exec("BEGIN IMMEDIATE");
      const appliedAt = new Date().toISOString();
      this.database.prepare(
        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
      ).run(CURRENT_SCHEMA_VERSION, DIAGNOSIS_REVIEW_PAYLOAD_MIGRATION, appliedAt);
      this.database.prepare(
        "UPDATE operational_metadata SET value = ? WHERE key = 'schema_version'",
      ).run(String(CURRENT_SCHEMA_VERSION));
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) {
        try { this.database.exec("ROLLBACK"); } catch { /* preserve the migration error */ }
      }
      throw new OperationalStoreError(
        "Operational diagnosis review payload migration failed.",
        "SCHEMA_ERROR",
        { cause: error },
      );
    }
  }

  private validateLegacySchemaBeforeMigration(): void {
    this.validatePhysicalSchema();
    const metadata = this.database.prepare(
      "SELECT key, value FROM operational_metadata WHERE key IN ('schema_version', 'import_state')",
    ).all() as MetadataRow[];
    const metadataMap = new Map(metadata.map(({ key, value }) => [key, value]));
    if (
      metadataMap.get("schema_version") !== String(INITIAL_SCHEMA_VERSION)
      || !["empty", "import-in-progress", "imported", "native"].includes(metadataMap.get("import_state") ?? "")
    ) {
      throw new OperationalStoreError(
        "Corrupt operational schema: legacy schema metadata is inconsistent.",
        "SCHEMA_ERROR",
      );
    }
  }

  private validateCurrentSchema(): void {
    this.validatePhysicalSchema();
    const migrations = this.database.prepare(
      "SELECT version, name FROM schema_migrations ORDER BY version ASC",
    ).all() as MigrationRow[];
    const metadata = this.database.prepare(
      "SELECT key, value FROM operational_metadata WHERE key IN ('schema_version', 'import_state')",
    ).all() as MetadataRow[];
    const metadataMap = new Map(metadata.map(({ key, value }) => [key, value]));
    if (
      migrations.at(-1)?.version !== CURRENT_SCHEMA_VERSION
      || metadataMap.get("schema_version") !== String(CURRENT_SCHEMA_VERSION)
      || !["empty", "import-in-progress", "imported", "native"].includes(metadataMap.get("import_state") ?? "")
    ) {
      throw new OperationalStoreError(
        "Corrupt operational schema: schema metadata is inconsistent.",
        "SCHEMA_ERROR",
      );
    }
  }

  private validatePhysicalSchema(): void {
    const tables = this.tableNames();
    const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table));
    if (missingTables.length > 0) {
      throw new OperationalStoreError(
        `Corrupt operational schema: required tables are missing (${missingTables.join(", ")}).`,
        "SCHEMA_ERROR",
      );
    }
    if (this.schemaSignature() !== expectedSchemaSignature()) {
      throw new OperationalStoreError(
        "Corrupt operational schema: tables, columns, constraints, indexes, or triggers differ from the current schema.",
        "SCHEMA_ERROR",
      );
    }
    const foreignKeys = this.database.pragma("foreign_keys", { simple: true });
    if (foreignKeys !== 1) {
      throw new OperationalStoreError(
        "Operational database foreign-key enforcement could not be enabled.",
        "SCHEMA_ERROR",
      );
    }
    const foreignKeyViolations = this.database.pragma("foreign_key_check") as unknown[];
    if (foreignKeyViolations.length > 0) {
      throw new OperationalStoreError(
        "Corrupt operational schema: foreign-key violations were detected.",
        "SCHEMA_ERROR",
      );
    }
  }

  private tableNames(): Set<string> {
    const rows = this.database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string }>;
    return new Set(rows.map(({ name }) => name));
  }

  private schemaSignature(): string {
    return schemaSignatureFor(this.database);
  }

  private assertOpen(): void {
    if (this.closed || !this.database.open) {
      throw new OperationalStoreError("Operational database is closed.", "CLOSED");
    }
  }

  private assertInitialized(): void {
    this.assertOpen();
    if (!this.initialized) {
      throw new OperationalStoreError("Operational database has not been initialized.", "NOT_INITIALIZED");
    }
  }

  private mapPersistenceError(error: unknown, action: string): OperationalStoreError {
    const detail = error instanceof Error ? error.message : "unknown SQLite error";
    return new OperationalStoreError(`${action}: ${detail}.`, "PERSISTENCE_ERROR", { cause: error });
  }
}

let cachedExpectedSchemaSignature: string | undefined;

function expectedSchemaSignature(): string {
  if (cachedExpectedSchemaSignature !== undefined) return cachedExpectedSchemaSignature;
  const reference = new Database(":memory:");
  try {
    reference.exec(INITIAL_SCHEMA_SQL);
    cachedExpectedSchemaSignature = schemaSignatureFor(reference);
    return cachedExpectedSchemaSignature;
  } finally {
    reference.close();
  }
}

function schemaSignatureFor(database: Database.Database): string {
  const rows = database.prepare(`
    SELECT type, name, tbl_name AS table_name, sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
      AND type IN ('table', 'index', 'trigger')
    ORDER BY type ASC, name ASC
  `).all() as SchemaObjectRow[];
  return JSON.stringify(rows.map((row) => ({
    type: row.type,
    name: row.name,
    tableName: row.table_name,
    sql: normalizeSchemaSql(row.sql),
  })));
}

function normalizeSchemaSql(sql: string | null): string {
  return (sql ?? "").replace(/\s+/g, " ").trim();
}

function isDeclaredAsync(work: Function): boolean {
  return work.constructor.name === "AsyncFunction";
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  ) && "then" in value && typeof (value as { then?: unknown }).then === "function";
}

const INITIAL_SCHEMA_SQL = `
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE operational_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE command_idempotency (
    command_id TEXT PRIMARY KEY NOT NULL,
    operation TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE tickets (
    id TEXT PRIMARY KEY NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
  CREATE TABLE operational_events (
    id TEXT PRIMARY KEY NOT NULL,
    ticket_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    occurred_at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    command_id TEXT NOT NULL,
    facts_json TEXT NOT NULL,
    event_json TEXT NOT NULL,
    UNIQUE(ticket_id, sequence),
    UNIQUE(id, ticket_id),
    FOREIGN KEY(ticket_id) REFERENCES tickets(id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TABLE ticket_revisions (
    ticket_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    operational_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY(ticket_id, revision),
    FOREIGN KEY(ticket_id) REFERENCES tickets(id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(operational_event_id, ticket_id) REFERENCES operational_events(id, ticket_id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TABLE recommendations (
    id TEXT PRIMARY KEY NOT NULL,
    ticket_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
    resolution TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TABLE conversation_messages (
    id TEXT PRIMARY KEY NOT NULL,
    ticket_id TEXT NOT NULL,
    operational_event_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('customer', 'support')),
    created_at TEXT NOT NULL,
    recommendation_id TEXT,
    payload_json TEXT NOT NULL,
    FOREIGN KEY(operational_event_id, ticket_id) REFERENCES operational_events(id, ticket_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(recommendation_id) REFERENCES recommendations(id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TABLE operational_import_resolutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    actor TEXT NOT NULL,
    resolved_at TEXT NOT NULL,
    command_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    resolution_json TEXT NOT NULL,
    UNIQUE(source_id, command_id)
  );
  CREATE TABLE recommendation_revisions (
    recommendation_id TEXT NOT NULL,
    ticket_id TEXT NOT NULL,
    operational_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY(recommendation_id, operational_event_id),
    FOREIGN KEY(recommendation_id) REFERENCES recommendations(id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(operational_event_id, ticket_id) REFERENCES operational_events(id, ticket_id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TABLE diagnoses (
    id TEXT PRIMARY KEY NOT NULL,
    ticket_id TEXT NOT NULL,
    operational_event_id TEXT NOT NULL UNIQUE,
    completed_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    FOREIGN KEY(operational_event_id, ticket_id) REFERENCES operational_events(id, ticket_id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TABLE decision_trace_events (
    id TEXT PRIMARY KEY NOT NULL,
    operational_event_id TEXT NOT NULL,
    ticket_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    trace_type TEXT NOT NULL,
    trace_json TEXT NOT NULL,
    FOREIGN KEY(operational_event_id, ticket_id) REFERENCES operational_events(id, ticket_id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TABLE learning_capture_outbox (
    id TEXT PRIMARY KEY NOT NULL,
    operational_event_id TEXT NOT NULL,
    delivery_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'dead-letter')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    created_at TEXT NOT NULL,
    claimed_by TEXT,
    claimed_at TEXT,
    delivered_at TEXT,
    error_code TEXT,
    envelope_json TEXT NOT NULL,
    FOREIGN KEY(operational_event_id) REFERENCES operational_events(id) DEFERRABLE INITIALLY DEFERRED
  );

  CREATE INDEX command_idempotency_operation_idx ON command_idempotency(operation, command_id);
  CREATE INDEX operational_events_ticket_causal_idx ON operational_events(ticket_id, sequence);
  CREATE INDEX operational_events_command_idx ON operational_events(command_id);
  CREATE INDEX operational_events_occurred_idx ON operational_events(ticket_id, occurred_at);
  CREATE INDEX ticket_revisions_event_idx ON ticket_revisions(operational_event_id);
  CREATE INDEX conversation_messages_ticket_event_idx ON conversation_messages(ticket_id, operational_event_id);
  CREATE INDEX conversation_messages_recommendation_idx ON conversation_messages(recommendation_id);
  CREATE INDEX recommendations_ticket_resolution_idx ON recommendations(ticket_id, resolution, created_at);
  CREATE INDEX recommendation_revisions_event_idx ON recommendation_revisions(operational_event_id);
  CREATE INDEX diagnoses_ticket_event_idx ON diagnoses(ticket_id, operational_event_id);
  CREATE INDEX decision_trace_events_ticket_event_idx ON decision_trace_events(ticket_id, operational_event_id);
  CREATE INDEX learning_capture_outbox_status_idx ON learning_capture_outbox(status, created_at, id);
  CREATE INDEX learning_capture_outbox_event_idx ON learning_capture_outbox(operational_event_id);

  CREATE TRIGGER operational_events_no_update
  BEFORE UPDATE ON operational_events
  BEGIN SELECT RAISE(ABORT, 'operational events are append-only'); END;
  CREATE TRIGGER operational_events_no_delete
  BEFORE DELETE ON operational_events
  BEGIN SELECT RAISE(ABORT, 'operational events are append-only'); END;
  CREATE TRIGGER decision_trace_events_no_update
  BEFORE UPDATE ON decision_trace_events
  BEGIN SELECT RAISE(ABORT, 'decision trace events are append-only'); END;
  CREATE TRIGGER decision_trace_events_no_delete
  BEFORE DELETE ON decision_trace_events
  BEGIN SELECT RAISE(ABORT, 'decision trace events are append-only'); END;
`;
