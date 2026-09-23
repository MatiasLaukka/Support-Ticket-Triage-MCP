import type {
  CustomerReplyWatermark,
  Ticket,
} from "../domain.js";
import type { RetrievalExecution } from "../retrieval/execution.js";
import type { HybridReasoningInput, ReasoningMode } from "./types.js";

export interface HybridReasoningInputAssemblySource {
  mode: ReasoningMode;
  ticket: Pick<Ticket, "id" | "revision">;
  customerReplyWatermark: CustomerReplyWatermark;
  retrievalExecution: RetrievalExecution;
}

/** Assemble provider-neutral reasoning input without interpreting or changing its evidence. */
export function assembleHybridReasoningInput(
  source: HybridReasoningInputAssemblySource,
): HybridReasoningInput {
  const retrieval = source.retrievalExecution.retrieval;

  return {
    mode: source.mode,
    basis: {
      ticketId: source.ticket.id,
      ticketRevision: source.ticket.revision,
      customerReplyWatermark: source.customerReplyWatermark,
      retrievalIndex: retrieval.metadata,
    },
    observations: retrieval.candidates.map((candidate) => ({ ...candidate })),
    retrieval: {
      lexical: retrieval.lexical,
      semantic: retrieval.semantic,
      referenceDiagnostics: retrieval.referenceDiagnostics,
    },
    ranking: source.retrievalExecution.ranking,
  };
}
