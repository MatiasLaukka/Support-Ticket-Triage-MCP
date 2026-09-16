import { describe, expect, it } from "vitest";

import {
  deriveResourceRanks,
  rankRetrieval,
  RankingInputError,
  validateRankingInput,
} from "../src/retrieval/ranking.js";
import type { RankingInput, RankingPolicy } from "../src/retrieval/ranking-types.js";
import type {
  Candidate,
  ChannelState,
  Match,
  Reference,
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

function reference(resourceKey: ResourceKey, channel: Reference["channel"], sourceId: string, reason: Reference["reason"], sourceVersion?: string): Reference {
  return { resourceKey, channel, sourceId, reason, ...(sourceVersion ? { sourceVersion } : {}) };
}

function rankingPolicy(policy: RankingPolicy): RankingPolicy {
  return policy;
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

describe("B4 ranking policies", () => {
  it("keeps lexical-only and semantic-only as independent first-class policies", () => {
    const lexical = rankRetrieval(baseInput(), rankingPolicy({ id: "lexical-only-v1", kind: "lexical-only" }));
    const semantic = rankRetrieval(baseInput(), rankingPolicy({ id: "semantic-only-v1", kind: "semantic-only" }));

    expect(lexical.byType["knowledge-article"].memberships.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:a",
      "knowledge-article:b",
      "knowledge-article:c",
    ]);
    expect(lexical.byType["resolved-ticket"].memberships).toEqual([]);
    expect(lexical.byType["knowledge-article"].memberships[0]).toMatchObject({
      selectedChannel: "lexical",
      selectedRawScore: 0.2,
      lexicalResourceRank: 1,
      rrfScore: null,
      contributions: [],
    });
    expect(semantic.byType["knowledge-article"].memberships.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:a",
      "knowledge-article:b",
      "knowledge-article:c",
    ]);
    expect(semantic.byType["known-cause"].memberships).toEqual([]);
    expect(semantic.byType["resolved-ticket"].memberships[0]).toMatchObject({
      selectedChannel: "semantic",
      selectedRawScore: 0.6,
      semanticResourceRank: 1,
      rrfScore: null,
      contributions: [],
    });
  });

  it.each([10, 30, 60] as const)("uses RRF constant %s once per channel and resource", (constant) => {
    const result = rankRetrieval(baseInput(), rankingPolicy({ id: "rrf-equal-v1", kind: "rrf-equal", constant }));
    const first = result.byType["knowledge-article"].memberships[0]!;

    expect(result.policy).toEqual({ id: "rrf-equal-v1", kind: "rrf-equal", constant });
    expect(first.contributions).toEqual([
      { channel: "lexical", resourceRank: 1, contribution: 1 / (constant + 1) },
      { channel: "semantic", resourceRank: 1, contribution: 1 / (constant + 1) },
    ]);
    expect(first.rrfScore).toBe(2 / (constant + 1));
    expect(first.contributions).toHaveLength(2);
  });

  it("preserves one-channel RRF order and distinguishes healthy-empty from unavailable channels", () => {
    const lexicalCandidates = baseCandidates().map(({ semantic: _semantic, ...candidateWithoutSemantic }) => candidateWithoutSemantic);
    const healthyEmpty = rankRetrieval(baseInput(lexicalCandidates, { status: "used" }), { id: "rrf-equal-v1", kind: "rrf-equal", constant: 10 });
    const unavailable = rankRetrieval(baseInput(lexicalCandidates, { status: "unavailable", reason: "provider-not-configured" }), { id: "rrf-equal-v1", kind: "rrf-equal", constant: 10 });

    expect(healthyEmpty.byType["knowledge-article"].memberships.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:a",
      "knowledge-article:b",
      "knowledge-article:c",
    ]);
    expect(healthyEmpty.byType["knowledge-article"].memberships[0]!.contributions).toEqual([
      { channel: "lexical", resourceRank: 1, contribution: 1 / 11 },
    ]);
    expect(healthyEmpty.channelSummary.semantic).toEqual({ status: "used", reason: null, candidateCount: 0, partial: false });
    expect(unavailable.channelSummary.semantic).toEqual({ status: "unavailable", reason: "provider-not-configured", candidateCount: 0, partial: false });
    expect(unavailable.channelSummary.contributingChannels).toEqual(["lexical"]);
  });

  it("retains compatible partial semantic matches while marking partial coverage", () => {
    const result = rankRetrieval(baseInput(undefined, { status: "stale", reason: "pending-vectors" }), { id: "rrf-equal-v1", kind: "rrf-equal", constant: 30 });

    expect(result.channelSummary.semantic).toMatchObject({ status: "stale", reason: "pending-vectors", partial: true, candidateCount: 4 });
    expect(result.channelSummary.partialSemanticCoverage).toBe(true);
    expect(result.channelSummary.contributingChannels).toEqual(["lexical", "semantic"]);
    expect(result.byType["resolved-ticket"].memberships[0]!.contributions).toEqual([
      { channel: "semantic", resourceRank: 1, contribution: 1 / 31 },
    ]);
  });

  it.each([
    ["stale model", { status: "stale", reason: "model-version-changed" }],
    ["unavailable", { status: "unavailable", reason: "provider-not-configured" }],
    ["failed", { status: "failed", reason: "provider-http-error" }],
  ] as const)("does not contribute semantic matches when the channel is %s", (_name, semantic) => {
    const lexicalCandidates = baseCandidates().map(({ semantic: _semantic, ...candidateWithoutSemantic }) => candidateWithoutSemantic);
    const result = rankRetrieval(baseInput(lexicalCandidates, semantic), { id: "rrf-equal-v1", kind: "rrf-equal", constant: 60 });

    expect(result.channelSummary.semantic).toMatchObject({ status: semantic.status, reason: semantic.reason, candidateCount: 0, partial: false });
    expect(result.channelSummary.contributingChannels).toEqual(["lexical"]);
    expect(result.byType["resolved-ticket"].memberships).toEqual([]);
  });

  it("sorts by exact unrounded RRF score and then by ordinal resource key", () => {
    const articleA = "knowledge-article:a" as const;
    const articleB = "knowledge-article:b" as const;
    const candidates = [
      candidate(articleB, "knowledge-article", { semantic: { bestRank: 1, bestCosineSimilarity: 0.8, matches: [match(articleB, "b-semantic", 1, 0.8)] } }),
      candidate(articleA, "knowledge-article", { lexical: { bestRank: 1, bestBm25Score: 0.123456789, matches: [match(articleA, "a-lexical", 1, 0.123456789)] } }),
    ];
    const result = rankRetrieval(baseInput(candidates), { id: "rrf-equal-v1", kind: "rrf-equal", constant: 10 });

    expect(result.byType["knowledge-article"].memberships.map(({ resourceKey }) => resourceKey)).toEqual([articleA, articleB]);
    expect(result.byType["knowledge-article"].memberships.map(({ rrfScore }) => rrfScore)).toEqual([1 / 11, 1 / 11]);
  });

  it("returns an identical fresh canonical result for equivalent candidate and evidence permutations", () => {
    const input = structuredClone(baseInput());
    const first = input.retrieval.candidates[0]!;
    first.deterministicReferences = [
      reference(first.resourceKey, "deterministic-reference", "classifier:z", "classifier-association"),
      reference(first.resourceKey, "deterministic-reference", "classifier:a", "safety-inclusion"),
    ];
    first.knownCauseReferences = [
      reference(first.resourceKey, "known-cause-reference", "cause:z", "known-cause-link", "v2"),
      reference(first.resourceKey, "known-cause-reference", "cause:a", "known-cause-link", "v1"),
    ];
    first.taxonomy = { productSurfaces: ["webhooks", "editor"], problemClasses: ["latency", "configuration"] };
    const before = structuredClone(input);
    const reorderedCandidates = [...input.retrieval.candidates].map((candidate) => ({
      ...candidate,
      ...(candidate.lexical ? { lexical: { ...candidate.lexical, matches: [...candidate.lexical.matches].reverse() } } : {}),
      ...(candidate.semantic ? { semantic: { ...candidate.semantic, matches: [...candidate.semantic.matches].reverse() } } : {}),
      deterministicReferences: [...candidate.deterministicReferences].reverse(),
      knownCauseReferences: [...candidate.knownCauseReferences].reverse(),
      ...(candidate.taxonomy ? { taxonomy: { productSurfaces: [...candidate.taxonomy.productSurfaces].reverse(), problemClasses: [...candidate.taxonomy.problemClasses].reverse() } } : {}),
    })).reverse();
    const policy = { id: "rrf-equal-v1", kind: "rrf-equal", constant: 10 } as const;
    const original = rankRetrieval(input, policy);
    const reordered = rankRetrieval({ ...input, retrieval: { ...input.retrieval, candidates: reorderedCandidates } }, policy);

    expect(reordered.inputHash).toBe(original.inputHash);
    expect(reordered).toEqual(original);
    expect(input).toEqual(before);
    expect(original.candidates).not.toBe(input.retrieval.candidates);
    expect(original.candidates[0]).not.toBe(input.retrieval.candidates[0]);
    expect(original).toMatchObject({
      tieBreak: "ordinal-resource-key",
      retrievalIdentity: {
        schemaVersion: 2,
        representationVersion: 3,
        generation: 7,
        lexicalGeneration: 7,
        semanticGeneration: 6,
        corpusHash: "corpus-hash",
        model: metadata.model,
      },
    });
  });

  it("ranks the full pool before applying zero, top-N, and oversized limits without padding", () => {
    const limited = rankRetrieval({ ...baseInput(), outputLimits: { ...outputLimits, "knowledge-article": 2 } }, { id: "lexical-only-v1", kind: "lexical-only" });
    const zero = rankRetrieval({ ...baseInput(), outputLimits: { ...outputLimits, "knowledge-article": 0 } }, { id: "lexical-only-v1", kind: "lexical-only" });
    const oversized = rankRetrieval({ ...baseInput(), outputLimits: { ...outputLimits, "knowledge-article": 99 } }, { id: "lexical-only-v1", kind: "lexical-only" });

    expect(limited.byType["knowledge-article"]).toMatchObject({ poolCount: 3, returnedCount: 2, omittedCount: 1 });
    expect(limited.byType["knowledge-article"].memberships).toHaveLength(2);
    expect(zero.byType["knowledge-article"]).toMatchObject({ poolCount: 3, returnedCount: 0, omittedCount: 3, memberships: [] });
    expect(oversized.byType["knowledge-article"]).toMatchObject({ poolCount: 3, returnedCount: 3, omittedCount: 0 });
  });

  it("keeps references separate, deduplicated, stably ordered, and diagnostic-preserving", () => {
    const articleA = "knowledge-article:a" as const;
    const referenceOnly = "knowledge-article:reference-only" as const;
    const input = baseInput([
      {
        ...baseCandidates()[0]!,
        deterministicReferences: [
          reference(articleA, "deterministic-reference", "classifier", "classifier-association"),
          reference(articleA, "deterministic-reference", "classifier", "classifier-association"),
        ],
        knownCauseReferences: [reference(articleA, "known-cause-reference", "cause:v2", "known-cause-link", "v2")],
      },
      {
        resourceKey: referenceOnly,
        resourceType: "knowledge-article",
        deterministicReferences: [reference(referenceOnly, "deterministic-reference", "classifier", "safety-inclusion")],
        knownCauseReferences: [],
      },
      ...baseCandidates().slice(1),
    ]);
    const result = rankRetrieval({ ...input, retrieval: { ...input.retrieval, referenceDiagnostics: [{ resourceKey: "known-cause:missing", channel: "known-cause-reference", reason: "missing-resource" }] } }, { id: "lexical-only-v1", kind: "lexical-only" });

    expect(result.byType["knowledge-article"].poolCount).toBe(3);
    expect(result.byType["knowledge-article"].memberships.map(({ resourceKey }) => resourceKey)).toEqual([articleA, "knowledge-article:b", "knowledge-article:c"]);
    expect(result.references).toEqual([
      { resourceKey: articleA, resourceType: "knowledge-article", provenance: [
        reference(articleA, "deterministic-reference", "classifier", "classifier-association"),
        reference(articleA, "known-cause-reference", "cause:v2", "known-cause-link", "v2"),
      ] },
      { resourceKey: referenceOnly, resourceType: "knowledge-article", provenance: [reference(referenceOnly, "deterministic-reference", "classifier", "safety-inclusion")] },
    ]);
    expect(result.referenceDiagnostics).toEqual([{ resourceKey: "known-cause:missing", channel: "known-cause-reference", reason: "missing-resource" }]);
    expect(result.candidates.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:a",
      "knowledge-article:b",
      "knowledge-article:c",
      "knowledge-article:reference-only",
      "known-cause:z",
      "resolved-ticket:r",
    ]);
  });
});
