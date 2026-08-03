import type { AiFallbackCategory, AiPreference, KnowledgeArticle, TriageRecommendation, Ticket } from "../domain.js";
import type { DiagnosisContext } from "../triage-service.js";
import { classifyAiFailure } from "./draft-response-provider.js";
import { assessPromptInjection, type PromptInjectionAssessment } from "./prompt-injection-safety.js";
import { type ConversationContext } from "./conversation-context.js";
import type {
  DiagnosisReasoningExecution,
  DiagnosisReasoningProvider,
  GptDiagnosisReasoning,
} from "./diagnosis-reasoning-provider.js";
export type { DiagnosisReasoningProvider } from "./diagnosis-reasoning-provider.js";

export interface AdvisoryDiagnosisCandidate {
  causeType: GptDiagnosisReasoning["causeType"];
  customerSafeSummary: string;
  confidence: "likely" | "confirmed";
  owner: GptDiagnosisReasoning["owner"];
  recommendedNextAction: string;
  evidenceUsed: string[];
  missingEvidenceThatWouldChangeDiagnosis: string[];
  knowledgeArticleIds: string[];
  rejectedKnowledgeArticleIds: string[];
  explanation: string;
}

export interface AiDiagnosisResult {
  status: "skipped" | "used" | "fallback";
  diagnosis: DiagnosisContext;
  safety: PromptInjectionAssessment;
  candidate?: AdvisoryDiagnosisCandidate;
  model?: string;
  latencyMs?: number;
  fallback?: {
    category: AiFallbackCategory;
    message: string;
  };
}

export async function diagnoseTicketWithAi(input: {
  ticket: Ticket;
  conversationContext: ConversationContext;
  recommendation: TriageRecommendation;
  deterministicDiagnosis: DiagnosisContext;
  knowledgeArticles: readonly KnowledgeArticle[];
  aiPreference: AiPreference;
  provider?: DiagnosisReasoningProvider;
}): Promise<AiDiagnosisResult> {
  const safety = assessPromptInjection(input.conversationContext.classificationText);
  const intentionallyVague = input.recommendation.knowledgeArticleIds.length === 0 &&
    input.recommendation.category === "other";
  const nonDiagnosticRequest = input.recommendation.category === "feature-request";
  const alreadyClosed = input.ticket.status === "resolved" ||
    input.recommendation.supportState === "ready-for-close";
  if (
    safety.detected ||
    input.aiPreference === "deterministic" ||
    intentionallyVague ||
    nonDiagnosticRequest ||
    alreadyClosed
  ) {
    return { status: "skipped", diagnosis: input.deterministicDiagnosis, safety };
  }
  if (input.provider === undefined) {
    return {
      status: "fallback",
      diagnosis: input.deterministicDiagnosis,
      safety,
      fallback: {
        category: "not-configured",
        message: "OpenAI is not configured; deterministic diagnosis was used.",
      },
    };
  }

  try {
    const execution = await input.provider.reason({
      ticket: input.ticket,
      conversationContext: input.conversationContext,
      recommendation: input.recommendation,
      deterministicDiagnosis: input.deterministicDiagnosis,
      knowledgeArticles: input.knowledgeArticles,
    });
    const candidate = sanitizeCandidate(execution, input);
    if (candidate === undefined) {
      return {
        status: "fallback",
        diagnosis: input.deterministicDiagnosis,
        safety,
        fallback: {
          category: "guardrail-rejected",
          message: "OpenAI diagnosis candidate was incomplete; deterministic diagnosis was used.",
        },
      };
    }
    return {
      status: "used",
      diagnosis: input.deterministicDiagnosis,
      safety,
      candidate,
      model: execution.telemetry.model,
      latencyMs: execution.telemetry.latencyMs,
    };
  } catch (error) {
    const failure = classifyDiagnosisFailure(error);
    return {
      status: "fallback",
      diagnosis: input.deterministicDiagnosis,
      safety,
      fallback: failure,
    };
  }
}

function sanitizeCandidate(
  execution: DiagnosisReasoningExecution,
  input: {
    recommendation: TriageRecommendation;
    deterministicDiagnosis: DiagnosisContext;
    knowledgeArticles: readonly KnowledgeArticle[];
  },
): AdvisoryDiagnosisCandidate | undefined {
  const knownArticles = new Set(input.knowledgeArticles.map((article) => article.id));
  const knowledgeArticleIds = execution.reasoning.knowledgeArticleIds.filter((id) => knownArticles.has(id));
  const rejectedKnowledgeArticleIds = execution.reasoning.knowledgeArticleIds.filter((id) => !knownArticles.has(id));
  const evidenceIncomplete = (input.recommendation.missingEvidence?.length ?? 0) > 0;
  if (
    !isCompleteAdvisoryText(execution.reasoning.customerSafeSummary) ||
    !isCompleteAdvisoryText(execution.reasoning.recommendedNextAction) ||
    !isCompleteAdvisoryText(execution.reasoning.explanation)
  ) {
    return undefined;
  }
  return {
    ...execution.reasoning,
    // GPT may improve the explanation, but the deterministic diagnostic
    // family is authoritative for every ticket, not only canonical matches.
    causeType: input.deterministicDiagnosis.causeType,
    confidence: evidenceIncomplete ? "likely" : execution.reasoning.confidence,
    knowledgeArticleIds,
    rejectedKnowledgeArticleIds,
  };
}

function isCompleteAdvisoryText(value: string): boolean {
  const trimmed = value.trim();
  if (/[\-–—]$/.test(trimmed)) return false;
  const withoutTerminalPunctuation = trimmed.replace(/[.!?…]+$/u, "").trim();
  return !/\b(?:a|an|the|and|or|but|because|with|for|to|of|from|whether|more|this|that|is|are|was|were|be|not|yet|than)$/i.test(withoutTerminalPunctuation);
}

function classifyDiagnosisFailure(error: unknown): {
  category: AiFallbackCategory;
  message: string;
} {
  if (error instanceof Error && error.name === "InvalidDiagnosisSchemaError") {
    return {
      category: "invalid-schema",
      message: `${error.message} Deterministic diagnosis was used.`,
    };
  }
  const failure = classifyAiFailure(error);
  return {
    ...failure,
    message: failure.message.replace("deterministic output", "deterministic diagnosis"),
  };
}
