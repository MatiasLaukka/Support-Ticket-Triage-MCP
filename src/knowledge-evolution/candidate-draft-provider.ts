import { classifyAiFailure } from "../approval-desk/draft-response-provider.js";
import type { AiFallbackCategory } from "../domain.js";
import {
  InvalidCandidateDraftContractError,
  parseCandidateDraftContract,
  type CandidateDraftPayload,
} from "./candidate-draft-contract.js";
import {
  CandidateDraftGuardrailError,
  sanitizeCandidateDraftAllowlists,
  sanitizeDiscoveryForCandidateDraft,
  validateCandidateDraft,
  type SanitizedKnowledgeDiscoveryCandidate,
} from "./candidate-draft-validation.js";
import type { KnowledgeDiscoveryResult } from "./discovery.js";

export interface CandidateDraftProviderInput {
  discovery: readonly SanitizedKnowledgeDiscoveryCandidate[];
  allowedEvidenceIds: readonly string[];
  allowedKnowledgeArticleIds: readonly string[];
}

export interface CandidateDraftProvider {
  enabled: boolean;
  draft(input: CandidateDraftProviderInput): Promise<{
    outputText: string;
    provenance?: {
      provider: "openai";
      model?: string;
      promptVersion?: string;
      rationale?: string;
    };
  }>;
}

export interface CandidateDraftResult {
  used: boolean;
  status: "disabled" | "skipped" | "fallback" | "used";
  fallbackReason?: AiFallbackCategory | "no-eligible-completed-diagnosis";
  provenance?: {
    provider: "openai";
    model?: string;
    promptVersion?: string;
    rationale?: string;
  };
  candidate?: CandidateDraftPayload;
  diagnostics?: string[];
}

export async function draftKnowledgeCandidate(
  input: {
    discovery: KnowledgeDiscoveryResult;
    allowedEvidenceIds: readonly string[];
    allowedKnowledgeArticleIds: readonly string[];
    actorId: string;
  },
  provider: CandidateDraftProvider,
): Promise<CandidateDraftResult> {
  if (!provider.enabled) {
    return { used: false, status: "disabled", fallbackReason: "not-configured", diagnostics: ["Candidate drafting is disabled."] };
  }
  let discovery: SanitizedKnowledgeDiscoveryCandidate[];
  let allowlists: { allowedEvidenceIds: string[]; allowedKnowledgeArticleIds: string[] };
  try {
    discovery = sanitizeDiscoveryForCandidateDraft(input.discovery);
    allowlists = sanitizeCandidateDraftAllowlists(input);
  } catch (error) {
    return fallback(error);
  }
  if (discovery.length === 0) {
    return { used: false, status: "skipped", fallbackReason: "no-eligible-completed-diagnosis", diagnostics: ["No eligible completed diagnosis is available for drafting."] };
  }
  try {
    const execution = await provider.draft({
      discovery,
      allowedEvidenceIds: allowlists.allowedEvidenceIds,
      allowedKnowledgeArticleIds: allowlists.allowedKnowledgeArticleIds,
    });
    const candidate = validateCandidateDraft(parseCandidateDraftContract(execution.outputText), {
      discovery,
      allowedEvidenceIds: allowlists.allowedEvidenceIds,
      allowedKnowledgeArticleIds: allowlists.allowedKnowledgeArticleIds,
    });
    const provenance = sanitizeProvenance(execution.provenance);
    return {
      used: true,
      status: "used",
      fallbackReason: undefined,
      candidate,
      ...(provenance === undefined ? {} : { provenance }),
    };
  } catch (error) {
    return fallback(error);
  }
}

function fallback(error: unknown): CandidateDraftResult {
  if (error instanceof CandidateDraftGuardrailError) {
    return { used: false, status: "fallback", fallbackReason: "guardrail-rejected", diagnostics: ["Candidate draft did not pass safety validation."] };
  }
  if (error instanceof InvalidCandidateDraftContractError) {
    return {
      used: false,
      status: "fallback",
      fallbackReason: error.category,
      diagnostics: [error.category === "guardrail-rejected" ? "Candidate draft did not pass safety validation." : "Candidate draft did not match the expected structured contract."],
    };
  }
  const failure = classifyAiFailure(error);
  return { used: false, status: "fallback", fallbackReason: failure.category, diagnostics: [failure.message] };
}

function sanitizeProvenance(value: unknown): CandidateDraftResult["provenance"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const provenance = value as { provider?: unknown; model?: unknown; promptVersion?: unknown; rationale?: unknown };
  if (provenance.provider !== "openai") return undefined;
  const safe = (entry: unknown, max: number): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= max && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(entry);
  const rationale = provenance.rationale;
  const safeRationale = typeof rationale === "string" && rationale.length > 0 && rationale.length <= 240 && !/(?:\b(?:ignore|disregard|override)\b|\b(?:system|developer|user)\s+(?:prompt|message|instructions?)\b|\b(?:hidden|chain[- ]of[- ]thought|reasoning)\b|\b(?:api[-_]?key|access[-_]?token|secret|password)\s*[=:]|\bsk-[a-z0-9_-]+\b|(?:[A-Za-z]:[\\/]|\\\\)|\b(?:model|provider)\s+(?:payload|response)\b)/i.test(rationale);
  return {
    provider: "openai",
    ...(safe(provenance.model, 120) ? { model: provenance.model } : {}),
    ...(safe(provenance.promptVersion, 120) ? { promptVersion: provenance.promptVersion } : {}),
    ...(safeRationale ? { rationale: rationale.trim() } : {}),
  };
}
