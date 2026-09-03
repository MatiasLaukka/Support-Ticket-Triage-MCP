import { describe, expect, it } from "vitest";

import {
  evaluateTaxonomyLane,
} from "../src/taxonomy-evaluation.js";

import {
  TaxonomyInferenceCandidateSchema,
} from "../src/taxonomy-inference.js";

import type {
  EvaluationOracle,
} from "../src/evaluation-oracle.js";

describe("taxonomy lane evaluation", () => {
  it("aggregates taxonomy dimensions while retaining per-ticket scores", () => {
    const firstExpectation: NonNullable<
      EvaluationOracle["taxonomy"]
    > = {
      acceptablePrimaryProductSurfaces: [
        {
          domain: "messaging",
          area: "sms",
        },
      ],
      acceptableProblemClasses: [
        "expected-behavior",
      ],
    };

    const secondExpectation: NonNullable<
      EvaluationOracle["taxonomy"]
    > = {
      acceptablePrimaryProductSurfaces: [
        {
          domain: "customer-data",
          area: "consent",
        },
      ],
      acceptableProblemClasses: [
        "data-integrity",
      ],
    };

    const correctCandidate =
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: {
          domain: "messaging",
          area: "sms",
        },
        secondaryProductSurfaces: [],
        problemClasses: [
          "expected-behavior",
        ],
      });

    const abstainingCandidate =
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: null,
        secondaryProductSurfaces: [],
        problemClasses: [
          "data-integrity",
        ],
      });

    const report = evaluateTaxonomyLane({
      lane: "deterministic",

      cases: [
        {
          ticketId: "TKT-A",
          expectation: firstExpectation,
          outcome: {
            status: "candidate",
            candidate: correctCandidate,
          },
        },
        {
          ticketId: "TKT-B",
          expectation: secondExpectation,
          outcome: {
            status: "candidate",
            candidate: abstainingCandidate,
          },
        },
      ],
    });

    expect(report).toEqual({
      lane: "deterministic",

      evaluatedCaseCount: 2,

      primarySurfaceAccuracy: 0.5,
      problemClassAccuracy: 1,
      fullTaxonomyAccuracy: 0.5,
      abstentionRate: 0.5,

      results: [
        {
          ticketId: "TKT-A",
          status: "scored",
          expected: firstExpectation,
          actual: correctCandidate,
          primarySurfacePass: true,
          problemClassPass: true,
          taxonomyPass: true,
          abstained: false,
        },
        {
          ticketId: "TKT-B",
          status: "scored",
          expected: secondExpectation,
          actual: abstainingCandidate,
          primarySurfacePass: false,
          problemClassPass: true,
          taxonomyPass: false,
          abstained: true,
        },
      ],
    });
  });

  it("retains unavailable and rejected attempts without adding them to the accuracy denominator", () => {
    const expectation: NonNullable<
        EvaluationOracle["taxonomy"]
    > = {
        acceptablePrimaryProductSurfaces: [
        {
            domain: "messaging",
            area: "sms",
        },
        ],
        acceptableProblemClasses: [
        "expected-behavior",
        ],
    };

    const correctCandidate =
        TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: {
            domain: "messaging",
            area: "sms",
        },
        secondaryProductSurfaces: [],
        problemClasses: [
            "expected-behavior",
        ],
        });

    const report = evaluateTaxonomyLane({
        lane: "gpt",

        cases: [
        {
            ticketId: "TKT-SCORED",
            expectation,
            outcome: {
            status: "candidate",
            candidate: correctCandidate,
            },
        },

        {
            ticketId: "TKT-UNAVAILABLE",
            expectation,
            outcome: {
            status: "provider-unavailable",
            reason: "timeout",
            statusCode: null,
            },
        },

        {
            ticketId: "TKT-REJECTED",
            expectation,
            outcome: {
            status: "rejected-taxonomy",
            stage: "reasoning-fields",
            fields: [
                "primaryProductSurface.area",
            ],
            },
        },
        ],
    });

    expect(report.evaluatedCaseCount).toBe(1);

    expect(report.primarySurfaceAccuracy).toBe(1);
    expect(report.problemClassAccuracy).toBe(1);
    expect(report.fullTaxonomyAccuracy).toBe(1);
    expect(report.abstentionRate).toBe(0);

    expect(report.results).toEqual([
        {
        ticketId: "TKT-SCORED",
        status: "scored",
        expected: expectation,
        actual: correctCandidate,
        primarySurfacePass: true,
        problemClassPass: true,
        taxonomyPass: true,
        abstained: false,
        },

        {
        ticketId: "TKT-UNAVAILABLE",
        status: "provider-unavailable",
        reason: "timeout",
        statusCode: null,
        },

        {
        ticketId: "TKT-REJECTED",
        status: "rejected-taxonomy",
        stage: "reasoning-fields",
        fields: [
            "primaryProductSurface.area",
        ],
        },
    ]);
});
  it("reports null metrics when no taxonomy candidates were scored", () => {
    const expectation: NonNullable<
        EvaluationOracle["taxonomy"]
    > = {
        acceptablePrimaryProductSurfaces: [
        {
            domain: "messaging",
            area: "sms",
        },
        ],
        acceptableProblemClasses: [
        "expected-behavior",
        ],
    };

    const report = evaluateTaxonomyLane({
        lane: "gpt",

        cases: [
        {
            ticketId: "TKT-TIMEOUT",
            expectation,
            outcome: {
            status: "provider-unavailable",
            reason: "timeout",
            statusCode: null,
            },
        },

        {
            ticketId: "TKT-INVALID",
            expectation,
            outcome: {
            status: "rejected-taxonomy",
            stage: "reasoning-json",
            fields: [],
            },
        },
        ],
    });

    expect(report.evaluatedCaseCount).toBe(0);

    expect(report.primarySurfaceAccuracy).toBeNull();
    expect(report.problemClassAccuracy).toBeNull();
    expect(report.fullTaxonomyAccuracy).toBeNull();
    expect(report.abstentionRate).toBeNull();

    expect(report.results).toHaveLength(2);
  });
});
