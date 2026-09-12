import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRetrievalIndex } from "../scripts/retrieval-index.js";

describe("retrieval maintenance CLI", () => {
  it("reports absent status without creating a database and rejects unknown commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "retrieval-cli-"));
    try {
      await expect(runRetrievalIndex(["status"], root)).resolves.toMatchObject({ status: "absent" });
      await expect(runRetrievalIndex(["unknown"], root)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
