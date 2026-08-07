import { KnowledgeObjectReadSchema, type KnowledgeObject } from "./domain.js";
import { projectKnowledgeVersionLearning, type KnowledgeVersionLearningSummary } from "./learning-read-model.js";
import type { KnowledgeReuseSnapshot, KnowledgeReuseSnapshotReader } from "./knowledge-version-store.js";
import { LearningEventSchema, type LearningHealth, type LearningMaturity } from "./learning-ledger.js";

export type ReusableKnowledgeIssue =
  | { scope: "snapshot"; code: "ledger-read-failed" }
  | { scope: "version"; objectId: string; version: number; code: "missing-history" | "inconsistent-history" | "unhealthy-version" };

export type ReusableKnowledgeContext = {
  object: KnowledgeObject;
  version: number;
  learning: {
    maturity: LearningMaturity;
    health: LearningHealth;
    eligibleForReuse: boolean;
  };
  eligibilitySource: "ledger-active" | "legacy-compatible";
};

export type ReusableKnowledgeResult = {
  status: "available" | "ledger-unavailable";
  contexts: readonly ReusableKnowledgeContext[];
  issues: readonly ReusableKnowledgeIssue[];
};

/**
 * The only reusable-knowledge projection. Its one atomic snapshot prevents a
 * historical head from being paired with a different ledger or version view.
 */
export async function listReusableApproved(input: {
  snapshotReader: KnowledgeReuseSnapshotReader;
  asOf: string;
}): Promise<ReusableKnowledgeResult> {
  let snapshot: KnowledgeReuseSnapshot;
  try {
    snapshot = await input.snapshotReader.snapshotForReuse(input.asOf);
  } catch {
    return unavailable();
  }

  try {
    return projectSnapshot(snapshot, input.asOf);
  } catch {
    return unavailable();
  }
}

function projectSnapshot(snapshot: KnowledgeReuseSnapshot, asOf: string): ReusableKnowledgeResult {
  assertConsistentSnapshotShape(snapshot);
  const contexts: ReusableKnowledgeContext[] = [];
  const issues: ReusableKnowledgeIssue[] = [];

  for (const [objectId, version] of snapshot.heads) {
    const exactVersions = snapshot.versions.filter((candidate) => candidate.id === objectId && candidate.version === version);
    if (exactVersions.length === 0) {
      issues.push(versionIssue(objectId, version, "missing-history"));
      continue;
    }
    if (exactVersions.length !== 1) {
      issues.push(versionIssue(objectId, version, "inconsistent-history"));
      continue;
    }

    const parsed = KnowledgeObjectReadSchema.safeParse(exactVersions[0]);
    if (!parsed.success) {
      issues.push(versionIssue(objectId, version, "inconsistent-history"));
      continue;
    }
    const object = parsed.data;
    const learning = projectKnowledgeVersionLearning(snapshot.events, { objectId, sourceVersion: version, asOf });
    if (object.learningGovernance === "ledger" && !hasExactPromotion(snapshot, objectId, version, asOf)) {
      issues.push(versionIssue(objectId, version, "missing-history"));
      continue;
    }
    if (!isReusable(object, learning)) {
      issues.push(versionIssue(objectId, version, "unhealthy-version"));
      continue;
    }

    contexts.push({
      object,
      version,
      learning: { maturity: learning.maturity, health: learning.health, eligibleForReuse: learning.eligibleForReuse || object.learningGovernance === "legacy" },
      eligibilitySource: object.learningGovernance === "legacy" ? "legacy-compatible" : "ledger-active",
    });
  }

  return { status: "available", contexts, issues };
}

function assertConsistentSnapshotShape(snapshot: KnowledgeReuseSnapshot): void {
  if (!Array.isArray(snapshot.versions) || !Array.isArray(snapshot.events) || !(snapshot.heads instanceof Map)) {
    throw new Error("Knowledge reuse snapshot has an invalid shape.");
  }
  for (const [objectId, version] of snapshot.heads) {
    if (typeof objectId !== "string" || !Number.isInteger(version) || version < 1) {
      throw new Error("Knowledge reuse snapshot has an invalid head.");
    }
  }
  for (const event of snapshot.events) {
    if (!LearningEventSchema.safeParse(event).success) {
      throw new Error("Knowledge reuse snapshot has an invalid ledger event.");
    }
  }
}

function hasExactPromotion(snapshot: KnowledgeReuseSnapshot, objectId: string, version: number, asOf: string): boolean {
  const asOfEpoch = Date.parse(asOf);
  return snapshot.events.some((event) =>
    event.objectId === objectId
    && event.sourceVersion === version
    && event.eventType === "candidate-promoted"
    && Date.parse(event.occurredAt) <= asOfEpoch);
}

function isReusable(object: KnowledgeObject, learning: KnowledgeVersionLearningSummary): boolean {
  if (learning.health !== "active") return false;
  return object.learningGovernance === "legacy" || learning.eligibleForReuse;
}

function versionIssue(objectId: string, version: number, code: Extract<ReusableKnowledgeIssue, { scope: "version" }>["code"]): ReusableKnowledgeIssue {
  return { scope: "version", objectId, version, code };
}

function unavailable(): ReusableKnowledgeResult {
  return { status: "ledger-unavailable", contexts: [], issues: [{ scope: "snapshot", code: "ledger-read-failed" }] };
}
