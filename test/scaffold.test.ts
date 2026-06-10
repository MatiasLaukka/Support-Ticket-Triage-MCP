import { describe, expect, it } from "vitest";
import { TicketIdSchema } from "../src/domain.js";

describe("TicketIdSchema", () => {
  it("accepts support ticket IDs", () => {
    expect(TicketIdSchema.parse("TKT-1001")).toBe("TKT-1001");
  });

  it.each([
    "TKT-100",
    "tkt-1001",
    "ABC-1001",
    "TKT-10010",
    "TKT-1001-extra",
  ])("rejects invalid support ticket ID %s", (ticketId) => {
    expect(TicketIdSchema.safeParse(ticketId).success).toBe(false);
  });
});
