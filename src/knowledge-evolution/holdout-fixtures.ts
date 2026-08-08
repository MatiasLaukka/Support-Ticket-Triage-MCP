import { TicketSchema, type ExpectedOutcome, type RequiredEscalation, type SupportState, type Ticket } from "../domain.js";
import type { CustomerReply, PreviousSupportResponse } from "../approval-desk/ai-evaluation.js";
import type { KnowledgeReference } from "./reusable-context.js";

export type HoldoutLifecycle = "healthy" | "none" | "stale" | "contradicted" | "replacement-draft";

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
  initialTicket: Ticket;
  /** Scorer oracle only. It must never be passed to the production evaluator. */
  expectedOutcome: ExpectedOutcome;
  turns: readonly HoldoutTurn[];
  expectedEvidenceIds: readonly string[];
  expectedTarget: {
    supportState: SupportState;
    knownCauseRef?: KnowledgeReference;
    knownEventId?: string | null;
    requiredEvidenceSatisfied?: boolean;
  };
};

const baseOutcome = (ticketId: string): ExpectedOutcome => ({
  ticketId,
  category: "api",
  acceptablePriorities: ["P2"],
  team: "api-platform",
  requiredEscalations: [],
  knowledgeArticleIds: [],
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
    fixture("sufficient-evidence-true-positive", "healthy", "Credential rotation request fails with request ID", [suppliedTurn("TKT-5101", { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true })], ["request-id"], { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true }),
    fixture("missing-evidence-then-supplied", "healthy", "Credential rotation request fails", [emptyTurn({ supportState: "needs-information", knownCauseRef: cause, requiredEvidenceSatisfied: false }), suppliedTurn("TKT-5102", { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true })], ["request-id"], { supportState: "known-cause", knownCauseRef: cause, requiredEvidenceSatisfied: true }),
    fixture("near-miss", "healthy", "Credential rotation question for a successful request", [emptyTurn({ supportState: "needs-information", requiredEvidenceSatisfied: false })], ["request-id"], { supportState: "needs-information", requiredEvidenceSatisfied: false }),
    fixture("unrelated", "none", "Where can I download my billing invoice?", [emptyTurn({ supportState: "diagnosing" })], [], { supportState: "diagnosing" }),
    fixture("stale-version", "stale", "Credential rotation request fails", [suppliedTurn("TKT-5105", { supportState: "needs-information", requiredEvidenceSatisfied: true })], ["request-id"], { supportState: "needs-information", requiredEvidenceSatisfied: true }),
    fixture("contradicted-version", "contradicted", "Credential rotation request fails", [suppliedTurn("TKT-5106", { supportState: "needs-information", requiredEvidenceSatisfied: true })], ["request-id"], { supportState: "needs-information", requiredEvidenceSatisfied: true }),
    fixture("replacement-and-draft-isolation", "replacement-draft", "Credential rotation request fails", [suppliedTurn("TKT-5107", { supportState: "known-cause", knownCauseRef: replacement, requiredEvidenceSatisfied: true })], ["request-id"], { supportState: "known-cause", knownCauseRef: replacement, requiredEvidenceSatisfied: true }),
  ]);
}

function fixture(id: string, lifecycle: HoldoutLifecycle, subject: string, turns: readonly HoldoutTurn[], expectedEvidenceIds: readonly string[], expectedTarget: KnowledgeHoldoutFixture["expectedTarget"]): KnowledgeHoldoutFixture {
  const ordinal = String(5101 + ["sufficient-evidence-true-positive", "missing-evidence-then-supplied", "near-miss", "unrelated", "stale-version", "contradicted-version", "replacement-and-draft-isolation"].indexOf(id)).padStart(4, "0");
  const initialTicket = ticket(`TKT-${ordinal}`, subject);
  const normalizedTurns = turns.map((turn) => freeze({
    ...turn,
    customerReplies: turn.customerReplies.length === 0 ? turn.customerReplies : turn.customerReplies.map((reply) => freeze({ ...reply, ticketId: initialTicket.id })),
    expected: turn.expected === undefined ? undefined : freeze({ ...turn.expected, requiredEscalations: freeze([...(turn.expected.requiredEscalations ?? [])]) }),
  }));
  return freeze({ id, lifecycle, initialTicket, expectedOutcome: baseOutcome(initialTicket.id), turns: freeze(normalizedTurns), expectedEvidenceIds: freeze([...expectedEvidenceIds]), expectedTarget });
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
