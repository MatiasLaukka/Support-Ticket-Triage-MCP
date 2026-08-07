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

/** Immutable provenance for a learned known-cause selected at evaluation time. */
export type KnowledgeReference = { objectId: string; version: number };

/** Production callers must provide the service-owned reusable snapshot, not broad history. */
export type ProductionKnowledgeInput = { reusableKnowledge: ReusableKnowledgeResult };

/** Internal, opaque proof that a reference was selected from this exact result. */
export type ValidatedKnownCauseReference = { readonly reference: KnowledgeReference };
const validatedKnownCauseReferences = new WeakSet<object>();
const registeredReusableReferences = new WeakMap<object, ReadonlySet<string>>();

export function validateKnownCauseReference(
  reusableKnowledge: ReusableKnowledgeResult,
  reference: KnowledgeReference,
): ValidatedKnownCauseReference {
  const references = registeredReusableReferences.get(reusableKnowledge);
  if (references === undefined) {
    throw new Error("Known-cause references require a service-owned reusable knowledge result.");
  }
  if (!references.has(referenceKey(reference))) {
    throw new Error("Known-cause reference is not present in the registered reusable knowledge context.");
  }
  const validation = { reference: { ...reference } };
  validatedKnownCauseReferences.add(validation);
  return validation;
}

export function isValidatedKnownCauseReference(
  value: unknown,
  reference: KnowledgeReference,
): value is ValidatedKnownCauseReference {
  return typeof value === "object" && value !== null &&
    validatedKnownCauseReferences.has(value) &&
    (value as ValidatedKnownCauseReference).reference.objectId === reference.objectId &&
    (value as ValidatedKnownCauseReference).reference.version === reference.version;
}

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
    return registerReusableKnowledgeResult(projectSnapshot(snapshot, input.asOf));
  } catch {
    return unavailable();
  }
}

function registerReusableKnowledgeResult(result: ReusableKnowledgeResult): ReusableKnowledgeResult {
  registeredReusableReferences.set(
    result,
    new Set(result.contexts.map((context) => referenceKey({ objectId: context.object.id, version: context.version }))),
  );
  return deepFreeze(result);
}

function referenceKey(reference: KnowledgeReference): string {
  return `${reference.objectId}\u0000${reference.version}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
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
  return registerReusableKnowledgeResult({
    status: "ledger-unavailable",
    contexts: [],
    issues: [{ scope: "snapshot", code: "ledger-read-failed" }],
  });
}
