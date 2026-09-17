import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { rankRetrieval } from "./ranking.js";
import type {
  RankingInput,
  RankingOutputLimits,
  RetrievalIdentity,
} from "./ranking-types.js";
import type {
  Limits,
  ModelIdentity,
  ResourceType,
  RetrievalResult,
} from "./types.js";

export const RANKING_CAPTURE_FORMAT_VERSION = 1 as const;

export type RankingCaptureQueryFormat = {
  kind: string;
  template: string;
};

export type RankingCaptureModel = {
  tag: string;
  digest: string;
  dimensions: number;
} | null;

export type RankingCaptureIdentity = {
  split: "development";
  caseSetHash: string;
  labelHash: string;
  manifestHash: string;
  caseIds: readonly string[];
  reviewStatus: "approved";
  sourceCutoff: string;
  contentSourceRevision: string;
  corpusHash: string;
  queryFormatIdentity: RankingCaptureQueryFormat;
  providerKind: string;
  model: RankingCaptureModel;
  representationVersion: number;
  retrievalLimits: Limits;
  outputLimits: RankingOutputLimits;
  indexIdentity: RetrievalIdentity;
};

export type RankingCaptureCase = {
  caseId: string;
  split: "development";
  caseSetHash: string;
  labelHash: string;
  manifestHash: string;
  corpusHash: string;
  contentSourceRevision: string;
  queryFormatIdentity: RankingCaptureQueryFormat;
  providerKind: string;
  model: RankingCaptureModel;
  representationVersion: number;
  retrievalLimits: Limits;
  indexIdentity: RetrievalIdentity;
  queryBasis: RankingInput["queryBasis"];
  retrieval: RetrievalResult;
  rankingProvenance: {
    contractVersion: 1;
    inputHash: string;
    retrievalIdentity: RetrievalIdentity;
    outputLimits: RankingOutputLimits;
    tieBreak: "ordinal-resource-key";
  };
  timingsMs: {
    retrieval: number;
    provider: number;
    ranking: number | null;
  };
  traceTruncated: false;
};

export type RankingCapture = {
  formatVersion: typeof RANKING_CAPTURE_FORMAT_VERSION;
  captureHash: string;
  evaluatorSourceRevision: string;
  identity: RankingCaptureIdentity;
  cases: readonly RankingCaptureCase[];
};

type CaptureWithoutHash = Omit<RankingCapture, "captureHash">;

const RESOURCE_TYPES = [
  "knowledge-article",
  "known-cause",
  "diagnostic-playbook",
  "resolved-ticket",
] as const satisfies readonly ResourceType[];

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UNSAFE_FIELD = /(?:querytext|rawquery|prompt|embedding|vector|provider.?payload|secret|password|account.?identifier|ticket.?body|(?:^|[-_.])(?:query|body|description|subject|text|raw)$)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid B4 ranking capture: ${message}`);
}

function assertHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) fail(`${field} must be a lowercase SHA-256 hash.`);
}

function assertNonBlank(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${field} must be nonblank.`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalRankingCaptureJson(value: unknown): string {
  const json = JSON.stringify(canonicalize(value));
  if (json === undefined) fail("capture cannot be serialized as JSON.");
  return json;
}

export function hashCanonicalRankingCapture(value: unknown): string {
  return createHash("sha256").update(canonicalRankingCaptureJson(value), "utf8").digest("hex");
}

function withoutCaptureHash(capture: RankingCapture): CaptureWithoutHash {
  const { captureHash: _captureHash, ...withoutHash } = capture;
  return withoutHash;
}

function same(left: unknown, right: unknown): boolean {
  return canonicalRankingCaptureJson(left) === canonicalRankingCaptureJson(right);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertExactKeys(value: unknown, field: string, allowed: readonly string[], required: readonly string[] = allowed): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${field} must be an object.`);
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedKeys.has(key)) fail(`${field}.${key} is not an allowed field.`);
  for (const key of required) if (!hasOwn(value, key)) fail(`${field}.${key} is required.`);
}

function assertNoUnsafeFields(value: unknown, path = "capture"): void {
  if (Array.isArray(value)) {
    value.forEach((nested, index) => assertNoUnsafeFields(nested, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_FIELD.test(key)) fail(`${path}.${key} is not permitted in a sanitized capture.`);
    assertNoUnsafeFields(nested, `${path}.${key}`);
  }
}

function assertModel(value: unknown, field: string): asserts value is RankingCaptureModel {
  if (value === null) return;
  assertExactKeys(value, field, ["tag", "digest", "dimensions"]);
  assertNonBlank(value.tag, `${field}.tag`);
  assertNonBlank(value.digest, `${field}.digest`);
  if (typeof value.dimensions !== "number" || !Number.isSafeInteger(value.dimensions) || value.dimensions < 1) fail(`${field}.dimensions must be a positive safe integer.`);
}

function assertIndexModel(value: unknown, field: string): asserts value is ModelIdentity {
  assertExactKeys(value, field, ["id", "revision", "dimensions"]);
  assertNonBlank(value.id, `${field}.id`);
  assertNonBlank(value.revision, `${field}.revision`);
  if (typeof value.dimensions !== "number" || !Number.isSafeInteger(value.dimensions) || value.dimensions < 1) fail(`${field}.dimensions must be a positive safe integer.`);
}

function assertQueryFormat(value: unknown, field: string): asserts value is RankingCaptureQueryFormat {
  assertExactKeys(value, field, ["kind", "template"]);
  assertNonBlank(value.kind, `${field}.kind`);
  assertNonBlank(value.template, `${field}.template`);
  if (UNSAFE_FIELD.test(value.template)) fail(`${field}.template contains an unsafe raw-query marker.`);
}

function assertLimits(value: unknown, field: string): asserts value is Limits {
  assertExactKeys(value, field, RESOURCE_TYPES);
  for (const type of RESOURCE_TYPES) {
    const limit = value[type];
    assertExactKeys(limit, `${field}.${type}`, ["lexical", "semantic"]);
    if (typeof limit.lexical !== "number" || !Number.isSafeInteger(limit.lexical) || limit.lexical < 0 || typeof limit.semantic !== "number" || !Number.isSafeInteger(limit.semantic) || limit.semantic < 0) fail(`${field}.${type} must contain non-negative lexical and semantic limits.`);
  }
}

function assertOutputLimits(value: unknown, field: string): asserts value is RankingOutputLimits {
  assertExactKeys(value, field, RESOURCE_TYPES);
  for (const type of RESOURCE_TYPES) {
    const limit = value[type];
    if (!Number.isSafeInteger(limit) || (limit as number) < 0) fail(`${field}.${type} must be a non-negative safe integer.`);
  }
}

function assertRetrievalIdentity(value: unknown, field: string): asserts value is RetrievalIdentity {
  assertExactKeys(value, field, ["schemaVersion", "representationVersion", "generation", "lexicalGeneration", "semanticGeneration", "corpusHash", "model", "state"]);
  for (const key of ["schemaVersion", "representationVersion", "generation", "lexicalGeneration", "semanticGeneration"] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) fail(`${field}.${key} must be a non-negative safe integer.`);
  }
  assertHash(value.corpusHash, `${field}.corpusHash`);
  if (!["ready", "degraded", "rebuilding", "stale", "unavailable"].includes(value.state as string)) fail(`${field}.state is invalid.`);
  if (value.model !== null) assertIndexModel(value.model, `${field}.model`);
}

function assertQueryBasis(value: unknown, field: string): asserts value is RankingInput["queryBasis"] {
  assertExactKeys(value, field, ["queryHash", "ticketId", "ticketRevision", "customerReplyWatermark"]);
  assertHash(value.queryHash, `${field}.queryHash`);
  assertNonBlank(value.ticketId, `${field}.ticketId`);
  if (typeof value.ticketRevision !== "number" || !Number.isSafeInteger(value.ticketRevision) || value.ticketRevision < 0) fail(`${field}.ticketRevision is invalid.`);
  if (value.customerReplyWatermark !== null && typeof value.customerReplyWatermark !== "string") fail(`${field}.customerReplyWatermark is invalid.`);
}

function assertTimings(value: unknown, field: string): asserts value is RankingCaptureCase["timingsMs"] {
  assertExactKeys(value, field, ["retrieval", "provider", "ranking"]);
  if (!Number.isFinite(value.retrieval) || (value.retrieval as number) < 0 || !Number.isFinite(value.provider) || (value.provider as number) < 0 || (value.ranking !== null && (!Number.isFinite(value.ranking) || (value.ranking as number) < 0))) fail(`${field} contains invalid durations.`);
}

const CHANNEL_REASONS = [
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
] as const;

function assertChannelState(value: unknown, field: string): void {
  assertExactKeys(value, field, ["status", "reason"], ["status"]);
  if (!["used", "unavailable", "stale", "failed"].includes(value.status as string)) fail(`${field}.status is invalid.`);
  if (hasOwn(value, "reason") && !CHANNEL_REASONS.includes(value.reason as (typeof CHANNEL_REASONS)[number])) fail(`${field}.reason is invalid.`);
}

function assertMatch(value: unknown, field: string): void {
  assertExactKeys(value, field, ["representationId", "resourceKey", "score", "rank"]);
  assertNonBlank(value.representationId, `${field}.representationId`);
  assertNonBlank(value.resourceKey, `${field}.resourceKey`);
  if (typeof value.score !== "number" || !Number.isFinite(value.score)) fail(`${field}.score must be finite.`);
  if (typeof value.rank !== "number" || !Number.isSafeInteger(value.rank) || value.rank < 1) fail(`${field}.rank must be a positive safe integer.`);
}

function assertMatches(value: unknown, field: string): void {
  if (!Array.isArray(value)) fail(`${field} must be an array.`);
  value.forEach((match, index) => assertMatch(match, `${field}[${index}]`));
}

function assertEvidence(value: unknown, field: string, channel: "lexical" | "semantic"): void {
  assertExactKeys(value, field, channel === "lexical" ? ["bestRank", "bestBm25Score", "matches"] : ["bestRank", "bestCosineSimilarity", "matches"]);
  if (typeof value.bestRank !== "number" || !Number.isSafeInteger(value.bestRank) || value.bestRank < 1) fail(`${field}.bestRank must be a positive safe integer.`);
  const score = channel === "lexical" ? value.bestBm25Score : value.bestCosineSimilarity;
  if (typeof score !== "number" || !Number.isFinite(score)) fail(`${field}.${channel === "lexical" ? "bestBm25Score" : "bestCosineSimilarity"} must be finite.`);
  assertMatches(value.matches, `${field}.matches`);
}

const REFERENCE_CHANNELS = ["deterministic-reference", "known-cause-reference"] as const;
const REFERENCE_REASONS = ["classifier-association", "known-cause-link", "safety-inclusion"] as const;

function assertReference(value: unknown, field: string): void {
  assertExactKeys(value, field, ["resourceKey", "channel", "sourceId", "sourceVersion", "reason"], ["resourceKey", "channel", "sourceId", "reason"]);
  assertNonBlank(value.resourceKey, `${field}.resourceKey`);
  if (!REFERENCE_CHANNELS.includes(value.channel as (typeof REFERENCE_CHANNELS)[number])) fail(`${field}.channel is invalid.`);
  assertNonBlank(value.sourceId, `${field}.sourceId`);
  if (hasOwn(value, "sourceVersion")) assertNonBlank(value.sourceVersion, `${field}.sourceVersion`);
  if (!REFERENCE_REASONS.includes(value.reason as (typeof REFERENCE_REASONS)[number])) fail(`${field}.reason is invalid.`);
}

function assertReferences(value: unknown, field: string): void {
  if (!Array.isArray(value)) fail(`${field} must be an array.`);
  value.forEach((reference, index) => assertReference(reference, `${field}[${index}]`));
}

function assertTaxonomy(value: unknown, field: string): void {
  assertExactKeys(value, field, ["productSurfaces", "problemClasses"]);
  for (const key of ["productSurfaces", "problemClasses"] as const) {
    if (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string")) fail(`${field}.${key} must contain strings.`);
  }
}

function assertCandidate(value: unknown, field: string): void {
  assertExactKeys(value, field, ["resourceKey", "resourceType", "lexical", "semantic", "deterministicReferences", "knownCauseReferences", "taxonomy"], ["resourceKey", "resourceType", "deterministicReferences", "knownCauseReferences"]);
  assertNonBlank(value.resourceKey, `${field}.resourceKey`);
  if (!RESOURCE_TYPES.includes(value.resourceType as ResourceType)) fail(`${field}.resourceType is invalid.`);
  if (hasOwn(value, "lexical")) assertEvidence(value.lexical, `${field}.lexical`, "lexical");
  if (hasOwn(value, "semantic")) assertEvidence(value.semantic, `${field}.semantic`, "semantic");
  assertReferences(value.deterministicReferences, `${field}.deterministicReferences`);
  assertReferences(value.knownCauseReferences, `${field}.knownCauseReferences`);
  if (hasOwn(value, "taxonomy")) assertTaxonomy(value.taxonomy, `${field}.taxonomy`);
}

function assertReferenceDiagnostic(value: unknown, field: string): void {
  assertExactKeys(value, field, ["resourceKey", "channel", "reason"]);
  assertNonBlank(value.resourceKey, `${field}.resourceKey`);
  if (!REFERENCE_CHANNELS.includes(value.channel as (typeof REFERENCE_CHANNELS)[number])) fail(`${field}.channel is invalid.`);
  if (value.reason !== "missing-resource") fail(`${field}.reason is invalid.`);
}

function assertRetrievalMetadata(value: unknown, field: string): void {
  assertExactKeys(value, field, ["schemaVersion", "representationVersion", "generation", "lexicalGeneration", "semanticGeneration", "corpusHash", "model", "state"], ["schemaVersion", "representationVersion", "generation", "lexicalGeneration", "semanticGeneration", "corpusHash", "state"]);
  for (const key of ["schemaVersion", "representationVersion", "generation", "lexicalGeneration", "semanticGeneration"] as const) {
    if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]) || (value[key] as number) < 0) fail(`${field}.${key} must be a non-negative safe integer.`);
  }
  assertHash(value.corpusHash, `${field}.corpusHash`);
  if (!["ready", "degraded", "rebuilding", "stale", "unavailable"].includes(value.state as string)) fail(`${field}.state is invalid.`);
  if (hasOwn(value, "model")) assertIndexModel(value.model, `${field}.model`);
}

function assertRetrieval(value: unknown, field: string): asserts value is RetrievalResult {
  assertExactKeys(value, field, ["metadata", "lexical", "semantic", "candidates", "referenceDiagnostics"]);
  assertRetrievalMetadata(value.metadata, `${field}.metadata`);
  assertChannelState(value.lexical, `${field}.lexical`);
  assertChannelState(value.semantic, `${field}.semantic`);
  if (!Array.isArray(value.candidates)) fail(`${field}.candidates must be an array.`);
  value.candidates.forEach((candidate, index) => assertCandidate(candidate, `${field}.candidates[${index}]`));
  if (!Array.isArray(value.referenceDiagnostics)) fail(`${field}.referenceDiagnostics must be an array.`);
  value.referenceDiagnostics.forEach((diagnostic, index) => assertReferenceDiagnostic(diagnostic, `${field}.referenceDiagnostics[${index}]`));
}

function assertRetrievalMatchesIdentity(retrieval: RetrievalResult, identity: RetrievalIdentity, field: string): void {
  const metadataIdentity: RetrievalIdentity = {
    schemaVersion: retrieval.metadata.schemaVersion,
    representationVersion: retrieval.metadata.representationVersion,
    generation: retrieval.metadata.generation,
    lexicalGeneration: retrieval.metadata.lexicalGeneration,
    semanticGeneration: retrieval.metadata.semanticGeneration,
    corpusHash: retrieval.metadata.corpusHash,
    model: retrieval.metadata.model ?? null,
    state: retrieval.metadata.state,
  };
  if (!same(metadataIdentity, identity)) fail(`${field} does not match the retrieval metadata identity.`);
}

function assertCaptureModelMatchesRetrieval(model: RankingCaptureModel, retrieval: RetrievalResult, field: string): void {
  const retrievalModel = retrieval.metadata.model;
  if (model === null) {
    if (retrievalModel !== undefined) fail(`${field}.model does not match the retrieval metadata model.`);
    return;
  }
  if (retrievalModel === undefined || model.tag !== retrievalModel.id || model.digest !== retrievalModel.revision || model.dimensions !== retrievalModel.dimensions) fail(`${field}.model does not match the retrieval metadata model.`);
}

function assertCase(captureCase: unknown, identity: RankingCaptureIdentity, index: number): asserts captureCase is RankingCaptureCase {
  const field = `cases[${index}]`;
  assertExactKeys(captureCase, field, ["caseId", "split", "caseSetHash", "labelHash", "manifestHash", "corpusHash", "contentSourceRevision", "queryFormatIdentity", "providerKind", "model", "representationVersion", "retrievalLimits", "indexIdentity", "queryBasis", "retrieval", "rankingProvenance", "timingsMs", "traceTruncated"]);
  assertNonBlank(captureCase.caseId, `${field}.caseId`);
  if (captureCase.split !== "development") fail(`${field} must belong to the development split.`);
  for (const key of ["caseSetHash", "labelHash", "manifestHash", "corpusHash"] as const) assertHash(captureCase[key], `${field}.${key}`);
  for (const [key, expected] of [["caseSetHash", identity.caseSetHash], ["labelHash", identity.labelHash], ["manifestHash", identity.manifestHash], ["corpusHash", identity.corpusHash], ["contentSourceRevision", identity.contentSourceRevision], ["providerKind", identity.providerKind], ["representationVersion", identity.representationVersion], ["retrievalLimits", identity.retrievalLimits], ["queryFormatIdentity", identity.queryFormatIdentity], ["model", identity.model], ["indexIdentity", identity.indexIdentity]] as const) {
    if (!same(captureCase[key], expected)) fail(`${field}.${key} does not match the frozen capture identity.`);
  }
  assertModel(captureCase.model, `${field}.model`);
  assertQueryFormat(captureCase.queryFormatIdentity, `${field}.queryFormatIdentity`);
  assertLimits(captureCase.retrievalLimits, `${field}.retrievalLimits`);
  assertExactKeys(captureCase.rankingProvenance, `${field}.rankingProvenance`, ["contractVersion", "inputHash", "retrievalIdentity", "outputLimits", "tieBreak"]);
  const provenance = captureCase.rankingProvenance as RankingCaptureCase["rankingProvenance"];
  assertOutputLimits(provenance.outputLimits, `${field}.rankingProvenance.outputLimits`);
  if (!same(provenance.outputLimits, identity.outputLimits)) fail(`${field}.rankingProvenance.outputLimits does not match the frozen capture identity.`);
  assertRetrievalIdentity(captureCase.indexIdentity, `${field}.indexIdentity`);
  assertQueryBasis(captureCase.queryBasis, `${field}.queryBasis`);
  assertRetrieval(captureCase.retrieval, `${field}.retrieval`);
  assertCaptureModelMatchesRetrieval(captureCase.model, captureCase.retrieval, field);
  assertRetrievalMatchesIdentity(captureCase.retrieval as RetrievalResult, captureCase.indexIdentity, `${field}.retrieval`);
  if (provenance.contractVersion !== 1 || provenance.tieBreak !== "ordinal-resource-key") fail(`${field}.rankingProvenance is missing or invalid.`);
  assertHash(provenance.inputHash, `${field}.rankingProvenance.inputHash`);
  assertRetrievalIdentity(provenance.retrievalIdentity, `${field}.rankingProvenance.retrievalIdentity`);
  if (!same(provenance.retrievalIdentity, captureCase.indexIdentity)) fail(`${field}.rankingProvenance.retrievalIdentity does not match the index identity.`);
  assertTimings(captureCase.timingsMs, `${field}.timingsMs`);
  if (captureCase.traceTruncated !== false) fail(`${field}.traceTruncated must be false for a complete capture.`);

  let ranking;
  try {
    ranking = rankRetrieval({ contractVersion: 1, queryBasis: captureCase.queryBasis, retrieval: captureCase.retrieval as RetrievalResult, outputLimits: provenance.outputLimits }, { id: "lexical-only-v1", kind: "lexical-only" });
  } catch (error) {
    fail(`${field} contains an invalid ranking input: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (ranking.inputHash !== provenance.inputHash) fail(`${field}.rankingProvenance.inputHash does not match the captured input.`);
}

export function validateRankingCapture(value: unknown): asserts value is RankingCapture {
  assertNoUnsafeFields(value);
  assertExactKeys(value, "capture", ["formatVersion", "captureHash", "evaluatorSourceRevision", "identity", "cases"]);
  if (value.formatVersion !== RANKING_CAPTURE_FORMAT_VERSION) fail("unsupported format version.");
  assertHash(value.captureHash, "captureHash");
  if (hashCanonicalRankingCapture(withoutCaptureHash(value as RankingCapture)) !== value.captureHash) fail("capture hash does not match the canonical capture content.");
  assertNonBlank(value.evaluatorSourceRevision, "evaluatorSourceRevision");
  assertExactKeys(value.identity, "identity", ["split", "caseSetHash", "labelHash", "manifestHash", "caseIds", "reviewStatus", "sourceCutoff", "contentSourceRevision", "corpusHash", "queryFormatIdentity", "providerKind", "model", "representationVersion", "retrievalLimits", "outputLimits", "indexIdentity"]);
  const identity = value.identity as RankingCaptureIdentity;
  if (identity.split !== "development" || identity.reviewStatus !== "approved") fail("only an approved development split is valid.");
  for (const key of ["caseSetHash", "labelHash", "manifestHash", "corpusHash"] as const) assertHash(identity[key], `identity.${key}`);
  if (!Array.isArray(identity.caseIds) || identity.caseIds.length === 0 || identity.caseIds.some((caseId) => typeof caseId !== "string" || caseId.trim().length === 0)) fail("identity.caseIds must be nonempty case IDs.");
  if (new Set(identity.caseIds).size !== identity.caseIds.length) fail("identity.caseIds must be unique.");
  assertNonBlank(identity.sourceCutoff, "identity.sourceCutoff");
  assertNonBlank(identity.contentSourceRevision, "identity.contentSourceRevision");
  assertQueryFormat(identity.queryFormatIdentity, "identity.queryFormatIdentity");
  assertNonBlank(identity.providerKind, "identity.providerKind");
  assertModel(identity.model, "identity.model");
  if (!Number.isSafeInteger(identity.representationVersion) || identity.representationVersion < 1) fail("identity.representationVersion is invalid.");
  assertLimits(identity.retrievalLimits, "identity.retrievalLimits");
  assertOutputLimits(identity.outputLimits, "identity.outputLimits");
  assertRetrievalIdentity(identity.indexIdentity, "identity.indexIdentity");
  if (!Array.isArray(value.cases) || value.cases.length === 0) fail("cases must be nonempty.");
  const caseIds: string[] = [];
  value.cases.forEach((captureCase, index) => {
    assertCase(captureCase, identity, index);
    caseIds.push(captureCase.caseId);
  });
  if (!same(caseIds, identity.caseIds)) fail("identity.caseIds must match the captured case order.");
}

export function createRankingCapture(input: { evaluatorSourceRevision: string; identity: RankingCaptureIdentity; cases: readonly RankingCaptureCase[] }): RankingCapture {
  const capture = {
    formatVersion: RANKING_CAPTURE_FORMAT_VERSION,
    captureHash: "",
    evaluatorSourceRevision: input.evaluatorSourceRevision,
    identity: input.identity,
    cases: input.cases,
  } satisfies RankingCapture;
  const complete = { ...capture, captureHash: hashCanonicalRankingCapture({ ...capture, captureHash: undefined }) } as RankingCapture;
  validateRankingCapture(complete);
  return complete;
}

export async function writeRankingCaptureExclusive(path: string, capture: RankingCapture): Promise<void> {
  validateRankingCapture(capture);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${canonicalRankingCaptureJson(capture)}\n`, { encoding: "utf8", flag: "wx" });
}

export function modelForCapture(model: ModelIdentity | undefined): RankingCaptureModel {
  return model === undefined ? null : { tag: model.id, digest: model.revision, dimensions: model.dimensions };
}
