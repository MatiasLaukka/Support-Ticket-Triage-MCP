import { describe, expect, it } from "vitest";
import { DomainError } from "../src/errors.js";
import {
  findEvidenceRequirement,
  isEvidenceRequirementId,
  requireEvidenceRequirement,
} from "../src/evidence-catalog.js";

describe("evidence catalog", () => {
  it("registers request-id as an active evidence requirement", () => {
    expect(findEvidenceRequirement("request-id")).toMatchObject({
      id: "request-id",
      status: "active",
      label: "Request ID",
      customerQuestion: "request ID if available",
      aliases: ["request id", "api request"],
    });
    expect(isEvidenceRequirementId("request-id")).toBe(true);
  });

  it("returns undefined for an unknown evidence requirement", () => {
    expect(findEvidenceRequirement("unknown-evidence")).toBeUndefined();
    expect(isEvidenceRequirementId("unknown-evidence")).toBe(false);
  });

  it("throws a domain error when required evidence is unknown", () => {
    expect(() => requireEvidenceRequirement("unknown-evidence")).toThrow(DomainError);
  });
});
