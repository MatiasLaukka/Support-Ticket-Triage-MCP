import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    expect(report.futureTicketReuse).toMatchObject({
      ticketId: "TKT-2099",
      prePromotion: {
        knownCause: null,
        supportState: "needs-information",
        missingEvidenceIds: ["request-id"],
      },
      postPromotion: {
        knownCause: report.candidateId,
        supportState: "needs-information",
        missingEvidenceIds: ["request-id"],
      },
      afterEvidence: {
        knownCause: report.candidateId,
        supportState: "known-cause",
        missingEvidenceIds: [],
      },
      historicalRecommendationUnchanged: true,
    });
    expect(report.output).toContain("Future-ticket reuse");
    expect(report.output).toContain("Historical recommendation: byte-for-byte unchanged");
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

    expect(report.output).toContain("Candidate-selected diagnosis: diagnosis-001");
    expect(report.output).toContain("Candidate-selected ticket: TKT-1001");
    expect(report.output).toContain("Evidence IDs: request-id");
    expect(report.output).toContain("Deterministic scores:");
    expect(report.output).toContain("GPT provenance: controlled-local-simulation");
    expect(report.output).toContain("## Audit detail");
    expect(report.output).toContain("Discovery completed diagnosis support: 2");
    expect(report.output).toContain("Discovery open-ticket corroboration: 1");
    expect(report.output).toContain("Similarity reasons:");
    expect(report.output).toContain("Contradictions: none");
  });

  it("documents the bounded SQLite learning loop", async () => {
    const readme = await readFile(resolve("README.md"), "utf8");
    const caseStudy = await readFile(resolve("docs", "case-study.md"), "utf8");
    const roadmap = await readFile(resolve("docs", "roadmap.md"), "utf8");

    expect(readme).toMatch(/SQLite\s+learning\s+ledger/);
    expect(readme).toContain("not autonomous model retraining");
    expect(readme).toContain("maturity and health");
    expect(readme).toMatch(/historical\s+recommendations remain unchanged/);
    expect(caseStudy).toContain("operational plane remains authoritative");
    expect(caseStudy).toContain("outcome-verified");
    expect(roadmap).toContain("Full operational SQLite migration");
  });
});
