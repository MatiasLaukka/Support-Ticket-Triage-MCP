import type { TicketId } from "../domain.js";
import { DomainError } from "../errors.js";

export class TicketEvaluationGuard {
  private readonly inFlight = new Set<TicketId>();

  async run<T>(ticketId: TicketId, operation: () => Promise<T>): Promise<T> {
    if (this.inFlight.has(ticketId)) {
      throw new DomainError(
        "An evaluation is already in progress for this ticket.",
        "EVALUATION_IN_PROGRESS",
      );
    }

    this.inFlight.add(ticketId);
    try {
      return await operation();
    } finally {
      this.inFlight.delete(ticketId);
    }
  }
}
