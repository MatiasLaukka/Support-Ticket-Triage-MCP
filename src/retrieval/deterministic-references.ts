import type { Ticket } from "../domain.js";
import type { CustomerReply } from "../approval-desk/ai-evaluation.js";
import { buildConversationContextForTicket } from "../approval-desk/conversation-context.js";
import { classifyTicketFromContext } from "../approval-desk/classifier.js";
import type { Reference } from "./types.js";

/** Preserve the runtime's deterministic classifier-backed retrieval references. */
export function deterministicRetrievalReferences(input: {
  ticket: Ticket;
  customerReplies: readonly CustomerReply[];
}): readonly Reference[] {
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
