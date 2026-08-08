export type DomainErrorCode =
  | "INVALID_APPROVAL_FIELDS"
  | "INVALID_NOW"
  | "STALE_APPROVAL"
  | "TICKET_NOT_FOUND"
  | "RECOMMENDATION_NOT_FOUND"
  | "REVISION_CONFLICT"
  | "INVALID_CLASSIFICATION_PROVENANCE"
  | "UNSUPPORTED_VERSION_TRANSITION"
  | "REPOSITORY_ERROR";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: DomainErrorCode,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
