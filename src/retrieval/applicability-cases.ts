import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import { DiagnosticTaxonomyContextSchema } from "../diagnostic-taxonomy.js";
import { IsoTimestampSchema } from "../domain.js";
import type { RankingCapture } from "./ranking-capture.js";
import type { ReadinessCase } from "./readiness-cases.js";
import {
  APPLICABILITY_CONTRACT_VERSION,
  APPLICABILITY_PROMPT_VERSION,
  type ApplicabilityVerdict,
  type EvidenceReference,
  type SafeCaseProjection,
} from "./applicability-types.js";
import type { ResourceKey, SourceSnapshot } from "./types.js";

const NonBlankStringSchema = z.string().trim().min(1);
const StableIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ResourceKeySchema = z
  .string()
  .regex(/^(?:knowledge-article|known-cause|diagnostic-playbook|resolved-ticket):[A-Za-z0-9._/-]+$/)
  .transform((value) => value as ResourceKey);
const UniqueResourceKeysSchema = z.array(ResourceKeySchema)
  .refine((values) => new Set(values).size === values.length, "Resource keys must be unique.");
const EvidenceReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("case-fact"), id: StableIdSchema }).strict(),
  z.object({ kind: z.literal("resource-representation"), id: StableIdSchema }).strict(),
]);
const FactSchema = z.object({ id: StableIdSchema, statement: z.string().min(1).max(600) }).strict();
const SafeCaseProjectionSchema = z.object({
  caseId: StableIdSchema,
  problemStatement: z.string().min(1).max(600),
  observedFacts: z.array(FactSchema).max(32),
  conversationState: z.array(FactSchema).max(16),
}).strict();
const MissingEvidenceSchema = z.object({
  item: z.string().min(1).max(300),
  evidence: z.array(EvidenceReferenceSchema).max(16),
}).strict();
const ApplicabilityOracleJudgmentSchema = z.object({
  resourceKey: ResourceKeySchema,
  verdict: z.enum(["applicable-next-step", "contradicted", "insufficient-evidence", "irrelevant"]),
  supportingEvidence: z.array(EvidenceReferenceSchema).max(32),
  contradictingEvidence: z.array(EvidenceReferenceSchema).max(32),
  missingEvidence: z.array(MissingEvidenceSchema).max(16),
  rationale: z.string().min(1).max(600),
}).strict();
const HypothesisOracleSpecSchema = z.object({
  id: StableIdSchema,
  candidateKeyPool: UniqueResourceKeysSchema.min(1).max(8),
  minimumCandidateMatches: z.number().int().min(1).max(8),
  requiredConcepts: z.array(z.string().min(1).max(160)).min(1).max(16),
}).strict().superRefine((value, context) => {
  if (value.minimumCandidateMatches > value.candidateKeyPool.length) {
    context.addIssue({ code: "custom", path: ["minimumCandidateMatches"], message: "Minimum matches cannot exceed the candidate pool." });
  }
});
const EvidenceActionIntentSchema = z.object({
  id: StableIdSchema,
  targetRanks: z.array(z.number().int().min(0).max(8)).max(9)
    .refine((values) => new Set(values).size === values.length, "Target ranks must be unique."),
  allowedActionTypes: z.array(z.enum(["inspect-internal", "run-check", "request-customer-evidence"])).min(1).max(3)
    .refine((values) => new Set(values).size === values.length, "Allowed action types must be unique."),
  requiredConcepts: z.array(z.string().min(1).max(160)).min(1).max(16),
}).strict();
const ReviewSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }).strict(),
  z.object({
    status: z.literal("approved"),
    reviewedBy: NonBlankStringSchema,
    reviewedAt: IsoTimestampSchema,
    decisionRef: NonBlankStringSchema,
  }).strict(),
]);

export const ApplicabilityDevelopmentCaseSchema = z.object({
  id: StableIdSchema,
  sourceReadinessCaseId: StableIdSchema,
  split: z.literal("development"),
  safeCase: SafeCaseProjectionSchema,
  taxonomy: DiagnosticTaxonomyContextSchema,
  judgments: z.array(ApplicabilityOracleJudgmentSchema).max(64),
  unjudgedCandidateKeys: UniqueResourceKeysSchema.max(64),
  synthesisOracle: z.object({
    disposition: z.enum(["hypothesis", "abstain"]),
    acceptableLeadingHypotheses: z.array(HypothesisOracleSpecSchema).max(16),
    orderedAlternativeHypotheses: z.array(HypothesisOracleSpecSchema).max(8),
    evidenceActionIntents: z.array(EvidenceActionIntentSchema).min(1).max(16),
    novelHypothesisPolicy: z.literal("allowed-requires-review"),
    forbiddenClaims: z.array(z.string().min(1).max(300)).max(32),
  }).strict(),
  review: ReviewSchema,
}).strict();

const ManifestFileSchema = z.object({
  path: NonBlankStringSchema,
  sha256: Sha256Schema,
}).strict();

export const ApplicabilityManifestSchema = z.object({
  version: z.literal(2),
  applicabilityContractVersion: z.literal(APPLICABILITY_CONTRACT_VERSION),
  promptVersion: z.literal(APPLICABILITY_PROMPT_VERSION),
  development: ManifestFileSchema,
  b4CaptureHash: Sha256Schema,
  sourceReadinessDevelopmentHash: Sha256Schema,
  sourceRevision: NonBlankStringSchema,
  corpusHash: Sha256Schema,
  representationVersion: z.literal(3),
  indexGeneration: z.number().int().nonnegative(),
  lexicalGeneration: z.number().int().nonnegative(),
  semanticGeneration: z.number().int().nonnegative(),
  caseIds: z.array(StableIdSchema).length(21)
    .refine((values) => new Set(values).size === values.length, "Case IDs must be unique."),
}).strict();

export type ApplicabilityOracleJudgment = z.infer<typeof ApplicabilityOracleJudgmentSchema>;
export type ApplicabilityDevelopmentCase = z.infer<typeof ApplicabilityDevelopmentCaseSchema>;
export type ApplicabilityManifest = z.infer<typeof ApplicabilityManifestSchema>;

export interface LoadedApplicabilityDevelopment {
  root: string;
  manifest: ApplicabilityManifest;
  cases: ApplicabilityDevelopmentCase[];
  developmentHash: string;
}

export interface ApplicabilityDevelopmentValidationContext {
  capture: RankingCapture;
  sourceReadinessCases: readonly ReadinessCase[];
  sourceReadinessDevelopmentHash: string;
  sourceSnapshot: SourceSnapshot;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function outside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel);
}

function containedRealFile(root: string, requestedPath: string): string {
  if (isAbsolute(requestedPath) || /^[A-Za-z]:/.test(requestedPath)) {
    throw new Error("Applicability manifest paths must remain inside the case-set root.");
  }
  const lexical = resolve(root, requestedPath);
  if (outside(root, lexical)) {
    throw new Error("Applicability manifest paths must remain inside the case-set root.");
  }
  const canonical = realpathSync(lexical);
  if (outside(root, canonical)) {
    throw new Error("Applicability manifest paths must remain inside the case-set root.");
  }
  return canonical;
}

export function loadApplicabilityDevelopment(
  rootPath = resolve("data/evaluation/applicability-v1"),
): LoadedApplicabilityDevelopment {
  const root = realpathSync(rootPath);
  const manifestPath = containedRealFile(root, "manifest.json");
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error("Invalid applicability manifest JSON.");
  }
  const manifest = ApplicabilityManifestSchema.parse(rawManifest);
  const developmentPath = containedRealFile(root, manifest.development.path);
  const developmentBytes = readFileSync(developmentPath);
  if (developmentBytes.includes(0x0d)) {
    throw new Error("Applicability development data must use LF line endings.");
  }
  const developmentHash = sha256(developmentBytes);
  if (developmentHash !== manifest.development.sha256) {
    throw new Error("Applicability development hash mismatch.");
  }
  let rawCases: unknown;
  try {
    rawCases = JSON.parse(developmentBytes.toString("utf8"));
  } catch {
    throw new Error("Invalid applicability development JSON.");
  }
  const cases = ApplicabilityDevelopmentCaseSchema.array().parse(rawCases);
  return { root, manifest, cases, developmentHash };
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function referenceIds(judgment: ApplicabilityOracleJudgment): EvidenceReference[] {
  return [
    ...judgment.supportingEvidence,
    ...judgment.contradictingEvidence,
    ...judgment.missingEvidence.flatMap((item) => item.evidence),
  ];
}

const leakagePatterns: readonly RegExp[] = [
  /\bTKT-\d+\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:customer|requester|account)\s*(?:id|identifier|name)?\s*[:=]/i,
  /\b(?:system prompt|developer message|raw provider payload|api[-_ ]?key|access[-_ ]?token|password)\b/i,
  /\bsk-[A-Za-z0-9_-]+\b/,
  /(?:[A-Za-z]:[\\/]|(?:^|\s)(?:~?[\\/]|[\\/]{2})[A-Za-z0-9._-]+[\\/])/,
  /\bwh_[A-Za-z0-9]+\b/,
  /\bP-\d+\b/,
];

function assertSafeProjection(safeCase: SafeCaseProjection): void {
  const serialized = JSON.stringify(safeCase);
  if (leakagePatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error(`Applicability safe projection contains a forbidden identifier or payload in ${safeCase.caseId}.`);
  }
  assertUnique(
    [...safeCase.observedFacts, ...safeCase.conversationState].map(({ id }) => id),
    `Applicability safe projection has duplicate fact IDs in ${safeCase.caseId}.`,
  );
}

export function validateApplicabilityDevelopment(
  manifest: ApplicabilityManifest,
  cases: readonly ApplicabilityDevelopmentCase[],
  context: ApplicabilityDevelopmentValidationContext,
): void {
  const parsedManifest = ApplicabilityManifestSchema.parse(manifest);
  const parsedCases = ApplicabilityDevelopmentCaseSchema.array().parse(cases);
  const capture = context.capture;

  if (parsedManifest.b4CaptureHash !== capture.captureHash) throw new Error("B5 manifest B4 capture hash mismatch.");
  if (parsedManifest.sourceReadinessDevelopmentHash !== context.sourceReadinessDevelopmentHash) throw new Error("B5 manifest source readiness hash mismatch.");
  if (parsedManifest.sourceRevision !== capture.identity.contentSourceRevision) throw new Error("B5 manifest source revision mismatch.");
  if (parsedManifest.corpusHash !== capture.identity.corpusHash) throw new Error("B5 manifest corpus hash mismatch.");
  if (parsedManifest.representationVersion !== capture.identity.representationVersion) throw new Error("B5 manifest representation version mismatch.");
  if (parsedManifest.indexGeneration !== capture.identity.indexIdentity.generation
    || parsedManifest.lexicalGeneration !== capture.identity.indexIdentity.lexicalGeneration
    || parsedManifest.semanticGeneration !== capture.identity.indexIdentity.semanticGeneration) {
    throw new Error("B5 manifest retrieval generations mismatch.");
  }

  const expectedIds = [...capture.identity.caseIds];
  if (parsedCases.length !== 21 || parsedManifest.caseIds.length !== 21) throw new Error("B5 development must contain exactly 21 cases.");
  if (expectedIds.some((id, index) => parsedManifest.caseIds[index] !== id || parsedCases[index]?.id !== id)) {
    throw new Error("B5 development case order must match the frozen B4 capture.");
  }

  const readinessById = new Map(context.sourceReadinessCases.map((entry) => [entry.id, entry]));
  const captureById = new Map(capture.cases.map((entry) => [entry.caseId, entry]));
  const representationResource = new Map<string, ResourceKey>();
  for (const projected of context.sourceSnapshot.resources) {
    for (const representation of projected.representations) {
      representationResource.set(representation.id, representation.resourceKey);
    }
  }

  for (const entry of parsedCases) {
    assertSafeProjection(entry.safeCase);
    if (entry.sourceReadinessCaseId !== entry.id) throw new Error(`B5 case ${entry.id} must bind the matching readiness case.`);
    const readiness = readinessById.get(entry.sourceReadinessCaseId);
    const captured = captureById.get(entry.id);
    if (!readiness || !captured) throw new Error(`B5 case ${entry.id} is missing a frozen source case.`);
    if (entry.taxonomy.basis.source !== "initial-classification" && entry.taxonomy.basis.source !== "customer-evidence") {
      throw new Error(`B5 case ${entry.id} contains hindsight taxonomy.`);
    }

    const candidateKeys = new Set(captured.retrieval.candidates.map(({ resourceKey }) => resourceKey));
    const judgedKeys = entry.judgments.map(({ resourceKey }) => resourceKey);
    assertUnique(judgedKeys, `B5 case ${entry.id} has duplicate judgments.`);
    assertUnique(entry.unjudgedCandidateKeys, `B5 case ${entry.id} has duplicate unjudged candidates.`);
    for (const key of [...judgedKeys, ...entry.unjudgedCandidateKeys]) {
      if (!candidateKeys.has(key)) throw new Error(`B5 case ${entry.id} names candidate ${key} outside the frozen B4 registry.`);
    }
    const accounted = new Set<ResourceKey>([...judgedKeys, ...entry.unjudgedCandidateKeys]);
    if (accounted.size !== candidateKeys.size || [...candidateKeys].some((key) => !accounted.has(key))) {
      throw new Error(`B5 case ${entry.id} must explicitly partition every captured candidate into judged or unjudged.`);
    }
    if (judgedKeys.some((key) => entry.unjudgedCandidateKeys.includes(key))) {
      throw new Error(`B5 case ${entry.id} cannot both judge and exclude a candidate.`);
    }

    const readinessJudged = new Set<ResourceKey>([
      ...readiness.expectation.requiredResourceKeys,
      ...readiness.expectation.relevantResourceKeys,
      ...readiness.expectation.hardNegativeResourceKeys,
    ] as ResourceKey[]);
    for (const key of readinessJudged) {
      if (candidateKeys.has(key) && !judgedKeys.includes(key)) {
        throw new Error(`B5 case ${entry.id} must deliberately judge readiness-labelled candidate ${key}.`);
      }
    }
    for (const candidate of captured.retrieval.candidates) {
      const referenceOnly = candidate.lexical === undefined && candidate.semantic === undefined
        && (candidate.deterministicReferences.length > 0 || candidate.knownCauseReferences.length > 0);
      if (referenceOnly && !judgedKeys.includes(candidate.resourceKey)) {
        throw new Error(`B5 case ${entry.id} must deliberately judge reference-only candidate ${candidate.resourceKey}.`);
      }
    }

    const factIds = new Set([...entry.safeCase.observedFacts, ...entry.safeCase.conversationState].map(({ id }) => id));
    const judgmentByKey = new Map(entry.judgments.map((judgment) => [judgment.resourceKey, judgment]));
    for (const judgment of entry.judgments) {
      const supporting = new Set(judgment.supportingEvidence.map((reference) => `${reference.kind}:${reference.id}`));
      if (judgment.contradictingEvidence.some((reference) => supporting.has(`${reference.kind}:${reference.id}`))) {
        throw new Error(`B5 case ${entry.id} judgment ${judgment.resourceKey} reuses evidence on both sides.`);
      }
      if (judgment.verdict === "applicable-next-step" && judgment.supportingEvidence.length === 0) {
        throw new Error(`B5 case ${entry.id} applicable judgment ${judgment.resourceKey} requires supporting evidence.`);
      }
      if (judgment.verdict === "insufficient-evidence" && (judgment.supportingEvidence.length === 0 || judgment.missingEvidence.length === 0)) {
        throw new Error(`B5 case ${entry.id} insufficient-evidence judgment ${judgment.resourceKey} requires support and missing evidence.`);
      }
      if (judgment.verdict === "contradicted" && judgment.contradictingEvidence.length === 0) {
        throw new Error(`B5 case ${entry.id} contradicted judgment ${judgment.resourceKey} requires contradicting evidence.`);
      }
      if (judgment.verdict === "irrelevant" && judgment.supportingEvidence.length !== 0) {
        throw new Error(`B5 case ${entry.id} irrelevant judgment ${judgment.resourceKey} cannot claim supporting evidence.`);
      }
      for (const reference of referenceIds(judgment)) {
        if (reference.kind === "case-fact") {
          if (!factIds.has(reference.id)) throw new Error(`B5 case ${entry.id} cites unknown fact ${reference.id}.`);
          continue;
        }
        const owner = representationResource.get(reference.id);
        if (owner === undefined) throw new Error(`B5 case ${entry.id} cites unknown representation ${reference.id}.`);
        if (owner !== judgment.resourceKey) throw new Error(`B5 case ${entry.id} cites representation ${reference.id} for the wrong candidate.`);
      }
    }

    const hypothesisSpecs = [
      ...entry.synthesisOracle.acceptableLeadingHypotheses,
      ...entry.synthesisOracle.orderedAlternativeHypotheses,
    ];
    for (const hypothesis of hypothesisSpecs) {
      for (const key of hypothesis.candidateKeyPool) {
        const judgment = judgmentByKey.get(key);
        if (judgment === undefined) throw new Error(`B5 case ${entry.id} synthesis names unjudged candidate ${key}.`);
        if (judgment.verdict === "contradicted" || judgment.verdict === "irrelevant") {
          throw new Error(`B5 case ${entry.id} synthesis cannot ground a hypothesis in ${judgment.verdict} candidate ${key}.`);
        }
      }
    }
    const maximumRank = entry.synthesisOracle.orderedAlternativeHypotheses.length;
    for (const intent of entry.synthesisOracle.evidenceActionIntents) {
      if (intent.targetRanks.some((rank) => rank > maximumRank)) {
        throw new Error(`B5 case ${entry.id} evidence-action intent names an unavailable hypothesis rank.`);
      }
    }
    if (entry.synthesisOracle.disposition === "abstain") {
      if (entry.synthesisOracle.acceptableLeadingHypotheses.length !== 0 || entry.synthesisOracle.orderedAlternativeHypotheses.length !== 0) {
        throw new Error(`B5 case ${entry.id} abstention cannot predeclare ranked hypotheses.`);
      }
      if (entry.synthesisOracle.evidenceActionIntents.some(({ targetRanks }) => targetRanks.length !== 0)) {
        throw new Error(`B5 case ${entry.id} abstention evidence actions cannot target a hypothesis rank.`);
      }
    } else {
      if (entry.synthesisOracle.acceptableLeadingHypotheses.length === 0) {
        throw new Error(`B5 case ${entry.id} hypothesis requires an acceptable leading hypothesis.`);
      }
      if (!entry.synthesisOracle.evidenceActionIntents.some(({ targetRanks }) => targetRanks.includes(0))) {
        throw new Error(`B5 case ${entry.id} requires a concrete evidence action for the leading hypothesis.`);
      }
    }
  }
}

export function selectApplicabilityDevelopmentForExecution(
  cases: readonly ApplicabilityDevelopmentCase[],
): ApplicabilityDevelopmentCase[] {
  const parsed = ApplicabilityDevelopmentCaseSchema.array().parse(cases);
  if (parsed.length === 0) throw new Error("B5 development case set must not be empty.");
  if (parsed.some(({ split }) => split !== "development")) throw new Error("B5 provider execution accepts development cases only.");
  if (parsed.some(({ review }) => review.status !== "approved")) throw new Error("Every B5 development case requires explicit approved review before provider execution.");
  return parsed;
}

export type { ApplicabilityVerdict, EvidenceReference, ResourceKey, SafeCaseProjection };
