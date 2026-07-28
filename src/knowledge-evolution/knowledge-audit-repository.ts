import { lstat, open, type FileHandle } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { assertNoLinkedPath, assertSafeFile, initializeDirectory, isMissing, repositoryError, serialize } from "./repository-utils.js";

const Text = z.string().trim().min(1).max(1_000);
export const KnowledgeAuditEventSchema = z.object({
  id: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), objectId: Text.optional(), candidateId: Text.optional(), action: Text,
  actor: Text, timestamp: z.string().datetime(), supportIds: z.array(Text).max(100), scores: z.record(z.string(), z.number()).optional(), provenanceSummary: Text.optional(),
  reviewedFields: z.array(Text).max(100), result: Text, rejectionReason: Text.optional(),
}).strict().refine((value) => value.objectId !== undefined || value.candidateId !== undefined, "An object or candidate ID is required.");
export type KnowledgeAuditEvent = z.infer<typeof KnowledgeAuditEventSchema>;
export interface KnowledgeAuditFilters { objectId?: string; candidateId?: string; action?: string; actor?: string; }
async function close(handle: FileHandle | undefined): Promise<void> { try { await handle?.close(); } catch { /* cleanup */ } }

export class KnowledgeAuditRepository {
  private readonly file: string;
  constructor(file: string) { this.file = resolve(file); }
  async append(event: KnowledgeAuditEvent): Promise<void> {
    const parsed = KnowledgeAuditEventSchema.safeParse(event);
    if (!parsed.success) throw repositoryError("Repository data is invalid.");
    return serialize(this.file, async () => {
      await initializeDirectory(dirname(this.file));
      try { await assertSafeFile(this.file); } catch (error) { if (!isMissing(error)) throw error; }
      let handle: FileHandle | undefined;
      try { handle = await open(this.file, "a+"); const stats = await handle.stat(); if (!stats.isFile() || stats.nlink !== 1) throw repositoryError("Repository contains an unsupported linked path."); await handle.writeFile(`${JSON.stringify(parsed.data)}\n`, "utf8"); await handle.sync(); }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "EEXIST") throw repositoryError("Audit event could not be persisted."); if (error instanceof Error && error.name === "DomainError") throw error; throw repositoryError("Audit event could not be persisted."); }
      finally { await close(handle); }
    });
  }
  async list(filters: KnowledgeAuditFilters = {}): Promise<KnowledgeAuditEvent[]> {
    return serialize(this.file, async () => {
      try { await assertSafeFile(this.file); } catch (error) { if (isMissing(error)) return []; throw error; }
      let handle: FileHandle | undefined;
      try {
        handle = await open(this.file, "r");
        const stats = await handle.stat(); if (!stats.isFile() || stats.nlink !== 1) throw repositoryError("Repository contains an unsupported linked path.");
        const events: KnowledgeAuditEvent[] = [];
        for await (const line of handle.readLines()) { const result = KnowledgeAuditEventSchema.safeParse(JSON.parse(line)); if (!result.success) throw repositoryError("Audit log contains malformed data."); events.push(result.data); }
        return events.filter((event) => (filters.objectId === undefined || event.objectId === filters.objectId) && (filters.candidateId === undefined || event.candidateId === filters.candidateId) && (filters.action === undefined || event.action === filters.action) && (filters.actor === undefined || event.actor === filters.actor));
      } catch (error) { if (error instanceof Error && error.name === "DomainError") throw error; throw repositoryError("Audit log contains malformed data."); }
      finally { await close(handle); }
    });
  }
}
