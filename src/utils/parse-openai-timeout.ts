import { StartupConfigError } from "../runtime.js";

/**
 * Parses an OpenAI-compatible timeout value from environment configuration.
 * 
 * - Returns the default (20_000 ms) when value is undefined or blank
 * - Throws on invalid values: non-integers, zero, negative numbers
 * - Does not silently coerce or clamp invalid values
 */
export function parseOpenAiTimeoutMs(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 20_000;
  }
  const parsed = Number(value);
  // Reject non-finite numbers, zero, negative values, and floating point values
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new StartupConfigError(
      `TRIAGE_OPENAI_TIMEOUT_MS must be a positive integer. Received: "${value}"`,
    );
  }
  return parsed;
}

/**
 * Parses a knowledge candidate timeout value from environment configuration.
 * Falls back to default (20_000 ms) for invalid values instead of throwing.
 */
export function parseKnowledgeCandidateTimeoutMs(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 20_000;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    // Historical fallback behavior: invalid values fall back to default instead of throwing
    return 20_000;
  }
  return parsed;
}

/**
 * Parses an approval draft timeout value from environment configuration.
 * Falls back to default (20_000 ms) for invalid values instead of throwing.
 */
export function parseApprovalDraftTimeoutMs(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 20_000;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    // Historical fallback behavior: invalid values fall back to default instead of throwing
    return 20_000;
  }
  return parsed;
}
