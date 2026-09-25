import type {
  CustomerReplyWatermark,
  EvidenceRequirement as DomainEvidenceRequirement,
  IsoTimestamp,
  TicketId,
} from "../domain.js";
import type { EvidenceRequirementId } from "../evidence-catalog.js";
import type { ApplicabilityTaxonomyInformedSemanticReasoningInput } from "../retrieval/applicability-types.js";
import type { RankingResult } from "../retrieval/ranking-types.js";
import type { Candidate, IndexMetadata, RetrievalResult } from "../retrieval/types.js";

declare const reasoningIdentityBrand: unique symbol;

type ReasoningIdentity<Kind extends string> = string & {
  readonly [reasoningIdentityBrand]: Kind;
};

export type ReasoningMode = "evaluation" | "diagnosis";
/** Semantic adapter identity used in the H5a execution key, not operational authority. */
export const B5_TAXONOMY_INFORMED_ADAPTER_ID = "b5-taxonomy-informed-v1" as const;
export type EvidenceObservationId = ReasoningIdentity<"evidence-observation">;
export type EvidenceActionId = ReasoningIdentity<"evidence-action">;

export interface ReasoningBasis {
  ticketId: TicketId;
  ticketRevision: number;
  customerReplyWatermark: CustomerReplyWatermark;
  retrievalIndex: IndexMetadata;
}

/** A catalog-backed requirement, narrowed to IDs already recognized by the domain. */
export type EvidenceRequirement = Omit<DomainEvidenceRequirement, "id"> & {
  id: EvidenceRequirementId;
};

export interface EvidenceObservationProvenance {
  sourceType: string;
  sourceId: string;
  sourceRevision?: string | number;
}

/** A recorded fact or result, identified independently from resources that may help interpret it. */
export interface EvidenceObservation {
  id: EvidenceObservationId;
  fact: string;
  provenance: EvidenceObservationProvenance;
  observedAt?: IsoTimestamp;
  validAt?: IsoTimestamp;
  /** Policy values remain open until the repository defines a freshness-policy vocabulary. */
  freshnessPolicy?: string;
  expiresAt?: IsoTimestamp;
}

/** Hypothesis IDs identify proposals within one reasoning result, not persisted diagnoses. */
export interface Hypothesis {
  id: string;
  statement: string;
  /** Relative ordinal only; this is not model confidence or operational authority. */
  rank: number;
  evidenceRequirementIds?: readonly EvidenceRequirementId[];
}

export type EvidenceRelationshipKind =
  | "supports"
  | "contradicts"
  | { type: "other"; label: string };

export interface EvidenceRelationship {
  hypothesisId: Hypothesis["id"];
  evidenceId: EvidenceObservationId;
  relationship: EvidenceRelationshipKind;
  rationale?: string;
}

/** Advisory description only; this contract does not make actions executable. */
export interface EvidenceAction {
  id: EvidenceActionId;
  description: string;
  hypothesisIds: readonly [Hypothesis["id"], ...Hypothesis["id"][]];
  requirementIds?: readonly EvidenceRequirementId[];
}

export type ReasoningRankingExecution =
  | { status: "not-requested" }
  | { status: "succeeded"; result: RankingResult; durationMs: number }
  | { status: "failed"; durationMs: number };

/** Exact H3/H4b/H5a input shape retained for decoding persisted payloads v1 and v2. */
export interface HybridReasoningInputV2 {
  mode: ReasoningMode;
  basis: ReasoningBasis;
  observations: readonly EvidenceObservation[];
  retrievalCandidates: readonly Candidate[];
  retrieval: Pick<RetrievalResult, "lexical" | "semantic" | "referenceDiagnostics">;
  ranking: ReasoningRankingExecution;
}

/** Current frozen runtime input, extended with the B5 semantic boundary. */
export interface HybridReasoningInput extends HybridReasoningInputV2 {
  /** Provider-ready B5 semantics; excludes all offline evaluation identities. */
  applicability: ApplicabilityTaxonomyInformedSemanticReasoningInput;
  /** Must identify the exact taxonomy revision frozen in applicability.taxonomy. */
  applicabilityTaxonomyRevision: number;
}

export interface HybridReasoningResult {
  mode: ReasoningMode;
  basis: ReasoningBasis;
  evidenceRequirements: readonly EvidenceRequirement[];
  hypotheses: readonly Hypothesis[];
  relationships: readonly EvidenceRelationship[];
  actions: readonly EvidenceAction[];
}
