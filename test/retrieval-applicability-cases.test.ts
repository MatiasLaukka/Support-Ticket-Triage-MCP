import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { unavailableReusableKnowledge } from "../src/knowledge-evolution/reusable-context.js";
import {
  ApplicabilityDevelopmentCaseSchema,
  ApplicabilityManifestSchema,
  loadApplicabilityDevelopment,
  selectApplicabilityDevelopmentForExecution,
  validateApplicabilityDevelopment,
} from "../src/retrieval/applicability-cases.js";
import { validateRankingCapture, type RankingCapture } from "../src/retrieval/ranking-capture.js";
import { ReadinessCaseSchema, ReadinessManifestSchema } from "../src/retrieval/readiness-cases.js";
import { hashText } from "../src/retrieval/representations.js";
import { loadRetrievalSources } from "../src/retrieval/sources.js";

const CASE_ROOT = resolve("data/evaluation/applicability-v1");
const READINESS_ROOT = resolve("data/evaluation/knowledge-readiness");
const CAPTURE_PATH = resolve("reports/retrieval/b4-ranking/development-20260916-22590b22-timeout120s/capture.json");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function validationFixture() {
  const loaded = loadApplicabilityDevelopment(CASE_ROOT);
  const readinessManifest = ReadinessManifestSchema.parse(JSON.parse(readFileSync(join(READINESS_ROOT, "manifest.json"), "utf8")));
  const readinessBytes = readFileSync(join(READINESS_ROOT, readinessManifest.development.path));
  expect(sha256(readinessBytes)).toBe(readinessManifest.development.sha256);
  const readinessCases = ReadinessCaseSchema.array().parse(JSON.parse(readinessBytes.toString("utf8")));

  const rawCapture: unknown = JSON.parse(readFileSync(CAPTURE_PATH, "utf8"));
  validateRankingCapture(rawCapture);
  const capture: RankingCapture = rawCapture;

  const articles = await new KnowledgeRepository(resolve("data/knowledge")).list();
  const sourceSnapshot = loadRetrievalSources({
    articles,
    reusable: unavailableReusableKnowledge(),
    completedSnapshots: [],
  });
  const projectedCorpusHash = hashText(JSON.stringify(sourceSnapshot.resources
    .map(({ resource }) => [resource.key, resource.contentHash])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)));
  expect(projectedCorpusHash).toBe(capture.identity.corpusHash);

  return { loaded, readinessManifest, readinessCases, capture, sourceSnapshot };
}

describe("B5 applicability development oracle", () => {
  it("loads an LF-hashed manifest with exactly the frozen 21 ordered development cases", () => {
    const loaded = loadApplicabilityDevelopment(CASE_ROOT);
    expect(loaded.manifest.version).toBe(2);
    expect(loaded.manifest.applicabilityContractVersion).toBe(2);
    expect(loaded.manifest.promptVersion).toBe("b5-applicability-v2");
    expect(loaded.cases).toHaveLength(21);
    expect(loaded.manifest.caseIds).toHaveLength(21);
    expect(loaded.cases.map(({ id }) => id)).toEqual(loaded.manifest.caseIds);
    expect(loaded.developmentHash).toBe(loaded.manifest.development.sha256);
    expect(readFileSync(join(CASE_ROOT, "development.json"))).not.toContain(0x0d);
  });

  it("keeps the B5 manifest development-only with no holdout or command metadata", () => {
    const raw = readFileSync(join(CASE_ROOT, "manifest.json"), "utf8");
    const manifest = ApplicabilityManifestSchema.parse(JSON.parse(raw));
    expect(manifest).not.toHaveProperty("holdout");
    expect(raw.toLowerCase()).not.toContain("holdout");
    expect(raw.toLowerCase()).not.toContain("command");
  });

  it("rejects lexical path escapes before reading development data", () => {
    const actual = loadApplicabilityDevelopment(CASE_ROOT);
    const root = mkdtempSync(join(tmpdir(), "b5-applicability-root-"));
    try {
      writeFileSync(join(root, "manifest.json"), JSON.stringify({
        ...actual.manifest,
        development: { ...actual.manifest.development, path: "../outside.json" },
      }));
      expect(() => loadApplicabilityDevelopment(root)).toThrow(/inside|root|path/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects CRLF-rewritten development bytes instead of silently rehashing them", () => {
    const actual = loadApplicabilityDevelopment(CASE_ROOT);
    const root = mkdtempSync(join(tmpdir(), "b5-applicability-lf-"));
    try {
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, "manifest.json"), `${JSON.stringify(actual.manifest, null, 2)}\n`);
      const lf = readFileSync(join(CASE_ROOT, "development.json"), "utf8");
      writeFileSync(join(root, "development.json"), lf.replace(/\n/g, "\r\n"));
      expect(() => loadApplicabilityDevelopment(root)).toThrow(/LF|hash/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("validates the frozen capture, source identities, candidate partition, evidence references, and readiness coverage", async () => {
    const fixture = await validationFixture();
    expect(() => validateApplicabilityDevelopment(
      fixture.loaded.manifest,
      fixture.loaded.cases,
      {
        capture: fixture.capture,
        sourceReadinessCases: fixture.readinessCases,
        sourceReadinessDevelopmentHash: fixture.readinessManifest.development.sha256,
        sourceSnapshot: fixture.sourceSnapshot,
      },
    )).not.toThrow();
  });

  it("keeps every safe projection free of ticket/customer/account/prompt/secret/path/raw-payload identifiers", () => {
    const { cases } = loadApplicabilityDevelopment(CASE_ROOT);
    const unsafe = /\bTKT-\d+\b|\bwh_[A-Za-z0-9]+\b|\bP-\d+\b|@|system prompt|developer message|raw provider payload|api[-_ ]?key|access[-_ ]?token|password|sk-[A-Za-z0-9_-]+|[A-Za-z]:[\\/]/i;
    for (const entry of cases) {
      expect(JSON.stringify(entry.safeCase)).not.toMatch(unsafe);
      const ids = [...entry.safeCase.observedFacts, ...entry.safeCase.conversationState].map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("freezes only causally eligible pre-diagnosis taxonomy", () => {
    const { cases } = loadApplicabilityDevelopment(CASE_ROOT);
    for (const entry of cases) {
      expect(["initial-classification", "customer-evidence"]).toContain(entry.taxonomy.basis.source);
      expect(entry.taxonomy.basis.source).not.toBe("diagnosis");
      expect(entry.taxonomy.basis.source).not.toBe("known-cause-assessment");
    }
  });

  it("contains all four verdicts and explicit non-applicable controls across required families", () => {
    const { cases } = loadApplicabilityDevelopment(CASE_ROOT);
    const verdicts = new Set(cases.flatMap(({ judgments }) => judgments.map(({ verdict }) => verdict)));
    expect(verdicts).toEqual(new Set(["applicable-next-step", "contradicted", "insufficient-evidence", "irrelevant"]));

    const controls = [
      /exact-no-code/,
      /paraphrase/,
      /contrast/,
      /disagreement/,
      /insufficient/,
      /near-match/,
      /opaque-id-negative/,
    ];
    for (const pattern of controls) {
      const matching = cases.filter(({ id }) => pattern.test(id));
      expect(matching.length).toBeGreaterThan(0);
      expect(matching.every(({ judgments }) => judgments.some(({ verdict }) => verdict !== "applicable-next-step"))).toBe(true);
    }
  });

  it("requires the opaque-ID negative control to abstain and inspect the referenced record before asking the requester to restate anything", () => {
    const { cases } = loadApplicabilityDevelopment(CASE_ROOT);
    const opaque = cases.find(({ id }) => id === "readiness-webhook-opaque-id-negative-001");
    expect(opaque?.synthesisOracle.disposition).toBe("abstain");
    expect(opaque?.synthesisOracle.acceptableLeadingHypotheses).toEqual([]);
    expect(opaque?.synthesisOracle.orderedAlternativeHypotheses).toEqual([]);
    expect(opaque?.synthesisOracle.evidenceActionIntents).toEqual([expect.objectContaining({
      targetRanks: [],
      allowedActionTypes: ["inspect-internal"],
      requiredConcepts: expect.arrayContaining(["resolve delivery identifier", "delivery record status"]),
    })]);
    expect(opaque?.synthesisOracle.forbiddenClaims.join(" ")).toMatch(/do not ask the requester to restate the problem/i);
  });

  it("normalizes evidence polarity so irrelevant candidates never claim support", () => {
    const { cases } = loadApplicabilityDevelopment(CASE_ROOT);
    for (const entry of cases) {
      for (const judgment of entry.judgments) {
        const supporting = new Set(judgment.supportingEvidence.map((reference) => `${reference.kind}:${reference.id}`));
        expect(judgment.contradictingEvidence.some((reference) => supporting.has(`${reference.kind}:${reference.id}`))).toBe(false);
        if (judgment.verdict === "irrelevant") expect(judgment.supportingEvidence).toEqual([]);
        if (judgment.verdict === "contradicted") expect(judgment.contradictingEvidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("expects one prioritized diagnostic path, ordered alternatives, and concrete evidence actions instead of fake discriminator questions", () => {
    const { cases } = loadApplicabilityDevelopment(CASE_ROOT);
    expect(cases.every(({ synthesisOracle }) => synthesisOracle.novelHypothesisPolicy === "allowed-requires-review")).toBe(true);
    for (const entry of cases) {
      const oracle = entry.synthesisOracle;
      expect(oracle).not.toHaveProperty("discriminatorIntents");
      expect(oracle.evidenceActionIntents.length).toBeGreaterThan(0);
      if (oracle.disposition === "hypothesis") {
        expect(oracle.acceptableLeadingHypotheses.length).toBeGreaterThan(0);
        expect(oracle.evidenceActionIntents.some(({ targetRanks }) => targetRanks.includes(0))).toBe(true);
      }
    }
    const rotation = cases.find(({ id }) => id === "readiness-webhook-exact-rotation-001")!;
    expect(rotation.synthesisOracle.acceptableLeadingHypotheses[0]?.candidateKeyPool).toEqual(["known-cause:webhook-secret-rotation"]);
    expect(rotation.synthesisOracle.orderedAlternativeHypotheses[0]?.candidateKeyPool).toEqual([
      "diagnostic-playbook:article-backed",
      "knowledge-article:webhook-signature-validation",
    ]);
    const latency = cases.find(({ id }) => id === "readiness-webhook-paraphrase-late-001")!;
    expect(latency.synthesisOracle.acceptableLeadingHypotheses[0]?.candidateKeyPool).toEqual(["known-cause:webhook-delivery-latency"]);
  });

  it("does not keep event-ingestion troubleshooting applicable after aligned event presence is already established", () => {
    const { cases } = loadApplicabilityDevelopment(CASE_ROOT);
    for (const id of ["readiness-flow-contrast-excluded-001", "readiness-flow-near-match-001"]) {
      const entry = cases.find((candidate) => candidate.id === id)!;
      expect(entry.judgments.find(({ resourceKey }) => resourceKey === "knowledge-article:event-tracking-debugging")?.verdict).toBe("irrelevant");
    }
  });

  it("keeps all 21 draft reviews pending and refuses provider-execution selection", () => {
    const { cases } = loadApplicabilityDevelopment(CASE_ROOT);
    expect(cases.every(({ review }) => review.status === "pending")).toBe(true);
    expect(() => selectApplicabilityDevelopmentForExecution(cases)).toThrow(/approved review/i);
  });

  it("rejects unknown fields at the strict schema and duplicate safe-case facts during semantic validation", async () => {
    const fixture = await validationFixture();
    const first = structuredClone(fixture.loaded.cases[0]!);
    expect(() => ApplicabilityDevelopmentCaseSchema.parse({ ...first, invented: true })).toThrow();
    first.safeCase.observedFacts.push({ ...first.safeCase.observedFacts[0]! });
    const mutated = [first, ...fixture.loaded.cases.slice(1)];
    expect(() => validateApplicabilityDevelopment(
      fixture.loaded.manifest,
      mutated,
      {
        capture: fixture.capture,
        sourceReadinessCases: fixture.readinessCases,
        sourceReadinessDevelopmentHash: fixture.readinessManifest.development.sha256,
        sourceSnapshot: fixture.sourceSnapshot,
      },
    )).toThrow(/duplicate fact/i);
  });
});
