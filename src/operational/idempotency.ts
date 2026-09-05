import { createHash } from "node:crypto";
import type { CommandIdempotencyRecord, OperationalResultReference } from "./domain.js";

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
  const semanticRequest = projectSemanticRequest(request, new Set<object>(), true);
  const canonical = `{"operation":${JSON.stringify(normalizedOperation)},"request":${canonicalSemanticJson(semanticRequest)}}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Hashes the complete validated semantic request under the version-2 receipt contract. */
export function canonicalRequestHashV2(operation: string, request: unknown): string {
  const normalizedOperation = normalizeOperationName(operation);
  const semanticRequest = projectSemanticRequest(request, new Set<object>(), false);
  const preimage = `{"version":2,"operation":${JSON.stringify(normalizedOperation)},"request":${canonicalSemanticJson(semanticRequest)}}`;
  return createHash("sha256").update(preimage, "utf8").digest("hex");
}

function projectSemanticRequest(
  value: unknown,
  ancestors: Set<object>,
  filterReservedKeys: boolean,
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
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== value.length + 1
      || ownKeys.some((key) => (
        typeof key !== "string"
        || (key !== "length" && !isDenseArrayIndex(key, value.length))
      ))
    ) {
      throw new TypeError("Canonical semantic request arrays may contain only dense indices and length.");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined
      || !("value" in lengthDescriptor)
      || lengthDescriptor.value !== value.length
      || !lengthDescriptor.writable
      || lengthDescriptor.enumerable
      || lengthDescriptor.configurable
    ) {
      throw new TypeError("Canonical semantic request array length must be a non-enumerable data property.");
    }
    ancestors.add(value);
    const projected = Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined
        || !("value" in descriptor)
        || !descriptor.writable
        || !descriptor.enumerable
        || !descriptor.configurable
      ) {
        throw new TypeError("Canonical semantic request array indices must be enumerable data properties.");
      }
      return projectSemanticRequest(descriptor.value, ancestors, filterReservedKeys);
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
  const projected = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new TypeError("Canonical semantic request objects must not contain symbol keys.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError("Canonical semantic request objects require enumerable data properties.");
    }
    if ((filterReservedKeys && NON_SEMANTIC_REQUEST_KEYS.has(key)) || descriptor.value === undefined) continue;
    Object.defineProperty(projected, key, {
      value: projectSemanticRequest(descriptor.value, ancestors, filterReservedKeys),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  ancestors.delete(value);
  return projected;
}

function isDenseArrayIndex(key: string, length: number): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function canonicalSemanticJson(
  value: null | boolean | number | string | readonly unknown[] | Readonly<Record<string, unknown>>,
): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSemanticJson(item as ReturnType<typeof projectSemanticRequest>)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const entries = Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalSemanticJson(record[key] as ReturnType<typeof projectSemanticRequest>)}`
  ));
  return `{${entries.join(",")}}`;
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

/** @internal Receipt data is detached from storage and deeply immutable. */
export function immutableCommandReceipt(
  record: CommandIdempotencyRecord,
): CommandIdempotencyRecord {
  return deepFreeze(record);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
