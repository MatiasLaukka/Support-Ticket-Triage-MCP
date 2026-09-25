export interface ApplicabilitySafeCaseContext {
  problemStatement: string;
  observedFacts: readonly { id: string; statement: string }[];
  conversationState: readonly { id: string; statement: string }[];
  caseId?: string;
}

const leakagePatterns: readonly RegExp[] = [
  /\bTKT-\d+\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:customer|requester|account)\s*(?:id|identifier|name)?\s*[:=]/i,
  /\b(?:system prompt|developer message|raw provider payload|api[-_ ]?key|access[-_ ]?token|password)\b/i,
  /\bsk-[A-Za-z0-9_-]+\b/,
  /(?:[A-Za-z]:[\\/]|(?:^|\s)(?:~?[\\/]|[\\/]{2})[A-Za-z0-9._-]+[\\/])/,
  /\bwh_[A-Za-z0-9]+\b/,
  /\bP-\d+\b/,
];

/** Shared B5 trust-boundary check for offline cases and runtime safe projections. */
export function assertSafeApplicabilityCaseProjection(
  safeCase: ApplicabilitySafeCaseContext,
): void {
  const serialized = JSON.stringify(safeCase);
  if (leakagePatterns.some((pattern) => pattern.test(serialized))) {
    const caseLabel = safeCase.caseId === undefined ? "runtime case" : safeCase.caseId;
    throw new Error(`Applicability safe projection contains a forbidden identifier or payload in ${caseLabel}.`);
  }
  const factIds = [...safeCase.observedFacts, ...safeCase.conversationState].map(({ id }) => id);
  if (new Set(factIds).size !== factIds.length) {
    const caseLabel = safeCase.caseId === undefined ? "runtime case" : safeCase.caseId;
    throw new Error(`Applicability safe projection has duplicate fact IDs in ${caseLabel}.`);
  }
}
