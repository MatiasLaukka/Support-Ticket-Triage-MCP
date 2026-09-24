import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TicketIdSchema } from "../domain.js";
import { canonicalJsonStringify } from "./canonical-json.js";
import {
  HYBRID_SHADOW_RUN_PAYLOAD_VERSION,
  LEGACY_HYBRID_SHADOW_RUN_PAYLOAD_VERSION,
  HybridShadowExecutionKeySchema,
  HybridShadowOpportunityIdSchema,
  HybridShadowRunIdSchema,
  parseLegacyHybridShadowRun,
  parseHybridShadowRun,
  parseHybridShadowRunV2,
  type LegacyHybridShadowRun,
  type HybridShadowRunV2,
  type HybridShadowRun,
  type HybridShadowRunId,
} from "./shadow-run-types.js";

const SHADOW_RUN_SCHEMA_VERSION = 2;
const SHADOW_RUN_BUSY_TIMEOUT_MS = 250;
const SHADOW_RUN_V1_COLUMNS = [
  { name: "run_id", type: "TEXT", notnull: 1, primaryKey: 1 },
  { name: "ticket_id", type: "TEXT", notnull: 1, primaryKey: 0 },
  { name: "mode", type: "TEXT", notnull: 1, primaryKey: 0 },
  { name: "provider_id", type: "TEXT", notnull: 1, primaryKey: 0 },
  { name: "model_id", type: "TEXT", notnull: 1, primaryKey: 0 },
  { name: "status", type: "TEXT", notnull: 1, primaryKey: 0 },
  { name: "recorded_at", type: "TEXT", notnull: 1, primaryKey: 0 },
  { name: "payload_version", type: "INTEGER", notnull: 1, primaryKey: 0 },
  { name: "payload_json", type: "TEXT", notnull: 1, primaryKey: 0 },
] as const;
const SHADOW_RUN_COLUMNS = [
  ...SHADOW_RUN_V1_COLUMNS,
  { name: "opportunity_id", type: "TEXT", notnull: 0, primaryKey: 0 },
  { name: "execution_key", type: "TEXT", notnull: 0, primaryKey: 0 },
] as const;
const SHADOW_RUN_V1_INDEXES = ["hybrid_shadow_runs_ticket_order_idx"] as const;
const SHADOW_RUN_INDEXES = [
  ...SHADOW_RUN_V1_INDEXES,
  "hybrid_shadow_runs_opportunity_order_idx",
  "hybrid_shadow_runs_execution_key_unique_idx",
] as const;

interface ShadowRunRow {
  run_id: string;
  ticket_id: string;
  mode: string;
  provider_id: string;
  model_id: string;
  status: string;
  recorded_at: string;
  payload_version: number;
  payload_json: string;
  opportunity_id: string | null;
  execution_key: string | null;
}

export type HybridShadowRunStoreErrorCode =
  | "CLOSED"
  | "NOT_INITIALIZED"
  | "SCHEMA_ERROR"
  | "INVALID_RUN"
  | "INVALID_ID"
  | "RUN_ID_CONFLICT"
  | "EXECUTION_KEY_CONFLICT"
  | "RUN_PAYLOAD_ERROR"
  | "PERSISTENCE_ERROR";

export class HybridShadowRunStoreError extends Error {
  constructor(
    message: string,
    readonly code: HybridShadowRunStoreErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HybridShadowRunStoreError";
  }
}

export interface HybridShadowRunRecordResult {
  outcome: "recorded" | "replayed";
  run: HybridShadowRunV2;
}

export interface HybridShadowRunRepository {
  recordShadowRun(run: HybridShadowRunV2): HybridShadowRunRecordResult;
  recordShadowRun(run: LegacyHybridShadowRun): void;
  recordShadowRun(run: HybridShadowRun): HybridShadowRunRecordResult | undefined;
  recordOrReplayShadowRun(run: HybridShadowRunV2): HybridShadowRunRecordResult;
  getShadowRun(runId: HybridShadowRunId): HybridShadowRun | undefined;
  getShadowRunByExecutionKey(
    executionKey: HybridShadowRunV2["executionKey"],
  ): HybridShadowRunV2 | undefined;
  listShadowRunsForTicket(ticketId: HybridShadowRun["ticketId"]): readonly HybridShadowRun[];
  listShadowRunsForOpportunity(
    opportunityId: HybridShadowRunV2["opportunityId"],
  ): readonly HybridShadowRunV2[];
}

export class SqliteHybridShadowRunRepository implements HybridShadowRunRepository {
  private initialized = false;
  private closed = false;

  private constructor(
    readonly filePath: string,
    private readonly database: Database.Database,
  ) {}

  static open(path: string): SqliteHybridShadowRunRepository {
    const normalizedPath = path.trim();
    if (normalizedPath === "") {
      throw new HybridShadowRunStoreError("Hybrid shadow-run database path is required.", "PERSISTENCE_ERROR");
    }
    if (normalizedPath !== ":memory:") mkdirSync(dirname(normalizedPath), { recursive: true });
    try {
      const database = new Database(normalizedPath);
      database.pragma(`busy_timeout = ${SHADOW_RUN_BUSY_TIMEOUT_MS}`);
      return new SqliteHybridShadowRunRepository(normalizedPath, database);
    } catch (error) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run database could not be opened.",
        "PERSISTENCE_ERROR",
        { cause: error },
      );
    }
  }

  initialize(): void {
    this.assertOpen();
    if (this.initialized) return;

    try {
      const version = Number(this.database.pragma("user_version", { simple: true }));
      if (!Number.isInteger(version) || version < 0 || version > SHADOW_RUN_SCHEMA_VERSION) {
        throw new HybridShadowRunStoreError(
          `Hybrid shadow-run database schema version ${String(version)} is not supported.`,
          "SCHEMA_ERROR",
        );
      }

      if (version === 0) {
        if (this.schemaObjectNames().length > 0) {
          throw new HybridShadowRunStoreError(
            "Hybrid shadow-run database has objects but no supported schema version.",
            "SCHEMA_ERROR",
          );
        }
        try {
          const migrate = this.database.transaction(() => {
            this.database.exec(INITIAL_SCHEMA_SQL);
            this.database.pragma(`user_version = ${SHADOW_RUN_SCHEMA_VERSION}`);
          });
          migrate.immediate();
        } catch (error) {
          if (isSqliteLockError(error)) throw error;
          throw new HybridShadowRunStoreError(
            "Hybrid shadow-run schema migration failed.",
            "SCHEMA_ERROR",
            { cause: error },
          );
        }
      } else if (version === 1) {
        this.migrateV1ToV2();
      }

      this.validateCurrentSchema();
      this.initialized = true;
    } catch (error) {
      if (isSqliteLockError(error)) {
        throw new HybridShadowRunStoreError(
          "Hybrid shadow-run database is busy.",
          "PERSISTENCE_ERROR",
          { cause: error },
        );
      }
      throw error;
    }
  }

  recordShadowRun(run: HybridShadowRunV2): HybridShadowRunRecordResult;
  recordShadowRun(run: LegacyHybridShadowRun): void;
  recordShadowRun(run: HybridShadowRun): HybridShadowRunRecordResult | undefined;
  recordShadowRun(run: HybridShadowRun): HybridShadowRunRecordResult | undefined {
    this.assertInitialized();
    let validatedRun: HybridShadowRun;
    let payloadJson: string;
    let payloadVersion: number;
    try {
      validatedRun = parseHybridShadowRun(run);
      payloadJson = canonicalJsonStringify(validatedRun);
      payloadVersion = "opportunityId" in validatedRun
        ? HYBRID_SHADOW_RUN_PAYLOAD_VERSION
        : LEGACY_HYBRID_SHADOW_RUN_PAYLOAD_VERSION;
    } catch (error) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow run is invalid or cannot be safely serialized.",
        "INVALID_RUN",
        { cause: error },
      );
    }

    if ("opportunityId" in validatedRun) {
      return this.recordOrReplayShadowRun(validatedRun);
    }

    const insert = this.database.prepare(`
      INSERT INTO hybrid_shadow_runs (
        run_id, ticket_id, mode, provider_id, model_id, status, recorded_at,
        payload_version, payload_json, opportunity_id, execution_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = this.database.transaction((snapshot: HybridShadowRun) => {
      const existing = this.database.prepare(
        "SELECT 1 AS found FROM hybrid_shadow_runs WHERE run_id = ?",
      ).get(snapshot.runId);
      if (existing !== undefined) {
        throw new HybridShadowRunStoreError(
          `Hybrid shadow run ${snapshot.runId} already exists.`,
          "RUN_ID_CONFLICT",
        );
      }
      insert.run(
        snapshot.runId,
        snapshot.ticketId,
        snapshot.mode,
        snapshot.provider.providerKind,
        snapshot.provider.model,
        snapshot.status,
        snapshot.recordedAt,
        payloadVersion,
        payloadJson,
        "opportunityId" in snapshot ? snapshot.opportunityId : null,
        "executionKey" in snapshot ? snapshot.executionKey : null,
      );
    });

    try {
      transaction.immediate(validatedRun);
    } catch (error) {
      if (error instanceof HybridShadowRunStoreError) throw error;
      throw new HybridShadowRunStoreError(
        "Hybrid shadow run could not be recorded.",
        "PERSISTENCE_ERROR",
        { cause: error },
      );
    }
  }

  recordOrReplayShadowRun(run: HybridShadowRunV2): HybridShadowRunRecordResult {
    this.assertInitialized();
    let validatedRun: HybridShadowRunV2;
    let payloadJson: string;
    try {
      validatedRun = parseHybridShadowRunV2(run);
      payloadJson = canonicalJsonStringify(validatedRun);
    } catch (error) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow run is invalid or cannot be safely serialized.",
        "INVALID_RUN",
        { cause: error },
      );
    }

    const insert = this.database.prepare(`
      INSERT INTO hybrid_shadow_runs (
        run_id, ticket_id, mode, provider_id, model_id, status, recorded_at,
        payload_version, payload_json, opportunity_id, execution_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = this.database.transaction((snapshot: HybridShadowRunV2) => {
      insert.run(
        snapshot.runId,
        snapshot.ticketId,
        snapshot.mode,
        snapshot.provider.providerKind,
        snapshot.provider.model,
        snapshot.status,
        snapshot.recordedAt,
        HYBRID_SHADOW_RUN_PAYLOAD_VERSION,
        payloadJson,
        snapshot.opportunityId,
        snapshot.executionKey,
      );
    });

    try {
      transaction.immediate(validatedRun);
      return { outcome: "recorded", run: validatedRun };
    } catch (error) {
      if (isExecutionKeyUniqueCollision(error)) {
        const winner = this.getShadowRunByExecutionKey(validatedRun.executionKey);
        if (winner === undefined) {
          throw new HybridShadowRunStoreError(
            "Execution-key uniqueness failed without a readable winning run.",
            "PERSISTENCE_ERROR",
            { cause: error },
          );
        }
        if (semanticRunJson(winner) === semanticRunJson(validatedRun)) {
          return { outcome: "replayed", run: winner };
        }
        throw new HybridShadowRunStoreError(
          "A different hybrid shadow run already uses this execution identity.",
          "EXECUTION_KEY_CONFLICT",
        );
      }
      if (isRunIdUniqueCollision(error)) {
        throw new HybridShadowRunStoreError(
          `Hybrid shadow run ${validatedRun.runId} already exists.`,
          "RUN_ID_CONFLICT",
          { cause: error },
        );
      }
      throw new HybridShadowRunStoreError(
        "Hybrid shadow run could not be recorded.",
        "PERSISTENCE_ERROR",
        { cause: error },
      );
    }
  }

  getShadowRun(runId: HybridShadowRunId): HybridShadowRun | undefined {
    this.assertInitialized();
    const parsedRunId = HybridShadowRunIdSchema.safeParse(runId);
    if (!parsedRunId.success) {
      throw new HybridShadowRunStoreError("Hybrid shadow run ID is invalid.", "INVALID_ID", {
        cause: parsedRunId.error,
      });
    }
    const row = this.database.prepare(
      "SELECT * FROM hybrid_shadow_runs WHERE run_id = ?",
    ).get(parsedRunId.data) as ShadowRunRow | undefined;
    return row === undefined ? undefined : this.decodeRow(row);
  }

  getShadowRunByExecutionKey(
    executionKey: HybridShadowRunV2["executionKey"],
  ): HybridShadowRunV2 | undefined {
    this.assertInitialized();
    const parsedExecutionKey = HybridShadowExecutionKeySchema.safeParse(executionKey);
    if (!parsedExecutionKey.success) {
      throw new HybridShadowRunStoreError("Hybrid shadow execution key is invalid.", "INVALID_ID", {
        cause: parsedExecutionKey.error,
      });
    }
    let row: ShadowRunRow | undefined;
    try {
      row = this.database.prepare(`
        SELECT * FROM hybrid_shadow_runs WHERE execution_key = ?
      `).get(parsedExecutionKey.data) as ShadowRunRow | undefined;
    } catch (error) {
      if (isSqliteLockError(error)) {
        throw new HybridShadowRunStoreError(
          "Hybrid shadow run could not be read because the database is busy.",
          "PERSISTENCE_ERROR",
          { cause: error },
        );
      }
      throw error;
    }
    if (row === undefined) return undefined;
    const run = this.decodeRow(row);
    if (!("executionKey" in run)) {
      throw new HybridShadowRunStoreError(
        `Stored hybrid shadow run ${row.run_id} has no execution identity.`,
        "RUN_PAYLOAD_ERROR",
      );
    }
    return run;
  }

  listShadowRunsForTicket(ticketId: HybridShadowRun["ticketId"]): readonly HybridShadowRun[] {
    this.assertInitialized();
    const parsedTicketId = TicketIdSchema.safeParse(ticketId);
    if (!parsedTicketId.success) {
      throw new HybridShadowRunStoreError("Ticket ID is invalid.", "INVALID_ID", {
        cause: parsedTicketId.error,
      });
    }
    const rows = this.database.prepare(`
      SELECT * FROM hybrid_shadow_runs
      WHERE ticket_id = ?
      ORDER BY julianday(recorded_at) ASC, run_id ASC
    `).all(parsedTicketId.data) as ShadowRunRow[];
    return rows.map((row) => this.decodeRow(row));
  }

  listShadowRunsForOpportunity(
    opportunityId: HybridShadowRunV2["opportunityId"],
  ): readonly HybridShadowRunV2[] {
    this.assertInitialized();
    const parsedOpportunityId = HybridShadowOpportunityIdSchema.safeParse(opportunityId);
    if (!parsedOpportunityId.success) {
      throw new HybridShadowRunStoreError("Hybrid shadow opportunity ID is invalid.", "INVALID_ID", {
        cause: parsedOpportunityId.error,
      });
    }
    const rows = this.database.prepare(`
      SELECT * FROM hybrid_shadow_runs
      WHERE opportunity_id = ?
      ORDER BY julianday(recorded_at) ASC, run_id ASC
    `).all(parsedOpportunityId.data) as ShadowRunRow[];
    return rows.map((row) => {
      const run = this.decodeRow(row);
      if (!("opportunityId" in run)) {
        throw new HybridShadowRunStoreError(
          `Stored hybrid shadow run ${row.run_id} has no opportunity identity.`,
          "RUN_PAYLOAD_ERROR",
        );
      }
      return run;
    });
  }

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private decodeRow(row: ShadowRunRow): HybridShadowRun {
    try {
      const parsed = JSON.parse(row.payload_json) as unknown;
      let run: HybridShadowRun;
      let identityMismatch: boolean;
      if (row.payload_version === LEGACY_HYBRID_SHADOW_RUN_PAYLOAD_VERSION) {
        run = parseLegacyHybridShadowRun(parsed);
        identityMismatch = row.opportunity_id !== null || row.execution_key !== null;
      } else if (row.payload_version === HYBRID_SHADOW_RUN_PAYLOAD_VERSION) {
        const currentRun = parseHybridShadowRunV2(parsed);
        run = currentRun;
        identityMismatch = currentRun.opportunityId !== row.opportunity_id
          || currentRun.executionKey !== row.execution_key;
      } else {
        throw new Error(`Unsupported payload version ${String(row.payload_version)}.`);
      }
      if (
        run.runId !== row.run_id
        || run.ticketId !== row.ticket_id
        || run.mode !== row.mode
        || run.provider.providerKind !== row.provider_id
        || run.provider.model !== row.model_id
        || run.status !== row.status
        || run.recordedAt !== row.recorded_at
        || identityMismatch
      ) {
        throw new Error("Stored columns do not match the run payload.");
      }
      return run;
    } catch (error) {
      throw new HybridShadowRunStoreError(
        `Stored hybrid shadow run ${row.run_id} is malformed or incompatible.`,
        "RUN_PAYLOAD_ERROR",
        { cause: error },
      );
    }
  }

  private validateCurrentSchema(): void {
    this.validateSchema(SHADOW_RUN_COLUMNS, SHADOW_RUN_INDEXES);
    this.validateExecutionKeyIndex();
  }

  private validateV1Schema(): void {
    this.validateSchema(SHADOW_RUN_V1_COLUMNS, SHADOW_RUN_V1_INDEXES);
  }

  private validateSchema(
    expectedColumns: readonly { name: string; type: string; notnull: number; primaryKey: number }[],
    expectedIndexes: readonly string[],
  ): void {
    const tables = this.schemaObjectNames();
    if (!tables.includes("hybrid_shadow_runs")) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run table is missing from its declared schema.",
        "SCHEMA_ERROR",
      );
    }
    const columns = this.database.prepare("PRAGMA table_info(hybrid_shadow_runs)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const actual = columns.map(({ name, type, notnull, pk }) => ({
      name,
      type: type.toUpperCase(),
      notnull,
      primaryKey: pk,
    }));
    if (JSON.stringify(actual) !== JSON.stringify(expectedColumns)) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run table has an unexpected structure.",
        "SCHEMA_ERROR",
      );
    }
    const triggerNames = this.database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'hybrid_shadow_runs'
    `).all() as Array<{ name: string }>;
    const actualTriggers = triggerNames.map(({ name }) => name).sort();
    if (JSON.stringify(actualTriggers) !== JSON.stringify([
      "hybrid_shadow_runs_no_delete",
      "hybrid_shadow_runs_no_update",
    ])) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run append-only guards are missing or inconsistent.",
        "SCHEMA_ERROR",
      );
    }
    const indexes = this.database.prepare("PRAGMA index_list(hybrid_shadow_runs)").all() as Array<{
      name: string;
      unique: number;
      partial: number;
    }>;
    if (expectedIndexes.some((expectedName) => !indexes.some(({ name }) => name === expectedName))) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run indexes are missing or inconsistent.",
        "SCHEMA_ERROR",
      );
    }
  }

  private validateExecutionKeyIndex(): void {
    const indexes = this.database.prepare("PRAGMA index_list(hybrid_shadow_runs)").all() as Array<{
      name: string;
      unique: number;
      partial: number;
    }>;
    const executionKeyIndex = indexes.find(
      ({ name }) => name === "hybrid_shadow_runs_execution_key_unique_idx",
    );
    const executionKeyColumns = this.database.prepare(
      "PRAGMA index_info(hybrid_shadow_runs_execution_key_unique_idx)",
    ).all() as Array<{ name: string | null }>;
    const executionKeyIndexDefinition = this.database.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type = 'index' AND name = 'hybrid_shadow_runs_execution_key_unique_idx'
    `).get() as { sql: string | null } | undefined;
    const normalizedExecutionKeyIndexSql = (executionKeyIndexDefinition?.sql ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/;$/, "");
    if (
      executionKeyIndex?.unique !== 1
      || executionKeyIndex.partial !== 1
      || JSON.stringify(executionKeyColumns.map(({ name }) => name)) !== JSON.stringify(["execution_key"])
      || normalizedExecutionKeyIndexSql !== (
        "create unique index hybrid_shadow_runs_execution_key_unique_idx "
        + "on hybrid_shadow_runs(execution_key) where execution_key is not null"
      )
    ) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run execution-key uniqueness constraint is missing or inconsistent.",
        "SCHEMA_ERROR",
      );
    }
  }

  private migrateV1ToV2(): void {
    this.validateV1Schema();
    try {
      const migrate = this.database.transaction(() => {
        this.database.exec(`
          DROP TRIGGER hybrid_shadow_runs_no_update;
          DROP TRIGGER hybrid_shadow_runs_no_delete;
          DROP INDEX hybrid_shadow_runs_ticket_order_idx;
          ALTER TABLE hybrid_shadow_runs RENAME TO hybrid_shadow_runs_v1;
          ${SHADOW_RUN_TABLE_SQL}
          INSERT INTO hybrid_shadow_runs (
            run_id, ticket_id, mode, provider_id, model_id, status, recorded_at,
            payload_version, payload_json, opportunity_id, execution_key
          )
          SELECT
            run_id, ticket_id, mode, provider_id, model_id, status, recorded_at,
            payload_version, payload_json, NULL, NULL
          FROM hybrid_shadow_runs_v1;
          DROP TABLE hybrid_shadow_runs_v1;
          ${SHADOW_RUN_INDEX_AND_TRIGGER_SQL}
        `);
        this.database.pragma(`user_version = ${SHADOW_RUN_SCHEMA_VERSION}`);
      });
      migrate.immediate();
    } catch (error) {
      if (isSqliteLockError(error)) throw error;
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run schema migration failed.",
        "SCHEMA_ERROR",
        { cause: error },
      );
    }
  }

  private schemaObjectNames(): string[] {
    const rows = this.database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type IN ('table', 'view', 'index', 'trigger') AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string }>;
    return rows.map(({ name }) => name);
  }

  private assertOpen(): void {
    if (this.closed || !this.database.open) {
      throw new HybridShadowRunStoreError("Hybrid shadow-run database is closed.", "CLOSED");
    }
  }

  private assertInitialized(): void {
    this.assertOpen();
    if (!this.initialized) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run database has not been initialized.",
        "NOT_INITIALIZED",
      );
    }
  }
}

const SHADOW_RUN_TABLE_SQL = `
  CREATE TABLE hybrid_shadow_runs (
    run_id TEXT PRIMARY KEY NOT NULL,
    ticket_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('evaluation', 'diagnosis')),
    provider_id TEXT NOT NULL CHECK (length(trim(provider_id)) > 0),
    model_id TEXT NOT NULL CHECK (length(trim(model_id)) > 0),
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
    recorded_at TEXT NOT NULL,
    payload_version INTEGER NOT NULL CHECK (payload_version IN (
      ${LEGACY_HYBRID_SHADOW_RUN_PAYLOAD_VERSION}, ${HYBRID_SHADOW_RUN_PAYLOAD_VERSION}
    )),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
    opportunity_id TEXT,
    execution_key TEXT,
    CHECK (
      (payload_version = ${LEGACY_HYBRID_SHADOW_RUN_PAYLOAD_VERSION}
        AND opportunity_id IS NULL AND execution_key IS NULL)
      OR
      (payload_version = ${HYBRID_SHADOW_RUN_PAYLOAD_VERSION}
        AND opportunity_id IS NOT NULL AND execution_key IS NOT NULL)
    )
  );
`;

const SHADOW_RUN_INDEX_AND_TRIGGER_SQL = `
  CREATE INDEX hybrid_shadow_runs_ticket_order_idx
    ON hybrid_shadow_runs(ticket_id, recorded_at, run_id);
  CREATE INDEX hybrid_shadow_runs_opportunity_order_idx
    ON hybrid_shadow_runs(opportunity_id, recorded_at, run_id)
    WHERE opportunity_id IS NOT NULL;
  CREATE UNIQUE INDEX hybrid_shadow_runs_execution_key_unique_idx
    ON hybrid_shadow_runs(execution_key)
    WHERE execution_key IS NOT NULL;
  CREATE TRIGGER hybrid_shadow_runs_no_update
    BEFORE UPDATE ON hybrid_shadow_runs
    BEGIN SELECT RAISE(ABORT, 'hybrid shadow runs are immutable'); END;
  CREATE TRIGGER hybrid_shadow_runs_no_delete
    BEFORE DELETE ON hybrid_shadow_runs
    BEGIN SELECT RAISE(ABORT, 'hybrid shadow runs are append-only'); END;
`;

const INITIAL_SCHEMA_SQL = `${SHADOW_RUN_TABLE_SQL}${SHADOW_RUN_INDEX_AND_TRIGGER_SQL}`;

function semanticRunJson(run: HybridShadowRunV2): string {
  const { runId: _runId, recordedAt: _recordedAt, ...semanticPayload } = run;
  return canonicalJsonStringify(semanticPayload);
}

function isExecutionKeyUniqueCollision(error: unknown): boolean {
  return hasSqliteError(error, "SQLITE_CONSTRAINT_UNIQUE")
    && error.message.includes("hybrid_shadow_runs.execution_key");
}

function isRunIdUniqueCollision(error: unknown): boolean {
  return (hasSqliteError(error, "SQLITE_CONSTRAINT_PRIMARYKEY")
      || hasSqliteError(error, "SQLITE_CONSTRAINT_UNIQUE"))
    && error.message.includes("hybrid_shadow_runs.run_id");
}

function hasSqliteError(error: unknown, code: string): error is Error & { code: string } {
  return error instanceof Error
    && "code" in error
    && (error as Error & { code?: unknown }).code === code;
}

function isSqliteLockError(error: unknown): error is Error & { code: string } {
  return hasSqliteError(error, "SQLITE_BUSY") || hasSqliteError(error, "SQLITE_LOCKED");
}
