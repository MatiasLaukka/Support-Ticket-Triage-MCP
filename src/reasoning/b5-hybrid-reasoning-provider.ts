import { findEvidenceRequirement, isEvidenceRequirementId } from "../evidence-catalog.js";
import {
  assessApplicabilitySemanticCase,
} from "../retrieval/applicability.js";
import type {
  ApplicabilityCaseResult,
  ApplicabilitySemanticReasoningProvider,
  ApplicabilityTaxonomyInformedSemanticReasoningInput,
  CandidateAssessment,
} from "../retrieval/applicability-types.js";
import type { ResourceType } from "../retrieval/types.js";
import { B5_TAXONOMY_INFORMED_ADAPTER_ID, type EvidenceActionId, type EvidenceRequirement, type HybridReasoningInput, type HybridReasoningResult, type Hypothesis } from "./types.js";
import { HybridReasoningProviderError, type DeepReadonly, type HybridReasoningProvider } from "./hybrid-shadow-runner.js";
import type { ReasoningProviderIdentity } from "./shadow-run-types.js";
import type { EvidenceRequirementId } from "../evidence-catalog.js";

type CatalogEvidenceSource = EvidenceRequirement["source"];

/** Uses the existing B5 semantic path with the taxonomy projection frozen by H5b0. */
export class B5TaxonomyInformedHybridReasoningProvider implements HybridReasoningProvider {
  readonly semanticContractId = B5_TAXONOMY_INFORMED_ADAPTER_ID;
  readonly identity: ReasoningProviderIdentity;

  constructor(
    private readonly b5Provider: ApplicabilitySemanticReasoningProvider,
    identity: ReasoningProviderIdentity,
  ) {
    this.identity = { providerKind: identity.providerKind, model: identity.model };
  }

  async reason(input: DeepReadonly<HybridReasoningInput>): Promise<HybridReasoningResult> {
    if (input.mode !== "evaluation") {
      throw new HybridReasoningProviderError("UNSUPPORTED_MODE");
    }

    let assessment: ApplicabilityCaseResult;
    try {
      assessment = await assessApplicabilitySemanticCase({
        input: input.applicability as ApplicabilityTaxonomyInformedSemanticReasoningInput,
        provider: this.b5Provider,
      });
    } catch {
      throw new HybridReasoningProviderError("UNAVAILABLE");
    }

    if (assessment.status === "assessment-failed") {
      if (assessment.reason === "invalid-provider-output") {
        throw new HybridReasoningProviderError("INVALID_OUTPUT");
      }
      throw new HybridReasoningProviderError(assessment.reason === "timeout" ? "TIMEOUT" : "UNAVAILABLE");
    }
    if (assessment.status === "assessment-skipped") {
      throw new HybridReasoningProviderError("UNAVAILABLE");
    }

    if (
      assessment.telemetry.providerKind !== this.identity.providerKind
      || assessment.telemetry.model !== this.identity.model
    ) {
      throw new HybridReasoningProviderError("UNAVAILABLE");
    }

    return mapB5OutputToHybridResult(input, assessment);
  }
}

function mapB5OutputToHybridResult(
  input: DeepReadonly<HybridReasoningInput>,
  assessment: Extract<ApplicabilityCaseResult, { status: "complete" | "partial-assessment" }>,
): HybridReasoningResult {
  const requirementMapping = mapEvidenceRequirements(input.applicability, assessment.assessments);
  const synthesis = assessment.synthesis;
  const hypotheses: Hypothesis[] = synthesis.disposition === "abstain"
    ? []
    : [synthesis.leadingHypothesis, ...synthesis.alternatives].map((hypothesis, index) => {
      const evidenceRequirementIds = hypothesis.kind === "candidate-grounded"
        ? [...new Set(hypothesis.candidateKeys.flatMap((candidateKey) =>
          requirementMapping.byCandidate.get(candidateKey) ?? [],
        ))].sort(compareOrdinal)
        : [];
      return {
        id: `${B5_TAXONOMY_INFORMED_ADAPTER_ID}-hypothesis-${index + 1}`,
        statement: hypothesis.summary,
        rank: index + 1,
        ...(evidenceRequirementIds.length === 0 ? {} : { evidenceRequirementIds }),
      };
    });
  const actions = synthesis.disposition === "abstain"
    ? []
    : synthesis.nextEvidenceActions.map((action, index) => ({
      id: `${B5_TAXONOMY_INFORMED_ADAPTER_ID}-action-${index + 1}` as EvidenceActionId,
      description: `[${action.actionType}] ${action.action} Expected evidence: ${action.expectedEvidence}`,
      hypothesisIds: action.hypothesisRanks.map((rank) => hypotheses[rank]!.id) as [string, ...string[]],
    }));

  return {
    mode: "evaluation",
    basis: structuredClone(input.basis),
    evidenceRequirements: requirementMapping.requirements,
    hypotheses,
    relationships: [],
    actions,
  };
}

function mapEvidenceRequirements(
  input: DeepReadonly<HybridReasoningInput["applicability"]>,
  assessments: readonly CandidateAssessment[],
): {
  requirements: EvidenceRequirement[];
  byCandidate: Map<string, EvidenceRequirement["id"][]>;
} {
  const candidates = new Map(input.candidates.map(({ resourceKey, resourceType }) => [resourceKey, resourceType]));
  const requirementById = new Map<EvidenceRequirement["id"], EvidenceRequirement>();
  const requirementIdsByCandidate = new Map<string, Set<EvidenceRequirement["id"]>>();
  const ambiguousIds = new Set<EvidenceRequirement["id"]>();

  for (const assessment of assessments) {
    const source = evidenceSourceFor(candidates.get(assessment.resourceKey));
    if (source === undefined) continue;
    for (const missing of assessment.missingEvidence) {
      if (!isEvidenceRequirementId(missing.item)) continue;
      const requirementId: EvidenceRequirementId = missing.item;
      const definition = findEvidenceRequirement(missing.item);
      if (definition === undefined || definition.status !== "active") continue;
      const previous = requirementById.get(requirementId);
      if (previous !== undefined && previous.source !== source) {
        ambiguousIds.add(requirementId);
        requirementById.delete(requirementId);
        for (const ids of requirementIdsByCandidate.values()) ids.delete(requirementId);
        continue;
      }
      if (ambiguousIds.has(requirementId)) continue;
      requirementById.set(requirementId, {
        id: requirementId,
        label: definition.label,
        customerQuestion: definition.customerQuestion,
        aliases: [...definition.aliases],
        source,
      });
      const ids = requirementIdsByCandidate.get(assessment.resourceKey) ?? new Set<EvidenceRequirement["id"]>();
      ids.add(requirementId);
      requirementIdsByCandidate.set(assessment.resourceKey, ids);
    }
  }

  return {
    requirements: [...requirementById.values()].sort((left, right) => compareOrdinal(left.id, right.id)),
    byCandidate: new Map([...requirementIdsByCandidate].map(([candidateKey, ids]) => [
      candidateKey,
      [...ids].filter((id) => !ambiguousIds.has(id)).sort(compareOrdinal),
    ])),
  };
}

function evidenceSourceFor(resourceType: ResourceType | undefined): CatalogEvidenceSource | undefined {
  switch (resourceType) {
    case "knowledge-article": return "knowledge";
    case "known-cause": return "known-cause";
    case "diagnostic-playbook": return "policy";
    case "resolved-ticket":
    case undefined:
      return undefined;
  }
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
