import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
import { DiagnosisRepository } from "./knowledge-evolution/diagnosis-repository.js";
import { KnowledgeAuditRepository } from "./knowledge-evolution/knowledge-audit-repository.js";
import { KnowledgeObjectRepository } from "./knowledge-evolution/knowledge-object-repository.js";
import { SqliteLearningLedger } from "./knowledge-evolution/sqlite-learning-ledger.js";
import { SqliteKnowledgeEvolutionStore } from "./knowledge-evolution/sqlite-knowledge-evolution-store.js";

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

const MUTABLE_LEARNING_DIRECTORY_NAMES = [
  "diagnoses",
  "candidates",
  "approved",
  "audit",
] as const;

export interface LearningDemoResetInput {
  readonly dataRoot: string;
  readonly learningLedgerFile: string;
  readonly allowExternalLedgerPath?: boolean;
}

export interface LearningDemoResetSummary {
  readonly databasePath: string;
}

export interface PreparedLearningDemoReset {
  readonly summary: LearningDemoResetSummary;
  verify(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

interface LearningDirectoryPaths {
  readonly name: typeof MUTABLE_LEARNING_DIRECTORY_NAMES[number];
  readonly live: string;
  readonly temporary: string;
  readonly backup: string;
}

interface LearningResetPaths extends ResetPaths {
  readonly mutableDirectories: readonly LearningDirectoryPaths[];
  readonly allowExternalLedgerPath: boolean;
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

export async function prepareLearningDemoReset(
  input: LearningDemoResetInput,
): Promise<PreparedLearningDemoReset> {
  const paths = resolveLearningResetPaths(input);
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
    if (isOperationalDatabase(paths.database)) {
      throw new DemoResetError(
        "An operational database cannot be used as a learning ledger reset target.",
        "PATH_SAFETY",
      );
    }
    removeLearningPreparedResources(paths);
    const ledger = new SqliteLearningLedger(paths.temporary);
    try {
      await ledger.initialize();
      const store = new SqliteKnowledgeEvolutionStore(ledger.getDatabase());
      await store.initialize();
    } finally {
      ledger.close();
    }
    for (const directory of paths.mutableDirectories) {
      mkdirSync(directory.temporary, { recursive: true });
    }
    await verifyLearningBaseline(paths.temporary, paths.mutableDirectories, "temporary");
    return new PreparedLearningDemoResetImpl(paths, lease);
  } catch (error) {
    try {
      removeLearningPreparedResources(paths);
    } finally {
      lease.release();
    }
    if (error instanceof DemoResetError) throw error;
    throw new DemoResetError(
      "Learning demo state could not be prepared.",
      "PREPARE_FAILED",
      { cause: error },
    );
  }
}

export async function resetLearningDemoState(
  input: LearningDemoResetInput,
): Promise<LearningDemoResetSummary> {
  const prepared = await prepareLearningDemoReset(input);
  try {
    await prepared.verify();
    await prepared.commit();
    return prepared.summary;
  } catch (error) {
    try {
      await prepared.rollback();
    } catch {
      // The commit path reports sanitized retained recovery backups.
    }
    throw error;
  }
}

class PreparedLearningDemoResetImpl implements PreparedLearningDemoReset {
  readonly summary: LearningDemoResetSummary;
  private state: "prepared" | "verifying" | "committing" | "committed" | "rolled-back" | "failed" = "prepared";
  private backupEntries: BackupEntry[] = [];
  private installedLivePaths: string[] = [];
  private leaseReleased = false;

  constructor(
    private readonly paths: LearningResetPaths,
    private readonly lease: DemoStateUsageLease,
  ) {
    this.summary = Object.freeze({ databasePath: paths.database });
  }

  async verify(): Promise<void> {
    if (this.state !== "prepared" && this.state !== "committed") {
      throw new DemoResetError(
        "Prepared learning demo state is no longer available.",
        "VERIFICATION_FAILED",
      );
    }
    const priorState = this.state;
    this.state = "verifying";
    try {
      await verifyLearningBaseline(
        priorState === "committed" ? this.paths.database : this.paths.temporary,
        this.paths.mutableDirectories,
        priorState === "committed" ? "live" : "temporary",
      );
    } finally {
      if (this.state === "verifying") this.state = priorState;
    }
  }

  async commit(): Promise<void> {
    if (this.state !== "prepared") {
      throw new DemoResetError(
        "Prepared learning demo state cannot be committed in its current state.",
        "REPLACEMENT_FAILED",
      );
    }
    this.state = "committing";
    try {
      await verifyLearningBaseline(
        this.paths.temporary,
        this.paths.mutableDirectories,
        "temporary",
      );
      checkpointAndClose(this.paths.database);
      this.backupEntries = [];
      moveLearningResourcesToBackup(this.paths, this.backupEntries);
      installPreparedLearningResources(this.paths, this.installedLivePaths);
      for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
        const sidecar = `${this.paths.database}${suffix}`;
        assertLearningDatabasePathSafe(this.paths, sidecar);
        rmSync(sidecar, { force: true });
      }
      await verifyLearningBaseline(
        this.paths.database,
        this.paths.mutableDirectories,
        "live",
      );
      removeLearningBackupEntriesBestEffort(this.paths, this.backupEntries);
      this.backupEntries = [];
      this.installedLivePaths = [];
      this.state = "committed";
    } catch (error) {
      const rollbackFailure = this.restoreOriginalAfterFailure();
      this.state = "failed";
      if (rollbackFailure !== undefined) throw rollbackFailure;
      throw new DemoResetError(
        "Could not replace learning demo state; the original learning resources were restored.",
        "REPLACEMENT_FAILED",
        { cause: error },
      );
    } finally {
      removeLearningPreparedResourcesBestEffort(this.paths);
      this.releaseLease();
    }
  }

  async rollback(): Promise<void> {
    if (this.state === "rolled-back" || this.state === "committed") return;
    if (this.state === "committing" || this.state === "verifying") {
      throw new DemoResetError(
        "Prepared learning demo state cannot be rolled back while verification or commit is active.",
        "REPLACEMENT_FAILED",
      );
    }
    try {
      if (this.backupEntries.length > 0 || this.installedLivePaths.length > 0) {
        const failure = this.restoreOriginalAfterFailure();
        if (failure !== undefined) throw failure;
      }
      removeLearningPreparedResources(this.paths);
      this.state = "rolled-back";
    } finally {
      this.releaseLease();
    }
  }

  private restoreOriginalAfterFailure(): DemoResetError | undefined {
    try {
      for (const live of [...this.installedLivePaths].reverse()) {
        if (live === this.paths.database) {
          assertLearningDatabasePathSafe(this.paths, live);
          removeDatabaseSet(live);
        }
        else removeLearningDirectory(this.paths, live);
      }
      this.installedLivePaths = [];
      for (const entry of [...this.backupEntries].reverse()) {
        if (!existsSync(entry.backup)) continue;
        assertLearningBackupEntrySafe(this.paths, entry);
        renameSync(entry.backup, entry.live);
      }
      this.backupEntries = [];
      return undefined;
    } catch (error) {
      const retained = this.backupEntries
        .filter(({ backup }) => existsSync(backup))
        .map(({ backup }) => basename(backup));
      const suffix = retained.length === 0
        ? "Recovery backups may remain beside the learning resources."
        : `Recovery backups retained: ${retained.join(", ")}.`;
      return new DemoResetError(
        `Learning demo state replacement failed and rollback could not complete. ${suffix}`,
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

function resolveLearningResetPaths(input: LearningDemoResetInput): LearningResetPaths {
  const dataRoot = canonicalizeNearestExisting(input.dataRoot);
  const database = canonicalizeNearestExisting(input.learningLedgerFile);
  if (basename(database).toLocaleLowerCase() === "operational.sqlite") {
    throw new DemoResetError(
      "An operational database cannot be used as a learning ledger reset target.",
      "PATH_SAFETY",
    );
  }
  const id = randomUUID();
  const temporary = canonicalizeNearestExisting(`${database}.reset-${id}.tmp`);
  const backup = canonicalizeNearestExisting(`${database}.reset-backup-${id}`);
  const staticKnowledgeRoot = canonicalizeNearestExisting(resolve(dataRoot, "data", "knowledge"));
  if (isContainedPath(staticKnowledgeRoot, database) || isContainedPath(database, staticKnowledgeRoot)) {
    throw new DemoResetError(
      "Static knowledge content cannot be used as a learning ledger reset target.",
      "PATH_SAFETY",
    );
  }
  const knowledgeEvolutionRoot = resolve(dataRoot, "knowledge-evolution");
  const canonicalKnowledgeEvolutionRoot = canonicalizeNearestExisting(knowledgeEvolutionRoot);
  if (
    canonicalKnowledgeEvolutionRoot !== knowledgeEvolutionRoot
    || !isContainedPath(dataRoot, canonicalKnowledgeEvolutionRoot)
  ) {
    throw new DemoResetError(
      "The mutable learning root is outside the configured data root.",
      "PATH_SAFETY",
    );
  }
  const mutableDirectories = MUTABLE_LEARNING_DIRECTORY_NAMES.map((name) => {
    const expectedLive = resolve(knowledgeEvolutionRoot, name);
    const live = canonicalizeNearestExisting(expectedLive);
    if (live !== expectedLive || !isContainedPath(knowledgeEvolutionRoot, live)) {
      throw new DemoResetError(
        "A mutable learning path is outside the explicitly allowed reset paths.",
        "PATH_SAFETY",
      );
    }
    const temporaryDirectory = canonicalizeNearestExisting(`${live}.reset-${id}.tmp`);
    const backupDirectory = canonicalizeNearestExisting(`${live}.reset-backup-${id}`);
    for (const target of [temporaryDirectory, backupDirectory]) {
      if (!isContainedPath(knowledgeEvolutionRoot, target)) {
        throw new DemoResetError(
          "A mutable learning replacement path is outside the explicitly allowed reset paths.",
          "PATH_SAFETY",
        );
      }
    }
    return { name, live, temporary: temporaryDirectory, backup: backupDirectory };
  });
  if (input.allowExternalLedgerPath !== true) {
    for (const target of [database, temporary, backup]) {
      if (!isContainedPath(dataRoot, target)) {
        throw new DemoResetError(
          "The learning ledger is outside the configured data root.",
          "PATH_SAFETY",
        );
      }
    }
  }
  for (const target of [database, temporary, backup]) {
    for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
      const sidecar = canonicalizeNearestExisting(`${target}${suffix}`);
      if (input.allowExternalLedgerPath !== true && !isContainedPath(dataRoot, sidecar)) {
        throw new DemoResetError(
          "A learning ledger sidecar is outside the configured data root.",
          "PATH_SAFETY",
        );
      }
    }
  }
  if (mutableDirectories.some(({ live }) => pathsOverlap(database, live))) {
    throw new DemoResetError(
      "The learning ledger overlaps an explicitly managed mutable learning directory.",
      "PATH_SAFETY",
    );
  }
  return {
    dataRoot,
    database,
    temporary,
    backup,
    mutableDirectories,
    allowExternalLedgerPath: input.allowExternalLedgerPath === true,
  };
}

async function verifyLearningBaseline(
  databasePath: string,
  directories: readonly LearningDirectoryPaths[],
  phase: "temporary" | "live",
): Promise<void> {
  if (!existsSync(databasePath)) learningVerificationFailure();
  const ledger = new SqliteLearningLedger(databasePath);
  try {
    await ledger.initialize();
    const store = new SqliteKnowledgeEvolutionStore(ledger.getDatabase());
    await store.initialize();
    const [events, candidates, approved, versions, heads, audits] = await Promise.all([
      ledger.snapshot(),
      store.listCandidates(),
      store.listApproved(),
      store.listVersionsAsOf("9999-12-31T23:59:59.999Z"),
      store.listHeadMappings(),
      store.list(),
    ]);
    if (
      events.length !== 0
      || candidates.length !== 0
      || approved.length !== 0
      || versions.length !== 0
      || heads.size !== 0
      || audits.length !== 0
    ) learningVerificationFailure();
  } catch (error) {
    if (error instanceof DemoResetError) throw error;
    throw new DemoResetError(
      "Learning demo state verification failed.",
      "VERIFICATION_FAILED",
      { cause: error },
    );
  } finally {
    ledger.close();
  }
  const paths = new Map(directories.map((directory) => [
    directory.name,
    phase === "temporary" ? directory.temporary : directory.live,
  ]));
  try {
    const diagnosesRoot = paths.get("diagnoses")!;
    const candidatesRoot = paths.get("candidates")!;
    const approvedRoot = paths.get("approved")!;
    const auditRoot = paths.get("audit")!;
    const [diagnoses, legacyCandidates, legacyApproved, legacyAudits] = await Promise.all([
      new DiagnosisRepository(diagnosesRoot).list(),
      new KnowledgeObjectRepository(candidatesRoot, approvedRoot).listCandidates(),
      new KnowledgeObjectRepository(candidatesRoot, approvedRoot).listApproved(),
      new KnowledgeAuditRepository(resolve(auditRoot, "events.jsonl")).list(),
    ]);
    if (
      diagnoses.length !== 0
      || legacyCandidates.length !== 0
      || legacyApproved.length !== 0
      || legacyAudits.length !== 0
      || [...paths.values()].some((path) => !existsSync(path) || readdirSync(path).length !== 0)
    ) learningVerificationFailure();
  } catch (error) {
    if (error instanceof DemoResetError) throw error;
    throw new DemoResetError(
      "Learning demo state verification failed.",
      "VERIFICATION_FAILED",
      { cause: error },
    );
  }
}

function learningVerificationFailure(): never {
  throw new DemoResetError(
    "Learning demo state verification failed.",
    "VERIFICATION_FAILED",
  );
}

function moveLearningResourcesToBackup(
  paths: LearningResetPaths,
  moved: BackupEntry[],
): void {
  const databaseEntries = databaseSet(paths.database)
    .map((live, index) => ({
      live,
      backup: index === 0
        ? paths.backup
        : `${paths.backup}${SQLITE_SIDECAR_SUFFIXES[index - 1]}`,
    }))
    .filter(({ live }) => existsSync(live));
  for (const entry of databaseEntries) {
    assertLearningDatabasePathSafe(paths, entry.live);
    assertLearningDatabasePathSafe(paths, entry.backup);
    renameSync(entry.live, entry.backup);
    moved.push(entry);
  }
  for (const directory of paths.mutableDirectories) {
    if (!existsSync(directory.live)) continue;
    assertLearningDirectoryPathSafe(paths, directory.live);
    assertLearningDirectoryPathSafe(paths, directory.backup);
    renameSync(directory.live, directory.backup);
    moved.push({ live: directory.live, backup: directory.backup });
  }
}

function installPreparedLearningResources(
  paths: LearningResetPaths,
  installed: string[],
): void {
  assertLearningDatabasePathSafe(paths, paths.temporary);
  assertLearningDatabasePathSafe(paths, paths.database);
  renameSync(paths.temporary, paths.database);
  installed.push(paths.database);
  for (const directory of paths.mutableDirectories) {
    assertLearningDirectoryPathSafe(paths, directory.temporary);
    assertLearningDirectoryPathSafe(paths, directory.live);
    renameSync(directory.temporary, directory.live);
    installed.push(directory.live);
  }
}

function removeLearningPreparedResources(paths: LearningResetPaths): void {
  assertLearningDatabasePathSafe(paths, paths.temporary);
  removeDatabaseSet(paths.temporary);
  for (const directory of paths.mutableDirectories) {
    removeLearningDirectory(paths, directory.temporary);
  }
}

function removeLearningPreparedResourcesBestEffort(paths: LearningResetPaths): void {
  try {
    removeLearningPreparedResources(paths);
  } catch {
    // A failed replacement keeps the primary error and any recovery backups.
  }
}

function removeLearningBackupEntriesBestEffort(
  paths: LearningResetPaths,
  entries: readonly BackupEntry[],
): void {
  for (const entry of entries) {
    try {
      assertLearningBackupEntrySafe(paths, entry);
      rmSync(entry.backup, { recursive: true, force: true });
    } catch {
      // A verified replacement remains authoritative; retaining an undeletable
      // recovery backup is safer than rolling back after partial cleanup.
    }
  }
}

function assertLearningBackupEntrySafe(
  paths: LearningResetPaths,
  entry: BackupEntry,
): void {
  const directoryTargets = paths.mutableDirectories.flatMap((directory) => [
    directory.live,
    directory.temporary,
    directory.backup,
  ]);
  if (directoryTargets.includes(entry.live) || directoryTargets.includes(entry.backup)) {
    assertLearningDirectoryPathSafe(paths, entry.live);
    assertLearningDirectoryPathSafe(paths, entry.backup);
    return;
  }
  assertLearningDatabasePathSafe(paths, entry.live);
  assertLearningDatabasePathSafe(paths, entry.backup);
}

function removeLearningDirectory(paths: LearningResetPaths, target: string): void {
  assertLearningDirectoryPathSafe(paths, target);
  rmSync(target, { recursive: true, force: true });
}

function assertLearningDatabasePathSafe(paths: LearningResetPaths, target: string): void {
  if (paths.allowExternalLedgerPath) return;
  const canonical = canonicalizeNearestExisting(target);
  if (!isContainedPath(paths.dataRoot, canonical)) {
    throw new DemoResetError(
      "A learning ledger reset path is outside the configured data root.",
      "PATH_SAFETY",
    );
  }
}

function assertLearningDirectoryPathSafe(paths: LearningResetPaths, target: string): void {
  const allowed = paths.mutableDirectories.flatMap((directory) => [
    directory.live,
    directory.temporary,
    directory.backup,
  ]);
  if (!allowed.includes(target)) {
    throw new DemoResetError(
      "A learning directory is not in the explicit reset whitelist.",
      "PATH_SAFETY",
    );
  }
  const canonical = canonicalizeNearestExisting(target);
  const knowledgeEvolutionRoot = resolve(paths.dataRoot, "knowledge-evolution");
  if (!isContainedPath(knowledgeEvolutionRoot, canonical)) {
    throw new DemoResetError(
      "A mutable learning path is outside the explicitly allowed reset paths.",
      "PATH_SAFETY",
    );
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return isContainedPath(left, right) || isContainedPath(right, left);
}

function isOperationalDatabase(path: string): boolean {
  if (!existsSync(path)) return false;
  let database: Database.Database | undefined;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    const tables = new Set(
      (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
        .map(({ name }) => name),
    );
    return tables.has("operational_metadata") && tables.has("tickets");
  } catch {
    return false;
  } finally {
    database?.close();
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
