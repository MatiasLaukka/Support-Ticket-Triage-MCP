import { createHash, randomUUID } from "node:crypto";
import {
  canonicalLearningJson,
  LearningLedgerError,
} from "../knowledge-evolution/learning-ledger.js";
import type { LearningCaptureService } from "../knowledge-evolution/learning-capture.js";
import { OperationalOutboxRowSchema, type OperationalOutboxRow } from "./domain.js";
import {
  normalizeDueOutboxQuery,
  OperationalStoreError,
  type DueOutboxQuery,
  type OperationalUnitOfWork,
} from "./unit-of-work.js";

export type { DueOutboxQuery } from "./unit-of-work.js";

export interface OperationalLearningOutboxStore {
  transaction<T>(work: (unit: OperationalUnitOfWork) => T): T;
  readOutbox(id: string): OperationalOutboxRow | undefined;
  listPendingOutbox(staleBefore?: string): OperationalOutboxRow[];
  listDueOutbox(input: DueOutboxQuery): OperationalOutboxRow[];
}

export interface DeliveryResult {
  readonly status: "delivered" | "duplicate";
}

export interface OutboxDrainResult {
  readonly claimed: number;
  readonly delivered: number;
  readonly duplicate: number;
  readonly retryable: number;
  readonly deadLetter: number;
}

export type OutboxAttemptResult =
  | { readonly id: string; readonly outcome: "delivered" | "duplicate" | "dead-letter" | "not-claimed" }
  | { readonly id: string; readonly outcome: "retryable" };

export interface LearningOutboxWorkerOptions {
  readonly store: OperationalLearningOutboxStore;
  readonly delivery: Pick<LearningCaptureService, "deliverEnvelope">;
  readonly now?: () => Date;
  readonly claimToken?: () => string;
  readonly claimLeaseMs?: number;
}

export class LearningOutboxWorker {
  private readonly now: () => Date;
  private readonly claimToken: () => string;
  private readonly claimLeaseMs: number;

  constructor(private readonly options: LearningOutboxWorkerOptions) {
    this.now = options.now ?? (() => new Date());
    this.claimToken = options.claimToken ?? randomUUID;
    this.claimLeaseMs = options.claimLeaseMs ?? 300_000;
    if (!Number.isFinite(this.claimLeaseMs) || this.claimLeaseMs < 1) {
      throw new TypeError("Learning outbox claim lease must be a positive duration.");
    }
  }

  async deliverOutboxRow(row: OperationalOutboxRow): Promise<DeliveryResult> {
    const parsed = OperationalOutboxRowSchema.safeParse(row);
    if (!parsed.success) {
      throw new LearningLedgerError("Learning outbox row failed validation.", "INVALID_EVENT", {
        cause: parsed.error,
      });
    }
    const envelopeHash = createHash("sha256")
      .update(canonicalLearningJson(parsed.data.envelope))
      .digest("hex");
    const status = await this.options.delivery.deliverEnvelope(parsed.data.envelope, envelopeHash);
    return { status };
  }

  async drainPending(): Promise<OutboxDrainResult> {
    const drainStartedAt = this.now();
    const staleBefore = new Date(drainStartedAt.getTime() - this.claimLeaseMs).toISOString();
    return summarizeOutboxAttempts(await this.drainRows(
      this.options.store.listPendingOutbox(staleBefore),
      staleBefore,
    ));
  }

  async drainDue(input: DueOutboxQuery): Promise<OutboxAttemptResult[]> {
    const query = normalizeDueOutboxQuery(input);
    return this.drainRows(this.options.store.listDueOutbox(query), query.staleBefore);
  }

  private async drainRows(
    candidates: readonly OperationalOutboxRow[],
    staleBefore: string,
  ): Promise<OutboxAttemptResult[]> {
    const results: OutboxAttemptResult[] = [];
    for (const candidate of candidates) {
      results.push(await this.attemptDelivery(candidate, staleBefore));
    }
    return results;
  }

  private async attemptDelivery(
    candidate: OperationalOutboxRow,
    staleBefore: string,
  ): Promise<OutboxAttemptResult> {
    const token = this.claimToken();
    let claimed: boolean;
    try {
      claimed = this.options.store.transaction((unit) =>
        unit.claimPendingOutbox(candidate.id, token, this.now().toISOString(), staleBefore));
    } catch (error) {
      if (isRetryablePersistence(error)) return { id: candidate.id, outcome: "retryable" };
      throw error;
    }
    if (!claimed) return { id: candidate.id, outcome: "not-claimed" };

    let row: OperationalOutboxRow | undefined;
    try {
      row = this.options.store.readOutbox(candidate.id);
    } catch (error) {
      if (isRetryablePersistence(error)) return { id: candidate.id, outcome: "retryable" };
      throw error;
    }
    if (row === undefined) {
      try {
        return this.releaseForRetry(candidate.id, token, "DELIVERY_ERROR");
      } catch (error) {
        if (isRetryablePersistence(error)) return { id: candidate.id, outcome: "retryable" };
        throw error;
      }
    }

    let delivery: DeliveryResult;
    try {
      delivery = await this.deliverOutboxRow(row);
    } catch (error) {
      return this.handleDeliveryFailure(row.id, token, error);
    }

    try {
      this.options.store.transaction((unit) =>
        unit.markOutboxDelivered(row.id, token, this.now().toISOString()));
    } catch (error) {
      if (isLostClaim(error)) return { id: row.id, outcome: "not-claimed" };
      if (!isRetryablePersistence(error)) throw error;
      // Keep the claim recoverable after ledger commit and an acknowledgement failure.
      return { id: row.id, outcome: "retryable" };
    }
    return { id: row.id, outcome: delivery.status };
  }

  private handleDeliveryFailure(
    id: string,
    token: string,
    error: unknown,
  ): OutboxAttemptResult {
    const code = safeDeliveryErrorCode(error);
    try {
      if (
        error instanceof LearningLedgerError
        && (error.code === "INVALID_EVENT" || error.code === "EVENT_CONFLICT")
      ) {
        this.options.store.transaction((unit) => unit.deadLetterOutbox(id, token, code));
        return { id, outcome: "dead-letter" };
      }
      return this.releaseForRetry(id, token, code);
    } catch (transitionError) {
      if (isLostClaim(transitionError)) return { id, outcome: "not-claimed" };
      if (isRetryablePersistence(transitionError)) return { id, outcome: "retryable" };
      throw transitionError;
    }
  }

  private releaseForRetry(
    id: string,
    token: string,
    errorCode: string,
  ): OutboxAttemptResult {
    this.options.store.transaction((unit) => unit.releaseOutboxForRetry(id, token, errorCode));
    return { id, outcome: "retryable" };
  }
}

function summarizeOutboxAttempts(attempts: readonly OutboxAttemptResult[]): OutboxDrainResult {
  const result = { claimed: 0, delivered: 0, duplicate: 0, retryable: 0, deadLetter: 0 };
  for (const attempt of attempts) {
    if (attempt.outcome !== "not-claimed") result.claimed += 1;
    if (attempt.outcome === "delivered") result.delivered += 1;
    if (attempt.outcome === "duplicate") result.duplicate += 1;
    if (attempt.outcome === "retryable") result.retryable += 1;
    if (attempt.outcome === "dead-letter") result.deadLetter += 1;
  }
  return result;
}

function isLostClaim(error: unknown): boolean {
  return error instanceof OperationalStoreError && error.code === "STALE_REVISION";
}

function isRetryablePersistence(error: unknown): boolean {
  if (!(error instanceof OperationalStoreError) || error.code !== "PERSISTENCE_ERROR") return false;
  const cause = error.cause;
  if (cause === undefined) return false;
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return false;
  const code = (cause as { code?: unknown }).code;
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED";
}

function safeDeliveryErrorCode(error: unknown): string {
  return error instanceof LearningLedgerError ? error.code : "DELIVERY_ERROR";
}
