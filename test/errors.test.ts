import { describe, test, expect } from "vitest";
import { StartupConfigError as FoundationalError } from "../src/errors.js";
import { StartupConfigError as RuntimeError } from "../src/runtime.js";
import { parseOpenAiTimeoutMs } from "../src/utils/parse-openai-timeout.js";

describe("StartupConfigError Verification", () => {

  test("Constructor identity is identical across both paths", () => {
    expect(RuntimeError).toBe(FoundationalError);
  });

  test("Production parser throws a valid Error recognized by both paths", () => {
    let thrownError: unknown;

    try {
      // 1. Exercise the real production parser with an invalid timeout string
      parseOpenAiTimeoutMs("0");
    } catch (error) {
      thrownError = error;
    }

    // 2. Explicitly check that the thrown value is a standard JavaScript Error
    expect(thrownError).toBeInstanceOf(Error);

    // 3. Verify the specific error instance properties (Strict Name & Message checks)
    const errorInstance = thrownError as Error;
    expect(errorInstance.name).toBe("StartupConfigError");

    // Protects existing user-visible behavior from changing
    expect(errorInstance.message).toBe('TRIAGE_OPENAI_TIMEOUT_MS must be a positive integer. Received: "0"');

    // 4. Check recognition through both import paths
    expect(thrownError instanceof FoundationalError).toBe(true);
    expect(thrownError instanceof RuntimeError).toBe(true);
  });
});
