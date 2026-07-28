import type { KnowledgeDiscoveryCandidate, KnowledgeDiscoveryResult } from "./discovery.js";
import type { CandidateDraftPayload } from "./candidate-draft-contract.js";

const MAX_DISCOVERY_CANDIDATES = 5;
const MAX_SUPPORT_RECORDS = 5;
const SAFE_IDENTIFIER = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const UNSAFE_TEXT = /(?:\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system|developer|user)\s+(?:instructions?|prompts?|messages?)\b|\b(?:system|developer|user)\s+(?:prompt|message|instructions?)\s*:|\b(?:hidden|chain[- ]of[- ]thought|reasoning)\b|\b(?:api[-_]?key|access[-_]?token|secret|password)\s*[=:]\s*\S+|\bsk-[a-z0-9_-]+\b|(?:[A-Za-z]:[\\/]|\\\\)|(?:^|\s)[~\/][^\s]*|\b(?:model|provider)\s+(?:payload|response)\b|```)/i;

export interface SanitizedKnowledgeDiscoveryCandidate {
  id: string;
  score: number;
  reasons: string[];
  support: Array<{ source: "completed-diagnosis" | "open-ticket"; diagnosisId?: string; ticketId: string; score: number; reasons: string[] }>;
  supportCount: number;
  contradictions: string[];
  highValue: boolean;
  meetsAlertThreshold: boolean;
}

export interface CandidateDraftValidationContext {
  allowedEvidenceIds: readonly string[];
  allowedKnowledgeArticleIds: readonly string[];
  discovery: readonly SanitizedKnowledgeDiscoveryCandidate[];
}

export class CandidateDraftGuardrailError extends Error {
  readonly name = "CandidateDraftGuardrailError";

  constructor() {
    super("Candidate draft did not pass safety validation.");
  }
}

export function sanitizeDiscoveryForCandidateDraft(
  discovery: KnowledgeDiscoveryResult,
): SanitizedKnowledgeDiscoveryCandidate[] {
  if (!discovery || !Array.isArray(discovery.candidates)) throw new CandidateDraftGuardrailError();
  const candidates = discovery.candidates.slice(0, MAX_DISCOVERY_CANDIDATES).map(sanitizeCandidate);
  if (!candidates.some((candidate) => candidate.support.some((record) => record.source === "completed-diagnosis"))) {
    return [];
  }
  return candidates;
}

export function validateCandidateDraft(
  candidate: CandidateDraftPayload,
  context: CandidateDraftValidationContext,
): CandidateDraftPayload {
  const allowedEvidence = safeAllowlist(context.allowedEvidenceIds);
  const allowedArticles = safeAllowlist(context.allowedKnowledgeArticleIds);
  const supportingDiagnosisIds = new Set(
    context.discovery.flatMap((item) => item.support)
      .filter((item) => item.source === "completed-diagnosis")
      .map((item) => item.diagnosisId!),
  );
  const supportingTicketIds = new Set(context.discovery.flatMap((item) => item.support).map((item) => item.ticketId));
  const evidenceIds = candidate.evidencePolicy.mode === "required" ? candidate.evidencePolicy.evidenceIds : [];
  if (
    evidenceIds.some((id) => !allowedEvidence.has(id)) ||
    candidate.knowledgeArticleIds.some((id) => !allowedArticles.has(id)) ||
    candidate.supportingDiagnosisIds.some((id) => !supportingDiagnosisIds.has(id)) ||
    candidate.supportingTicketIds.some((id) => !supportingTicketIds.has(id))
  ) throw new CandidateDraftGuardrailError();
  return candidate;
}

function sanitizeCandidate(candidate: KnowledgeDiscoveryCandidate): SanitizedKnowledgeDiscoveryCandidate {
  if (!candidate || !safeIdentifier(candidate.id) || !safeScore(candidate.score) || !Number.isInteger(candidate.supportCount) || candidate.supportCount < 0) {
    throw new CandidateDraftGuardrailError();
  }
  if (!Array.isArray(candidate.reasons) || !Array.isArray(candidate.contradictions) || !Array.isArray(candidate.support)) throw new CandidateDraftGuardrailError();
  return {
    id: candidate.id,
    score: candidate.score,
    reasons: safeTextArray(candidate.reasons, 8),
    support: candidate.support.slice(0, MAX_SUPPORT_RECORDS).map((record) => {
      if (!record || (record.source !== "completed-diagnosis" && record.source !== "open-ticket") || !safeIdentifier(record.ticketId) || !safeScore(record.score)) throw new CandidateDraftGuardrailError();
      if (record.source === "completed-diagnosis" && !safeIdentifier(record.diagnosisId)) throw new CandidateDraftGuardrailError();
      return {
        source: record.source,
        ...(record.diagnosisId === undefined ? {} : { diagnosisId: record.diagnosisId }),
        ticketId: record.ticketId,
        score: record.score,
        reasons: safeTextArray(record.reasons, 8),
      };
    }),
    supportCount: candidate.supportCount,
    contradictions: safeTextArray(candidate.contradictions, 8),
    highValue: candidate.highValue === true,
    meetsAlertThreshold: candidate.meetsAlertThreshold === true,
  };
}

function safeAllowlist(values: readonly string[]): Set<string> {
  if (!Array.isArray(values) || values.length > 80 || values.some((value) => !safeIdentifier(value))) throw new CandidateDraftGuardrailError();
  return new Set(values);
}

function safeTextArray(values: readonly string[], maximum: number): string[] {
  if (values.length > maximum || values.some((value) => typeof value !== "string" || value.trim().length === 0 || value.length > 500 || UNSAFE_TEXT.test(value))) throw new CandidateDraftGuardrailError();
  return values.map((value) => value.trim());
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length <= 120 && SAFE_IDENTIFIER.test(value);
}

function safeScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
