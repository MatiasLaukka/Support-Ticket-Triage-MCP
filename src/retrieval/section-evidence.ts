import type { SectionBinding } from "./readiness-cases.js";
import type { Candidate, Match } from "./types.js";

export type SectionEvidenceResult = {
  status: "supporting-best-match" | "right-article-wrong-best-section"
    | "unjudged-section" | "resource-missing" | "channel-unavailable";
  bestRepresentationId?: string;
  supportingMatchPresent: boolean | null;
};

export function evaluateSectionEvidence(input: {
  candidate?: Candidate;
  channel: "lexical" | "semantic";
  channelAvailable: boolean;
  bindings: readonly SectionBinding[];
}): SectionEvidenceResult {
  if (!input.channelAvailable) {
    return { status: "channel-unavailable", supportingMatchPresent: null };
  }

  const matches = input.channel === "lexical"
    ? input.candidate?.lexical?.matches
    : input.candidate?.semantic?.matches;
  if (!input.candidate || !matches || matches.length === 0) {
    return { status: "resource-missing", supportingMatchPresent: null };
  }

  const bestMatch = selectBestMatch(matches, input.channel);
  const supportingRepresentationIds = new Set<string>();
  for (const binding of input.bindings) {
    if (binding.resourceKey !== input.candidate.resourceKey) continue;
    for (const representationId of binding.representationIds) {
      supportingRepresentationIds.add(representationId);
    }
  }

  if (supportingRepresentationIds.size === 0) {
    return {
      status: "unjudged-section",
      bestRepresentationId: bestMatch.representationId,
      supportingMatchPresent: null,
    };
  }

  const supportingMatchPresent = matches.some((match) =>
    supportingRepresentationIds.has(match.representationId));
  return {
    status: supportingRepresentationIds.has(bestMatch.representationId)
      ? "supporting-best-match"
      : "right-article-wrong-best-section",
    bestRepresentationId: bestMatch.representationId,
    supportingMatchPresent,
  };
}

function selectBestMatch(
  matches: readonly Match[],
  channel: "lexical" | "semantic",
): Match {
  let bestMatch = matches[0]!;
  for (let index = 1; index < matches.length; index += 1) {
    const match = matches[index]!;
    const scoreDifference = channel === "lexical"
      ? match.score - bestMatch.score
      : bestMatch.score - match.score;
    if (scoreDifference < 0
      || (scoreDifference === 0
        && match.representationId.localeCompare(bestMatch.representationId) < 0)) {
      bestMatch = match;
    }
  }
  return bestMatch;
}
