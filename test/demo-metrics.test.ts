import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QueueMetricsSchema } from "../src/metrics.js";

const execFileAsync = promisify(execFile);

describe("metrics showcase", () => {
  it("prints schema-valid deterministic queue metrics from the seed data", async () => {
    const packageJson = await import("../package.json", { with: { type: "json" } });
    expect(packageJson.default.scripts["demo:metrics"]).toBe(
      "npm run build && node dist/scripts/demo-metrics.js",
    );

    const result = await execFileAsync(
      process.execPath,
      [resolve("dist/scripts/demo-metrics.js")],
      { cwd: resolve(".") },
    );
    const metrics = QueueMetricsSchema.parse(JSON.parse(result.stdout));

    expect(metrics.generatedAt).toBe("2026-06-10T12:00:00.000Z");
    expect(metrics.minutesPerAcceptedRecommendation).toBe(8);
    expect(metrics.submittedRecommendations).toBeGreaterThan(0);
    expect(metrics.confidenceBandCounts).toEqual({
      low: expect.any(Number),
      medium: expect.any(Number),
      high: expect.any(Number),
    });
  });
});
