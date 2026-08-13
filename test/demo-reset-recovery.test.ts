import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketSchema } from "../src/domain.js";
import { OperationalSqliteStore } from "../src/operational/sqlite-store.js";

const injected = vi.hoisted(() => ({
  databasePath: "",
  failSidecarMove: false,
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
      return actual.renameSync(source, destination);
    },
  };
});

const roots: string[] = [];

afterEach(() => {
  injected.databasePath = "";
  injected.failSidecarMove = false;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
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
