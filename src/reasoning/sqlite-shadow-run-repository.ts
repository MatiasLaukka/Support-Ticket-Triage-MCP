import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TicketIdSchema } from "../domain.js";
import { canonicalJsonStringify } from "./canonical-json.js";
import {
  HYBRID_SHADOW_RUN_PAYLOAD_VERSION,
  HybridShadowRunIdSchema,
  parseHybridShadowRun,
  type HybridShadowRun,
  type HybridShadowRunId,
} from "./shadow-run-types.js";

const SHADOW_RUN_SCHEMA_VERSION = 1;
const SHADOW_RUN_COLUMNS = [
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
}

export type HybridShadowRunStoreErrorCode =
  | "CLOSED"
  | "NOT_INITIALIZED"
  | "SCHEMA_ERROR"
  | "INVALID_RUN"
  | "INVALID_ID"
  | "RUN_ID_CONFLICT"
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

export interface HybridShadowRunRepository {
  recordShadowRun(run: HybridShadowRun): void;
  getShadowRun(runId: HybridShadowRunId): HybridShadowRun | undefined;
  listShadowRunsForTicket(ticketId: HybridShadowRun["ticketId"]): readonly HybridShadowRun[];
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
      return new SqliteHybridShadowRunRepository(
        normalizedPath,
        new Database(normalizedPath),
      );
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
        throw new HybridShadowRunStoreError(
          "Hybrid shadow-run schema migration failed.",
          "SCHEMA_ERROR",
          { cause: error },
        );
      }
    }

    this.validateCurrentSchema();
    this.initialized = true;
  }

  recordShadowRun(run: HybridShadowRun): void {
    this.assertInitialized();
    let validatedRun: HybridShadowRun;
    let payloadJson: string;
    try {
      validatedRun = parseHybridShadowRun(run);
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
        payload_version, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        HYBRID_SHADOW_RUN_PAYLOAD_VERSION,
        payloadJson,
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

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private decodeRow(row: ShadowRunRow): HybridShadowRun {
    try {
      if (row.payload_version !== HYBRID_SHADOW_RUN_PAYLOAD_VERSION) {
        throw new Error(`Unsupported payload version ${String(row.payload_version)}.`);
      }
      const parsed = JSON.parse(row.payload_json) as unknown;
      const run = parseHybridShadowRun(parsed);
      if (
        run.runId !== row.run_id
        || run.ticketId !== row.ticket_id
        || run.mode !== row.mode
        || run.provider.providerKind !== row.provider_id
        || run.provider.model !== row.model_id
        || run.status !== row.status
        || run.recordedAt !== row.recorded_at
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
    if (JSON.stringify(actual) !== JSON.stringify(SHADOW_RUN_COLUMNS)) {
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
    const indexNames = this.database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'hybrid_shadow_runs'
    `).all() as Array<{ name: string }>;
    if (!indexNames.some(({ name }) => name === "hybrid_shadow_runs_ticket_order_idx")) {
      throw new HybridShadowRunStoreError(
        "Hybrid shadow-run ticket ordering index is missing.",
        "SCHEMA_ERROR",
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

const INITIAL_SCHEMA_SQL = `
  CREATE TABLE hybrid_shadow_runs (
    run_id TEXT PRIMARY KEY NOT NULL,
    ticket_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('evaluation', 'diagnosis')),
    provider_id TEXT NOT NULL CHECK (length(trim(provider_id)) > 0),
    model_id TEXT NOT NULL CHECK (length(trim(model_id)) > 0),
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
    recorded_at TEXT NOT NULL,
    payload_version INTEGER NOT NULL CHECK (payload_version = ${HYBRID_SHADOW_RUN_PAYLOAD_VERSION}),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object')
  );
  CREATE INDEX hybrid_shadow_runs_ticket_order_idx
    ON hybrid_shadow_runs(ticket_id, recorded_at, run_id);
  CREATE TRIGGER hybrid_shadow_runs_no_update
    BEFORE UPDATE ON hybrid_shadow_runs
    BEGIN SELECT RAISE(ABORT, 'hybrid shadow runs are immutable'); END;
  CREATE TRIGGER hybrid_shadow_runs_no_delete
    BEFORE DELETE ON hybrid_shadow_runs
    BEGIN SELECT RAISE(ABORT, 'hybrid shadow runs are append-only'); END;
`;
