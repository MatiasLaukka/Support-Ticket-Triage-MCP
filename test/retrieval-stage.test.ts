import { describe, expect, it } from "vitest";
import { buildRetrievalQuery } from "../src/retrieval/stage.js";

describe("retrieval stage", () => {
  it("builds customer-only deterministic queries and hashes reply identities", () => {
    const ticket = { id: "TKT-0001", updatedAt: "2026-01-01T00:00:00.000Z", subject: "Webhook delayed", description: "Delivery is late", status: "open" } as any;
    const base = buildRetrievalQuery({ ticket, customerReplies: [{ id: "r1", ticketId: ticket.id, createdAt: "2026-01-01T01:00:00.000Z", body: "Still delayed" }], customerReplyWatermark: "reply:r1", references: [], taxonomy: { productSurfaces: ["webhooks"], problemClasses: ["latency"] } });
    const changed = buildRetrievalQuery({ ticket, customerReplies: [{ id: "r2", ticketId: ticket.id, createdAt: "2026-01-01T01:00:00.000Z", body: "Still delayed" }], customerReplyWatermark: "reply:r1", references: [] });
    expect(base.queryText).toContain("Still delayed");
    expect(base.queryText).not.toContain("support response");
    expect(base.queryHash).not.toBe(changed.queryHash);
  });
});
