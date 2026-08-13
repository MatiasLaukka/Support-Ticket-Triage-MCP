import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";

const LEASE_DIRECTORY = ".demo-state-usage";
const GATE_FILE = ".gate";
const RESET_LEASE_FILE = "reset.lease";
const GATE_WAIT_MS = 2_000;
const GATE_STALE_MS = 30_000;

export interface DemoStateUsageLease {
  release(): void;
}

export class DemoStateLeaseError extends Error {
  constructor(
    message: string,
    readonly code: "ACTIVE_RUNTIME" | "ACTIVE_RESET" | "LEASE_ERROR",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DemoStateLeaseError";
  }
}

export function acquireDemoStateUsageLease(dataRoot: string): DemoStateUsageLease {
  const leaseRoot = leaseDirectory(dataRoot);
  const token = randomUUID();
  const leaseFile = join(leaseRoot, `usage-${process.pid}-${token}.lease`);
  withLeaseGate(leaseRoot, () => {
    removeStaleLeaseRecords(leaseRoot);
    if (leaseRecordIsActive(join(leaseRoot, RESET_LEASE_FILE))) {
      throw new DemoStateLeaseError(
        "Demo state reset is active; runtime startup is unavailable.",
        "ACTIVE_RESET",
      );
    }
    writeLeaseRecord(leaseFile, token);
  });
  return releasableLease(leaseRoot, leaseFile);
}

export function acquireDemoStateResetLease(dataRoot: string): DemoStateUsageLease {
  const leaseRoot = leaseDirectory(dataRoot);
  const token = randomUUID();
  const leaseFile = join(leaseRoot, RESET_LEASE_FILE);
  withLeaseGate(leaseRoot, () => {
    removeStaleLeaseRecords(leaseRoot);
    const usageLeases = activeUsageLeaseFiles(leaseRoot);
    if (usageLeases.length > 0) {
      throw new DemoStateLeaseError(
        "Operational demo state is active; stop the runtime before resetting.",
        "ACTIVE_RUNTIME",
      );
    }
    if (leaseRecordIsActive(leaseFile)) {
      throw new DemoStateLeaseError(
        "Demo state reset is active; another reset cannot start.",
        "ACTIVE_RESET",
      );
    }
    writeLeaseRecord(leaseFile, token);
  });
  return releasableLease(leaseRoot, leaseFile);
}

function releasableLease(leaseRoot: string, leaseFile: string): DemoStateUsageLease {
  let released = false;
  return {
    release(): void {
      if (released) return;
      withLeaseGate(leaseRoot, () => {
        rmSync(leaseFile, { force: true });
      });
      released = true;
    },
  };
}

function leaseDirectory(dataRoot: string): string {
  const canonicalRoot = canonicalizeNearestExisting(dataRoot);
  mkdirSync(canonicalRoot, { recursive: true });
  const leaseRoot = join(canonicalRoot, LEASE_DIRECTORY);
  mkdirSync(leaseRoot, { recursive: true });
  return leaseRoot;
}

function withLeaseGate<T>(leaseRoot: string, work: () => T): T {
  const gatePath = join(leaseRoot, GATE_FILE);
  const deadline = Date.now() + GATE_WAIT_MS;
  let handle: number | undefined;
  while (handle === undefined) {
    try {
      handle = openSync(gatePath, "wx", 0o600);
      writeFileSync(handle, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw new DemoStateLeaseError(
          "Demo state usage coordination is unavailable.",
          "LEASE_ERROR",
          { cause: error },
        );
      }
      removeStaleGate(gatePath);
      if (Date.now() >= deadline) {
        throw new DemoStateLeaseError(
          "Demo state usage coordination is busy; retry shortly.",
          "LEASE_ERROR",
        );
      }
      waitBriefly();
    }
  }
  try {
    return work();
  } finally {
    closeSync(handle);
    try {
      unlinkSync(gatePath);
    } catch {
      // A stale-gate recovery may already have removed it after process failure.
    }
  }
}

function writeLeaseRecord(path: string, token: string): void {
  try {
    writeFileSync(path, JSON.stringify({ pid: process.pid, token }), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    throw new DemoStateLeaseError(
      "Demo state usage lease could not be acquired.",
      "LEASE_ERROR",
      { cause: error },
    );
  }
}

function activeUsageLeaseFiles(leaseRoot: string): string[] {
  return readdirSync(leaseRoot)
    .filter((name) => /^usage-\d+-[0-9a-f-]+\.lease$/i.test(name))
    .map((name) => join(leaseRoot, name))
    .filter(leaseRecordIsActive);
}

function removeStaleLeaseRecords(leaseRoot: string): void {
  for (const name of readdirSync(leaseRoot)) {
    if (name === GATE_FILE) continue;
    if (name !== RESET_LEASE_FILE && !/^usage-\d+-[0-9a-f-]+\.lease$/i.test(name)) continue;
    const path = join(leaseRoot, name);
    if (!leaseRecordIsActive(path)) rmSync(path, { force: true });
  }
}

function leaseRecordIsActive(path: string): boolean {
  let pid: number;
  try {
    const record = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown };
    if (!Number.isSafeInteger(record.pid) || Number(record.pid) <= 0) return false;
    pid = Number(record.pid);
  } catch {
    return false;
  }
  return processIsAlive(pid);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function removeStaleGate(gatePath: string): void {
  try {
    const age = Date.now() - statSync(gatePath).mtimeMs;
    if (age < GATE_STALE_MS) return;
    let pid: number | undefined;
    try {
      const record = JSON.parse(readFileSync(gatePath, "utf8")) as { pid?: unknown };
      if (Number.isSafeInteger(record.pid)) pid = Number(record.pid);
    } catch {
      // An old incomplete gate is stale after the age threshold.
    }
    if (pid === undefined || !processIsAlive(pid)) rmSync(gatePath, { force: true });
  } catch {
    // The gate disappeared between the failed atomic create and inspection.
  }
}

function waitBriefly(): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, 10);
}

function canonicalizeNearestExisting(path: string): string {
  const absolute = resolve(path);
  const missing: string[] = [];
  let ancestor = absolute;
  while (true) {
    try {
      const canonicalAncestor = realpathSync.native(ancestor);
      return resolve(canonicalAncestor, ...missing.reverse());
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.push(basename(ancestor));
      ancestor = parent;
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
