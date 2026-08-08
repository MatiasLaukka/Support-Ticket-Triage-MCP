import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { createControlledKnowledgeCandidateDraftProvider } from "../src/approval-desk/controlled-evaluation-providers.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { buildApprovalDeskRecommendationInput } from "../src/approval-desk/recommendation-builder.js";
import {
  TriageRecommendationSchema,
  TicketSchema,
  type ExpectedOutcome,
  type SupportState,
  type Ticket,
} from "../src/domain.js";
import type { CompletedDiagnosis } from "../src/knowledge-evolution/domain.js";

export interface KnowledgeEvolutionShowcaseOptions {
  root: string;
  dataRoot: string;
  mode: "controlled";
  verbose?: boolean;
}

export interface KnowledgeEvolutionShowcaseReport {
  mode: "controlled";
  gptStatus: "used" | "not-used";
  candidateId?: string;
  candidateName?: string;
  approval: { actor: string; status: "approved" };
  auditActions: string[];
  futureTicketReuse: {
    ticketId: string;
    prePromotion: ReuseObservation;
    postPromotion: ReuseObservation;
    afterEvidence: ReuseObservation;
    historicalRecommendationUnchanged: boolean;
  };
  learning: {
    maturityBeforeStale: string;
    healthBeforeStale: string;
    healthAfterStale: string;
    verifiedOutcomeCount: number;
    failedReuseRecorded: boolean;
    historicalRecommendationUnchanged: boolean;
  };
  output: string;
}

interface ReuseObservation {
  knownCause: string | null;
  supportState: SupportState;
  missingEvidenceIds: string[];
}

export async function runKnowledgeEvolutionShowcase(
  options: KnowledgeEvolutionShowcaseOptions,
): Promise<KnowledgeEvolutionShowcaseReport> {
  const deps = await createRuntimeDependencies({
    cwd: options.root,
    env: {
      TRIAGE_DATA_ROOT: options.dataRoot,
      TRIAGE_SEED_FILE: resolve(options.root, "data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve(options.root, "data/knowledge"),
      TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER: "controlled",
    },
    knowledgeCandidateDraftProvider: createControlledKnowledgeCandidateDraftProvider(),
    now: () => new Date("2026-08-01T12:00:00.000Z"),
  });

  await deps.knowledgeEvolution.diagnoses.save(diagnosis("diagnosis-001", "TKT-1001"));
  await deps.knowledgeEvolution.diagnoses.save(diagnosis("diagnosis-002", "TKT-1002"));
  await deps.knowledgeEvolution.diagnoses.save(unrelatedDiagnosis("diagnosis-003", "TKT-1004"));
  const discovery = await deps.knowledgeEvolution.service.discover({
    actorId: "support-lead",
    includeGpt: true,
  });
  const candidateId = discovery.gptAdvisory.candidateId;
  if (candidateId === undefined) throw new Error("Showcase did not produce an advisory candidate.");
  const candidate = await deps.knowledgeEvolution.service.getCandidate(candidateId);
  const futureTicket = futureReuseTicket();
  const futureOutcome = futureReuseOutcome(futureTicket.id);
  const recommendationBeforePromotion = buildApprovalDeskRecommendationInput({
    ticket: futureTicket,
    outcome: futureOutcome,
    actor: "knowledge-evolution-showcase",
  });
  const historicalRecommendationId = "d0000000-0000-4000-8000-000000000099";
  const { actor: _actor, ...historicalInput } = recommendationBeforePromotion;
  await deps.recommendations.create(TriageRecommendationSchema.parse({
    ...historicalInput,
    id: historicalRecommendationId,
    resolution: "pending",
    createdAt: "2026-08-01T12:01:00.000Z",
  }));
  const historicalBefore = stableJson(await deps.recommendations.get(historicalRecommendationId));
  const approved = await deps.knowledgeEvolution.service.approve({
    candidateId,
    actorId: "support-lead",
    expectedVersion: candidate.version,
    edits: {
      triggerPatterns: ["Accepted checkout events are missing from profile timelines."],
    },
  });
  const recommendationAfterPromotion = buildApprovalDeskRecommendationInput({
    ticket: futureTicket,
    outcome: futureOutcome,
    actor: "knowledge-evolution-showcase",
    approvedObjects: [approved],
  });
  const recommendationAfterEvidence = buildApprovalDeskRecommendationInput({
    ticket: futureTicket,
    outcome: futureOutcome,
    actor: "knowledge-evolution-showcase",
    approvedObjects: [approved],
    customerReplies: [{
      id: "reply-2099-request-id",
      ticketId: futureTicket.id,
      createdAt: "2026-08-01T12:05:00.000Z",
      body: "Request ID: req-2099 confirms the accepted event processing attempt.",
    }],
  });
  await deps.knowledgeEvolution.service.recordReuse({
    objectId: approved.id,
    sourceVersion: approved.version,
    ticketId: futureTicket.id,
    actorId: "support-lead",
    matchReasons: ["shared evidence-backed diagnosis", "shared owner workflow"],
    evidenceIds: ["request-id"],
    success: true,
  });
  await deps.knowledgeEvolution.service.recordReuse({
    objectId: "known-cause-unrelated-reuse",
    sourceVersion: approved.version,
    ticketId: "TKT-1004",
    actorId: "support-lead",
    matchReasons: ["similar wording only"],
    success: false,
    failureReason: "Operator rejected reuse because the affected scope diverged.",
  });
  await deps.knowledgeEvolution.ledger.append({
    id: "77777777-7777-4777-8777-777777777777",
    occurredAt: "2026-08-01T12:06:00.000Z",
    actor: "support-lead",
    correlationId: "88888888-8888-4888-8888-888888888888",
    ticketId: "TKT-1001",
    diagnosisId: "diagnosis-001",
    candidateId,
    objectId: approved.id,
    sourceVersion: approved.version,
    eventType: "outcome-verified",
    payload: {
      evidenceIds: ["request-id"],
      verificationType: "technically-verified",
      outcomeStatus: "resolved",
      provenance: "Controlled technical verification fixture.",
    },
  });
  const learningBeforeStale = await deps.knowledgeEvolution.service.learningVersionSummary({ candidateId, objectId: approved.id, sourceVersion: approved.version, asOf: "2026-08-01T12:07:00.000Z" });
  await deps.knowledgeEvolution.service.markStale({
    objectId: approved.id,
    sourceVersion: approved.version,
    actorId: "support-lead",
    reasons: ["Showcase stale-signal demonstration."],
  });
  const learningAfterStale = await deps.knowledgeEvolution.service.learningVersionSummary({ candidateId, objectId: approved.id, sourceVersion: approved.version, asOf: "2026-09-01T12:07:00.000Z" });
  const failedReuseEvents = await deps.knowledgeEvolution.ledger.list({ eventType: "knowledge-reuse-failed" });
  const historicalAfter = stableJson(await deps.recommendations.get(historicalRecommendationId));
  const futureTicketReuse = {
    ticketId: futureTicket.id,
    prePromotion: reuseObservation(recommendationBeforePromotion),
    postPromotion: reuseObservation(recommendationAfterPromotion),
    afterEvidence: reuseObservation(recommendationAfterEvidence),
    historicalRecommendationUnchanged: historicalBefore === historicalAfter,
  };
  const auditActions = (await deps.knowledgeEvolution.audits.list({ candidateId }))
    .map((event) => event.action);
  const auditEvents = await deps.knowledgeEvolution.audits.list({ candidateId });
  const discoveryCandidate = discovery.candidates.find(({ id }) => id === "diagnosis-001");
  const completedSupport = discoveryCandidate?.support.filter(({ source }) => source === "completed-diagnosis") ?? [];
  const openTicketSupport = discoveryCandidate?.support.filter(({ source }) => source === "open-ticket") ?? [];
  const output = [
    "# Knowledge Evolution Showcase",
    "",
    "- Deterministic discovery found a reusable pattern from completed diagnoses.",
    `- Advisory candidate drafted: ${candidate.name}.`,
    `- GPT advisory status: ${discovery.gptAdvisory.status}.`,
    "- Human approval required: support-lead explicitly promoted the candidate.",
    `- Approved knowledge object: ${approved.id} v${approved.version}.`,
    `- Audit actions: ${auditActions.join(", ")}.`,
    "",
    "## Future-ticket reuse",
    "",
    `- Before promotion: ${formatReuseObservation(futureTicketReuse.prePromotion)}.`,
    `- After v1 promotion: ${formatReuseObservation(futureTicketReuse.postPromotion)}.`,
    `- After required evidence: ${formatReuseObservation(futureTicketReuse.afterEvidence)}.`,
    `- Historical recommendation: ${futureTicketReuse.historicalRecommendationUnchanged ? "byte-for-byte unchanged" : "CHANGED"}.`,
    "",
    "## Learning ledger",
    "",
    `- Before stale signal: maturity=${learningBeforeStale.maturity}; health=${learningBeforeStale.health}; reuseEligible=${learningBeforeStale.eligibleForReuse}.`,
    `- Verified outcomes recorded: ${learningBeforeStale.supportingEventIds.includes("77777777-7777-4777-8777-777777777777") ? 1 : 0}.`,
    `- Failed reuse retained: ${failedReuseEvents.length > 0}.`,
    `- After stale signal: health=${learningAfterStale.health}; decayedSignalWeight=${learningAfterStale.signalWeight}; reuseEligible=${learningAfterStale.eligibleForReuse}.`,
    `- Historical recommendation: ${futureTicketReuse.historicalRecommendationUnchanged ? "byte-for-byte unchanged" : "CHANGED"}.`,
    ...(options.verbose ? [
      "",
      "## Sanitized evidence",
      "",
      `- Candidate-selected diagnosis: ${candidate.supportingDiagnosisIds.join(", ")}.`,
      `- Candidate-selected ticket: ${candidate.supportingTicketIds.join(", ")}.`,
      `- Evidence IDs: ${candidate.evidencePolicy.mode === "required" ? candidate.evidencePolicy.evidenceIds.join(", ") : "none required"}.`,
      `- Deterministic scores: confidence=${candidate.deterministicScores.confidence}; support=${candidate.deterministicScores.support}.`,
      `- GPT provenance: ${candidate.gptProvenance?.model ?? "not applicable"}.`,
      `- Discovery completed diagnosis support: ${completedSupport.length}.`,
      `- Discovery open-ticket corroboration: ${openTicketSupport.length}.`,
      `- Similarity reasons: ${discoveryCandidate?.reasons.join("; ") ?? "none"}.`,
      `- Contradictions: ${discoveryCandidate?.contradictions.length === 0 ? "none" : discoveryCandidate?.contradictions.join("; ")}.`,
      "",
      "## Audit detail",
      "",
      ...auditEvents.map((event) => `- ${event.action}: actor=${event.actor}; result=${event.result}.`),
    ] : []),
  ].join("\n");
  deps.knowledgeEvolution.ledger.close();
  return {
    mode: "controlled",
    gptStatus: discovery.gptAdvisory.status,
    candidateId,
    candidateName: candidate.name,
    approval: { actor: "support-lead", status: "approved" },
    auditActions,
    futureTicketReuse,
    learning: {
      maturityBeforeStale: learningBeforeStale.maturity,
      healthBeforeStale: learningBeforeStale.health,
      healthAfterStale: learningAfterStale.health,
      verifiedOutcomeCount: learningBeforeStale.supportingEventIds.includes("77777777-7777-4777-8777-777777777777") ? 1 : 0,
      failedReuseRecorded: failedReuseEvents.length > 0,
      historicalRecommendationUnchanged: futureTicketReuse.historicalRecommendationUnchanged,
    },
    output,
  };
}

function reuseObservation(input: {
  knownCause?: string | null;
  supportState?: SupportState;
  missingEvidence?: readonly { id: string }[];
}): ReuseObservation {
  return {
    knownCause: input.knownCause ?? null,
    supportState: input.supportState ?? "diagnosing",
    missingEvidenceIds: (input.missingEvidence ?? []).map(({ id }) => id),
  };
}

function formatReuseObservation(observation: ReuseObservation): string {
  return `knownCause=${observation.knownCause ?? "none"}; state=${observation.supportState}; missing=${observation.missingEvidenceIds.join(",") || "none"}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function futureReuseTicket(): Ticket {
  return TicketSchema.parse({
    id: "TKT-2099",
    createdAt: "2026-08-01T11:00:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
    customer: { name: "Future Store", plan: "enterprise", region: "eu-west", vip: false },
    subject: "Accepted checkout events are missing from profile timelines.",
    description: "Accepted checkout events are missing from profile timelines. Endpoint URL: https://api.future.example/events. API response status: 202 accepted. Sample payload: redacted event data. Failure timestamp: 2026-08-01 10:55 UTC.",
    status: "triage",
    category: "integration",
    priority: "P2",
    team: "integrations",
    tags: ["checkout-events", "profile-timeline"],
    sla: { responseDueAt: "2026-08-01T13:00:00.000Z", breached: false },
    relatedTicketIds: [],
    revision: 0,
  });
}

function futureReuseOutcome(ticketId: string): ExpectedOutcome {
  return {
    ticketId,
    category: "integration",
    acceptablePriorities: ["P2"],
    team: "integrations",
    requiredEscalations: [],
    knowledgeArticleIds: ["api-reference"],
  };
}

function unrelatedDiagnosis(id: string, ticketId: string): CompletedDiagnosis {
  return {
    id,
    ticketId,
    problem: "Invoice export is unavailable for the billing account.",
    symptoms: ["The billing invoice export page returns an error."],
    evidenceReferences: [{ id: "invoice-number", labelAtDiagnosis: "Billing invoice number", source: "ticket", sourceRef: ticketId }],
    ownerTeam: "billing",
    fixSteps: ["Refresh the billing export job."],
    verificationSteps: ["Confirm the invoice export downloads successfully."],
    completedAt: "2026-07-31T12:00:00.000Z",
  };
}

function diagnosis(id: string, ticketId: string): CompletedDiagnosis {
  return {
    id,
    ticketId,
    problem: "Checkout events accepted for processing are missing from profile timelines.",
    symptoms: ["Accepted checkout events are missing from profile timelines."],
    evidenceReferences: [{ id: "request-id", labelAtDiagnosis: "Accepted checkout request ID", source: "ticket", sourceRef: ticketId }],
    ownerTeam: "api-platform",
    fixSteps: ["Apply the governed event-processing mitigation."],
    verificationSteps: ["Confirm a new accepted event reaches the profile timeline."],
    completedAt: "2026-07-31T12:00:00.000Z",
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const dataRoot = await mkdtemp(join(tmpdir(), "knowledge-evolution-showcase-"));
  try {
    const report = await runKnowledgeEvolutionShowcase({ root, dataRoot, mode: "controlled", verbose: process.argv.includes("--verbose") });
    process.stdout.write(`${report.output}\n`);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  void main();
}
