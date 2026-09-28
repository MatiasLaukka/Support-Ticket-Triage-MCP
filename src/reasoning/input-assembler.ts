import type {
  CustomerReplyWatermark,
  Ticket,
} from "../domain.js";
import type { RetrievalExecution } from "../retrieval/execution.js";
import type { HybridReasoningInputV2, ReasoningMode } from "./types.js";

export interface HybridReasoningInputAssemblySource {
  mode: ReasoningMode;
  ticket: Pick<Ticket, "id" | "revision">;
  customerReplyWatermark: CustomerReplyWatermark;
  retrievalExecution: RetrievalExecution;
}

/** Assemble provider-neutral reasoning input without interpreting or changing its evidence. */
export function assembleHybridReasoningInput(
  source: HybridReasoningInputAssemblySource,
): HybridReasoningInputV2 {
  const retrieval = source.retrievalExecution.retrieval;
  const ranking = source.retrievalExecution.ranking;

  return {
    mode: source.mode,
    basis: {
      ticketId: source.ticket.id,
      ticketRevision: source.ticket.revision,
      customerReplyWatermark: structuredClone(source.customerReplyWatermark),
      retrievalIndex: structuredClone(retrieval.metadata),
    },
    observations: [],
    retrievalCandidates: structuredClone(retrieval.candidates),
    retrieval: structuredClone({
      lexical: retrieval.lexical,
      semantic: retrieval.semantic,
      referenceDiagnostics: retrieval.referenceDiagnostics,
    }),
    ranking: ranking.status === "succeeded"
      ? { ...ranking, result: structuredClone(ranking.result) }
      : ranking.status === "failed"
        ? { status: "failed", durationMs: ranking.durationMs }
        : { status: "not-requested" },
  };
}
