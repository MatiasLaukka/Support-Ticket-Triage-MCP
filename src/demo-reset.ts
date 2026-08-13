import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { TicketSchema, type Ticket } from "./domain.js";
import {
  acquireDemoStateResetLease,
  acquireDemoStateUsageLease,
  DemoStateLeaseError,
  type DemoStateUsageLease,
} from "./demo-state-lease.js";
import { OperationalSqliteStore } from "./operational/sqlite-store.js";

export { acquireDemoStateUsageLease, DemoStateLeaseError } from "./demo-state-lease.js";
export type { DemoStateUsageLease } from "./demo-state-lease.js";

const SQLITE_SIDECAR_SUFFIXES = ["-journal", "-wal", "-shm"] as const;
const DERIVED_OPERATIONAL_TABLES = [
  "command_idempotency",
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

export interface OperationalDemoResetInput {
  readonly operationalDatabase: string;
  readonly seedFile: string;
  readonly dataRoot: string;
  readonly allowExternalDatabasePath?: boolean;
}

export interface OperationalDemoResetSummary {
  readonly ticketCount: number;
  readonly ticketIds: readonly string[];
  readonly databasePath: string;
}

export interface PreparedOperationalDemoReset {
  readonly summary: OperationalDemoResetSummary;
  verify(): void;
  commit(): void;
  rollback(): void;
}

export class DemoResetError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_SEED"
      | "PATH_SAFETY"
      | "ACTIVE_STATE"
      | "PREPARE_FAILED"
      | "VERIFICATION_FAILED"
      | "REPLACEMENT_FAILED"
      | "ROLLBACK_FAILED",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DemoResetError";
  }
}

interface ResetPaths {
  readonly dataRoot: string;
  readonly database: string;
  readonly temporary: string;
  readonly backup: string;
}

interface BackupEntry {
  readonly live: string;
  readonly backup: string;
}

export function prepareOperationalDemoReset(
  input: OperationalDemoResetInput,
): PreparedOperationalDemoReset {
  const seedTickets = loadCanonicalSeedTickets(input.seedFile);
  const paths = resolveResetPaths(input);
  let lease: DemoStateUsageLease;
  try {
    lease = acquireDemoStateResetLease(paths.dataRoot);
  } catch (error) {
    if (error instanceof DemoStateLeaseError && error.code === "ACTIVE_RUNTIME") {
      throw new DemoResetError(error.message, "ACTIVE_STATE", { cause: error });
    }
    throw error;
  }
  try {
    removeDatabaseSet(paths.temporary);
    const fresh = OperationalSqliteStore.open(paths.temporary);
    try {
      fresh.initialize();
      fresh.transaction((unit) => {
        unit.transitionImportState("empty", "native");
        for (const ticket of seedTickets) unit.insertTicket(ticket);
      });
    } finally {
      fresh.close();
    }
    verifyOperationalBaseline(paths.temporary, seedTickets);
    return new PreparedOperationalDemoResetImpl(paths, seedTickets, lease);
  } catch (error) {
    removeDatabaseSet(paths.temporary);
    lease.release();
    if (error instanceof DemoResetError) throw error;
    throw new DemoResetError(
      "Operational demo state could not be prepared.",
      "PREPARE_FAILED",
      { cause: error },
    );
  }
}

export function resetOperationalDemoState(
  input: OperationalDemoResetInput,
): OperationalDemoResetSummary {
  const prepared = prepareOperationalDemoReset(input);
  try {
    prepared.verify();
    prepared.commit();
    return prepared.summary;
  } catch (error) {
    try {
      prepared.rollback();
    } catch {
      // The commit path already reports retained recovery backups when needed.
    }
    throw error;
  }
}

class PreparedOperationalDemoResetImpl implements PreparedOperationalDemoReset {
  readonly summary: OperationalDemoResetSummary;
  private state: "prepared" | "committed" | "rolled-back" | "failed" = "prepared";
  private backupEntries: BackupEntry[] = [];
  private replacementInstalled = false;
  private leaseReleased = false;

  constructor(
    private readonly paths: ResetPaths,
    private readonly seedTickets: readonly Ticket[],
    private readonly lease: DemoStateUsageLease,
  ) {
    this.summary = Object.freeze({
      ticketCount: seedTickets.length,
      ticketIds: Object.freeze(seedTickets.map(({ id }) => id)),
      databasePath: paths.database,
    });
  }

  verify(): void {
    if (this.state === "rolled-back" || this.state === "failed") {
      throw new DemoResetError(
        "Prepared operational demo state is no longer available.",
        "VERIFICATION_FAILED",
      );
    }
    verifyOperationalBaseline(
      this.state === "committed" ? this.paths.database : this.paths.temporary,
      this.seedTickets,
    );
  }

  commit(): void {
    if (this.state !== "prepared") {
      throw new DemoResetError(
        "Prepared operational demo state cannot be committed in its current state.",
        "REPLACEMENT_FAILED",
      );
    }
    try {
      this.verify();
      checkpointAndClose(this.paths.database);
      this.backupEntries = [];
      moveLiveDatabaseToBackup(this.paths, this.backupEntries);
      renameSync(this.paths.temporary, this.paths.database);
      this.replacementInstalled = true;
      for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
        rmSync(`${this.paths.database}${suffix}`, { force: true });
      }
      verifyOperationalBaseline(this.paths.database, this.seedTickets);
      removeBackupEntriesBestEffort(this.backupEntries);
      this.backupEntries = [];
      this.state = "committed";
    } catch (error) {
      const rollbackFailure = this.restoreOriginalAfterFailure();
      this.state = "failed";
      if (rollbackFailure !== undefined) throw rollbackFailure;
      throw new DemoResetError(
        "Could not replace operational demo state; the original database was restored.",
        "REPLACEMENT_FAILED",
        { cause: error },
      );
    } finally {
      removeDatabaseSet(this.paths.temporary);
      this.releaseLease();
    }
  }

  rollback(): void {
    if (this.state === "rolled-back" || this.state === "committed") return;
    try {
      if (this.backupEntries.length > 0 || this.replacementInstalled) {
        const failure = this.restoreOriginalAfterFailure();
        if (failure !== undefined) throw failure;
      }
      removeDatabaseSet(this.paths.temporary);
      this.state = "rolled-back";
    } finally {
      this.releaseLease();
    }
  }

  private restoreOriginalAfterFailure(): DemoResetError | undefined {
    try {
      if (this.replacementInstalled) removeDatabaseSet(this.paths.database);
      for (const entry of [...this.backupEntries].reverse()) {
        if (existsSync(entry.backup)) renameSync(entry.backup, entry.live);
      }
      this.backupEntries = [];
      this.replacementInstalled = false;
      return undefined;
    } catch (error) {
      const retained = this.backupEntries
        .filter(({ backup }) => existsSync(backup))
        .map(({ backup }) => basename(backup));
      const suffix = retained.length === 0
        ? "Recovery backups may remain beside the operational database."
        : `Recovery backups retained: ${retained.join(", ")}.`;
      return new DemoResetError(
        `Operational demo state replacement failed and rollback could not complete. ${suffix}`,
        "ROLLBACK_FAILED",
        { cause: error },
      );
    }
  }

  private releaseLease(): void {
    if (this.leaseReleased) return;
    this.lease.release();
    this.leaseReleased = true;
  }
}

function loadCanonicalSeedTickets(seedFile: string): readonly Ticket[] {
  let decoded: unknown;
  let tickets: Ticket[];
  try {
    const canonicalSeed = canonicalizeNearestExisting(seedFile);
    decoded = JSON.parse(readFileSync(canonicalSeed, "utf8")) as unknown;
    tickets = TicketSchema.array().min(1).parse(decoded);
  } catch (error) {
    throw new DemoResetError(
      "The operational seed is invalid.",
      "INVALID_SEED",
      { cause: error },
    );
  }
  if (new Set(tickets.map(({ id }) => id)).size !== tickets.length) {
    throw new DemoResetError(
      "The operational seed contains duplicate ticket IDs.",
      "INVALID_SEED",
    );
  }
  return tickets;
}

function resolveResetPaths(input: OperationalDemoResetInput): ResetPaths {
  const dataRoot = canonicalizeNearestExisting(input.dataRoot);
  const database = canonicalizeNearestExisting(input.operationalDatabase);
  const id = randomUUID();
  const temporary = canonicalizeNearestExisting(`${database}.reset-${id}.tmp`);
  const backup = canonicalizeNearestExisting(`${database}.reset-backup-${id}`);
  for (const target of [database, temporary, backup]) {
    if (input.allowExternalDatabasePath !== true && !isContainedPath(dataRoot, target)) {
      throw new DemoResetError(
        "The operational database is outside the configured data root.",
        "PATH_SAFETY",
      );
    }
  }
  for (const target of [database, temporary, backup]) {
    for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
      const sidecar = canonicalizeNearestExisting(`${target}${suffix}`);
      if (input.allowExternalDatabasePath !== true && !isContainedPath(dataRoot, sidecar)) {
        throw new DemoResetError(
          "An operational database sidecar is outside the configured data root.",
          "PATH_SAFETY",
        );
      }
    }
  }
  return { dataRoot, database, temporary, backup };
}

function verifyOperationalBaseline(path: string, expectedTickets: readonly Ticket[]): void {
  const store = OperationalSqliteStore.open(path);
  let snapshots: ReturnType<OperationalSqliteStore["listWorkflowSnapshots"]>;
  try {
    store.initialize();
    if (store.readImportState() !== "native") verificationFailure();
    snapshots = store.listWorkflowSnapshots();
    if (store.listPendingOutbox().length !== 0) verificationFailure();
    if (store.listImportResolutions().length !== 0) verificationFailure();
    if (store.listImportSources().length !== 0) verificationFailure();
    if (store.listImportedSourceIds().length !== 0) verificationFailure();
  } catch (error) {
    if (error instanceof DemoResetError) throw error;
    throw new DemoResetError(
      "Operational demo state verification failed.",
      "VERIFICATION_FAILED",
      { cause: error },
    );
  } finally {
    store.close();
  }
  if (snapshots.length !== expectedTickets.length) verificationFailure();
  const actualById = new Map(snapshots.map(({ ticket }) => [ticket.id, ticket]));
  const expectedById = new Map(expectedTickets.map((ticket) => [ticket.id, ticket]));
  if (actualById.size !== expectedById.size) verificationFailure();
  for (const [ticketId, expected] of expectedById) {
    if (!isDeepStrictEqual(actualById.get(ticketId), expected)) verificationFailure();
  }
  for (const snapshot of snapshots) {
    if (
      snapshot.ticketRevisions.length !== 0
      || snapshot.recommendations.length !== 0
      || snapshot.recommendationRevisions.length !== 0
      || snapshot.messages.length !== 0
      || snapshot.diagnoses.length !== 0
      || snapshot.events.length !== 0
      || snapshot.traces.length !== 0
    ) verificationFailure();
  }
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    for (const table of DERIVED_OPERATIONAL_TABLES) {
      const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
      if (row.count !== 0) verificationFailure();
    }
    const metadata = database.prepare(
      "SELECT key, value FROM operational_metadata ORDER BY key ASC",
    ).all() as Array<{ key: string; value: string }>;
    if (!isDeepStrictEqual(metadata, [
      { key: "import_state", value: "native" },
      { key: "schema_version", value: "1" },
    ])) verificationFailure();
  } finally {
    database.close();
  }
}

function verificationFailure(): never {
  throw new DemoResetError(
    "Operational demo state verification failed.",
    "VERIFICATION_FAILED",
  );
}

function checkpointAndClose(path: string): void {
  if (!existsSync(path)) return;
  const database = new Database(path, { fileMustExist: true });
  try {
    database.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    database.close();
  }
}

function moveLiveDatabaseToBackup(paths: ResetPaths, moved: BackupEntry[]): void {
  const entries = databaseSet(paths.database)
    .map((live, index) => ({
      live,
      backup: index === 0
        ? paths.backup
        : `${paths.backup}${SQLITE_SIDECAR_SUFFIXES[index - 1]}`,
    }))
    .filter(({ live }) => existsSync(live));
  for (const entry of entries) {
    renameSync(entry.live, entry.backup);
    moved.push(entry);
  }
}

function removeBackupEntriesBestEffort(entries: readonly BackupEntry[]): void {
  for (const { backup } of entries) {
    try {
      rmSync(backup, { force: true });
    } catch {
      // The verified replacement remains authoritative; an undeletable backup
      // is safer to retain than rolling back after cleanup has partly succeeded.
    }
  }
}

function removeDatabaseSet(path: string): void {
  for (const member of databaseSet(path)) rmSync(member, { force: true });
}

function databaseSet(path: string): string[] {
  return [path, ...SQLITE_SIDECAR_SUFFIXES.map((suffix) => `${path}${suffix}`)];
}

function canonicalizeNearestExisting(path: string): string {
  const absolute = resolve(path);
  const missing: string[] = [];
  let ancestor = absolute;
  while (true) {
    try {
      const canonicalAncestor = realpathSync.native(ancestor);
      return resolve(canonicalAncestor, ...missing.reverse());
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.push(basename(ancestor));
      ancestor = parent;
    }
  }
}

function isContainedPath(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`));
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
