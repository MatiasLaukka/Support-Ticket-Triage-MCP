import { canonicalRequestHashV2 } from "./operational/idempotency.js";
import type {
  CommandIdempotencyRecord,
  OperationalResultReference,
  OperationalWorkflowSnapshot,
} from "./operational/domain.js";
import {
  OperationalStoreError,
  type OperationalUnitOfWork,
} from "./operational/unit-of-work.js";

export interface OperationalResultReader {
  readWorkflowSnapshot(ticketId: string): OperationalWorkflowSnapshot;
}

export interface PreparedCommandDefinition<I, P, R> {
  operation: string;
  parse(input: unknown): I;
  prepare(intent: I): Promise<P>;
  commit(
    unit: OperationalUnitOfWork,
    prepared: P,
    commandId: string,
  ): OperationalResultReference;
  replay(reader: OperationalResultReader, result: OperationalResultReference): R;
}

export interface DispatchableOperationalStore {
  transaction<T>(work: (unit: OperationalUnitOfWork) => T): T;
  assertRuntimeMutationsAllowed?(): void;
  readCommandOutcome<T>(
    commandId: string,
    project: (receipt: CommandIdempotencyRecord, reader: OperationalResultReader) => T,
  ): T | undefined;
}

interface InFlightCommand<R> {
  readonly requestHash: string;
  readonly promise: Promise<R>;
}

/** Shared command boundary for immutable operational command recovery. */
export class OperationalCommandDispatcher {
  private readonly inFlight = new Map<string, InFlightCommand<unknown>>();

  constructor(private readonly store: DispatchableOperationalStore) {}

  async run<I, P, R>(
    definition: PreparedCommandDefinition<I, P, R>,
    rawIntent: unknown,
    commandId: string,
  ): Promise<R> {
    const intent = definition.parse(rawIntent);
    const requestHash = canonicalRequestHashV2(definition.operation, intent);
    const committed = this.readCommitted(definition, commandId, requestHash);
    if (committed !== undefined) return committed;

    const existing = this.inFlight.get(commandId);
    if (existing !== undefined) {
      if (existing.requestHash !== requestHash) {
        throw new OperationalStoreError(
          "Operational command ID was already claimed for a different operation or request.",
          "IDEMPOTENCY_CONFLICT",
        );
      }
      return existing.promise as Promise<R>;
    }

    const promise = this.execute(definition, intent, commandId, requestHash);
    this.inFlight.set(commandId, { requestHash, promise });
    try {
      return await promise;
    } finally {
      const current = this.inFlight.get(commandId);
      if (current?.promise === promise) this.inFlight.delete(commandId);
    }
  }

  private readCommitted<I, P, R>(
    definition: PreparedCommandDefinition<I, P, R>,
    commandId: string,
    requestHash: string,
  ): R | undefined {
    return this.store.readCommandOutcome(commandId, (receipt, reader) => {
      assertReplayableReceipt(receipt, definition.operation, requestHash);
      return definition.replay(reader, receipt.result);
    });
  }

  private async execute<I, P, R>(
    definition: PreparedCommandDefinition<I, P, R>,
    intent: I,
    commandId: string,
    requestHash: string,
  ): Promise<R> {
    this.store.assertRuntimeMutationsAllowed?.();
    const prepared = await definition.prepare(intent);
    return this.store.transaction((unit) => {
      const replay = unit.beginCommandV2(commandId, definition.operation, intent);
      if (replay !== "new") return definition.replay(unit, replay.result);
      const result = definition.commit(unit, prepared, commandId);
      unit.persistCommandResult(commandId, requestHash, result);
      return definition.replay(unit, result);
    });
  }
}

function assertReplayableReceipt(
  receipt: CommandIdempotencyRecord,
  operation: string,
  requestHash: string,
): void {
  if (receipt.requestHashVersion === 1) {
    throw new OperationalStoreError(
      "This operational command was committed with a legacy request identity and cannot be replayed automatically.",
      "LEGACY_REPLAY_UNAVAILABLE",
    );
  }
  if (receipt.operation !== operation || receipt.requestHash !== requestHash) {
    throw new OperationalStoreError(
      "Operational command ID was already used for a different operation or request.",
      "IDEMPOTENCY_CONFLICT",
    );
  }
}
