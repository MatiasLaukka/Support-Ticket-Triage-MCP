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
import { deterministicRetrievalReferences } from "./retrieval/deterministic-references.js";
import type { OperationalResultReference, OperationalWorkflowSnapshot } from "./operational/domain.js";
import {
  assembleHybridShadowCaptureContext,
  HybridShadowCaptureError,
  hybridShadowModeForEvent,
  type HybridShadowCaptureSink,
} from "./reasoning/hybrid-shadow-capture.js";

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
  readonly hybridShadowCaptureSink?: HybridShadowCaptureSink;
}

export async function evaluateTicketCommand(
  deps: EvaluationCommandDependencies,
  rawInput: unknown,
  commandId: string,
): Promise<ReturnType<TriageService["replayOperationalEvaluation"]>> {
  let capturedBasis: Parameters<typeof buildRetrievalQuery>[0] | undefined;
  let didCommit = false;
  let committedEvaluationCapture: {
    result: OperationalResultReference;
    snapshot: OperationalWorkflowSnapshot;
  } | undefined;
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
        capturedBasis = structuredClone({
          ticket,
          customerReplies,
          customerReplyWatermark: JSON.stringify(customerReplyWatermarkFromAudits(audits)),
          references: [],
        });
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
      if (deps.hybridShadowCaptureSink !== undefined) {
        try {
          const snapshot = unit.readWorkflowSnapshot(prepared.recommendationInput.ticketId);
          committedEvaluationCapture = structuredClone({ result, snapshot });
        } catch {
          // Optional capture material must never cause the authoritative write to fail.
          committedEvaluationCapture = undefined;
        }
      }
      didCommit = true;
      return result;
    },
    replay: (reader: Parameters<TriageService["replayOperationalEvaluation"]>[0], result: Parameters<TriageService["replayOperationalEvaluation"]>[1], replayCommandId?: string) =>
      deps.service.replayOperationalEvaluation(reader, result, replayCommandId),
  };
  const result = await deps.dispatcher.run(definition, rawInput, commandId);
  if (didCommit && capturedBasis !== undefined && deps.retrievalObserver !== undefined) {
    // The receipt-backed operational result is already complete. Shadow work must not
    // delay it, including when an embedding provider or SQLite reconciliation stalls.
    void Promise.resolve()
      .then(() => {
        const references = deterministicRetrievalReferences({
          ticket: capturedBasis!.ticket,
          customerReplies: capturedBasis!.customerReplies,
        });
        return buildRetrievalQuery({ ...capturedBasis!, references });
      })
      .then((query) => {
        if (deps.hybridShadowCaptureSink === undefined) {
          return deps.retrievalObserver!.observe(query, commandId);
        }
        if (committedEvaluationCapture === undefined) {
          reportHybridShadowCaptureFailure(deps, commandId, new Error("Committed capture snapshot was unavailable."));
          return deps.retrievalObserver!.observe(query, commandId);
        }
        const event = committedEvaluationTrigger(committedEvaluationCapture, commandId);
        const mode = event === undefined ? undefined : hybridShadowModeForEvent(event);
        if (event === undefined || mode === undefined) {
          reportHybridShadowCaptureFailure(deps, commandId, new HybridShadowCaptureError(
            "Committed evaluation result does not identify one recommendation-submitted trigger event.",
          ));
          return deps.retrievalObserver!.observe(query, commandId);
        }
        return deps.retrievalObserver!.observe(query, commandId, async (actualQuery, retrievalExecution) => {
          let context: ReturnType<typeof assembleHybridShadowCaptureContext>;
          try {
            context = assembleHybridShadowCaptureContext({
              mode,
              event,
              snapshot: committedEvaluationCapture!.snapshot,
              query: actualQuery,
              retrievalExecution,
            });
          } catch (error) {
            reportHybridShadowCaptureFailure(deps, commandId, error);
            return;
          }
          try {
            await deps.hybridShadowCaptureSink!.capture(context);
          } catch (error) {
            reportHybridShadowCaptureFailure(deps, commandId, error, "HYBRID_SHADOW_CAPTURE_FAILED");
          }
        });
      })
      .catch(() => deps.retrievalObserver?.reportFailure?.(commandId));
  }
  return result;
}

function committedEvaluationTrigger(
  capture: {
    result: OperationalResultReference;
    snapshot: OperationalWorkflowSnapshot;
  },
  commandId: string,
): OperationalWorkflowSnapshot["events"][number] | undefined {
  if (capture.result.operation !== "evaluate-ticket" || capture.result.tickets.length !== 1) return undefined;
  const [ticketResult] = capture.result.tickets;
  if (ticketResult === undefined) return undefined;
  const eventIds = new Set(ticketResult.operationalEventIds);
  const events = capture.snapshot.events.filter((event) =>
    eventIds.has(event.id)
    && event.ticketId === ticketResult.ticketId
    && event.commandId === commandId
    && event.action === "recommendation-submitted",
  );
  return events.length === 1 ? events[0] : undefined;
}

function reportHybridShadowCaptureFailure(
  deps: EvaluationCommandDependencies,
  commandId: string,
  error: unknown,
  failureCode?: "HYBRID_SHADOW_CAPTURE_INCONSISTENT" | "HYBRID_SHADOW_CAPTURE_FAILED",
): void {
  const code = failureCode ?? (error instanceof HybridShadowCaptureError
    ? error.code
    : "HYBRID_SHADOW_CAPTURE_FAILED");
  try {
    if (deps.hybridShadowCaptureSink?.reportFailure !== undefined) {
      deps.hybridShadowCaptureSink.reportFailure({ code, commandId });
    } else {
      deps.retrievalObserver?.reportFailure?.(commandId, code);
    }
  } catch {
    // Capture diagnostics are advisory and cannot affect the committed command.
  }
}
