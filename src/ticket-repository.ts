import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, parse, resolve } from "node:path";
import {
  CategorySchema,
  IsoTimestampSchema,
  PrioritySchema,
  TeamSchema,
  TicketIdSchema,
  TicketSchema,
  TicketStatusSchema,
  type Category,
  type Priority,
  type Team,
  type Ticket,
  type TicketId,
  type TicketStatus,
} from "./domain.js";
import { DomainError } from "./errors.js";

export type TicketSlaState = "breached" | "at-risk" | "healthy";

export interface TicketFilter {
  status?: TicketStatus;
  category?: Category;
  priority?: Priority;
  team?: Team;
  slaState?: TicketSlaState;
  asOf?: string;
  offset?: number;
  limit?: number;
}

export interface PaginatedTickets {
  items: Ticket[];
  total: number;
  offset: number;
  limit: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const AT_RISK_WINDOW_MS = 60 * 60 * 1000;

function repositoryError(message: string): DomainError {
  return new DomainError(message, "REPOSITORY_ERROR");
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function assertNoLinkedPath(path: string): Promise<void> {
  const absolutePath = resolve(path);
  const root = parse(absolutePath).root;
  let current = absolutePath;

  while (current !== root) {
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw repositoryError("Repository contains an unsupported linked path.");
      }
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      if (!isMissing(error)) {
        throw repositoryError("Repository path could not be inspected.");
      }
    }
    current = dirname(current);
  }
}

async function assertSafeFile(path: string): Promise<void> {
  await assertNoLinkedPath(path);
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink > 1) {
      throw repositoryError("Repository contains an unsupported linked path.");
    }
  } catch (error) {
    if (error instanceof DomainError || isMissing(error)) {
      throw error;
    }
    throw repositoryError("Repository path could not be inspected.");
  }
}

function parseTickets(value: unknown): Ticket[] {
  const result = TicketSchema.array().safeParse(value);
  if (!result.success) {
    throw repositoryError("Repository data is invalid.");
  }
  return result.data;
}

function parseFilter(filter: TicketFilter): {
  status?: TicketStatus;
  category?: Category;
  priority?: Priority;
  team?: Team;
  slaState?: TicketSlaState;
  asOf: Date;
  offset: number;
  limit: number;
} {
  const status = parseOptional(filter.status, TicketStatusSchema);
  const category = parseOptional(filter.category, CategorySchema);
  const priority = parseOptional(filter.priority, PrioritySchema);
  const team = parseOptional(filter.team, TeamSchema);
  if (
    filter.slaState !== undefined &&
    !["breached", "at-risk", "healthy"].includes(filter.slaState)
  ) {
    throw repositoryError("Ticket filter is invalid.");
  }

  const asOfValue = filter.asOf ?? new Date().toISOString();
  if (!IsoTimestampSchema.safeParse(asOfValue).success) {
    throw repositoryError("Ticket filter is invalid.");
  }

  return {
    status,
    category,
    priority,
    team,
    slaState: filter.slaState,
    asOf: new Date(asOfValue),
    offset: boundedInteger(filter.offset, 0, Number.MAX_SAFE_INTEGER, 0),
    limit: boundedInteger(filter.limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
  };
}

function parseOptional<T>(
  value: unknown,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw repositoryError("Ticket filter is invalid.");
  }
  return result.data;
}

function boundedInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    throw repositoryError("Ticket filter is invalid.");
  }
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function slaState(ticket: Ticket, asOf: Date): TicketSlaState {
  const dueAt = new Date(ticket.sla.responseDueAt).getTime();
  const now = asOf.getTime();
  if (ticket.sla.breached || dueAt <= now) {
    return "breached";
  }
  if (dueAt - now <= AT_RISK_WINDOW_MS) {
    return "at-risk";
  }
  return "healthy";
}

export class TicketRepository {
  private readonly runtimeRoot: string;
  private readonly seedFile: string;
  private readonly runtimeFile: string;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(runtimeRoot: string, seedFile: string) {
    this.runtimeRoot = resolve(runtimeRoot);
    this.seedFile = resolve(seedFile);
    this.runtimeFile = resolve(this.runtimeRoot, "tickets.json");
  }

  async initialize(): Promise<void> {
    await assertNoLinkedPath(this.runtimeRoot);
    await mkdir(this.runtimeRoot, { recursive: true });
    await assertNoLinkedPath(this.runtimeRoot);

    try {
      await this.readTickets();
      return;
    } catch (error) {
      if (!(isMissing(error))) {
        throw error;
      }
    }

    await assertSafeFile(this.seedFile);
    const tickets = await this.readTicketsFrom(this.seedFile);
    let handle;
    try {
      handle = await open(this.runtimeFile, "wx");
      await handle.writeFile(`${JSON.stringify(tickets, null, 2)}\n`, "utf8");
      await handle.sync();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        await this.readTickets();
        return;
      }
      if (error instanceof DomainError) {
        throw error;
      }
      throw repositoryError("Repository could not be initialized.");
    } finally {
      await handle?.close();
    }
  }

  async list(filter: TicketFilter): Promise<PaginatedTickets> {
    const parsedFilter = parseFilter(filter);
    const tickets = (await this.readTickets()).filter(
      (candidate) =>
        (parsedFilter.status === undefined ||
          candidate.status === parsedFilter.status) &&
        (parsedFilter.category === undefined ||
          candidate.category === parsedFilter.category) &&
        (parsedFilter.priority === undefined ||
          candidate.priority === parsedFilter.priority) &&
        (parsedFilter.team === undefined ||
          candidate.team === parsedFilter.team) &&
        (parsedFilter.slaState === undefined ||
          slaState(candidate, parsedFilter.asOf) === parsedFilter.slaState),
    );

    return {
      items: tickets.slice(
        parsedFilter.offset,
        parsedFilter.offset + parsedFilter.limit,
      ),
      total: tickets.length,
      offset: parsedFilter.offset,
      limit: parsedFilter.limit,
    };
  }

  async get(id: TicketId): Promise<Ticket> {
    const parsedId = TicketIdSchema.safeParse(id);
    if (!parsedId.success) {
      throw repositoryError("Repository path is not allowed.");
    }
    const result = (await this.readTickets()).find(
      (candidate) => candidate.id === parsedId.data,
    );
    if (result === undefined) {
      throw new DomainError("Ticket was not found.", "TICKET_NOT_FOUND");
    }
    return result;
  }

  async update(
    id: TicketId,
    expectedRevision: number,
    mutate: (ticket: Ticket) => Ticket,
  ): Promise<Ticket> {
    const previousUpdate = this.updateQueue;
    let releaseUpdate = (): void => undefined;
    this.updateQueue = new Promise<void>((resolveQueue) => {
      releaseUpdate = resolveQueue;
    });
    await previousUpdate;

    try {
      const parsedId = TicketIdSchema.safeParse(id);
      if (!parsedId.success) {
        throw repositoryError("Repository path is not allowed.");
      }
      const tickets = await this.readTickets();
      const index = tickets.findIndex(
        (candidate) => candidate.id === parsedId.data,
      );
      if (index < 0) {
        throw new DomainError("Ticket was not found.", "TICKET_NOT_FOUND");
      }
      const current = tickets[index]!;
      if (current.revision !== expectedRevision) {
        throw new DomainError(
          "Ticket revision does not match.",
          "REVISION_CONFLICT",
        );
      }

      let mutated: Ticket;
      try {
        mutated = mutate(structuredClone(current));
      } catch (error) {
        if (error instanceof DomainError) {
          throw error;
        }
        throw repositoryError("Ticket update was rejected.");
      }
      const parsed = TicketSchema.safeParse({
        ...mutated,
        id: current.id,
        revision: current.revision + 1,
      });
      if (!parsed.success) {
        throw repositoryError("Repository data is invalid.");
      }
      tickets[index] = parsed.data;
      await this.writeTicketsAtomically(tickets);
      return parsed.data;
    } finally {
      releaseUpdate();
    }
  }

  private async readTickets(): Promise<Ticket[]> {
    return this.readTicketsFrom(this.runtimeFile);
  }

  private async readTicketsFrom(path: string): Promise<Ticket[]> {
    await assertSafeFile(path);
    try {
      return parseTickets(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      if (error instanceof DomainError || isMissing(error)) {
        throw error;
      }
      throw repositoryError("Repository data is invalid.");
    }
  }

  private async writeTicketsAtomically(tickets: Ticket[]): Promise<void> {
    await assertNoLinkedPath(this.runtimeRoot);
    await assertSafeFile(this.runtimeFile);
    const temporaryFile = resolve(
      this.runtimeRoot,
      `.tickets.json.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await open(temporaryFile, "wx");
      await handle.writeFile(`${JSON.stringify(tickets, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryFile, this.runtimeFile);
      await this.syncDirectory();
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      throw repositoryError("Ticket update could not be persisted.");
    } finally {
      await handle?.close();
      await rm(temporaryFile, { force: true });
    }
  }

  private async syncDirectory(): Promise<void> {
    let handle;
    try {
      handle = await open(this.runtimeRoot, "r");
      await handle.sync();
    } catch {
      // Directory fsync is not supported consistently on Windows.
    } finally {
      await handle?.close();
    }
  }
}
