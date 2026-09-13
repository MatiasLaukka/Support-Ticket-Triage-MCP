import { describe, expect, it } from "vitest";
import { cosine, makeFtsQuery, retrieve } from "../src/retrieval/search.js";
import { RetrievalStore } from "../src/retrieval/sqlite-store.js";
import { hashRepresentation, hashResource, projectArticle } from "../src/retrieval/representations.js";
import { projectResolvedCase } from "../src/retrieval/sources.js";
import { AuditEventSchema } from "../src/domain.js";
import { EmbeddingProviderError } from "../src/retrieval/embedding-provider.js";

describe("retrieval search", () => {
  it("quotes literal FTS tokens and computes exact cosine", () => {
    expect(makeFtsQuery('webhook OR "secret"')).toBe('"webhook" OR "or" OR "secret"');
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("searches compatible vectors while changed representations remain pending", async () => {
    const store = RetrievalStore.open(":memory:");
    const model = { id: "test", revision: "1", dimensions: 2 };
    const stable = projectArticle({ id: "stable", title: "Stable", tags: [], body: "stable semantic match" });
    const oldChanged = projectArticle({ id: "changed", title: "Changed", tags: [], body: "old value" });
    const changed = projectArticle({ id: "changed", title: "Changed", tags: [], body: "new value" });
    store.reconcile({ resources: [stable, oldChanged], unavailableFamilies: [] });
    store.configureModel(model);
    store.installVectors([stable, oldChanged].map((item) => ({ representationId: item.representations[0]!.id, resourceKey: item.resource.key, contentHash: item.representations[0]!.contentHash, model, values: item === stable ? [1, 0] : [0, 1] })));
    store.reconcile({ resources: [stable, changed], unavailableFamilies: [] });
    const result = await retrieve({ query: { queryText: "stable", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, store, provider: { model, embed: async () => [[1, 0]] }, limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } }, signal: new AbortController().signal });
    expect(result.semantic).toMatchObject({ status: "stale", reason: "pending-vectors" });
    expect(result.candidates.find(({ resourceKey }) => resourceKey === stable.resource.key)?.semantic).toBeDefined();
    store.close();
  });

  it("preserves safe provider failure provenance", async () => {
    const store = RetrievalStore.open(":memory:");
    const article = projectArticle({ id: "provider", title: "Provider", tags: [], body: "provider failure" });
    store.reconcile({ resources: [article], unavailableFamilies: [] });
    const model = { id: "test", revision: "1", dimensions: 2 };
    store.configureModel(model);
    store.installVectors([{ representationId: article.representations[0]!.id, resourceKey: article.resource.key, contentHash: article.representations[0]!.contentHash, model, values: [1, 0] }]);
    const result = await retrieve({ query: { queryText: "provider", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, store, provider: { model, embed: async () => { throw new EmbeddingProviderError("PROVIDER_HTTP_ERROR", "safe"); } }, limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } }, signal: new AbortController().signal });
    expect(result.semantic).toEqual({ status: "failed", reason: "provider-http-error" });
    store.close();
  });

  it("aggregates several matching chunks into one article and preserves references", async () => {
    const store = RetrievalStore.open(":memory:");
    store.initialize();
    const article = projectArticle({ id: "a", title: "Webhook guide", tags: [], body: "Webhook signing.\n\n## Rotation\n\nSecret rotation." });
    store.reconcile({ resources: [article], unavailableFamilies: [] });
    const result = await retrieve({ query: { queryText: "webhook secret", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [{ resourceKey: "knowledge-article:a", channel: "deterministic-reference", sourceId: "a", reason: "classifier-association" }] }, store, limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } }, signal: new AbortController().signal });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.lexical?.matches.length).toBe(2);
    expect(result.candidates[0]!.deterministicReferences).toHaveLength(1);
    store.close();
  });

  it("excludes the ticket's own resolved-case memory from its query", async () => {
    const store = RetrievalStore.open(":memory:");
    store.initialize();
    const resolved = projectArticle({ id: "self", title: "Webhook resolved", tags: [], body: "Webhook secret rotation resolved." });
    const resource = { key: "resolved-ticket:TKT-0001" as const, type: "resolved-ticket" as const, sourceId: "TKT-0001", family: "resolved-ticket" as const, linkedResourceKeys: [] as const };
    const representations = resolved.representations.map((representation) => {
      const canonical = { ...representation, id: "resolved-ticket:TKT-0001:canonical:0", resourceKey: resource.key, kind: "canonical", ordinal: 0 };
      return { ...canonical, contentHash: hashRepresentation(canonical) };
    });
    const projected = { resource: { ...resource, contentHash: hashResource(resource, representations) }, representations };
    store.reconcile({ resources: [projected], unavailableFamilies: [] });
    const result = await retrieve({
      query: { queryText: "webhook secret", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] },
      store,
      limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } },
      signal: new AbortController().signal,
    });
    expect(result.candidates).toHaveLength(0);
    store.close();
  });

  it("retrieves a causally eligible historical resolved case but not the querying ticket itself", async () => {
    const ticketId = "TKT-9001";
    const diagnosisAudit = AuditEventSchema.parse({
      id: "20000000-0000-4000-8000-000000000901", timestamp: "2026-09-12T10:00:00.000Z", actor: "support", action: "diagnosis-completed", ticketId,
      before: {}, after: { sourceTicketRevision: 1, sourceConversationWatermark: { state: "none" }, diagnosis: { status: "completed", causeType: "performance", customerSafeSummary: "Campaign editor browser-session issue.", evidenceUsed: ["private window works"], evidenceReferences: [], confidence: "confirmed", owner: "support", recommendedNextAction: "Clear the affected browser session.", doNotSay: [] } }, rationale: "Recorded diagnosis.", knowledgeArticleIds: [], result: "success",
    });
    const projected = projectResolvedCase({
      ticket: { id: ticketId, status: "resolved", revision: 1, updatedAt: "2026-09-12T10:02:00.000Z", customer: { name: "Synthetic historical case" } },
      audits: [diagnosisAudit],
      diagnoses: [{ diagnosis: { id: `diagnosis-${diagnosisAudit.id}`, ticketId, problem: "Campaign editor browser-session issue.", symptoms: ["performance", "private window works"], evidenceUsed: ["private window works"], evidenceReferences: [], ownerTeam: "support", fixSteps: ["Apply the completed diagnosis next action through the governed support workflow."], verificationSteps: ["Confirm the customer-safe outcome after the governed next action."], completedAt: diagnosisAudit.timestamp }, originalAudit: diagnosisAudit, operationalEventId: diagnosisAudit.id }],
      events: [
        { id: diagnosisAudit.id, ticketId, sequence: 1, occurredAt: diagnosisAudit.timestamp, actor: "support", action: "diagnosis-completed", commandId: "30000000-0000-4000-8000-000000000901", facts: { status: "completed", sourceRevision: 1 } },
        { id: "20000000-0000-4000-8000-000000000902", ticketId, sequence: 2, occurredAt: "2026-09-12T10:02:00.000Z", actor: "support", action: "ticket-updated", commandId: "30000000-0000-4000-8000-000000000902", facts: { status: "resolved", verificationType: "customer-confirmed" } },
      ],
    } as any);
    expect(projected).toBeDefined();
    const store = RetrievalStore.open(":memory:");
    store.initialize();
    store.reconcile({ resources: [projected!], unavailableFamilies: [] });

    const result = await retrieve({ query: { queryText: "campaign editor private browser session", queryHash: "q", ticketId: "TKT-9002", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] }, store, limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } }, signal: new AbortController().signal });
    expect(result.candidates.map(({ resourceKey }) => resourceKey)).toContain(`resolved-ticket:${ticketId}`);
    store.close();
  });

  it("reports partial semantic coverage as stale while searching compatible vectors", async () => {
    const store = RetrievalStore.open(":memory:");
    store.initialize();
    const first = projectArticle({ id: "first", title: "First", tags: [], body: "Webhook signing" });
    const second = projectArticle({ id: "second", title: "Second", tags: [], body: "Webhook rotation" });
    store.reconcile({ resources: [first, second], unavailableFamilies: [] });
    const model = { id: "test", revision: "1", dimensions: 2 };
    store.configureModel(model);
    store.installVectors([{ representationId: first.representations[0]!.id, resourceKey: first.resource.key, contentHash: first.representations[0]!.contentHash, model, values: [1, 0] }]);
    let calls = 0;

    const result = await retrieve({
      query: { queryText: "webhook", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [] },
      store,
      provider: { model, embed: async () => { calls += 1; return [[1, 0]]; } },
      limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } },
      signal: new AbortController().signal,
    });

    expect(result.lexical.status).toBe("used");
    expect(result.semantic).toEqual({ status: "stale", reason: "pending-vectors" });
    expect(calls).toBe(1);
    expect(result.candidates.find(({ resourceKey }) => resourceKey === first.resource.key)?.semantic).toBeDefined();
    store.close();
  });

  it("records a bounded diagnostic for an explicit reference missing from the snapshot", async () => {
    const store = RetrievalStore.open(":memory:");
    store.initialize();
    const result = await retrieve({
      query: { queryText: "webhook", queryHash: "q", ticketId: "TKT-0001", sourceRevision: 1, customerReplyWatermark: "none", queryTruncated: false, references: [{ resourceKey: "knowledge-article:missing", channel: "deterministic-reference", sourceId: "missing", reason: "classifier-association" }] },
      store,
      limits: { "knowledge-article": { lexical: 5, semantic: 5 }, "known-cause": { lexical: 5, semantic: 5 }, "diagnostic-playbook": { lexical: 5, semantic: 5 }, "resolved-ticket": { lexical: 5, semantic: 5 } },
      signal: new AbortController().signal,
    });

    expect((result as any).referenceDiagnostics).toEqual([{ resourceKey: "knowledge-article:missing", channel: "deterministic-reference", reason: "missing-resource" }]);
    store.close();
  });
});
