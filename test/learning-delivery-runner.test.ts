import { describe, expect, it } from "vitest";
import {
  LearningDeliveryRunner,
  retryDelayMs,
  type DeliveryScheduler,
  type DueOutboxQuery,
} from "../src/operational/learning-delivery-runner.js";

const START = Date.parse("2026-09-09T00:00:00.000Z");

describe("learning delivery runner", () => {
  it.each([
    [1, 1_000],
    [2, 2_000],
    [3, 4_000],
    [4, 8_000],
    [5, 16_000],
    [6, 30_000],
    [7, 30_000],
  ])("uses the bounded retry delay for %i consecutive failures", (failures, expected) => {
    expect(retryDelayMs(failures)).toBe(expected);
  });

  it("rejects invalid retry counts", () => {
    expect(() => retryDelayMs(0)).toThrow(TypeError);
    expect(() => retryDelayMs(1.5)).toThrow(TypeError);
  });

  it("starts one bounded pass, is idempotent, and polls while idle", async () => {
    const scheduler = new FakeScheduler();
    const queries: DueOutboxQuery[] = [];
    const runner = new LearningDeliveryRunner({
      scheduler,
      worker: {
        async drainDue(query) {
          queries.push(query);
          return [];
        },
      },
    });

    await runner.start();
    await runner.start();
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({ limit: 25, deferredUntil: {} });
    expect(scheduler.pendingDelays()).toEqual([1_000]);

    await scheduler.advanceBy(1_999);
    expect(queries).toHaveLength(2);
    await scheduler.advanceBy(1);
    expect(queries).toHaveLength(3);
    await runner.stop();
  });

  it("attempts a retrying row at the exact bounded backoff intervals", async () => {
    const scheduler = new FakeScheduler();
    const rowId = "outbox-1";
    const attempts: number[] = [];
    const runner = new LearningDeliveryRunner({
      scheduler,
      worker: {
        async drainDue(query) {
          const deferred = query.deferredUntil[rowId];
          if (deferred !== undefined && Date.parse(deferred) > Date.parse(query.now)) return [];
          attempts.push(scheduler.time);
          return [{ id: rowId, outcome: "retryable" }];
        },
      },
    });

    await runner.start();
    const expectedAttempts = [0, 1_000, 3_000, 7_000, 15_000, 31_000, 61_000, 91_000];
    expect(attempts).toEqual([START]);
    for (const elapsed of expectedAttempts.slice(1)) {
      await scheduler.advanceTo(START + elapsed);
      expect(attempts.at(-1)).toBe(START + elapsed);
    }
    expect(attempts).toEqual(expectedAttempts.map((elapsed) => START + elapsed));
    await runner.stop();
  });

  it("does not let a backed-off row starve a later due row", async () => {
    const scheduler = new FakeScheduler();
    const firstRow = "outbox-1";
    const secondRow = "outbox-2";
    const attempted: string[] = [];
    let firstFailures = 0;
    const runner = new LearningDeliveryRunner({
      scheduler,
      worker: {
        async drainDue(query) {
          const rows = Object.keys(query.deferredUntil).includes(firstRow)
            ? [secondRow]
            : [firstRow, secondRow];
          const results = rows.map((id) => {
            attempted.push(id);
            return id === firstRow && firstFailures < 2
              ? { id, outcome: "retryable" as const }
              : { id, outcome: "delivered" as const };
          });
          if (rows.includes(firstRow)) firstFailures += 1;
          return results;
        },
      },
    });

    await runner.start();
    expect(attempted).toEqual([firstRow, secondRow]);
    await scheduler.advanceBy(2_000);
    expect(attempted).toEqual([firstRow, secondRow, firstRow, secondRow, secondRow]);
    await runner.stop();
  });

  it("does not overlap a slow pass and stop waits for it", async () => {
    const scheduler = new FakeScheduler();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const runner = new LearningDeliveryRunner({
      scheduler,
      worker: {
        async drainDue() {
          calls += 1;
          await barrier;
          return [];
        },
      },
    });

    const starting = runner.start();
    await flushMicrotasks();
    expect(calls).toBe(1);
    await scheduler.advanceBy(5_000);
    expect(calls).toBe(1);
    const stopping = runner.stop();
    let stopped = false;
    void stopping.then(() => { stopped = true; });
    await flushMicrotasks();
    expect(stopped).toBe(false);
    release();
    await starting;
    await stopping;
    expect(stopped).toBe(true);
    expect(scheduler.pendingDelays()).toEqual([]);
  });

  it("reports a thrown pass and retries without an unhandled rejection", async () => {
    const scheduler = new FakeScheduler();
    const reported: unknown[] = [];
    let calls = 0;
    const runner = new LearningDeliveryRunner({
      scheduler,
      reportError: (error) => reported.push(error),
      worker: {
        async drainDue() {
          calls += 1;
          if (calls === 1) throw new Error("transient pass failure");
          return [];
        },
      },
    });

    await expect(runner.start()).resolves.toBeUndefined();
    expect(reported).toHaveLength(1);
    await scheduler.advanceBy(1_000);
    expect(calls).toBe(2);
    await runner.stop();
  });

  it("cancels the pending schedule on repeated stop", async () => {
    const scheduler = new FakeScheduler();
    const runner = new LearningDeliveryRunner({
      scheduler,
      worker: { async drainDue() { return []; } },
    });

    await runner.start();
    const firstStop = runner.stop();
    const secondStop = runner.stop();
    await Promise.all([firstStop, secondStop]);
    await scheduler.advanceBy(10_000);
    expect(scheduler.pendingDelays()).toEqual([]);
  });
});

class FakeScheduler implements DeliveryScheduler {
  time = START;
  private nextId = 1;
  private readonly jobs = new Map<number, { due: number; callback: () => void }>();

  now(): Date {
    return new Date(this.time);
  }

  schedule(delayMs: number, callback: () => void): { cancel(): void } {
    const id = this.nextId++;
    this.jobs.set(id, { due: this.time + delayMs, callback });
    return { cancel: () => this.jobs.delete(id) };
  }

  pendingDelays(): number[] {
    return [...this.jobs.values()]
      .map(({ due }) => due - this.time)
      .sort((left, right) => left - right);
  }

  async advanceBy(milliseconds: number): Promise<void> {
    await this.advanceTo(this.time + milliseconds);
  }

  async advanceTo(target: number): Promise<void> {
    if (target < this.time) throw new Error("Fake scheduler cannot move backwards.");
    while (true) {
      const due = [...this.jobs.entries()]
        .filter(([, job]) => job.due <= target)
        .sort(([, left], [, right]) => left.due - right.due);
      if (due.length === 0) {
        this.time = target;
        return;
      }
      for (const [id, job] of due) {
        this.jobs.delete(id);
        this.time = job.due;
        job.callback();
        await flushMicrotasks();
      }
    }
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
