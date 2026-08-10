import type Database from "better-sqlite3";
import {
  TicketIdSchema,
  TicketSchema,
  TriageRecommendationSchema,
  type Ticket,
  type TicketId,
  type TriageRecommendation,
} from "../domain.js";
import {
  CompletedDiagnosisSchema,
  type CompletedDiagnosis,
} from "../knowledge-evolution/domain.js";
import {
  CommandIdempotencyRecordSchema,
  CommandIdSchema,
  ConversationMessageSchema,
  DecisionTraceEventSchema,
  OperationalDiagnosisRecordSchema,
  OperationalEventSchema,
  OperationalResultReferenceSchema,
  OperationalWorkflowSnapshotSchema,
  RecommendationRevisionSchema,
  RequestHashSchema,
  TicketRevisionSchema,
  type CommandIdempotencyRecord,
  type ConversationMessage,
  type DecisionTraceEvent,
  type OperationalEvent,
  type OperationalResultReference,
  type OperationalWorkflowSnapshot,
  type TicketRevision,
} from "./domain.js";
import {
  canonicalRequestHash,
  immutableCommandReplay,
  normalizeOperationName,
  type CommandReplay,
} from "./idempotency.js";

export type OperationalStoreErrorCode =
  | "ASYNC_TRANSACTION"
  | "CLOSED"
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_FOUND"
  | "NOT_INITIALIZED"
  | "PERSISTENCE_ERROR"
  | "SCHEMA_ERROR"
  | "SEQUENCE_ERROR"
  | "STALE_REVISION"
  | "VALIDATION_ERROR";

export class OperationalStoreError extends Error {
  override readonly name = "OperationalStoreError";

  constructor(
    message: string,
    readonly code: OperationalStoreErrorCode,
    options: { cause?: unknown } = {},
  ) {
    super(message, options);
  }
}

interface JsonRow { payload_json: string; }
interface EventRow { event_json: string; }
interface TraceRow { trace_json: string; }
interface SequenceRow { sequence: number; }
interface TotalChangesRow { count: number; }
interface CommandRow {
  command_id: string;
  operation: string;
  request_hash: string;
  result_json: string;
  created_at: string;
}
interface CommandEventRow {
  id: string;
  ticket_id: string;
  sequence: number;
}
interface TicketRevisionReferenceRow {
  ticket_id: string;
  revision: number;
  current_revision: number;
}
interface SemanticReferenceRow {
  id: string;
  ticket_id: string;
}

/** Task 1's enum-keyed Zod record infers every allowlisted key as required. */
export type OperationalEventWrite = Omit<OperationalEvent, "facts"> & {
  readonly facts: Readonly<Record<string, unknown>>;
};

export interface RecommendationRevisionWrite {
  readonly recommendation: TriageRecommendation;
  readonly operationalEventId: string;
  readonly createdAt: string;
}

export interface OperationalDiagnosisWrite {
  readonly diagnosis: CompletedDiagnosis;
  readonly operationalEventId: string;
}

/**
 * Transaction-scoped persistence primitives. Workflow decisions stay in the
 * domain service; this object validates and atomically stores their write set.
 */
export class OperationalUnitOfWork {
  private active = true;
  private commandClosure: "open" | "result-persisted" | "replay" = "open";
  private persistedCommandRecord: CommandIdempotencyRecord | undefined;
  private readonly reservedSequences = new Map<string, number[]>();
  private readonly ticketProjectionUpdates = new Map<string, number>();
  private readonly pendingCommandClaims = new Map<string, {
    readonly operation: string;
    readonly requestHash: string;
  }>();

  private readonly initialTotalChanges: number;

  constructor(private readonly database: Database.Database) {
    this.initialTotalChanges = this.totalChanges();
  }

  beginCommand(
    commandId: string,
    operation: string,
    request: unknown,
  ): CommandReplay | "new" {
    this.assertActive();
    const parsedCommandId = parseWith(
      CommandIdSchema,
      commandId,
      "Operational command ID is invalid.",
    );
    let parsedOperation: string;
    let requestHash: string;
    try {
      parsedOperation = normalizeOperationName(operation);
      requestHash = canonicalRequestHash(parsedOperation, request);
    } catch (error) {
      throw new OperationalStoreError(
        "Operational command request could not be normalized.",
        "VALIDATION_ERROR",
        { cause: error },
      );
    }

    const stored = this.readCommandRecord(parsedCommandId);
    if (stored !== undefined) {
      if (stored.operation !== parsedOperation || stored.requestHash !== requestHash) {
        throw new OperationalStoreError(
          "Operational command ID was already used for a different operation or request.",
          "IDEMPOTENCY_CONFLICT",
        );
      }
      if (this.hasMutationActivity()) {
        throw new OperationalStoreError(
          "Operational command replay must be checked before transaction mutations.",
          "IDEMPOTENCY_CONFLICT",
        );
      }
      this.commandClosure = "replay";
      return immutableCommandReplay(stored.result);
    }

    const pending = this.pendingCommandClaims.get(parsedCommandId);
    if (
      pending !== undefined
      && (pending.operation !== parsedOperation || pending.requestHash !== requestHash)
    ) {
      throw new OperationalStoreError(
        "Operational command ID was already claimed for a different operation or request.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
    this.pendingCommandClaims.set(parsedCommandId, {
      operation: parsedOperation,
      requestHash,
    });
    return "new";
  }

  persistCommandResult(
    commandId: string,
    hash: string,
    result: OperationalResultReference,
  ): void {
    this.assertActive();
    const parsedCommandId = parseWith(
      CommandIdSchema,
      commandId,
      "Operational command ID is invalid.",
    );
    const parsedHash = parseWith(
      RequestHashSchema,
      hash,
      "Operational command request hash is invalid.",
    );
    const parsedResult = parseWith(
      OperationalResultReferenceSchema,
      result,
      "Operational command result failed schema validation.",
    );
    const claim = this.pendingCommandClaims.get(parsedCommandId);
    if (claim === undefined) {
      throw new OperationalStoreError(
        "Operational command result requires a new transaction-local command claim.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
    if (claim.requestHash !== parsedHash || claim.operation !== parsedResult.operation) {
      throw new OperationalStoreError(
        "Operational command result does not match its transaction-local claim.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
    if (this.readCommandRecord(parsedCommandId) !== undefined) {
      throw new OperationalStoreError(
        "Operational command result is already persisted and immutable.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
    this.assertCommandEvents(parsedCommandId, parsedResult);
    this.assertCommandResultReferences(parsedCommandId, parsedResult);
    const record = parseWith(
      CommandIdempotencyRecordSchema,
      {
        commandId: parsedCommandId,
        operation: claim.operation,
        requestHash: claim.requestHash,
        result: parsedResult,
        createdAt: new Date().toISOString(),
      },
      "Operational command record failed schema validation.",
    );
    this.database.prepare(`
      INSERT INTO command_idempotency(
        command_id, operation, request_hash, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      record.commandId,
      record.operation,
      record.requestHash,
      JSON.stringify(record.result),
      record.createdAt,
    );
    this.pendingCommandClaims.delete(parsedCommandId);
    this.persistedCommandRecord = record;
    this.commandClosure = "result-persisted";
  }

  allocateEventSequences(ticketId: TicketId, count: number): number[] {
    this.assertActive();
    this.assertMutationOpen();
    const parsedTicketId = parseWith(TicketIdSchema, ticketId, "Ticket ID is invalid.");
    if (!Number.isInteger(count) || count <= 0 || count > 10_000) {
      throw new OperationalStoreError(
        "Event sequence allocation count must be an integer from 1 through 10000.",
        "SEQUENCE_ERROR",
      );
    }
    this.assertTicketExists(parsedTicketId);
    const pending = this.reservedSequences.get(parsedTicketId) ?? [];
    const persisted = this.database.prepare(
      "SELECT COALESCE(MAX(sequence), 0) AS sequence FROM operational_events WHERE ticket_id = ?",
    ).get(parsedTicketId) as SequenceRow;
    const start = pending.at(-1) ?? persisted.sequence;
    const allocated = Array.from({ length: count }, (_, index) => start + index + 1);
    pending.push(...allocated);
    this.reservedSequences.set(parsedTicketId, pending);
    return allocated;
  }

  insertTicket(ticket: Ticket): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(TicketSchema, ticket, "Ticket failed operational schema validation.");
    this.database.prepare(
      "INSERT INTO tickets(id, revision, updated_at, payload_json) VALUES (?, ?, ?, ?)",
    ).run(parsed.id, parsed.revision, parsed.updatedAt, JSON.stringify(parsed));
  }

  updateTicket(ticket: Ticket, expectedRevision: number): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(TicketSchema, ticket, "Ticket failed operational schema validation.");
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || parsed.revision !== expectedRevision + 1) {
      throw new OperationalStoreError(
        "Ticket update must advance exactly one expected revision.",
        "STALE_REVISION",
      );
    }
    const result = this.database.prepare(`
      UPDATE tickets SET revision = ?, updated_at = ?, payload_json = ?
      WHERE id = ? AND revision = ?
    `).run(parsed.revision, parsed.updatedAt, JSON.stringify(parsed), parsed.id, expectedRevision);
    if (result.changes !== 1) {
      throw new OperationalStoreError("Ticket revision is stale.", "STALE_REVISION");
    }
    this.ticketProjectionUpdates.set(parsed.id, parsed.revision);
  }

  appendTicketRevision(revision: TicketRevision): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(
      TicketRevisionSchema,
      revision,
      "Ticket revision failed operational schema validation.",
    );
    this.database.prepare(`
      INSERT INTO ticket_revisions(
        ticket_id, revision, operational_event_id, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      parsed.ticketId,
      parsed.revision,
      parsed.operationalEventId,
      parsed.createdAt,
      JSON.stringify(parsed),
    );
  }

  insertMessage(message: ConversationMessage): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(
      ConversationMessageSchema,
      message,
      "Conversation message failed operational schema validation.",
    );
    this.database.prepare(`
      INSERT INTO conversation_messages(
        id, ticket_id, operational_event_id, kind, created_at, recommendation_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      parsed.id,
      parsed.ticketId,
      parsed.operationalEventId,
      parsed.kind,
      parsed.createdAt,
      parsed.recommendationId ?? null,
      JSON.stringify(parsed),
    );
  }

  insertRecommendation(recommendation: TriageRecommendation): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(
      TriageRecommendationSchema,
      recommendation,
      "Recommendation failed operational schema validation.",
    );
    this.database.prepare(`
      INSERT INTO recommendations(
        id, ticket_id, source_revision, resolution, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      parsed.id,
      parsed.ticketId,
      parsed.sourceRevision,
      parsed.resolution,
      parsed.createdAt,
      JSON.stringify(parsed),
    );
  }

  appendRecommendationRevision(
    revision: RecommendationRevisionWrite,
  ): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(
      RecommendationRevisionSchema,
      revision,
      "Recommendation revision failed operational schema validation.",
    );
    this.database.prepare(`
      INSERT INTO recommendation_revisions(
        recommendation_id, ticket_id, operational_event_id, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      parsed.recommendation.id,
      parsed.recommendation.ticketId,
      parsed.operationalEventId,
      parsed.createdAt,
      JSON.stringify(parsed),
    );
  }

  insertDiagnosis(
    diagnosisRecord: OperationalDiagnosisWrite,
  ): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(
      OperationalDiagnosisRecordSchema,
      diagnosisRecord,
      "Diagnosis failed operational schema validation.",
    );
    this.database.prepare(`
      INSERT INTO diagnoses(
        id, ticket_id, operational_event_id, completed_at, payload_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      parsed.diagnosis.id,
      parsed.diagnosis.ticketId,
      parsed.operationalEventId,
      parsed.diagnosis.completedAt,
      JSON.stringify(parsed),
    );
  }

  appendEvent(event: OperationalEventWrite): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(
      OperationalEventSchema,
      event,
      "Operational event failed schema validation.",
    );
    const pending = this.reservedSequences.get(parsed.ticketId);
    if (pending === undefined || pending[0] !== parsed.sequence) {
      throw new OperationalStoreError(
        "Operational events must consume their ticket's allocated sequences in allocated order.",
        "SEQUENCE_ERROR",
      );
    }
    this.database.prepare(`
      INSERT INTO operational_events(
        id, ticket_id, sequence, occurred_at, actor, action, command_id, facts_json, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parsed.id,
      parsed.ticketId,
      parsed.sequence,
      parsed.occurredAt,
      parsed.actor,
      parsed.action,
      parsed.commandId,
      JSON.stringify(parsed.facts),
      JSON.stringify(parsed),
    );
    pending.shift();
    if (pending.length === 0) this.reservedSequences.delete(parsed.ticketId);
  }

  appendTrace(trace: DecisionTraceEvent): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(
      DecisionTraceEventSchema,
      trace,
      "Decision trace failed operational schema validation.",
    );
    this.database.prepare(`
      INSERT INTO decision_trace_events(
        id, operational_event_id, ticket_id, occurred_at, trace_type, trace_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      parsed.id,
      parsed.operationalEventId,
      parsed.ticketId,
      parsed.occurredAt,
      parsed.traceType,
      JSON.stringify(parsed),
    );
  }

  readTicket(ticketId: TicketId): Ticket {
    this.assertActive();
    const parsedTicketId = parseWith(TicketIdSchema, ticketId, "Ticket ID is invalid.");
    const row = this.database.prepare("SELECT payload_json FROM tickets WHERE id = ?")
      .get(parsedTicketId) as JsonRow | undefined;
    if (row === undefined) throw new OperationalStoreError("Operational ticket was not found.", "NOT_FOUND");
    return parseStoredJson(row.payload_json, TicketSchema, "Operational ticket data is corrupt.");
  }

  readRecommendation(id: string): TriageRecommendation | undefined {
    this.assertActive();
    const row = this.database.prepare("SELECT payload_json FROM recommendations WHERE id = ?")
      .get(id) as JsonRow | undefined;
    return row === undefined
      ? undefined
      : parseStoredJson(row.payload_json, TriageRecommendationSchema, "Operational recommendation data is corrupt.");
  }

  readDiagnosis(id: string): CompletedDiagnosis | undefined {
    this.assertActive();
    const row = this.database.prepare("SELECT payload_json FROM diagnoses WHERE id = ?")
      .get(id) as JsonRow | undefined;
    if (row === undefined) return undefined;
    const record = parseStoredJson(
      row.payload_json,
      OperationalDiagnosisRecordSchema,
      "Operational diagnosis data is corrupt.",
    );
    return parseWith(CompletedDiagnosisSchema, record.diagnosis, "Operational diagnosis data is corrupt.");
  }

  readWorkflowSnapshot(ticketId: TicketId): OperationalWorkflowSnapshot {
    this.assertActive();
    const ticket = this.readTicket(ticketId);
    const events = (this.database.prepare(
      "SELECT event_json FROM operational_events WHERE ticket_id = ? ORDER BY sequence ASC",
    ).all(ticket.id) as EventRow[]).map((row) => parseStoredJson(
      row.event_json,
      OperationalEventSchema,
      "Operational event data is corrupt.",
    ));
    const ticketRevisions = this.readJoinedPayloads(
      `SELECT revisions.payload_json FROM ticket_revisions AS revisions
       JOIN operational_events AS events ON events.id = revisions.operational_event_id
       WHERE revisions.ticket_id = ? ORDER BY events.sequence ASC`,
      ticket.id,
      TicketRevisionSchema,
      "Operational ticket revision data is corrupt.",
    );
    const recommendations = this.readJoinedPayloads(
      `SELECT recommendations.payload_json FROM recommendations
       LEFT JOIN (
         SELECT revisions.recommendation_id, MAX(events.sequence) AS causal_sequence
         FROM recommendation_revisions AS revisions
         JOIN operational_events AS events ON events.id = revisions.operational_event_id
         GROUP BY revisions.recommendation_id
       ) AS latest ON latest.recommendation_id = recommendations.id
       WHERE recommendations.ticket_id = ?
       ORDER BY COALESCE(latest.causal_sequence, 0) ASC, recommendations.id ASC`,
      ticket.id,
      TriageRecommendationSchema,
      "Operational recommendation data is corrupt.",
    );
    const recommendationRevisions = this.readJoinedPayloads(
      `SELECT revisions.payload_json FROM recommendation_revisions AS revisions
       JOIN operational_events AS events ON events.id = revisions.operational_event_id
       WHERE revisions.ticket_id = ? ORDER BY events.sequence ASC, revisions.recommendation_id ASC`,
      ticket.id,
      RecommendationRevisionSchema,
      "Operational recommendation revision data is corrupt.",
    );
    const messages = this.readJoinedPayloads(
      `SELECT messages.payload_json FROM conversation_messages AS messages
       JOIN operational_events AS events ON events.id = messages.operational_event_id
       WHERE messages.ticket_id = ? ORDER BY events.sequence ASC, messages.id ASC`,
      ticket.id,
      ConversationMessageSchema,
      "Operational conversation message data is corrupt.",
    );
    const diagnoses = this.readJoinedPayloads(
      `SELECT diagnoses.payload_json FROM diagnoses
       JOIN operational_events AS events ON events.id = diagnoses.operational_event_id
       WHERE diagnoses.ticket_id = ? ORDER BY events.sequence ASC, diagnoses.id ASC`,
      ticket.id,
      OperationalDiagnosisRecordSchema,
      "Operational diagnosis data is corrupt.",
    );
    const traces = (this.database.prepare(
      `SELECT traces.trace_json FROM decision_trace_events AS traces
       JOIN operational_events AS events ON events.id = traces.operational_event_id
       WHERE traces.ticket_id = ? ORDER BY events.sequence ASC, traces.id ASC`,
    ).all(ticket.id) as TraceRow[]).map((row) => parseStoredJson(
      row.trace_json,
      DecisionTraceEventSchema,
      "Operational decision trace data is corrupt.",
    ));
    const latestCustomerReply = [...messages].reverse().find((message) => message.kind === "customer");
    return parseWith(
      OperationalWorkflowSnapshotSchema,
      {
        ticket,
        ticketRevisions,
        recommendations,
        recommendationRevisions,
        messages,
        diagnoses,
        events,
        traces,
        customerReplyWatermark: latestCustomerReply === undefined
          ? { state: "none" }
          : {
              state: "reply",
              timestamp: latestCustomerReply.createdAt,
              id: latestCustomerReply.id,
            },
      },
      "Operational workflow snapshot is corrupt.",
    );
  }

  readTicketAggregate(ticketId: TicketId): OperationalWorkflowSnapshot {
    return this.readWorkflowSnapshot(ticketId);
  }

  /** @internal Used by the store immediately before COMMIT. */
  assertReadyToCommit(): void {
    this.assertActive();
    if (this.reservedSequences.size > 0) {
      throw new OperationalStoreError(
        "Every allocated event sequence must be appended before commit.",
        "SEQUENCE_ERROR",
      );
    }
    if (this.pendingCommandClaims.size > 0) {
      throw new OperationalStoreError(
        "Every new operational command claim must persist its immutable result before commit.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
    if (this.persistedCommandRecord !== undefined) {
      const stored = this.readCommandRecord(this.persistedCommandRecord.commandId);
      if (stored === undefined || JSON.stringify(stored) !== JSON.stringify(this.persistedCommandRecord)) {
        throw new OperationalStoreError(
          "Operational command result changed before commit.",
          "IDEMPOTENCY_CONFLICT",
        );
      }
      this.assertCommandEvents(stored.commandId, stored.result);
      this.assertCommandResultReferences(stored.commandId, stored.result);
    }
  }

  /** @internal Prevents a callback from retaining write access after commit. */
  closeScope(): void {
    this.active = false;
  }

  private assertActive(): void {
    if (!this.active) {
      throw new OperationalStoreError("Operational unit of work is no longer active.", "PERSISTENCE_ERROR");
    }
  }

  private assertMutationOpen(): void {
    if (this.commandClosure !== "open") {
      throw new OperationalStoreError(
        this.commandClosure === "replay"
          ? "Replayed operational commands are read-only."
          : "Operational command mutations are closed after its result is persisted.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
  }

  private hasMutationActivity(): boolean {
    return this.reservedSequences.size > 0 || this.totalChanges() !== this.initialTotalChanges;
  }

  private totalChanges(): number {
    return (this.database.prepare("SELECT total_changes() AS count").get() as TotalChangesRow).count;
  }

  private assertTicketExists(ticketId: string): void {
    const row = this.database.prepare("SELECT 1 AS found FROM tickets WHERE id = ? LIMIT 1")
      .get(ticketId) as { found?: number } | undefined;
    if (row?.found !== 1) throw new OperationalStoreError("Operational ticket was not found.", "NOT_FOUND");
  }

  private readCommandRecord(commandId: string): CommandIdempotencyRecord | undefined {
    const row = this.database.prepare(`
      SELECT command_id, operation, request_hash, result_json, created_at
      FROM command_idempotency WHERE command_id = ?
    `).get(commandId) as CommandRow | undefined;
    if (row === undefined) return undefined;
    let result: unknown;
    try {
      result = JSON.parse(row.result_json) as unknown;
    } catch (error) {
      throw new OperationalStoreError(
        "Operational command result data is corrupt.",
        "PERSISTENCE_ERROR",
        { cause: error },
      );
    }
    const parsed = CommandIdempotencyRecordSchema.safeParse({
      commandId: row.command_id,
      operation: row.operation,
      requestHash: row.request_hash,
      result,
      createdAt: row.created_at,
    });
    if (!parsed.success) {
      throw new OperationalStoreError(
        "Operational command result data is corrupt.",
        "PERSISTENCE_ERROR",
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }

  private assertCommandEvents(
    commandId: string,
    result: OperationalResultReference,
  ): void {
    const rows = this.database.prepare(`
      SELECT id, ticket_id, sequence
      FROM operational_events
      WHERE command_id = ?
      ORDER BY ticket_id ASC, sequence ASC
    `).all(commandId) as CommandEventRow[];
    const expected = [...result.tickets]
      .sort((left, right) => left.ticketId.localeCompare(right.ticketId))
      .flatMap((ticket) => ticket.operationalEventIds.map((id) => ({
        id,
        ticket_id: ticket.ticketId,
      })));
    if (
      rows.length !== expected.length
      || rows.some((row, index) => (
        row.id !== expected[index]?.id
        || row.ticket_id !== expected[index]?.ticket_id
      ))
    ) {
      throw new OperationalStoreError(
        "Operational command result must reference every command event in ticket-causal order.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
    for (const ticket of result.tickets) {
      const sequences = rows
        .filter((row) => row.ticket_id === ticket.ticketId)
        .map((row) => row.sequence);
      if (sequences.some((sequence, index) => index > 0 && sequence !== sequences[index - 1]! + 1)) {
        throw new OperationalStoreError(
          "Operational command event sequences must be contiguous within each affected ticket.",
          "IDEMPOTENCY_CONFLICT",
        );
      }
    }
  }

  private assertCommandResultReferences(
    commandId: string,
    result: OperationalResultReference,
  ): void {
    const ticketIds = new Set(result.tickets.map((ticket) => ticket.ticketId));
    const revisionRows = this.database.prepare(`
      SELECT revisions.ticket_id, revisions.revision, tickets.revision AS current_revision
      FROM ticket_revisions AS revisions
      JOIN operational_events AS events ON events.id = revisions.operational_event_id
      JOIN tickets ON tickets.id = revisions.ticket_id
      WHERE events.command_id = ?
      ORDER BY revisions.ticket_id ASC, events.sequence ASC
    `).all(commandId) as TicketRevisionReferenceRow[];
    for (const ticket of result.tickets) {
      const commandRevisions = revisionRows.filter((row) => row.ticket_id === ticket.ticketId);
      const updatedRevision = this.ticketProjectionUpdates.get(ticket.ticketId);
      if (ticket.resultingRevision === null) {
        if (commandRevisions.length > 0 || updatedRevision !== undefined) {
          throw this.semanticReferenceError("Ticket result revision may be null only when the command writes no ticket revision.");
        }
        continue;
      }
      const latestRevision = commandRevisions.at(-1);
      if (
        latestRevision?.revision !== ticket.resultingRevision
        || latestRevision.current_revision !== ticket.resultingRevision
        || updatedRevision !== ticket.resultingRevision
      ) {
        throw this.semanticReferenceError("Ticket result revision does not match the command's committed ticket revision.");
      }
    }

    this.assertSemanticReference(
      "message",
      result.messageId,
      ticketIds,
      this.database.prepare(`
        SELECT messages.id, messages.ticket_id
        FROM conversation_messages AS messages
        JOIN operational_events AS events ON events.id = messages.operational_event_id
        WHERE events.command_id = ?
      `).all(commandId) as SemanticReferenceRow[],
    );
    this.assertSemanticReference(
      "recommendation",
      result.recommendationId,
      ticketIds,
      this.database.prepare(`
        SELECT DISTINCT recommendations.id, recommendations.ticket_id
        FROM recommendations
        JOIN recommendation_revisions AS revisions
          ON revisions.recommendation_id = recommendations.id
        JOIN operational_events AS events ON events.id = revisions.operational_event_id
        WHERE events.command_id = ?
      `).all(commandId) as SemanticReferenceRow[],
    );
    this.assertSemanticReference(
      "diagnosis",
      result.diagnosisId,
      ticketIds,
      this.database.prepare(`
        SELECT diagnoses.id, diagnoses.ticket_id
        FROM diagnoses
        JOIN operational_events AS events ON events.id = diagnoses.operational_event_id
        WHERE events.command_id = ?
      `).all(commandId) as SemanticReferenceRow[],
    );
  }

  private assertSemanticReference(
    referenceType: "message" | "recommendation" | "diagnosis",
    expectedId: string | undefined,
    resultTicketIds: ReadonlySet<string>,
    rows: readonly SemanticReferenceRow[],
  ): void {
    if (expectedId === undefined) {
      if (rows.length > 0) {
        throw this.semanticReferenceError(
          `Operational command result omitted its written ${referenceType} reference.`,
        );
      }
      return;
    }
    const row = rows.find((candidate) => candidate.id === expectedId);
    if (row === undefined || !resultTicketIds.has(row.ticket_id)) {
      throw this.semanticReferenceError(
        `Operational command ${referenceType} result must reference a record written for an affected ticket by this command.`,
      );
    }
  }

  private semanticReferenceError(message: string): OperationalStoreError {
    return new OperationalStoreError(message, "IDEMPOTENCY_CONFLICT");
  }

  private readJoinedPayloads<T>(
    query: string,
    ticketId: string,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } },
    message: string,
  ): T[] {
    return (this.database.prepare(query).all(ticketId) as JsonRow[]).map((row) =>
      parseStoredJson(row.payload_json, schema, message));
  }
}

function parseWith<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } },
  value: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new OperationalStoreError(message, "VALIDATION_ERROR", { cause: parsed.error });
  }
  return parsed.data;
}

function parseStoredJson<T>(
  value: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } },
  message: string,
): T {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch (error) {
    throw new OperationalStoreError(message, "PERSISTENCE_ERROR", { cause: error });
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new OperationalStoreError(message, "PERSISTENCE_ERROR", { cause: parsed.error });
  }
  return parsed.data;
}
