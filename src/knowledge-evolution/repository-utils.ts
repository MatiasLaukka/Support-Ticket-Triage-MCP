import { lstat, mkdir, open, readdir, rename, rm, type FileHandle } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../errors.js";

const operations = new Map<string, Promise<void>>();
const MAX_RECORD_BYTES = 1_000_000;

export function repositoryError(message: string): DomainError {
  return new DomainError(message, "REPOSITORY_ERROR");
}

export function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function serialize<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const key = process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  const previous = operations.get(key) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((done) => { release = done; });
  operations.set(key, current);
  await previous;
  try { return await operation(); }
  finally { release(); if (operations.get(key) === current) operations.delete(key); }
}

export async function assertNoLinkedPath(path: string): Promise<void> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  for (let current = absolute; current !== root; current = dirname(current)) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw repositoryError("Repository contains an unsupported linked path.");
    } catch (error) {
      if (error instanceof DomainError || isMissing(error)) continue;
      throw repositoryError("Repository path could not be inspected.");
    }
  }
}

export async function initializeDirectory(path: string): Promise<void> {
  try { await assertNoLinkedPath(path); await mkdir(path, { recursive: true }); await assertNoLinkedPath(path); }
  catch (error) { if (error instanceof DomainError) throw error; throw repositoryError("Repository could not be initialized."); }
}

export async function assertSafeFile(path: string): Promise<void> {
  await assertNoLinkedPath(path);
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink > 1 || stats.size > MAX_RECORD_BYTES) throw repositoryError("Repository contains an unsupported linked path.");
  } catch (error) {
    if (error instanceof DomainError || isMissing(error)) throw error;
    throw repositoryError("Repository path could not be inspected.");
  }
}

async function safeOpened(handle: FileHandle): Promise<void> {
  const stats = await handle.stat();
  if (!stats.isFile() || stats.nlink !== 1 || stats.size > MAX_RECORD_BYTES) throw repositoryError("Repository contains an unsupported linked path.");
}

async function close(handle: FileHandle | undefined): Promise<void> { try { await handle?.close(); } catch { /* cleanup */ } }

export async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<T> {
  let handle: FileHandle | undefined;
  try {
    await assertSafeFile(file);
    handle = await open(file, "r");
    await safeOpened(handle);
    const parsed = schema.safeParse(JSON.parse(await handle.readFile("utf8")));
    if (!parsed.success) throw repositoryError("Repository data is invalid.");
    return parsed.data;
  } catch (error) {
    if (error instanceof DomainError || isMissing(error)) throw error;
    throw repositoryError("Repository data is invalid.");
  } finally { await close(handle); }
}

export async function writeNewJson<T extends { id: string }>(root: string, record: T, schema: z.ZodType<T>): Promise<void> {
  const parsed = schema.safeParse(record);
  if (!parsed.success || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) throw repositoryError("Repository data is invalid.");
  await initializeDirectory(root);
  const file = resolve(root, `${record.id}.json`);
  const temporary = resolve(root, `.${record.id}.${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  try {
    await assertNoLinkedPath(file);
    try {
      await lstat(file);
      throw repositoryError("Repository record already exists.");
    } catch (error) {
      if (error instanceof DomainError || !isMissing(error)) throw error;
    }
    handle = await open(temporary, "wx");
    await safeOpened(handle);
    await handle.writeFile(`${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
    await handle.sync();
    await close(handle); handle = undefined;
    await rename(temporary, file);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") throw repositoryError("Repository record already exists.");
    if (error instanceof DomainError) throw error;
    throw repositoryError("Repository record could not be persisted.");
  } finally { await close(handle); await rm(temporary, { force: true }).catch(() => undefined); }
}

export async function listJson<T extends { id: string }>(root: string, schema: z.ZodType<T>, order: (left: T, right: T) => number): Promise<T[]> {
  await assertNoLinkedPath(root);
  let entries;
  try { entries = await readdir(root, { withFileTypes: true, encoding: "utf8" }); }
  catch (error) { if (isMissing(error)) return []; throw repositoryError("Repository is unavailable."); }
  const values: T[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const value = await readJson(resolve(root, entry.name), schema);
    if (`${value.id}.json`.toLowerCase() !== entry.name.toLowerCase()) throw repositoryError("Repository data is invalid.");
    values.push(value);
  }
  return values.sort(order);
}
