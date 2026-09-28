import { TicketIdSchema } from "../../src/domain.js";
import type { HybridReasoningInput } from "../../src/reasoning/types.js";
import type {
  ApplicabilityProviderOutput,
  ApplicabilityTaxonomyInformedSemanticReasoningInput,
} from "../../src/retrieval/applicability-types.js";
import type { Candidate, Reference } from "../../src/retrieval/types.js";

export const B5_FACT_ID = "ticket.description";
export const B5_RESOURCE_KEYS = [
  "knowledge-article:webhook-delay",
  "known-cause:retry-saturation",
] as const;

export function taxonomyInformedSemanticInput(): ApplicabilityTaxonomyInformedSemanticReasoningInput {
  const [knowledgeKey, knownCauseKey] = B5_RESOURCE_KEYS;
  const factReference = { kind: "case-fact" as const, id: B5_FACT_ID };
  return {
    contractVersion: 4,
    lane: "taxonomy-informed",
    case: {
      problemStatement: "Webhook delivery is delayed.",
      observedFacts: [{ id: B5_FACT_ID, statement: "Delivery attempts arrive late." }],
      conversationState: [],
    },
    candidates: [
      {
        resourceKey: knowledgeKey,
        resourceType: "knowledge-article",
        sourceId: "article-webhook-delay",
        sourceVersion: "article-v1",
        contentHash: "a".repeat(64),
        evidence: {
          status: "available",
          representationIds: ["representation:webhook-delay"],
          matchedRepresentationIds: ["representation:webhook-delay"],
          references: [{
            resourceKey: knowledgeKey,
            channel: "deterministic-reference",
            sourceId: "classifier:webhook-delay",
            sourceVersion: "4",
            reason: "classifier-association",
          }],
        },
      },
      {
        resourceKey: knownCauseKey,
        resourceType: "known-cause",
        sourceId: "cause-retry-saturation",
        sourceVersion: "cause-v1",
        contentHash: "b".repeat(64),
        evidence: {
          status: "available",
          representationIds: ["representation:retry-saturation"],
          matchedRepresentationIds: ["representation:retry-saturation"],
          references: [{
            resourceKey: knownCauseKey,
            channel: "known-cause-reference",
            sourceId: "cause-link:webhook-delay",
            sourceVersion: "2",
            reason: "known-cause-link",
          }],
        },
      },
    ],
    evidenceRegistry: [
      {
        id: "representation:retry-saturation",
        resourceKey: knownCauseKey,
        kind: "known-cause",
        title: "Retry saturation",
        contentHash: "c".repeat(64),
        evidenceOrigin: "matched",
        matchedChannels: ["semantic"],
        text: "A growing retry queue can delay later webhook attempts.",
      },
      {
        id: "representation:webhook-delay",
        resourceKey: knowledgeKey,
        kind: "section",
        title: "Webhook retry timing",
        heading: "Delivery schedule",
        contentHash: "d".repeat(64),
        evidenceOrigin: "matched",
        matchedChannels: ["lexical"],
        text: "Compare delivery-attempt timestamps with the configured retry interval.",
      },
    ],
    taxonomy: {
      case: {
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
          explanation: "The applicable taxonomy revision classifies the report.",
        },
      },
      candidateMetadata: [
        { resourceKey: knowledgeKey, taxonomy: { productSurfaces: ["messaging/campaigns"], problemClasses: ["defect"] } },
        { resourceKey: knownCauseKey, taxonomy: { productSurfaces: ["messaging/campaigns"], problemClasses: ["defect"] } },
      ],
    },
  };
}

export function hybridReasoningInput(
  applicability = taxonomyInformedSemanticInput(),
  mode: HybridReasoningInput["mode"] = "evaluation",
): HybridReasoningInput {
  const index = {
    schemaVersion: 2,
    representationVersion: 1,
    generation: 8,
    lexicalGeneration: 8,
    semanticGeneration: 7,
    corpusHash: "corpus-hash-8",
    model: { id: "embedder", revision: "2026-09", dimensions: 3 },
    state: "degraded" as const,
  };
  return {
    mode,
    basis: {
      ticketId: TicketIdSchema.parse("TKT-0101"),
      ticketRevision: 7,
      customerReplyWatermark: { state: "none" },
      retrievalIndex: index,
    },
    observations: [],
    retrievalCandidates: applicability.candidates.map((candidate) => {
      const references = candidate.evidence.references as readonly Reference[];
      return {
        resourceKey: candidate.resourceKey as Candidate["resourceKey"],
        resourceType: candidate.resourceType,
        deterministicReferences: references.filter(({ channel }) => channel === "deterministic-reference"),
        knownCauseReferences: references.filter(({ channel }) => channel === "known-cause-reference"),
      };
    }),
    retrieval: {
      lexical: { status: "used" },
      semantic: { status: "unavailable", reason: "provider-not-configured" },
      referenceDiagnostics: [],
    },
    ranking: { status: "not-requested" },
    applicability,
    applicabilityTaxonomyRevision: 1,
  };
}

export function validB5Output(
  input: ApplicabilityTaxonomyInformedSemanticReasoningInput,
  missingEvidenceItem = "request-id",
): ApplicabilityProviderOutput {
  const candidates = input.candidates.filter(({ evidence }) => evidence.status === "available");
  const first = candidates[0]!;
  const evidence = { kind: "case-fact" as const, id: input.case.observedFacts[0]!.id };
  return {
    candidateAssessments: candidates.map((candidate, index) => index === 0
      ? {
        resourceKey: candidate.resourceKey,
        verdict: "insufficient-evidence" as const,
        supportingEvidence: [evidence],
        contradictingEvidence: [],
        missingEvidence: [{ item: missingEvidenceItem, evidence: [evidence] }],
        explanation: "The retry path is plausible, but a request identifier is needed to compare attempts.",
        taxonomyRelation: "supports" as const,
      }
      : {
        resourceKey: candidate.resourceKey,
        verdict: "applicable-next-step" as const,
        supportingEvidence: [evidence],
        contradictingEvidence: [],
        missingEvidence: [],
        explanation: "The linked retry saturation mechanism can explain the reported delay.",
        taxonomyRelation: "neutral" as const,
      }),
    synthesis: {
      disposition: "hypothesis",
      leadingHypothesis: {
        kind: "candidate-grounded",
        summary: "A growing retry queue is delaying webhook delivery.",
        candidateKeys: [first.resourceKey],
        evidence: [evidence],
      },
      alternatives: candidates.slice(1).map((candidate, index) => ({
        kind: "candidate-grounded" as const,
        summary: index === 0
          ? "The configured retry interval is longer than expected."
          : `A separate retry interval issue is plausible (${index + 1}).`,
        candidateKeys: [candidate.resourceKey],
        evidence: [evidence],
      })),
      nextEvidenceActions: [
        {
          actionType: "inspect-internal",
          action: "Compare retry queue depth across delivery attempts.",
          expectedEvidence: "Queue depth and attempt timestamps for the same request.",
          hypothesisRanks: [0],
        },
        ...candidates.slice(1).map((_, index) => ({
          actionType: "run-check" as const,
          action: "Compare configured retry interval with observed delivery timing.",
          expectedEvidence: "The effective retry interval and event timestamps.",
          hypothesisRanks: [0, index + 1],
        })),
      ],
    },
  };
}
