import { describe, expect, it } from "vitest";
import type { KnowledgeObject } from "../src/knowledge-evolution/domain.js";
import type { LearningEvent } from "../src/knowledge-evolution/learning-ledger.js";
import type { KnowledgeReuseSnapshot, KnowledgeReuseSnapshotReader } from "../src/knowledge-evolution/knowledge-version-store.js";
import { listReusableApproved } from "../src/knowledge-evolution/reusable-context.js";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";

const asOf = "2026-08-07T12:00:00.000Z";

describe("reusable approved knowledge", () => {
  it("uses one historical snapshot to include exact ledger heads and compatible legacy heads", async () => {
    const reader = snapshotReader({
      versions: [object("ledger-guide", 1), object("legacy-guide", 1, "legacy")],
      heads: new Map([["ledger-guide", 1], ["legacy-guide", 1]]),
      events: [promotion("ledger-guide", 1)],
    });

    const result = await listReusableApproved({ snapshotReader: reader, asOf });

    expect(result).toMatchObject({
      status: "available",
      contexts: [
        { object: { id: "ledger-guide" }, version: 1, eligibilitySource: "ledger-active", learning: { health: "active", eligibleForReuse: true } },
        { object: { id: "legacy-guide" }, version: 1, eligibilitySource: "legacy-compatible", learning: { health: "active", eligibleForReuse: true } },
      ],
      issues: [],
    });
    expect(reader.calls).toEqual([asOf]);
  });

  it.each([
    ["stale", stale("stale-guide")],
    ["contradicted", contradiction("contradicted-guide")],
    ["deprecated", deprecated("deprecated-guide")],
    ["superseded", superseded("superseded-guide", 3)],
  ] as const)("excludes an exact %s historical head without resurrecting an older version", async (_health, healthEvent) => {
    const id = healthEvent.objectId!;
    const reader = snapshotReader({
      versions: [object(id, 1), object(id, 2)],
      heads: new Map([[id, 2]]),
      events: [promotion(id, 1), promotion(id, 2), healthEvent],
    });

    const result = await listReusableApproved({ snapshotReader: reader, asOf });

    expect(result.contexts).toEqual([]);
    expect(result.issues).toEqual([{ scope: "version", objectId: id, version: 2, code: "unhealthy-version" }]);
  });

  it("keeps one malformed historical version isolated from otherwise verified contexts", async () => {
    const malformed = { ...object("malformed-guide", 1), summary: "" } as KnowledgeObject;
    const result = await listReusableApproved({
      snapshotReader: snapshotReader({
        versions: [object("healthy-guide", 1), malformed],
        heads: new Map([["healthy-guide", 1], ["malformed-guide", 1]]),
        events: [promotion("healthy-guide", 1), promotion("malformed-guide", 1)],
      }),
      asOf,
    });

    expect(result).toMatchObject({
      status: "available",
      contexts: [{ object: { id: "healthy-guide" }, version: 1 }],
      issues: [{ scope: "version", objectId: "malformed-guide", version: 1, code: "inconsistent-history" }],
    });
  });

  it("reports ledger-governed missing and inconsistent exact history while preserving legacy compatibility", async () => {
    const result = await listReusableApproved({
      snapshotReader: snapshotReader({
        versions: [
          object("missing-event", 1),
          object("duplicate-version", 1), object("duplicate-version", 1),
          object("legacy-without-event", 1, "legacy"),
        ],
        heads: new Map([["missing-event", 1], ["duplicate-version", 1], ["legacy-without-event", 1]]),
        events: [],
      }),
      asOf,
    });

    expect(result.contexts).toMatchObject([{ object: { id: "legacy-without-event" }, eligibilitySource: "legacy-compatible" }]);
    expect(result.issues).toEqual(expect.arrayContaining([
      { scope: "version", objectId: "missing-event", version: 1, code: "missing-history" },
      { scope: "version", objectId: "duplicate-version", version: 1, code: "inconsistent-history" },
    ]));
  });

  it("isolates events by object and version and ignores all changes after the requested cutoff", async () => {
    const result = await listReusableApproved({
      snapshotReader: snapshotReader({
        versions: [object("target-guide", 1), object("other-guide", 1), object("future-promotion", 1)],
        heads: new Map([["target-guide", 1], ["other-guide", 1], ["future-promotion", 1]]),
        events: [
          promotion("target-guide", 1),
          promotion("other-guide", 1),
          { ...contradiction("other-guide"), sourceVersion: 1 },
          { ...stale("target-guide"), occurredAt: "2026-08-07T12:01:00.000Z" },
          { ...superseded("target-guide", 3), occurredAt: "2026-08-07T12:02:00.000Z" },
          { ...deprecated("target-guide"), occurredAt: "2026-08-07T12:03:00.000Z" },
          { ...promotion("future-promotion", 1), occurredAt: "2026-08-07T12:04:00.000Z" },
        ],
      }),
      asOf,
    });

    expect(result.contexts).toMatchObject([{ object: { id: "target-guide" }, version: 1, learning: { health: "active", eligibleForReuse: true } }]);
    expect(result.issues).toEqual([
      { scope: "version", objectId: "other-guide", version: 1, code: "unhealthy-version" },
      { scope: "version", objectId: "future-promotion", version: 1, code: "missing-history" },
    ]);
  });

  it("returns a ledger-unavailable result when the sole snapshot cannot be read", async () => {
    const reader: KnowledgeReuseSnapshotReader = { async snapshotForReuse() { throw new Error("ledger unavailable"); } };

    await expect(listReusableApproved({ snapshotReader: reader, asOf })).resolves.toEqual({
      status: "ledger-unavailable",
      contexts: [],
      issues: [{ scope: "snapshot", code: "ledger-read-failed" }],
    });
  });

  it("returns a ledger-unavailable result when the snapshot cannot establish consistent heads", async () => {
    const reader = snapshotReader({
      versions: [object("invalid-head", 1)], heads: new Map([["invalid-head", 0]]), events: [promotion("invalid-head", 1)],
    } as never);

    await expect(listReusableApproved({ snapshotReader: reader, asOf })).resolves.toEqual({
      status: "ledger-unavailable", contexts: [], issues: [{ scope: "snapshot", code: "ledger-read-failed" }],
    });
  });

  it("exposes reusable knowledge through the service without falling back to broad approved history", async () => {
    const reader = snapshotReader({
      versions: [object("service-guide", 1)], heads: new Map([["service-guide", 1]]), events: [promotion("service-guide", 1)],
    });
    const service = new KnowledgeEvolutionService({
      objects: { snapshotForReuse: reader.snapshotForReuse.bind(reader) },
    } as never);

    await expect(service.listReusableApproved({ asOf })).resolves.toMatchObject({
      status: "available", contexts: [{ object: { id: "service-guide" }, eligibilitySource: "ledger-active" }],
    });
    expect(reader.calls).toEqual([asOf]);
  });
});

function snapshotReader(snapshot: KnowledgeReuseSnapshot): KnowledgeReuseSnapshotReader & { calls: string[] } {
  const calls: string[] = [];
  return { calls, async snapshotForReuse(cutoff) { calls.push(cutoff); return snapshot; } };
}

function object(id: string, version: number, learningGovernance: "ledger" | "legacy" = "ledger"): KnowledgeObject {
  return {
    id, version, learningGovernance, kind: "known-cause", name: `${id} name`, summary: "A reusable exact version.",
    triggerPatterns: ["Exact condition applies."], evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
    timeConstraints: ["Review the current incident."], diagnosticSteps: ["Confirm the condition."], fixSteps: ["Apply the controlled fix."],
    verificationSteps: ["Confirm recovery."], customerSafeExplanation: "We are applying a verified fix.", operatorRationale: "Approved for controlled reuse.",
    owner: "api-platform", supportingDiagnosisIds: ["diagnosis-001"], supportingTicketIds: ["TKT-1001"],
    provenance: { source: "test", recordedAt: "2026-08-07T10:00:00.000Z" }, status: "approved",
    approval: { approvedBy: "support-lead", approvedAt: "2026-08-07T10:00:00.000Z" },
  };
}

function promotion(objectId: string, sourceVersion: number): LearningEvent {
  return event(objectId, sourceVersion, "candidate-promoted", { maturity: "promoted", health: "active", provenance: "approved exact version" });
}

function stale(objectId: string): LearningEvent {
  return event(objectId, 2, "knowledge-marked-stale", { health: "stale", staleReasons: ["No current corroboration."], provenance: "reviewed stale" });
}

function contradiction(objectId: string): LearningEvent {
  return event(objectId, 2, "knowledge-reuse-failed", { matchReasons: ["same symptom"], failureReason: "Reuse was rejected.", provenance: "operator correction" });
}

function deprecated(objectId: string): LearningEvent {
  return event(objectId, 2, "knowledge-deprecated", { health: "deprecated", reason: "Retired guidance.", provenance: "operator review" });
}

function superseded(objectId: string, replacementVersion: number): LearningEvent {
  return event(objectId, 2, "knowledge-version-superseded", { health: "superseded", replacementVersion, provenance: "newer exact version" });
}

function event(objectId: string, sourceVersion: number, eventType: LearningEvent["eventType"], payload: Record<string, unknown>): LearningEvent {
  return {
    id: `00000000-0000-4000-8000-${(eventNumber++).toString().padStart(12, "0")}`,
    occurredAt: "2026-08-07T11:00:00.000Z", actor: "support-lead", correlationId: "10000000-0000-4000-8000-000000000001",
    candidateId: "candidate-001", objectId, sourceVersion, eventType, payload,
    ...(eventType === "knowledge-reused" || eventType === "knowledge-reuse-failed" ? { ticketId: "TKT-1002" } : {}),
  } as LearningEvent;
}

let eventNumber = 1;
