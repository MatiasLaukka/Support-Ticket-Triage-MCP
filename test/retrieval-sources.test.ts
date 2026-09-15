import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { KNOWN_CAUSES } from "../src/approval-desk/known-cause-catalog.js";
import { PLAYBOOK_DESCRIPTORS } from "../src/approval-desk/diagnostic-playbook-descriptors.js";
import { AuditEventSchema } from "../src/domain.js";
import { KnowledgeRepository } from "../src/knowledge-repository.js";
import { loadRetrievalSources, projectLearnedCause, projectResolvedCase, projectStaticCause } from "../src/retrieval/sources.js";
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

  it("changes the projection hash when linked source metadata changes", () => {
    const cause = KNOWN_CAUSES[0]!;
    const linked = projectStaticCause(cause);
    const changed = projectStaticCause({ ...cause, knowledgeArticleIds: [...cause.knowledgeArticleIds, "event-tracking-debugging"] });
    expect(changed.resource.contentHash).not.toBe(linked.resource.contentHash);
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

  it("links descriptors only to knowledge articles in the authoritative catalog", async () => {
    const articleIds = new Set((await new KnowledgeRepository(resolve("data/knowledge")).list()).map((article) => article.id));
    for (const descriptor of PLAYBOOK_DESCRIPTORS) {
      for (const articleId of descriptor.linkedKnowledgeArticleIds) expect(articleIds.has(articleId)).toBe(true);
    }
  });

  it("exposes the scoped event and webhook article links without introducing playbook identities", () => {
    expect(PLAYBOOK_DESCRIPTORS.map((descriptor) => descriptor.id)).toEqual([
      "event-processing-delay", "flow-trigger", "campaign-editor", "article-backed",
    ]);
    expect(PLAYBOOK_DESCRIPTORS.find((descriptor) => descriptor.id === "event-processing-delay")
      ?.linkedKnowledgeArticleIds).toContain("event-tracking-debugging");
    expect(PLAYBOOK_DESCRIPTORS.find((descriptor) => descriptor.id === "flow-trigger")
      ?.linkedKnowledgeArticleIds).toContain("event-tracking-debugging");
    expect(PLAYBOOK_DESCRIPTORS.find((descriptor) => descriptor.id === "article-backed")
      ?.linkedKnowledgeArticleIds).toContain("webhook-signature-validation");
  });

  it("treats a successful read with no eligible resolved cases as an authoritative empty family", () => {
    const snapshot = loadRetrievalSources({
      articles: [retrievalArticle()],
      reusable: { status: "available", contexts: [], issues: [] },
      completedSnapshots: [{ ticket: { ...({ id: "TKT-0001", status: "open" } as any) }, audits: [], diagnoses: [] }],
    });
    expect(snapshot.unavailableFamilies).not.toContain("resolved-ticket");
  });

  it("marks resolved-ticket sources unavailable only when their authority read is unavailable", () => {
    const snapshot = loadRetrievalSources({
      articles: [retrievalArticle()],
      reusable: { status: "available", contexts: [], issues: [] },
    });
    expect(snapshot.unavailableFamilies).toContain("resolved-ticket");
  });

  it("includes a customer-confirmed outcome only when linked operational history proves closure", () => {
    const ticketId = "TKT-0001";
    const diagnosisAudit = AuditEventSchema.parse({
      id: "20000000-0000-4000-8000-000000000001",
      timestamp: "2026-09-12T10:00:00.000Z",
      actor: "support",
      action: "diagnosis-completed",
      ticketId,
      before: {},
      after: {
        sourceTicketRevision: 1,
        sourceConversationWatermark: { state: "none" },
        diagnosis: {
          status: "completed",
          causeType: "performance",
          customerSafeSummary: "The campaign editor was restored.",
          evidenceUsed: ["blank editor"],
          evidenceReferences: [],
          confidence: "confirmed",
          owner: "support",
          recommendedNextAction: "Apply the governed mitigation.",
          doNotSay: [],
        },
      },
      rationale: "Recorded diagnosis.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const diagnosis = {
      id: `diagnosis-${diagnosisAudit.id}`,
      ticketId,
      problem: "The campaign editor was restored.",
      symptoms: ["performance", "blank editor"],
      evidenceUsed: ["blank editor"],
      evidenceReferences: [],
      ownerTeam: "support",
      fixSteps: ["Apply the completed diagnosis next action through the governed support workflow."],
      verificationSteps: ["Confirm the customer-safe outcome after the governed next action."],
      completedAt: diagnosisAudit.timestamp,
    };
    const base = {
      ticket: { id: ticketId, status: "resolved", revision: 1, updatedAt: "2026-09-12T10:02:00.000Z", customer: { name: "Maple Studio" } },
      audits: [diagnosisAudit],
      diagnoses: [{ diagnosis, originalAudit: diagnosisAudit, operationalEventId: diagnosisAudit.id }],
    } as any;
    const event = (sequence: number, facts: Record<string, unknown>) => ({ id: sequence === 1 ? diagnosisAudit.id : "20000000-0000-4000-8000-000000000002", ticketId, sequence, occurredAt: sequence === 1 ? diagnosisAudit.timestamp : "2026-09-12T10:02:00.000Z", actor: "support", action: sequence === 1 ? "diagnosis-completed" : "ticket-updated", commandId: "30000000-0000-4000-8000-000000000001", facts });
    const confirmed = projectResolvedCase({ ...base, events: [event(1, { status: "completed", sourceRevision: 1 }), event(2, { status: "resolved", verificationType: "customer-confirmed" })] });
    const unconfirmed = projectResolvedCase({ ...base, events: [event(1, { status: "completed", sourceRevision: 1 })] });
    expect(confirmed?.representations[0]?.semanticText).toContain("Customer confirmed resolution");
    expect(unconfirmed?.representations[0]?.semanticText).not.toContain("Customer confirmed resolution");
  });

  it("sanitizes every resolved-case projection field while retaining causal confidence and outcome", () => {
    const ticketId = "TKT-0002";
    const diagnosisAudit = AuditEventSchema.parse({
      id: "20000000-0000-4000-8000-000000000003",
      timestamp: "2026-09-12T10:00:00.000Z", actor: "support", action: "diagnosis-completed", ticketId,
      before: {}, after: { sourceTicketRevision: 1, sourceConversationWatermark: { state: "none" }, diagnosis: { status: "completed", causeType: "performance", customerSafeSummary: "The editor was restored.", evidenceUsed: ["maple studio saw a blank editor", "contact person@example.com", "Maple Studio account id=acct-123", "editor blank"], evidenceReferences: [], confidence: "confirmed", owner: "support", recommendedNextAction: "Apply mitigation.", doNotSay: [] } },
      rationale: "Recorded diagnosis.", knowledgeArticleIds: [], result: "success",
    });
    const diagnosis = { id: `diagnosis-${diagnosisAudit.id}`, ticketId, problem: "The editor was restored.", symptoms: ["performance", "maple studio saw a blank editor", "contact person@example.com", "Maple Studio account id=acct-123", "editor blank"], evidenceUsed: ["maple studio saw a blank editor", "contact person@example.com", "Maple Studio account id=acct-123", "editor blank"], evidenceReferences: [], ownerTeam: "support", fixSteps: ["Apply the completed diagnosis next action through the governed support workflow."], verificationSteps: ["Confirm the customer-safe outcome after the governed next action."], completedAt: diagnosisAudit.timestamp };
    const event = (sequence: number, facts: Record<string, unknown>) => ({ id: sequence === 1 ? diagnosisAudit.id : "20000000-0000-4000-8000-000000000004", ticketId, sequence, occurredAt: sequence === 1 ? diagnosisAudit.timestamp : "2026-09-12T10:02:00.000Z", actor: "support", action: sequence === 1 ? "diagnosis-completed" : "ticket-updated", commandId: "30000000-0000-4000-8000-000000000002", facts });
    const projected = projectResolvedCase({ ticket: { id: ticketId, status: "resolved", revision: 1, updatedAt: "2026-09-12T10:02:00.000Z", customer: { name: "Maple Studio" } }, audits: [diagnosisAudit], diagnoses: [{ diagnosis, originalAudit: diagnosisAudit, operationalEventId: diagnosisAudit.id }], events: [event(1, { status: "completed", sourceRevision: 1 }), event(2, { status: "resolved", verificationType: "customer-confirmed" })] } as any);

    const representation = projected?.representations[0];
    expect(representation?.semanticText).toContain("Diagnosis confidence: confirmed.");
    expect(representation?.semanticText).toContain("Verified outcome: Customer confirmed resolution after diagnosis.");
    expect(representation?.semanticText).not.toMatch(/maple studio|person@example\.com|acct-123/i);
    expect(representation?.keywords.join(" ")).not.toMatch(/maple studio|person@example\.com|acct-123/i);
  });
});
