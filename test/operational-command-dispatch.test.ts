import { describe, expect, it, vi } from "vitest";
import { canonicalRequestHashV2 } from "../src/operational/idempotency.js";
import type { CommandIdempotencyRecord, OperationalResultReference } from "../src/operational/domain.js";
import {
  OperationalCommandDispatcher,
  type DispatchableOperationalStore,
  type PreparedCommandDefinition,
} from "../src/operational-command-dispatch.js";
import type { OperationalUnitOfWork } from "../src/operational/unit-of-work.js";

const commandId = "a1000000-0000-4000-8000-000000000001";
const result: OperationalResultReference = {
  operation: "test-command",
  tickets: [{
    ticketId: "TKT-0001",
    operationalEventIds: ["b1000000-0000-4000-8000-000000000001"],
    resultingRevision: null,
  }],
};

function definition(input: {
  prepare: (value: { value: string }) => Promise<{ value: string }>;
  commit?: (unit: OperationalUnitOfWork, prepared: { value: string }, id: string) => OperationalResultReference;
}): PreparedCommandDefinition<{ value: string }, { value: string }, OperationalResultReference> {
  return {
    operation: "test-command",
    parse: (raw) => raw as { value: string },
    prepare: input.prepare,
    commit: input.commit ?? (() => result),
    replay: (_reader, committed) => committed,
  };
}

function store(): {
  store: DispatchableOperationalStore;
  persist: ReturnType<typeof vi.fn>;
  setReceipt(receipt: CommandIdempotencyRecord): void;
} {
  let receipt: CommandIdempotencyRecord | undefined;
  const persist = vi.fn((_commandId: string, _hash: string, committed: OperationalResultReference) => {
    receipt = {
      commandId,
      operation: committed.operation,
      requestHash: canonicalRequestHashV2(committed.operation, { value: "first" }),
      requestHashVersion: 2,
      result: committed,
      createdAt: "2026-09-05T00:00:00.000Z",
    };
  });
  const unit = {
    beginCommandV2: vi.fn(() => "new" as const),
    persistCommandResult: persist,
  } as unknown as OperationalUnitOfWork;
  const dispatchStore: DispatchableOperationalStore = {
    transaction(work) {
      return work(unit);
    },
    readCommandOutcome(id, project) {
      if (receipt === undefined || id !== receipt.commandId) return undefined;
      return project(receipt, { readWorkflowSnapshot: () => { throw new Error("not needed"); } });
    },
  };
  return {
    store: dispatchStore,
    persist,
    setReceipt(value) { receipt = value; },
  };
}

describe("OperationalCommandDispatcher", () => {
  it("joins same-key preparation and rejects changed intent while it is in flight", async () => {
    const harness = store();
    let release!: () => void;
    const reached = new Promise<void>((resolve) => { release = resolve; });
    const entered = vi.fn(() => {
      reached.then(() => undefined);
      return undefined;
    });
    const prepare = vi.fn(async (value: { value: string }) => {
      entered();
      await reached;
      return value;
    });
    const dispatcher = new OperationalCommandDispatcher(harness.store);
    const first = dispatcher.run(definition({ prepare }), { value: "first" }, commandId);
    await Promise.resolve();
    const joined = dispatcher.run(definition({ prepare }), { value: "first" }, commandId);
    await expect(dispatcher.run(definition({ prepare }), { value: "changed" }, commandId))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    release();
    await expect(joined).resolves.toEqual(result);
    await expect(first).resolves.toEqual(result);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("preflights a committed receipt before preparation and reconstructs its immutable result", async () => {
    const harness = store();
    const prepare = vi.fn(async (value: { value: string }) => value);
    const dispatcher = new OperationalCommandDispatcher(harness.store);
    const first = await dispatcher.run(definition({ prepare }), { value: "first" }, commandId);
    expect(first).toEqual(result);
    expect(prepare).toHaveBeenCalledTimes(1);
    const replay = await dispatcher.run(definition({ prepare }), { value: "first" }, commandId);
    expect(replay).toEqual(result);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(harness.persist).toHaveBeenCalledTimes(1);
  });
});
