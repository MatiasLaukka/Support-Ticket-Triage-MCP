import type {
  AiExecutionTrace,
  Category,
  ExpectedOutcome,
  KnowledgeArticle,
  Priority,
  RequiredEscalation,
  Team,
} from "../domain.js";
import { TriageRecommendationSchema } from "../domain.js";
import type {
  DiagnosisContext,
  FixContext,
  SubmitRecommendationInput,
} from "../triage-service.js";
import { evaluateTicketWithAi } from "./ai-evaluation.js";
import type { ClassificationReasoningProvider } from "./classification-reasoning-provider.js";
import { classifyTicketFromContext } from "./classifier.js";
import { buildConversationContextForTicket } from "./conversation-context.js";
import {
  diagnosisContextFromAudit,
  diagnosisContextForTicket,
  latestFixContextFromAudits,
} from "./diagnostic-workflow.js";
import type { CustomerResponseDraftProvider } from "./draft-response-provider.js";
import type {
  DiagnosticEvaluationScenario,
} from "./diagnostic-evaluation.js";
import {
  responseQualityContracts,
} from "./response-quality-contracts.js";
import {
  evaluateResponseQuality,
  type ResponseQualityScore,
} from "./response-quality-evaluation.js";
import { buildApprovalDeskRecommendationInput } from "./recommendation-builder.js";
import {
  buildOperatorGuidance,
  latestDiagnosisAudit,
  type OperatorGuidance,
} from "./workflow-guidance.js";
import {
  customerRepliesFromAudits,
  latestSupportResponseFromAudits,
} from "./workflow-read-model.js";

export type AiComparisonLane =
  | "deterministic-deterministic"
  | "gpt-deterministic"
  | "deterministic-gpt"
  | "gpt-gpt";

export interface AiComparisonAgreement {
  category: boolean;
  team: boolean;
  priority: boolean;
  knowledgeArticleIds: boolean;
  escalationReasons: boolean;
  all: boolean;
}

export interface AiComparisonObservation {
  scenarioId: string;
  operatorStage: OperatorGuidance["stage"];
  finalRecommendation: Omit<SubmitRecommendationInput, "submittedAt">;
  draftCustomerResponse: string;
  draftCustomerResponseSource: NonNullable<
    SubmitRecommendationInput["draftCustomerResponseSource"]
  >;
  aiExecutionTrace: AiExecutionTrace;
  baselineClassification: AiComparisonClassification;
  classificationAgreement: AiComparisonAgreement;
  baselineAgreement: AiComparisonAgreement;
  responseQuality: ResponseQualityScore;
  failures: string[];
}

export interface AiComparisonReport {
  lane: AiComparisonLane;
  scenarioCount: number;
  passedScenarioCount: number;
  observations: AiComparisonObservation[];
}

export interface AiComparisonClassification {
  category: Category;
  team: Team;
  priority: Priority;
  knowledgeArticleIds: readonly string[];
  escalationReasons: readonly RequiredEscalation[];
}

export async function runAiComparisonEvaluation(input: {
  scenarios: readonly DiagnosticEvaluationScenario[];
  lane: AiComparisonLane;
  allKnowledgeArticles: readonly KnowledgeArticle[];
  classificationProvider?: ClassificationReasoningProvider;
  draftProvider?: CustomerResponseDraftProvider;
}): Promise<AiComparisonReport> {
  const observations = await Promise.all(input.scenarios.map(async (scenario, index) => {
    const conversation = scenarioConversation(scenario);
    const baseline = deterministicBaseline(scenario, conversation);
    const workflowContext = scenarioWorkflowContext({
      scenario,
      baseline,
      conversation,
      index,
    });
    const recommendation = await evaluateTicketWithAi({
      ticket: scenario.ticket,
      actor: "ai-comparison-evaluation",
      allKnowledgeArticles: input.allKnowledgeArticles,
      customerReplies: conversation.customerReplies,
      previousSupportResponse: conversation.previousSupportResponse,
      diagnosisContext: workflowContext.diagnosisContext,
      fixContext: workflowContext.fixContext,
      ...laneInput(input),
    });
    const aiExecutionTrace = recommendation.aiExecutionTrace;
    if (aiExecutionTrace === undefined) {
      throw new Error("AI evaluation must record an execution trace.");
    }
    const expected = scenario.outcome === undefined
      ? baseline
      : {
          category: scenario.outcome.category,
          team: scenario.outcome.team,
          priority: scenario.outcome.acceptablePriorities[0]!,
          knowledgeArticleIds: scenario.outcome.knowledgeArticleIds,
          escalationReasons: scenario.outcome.requiredEscalations,
        };
    const classificationAgreement = compareClassification(
      recommendation,
      expected,
      scenario.outcome === undefined
        ? undefined
        : scenario.outcome.acceptablePriorities.includes(recommendation.priority),
    );
    const baselineAgreement = compareClassification(recommendation, baseline);
    const contract = responseQualityContracts[scenario.id];
    if (contract === undefined) {
      throw new Error(`No response quality contract exists for ${scenario.id}.`);
    }
    const responseQuality = evaluateResponseQuality({
      draft: recommendation.draftCustomerResponse,
      contract,
      deterministicChecks: recommendation.draftCustomerResponseChecks ?? [],
    });
    const failures = [
      ...agreementFailures("expected", classificationAgreement),
      ...laneInvariantFailures(input.lane, aiExecutionTrace),
      ...responseQuality.failures.map((failure) => `response quality: ${failure}`),
    ];
    const materializedRecommendation = materializeRecommendation(
      recommendation,
      scenario,
      index + 100,
    );
    const operatorStage = buildOperatorGuidance({
      ticket: scenario.ticket,
      recommendations: [materializedRecommendation],
      audits: scenario.audits ?? [],
    }).stage;

    return {
      scenarioId: scenario.id,
      operatorStage,
      finalRecommendation: recommendation,
      draftCustomerResponse: recommendation.draftCustomerResponse,
      draftCustomerResponseSource: recommendation.draftCustomerResponseSource ?? "deterministic",
      aiExecutionTrace,
      baselineClassification: baseline,
      classificationAgreement,
      baselineAgreement,
      responseQuality,
      failures,
    };
  }));

  return {
    lane: input.lane,
    scenarioCount: input.scenarios.length,
    passedScenarioCount: observations.filter(({ failures }) => failures.length === 0).length,
    observations,
  };
}

function laneInvariantFailures(
  lane: AiComparisonLane,
  trace: AiExecutionTrace,
): string[] {
  const injectionSkip = trace.safety?.promptInjectionDetected === true;
  return [
    ...stageInvariantFailures({
      stage: "classification",
      status: trace.classification.status,
      fallbackCategory: trace.classification.fallback?.category,
      gptExpected: !injectionSkip &&
        (lane === "gpt-deterministic" || lane === "gpt-gpt"),
      injectionSkip,
    }),
    ...stageInvariantFailures({
      stage: "drafting",
      status: trace.drafting.status,
      fallbackCategory: trace.drafting.fallback?.category,
      gptExpected: !injectionSkip &&
        (lane === "deterministic-gpt" || lane === "gpt-gpt"),
      injectionSkip,
    }),
  ];
}

function stageInvariantFailures(input: {
  stage: "classification" | "drafting";
  status: "skipped" | "used" | "fallback";
  fallbackCategory?: string;
  gptExpected: boolean;
  injectionSkip: boolean;
}): string[] {
  if (input.gptExpected) {
    return input.status === "used"
      ? []
      : [
          `GPT ${input.stage} expected used, got ${input.status}${
            input.status === "fallback"
              ? `: ${input.fallbackCategory ?? "unknown"}`
              : ""
          }`,
        ];
  }
  if (input.status === "skipped") return [];
  const subject = input.injectionSkip ? "Prompt-injection" : "Deterministic";
  return [`${subject} ${input.stage} stage expected skipped, got ${input.status}`];
}

function laneInput(input: {
  lane: AiComparisonLane;
  classificationProvider?: ClassificationReasoningProvider;
  draftProvider?: CustomerResponseDraftProvider;
}) {
  switch (input.lane) {
    case "deterministic-deterministic":
      return {
        aiPreference: "deterministic" as const,
        classificationPreference: "deterministic" as const,
        draftingPreference: "deterministic" as const,
        responseStyle: "auto" as const,
      };
    case "gpt-deterministic":
      return {
        aiPreference: "gpt-preferred" as const,
        classificationPreference: "gpt-preferred" as const,
        draftingPreference: "deterministic" as const,
        responseStyle: "auto" as const,
        classificationProvider: input.classificationProvider,
      };
    case "deterministic-gpt":
      return {
        aiPreference: "gpt-preferred" as const,
        classificationPreference: "deterministic" as const,
        draftingPreference: "gpt-preferred" as const,
        responseStyle: "auto" as const,
        draftProvider: input.draftProvider,
      };
    case "gpt-gpt":
      return {
        aiPreference: "gpt-preferred" as const,
        classificationPreference: "gpt-preferred" as const,
        draftingPreference: "gpt-preferred" as const,
        responseStyle: "auto" as const,
        classificationProvider: input.classificationProvider,
        draftProvider: input.draftProvider,
      };
  }
}

function deterministicBaseline(
  scenario: DiagnosticEvaluationScenario,
  conversation: ReturnType<typeof scenarioConversation>,
): AiComparisonClassification {
  const conversationContext = buildConversationContextForTicket({
    ticket: scenario.ticket,
    customerReplies: conversation.customerReplies,
    previousSupportResponses: conversation.previousSupportResponse === undefined
      ? []
      : [conversation.previousSupportResponse],
  });
  const classification = classifyTicketFromContext(conversationContext);
  return {
    category: classification.category,
    team: classification.team,
    priority: classification.priority,
    knowledgeArticleIds: classification.knowledgeArticleIds,
    escalationReasons: classification.requiredEscalations,
  };
}

function compareClassification(
  recommendation: Omit<SubmitRecommendationInput, "submittedAt">,
  expected: AiComparisonClassification,
  priorityMatches = recommendation.priority === expected.priority,
): AiComparisonAgreement {
  const category = recommendation.category === expected.category;
  const team = recommendation.team === expected.team;
  const priority = priorityMatches;
  const knowledgeArticleIds = sameMembers(
    recommendation.knowledgeArticleIds,
    expected.knowledgeArticleIds,
  );
  const escalationReasons = sameMembers(
    recommendation.escalationReasons ?? [],
    expected.escalationReasons,
  );
  return {
    category,
    team,
    priority,
    knowledgeArticleIds,
    escalationReasons,
    all: category && team && priority && knowledgeArticleIds && escalationReasons,
  };
}

function scenarioConversation(scenario: DiagnosticEvaluationScenario) {
  const auditReplies = customerRepliesFromAudits(
    scenario.ticket.id,
    scenario.audits ?? [],
  );
  const customerReplies = [...new Map(
    [...(scenario.customerReplies ?? []), ...auditReplies].map((reply) => [
      reply.id,
      reply,
    ]),
  ).values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
  return {
    customerReplies,
    previousSupportResponse: scenario.previousSupportResponse ??
      latestSupportResponseFromAudits(scenario.ticket.id, scenario.audits ?? []),
  };
}

function scenarioWorkflowContext(input: {
  scenario: DiagnosticEvaluationScenario;
  baseline: AiComparisonClassification;
  conversation: ReturnType<typeof scenarioConversation>;
  index: number;
}): { diagnosisContext?: DiagnosisContext; fixContext?: FixContext } {
  const audits = input.scenario.audits ?? [];
  const diagnosisAudit = latestDiagnosisAudit(audits);
  const persistedFix = latestFixContextFromAudits(audits);
  if (diagnosisAudit === undefined && persistedFix === undefined) {
    return {};
  }
  let diagnosisContext: DiagnosisContext | undefined;
  if (diagnosisAudit !== undefined) {
    const preliminary = buildApprovalDeskRecommendationInput({
      ticket: input.scenario.ticket,
      outcome: outcomeFromClassification(input.scenario.ticket.id, input.baseline),
      actor: "ai-comparison-evaluation",
      customerReplies: input.conversation.customerReplies,
      previousSupportResponse: input.conversation.previousSupportResponse,
    });
    const materialized = materializeRecommendation(
      preliminary,
      input.scenario,
      input.index,
    );
    const persistedDiagnosis = diagnosisContextFromAudit(diagnosisAudit);
    const currentDiagnosis = diagnosisContextForTicket(
      input.scenario.ticket,
      materialized,
      audits,
    );
    const stateChanged = persistedDiagnosis?.diagnosticState !== undefined &&
      currentDiagnosis.diagnosticState !== undefined &&
      JSON.stringify(persistedDiagnosis.diagnosticState) !==
        JSON.stringify(currentDiagnosis.diagnosticState);
    diagnosisContext = persistedDiagnosis === undefined
      ? currentDiagnosis
      : {
          ...persistedDiagnosis,
          // Re-run only the shared state transition logic so new replies can
          // advance the persisted snapshot without replacing its evidence or
          // customer-safe wording.
          ...(stateChanged ? { confidence: currentDiagnosis.confidence } : {}),
          ...(currentDiagnosis.diagnosticState === undefined
            ? {}
            : { diagnosticState: currentDiagnosis.diagnosticState }),
        };
  }
  return {
    diagnosisContext,
    ...(persistedFix === undefined ? {} : { fixContext: persistedFix }),
  };
}

function outcomeFromClassification(
  ticketId: string,
  classification: AiComparisonClassification,
): ExpectedOutcome {
  return {
    ticketId,
    category: classification.category,
    acceptablePriorities: [classification.priority],
    team: classification.team,
    requiredEscalations: [...classification.escalationReasons],
    knowledgeArticleIds: [...classification.knowledgeArticleIds],
  };
}

function materializeRecommendation(
  recommendation: Omit<SubmitRecommendationInput, "submittedAt">,
  scenario: DiagnosticEvaluationScenario,
  index: number,
) {
  const {
    actor: _actor,
    gptAssist: _gptAssist,
    ...recommendationInput
  } = recommendation;
  return TriageRecommendationSchema.parse({
    ...recommendationInput,
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    resolution: "pending",
    createdAt: scenario.evaluationAt ?? scenario.ticket.updatedAt,
  });
}

function sameMembers(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length &&
    actual.every((value) => expected.includes(value));
}

function agreementFailures(
  subject: string,
  agreement: AiComparisonAgreement,
): string[] {
  return (Object.entries(agreement) as [keyof AiComparisonAgreement, boolean][])
    .filter(([field, matches]) => field !== "all" && !matches)
    .map(([field]) => `${subject} ${field} disagreement`);
}
