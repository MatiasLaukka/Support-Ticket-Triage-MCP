import { describe, expect, it } from "vitest";
import { lifecycleReplayHtml } from "../src/approval-desk/lifecycle-replay-ui.js";

describe("lifecycle replay UI", () => {
  it("contains the stable workspace regions and read-only controls", () => {
    for (const id of [
      "lifecycle-replay-root",
      "lifecycle-replay-ticket-list",
      "lifecycle-replay-snapshot-list",
      "lifecycle-replay-timeline",
      "lifecycle-replay-inspector",
      "lifecycle-replay-view-toggle",
      "lifecycle-replay-lane-select",
    ]) {
      expect(lifecycleReplayHtml).toContain(`id="${id}"`);
    }
    expect(lifecycleReplayHtml).toContain("/api/lifecycle-replay");
    expect(lifecycleReplayHtml).toContain("Explicit approval is required");
    expect(lifecycleReplayHtml).toContain("Customer view");
    expect(lifecycleReplayHtml).toContain("Operator view");
  });

  it("does not contain mutation requests or pretend snapshots are chronological", () => {
    expect(lifecycleReplayHtml).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
    expect(lifecycleReplayHtml).toContain("Snapshot order is not inferred");
    expect(lifecycleReplayHtml).toContain("providerProvenance");
    expect(lifecycleReplayHtml).toContain("classificationAgreement");
    expect(lifecycleReplayHtml).toContain("failureReasons");
  });
});
