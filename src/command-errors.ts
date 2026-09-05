import { z } from "zod";
import { DomainError } from "./errors.js";
import { OperationalStoreError } from "./operational/unit-of-work.js";

export interface PublicCommandError {
  code: string;
  message: string;
  httpStatus: 400 | 404 | 409 | 500 | 503;
  retryable: boolean;
}

const PUBLIC_MESSAGES = {
  idempotencyConflict: "The command key is already associated with a different request.",
  legacyReplayUnavailable:
    "This key belongs to an earlier command format. Reconcile the current ticket history before deciding on a new action.",
  staleApproval: "The source state changed. Refresh and require a new deliberate action.",
  operationalNotReady:
    "Operational storage is not ready. Initialize or complete the operational import before retrying.",
  repositoryError: "Operational storage is temporarily unavailable. Retry the same command.",
  operationalIntegrityError:
    "Operational storage failed an integrity check. Stop blind retry and inspect the stored state.",
  invalidRequest: "Invalid request.",
} as const;

export function classifyCommandError(error: unknown): PublicCommandError | undefined {
  if (error instanceof z.ZodError) {
    return {
      code: "INVALID_REQUEST",
      message: error.issues[0]?.message ?? PUBLIC_MESSAGES.invalidRequest,
      httpStatus: 400,
      retryable: false,
    };
  }

  if (error instanceof DomainError) return classifyDomainError(error);
  if (error instanceof OperationalStoreError) return classifyOperationalError(error);
  return undefined;
}

function classifyDomainError(error: DomainError): PublicCommandError {
  switch (error.code) {
    case "TICKET_NOT_FOUND":
      return publicError(error.code, error.message, 404, false);
    case "RECOMMENDATION_NOT_FOUND":
      return publicError(error.code, error.message, 404, false);
    case "STALE_APPROVAL":
    case "REVISION_CONFLICT":
      return publicError("STALE_APPROVAL", error.message, 409, false);
    case "KNOWLEDGE_SUPPORT_STALE":
      return publicError("KNOWLEDGE_SUPPORT_STALE", error.message, 409, false);
    case "EVALUATION_IN_PROGRESS":
      return publicError(error.code, error.message, 409, false);
    case "REPOSITORY_ERROR":
      return publicError(error.code, error.message, 503, true);
    default:
      return publicError(error.code, error.message, 400, false);
  }
}

function classifyOperationalError(error: OperationalStoreError): PublicCommandError {
  switch (error.code) {
    case "IDEMPOTENCY_CONFLICT":
      return publicError(
        error.code,
        PUBLIC_MESSAGES.idempotencyConflict,
        409,
        false,
      );
    case "LEGACY_REPLAY_UNAVAILABLE":
      return publicError(
        error.code,
        PUBLIC_MESSAGES.legacyReplayUnavailable,
        409,
        false,
      );
    case "STALE_REVISION":
      return publicError("STALE_APPROVAL", PUBLIC_MESSAGES.staleApproval, 409, false);
    case "NOT_FOUND":
      return publicError(error.code, "The requested operational record was not found.", 404, false);
    case "OPERATIONAL_NOT_READY":
    case "NOT_INITIALIZED":
      return publicError(
        "OPERATIONAL_NOT_READY",
        PUBLIC_MESSAGES.operationalNotReady,
        503,
        false,
      );
    case "STATE_ERROR":
      return publicError(
        "OPERATIONAL_INTEGRITY_ERROR",
        PUBLIC_MESSAGES.operationalIntegrityError,
        500,
        false,
      );
    case "PERSISTENCE_ERROR":
      return isTransientSqliteError(error.cause)
        ? publicError("REPOSITORY_ERROR", PUBLIC_MESSAGES.repositoryError, 503, true)
        : publicError(
          "OPERATIONAL_INTEGRITY_ERROR",
          PUBLIC_MESSAGES.operationalIntegrityError,
          500,
          false,
        );
    case "VALIDATION_ERROR":
      return publicError("INVALID_REQUEST", PUBLIC_MESSAGES.invalidRequest, 400, false);
    case "ASYNC_TRANSACTION":
    case "CLOSED":
    case "SCHEMA_ERROR":
    case "SEQUENCE_ERROR":
      return publicError(
        "OPERATIONAL_INTEGRITY_ERROR",
        PUBLIC_MESSAGES.operationalIntegrityError,
        500,
        false,
      );
    default:
      return assertNeverOperationalError(error.code);
  }
}

function isTransientSqliteError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED";
}

function publicError(
  code: string,
  message: string,
  httpStatus: PublicCommandError["httpStatus"],
  retryable: boolean,
): PublicCommandError {
  return { code, message, httpStatus, retryable };
}

function assertNeverOperationalError(code: never): never {
  throw new Error(`Unhandled operational error code: ${code}`);
}
