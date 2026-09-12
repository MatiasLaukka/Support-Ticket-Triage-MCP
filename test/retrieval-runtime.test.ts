import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createRuntimeDependencies, parseRetrievalMode } from "../src/runtime.js";

describe("retrieval runtime configuration", () => {
  it("defaults to shadow and accepts the explicit off comparison mode", () => {
    expect(parseRetrievalMode({})).toBe("shadow");
    expect(parseRetrievalMode({ TRIAGE_RETRIEVAL_MODE: "off" })).toBe("off");
    expect(parseRetrievalMode({ TRIAGE_RETRIEVAL_MODE: "shadow" })).toBe("shadow");
  });

  it("rejects unsupported retrieval modes instead of silently changing authority", () => {
    expect(() => parseRetrievalMode({ TRIAGE_RETRIEVAL_MODE: "live" })).toThrow(
      "TRIAGE_RETRIEVAL_MODE must be off or shadow.",
    );
  });

  it("constructs the observer in shadow mode and leaves it absent when off", async () => {
    const root = mkdtempSync(join(tmpdir(), "triage-b3-runtime-"));
    const env = {
      TRIAGE_DATA_ROOT: root,
      TRIAGE_SEED_FILE: resolve("data/seed/tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
      TRIAGE_RETRIEVAL_MODE: "off",
    };
    const off = await createRuntimeDependencies({ env });
    expect(off.retrievalObserver).toBeUndefined();
    await off.close();
    const shadow = await createRuntimeDependencies({ env: { ...env, TRIAGE_RETRIEVAL_MODE: "shadow" } });
    expect(shadow.retrievalObserver).toBeDefined();
    await shadow.close();
    rmSync(root, { recursive: true, force: true });
  });
});
