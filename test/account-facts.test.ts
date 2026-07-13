import { describe, expect, it } from "vitest";
import { TicketSchema } from "../src/domain.js";
import { extractAccountFacts } from "../src/approval-desk/account-facts.js";

describe("extractAccountFacts", () => {
  it("normalizes reusable customer, requester, platform, and URL facts", () => {
    const ticket = TicketSchema.parse({
      id: "TKT-9001",
      createdAt: "2026-06-10T08:00:00.000Z",
      updatedAt: "2026-06-10T08:00:00.000Z",
      customer: {
        name: "Delta Research",
        plan: "enterprise",
        region: "eu-west",
        vip: false,
      },
      requester: {
        name: "Maya Chen",
        role: "Ecommerce Manager",
        department: "Marketing",
        technicalLevel: "technical",
        seniority: "manager",
      },
      subject: "Catalog sync is delayed",
      description:
        "Our Shopify store https://delta-research.store has not synced products today.",
      status: "triage",
      category: "integration",
      priority: "P2",
      team: "integrations",
      tags: ["shopify", "catalog"],
      sla: {
        responseDueAt: "2026-06-10T10:00:00.000Z",
        breached: false,
      },
      relatedTicketIds: [],
      revision: 0,
    });

    expect(extractAccountFacts(ticket)).toMatchObject({
      customerName: "Delta Research",
      plan: "enterprise",
      region: "eu-west",
      requesterRole: "Ecommerce Manager",
      requesterTechnicalLevel: "technical",
      ecommercePlatform: "Shopify",
      storeUrls: ["https://delta-research.store"],
    });
  });
});
