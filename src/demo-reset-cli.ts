import process from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DemoResetError,
  resetDemoState,
  resetLearningDemoState,
  resetOperationalDemoState,
} from "./demo-reset.js";
import { DemoStateLeaseError } from "./demo-state-lease.js";
import {
  environmentPath,
  StartupConfigError,
  type RuntimeEnvironment,
} from "./runtime.js";

const INVALID_TARGET_MESSAGE =
  "Demo reset target must be exactly one of: operational, learning, all.";

type DemoResetTarget = "operational" | "learning" | "all";

export interface DemoResetCliOptions {
  readonly args: readonly string[];
  readonly env?: RuntimeEnvironment;
  readonly cwd?: string;
  readonly writeStdout?: (message: string) => void;
  readonly writeStderr?: (message: string) => void;
}

export async function mainDemoResetCli(
  options: DemoResetCliOptions,
): Promise<number> {
  const writeStdout = options.writeStdout ?? ((message) => process.stdout.write(message));
  const writeStderr = options.writeStderr ?? ((message) => process.stderr.write(message));
  const target = parseTarget(options.args);
  if (target === undefined) {
    writeStderr(`${INVALID_TARGET_MESSAGE}\n`);
    return 1;
  }

  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  try {
    const dataRoot = environmentPath("TRIAGE_DATA_ROOT", "data/runtime", env, cwd);
    const allowExternalPath = env.ALLOW_DEMO_RESET_OUTSIDE_DATA_ROOT === "true";

    if (target === "operational") {
      const summary = resetOperationalDemoState({
        dataRoot,
        seedFile: operationalSeedFile(env, cwd),
        operationalDatabase: operationalDatabase(env, cwd, dataRoot),
        allowExternalDatabasePath: allowExternalPath,
      });
      writeStdout(
        `Operational demo state reset: ${summary.ticketCount} tickets restored.\n`,
      );
      return 0;
    }

    if (target === "learning") {
      await resetLearningDemoState({
        dataRoot,
        learningLedgerFile: learningLedgerFile(env, cwd, dataRoot),
        allowExternalLedgerPath: allowExternalPath,
      });
      writeStdout("Learning demo state reset: clean.\n");
      return 0;
    }

    const summary = await resetDemoState({
      dataRoot,
      seedFile: operationalSeedFile(env, cwd),
      operationalDatabase: operationalDatabase(env, cwd, dataRoot),
      learningLedgerFile: learningLedgerFile(env, cwd, dataRoot),
      allowExternalDatabasePath: allowExternalPath,
      allowExternalLedgerPath: allowExternalPath,
    });
    writeStdout(
      `Demo state reset: ${summary.operational.ticketCount} tickets restored; learning state clean.\n`,
    );
    return 0;
  } catch (error) {
    writeStderr(`${safeErrorMessage(error)}\n`);
    return 1;
  }
}

function parseTarget(args: readonly string[]): DemoResetTarget | undefined {
  if (args.length !== 1) return undefined;
  const [target] = args;
  return target === "operational" || target === "learning" || target === "all"
    ? target
    : undefined;
}

function operationalSeedFile(env: RuntimeEnvironment, cwd: string): string {
  return environmentPath("TRIAGE_SEED_FILE", "data/seed/tickets.json", env, cwd);
}

function operationalDatabase(
  env: RuntimeEnvironment,
  cwd: string,
  dataRoot: string,
): string {
  return environmentPath(
    "OPERATIONAL_DB_PATH",
    resolve(dataRoot, "operational.sqlite"),
    env,
    cwd,
  );
}

function learningLedgerFile(
  env: RuntimeEnvironment,
  cwd: string,
  dataRoot: string,
): string {
  return environmentPath(
    "TRIAGE_LEARNING_LEDGER_PATH",
    resolve(dataRoot, "knowledge-evolution", "learning.sqlite"),
    env,
    cwd,
  );
}

function safeErrorMessage(error: unknown): string {
  return error instanceof DemoResetError
      || error instanceof DemoStateLeaseError
      || error instanceof StartupConfigError
    ? error.message
    : "Demo state reset failed.";
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && pathToFileURL(resolve(entryPoint)).href === import.meta.url) {
  void mainDemoResetCli({ args: process.argv.slice(2) }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
