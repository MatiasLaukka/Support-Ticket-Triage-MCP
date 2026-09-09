import {
  type DueOutboxQuery,
  type OutboxAttemptResult,
} from "./learning-outbox.js";

export type { DueOutboxQuery, OutboxAttemptResult } from "./learning-outbox.js";

const IDLE_POLL_MS = 1_000;
const MAX_ROWS_PER_PASS = 25;
const DEFAULT_CLAIM_LEASE_MS = 300_000;

export interface DeliveryScheduler {
  now(): Date;
  schedule(delayMs: number, callback: () => void): { cancel(): void };
}

export interface LearningDeliveryRunner {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface LearningDeliveryRunnerOptions {
  readonly worker: {
    drainDue(input: DueOutboxQuery): Promise<OutboxAttemptResult[]>;
  };
  readonly scheduler?: DeliveryScheduler;
  readonly reportError?: (error: unknown) => void;
  readonly claimLeaseMs?: number;
}

export class LearningDeliveryRunner implements LearningDeliveryRunner {
  private readonly scheduler: DeliveryScheduler;
  private readonly reportError: (error: unknown) => void;
  private readonly claimLeaseMs: number;
  private readonly failureCounts = new Map<string, number>();
  private readonly deferredUntil = new Map<string, string>();
  private started = false;
  private stopped = false;
  private timer: { cancel(): void } | undefined;
  private runningPass: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;

  constructor(private readonly options: LearningDeliveryRunnerOptions) {
    this.scheduler = options.scheduler ?? createDefaultDeliveryScheduler();
    this.reportError = options.reportError ?? reportLearningDeliveryError;
    this.claimLeaseMs = options.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
    if (!Number.isFinite(this.claimLeaseMs) || this.claimLeaseMs < 1) {
      throw new TypeError("Learning delivery claim lease must be a positive duration.");
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      await this.runningPass;
      return;
    }
    this.started = true;
    if (this.stopped) return;
    await this.launchPass();
  }

  stop(): Promise<void> {
    if (this.stopPromise !== undefined) return this.stopPromise;
    this.stopped = true;
    this.cancelTimer();
    const runningPass = this.runningPass;
    this.stopPromise = (async () => {
      await runningPass;
    })();
    return this.stopPromise;
  }

  private launchPass(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.runningPass !== undefined) return this.runningPass;
    const pass = Promise.resolve().then(() => this.executePass());
    this.runningPass = pass;
    return pass;
  }

  private async executePass(): Promise<void> {
    try {
      const query = this.buildQuery();
      const results = await this.options.worker.drainDue(query);
      this.applyResults(results);
    } catch (error) {
      this.reportPassError(error);
    } finally {
      this.runningPass = undefined;
      if (!this.stopped) this.scheduleNext();
    }
  }

  private buildQuery(): DueOutboxQuery {
    const now = this.scheduler.now();
    const nowTimestamp = toIsoTimestamp(now);
    const staleBefore = new Date(now.getTime() - this.claimLeaseMs);
    this.pruneExpired(now.getTime());
    return {
      now: nowTimestamp,
      staleBefore: toIsoTimestamp(staleBefore),
      limit: MAX_ROWS_PER_PASS,
      deferredUntil: Object.fromEntries(this.deferredUntil),
    };
  }

  private applyResults(results: readonly OutboxAttemptResult[]): void {
    const now = this.scheduler.now();
    const nowMs = now.getTime();
    for (const result of results) {
      if (result.outcome === "retryable") {
        const failures = (this.failureCounts.get(result.id) ?? 0) + 1;
        this.failureCounts.set(result.id, failures);
        this.deferredUntil.set(
          result.id,
          new Date(nowMs + retryDelayMs(failures)).toISOString(),
        );
        continue;
      }
      this.failureCounts.delete(result.id);
      this.deferredUntil.delete(result.id);
    }
  }

  private pruneExpired(nowMs: number): void {
    for (const [id, deadline] of this.deferredUntil) {
      if (Date.parse(deadline) <= nowMs) {
        this.deferredUntil.delete(id);
      }
    }
  }

  private scheduleNext(): void {
    if (this.stopped || this.timer !== undefined) return;
    const nowMs = this.scheduler.now().getTime();
    this.pruneExpired(nowMs);
    const futureDeadlines = [...this.deferredUntil.values()]
      .map((deadline) => Date.parse(deadline) - nowMs)
      .filter((delay) => delay > 0);
    const nearest = futureDeadlines.length === 0
      ? IDLE_POLL_MS
      : Math.min(IDLE_POLL_MS, Math.min(...futureDeadlines));
    const delay = Math.max(1, nearest);
    this.timer = this.scheduler.schedule(delay, () => {
      this.timer = undefined;
      void this.launchPass().catch((error: unknown) => {
        this.reportPassError(error);
      });
    });
  }

  private reportPassError(error: unknown): void {
    try {
      this.reportError(error);
    } catch {
      try {
        console.error("Learning delivery runner pass failed.");
      } catch {
        // Diagnostics must not turn a bounded background pass into an unhandled rejection.
      }
    }
  }

  private cancelTimer(): void {
    this.timer?.cancel();
    this.timer = undefined;
  }
}

export function retryDelayMs(consecutiveFailures: number): number {
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 1) {
    throw new TypeError("Failure count must be a positive integer.");
  }
  return Math.min(30_000, 1_000 * 2 ** Math.min(consecutiveFailures - 1, 5));
}

export function createDefaultDeliveryScheduler(): DeliveryScheduler {
  return {
    now: () => new Date(),
    schedule(delayMs, callback) {
      const handle = setTimeout(callback, delayMs);
      handle.unref?.();
      return { cancel: () => clearTimeout(handle) };
    },
  };
}

function toIsoTimestamp(date: Date): string {
  return date.toISOString();
}

function reportLearningDeliveryError(_error: unknown): void {
  console.error("Learning delivery runner pass failed.");
}
