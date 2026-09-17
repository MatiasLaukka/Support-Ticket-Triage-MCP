import { assessPromptInjection } from "../approval-desk/prompt-injection-safety.js";
import type { DiagnosticTaxonomyContext } from "../diagnostic-taxonomy.js";
import { deriveResourceRanks } from "./ranking.js";
import type { RankingCaptureCase } from "./ranking-capture.js";
import { hashText } from "./representations.js";
import {
  APPLICABILITY_CONTRACT_VERSION,
  APPLICABILITY_PROMPT_VERSION,
  hashCanonicalApplicabilityValue,
  validateApplicabilityInput,
  type ApplicabilityCandidateInput,
  type ApplicabilityInputIdentity,
  type ApplicabilityLane,
  type ApplicabilityReasoningInput,
  type ResolvedEvidenceRepresentation,
  type SafeCaseProjection,
} from "./applicability-types.js";
import type { Candidate, Reference, ResourceType, SourceSnapshot, TaxonomyMetadata } from "./types.js";

const resourceTypeOrder = new Map<ResourceType, number>([
  ["knowledge-article", 0],
  ["known-cause", 1],
  ["diagnostic-playbook", 2],
  ["resolved-ticket", 3],
]);

type SharedIdentity = Omit<ApplicabilityInputIdentity, "taxonomyHash" | "inputHash">;

export interface ApplicabilityCaseBasis {
  safeCase: SafeCaseProjection;
  candidates: readonly ApplicabilityCandidateInput[];
  evidenceRegistry: readonly ResolvedEvidenceRepresentation[];
  taxonomy: DiagnosticTaxonomyContext | null;
  sharedIdentity: SharedIdentity;
  nonTaxonomyBasisHash: string;
  promptInjectionRuleIds: readonly string[];
  candidateTaxonomy: readonly { resourceKey: string; taxonomy: TaxonomyMetadata | null }[];
}

export interface ApplicabilityInputMeasurement {
  serializedBytes: number;
  estimatedInputTokens: number;
  outputReserveTokens: number;
  minimumContextTokens: number;
  contextLimitTokens: number | null;
  fits: boolean | null;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCandidate(left: ApplicabilityCandidateInput, right: ApplicabilityCandidateInput): number {
  const type = resourceTypeOrder.get(left.resourceType)! - resourceTypeOrder.get(right.resourceType)!;
  return type === 0 ? compareOrdinal(left.resourceKey, right.resourceKey) : type;
}

function canonicalReferences(references: readonly Reference[]): readonly Reference[] {
  return references.map((reference) => ({ ...reference })).sort((left, right) =>
    compareOrdinal(left.channel, right.channel)
    || compareOrdinal(left.sourceId, right.sourceId)
    || compareOrdinal(left.sourceVersion ?? "", right.sourceVersion ?? "")
    || compareOrdinal(left.reason, right.reason)
    || compareOrdinal(left.resourceKey, right.resourceKey));
}

function sourceCorpusHash(sourceSnapshot: SourceSnapshot): string {
  return hashText(JSON.stringify(sourceSnapshot.resources
    .map(({ resource }) => [resource.key, resource.contentHash])
    .sort(([left], [right]) => compareOrdinal(left, right))));
}

function canonicalTaxonomy(taxonomy: DiagnosticTaxonomyContext): DiagnosticTaxonomyContext {
  return {
    ...taxonomy,
    secondaryProductSurfaces: [...taxonomy.secondaryProductSurfaces].sort((left, right) => compareOrdinal(`${left.domain}/${left.area}`, `${right.domain}/${right.area}`)),
    problemClasses: [...taxonomy.problemClasses].sort(compareOrdinal),
    basis: {
      ...taxonomy.basis,
      evidenceIds: [...taxonomy.basis.evidenceIds].sort(compareOrdinal),
      knowledgeArticleIds: [...taxonomy.basis.knowledgeArticleIds].sort(compareOrdinal),
      playbookIds: [...taxonomy.basis.playbookIds].sort(compareOrdinal),
      knownCauseIds: [...taxonomy.basis.knownCauseIds].sort(compareOrdinal),
    },
  };
}

function currentCandidate(
  candidate: Candidate,
  sourceSnapshot: SourceSnapshot,
  sourceMatchesCapture: boolean,
  evidenceRegistry: Map<string, ResolvedEvidenceRepresentation>,
): ApplicabilityCandidateInput {
  const references = canonicalReferences([...candidate.deterministicReferences, ...candidate.knownCauseReferences]);
  const resource = sourceSnapshot.resources.find(({ resource: item }) => item.key === candidate.resourceKey);
  const unavailable = (reason: "resource-unavailable" | "representation-unavailable" | "content-hash-mismatch" | "source-family-unavailable"): ApplicabilityCandidateInput => ({
    resourceKey: candidate.resourceKey,
    resourceType: candidate.resourceType,
    sourceId: resource?.resource.sourceId ?? candidate.resourceKey.slice(candidate.resourceKey.indexOf(":") + 1),
    ...(resource?.resource.sourceVersion === undefined ? {} : { sourceVersion: resource.resource.sourceVersion }),
    contentHash: resource?.resource.contentHash ?? hashText(candidate.resourceKey),
    evidence: { status: "unavailable", reasons: [reason], references: [...references] },
  });
  if (resource === undefined) return unavailable("resource-unavailable");
  if (resource.resource.type !== candidate.resourceType) return unavailable("content-hash-mismatch");

  const matched = new Map<string, Set<"lexical" | "semantic">>();
  for (const [channel, matches] of [["lexical", candidate.lexical?.matches], ["semantic", candidate.semantic?.matches]] as const) {
    for (const match of matches ?? []) {
      const channels = matched.get(match.representationId) ?? new Set<"lexical" | "semantic">();
      channels.add(channel);
      matched.set(match.representationId, channels);
    }
  }
  const representationIds = matched.size > 0
    ? [...matched.keys()].sort(compareOrdinal)
    : references.length > 0 ? resource.representations.map(({ id }) => id).sort(compareOrdinal) : [];
  if (representationIds.length === 0) return unavailable("representation-unavailable");
  const representations = new Map(resource.representations.map((representation) => [representation.id, representation]));
  if (representationIds.some((id) => !representations.has(id))) return unavailable("representation-unavailable");
  if (!sourceMatchesCapture) return unavailable("content-hash-mismatch");

  for (const id of representationIds) {
    const representation = representations.get(id)!;
    const channels = [...(matched.get(id) ?? new Set<"lexical" | "semantic">())].sort(compareOrdinal) as ("lexical" | "semantic")[];
    evidenceRegistry.set(`${representation.id}:${representation.contentHash}`, {
      id: representation.id,
      resourceKey: representation.resourceKey,
      kind: representation.kind,
      title: representation.title,
      ...(representation.heading === undefined ? {} : { heading: representation.heading }),
      contentHash: representation.contentHash,
      evidenceOrigin: channels.length === 0 ? "reference-grounded" : "matched",
      matchedChannels: channels,
      text: representation.semanticText,
    });
  }
  return {
    resourceKey: candidate.resourceKey,
    resourceType: candidate.resourceType,
    sourceId: resource.resource.sourceId,
    ...(resource.resource.sourceVersion === undefined ? {} : { sourceVersion: resource.resource.sourceVersion }),
    contentHash: resource.resource.contentHash,
    evidence: {
      status: "available",
      representationIds,
      matchedRepresentationIds: [...matched.keys()].sort(compareOrdinal),
      references: [...references],
    },
  };
}

export function resolveApplicabilityBasis(input: {
  captureHash: string;
  captureCase: RankingCaptureCase;
  safeCase: SafeCaseProjection;
  taxonomy: DiagnosticTaxonomyContext | null;
  sourceSnapshot: SourceSnapshot;
  caseSetHash: string;
  oracleHash: string;
}): ApplicabilityCaseBasis {
  const rankingInput = {
    contractVersion: 1 as const,
    queryBasis: input.captureCase.queryBasis,
    retrieval: input.captureCase.retrieval,
    outputLimits: input.captureCase.rankingProvenance.outputLimits,
  };
  // Derive the captured per-channel resource ranks without selecting a B4 policy.
  deriveResourceRanks(rankingInput);
  const sourceMatchesCapture = sourceCorpusHash(input.sourceSnapshot) === input.captureCase.corpusHash
    && input.captureCase.representationVersion === input.captureCase.indexIdentity.representationVersion;
  const evidence = new Map<string, ResolvedEvidenceRepresentation>();
  const candidates = input.captureCase.retrieval.candidates
    .map((candidate) => currentCandidate(candidate, input.sourceSnapshot, sourceMatchesCapture, evidence))
    .sort(compareCandidate);
  const evidenceRegistry = [...evidence.values()].sort((left, right) => compareOrdinal(left.id, right.id));
  const sharedIdentity: SharedIdentity = {
    contractVersion: APPLICABILITY_CONTRACT_VERSION,
    promptVersion: APPLICABILITY_PROMPT_VERSION,
    b4CaptureHash: input.captureHash,
    b4CaseInputHash: input.captureCase.rankingProvenance.inputHash,
    caseSetHash: input.caseSetHash,
    oracleHash: input.oracleHash,
    corpusHash: input.captureCase.corpusHash,
    indexGeneration: input.captureCase.indexIdentity.generation,
    lexicalGeneration: input.captureCase.indexIdentity.lexicalGeneration,
    semanticGeneration: input.captureCase.indexIdentity.semanticGeneration,
    representationVersion: input.captureCase.representationVersion,
    candidateSnapshotHash: hashCanonicalApplicabilityValue(candidates),
    evidenceRegistryHash: hashCanonicalApplicabilityValue(evidenceRegistry),
    safeCaseHash: hashCanonicalApplicabilityValue(input.safeCase),
  };
  const safety = assessPromptInjection([
    input.safeCase.problemStatement,
    ...input.safeCase.observedFacts.map(({ statement }) => statement),
    ...input.safeCase.conversationState.map(({ statement }) => statement),
    ...evidenceRegistry.map(({ text }) => text),
  ].join("\n"));
  return {
    safeCase: { ...input.safeCase, observedFacts: input.safeCase.observedFacts.map((fact) => ({ ...fact })), conversationState: input.safeCase.conversationState.map((fact) => ({ ...fact })) },
    candidates,
    evidenceRegistry,
    taxonomy: input.taxonomy === null ? null : canonicalTaxonomy(input.taxonomy),
    sharedIdentity,
    nonTaxonomyBasisHash: hashCanonicalApplicabilityValue({ safeCase: input.safeCase, candidates, evidenceRegistry, sharedIdentity }),
    promptInjectionRuleIds: safety.matchedRules.sort(compareOrdinal),
    candidateTaxonomy: input.captureCase.retrieval.candidates
      .map((candidate) => ({
        resourceKey: candidate.resourceKey,
        taxonomy: candidate.taxonomy === undefined ? null : {
          productSurfaces: [...candidate.taxonomy.productSurfaces].sort(compareOrdinal),
          problemClasses: [...candidate.taxonomy.problemClasses].sort(compareOrdinal),
        },
      }))
      .sort((left, right) => compareOrdinal(left.resourceKey, right.resourceKey)),
  };
}

export function buildApplicabilityInput(basis: ApplicabilityCaseBasis, lane: ApplicabilityLane): ApplicabilityReasoningInput {
  if (lane === "taxonomy-informed" && basis.taxonomy === null) throw new Error("Taxonomy-informed applicability input requires an eligible taxonomy context.");
  const identity = {
    ...basis.sharedIdentity,
    ...(lane === "taxonomy-informed" ? { taxonomyHash: hashCanonicalApplicabilityValue(basis.taxonomy) } : {}),
  };
  const projection = {
    contractVersion: APPLICABILITY_CONTRACT_VERSION,
    lane,
    case: basis.safeCase,
    candidates: basis.candidates,
    evidenceRegistry: basis.evidenceRegistry,
    ...(lane === "taxonomy-informed" ? {
      taxonomy: {
        case: basis.taxonomy!,
        candidateMetadata: basis.candidateTaxonomy.map((metadata) => ({ ...metadata })),
      },
    } : {}),
  };
  const input = {
    ...projection,
    identity: { ...identity, inputHash: hashCanonicalApplicabilityValue({ ...projection, identity }) },
  } as ApplicabilityReasoningInput;
  validateApplicabilityInput(input);
  return input;
}

function canonicalJson(value: unknown): string {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (item !== null && typeof item === "object") return Object.fromEntries(Object.keys(item as Record<string, unknown>).sort(compareOrdinal).map((key) => [key, canonicalize((item as Record<string, unknown>)[key])]));
    return item;
  };
  return JSON.stringify(canonicalize(value));
}

export function measureApplicabilityInput(
  input: ApplicabilityReasoningInput,
  budget?: { contextLimitTokens: number; outputReserveTokens: number },
): ApplicabilityInputMeasurement {
  validateApplicabilityInput(input);
  const serializedBytes = Buffer.byteLength(canonicalJson(input), "utf8");
  const estimatedInputTokens = Math.ceil(serializedBytes / 2);
  const outputReserveTokens = budget?.outputReserveTokens ?? 4_096;
  const minimumContextTokens = estimatedInputTokens + outputReserveTokens;
  const contextLimitTokens = budget?.contextLimitTokens ?? null;
  return {
    serializedBytes,
    estimatedInputTokens,
    outputReserveTokens,
    minimumContextTokens,
    contextLimitTokens,
    fits: contextLimitTokens === null ? null : minimumContextTokens <= contextLimitTokens,
  };
}
