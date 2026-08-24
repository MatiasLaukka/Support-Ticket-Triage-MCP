import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  auditEvaluationOracles,
  evaluationOracleFromExpectedOutcome,
  loadEvaluationOracles,
  scoreEvaluationOracle,
  scoreExpectedOutcomeCompatibility,
} from "../src/evaluation-oracle.js";
import {
  ExpectedOutcomeSchema,
  TicketSchema,
  TriageRecommendationSchema,
} from "../src/domain.js";
import { buildApprovalDeskRecommendationInput } from "../src/approval-desk/recommendation-builder.js";
import { evaluateRecommendationsAgainstOracles } from "../src/evaluation.js";

describe("evaluation oracle foundation", () => {
  it("maps a legacy ExpectedOutcome without changing its semantics", () => {
    const outcome = ExpectedOutcomeSchema.parse({
      ticketId: "TKT-1001",
      category: "incident",
      acceptablePriorities: ["P1"],
      team: "incident-response",
      requiredEscalations: ["outage", "sla"],
      knowledgeArticleIds: ["event-tracking-debugging"],
      duplicateGroup: "event-ingestion-delay",
    });

    expect(evaluationOracleFromExpectedOutcome(outcome)).toEqual({
      ticketId: "TKT-1001",
      classification: {
        acceptableCategories: ["incident"],
        acceptableTeams: ["incident-response"],
        acceptablePriorities: ["P1"],
        requiredEscalations: ["outage", "sla"],
      },
      knowledge: {
        requiredArticleIds: ["event-tracking-debugging"],
        relevantArticleIds: ["event-tracking-debugging"],
      },
      contrastGroup: "event-ingestion-delay",
      labelRationale: "Legacy ExpectedOutcome compatibility mapping.",
    });
    const actual = {
      category: "incident" as const,
      team: "incident-response" as const,
      priority: "P1" as const,
      requiredEscalations: ["outage", "sla"] as const,
      knowledgeArticleIds: ["event-tracking-debugging", "shopify-integration-sync", "extra-article"],
    };
    expect(scoreExpectedOutcomeCompatibility(outcome, actual).knowledgePass).toBe(false);
    expect(scoreEvaluationOracle(evaluationOracleFromExpectedOutcome(outcome), actual).knowledgePass).toBe(true);
  });

  it("scores acceptable labels and does not require merely relevant articles", async () => {
    const oracles = await loadEvaluationOracles();
    const oracle = oracles.find(({ ticketId }) => ticketId === "TKT-1017")!;

    const score = scoreEvaluationOracle(oracle, {
      category: "other",
      team: "support",
      priority: "P3",
      requiredEscalations: [],
      knowledgeArticleIds: ["sms-compliance"],
      knownCause: "sms-quiet-hours",
    });

    expect(oracle.classification.acceptableCategories).toEqual(["api", "other"]);
    expect(score).toMatchObject({
      classificationPass: true,
      knowledgePass: true,
      knownCausePass: true,
      all: true,
    });
  });

  it("distinguishes plausible, must-not-match, and insufficient-evidence causes", async () => {
    const oracles = await loadEvaluationOracles();
    const plausible = oracles.find(({ ticketId }) => ticketId === "TKT-1028")!;
    const mustNotMatch = oracles.find(({ ticketId }) => ticketId === "TKT-1005")!;
    const insufficient = oracles.find(({ ticketId }) => ticketId === "TKT-1010")!;

    expect(scoreEvaluationOracle(plausible, {
      category: "integration", team: "integrations", priority: "P2",
      requiredEscalations: [], knowledgeArticleIds: ["webhook-signature-validation"],
      knownCause: "webhook-delivery-latency",
    }).knownCausePass).toBe(true);
    expect(scoreEvaluationOracle(mustNotMatch, {
      category: "integration", team: "integrations", priority: "P2",
      requiredEscalations: ["policy-conflict"], knowledgeArticleIds: ["flow-trigger-troubleshooting"],
      knownCause: "sms-quiet-hours",
    }).knownCausePass).toBe(false);
    expect(scoreEvaluationOracle({
      ...mustNotMatch,
      knownCause: { expectation: "must-not-match" },
    }, {
      category: "integration", team: "integrations", priority: "P2",
      requiredEscalations: ["policy-conflict"], knowledgeArticleIds: ["flow-trigger-troubleshooting"],
      knownCause: "sms-quiet-hours",
    }).knownCausePass).toBe(false);
    expect(scoreEvaluationOracle(insufficient, {
      category: "performance", team: "product", priority: "P3",
      requiredEscalations: [], knowledgeArticleIds: [], knownCause: null,
    }).knownCausePass).toBe(true);
  });

  it("audits coverage and emits deterministic duplicate and ambiguity summaries", async () => {
    const oracles = await loadEvaluationOracles();
    const first = auditEvaluationOracles(oracles);
    const second = auditEvaluationOracles([...oracles].reverse());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      scenarioCount: 5,
      ambiguousClassificationCount: 3,
      missingRationales: [],
    });
    expect(first.duplicateHeavyGroups).toEqual([]);
  });

  it("keeps the oracle fixture file network-free and parseable as the published contract", async () => {
    const raw = JSON.parse(await readFile(resolve("data/seed/evaluation-oracles.json"), "utf8")) as unknown[];
    expect(raw).toHaveLength(5);
    expect(raw.every((entry) => typeof entry === "object" && entry !== null)).toBe(true);
  });

  it("scores recommendations through the oracle boundary without changing legacy evaluation", async () => {
    const tickets = TicketSchema.array().parse(
      JSON.parse(await readFile(resolve("data/seed/tickets.json"), "utf8")),
    );
    const ticket = tickets.find(({ id }) => id === "TKT-1001")!;
    const outcome = ExpectedOutcomeSchema.array().parse(
      JSON.parse(await readFile(resolve("data/seed/expected-outcomes.json"), "utf8")),
    ).find(({ ticketId }) => ticketId === ticket.id)!;
    const { actor: _actor, ...input } = buildApprovalDeskRecommendationInput({ ticket, outcome, actor: "evaluation-oracle-test" });
    const recommendation = TriageRecommendationSchema.parse({
      ...input,
      id: "00000000-0000-4000-8000-000000000001",
      resolution: "pending",
      createdAt: ticket.updatedAt,
    });
    const oracle = (await loadEvaluationOracles()).find(({ ticketId }) => ticketId === ticket.id)!;

    expect(evaluateRecommendationsAgainstOracles([recommendation], [oracle])).toMatchObject({
      ticketCount: 1,
      classificationAccuracy: 1,
      knowledgeRequiredCoverage: 1,
      passedScenarioCount: 1,
    });
  });
});
