import { z } from "zod";
import {
  AiPreferenceSchema,
  DraftCustomerResponseStyleInputSchema,
  TicketIdSchema,
  type AuditEvent,
  type ExpectedOutcome,
  type KnowledgeArticle,
  type Ticket,
} from "./domain.js";
import type {
  ClassificationReasoningProvider,
} from "./approval-desk/classification-reasoning-provider.js";
import {
  evaluateTicketWithOperationalTaxonomy,
  type CustomerReply,
} from "./approval-desk/ai-evaluation.js";
import type { CustomerResponseDraftProvider } from "./approval-desk/draft-response-provider.js";
import type { TicketEvaluationGuard } from "./approval-desk/evaluation-guard.js";
import {
  customerRepliesFromAudits,
  latestSupportResponseFromAudits,
} from "./approval-desk/workflow-read-model.js";
import { selectPersistedDiagnosticWorkflowContext } from "./approval-desk/diagnostic-workflow.js";
import { createClassificationReasoningProviderFromEnv } from "./approval-desk/classification-reasoning-provider.js";
import { createCustomerResponseDraftProviderFromEnv } from "./approval-desk/draft-response-provider.js";
import {
  createTaxonomyReasoningProviderFromEnv,
  type TaxonomyReasoningProvider,
} from "./taxonomy-reasoning-provider.js";
import {
  unavailableReusableKnowledge,
  type ReusableKnowledgeResult,
} from "./knowledge-evolution/reusable-context.js";
import {
  customerReplyWatermarkFromAudits,
  type PreparedOperationalEvaluation,
  type TriageService,
} from "./triage-service.js";
import { OperationalCommandDispatcher } from "./operational-command-dispatch.js";
import { buildRetrievalQuery, type RetrievalObserver } from "./retrieval/stage.js";
import { buildConversationContextForTicket } from "./approval-desk/conversation-context.js";
import { classifyTicketFromContext } from "./approval-desk/classifier.js";
import type { Reference } from "./retrieval/types.js";

const CustomerReplyInputSchema = z.object({
  id: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(),
  body: z.string().trim().min(1).max(4_000),
}).strict();

export const EvaluationCommandInputSchema = z.object({
  ticketId: TicketIdSchema,
  actor: z.string().trim().min(1).default("approval-desk"),
  responseStyle: DraftCustomerResponseStyleInputSchema.default("auto"),
  aiPreference: AiPreferenceSchema.default("auto"),
  taxonomyPreference: AiPreferenceSchema.optional(),
  customerReplies: z.array(CustomerReplyInputSchema).max(8).default([]),
}).strict().transform((parsed) => {
  if (
    parsed.taxonomyPreference === undefined ||
    parsed.taxonomyPreference === parsed.aiPreference
  ) {
    const { taxonomyPreference: _taxonomyPreference, ...identity } = parsed;
    return identity;
  }
  return parsed;
});

export type EvaluationCommandInput = z.infer<typeof EvaluationCommandInputSchema> & {
  readonly taxonomyPreference?: z.infer<typeof AiPreferenceSchema>;
};

export interface EvaluationCommandDependencies {
  readonly dispatcher: OperationalCommandDispatcher;
  readonly service: Pick<TriageService, "commitOperationalEvaluation" | "replayOperationalEvaluation">;
  readonly tickets: { get(ticketId: string): Promise<Ticket> };
  readonly audits: { list(ticketId: string): Promise<readonly AuditEvent[]> };
  readonly knowledge: { list(): Promise<readonly KnowledgeArticle[]> };
  readonly knowledgeEvolution: { listReusableApproved(input: { asOf: string }): Promise<ReusableKnowledgeResult> };
  readonly learningAvailability?: { readonly status: "available" | "unavailable" };
  readonly env?: NodeJS.ProcessEnv;
  readonly now: () => Date;
  readonly evaluationGuard?: Pick<TicketEvaluationGuard, "run">;
  readonly draftProvider?: CustomerResponseDraftProvider;
  readonly classificationReasoningProvider?: ClassificationReasoningProvider;
  readonly taxonomyReasoningProvider?: TaxonomyReasoningProvider;
  readonly loadExpectedOutcome?: (ticketId: string) => Promise<ExpectedOutcome | undefined>;
  readonly retrievalObserver?: RetrievalObserver;
}

export async function evaluateTicketCommand(
  deps: EvaluationCommandDependencies,
  rawInput: unknown,
  commandId: string,
): Promise<ReturnType<TriageService["replayOperationalEvaluation"]>> {
  let capturedBasis: Parameters<typeof buildRetrievalQuery>[0] | undefined;
  let didCommit = false;
  const definition = {
    operation: "evaluate-ticket",
    parse: (input: unknown) => EvaluationCommandInputSchema.parse(input),
    prepare: async (input: EvaluationCommandInput): Promise<PreparedOperationalEvaluation> => {
      const prepare = async (): Promise<PreparedOperationalEvaluation> => {
        const reusableKnowledge = deps.learningAvailability?.status === "unavailable"
          ? unavailableReusableKnowledge()
          : await deps.knowledgeEvolution.listReusableApproved({
              asOf: deps.now().toISOString(),
            });
        const [ticket, audits, allKnowledgeArticles, outcome] = await Promise.all([
          deps.tickets.get(input.ticketId),
          deps.audits.list(input.ticketId),
          deps.knowledge.list(),
          deps.loadExpectedOutcome?.(input.ticketId),
        ]);
        const persistedCustomerReplies = customerRepliesFromAudits(ticket.id, audits);
        const customerReplies: CustomerReply[] = [
          ...persistedCustomerReplies,
          ...input.customerReplies.map((reply) => ({ ...reply, ticketId: ticket.id })),
        ];
        const previousSupportResponse = latestSupportResponseFromAudits(ticket.id, audits);
        const persistedDiagnosticContext = selectPersistedDiagnosticWorkflowContext(audits);
        const taxonomyPreference = input.taxonomyPreference ?? input.aiPreference;
        const evaluation = await evaluateTicketWithOperationalTaxonomy({
          ticket,
          outcome,
          actor: input.actor,
          allKnowledgeArticles,
          reusableKnowledge,
          customerReplies,
          previousSupportResponse,
          diagnosisContext: persistedDiagnosticContext.diagnosis?.context,
          rejectedDiagnosis: persistedDiagnosticContext.rejectedDiagnosis?.context,
          fixContext: persistedDiagnosticContext.fix?.context,
          aiPreference: input.aiPreference,
          taxonomyPreference,
          taxonomyReasoningProvider:
            deps.taxonomyReasoningProvider ??
            createTaxonomyReasoningProviderFromEnv(deps.env ?? process.env, {
              preferOpenAi: taxonomyPreference !== "deterministic",
            }),
          responseStyle: input.responseStyle,
          classificationProvider:
            deps.classificationReasoningProvider ??
            createClassificationReasoningProviderFromEnv(deps.env ?? process.env, {
              preferOpenAi: input.aiPreference === "gpt-preferred" ||
                (deps.env ?? process.env).APPROVAL_DRAFT_PROVIDER === "openai",
            }),
          draftProvider:
            deps.draftProvider ??
            createCustomerResponseDraftProviderFromEnv(deps.env ?? process.env, {
              responseStyle: input.responseStyle,
              preferOpenAi: input.aiPreference === "gpt-preferred",
            }),
        });
        const recommendationInput = evaluation.recommendationInput;
        const {
          classificationConfidence,
          ...serializableRecommendationInput
        } = recommendationInput;
        capturedBasis = {
          ticket,
          customerReplies,
          customerReplyWatermark: JSON.stringify(customerReplyWatermarkFromAudits(audits)),
          references: [],
        };
        return {
          recommendationInput: serializableRecommendationInput,
          diagnosticTaxonomy: evaluation.diagnosticTaxonomy,
          evaluatedCustomerReplyWatermark: customerReplyWatermarkFromAudits(audits),
          ...(classificationConfidence === undefined ? {} : { classificationConfidence }),
        };
      };
      return deps.evaluationGuard === undefined
        ? prepare()
        : deps.evaluationGuard.run(input.ticketId, prepare);
    },
    commit: (unit: Parameters<TriageService["commitOperationalEvaluation"]>[0], prepared: PreparedOperationalEvaluation, id: string) => {
      const result = deps.service.commitOperationalEvaluation(unit, prepared, id);
      didCommit = true;
      return result;
    },
    replay: (reader: Parameters<TriageService["replayOperationalEvaluation"]>[0], result: Parameters<TriageService["replayOperationalEvaluation"]>[1], replayCommandId?: string) =>
      deps.service.replayOperationalEvaluation(reader, result, replayCommandId),
  };
  const result = await deps.dispatcher.run(definition, rawInput, commandId);
  if (didCommit && capturedBasis !== undefined && deps.retrievalObserver !== undefined) {
    try {
      const references = deterministicRetrievalReferences(capturedBasis);
      await deps.retrievalObserver.observe(buildRetrievalQuery({ ...capturedBasis, references }), commandId);
    } catch {
      // Retrieval remains observational and cannot affect authoritative results.
    }
  }
  return result;
}

function deterministicRetrievalReferences(input: Parameters<typeof buildRetrievalQuery>[0]): readonly Reference[] {
  const classification = classifyTicketFromContext(buildConversationContextForTicket({
    ticket: input.ticket,
    customerReplies: input.customerReplies,
  }));
  const references: Reference[] = classification.knowledgeArticleIds.map((sourceId) => ({
    resourceKey: `knowledge-article:${sourceId}`,
    channel: "deterministic-reference",
    sourceId,
    reason: "classifier-association",
  }));
  if (classification.knownCause) {
    references.push({
      resourceKey: `known-cause:${classification.knownCause}`,
      channel: "deterministic-reference",
      sourceId: classification.knownCause,
      reason: "safety-inclusion",
    });
  }
  return references;
}
