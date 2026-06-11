import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import {
  AuditEventSchema,
  TicketIdSchema,
  type AuditEvent,
  type TicketId,
} from "./domain.js";
import { DomainError } from "./errors.js";

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

export class AuditRepository {
  private readonly file: string;
  private appendQueue: Promise<void> = Promise.resolve();

  constructor(file: string) {
    this.file = resolve(file);
  }

  async append(event: AuditEvent): Promise<void> {
    const parsed = AuditEventSchema.safeParse(event);
    if (!parsed.success) {
      throw repositoryError("Repository data is invalid.");
    }

    const previousAppend = this.appendQueue;
    let releaseAppend = (): void => undefined;
    this.appendQueue = new Promise<void>((resolveQueue) => {
      releaseAppend = resolveQueue;
    });
    await previousAppend;

    try {
      const root = dirname(this.file);
      await assertNoLinkedPath(root);
      await mkdir(root, { recursive: true });
      await assertNoLinkedPath(root);
      try {
        await assertSafeFile(this.file);
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }

      let handle;
      try {
        handle = await open(this.file, "a");
        await handle.write(`${JSON.stringify(parsed.data)}\n`, undefined, "utf8");
        await handle.sync();
      } catch (error) {
        if (error instanceof DomainError) {
          throw error;
        }
        throw repositoryError("Audit event could not be persisted.");
      } finally {
        await handle?.close();
      }
    } finally {
      releaseAppend();
    }
  }

  async list(ticketId?: TicketId): Promise<AuditEvent[]> {
    let parsedTicketId: TicketId | undefined;
    if (ticketId !== undefined) {
      const result = TicketIdSchema.safeParse(ticketId);
      if (!result.success) {
        throw repositoryError("Repository path is not allowed.");
      }
      parsedTicketId = result.data;
    }

    try {
      await assertSafeFile(this.file);
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }

    let content: string;
    try {
      content = await readFile(this.file, "utf8");
    } catch {
      throw repositoryError("Audit log could not be read.");
    }
    if (content === "") {
      return [];
    }

    const lines = content.endsWith("\n")
      ? content.slice(0, -1).split("\n")
      : content.split("\n");
    const events: AuditEvent[] = [];
    for (const line of lines) {
      if (line.trim() === "") {
        throw repositoryError("Audit log contains malformed data.");
      }
      try {
        const result = AuditEventSchema.safeParse(JSON.parse(line));
        if (!result.success) {
          throw repositoryError("Audit log contains malformed data.");
        }
        events.push(result.data);
      } catch (error) {
        if (error instanceof DomainError) {
          throw error;
        }
        throw repositoryError("Audit log contains malformed data.");
      }
    }
    return parsedTicketId === undefined
      ? events
      : events.filter((event) => event.ticketId === parsedTicketId);
  }
}
