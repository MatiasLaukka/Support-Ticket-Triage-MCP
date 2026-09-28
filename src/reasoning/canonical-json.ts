/** Serialize JSON data with recursively sorted object keys. */
export function canonicalJsonStringify(value: unknown): string {
  const seen = new Set<object>();
  const normalized = canonicalizeJsonValue(value, seen);
  const result = JSON.stringify(normalized);
  if (result === undefined) throw new TypeError("Value is not JSON serializable.");
  return result;
}

function canonicalizeJsonValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers are not JSON safe.");
    return value;
  }
  if (value === undefined) return undefined;
  if (typeof value !== "object") throw new TypeError("Value contains a non-JSON type.");
  if (seen.has(value)) throw new TypeError("Value contains a circular reference.");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const normalized = canonicalizeJsonValue(item, seen);
        return normalized === undefined ? null : normalized;
      });
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Only plain objects can be persisted as JSON.");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Symbol properties cannot be persisted as JSON.");
    }
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = canonicalizeJsonValue((value as Record<string, unknown>)[key], seen);
      if (child !== undefined) normalized[key] = child;
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}
