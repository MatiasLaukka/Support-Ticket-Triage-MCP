import type {
  Candidate,
  ChannelState,
  IndexMetadata,
  ModelIdentity,
  Reference,
  ReferenceDiagnostic,
  ResourceType,
  RetrievalResult,
} from "./types.js";

export const RANKING_CONTRACT_VERSION = 1 as const;
export const RANKING_TIE_BREAK = "ordinal-resource-key" as const;

export type RankingPolicy =
  | { id: "lexical-only-v1"; kind: "lexical-only" }
  | { id: "semantic-only-v1"; kind: "semantic-only" }
  | { id: "rrf-equal-v1"; kind: "rrf-equal"; constant: 10 | 30 | 60 };

export interface RankingQueryBasis {
  queryHash: string;
  ticketId: string;
  ticketRevision: number;
  customerReplyWatermark: string | null;
}

export type RankingOutputLimits = Record<ResourceType, number>;

export interface DerivedChannelResourceRank {
  resourceKey: string;
  resourceType: ResourceType;
  channel: "lexical" | "semantic";
  resourceRank: number;
  bestScore: number;
  bestRepresentationRank: number;
  matchedRepresentationIds: readonly string[];
}

export interface RankingInput {
  contractVersion: typeof RANKING_CONTRACT_VERSION;
  queryBasis: RankingQueryBasis;
  retrieval: RetrievalResult;
  outputLimits: RankingOutputLimits;
}

export interface RankingContribution {
  channel: "lexical" | "semantic";
  resourceRank: number;
  contribution: number;
}

export interface RankedMembership {
  resourceKey: string;
  resourceType: ResourceType;
  position: number;
  lexicalResourceRank: number | null;
  semanticResourceRank: number | null;
  selectedChannel: "lexical" | "semantic" | null;
  selectedRawScore: number | null;
  rrfScore: number | null;
  contributions: readonly RankingContribution[];
}

export type ReferenceProvenance = Reference;
export type MissingReferenceDiagnostic = ReferenceDiagnostic;

export interface ReferenceMembership {
  resourceKey: string;
  resourceType: ResourceType;
  provenance: readonly ReferenceProvenance[];
}

export interface RankedTypeResult {
  resourceType: ResourceType;
  poolCount: number;
  returnedCount: number;
  omittedCount: number;
  memberships: readonly RankedMembership[];
}

export interface RetrievalIdentity {
  schemaVersion: number;
  representationVersion: number;
  generation: number;
  lexicalGeneration: number;
  semanticGeneration: number;
  corpusHash: string;
  model: ModelIdentity | null;
  state: IndexMetadata["state"];
}

export interface RankingChannelSummary {
  lexical: { status: ChannelState["status"]; reason: ChannelState["reason"] | null; candidateCount: number };
  semantic: { status: ChannelState["status"]; reason: ChannelState["reason"] | null; candidateCount: number; partial: boolean };
  contributingChannels: readonly ("lexical" | "semantic")[];
  partialSemanticCoverage: boolean;
}

export interface RankingResult {
  contractVersion: typeof RANKING_CONTRACT_VERSION;
  policy: RankingPolicy;
  tieBreak: typeof RANKING_TIE_BREAK;
  queryBasis: RankingQueryBasis;
  inputHash: string;
  retrievalIdentity: RetrievalIdentity;
  channelSummary: RankingChannelSummary;
  byType: Readonly<Record<ResourceType, RankedTypeResult>>;
  references: readonly ReferenceMembership[];
  referenceDiagnostics: readonly MissingReferenceDiagnostic[];
  candidates: readonly Candidate[];
}
