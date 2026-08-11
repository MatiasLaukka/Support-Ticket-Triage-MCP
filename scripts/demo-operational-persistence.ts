import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { TicketSchema, TriageRecommendationSchema } from "../src/domain.js";
import { importOperationalData, type OperationalImportAggregate } from "../src/operational/import.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { buildDecisionTimeline } from "../src/operational/timeline.js";
import { createRuntimeDependencies } from "../src/runtime.js";

export async function runOperationalPersistenceShowcase(): Promise<Record<string, unknown>> {
  const suppliedRoot = process.env.OPERATIONAL_SHOWCASE_ROOT?.trim();
  const root = suppliedRoot === undefined || suppliedRoot === ""
    ? await mkdtemp(join(tmpdir(), "operational-persistence-showcase-"))
    : resolve(suppliedRoot);
  const disposable = suppliedRoot === undefined || suppliedRoot === "";
  const database = join(root, "operational.sqlite");
  const seed = join(root, "empty-seed.json");
  const learning = join(root, "learning.sqlite");
  await writeFile(seed, "[]\n", "utf8");

  const importStore = OperationalSqliteStore.open(database);
  importStore.initialize();
  const imported = importOperationalData({ store: importStore, aggregates: [showcaseAggregate()] });
  if (imported.state !== "imported") {
    throw new Error(`Controlled import did not complete: ${JSON.stringify(imported)}`);
  }
  const importedSnapshot = importStore.readWorkflowSnapshot("TKT-9001");
  importStore.close();

  const env = {
    TRIAGE_DATA_ROOT: join(root, "legacy-unused"),
    TRIAGE_SEED_FILE: seed,
    TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
    TRIAGE_LEARNING_LEDGER_PATH: learning,
    OPERATIONAL_DB_PATH: database,
  };
  const first = await createRuntimeDependencies({ env });
  const beforeRestart = first.operationalStore!.readWorkflowSnapshot("TKT-9001");
  const timeline = buildDecisionTimeline(beforeRestart);
  first.close();

  const restarted = await createRuntimeDependencies({ env });
  const afterRestart = restarted.operationalStore!.readWorkflowSnapshot("TKT-9001");
  const learningEvents = await restarted.knowledgeEvolution.ledger.list();
  restarted.close();

  const report = {
    importState: imported.state,
    importedSourceIds: imported.importedSourceIds,
    journey: timeline.map(({ category, action, outcome }) => ({ category, action, outcome })),
    causalSequences: timeline.map(({ sequence }) => sequence),
    restartIdentical: JSON.stringify(afterRestart) === JSON.stringify(beforeRestart)
      && JSON.stringify(beforeRestart) === JSON.stringify(importedSnapshot),
    finalTicket: afterRestart.ticket,
    currentRecommendation: afterRestart.recommendations.at(-1),
    customerReplyWatermark: afterRestart.customerReplyWatermark,
    advisoryLearning: {
      database: learning,
      eventCount: learningEvents.length,
      separateFromOperationalTruth: true,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (disposable) await rm(root, { recursive: true, force: true });
  return report;
}

function showcaseAggregate(): OperationalImportAggregate {
  const pending = TriageRecommendationSchema.parse({
    id: "90000000-0000-4000-8000-000000000001",
    ticketId: "TKT-9001",
    sourceRevision: 0,
    category: "api",
    priority: "P2",
    team: "api-platform",
    duplicateCandidates: [],
    outageRisk: "none",
    securityRisk: "none",
    slaRisk: "possible",
    missingInformation: [],
    supportState: "ready-for-close",
    knowledgeArticleIds: ["api-reference"],
    draftCustomerResponse: "The governed fix is verified and the ticket can be closed.",
    rationale: "The imported evidence and verification support closure.",
    confidence: 0.94,
    recommendedNextAction: "Close after reviewing the verified outcome.",
    escalationRequired: false,
    escalationReasons: [],
    resolution: "pending",
    createdAt: "2026-08-11T10:00:00.000Z",
  });
  const approved = TriageRecommendationSchema.parse({ ...pending, resolution: "approved" });
  const ticket = TicketSchema.parse({
    id: "TKT-9001",
    revision: 1,
    customer: { name: "Northstar Labs", plan: "enterprise", region: "eu-west", vip: false },
    subject: "Accepted API events were delayed",
    description: "The governed mitigation was applied and verified.",
    status: "resolved",
    category: "api",
    priority: "P2",
    team: "api-platform",
    tags: ["api", "verified"],
    relatedTicketIds: [],
    sla: { responseDueAt: "2026-08-12T10:00:00.000Z", breached: false },
    createdAt: "2026-08-11T09:00:00.000Z",
    updatedAt: "2026-08-11T10:40:00.000Z",
  });
  const event = (index: number, action: OperationalImportAggregate["events"][number]["action"], at: string) => ({
    provenance: "legacy" as const,
    id: `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ticketId: ticket.id,
    occurredAt: at,
    actor: "showcase-operator",
    action,
    commandId: `91000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    facts: {
      reasonCode: "legacy-import",
      ...(action === "ticket-updated"
        ? { revision: 1, status: "resolved", verificationType: "customer-confirmed" }
        : {}),
    },
  });
  const events = [
    event(1, "recommendation-submitted", "2026-08-11T10:00:00.000Z"),
    event(2, "recommendation-approved", "2026-08-11T10:10:00.000Z"),
    event(3, "diagnosis-completed", "2026-08-11T10:20:00.000Z"),
    event(4, "fix-available", "2026-08-11T10:30:00.000Z"),
    event(5, "ticket-updated", "2026-08-11T10:35:00.000Z"),
    event(6, "ticket-updated", "2026-08-11T10:40:00.000Z"),
  ];
  return {
    sourceId: "showcase-TKT-9001",
    provenance: "legacy",
    ticket,
    events,
    ticketRevisions: [{
      ticketId: ticket.id,
      revision: 1,
      ticket,
      operationalEventId: events[5]!.id,
      createdAt: events[5]!.occurredAt,
    }],
    messages: [],
    recommendations: [approved],
    recommendationRevisions: [
      { recommendation: pending, operationalEventId: events[0]!.id, createdAt: events[0]!.occurredAt },
      { recommendation: approved, operationalEventId: events[1]!.id, createdAt: events[1]!.occurredAt },
    ],
    diagnoses: [],
    traces: [
      {
        id: "92000000-0000-4000-8000-000000000001",
        operationalEventId: events[4]!.id,
        ticketId: ticket.id,
        occurredAt: events[4]!.occurredAt,
        actor: "showcase-operator",
        traceType: "lifecycle",
        stage: "outcome-verified",
        outcome: "success",
      },
      {
        id: "92000000-0000-4000-8000-000000000002",
        operationalEventId: events[5]!.id,
        ticketId: ticket.id,
        occurredAt: events[5]!.occurredAt,
        actor: "showcase-operator",
        traceType: "lifecycle",
        stage: "ticket-closed",
        outcome: "success",
      },
    ],
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runOperationalPersistenceShowcase().catch((error: unknown) => {
    process.stderr.write(`Operational persistence showcase failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
