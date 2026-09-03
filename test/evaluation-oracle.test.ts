import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  auditEvaluationOracles,
  EvaluationOracleSchema,
  evaluationOracleFromExpectedOutcome,
  loadEvaluationOracles,
  scoreEvaluationOracle,
  scoreExpectedOutcomeCompatibility,
  scoreTaxonomyOracle,
  type EvaluationOracle,
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

  it("scores matching diagnostic taxonomy expectations", () => {
    const oracle = EvaluationOracleSchema.parse({
      ticketId: "TKT-1017",
      classification: {
        acceptableCategories: ["other"],
        acceptableTeams: ["support"],
        acceptablePriorities: ["P3"],
        requiredEscalations: [],
      },
      knowledge: {
        requiredArticleIds: ["sms-compliance"],
        relevantArticleIds: [],
      },
      taxonomy: {
        acceptablePrimaryProductSurfaces: [
          {
            domain: "messaging",
            area: "sms",
          },
        ],
        acceptableProblemClasses: ["expected-behavior"],
      },
      knownCause: {
        expectation: "plausible",
      },
      labelRationale: "Reviewed SMS quiet-hours taxonomy.",
    });

    const score = scoreEvaluationOracle(oracle, {
      category: "other",
      team: "support",
      priority: "P3",
      requiredEscalations: [],
      knowledgeArticleIds: ["sms-compliance"],
      knownCause: "sms-quiet-hours",
      taxonomy: {
        primaryProductSurface: {
          domain: "messaging",
          area: "sms",
        },
        problemClasses: ["expected-behavior"],
      },
    });

    expect(score.taxonomyPass).toBe(true);
    expect(score.all).toBe(true);
  });

  it("accepts reviewed diagnostic taxonomy expectations", () => {
  const oracle = EvaluationOracleSchema.parse({
    ticketId: "TKT-1017",
    classification: {
      acceptableCategories: ["other"],
      acceptableTeams: ["support"],
      acceptablePriorities: ["P3"],
      requiredEscalations: [],
    },
    knowledge: {
      requiredArticleIds: ["sms-compliance"],
      relevantArticleIds: [],
    },
    taxonomy: {
      acceptablePrimaryProductSurfaces: [
        {
          domain: "messaging",
          area: "sms",
        },
      ],
      acceptableProblemClasses: ["expected-behavior"],
    },
    knownCause: {
      expectation: "plausible",
    },
    family: "sms-compliance",
    contrastGroup: "sms-quiet-hours",
    labelRationale:
      "Quiet-hours enforcement is an SMS behavior rather than a platform outage.",
  });

  expect(oracle.taxonomy).toEqual({
    acceptablePrimaryProductSurfaces: [
      {
        domain: "messaging",
        area: "sms",
      },
    ],
    acceptableProblemClasses: ["expected-behavior"],
  });
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
      taxonomy: {
        primaryProductSurface: {
          domain: "messaging",
          area: "sms",
        },
        problemClasses: ["expected-behavior"],
      },
    });

    expect(oracle.classification.acceptableCategories).toEqual(["other"]);
    expect(score).toMatchObject({
      classificationPass: true,
      knowledgePass: true,
      knownCausePass: true,
      taxonomyPass: true,
      all: true,
    });
  });

  it("fails taxonomy scoring when required taxonomy output is missing", () => {
    const oracle = EvaluationOracleSchema.parse({
      ticketId: "TKT-1017",
      classification: {
        acceptableCategories: ["other"],
        acceptableTeams: ["support"],
        acceptablePriorities: ["P3"],
        requiredEscalations: [],
      },
      knowledge: {
        requiredArticleIds: ["sms-compliance"],
        relevantArticleIds: [],
      },
      taxonomy: {
        acceptablePrimaryProductSurfaces: [
          { domain: "messaging", area: "sms" },
        ],
        acceptableProblemClasses: ["expected-behavior"],
      },
      labelRationale: "Reviewed SMS taxonomy.",
    });

    const score = scoreEvaluationOracle(oracle, {
      category: "other",
      team: "support",
      priority: "P3",
      requiredEscalations: [],
      knowledgeArticleIds: ["sms-compliance"],
    });

    expect(score.taxonomyPass).toBe(false);
    expect(score.all).toBe(false);
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
      scenarioCount: 22,
      ambiguousClassificationCount: 9,
      missingRationales: [],
    });
    expect(first.familyCoverage).toMatchObject({
      "campaign-processing": 2,
      "sms-compliance": 1,
      "consent-sync": 2,
    });
    expect(first.contrastGroupCoverage).toMatchObject({
      "campaign-processing-scope": 2,
      "sms-quiet-hours": 1,
      "webhook-delivery-delay": 2,
    });
    expect(first.duplicateHeavyGroups).toEqual([
      { contrastGroup: "campaign-processing-scope", count: 2, ticketIds: ["TKT-1009", "TKT-1021"] },
      { contrastGroup: "event-ingestion-delay", count: 2, ticketIds: ["TKT-1001", "TKT-1002"] },
      { contrastGroup: "webhook-delivery-delay", count: 2, ticketIds: ["TKT-1028", "TKT-1029"] },
    ]);
  });

  it("keeps exact reviewed labels while allowing multi-label reviewed ground truth", async () => {
    const oracles = await loadEvaluationOracles();
    const exact = oracles.find(({ ticketId }) => ticketId === "TKT-1015")!;
    const multi = oracles.find(({ ticketId }) => ticketId === "TKT-1009")!;

    expect(exact.classification).toMatchObject({
      acceptableCategories: ["other"],
      acceptableTeams: ["support", "product"],
      acceptablePriorities: ["P3"],
    });
    expect(multi.classification).toMatchObject({
      acceptableCategories: ["performance", "api"],
      acceptableTeams: ["product", "api-platform"],
      acceptablePriorities: ["P2"],
    });
    expect(scoreEvaluationOracle(exact, {
      category: "account-access", team: "identity", priority: "P3",
      requiredEscalations: [], knowledgeArticleIds: ["profile-sync-issues"],
    }).classificationPass).toBe(false);
    expect(scoreEvaluationOracle(multi, {
      category: "api", team: "api-platform", priority: "P2",
      requiredEscalations: ["sla"], knowledgeArticleIds: ["campaign-send-failures"],
    }).classificationPass).toBe(true);
  });

  it("separates required and relevant knowledge for reviewed outcomes", async () => {
    const oracles = await loadEvaluationOracles();
    const oracle = oracles.find(({ ticketId }) => ticketId === "TKT-1006")!;

    expect(oracle.knowledge).toEqual({
      requiredArticleIds: ["coupon-catalog-sync"],
      relevantArticleIds: ["campaign-send-failures"],
    });
    expect(scoreEvaluationOracle(oracle, {
      category: "performance", team: "product", priority: "P3",
      requiredEscalations: [], knowledgeArticleIds: ["coupon-catalog-sync"],
    }).knowledgePass).toBe(true);
    expect(scoreEvaluationOracle(oracle, {
      category: "performance", team: "product", priority: "P3",
      requiredEscalations: [], knowledgeArticleIds: ["campaign-send-failures"],
    }).knowledgePass).toBe(false);
  });

  it("keeps SMS quiet-hours plausible without requiring SMS knowledge on TKT-1023", async () => {
    const oracles = await loadEvaluationOracles();
    const sms = oracles.find(({ ticketId }) => ticketId === "TKT-1017")!;
    const consent = oracles.find(({ ticketId }) => ticketId === "TKT-1023")!;

    expect(sms.knownCause).toEqual({ expectation: "plausible" });
    expect(scoreEvaluationOracle(sms, {
      category: "other", team: "support", priority: "P3",
      requiredEscalations: [], knowledgeArticleIds: ["sms-compliance"],
      knownCause: "sms-quiet-hours",
    }).knownCausePass).toBe(true);
    expect(consent.knowledge.requiredArticleIds).toEqual(["profile-sync-issues"]);
    expect(consent.knowledge.relevantArticleIds).toEqual([]);
    expect(consent.knowledge.requiredArticleIds).not.toContain("sms-compliance");
    expect(consent.knowledge.relevantArticleIds).not.toContain("sms-compliance");
  });

  it("keeps the oracle fixture file network-free and parseable as the published contract", async () => {
    const raw = JSON.parse(await readFile(resolve("data/seed/evaluation-oracles.json"), "utf8")) as unknown[];
    expect(raw).toHaveLength(22);
    expect(raw.every((entry) => typeof entry === "object" && entry !== null)).toBe(true);
    const loaded = await loadEvaluationOracles();
    expect(new Set(loaded.map(({ ticketId }) => ticketId)).size).toBe(loaded.length);
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

  it("does not lower legacy recommendation pass counts for taxonomy-only B0 ground truth", async () => {
    const tickets = TicketSchema.array().parse(
      JSON.parse(await readFile(resolve("data/seed/tickets.json"), "utf8")),
    );

    const ticket = tickets.find(({ id }) => id === "TKT-1017")!;

    const outcome = ExpectedOutcomeSchema.array().parse(
      JSON.parse(await readFile(resolve("data/seed/expected-outcomes.json"), "utf8")),
    ).find(({ ticketId }) => ticketId === ticket.id)!;

    const { actor: _actor, ...input } =
      buildApprovalDeskRecommendationInput({
        ticket,
        outcome,
        actor: "taxonomy-oracle-b0-test",
      });

    const recommendation = TriageRecommendationSchema.parse({
      ...input,

      category: "other",
      team: "support",
      priority: "P3",
      escalationRequired: false,
      escalationReasons: [],
      knowledgeArticleIds: ["sms-compliance"],
      knownCause: "sms-quiet-hours",

      id: "00000000-0000-4000-8000-000000000017",
      resolution: "pending",
      createdAt: ticket.updatedAt,
    });

    const oracle = (await loadEvaluationOracles())
      .find(({ ticketId }) => ticketId === ticket.id)!;

    expect(oracle.taxonomy).toBeDefined();

    const report = evaluateRecommendationsAgainstOracles(
      [recommendation],
      [oracle],
    );

    expect(report).toMatchObject({
      ticketCount: 1,
      taxonomyAccuracy: 0,
      passedScenarioCount: 1,
    });
  });

  it("rejects duplicate acceptable primary product surfaces", () => {
    expect(() =>
      EvaluationOracleSchema.parse({
        ticketId: "TKT-1017",
        classification: {
          acceptableCategories: ["other"],
          acceptableTeams: ["support"],
          acceptablePriorities: ["P3"],
          requiredEscalations: [],
        },
        knowledge: {
          requiredArticleIds: ["sms-compliance"],
          relevantArticleIds: [],
        },
        taxonomy: {
          acceptablePrimaryProductSurfaces: [
            { domain: "messaging", area: "sms" },
            { domain: "messaging", area: "sms" },
          ],
          acceptableProblemClasses: ["expected-behavior"],
        },
        labelRationale: "Duplicate product surfaces are invalid.",
      }),
    ).toThrow();
  });

  it("rejects duplicate acceptable problem classes", () => {
    expect(() =>
      EvaluationOracleSchema.parse({
        ticketId: "TKT-1017",
        classification: {
          acceptableCategories: ["other"],
          acceptableTeams: ["support"],
          acceptablePriorities: ["P3"],
          requiredEscalations: [],
        },
        knowledge: {
          requiredArticleIds: ["sms-compliance"],
          relevantArticleIds: [],
        },
        taxonomy: {
          acceptablePrimaryProductSurfaces: [
            { domain: "messaging", area: "sms" },
          ],
          acceptableProblemClasses: [
            "expected-behavior",
            "expected-behavior",
          ],
        },
        labelRationale: "Duplicate problem classes are invalid.",
      }),
    ).toThrow();
  });

  it("fails taxonomy scoring when the primary product surface is wrong", () => {
  const oracle = EvaluationOracleSchema.parse({
    ticketId: "TKT-1017",
    classification: {
      acceptableCategories: ["other"],
      acceptableTeams: ["support"],
      acceptablePriorities: ["P3"],
      requiredEscalations: [],
    },
    knowledge: {
      requiredArticleIds: ["sms-compliance"],
      relevantArticleIds: [],
    },
    taxonomy: {
      acceptablePrimaryProductSurfaces: [
        { domain: "messaging", area: "sms" },
      ],
      acceptableProblemClasses: ["expected-behavior"],
    },
    labelRationale: "Reviewed SMS taxonomy.",
  });

  const score = scoreEvaluationOracle(oracle, {
    category: "other",
    team: "support",
    priority: "P3",
    requiredEscalations: [],
    knowledgeArticleIds: ["sms-compliance"],
    taxonomy: {
      primaryProductSurface: {
        domain: "messaging",
        area: "email",
      },
      problemClasses: ["expected-behavior"],
    },
  });

  expect(score.taxonomyPass).toBe(false);
  expect(score.all).toBe(false);
  });

  it("fails taxonomy scoring when a problem class is outside the acceptable set", () => {
    const oracle = EvaluationOracleSchema.parse({
      ticketId: "TKT-1017",
      classification: {
        acceptableCategories: ["other"],
        acceptableTeams: ["support"],
        acceptablePriorities: ["P3"],
        requiredEscalations: [],
      },
      knowledge: {
        requiredArticleIds: ["sms-compliance"],
        relevantArticleIds: [],
      },
      taxonomy: {
        acceptablePrimaryProductSurfaces: [
          { domain: "messaging", area: "sms" },
        ],
        acceptableProblemClasses: ["expected-behavior"],
      },
      labelRationale: "Reviewed SMS taxonomy.",
    });

    const score = scoreEvaluationOracle(oracle, {
      category: "other",
      team: "support",
      priority: "P3",
      requiredEscalations: [],
      knowledgeArticleIds: ["sms-compliance"],
      taxonomy: {
        primaryProductSurface: {
          domain: "messaging",
          area: "sms",
        },
        problemClasses: ["expected-behavior", "outage"],
      },
    });

    expect(score.taxonomyPass).toBe(false);
    expect(score.all).toBe(false);
  });

  it("publishes reviewed taxonomy ground truth for the SMS quiet-hours case", async () => {
    const oracles = await loadEvaluationOracles();
    const oracle = oracles.find(({ ticketId }) => ticketId === "TKT-1017")!;

    expect(oracle.taxonomy).toEqual({
      acceptablePrimaryProductSurfaces: [
        {
          domain: "messaging",
          area: "sms",
        },
      ],
      acceptableProblemClasses: ["expected-behavior"],
    });
  });

  it("scores taxonomy surface and problem class independently", () => {
    const expectation: NonNullable<EvaluationOracle["taxonomy"]> = {
      acceptablePrimaryProductSurfaces: [
        { domain: "customer-data", area: "consent" },
      ],
      acceptableProblemClasses: ["data-integrity"],
    };

    expect(
      scoreTaxonomyOracle(expectation, {
        primaryProductSurface: {
          domain: "customer-data",
          area: "consent",
        },
        problemClasses: ["defect"],
      }),
    ).toEqual({
      primarySurfacePass: true,
      problemClassPass: false,
      taxonomyPass: false,
      abstained: false,
    });
  });

  it("treats a null primary surface as an abstention and taxonomy failure", () => {
    const expectation: NonNullable<EvaluationOracle["taxonomy"]> = {
      acceptablePrimaryProductSurfaces: [
        { domain: "messaging", area: "sms" },
      ],
      acceptableProblemClasses: ["expected-behavior"],
    };

    expect(
      scoreTaxonomyOracle(expectation, {
        primaryProductSurface: null,
        problemClasses: [],
      }),
    ).toEqual({
      primarySurfacePass: false,
      problemClassPass: false,
      taxonomyPass: false,
      abstained: true,
    });
  });

  it("reports null taxonomy accuracy when no oracle defines taxonomy ground truth", async () => {
    const tickets = TicketSchema.array().parse(
      JSON.parse(
        await readFile(resolve("data/seed/tickets.json"), "utf8"),
      ),
    );

    const ticket = tickets.find(({ id }) => id === "TKT-1001")!;

    const outcome = ExpectedOutcomeSchema.array().parse(
      JSON.parse(
        await readFile(
          resolve("data/seed/expected-outcomes.json"),
          "utf8",
        ),
      ),
    ).find(({ ticketId }) => ticketId === ticket.id)!;

    const { actor: _actor, ...input } =
      buildApprovalDeskRecommendationInput({
        ticket,
        outcome,
        actor: "taxonomy-metric-test",
      });

    const recommendation = TriageRecommendationSchema.parse({
      ...input,
      id: "00000000-0000-4000-8000-000000000101",
      resolution: "pending",
      createdAt: ticket.updatedAt,
    });

    const oracle = (await loadEvaluationOracles())
      .find(({ ticketId }) => ticketId === ticket.id)!;

    const report = evaluateRecommendationsAgainstOracles(
      [recommendation],
      [oracle],
    );

    expect(report.taxonomyAccuracy).toBeNull();
  });

  it("publishes contrasting taxonomy ground truth for the SMS opt-out state case", async () => {
    const oracles = await loadEvaluationOracles();
    const oracle = oracles.find(({ ticketId }) => ticketId === "TKT-1030")!;

    expect(oracle.taxonomy).toEqual({
      acceptablePrimaryProductSurfaces: [
        {
          domain: "customer-data",
          area: "consent",
        },
      ],
      acceptableProblemClasses: ["data-integrity"],
    });
  });

  it("publishes the expanded human-reviewed taxonomy oracle set", async () => {
    const oracles = await loadEvaluationOracles();
    const taxonomyByTicket = Object.fromEntries(
      oracles
        .filter(({ taxonomy }) => taxonomy !== undefined)
        .map(({ ticketId, taxonomy }) => [ticketId, taxonomy]),
    );

    expect(taxonomyByTicket).toMatchObject({
      "TKT-1002": {
        acceptablePrimaryProductSurfaces: [
          { domain: "developer-platform", area: "event-ingestion" },
        ],
        acceptableProblemClasses: ["degraded-performance"],
      },
      "TKT-1004": {
        acceptablePrimaryProductSurfaces: [
          { domain: "security", area: "credentials-secrets" },
        ],
        acceptableProblemClasses: ["security"],
      },
      "TKT-1007": {
        acceptablePrimaryProductSurfaces: [
          { domain: "integrations", area: "webhooks" },
        ],
        acceptableProblemClasses: ["configuration"],
      },
      "TKT-1009": {
        acceptablePrimaryProductSurfaces: [
          { domain: "messaging", area: "campaigns" },
        ],
        acceptableProblemClasses: ["degraded-performance"],
      },
      "TKT-1015": {
        acceptablePrimaryProductSurfaces: [
          { domain: "customer-data", area: "profiles" },
        ],
        acceptableProblemClasses: ["data-integrity"],
      },
      "TKT-1018": {
        acceptablePrimaryProductSurfaces: [
          { domain: "integrations", area: "shopify" },
        ],
        acceptableProblemClasses: ["data-integrity"],
      },
      "TKT-1019": {
        acceptablePrimaryProductSurfaces: [
          { domain: "security", area: "key-management" },
        ],
        acceptableProblemClasses: ["security"],
      },
      "TKT-1020": {
        acceptablePrimaryProductSurfaces: [
          { domain: "integrations", area: "shopify" },
        ],
        acceptableProblemClasses: ["degraded-performance"],
      },
      "TKT-1023": {
        acceptablePrimaryProductSurfaces: [
          { domain: "customer-data", area: "consent" },
        ],
        acceptableProblemClasses: ["data-integrity"],
      },
      "TKT-1025": {
        acceptablePrimaryProductSurfaces: [
          { domain: "customer-data", area: "consent" },
        ],
        acceptableProblemClasses: ["feature-request"],
      },
      "TKT-1028": {
        acceptablePrimaryProductSurfaces: [
          { domain: "integrations", area: "webhooks" },
        ],
        acceptableProblemClasses: ["degraded-performance"],
      },
    });
  });

});
