import { createHash } from "node:crypto";
import {
  canonicalOperationalRequestJson,
  type OperationalResultReference,
} from "./domain.js";

const OPERATION_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The transport supplies this stable identity once and reuses it for retries. */
export interface OperationalCommandContext {
  readonly commandId: string;
}

/** A committed semantic result, returned without consulting mutable projections. */
export interface CommandReplay {
  readonly result: OperationalResultReference;
}

/**
 * Hashes validated caller-semantic input. Callers deliberately omit command
 * context, generated event/message IDs, and attempt timestamps from request.
 */
export function canonicalRequestHash(operation: string, request: unknown): string {
  const normalizedOperation = normalizeOperationName(operation);
  const canonical = canonicalOperationalRequestJson({
    operation: normalizedOperation,
    request,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** @internal Shared with the transaction boundary so hash and storage agree. */
export function normalizeOperationName(operation: string): string {
  if (typeof operation !== "string") {
    throw new TypeError("Operational command operation must be a string.");
  }
  const normalized = operation.trim();
  if (
    normalized.length < 1
    || normalized.length > 160
    || !OPERATION_NAME_PATTERN.test(normalized)
  ) {
    throw new TypeError("Operational command operation must be a lowercase kebab-case identifier.");
  }
  return normalized;
}

/** @internal Replay values are detached from storage and deeply immutable. */
export function immutableCommandReplay(
  result: OperationalResultReference,
): CommandReplay {
  return deepFreeze({ result });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
