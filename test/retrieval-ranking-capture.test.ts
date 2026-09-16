import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createRankingCapture,
  hashCanonicalRankingCapture,
  validateRankingCapture,
  writeRankingCaptureExclusive,
} from "../src/retrieval/ranking-capture.js";
import { rankRetrieval } from "../src/retrieval/ranking.js";
import type { RankingCapture, RankingCaptureCase } from "../src/retrieval/ranking-capture.js";
import type { RankingInput, RankingOutputLimits } from "../src/retrieval/ranking-types.js";
import type { RetrievalResult } from "../src/retrieval/types.js";

const outputLimits: RankingOutputLimits = {
  "knowledge-article": 5,
  "known-cause": 5,
  "diagnostic-playbook": 5,
  "resolved-ticket": 5,
};
const retrievalLimits = {
  "knowledge-article": { lexical: 5, semantic: 5 },
  "known-cause": { lexical: 5, semantic: 5 },
  "diagnostic-playbook": { lexical: 5, semantic: 5 },
  "resolved-ticket": { lexical: 5, semantic: 5 },
} as const;
const corpusHash = "c".repeat(64);
const caseSetHash = "a".repeat(64);
const labelHash = "b".repeat(64);
const manifestHash = "d".repeat(64);

const retrieval: RetrievalResult = {
  metadata: {
    schemaVersion: 2,
    representationVersion: 3,
    generation: 7,
    lexicalGeneration: 7,
    semanticGeneration: 7,
    corpusHash,
    state: "ready",
  },
  lexical: { status: "used" },
  semantic: { status: "unavailable", reason: "provider-not-configured" },
  candidates: [{
    resourceKey: "knowledge-article:one",
    resourceType: "knowledge-article",
    lexical: {
      bestRank: 4,
      bestBm25Score: 0.2,
      matches: [{ representationId: "one-representation", resourceKey: "knowledge-article:one", score: 0.2, rank: 4 }],
    },
    deterministicReferences: [{ resourceKey: "knowledge-article:one", channel: "deterministic-reference", sourceId: "fixture-source", reason: "classifier-association" }],
    knownCauseReferences: [],
  }],
  referenceDiagnostics: [],
};

function queryBasis(caseId: string): RankingInput["queryBasis"] {
  return { queryHash: `query-${caseId}`, ticketId: caseId, ticketRevision: 1, customerReplyWatermark: "none" };
}

function captureCase(caseId: string): RankingCaptureCase {
  const basis = queryBasis(caseId);
  const ranking = rankRetrieval({ contractVersion: 1, queryBasis: basis, retrieval, outputLimits }, { id: "lexical-only-v1", kind: "lexical-only" });
  return {
    caseId,
    split: "development",
    caseSetHash,
    labelHash,
    manifestHash,
    corpusHash,
    contentSourceRevision: "content-revision",
    queryFormatIdentity: { kind: "lexical-query-v1", template: "query-basis-v1" },
    providerKind: "none",
    model: null,
    representationVersion: 3,
    retrievalLimits,
    indexIdentity: ranking.retrievalIdentity,
    queryBasis: basis,
    retrieval,
    rankingProvenance: {
      contractVersion: 1,
      inputHash: ranking.inputHash,
      retrievalIdentity: ranking.retrievalIdentity,
      outputLimits,
      tieBreak: "ordinal-resource-key",
    },
    timingsMs: { retrieval: 1, provider: 0, ranking: null },
    traceTruncated: false,
  };
}

function validCapture(): RankingCapture {
  return createRankingCapture({
    evaluatorSourceRevision: "evaluator-revision",
    identity: {
      split: "development",
      caseSetHash,
      labelHash,
      manifestHash,
      caseIds: ["DEV-1", "DEV-2"],
      reviewStatus: "approved",
      sourceCutoff: "2026-09-12T23:59:59.999Z",
      contentSourceRevision: "content-revision",
      corpusHash,
      queryFormatIdentity: { kind: "lexical-query-v1", template: "query-basis-v1" },
      providerKind: "none",
      model: null,
      representationVersion: 3,
      retrievalLimits,
      outputLimits,
      indexIdentity: captureCase("DEV-1").indexIdentity,
    },
    cases: [captureCase("DEV-1"), captureCase("DEV-2")],
  });
}

function rehashCapture(capture: RankingCapture): RankingCapture {
  capture.captureHash = hashCanonicalRankingCapture({ ...capture, captureHash: undefined });
  return capture;
}

function refreshCaseInputHash(captureCase: RankingCaptureCase): void {
  const ranking = rankRetrieval({ contractVersion: 1, queryBasis: captureCase.queryBasis, retrieval: captureCase.retrieval, outputLimits }, { id: "lexical-only-v1", kind: "lexical-only" });
  captureCase.rankingProvenance.inputHash = ranking.inputHash;
}

function modelledCapture(): RankingCapture {
  const capture = structuredClone(validCapture());
  const model = { tag: "qwen3-embedding", digest: "qwen-revision", dimensions: 1024 };
  const indexModel = { id: model.tag, revision: model.digest, dimensions: model.dimensions };
  capture.identity.model = model;
  capture.identity.indexIdentity.model = indexModel;
  for (const captureCase of capture.cases) {
    captureCase.model = { ...model };
    captureCase.indexIdentity.model = { ...indexModel };
    captureCase.retrieval.metadata.model = { ...indexModel };
    captureCase.rankingProvenance.retrievalIdentity.model = { ...indexModel };
    refreshCaseInputHash(captureCase);
  }
  return rehashCapture(capture);
}

describe("B4 ranking captures", () => {
  it("accepts a complete sanitized immutable development capture", () => {
    const capture = validCapture();

    expect(() => validateRankingCapture(capture)).not.toThrow();
    expect(capture).toMatchObject({ formatVersion: 1, captureHash: expect.stringMatching(/^[0-9a-f]{64}$/), identity: { split: "development", reviewStatus: "approved", caseIds: ["DEV-1", "DEV-2"] } });
    expect(JSON.stringify(capture)).not.toContain("queryText");
  });

  it.each([
    ["missing case ID", (capture: RankingCapture) => { delete (capture.cases[0] as any).caseId; }],
    ["duplicate case IDs", (capture: RankingCapture) => { (capture.cases[1] as any).caseId = capture.cases[0]!.caseId; }],
    ["truncated trace input", (capture: RankingCapture) => { (capture.cases[0] as any).traceTruncated = true; }],
    ["case hash mismatch", (capture: RankingCapture) => { (capture.cases[0] as any).caseSetHash = "changed"; }],
    ["corpus hash mismatch", (capture: RankingCapture) => { (capture.cases[0] as any).corpusHash = "changed"; }],
    ["label hash mismatch", (capture: RankingCapture) => { (capture.cases[0] as any).labelHash = "changed"; }],
    ["manifest hash mismatch", (capture: RankingCapture) => { (capture.cases[0] as any).manifestHash = "changed"; }],
    ["mixed query-format identities", (capture: RankingCapture) => { (capture.cases[1] as any).queryFormatIdentity = { kind: "changed", template: "query-basis-v1" }; }],
    ["mixed model identities", (capture: RankingCapture) => { (capture.cases[1] as any).providerKind = "ollama"; }],
    ["absent ranking provenance", (capture: RankingCapture) => { delete (capture.cases[0] as any).rankingProvenance; }],
    ["incomplete candidate matches", (capture: RankingCapture) => { (capture.cases[0]!.retrieval.candidates[0]!.lexical!.matches as any) = []; }],
    ["holdout case", (capture: RankingCapture) => { (capture.cases[0] as any).split = "holdout"; }],
    ["unsafe raw field", (capture: RankingCapture) => { (capture.cases[0] as any).unsafe = { prompt: "do not store" }; }],
  ] as const)("rejects %s", (_name, mutate) => {
    const capture = structuredClone(validCapture());
    mutate(capture);
    expect(() => validateRankingCapture(capture)).toThrow();
  });

  it("rejects altered content when the claimed capture hash is unchanged", () => {
    const capture = structuredClone(validCapture());
    (capture.cases[0]!.retrieval.candidates[0]!.lexical!.matches[0] as any).score = 0.9;

    expect(() => validateRankingCapture(capture)).toThrow(/capture hash/i);
  });

  it("rejects an unknown raw-text field even when the capture hash is recomputed", () => {
    const capture = rehashCapture(structuredClone(validCapture()));
    (capture.cases[0]!.retrieval.candidates[0] as any).note = "Customer says the editor fails after chunk loading";

    for (const captureCase of capture.cases) refreshCaseInputHash(captureCase);
    rehashCapture(capture);
    expect(() => validateRankingCapture(capture)).toThrow(/cases\[0\]\.retrieval\.candidates\[0\]\.note/i);
  });

  it.each(["sourceId", "reason"] as const)("rejects a reference missing %s provenance", (field) => {
    const capture = structuredClone(validCapture());
    delete (capture.cases[0]!.retrieval.candidates[0]!.deterministicReferences[0] as any)[field];

    for (const captureCase of capture.cases) refreshCaseInputHash(captureCase);
    rehashCapture(capture);
    expect(() => validateRankingCapture(capture)).toThrow(new RegExp(`cases\\[0\\]\\.retrieval\\.candidates\\[0\\]\\.deterministicReferences\\[0\\]\\.${field}`));
  });

  it("accepts a capture model that is correctly bound to every B3 retrieval model", () => {
    expect(() => validateRankingCapture(modelledCapture())).not.toThrow();
  });

  it.each(["tag", "digest", "dimensions"] as const)("rejects a capture model %s mismatch against unchanged retrieval metadata", (field) => {
    const capture = modelledCapture();
    for (const model of [capture.identity.model, ...capture.cases.map((captureCase) => captureCase.model)]) {
      if (field === "dimensions") model!.dimensions = 2048;
      else model![field] = field === "tag" ? "other-model" : "other-revision";
    }

    rehashCapture(capture);
    expect(() => validateRankingCapture(capture)).toThrow(/model/i);
  });

  it("rejects a non-null capture model when the B3 retrieval metadata has no model", () => {
    const capture = structuredClone(validCapture());
    const model = { tag: "qwen3-embedding", digest: "qwen-revision", dimensions: 1024 };
    capture.identity.model = model;
    for (const captureCase of capture.cases) captureCase.model = { ...model };

    rehashCapture(capture);
    expect(() => validateRankingCapture(capture)).toThrow(/model/i);
  });

  it("writes once with exclusive creation and refuses overwrite", async () => {
    const root = await mkdtemp(join(tmpdir(), "b4-ranking-capture-"));
    const path = join(root, "capture.json");
    const capture = validCapture();
    try {
      await expect(writeRankingCaptureExclusive(path, capture)).resolves.toBeUndefined();
      await expect(readFile(path, "utf8")).resolves.toContain(capture.captureHash);
      await expect(writeRankingCaptureExclusive(path, capture)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
