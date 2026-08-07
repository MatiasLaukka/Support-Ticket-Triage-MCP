import type { KnowledgeAuditEvent } from "./knowledge-audit-repository.js";
import type { CandidateEdits } from "./service.js";
import type { KnowledgeCandidate, KnowledgeObject } from "./domain.js";
import type { LearningEvent } from "./learning-ledger.js";

/** A point-in-time, internally consistent input for deterministic knowledge reuse. */
export type KnowledgeReuseSnapshot = {
  events: readonly LearningEvent[];
  versions: readonly KnowledgeObject[];
  heads: ReadonlyMap<string, number>;
};

export interface KnowledgeReuseSnapshotReader {
  snapshotForReuse(asOf: string): Promise<KnowledgeReuseSnapshot>;
}

export interface KnowledgeVersionStore extends KnowledgeReuseSnapshotReader {
  listApproved(): Promise<KnowledgeObject[]>;
  listVersions(objectId: string): Promise<KnowledgeObject[]>;
  listVersionsAsOf(asOf: string): Promise<KnowledgeObject[]>;
  listHeadMappings(): Promise<ReadonlyMap<string, number>>;
  listHeadMappingsAsOf(asOf: string): Promise<ReadonlyMap<string, number>>;
  promoteReplacement(input: {
    candidateId: string;
    approved: Omit<KnowledgeObject, "version">;
    expectedCandidateVersion: number;
    expectedHeadVersion: number;
    promotionAudit: KnowledgeAuditEvent;
    supersededEvent: LearningEvent;
    promotionEvent: LearningEvent;
  }): Promise<KnowledgeObject>;
  reactivateVersion(input: {
    objectId: string;
    sourceVersion: number;
    expectedHeadVersion: number;
    actorId: string;
    reason: string;
    occurredAt: string;
    supersededEvent: LearningEvent;
    reactivatedEvent: LearningEvent;
  }): Promise<KnowledgeObject>;
}

export interface KnowledgeRevisionOperations {
  proposeRevision(input: {
    objectId: string;
    sourceVersion: number;
    actorId: string;
    edits?: CandidateEdits;
  }): Promise<KnowledgeCandidate>;
  approveRevision(input: { candidateId: string; actorId: string }): Promise<KnowledgeObject>;
}
