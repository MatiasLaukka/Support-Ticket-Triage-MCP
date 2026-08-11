import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import {
  AuditEventSchema,
  TicketIdSchema,
  type AuditEvent,
  type TicketId,
} from "./domain.js";
import { DomainError } from "./errors.js";

const defaultFileSystem = { open, rename, rm };
type AuditFileSystem = typeof defaultFileSystem;
const auditOperations = new Map<string, Promise<void>>();
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

export interface AuditPageInput {
  ticketId?: TicketId;
  offset: number;
  limit: number;
}

export interface AuditPage {
  events: AuditEvent[];
  total: number;
  offset: number;
  limit: number;
}

interface Closable {
  close(): Promise<void>;
}

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

function isUnresolvedPathComponent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
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
      if (!isUnresolvedPathComponent(error)) {
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

async function assertSafeOpenedFile(
  handle: Pick<FileHandle, "stat">,
): Promise<void> {
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.nlink !== 1) {
      throw repositoryError("Repository contains an unsupported linked path.");
    }
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw repositoryError("Repository path could not be inspected.");
  }
}

async function initializeDirectory(path: string): Promise<void> {
  try {
    await assertNoLinkedPath(path);
    await mkdir(path, { recursive: true });
    await assertNoLinkedPath(path);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw repositoryError("Repository could not be initialized.");
  }
}

async function closeQuietly(handle: Closable | undefined): Promise<void> {
  try {
    await handle?.close();
  } catch {
    // Cleanup must not replace the repository operation's safe result.
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

async function serializeByPath<T>(
  path: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = operationKey(path);
  const previous = auditOperations.get(key) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolveOperation) => {
    release = resolveOperation;
  });
  auditOperations.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (auditOperations.get(key) === current) {
      auditOperations.delete(key);
    }
  }
}

function operationKey(path: string): string {
  const resolvedPath = resolve(path);
  return process.platform === "win32"
    ? resolvedPath.toLowerCase()
    : resolvedPath;
}

function parseTicketId(ticketId: TicketId | undefined): TicketId | undefined {
  if (ticketId === undefined) {
    return undefined;
  }
  const result = TicketIdSchema.safeParse(ticketId);
  if (!result.success) {
    throw repositoryError("Repository path is not allowed.");
  }
  return result.data;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function parseAuditLine(line: string): AuditEvent {
  if (line.trim() === "") {
    throw repositoryError("Audit log contains malformed data.");
  }
  try {
    const result = AuditEventSchema.safeParse(JSON.parse(line));
    if (!result.success) {
      throw repositoryError("Audit log contains malformed data.");
    }
    return result.data;
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw repositoryError("Audit log contains malformed data.");
  }
}

export class AuditRepository {
  private readonly file: string;
  private readonly fileSystem: AuditFileSystem;

  constructor(file: string, fileSystem: Partial<AuditFileSystem> = {}) {
    this.file = resolve(file);
    this.fileSystem = { ...defaultFileSystem, ...fileSystem };
  }

  async append(event: AuditEvent): Promise<void> {
    const parsed = AuditEventSchema.safeParse(event);
    if (!parsed.success) {
      throw repositoryError("Repository data is invalid.");
    }

    return this.appendParsed([parsed.data]);
  }

  async appendBatch(events: readonly AuditEvent[]): Promise<void> {
    const parsedEvents: AuditEvent[] = [];
    for (const event of events) {
      const parsed = AuditEventSchema.safeParse(event);
      if (!parsed.success) {
        throw repositoryError("Repository data is invalid.");
      }
      parsedEvents.push(parsed.data);
    }

    return this.appendParsed(parsedEvents);
  }

  private async appendParsed(events: readonly AuditEvent[]): Promise<void> {
    if (events.length === 0) return;

    return serializeByPath(this.file, async () => {
      const root = dirname(this.file);
      await initializeDirectory(root);

      let sourceHandle;
      let stagingHandle;
      let lockHandle;
      const temporaryFile = resolve(root, `.${randomUUID()}.tmp`);
      const lockFile = resolve(root, `.${parse(this.file).base}.lock`);
      let temporaryFileCreated = false;
      let lockCreated = false;
      let committed = false;
      let operationError: unknown;
      let stagingCleanupFailed = false;
      let lockCleanupFailed = false;
      try {
        try {
          lockHandle = await this.fileSystem.open(lockFile, "wx");
          lockCreated = true;
          await assertSafeOpenedFile(lockHandle);
        } catch (error) {
          if (!lockCreated && isAlreadyExists(error)) {
            throw repositoryError("Audit log is busy; retry the operation.");
          }
          throw error;
        } finally {
          await closeQuietly(lockHandle);
          lockHandle = undefined;
        }

        try {
          await assertSafeFile(this.file);
        } catch (error) {
          if (!isMissing(error)) {
            throw error;
          }
        }

        let originalContent = "";
        try {
          sourceHandle = await this.fileSystem.open(this.file, "r");
          await assertSafeOpenedFile(sourceHandle);
          originalContent = await sourceHandle.readFile("utf8");
        } catch (error) {
          if (!isMissing(error)) {
            throw error;
          }
        } finally {
          await closeQuietly(sourceHandle);
          sourceHandle = undefined;
        }

        stagingHandle = await this.fileSystem.open(temporaryFile, "wx");
        temporaryFileCreated = true;
        await assertSafeOpenedFile(stagingHandle);
        const separator =
          originalContent === "" || originalContent.endsWith("\n") ? "" : "\n";
        await stagingHandle.writeFile(
          `${originalContent}${separator}${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
          "utf8",
        );
        await stagingHandle.sync();
        await closeQuietly(stagingHandle);
        stagingHandle = undefined;
        await this.fileSystem.rename(temporaryFile, this.file);
        committed = true;
      } catch (error) {
        operationError = error;
      } finally {
        await closeQuietly(sourceHandle);
        await closeQuietly(stagingHandle);
        await closeQuietly(lockHandle);
        if (temporaryFileCreated && !committed) {
          try {
            await this.fileSystem.rm(temporaryFile, { force: true });
          } catch {
            stagingCleanupFailed = true;
          }
        }
        if (lockCreated) {
          try {
            await this.fileSystem.rm(lockFile, { force: true });
          } catch {
            lockCleanupFailed = true;
          }
        }
      }
      if (operationError !== undefined) {
        if (operationError instanceof DomainError) {
          if (!stagingCleanupFailed && !lockCleanupFailed) {
            throw operationError;
          }
          const cleanupMessage = stagingCleanupFailed && lockCleanupFailed
            ? "Temporary staging and repository lock cleanup also failed."
            : stagingCleanupFailed
              ? "Temporary staging cleanup also failed."
              : "Repository lock cleanup also failed.";
          throw repositoryError(`${operationError.message} ${cleanupMessage}`);
        }
        if (stagingCleanupFailed && lockCleanupFailed) {
          throw repositoryError(
            "Audit event could not be persisted; temporary staging and repository lock cleanup failed.",
          );
        }
        if (stagingCleanupFailed) {
          throw repositoryError(
            "Audit event could not be persisted; temporary staging cleanup failed.",
          );
        }
        if (lockCleanupFailed) {
          throw repositoryError(
            "Audit event could not be persisted; repository lock cleanup failed after the audit operation failed.",
          );
        }
        throw repositoryError("Audit event could not be persisted.");
      }
      if (lockCleanupFailed) {
        throw repositoryError(
          "Audit event was committed but repository lock cleanup failed.",
        );
      }
    });
  }

  async list(ticketId?: TicketId): Promise<AuditEvent[]> {
    return serializeByPath(this.file, async () => {
      const parsedTicketId = parseTicketId(ticketId);

      try {
        await assertSafeFile(this.file);
      } catch (error) {
        if (isMissing(error)) {
          return [];
        }
        throw error;
      }

      let content: string;
      let handle;
      try {
        handle = await this.fileSystem.open(this.file, "r");
        await assertSafeOpenedFile(handle);
        content = await handle.readFile("utf8");
      } catch (error) {
        if (error instanceof DomainError) {
          throw error;
        }
        throw repositoryError("Audit log could not be read.");
      } finally {
        await closeQuietly(handle);
      }
      if (content === "") {
        return [];
      }

      const lines = content.endsWith("\n")
        ? content.slice(0, -1).split("\n")
        : content.split("\n");
      const events: AuditEvent[] = [];
      for (const line of lines) {
        events.push(parseAuditLine(line));
      }
      return parsedTicketId === undefined
        ? events
        : events.filter((event) => event.ticketId === parsedTicketId);
    });
  }

  async listPage(input: AuditPageInput): Promise<AuditPage> {
    const parsedTicketId = parseTicketId(input.ticketId);
    const offset = boundedInteger(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = boundedInteger(
      input.limit,
      1,
      MAX_PAGE_LIMIT,
      DEFAULT_PAGE_LIMIT,
    );

    return serializeByPath(this.file, async () => {
      try {
        await assertSafeFile(this.file);
      } catch (error) {
        if (isMissing(error)) {
          return { events: [], total: 0, offset, limit };
        }
        throw error;
      }

      const events: AuditEvent[] = [];
      let total = 0;
      let handle;
      try {
        handle = await this.fileSystem.open(this.file, "r");
        await assertSafeOpenedFile(handle);
        for await (const line of handle.readLines()) {
          const event = parseAuditLine(line);
          if (
            parsedTicketId !== undefined &&
            event.ticketId !== parsedTicketId
          ) {
            continue;
          }
          if (total >= offset && events.length < limit) {
            events.push(event);
          }
          total += 1;
        }
      } catch (error) {
        if (error instanceof DomainError) {
          throw error;
        }
        throw repositoryError("Audit log could not be read.");
      } finally {
        await closeQuietly(handle);
      }

      return { events, total, offset, limit };
    });
  }
}
