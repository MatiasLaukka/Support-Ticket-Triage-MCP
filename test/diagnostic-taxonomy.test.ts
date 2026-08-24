import { describe, expect, it } from "vitest";
import {
  DiagnosticTaxonomyContextSchema,
  ProductSurfaceSchema,
  ProblemClassSchema,
} from "../src/diagnostic-taxonomy.js";


describe("diagnostic taxonomy", () => {
  it("accepts a valid domain-specific product surface", () => {
    expect(ProductSurfaceSchema.parse({
      domain: "integrations",
      area: "shopify",
    })).toEqual({
      domain: "integrations",
      area: "shopify",
    });
  });

  it("rejects an area that does not belong to the selected domain", () => {
    expect(() => ProductSurfaceSchema.parse({
      domain: "billing",
      area: "webhooks",
    })).toThrow();
  });

  it("does not model insufficient evidence as a problem class", () => {
    expect(ProblemClassSchema.safeParse("insufficient-evidence").success).toBe(false);
  });
});

it("rejects the primary surface when it is repeated as a secondary surface", () => {
  expect(() =>
    DiagnosticTaxonomyContextSchema.parse({
      primaryProductSurface: {
        domain: "integrations",
        area: "shopify",
      },
      secondaryProductSurfaces: [
        {
          domain: "integrations",
          area: "shopify",
        },
      ],
      problemClasses: ["data-integrity"],
      confidence: {
        productSurface: 0.8,
        problemClass: 0.7,
      },
      basis: {
        source: "initial-classification",
        evidenceIds: [],
        knowledgeArticleIds: [],
        playbookIds: [],
        knownCauseIds: [],
        explanation: "Initial advisory taxonomy.",
      },
    }),
  ).toThrow();
});


it("accepts null primary surface with no secondary surfaces", () => {
  expect(
    DiagnosticTaxonomyContextSchema.parse({
      primaryProductSurface: null,
      secondaryProductSurfaces: [],
      problemClasses: [],
      confidence: {
        productSurface: 0,
        problemClass: 0,
      },
      basis: {
        source: "initial-classification",
        evidenceIds: [],
        knowledgeArticleIds: [],
        playbookIds: [],
        knownCauseIds: [],
        explanation: "Not enough evidence to localize the problem yet.",
      },
    }),
  ).toBeDefined();
});

it("accepts distinct secondary product surfaces", () => {
  expect(
    DiagnosticTaxonomyContextSchema.parse({
      primaryProductSurface: {
        domain: "integrations",
        area: "shopify",
      },
      secondaryProductSurfaces: [
        {
          domain: "catalog",
          area: "field-mapping",
        },
      ],
      problemClasses: ["data-integrity"],
      confidence: {
        productSurface: 0.8,
        problemClass: 0.7,
      },
      basis: {
        source: "initial-classification",
        evidenceIds: [],
        knowledgeArticleIds: [],
        playbookIds: [],
        knownCauseIds: [],
        explanation: "Shopify data is present but field mapping may also be involved.",
      },
    }),
  ).toBeDefined();
});

it("rejects duplicate secondary product surfaces", () => {
  expect(() =>
    DiagnosticTaxonomyContextSchema.parse({
      primaryProductSurface: {
        domain: "integrations",
        area: "shopify",
      },
      secondaryProductSurfaces: [
        {
          domain: "catalog",
          area: "field-mapping",
        },
        {
          domain: "catalog",
          area: "field-mapping",
        },
      ],
      problemClasses: ["data-integrity"],
      confidence: {
        productSurface: 0.8,
        problemClass: 0.7,
      },
      basis: {
        source: "initial-classification",
        evidenceIds: [],
        knowledgeArticleIds: [],
        playbookIds: [],
        knownCauseIds: [],
        explanation: "Duplicate secondary surfaces are invalid.",
      },
    }),
  ).toThrow();
});

it("rejects the primary product surface when repeated as a secondary surface", () => {
  expect(() =>
    DiagnosticTaxonomyContextSchema.parse({
      primaryProductSurface: {
        domain: "integrations",
        area: "shopify",
      },
      secondaryProductSurfaces: [
        {
          domain: "integrations",
          area: "shopify",
        },
      ],
      problemClasses: ["data-integrity"],
      confidence: {
        productSurface: 0.8,
        problemClass: 0.7,
      },
      basis: {
        source: "initial-classification",
        evidenceIds: [],
        knowledgeArticleIds: [],
        playbookIds: [],
        knownCauseIds: [],
        explanation: "Primary and secondary surfaces must not duplicate each other.",
      },
    }),
  ).toThrow();
});

it("rejects duplicate problem classes", () => {
  expect(() =>
    DiagnosticTaxonomyContextSchema.parse({
      primaryProductSurface: {
        domain: "customer-data",
        area: "profiles",
      },
      secondaryProductSurfaces: [],
      problemClasses: ["data-integrity", "data-integrity"],
      confidence: {
        productSurface: 0.8,
        problemClass: 0.8,
      },
      basis: {
        source: "initial-classification",
        evidenceIds: [],
        knowledgeArticleIds: [],
        playbookIds: [],
        knownCauseIds: [],
        explanation: "Problem classes must be unique.",
      },
    }),
  ).toThrow();
});

it("rejects confidence outside the 0 to 1 range", () => {
  expect(() =>
    DiagnosticTaxonomyContextSchema.parse({
      primaryProductSurface: {
        domain: "messaging",
        area: "sms",
      },
      secondaryProductSurfaces: [],
      problemClasses: ["configuration"],
      confidence: {
        productSurface: 1.1,
        problemClass: -0.1,
      },
      basis: {
        source: "initial-classification",
        evidenceIds: [],
        knowledgeArticleIds: [],
        playbookIds: [],
        knownCauseIds: [],
        explanation: "Confidence must stay within the normalized range.",
      },
    }),
  ).toThrow();
});