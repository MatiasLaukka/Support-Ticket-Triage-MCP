import { createHash } from "node:crypto";

import { z } from "zod";

import { DiagnosticTaxonomyContextSchema, type DiagnosticTaxonomyContext } from "../diagnostic-taxonomy.js";
import type { AiUsage } from "../domain.js";
import type { Reference, ResourceKey, ResourceType, TaxonomyMetadata } from "./types.js";

export const APPLICABILITY_CONTRACT_VERSION = 1 as const;
export const APPLICABILITY_PROMPT_VERSION = "b5-applicability-v1" as const;
export const APPLICABILITY_OUTPUT_RESERVE_TOKENS = 4_096 as const;

export type ApplicabilityLane = "evidence-only" | "taxonomy-informed";
export type ApplicabilityVerdict =
  | "applicable-next-step"
  | "contradicted"
  | "insufficient-evidence"
  | "irrelevant";
export type ApplicabilityExecutionStatus =
  | "complete"
  | "partial-assessment"
  | "assessment-skipped"
  | "assessment-failed";
export type EvidenceReference =
  | { kind: "case-fact"; id: string }
  | { kind: "resource-representation"; id: string };
export type ApplicabilityProviderFailureReason =
  | "not-configured"
  | "transport"
  | "http"
  | "response-body"
  | "timeout"
  | "context-exhausted";
export type EvidenceUnavailableReason =
  | "resource-unavailable"
  | "representation-unavailable"
  | "content-hash-mismatch"
  | "source-family-unavailable";

const stableIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const resourceTypes = ["knowledge-article", "known-cause", "diagnostic-playbook", "resolved-ticket"] as const;
const resourceTypeOrder = new Map<ResourceType, number>(resourceTypes.map((resourceType, index) => [resourceType, index]));
const matchedChannelOrder = new Map(["lexical", "semantic"].map((channel, index) => [channel, index]));

const StableIdSchema = z.string().min(1).max(256).regex(stableIdPattern);
const Sha256Schema = z.string().regex(sha256Pattern);
const FactSchema = z.object({ id: StableIdSchema, statement: z.string().min(1).max(600) }).strict();
const ResourceTypeSchema = z.enum(resourceTypes);
const ResourceKeySchema = StableIdSchema.superRefine((value, context) => {
  const separator = value.indexOf(":");
  const resourceType = separator === -1 ? "" : value.slice(0, separator);
  if (!resourceTypes.includes(resourceType as ResourceType) || separator === value.length - 1) {
    context.addIssue({ code: "custom", message: "Resource key must include a supported resource type." });
  }
});
const ReferenceSchema = z.object({
  resourceKey: ResourceKeySchema,
  channel: z.enum(["deterministic-reference", "known-cause-reference"]),
  sourceId: StableIdSchema,
  sourceVersion: StableIdSchema.optional(),
  reason: z.enum(["classifier-association", "known-cause-link", "safety-inclusion"]),
}).strict();
const TaxonomyMetadataSchema = z.object({
  productSurfaces: z.array(z.string().min(1).max(256)).max(32),
  problemClasses: z.array(z.string().min(1).max(256)).max(32),
}).strict();
const EvidenceReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("case-fact"), id: StableIdSchema }).strict(),
  z.object({ kind: z.literal("resource-representation"), id: StableIdSchema }).strict(),
]);
const AvailableEvidenceSchema = z.object({
  status: z.literal("available"),
  representationIds: z.array(StableIdSchema).min(1).max(256),
  matchedRepresentationIds: z.array(StableIdSchema).max(256),
  references: z.array(ReferenceSchema).max(64),
}).strict();
const UnavailableEvidenceSchema = z.object({
  status: z.literal("unavailable"),
  reasons: z.array(z.enum(["resource-unavailable", "representation-unavailable", "content-hash-mismatch", "source-family-unavailable"])).min(1).max(4),
  references: z.array(ReferenceSchema).max(64),
}).strict();
const CandidateEvidenceSchema = z.discriminatedUnion("status", [AvailableEvidenceSchema, UnavailableEvidenceSchema]);

const ApplicabilityCandidateInputSchema = z.object({
  resourceKey: ResourceKeySchema,
  resourceType: ResourceTypeSchema,
  sourceId: StableIdSchema,
  sourceVersion: StableIdSchema.optional(),
  contentHash: Sha256Schema,
  evidence: CandidateEvidenceSchema,
}).strict().superRefine((candidate, context) => {
  if (!candidate.resourceKey.startsWith(`${candidate.resourceType}:`)) {
    context.addIssue({ code: "custom", path: ["resourceKey"], message: "Resource key must match resource type." });
  }
  for (const reference of candidate.evidence.references) {
    if (reference.resourceKey !== candidate.resourceKey) {
      context.addIssue({ code: "custom", path: ["evidence", "references"], message: "Candidate references must identify their candidate." });
    }
  }
});

const ResolvedEvidenceRepresentationSchema = z.object({
  id: StableIdSchema,
  resourceKey: ResourceKeySchema,
  kind: z.string().min(1).max(256),
  title: z.string().min(1).max(600),
  heading: z.string().min(1).max(600).optional(),
  contentHash: Sha256Schema,
  evidenceOrigin: z.enum(["matched", "reference-grounded"]),
  matchedChannels: z.array(z.enum(["lexical", "semantic"])).max(2),
  text: z.string().min(1).max(100_000),
}).strict().superRefine((representation, context) => {
  if (new Set(representation.matchedChannels).size !== representation.matchedChannels.length) {
    context.addIssue({ code: "custom", path: ["matchedChannels"], message: "Matched channels must be unique." });
  }
  if (representation.evidenceOrigin === "matched" && representation.matchedChannels.length === 0) {
    context.addIssue({ code: "custom", path: ["matchedChannels"], message: "Matched evidence requires a matched channel." });
  }
  if (representation.evidenceOrigin === "reference-grounded" && representation.matchedChannels.length !== 0) {
    context.addIssue({ code: "custom", path: ["matchedChannels"], message: "Reference-grounded evidence cannot claim a matched channel." });
  }
});

const SafeCaseProjectionSchema = z.object({
  caseId: StableIdSchema,
  problemStatement: z.string().min(1).max(600),
  observedFacts: z.array(FactSchema).max(32),
  conversationState: z.array(FactSchema).max(16),
}).strict();

const ApplicabilityInputIdentitySchema = z.object({
  contractVersion: z.literal(APPLICABILITY_CONTRACT_VERSION),
  promptVersion: z.literal(APPLICABILITY_PROMPT_VERSION),
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
  taxonomyHash: Sha256Schema.nullable().optional(),
  inputHash: Sha256Schema,
}).strict();

const CandidateTaxonomyMetadataSchema = z.object({ resourceKey: ResourceKeySchema, taxonomy: TaxonomyMetadataSchema.nullable() }).strict();
const TaxonomyProjectionSchema = z.object({
  case: DiagnosticTaxonomyContextSchema,
  candidateMetadata: z.array(CandidateTaxonomyMetadataSchema).max(64),
}).strict();

const EvidenceOnlyInputSchema = z.object({
  contractVersion: z.literal(APPLICABILITY_CONTRACT_VERSION),
  lane: z.literal("evidence-only"),
  case: SafeCaseProjectionSchema,
  candidates: z.array(ApplicabilityCandidateInputSchema).max(64),
  evidenceRegistry: z.array(ResolvedEvidenceRepresentationSchema).max(256),
  identity: ApplicabilityInputIdentitySchema.omit({ taxonomyHash: true }).strict(),
}).strict();
const TaxonomyInformedInputSchema = z.object({
  contractVersion: z.literal(APPLICABILITY_CONTRACT_VERSION),
  lane: z.literal("taxonomy-informed"),
  case: SafeCaseProjectionSchema,
  candidates: z.array(ApplicabilityCandidateInputSchema).max(64),
  evidenceRegistry: z.array(ResolvedEvidenceRepresentationSchema).max(256),
  taxonomy: TaxonomyProjectionSchema,
  identity: ApplicabilityInputIdentitySchema.extend({ taxonomyHash: Sha256Schema }).strict(),
}).strict();

export const ApplicabilityReasoningInputSchema = z.discriminatedUnion("lane", [EvidenceOnlyInputSchema, TaxonomyInformedInputSchema]);

const MissingEvidenceItemSchema = z.object({ item: z.string().min(1).max(300), evidence: z.array(EvidenceReferenceSchema).max(16) }).strict();
const CandidateAssessmentSchema = z.object({
  resourceKey: ResourceKeySchema,
  verdict: z.enum(["applicable-next-step", "contradicted", "insufficient-evidence", "irrelevant"]),
  supportingEvidence: z.array(EvidenceReferenceSchema).max(32),
  contradictingEvidence: z.array(EvidenceReferenceSchema).max(32),
  missingEvidence: z.array(MissingEvidenceItemSchema).max(16),
  explanation: z.string().min(1).max(600),
  taxonomyRelation: z.enum(["supports", "conflicts", "neutral", "unavailable"]).optional(),
}).strict();
const AlternativeSchema = z.object({
  summary: z.string().min(1).max(600),
  candidateKeys: z.array(ResourceKeySchema).min(1).max(64),
  evidence: z.array(EvidenceReferenceSchema).max(32),
  qualified: z.boolean(),
}).strict();
const DiscriminatingQuestionSchema = z.object({ question: z.string().min(1).max(400), candidateKeys: z.array(ResourceKeySchema).min(1).max(64) }).strict();
const HypothesisSynthesisSchema = z.object({
  disposition: z.literal("hypothesis"),
  summary: z.string().min(1).max(600),
  supportingCandidateKeys: z.array(ResourceKeySchema).min(1).max(64),
  supportingEvidence: z.array(EvidenceReferenceSchema).min(1).max(32),
  alternatives: z.array(AlternativeSchema).max(8),
  discriminatingQuestions: z.array(DiscriminatingQuestionSchema).max(8),
}).strict();
const AbstainSynthesisSchema = z.object({
  disposition: z.literal("abstain"),
  summary: z.string().min(1).max(600),
  coverageGaps: z.array(z.string().min(1).max(300)).max(16),
  alternatives: z.array(AlternativeSchema).max(8),
  discriminatingQuestions: z.array(DiscriminatingQuestionSchema).max(8),
}).strict();
const ApplicabilityProviderOutputSchema = z.object({
  candidateAssessments: z.array(CandidateAssessmentSchema).max(64),
  synthesis: z.discriminatedUnion("disposition", [HypothesisSynthesisSchema, AbstainSynthesisSchema]),
}).strict();

export interface SafeCaseProjection {
  caseId: string;
  problemStatement: string;
  observedFacts: readonly { id: string; statement: string }[];
  conversationState: readonly { id: string; statement: string }[];
}
export interface ResolvedEvidenceRepresentation {
  id: string;
  resourceKey: ResourceKey;
  kind: string;
  title: string;
  heading?: string;
  contentHash: string;
  evidenceOrigin: "matched" | "reference-grounded";
  matchedChannels: readonly ("lexical" | "semantic")[];
  text: string;
}
export type ApplicabilityCandidateInput = z.infer<typeof ApplicabilityCandidateInputSchema>;
export type ApplicabilityInputIdentity = z.infer<typeof ApplicabilityInputIdentitySchema>;
export type ApplicabilityReasoningInput = z.infer<typeof ApplicabilityReasoningInputSchema>;
export type ApplicabilityProviderOutput = z.infer<typeof ApplicabilityProviderOutputSchema>;
export type CandidateAssessment = z.infer<typeof CandidateAssessmentSchema>;

export interface ApplicabilityReasoningExecution {
  output: ApplicabilityProviderOutput;
  telemetry: {
    providerKind: "openai-responses" | "controlled-test";
    model: string;
    latencyMs: number;
    usage?: AiUsage;
  };
}
export interface ApplicabilityReasoningProvider {
  assess(input: ApplicabilityReasoningInput): Promise<ApplicabilityReasoningExecution>;
}

export type ApplicabilityCaseResult =
  | { status: "complete"; assessments: readonly CandidateAssessment[]; synthesis: ApplicabilityProviderOutput["synthesis"]; telemetry: ApplicabilityReasoningExecution["telemetry"] }
  | { status: "partial-assessment"; assessments: readonly CandidateAssessment[]; synthesis: ApplicabilityProviderOutput["synthesis"]; unavailableCandidates: readonly { resourceKey: ResourceKey; reasons: readonly EvidenceUnavailableReason[] }[]; telemetry: ApplicabilityReasoningExecution["telemetry"] }
  | { status: "assessment-skipped"; reason: "no-assessable-candidates" | "input-too-large" }
  | { status: "assessment-failed"; reason: "invalid-provider-output" | ApplicabilityProviderFailureReason };

type InvalidApplicabilityStage = "input" | "provider-output" | "candidate-coverage" | "evidence-reference" | "synthesis" | "taxonomy-output";
const boundedErrorFields = new Set([
  "unknown-field", "unique-identities", "candidate-order", "evidence-registry-order", "candidate-evidence", "matched-representation", "matched-representation-origin", "candidate-taxonomy-order", "candidate-taxonomy", "taxonomy-semantic-set", "evidence-reference", "abstain", "applicable-next-step", "hypothesis-candidate", "alternative-candidate", "qualified", "missing-evidence", "insufficient-evidence-alternative", "taxonomyRelation",
]);
export class InvalidApplicabilitySchemaError extends Error {
  readonly stage: InvalidApplicabilityStage;
  readonly fields: readonly string[];

  constructor(stage: InvalidApplicabilityStage, fields: readonly string[] = []) {
    const boundedFields = fields.slice(0, 8).map((field) => boundedErrorFields.has(field) ? field : "invalid-field");
    super(stage === "candidate-coverage" ? "Applicability provider output must assess every assessable candidate exactly once." : `Invalid applicability schema at ${stage}${boundedFields.length === 0 ? ": unknown or invalid field." : `: ${boundedFields.join(", ")}.`}`);
    this.name = "InvalidApplicabilitySchemaError";
    this.stage = stage;
    this.fields = boundedFields;
  }
}
export class ApplicabilityProviderUnavailableError extends Error {
  readonly reason: ApplicabilityProviderFailureReason;
  readonly httpStatus: number | null;

  constructor(reason: ApplicabilityProviderFailureReason, httpStatus: number | null = null) {
    super(`Applicability provider unavailable: ${reason}.`);
    this.name = "ApplicabilityProviderUnavailableError";
    this.reason = reason;
    this.httpStatus = httpStatus !== null && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null;
  }
}

function assertUnique(values: readonly string[], stage: InvalidApplicabilityStage): void {
  if (new Set(values).size !== values.length) throw new InvalidApplicabilitySchemaError(stage, ["unique-identities"]);
}
function compareOrdinal(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function compareCandidates(left: ApplicabilityCandidateInput, right: ApplicabilityCandidateInput): number {
  const typeOrder = resourceTypeOrder.get(left.resourceType)! - resourceTypeOrder.get(right.resourceType)!;
  return typeOrder === 0 ? compareOrdinal(left.resourceKey, right.resourceKey) : typeOrder;
}
function isCanonical<T>(values: readonly T[], compare: (left: T, right: T) => number): boolean {
  return values.every((value, index) => index === 0 || compare(values[index - 1]!, value) <= 0);
}

export function validateApplicabilityInput(value: unknown): asserts value is ApplicabilityReasoningInput {
  let input: ApplicabilityReasoningInput;
  try {
    input = ApplicabilityReasoningInputSchema.parse(normalizeApplicabilitySemanticSets(value));
  } catch {
    throw new InvalidApplicabilitySchemaError("input", ["unknown-field"]);
  }
  assertUnique([...input.case.observedFacts, ...input.case.conversationState].map((fact) => fact.id), "input");
  assertUnique(input.candidates.map((candidate) => candidate.resourceKey), "input");
  assertUnique(input.evidenceRegistry.map((representation) => representation.id), "input");
  if (!isCanonical(input.candidates, compareCandidates)) throw new InvalidApplicabilitySchemaError("input", ["candidate-order"]);
  if (!isCanonical(input.evidenceRegistry, (left, right) => compareOrdinal(left.id, right.id))) throw new InvalidApplicabilitySchemaError("input", ["evidence-registry-order"]);

  const representations = new Map(input.evidenceRegistry.map((representation) => [representation.id, representation]));
  for (const candidate of input.candidates) {
    assertUnique(candidate.evidence.references.map((reference) => `${reference.channel}:${reference.sourceId}:${reference.reason}`), "input");
    if (candidate.evidence.status !== "available") continue;
    assertUnique(candidate.evidence.representationIds, "input");
    assertUnique(candidate.evidence.matchedRepresentationIds, "input");
    for (const representationId of candidate.evidence.representationIds) {
      const representation = representations.get(representationId);
      if (representation === undefined || representation.resourceKey !== candidate.resourceKey || representation.contentHash !== candidate.contentHash) {
        throw new InvalidApplicabilitySchemaError("input", ["candidate-evidence"]);
      }
    }
    for (const representationId of candidate.evidence.matchedRepresentationIds) {
      if (!candidate.evidence.representationIds.includes(representationId)) throw new InvalidApplicabilitySchemaError("input", ["matched-representation"]);
      if (representations.get(representationId)?.evidenceOrigin !== "matched") throw new InvalidApplicabilitySchemaError("input", ["matched-representation-origin"]);
    }
  }
  if (input.lane === "taxonomy-informed") {
    assertUnique(input.taxonomy.candidateMetadata.map((metadata) => metadata.resourceKey), "input");
    if (!isCanonical(input.taxonomy.candidateMetadata, (left, right) => compareOrdinal(left.resourceKey, right.resourceKey))) throw new InvalidApplicabilitySchemaError("input", ["candidate-taxonomy-order"]);
    for (const semanticSet of [
      input.taxonomy.case.basis.evidenceIds,
      input.taxonomy.case.basis.knowledgeArticleIds,
      input.taxonomy.case.basis.playbookIds,
      input.taxonomy.case.basis.knownCauseIds,
      ...input.taxonomy.candidateMetadata.flatMap((metadata) => metadata.taxonomy === null ? [] : [metadata.taxonomy.productSurfaces, metadata.taxonomy.problemClasses]),
    ]) {
      assertUnique(semanticSet, "input");
    }
    for (const metadata of input.taxonomy.candidateMetadata) {
      if (!input.candidates.some((candidate) => candidate.resourceKey === metadata.resourceKey)) throw new InvalidApplicabilitySchemaError("input", ["candidate-taxonomy"]);
    }
  }
}

function sameOrdinalSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort(compareOrdinal);
  const sortedRight = [...right].sort(compareOrdinal);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}
function assertEvidenceReferencesResolve(input: ApplicabilityReasoningInput, output: ApplicabilityProviderOutput): void {
  const factIds = new Set([...input.case.observedFacts, ...input.case.conversationState].map((fact) => fact.id));
  const representationIds = new Set(input.evidenceRegistry.map((representation) => representation.id));
  const references: EvidenceReference[] = [];
  for (const assessment of output.candidateAssessments) {
    references.push(...assessment.supportingEvidence, ...assessment.contradictingEvidence, ...assessment.missingEvidence.flatMap((item) => item.evidence));
  }
  references.push(...output.synthesis.alternatives.flatMap((alternative) => alternative.evidence));
  if (output.synthesis.disposition === "hypothesis") references.push(...output.synthesis.supportingEvidence);
  for (const reference of references) {
    if ((reference.kind === "case-fact" && !factIds.has(reference.id)) || (reference.kind === "resource-representation" && !representationIds.has(reference.id))) {
      throw new InvalidApplicabilitySchemaError("evidence-reference", ["evidence-reference"]);
    }
  }
}
function assertSynthesisConsistent(output: ApplicabilityProviderOutput): void {
  const assessments = new Map(output.candidateAssessments.map((assessment) => [assessment.resourceKey, assessment]));
  const applicable = new Set(output.candidateAssessments.filter((assessment) => assessment.verdict === "applicable-next-step").map((assessment) => assessment.resourceKey));
  if (applicable.size === 0 && output.synthesis.disposition !== "abstain") throw new InvalidApplicabilitySchemaError("synthesis", ["abstain"]);
  if (output.synthesis.disposition === "hypothesis") {
    if (!output.synthesis.supportingCandidateKeys.some((key) => applicable.has(key))) throw new InvalidApplicabilitySchemaError("synthesis", ["applicable-next-step"]);
    if (!output.synthesis.supportingCandidateKeys.every((key) => applicable.has(key))) throw new InvalidApplicabilitySchemaError("synthesis", ["hypothesis-candidate"]);
  }
  for (const alternative of output.synthesis.alternatives) {
    for (const key of alternative.candidateKeys) {
      const assessment = assessments.get(key);
      if (assessment === undefined || assessment.verdict === "contradicted" || assessment.verdict === "irrelevant") throw new InvalidApplicabilitySchemaError("synthesis", ["alternative-candidate"]);
      if (assessment.verdict === "insufficient-evidence" && (!alternative.qualified || assessment.missingEvidence.length === 0)) throw new InvalidApplicabilitySchemaError("synthesis", ["qualified"]);
    }
  }
  for (const assessment of output.candidateAssessments) {
    if (assessment.verdict === "insufficient-evidence" && assessment.missingEvidence.length === 0) throw new InvalidApplicabilitySchemaError("synthesis", ["missing-evidence"]);
    if (assessment.verdict === "insufficient-evidence" && !output.synthesis.alternatives.some((alternative) => alternative.qualified && alternative.candidateKeys.includes(assessment.resourceKey))) {
      throw new InvalidApplicabilitySchemaError("synthesis", ["insufficient-evidence-alternative"]);
    }
  }
}
function assertTaxonomyOutputMatchesLane(lane: ApplicabilityLane, output: ApplicabilityProviderOutput): void {
  const relations = output.candidateAssessments.map((assessment) => assessment.taxonomyRelation);
  if (lane === "evidence-only" && relations.some((relation) => relation !== undefined)) throw new InvalidApplicabilitySchemaError("taxonomy-output", ["taxonomyRelation"]);
  if (lane === "taxonomy-informed" && relations.some((relation) => relation === undefined)) throw new InvalidApplicabilitySchemaError("taxonomy-output", ["taxonomyRelation"]);
}

export function validateApplicabilityProviderOutput(input: ApplicabilityReasoningInput, value: unknown): asserts value is ApplicabilityProviderOutput {
  validateApplicabilityInput(input);
  let output: ApplicabilityProviderOutput;
  try {
    output = ApplicabilityProviderOutputSchema.parse(value);
  } catch {
    throw new InvalidApplicabilitySchemaError("provider-output", ["unknown-field"]);
  }
  const available = input.candidates.filter((candidate) => candidate.evidence.status === "available").map((candidate) => candidate.resourceKey);
  const returned = output.candidateAssessments.map((assessment) => assessment.resourceKey);
  if (!sameOrdinalSet(returned, available)) throw new InvalidApplicabilitySchemaError("candidate-coverage");
  assertEvidenceReferencesResolve(input, output);
  assertSynthesisConsistent(output);
  assertTaxonomyOutputMatchesLane(input.lane, output);
}

function normalizeSemanticSetArray(values: unknown[], parentKey?: string): unknown[] {
  if (parentKey === "candidateMetadata") return values.sort((left, right) => compareOrdinal((left as { resourceKey: string }).resourceKey, (right as { resourceKey: string }).resourceKey));
  if (parentKey === "secondaryProductSurfaces") return values.sort((left, right) => compareOrdinal(`${(left as { domain: string; area: string }).domain}/${(left as { domain: string; area: string }).area}`, `${(right as { domain: string; area: string }).domain}/${(right as { domain: string; area: string }).area}`));
  if (parentKey === "matchedChannels") return values.sort((left, right) => matchedChannelOrder.get(String(left))! - matchedChannelOrder.get(String(right))!);
  if (parentKey === "problemClasses" || parentKey === "productSurfaces" || parentKey === "evidenceIds" || parentKey === "knowledgeArticleIds" || parentKey === "playbookIds" || parentKey === "knownCauseIds") return values.sort((left, right) => compareOrdinal(String(left), String(right)));
  return values;
}
function normalizeApplicabilitySemanticSets(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) return normalizeSemanticSetArray(value.map((entry) => normalizeApplicabilitySemanticSets(entry)), parentKey);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalizeApplicabilitySemanticSets(entry, key)]));
  }
  return value;
}
function normalizeApplicabilityValue(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeApplicabilityValue(entry));
    if (parentKey === "candidates") return normalized.sort((left, right) => compareCandidates(left as ApplicabilityCandidateInput, right as ApplicabilityCandidateInput));
    if (parentKey === "evidenceRegistry") return normalized.sort((left, right) => compareOrdinal((left as { id: string }).id, (right as { id: string }).id));
    if (parentKey === "candidateMetadata") return normalized.sort((left, right) => compareOrdinal((left as { resourceKey: string }).resourceKey, (right as { resourceKey: string }).resourceKey));
    if (parentKey === "secondaryProductSurfaces" || parentKey === "matchedChannels" || parentKey === "problemClasses" || parentKey === "productSurfaces" || parentKey === "evidenceIds" || parentKey === "knowledgeArticleIds" || parentKey === "playbookIds" || parentKey === "knownCauseIds") return normalizeSemanticSetArray(normalized, parentKey);
    if (parentKey === "representationIds" || parentKey === "matchedRepresentationIds" || parentKey === "reasons") return normalized.sort((left, right) => compareOrdinal(String(left), String(right)));
    if (parentKey === "references") return normalized.sort((left, right) => compareOrdinal(JSON.stringify(left), JSON.stringify(right)));
    return normalized;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort(compareOrdinal).map((key) => [key, normalizeApplicabilityValue((value as Record<string, unknown>)[key], key)]));
  }
  return value;
}
export function hashCanonicalApplicabilityValue(value: unknown): string {
  const canonical = JSON.stringify(normalizeApplicabilityValue(value));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export type { Reference, ResourceKey, ResourceType, TaxonomyMetadata, DiagnosticTaxonomyContext };
