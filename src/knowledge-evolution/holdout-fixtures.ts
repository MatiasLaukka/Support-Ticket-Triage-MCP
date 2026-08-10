import { TicketSchema, type ExpectedOutcome, type RequiredEscalation, type SupportState, type Ticket } from "../domain.js";
import type { CustomerReply, PreviousSupportResponse } from "../approval-desk/ai-evaluation.js";
import type { EvidenceRequirementId } from "../evidence-catalog.js";
import type { KnowledgeReference } from "./reusable-context.js";

export type HoldoutLifecycle = "healthy" | "none" | "stale" | "contradicted" | "draft-only" | "replacement-draft";
export type HoldoutScorecardCohort = "efficacy" | "governance" | "version";
export type HoldoutEfficacyScenario = "true-positive" | "near-miss" | "unrelated";
export type HoldoutVersionScenario = "replacement" | "pinning";
export type HoldoutEvidencePolicySource =
  | { kind: "approved-known-cause"; objectId: string; version: number }
  | { kind: "knowledge-article"; articleId: string }
  | { kind: "successful-near-miss" };

export type HoldoutTurn = {
  /** Complete conversation snapshot at this turn; evaluators must never append hidden state. */
  customerReplies: readonly CustomerReply[];
  previousSupportResponse?: PreviousSupportResponse;
  expected?: {
    supportState?: SupportState;
    knownCauseRef?: KnowledgeReference;
    knownEventId?: string | null;
    requiredEvidenceSatisfied?: boolean;
    requiredEscalations?: readonly RequiredEscalation[];
  };
};

export type KnowledgeHoldoutFixture = {
  id: string;
  /** The isolated lane factory must seed this exact lifecycle before scoring. */
  lifecycle: HoldoutLifecycle;
  /** Scoring metadata only. It never enters production evaluation. */
  scorecard: {
    cohort: HoldoutScorecardCohort;
    efficacyScenario?: HoldoutEfficacyScenario;
    versionScenario?: HoldoutVersionScenario;
    forbiddenKnowledgeRef?: KnowledgeReference;
  };
  initialTicket: Ticket;
  /** Scorer oracle only. It must never be passed to the production evaluator. */
  expectedOutcome: ExpectedOutcome;
  turns: readonly HoldoutTurn[];
  /** Scoring-only evidence policy. The production evaluator never receives this metadata. */
  evidencePolicy: Readonly<{
    requiredIds: readonly EvidenceRequirementId[];
    reasonCode: "approved-known-cause-required" | "ordinary-knowledge-article" | "successful-near-miss-no-failure" | "billing-knowledge-article";
    policySource: Readonly<HoldoutEvidencePolicySource>;
    rationale: string;
  }>;
  /** Compatibility alias derived from evidencePolicy.requiredIds. */
  expectedEvidenceIds: readonly EvidenceRequirementId[];
  expectedTarget: {
    supportState: SupportState;
    knownCauseRef?: KnowledgeReference;
    knownEventId?: string | null;
    requiredEvidenceSatisfied?: boolean;
  };
};

const baseOutcome = (ticketId: string, subject: string): ExpectedOutcome => ({
  ticketId,
  category: subject.toLowerCase().includes("billing") ? "billing" : "api",
  acceptablePriorities: ["P2"],
  team: subject.toLowerCase().includes("billing") ? "billing" : "api-platform",
  requiredEscalations: [],
  knowledgeArticleIds: subject.toLowerCase().includes("billing")
    ? ["billing-and-invoices"]
    : subject.toLowerCase().includes("successful") ? [] : ["api-reference"],
});

function ticket(id: string, subject: string, description = subject): Ticket {
  return TicketSchema.parse({
    id,
    revision: 0,
    subject,
    description,
    category: "api",
    priority: "P2",
    team: "api-platform",
    tags: ["credential-rotation"],
    status: "triage",
    createdAt: "2026-08-08T09:00:00.000Z",
    updatedAt: "2026-08-08T09:00:00.000Z",
    customer: { name: "Holdout customer", plan: "Growth", region: "FI", vip: false },
    sla: { responseDueAt: "2026-08-09T09:00:00.000Z", breached: false },
  });
}

const cause = { objectId: "credential-rotation", version: 1 } as const;
const replacement = { objectId: "credential-rotation", version: 2 } as const;
const emptyTurn = (expected?: HoldoutTurn["expected"]): HoldoutTurn => freeze({ customerReplies: freeze([]), ...(expected === undefined ? {} : { expected }) });
const suppliedTurn = (ticketId: string, expected?: HoldoutTurn["expected"]): HoldoutTurn => freeze({
  customerReplies: freeze([freeze({
    id: `${ticketId}-reply-1`, ticketId, createdAt: "2026-08-08T10:00:00.000Z",
    body: "Request ID: req_holdout_001 confirms the failed API request after credential rotation.",
  })]),
  ...(expected === undefined ? {} : { expected }),
});

/** Fixed scorer fixtures. Lifecycle setup belongs to the isolated lane, never a turn. */
export function knowledgeHoldoutFixtures(): readonly KnowledgeHoldoutFixture[] {
  return freeze([
    fixture("sufficient-evidence-true-positive", "healthy", { cohort: "efficacy", efficacyScenario: "true-positive" }, "Credential rotation request fails with request ID", [suppliedTurn("TKT-5101", { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true })], policy(["request-id"], "approved-known-cause-required", { kind: "approved-known-cause", ...cause }, "The approved known cause requires a request identifier."), { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true }),
    fixture("missing-evidence-then-supplied", "healthy", { cohort: "efficacy", efficacyScenario: "true-positive" }, "Credential rotation request fails", [emptyTurn({ supportState: "needs-information", knownCauseRef: cause, requiredEvidenceSatisfied: false }), suppliedTurn("TKT-5102", { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true })], policy(["request-id"], "approved-known-cause-required", { kind: "approved-known-cause", ...cause }, "The approved known cause requires a request identifier."), { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true }),
    fixture("near-miss", "healthy", { cohort: "efficacy", efficacyScenario: "near-miss" }, "Credential rotation question for a successful request", [emptyTurn({ supportState: "diagnosing", requiredEvidenceSatisfied: true })], policy([], "successful-near-miss-no-failure", { kind: "successful-near-miss" }, "Successful near miss has no failure evidence requirement."), { supportState: "diagnosing", requiredEvidenceSatisfied: true }),
    fixture("unrelated", "none", { cohort: "efficacy", efficacyScenario: "unrelated" }, "Where can I download my billing invoice?", [emptyTurn({ supportState: "needs-information" })], policy(["invoice-number", "billing-account", "plan-or-promotion", "failure-timestamp", "error-banner"], "billing-knowledge-article", { kind: "knowledge-article", articleId: "billing-and-invoices" }, "Billing article requires its catalogued invoice fields."), { supportState: "needs-information" }),
    fixture("stale-version", "stale", { cohort: "governance", forbiddenKnowledgeRef: cause }, "Credential rotation request fails", [suppliedTurn("TKT-5105", { supportState: "information-received", requiredEvidenceSatisfied: false })], policy(["endpoint-url", "request-id", "api-response-status", "sample-payload", "failure-timestamp"], "ordinary-knowledge-article", { kind: "knowledge-article", articleId: "api-reference" }, "Ordinary API fallback applies when unhealthy knowledge is excluded."), { supportState: "information-received", requiredEvidenceSatisfied: false }),
    fixture("contradicted-version", "contradicted", { cohort: "governance", forbiddenKnowledgeRef: cause }, "Credential rotation request fails", [suppliedTurn("TKT-5106", { supportState: "information-received", requiredEvidenceSatisfied: false })], policy(["endpoint-url", "request-id", "api-response-status", "sample-payload", "failure-timestamp"], "ordinary-knowledge-article", { kind: "knowledge-article", articleId: "api-reference" }, "Ordinary API fallback applies when unhealthy knowledge is excluded."), { supportState: "information-received", requiredEvidenceSatisfied: false }),
    fixture("draft-version-isolation", "draft-only", { cohort: "version", versionScenario: "pinning" }, "Credential rotation request fails", [suppliedTurn("TKT-5107", { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true })], policy(["request-id"], "approved-known-cause-required", { kind: "approved-known-cause", ...cause }, "The approved known cause requires a request identifier."), { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true }),
    fixture("replacement-and-draft-isolation", "replacement-draft", { cohort: "version", versionScenario: "replacement" }, "Credential rotation request fails", [suppliedTurn("TKT-5107", { supportState: "known-cause", knownCauseRef: replacement, requiredEvidenceSatisfied: true })], policy(["request-id"], "approved-known-cause-required", { kind: "approved-known-cause", ...replacement }, "The approved known cause requires a request identifier."), { supportState: "known-cause", knownCauseRef: replacement, requiredEvidenceSatisfied: true }),
  ]);
}

function policy(requiredIds: readonly EvidenceRequirementId[], reasonCode: KnowledgeHoldoutFixture["evidencePolicy"]["reasonCode"], policySource: HoldoutEvidencePolicySource, rationale: string): KnowledgeHoldoutFixture["evidencePolicy"] {
  return freeze({ requiredIds: freeze([...requiredIds]), reasonCode, policySource, rationale });
}

function fixture(id: string, lifecycle: HoldoutLifecycle, scorecard: KnowledgeHoldoutFixture["scorecard"], subject: string, turns: readonly HoldoutTurn[], evidencePolicy: KnowledgeHoldoutFixture["evidencePolicy"], expectedTarget: KnowledgeHoldoutFixture["expectedTarget"]): KnowledgeHoldoutFixture {
  const ordinal = String(5101 + ["sufficient-evidence-true-positive", "missing-evidence-then-supplied", "near-miss", "unrelated", "stale-version", "contradicted-version", "draft-version-isolation", "replacement-and-draft-isolation"].indexOf(id)).padStart(4, "0");
  const initialTicket = ticket(`TKT-${ordinal}`, subject);
  const normalizedTurns = turns.map((turn) => freeze({
    ...turn,
    customerReplies: turn.customerReplies.length === 0 ? turn.customerReplies : turn.customerReplies.map((reply) => freeze({ ...reply, ticketId: initialTicket.id })),
    expected: turn.expected === undefined ? undefined : freeze({ ...turn.expected, requiredEscalations: freeze([...(turn.expected.requiredEscalations ?? [])]) }),
  }));
  return freeze({ id, lifecycle, scorecard: freeze({ ...scorecard }), initialTicket, expectedOutcome: baseOutcome(initialTicket.id, subject), turns: freeze(normalizedTurns), evidencePolicy, expectedEvidenceIds: evidencePolicy.requiredIds, expectedTarget });
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
