import {
  canonicalLearningJson,
  LearningEventSchema,
  LearningLedgerError,
  type LearningEvent,
  type LearningEventFilters,
  type LearningLedger,
} from "./learning-ledger.js";

function cloneEvent(event: LearningEvent): LearningEvent {
  return JSON.parse(JSON.stringify(event)) as LearningEvent;
}

export class InMemoryLearningLedger implements LearningLedger {
  private readonly events = new Map<string, LearningEvent>();
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async append(event: LearningEvent): Promise<void> {
    this.ensureInitialized();
    const parsed = LearningEventSchema.safeParse(event);
    if (!parsed.success) {
      throw new LearningLedgerError("Learning event failed schema validation.", "INVALID_EVENT", { cause: parsed.error });
    }
    this.appendParsed(parsed.data);
  }

  async appendBatch(events: readonly LearningEvent[]): Promise<void> {
    this.ensureInitialized();
    const parsed = events.map((event) => LearningEventSchema.safeParse(event));
    const invalid = parsed.find((result) => !result.success);
    if (invalid !== undefined && !invalid.success) {
      throw new LearningLedgerError("Learning event batch failed schema validation.", "INVALID_EVENT", { cause: invalid.error });
    }
    const staged = new Map(this.events);
    for (const result of parsed) {
      if (!result.success) continue;
      const prior = staged.get(result.data.id);
      if (prior !== undefined && canonicalLearningJson(prior) !== canonicalLearningJson(result.data)) {
        throw new LearningLedgerError(`Learning event ID ${result.data.id} conflicts with existing content.`, "EVENT_CONFLICT");
      }
      staged.set(result.data.id, cloneEvent(result.data));
    }
    this.events.clear();
    for (const [id, event] of staged) this.events.set(id, event);
  }

  async list(filters: LearningEventFilters = {}): Promise<LearningEvent[]> {
    this.ensureInitialized();
    const eventTypes = filters.eventTypes === undefined ? undefined : new Set(filters.eventTypes);
    return [...this.events.values()]
      .filter((event) => {
        if (filters.eventType !== undefined && event.eventType !== filters.eventType) return false;
        if (eventTypes !== undefined && !eventTypes.has(event.eventType)) return false;
        if (filters.ticketId !== undefined && event.ticketId !== filters.ticketId) return false;
        if (filters.diagnosisId !== undefined && event.diagnosisId !== filters.diagnosisId) return false;
        if (filters.candidateId !== undefined && event.candidateId !== filters.candidateId) return false;
        if (filters.objectId !== undefined && event.objectId !== filters.objectId) return false;
        if (filters.occurredAfter !== undefined && event.occurredAt < filters.occurredAfter) return false;
        if (filters.occurredBefore !== undefined && event.occurredAt > filters.occurredBefore) return false;
        return true;
      })
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
      .map(cloneEvent);
  }

  async has(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.events.has(id);
  }

  private appendParsed(event: LearningEvent): void {
    const prior = this.events.get(event.id);
    if (prior !== undefined) {
      if (canonicalLearningJson(prior) !== canonicalLearningJson(event)) {
        throw new LearningLedgerError(`Learning event ID ${event.id} conflicts with existing content.`, "EVENT_CONFLICT");
      }
      return;
    }
    this.events.set(event.id, cloneEvent(event));
  }

  private ensureInitialized(): void {
    if (!this.initialized) throw new LearningLedgerError("Learning ledger has not been initialized.", "PERSISTENCE_ERROR");
  }
}
