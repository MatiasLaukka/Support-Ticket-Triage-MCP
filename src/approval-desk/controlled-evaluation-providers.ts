import type { ClassificationReasoningProvider } from "./classification-reasoning-provider.js";
import {
  buildDeterministicGptAssist,
  ensureDraftSignOff,
  type CustomerResponseDraftProvider,
} from "./draft-response-provider.js";
import type { CandidateDraftProvider } from "../knowledge-evolution/candidate-draft-provider.js";
import type { DiagnosisReasoningProvider } from "./diagnosis-reasoning-provider.js";

export const CONTROLLED_EVALUATION_MODEL = "controlled-local-simulation";

/**
 * An offline adapter used only to exercise the same provider contracts as the
 * live GPT lanes. It never makes a network request and is not a model result.
 */
export function createControlledClassificationProvider(): ClassificationReasoningProvider {
  return {
    async reason(input) {
      const ambiguousCampaignEditor = /\bcampaign editor\b/i.test(
        `${input.ticket.subject}\n${input.ticket.description}`,
      );
      const baseline = input.deterministicClassification;
      return {
        reasoning: {
          issueType: ambiguousCampaignEditor
            ? "campaign-editor-ambiguity"
            : `${baseline.category}-support-request`,
          candidateCategory: baseline.category,
          candidateTeam: baseline.team,
          candidatePriority: baseline.priority,
          knowledgeArticleIds: [...baseline.knowledgeArticleIds],
          confidence: ambiguousCampaignEditor ? 0.55 : 0.9,
          evidence: ambiguousCampaignEditor
            ? ["The campaign editor behavior has multiple plausible local causes."]
            : ["Controlled local simulation mirrors the deterministic classification."],
          missingEvidenceThatWouldChangeClassification: ambiguousCampaignEditor
            ? ["Private-window result.", "Browser console error details."]
            : [],
          explanation: ambiguousCampaignEditor
            ? "Controlled local simulation keeps campaign-editor routing advisory while more evidence is needed."
            : "Controlled local simulation mirrors the governed deterministic classification.",
        },
        telemetry: { model: CONTROLLED_EVALUATION_MODEL, latencyMs: 0 },
      };
    },
  };
}

/**
 * An offline drafting adapter that reuses the guarded deterministic draft but
 * records explicit simulation provenance for GPT-lane comparison runs.
 */
export function createControlledDraftProvider(): CustomerResponseDraftProvider {
  return {
    async draft(input) {
      return {
        source: "deterministic",
        response: ensureDraftSignOff(input.deterministicDraft, input),
        assist: buildDeterministicGptAssist(input, "deterministic", [{
          id: "controlled-local-simulation",
          label: "Controlled local simulation",
          status: "pass",
          message: "Evaluation-only local simulation; no network model call was made.",
        }]),
        telemetry: { model: CONTROLLED_EVALUATION_MODEL, latencyMs: 0 },
      };
    },
  };
}

/** Offline diagnosis adapter for contract tests; it is not a model result. */
export function createControlledDiagnosisProvider(): DiagnosisReasoningProvider {
  return {
    async reason(input) {
      const baseline = input.deterministicDiagnosis;
      const articleIds = input.recommendation.knowledgeArticleIds
        .filter((id) => input.knowledgeArticles.some((article) => article.id === id));
      return {
        reasoning: {
          causeType: baseline.causeType,
          customerSafeSummary: baseline.customerSafeSummary,
          confidence: baseline.confidence,
          owner: baseline.owner,
          recommendedNextAction: baseline.recommendedNextAction,
          evidenceUsed: [...baseline.evidenceUsed],
          missingEvidenceThatWouldChangeDiagnosis: input.recommendation.missingEvidence?.map((item) => item.label) ?? [],
          knowledgeArticleIds: articleIds,
          explanation: "Controlled local simulation mirrors the deterministic diagnostic playbook.",
        },
        telemetry: { model: CONTROLLED_EVALUATION_MODEL, latencyMs: 0 },
      };
    },
  };
}

/** A deterministic offline fixture for the advisory knowledge-draft contract. */
export function createControlledKnowledgeCandidateDraftProvider(): CandidateDraftProvider {
  return {
    enabled: true,
    async draft(input) {
      const candidate = input.discovery.find((item) =>
        item.support.some((record) => record.source === "completed-diagnosis" && record.diagnosisId !== undefined),
      );
      const support = candidate?.support.find(
        (record) => record.source === "completed-diagnosis" && record.diagnosisId !== undefined,
      );
      if (candidate === undefined || support === undefined || support.diagnosisId === undefined) {
        throw new Error("Controlled knowledge draft requires completed diagnosis support.");
      }
      return {
        outputText: JSON.stringify({
          kind: "known-cause",
          name: "Recurring completed diagnosis pattern",
          summary: "Completed diagnoses indicate a recurring support pattern suitable for operator review.",
          triggerPatterns: ["The same completed diagnosis pattern appears in multiple support records."],
          evidencePolicy: input.allowedEvidenceIds.length === 0
            ? { mode: "undecided" }
            : { mode: "required", evidenceIds: [input.allowedEvidenceIds[0]!] },
          knowledgeArticleIds: input.allowedKnowledgeArticleIds.slice(0, 1),
          timeConstraints: ["Apply only when the cited evidence is present."],
          diagnosticSteps: ["Compare the completed diagnosis evidence with the affected support record."],
          fixSteps: ["Apply the documented corrective action after operator approval."],
          verificationSteps: ["Confirm the cited evidence no longer indicates the recurring condition."],
          customerSafeExplanation: "We identified a recurring configuration pattern and are reviewing the appropriate correction.",
          operatorRationale: "Advisory draft derived from deterministic completed-diagnosis support.",
          confidence: candidate.score,
          rationale: "The deterministic discovery result contains completed diagnosis support.",
          supportingDiagnosisIds: [support.diagnosisId],
          supportingTicketIds: [support.ticketId],
          contradictions: candidate.contradictions,
        }),
        provenance: {
          provider: "openai",
          model: CONTROLLED_EVALUATION_MODEL,
          promptVersion: "knowledge-candidate-v1",
          rationale: "Controlled local simulation produced an advisory draft.",
        },
      };
    },
  };
}
