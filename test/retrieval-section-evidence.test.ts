import { describe, expect, it } from "vitest";

import { scorePool } from "../src/retrieval/evaluation.js";
import { evaluateSectionEvidence } from "../src/retrieval/section-evidence.js";
import type { SectionBinding } from "../src/retrieval/readiness-cases.js";
import type { Candidate, Match, ResourceKey } from "../src/retrieval/types.js";

const key = "knowledge-article:performance-troubleshooting" as const;
const otherKey = "knowledge-article:other" as const;

function semanticCandidate(matches: readonly Match[]): Candidate {
  return {
    resourceKey: key,
    resourceType: "knowledge-article",
    deterministicReferences: [],
    knownCauseReferences: [],
    semantic: {
      bestRank: Math.min(...matches.map((match) => match.rank)),
      bestCosineSimilarity: Math.max(...matches.map((match) => match.score)),
      matches,
    },
  };
}

function lexicalCandidate(matches: readonly Match[]): Candidate {
  return {
    resourceKey: key,
    resourceType: "knowledge-article",
    deterministicReferences: [],
    knownCauseReferences: [],
    lexical: {
      bestRank: Math.min(...matches.map((match) => match.rank)),
      bestBm25Score: Math.min(...matches.map((match) => match.score)),
      matches,
    },
  };
}

function binding(
  representationIds: readonly string[],
  resourceKey: ResourceKey = key,
  heading = "Session checks",
): SectionBinding {
  return {
    resourceKey,
    sourceHash: "a".repeat(64),
    heading,
    representationIds: [...representationIds],
    rationale: "Supports isolation investigation.",
  };
}

describe("evaluateSectionEvidence", () => {
  it("keeps an article hit while identifying a better-ranked wrong semantic section", () => {
    const candidate = semanticCandidate([
      { resourceKey: key, representationId: "wrong", rank: 1, score: 0.9 },
      { resourceKey: key, representationId: "support", rank: 2, score: 0.4 },
    ]);

    expect(scorePool([candidate.resourceKey], {
      requiredResourceKeys: [key],
      relevantResourceKeys: [key],
      hardNegativeResourceKeys: [],
      labelsComplete: false,
      resourceCoverage: {
        "knowledge-article": "adequate",
        "known-cause": "not-expected",
        "diagnostic-playbook": "missing",
        "resolved-ticket": "not-expected",
      },
    }).candidateRecall).toBe(1);
    expect(evaluateSectionEvidence({
      candidate,
      channel: "semantic",
      channelAvailable: true,
      bindings: [binding(["support"])],
    })).toEqual({
      status: "right-article-wrong-best-section",
      bestRepresentationId: "wrong",
      supportingMatchPresent: true,
    });
  });

  it("reports the best lexical section as supporting when BM25 is lowest", () => {
    expect(evaluateSectionEvidence({
      candidate: lexicalCandidate([
        { resourceKey: key, representationId: "wrong", rank: 2, score: 0.8 },
        { resourceKey: key, representationId: "support", rank: 1, score: 0.2 },
      ]),
      channel: "lexical",
      channelAvailable: true,
      bindings: [binding(["support"])],
    })).toEqual({
      status: "supporting-best-match",
      bestRepresentationId: "support",
      supportingMatchPresent: true,
    });
  });

  it("unions supporting representation IDs across useful sections for the article", () => {
    expect(evaluateSectionEvidence({
      candidate: semanticCandidate([
        { resourceKey: key, representationId: "second-support", rank: 1, score: 0.9 },
        { resourceKey: key, representationId: "first-support", rank: 2, score: 0.8 },
      ]),
      channel: "semantic",
      channelAvailable: true,
      bindings: [
        binding(["first-support"], key, "Session checks"),
        binding(["second-support"], key, "Follow-up checks"),
      ],
    })).toEqual({
      status: "supporting-best-match",
      bestRepresentationId: "second-support",
      supportingMatchPresent: true,
    });
  });

  it("uses representation ID to break equal semantic scores without changing matches", () => {
    const matches = Object.freeze([
      Object.freeze({ resourceKey: key, representationId: "z-wrong", rank: 1, score: 0.8 }),
      Object.freeze({ resourceKey: key, representationId: "a-support", rank: 2, score: 0.8 }),
    ]);
    const candidate = Object.freeze(semanticCandidate(matches));

    expect(evaluateSectionEvidence({
      candidate,
      channel: "semantic",
      channelAvailable: true,
      bindings: [binding(["a-support"])],
    })).toEqual({
      status: "supporting-best-match",
      bestRepresentationId: "a-support",
      supportingMatchPresent: true,
    });
    expect(candidate.semantic?.matches).toEqual(matches);
  });

  it("reports a wrong best section when no supporting representation matched", () => {
    expect(evaluateSectionEvidence({
      candidate: semanticCandidate([
        { resourceKey: key, representationId: "wrong", rank: 1, score: 0.9 },
      ]),
      channel: "semantic",
      channelAvailable: true,
      bindings: [binding(["support"])],
    })).toEqual({
      status: "right-article-wrong-best-section",
      bestRepresentationId: "wrong",
      supportingMatchPresent: false,
    });
  });

  it("treats an absent candidate or a reference-only candidate as missing for this channel", () => {
    const referenceOnly: Candidate = {
      resourceKey: key,
      resourceType: "knowledge-article",
      deterministicReferences: [{
        resourceKey: key,
        channel: "deterministic-reference",
        sourceId: "classifier",
        reason: "classifier-association",
      }],
      knownCauseReferences: [],
    };
    const input = { channel: "lexical" as const, channelAvailable: true, bindings: [binding(["support"])] };

    expect(evaluateSectionEvidence(input)).toEqual({
      status: "resource-missing",
      supportingMatchPresent: null,
    });
    expect(evaluateSectionEvidence({ ...input, candidate: referenceOnly })).toEqual({
      status: "resource-missing",
      supportingMatchPresent: null,
    });
  });

  it("gives an unavailable semantic channel precedence over otherwise available matches", () => {
    expect(evaluateSectionEvidence({
      candidate: semanticCandidate([
        { resourceKey: key, representationId: "support", rank: 1, score: 0.9 },
      ]),
      channel: "semantic",
      channelAvailable: false,
      bindings: [binding(["support"])],
    })).toEqual({
      status: "channel-unavailable",
      supportingMatchPresent: null,
    });
  });

  it("leaves an article section unjudged when it has no bindings", () => {
    expect(evaluateSectionEvidence({
      candidate: lexicalCandidate([
        { resourceKey: key, representationId: "best", rank: 1, score: 0.2 },
      ]),
      channel: "lexical",
      channelAvailable: true,
      bindings: [binding(["support"], otherKey)],
    })).toEqual({
      status: "unjudged-section",
      bestRepresentationId: "best",
      supportingMatchPresent: null,
    });
  });
});
