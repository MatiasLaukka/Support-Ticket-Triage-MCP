import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  TicketSchema,
  TriageRecommendationSchema,
  type Ticket,
  type TriageRecommendation,
} from "../domain.js";
import type { OperationalCommandStore } from "../triage-service.js";
import {
  ConversationMessageSchema,
  DecisionTraceEventSchema,
  ImportResolutionSchema,
  OperationalDiagnosisRecordSchema,
  OperationalEventSchema,
  OperationalWorkflowSnapshotSchema,
  RecommendationRevisionSchema,
  TicketRevisionSchema,
  canonicalOperationalRequestJson,
  conversationMessageKindForOperationalAction,
  type ConversationMessage,
  type DecisionTraceEvent,
  type ImportResolution,
  type ImportState,
  type OperationalEvent,
  type OperationalWorkflowSnapshot,
  type TicketRevision,
} from "./domain.js";
import { OperationalSqliteStore } from "./sqlite-store.js";
import {
  OperationalStoreError,
  type OperationalImportSourceMetadata,
  type OperationalDiagnosisWrite,
  type OperationalEventWrite,
  type RecommendationRevisionWrite,
} from "./unit-of-work.js";

const SourceIdSchema = z.string().trim().min(1).max(240)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const ImportedEventBaseSchema = z.object({
  provenance: z.literal("legacy"),
  id: z.uuid(),
  ticketId: z.string().regex(/^TKT-\d{4}$/),
  occurredAt: z.iso.datetime({ offset: true }),
  actor: z.string().trim().min(1).max(120),
  action: z.string().trim().min(1),
  commandId: z.uuid(),
  facts: z.record(z.string(), z.unknown()),
}).strict();
const ImportAggregateContainerSchema = z.object({
  sourceId: SourceIdSchema,
  provenance: z.literal("legacy"),
  ticket: TicketSchema,
  events: z.array(ImportedEventBaseSchema),
  ticketRevisions: z.array(TicketRevisionSchema),
  messages: z.array(ConversationMessageSchema),
  recommendations: z.array(TriageRecommendationSchema),
  recommendationRevisions: z.array(RecommendationRevisionSchema),
  diagnoses: z.array(OperationalDiagnosisRecordSchema),
  traces: z.array(DecisionTraceEventSchema),
}).strict();

export type ImportedOperationalEvent = Omit<OperationalEvent, "sequence" | "facts"> & {
  readonly provenance: "legacy";
  readonly facts: Readonly<Record<string, unknown>>;
};

export interface OperationalImportAggregate {
  readonly sourceId: string;
  readonly provenance: "legacy";
  readonly ticket: Ticket;
  /** Source append/audit order. Timestamps deliberately do not control order. */
  readonly events: readonly ImportedOperationalEvent[];
  readonly ticketRevisions: readonly TicketRevision[];
  readonly messages: readonly ConversationMessage[];
  readonly recommendations: readonly TriageRecommendation[];
  readonly recommendationRevisions: readonly RecommendationRevisionWrite[];
  readonly diagnoses: readonly OperationalDiagnosisWrite[];
  /** Only already-present, sanitized source traces belong here. */
  readonly traces: readonly DecisionTraceEvent[];
}

export interface OperationalImportInput {
  readonly store: OperationalSqliteStore;
  readonly aggregates: readonly unknown[];
}

export type ImportAggregateValidationStatus =
  | "valid"
  | "invalid"
  | "already-imported"
  | "conflict";

export interface ImportAggregateValidation {
  readonly sourceId: string;
  readonly status: ImportAggregateValidationStatus;
  readonly issues: readonly string[];
}

export interface ImportValidationReport {
  readonly valid: boolean;
  readonly discoveredSourceIds: readonly string[];
  readonly aggregates: readonly ImportAggregateValidation[];
}

export interface ImportConflict {
  readonly sourceId: string;
  readonly code: "AGGREGATE_CONFLICT";
  readonly message: string;
}

export interface ImportInvalidAggregate {
  readonly sourceId: string;
  readonly issues: readonly string[];
}

export interface ImportSummary {
  readonly state: ImportState;
  readonly importedSourceIds: readonly string[];
  readonly alreadyImportedSourceIds: readonly string[];
  readonly conflicts: readonly ImportConflict[];
  readonly invalid: readonly ImportInvalidAggregate[];
}

interface ValidatedAggregate extends Omit<OperationalImportAggregate, "events"> {
  readonly expectedSnapshot: OperationalWorkflowSnapshot;
  readonly events: readonly OperationalEvent[];
  readonly aggregateHash: string;
}

interface AggregateValidationResult {
  readonly sourceId: string;
  readonly manifestSource: OperationalImportSourceMetadata;
  readonly aggregate?: ValidatedAggregate;
  readonly issues: readonly string[];
}

/** Performs validation and conflict inspection without opening a write transaction. */
export function validateImport(input: OperationalImportInput): ImportValidationReport {
  const validations = validateAggregates(input.aggregates);
  const manifest = input.store.listImportSources();
  const importedSourceIds = new Set(input.store.listImportedSourceIds());
  const duplicateSourceIds = duplicateValues(validations.map(({ sourceId }) => sourceId));
  const aggregates = validations.map((validation): ImportAggregateValidation => {
    if (duplicateSourceIds.has(validation.sourceId)) {
      return {
        sourceId: validation.sourceId,
        status: "invalid",
        issues: ["Import source IDs must be unique."],
      };
    }
    if (validation.aggregate === undefined) {
      return { sourceId: validation.sourceId, status: "invalid", issues: validation.issues };
    }
    const recordedSource = manifest.find(({ sourceId }) => sourceId === validation.sourceId);
    if (recordedSource !== undefined) {
      if (recordedSource.aggregateHash !== validation.aggregate.aggregateHash) {
        return {
          sourceId: validation.sourceId,
          status: "conflict",
          issues: ["The source aggregate differs from the durable import manifest."],
        };
      }
      if (importedSourceIds.has(validation.sourceId)) {
        return { sourceId: validation.sourceId, status: "already-imported", issues: [] };
      }
    }
    const existing = readExistingSnapshot(input.store, validation.aggregate.ticket.id);
    if (existing === undefined) {
      return { sourceId: validation.sourceId, status: "valid", issues: [] };
    }
    if (sameSnapshot(existing, validation.aggregate.expectedSnapshot)) {
      return { sourceId: validation.sourceId, status: "already-imported", issues: [] };
    }
    return {
      sourceId: validation.sourceId,
      status: "conflict",
      issues: ["The source aggregate conflicts with existing operational data."],
    };
  });
  return {
    valid: aggregates.every(({ status }) => status === "valid" || status === "already-imported"),
    discoveredSourceIds: validations.map(({ sourceId }) => sourceId),
    aggregates,
  };
}

/** Imports each valid ticket aggregate atomically and leaves other conflicts isolated. */
export function importOperationalData(input: OperationalImportInput): ImportSummary {
  const validations = validateAggregates(input.aggregates);
  const sourceIds = validations.map(({ sourceId }) => sourceId);
  if (sourceIds.length === 0) {
    throw new OperationalStoreError(
      "Operational import requires at least one discovered source aggregate.",
      "VALIDATION_ERROR",
    );
  }
  const duplicateSourceIds = duplicateValues(sourceIds);
  beginOrResumeImport(input.store, validations.map(({ manifestSource }) => manifestSource));

  const importedSourceIds: string[] = [];
  const alreadyImportedSourceIds: string[] = [];
  const conflicts: ImportConflict[] = [];
  const invalid: ImportInvalidAggregate[] = [];

  for (const validation of validations) {
    if (duplicateSourceIds.has(validation.sourceId)) {
      invalid.push({ sourceId: validation.sourceId, issues: ["Import source IDs must be unique."] });
      continue;
    }
    if (validation.aggregate === undefined) {
      invalid.push({ sourceId: validation.sourceId, issues: validation.issues });
      continue;
    }
    try {
      const result = importAggregate(input.store, validation.aggregate);
      if (result === "imported") importedSourceIds.push(validation.sourceId);
      else alreadyImportedSourceIds.push(validation.sourceId);
    } catch (error) {
      if (error instanceof OperationalStoreError && error.code === "IDEMPOTENCY_CONFLICT") {
        conflicts.push({
          sourceId: validation.sourceId,
          code: "AGGREGATE_CONFLICT",
          message: "The source aggregate conflicts with existing operational data.",
        });
        continue;
      }
      throw error;
    }
  }

  return {
    state: input.store.readImportState(),
    importedSourceIds,
    alreadyImportedSourceIds,
    conflicts,
    invalid,
  };
}

/** Records an immutable operator skip and completes import when it resolves the final source. */
export function recordImportSkip(input: {
  readonly store: OperationalSqliteStore;
  readonly resolution: ImportResolution;
}): void {
  const resolution = ImportResolutionSchema.parse(input.resolution);
  input.store.transaction((unit) => {
    if (unit.listImportResolutions().some((recorded) => (
      recorded.sourceId === resolution.sourceId
      && recorded.commandId === resolution.commandId
    ))) {
      throw new OperationalStoreError(
        "An import resolution is already recorded for this source and command.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
    if (unit.readImportState() !== "import-in-progress") {
      throw new OperationalStoreError(
        "Import skips may be recorded only while an operational import is in progress.",
        "STATE_ERROR",
      );
    }
    const manifest = unit.readImportManifest() ?? [];
    if (!manifest.some(({ sourceId }) => sourceId === resolution.sourceId)) {
      throw new OperationalStoreError(
        "Import skip source is not part of the active manifest.",
        "VALIDATION_ERROR",
      );
    }
    unit.appendImportResolution(resolution);
    unit.completeImportIfReady();
  });
}

/** Explicitly enables a new native database only when no supplied legacy inputs exist. */
export function initializeOperationalNative(input: {
  readonly store: OperationalSqliteStore;
  readonly legacyPaths: readonly string[];
}): void {
  const recognizable = input.legacyPaths.filter(hasRecognizableLegacyContent);
  if (recognizable.length > 0) {
    throw new OperationalStoreError(
      "Recognizable legacy operational files exist; import or explicitly resolve them before native initialization.",
      "STATE_ERROR",
    );
  }
  input.store.transaction((unit) => {
    if (unit.readImportState() !== "empty") {
      throw new OperationalStoreError(
        "Native initialization is allowed only for an empty operational database.",
        "STATE_ERROR",
      );
    }
    unit.transitionImportState("empty", "native");
  });
}

/** Runtime-facing view: reads remain available, live write transactions are state-gated. */
export function createRuntimeOperationalStore<T extends OperationalCommandStore & {
  readImportState(): ImportState;
  assertRuntimeMutationsAllowed(): void;
}>(store: T): T {
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === "transaction") {
        return <R>(work: Parameters<OperationalCommandStore["transaction"]>[0]): R => {
          target.assertRuntimeMutationsAllowed();
          return target.transaction(work) as R;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function validateAggregates(values: readonly unknown[]): AggregateValidationResult[] {
  return values.map((value, index) => validateAggregate(value, index));
}

function validateAggregate(value: unknown, index: number): AggregateValidationResult {
  const fallbackSourceId = sourceIdFrom(value) ?? `invalid-source-${index + 1}`;
  const fallbackManifest = manifestSourceFor(value, fallbackSourceId);
  const parsed = ImportAggregateContainerSchema.safeParse(value);
  if (!parsed.success) {
    return {
      sourceId: fallbackSourceId,
      manifestSource: fallbackManifest,
      issues: uniqueIssues(parsed.error.issues.map((issue) => issue.message)),
    };
  }
  const source = parsed.data;
  const events: OperationalEvent[] = [];
  const eventIssues: string[] = [];
  for (const [eventIndex, imported] of source.events.entries()) {
    const { provenance: _provenance, ...event } = imported;
    const result = OperationalEventSchema.safeParse({ ...event, sequence: eventIndex + 1 });
    if (!result.success) {
      eventIssues.push(...result.error.issues.map((issue) => issue.message));
      continue;
    }
    const messageKind = conversationMessageKindForOperationalAction(result.data.action);
    if (messageKind === undefined && result.data.facts.reasonCode !== "legacy-import") {
      eventIssues.push("Imported non-message events must carry legacy-import provenance.");
    }
    events.push(result.data);
  }
  if (eventIssues.length > 0) {
    return {
      sourceId: source.sourceId,
      manifestSource: fallbackManifest,
      issues: uniqueIssues(eventIssues),
    };
  }

  const latestCustomer = source.messages
    .filter((message) => message.kind === "customer")
    .map((message) => ({ message, event: events.find((event) => event.id === message.operationalEventId) }))
    .filter((entry): entry is { message: ConversationMessage; event: OperationalEvent } => entry.event !== undefined)
    .sort((left, right) => left.event.sequence - right.event.sequence)
    .at(-1)?.message;
  const eventSequence = new Map(events.map((event) => [event.id, event.sequence]));
  const recommendationLatestSequence = new Map<string, number>();
  for (const revision of source.recommendationRevisions) {
    recommendationLatestSequence.set(
      revision.recommendation.id,
      Math.max(
        recommendationLatestSequence.get(revision.recommendation.id) ?? 0,
        eventSequence.get(revision.operationalEventId) ?? 0,
      ),
    );
  }
  const expectedSnapshot = OperationalWorkflowSnapshotSchema.safeParse({
    ticket: source.ticket,
    ticketRevisions: [...source.ticketRevisions].sort((left, right) =>
      causalSequence(eventSequence, left.operationalEventId)
      - causalSequence(eventSequence, right.operationalEventId)),
    recommendations: [...source.recommendations].sort((left, right) =>
      (recommendationLatestSequence.get(left.id) ?? 0)
      - (recommendationLatestSequence.get(right.id) ?? 0)
      || left.id.localeCompare(right.id)),
    recommendationRevisions: [...source.recommendationRevisions].sort((left, right) =>
      causalSequence(eventSequence, left.operationalEventId)
      - causalSequence(eventSequence, right.operationalEventId)
      || left.recommendation.id.localeCompare(right.recommendation.id)),
    messages: [...source.messages].sort((left, right) =>
      causalSequence(eventSequence, left.operationalEventId)
      - causalSequence(eventSequence, right.operationalEventId)
      || left.id.localeCompare(right.id)),
    diagnoses: [...source.diagnoses].sort((left, right) =>
      causalSequence(eventSequence, left.operationalEventId)
      - causalSequence(eventSequence, right.operationalEventId)
      || left.diagnosis.id.localeCompare(right.diagnosis.id)),
    events,
    traces: [...source.traces].sort((left, right) =>
      causalSequence(eventSequence, left.operationalEventId)
      - causalSequence(eventSequence, right.operationalEventId)
      || left.id.localeCompare(right.id)),
    customerReplyWatermark: latestCustomer === undefined
      ? { state: "none" }
      : { state: "reply", timestamp: latestCustomer.createdAt, id: latestCustomer.id },
  });
  if (!expectedSnapshot.success) {
    return {
      sourceId: source.sourceId,
      manifestSource: fallbackManifest,
      issues: uniqueIssues(expectedSnapshot.error.issues.map((issue) => issue.message)),
    };
  }
  const aggregateHash = hashCanonical({
    sourceId: source.sourceId,
    provenance: source.provenance,
    snapshot: expectedSnapshot.data,
  });
  return {
    sourceId: source.sourceId,
    manifestSource: {
      sourceId: source.sourceId,
      ticketId: source.ticket.id,
      provenance: source.provenance,
      aggregateHash,
    },
    issues: [],
    aggregate: {
      ...source,
      events,
      expectedSnapshot: expectedSnapshot.data,
      aggregateHash,
    },
  };
}

function importAggregate(
  store: OperationalSqliteStore,
  aggregate: ValidatedAggregate,
): "imported" | "already-imported" {
  try {
    return store.transaction((unit) => {
      if (unit.readImportedSourceIds().includes(aggregate.sourceId)) {
        return "already-imported";
      }
      let existing: OperationalWorkflowSnapshot | undefined;
      try {
        existing = unit.readWorkflowSnapshot(aggregate.ticket.id);
      } catch (error) {
        if (!(error instanceof OperationalStoreError) || error.code !== "NOT_FOUND") throw error;
      }
      if (existing !== undefined) {
        if (!sameSnapshot(existing, aggregate.expectedSnapshot)) {
          throw new OperationalStoreError(
            "The source aggregate conflicts with existing operational data.",
            "IDEMPOTENCY_CONFLICT",
          );
        }
        unit.markImportedSource(aggregate.sourceId);
        unit.completeImportIfReady();
        return "already-imported";
      }

      unit.insertTicket(aggregate.ticket);
      const sequences = aggregate.events.length === 0
        ? []
        : unit.allocateEventSequences(aggregate.ticket.id, aggregate.events.length);
      for (const recommendation of aggregate.recommendations) unit.insertRecommendation(recommendation);
      for (const revision of aggregate.ticketRevisions) unit.appendTicketRevision(revision);
      for (const revision of aggregate.recommendationRevisions) unit.appendRecommendationRevision(revision);
      for (const message of aggregate.messages) unit.insertMessage(message);
      for (const diagnosis of aggregate.diagnoses) unit.insertDiagnosis(diagnosis);
      for (const event of aggregate.events) {
        const sequence = sequences[event.sequence - 1];
        if (sequence !== event.sequence) {
          throw new OperationalStoreError(
            "Imported event sequence allocation did not begin at one for a new aggregate.",
            "SEQUENCE_ERROR",
          );
        }
        unit.appendEvent(event as OperationalEventWrite);
      }
      for (const trace of aggregate.traces) unit.appendTrace(trace);
      unit.markImportedSource(aggregate.sourceId);
      unit.completeImportIfReady();
      return "imported";
    });
  } catch (error) {
    if (isSqliteConstraint(error)) {
      throw new OperationalStoreError(
        "The source aggregate conflicts with existing operational data.",
        "IDEMPOTENCY_CONFLICT",
        { cause: error },
      );
    }
    throw error;
  }
}

function beginOrResumeImport(
  store: OperationalSqliteStore,
  sources: readonly OperationalImportSourceMetadata[],
): void {
  const canonicalSources = [...sources].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId));
  store.transaction((unit) => {
    const state = unit.readImportState();
    if (state === "native") {
      throw new OperationalStoreError(
        "A native operational database cannot accept legacy import.",
        "STATE_ERROR",
      );
    }
    if (state === "empty") {
      unit.transitionImportState("empty", "import-in-progress");
      unit.writeImportManifest(canonicalSources);
      return;
    }
    const manifest = unit.readImportManifest();
    if (manifest === undefined || JSON.stringify(manifest) !== JSON.stringify(canonicalSources)) {
      throw new OperationalStoreError(
        "Operational import manifest differs from the active or completed import.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
  });
}

function readExistingSnapshot(
  store: OperationalSqliteStore,
  ticketId: Ticket["id"],
): OperationalWorkflowSnapshot | undefined {
  try {
    return store.readWorkflowSnapshot(ticketId);
  } catch (error) {
    if (error instanceof OperationalStoreError && error.code === "NOT_FOUND") return undefined;
    throw error;
  }
}

function sameSnapshot(left: OperationalWorkflowSnapshot, right: OperationalWorkflowSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sourceIdFrom(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("sourceId" in value)) return undefined;
  return typeof value.sourceId === "string" && value.sourceId.length > 0
    ? value.sourceId.slice(0, 240)
    : undefined;
}

function manifestSourceFor(
  value: unknown,
  sourceId: string,
): OperationalImportSourceMetadata {
  const candidate = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
  const ticketCandidate = candidate?.ticket;
  const ticketId = typeof ticketCandidate === "object" && ticketCandidate !== null
    && "id" in ticketCandidate && typeof ticketCandidate.id === "string"
    && /^TKT-\d{4}$/.test(ticketCandidate.id)
    ? ticketCandidate.id as Ticket["id"]
    : undefined;
  return {
    sourceId,
    ...(ticketId === undefined ? {} : { ticketId }),
    provenance: candidate?.provenance === "legacy" ? "legacy" : "unvalidated",
    aggregateHash: hashCanonical(value),
  };
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalOperationalRequestJson(value)).digest("hex");
}

function causalSequence(sequences: ReadonlyMap<string, number>, eventId: string): number {
  return sequences.get(eventId) ?? Number.MAX_SAFE_INTEGER;
}

function duplicateValues(values: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function uniqueIssues(issues: readonly string[]): readonly string[] {
  return [...new Set(issues.length === 0 ? ["Source aggregate is invalid."] : issues)];
}

function isSqliteConstraint(error: unknown): boolean {
  return error instanceof Error && (
    ("code" in error && typeof error.code === "string" && error.code.startsWith("SQLITE_CONSTRAINT"))
    || /(?:UNIQUE|FOREIGN KEY|CHECK|NOT NULL) constraint failed/i.test(error.message)
  );
}

function hasRecognizableLegacyContent(path: string): boolean {
  if (!existsSync(path)) return false;
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) return true;
  if (stats.isFile()) return true;
  return stats.isDirectory() && readdirSync(path).length > 0;
}

function runCli(): void {
  const command = process.argv[2];
  const cwd = process.cwd();
  const dataRoot = resolve(cwd, process.env.TRIAGE_DATA_ROOT ?? "data/runtime");
  const databasePath = resolve(cwd, process.env.OPERATIONAL_DB_PATH ?? resolve(dataRoot, "operational.sqlite"));
  const store = OperationalSqliteStore.open(databasePath);
  try {
    store.initialize();
    if (command === "initialize-native") {
      initializeOperationalNative({
        store,
        legacyPaths: [
          resolve(dataRoot, "tickets"),
          resolve(dataRoot, "recommendations"),
          resolve(dataRoot, "audit", "events.jsonl"),
          resolve(dataRoot, "knowledge-evolution", "diagnoses"),
        ],
      });
      process.stdout.write(`${JSON.stringify({ state: store.readImportState() })}\n`);
      return;
    }
    if (command === "import") {
      const importFile = process.env.OPERATIONAL_IMPORT_FILE;
      if (importFile === undefined || importFile.trim() === "") {
        throw new OperationalStoreError(
          "OPERATIONAL_IMPORT_FILE must identify a typed operational import manifest.",
          "VALIDATION_ERROR",
        );
      }
      const decoded = JSON.parse(readFileSync(resolve(cwd, importFile), "utf8")) as { aggregates?: unknown };
      const aggregates = Array.isArray(decoded.aggregates) ? decoded.aggregates : [];
      process.stdout.write(`${JSON.stringify(importOperationalData({ store, aggregates }))}\n`);
      return;
    }
    throw new OperationalStoreError(
      "Operational import command must be initialize-native or import.",
      "VALIDATION_ERROR",
    );
  } finally {
    store.close();
  }
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && pathToFileURL(resolve(entryPoint)).href === import.meta.url) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operational import failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
