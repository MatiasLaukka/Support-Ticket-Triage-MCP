import type { RankingPolicy, RankingChannelSummary, ReferenceMembership } from "./ranking-types.js";

export type ResourceType = "knowledge-article" | "known-cause" | "diagnostic-playbook" | "resolved-ticket";
export type ResourceKey = `${ResourceType}:${string}`;
export type TaxonomyMetadata = { productSurfaces: readonly string[]; problemClasses: readonly string[] };
export type Resource = { key: ResourceKey; type: ResourceType; sourceId: string; sourceVersion?: string; contentHash: string; family: "article" | "static-known-cause" | "learned-known-cause" | "playbook" | "resolved-ticket"; linkedResourceKeys: readonly ResourceKey[]; taxonomy?: TaxonomyMetadata };
export type Representation = { id: string; resourceKey: ResourceKey; kind: string; ordinal: number; title: string; heading?: string; keywords: readonly string[]; lexicalText: string; semanticText: string; contentHash: string };
export type ProjectedResource = { resource: Resource; representations: readonly Representation[] };
export type SourceSnapshot = { resources: readonly ProjectedResource[]; unavailableFamilies: readonly ("learned-known-cause" | "resolved-ticket")[] };
export type ModelIdentity = { id: string; revision: string; dimensions: number };
export interface EmbeddingProvider { readonly model: ModelIdentity; embed(texts: readonly string[], signal: AbortSignal): Promise<readonly (readonly number[])[]> }
export type Match = { representationId: string; resourceKey: ResourceKey; score: number; rank: number };
export type Reference = { resourceKey: ResourceKey; channel: "deterministic-reference" | "known-cause-reference"; sourceId: string; sourceVersion?: string; reason: "classifier-association" | "known-cause-link" | "safety-inclusion" };
export type ReferenceDiagnostic = { resourceKey: ResourceKey; channel: Reference["channel"]; reason: "missing-resource" };
export type Candidate = { resourceKey: ResourceKey; resourceType: ResourceType; lexical?: { bestRank: number; bestBm25Score: number; matches: readonly Match[] }; semantic?: { bestRank: number; bestCosineSimilarity: number; matches: readonly Match[] }; deterministicReferences: readonly Reference[]; knownCauseReferences: readonly Reference[]; taxonomy?: TaxonomyMetadata };
export type ChannelState = { status: "used" | "unavailable" | "stale" | "failed"; reason?: "provider-not-configured" | "provider-timeout" | "provider-http-error" | "provider-unreachable" | "provider-invalid-response" | "cancelled" | "model-version-changed" | "pending-vectors" | "source-unavailable" | "fts-query-error" | "index-integrity-error" | "index-unavailable" | "index-upgrade-required" };
export type IndexMetadata = { schemaVersion: number; representationVersion: number; generation: number; lexicalGeneration: number; semanticGeneration: number; corpusHash: string; model?: ModelIdentity; state: "ready" | "degraded" | "rebuilding" | "stale" | "unavailable" };
export type Query = { queryText: string; queryHash: string; ticketId: string; sourceRevision: number; customerReplyWatermark: string; queryTruncated: boolean; taxonomy?: TaxonomyMetadata; references: readonly Reference[] };
export type SearchSnapshot = { metadata: IndexMetadata; resources: readonly Resource[]; lexical: ChannelState; lexicalMatches: readonly Match[]; vectors: readonly { representationId: string; resourceKey: ResourceKey; contentHash: string; model: ModelIdentity; values: readonly number[] }[] };
export type RetrievalResult = { metadata: IndexMetadata; lexical: ChannelState; semantic: ChannelState; candidates: readonly Candidate[]; referenceDiagnostics: readonly ReferenceDiagnostic[] };
export type RankingTraceProjection = {
  contractVersion: 1;
  policy: RankingPolicy;
  inputHash: string | null;
  channelSummary: RankingChannelSummary | null;
  byType: Readonly<Record<ResourceType, { poolCount: number; returnedCount: number; omittedCount: number; memberships: readonly { resourceKey: string; position: number }[] }>>;
  references: readonly Pick<ReferenceMembership, "resourceKey" | "resourceType" | "provenance">[];
  durationMs: number;
  status: "used" | "failed";
  failureCode?: "INVALID_RANKING_INPUT" | "B4_RANKING_FAILED";
  truncated: boolean;
};
export type RetrievalTrace = Omit<Query, "queryText" | "references" | "taxonomy"> & { commandId: string; result: RetrievalResult; candidateCount: number; truncated: boolean; truncatedCount: number; ranking?: RankingTraceProjection; failureCode?: "INDEX_INTEGRITY_ERROR" | "INDEX_UPGRADE_REQUIRED" | "RETRIEVAL_OBSERVATION_FAILED" };
export type Limits = Record<ResourceType, { lexical: number; semantic: number }>;
