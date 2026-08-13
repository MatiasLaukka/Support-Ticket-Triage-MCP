import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TicketSchema } from "../src/domain.js";
import { acquireDemoStateResetLease } from "../src/demo-state-lease.js";
import { acquireDemoStateUsageLease } from "../src/demo-reset.js";
import { mainDemoResetCli } from "../src/demo-reset-cli.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";

const roots: string[] = [];
const projectRoot = resolve(import.meta.dirname, "..");
const canonicalTickets = TicketSchema.array().parse(
  JSON.parse(readFileSync(resolve(projectRoot, "data/seed/tickets.json"), "utf8")),
);

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("demo reset CLI", () => {
  it.each([
    { label: "none", args: [] },
    { label: "invalid", args: ["invalid"] },
    { label: "multiple", args: ["operational", "learning"] },
  ])(
    "requires exactly one explicit reset target for $label args",
    async ({ args }) => {
      const result = await invokeCli({ args });

      expect(result).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "Demo reset target must be exactly one of: operational, learning, all.\n",
      });
    },
  );

  it.each(["empty", "native", "imported"] as const)(
    "restores %s operational SQLite to the native seed baseline without changing seed or learning state",
    async (initialState) => {
      const root = temporaryRoot("demo-reset-cli-operational-");
      const dataRoot = join(root, "runtime");
      const seedFile = join(root, "read-only-input", "tickets.json");
      const operationalDatabase = join(dataRoot, "operational.sqlite");
      const learningMarker = join(dataRoot, "knowledge-evolution", "diagnoses", "keep.json");
      mkdirSync(dirname(seedFile), { recursive: true });
      mkdirSync(dirname(learningMarker), { recursive: true });
      writeFileSync(seedFile, JSON.stringify(canonicalTickets));
      writeFileSync(learningMarker, "learning-state");
      initializeOperationalState(operationalDatabase, initialState);
      const seedHash = fileHash(seedFile);

      const result = await invokeCli({
        args: ["operational"],
        env: {
          TRIAGE_DATA_ROOT: dataRoot,
          TRIAGE_SEED_FILE: seedFile,
          OPERATIONAL_DB_PATH: operationalDatabase,
          TRIAGE_LEARNING_LEDGER_PATH: " ",
        },
      });

      expect(result).toEqual({
        exitCode: 0,
        stdout: `Operational demo state reset: ${canonicalTickets.length} tickets restored.\n`,
        stderr: "",
      });
      expect(fileHash(seedFile)).toBe(seedHash);
      expect(readFileSync(learningMarker, "utf8")).toBe("learning-state");
      expect(readOperationalState(operationalDatabase)).toEqual({
        importState: "native",
        tickets: canonicalTickets,
      });
    },
  );

  it("resets only learning state without reading the configured seed or changing operational SQLite", async () => {
    const root = temporaryRoot("demo-reset-cli-learning-");
    const dataRoot = join(root, "runtime");
    const operationalDatabase = join(dataRoot, "operational.sqlite");
    const learningLedgerFile = join(dataRoot, "knowledge-evolution", "learning.sqlite");
    const learningMarker = join(dataRoot, "knowledge-evolution", "diagnoses", "dirty.json");
    initializeOperationalState(operationalDatabase, "imported");
    const operationalHash = fileHash(operationalDatabase);
    mkdirSync(dirname(learningMarker), { recursive: true });
    writeFileSync(learningMarker, "dirty-learning-state");

    const result = await invokeCli({
      args: ["learning"],
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: " ",
        OPERATIONAL_DB_PATH: operationalDatabase,
        TRIAGE_LEARNING_LEDGER_PATH: learningLedgerFile,
      },
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "Learning demo state reset: clean.\n",
      stderr: "",
    });
    expect(fileHash(operationalDatabase)).toBe(operationalHash);
    expect(existsSync(learningLedgerFile)).toBe(true);
    expect(existsSync(learningMarker)).toBe(false);
  });

  it("matches runtime defaults when no path environment variables are configured", async () => {
    const root = temporaryRoot("demo-reset-cli-defaults-");
    const seedFile = join(root, "data", "seed", "tickets.json");
    const operationalDatabase = join(root, "data", "runtime", "operational.sqlite");
    mkdirSync(dirname(seedFile), { recursive: true });
    writeFileSync(seedFile, JSON.stringify(canonicalTickets));

    const result = await invokeCli({ args: ["operational"], env: {}, cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(readOperationalState(operationalDatabase).importState).toBe("native");
  });

  it("runs the atomic combined reset and reports both target results", async () => {
    const root = temporaryRoot("demo-reset-cli-all-");
    const dataRoot = join(root, "runtime");
    const seedFile = join(root, "seed", "tickets.json");
    const operationalDatabase = join(dataRoot, "operational.sqlite");
    const learningLedgerFile = join(dataRoot, "knowledge-evolution", "learning.sqlite");
    const learningMarker = join(dataRoot, "knowledge-evolution", "audit", "dirty.txt");
    mkdirSync(dirname(seedFile), { recursive: true });
    mkdirSync(dirname(learningMarker), { recursive: true });
    writeFileSync(seedFile, JSON.stringify(canonicalTickets));
    writeFileSync(learningMarker, "dirty-learning-state");
    initializeOperationalState(operationalDatabase, "imported");

    const result = await invokeCli({
      args: ["all"],
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: seedFile,
        OPERATIONAL_DB_PATH: operationalDatabase,
        TRIAGE_LEARNING_LEDGER_PATH: learningLedgerFile,
      },
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: `Demo state reset: ${canonicalTickets.length} tickets restored; learning state clean.\n`,
      stderr: "",
    });
    expect(readOperationalState(operationalDatabase).importState).toBe("native");
    expect(existsSync(learningLedgerFile)).toBe(true);
    expect(existsSync(learningMarker)).toBe(false);
  });

  it.each([
    ["operational", "OPERATIONAL_DB_PATH", "The operational database is outside the configured data root."],
    ["learning", "TRIAGE_LEARNING_LEDGER_PATH", "The learning ledger is outside the configured data root."],
  ] as const)(
    "refuses an external %s target unless the explicit escape hatch is true",
    async (mode, variable, message) => {
      const root = temporaryRoot(`demo-reset-cli-${mode}-path-`);
      const dataRoot = join(root, "runtime");
      const externalRoot = temporaryRoot(`demo-reset-cli-${mode}-external-`);
      const seedFile = join(root, "seed", "tickets.json");
      const externalDatabase = join(externalRoot, `${mode}.sqlite`);
      mkdirSync(dirname(seedFile), { recursive: true });
      writeFileSync(seedFile, JSON.stringify(canonicalTickets));
      const env = {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: seedFile,
        [variable]: externalDatabase,
      };

      expect(await invokeCli({ args: [mode], env })).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: `${message}\n`,
      });
      expect(existsSync(externalDatabase)).toBe(false);

      const allowed = await invokeCli({
        args: [mode],
        env: { ...env, ALLOW_DEMO_RESET_OUTSIDE_DATA_ROOT: "true" },
      });
      expect(allowed.exitCode).toBe(0);
      expect(allowed.stderr).toBe("");
      expect(existsSync(externalDatabase)).toBe(true);
    },
  );

  it("returns the stable active-runtime refusal without modifying the target", async () => {
    const harness = cliHarness("demo-reset-cli-runtime-lease-");
    initializeOperationalState(harness.operationalDatabase, "imported");
    const before = fileHash(harness.operationalDatabase);
    const lease = acquireDemoStateUsageLease(harness.dataRoot);
    try {
      expect(await invokeCli({ args: ["operational"], env: harness.env })).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "Operational demo state is active; stop the runtime before resetting.\n",
      });
      expect(fileHash(harness.operationalDatabase)).toBe(before);
    } finally {
      lease.release();
    }
  });

  it("returns the stable active-reset refusal without modifying the target", async () => {
    const harness = cliHarness("demo-reset-cli-reset-lease-");
    initializeOperationalState(harness.operationalDatabase, "empty");
    const before = fileHash(harness.operationalDatabase);
    const lease = acquireDemoStateResetLease(harness.dataRoot);
    try {
      expect(await invokeCli({ args: ["operational"], env: harness.env })).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "Demo state reset is active; another reset cannot start.\n",
      });
      expect(fileHash(harness.operationalDatabase)).toBe(before);
    } finally {
      lease.release();
    }
  });
});

function cliHarness(prefix: string) {
  const root = temporaryRoot(prefix);
  const dataRoot = join(root, "runtime");
  const seedFile = join(root, "seed", "tickets.json");
  const operationalDatabase = join(dataRoot, "operational.sqlite");
  mkdirSync(dirname(seedFile), { recursive: true });
  writeFileSync(seedFile, JSON.stringify(canonicalTickets));
  return {
    dataRoot,
    operationalDatabase,
    env: {
      TRIAGE_DATA_ROOT: dataRoot,
      TRIAGE_SEED_FILE: seedFile,
      OPERATIONAL_DB_PATH: operationalDatabase,
    },
  };
}

async function invokeCli(input: {
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
}) {
  let stdout = "";
  let stderr = "";
  const exitCode = await mainDemoResetCli({
    args: input.args,
    cwd: input.cwd ?? projectRoot,
    env: input.env ?? {},
    writeStdout: (message) => { stdout += message; },
    writeStderr: (message) => { stderr += message; },
  });
  return { exitCode, stdout, stderr };
}

function initializeOperationalState(
  databasePath: string,
  state: "empty" | "native" | "imported",
): void {
  mkdirSync(dirname(databasePath), { recursive: true });
  const store = OperationalSqliteStore.open(databasePath);
  try {
    store.initialize();
    if (state === "native") {
      store.transaction((unit) => unit.transitionImportState("empty", "native"));
    } else if (state === "imported") {
      store.transaction((unit) => {
        unit.transitionImportState("empty", "import-in-progress");
        unit.transitionImportState("import-in-progress", "imported");
      });
    }
  } finally {
    store.close();
  }
}

function readOperationalState(databasePath: string) {
  const store = OperationalSqliteStore.open(databasePath);
  try {
    store.initialize();
    return {
      importState: store.readImportState(),
      tickets: store.listWorkflowSnapshots().map(({ ticket }) => ticket),
    };
  } finally {
    store.close();
  }
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
