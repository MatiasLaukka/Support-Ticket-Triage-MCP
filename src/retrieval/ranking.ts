import { createHash } from "node:crypto";
import type { Candidate, ChannelState, Match, Reference, ResourceType } from "./types.js";
import type {
  DerivedChannelResourceRank,
  RankedMembership,
  RankedTypeResult,
  RankingContribution,
  RankingInput,
  RankingPolicy,
  RankingResult,
  ReferenceMembership,
} from "./ranking-types.js";
import { RANKING_CONTRACT_VERSION, RANKING_TIE_BREAK } from "./ranking-types.js";

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

function compareMatches(left: Match, right: Match): number {
  return left.rank - right.rank
    || ordinalCompare(left.representationId, right.representationId)
    || ordinalCompare(left.resourceKey, right.resourceKey)
    || left.score - right.score;
}

function compareReferences(left: Reference, right: Reference): number {
  return ordinalCompare(left.channel, right.channel)
    || ordinalCompare(left.sourceId, right.sourceId)
    || ordinalCompare(left.sourceVersion ?? "", right.sourceVersion ?? "")
    || ordinalCompare(left.reason, right.reason)
    || ordinalCompare(left.resourceKey, right.resourceKey);
}

function canonicalReferences(references: readonly Reference[]): readonly Reference[] {
  return references.map((reference) => ({ ...reference })).sort(compareReferences);
}

function canonicalCandidateProjection(candidates: readonly Candidate[]): readonly Candidate[] {
  return candidates.map((candidate) => ({
    resourceKey: candidate.resourceKey,
    resourceType: candidate.resourceType,
    ...(candidate.lexical === undefined ? {} : {
      lexical: {
        bestRank: candidate.lexical.bestRank,
        bestBm25Score: candidate.lexical.bestBm25Score,
        matches: candidate.lexical.matches.map((match) => ({ ...match })).sort(compareMatches),
      },
    }),
    ...(candidate.semantic === undefined ? {} : {
      semantic: {
        bestRank: candidate.semantic.bestRank,
        bestCosineSimilarity: candidate.semantic.bestCosineSimilarity,
        matches: candidate.semantic.matches.map((match) => ({ ...match })).sort(compareMatches),
      },
    }),
    deterministicReferences: canonicalReferences(candidate.deterministicReferences),
    knownCauseReferences: canonicalReferences(candidate.knownCauseReferences),
    ...(candidate.taxonomy === undefined ? {} : {
      taxonomy: {
        productSurfaces: [...candidate.taxonomy.productSurfaces].sort(ordinalCompare),
        problemClasses: [...candidate.taxonomy.problemClasses].sort(ordinalCompare),
      },
    }),
  })).sort((left, right) => ordinalCompare(left.resourceKey, right.resourceKey));
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

function validatePolicy(policy: RankingPolicy): void {
  if (!policy || typeof policy !== "object") fail("Ranking policy must be an object.");
  if (policy.id === "lexical-only-v1" && policy.kind === "lexical-only") return;
  if (policy.id === "semantic-only-v1" && policy.kind === "semantic-only") return;
  if (policy.id === "rrf-equal-v1" && policy.kind === "rrf-equal" && (policy.constant === 10 || policy.constant === 30 || policy.constant === 60)) return;
  fail("Unsupported B4 ranking policy.");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize).sort((left, right) => ordinalCompare(JSON.stringify(left), JSON.stringify(right)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => ordinalCompare(left, right)).map(([key, nested]) => [key, canonicalize(nested)]));
  return value;
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function retrievalIdentity(input: RankingInput): RankingResult["retrievalIdentity"] {
  const { metadata } = input.retrieval;
  return {
    schemaVersion: metadata.schemaVersion,
    representationVersion: metadata.representationVersion,
    generation: metadata.generation,
    lexicalGeneration: metadata.lexicalGeneration,
    semanticGeneration: metadata.semanticGeneration,
    corpusHash: metadata.corpusHash,
    model: metadata.model ?? null,
    state: metadata.state,
  };
}

function channelSummary(input: RankingInput, ranks: Readonly<Record<ResourceType, { lexical: readonly DerivedChannelResourceRank[]; semantic: readonly DerivedChannelResourceRank[] }>>, policy: RankingPolicy): RankingResult["channelSummary"] {
  const lexicalCandidateCount = Object.values(ranks).reduce((count, byChannel) => count + byChannel.lexical.length, 0);
  const semanticCandidateCount = Object.values(ranks).reduce((count, byChannel) => count + byChannel.semantic.length, 0);
  const semanticPartial = input.retrieval.semantic.status === "stale" && input.retrieval.semantic.reason === "pending-vectors";
  const contributingChannels: ("lexical" | "semantic")[] = [];
  if (policy.kind !== "semantic-only" && lexicalCandidateCount > 0) contributingChannels.push("lexical");
  if (policy.kind !== "lexical-only" && semanticCandidateCount > 0) contributingChannels.push("semantic");
  return {
    lexical: { status: input.retrieval.lexical.status, reason: input.retrieval.lexical.reason ?? null, candidateCount: lexicalCandidateCount },
    semantic: { status: input.retrieval.semantic.status, reason: input.retrieval.semantic.reason ?? null, candidateCount: semanticCandidateCount, partial: semanticPartial },
    contributingChannels,
    partialSemanticCoverage: semanticPartial && semanticCandidateCount > 0,
  };
}

function referenceProjection(input: RankingInput): readonly ReferenceMembership[] {
  const byResource = new Map<string, { resourceType: ResourceType; provenance: Map<string, Candidate["deterministicReferences"][number]> }>();
  for (const candidate of input.retrieval.candidates) {
    const existing = byResource.get(candidate.resourceKey) ?? { resourceType: candidate.resourceType, provenance: new Map() };
    for (const provenance of [...candidate.deterministicReferences, ...candidate.knownCauseReferences]) existing.provenance.set(canonicalHash(provenance), provenance);
    byResource.set(candidate.resourceKey, existing);
  }
  return [...byResource.entries()]
    .filter(([, value]) => value.provenance.size > 0)
    .sort(([left], [right]) => ordinalCompare(left, right))
    .map(([resourceKey, value]) => ({
      resourceKey,
      resourceType: value.resourceType,
      provenance: canonicalReferences([...value.provenance.values()]),
    }));
}

function byResource(ranks: readonly DerivedChannelResourceRank[]): Map<string, DerivedChannelResourceRank> {
  return new Map(ranks.map((rank) => [rank.resourceKey, rank]));
}

function policyMemberships(
  resourceType: ResourceType,
  ranks: { lexical: readonly DerivedChannelResourceRank[]; semantic: readonly DerivedChannelResourceRank[] },
  policy: RankingPolicy,
): readonly RankedMembership[] {
  const lexicalByResource = byResource(ranks.lexical);
  const semanticByResource = byResource(ranks.semantic);
  const keys = new Set<string>();
  if (policy.kind === "lexical-only") for (const rank of ranks.lexical) keys.add(rank.resourceKey);
  if (policy.kind === "semantic-only") for (const rank of ranks.semantic) keys.add(rank.resourceKey);
  if (policy.kind === "rrf-equal") for (const rank of [...ranks.lexical, ...ranks.semantic]) keys.add(rank.resourceKey);

  const memberships = [...keys].map((resourceKey) => {
    const lexical = lexicalByResource.get(resourceKey);
    const semantic = semanticByResource.get(resourceKey);
    const contributions: RankingContribution[] = [];
    if (policy.kind === "rrf-equal") {
      if (lexical) contributions.push({ channel: "lexical", resourceRank: lexical.resourceRank, contribution: 1 / (policy.constant + lexical.resourceRank) });
      if (semantic) contributions.push({ channel: "semantic", resourceRank: semantic.resourceRank, contribution: 1 / (policy.constant + semantic.resourceRank) });
    }
    const selected = policy.kind === "lexical-only" ? lexical : policy.kind === "semantic-only" ? semantic : undefined;
    return {
      resourceKey,
      resourceType,
      position: 0,
      lexicalResourceRank: lexical?.resourceRank ?? null,
      semanticResourceRank: semantic?.resourceRank ?? null,
      selectedChannel: selected ? (policy.kind === "lexical-only" ? "lexical" : "semantic") : null,
      selectedRawScore: selected?.bestScore ?? null,
      rrfScore: policy.kind === "rrf-equal" ? contributions.reduce((score, contribution) => score + contribution.contribution, 0) : null,
      contributions,
    } satisfies RankedMembership;
  });

  memberships.sort((left, right) => {
    if (policy.kind === "lexical-only") return lexicalByResource.get(left.resourceKey)!.resourceRank - lexicalByResource.get(right.resourceKey)!.resourceRank;
    if (policy.kind === "semantic-only") return semanticByResource.get(left.resourceKey)!.resourceRank - semanticByResource.get(right.resourceKey)!.resourceRank;
    return right.rrfScore! - left.rrfScore! || ordinalCompare(left.resourceKey, right.resourceKey);
  });
  return memberships;
}

function rankedTypeResult(
  input: RankingInput,
  resourceType: ResourceType,
  ranks: { lexical: readonly DerivedChannelResourceRank[]; semantic: readonly DerivedChannelResourceRank[] },
  policy: RankingPolicy,
): RankedTypeResult {
  const pool = policyMemberships(resourceType, ranks, policy);
  const limit = input.outputLimits[resourceType];
  const memberships = pool.slice(0, limit).map((membership, index) => ({ ...membership, position: index + 1 }));
  return {
    resourceType,
    poolCount: pool.length,
    returnedCount: memberships.length,
    omittedCount: pool.length - memberships.length,
    memberships,
  };
}

export function rankRetrieval(input: RankingInput, policy: RankingPolicy): RankingResult {
  validatePolicy(policy);
  const ranks = deriveResourceRanks(input);
  return {
    contractVersion: RANKING_CONTRACT_VERSION,
    policy,
    tieBreak: RANKING_TIE_BREAK,
    queryBasis: input.queryBasis,
    inputHash: canonicalHash(input),
    retrievalIdentity: retrievalIdentity(input),
    channelSummary: channelSummary(input, ranks, policy),
    byType: Object.fromEntries(RESOURCE_TYPES.map((resourceType) => [resourceType, rankedTypeResult(input, resourceType, ranks[resourceType], policy)])) as Readonly<Record<ResourceType, RankedTypeResult>>,
    references: referenceProjection(input),
    referenceDiagnostics: input.retrieval.referenceDiagnostics.map((diagnostic) => ({ ...diagnostic })).sort((left, right) => ordinalCompare(left.resourceKey, right.resourceKey) || ordinalCompare(left.channel, right.channel) || ordinalCompare(left.reason, right.reason)),
    candidates: canonicalCandidateProjection(input.retrieval.candidates),
  };
}

export { RESOURCE_TYPES };
