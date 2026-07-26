import type {
  AiExecutionTrace,
  Category,
  KnowledgeArticle,
  Priority,
  RequiredEscalation,
  Team,
} from "../domain.js";
import type { SubmitRecommendationInput } from "../triage-service.js";
import { evaluateTicketWithAi } from "./ai-evaluation.js";
import type { ClassificationReasoningProvider } from "./classification-reasoning-provider.js";
import { classifyTicketFromContext } from "./classifier.js";
import { buildConversationContextForTicket } from "./conversation-context.js";
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
  finalRecommendation: Omit<SubmitRecommendationInput, "submittedAt">;
  draftCustomerResponse: string;
  draftCustomerResponseSource: NonNullable<
    SubmitRecommendationInput["draftCustomerResponseSource"]
  >;
  aiExecutionTrace: AiExecutionTrace;
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

type ClassificationComparable = {
  category: Category;
  team: Team;
  priority: Priority;
  knowledgeArticleIds: readonly string[];
  escalationReasons: readonly RequiredEscalation[];
};

export async function runAiComparisonEvaluation(input: {
  scenarios: readonly DiagnosticEvaluationScenario[];
  lane: AiComparisonLane;
  allKnowledgeArticles: readonly KnowledgeArticle[];
  classificationProvider?: ClassificationReasoningProvider;
  draftProvider?: CustomerResponseDraftProvider;
}): Promise<AiComparisonReport> {
  const observations = await Promise.all(input.scenarios.map(async (scenario) => {
    const baseline = deterministicBaseline(scenario);
    const recommendation = await evaluateTicketWithAi({
      ticket: scenario.ticket,
      actor: "ai-comparison-evaluation",
      allKnowledgeArticles: input.allKnowledgeArticles,
      customerReplies: scenario.customerReplies ?? [],
      previousSupportResponse: scenario.previousSupportResponse,
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
      ...responseQuality.failures.map((failure) => `response quality: ${failure}`),
    ];

    return {
      scenarioId: scenario.id,
      finalRecommendation: recommendation,
      draftCustomerResponse: recommendation.draftCustomerResponse,
      draftCustomerResponseSource: recommendation.draftCustomerResponseSource ?? "deterministic",
      aiExecutionTrace,
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

function laneInput(input: {
  lane: AiComparisonLane;
  classificationProvider?: ClassificationReasoningProvider;
  draftProvider?: CustomerResponseDraftProvider;
}) {
  switch (input.lane) {
    case "deterministic-deterministic":
      return { aiPreference: "deterministic" as const, responseStyle: "auto" as const };
    case "gpt-deterministic":
      return {
        aiPreference: "gpt-preferred" as const,
        responseStyle: "auto" as const,
        classificationProvider: input.classificationProvider,
      };
    case "deterministic-gpt":
      return {
        aiPreference: "gpt-preferred" as const,
        responseStyle: "auto" as const,
        draftProvider: input.draftProvider,
      };
    case "gpt-gpt":
      return {
        aiPreference: "gpt-preferred" as const,
        responseStyle: "auto" as const,
        classificationProvider: input.classificationProvider,
        draftProvider: input.draftProvider,
      };
  }
}

function deterministicBaseline(
  scenario: DiagnosticEvaluationScenario,
): ClassificationComparable {
  const conversationContext = buildConversationContextForTicket({
    ticket: scenario.ticket,
    customerReplies: scenario.customerReplies ?? [],
    previousSupportResponses: scenario.previousSupportResponse === undefined
      ? []
      : [scenario.previousSupportResponse],
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
  expected: ClassificationComparable,
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
