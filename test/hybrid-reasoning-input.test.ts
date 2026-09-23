import { describe, expect, it } from "vitest";

import type {
  CustomerReplyWatermark,
  Ticket,
} from "../src/domain.js";
import { assembleHybridReasoningInput } from "../src/reasoning/input-assembler.js";
import type { RetrievalExecution } from "../src/retrieval/execution.js";
import type { Candidate, IndexMetadata, RetrievalResult } from "../src/retrieval/types.js";
import type { RankingResult } from "../src/retrieval/ranking-types.js";

const ticket = { id: "TKT-0101", revision: 7 } satisfies Pick<Ticket, "id" | "revision">;
const customerReplyWatermark: CustomerReplyWatermark = {
  state: "reply",
  timestamp: "2026-09-20T12:30:00.000Z",
  id: "16c7a638-e7df-40bc-a4ef-2e839c575442",
};

const indexMetadata: IndexMetadata = {
  schemaVersion: 3,
  representationVersion: 2,
  generation: 11,
  lexicalGeneration: 11,
  semanticGeneration: 10,
  corpusHash: "corpus-hash-11",
  model: { id: "embedding-model", revision: "2026-09", dimensions: 3 },
  state: "degraded",
};

function candidate(resourceKey: Candidate["resourceKey"], sourceId: string): Candidate {
  const representationId = `${resourceKey}/summary`;
  return {
    resourceKey,
    resourceType: "knowledge-article",
    lexical: {
      bestRank: 1,
      bestBm25Score: -1.2,
      matches: [{ representationId, resourceKey, score: -1.2, rank: 1 }],
    },
    deterministicReferences: [{
      resourceKey,
      channel: "deterministic-reference",
      sourceId,
      sourceVersion: "4",
      reason: "classifier-association",
    }],
    knownCauseReferences: [],
  };
}

const retrievalResult: RetrievalResult = {
  metadata: indexMetadata,
  lexical: { status: "used" },
  semantic: { status: "unavailable", reason: "provider-not-configured" },
  candidates: [
    candidate("knowledge-article:delivery-delay", "article-delivery"),
    candidate("knowledge-article:profile-timeline", "article-timeline"),
  ],
  referenceDiagnostics: [],
};

function input(
  mode: "evaluation" | "diagnosis" = "evaluation",
  ranking: RetrievalExecution["ranking"] = { status: "not-requested" },
) {
  return {
    mode,
    ticket,
    customerReplyWatermark,
    retrievalExecution: { retrieval: retrievalResult, ranking },
  };
}

describe("hybrid reasoning input assembler", () => {
  it("returns deeply equal inputs when assembled repeatedly from the same runtime data", () => {
    const source = input();

    expect(assembleHybridReasoningInput(source)).toEqual(
      assembleHybridReasoningInput(source),
    );
  });

  it("preserves authoritative ticket IDs, revisions, reply watermark, and retrieval identity", () => {
    const result = assembleHybridReasoningInput(input());

    expect(result.basis).toEqual({
      ticketId: ticket.id,
      ticketRevision: ticket.revision,
      customerReplyWatermark,
      retrievalIndex: indexMetadata,
    });
  });

  it("carries a successful ranking result through unchanged", () => {
    const ranking = {
      status: "succeeded",
      result: { contractVersion: 1, byType: { "knowledge-article": { memberships: [
        { resourceKey: "knowledge-article:profile-timeline", position: 1 },
        { resourceKey: "knowledge-article:delivery-delay", position: 2 },
      ] } } } as unknown as RankingResult,
      durationMs: 8,
    } satisfies RetrievalExecution["ranking"];

    expect(assembleHybridReasoningInput(input("evaluation", ranking)).ranking).toEqual(ranking);
  });

  it("preserves an explicitly unrequested ranking without adding ranking output", () => {
    const result = assembleHybridReasoningInput(input("evaluation", { status: "not-requested" }));

    expect(result.ranking).toEqual({ status: "not-requested" });
    expect(result).not.toHaveProperty("rankedHypotheses");
  });

  it("preserves ranking failure without creating synthetic ranking data", () => {
    const error = Object.assign(new Error("ranking unavailable"), { code: "RANKING_FAILED" });
    const ranking = { status: "failed", error, durationMs: 13 } satisfies RetrievalExecution["ranking"];
    const result = assembleHybridReasoningInput(input("evaluation", ranking));

    expect(result.ranking).toEqual(ranking);
    expect(result.ranking).toHaveProperty("error", error);
    expect(result.ranking).not.toHaveProperty("result");
  });

  it("keeps separate evidence identities and source provenance for each candidate", () => {
    const result = assembleHybridReasoningInput(input());

    expect(result.observations.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:delivery-delay",
      "knowledge-article:profile-timeline",
    ]);
    expect(result.observations.map(({ deterministicReferences }) =>
      deterministicReferences.map(({ sourceId, sourceVersion }) => ({ sourceId, sourceVersion })),
    )).toEqual([
      [{ sourceId: "article-delivery", sourceVersion: "4" }],
      [{ sourceId: "article-timeline", sourceVersion: "4" }],
    ]);
    expect(result.observations[0]).not.toHaveProperty("observedAt");
    expect(result.observations[0]).not.toHaveProperty("validAt");
    expect(result.observations[0]).not.toHaveProperty("freshnessPolicy");
    expect(result.observations[0]).not.toHaveProperty("expiresAt");
  });

  it("does not mutate runtime context or retrieval execution", () => {
    const source = input();
    const before = structuredClone(source);

    assembleHybridReasoningInput(source);

    expect(source).toEqual(before);
  });

  it("keeps evaluation and diagnosis as distinguishable input modes", () => {
    const evaluation = assembleHybridReasoningInput(input("evaluation"));
    const diagnosis = assembleHybridReasoningInput(input("diagnosis"));

    expect(evaluation.mode).toBe("evaluation");
    expect(diagnosis.mode).toBe("diagnosis");
    expect(evaluation).not.toEqual(diagnosis);
  });
});
