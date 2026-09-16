import type { Candidate, ChannelState, Match, ResourceType } from "./types.js";
import type { DerivedChannelResourceRank, RankingInput } from "./ranking-types.js";

const RESOURCE_TYPES = ["knowledge-article", "known-cause", "diagnostic-playbook", "resolved-ticket"] as const satisfies readonly ResourceType[];

export class RankingInputError extends Error {
  readonly code = "INVALID_RANKING_INPUT" as const;

  constructor(message: string) {
    super(message);
    this.name = "RankingInputError";
  }
}

function fail(message: string): never {
  throw new RankingInputError(message);
}

function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && (RESOURCE_TYPES as readonly string[]).includes(value);
}

function isUsableChannel(channel: ChannelState, name: "lexical" | "semantic"): boolean {
  return channel.status === "used" || (name === "semantic" && channel.status === "stale" && channel.reason === "pending-vectors");
}

function validateMatch(match: Match, candidate: Candidate, seenRepresentationIds: Map<string, string>): void {
  if (!match || typeof match !== "object") fail(`Candidate ${candidate.resourceKey} contains an invalid match.`);
  if (match.resourceKey !== candidate.resourceKey) fail(`Match ${match.representationId} crosses resource ${candidate.resourceKey}.`);
  if (typeof match.representationId !== "string" || match.representationId.length === 0) fail(`Candidate ${candidate.resourceKey} contains a match without a representation ID.`);
  if (!Number.isFinite(match.score)) fail(`Match ${match.representationId} has a nonfinite score.`);
  if (!Number.isSafeInteger(match.rank) || match.rank < 1) fail(`Match ${match.representationId} has an invalid representation rank.`);
  const previousResource = seenRepresentationIds.get(match.representationId);
  if (previousResource !== undefined && previousResource !== candidate.resourceKey) fail(`Representation ${match.representationId} belongs to multiple resources.`);
  seenRepresentationIds.set(match.representationId, candidate.resourceKey);
}

function validateChannel(
  candidate: Candidate,
  channel: "lexical" | "semantic",
  state: ChannelState,
  seenRepresentationIds: Map<string, string>,
): void {
  const value = candidate[channel];
  if (value === undefined) return;
  if (!isUsableChannel(state, channel)) fail(`Candidate ${candidate.resourceKey} has matches on unusable ${channel} channel.`);
  if (!Number.isSafeInteger(value.bestRank) || value.bestRank < 1) fail(`Candidate ${candidate.resourceKey} has an invalid ${channel} best rank.`);
  const recordedScore = channel === "lexical" ? candidate.lexical!.bestBm25Score : candidate.semantic!.bestCosineSimilarity;
  if (!Number.isFinite(recordedScore)) fail(`Candidate ${candidate.resourceKey} has a nonfinite ${channel} best score.`);
  if (!Array.isArray(value.matches) || value.matches.length === 0) fail(`Candidate ${candidate.resourceKey} has an empty ${channel} match group.`);
  for (const match of value.matches) validateMatch(match, candidate, seenRepresentationIds);
  const bestRank = Math.min(...value.matches.map((match) => match.rank));
  const bestScore = channel === "lexical" ? Math.min(...value.matches.map((match) => match.score)) : Math.max(...value.matches.map((match) => match.score));
  if (value.bestRank !== bestRank || recordedScore !== bestScore) fail(`Candidate ${candidate.resourceKey} has contradictory ${channel} best-match metadata.`);
}

export function validateRankingInput(input: RankingInput): void {
  if (!input || typeof input !== "object") fail("Ranking input must be an object.");
  if (input.contractVersion !== 1) fail("Unsupported ranking contract version.");
  if (!input.queryBasis || typeof input.queryBasis.queryHash !== "string" || typeof input.queryBasis.ticketId !== "string" || !Number.isSafeInteger(input.queryBasis.ticketRevision) || input.queryBasis.ticketRevision < 0 || (input.queryBasis.customerReplyWatermark !== null && typeof input.queryBasis.customerReplyWatermark !== "string")) fail("Ranking query basis is invalid.");
  for (const resourceType of RESOURCE_TYPES) {
    const limit = input.outputLimits?.[resourceType];
    if (!Number.isSafeInteger(limit) || limit < 0) fail(`Ranking output limit for ${resourceType} must be a non-negative safe integer.`);
  }
  if (!input.retrieval || !Array.isArray(input.retrieval.candidates)) fail("Ranking retrieval result is invalid.");
  const seenResourceKeys = new Set<string>();
  const seenRepresentationIds = new Map<string, string>();
  for (const candidate of input.retrieval.candidates) {
    if (!candidate || typeof candidate !== "object" || typeof candidate.resourceKey !== "string" || !isResourceType(candidate.resourceType) || !candidate.resourceKey.startsWith(`${candidate.resourceType}:`)) fail("Candidate resource key and type do not agree.");
    if (seenResourceKeys.has(candidate.resourceKey)) fail(`Duplicate candidate resource key ${candidate.resourceKey}.`);
    seenResourceKeys.add(candidate.resourceKey);
    validateChannel(candidate, "lexical", input.retrieval.lexical, seenRepresentationIds);
    validateChannel(candidate, "semantic", input.retrieval.semantic, seenRepresentationIds);
  }
}

function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deriveChannelRanks(
  candidates: readonly Candidate[],
  resourceType: ResourceType,
  channel: "lexical" | "semantic",
): readonly DerivedChannelResourceRank[] {
  return candidates
    .filter((candidate) => candidate.resourceType === resourceType && candidate[channel] !== undefined)
    .map((candidate) => {
      const value = candidate[channel]!;
      const matches = value.matches;
      const bestScore = channel === "lexical" ? candidate.lexical!.bestBm25Score : candidate.semantic!.bestCosineSimilarity;
      return {
        resourceKey: candidate.resourceKey,
        resourceType,
        channel,
        resourceRank: 0,
        bestScore,
        bestRepresentationRank: value.bestRank,
        matchedRepresentationIds: [...new Set(matches.map((match) => match.representationId))].sort(ordinalCompare),
      };
    })
    .sort((left, right) => (channel === "lexical" ? left.bestScore - right.bestScore : right.bestScore - left.bestScore) || ordinalCompare(left.resourceKey, right.resourceKey))
    .map((rank, index) => ({ ...rank, resourceRank: index + 1 }));
}

export function deriveResourceRanks(
  input: RankingInput,
): Readonly<Record<ResourceType, { lexical: readonly DerivedChannelResourceRank[]; semantic: readonly DerivedChannelResourceRank[] }>> {
  validateRankingInput(input);
  return Object.fromEntries(RESOURCE_TYPES.map((resourceType) => [
    resourceType,
    {
      lexical: deriveChannelRanks(input.retrieval.candidates, resourceType, "lexical"),
      semantic: deriveChannelRanks(input.retrieval.candidates, resourceType, "semantic"),
    },
  ])) as Readonly<Record<ResourceType, { lexical: readonly DerivedChannelResourceRank[]; semantic: readonly DerivedChannelResourceRank[] }>>;
}

export { RESOURCE_TYPES };
