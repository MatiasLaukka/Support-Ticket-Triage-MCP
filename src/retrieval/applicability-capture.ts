import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { APPLICABILITY_PROMPT_HASH } from "../applicability-reasoning-provider.js";
import {
  APPLICABILITY_CONTRACT_VERSION,
  APPLICABILITY_PROMPT_VERSION,
  type ApplicabilityCaseResult,
  type ApplicabilityReasoningInput,
  type EvidenceUnavailableReason,
  hashCanonicalApplicabilityValue,
} from "./applicability-types.js";
import { canonicalNewB5ArtifactPath } from "./applicability-artifact-path.js";
import type { ApplicabilityInputMeasurement } from "./applicability-evidence.js";
import type { ResourceKey, ResourceType } from "./types.js";

export const APPLICABILITY_CAPTURE_FORMAT_VERSION = 1 as const;

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const StableIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const NonBlankSchema = z.string().trim().min(1).max(600);
const ResourceTypeSchema = z.enum(["knowledge-article", "known-cause", "diagnostic-playbook", "resolved-ticket"]);
const ResourceKeySchema = z.string()
  .regex(/^(?:knowledge-article|known-cause|diagnostic-playbook|resolved-ticket):[A-Za-z0-9._/-]+$/)
  .transform((value) => value as ResourceKey);
const LaneSchema = z.enum(["evidence-only", "taxonomy-informed"]);
const EvidenceReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("case-fact"), id: StableIdSchema }).strict(),
  z.object({ kind: z.literal("resource-representation"), id: StableIdSchema }).strict(),
]);
const MissingEvidenceSchema = z.object({ item: z.string().min(1).max(300), evidence: z.array(EvidenceReferenceSchema).max(16) }).strict();
const FactSchema = z.object({ id: StableIdSchema, statement: z.string().min(1).max(600) }).strict();
const SafeCaseSchema = z.object({
  caseId: StableIdSchema,
  problemStatement: z.string().min(1).max(600),
  observedFacts: z.array(FactSchema).max(32),
  conversationState: z.array(FactSchema).max(16),
}).strict();

const CandidateSnapshotSchema = z.object({
  resourceKey: ResourceKeySchema,
  resourceType: ResourceTypeSchema,
  contentHash: Sha256Schema,
  evidence: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("available"),
      representationIds: z.array(StableIdSchema).min(1).max(256),
      matchedRepresentationIds: z.array(StableIdSchema).max(256),
    }).strict(),
    z.object({
      status: z.literal("unavailable"),
      reasons: z.array(z.enum(["resource-unavailable", "representation-unavailable", "content-hash-mismatch", "source-family-unavailable"])).min(1).max(4),
    }).strict(),
  ]),
}).strict();

const EvidenceSnapshotSchema = z.object({
  id: StableIdSchema,
  resourceKey: ResourceKeySchema,
  contentHash: Sha256Schema,
  evidenceOrigin: z.enum(["matched", "reference-grounded"]),
  matchedChannels: z.array(z.enum(["lexical", "semantic"])).max(2),
}).strict();

const CandidateAssessmentSchema = z.object({
  resourceKey: ResourceKeySchema,
  verdict: z.enum(["applicable-next-step", "contradicted", "insufficient-evidence", "irrelevant"]),
  supportingEvidence: z.array(EvidenceReferenceSchema).max(32),
  contradictingEvidence: z.array(EvidenceReferenceSchema).max(32),
  missingEvidence: z.array(MissingEvidenceSchema).max(16),
  explanation: z.string().min(1).max(600),
  taxonomyRelation: z.enum(["supports", "conflicts", "neutral", "unavailable"]).optional(),
}).strict();
const CandidateHypothesisSchema = z.object({
  kind: z.literal("candidate-grounded"),
  summary: z.string().min(1).max(600),
  candidateKeys: z.array(ResourceKeySchema).min(1).max(8),
  evidence: z.array(EvidenceReferenceSchema).min(1).max(32),
  missingEvidence: z.array(MissingEvidenceSchema).max(16),
}).strict();
const NovelHypothesisSchema = z.object({
  kind: z.literal("novel"),
  summary: z.string().min(1).max(600),
  evidence: z.array(EvidenceReferenceSchema).min(1).max(32),
  whyCandidateSetIsInsufficient: z.string().min(1).max(600),
  missingEvidence: z.array(MissingEvidenceSchema).max(16),
}).strict();
const HypothesisSchema = z.discriminatedUnion("kind", [CandidateHypothesisSchema, NovelHypothesisSchema]);
const RankedEvidenceActionSchema = z.object({
  actionType: z.enum(["inspect-internal", "run-check", "request-customer-evidence"]),
  action: z.string().min(1).max(400),
  expectedEvidence: z.string().min(1).max(300),
  hypothesisRanks: z.array(z.number().int().min(0).max(8)).min(1).max(9),
}).strict();
const GapEvidenceActionSchema = z.object({
  actionType: z.enum(["inspect-internal", "run-check", "request-customer-evidence"]),
  action: z.string().min(1).max(400),
  expectedEvidence: z.string().min(1).max(300),
}).strict();
const ProviderOutputSchema = z.object({
  candidateAssessments: z.array(CandidateAssessmentSchema).max(64),
  synthesis: z.discriminatedUnion("disposition", [
    z.object({
      disposition: z.literal("hypothesis"),
      leadingHypothesis: HypothesisSchema,
      alternatives: z.array(HypothesisSchema).max(8),
      nextEvidenceActions: z.array(RankedEvidenceActionSchema).min(1).max(8),
    }).strict(),
    z.object({
      disposition: z.literal("abstain"),
      summary: z.string().min(1).max(600),
      coverageGaps: z.array(z.string().min(1).max(300)).min(1).max(16),
      nextEvidenceActions: z.array(GapEvidenceActionSchema).min(1).max(8),
    }).strict(),
  ]),
}).strict();

const ResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("complete"), assessments: z.array(CandidateAssessmentSchema).max(64), synthesis: ProviderOutputSchema.shape.synthesis }).strict(),
  z.object({
    status: z.literal("partial-assessment"),
    assessments: z.array(CandidateAssessmentSchema).max(64),
    synthesis: ProviderOutputSchema.shape.synthesis,
    unavailableCandidates: z.array(z.object({
      resourceKey: ResourceKeySchema,
      reasons: z.array(z.enum(["resource-unavailable", "representation-unavailable", "content-hash-mismatch", "source-family-unavailable"])).min(1).max(4),
    }).strict()).max(64),
  }).strict(),
  z.object({ status: z.literal("assessment-skipped"), reason: z.enum(["no-assessable-candidates", "prompt-injection-detected", "input-too-large"]) }).strict(),
  z.object({ status: z.literal("assessment-failed"), reason: z.enum(["invalid-provider-output", "not-configured", "transport", "http", "response-body", "timeout", "context-exhausted"]) }).strict(),
]);

const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).strict().superRefine((usage, context) => {
  if (usage.totalTokens !== usage.inputTokens + usage.outputTokens) {
    context.addIssue({ code: "custom", path: ["totalTokens"], message: "Token totals must add up." });
  }
});
const TelemetrySchema = z.object({
  providerKind: z.enum(["openai-responses", "controlled-test"]),
  model: NonBlankSchema,
  latencyMs: z.number().finite().nonnegative(),
  usage: UsageSchema.optional(),
}).strict();
const TimingSchema = z.object({
  startedAtMs: z.number().finite().nonnegative(),
  completedAtMs: z.number().finite().nonnegative(),
}).strict().superRefine((timing, context) => {
  if (timing.completedAtMs < timing.startedAtMs) context.addIssue({ code: "custom", path: ["completedAtMs"], message: "Completion time must not precede start time." });
});
const MeasurementSchema = z.object({
  serializedBytes: z.number().int().nonnegative(),
  estimatedInputTokens: z.number().int().nonnegative(),
  outputReserveTokens: z.number().int().nonnegative(),
  minimumContextTokens: z.number().int().nonnegative(),
  contextLimitTokens: z.number().int().positive().nullable(),
  fits: z.boolean().nullable(),
}).strict();

const LaneCaptureSchema = z.object({
  lane: LaneSchema,
  nonTaxonomyBasisHash: Sha256Schema,
  inputIdentity: z.object({
    b4CaptureHash: Sha256Schema,
    b4CaseInputHash: Sha256Schema,
    caseSetHash: Sha256Schema,
    oracleHash: Sha256Schema,
    corpusHash: Sha256Schema,
    indexGeneration: z.number().int().nonnegative(),
    lexicalGeneration: z.number().int().nonnegative(),
    semanticGeneration: z.number().int().nonnegative(),
    representationVersion: z.number().int().nonnegative(),
    candidateSnapshotHash: Sha256Schema,
    evidenceRegistryHash: Sha256Schema,
    safeCaseHash: Sha256Schema,
    inputHash: Sha256Schema,
    taxonomyHash: Sha256Schema.nullable(),
  }).strict(),
  inputMeasurement: MeasurementSchema,
  result: ResultSchema,
  outputHash: Sha256Schema,
  telemetry: TelemetrySchema.nullable(),
  timing: TimingSchema,
  traceTruncated: z.literal(false),
}).strict();

const CaseCaptureSchema = z.object({
  caseId: StableIdSchema,
  safeCase: SafeCaseSchema,
  safeCaseHash: Sha256Schema,
  nonTaxonomyBasisHash: Sha256Schema,
  candidateSnapshotHash: Sha256Schema,
  evidenceRegistryHash: Sha256Schema,
  candidates: z.array(CandidateSnapshotSchema).max(64),
  evidence: z.array(EvidenceSnapshotSchema).max(256),
  laneOrder: z.tuple([LaneSchema, LaneSchema]),
  lanes: z.array(LaneCaptureSchema).length(2),
}).strict();

const IdentitySchema = z.object({
  split: z.literal("development"),
  reviewStatus: z.literal("approved"),
  caseIds: z.array(StableIdSchema).length(21),
  contractVersion: z.literal(APPLICABILITY_CONTRACT_VERSION),
  promptVersion: z.literal(APPLICABILITY_PROMPT_VERSION),
  promptHash: Sha256Schema,
  b4CaptureHash: Sha256Schema,
  caseSetHash: Sha256Schema,
  oracleHash: Sha256Schema,
  corpusHash: Sha256Schema,
  contentSourceRevision: NonBlankSchema,
  representationVersion: z.number().int().nonnegative(),
  indexGeneration: z.number().int().nonnegative(),
  lexicalGeneration: z.number().int().nonnegative(),
  semanticGeneration: z.number().int().nonnegative(),
  providerKind: z.enum(["openai-responses", "controlled-test"]),
  model: NonBlankSchema,
}).strict();

const CaptureWithoutHashSchema = z.object({
  formatVersion: z.literal(APPLICABILITY_CAPTURE_FORMAT_VERSION),
  evaluatorSourceRevision: NonBlankSchema,
  identity: IdentitySchema,
  cases: z.array(CaseCaptureSchema).length(21),
}).strict();
const CaptureSchema = CaptureWithoutHashSchema.extend({ captureHash: Sha256Schema }).strict();

export type ApplicabilityCandidateCapture = z.infer<typeof CandidateSnapshotSchema>;
export type ApplicabilityEvidenceCapture = z.infer<typeof EvidenceSnapshotSchema>;
export type ApplicabilityLaneCapture = z.infer<typeof LaneCaptureSchema>;
export type ApplicabilityCaseCapture = z.infer<typeof CaseCaptureSchema>;
export type ApplicabilityCaptureWithoutHash = z.infer<typeof CaptureWithoutHashSchema>;
export type ApplicabilityCapture = z.infer<typeof CaptureSchema>;

const privacyPatterns: readonly RegExp[] = [
  /\bTKT-\d+\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:system prompt|developer message|raw provider payload|api[-_ ]?key|access[-_ ]?token|password)\b/i,
  /\bsk-[A-Za-z0-9_-]+\b/,
  /(?:[A-Za-z]:[\\/]|(?:^|\s)(?:~?[\\/]|[\\/]{2})[A-Za-z0-9._-]+[\\/])/,
  /\b(?:customer|requester|account)\s*(?:id|identifier|name)?\s*[:=]/i,
];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

export function canonicalApplicabilityCaptureJson(value: unknown): string {
  const json = JSON.stringify(canonicalize(value));
  if (json === undefined) throw new Error("B5 applicability capture cannot be serialized.");
  return json;
}

export function hashCanonicalApplicabilityCapture(value: unknown): string {
  return createHash("sha256").update(canonicalApplicabilityCaptureJson(value), "utf8").digest("hex");
}

function withoutCaptureHash(capture: ApplicabilityCapture): ApplicabilityCaptureWithoutHash {
  const { captureHash: _captureHash, ...withoutHash } = capture;
  return withoutHash;
}

function same(left: unknown, right: unknown): boolean {
  return canonicalApplicabilityCaptureJson(left) === canonicalApplicabilityCaptureJson(right);
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function assertPrivacyBounded(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (privacyPatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error("B5 applicability capture contains a forbidden customer, prompt, secret, or path value.");
  }
}

function outputForHash(result: ApplicabilityCaseResult): unknown {
  if (result.status === "complete" || result.status === "partial-assessment") {
    return { status: result.status, assessments: result.assessments, synthesis: result.synthesis, ...(result.status === "partial-assessment" ? { unavailableCandidates: result.unavailableCandidates } : {}) };
  }
  return result;
}

export function sanitizeApplicabilityResult(result: ApplicabilityCaseResult): z.infer<typeof ResultSchema> {
  return ResultSchema.parse(outputForHash(result));
}

export function captureCandidates(input: ApplicabilityReasoningInput): ApplicabilityCandidateCapture[] {
  return input.candidates.map((candidate) => ({
    resourceKey: candidate.resourceKey as ResourceKey,
    resourceType: candidate.resourceType as ResourceType,
    contentHash: candidate.contentHash,
    evidence: candidate.evidence.status === "available"
      ? { status: "available" as const, representationIds: [...candidate.evidence.representationIds], matchedRepresentationIds: [...candidate.evidence.matchedRepresentationIds] }
      : { status: "unavailable" as const, reasons: [...candidate.evidence.reasons] as EvidenceUnavailableReason[] },
  }));
}

export function captureEvidence(input: ApplicabilityReasoningInput): ApplicabilityEvidenceCapture[] {
  return input.evidenceRegistry.map((evidence) => ({
    id: evidence.id,
    resourceKey: evidence.resourceKey as ResourceKey,
    contentHash: evidence.contentHash,
    evidenceOrigin: evidence.evidenceOrigin,
    matchedChannels: [...evidence.matchedChannels],
  }));
}

export function captureMeasurement(measurement: ApplicabilityInputMeasurement): z.infer<typeof MeasurementSchema> {
  return MeasurementSchema.parse({ ...measurement });
}

export function createApplicabilityCapture(input: ApplicabilityCaptureWithoutHash): ApplicabilityCapture {
  const parsed = CaptureWithoutHashSchema.parse(input);
  const capture = { ...parsed, captureHash: hashCanonicalApplicabilityCapture(parsed) };
  validateApplicabilityCapture(capture);
  return capture;
}

export function validateApplicabilityCapture(value: unknown): asserts value is ApplicabilityCapture {
  const capture = CaptureSchema.parse(value);
  assertPrivacyBounded(capture);

  if (capture.identity.promptHash !== APPLICABILITY_PROMPT_HASH) throw new Error("B5 applicability capture prompt hash does not match the current prompt contract.");
  assertUnique(capture.identity.caseIds, "B5 applicability capture case IDs must be unique.");
  if (capture.cases.some((entry, index) => entry.caseId !== capture.identity.caseIds[index])) {
    throw new Error("B5 applicability capture case order must match its frozen identity.");
  }
  if (capture.captureHash !== hashCanonicalApplicabilityCapture(withoutCaptureHash(capture))) {
    throw new Error("B5 applicability capture hash mismatch.");
  }

  for (const entry of capture.cases) {
    if (entry.safeCase.caseId !== entry.caseId) throw new Error(`B5 capture case ${entry.caseId} safe-case identity mismatch.`);
    if (entry.safeCaseHash !== hashCanonicalApplicabilityValue(entry.safeCase)) throw new Error(`B5 capture case ${entry.caseId} safe-case hash mismatch.`);
    assertUnique(entry.candidates.map(({ resourceKey }) => resourceKey), `B5 capture case ${entry.caseId} candidate keys must be unique.`);
    assertUnique(entry.evidence.map(({ id }) => id), `B5 capture case ${entry.caseId} evidence IDs must be unique.`);
    if (new Set(entry.laneOrder).size !== 2 || !entry.laneOrder.includes("evidence-only") || !entry.laneOrder.includes("taxonomy-informed")) {
      throw new Error(`B5 capture case ${entry.caseId} must record both lane identities exactly once.`);
    }
    if (entry.lanes.some((lane, index) => lane.lane !== entry.laneOrder[index])) {
      throw new Error(`B5 capture case ${entry.caseId} lane records must follow laneOrder.`);
    }
    const evidenceOnly = entry.lanes.find(({ lane }) => lane === "evidence-only")!;
    const taxonomyInformed = entry.lanes.find(({ lane }) => lane === "taxonomy-informed")!;
    if (evidenceOnly.nonTaxonomyBasisHash !== taxonomyInformed.nonTaxonomyBasisHash || evidenceOnly.nonTaxonomyBasisHash !== entry.nonTaxonomyBasisHash) {
      throw new Error(`B5 capture case ${entry.caseId} lanes must share the same non-taxonomy basis hash.`);
    }
    if (evidenceOnly.inputIdentity.taxonomyHash !== null || taxonomyInformed.inputIdentity.taxonomyHash === null) {
      throw new Error(`B5 capture case ${entry.caseId} has invalid lane taxonomy hashes.`);
    }
    for (const lane of entry.lanes) {
      const expectedIdentity = {
        b4CaptureHash: capture.identity.b4CaptureHash,
        caseSetHash: capture.identity.caseSetHash,
        oracleHash: capture.identity.oracleHash,
        corpusHash: capture.identity.corpusHash,
        indexGeneration: capture.identity.indexGeneration,
        lexicalGeneration: capture.identity.lexicalGeneration,
        semanticGeneration: capture.identity.semanticGeneration,
        representationVersion: capture.identity.representationVersion,
        candidateSnapshotHash: entry.candidateSnapshotHash,
        evidenceRegistryHash: entry.evidenceRegistryHash,
        safeCaseHash: entry.safeCaseHash,
      };
      for (const [key, expected] of Object.entries(expectedIdentity)) {
        if (!same((lane.inputIdentity as Record<string, unknown>)[key], expected)) {
          throw new Error(`B5 capture case ${entry.caseId} ${lane.lane} input identity ${key} mismatch.`);
        }
      }
      if (lane.telemetry !== null) {
        if (lane.telemetry.providerKind !== capture.identity.providerKind || lane.telemetry.model !== capture.identity.model) {
          throw new Error(`B5 capture case ${entry.caseId} telemetry does not match provider identity.`);
        }
      }
      if (lane.outputHash !== hashCanonicalApplicabilityCapture(lane.result)) {
        throw new Error(`B5 capture case ${entry.caseId} ${lane.lane} output hash mismatch.`);
      }
      if ((lane.result.status === "complete" || lane.result.status === "partial-assessment") && lane.telemetry === null) {
        throw new Error(`B5 capture case ${entry.caseId} completed assessment requires bounded telemetry.`);
      }
      if ((lane.result.status === "assessment-skipped" || lane.result.status === "assessment-failed") && lane.telemetry !== null) {
        throw new Error(`B5 capture case ${entry.caseId} skipped or failed assessment cannot claim provider telemetry.`);
      }
    }
  }
}

export async function writeApplicabilityCaptureExclusive(path: string, capture: ApplicabilityCapture): Promise<void> {
  validateApplicabilityCapture(capture);
  const canonical = canonicalNewB5ArtifactPath(path);
  await mkdir(dirname(canonical), { recursive: true });
  await writeFile(canonical, `${JSON.stringify(capture, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}
