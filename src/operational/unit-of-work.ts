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
  conversationMessageKindForOperationalAction,
  isCanonicalConversationEventPair,
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
interface LocalCommandEventRow extends CommandEventRow {
  command_id: string;
  action: OperationalEvent["action"];
  facts: OperationalEventWrite["facts"];
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
interface LocalEventChildRow extends SemanticReferenceRow {
  operational_event_id: string;
}
interface LocalMessageWriteRow extends LocalEventChildRow {
  kind: ConversationMessage["kind"];
}
interface LocalTicketRevisionRow {
  ticket_id: string;
  revision: number;
  operational_event_id: string;
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
  private readonly appendedEventWrites: LocalCommandEventRow[] = [];
  private readonly ticketRevisionWrites: LocalTicketRevisionRow[] = [];
  private readonly messageWrites: LocalMessageWriteRow[] = [];
  private readonly recommendationAggregateWrites: string[] = [];
  private readonly recommendationRevisionWrites: LocalEventChildRow[] = [];
  private readonly diagnosisWrites: LocalEventChildRow[] = [];
  private readonly traceWrites: LocalEventChildRow[] = [];
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
    this.ticketRevisionWrites.push({
      ticket_id: parsed.ticketId,
      revision: parsed.revision,
      operational_event_id: parsed.operationalEventId,
    });
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
    this.messageWrites.push({
      id: parsed.id,
      ticket_id: parsed.ticketId,
      operational_event_id: parsed.operationalEventId,
      kind: parsed.kind,
    });
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
    this.recommendationAggregateWrites.push(parsed.id);
  }

  updateRecommendation(
    recommendation: TriageRecommendation,
    expectedResolution: TriageRecommendation["resolution"],
  ): void {
    this.assertActive();
    this.assertMutationOpen();
    const parsed = parseWith(
      TriageRecommendationSchema,
      recommendation,
      "Recommendation failed operational schema validation.",
    );
    const result = this.database.prepare(`
      UPDATE recommendations
      SET source_revision = ?, resolution = ?, created_at = ?, payload_json = ?
      WHERE id = ? AND ticket_id = ? AND resolution = ?
    `).run(
      parsed.sourceRevision,
      parsed.resolution,
      parsed.createdAt,
      JSON.stringify(parsed),
      parsed.id,
      parsed.ticketId,
      expectedResolution,
    );
    if (result.changes !== 1) {
      throw new OperationalStoreError(
        "Recommendation resolution is stale.",
        "STALE_REVISION",
      );
    }
    this.recommendationAggregateWrites.push(parsed.id);
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
    this.recommendationRevisionWrites.push({
      id: parsed.recommendation.id,
      ticket_id: parsed.recommendation.ticketId,
      operational_event_id: parsed.operationalEventId,
    });
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
    this.diagnosisWrites.push({
      id: parsed.diagnosis.id,
      ticket_id: parsed.diagnosis.ticketId,
      operational_event_id: parsed.operationalEventId,
    });
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
    this.appendedEventWrites.push({
      id: parsed.id,
      ticket_id: parsed.ticketId,
      sequence: parsed.sequence,
      command_id: parsed.commandId,
      action: parsed.action,
      facts: parsed.facts,
    });
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
    this.traceWrites.push({
      id: parsed.id,
      ticket_id: parsed.ticketId,
      operational_event_id: parsed.operationalEventId,
    });
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
    const latestCustomerReply = latestMessageByEventSequence(messages, events, "customer");
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
    this.assertMessageEventBindings();
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

  private assertMessageEventBindings(): void {
    const eventsById = new Map(this.appendedEventWrites.map((event) => [event.id, event] as const));
    for (const event of this.appendedEventWrites) {
      const expectedKind = conversationMessageKindForOperationalAction(event.action);
      const linkedMessages = this.messageWrites.filter(
        (message) => message.operational_event_id === event.id,
      );
      if (expectedKind === undefined) {
        if (linkedMessages.length > 0) {
          throw new OperationalStoreError(
            "Only conversation message events may own a conversation message.",
            "PERSISTENCE_ERROR",
          );
        }
        continue;
      }
      if (
        linkedMessages.length !== 1
        || !this.isCanonicalLocalMessagePair(event, linkedMessages[0]!)
      ) {
        throw new OperationalStoreError(
          "Every conversation message event must bind to exactly one matching canonical message.",
          "PERSISTENCE_ERROR",
        );
      }
    }
    for (const message of this.messageWrites) {
      const event = eventsById.get(message.operational_event_id);
      if (event === undefined || !this.isCanonicalLocalMessagePair(event, message)) {
        throw new OperationalStoreError(
          "Every conversation message must bind to its transaction-local canonical event.",
          "PERSISTENCE_ERROR",
        );
      }
    }
  }

  private isCanonicalLocalMessagePair(
    event: LocalCommandEventRow,
    message: LocalMessageWriteRow,
  ): boolean {
    return isCanonicalConversationEventPair(
      {
        id: event.id,
        ticketId: event.ticket_id,
        action: event.action,
        facts: event.facts,
      },
      {
        id: message.id,
        ticketId: message.ticket_id,
        operationalEventId: message.operational_event_id,
        kind: message.kind,
      },
    );
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
    const localRows = this.appendedEventWrites
      .filter((row) => row.command_id === commandId)
      .sort(compareCommandEventRows);
    if (
      localRows.length !== this.appendedEventWrites.length
      || rows.length !== localRows.length
      || rows.some((row, index) => !sameCommandEvent(row, localRows[index]))
    ) {
      throw new OperationalStoreError(
        "Operational command events must be written by its transaction-local command claim.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
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
    const commandEvents = new Map(
      this.appendedEventWrites
        .filter((row) => row.command_id === commandId)
        .map((row) => [row.id, row] as const),
    );
    const revisionRows = this.database.prepare(`
      SELECT revisions.ticket_id, revisions.revision, tickets.revision AS current_revision
      FROM ticket_revisions AS revisions
      JOIN operational_events AS events ON events.id = revisions.operational_event_id
      JOIN tickets ON tickets.id = revisions.ticket_id
      WHERE events.command_id = ?
       ORDER BY revisions.ticket_id ASC, events.sequence ASC
    `).all(commandId) as TicketRevisionReferenceRow[];
    const localRevisionRows = this.ticketRevisionWrites.map((row) => {
      this.assertLocalChildEvent("ticket revision", row, commandEvents);
      return {
        ticket_id: row.ticket_id,
        revision: row.revision,
      };
    }).sort((left, right) => (
      left.ticket_id.localeCompare(right.ticket_id) || left.revision - right.revision
    ));
    if (
      revisionRows.length !== localRevisionRows.length
      || revisionRows.some((row, index) => (
        row.ticket_id !== localRevisionRows[index]?.ticket_id
        || row.revision !== localRevisionRows[index]?.revision
      ))
    ) {
      throw this.semanticReferenceError(
        "Operational command ticket revisions must be written by its transaction-local command claim.",
      );
    }
    for (const [ticketId, updatedRevision] of this.ticketProjectionUpdates) {
      const latestRevision = localRevisionRows.filter((row) => row.ticket_id === ticketId).at(-1);
      if (!ticketIds.has(ticketId) || latestRevision?.revision !== updatedRevision) {
        throw this.semanticReferenceError(
          "Every transaction-local ticket projection update must have a matching command result and revision write.",
        );
      }
    }
    for (const ticket of result.tickets) {
      const commandRevisions = localRevisionRows.filter((row) => row.ticket_id === ticket.ticketId);
      const updatedRevision = this.ticketProjectionUpdates.get(ticket.ticketId);
      if (ticket.resultingRevision === null) {
        if (commandRevisions.length > 0 || updatedRevision !== undefined) {
          throw this.semanticReferenceError("Ticket result revision may be null only when the command writes no ticket revision.");
        }
        continue;
      }
      const latestRevision = commandRevisions.at(-1);
      const durableRevision = revisionRows.filter((row) => row.ticket_id === ticket.ticketId).at(-1);
      if (
        latestRevision?.revision !== ticket.resultingRevision
        || durableRevision?.current_revision !== ticket.resultingRevision
        || updatedRevision !== ticket.resultingRevision
      ) {
        throw this.semanticReferenceError("Ticket result revision does not match the command's committed ticket revision.");
      }
    }

    const localMessages = this.localSemanticRows("message", this.messageWrites, commandEvents);
    this.assertDurableSemanticRows(
      "message",
      localMessages,
      this.database.prepare(`
        SELECT messages.id, messages.ticket_id
        FROM conversation_messages AS messages
        JOIN operational_events AS events ON events.id = messages.operational_event_id
        WHERE events.command_id = ?
        ORDER BY messages.id ASC
      `).all(commandId) as SemanticReferenceRow[],
    );
    this.assertSemanticReference(
      "message",
      result.messageId,
      ticketIds,
      localMessages,
    );

    const localRecommendations = this.localRecommendationWriteSet(commandEvents);
    const durableRecommendations = this.database.prepare(`
      SELECT DISTINCT recommendations.id, recommendations.ticket_id
      FROM recommendations
      JOIN recommendation_revisions AS revisions
        ON revisions.recommendation_id = recommendations.id
      JOIN operational_events AS events ON events.id = revisions.operational_event_id
      WHERE events.command_id = ?
      ORDER BY recommendations.id ASC
    `).all(commandId) as SemanticReferenceRow[];
    this.assertDurableSemanticRows("recommendation", localRecommendations.rows, durableRecommendations);
    const durableRecommendationRevisions = this.database.prepare(`
      SELECT revisions.recommendation_id AS id, revisions.ticket_id, revisions.operational_event_id
      FROM recommendation_revisions AS revisions
      JOIN operational_events AS events ON events.id = revisions.operational_event_id
      WHERE events.command_id = ?
    `).all(commandId) as LocalEventChildRow[];
    this.assertDurableRecommendationRevisions(
      localRecommendations.revisionRows,
      durableRecommendationRevisions,
    );
    this.assertRecommendationReference(result, ticketIds, localRecommendations);

    const localDiagnoses = this.localSemanticRows("diagnosis", this.diagnosisWrites, commandEvents);
    this.assertDurableSemanticRows(
      "diagnosis",
      localDiagnoses,
      this.database.prepare(`
        SELECT diagnoses.id, diagnoses.ticket_id
        FROM diagnoses
        JOIN operational_events AS events ON events.id = diagnoses.operational_event_id
        WHERE events.command_id = ?
        ORDER BY diagnoses.id ASC
      `).all(commandId) as SemanticReferenceRow[],
    );
    this.assertSemanticReference(
      "diagnosis",
      result.diagnosisId,
      ticketIds,
      localDiagnoses,
    );

    const localTraces = this.localSemanticRows("decision trace", this.traceWrites, commandEvents);
    this.assertDurableSemanticRows(
      "decision trace",
      localTraces,
      this.database.prepare(`
        SELECT traces.id, traces.ticket_id
        FROM decision_trace_events AS traces
        JOIN operational_events AS events ON events.id = traces.operational_event_id
        WHERE events.command_id = ?
        ORDER BY traces.id ASC
      `).all(commandId) as SemanticReferenceRow[],
    );
  }

  private assertLocalChildEvent(
    referenceType: string,
    row: { readonly ticket_id: string; readonly operational_event_id: string },
    commandEvents: ReadonlyMap<string, CommandEventRow>,
  ): void {
    const event = commandEvents.get(row.operational_event_id);
    if (event === undefined || event.ticket_id !== row.ticket_id) {
      throw this.semanticReferenceError(
        `Transaction-local ${referenceType} writes must be linked to a matching event written by this command.`,
      );
    }
  }

  private localSemanticRows(
    referenceType: string,
    writes: readonly LocalEventChildRow[],
    commandEvents: ReadonlyMap<string, CommandEventRow>,
  ): SemanticReferenceRow[] {
    const byId = new Map<string, SemanticReferenceRow>();
    for (const write of writes) {
      this.assertLocalChildEvent(referenceType, write, commandEvents);
      const previous = byId.get(write.id);
      if (previous !== undefined && previous.ticket_id !== write.ticket_id) {
        throw this.semanticReferenceError(
          `Transaction-local ${referenceType} writes disagree on their affected ticket.`,
        );
      }
      byId.set(write.id, { id: write.id, ticket_id: write.ticket_id });
    }
    return [...byId.values()].sort(compareSemanticRows);
  }

  private assertDurableSemanticRows(
    referenceType: string,
    localRows: readonly SemanticReferenceRow[],
    durableRows: readonly SemanticReferenceRow[],
  ): void {
    const sortedDurableRows = [...durableRows].sort(compareSemanticRows);
    if (
      sortedDurableRows.length !== localRows.length
      || sortedDurableRows.some((row, index) => (
        row.id !== localRows[index]?.id || row.ticket_id !== localRows[index]?.ticket_id
      ))
    ) {
      throw this.semanticReferenceError(
        `Operational command ${referenceType} records must exactly match its transaction-local writes.`,
      );
    }
  }

  private localRecommendationWriteSet(
    commandEvents: ReadonlyMap<string, CommandEventRow>,
  ): {
    readonly orderedIds: readonly string[];
    readonly rows: readonly SemanticReferenceRow[];
    readonly revisionRows: readonly LocalEventChildRow[];
  } {
    const rowsById = new Map<string, SemanticReferenceRow>();
    for (const write of this.recommendationRevisionWrites) {
      this.assertLocalChildEvent("recommendation", write, commandEvents);
      const previous = rowsById.get(write.id);
      if (previous !== undefined && previous.ticket_id !== write.ticket_id) {
        throw this.semanticReferenceError(
          "Transaction-local recommendation revisions disagree on their affected ticket.",
        );
      }
      rowsById.set(write.id, { id: write.id, ticket_id: write.ticket_id });
    }
    for (const id of this.recommendationAggregateWrites) {
      if (!rowsById.has(id)) {
        throw this.semanticReferenceError(
          "Every transaction-local recommendation aggregate must have a revision linked to this command.",
        );
      }
    }
    const orderedIds: string[] = [];
    const seen = new Set<string>();
    for (const id of [...this.recommendationAggregateWrites, ...this.recommendationRevisionWrites.map((write) => write.id)]) {
      if (!seen.has(id)) {
        seen.add(id);
        orderedIds.push(id);
      }
    }
    return {
      orderedIds,
      rows: [...rowsById.values()].sort(compareSemanticRows),
      revisionRows: [...this.recommendationRevisionWrites],
    };
  }

  private assertDurableRecommendationRevisions(
    localRows: readonly LocalEventChildRow[],
    durableRows: readonly LocalEventChildRow[],
  ): void {
    const sortedLocalRows = [...localRows].sort(compareRecommendationRevisionRows);
    const sortedDurableRows = [...durableRows].sort(compareRecommendationRevisionRows);
    if (
      sortedDurableRows.length !== sortedLocalRows.length
      || sortedDurableRows.some((row, index) => (
        row.id !== sortedLocalRows[index]?.id
        || row.ticket_id !== sortedLocalRows[index]?.ticket_id
        || row.operational_event_id !== sortedLocalRows[index]?.operational_event_id
      ))
    ) {
      throw this.semanticReferenceError(
        "Operational command recommendation revisions must exactly match its transaction-local writes.",
      );
    }
  }

  private assertRecommendationReference(
    result: OperationalResultReference,
    resultTicketIds: ReadonlySet<string>,
    writeSet: { readonly orderedIds: readonly string[]; readonly rows: readonly SemanticReferenceRow[] },
  ): void {
    for (const row of writeSet.rows) {
      if (!resultTicketIds.has(row.ticket_id)) {
        throw this.semanticReferenceError(
          "Operational command recommendation results must reference records for affected tickets.",
        );
      }
    }
    if (writeSet.orderedIds.length === 0) {
      if (result.recommendationId !== undefined || result.recommendationIds !== undefined) {
        throw this.semanticReferenceError(
          "Operational command result must not reference recommendations when it wrote none.",
        );
      }
      return;
    }
    if (writeSet.orderedIds.length === 1) {
      if (
        result.recommendationId !== writeSet.orderedIds[0]
        || result.recommendationIds !== undefined
      ) {
        throw this.semanticReferenceError(
          "A command writing one recommendation must use its singular recommendationId result reference.",
        );
      }
      return;
    }
    if (
      result.recommendationId !== undefined
      || result.recommendationIds === undefined
      || result.recommendationIds.length !== writeSet.orderedIds.length
      || result.recommendationIds.some((id, index) => id !== writeSet.orderedIds[index])
    ) {
      throw this.semanticReferenceError(
        "A command writing multiple recommendations must use its exact ordered recommendationIds result reference.",
      );
    }
  }

  private assertSemanticReference(
    referenceType: "message" | "recommendation" | "diagnosis",
    expectedId: string | undefined,
    resultTicketIds: ReadonlySet<string>,
    rows: readonly SemanticReferenceRow[],
  ): void {
    if (rows.length > 1) {
      throw this.semanticReferenceError(
        `Operational command wrote multiple ${referenceType} records that its singular result reference cannot represent.`,
      );
    }
    if (expectedId === undefined) {
      if (rows.length > 0) {
        throw this.semanticReferenceError(
          `Operational command result omitted its written ${referenceType} reference.`,
        );
      }
      return;
    }
    const row = rows[0];
    if (row?.id !== expectedId || !resultTicketIds.has(row.ticket_id)) {
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

function compareCommandEventRows(left: CommandEventRow, right: CommandEventRow): number {
  return left.ticket_id.localeCompare(right.ticket_id) || left.sequence - right.sequence;
}

function sameCommandEvent(
  left: CommandEventRow,
  right: CommandEventRow | undefined,
): boolean {
  return right !== undefined
    && left.id === right.id
    && left.ticket_id === right.ticket_id
    && left.sequence === right.sequence;
}

function compareSemanticRows(left: SemanticReferenceRow, right: SemanticReferenceRow): number {
  return left.id.localeCompare(right.id) || left.ticket_id.localeCompare(right.ticket_id);
}

function compareRecommendationRevisionRows(left: LocalEventChildRow, right: LocalEventChildRow): number {
  return compareSemanticRows(left, right) || left.operational_event_id.localeCompare(right.operational_event_id);
}

function latestMessageByEventSequence(
  messages: readonly ConversationMessage[],
  events: readonly OperationalEvent[],
  kind: ConversationMessage["kind"],
): ConversationMessage | undefined {
  return messages
    .filter((message) => message.kind === kind)
    .map((message) => ({
      message,
      event: events.find((event) => event.id === message.operationalEventId),
    }))
    .filter((entry): entry is { message: ConversationMessage; event: OperationalEvent } =>
      entry.event !== undefined && isCanonicalConversationEventPair(entry.event, entry.message))
    .sort((left, right) => left.event.sequence - right.event.sequence)
    .at(-1)?.message;
}
