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
  evaluateTicketWithAi,
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
  unavailableReusableKnowledge,
  type ReusableKnowledgeResult,
} from "./knowledge-evolution/reusable-context.js";
import {
  customerReplyWatermarkFromAudits,
  type PreparedOperationalEvaluation,
  type TriageService,
} from "./triage-service.js";
import { OperationalCommandDispatcher } from "./operational-command-dispatch.js";

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
  customerReplies: z.array(CustomerReplyInputSchema).max(8).default([]),
}).strict();

export type EvaluationCommandInput = z.infer<typeof EvaluationCommandInputSchema>;

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
  readonly loadExpectedOutcome?: (ticketId: string) => Promise<ExpectedOutcome | undefined>;
}

export async function evaluateTicketCommand(
  deps: EvaluationCommandDependencies,
  rawInput: unknown,
  commandId: string,
): Promise<ReturnType<TriageService["replayOperationalEvaluation"]>> {
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
        const recommendationInput = await evaluateTicketWithAi({
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
        const {
          classificationConfidence,
          ...serializableRecommendationInput
        } = recommendationInput;
        return {
          recommendationInput: serializableRecommendationInput,
          evaluatedCustomerReplyWatermark: customerReplyWatermarkFromAudits(audits),
          ...(classificationConfidence === undefined ? {} : { classificationConfidence }),
        };
      };
      return deps.evaluationGuard === undefined
        ? prepare()
        : deps.evaluationGuard.run(input.ticketId, prepare);
    },
    commit: (unit: Parameters<TriageService["commitOperationalEvaluation"]>[0], prepared: PreparedOperationalEvaluation, id: string) =>
      deps.service.commitOperationalEvaluation(unit, prepared, id),
    replay: (reader: Parameters<TriageService["replayOperationalEvaluation"]>[0], result: Parameters<TriageService["replayOperationalEvaluation"]>[1]) =>
      deps.service.replayOperationalEvaluation(reader, result),
  };
  return deps.dispatcher.run(definition, rawInput, commandId);
}
