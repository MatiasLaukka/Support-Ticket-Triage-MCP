interface ParsedIsoInstant {
  wholeSeconds: bigint;
  fractionalSeconds: string;
}

const IsoInstantPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Compares validated ISO 8601 instants without discarding fractional precision
 * or interpreting offset-form timestamps lexically.
 */
export function compareIsoInstants(left: string, right: string): number {
  const leftInstant = parseIsoInstant(left);
  const rightInstant = parseIsoInstant(right);
  if (leftInstant.wholeSeconds !== rightInstant.wholeSeconds) {
    return leftInstant.wholeSeconds > rightInstant.wholeSeconds ? 1 : -1;
  }

  const precision = Math.max(
    leftInstant.fractionalSeconds.length,
    rightInstant.fractionalSeconds.length,
  );
  const leftFraction = leftInstant.fractionalSeconds.padEnd(precision, "0");
  const rightFraction = rightInstant.fractionalSeconds.padEnd(precision, "0");
  return leftFraction === rightFraction ? 0 : leftFraction > rightFraction ? 1 : -1;
}

function parseIsoInstant(timestamp: string): ParsedIsoInstant {
  const match = IsoInstantPattern.exec(timestamp);
  if (match === null) {
    throw new Error("Expected a validated ISO timestamp.");
  }
  const [, year, month, day, hour, minute, second = "0", fractionalSeconds = "", offset] = match;
  const date = new Date(0);
  date.setUTCFullYear(
    Number(year),
    Number(month) - 1,
    Number(day),
  );
  date.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  const offsetSeconds = offset === "Z"
    ? 0
    : (offset.startsWith("+") ? 1 : -1) *
      (Number(offset.slice(1, 3)) * 60 * 60 + Number(offset.slice(4, 6)) * 60);
  return {
    wholeSeconds: BigInt(date.getTime() / 1_000) - BigInt(offsetSeconds),
    fractionalSeconds,
  };
}
