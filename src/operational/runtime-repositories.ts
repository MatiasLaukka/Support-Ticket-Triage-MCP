import {
  AuditEventSchema,
  TicketIdSchema,
  type AuditEvent,
  type Ticket,
  type TicketId,
  type TriageRecommendation,
} from "../domain.js";
import { DomainError } from "../errors.js";
import type { AuditPage, AuditPageInput } from "../audit-repository.js";
import type { PaginatedTickets, TicketFilter } from "../ticket-repository.js";
import { operationalAuditEventsFromSnapshot } from "../triage-service.js";
import { OperationalSqliteStore } from "./sqlite-store.js";
import { OperationalStoreError } from "./unit-of-work.js";
import type { OperationalWorkflowSnapshot } from "./domain.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const AT_RISK_WINDOW_MS = 60 * 60 * 1000;

export class OperationalTicketRepository {
  constructor(private readonly store: OperationalSqliteStore) {}

  async get(id: TicketId): Promise<Ticket> {
    try {
      return structuredClone(this.store.readTicket(TicketIdSchema.parse(id)));
    } catch (error) {
      throw mapReadError(error, `Ticket ${id} was not found.`, "TICKET_NOT_FOUND");
    }
  }

  async snapshot(): Promise<Ticket[]> {
    return this.store.listWorkflowSnapshots().map(({ ticket }) => structuredClone(ticket));
  }

  async list(filter: TicketFilter): Promise<PaginatedTickets> {
    const offset = bounded(filter.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = bounded(filter.limit, 1, MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT);
    const tickets = (await this.snapshot()).filter((ticket) =>
      (filter.status === undefined || ticket.status === filter.status)
      && (filter.category === undefined || ticket.category === filter.category)
      && (filter.priority === undefined || ticket.priority === filter.priority)
      && (filter.team === undefined || ticket.team === filter.team)
      && (filter.slaState === undefined || ticketSlaState(ticket, filter.asOf) === filter.slaState));
    return {
      items: tickets.slice(offset, offset + limit),
      total: tickets.length,
      offset,
      limit,
    };
  }

  async update(): Promise<never> { throw mutationBoundary(); }
  async updateWithCommit(): Promise<never> { throw mutationBoundary(); }
}

export class OperationalRecommendationRepository {
  constructor(private readonly store: OperationalSqliteStore) {}

  async get(id: string): Promise<TriageRecommendation> {
    const recommendation = this.store.readRecommendation(id);
    if (recommendation === undefined) {
      throw new DomainError("Recommendation was not found.", "RECOMMENDATION_NOT_FOUND");
    }
    return structuredClone(recommendation);
  }

  async list(): Promise<TriageRecommendation[]> {
    return this.store.listWorkflowSnapshots()
      .flatMap(({ recommendations }) => recommendations)
      .map((recommendation) => structuredClone(recommendation))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  }

  async create(): Promise<never> { throw mutationBoundary(); }
  async deletePending(): Promise<never> { throw mutationBoundary(); }
  async transitionResolution(): Promise<never> { throw mutationBoundary(); }
  async markResolved(): Promise<never> { throw mutationBoundary(); }
}

export class OperationalAuditRepository {
  constructor(private readonly store: OperationalSqliteStore) {}

  async list(ticketId?: TicketId): Promise<AuditEvent[]> {
    try {
      const snapshots = ticketId === undefined
        ? this.store.listWorkflowSnapshots()
        : [this.store.readWorkflowSnapshot(TicketIdSchema.parse(ticketId))];
      return this.store.transaction((unit) => snapshots.flatMap((snapshot) =>
        snapshot.events.flatMap((event) => {
          const lifecycleAudit = unit.readCommandResult(event.commandId)
            ?.lifecycleAuditEvents?.find((candidate) => candidate.id === event.id);
          return lifecycleAudit === undefined
              || event.action === "diagnosis-completed"
              || event.action === "diagnostic-escalated"
            ? operationalAuditEventsFromSnapshot({
                ...snapshot,
                events: [event],
              })
            : [AuditEventSchema.parse(lifecycleAudit)];
        })
      ));
    } catch (error) {
      throw mapReadError(
        error,
        ticketId === undefined ? undefined : `Ticket ${ticketId} was not found.`,
      );
    }
  }

  async listPage(input: AuditPageInput): Promise<AuditPage> {
    const offset = bounded(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = bounded(input.limit, 1, MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT);
    const events = await this.list(input.ticketId);
    return { events: events.slice(offset, offset + limit), total: events.length, offset, limit };
  }

  async append(): Promise<never> { throw mutationBoundary(); }
  async appendBatch(): Promise<never> { throw mutationBoundary(); }
}

export class OperationalDiagnosisRepository {
  constructor(private readonly store: OperationalSqliteStore) {}

  async list(
    ticketId?: TicketId,
  ): Promise<OperationalWorkflowSnapshot["diagnoses"]> {
    try {
      const snapshots = ticketId === undefined
        ? this.store.listWorkflowSnapshots()
        : [this.store.readWorkflowSnapshot(TicketIdSchema.parse(ticketId))];

      return snapshots
        .flatMap(({ diagnoses }) => diagnoses)
        .map((record) => structuredClone(record));
    } catch (error) {
      throw mapReadError(
        error,
        ticketId === undefined ? undefined : `Ticket ${ticketId} was not found.`,
      );
    }
  }
}

function mapReadError(
  error: unknown,
  notFoundMessage?: string,
  notFoundCode: "TICKET_NOT_FOUND" = "TICKET_NOT_FOUND",
): Error {
  if (error instanceof OperationalStoreError) {
    return error.code === "NOT_FOUND" && notFoundMessage !== undefined
      ? new DomainError(notFoundMessage, notFoundCode)
      : new DomainError("Operational persistence is unavailable.", "REPOSITORY_ERROR");
  }
  return error instanceof Error ? error : new DomainError("Operational persistence is unavailable.", "REPOSITORY_ERROR");
}

function mutationBoundary(): DomainError {
  return new DomainError(
    "Operational mutations must use the authoritative triage service transaction boundary.",
    "REPOSITORY_ERROR",
  );
}

function bounded(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function ticketSlaState(ticket: Ticket, asOf = new Date().toISOString()): "breached" | "at-risk" | "healthy" {
  if (ticket.sla.breached) return "breached";
  const remaining = Date.parse(ticket.sla.responseDueAt) - Date.parse(asOf);
  return remaining <= AT_RISK_WINDOW_MS ? "at-risk" : "healthy";
}
