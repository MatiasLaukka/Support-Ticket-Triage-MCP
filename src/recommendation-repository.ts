import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import { z } from "zod";
import {
  TriageRecommendationSchema,
  type TriageRecommendation,
} from "./domain.js";
import { DomainError } from "./errors.js";

const RecommendationIdSchema = z.uuid();

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

export class RecommendationRepository {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async create(value: TriageRecommendation): Promise<void> {
    const parsed = TriageRecommendationSchema.safeParse(value);
    if (!parsed.success) {
      throw repositoryError("Repository data is invalid.");
    }
    await initializeDirectory(this.root);

    const path = this.pathFor(parsed.data.id);
    let handle;
    try {
      handle = await open(path, "wx");
      await handle.writeFile(`${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
      await handle.sync();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        throw repositoryError("Recommendation already exists.");
      }
      if (error instanceof DomainError) {
        throw error;
      }
      throw repositoryError("Recommendation could not be persisted.");
    } finally {
      await handle?.close();
    }
  }

  async get(id: string): Promise<TriageRecommendation> {
    const path = this.pathFor(id);
    try {
      await assertSafeFile(path);
      const result = TriageRecommendationSchema.safeParse(
        JSON.parse(await readFile(path, "utf8")),
      );
      if (!result.success) {
        throw repositoryError("Repository data is invalid.");
      }
      return result.data;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      if (isMissing(error)) {
        throw new DomainError(
          "Recommendation was not found.",
          "RECOMMENDATION_NOT_FOUND",
        );
      }
      throw repositoryError("Repository data is invalid.");
    }
  }

  async markResolved(
    id: string,
    resolution: "approved" | "rejected",
  ): Promise<void> {
    const recommendation = await this.get(id);
    const updated = TriageRecommendationSchema.parse({
      ...recommendation,
      resolution,
    });
    const path = this.pathFor(id);
    const temporaryFile = resolve(
      this.root,
      `.${updated.id}.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await open(temporaryFile, "wx");
      await handle.writeFile(`${JSON.stringify(updated, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await assertSafeFile(path);
      await rename(temporaryFile, path);
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      throw repositoryError("Recommendation could not be persisted.");
    } finally {
      await handle?.close();
      await rm(temporaryFile, { force: true });
    }
  }

  private pathFor(id: string): string {
    const parsed = RecommendationIdSchema.safeParse(id);
    if (!parsed.success) {
      throw repositoryError("Repository path is not allowed.");
    }
    return resolve(this.root, `${parsed.data}.json`);
  }
}
