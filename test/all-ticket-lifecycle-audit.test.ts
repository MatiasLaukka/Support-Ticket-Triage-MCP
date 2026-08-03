import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TicketSchema } from "../src/domain.js";
import { loadExpectedOutcomes } from "../src/approval-desk/recommendation-builder.js";
import { auditSeedTicketLifecycles } from "../src/approval-desk/all-ticket-lifecycle-audit.js";

describe("all-ticket lifecycle audit", () => {
  it("audits every seeded ticket without treating the focused snapshots as full coverage", async () => {
    const tickets = TicketSchema.array().parse(
      JSON.parse(await readFile(resolve("data/seed/tickets.json"), "utf8")),
    );
    const outcomes = await loadExpectedOutcomes(
      resolve("data/seed/expected-outcomes.json"),
    );

    const report = auditSeedTicketLifecycles(tickets, outcomes);

    expect(report.ticketCount).toBe(30);
    expect(report.observations).toHaveLength(30);
    expect(report.observations.map(({ ticketId }) => ticketId)).toEqual(
      expect.arrayContaining(["TKT-1001", "TKT-1017", "TKT-1024", "TKT-1030"]),
    );
    expect(report.observations.find(({ ticketId }) => ticketId === "TKT-1017")).toMatchObject({
      knownCause: "sms-quiet-hours",
      supportState: "known-cause",
      diagnosisOutcome: "confirmed",
    });
    expect(report.observations.find(({ ticketId }) => ticketId === "TKT-1024")).toMatchObject({
      seedStatus: "resolved",
      operatorNextAction: "none",
      supportState: "ready-for-close",
      missingEvidence: [],
    });
  });
});
