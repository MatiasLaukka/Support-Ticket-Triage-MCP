import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketSchema } from "../src/domain.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";
import { SqliteLearningLedger } from "../src/knowledge-evolution/sqlite-learning-ledger.js";

const injected = vi.hoisted(() => ({
  databasePath: "",
  failSidecarMove: false,
  failLearningAuditBackup: false,
  failLearningDiagnosisRestore: false,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync(source: Parameters<typeof actual.renameSync>[0], destination: Parameters<typeof actual.renameSync>[1]) {
      if (injected.failSidecarMove && String(source) === `${injected.databasePath}-shm`) {
        mkdirSync(injected.databasePath);
        throw Object.assign(new Error("injected sidecar backup failure"), { code: "EACCES" });
      }
      if (injected.failLearningAuditBackup && String(source).endsWith("\\audit")) {
        throw Object.assign(new Error("injected learning audit backup failure"), { code: "EACCES" });
      }
      if (
        injected.failLearningDiagnosisRestore
        && String(source).includes("diagnoses.reset-backup-")
      ) {
        throw Object.assign(new Error("injected learning diagnosis restore failure"), { code: "EACCES" });
      }
      return actual.renameSync(source, destination);
    },
  };
});

const roots: string[] = [];

afterEach(() => {
  injected.databasePath = "";
  injected.failSidecarMove = false;
  injected.failLearningAuditBackup = false;
  injected.failLearningDiagnosisRestore = false;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("combined reset learning recovery inventory", () => {
  it("reports a retained mutable-directory backup when learning rollback cannot restore it", async () => {
    const { resetDemoState } = await import("../src/demo-reset.js");
    const root = mkdtempSync(join(tmpdir(), "demo-reset-combined-recovery-"));
    roots.push(root);
    const seedTickets = TicketSchema.array().min(1).parse(
      JSON.parse(readFileSync(resolve("data", "seed", "tickets.json"), "utf8")),
    );
    const seedFile = join(root, "tickets.json");
    writeFileSync(seedFile, JSON.stringify(seedTickets));
    const databasePath = join(root, "operational.sqlite");
    const operational = OperationalSqliteStore.open(databasePath);
    operational.initialize();
    operational.transaction((unit) => {
      unit.transitionImportState("empty", "native");
      unit.insertTicket(seedTickets[0]!);
    });
    operational.close();
    const learningRoot = join(root, "knowledge-evolution");
    const learningDatabase = join(learningRoot, "learning.sqlite");
    const ledger = new SqliteLearningLedger(learningDatabase);
    await ledger.initialize();
    ledger.close();
    for (const name of ["diagnoses", "candidates", "approved", "audit"]) {
      const directory = join(learningRoot, name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "original.txt"), name);
    }
    injected.failLearningAuditBackup = true;
    injected.failLearningDiagnosisRestore = true;

    const error = await resetDemoState({
      operationalDatabase: databasePath,
      seedFile,
      dataRoot: root,
      learningLedgerFile: learningDatabase,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "ROLLBACK_FAILED",
    });
    expect(String((error as Error).message)).toMatch(/recovery backups retained: .*diagnoses\.reset-backup-/i);
    expect(String((error as Error).message)).not.toContain(root);
    expect((await import("node:fs")).readdirSync(learningRoot)
      .some((name) => name.startsWith("diagnoses.reset-backup-"))).toBe(true);
  });
});

describe("operational reset recovery inventory", () => {
  it("reports the retained main backup when a partial backup move cannot be restored", async () => {
    const { prepareOperationalDemoReset } = await import("../src/demo-reset.js");
    const root = mkdtempSync(join(tmpdir(), "demo-reset-recovery-"));
    roots.push(root);
    const seedTickets = TicketSchema.array().min(1).parse(
      JSON.parse(readFileSync(resolve("data", "seed", "tickets.json"), "utf8")),
    );
    const seedFile = join(root, "tickets.json");
    writeFileSync(seedFile, JSON.stringify(seedTickets));
    const databasePath = join(root, "operational.sqlite");
    const store = OperationalSqliteStore.open(databasePath);
    store.initialize();
    store.transaction((unit) => {
      unit.transitionImportState("empty", "native");
      unit.insertTicket(seedTickets[0]!);
    });
    store.close();
    writeFileSync(`${databasePath}-shm`, "sidecar");
    injected.databasePath = databasePath;
    injected.failSidecarMove = true;
    const prepared = prepareOperationalDemoReset({
      operationalDatabase: databasePath,
      seedFile,
      dataRoot: root,
    });

    expect(() => prepared.commit()).toThrowError(
      expect.objectContaining({
        code: "ROLLBACK_FAILED",
        message: expect.stringMatching(/recovery backups retained: operational\.sqlite\.reset-backup-/i),
      }),
    );
    expect(() => readFileSync(databasePath)).toThrow();
    expect(
      (await import("node:fs")).readdirSync(root)
        .map((name) => basename(name))
        .some((name) => name.startsWith("operational.sqlite.reset-backup-")),
    ).toBe(true);
  });
});
