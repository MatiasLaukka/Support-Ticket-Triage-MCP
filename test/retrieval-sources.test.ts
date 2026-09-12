import { describe, expect, it } from "vitest";

import { KNOWN_CAUSES } from "../src/approval-desk/known-cause-catalog.js";
import { loadRetrievalSources, projectStaticCause } from "../src/retrieval/sources.js";
import { retrievalArticle } from "./retrieval-fixtures.js";

describe("retrieval sources", () => {
  it("projects approved known-cause descriptions without executing matching code", () => {
    const cause = { ...KNOWN_CAUSES[0]!, matches: () => { throw new Error("retrieval executed matching logic"); } };
    const resource = projectStaticCause(cause);
    expect(JSON.stringify(resource)).not.toContain("retrieval executed");
    expect(resource.resource.type).toBe("known-cause");
    expect(resource.resource.linkedResourceKeys).toEqual(["knowledge-article:sms-compliance"]);
  });

  it("keeps authoritative articles when reusable learning is unavailable", () => {
    const snapshot = loadRetrievalSources({
      articles: [retrievalArticle()],
      reusable: { status: "ledger-unavailable", contexts: [], issues: [{ scope: "snapshot", code: "ledger-read-failed" }] },
      completedSnapshots: [],
    });
    expect(snapshot.resources.some(({ resource }) => resource.key === "knowledge-article:article")).toBe(true);
    expect(snapshot.unavailableFamilies).toContain("learned-known-cause");
  });
});
