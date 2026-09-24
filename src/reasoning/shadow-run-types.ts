import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import {
  CustomerReplyWatermarkSchema,
  IsoTimestampSchema,
  TicketIdSchema,
  EvidenceRequirementSchema as DomainEvidenceRequirementSchema,
} from "../domain.js";
import type {
  CustomerReplyWatermark,
  IsoTimestamp,
  TicketId,
} from "../domain.js";
import {
  OperationalEventIdSchema,
  RevisionNumberSchema,
  TicketSequenceSchema,
  type DiagnosticTaxonomyRevision,
  type OperationalEvent,
  type TicketRevision,
} from "../operational/domain.js";
import { isEvidenceRequirementId } from "../evidence-catalog.js";
import type {
  HybridReasoningInput,
  HybridReasoningResult,
  ReasoningMode,
} from "./types.js";

declare const hybridShadowRunIdBrand: unique symbol;
declare const retrievalInputHashBrand: unique symbol;

export type HybridShadowRunId = string & {
  readonly [hybridShadowRunIdBrand]: true;
};

/** Locally branded because the repository has no shared retrieval-input hash identity type. */
export type RetrievalInputHash = string & {
  readonly [retrievalInputHashBrand]: true;
};

export const HybridShadowRunIdSchema = z.uuid().transform(
  (value) => value as HybridShadowRunId,
);

export const RetrievalInputHashSchema = z.string().regex(/^[0-9a-f]{64}$/, {
  message: "Retrieval input hash must be a lowercase SHA-256 hash.",
}).transform((value) => value as RetrievalInputHash);

const ReasoningModeSchema = z.enum(["evaluation", "diagnosis"]);
const NonBlankStringSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  "Value must not be blank.",
);

export interface HybridShadowBasis {
  operationalEventId: OperationalEvent["id"];
  eventSequence: OperationalEvent["sequence"];
  ticketRevision: TicketRevision["revision"];
  customerReplyWatermark: CustomerReplyWatermark;
  taxonomyRevision: DiagnosticTaxonomyRevision["revision"];
  retrievalInputHash: RetrievalInputHash;
  knowledgeAsOf: IsoTimestamp;
}

export const HybridShadowBasisSchema = z.object({
  operationalEventId: OperationalEventIdSchema,
  eventSequence: TicketSequenceSchema,
  ticketRevision: RevisionNumberSchema,
  customerReplyWatermark: CustomerReplyWatermarkSchema,
  taxonomyRevision: RevisionNumberSchema.refine((value) => value > 0, {
    message: "Taxonomy revision must be positive.",
  }),
  retrievalInputHash: RetrievalInputHashSchema,
  knowledgeAsOf: IsoTimestampSchema,
}).strict();

export interface ReasoningProviderIdentity {
  providerId: string;
  modelId: string;
}

export const ReasoningProviderIdentitySchema = z.object({
  providerId: NonBlankStringSchema,
  modelId: NonBlankStringSchema,
}).strict();

export interface HybridShadowRunFailure {
  code: string;
  message: string;
}

export const HybridShadowRunFailureSchema = z.object({
  code: NonBlankStringSchema.max(120),
  message: NonBlankStringSchema.max(2_000),
}).strict();

const ReasoningBasisSchema = z.looseObject({
  ticketId: TicketIdSchema,
  ticketRevision: RevisionNumberSchema,
  customerReplyWatermark: CustomerReplyWatermarkSchema,
  retrievalIndex: z.looseObject({
    schemaVersion: z.number().int().nonnegative(),
    representationVersion: z.number().int().nonnegative(),
    generation: z.number().int().nonnegative(),
    lexicalGeneration: z.number().int().nonnegative(),
    semanticGeneration: z.number().int().nonnegative(),
    corpusHash: z.string(),
    state: z.enum(["ready", "degraded", "rebuilding", "stale", "unavailable"]),
    model: z.looseObject({
      id: NonBlankStringSchema,
      revision: NonBlankStringSchema,
      dimensions: z.number().int().positive(),
    }).optional(),
  }),
});

const JsonRecordSchema = z.record(z.string(), z.unknown());
const ReferenceSnapshotSchema = z.looseObject({
  resourceKey: NonBlankStringSchema,
  channel: z.enum(["deterministic-reference", "known-cause-reference"]),
  sourceId: NonBlankStringSchema,
  sourceVersion: z.string().optional(),
  reason: z.enum(["classifier-association", "known-cause-link", "safety-inclusion"]),
});
const CandidateSnapshotSchema = z.looseObject({
  resourceKey: NonBlankStringSchema,
  resourceType: NonBlankStringSchema,
  deterministicReferences: z.array(ReferenceSnapshotSchema),
  knownCauseReferences: z.array(ReferenceSnapshotSchema),
});
const ChannelStateSchema = z.looseObject({
  status: z.enum(["used", "unavailable", "stale", "failed"]),
  reason: z.string().optional(),
});
const RankingResultSnapshotSchema = z.looseObject({
  contractVersion: z.literal(1),
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
});
const RankingExecutionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not-requested") }).strict(),
  z.looseObject({
    status: z.literal("succeeded"),
    result: RankingResultSnapshotSchema,
    durationMs: z.number().nonnegative(),
  }),
  z.object({
    status: z.literal("failed"),
    durationMs: z.number().nonnegative(),
  }).strict(),
]);

const EvidenceObservationSnapshotSchema = z.looseObject({
  id: NonBlankStringSchema,
  fact: z.string(),
  provenance: z.looseObject({
    sourceType: NonBlankStringSchema,
    sourceId: NonBlankStringSchema,
  }),
  observedAt: IsoTimestampSchema.optional(),
  validAt: IsoTimestampSchema.optional(),
  freshnessPolicy: z.string().optional(),
  expiresAt: IsoTimestampSchema.optional(),
});

const HybridReasoningInputSchema = z.looseObject({
  mode: ReasoningModeSchema,
  basis: ReasoningBasisSchema,
  observations: z.array(EvidenceObservationSnapshotSchema),
  retrievalCandidates: z.array(CandidateSnapshotSchema),
  retrieval: z.looseObject({
    lexical: ChannelStateSchema,
    semantic: ChannelStateSchema,
    referenceDiagnostics: z.array(JsonRecordSchema),
  }),
  ranking: RankingExecutionSchema,
});

const EvidenceRequirementSnapshotSchema = DomainEvidenceRequirementSchema.extend({
  id: NonBlankStringSchema.refine(isEvidenceRequirementId, {
    message: "Evidence requirement ID is not in the repository catalog.",
  }),
});

const HybridReasoningResultSchema = z.looseObject({
  mode: ReasoningModeSchema,
  basis: ReasoningBasisSchema,
  evidenceRequirements: z.array(EvidenceRequirementSnapshotSchema),
  hypotheses: z.array(z.looseObject({
    id: NonBlankStringSchema,
    statement: NonBlankStringSchema,
    rank: z.number().int().positive(),
    evidenceRequirementIds: z.array(NonBlankStringSchema).optional(),
  })),
  relationships: z.array(z.looseObject({
    hypothesisId: NonBlankStringSchema,
    evidenceId: NonBlankStringSchema,
    relationship: z.union([
      z.enum(["supports", "contradicts"]),
      z.looseObject({ type: z.literal("other"), label: NonBlankStringSchema }),
    ]),
    rationale: z.string().optional(),
  })),
  actions: z.array(z.looseObject({
    id: NonBlankStringSchema,
    description: NonBlankStringSchema,
    hypothesisIds: z.array(NonBlankStringSchema).min(1),
    requirementIds: z.array(NonBlankStringSchema).optional(),
  })),
});

const HybridShadowRunCommonSchema = z.looseObject({
  runId: HybridShadowRunIdSchema,
  ticketId: TicketIdSchema,
  mode: ReasoningModeSchema,
  provider: ReasoningProviderIdentitySchema,
  recordedAt: IsoTimestampSchema,
  basis: HybridShadowBasisSchema,
  input: HybridReasoningInputSchema,
});

const HybridShadowRunSchema = z.discriminatedUnion("status", [
  HybridShadowRunCommonSchema.extend({
    status: z.literal("completed"),
    result: HybridReasoningResultSchema,
    failure: z.never().optional(),
  }),
  HybridShadowRunCommonSchema.extend({
    status: z.literal("failed"),
    result: z.never().optional(),
    failure: HybridShadowRunFailureSchema,
  }),
]);

interface HybridShadowRunCommon {
  runId: HybridShadowRunId;
  ticketId: TicketId;
  mode: ReasoningMode;
  provider: ReasoningProviderIdentity;
  recordedAt: IsoTimestamp;
  basis: HybridShadowBasis;
  input: HybridReasoningInput;
}

export type HybridShadowRun = HybridShadowRunCommon & (
  | {
    status: "completed";
    result: HybridReasoningResult;
    failure?: never;
  }
  | {
    status: "failed";
    result?: never;
    failure: HybridShadowRunFailure;
  }
);

export function parseHybridShadowRun(value: unknown): HybridShadowRun {
  const parsed = HybridShadowRunSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Hybrid shadow-run payload does not match the supported contract.");
  }

  const run = parsed.data as unknown as HybridShadowRun;
  if (
    run.input.mode !== run.mode
    || run.input.basis.ticketId !== run.ticketId
    || run.input.basis.ticketRevision !== run.basis.ticketRevision
    || !sameReplyWatermark(run.input.basis.customerReplyWatermark, run.basis.customerReplyWatermark)
  ) {
    throw new Error("Hybrid shadow-run metadata does not match its reasoning input.");
  }

  if (run.status === "completed") {
    if (
      run.result.mode !== run.mode
      || !sameReasoningBasis(run.result.basis, run.input.basis)
    ) {
      throw new Error("Hybrid shadow-run result does not match its reasoning input.");
    }
  }
  return run;
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
