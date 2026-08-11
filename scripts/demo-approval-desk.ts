import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { TicketSchema, type Ticket } from "../src/domain.js";
import { importOperationalData, type OperationalImportAggregate } from "../src/operational/import.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";

const EXPECTED_PACKAGE_NAME = "support-ticket-triage-mcp";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "5177";
const LISTEN_URL_PATTERN =
  /Approval Desk listening at (http:\/\/(?:\[[^\]]+\]|[A-Za-z0-9.-]+):\d+)\./;

export async function verifyDemoRepository(root: string): Promise<void> {
  const packageJson = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  ) as { name?: unknown };

  if (packageJson.name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(
      `Refusing demo start: expected package ${EXPECTED_PACKAGE_NAME}.`,
    );
  }
}

export async function resetRuntimeDirectory(root: string): Promise<void> {
  await verifyDemoRepository(root);
  const runtime = resolve(root, "data", "runtime");

  try {
    const runtimeStat = await lstat(runtime);
    if (!runtimeStat.isDirectory()) {
      throw new Error(`Refusing demo start: ${runtime} is not a directory.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(runtime, { recursive: true });

  const entries = await readdir(runtime);
  await Promise.all(
    entries
      .filter((entry) => entry !== ".gitkeep")
      .map((entry) => rm(resolve(runtime, entry), { recursive: true, force: true })),
  );
}

export async function seedDemoOperationalDatabase(root: string): Promise<void> {
  const tickets = TicketSchema.array().parse(JSON.parse(
    await readFile(resolve(root, "data", "seed", "tickets.json"), "utf8"),
  ));
  const store = OperationalSqliteStore.open(
    resolve(root, "data", "runtime", "operational.sqlite"),
  );
  try {
    store.initialize();
    const result = importOperationalData({
      store,
      aggregates: tickets.map(demoImportAggregate),
    });
    if (result.state !== "imported" || result.invalid.length > 0 || result.conflicts.length > 0) {
      throw new Error(`Demo operational import failed: ${JSON.stringify(result)}`);
    }
  } finally {
    store.close();
  }
}

function demoImportAggregate(ticket: Ticket, index: number): OperationalImportAggregate {
  const suffix = String(index + 1).padStart(12, "0");
  const operationalEventId = `93000000-0000-4000-8000-${suffix}`;
  return {
    sourceId: `demo-seed-${ticket.id}`,
    provenance: "legacy",
    ticket,
    events: [{
      provenance: "legacy",
      id: operationalEventId,
      ticketId: ticket.id,
      occurredAt: ticket.updatedAt,
      actor: "demo-import",
      action: "ticket-updated",
      commandId: `94000000-0000-4000-8000-${suffix}`,
      facts: { reasonCode: "legacy-import", revision: ticket.revision, status: ticket.status },
    }],
    ticketRevisions: [{
      ticketId: ticket.id,
      revision: ticket.revision,
      ticket,
      operationalEventId,
      createdAt: ticket.updatedAt,
    }],
    messages: [],
    recommendations: [],
    recommendationRevisions: [],
    diagnoses: [],
    traces: [],
  };
}

export function buildDemoWalkthrough(url: string): string {
  return [
    "Approval Desk demo ready:",
    url,
    "Suggested walkthrough:",
    "1. Select TKT-1001.",
    "2. Evaluate the ticket.",
    "3. Review the Customer Response Draft and workflow summary.",
    "4. Open Show technical evidence only when you want the audit trail.",
    "5. Mark Done from the floating action bar, or use Edit fields / Reject.",
    "6. After Done, review the automatic customer reply, then evaluate again.",
    "7. Confirm dashboard metrics, safety blocks, and audit trail.",
    "Press Ctrl+C to stop the local demo server.",
  ].join("\n");
}

async function main(root: string): Promise<void> {
  await verifyDemoRepository(root);
  await resetRuntimeDirectory(root);
  await seedDemoOperationalDatabase(root);

  const child = spawn(process.execPath, ["dist/src/approval-desk.js"], {
    cwd: root,
    env: {
      ...process.env,
      APPROVAL_DESK_HOST: process.env.APPROVAL_DESK_HOST ?? DEFAULT_HOST,
      APPROVAL_DESK_PORT: process.env.APPROVAL_DESK_PORT ?? DEFAULT_PORT,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let printedWalkthrough = false;
  let startupFailed = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    process.stdout.write(chunk);
    stdout += chunk;
    if (!printedWalkthrough) {
      const match = LISTEN_URL_PATTERN.exec(stdout);
      if (match !== null) {
        printedWalkthrough = true;
        process.stdout.write(`\n${buildDemoWalkthrough(match[1]!)}\n`);
      }
    }
  });
  child.stderr.on("data", (chunk: string) => {
    process.stderr.write(chunk);
  });

  process.once("SIGINT", () => {
    child.kill();
  });

  child.once("error", (error) => {
    startupFailed = true;
    process.stderr.write(`Approval Desk demo failed to start.\n${error.message}\n`);
    process.exitCode = 1;
  });

  child.once("close", (code) => {
    if (!startupFailed) {
      process.exitCode = code ?? 0;
    }
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }

  const modulePath = resolve(fileURLToPath(import.meta.url));
  const entryPath = resolve(entry);
  if (process.platform === "win32") {
    return modulePath.toLowerCase() === entryPath.toLowerCase();
  }
  return modulePath === entryPath;
}

if (isMainModule()) {
  main(resolve(process.cwd())).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Approval Desk demo failed to start.\n${message}\n`);
    process.exitCode = 1;
  });
}
