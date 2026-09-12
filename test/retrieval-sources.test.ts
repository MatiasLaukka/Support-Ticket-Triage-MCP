import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";

import { KNOWN_CAUSES } from "../src/approval-desk/known-cause-catalog.js";
import { PLAYBOOK_DESCRIPTORS } from "../src/approval-desk/diagnostic-playbook-descriptors.js";
import { loadRetrievalSources, projectLearnedCause, projectStaticCause } from "../src/retrieval/sources.js";
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

  it("namespaces learned causes separately from static causes", () => {
    const staticResource = projectStaticCause(KNOWN_CAUSES[0]!);
    const learnedResource = projectLearnedCause({
      object: {
        id: KNOWN_CAUSES[0]!.id,
        kind: "known-cause",
        name: "Learned quiet hours",
        summary: "A reviewed learned summary.",
        triggerPatterns: ["quiet hours"],
        evidencePolicy: { mode: "none-required", rationale: "Reviewed" },
        timeConstraints: ["Apply only during the documented window."],
        diagnosticSteps: ["Compare the send window."],
        fixSteps: ["Reschedule the send."],
        verificationSteps: ["Confirm the next send is accepted."],
        customerSafeExplanation: "The send window prevented delivery.",
        operatorRationale: "Reviewed from completed cases.",
        owner: "support",
        version: 2,
        supportingDiagnosisIds: ["diagnosis-1"],
        supportingTicketIds: ["TKT-1001"],
        provenance: { source: "review", recordedAt: "2026-09-12T00:00:00.000Z" },
        status: "approved",
        approval: { approvedBy: "reviewer", approvedAt: "2026-09-12T00:00:00.000Z" },
        learningGovernance: "legacy",
      },
      version: 2,
      learning: { maturity: "outcome-verified", health: "active", eligibleForReuse: true },
      eligibilitySource: "legacy-compatible",
    });
    expect(staticResource.resource.key).not.toBe(learnedResource.resource.key);
    expect(learnedResource.resource.key).toBe(`known-cause:learned/${KNOWN_CAUSES[0]!.id}`);
  });

  it("grounds every descriptor in an existing executable diagnostic path", () => {
    const playbookFile = "src/approval-desk/diagnostic-playbooks.ts";
    expect(existsSync(new URL(`../${playbookFile}`, import.meta.url))).toBe(true);
    for (const descriptor of PLAYBOOK_DESCRIPTORS) {
      expect(descriptor.executablePath.startsWith(`${playbookFile}#`)).toBe(true);
      expect(descriptor.executablePath.split("#")[1]).toBeTruthy();
      expect(descriptor.linkedKnowledgeArticleIds.every((id) => id.length > 0)).toBe(true);
    }
  });
});
