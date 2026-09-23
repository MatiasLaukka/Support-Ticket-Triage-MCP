import type {
  CustomerReplyWatermark,
  EvidenceRequirement as DomainEvidenceRequirement,
  IsoTimestamp,
  TicketId,
} from "../domain.js";
import type { EvidenceRequirementId } from "../evidence-catalog.js";
import type { RetrievalRankingExecution } from "../retrieval/execution.js";
import type { Candidate, IndexMetadata, ResourceKey, RetrievalResult } from "../retrieval/types.js";

export type ReasoningMode = "evaluation" | "diagnosis";

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

/** A retrieval candidate is one observation; Candidate carries its ResourceKey and source/channel provenance. */
export interface EvidenceObservation extends Candidate {
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
  evidenceRequirements?: readonly EvidenceRequirement[];
}

export type EvidenceRelationshipKind =
  | "supports"
  | "contradicts"
  | { type: "other"; label: string };

export interface EvidenceRelationship {
  hypothesisId: Hypothesis["id"];
  evidenceId: ResourceKey;
  relationship: EvidenceRelationshipKind;
  rationale?: string;
}

/** Advisory description only; this contract does not make actions executable. */
export interface EvidenceAction {
  description: string;
  hypothesisIds: readonly [Hypothesis["id"], ...Hypothesis["id"][]];
  requirementIds?: readonly EvidenceRequirementId[];
}

export interface HybridReasoningInput {
  mode: ReasoningMode;
  basis: ReasoningBasis;
  observations: readonly EvidenceObservation[];
  retrieval: Pick<RetrievalResult, "lexical" | "semantic" | "referenceDiagnostics">;
  ranking: RetrievalRankingExecution;
}

export interface HybridReasoningResult {
  mode: ReasoningMode;
  basis: ReasoningBasis;
  hypotheses: readonly Hypothesis[];
  relationships: readonly EvidenceRelationship[];
  actions: readonly EvidenceAction[];
}
