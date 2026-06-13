import process from "node:process";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AuditRepository } from "./audit-repository.js";
import { KnowledgeRepository } from "./knowledge-repository.js";
import { RecommendationRepository } from "./recommendation-repository.js";
import { createTriageServer } from "./server.js";
import { TicketRepository } from "./ticket-repository.js";
import { TriageService } from "./triage-service.js";

const DEFAULT_MINUTES_SAVED = 8;

function environmentPath(name: string, fallback: string): string {
  return resolve(process.cwd(), process.env[name] ?? fallback);
}

function minutesSaved(): number {
  const configured = process.env.TRIAGE_MINUTES_SAVED;
  if (configured === undefined) {
    return DEFAULT_MINUTES_SAVED;
  }
  if (configured.trim() === "") {
    throw new Error(
      "TRIAGE_MINUTES_SAVED must be a finite nonnegative number.",
    );
  }
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      "TRIAGE_MINUTES_SAVED must be a finite nonnegative number.",
    );
  }
  return parsed;
}

function safeErrorDetail(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "Unexpected startup error.";
}

async function main(): Promise<void> {
  const dataRoot = environmentPath("TRIAGE_DATA_ROOT", "data/runtime");
  const seedFile = environmentPath(
    "TRIAGE_SEED_FILE",
    "data/seed/tickets.json",
  );
  const knowledgeRoot = environmentPath(
    "TRIAGE_KNOWLEDGE_ROOT",
    "data/knowledge",
  );
  const minutesPerAcceptedRecommendation = minutesSaved();
  const now = () => new Date();

  const tickets = new TicketRepository(dataRoot, seedFile);
  await tickets.initialize();
  const knowledge = new KnowledgeRepository(knowledgeRoot);
  const recommendations = new RecommendationRepository(
    resolve(dataRoot, "recommendations"),
  );
  const audits = new AuditRepository(
    resolve(dataRoot, "audit", "events.jsonl"),
  );
  const service = new TriageService({
    tickets,
    recommendations,
    audit: audits,
    now,
  });
  const server = createTriageServer({
    tickets,
    knowledge,
    recommendations,
    audits,
    service,
    now,
    minutesPerAcceptedRecommendation,
  });

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error("Support ticket triage server failed to start.");
  console.error(safeErrorDetail(error));
  process.exitCode = 1;
});
