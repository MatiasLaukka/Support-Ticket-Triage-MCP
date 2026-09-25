import { describe, expect, it, vi } from "vitest";
import { TicketSchema, type CustomerReplyWatermark } from "../src/domain.js";
import type { CustomerReply } from "../src/approval-desk/ai-evaluation.js";
import type { OperationalEvent, OperationalResultReference, OperationalWorkflowSnapshot } from "../src/operational/domain.js";
import { evaluateTicketCommand } from "../src/evaluation-command.js";
import { assembleHybridShadowCaptureContext, hybridShadowModeForEvent } from "../src/reasoning/hybrid-shadow-capture.js";
import { deterministicRetrievalReferences } from "../src/retrieval/deterministic-references.js";
import type { RetrievalExecution } from "../src/retrieval/execution.js";
import { buildRetrievalQuery } from "../src/retrieval/stage.js";
import { hashRepresentation, hashResource } from "../src/retrieval/representations.js";
import type { Candidate, IndexMetadata, ProjectedResource, RetrievalResult, SourceSnapshot } from "../src/retrieval/types.js";
import type { RankingResult } from "../src/retrieval/ranking-types.js";

const ticket = TicketSchema.parse({
  id: "TKT-0101",
  createdAt: "2026-09-21T11:00:00.000Z",
  updatedAt: "2026-09-21T11:00:00.000Z",
  customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
  subject: "Webhook delivery is delayed",
  description: "Delivery attempts arrive late.",
  status: "triage",
  category: "api",
  priority: "P2",
  team: "api-platform",
  tags: ["webhook"],
  sla: { responseDueAt: "2026-09-21T15:00:00.000Z", breached: false },
  relatedTicketIds: [],
  revision: 7,
});

const watermark: CustomerReplyWatermark = { state: "none" };
const index: IndexMetadata = {
  schemaVersion: 2,
  representationVersion: 1,
  generation: 8,
  lexicalGeneration: 8,
  semanticGeneration: 7,
  corpusHash: "corpus-hash-8",
  model: { id: "embedder", revision: "2026-09", dimensions: 3 },
  state: "degraded",
};

const taxonomyEventId = "00000000-0000-4000-8000-000000000001";
const evaluationEventId = "00000000-0000-4000-8000-000000000002";

const taxonomyContext = {
  primaryProductSurface: { domain: "messaging", area: "campaigns" },
  secondaryProductSurfaces: [],
  problemClasses: ["defect"],
  support: { productSurface: "supported", problemClass: "tentative" },
  basis: {
    source: "initial-classification",
    evidenceIds: [],
    knowledgeArticleIds: [],
    playbookIds: [],
    knownCauseIds: [],
    explanation: "The current taxonomy revision applies to this ticket.",
  },
};

function event(id: string, sequence: number, action: OperationalEvent["action"]): OperationalEvent {
  return {
    id,
    ticketId: ticket.id,
    sequence,
    occurredAt: "2026-09-21T11:30:00.000Z",
    actor: "test-operator",
    action,
    commandId: "00000000-0000-4000-8000-000000000003",
    facts: (action === "diagnostic-taxonomy-revised" ? { revision: 1, status: "advisory" } : {}) as OperationalEvent["facts"],
  };
}

const taxonomyEvent = event(taxonomyEventId, 2, "diagnostic-taxonomy-revised");
const evaluationEvent = event(evaluationEventId, 3, "recommendation-submitted");

function snapshot(): OperationalWorkflowSnapshot {
  return {
    ticket,
    ticketRevisions: [],
    recommendations: [],
    recommendationRevisions: [],
    diagnosticTaxonomyRevisions: [{
      id: "taxonomy-1",
      ticketId: ticket.id,
      revision: 1,
      context: structuredClone(taxonomyContext) as never,
      operationalEventId: taxonomyEventId,
      createdAt: taxonomyEvent.occurredAt,
    }],
    messages: [],
    diagnoses: [],
    events: [taxonomyEvent, evaluationEvent],
    traces: [],
    customerReplyWatermark: watermark,
  } as OperationalWorkflowSnapshot;
}

function candidate(resourceKey: Candidate["resourceKey"], sourceId: string): Candidate {
  return {
    resourceKey,
    resourceType: "knowledge-article",
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

function projectedResource(resourceKey: Candidate["resourceKey"], sourceId: string): ProjectedResource {
  const representationBase = {
    id: `${resourceKey}:section:0`,
    resourceKey,
    kind: "section",
    ordinal: 0,
    title: `${sourceId} guide`,
    heading: "Delivery checks",
    keywords: ["webhook"],
    lexicalText: `${sourceId} guide delivery checks`,
    semanticText: `Compare ${sourceId} delivery attempts against the webhook retry policy.`,
  };
  const representation = { ...representationBase, contentHash: hashRepresentation(representationBase) };
  const resourceBase = {
    key: resourceKey,
    type: "knowledge-article" as const,
    sourceId,
    sourceVersion: "article-v1",
    family: "article" as const,
    linkedResourceKeys: [] as const,
  };
  return {
    resource: { ...resourceBase, contentHash: hashResource(resourceBase, [representation]) },
    representations: [representation],
  };
}

function resolvedSnapshot(sourceSnapshot: SourceSnapshot = {
  resources: [
    projectedResource("knowledge-article:webhook-delay", "article-webhook"),
    projectedResource("knowledge-article:delivery-retry", "article-retry"),
  ],
  unavailableFamilies: [],
}) {
  return { metadata: structuredClone(index), sourceSnapshot };
}

function retrieval(): RetrievalResult {
  return {
    metadata: structuredClone(index),
    lexical: { status: "used" },
    semantic: { status: "unavailable", reason: "provider-not-configured" },
    candidates: [
      candidate("knowledge-article:webhook-delay", "article-webhook"),
      candidate("knowledge-article:delivery-retry", "article-retry"),
    ],
    referenceDiagnostics: [],
  };
}

function rankingResult(query = buildRetrievalQuery({
  ticket,
  customerReplies: [],
  customerReplyWatermark: JSON.stringify(watermark),
  references: [],
})): RankingResult {
  const empty = (resourceType: Candidate["resourceType"]) => ({
    resourceType,
    poolCount: 0,
    returnedCount: 0,
    omittedCount: 0,
    memberships: [],
  });
  return {
    contractVersion: 1,
    policy: { id: "lexical-only-v1", kind: "lexical-only" },
    tieBreak: "ordinal-resource-key",
    queryBasis: {
      queryHash: query.queryHash,
      ticketId: query.ticketId,
      ticketRevision: query.sourceRevision,
      customerReplyWatermark: query.customerReplyWatermark,
    },
    inputHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    retrievalIdentity: {
      schemaVersion: index.schemaVersion,
      representationVersion: index.representationVersion,
      generation: index.generation,
      lexicalGeneration: index.lexicalGeneration,
      semanticGeneration: index.semanticGeneration,
      corpusHash: index.corpusHash,
      model: index.model!,
      state: index.state,
    },
    channelSummary: {
      lexical: { status: "used", reason: null, candidateCount: 0 },
      semantic: { status: "unavailable", reason: "provider-not-configured", candidateCount: 0, partial: false },
      contributingChannels: [],
      partialSemanticCoverage: false,
    },
    byType: {
      "knowledge-article": empty("knowledge-article"),
      "known-cause": empty("known-cause"),
      "diagnostic-playbook": empty("diagnostic-playbook"),
      "resolved-ticket": empty("resolved-ticket"),
    },
    references: [],
    referenceDiagnostics: [],
    candidates: [],
  };
}

function source(mode: "evaluation" | "diagnosis" = "evaluation", ranking: RetrievalExecution["ranking"] = { status: "not-requested" }) {
  const state = snapshot();
  const customerReplies: CustomerReply[] = [];
  const query = buildRetrievalQuery({
    ticket: state.ticket,
    customerReplies,
    customerReplyWatermark: JSON.stringify(watermark),
    references: deterministicRetrievalReferences({ ticket: state.ticket, customerReplies }),
  });
  return {
    mode,
    event: evaluationEvent,
    snapshot: state,
    snapshotThroughSequence: evaluationEvent.sequence,
    query,
    retrievalExecution: { retrieval: retrieval(), ranking },
    resolvedRetrievalSnapshot: resolvedSnapshot(),
  };
}

describe("hybrid shadow capture assembler", () => {
  it("builds a deterministic basis from committed identities and the actual query hash", () => {
    const input = source();
    const first = assembleHybridShadowCaptureContext(input);
    const second = assembleHybridShadowCaptureContext(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      mode: "evaluation",
      ticketId: "TKT-0101",
      basis: {
        operationalEventId: evaluationEventId,
        eventSequence: 3,
        snapshotThroughSequence: 3,
        ticketRevision: 7,
        customerReplyWatermark: { state: "none" },
        taxonomyRevision: 1,
        retrievalQueryHash: input.query.queryHash,
      },
      input: { basis: { ticketId: "TKT-0101", ticketRevision: 7, retrievalIndex: index } },
    });
    expect(first.opportunityId).toBe(second.opportunityId);
  });

  it("preserves successful ranking alongside the full retrieval execution", () => {
    const initial = source();
    const result = rankingResult(initial.query);
    const context = assembleHybridShadowCaptureContext({
      ...initial,
      retrievalExecution: { retrieval: retrieval(), ranking: { status: "succeeded", result, durationMs: 8 } },
    });

    expect(context.retrievalExecution.ranking).toEqual({ status: "succeeded", result, durationMs: 8 });
    expect(context.input.ranking).toEqual(context.retrievalExecution.ranking);
    expect(context.input.ranking.status === "succeeded" && context.input.ranking.result.queryBasis)
      .toEqual({
        queryHash: initial.query.queryHash,
        ticketId: "TKT-0101",
        ticketRevision: 7,
        customerReplyWatermark: JSON.stringify(watermark),
      });
  });

  it("keeps not-requested and failed ranking distinct without synthetic ranking data", () => {
    const notRequested = assembleHybridShadowCaptureContext(source());
    const rankingError = Object.assign(new Error("ranking unavailable"), { code: "INVALID_RANKING_INPUT" });
    const failed = assembleHybridShadowCaptureContext(source("evaluation", {
      status: "failed",
      error: rankingError,
      durationMs: 13,
    }));

    expect(notRequested.input.ranking).toEqual({ status: "not-requested" });
    expect(failed.retrievalExecution.ranking.status).toBe("failed");
    expect(failed.input.ranking).toEqual({ status: "failed", durationMs: 13 });
    expect(failed.input.ranking).not.toHaveProperty("result");
    expect(failed.retrievalExecution.ranking.status === "failed" && failed.retrievalExecution.ranking.error)
      .toMatchObject({ message: "ranking unavailable", code: "INVALID_RANKING_INPUT" });
    expect(failed.retrievalExecution.ranking.status === "failed" && failed.retrievalExecution.ranking.error)
      .not.toBe(rankingError);
    expect(notRequested.opportunityId).toMatch(/^hybrid-shadow-opportunity:/);
    expect(failed.opportunityId).toMatch(/^hybrid-shadow-opportunity:/);
  });

  it("retains distinct retrieved evidence identities and provenance", () => {
    const context = assembleHybridShadowCaptureContext(source());

    expect(context.input.retrievalCandidates.map((item) => ({
      id: item.resourceKey,
      sourceId: item.deterministicReferences[0]?.sourceId,
    }))).toEqual([
      { id: "knowledge-article:webhook-delay", sourceId: "article-webhook" },
      { id: "knowledge-article:delivery-retry", sourceId: "article-retry" },
    ]);
  });

  it("freezes a safe case projection and resolved B5 evidence without raw operational objects", () => {
    const context = assembleHybridShadowCaptureContext(source());

    expect(context.input.applicability.case).toEqual({
      problemStatement: "Webhook delivery is delayed",
      observedFacts: [{ id: "ticket.description", statement: "Delivery attempts arrive late." }],
      conversationState: [],
    });
    expect(context.input.applicability.case).not.toHaveProperty("caseId");
    expect(context.input.applicability.case).not.toHaveProperty("ticketId");
    expect(JSON.stringify(context.input.applicability)).not.toContain("Northstar Labs");
    expect(JSON.stringify(context.input.applicability)).not.toContain("TKT-0101");
    expect(JSON.stringify(context.input.applicability)).not.toContain("customer");

    expect(context.input.applicability.candidates.map(({ resourceKey, sourceId, sourceVersion, contentHash }) => ({
      resourceKey, sourceId, sourceVersion, contentHash,
    }))).toEqual([
      {
        resourceKey: "knowledge-article:delivery-retry",
        sourceId: "article-retry",
        sourceVersion: "article-v1",
        contentHash: projectedResource("knowledge-article:delivery-retry", "article-retry").resource.contentHash,
      },
      {
        resourceKey: "knowledge-article:webhook-delay",
        sourceId: "article-webhook",
        sourceVersion: "article-v1",
        contentHash: projectedResource("knowledge-article:webhook-delay", "article-webhook").resource.contentHash,
      },
    ]);
    expect(context.input.applicability.evidenceRegistry.map(({ id, resourceKey, contentHash, evidenceOrigin, matchedChannels, text }) => ({
      id, resourceKey, contentHash, evidenceOrigin, matchedChannels, text,
    }))).toEqual([
      {
        id: "knowledge-article:delivery-retry:section:0",
        resourceKey: "knowledge-article:delivery-retry",
        contentHash: projectedResource("knowledge-article:delivery-retry", "article-retry").representations[0]!.contentHash,
        evidenceOrigin: "reference-grounded",
        matchedChannels: [],
        text: "Compare article-retry delivery attempts against the webhook retry policy.",
      },
      {
        id: "knowledge-article:webhook-delay:section:0",
        resourceKey: "knowledge-article:webhook-delay",
        contentHash: projectedResource("knowledge-article:webhook-delay", "article-webhook").representations[0]!.contentHash,
        evidenceOrigin: "reference-grounded",
        matchedChannels: [],
        text: "Compare article-webhook delivery attempts against the webhook retry policy.",
      },
    ]);
    expect(context.input.applicability.evidenceRegistry.map(({ id }) => id))
      .toEqual([...context.input.applicability.evidenceRegistry.map(({ id }) => id)].sort());
  });

  it("does not let later ticket, customer-message, or retrieval-store mutations change frozen input", () => {
    const initial = source();
    const context = assembleHybridShadowCaptureContext(initial);
    const frozen = structuredClone(context.input);

    (initial.snapshot.ticket as { subject: string }).subject = "Changed after capture";
    (initial.snapshot.messages as unknown as { body: string }[]).push({ body: "Later customer text" });
    initial.resolvedRetrievalSnapshot.sourceSnapshot.resources[0]!.representations[0]!.semanticText = "Changed retrieval content";
    const sourceTaxonomy = initial.snapshot.diagnosticTaxonomyRevisions[0]!.context as unknown as {
      primaryProductSurface: { domain: string; area: string } | null;
      support: { productSurface: string };
    };
    sourceTaxonomy.primaryProductSurface!.domain = "identity-access";
    sourceTaxonomy.support.productSurface = "tentative";

    expect(context.input).toEqual(frozen);
    expect(JSON.stringify(context.input.applicability)).not.toContain("Changed after capture");
    expect(JSON.stringify(context.input.applicability)).not.toContain("Later customer text");
    expect(JSON.stringify(context.input.applicability)).not.toContain("Changed retrieval content");
    expect(context.input.applicability.taxonomy.case.primaryProductSurface).toEqual(taxonomyContext.primaryProductSurface);
    expect(context.input.applicability.taxonomy.case.support).toEqual(taxonomyContext.support);
  });

  it("freezes only committed customer conversation text as safe case context", () => {
    const initial = source();
    const replyEvent = {
      ...event("00000000-0000-4000-8000-000000000018", 3, "customer-reply-received"),
      commandId: evaluationEvent.commandId,
    };
    const trigger = { ...evaluationEvent, sequence: 4 };
    const reply = {
      id: "00000000-0000-4000-8000-000000000019",
      ticketId: ticket.id,
      operationalEventId: replyEvent.id,
      kind: "customer" as const,
      createdAt: replyEvent.occurredAt,
      body: "We noticed repeated webhook attempts after the delivery delay.",
    };
    const customerReplies: CustomerReply[] = [{
      id: reply.id,
      ticketId: reply.ticketId,
      createdAt: reply.createdAt,
      body: reply.body,
    }];
    const replyWatermark: CustomerReplyWatermark = {
      state: "reply",
      timestamp: reply.createdAt,
      id: reply.id,
    };
    const committedSnapshot = {
      ...initial.snapshot,
      events: [taxonomyEvent, replyEvent, trigger],
      messages: [reply],
      customerReplyWatermark: replyWatermark,
    } as unknown as OperationalWorkflowSnapshot;
    const query = buildRetrievalQuery({
      ticket,
      customerReplies,
      customerReplyWatermark: JSON.stringify(replyWatermark),
      references: deterministicRetrievalReferences({ ticket, customerReplies }),
    });

    const captured = assembleHybridShadowCaptureContext({
      ...initial,
      event: trigger,
      snapshot: committedSnapshot,
      snapshotThroughSequence: trigger.sequence,
      query,
    });

    expect(captured.input.applicability.case.conversationState).toEqual([{
      id: "conversation.reply.1",
      statement: reply.body,
    }]);
  });

  it("rejects conflicting ticket, revision, watermark, and successful ranking identities", () => {
    const initial = source();
    expect(() => assembleHybridShadowCaptureContext({
      ...initial,
      query: { ...initial.query, ticketId: "TKT-0102" },
    })).toThrow(/ticket/i);
    expect(() => assembleHybridShadowCaptureContext({
      ...initial,
      query: { ...initial.query, sourceRevision: 8 },
    })).toThrow(/revision/i);
    expect(() => assembleHybridShadowCaptureContext({
      ...initial,
      query: { ...initial.query, customerReplyWatermark: "different-watermark" },
    })).toThrow(/watermark/i);

    const goodRanking = rankingResult(initial.query);
    expect(() => assembleHybridShadowCaptureContext({
      ...initial,
      retrievalExecution: {
        retrieval: retrieval(),
        ranking: { status: "succeeded", result: {
          ...goodRanking,
          queryBasis: { ...goodRanking.queryBasis, queryHash: "not-the-query-hash" },
        }, durationMs: 8 },
      },
    })).toThrow(/ranking query/i);
    expect(() => assembleHybridShadowCaptureContext({
      ...initial,
      retrievalExecution: {
        retrieval: retrieval(),
        ranking: { status: "succeeded", result: {
          ...goodRanking,
          retrievalIdentity: { ...goodRanking.retrievalIdentity, corpusHash: "other-corpus" },
        }, durationMs: 8 },
      },
    })).toThrow(/retrieval identity/i);
    expect(() => assembleHybridShadowCaptureContext({
      ...initial,
      resolvedRetrievalSnapshot: {
        ...initial.resolvedRetrievalSnapshot,
        metadata: { ...index, generation: index.generation + 1 },
      },
    })).toThrow(/retrieval metadata/i);
    expect(() => assembleHybridShadowCaptureContext({
      ...initial,
      resolvedRetrievalSnapshot: {
        ...initial.resolvedRetrievalSnapshot,
        sourceSnapshot: {
          ...initial.resolvedRetrievalSnapshot.sourceSnapshot,
          resources: initial.resolvedRetrievalSnapshot.sourceSnapshot.resources.slice(1),
        },
      },
    })).toThrow(/candidate identities/i);
  });

  it("does not use later ticket, reply, or taxonomy revisions for the trigger basis", () => {
    const initial = source();
    const laterReplyEvent = {
      ...event("00000000-0000-4000-8000-000000000008", 4, "customer-reply-received"),
      commandId: "00000000-0000-4000-8000-000000000017",
    };
    const laterTaxonomyEvent = {
      ...event("00000000-0000-4000-8000-000000000009", 5, "diagnostic-taxonomy-revised"),
      commandId: "00000000-0000-4000-8000-000000000018",
    };
    const laterTaxonomy = {
      id: "taxonomy-2",
      ticketId: ticket.id,
      revision: 2,
      context: structuredClone(taxonomyContext) as never,
      operationalEventId: laterTaxonomyEvent.id,
      createdAt: laterTaxonomyEvent.occurredAt,
    };
    const futureSnapshot = {
      ...initial.snapshot,
      events: [taxonomyEvent, evaluationEvent, laterReplyEvent, laterTaxonomyEvent],
      diagnosticTaxonomyRevisions: [...initial.snapshot.diagnosticTaxonomyRevisions, laterTaxonomy],
      messages: [{
        id: "00000000-0000-4000-8000-000000000010",
        ticketId: ticket.id,
        operationalEventId: laterReplyEvent.id,
        kind: "customer",
        createdAt: laterReplyEvent.occurredAt,
        body: "Later customer context.",
      }],
      customerReplyWatermark: {
        state: "reply",
        timestamp: laterReplyEvent.occurredAt,
        id: "00000000-0000-4000-8000-000000000010",
      },
    } as unknown as OperationalWorkflowSnapshot;
    const laterBasis = assembleHybridShadowCaptureContext({ ...initial, snapshot: futureSnapshot });
    expect(laterBasis.basis).toMatchObject({
      ticketRevision: 7,
      customerReplyWatermark: { state: "none" },
      taxonomyRevision: 1,
    });
    expect(laterBasis.input.applicability.taxonomy.case.problemClasses).toEqual(["defect"]);
    expect(laterBasis.input.applicability.case.conversationState).toEqual([]);
    expect(laterBasis.input.applicability.taxonomy.case.basis.explanation)
      .toBe("The current taxonomy revision applies to this ticket.");

    const futureTicket = TicketSchema.parse({ ...ticket, revision: 8 });
    const futureTicketEvent = {
      ...event("00000000-0000-4000-8000-000000000011", 4, "ticket-updated"),
      commandId: "00000000-0000-4000-8000-000000000019",
    };
    const missingHistory = {
      ...initial.snapshot,
      ticket: futureTicket,
      events: [taxonomyEvent, evaluationEvent, futureTicketEvent],
      ticketRevisions: [{
        ticketId: ticket.id,
        revision: 8,
        ticket: futureTicket,
        operationalEventId: futureTicketEvent.id,
        createdAt: futureTicketEvent.occurredAt,
      }],
    } as unknown as OperationalWorkflowSnapshot;
    expect(() => assembleHybridShadowCaptureContext({ ...initial, snapshot: missingHistory }))
      .toThrow(/later-state leakage/i);
  });

  it("uses taxonomy appended after the trigger in the same committed evaluation operation", () => {
    const initial = source();
    const sameOperationTaxonomyEvent = {
      ...event("00000000-0000-4000-8000-000000000014", 4, "diagnostic-taxonomy-revised"),
      commandId: evaluationEvent.commandId,
    };
    const sameOperationSnapshot = {
      ...initial.snapshot,
      events: [evaluationEvent, sameOperationTaxonomyEvent],
      diagnosticTaxonomyRevisions: [{
        id: "taxonomy-same-operation",
        ticketId: ticket.id,
        revision: 1,
        context: structuredClone(taxonomyContext) as never,
        operationalEventId: sameOperationTaxonomyEvent.id,
        createdAt: sameOperationTaxonomyEvent.occurredAt,
      }],
    } as OperationalWorkflowSnapshot;

    const context = assembleHybridShadowCaptureContext({
      ...initial,
      snapshot: sameOperationSnapshot,
      snapshotThroughSequence: sameOperationTaxonomyEvent.sequence,
    });

    expect(context.basis).toMatchObject({
      eventSequence: evaluationEvent.sequence,
      snapshotThroughSequence: sameOperationTaxonomyEvent.sequence,
      taxonomyRevision: 1,
    });
    expect(context.input.applicabilityTaxonomyRevision).toBe(context.basis.taxonomyRevision);
    expect(context.input.applicability.taxonomy.case).toEqual(taxonomyContext);
  });

  it("does not use taxonomy appended by a later operation beyond the committed snapshot boundary", () => {
    const initial = source();
    const laterTaxonomyEvent = {
      ...event("00000000-0000-4000-8000-000000000015", 4, "diagnostic-taxonomy-revised"),
      commandId: "00000000-0000-4000-8000-000000000020",
    };
    const laterTaxonomy = {
      id: "taxonomy-later-operation",
      ticketId: ticket.id,
      revision: 2,
      context: { ...structuredClone(taxonomyContext), problemClasses: ["outage"] } as never,
      operationalEventId: laterTaxonomyEvent.id,
      createdAt: laterTaxonomyEvent.occurredAt,
    };

    const context = assembleHybridShadowCaptureContext({
      ...initial,
      snapshot: {
        ...initial.snapshot,
        events: [...initial.snapshot.events, laterTaxonomyEvent],
        diagnosticTaxonomyRevisions: [...initial.snapshot.diagnosticTaxonomyRevisions, laterTaxonomy],
      },
      snapshotThroughSequence: evaluationEvent.sequence,
    });

    expect(context.basis.taxonomyRevision).toBe(1);
    expect(context.basis.snapshotThroughSequence).toBe(evaluationEvent.sequence);
  });

  it("rejects query text derived from customer content absent from the committed snapshot", () => {
    const initial = source();
    const uncommittedReply = {
      id: "00000000-0000-4000-8000-000000000012",
      ticketId: ticket.id,
      createdAt: "2026-09-21T11:29:00.000Z",
      body: "Uncommitted customer message.",
    };
    const uncommittedQuery = buildRetrievalQuery({
      ticket,
      customerReplies: [uncommittedReply],
      customerReplyWatermark: JSON.stringify(watermark),
      references: deterministicRetrievalReferences({ ticket, customerReplies: [uncommittedReply] }),
    });

    expect(() => assembleHybridShadowCaptureContext({ ...initial, query: uncommittedQuery }))
      .toThrow(/committed ticket and customer evidence/i);
  });

  it("does not mutate source context, query, or retrieval execution", () => {
    const input = source();
    const before = structuredClone(input);

    assembleHybridShadowCaptureContext(input);

    expect(input).toEqual(before);
  });

  it("keeps evaluation and diagnosis mode and opportunity identities distinct", () => {
    const evaluation = assembleHybridShadowCaptureContext(source("evaluation"));
    const diagnosis = assembleHybridShadowCaptureContext(source("diagnosis"));

    expect(evaluation.mode).toBe("evaluation");
    expect(diagnosis.mode).toBe("diagnosis");
    expect(diagnosis.input.mode).toBe("diagnosis");
    expect(diagnosis.opportunityId).not.toBe(evaluation.opportunityId);

    const repeatedEvent = { ...evaluationEvent, id: "00000000-0000-4000-8000-000000000013", sequence: 4 };
    const repeatedSnapshot = { ...snapshot(), events: [taxonomyEvent, evaluationEvent, repeatedEvent] };
    const otherEvent = assembleHybridShadowCaptureContext({
      ...source(),
      event: repeatedEvent,
      snapshot: repeatedSnapshot,
      snapshotThroughSequence: repeatedEvent.sequence,
    });
    expect(otherEvent.opportunityId).not.toBe(evaluation.opportunityId);
  });

  it("includes case, resolved evidence, and taxonomy content in opportunity identity", () => {
    const initial = source();
    const original = assembleHybridShadowCaptureContext(initial);
    const repeated = assembleHybridShadowCaptureContext(structuredClone(initial));
    expect(repeated.opportunityId).toBe(original.opportunityId);

    const changedTicket = TicketSchema.parse({
      ...ticket,
      description: "Webhook requests are delayed after retry exhaustion.",
    });
    const changedCaseSnapshot = { ...initial.snapshot, ticket: changedTicket } as OperationalWorkflowSnapshot;
    const changedCaseQuery = buildRetrievalQuery({
      ticket: changedTicket,
      customerReplies: [],
      customerReplyWatermark: JSON.stringify(watermark),
      references: deterministicRetrievalReferences({ ticket: changedTicket, customerReplies: [] }),
    });
    const changedCase = assembleHybridShadowCaptureContext({
      ...initial,
      snapshot: changedCaseSnapshot,
      query: changedCaseQuery,
    });

    const changedEvidenceSource = structuredClone(initial.resolvedRetrievalSnapshot.sourceSnapshot);
    const evidenceResource = changedEvidenceSource.resources[0]!;
    const changedRepresentationBase = {
      ...evidenceResource.representations[0]!,
      semanticText: "A changed frozen troubleshooting representation for the captured resource.",
    };
    const changedRepresentation = {
      ...changedRepresentationBase,
      contentHash: hashRepresentation(changedRepresentationBase),
    };
    const { contentHash: _oldContentHash, ...resourceBase } = evidenceResource.resource;
    const changedResource = {
      ...resourceBase,
      contentHash: hashResource(resourceBase, [changedRepresentation]),
    };
    const changedEvidenceResources = changedEvidenceSource.resources.map((projected, index) => index === 0
      ? { resource: changedResource, representations: [changedRepresentation] }
      : projected);
    const changedEvidence = assembleHybridShadowCaptureContext({
      ...initial,
      resolvedRetrievalSnapshot: {
        metadata: structuredClone(index),
        sourceSnapshot: { ...changedEvidenceSource, resources: changedEvidenceResources },
      },
    });

    const changedTaxonomyRevision = {
      ...initial.snapshot.diagnosticTaxonomyRevisions[0]!,
      context: { ...structuredClone(taxonomyContext), problemClasses: ["outage"] },
    };
    const changedTaxonomy = assembleHybridShadowCaptureContext({
      ...initial,
      snapshot: {
        ...initial.snapshot,
        diagnosticTaxonomyRevisions: [changedTaxonomyRevision],
      } as OperationalWorkflowSnapshot,
    });

    expect(changedCase.opportunityId).not.toBe(original.opportunityId);
    expect(changedEvidence.opportunityId).not.toBe(original.opportunityId);
    expect(changedTaxonomy.opportunityId).not.toBe(original.opportunityId);
  });

  it("distinguishes retrieval snapshots but excludes ranking duration from opportunity identity", () => {
    const initial = source();
    const original = assembleHybridShadowCaptureContext(initial);
    const changedSnapshot = assembleHybridShadowCaptureContext({
      ...initial,
      retrievalExecution: {
        ...initial.retrievalExecution,
        retrieval: {
          ...initial.retrievalExecution.retrieval,
          metadata: { ...index, generation: index.generation + 1 },
        },
      },
      resolvedRetrievalSnapshot: {
        ...initial.resolvedRetrievalSnapshot,
        metadata: { ...index, generation: index.generation + 1 },
      },
    });
    const ranked = rankingResult(initial.query);
    const sameRankedInputDifferentDuration = assembleHybridShadowCaptureContext({
      ...initial,
      retrievalExecution: {
        retrieval: retrieval(),
        ranking: { status: "succeeded", result: ranked, durationMs: 999 },
      },
    });
    const sameRankedInputDifferentDurationAgain = assembleHybridShadowCaptureContext({
      ...initial,
      retrievalExecution: {
        retrieval: retrieval(),
        ranking: { status: "succeeded", result: ranked, durationMs: 1 },
      },
    });

    expect(changedSnapshot.basis.retrievalQueryHash).toBe(original.basis.retrievalQueryHash);
    expect(changedSnapshot.basis.taxonomyRevision).toBe(original.basis.taxonomyRevision);
    expect(changedSnapshot.opportunityId).not.toBe(original.opportunityId);
    expect(sameRankedInputDifferentDuration.opportunityId)
      .toBe(sameRankedInputDifferentDurationAgain.opportunityId);
  });

  it("keeps opportunity identity independent of the future reasoning provider", () => {
    const base = source();
    const luna = { ...base, provider: { model: "Luna" } };
    const qwen = { ...base, provider: { model: "Qwen" } };

    expect(assembleHybridShadowCaptureContext(luna).opportunityId)
      .toBe(assembleHybridShadowCaptureContext(qwen).opportunityId);
  });

  it("maps only the existing committed evaluation trigger", () => {
    expect(hybridShadowModeForEvent(evaluationEvent)).toBe("evaluation");
    expect(hybridShadowModeForEvent(event("00000000-0000-4000-8000-000000000004", 4, "diagnostic-escalated"))).toBeUndefined();
    expect(hybridShadowModeForEvent(event("00000000-0000-4000-8000-000000000005", 5, "customer-reply-received"))).toBeUndefined();
  });

  it("captures same-operation taxonomy after evaluation commits and isolates sink failure", async () => {
    const commandId = "00000000-0000-4000-8000-000000000007";
    const taxonomyEventId = "00000000-0000-4000-8000-000000000016";
    const committedTaxonomyEvent = {
      ...event(taxonomyEventId, 4, "diagnostic-taxonomy-revised"),
      commandId,
    };
    const committedSnapshot = {
      ...snapshot(),
      events: [{ ...evaluationEvent, commandId }, committedTaxonomyEvent],
      diagnosticTaxonomyRevisions: [{
        id: "taxonomy-same-transaction",
        ticketId: ticket.id,
        revision: 1,
        context: structuredClone(taxonomyContext) as never,
        operationalEventId: taxonomyEventId,
        createdAt: committedTaxonomyEvent.occurredAt,
      }],
    } as OperationalWorkflowSnapshot;
    const committedResult: OperationalResultReference = {
      operation: "evaluate-ticket",
      tickets: [{ ticketId: ticket.id, operationalEventIds: [evaluationEventId, taxonomyEventId], resultingRevision: null }],
      recommendationId: "00000000-0000-4000-8000-000000000006",
    };
    let commits = 0;
    const captures: unknown[] = [];
    const dispatcher = {
      async run(definition: any, rawInput: unknown, commandId: string) {
        const intent = definition.parse(rawInput);
        const prepared = await definition.prepare(intent);
        const result = definition.commit({ readWorkflowSnapshot: () => committedSnapshot }, prepared, commandId);
        return definition.replay({ readWorkflowSnapshot: () => committedSnapshot }, result, commandId);
      },
    };
    const execution: RetrievalExecution = { retrieval: retrieval(), ranking: { status: "not-requested" } };
    const diagnostics: { code: string; commandId: string }[] = [];
    const sink = {
      capture: async (context: unknown) => { captures.push(context); throw new Error("capture storage unavailable"); },
      reportFailure: (failure: { code: string; commandId: string }) => { diagnostics.push(failure); },
    };
    const result = await evaluateTicketCommand({
      dispatcher: dispatcher as never,
      service: {
        commitOperationalEvaluation: () => { commits += 1; return committedResult; },
        replayOperationalEvaluation: () => ({ status: "committed" } as never),
      },
      tickets: { get: async () => ticket },
      audits: { list: async () => [] },
      knowledge: { list: async () => [] },
      knowledgeEvolution: { listReusableApproved: async () => ({ status: "available", contexts: [], issues: [] }) },
      now: () => new Date("2026-09-21T11:00:00.000Z"),
      env: {},
      retrievalObserver: {
        async observe(query, _commandId, onExecution) {
          await onExecution?.(query, execution, () => resolvedSnapshot());
        },
        recent: () => [],
        close: async () => undefined,
      },
      hybridShadowCaptureSink: sink,
    }, { ticketId: ticket.id, aiPreference: "deterministic" }, commandId);

    await vi.waitFor(() => expect(diagnostics).toHaveLength(1));
    expect(result).toEqual({ status: "committed" });
    expect(commits).toBe(1);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      mode: "evaluation",
      trigger: { id: evaluationEventId, sequence: 3 },
      basis: { eventSequence: 3, snapshotThroughSequence: 4, taxonomyRevision: 1 },
    });
    expect(diagnostics).toEqual([{
      code: "HYBRID_SHADOW_CAPTURE_FAILED",
      commandId,
    }]);
  });
});
