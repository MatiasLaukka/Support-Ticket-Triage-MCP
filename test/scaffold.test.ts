import { describe, expect, it } from "vitest";
import { TicketIdSchema } from "../src/domain.js";

describe("TicketIdSchema", () => {
  it("accepts support ticket IDs", () => {
    expect(TicketIdSchema.parse("TKT-1001")).toBe("TKT-1001");
  });
});
