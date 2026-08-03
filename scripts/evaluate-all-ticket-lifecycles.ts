import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TicketSchema } from "../src/domain.js";
import { auditSeedTicketLifecycles } from "../src/approval-desk/all-ticket-lifecycle-audit.js";
import { loadExpectedOutcomes } from "../src/approval-desk/recommendation-builder.js";

const projectRoot = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const tickets = TicketSchema.array().parse(
    JSON.parse(await readFile(resolve(projectRoot, "data/seed/tickets.json"), "utf8")),
  );
  const outcomes = await loadExpectedOutcomes(
    resolve(projectRoot, "data/seed/expected-outcomes.json"),
  );
  const report = auditSeedTicketLifecycles(tickets, outcomes);

  console.log("# All-ticket lifecycle audit");
  console.log(`- Seed tickets audited: ${report.ticketCount}`);
  console.log(`- Classification contracts passing: ${report.classificationContractPassCount}/${report.ticketCount}`);
  console.log(`- Tickets with baseline missing evidence: ${report.baselineMissingEvidenceCount}`);
  console.log(`- Known-cause matches: ${report.knownCauseCount}`);
  console.log(`- Known-event matches: ${report.knownEventCount}`);
  console.log(`- Resolved seed tickets: ${report.closedSeedTicketCount}`);
  console.log("\n## Ticket observations");
  for (const observation of report.observations) {
    const mismatches = observation.classificationMismatches.length === 0
      ? "contract=pass"
      : `contract=review (${observation.classificationMismatches.join("; ")})`;
    console.log(
      `- ${observation.ticketId}: ${observation.seedStatus}; ${observation.category}/${observation.priority}/${observation.team}; ` +
      `cause=${observation.knownCause ?? "none"}; event=${observation.knownEventId ?? "none"}; ` +
      `support=${observation.supportState ?? "unset"}; missing=${observation.missingEvidence.length}; ` +
      `diagnosis=${observation.diagnosisOutcome}; next=${observation.operatorNextAction}; ${mismatches}`,
    );
  }
  console.log("\n## Machine-readable report");
  console.log(JSON.stringify(report, null, 2));
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
