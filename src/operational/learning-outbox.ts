import { createHash, randomUUID } from "node:crypto";
import {
  canonicalLearningJson,
  LearningLedgerError,
} from "../knowledge-evolution/learning-ledger.js";
import type { LearningCaptureService } from "../knowledge-evolution/learning-capture.js";
import { OperationalOutboxRowSchema, type OperationalOutboxRow } from "./domain.js";
import type { OperationalUnitOfWork } from "./unit-of-work.js";

export interface OperationalLearningOutboxStore {
  transaction<T>(work: (unit: OperationalUnitOfWork) => T): T;
  readOutbox(id: string): OperationalOutboxRow | undefined;
  listPendingOutbox(staleBefore?: string): OperationalOutboxRow[];
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
    const result = { claimed: 0, delivered: 0, duplicate: 0, retryable: 0, deadLetter: 0 };
    const drainStartedAt = this.now();
    const staleBefore = new Date(drainStartedAt.getTime() - this.claimLeaseMs).toISOString();
    for (const candidate of this.options.store.listPendingOutbox(staleBefore)) {
      const token = this.claimToken();
      const claimedAt = drainStartedAt.toISOString();
      const claimed = this.options.store.transaction((unit) =>
        unit.claimPendingOutbox(candidate.id, token, claimedAt, staleBefore));
      if (!claimed) continue;
      result.claimed += 1;
      const row = this.options.store.readOutbox(candidate.id);
      if (row === undefined) {
        this.options.store.transaction((unit) =>
          unit.releaseOutboxForRetry(candidate.id, token, "DELIVERY_ERROR"));
        result.retryable += 1;
        continue;
      }
      try {
        const delivery = await this.deliverOutboxRow(row);
        this.options.store.transaction((unit) =>
          unit.markOutboxDelivered(row.id, token, this.now().toISOString()));
        result[delivery.status] += 1;
      } catch (error) {
        const code = safeDeliveryErrorCode(error);
        if (
          error instanceof LearningLedgerError
          && (error.code === "INVALID_EVENT" || error.code === "EVENT_CONFLICT")
        ) {
          this.options.store.transaction((unit) => unit.deadLetterOutbox(row.id, token, code));
          result.deadLetter += 1;
        } else {
          this.options.store.transaction((unit) => unit.releaseOutboxForRetry(row.id, token, code));
          result.retryable += 1;
        }
      }
    }
    return result;
  }
}

function safeDeliveryErrorCode(error: unknown): string {
  return error instanceof LearningLedgerError ? error.code : "DELIVERY_ERROR";
}
