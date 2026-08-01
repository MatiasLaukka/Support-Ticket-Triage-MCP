import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { createControlledKnowledgeCandidateDraftProvider } from "../src/approval-desk/controlled-evaluation-providers.js";
import { createRuntimeDependencies } from "../src/runtime.js";
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
  output: string;
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
  const discovery = await deps.knowledgeEvolution.service.discover({
    actorId: "support-lead",
    includeGpt: true,
  });
  const candidateId = discovery.gptAdvisory.candidateId;
  if (candidateId === undefined) throw new Error("Showcase did not produce an advisory candidate.");
  const candidate = await deps.knowledgeEvolution.service.getCandidate(candidateId);
  const approved = await deps.knowledgeEvolution.service.approve({
    candidateId,
    actorId: "support-lead",
    expectedVersion: candidate.version,
  });
  const auditActions = (await deps.knowledgeEvolution.audits.list({ candidateId }))
    .map((event) => event.action);
  const auditEvents = await deps.knowledgeEvolution.audits.list({ candidateId });
  const output = [
    "# Knowledge Evolution Showcase",
    "",
    "- Deterministic discovery found a reusable pattern from completed diagnoses.",
    `- Advisory candidate drafted: ${candidate.name}.`,
    `- GPT advisory status: ${discovery.gptAdvisory.status}.`,
    "- Human approval required: support-lead explicitly promoted the candidate.",
    `- Approved knowledge object: ${approved.id} v${approved.version}.`,
    `- Audit actions: ${auditActions.join(", ")}.`,
    ...(options.verbose ? [
      "",
      "## Sanitized evidence",
      "",
      `- Supporting diagnoses: ${candidate.supportingDiagnosisIds.join(", ")}.`,
      `- Supporting tickets: ${candidate.supportingTicketIds.join(", ")}.`,
      `- Evidence IDs: ${candidate.evidencePolicy.mode === "required" ? candidate.evidencePolicy.evidenceIds.join(", ") : "none required"}.`,
      `- Deterministic scores: confidence=${candidate.deterministicScores.confidence}; support=${candidate.deterministicScores.support}.`,
      `- GPT provenance: ${candidate.gptProvenance?.model ?? "not applicable"}.`,
      "",
      "## Audit detail",
      "",
      ...auditEvents.map((event) => `- ${event.action}: actor=${event.actor}; result=${event.result}.`),
    ] : []),
  ].join("\n");
  return {
    mode: "controlled",
    gptStatus: discovery.gptAdvisory.status,
    candidateId,
    candidateName: candidate.name,
    approval: { actor: "support-lead", status: "approved" },
    auditActions,
    output,
  };
}

function diagnosis(id: string, ticketId: string): CompletedDiagnosis {
  return {
    id,
    ticketId,
    problem: "Checkout events accepted for processing are missing from profile timelines.",
    symptoms: ["Accepted checkout events are missing from profile timelines."],
    evidenceIds: ["request-id"],
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
