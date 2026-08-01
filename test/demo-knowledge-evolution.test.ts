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

  it("prints sanitized evidence and audit detail in verbose mode", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "knowledge-showcase-verbose-"));
    roots.push(dataRoot);
    const report = await runKnowledgeEvolutionShowcase({
      root: resolve("."),
      dataRoot,
      mode: "controlled",
      verbose: true,
    });

    expect(report.output).toContain("Supporting diagnoses: diagnosis-001");
    expect(report.output).toContain("Supporting tickets: TKT-1001");
    expect(report.output).toContain("Evidence IDs: request-id");
    expect(report.output).toContain("Deterministic scores:");
    expect(report.output).toContain("GPT provenance: controlled-local-simulation");
    expect(report.output).toContain("## Audit detail");
    expect(report.output).toContain("Completed diagnosis support: 2");
    expect(report.output).toContain("Open-ticket corroboration: 1");
    expect(report.output).toContain("Similarity reasons:");
    expect(report.output).toContain("Contradictions: none");
  });
});
