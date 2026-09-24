import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  CustomerReplyWatermarkSchema,
  EvidenceRequirementSchema as DomainEvidenceRequirementSchema,
  IsoTimestampSchema,
  TicketIdSchema,
} from "../domain.js";
import type { CustomerReplyWatermark, IsoTimestamp, TicketId } from "../domain.js";
import { isEvidenceRequirementId } from "../evidence-catalog.js";
import type { EvidenceRequirementId } from "../evidence-catalog.js";
import type { ApplicabilityReasoningExecution } from "../retrieval/applicability-types.js";
import {
  OperationalEventIdSchema,
  RevisionNumberSchema,
  TicketSequenceSchema,
  type DiagnosticTaxonomyRevision,
  type OperationalEvent,
  type TicketRevision,
} from "../operational/domain.js";
import type {
  Candidate,
  ChannelState,
  IndexMetadata,
  ModelIdentity,
  Query,
  Reference,
  ReferenceDiagnostic,
  ResourceKey,
  ResourceType,
} from "../retrieval/types.js";
import type { RankingPolicy, RankingResult } from "../retrieval/ranking-types.js";
import type {
  EvidenceAction,
  EvidenceObservation,
  EvidenceRelationship,
  EvidenceRequirement,
  HybridReasoningInput,
  HybridReasoningResult,
  ReasoningMode,
  ReasoningRankingExecution,
} from "./types.js";
import type { HybridShadowOpportunityId } from "./hybrid-shadow-capture.js";

declare const hybridShadowRunIdBrand: unique symbol;
declare const hybridShadowExecutionKeyBrand: unique symbol;

export const LEGACY_HYBRID_SHADOW_RUN_PAYLOAD_VERSION = 1 as const;
export const HYBRID_SHADOW_RUN_PAYLOAD_VERSION = 2 as const;

export type HybridShadowRunId = string & {
  readonly [hybridShadowRunIdBrand]: true;
};

export const HybridShadowRunIdSchema = z.uuid().transform(
  (value) => value as HybridShadowRunId,
);

export type HybridShadowExecutionKey = string & {
  readonly [hybridShadowExecutionKeyBrand]: true;
};

export const HybridShadowOpportunityIdSchema: z.ZodType<HybridShadowOpportunityId> = z.string()
  .regex(/^hybrid-shadow-opportunity:[a-f0-9]{64}$/)
  .transform((value) => value as HybridShadowOpportunityId);

export const HybridShadowExecutionKeySchema: z.ZodType<HybridShadowExecutionKey> = z.string()
  .regex(/^[a-f0-9]{64}$/)
  .transform((value) => value as HybridShadowExecutionKey);

const ReasoningModeSchema = z.enum(["evaluation", "diagnosis"]);
const NonBlankStringSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  "Value must not be blank.",
);
const FiniteNumberSchema = z.number().finite();
const NonnegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();

export interface HybridShadowBasis {
  operationalEventId: OperationalEvent["id"];
  /** Trigger identity; this is not the end of the committed state snapshot. */
  eventSequence: OperationalEvent["sequence"];
  /** Highest event sequence committed atomically by the triggering operation. */
  snapshotThroughSequence: OperationalEvent["sequence"];
  ticketRevision: TicketRevision["revision"];
  customerReplyWatermark: CustomerReplyWatermark;
  taxonomyRevision: DiagnosticTaxonomyRevision["revision"];
  /** Query identity from Query.queryHash, before any optional ranking execution. */
  retrievalQueryHash: Query["queryHash"];
}

/**
 * The retrieval knowledge snapshot is persisted once on input.basis.retrievalIndex.
 * Its IndexMetadata identity replaces the former synthetic knowledge-as-of time.
 */
const HybridShadowBasisInputSchema = z.object({
  operationalEventId: OperationalEventIdSchema,
  eventSequence: TicketSequenceSchema,
  snapshotThroughSequence: TicketSequenceSchema.optional(),
  ticketRevision: RevisionNumberSchema,
  customerReplyWatermark: CustomerReplyWatermarkSchema,
  taxonomyRevision: RevisionNumberSchema.refine((value) => value > 0, {
    message: "Taxonomy revision must be positive.",
  }),
  retrievalQueryHash: z.string(),
}).strict().superRefine((basis, context) => {
  if (basis.snapshotThroughSequence !== undefined && basis.snapshotThroughSequence < basis.eventSequence) {
    context.addIssue({
      code: "custom",
      path: ["snapshotThroughSequence"],
      message: "Snapshot boundary cannot precede its trigger event.",
    });
  }
});

export const HybridShadowBasisSchema: z.ZodType<HybridShadowBasis> = HybridShadowBasisInputSchema.transform(
  (basis) => ({
    ...basis,
    // H4a payloads were captured strictly as of the trigger sequence, so this
    // preserves their recorded semantics while H4b records the full atomic boundary.
    snapshotThroughSequence: basis.snapshotThroughSequence ?? basis.eventSequence,
  }),
);

/** Reuses the existing B5 execution provenance vocabulary; it does not imply model authority. */
export type ReasoningProviderIdentity = Pick<
  ApplicabilityReasoningExecution["telemetry"],
  "providerKind" | "model"
>;

export const ReasoningProviderIdentitySchema: z.ZodType<ReasoningProviderIdentity> = z.object({
  providerKind: z.enum(["openai-responses", "controlled-test"]),
  model: NonBlankStringSchema,
}).strict();

export interface HybridShadowRunFailure {
  code: string;
  message: string;
}

export const HybridShadowRunFailureSchema: z.ZodType<HybridShadowRunFailure> = z.object({
  code: NonBlankStringSchema.max(120),
  message: NonBlankStringSchema.max(2_000),
}).strict();

const ReasoningBasisSchema: z.ZodType<HybridReasoningInput["basis"]> = z.object({
  ticketId: TicketIdSchema,
  ticketRevision: RevisionNumberSchema,
  customerReplyWatermark: CustomerReplyWatermarkSchema,
  retrievalIndex: z.object({
    schemaVersion: NonnegativeIntegerSchema,
    representationVersion: NonnegativeIntegerSchema,
    generation: NonnegativeIntegerSchema,
    lexicalGeneration: NonnegativeIntegerSchema,
    semanticGeneration: NonnegativeIntegerSchema,
    corpusHash: z.string(),
    model: z.object({
      id: NonBlankStringSchema,
      revision: NonBlankStringSchema,
      dimensions: PositiveIntegerSchema,
    }).strict().optional(),
    state: z.enum(["ready", "degraded", "rebuilding", "stale", "unavailable"]),
  }).strict(),
}).strict();

const EvidenceObservationIdSchema = NonBlankStringSchema.transform(
  (value) => value as EvidenceObservation["id"],
);
const EvidenceActionIdSchema = NonBlankStringSchema.transform(
  (value) => value as EvidenceAction["id"],
);
const EvidenceRequirementIdSchema = z.string().refine(
  (value): value is EvidenceRequirementId => isEvidenceRequirementId(value),
  { message: "Evidence requirement ID is not in the repository catalog." },
);

const EvidenceObservationSchema: z.ZodType<EvidenceObservation> = z.object({
  id: EvidenceObservationIdSchema,
  fact: z.string(),
  provenance: z.object({
    sourceType: NonBlankStringSchema,
    sourceId: NonBlankStringSchema,
    sourceRevision: z.union([z.string(), FiniteNumberSchema]).optional(),
  }).strict(),
  observedAt: IsoTimestampSchema.optional(),
  validAt: IsoTimestampSchema.optional(),
  freshnessPolicy: z.string().optional(),
  expiresAt: IsoTimestampSchema.optional(),
}).strict();

const EvidenceRequirementSnapshotSchema: z.ZodType<EvidenceRequirement> =
  DomainEvidenceRequirementSchema.extend({ id: EvidenceRequirementIdSchema }).strict();

const HypothesisSchema: z.ZodType<HybridReasoningResult["hypotheses"][number]> = z.object({
  id: NonBlankStringSchema,
  statement: NonBlankStringSchema,
  rank: PositiveIntegerSchema,
  evidenceRequirementIds: z.array(EvidenceRequirementIdSchema).optional(),
}).strict();

const EvidenceRelationshipKindSchema: z.ZodType<EvidenceRelationship["relationship"]> = z.union([
  z.enum(["supports", "contradicts"]),
  z.object({ type: z.literal("other"), label: NonBlankStringSchema }).strict(),
]);

const EvidenceRelationshipSchema: z.ZodType<EvidenceRelationship> = z.object({
  hypothesisId: NonBlankStringSchema,
  evidenceId: EvidenceObservationIdSchema,
  relationship: EvidenceRelationshipKindSchema,
  rationale: z.string().optional(),
}).strict();

const EvidenceActionSchema: z.ZodType<EvidenceAction> = z.object({
  id: EvidenceActionIdSchema,
  description: NonBlankStringSchema,
  hypothesisIds: z.tuple([NonBlankStringSchema]).rest(NonBlankStringSchema),
  requirementIds: z.array(EvidenceRequirementIdSchema).optional(),
}).strict();

const ResourceTypes = [
  "knowledge-article",
  "known-cause",
  "diagnostic-playbook",
  "resolved-ticket",
] as const satisfies readonly ResourceType[];
const ResourceTypeSchema = z.enum(ResourceTypes);

function isResourceKey(value: unknown): value is ResourceKey {
  return typeof value === "string"
    && ResourceTypes.some((resourceType) =>
      value.startsWith(`${resourceType}:`) && value.length > resourceType.length + 1);
}

const ResourceKeySchema = z.custom<ResourceKey>(isResourceKey, {
  message: "Resource key must use a supported retrieval resource type.",
});

const TaxonomyMetadataSchema = z.object({
  productSurfaces: z.array(z.string()),
  problemClasses: z.array(z.string()),
}).strict();

const ReferenceSchema: z.ZodType<Reference> = z.object({
  resourceKey: ResourceKeySchema,
  channel: z.enum(["deterministic-reference", "known-cause-reference"]),
  sourceId: z.string(),
  sourceVersion: z.string().optional(),
  reason: z.enum(["classifier-association", "known-cause-link", "safety-inclusion"]),
}).strict();

const ReferenceDiagnosticSchema: z.ZodType<ReferenceDiagnostic> = z.object({
  resourceKey: ResourceKeySchema,
  channel: z.enum(["deterministic-reference", "known-cause-reference"]),
  reason: z.literal("missing-resource"),
}).strict();

const MatchSchema = z.object({
  representationId: z.string(),
  resourceKey: ResourceKeySchema,
  score: FiniteNumberSchema,
  rank: FiniteNumberSchema,
}).strict();

const CandidateSchema: z.ZodType<Candidate> = z.object({
  resourceKey: ResourceKeySchema,
  resourceType: ResourceTypeSchema,
  lexical: z.object({
    bestRank: FiniteNumberSchema,
    bestBm25Score: FiniteNumberSchema,
    matches: z.array(MatchSchema),
  }).strict().optional(),
  semantic: z.object({
    bestRank: FiniteNumberSchema,
    bestCosineSimilarity: FiniteNumberSchema,
    matches: z.array(MatchSchema),
  }).strict().optional(),
  deterministicReferences: z.array(ReferenceSchema),
  knownCauseReferences: z.array(ReferenceSchema),
  taxonomy: TaxonomyMetadataSchema.optional(),
}).strict();

const ChannelStateSchema = z.object({
  status: z.enum(["used", "unavailable", "stale", "failed"]),
  reason: z.enum([
    "provider-not-configured",
    "provider-timeout",
    "provider-http-error",
    "provider-unreachable",
    "provider-invalid-response",
    "cancelled",
    "model-version-changed",
    "pending-vectors",
    "source-unavailable",
    "fts-query-error",
    "index-integrity-error",
    "index-unavailable",
    "index-upgrade-required",
  ]).optional(),
}).strict() satisfies z.ZodType<ChannelState>;

const RetrievalObservationSchema = z.object({
  lexical: ChannelStateSchema,
  semantic: ChannelStateSchema,
  referenceDiagnostics: z.array(ReferenceDiagnosticSchema),
}).strict();

const ModelIdentitySchema: z.ZodType<ModelIdentity> = z.object({
  id: z.string(),
  revision: z.string(),
  dimensions: PositiveIntegerSchema,
}).strict();

const IndexMetadataSchema = z.object({
  schemaVersion: NonnegativeIntegerSchema,
  representationVersion: NonnegativeIntegerSchema,
  generation: NonnegativeIntegerSchema,
  lexicalGeneration: NonnegativeIntegerSchema,
  semanticGeneration: NonnegativeIntegerSchema,
  corpusHash: z.string(),
  model: ModelIdentitySchema.optional(),
  state: z.enum(["ready", "degraded", "rebuilding", "stale", "unavailable"]),
}).strict() satisfies z.ZodType<IndexMetadata>;

const RankingPolicySchema: z.ZodType<RankingPolicy> = z.discriminatedUnion("kind", [
  z.object({ id: z.literal("lexical-only-v1"), kind: z.literal("lexical-only") }).strict(),
  z.object({ id: z.literal("semantic-only-v1"), kind: z.literal("semantic-only") }).strict(),
  z.object({
    id: z.literal("rrf-equal-v1"),
    kind: z.literal("rrf-equal"),
    constant: z.union([z.literal(10), z.literal(30), z.literal(60)]),
  }).strict(),
]);

const RankingQueryBasisSchema = z.object({
  queryHash: z.string(),
  ticketId: z.string(),
  ticketRevision: NonnegativeIntegerSchema,
  customerReplyWatermark: z.string().nullable(),
}).strict();

const RetrievalIdentitySchema = z.object({
  schemaVersion: NonnegativeIntegerSchema,
  representationVersion: NonnegativeIntegerSchema,
  generation: NonnegativeIntegerSchema,
  lexicalGeneration: NonnegativeIntegerSchema,
  semanticGeneration: NonnegativeIntegerSchema,
  corpusHash: z.string(),
  model: ModelIdentitySchema.nullable(),
  state: z.enum(["ready", "degraded", "rebuilding", "stale", "unavailable"]),
}).strict();

const RankingContributionSchema = z.object({
  channel: z.enum(["lexical", "semantic"]),
  resourceRank: FiniteNumberSchema,
  contribution: FiniteNumberSchema,
}).strict();

const RankedMembershipSchema = z.object({
  resourceKey: ResourceKeySchema,
  resourceType: ResourceTypeSchema,
  position: PositiveIntegerSchema,
  lexicalResourceRank: FiniteNumberSchema.nullable(),
  semanticResourceRank: FiniteNumberSchema.nullable(),
  selectedChannel: z.enum(["lexical", "semantic"]).nullable(),
  selectedRawScore: FiniteNumberSchema.nullable(),
  rrfScore: FiniteNumberSchema.nullable(),
  contributions: z.array(RankingContributionSchema),
}).strict();

const RankedTypeResultSchema = z.object({
  resourceType: ResourceTypeSchema,
  poolCount: NonnegativeIntegerSchema,
  returnedCount: NonnegativeIntegerSchema,
  omittedCount: NonnegativeIntegerSchema,
  memberships: z.array(RankedMembershipSchema),
}).strict();

const ReferenceMembershipSchema = z.object({
  resourceKey: ResourceKeySchema,
  resourceType: ResourceTypeSchema,
  provenance: z.array(ReferenceSchema),
}).strict();

const RankingChannelSummarySchema = z.object({
  lexical: z.object({
    status: z.enum(["used", "unavailable", "stale", "failed"]),
    reason: z.enum([
      "provider-not-configured",
      "provider-timeout",
      "provider-http-error",
      "provider-unreachable",
      "provider-invalid-response",
      "cancelled",
      "model-version-changed",
      "pending-vectors",
      "source-unavailable",
      "fts-query-error",
      "index-integrity-error",
      "index-unavailable",
      "index-upgrade-required",
    ]).nullable(),
    candidateCount: NonnegativeIntegerSchema,
  }).strict(),
  semantic: z.object({
    status: z.enum(["used", "unavailable", "stale", "failed"]),
    reason: z.enum([
      "provider-not-configured",
      "provider-timeout",
      "provider-http-error",
      "provider-unreachable",
      "provider-invalid-response",
      "cancelled",
      "model-version-changed",
      "pending-vectors",
      "source-unavailable",
      "fts-query-error",
      "index-integrity-error",
      "index-unavailable",
      "index-upgrade-required",
    ]).nullable(),
    candidateCount: NonnegativeIntegerSchema,
    partial: z.boolean(),
  }).strict(),
  contributingChannels: z.array(z.enum(["lexical", "semantic"])),
  partialSemanticCoverage: z.boolean(),
}).strict();

const RankingByTypeSchema: z.ZodType<RankingResult["byType"]> = z.object({
  "knowledge-article": RankedTypeResultSchema,
  "known-cause": RankedTypeResultSchema,
  "diagnostic-playbook": RankedTypeResultSchema,
  "resolved-ticket": RankedTypeResultSchema,
}).strict();

const RankingResultSchema: z.ZodType<RankingResult> = z.object({
  contractVersion: z.literal(1),
  policy: RankingPolicySchema,
  tieBreak: z.literal("ordinal-resource-key"),
  queryBasis: RankingQueryBasisSchema,
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
  retrievalIdentity: RetrievalIdentitySchema,
  channelSummary: RankingChannelSummarySchema,
  byType: RankingByTypeSchema,
  references: z.array(ReferenceMembershipSchema),
  referenceDiagnostics: z.array(ReferenceDiagnosticSchema),
  candidates: z.array(CandidateSchema),
}).strict();

const RankingExecutionSchema: z.ZodType<ReasoningRankingExecution> = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not-requested") }).strict(),
  z.object({
    status: z.literal("succeeded"),
    result: RankingResultSchema,
    durationMs: z.number().finite().nonnegative(),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    durationMs: z.number().finite().nonnegative(),
  }).strict(),
]);

const HybridReasoningInputSchema: z.ZodType<HybridReasoningInput> = z.object({
  mode: ReasoningModeSchema,
  basis: ReasoningBasisSchema,
  observations: z.array(EvidenceObservationSchema),
  retrievalCandidates: z.array(CandidateSchema),
  retrieval: RetrievalObservationSchema,
  ranking: RankingExecutionSchema,
}).strict();

const HybridReasoningResultSchema: z.ZodType<HybridReasoningResult> = z.object({
  mode: ReasoningModeSchema,
  basis: ReasoningBasisSchema,
  evidenceRequirements: z.array(EvidenceRequirementSnapshotSchema),
  hypotheses: z.array(HypothesisSchema),
  relationships: z.array(EvidenceRelationshipSchema),
  actions: z.array(EvidenceActionSchema),
}).strict();

interface HybridShadowRunCommon {
  runId: HybridShadowRunId;
  ticketId: TicketId;
  mode: ReasoningMode;
  provider: ReasoningProviderIdentity;
  recordedAt: IsoTimestamp;
  basis: HybridShadowBasis;
  input: HybridReasoningInput;
}

type HybridShadowRunStatus =
  | {
      status: "completed";
      result: HybridReasoningResult;
      failure?: never;
    }
  | {
      status: "failed";
      result?: never;
      failure: HybridShadowRunFailure;
    };

export type LegacyHybridShadowRun = HybridShadowRunCommon & HybridShadowRunStatus;

export type HybridShadowRunV2 = HybridShadowRunCommon & {
  opportunityId: HybridShadowOpportunityId;
  executionKey: HybridShadowExecutionKey;
} & HybridShadowRunStatus;

export type HybridShadowRun = LegacyHybridShadowRun | HybridShadowRunV2;

const HybridShadowRunCommonSchema = z.object({
  runId: HybridShadowRunIdSchema,
  ticketId: TicketIdSchema,
  mode: ReasoningModeSchema,
  provider: ReasoningProviderIdentitySchema,
  recordedAt: IsoTimestampSchema,
  basis: HybridShadowBasisSchema,
  input: HybridReasoningInputSchema,
}).strict();

/** Exact schema for the JSON payload version stored beside each SQLite row. */
const HybridShadowRunPayloadV1Schema: z.ZodType<LegacyHybridShadowRun> = z.discriminatedUnion("status", [
  HybridShadowRunCommonSchema.extend({
    status: z.literal("completed"),
    result: HybridReasoningResultSchema,
  }).strict(),
  HybridShadowRunCommonSchema.extend({
    status: z.literal("failed"),
    failure: HybridShadowRunFailureSchema,
  }).strict(),
]);

const HybridShadowRunPayloadV2Schema: z.ZodType<HybridShadowRunV2> = z.discriminatedUnion("status", [
  HybridShadowRunCommonSchema.extend({
    opportunityId: HybridShadowOpportunityIdSchema,
    executionKey: HybridShadowExecutionKeySchema,
    status: z.literal("completed"),
    result: HybridReasoningResultSchema,
  }).strict(),
  HybridShadowRunCommonSchema.extend({
    opportunityId: HybridShadowOpportunityIdSchema,
    executionKey: HybridShadowExecutionKeySchema,
    status: z.literal("failed"),
    failure: HybridShadowRunFailureSchema,
  }).strict(),
]);

export function parseHybridShadowRun(value: unknown): HybridShadowRun {
  if (isRecord(value) && ("opportunityId" in value || "executionKey" in value)) {
    return parseHybridShadowRunV2(value);
  }
  return parseLegacyHybridShadowRun(value);
}

export function parseLegacyHybridShadowRun(value: unknown): LegacyHybridShadowRun {
  const parsed = HybridShadowRunPayloadV1Schema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Hybrid shadow-run payload does not match the supported contract.");
  }

  return validateHybridShadowRun(parsed.data);
}

export function parseHybridShadowRunV2(value: unknown): HybridShadowRunV2 {
  const parsed = HybridShadowRunPayloadV2Schema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Hybrid shadow-run payload does not match the supported contract.");
  }

  return validateHybridShadowRun(parsed.data);
}

function validateHybridShadowRun<T extends HybridShadowRun>(run: T): T {
  if (
    run.input.mode !== run.mode
    || run.input.basis.ticketId !== run.ticketId
    || run.input.basis.ticketRevision !== run.basis.ticketRevision
    || !sameReplyWatermark(run.input.basis.customerReplyWatermark, run.basis.customerReplyWatermark)
  ) {
    throw new Error("Hybrid shadow-run metadata does not match its reasoning input.");
  }

  if (
    run.input.ranking.status === "succeeded"
    && run.input.ranking.result.queryBasis.queryHash !== run.basis.retrievalQueryHash
  ) {
    throw new Error("Ranking query identity does not match the shadow-run retrieval query.");
  }

  if (run.status === "completed") {
    if (
      run.result.mode !== run.mode
      || !sameReasoningBasis(run.result.basis, run.input.basis)
    ) {
      throw new Error("Hybrid shadow-run result does not match its reasoning input.");
    }
    validateReasoningGraph(run.result, run.input.observations);
  }
  return run;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateReasoningGraph(
  result: HybridReasoningResult,
  observations: readonly EvidenceObservation[],
): void {
  assertUniqueIds(observations, "observation");
  assertUniqueIds(result.evidenceRequirements, "evidence requirement");
  assertUniqueIds(result.hypotheses, "hypothesis");
  assertUniqueIds(result.actions, "evidence action");

  const observationIds = new Set(observations.map(({ id }) => id));
  const requirementIds = new Set(result.evidenceRequirements.map(({ id }) => id));
  const hypothesisIds = new Set(result.hypotheses.map(({ id }) => id));

  for (const hypothesis of result.hypotheses) {
    for (const requirementId of hypothesis.evidenceRequirementIds ?? []) {
      assertKnownId(requirementIds, requirementId, "hypothesis evidence requirement");
    }
  }
  for (const relationship of result.relationships) {
    assertKnownId(hypothesisIds, relationship.hypothesisId, "relationship hypothesis");
    assertKnownId(observationIds, relationship.evidenceId, "relationship observation");
  }
  for (const action of result.actions) {
    for (const hypothesisId of action.hypothesisIds) {
      assertKnownId(hypothesisIds, hypothesisId, "action hypothesis");
    }
    for (const requirementId of action.requirementIds ?? []) {
      assertKnownId(requirementIds, requirementId, "action evidence requirement");
    }
  }
}

function assertUniqueIds(items: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const { id } of items) {
    if (ids.has(id)) throw new Error(`Hybrid reasoning graph has duplicate ${label} IDs.`);
    ids.add(id);
  }
}

function assertKnownId(ids: ReadonlySet<string>, id: string, label: string): void {
  if (!ids.has(id)) throw new Error(`Hybrid reasoning graph has an unknown ${label} ID.`);
}

function sameReplyWatermark(
  left: CustomerReplyWatermark,
  right: CustomerReplyWatermark,
): boolean {
  if (left.state !== right.state) return false;
  return left.state === "none"
    || (right.state === "reply" && left.timestamp === right.timestamp && left.id === right.id);
}

function sameReasoningBasis(
  left: HybridReasoningInput["basis"],
  right: HybridReasoningInput["basis"],
): boolean {
  return left.ticketId === right.ticketId
    && left.ticketRevision === right.ticketRevision
    && sameReplyWatermark(left.customerReplyWatermark, right.customerReplyWatermark)
    && isDeepStrictEqual(left.retrievalIndex, right.retrievalIndex);
}
