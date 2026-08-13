import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const PUBLIC_RESET_RUNBOOKS = [
  "README.md",
  "docs/lifecycle-replay.md",
  "docs/video-script.md",
] as const;

describe("demo reset documentation", () => {
  test("does not invoke legacy implicit-reset Approval Desk runners", async () => {
    const runbooks = await Promise.all(
      PUBLIC_RESET_RUNBOOKS.map(async (file) => [file, await readFile(file, "utf8")] as const),
    );

    for (const [file, runbook] of runbooks) {
      expect(runbook, file).not.toContain("npm run demo:approval-desk");
      expect(runbook, file).not.toContain("npm run demo:showcase");
    }
  });

  test("video runbook resets explicitly before starting the Approval Desk", async () => {
    const runbook = await readFile("docs/video-script.md", "utf8");
    const resetIndex = runbook.indexOf("npm run reset:demo");
    const startIndex = runbook.indexOf("npm run approval-desk");

    expect(resetIndex).toBeGreaterThanOrEqual(0);
    expect(startIndex).toBeGreaterThan(resetIndex);
  });
});
