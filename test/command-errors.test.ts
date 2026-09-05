import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DomainError } from "../src/errors.js";
import { OperationalStoreError } from "../src/operational/unit-of-work.js";
import { classifyCommandError } from "../src/command-errors.js";

function invalidInput(): z.ZodError {
  return new z.ZodError([{
    code: "custom",
    path: [],
    message: "invalid input",
    input: undefined,
  }]);
}

describe("classifyCommandError", () => {
  it.each([
    [invalidInput(), { code: "INVALID_REQUEST", httpStatus: 400, retryable: false }],
    [new DomainError("stale", "STALE_APPROVAL"), { code: "STALE_APPROVAL", httpStatus: 409, retryable: false }],
    [new DomainError("busy", "EVALUATION_IN_PROGRESS"), { code: "EVALUATION_IN_PROGRESS", httpStatus: 409, retryable: false }],
    [new DomainError("missing", "TICKET_NOT_FOUND"), { code: "TICKET_NOT_FOUND", httpStatus: 404, retryable: false }],
    [new DomainError("missing recommendation", "RECOMMENDATION_NOT_FOUND"), { code: "RECOMMENDATION_NOT_FOUND", httpStatus: 404, retryable: false }],
    [new DomainError("support changed", "KNOWLEDGE_SUPPORT_STALE"), { code: "KNOWLEDGE_SUPPORT_STALE", httpStatus: 409, retryable: false }],
    [new DomainError("learning unavailable", "REPOSITORY_ERROR"), { code: "REPOSITORY_ERROR", httpStatus: 503, retryable: true }],
    [new OperationalStoreError("SQL and internal path must not reach the client", "IDEMPOTENCY_CONFLICT"), { code: "IDEMPOTENCY_CONFLICT", httpStatus: 409, retryable: false }],
    [new OperationalStoreError("legacy history", "LEGACY_REPLAY_UNAVAILABLE"), { code: "LEGACY_REPLAY_UNAVAILABLE", httpStatus: 409, retryable: false }],
    [new OperationalStoreError("stale revision", "STALE_REVISION"), { code: "STALE_APPROVAL", httpStatus: 409, retryable: false }],
    [new OperationalStoreError("missing", "NOT_FOUND"), { code: "NOT_FOUND", httpStatus: 404, retryable: false }],
    [new OperationalStoreError("database is not ready", "OPERATIONAL_NOT_READY"), { code: "OPERATIONAL_NOT_READY", httpStatus: 503, retryable: false }],
    [new OperationalStoreError("invalid operational state", "STATE_ERROR"), { code: "OPERATIONAL_INTEGRITY_ERROR", httpStatus: 500, retryable: false }],
    [new OperationalStoreError("database is locked", "PERSISTENCE_ERROR", {
      cause: Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" }),
    }), { code: "REPOSITORY_ERROR", httpStatus: 503, retryable: true }],
    [new OperationalStoreError("invalid stored state", "SCHEMA_ERROR"), { code: "OPERATIONAL_INTEGRITY_ERROR", httpStatus: 500, retryable: false }],
    [new OperationalStoreError("invalid caller value", "VALIDATION_ERROR"), { code: "INVALID_REQUEST", httpStatus: 400, retryable: false }],
  ] as const)("returns the stable public classification for %s", (error, expected) => {
    expect(classifyCommandError(error)).toMatchObject(expected);
  });

  it("sanitizes operational conflict messages", () => {
    const result = classifyCommandError(new OperationalStoreError(
      "SQL / internal path / stack details",
      "IDEMPOTENCY_CONFLICT",
    ));
    expect(result).toMatchObject({ code: "IDEMPOTENCY_CONFLICT", httpStatus: 409 });
    expect(result?.message).not.toContain("SQL");
    expect(result?.message).not.toContain("internal path");
    expect(result?.message).not.toContain("stack");
  });

  it("leaves unknown programming failures to the transport unexpected-error handler", () => {
    expect(classifyCommandError(new Error("programmer failure"))).toBeUndefined();
    expect(classifyCommandError(undefined)).toBeUndefined();
  });
});
