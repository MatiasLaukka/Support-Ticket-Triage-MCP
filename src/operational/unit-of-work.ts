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
  ConversationMessageSchema,
  DecisionTraceEventSchema,
  OperationalDiagnosisRecordSchema,
  OperationalEventSchema,
  OperationalWorkflowSnapshotSchema,
  RecommendationRevisionSchema,
  TicketRevisionSchema,
  type ConversationMessage,
  type DecisionTraceEvent,
  type OperationalEvent,
  type OperationalWorkflowSnapshot,
  type TicketRevision,
} from "./domain.js";

export type OperationalStoreErrorCode =
  | "ASYNC_TRANSACTION"
  | "CLOSED"
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
  private readonly reservedSequences = new Map<string, number[]>();

  constructor(private readonly database: Database.Database) {}

  allocateEventSequences(ticketId: TicketId, count: number): number[] {
    this.assertActive();
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
    const parsed = parseWith(TicketSchema, ticket, "Ticket failed operational schema validation.");
    this.database.prepare(
      "INSERT INTO tickets(id, revision, updated_at, payload_json) VALUES (?, ?, ?, ?)",
    ).run(parsed.id, parsed.revision, parsed.updatedAt, JSON.stringify(parsed));
  }

  updateTicket(ticket: Ticket, expectedRevision: number): void {
    this.assertActive();
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
  }

  appendTicketRevision(revision: TicketRevision): void {
    this.assertActive();
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

  private assertTicketExists(ticketId: string): void {
    const row = this.database.prepare("SELECT 1 AS found FROM tickets WHERE id = ? LIMIT 1")
      .get(ticketId) as { found?: number } | undefined;
    if (row?.found !== 1) throw new OperationalStoreError("Operational ticket was not found.", "NOT_FOUND");
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
