import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runKnowledgeEvolutionShowcase } from "../scripts/demo-knowledge-evolution.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("knowledge evolution showcase", () => {
  it("shows deterministic discovery, advisory drafting, and explicit promotion", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "knowledge-showcase-"));
    roots.push(dataRoot);
    const report = await runKnowledgeEvolutionShowcase({
      root: resolve("."),
      dataRoot,
      mode: "controlled",
    });

    expect(report.gptStatus).toBe("used");
    expect(report.candidateId).toMatch(/^known-cause-gpt-/);
    expect(report.approval).toMatchObject({ actor: "support-lead", status: "approved" });
    expect(report.auditActions).toEqual(expect.arrayContaining(["candidate-created", "approved"]));
    expect(report.output).toContain("Human approval required");
  });
});
