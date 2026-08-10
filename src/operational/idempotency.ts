import { createHash } from "node:crypto";
import {
  canonicalOperationalRequestJson,
  type OperationalResultReference,
} from "./domain.js";

const OPERATION_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NON_SEMANTIC_REQUEST_KEYS = new Set([
  "attempt",
  "attemptTimestamp",
  "attemptedAt",
  "commandId",
  "createdAt",
  "eventId",
  "generatedAt",
  "idempotencyKey",
  "messageId",
  "occurredAt",
  "operationalEventId",
  "retry",
  "retryAttempt",
  "serverGeneratedId",
  "serverTimestamp",
  "traceId",
  "transportRequestId",
  "updatedAt",
]);

/** The transport supplies this stable identity once and reuses it for retries. */
export interface OperationalCommandContext {
  readonly commandId: string;
}

/** A committed semantic result, returned without consulting mutable projections. */
export interface CommandReplay {
  readonly result: OperationalResultReference;
}

/**
 * Hashes validated caller-semantic input after removing the reserved command,
 * retry, transport, generated-ID, and server-timestamp metadata keys above.
 */
export function canonicalRequestHash(operation: string, request: unknown): string {
  const normalizedOperation = normalizeOperationName(operation);
  const semanticRequest = projectSemanticRequest(request, new Set<object>());
  const canonical = canonicalOperationalRequestJson({
    operation: normalizedOperation,
    request: semanticRequest,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function projectSemanticRequest(
  value: unknown,
  ancestors: Set<object>,
): null | boolean | number | string | readonly unknown[] | Readonly<Record<string, unknown>> {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical semantic requests require finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError("Canonical semantic request arrays must use the standard Array prototype.");
    }
    if (ancestors.has(value)) throw new TypeError("Canonical semantic requests cannot contain cycles.");
    ancestors.add(value);
    const projected = value.map((item, index) => {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError("Canonical semantic request arrays must not be sparse.");
      }
      return projectSemanticRequest(item, ancestors);
    });
    ancestors.delete(value);
    return projected;
  }
  if (typeof value !== "object") {
    throw new TypeError("Canonical semantic requests must be JSON-compatible.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical semantic request objects must be plain objects.");
  }
  if (ancestors.has(value)) throw new TypeError("Canonical semantic requests cannot contain cycles.");
  ancestors.add(value);
  const projected: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new TypeError("Canonical semantic request objects must not contain symbol keys.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError("Canonical semantic request objects require enumerable data properties.");
    }
    if (NON_SEMANTIC_REQUEST_KEYS.has(key) || descriptor.value === undefined) continue;
    projected[key] = projectSemanticRequest(descriptor.value, ancestors);
  }
  ancestors.delete(value);
  return projected;
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
