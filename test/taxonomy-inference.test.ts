import { describe, expect, it } from "vitest";
import { TaxonomyInferenceCandidateSchema } from "../src/taxonomy-inference.js";

describe("TaxonomyInferenceCandidate", () => {
  it("accepts a semantic candidate without support or basis", () => {
    expect(
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: {
          domain: "customer-data",
          area: "consent",
        },
        secondaryProductSurfaces: [
          {
            domain: "messaging",
            area: "sms",
          },
        ],
        problemClasses: ["data-integrity"],
      }),
    ).toEqual({
      primaryProductSurface: {
        domain: "customer-data",
        area: "consent",
      },
      secondaryProductSurfaces: [
        {
          domain: "messaging",
          area: "sms",
        },
      ],
      problemClasses: ["data-integrity"],
    });
  });

  it("allows primary product-surface abstention", () => {
    expect(
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: null,
        secondaryProductSurfaces: [],
        problemClasses: [],
      }),
    ).toEqual({
      primaryProductSurface: null,
      secondaryProductSurfaces: [],
      problemClasses: [],
    });
  });

  it("rejects duplicate secondary surfaces", () => {
    expect(() =>
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: null,
        secondaryProductSurfaces: [
          { domain: "messaging", area: "sms" },
          { domain: "messaging", area: "sms" },
        ],
        problemClasses: [],
      }),
    ).toThrow(/Secondary product surfaces must be unique/i);
  });

  it("rejects the primary surface repeated as a secondary", () => {
    expect(() =>
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: { domain: "messaging", area: "sms" },
        secondaryProductSurfaces: [
          { domain: "messaging", area: "sms" },
        ],
        problemClasses: ["expected-behavior"],
      }),
    ).toThrow(/Primary product surface must not also appear/i);
  });

  it("rejects duplicate problem classes", () => {
    expect(() =>
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: { domain: "messaging", area: "sms" },
        secondaryProductSurfaces: [],
        problemClasses: ["expected-behavior", "expected-behavior"],
      }),
    ).toThrow(/Problem classes must be unique/i);
  });
});