import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { CustomerReplyWatermark, TicketId } from "../domain.js";
import type {
  DiagnosticTaxonomyRevision,
  OperationalEvent,
  OperationalWorkflowSnapshot,
  TicketRevision,
} from "../operational/domain.js";
import type { RetrievalExecution } from "../retrieval/execution.js";
import type { CustomerReply } from "../approval-desk/ai-evaluation.js";
import { buildRetrievalQuery } from "../retrieval/stage.js";
import { deterministicRetrievalReferences } from "../retrieval/deterministic-references.js";
import type { Query } from "../retrieval/types.js";
import { assembleHybridReasoningInput } from "./input-assembler.js";
import { HybridShadowBasisSchema, type HybridShadowBasis } from "./shadow-run-types.js";
import type { HybridReasoningInput, ReasoningMode } from "./types.js";

declare const opportunityIdBrand: unique symbol;

/** Stable identity of an authoritative reasoning opportunity, independent of provider runs. */
export type HybridShadowOpportunityId = string & {
  readonly [opportunityIdBrand]: true;
};

export interface HybridShadowCaptureContext {
  opportunityId: HybridShadowOpportunityId;
  mode: ReasoningMode;
  ticketId: TicketId;
  trigger: Pick<OperationalEvent, "id" | "sequence" | "action">;
  basis: HybridShadowBasis;
  query: Query;
  retrievalExecution: RetrievalExecution;
  input: HybridReasoningInput;
}

export type HybridShadowCaptureFailureCode =
  | "HYBRID_SHADOW_CAPTURE_INCONSISTENT"
  | "HYBRID_SHADOW_CAPTURE_FAILED";

export class HybridShadowCaptureError extends Error {
  readonly code: HybridShadowCaptureFailureCode = "HYBRID_SHADOW_CAPTURE_INCONSISTENT";

  constructor(message: string) {
    super(message);
    this.name = "HybridShadowCaptureError";
  }
}

export interface HybridShadowCaptureAssemblySource {
  mode: ReasoningMode;
  event: OperationalEvent;
  snapshot: OperationalWorkflowSnapshot;
  query: Query;
  retrievalExecution: RetrievalExecution;
}

/**
 * Assemble a provider-neutral H5 input from one real committed event and the
 * exact query/execution already produced by H1. No runtime source is mutated.
 */
export function assembleHybridShadowCaptureContext(
  source: HybridShadowCaptureAssemblySource,
): HybridShadowCaptureContext {
  const { event, snapshot, query, retrievalExecution } = source;
  const committedEvent = snapshot.events.find(({ id }) => id === event.id);
  if (
    committedEvent === undefined
    || committedEvent.sequence !== event.sequence
    || committedEvent.ticketId !== event.ticketId
    || committedEvent.action !== event.action
  ) {
    fail("Hybrid shadow trigger does not match a committed operational event.");
  }
  if (event.ticketId !== snapshot.ticket.id || query.ticketId !== event.ticketId) {
    fail("Hybrid shadow capture ticket identity does not match the query and committed event.");
  }

  const ticketAtEvent = ticketRevisionAt(snapshot, event);
  if (query.sourceRevision !== ticketAtEvent.revision) {
    fail("Hybrid shadow query revision does not match the ticket revision at the committed event.");
  }
  const watermarkAtEvent = customerReplyWatermarkAt(snapshot, event);
  const encodedWatermark = JSON.stringify(watermarkAtEvent);
  if (query.customerReplyWatermark !== encodedWatermark) {
    fail("Hybrid shadow query watermark does not match the customer reply watermark at the committed event.");
  }
  assertQueryMatchesCommittedContext(query, ticketAtEvent, customerRepliesAt(snapshot, event), watermarkAtEvent);

  const taxonomyRevision = taxonomyRevisionAt(snapshot, event);
  if (taxonomyRevision === undefined) {
    fail("No diagnostic taxonomy revision is causally applicable to the committed event.");
  }
  assertRankingConsistent(query, retrievalExecution);

  const input = assembleHybridReasoningInput({
    mode: source.mode,
    ticket: { id: ticketAtEvent.id, revision: ticketAtEvent.revision },
    customerReplyWatermark: watermarkAtEvent,
    retrievalExecution,
  });
  if (
    input.basis.ticketId !== event.ticketId
    || input.basis.ticketRevision !== ticketAtEvent.revision
    || !isDeepStrictEqual(input.basis.customerReplyWatermark, watermarkAtEvent)
    || !isDeepStrictEqual(input.basis.retrievalIndex, retrievalExecution.retrieval.metadata)
  ) {
    fail("Hybrid reasoning input basis disagrees with the committed capture basis.");
  }

  const basis: HybridShadowBasis = HybridShadowBasisSchema.parse({
    operationalEventId: event.id,
    eventSequence: event.sequence,
    ticketRevision: ticketAtEvent.revision as TicketRevision["revision"],
    customerReplyWatermark: structuredClone(watermarkAtEvent),
    taxonomyRevision: taxonomyRevision.revision as DiagnosticTaxonomyRevision["revision"],
    retrievalQueryHash: query.queryHash,
  });
  return {
    opportunityId: createOpportunityId({
      ticketId: event.ticketId,
      eventId: event.id,
      eventSequence: event.sequence,
      mode: source.mode,
      queryHash: query.queryHash,
      taxonomyRevision: taxonomyRevision.revision,
    }),
    mode: source.mode,
    ticketId: event.ticketId,
    trigger: { id: event.id, sequence: event.sequence, action: event.action },
    basis,
    query: structuredClone(query),
    retrievalExecution: cloneRetrievalExecution(retrievalExecution),
    input,
  };
}

/** The only H1 query execution currently tied to a committed trigger is evaluation. */
export function hybridShadowModeForEvent(
  event: Pick<OperationalEvent, "action">,
): ReasoningMode | undefined {
  return event.action === "recommendation-submitted" ? "evaluation" : undefined;
}

export interface HybridShadowCaptureSink {
  capture(context: HybridShadowCaptureContext): void | Promise<void>;
  reportFailure?(failure: { code: HybridShadowCaptureFailureCode; commandId: string }): void;
}

function ticketRevisionAt(
  snapshot: OperationalWorkflowSnapshot,
  trigger: OperationalEvent,
): TicketRevision["ticket"] {
  const sequences = eventSequences(snapshot.events);
  const revision = snapshot.ticketRevisions
    .filter((candidate) => candidate.ticketId === trigger.ticketId)
    .map((candidate) => ({ candidate, sequence: sequences.get(candidate.operationalEventId) }))
    .filter((entry): entry is { candidate: TicketRevision; sequence: number } =>
      entry.sequence !== undefined && entry.sequence <= trigger.sequence,
    )
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1)?.candidate;
  if (revision !== undefined) return revision.ticket;

  // A current ticket is safe only when its revision still equals the query basis.
  // Otherwise this snapshot has no event-linked historical ticket to use.
  if (snapshot.ticketRevisions.some((candidate) => {
    const sequence = sequences.get(candidate.operationalEventId);
    return candidate.ticketId === trigger.ticketId && sequence !== undefined && sequence > trigger.sequence;
  })) {
    fail("The ticket revision at the committed event cannot be reconstructed without later-state leakage.");
  }
  return snapshot.ticket;
}

function customerReplyWatermarkAt(
  snapshot: OperationalWorkflowSnapshot,
  trigger: OperationalEvent,
): CustomerReplyWatermark {
  const sequences = eventSequences(snapshot.events);
  const latestReply = snapshot.messages
    .filter((message) => message.ticketId === trigger.ticketId && message.kind === "customer")
    .map((message) => ({ message, sequence: sequences.get(message.operationalEventId) }))
    .filter((entry): entry is { message: typeof snapshot.messages[number]; sequence: number } =>
      entry.sequence !== undefined && entry.sequence <= trigger.sequence,
    )
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1)?.message;
  return latestReply === undefined
    ? { state: "none" }
    : { state: "reply", timestamp: latestReply.createdAt, id: latestReply.id };
}

function customerRepliesAt(
  snapshot: OperationalWorkflowSnapshot,
  trigger: OperationalEvent,
): CustomerReply[] {
  const sequences = eventSequences(snapshot.events);
  return snapshot.messages
    .filter((message) => message.ticketId === trigger.ticketId && message.kind === "customer")
    .map((message) => ({ message, sequence: sequences.get(message.operationalEventId) }))
    .filter((entry): entry is { message: typeof snapshot.messages[number]; sequence: number } =>
      entry.sequence !== undefined && entry.sequence <= trigger.sequence,
    )
    .sort((left, right) => left.sequence - right.sequence)
    .map(({ message }) => ({
      id: message.id,
      ticketId: message.ticketId,
      createdAt: message.createdAt,
      body: message.body,
    }));
}

function assertQueryMatchesCommittedContext(
  query: Query,
  ticket: TicketRevision["ticket"],
  customerReplies: readonly CustomerReply[],
  customerReplyWatermark: CustomerReplyWatermark,
): void {
  const expected = buildRetrievalQuery({
    ticket,
    customerReplies,
    customerReplyWatermark: JSON.stringify(customerReplyWatermark),
    references: deterministicRetrievalReferences({ ticket, customerReplies }),
    ...(query.taxonomy === undefined ? {} : { taxonomy: query.taxonomy }),
  });
  if (
    query.queryHash !== expected.queryHash
    || query.queryText !== expected.queryText
    || query.queryTruncated !== expected.queryTruncated
    || !isDeepStrictEqual(query.references, expected.references)
  ) {
    fail("Hybrid shadow query content or references do not match committed ticket and customer evidence.");
  }
}

function taxonomyRevisionAt(
  snapshot: OperationalWorkflowSnapshot,
  trigger: OperationalEvent,
): DiagnosticTaxonomyRevision | undefined {
  const sequences = eventSequences(snapshot.events);
  return snapshot.diagnosticTaxonomyRevisions
    .filter((revision) => revision.ticketId === trigger.ticketId)
    .map((revision) => ({ revision, sequence: sequences.get(revision.operationalEventId) }))
    .filter((entry): entry is { revision: DiagnosticTaxonomyRevision; sequence: number } =>
      entry.sequence !== undefined && entry.sequence <= trigger.sequence,
    )
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1)?.revision;
}

function eventSequences(events: readonly OperationalEvent[]): Map<string, number> {
  return new Map(events.map(({ id, sequence }) => [id, sequence]));
}

function assertRankingConsistent(query: Query, execution: RetrievalExecution): void {
  const ranking = execution.ranking;
  if (ranking.status !== "succeeded") return;
  const { queryBasis, retrievalIdentity } = ranking.result;
  if (
    queryBasis.queryHash !== query.queryHash
    || queryBasis.ticketId !== query.ticketId
    || queryBasis.ticketRevision !== query.sourceRevision
    || queryBasis.customerReplyWatermark !== query.customerReplyWatermark
  ) {
    fail("Successful ranking query identity does not match the actual retrieval query.");
  }
  const metadata = execution.retrieval.metadata;
  const expectedIdentity = {
    schemaVersion: metadata.schemaVersion,
    representationVersion: metadata.representationVersion,
    generation: metadata.generation,
    lexicalGeneration: metadata.lexicalGeneration,
    semanticGeneration: metadata.semanticGeneration,
    corpusHash: metadata.corpusHash,
    model: metadata.model ?? null,
    state: metadata.state,
  };
  if (!isDeepStrictEqual(retrievalIdentity, expectedIdentity)) {
    fail("Successful ranking retrieval identity does not match the retrieval snapshot.");
  }
}

function cloneRetrievalExecution(execution: RetrievalExecution): RetrievalExecution {
  const retrieval = structuredClone(execution.retrieval);
  if (execution.ranking.status === "not-requested") {
    return { retrieval, ranking: { status: "not-requested" } };
  }
  if (execution.ranking.status === "succeeded") {
    return {
      retrieval,
      ranking: {
        status: "succeeded",
        result: structuredClone(execution.ranking.result),
        durationMs: execution.ranking.durationMs,
      },
    };
  }
  return {
    retrieval,
    ranking: {
      status: "failed",
      error: cloneFailure(execution.ranking.error),
      durationMs: execution.ranking.durationMs,
    },
  };
}

function cloneFailure(value: unknown): unknown {
  if (!(value instanceof Error)) return structuredClone(value);
  const copy = new Error(value.message);
  copy.name = value.name;
  if (value.stack !== undefined) copy.stack = value.stack;
  for (const [key, property] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      value: structuredClone(property),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  if ("cause" in value) {
    Object.defineProperty(copy, "cause", {
      value: cloneFailure((value as Error & { cause?: unknown }).cause),
      configurable: true,
    });
  }
  return copy;
}

function createOpportunityId(input: {
  ticketId: TicketId;
  eventId: OperationalEvent["id"];
  eventSequence: OperationalEvent["sequence"];
  mode: ReasoningMode;
  queryHash: Query["queryHash"];
  taxonomyRevision: DiagnosticTaxonomyRevision["revision"];
}): HybridShadowOpportunityId {
  const stableBasis = JSON.stringify([
    input.ticketId,
    input.eventId,
    input.eventSequence,
    input.mode,
    input.queryHash,
    input.taxonomyRevision,
  ]);
  const digest = createHash("sha256").update(stableBasis).digest("hex");
  return `hybrid-shadow-opportunity:${digest}` as HybridShadowOpportunityId;
}

function fail(message: string): never {
  throw new HybridShadowCaptureError(message);
}
