import { describe, expect, it } from "vitest";

import type {
  CustomerReplyWatermark,
  Ticket,
} from "../src/domain.js";
import { assembleHybridReasoningInput } from "../src/reasoning/input-assembler.js";
import type {
  EvidenceAction,
  EvidenceActionId,
  EvidenceObservation,
  EvidenceObservationId,
  EvidenceRelationship,
  EvidenceRequirement,
  HybridReasoningInputV2,
  HybridReasoningResult,
  ReasoningBasis,
} from "../src/reasoning/types.js";
import type { EvidenceRequirementId } from "../src/evidence-catalog.js";
import type { RetrievalExecution } from "../src/retrieval/execution.js";
import type { Candidate, IndexMetadata, RetrievalResult, ResourceKey } from "../src/retrieval/types.js";
import type { RankingResult } from "../src/retrieval/ranking-types.js";

const ticket = { id: "TKT-0101", revision: 7 } satisfies Pick<Ticket, "id" | "revision">;
const customerReplyWatermark: CustomerReplyWatermark = {
  state: "reply",
  timestamp: "2026-09-20T12:30:00.000Z",
  id: "16c7a638-e7df-40bc-a4ef-2e839c575442",
};

const indexMetadata: IndexMetadata = {
  schemaVersion: 3,
  representationVersion: 2,
  generation: 11,
  lexicalGeneration: 11,
  semanticGeneration: 10,
  corpusHash: "corpus-hash-11",
  model: { id: "embedding-model", revision: "2026-09", dimensions: 3 },
  state: "degraded",
};

function candidate(resourceKey: Candidate["resourceKey"], sourceId: string): Candidate {
  const representationId = `${resourceKey}/summary`;
  return {
    resourceKey,
    resourceType: "knowledge-article",
    lexical: {
      bestRank: 1,
      bestBm25Score: -1.2,
      matches: [{ representationId, resourceKey, score: -1.2, rank: 1 }],
    },
    deterministicReferences: [{
      resourceKey,
      channel: "deterministic-reference",
      sourceId,
      sourceVersion: "4",
      reason: "classifier-association",
    }],
    knownCauseReferences: [],
  };
}

function retrievalResult(): RetrievalResult {
  return {
    metadata: structuredClone(indexMetadata),
    lexical: { status: "used" },
    semantic: { status: "unavailable", reason: "provider-not-configured" },
    candidates: [
      candidate("knowledge-article:delivery-delay", "article-delivery"),
      candidate("knowledge-article:profile-timeline", "article-timeline"),
    ],
    referenceDiagnostics: [],
  };
}

function successfulRanking(): RetrievalExecution["ranking"] {
  return {
    status: "succeeded",
    result: {
      contractVersion: 1,
      byType: {
        "knowledge-article": {
          memberships: [
            { resourceKey: "knowledge-article:profile-timeline", position: 1 },
            { resourceKey: "knowledge-article:delivery-delay", position: 2 },
          ],
        },
      },
    } as unknown as RankingResult,
    durationMs: 8,
  };
}

function input(
  mode: "evaluation" | "diagnosis" = "evaluation",
  ranking: RetrievalExecution["ranking"] = { status: "not-requested" },
) {
  return {
    mode,
    ticket: { ...ticket },
    customerReplyWatermark: structuredClone(customerReplyWatermark),
    retrievalExecution: { retrieval: retrievalResult(), ranking },
  };
}

function basis(): ReasoningBasis {
  return {
    ticketId: ticket.id,
    ticketRevision: ticket.revision,
    customerReplyWatermark,
    retrievalIndex: indexMetadata,
  };
}

function observationId(value: string): EvidenceObservationId {
  return value as EvidenceObservationId;
}

function actionId(value: string): EvidenceActionId {
  return value as EvidenceActionId;
}

describe("hybrid reasoning input assembler", () => {
  it("returns deeply equal inputs when assembled repeatedly from the same runtime data", () => {
    const source = input();

    expect(assembleHybridReasoningInput(source)).toEqual(
      assembleHybridReasoningInput(source),
    );
  });

  it("preserves authoritative ticket IDs, revisions, reply watermark, and retrieval identity", () => {
    const result = assembleHybridReasoningInput(input());

    expect(result.basis).toEqual({
      ticketId: ticket.id,
      ticketRevision: ticket.revision,
      customerReplyWatermark,
      retrievalIndex: indexMetadata,
    });
  });

  it("keeps retrieval candidates separate and creates no observed evidence", () => {
    const source = input();
    const result = assembleHybridReasoningInput(source);

    expect(result.observations).toEqual([]);
    expect(result.retrievalCandidates.map(({ resourceKey }) => resourceKey)).toEqual([
      "knowledge-article:delivery-delay",
      "knowledge-article:profile-timeline",
    ]);
    expect(result.retrievalCandidates[0]?.deterministicReferences[0]?.sourceId)
      .toBe("article-delivery");
  });

  it("carries a successful ranking result through without changing its membership order", () => {
    const ranking = successfulRanking();
    const result = assembleHybridReasoningInput(input("evaluation", ranking));

    expect(result.ranking).toEqual(ranking);
    expect(result.ranking).toMatchObject({
      status: "succeeded",
      result: {
        byType: {
          "knowledge-article": {
            memberships: [
              { resourceKey: "knowledge-article:profile-timeline", position: 1 },
              { resourceKey: "knowledge-article:delivery-delay", position: 2 },
            ],
          },
        },
      },
    });
  });

  it("preserves an explicitly unrequested ranking without adding ranking output", () => {
    const result = assembleHybridReasoningInput(input("evaluation", { status: "not-requested" }));

    expect(result.ranking).toEqual({ status: "not-requested" });
  });

  it("preserves ranking failure without creating synthetic ranking data", () => {
    const ranking = {
      status: "failed",
      error: new Error("ranking unavailable"),
      durationMs: 13,
    } satisfies RetrievalExecution["ranking"];
    const result = assembleHybridReasoningInput(input("evaluation", ranking));

    expect(result.ranking).toMatchObject({ status: "failed", durationMs: 13 });
    expect(result.ranking).not.toHaveProperty("result");
  });

  it("uses a separate observation identity and generic source provenance", () => {
    const resourceKey: ResourceKey = "knowledge-article:delivery-delay";
    const observation: EvidenceObservation = {
      id: observationId("observation:health-check:1"),
      fact: "The health check returned status 503.",
      provenance: {
        sourceType: "diagnostic-test",
        sourceId: "health-check-run-1",
        sourceRevision: 3,
      },
      observedAt: "2026-09-20T12:31:00.000Z",
    };
    const secondObservation: EvidenceObservation = {
      id: observationId("observation:health-check:2"),
      fact: "The health check returned status 200.",
      provenance: {
        sourceType: "diagnostic-test",
        sourceId: "health-check-run-2",
        sourceRevision: 4,
      },
      observedAt: "2026-09-20T12:33:00.000Z",
    };

    // @ts-expect-error Retrieval resource identities cannot serve as observation identities.
    const invalidObservationId: EvidenceObservationId = resourceKey;
    const relationship: EvidenceRelationship = {
      hypothesisId: "hypothesis:1",
      evidenceId: observation.id,
      relationship: "supports",
    };

    expect(invalidObservationId).toBe(resourceKey);
    expect(observation.provenance.sourceType).toBe("diagnostic-test");
    expect(relationship.evidenceId).toBe(observation.id);
    expect(relationship.evidenceId).not.toBe(resourceKey);
    expect([observation, secondObservation].map(({ id, provenance }) => ({ id, provenance })))
      .toEqual([
        {
          id: "observation:health-check:1",
          provenance: {
            sourceType: "diagnostic-test",
            sourceId: "health-check-run-1",
            sourceRevision: 3,
          },
        },
        {
          id: "observation:health-check:2",
          provenance: {
            sourceType: "diagnostic-test",
            sourceId: "health-check-run-2",
            sourceRevision: 4,
          },
        },
      ]);
  });

  it("shares requirements and observations across hypotheses and gives actions stable IDs", () => {
    const requirementId: EvidenceRequirementId = "api-response-status";
    const requirement: EvidenceRequirement = {
      id: requirementId,
      label: "API response status",
      customerQuestion: "What response status was returned?",
      aliases: ["response status"],
      source: "knowledge",
    };
    const sharedObservationId = observationId("observation:test-result:42");
    const action = {
      id: actionId("action:collect-response-status"),
      description: "Collect the response status from the affected request.",
      hypothesisIds: ["hypothesis:timeout", "hypothesis:upstream-error"],
      requirementIds: [requirementId],
    } satisfies EvidenceAction;
    const result: HybridReasoningResult = {
      mode: "diagnosis",
      basis: basis(),
      evidenceRequirements: [requirement],
      hypotheses: [
        { id: "hypothesis:timeout", statement: "The request timed out.", rank: 1, evidenceRequirementIds: [requirementId] },
        { id: "hypothesis:upstream-error", statement: "An upstream service failed.", rank: 2, evidenceRequirementIds: [requirementId] },
      ],
      relationships: [
        { hypothesisId: "hypothesis:timeout", evidenceId: sharedObservationId, relationship: "supports" },
        { hypothesisId: "hypothesis:upstream-error", evidenceId: sharedObservationId, relationship: { type: "other", label: "needs-context" } },
      ],
      actions: [action],
    };

    expect(result.evidenceRequirements).toEqual([requirement]);
    expect(result.hypotheses.map(({ evidenceRequirementIds }) => evidenceRequirementIds))
      .toEqual([[requirementId], [requirementId]]);
    expect(result.relationships.map(({ evidenceId }) => evidenceId))
      .toEqual([sharedObservationId, sharedObservationId]);
    expect(result.actions[0]?.id).toBe("action:collect-response-status");
    expect(result.hypotheses[0]).not.toHaveProperty("evidenceRequirements");
  });

  it("does not mutate runtime context or retrieval execution", () => {
    const source = input("evaluation", successfulRanking());
    const before = structuredClone(source);

    assembleHybridReasoningInput(source);

    expect(source).toEqual(before);
  });

  it("isolates assembled retrieval data from later source mutations", () => {
    const source = input("evaluation", successfulRanking());
    const result = assembleHybridReasoningInput(source);
    const assembledBefore = structuredClone(result);
    const firstCandidate = source.retrievalExecution.retrieval.candidates[0]!;
    firstCandidate.deterministicReferences[0]!.sourceId = "mutated-source";
    source.retrievalExecution.retrieval.metadata.model!.revision = "mutated-model";
    const ranking = source.retrievalExecution.ranking;
    if (ranking.status === "succeeded") {
      const memberships = (ranking.result.byType as unknown as Record<string, {
        memberships: { resourceKey: string }[];
      }>)["knowledge-article"]!.memberships;
      memberships[0]!.resourceKey = "knowledge-article:mutated";
    }
    if (source.customerReplyWatermark.state === "reply") {
      source.customerReplyWatermark.timestamp = "2026-09-21T12:31:00.000Z";
    }

    expect(result).toEqual(assembledBefore);
    expect(result.retrievalCandidates[0]?.deterministicReferences[0]?.sourceId)
      .toBe("article-delivery");
  });

  it("keeps evaluation and diagnosis as distinguishable input modes", () => {
    const evaluation: HybridReasoningInputV2 = assembleHybridReasoningInput(input("evaluation"));
    const diagnosis: HybridReasoningInputV2 = assembleHybridReasoningInput(input("diagnosis"));

    expect(evaluation.mode).toBe("evaluation");
    expect(diagnosis.mode).toBe("diagnosis");
    expect(evaluation).not.toEqual(diagnosis);
  });
});
