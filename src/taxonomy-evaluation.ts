import {
  scoreTaxonomyOracle,
  type EvaluationOracle,
} from "./evaluation-oracle.js";

import type {
  TaxonomyInferenceCandidate,
} from "./taxonomy-inference.js";

export type TaxonomyEvaluationLane =
  | "deterministic"
  | "gpt";

export type TaxonomyLaneEvaluationOutcome =
  | {
      status: "candidate";
      candidate: TaxonomyInferenceCandidate;
    }
  | {
      status: "provider-unavailable";
      reason: "http" | "timeout";
      statusCode: number | null;
    }
  | {
      status: "rejected-taxonomy";
      stage:
        | "reasoning-json"
        | "reasoning-fields";
      fields: readonly string[];
    };

export interface TaxonomyLaneEvaluationCase {
  ticketId: string;

  expectation: NonNullable<
    EvaluationOracle["taxonomy"]
  >;

  outcome: TaxonomyLaneEvaluationOutcome;
}

export interface ScoredTaxonomyLaneEvaluationResult {
  ticketId: string;
  status: "scored";

  primarySurfacePass: boolean;
  problemClassPass: boolean;
  taxonomyPass: boolean;
  abstained: boolean;
}

export interface UnavailableTaxonomyLaneEvaluationResult {
  ticketId: string;
  status: "provider-unavailable";
  reason: "http" | "timeout";
  statusCode: number | null;
}

export interface RejectedTaxonomyLaneEvaluationResult {
  ticketId: string;
  status: "rejected-taxonomy";
  stage:
    | "reasoning-json"
    | "reasoning-fields";
  fields: readonly string[];
}

export type TaxonomyLaneEvaluationResult =
  | ScoredTaxonomyLaneEvaluationResult
  | UnavailableTaxonomyLaneEvaluationResult
  | RejectedTaxonomyLaneEvaluationResult;

export interface TaxonomyLaneEvaluationReport {
  lane: TaxonomyEvaluationLane;

  evaluatedCaseCount: number;

  primarySurfaceAccuracy: number | null;
  problemClassAccuracy: number | null;
  fullTaxonomyAccuracy: number | null;
  abstentionRate: number | null;

  results: readonly TaxonomyLaneEvaluationResult[];
}

export function evaluateTaxonomyLane(input: {
  lane: TaxonomyEvaluationLane;
  cases: readonly TaxonomyLaneEvaluationCase[];
}): TaxonomyLaneEvaluationReport {
  const results: TaxonomyLaneEvaluationResult[] =
    input.cases.map(
      ({
        ticketId,
        expectation,
        outcome,
      }) => {
        if (outcome.status === "provider-unavailable") {
          return {
            ticketId,
            status: outcome.status,
            reason: outcome.reason,
            statusCode: outcome.statusCode,
          };
        }

        if (outcome.status === "rejected-taxonomy") {
          return {
            ticketId,
            status: outcome.status,
            stage: outcome.stage,
            fields: outcome.fields,
          };
        }

        const score =
          scoreTaxonomyOracle(
            expectation,
            outcome.candidate,
          );

        return {
          ticketId,
          status: "scored" as const,
          ...score,
        };
      },
    );

  const scoredResults =
    results.filter(
      (
        result,
      ): result is ScoredTaxonomyLaneEvaluationResult =>
        result.status === "scored",
    );

  const evaluatedCaseCount =
    scoredResults.length;

  const hasScoredCases =
    evaluatedCaseCount > 0;

  return {
    lane: input.lane,

    evaluatedCaseCount,

    primarySurfaceAccuracy:
        hasScoredCases
            ? scoredResults.filter(
                ({ primarySurfacePass }) =>
                primarySurfacePass,
            ).length / evaluatedCaseCount
            : null,

    problemClassAccuracy:
        hasScoredCases
            ? scoredResults.filter(
                ({ problemClassPass }) =>
                problemClassPass,
            ).length / evaluatedCaseCount
            : null,

    fullTaxonomyAccuracy:
        hasScoredCases
            ? scoredResults.filter(
                ({ taxonomyPass }) =>
                taxonomyPass,
            ).length / evaluatedCaseCount
            : null,

    abstentionRate:
        hasScoredCases
            ? scoredResults.filter(
                ({ abstained }) =>
                abstained,
            ).length / evaluatedCaseCount
            : null,

    results,
  };
}