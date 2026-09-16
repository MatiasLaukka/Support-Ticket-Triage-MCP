import { describe, expect, it } from "vitest";

import {
  deriveResourceRanks,
  RankingInputError,
  validateRankingInput,
} from "../src/retrieval/ranking.js";
import type { RankingInput } from "../src/retrieval/ranking-types.js";
import type {
  Candidate,
  ChannelState,
  Match,
  ResourceKey,
  ResourceType,
} from "../src/retrieval/types.js";

const outputLimits = {
  "knowledge-article": 5,
  "known-cause": 5,
  "diagnostic-playbook": 5,
  "resolved-ticket": 5,
} as const;

const metadata = {
  schemaVersion: 2,
  representationVersion: 3,
  generation: 7,
  lexicalGeneration: 7,
  semanticGeneration: 6,
  corpusHash: "corpus-hash",
  model: { id: "qwen3-embedding", revision: "0.6b", dimensions: 3 },
  state: "degraded" as const,
};

function match(
  resourceKey: ResourceKey,
  representationId: string,
  rank: number,
  score: number,
): Match {
  return { resourceKey, representationId, rank, score };
}

function candidate(
  resourceKey: ResourceKey,
  resourceType: ResourceType,
  channels: Pick<Candidate, "lexical" | "semantic">,
): Candidate {
  return {
    resourceKey,
    resourceType,
    ...channels,
    deterministicReferences: [],
    knownCauseReferences: [],
  };
}

function baseCandidates(): Candidate[] {
  const articleA = "knowledge-article:a" as const;
  const articleB = "knowledge-article:b" as const;
  const articleC = "knowledge-article:c" as const;
  return [
    candidate(articleA, "knowledge-article", {
      lexical: {
        bestRank: 4,
        bestBm25Score: 0.2,
        matches: [
          match(articleA, "a-lexical-4", 4, 0.2),
          match(articleA, "a-lexical-9", 9, 0.5),
        ],
      },
      semantic: {
        bestRank: 7,
        bestCosineSimilarity: 0.9,
        matches: [
          match(articleA, "a-semantic-7", 7, 0.9),
          match(articleA, "a-semantic-10", 10, 0.8),
        ],
      },
    }),
    candidate(articleB, "knowledge-article", {
      lexical: {
        bestRank: 9,
        bestBm25Score: 0.2,
        matches: [match(articleB, "b-lexical-9", 9, 0.2)],
      },
      semantic: {
        bestRank: 3,
        bestCosineSimilarity: 0.9,
        matches: [match(articleB, "b-semantic-3", 3, 0.9)],
      },
    }),
    candidate(articleC, "knowledge-article", {
      lexical: {
        bestRank: 15,
        bestBm25Score: 0.4,
        matches: [match(articleC, "c-lexical-15", 15, 0.4)],
      },
      semantic: {
        bestRank: 12,
        bestCosineSimilarity: 0.7,
        matches: [match(articleC, "c-semantic-12", 12, 0.7)],
      },
    }),
    candidate("known-cause:z", "known-cause", {
      lexical: {
        bestRank: 20,
        bestBm25Score: 0.1,
        matches: [match("known-cause:z", "z-lexical-20", 20, 0.1)],
      },
    }),
    candidate("resolved-ticket:r", "resolved-ticket", {
      semantic: {
        bestRank: 12,
        bestCosineSimilarity: 0.6,
        matches: [match("resolved-ticket:r", "r-semantic-12", 12, 0.6)],
      },
    }),
  ];
}

function baseInput(
  candidates: readonly Candidate[] = baseCandidates(),
  semantic: ChannelState = { status: "used" },
): RankingInput {
  return {
    contractVersion: 1,
    queryBasis: {
      queryHash: "query-hash",
      ticketId: "TKT-0001",
      ticketRevision: 4,
      customerReplyWatermark: "reply:r1",
    },
    retrieval: {
      metadata,
      lexical: { status: "used" },
      semantic,
      candidates,
      referenceDiagnostics: [],
    },
    outputLimits,
  };
}

describe("B4 resource rank derivation", () => {
  it("derives dense independent per-type ranks from raw representation ranks", () => {
    const derived = deriveResourceRanks(baseInput());

    expect(derived["knowledge-article"].lexical.map(({ resourceKey, resourceRank }) => [resourceKey, resourceRank])).toEqual([
      ["knowledge-article:a", 1],
      ["knowledge-article:b", 2],
      ["knowledge-article:c", 3],
    ]);
    expect(derived["knowledge-article"].semantic.map(({ resourceKey, resourceRank }) => [resourceKey, resourceRank])).toEqual([
      ["knowledge-article:a", 1],
      ["knowledge-article:b", 2],
      ["knowledge-article:c", 3],
    ]);
    expect(derived["known-cause"].lexical[0]).toMatchObject({ resourceKey: "known-cause:z", resourceRank: 1, bestRepresentationRank: 20 });
    expect(derived["resolved-ticket"].semantic[0]).toMatchObject({ resourceKey: "resolved-ticket:r", resourceRank: 1, bestRepresentationRank: 12 });
  });

  it("retains all representation provenance while assigning one rank per resource", () => {
    const derived = deriveResourceRanks(baseInput());

    expect(derived["knowledge-article"].lexical[0]).toMatchObject({
      resourceKey: "knowledge-article:a",
      bestScore: 0.2,
      bestRepresentationRank: 4,
      matchedRepresentationIds: ["a-lexical-4", "a-lexical-9"],
    });
  });

  it("uses the ordinal resource key for equal scores in either channel", () => {
    const derived = deriveResourceRanks(baseInput());

    expect(derived["knowledge-article"].lexical.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:a",
      "knowledge-article:b",
      "knowledge-article:c",
    ]);
    expect(derived["knowledge-article"].semantic.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:a",
      "knowledge-article:b",
      "knowledge-article:c",
    ]);
  });

  it("does not depend on candidate input order or mutate the input", () => {
    const input = baseInput();
    const before = structuredClone(input);
    const permutation = baseInput([...input.retrieval.candidates].reverse());

    expect(deriveResourceRanks(input)).toEqual(deriveResourceRanks(permutation));
    expect(input).toEqual(before);
  });

  it("accepts a healthy channel with no matches", () => {
    const input = baseInput(baseCandidates().map(({ semantic: _semantic, ...rest }) => rest), { status: "used" });

    expect(() => validateRankingInput(input)).not.toThrow();
    expect(deriveResourceRanks(input)["knowledge-article"].semantic).toEqual([]);
  });

  it.each([
    ["duplicate resource keys", (input: RankingInput) => ({ ...input, retrieval: { ...input.retrieval, candidates: [...input.retrieval.candidates, input.retrieval.candidates[0]!] } })],
    ["resource key and type mismatch", (input: RankingInput) => ({ ...input, retrieval: { ...input.retrieval, candidates: [{ ...input.retrieval.candidates[0]!, resourceType: "known-cause" as const }, ...input.retrieval.candidates.slice(1)] } })],
    ["cross-resource representation IDs", (input: RankingInput) => {
      const first = input.retrieval.candidates[0]!;
      const second = input.retrieval.candidates[1]!;
      const lexical = second.lexical!;
      return {
        ...input,
        retrieval: {
          ...input.retrieval,
          candidates: [
            first,
            { ...second, lexical: { ...lexical, matches: [...lexical.matches, { ...lexical.matches[0]!, resourceKey: second.resourceKey, representationId: first.lexical!.matches[0]!.representationId }] } },
            ...input.retrieval.candidates.slice(2),
          ],
        },
      };
    }],
    ["nonfinite scores", (input: RankingInput) => {
      const first = input.retrieval.candidates[0]!;
      const lexical = first.lexical!;
      return {
        ...input,
        retrieval: {
          ...input.retrieval,
          candidates: [{ ...first, lexical: { ...lexical, matches: [{ ...lexical.matches[0]!, score: Number.NaN }, ...lexical.matches.slice(1)] } }, ...input.retrieval.candidates.slice(1)],
        },
      };
    }],
    ["contradictory best-score metadata", (input: RankingInput) => {
      const first = input.retrieval.candidates[0]!;
      return {
        ...input,
        retrieval: {
          ...input.retrieval,
          candidates: [{ ...first, lexical: { ...first.lexical!, bestBm25Score: 0.3 } }, ...input.retrieval.candidates.slice(1)],
        },
      };
    }],
    ["matches on an unusable channel", (input: RankingInput) => ({
      ...input,
      retrieval: { ...input.retrieval, semantic: { status: "unavailable", reason: "provider-not-configured" }, },
    })],
  ] as const)("rejects $0 with a typed ranking-input error", (_name, mutate) => {
    expect(() => validateRankingInput(mutate(baseInput()) as RankingInput)).toThrowError(RankingInputError);
  });
});
