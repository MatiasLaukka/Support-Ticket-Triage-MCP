import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  evaluateTaxonomyInference,
  parseTaxonomyInferenceArgs,
  runTaxonomyInferenceCli,
  runTaxonomyInferenceCommand,
} from "../scripts/evaluate-taxonomy-inference.js";

import {
  InvalidTaxonomySchemaError,
  TaxonomyReasoningProviderUnavailableError,
  type TaxonomyReasoningProvider,
} from "../src/taxonomy-reasoning-provider.js";

import {
  classifyTicketFromContext,
} from "../src/approval-desk/classifier.js";

import {
  buildConversationContextForTicket,
} from "../src/approval-desk/conversation-context.js";

import {
  TicketSchema,
  type Ticket,
} from "../src/domain.js";

import type {
  EvaluationOracle,
} from "../src/evaluation-oracle.js";

import type {
  TaxonomyInferenceInput,
} from "../src/taxonomy-inference.js";

import {
  TaxonomyInferenceCandidateSchema,
} from "../src/taxonomy-inference.js";

const reviewedTaxonomyTicketIds = [
  "TKT-1002",
  "TKT-1004",
  "TKT-1007",
  "TKT-1009",
  "TKT-1015",
  "TKT-1017",
  "TKT-1018",
  "TKT-1019",
  "TKT-1020",
  "TKT-1023",
  "TKT-1025",
  "TKT-1028",
  "TKT-1030",
] as const;

const abstentionBoundaryTicketIds = [
  "TKT-1005",
  "TKT-1027",
  "TKT-1022",
  "TKT-1026",
] as const;

async function loadSeedTicket(
  ticketId: string,
): Promise<Ticket> {
  const tickets = TicketSchema.array().parse(
    JSON.parse(
      await readFile(
        resolve("data/seed/tickets.json"),
        "utf8",
      ),
    ),
  );

  const ticket = tickets.find(
    ({ id }) => id === ticketId,
  );

  if (ticket === undefined) {
    throw new Error(
      `Missing seed ticket ${ticketId}.`,
    );
  }

  return ticket;
}

async function comparisonCase(
  ticketId: string,
  expectation: NonNullable<
    EvaluationOracle["taxonomy"]
  >,
) {
  return {
    ticketId,

    expectation,

    inferenceInput: await inferenceInputForTicket(ticketId),
  };
}

async function inferenceInputForTicket(
  ticketId: string,
): Promise<TaxonomyInferenceInput> {
  const ticket = await loadSeedTicket(ticketId);
  const conversationContext = buildConversationContextForTicket({
    ticket,
    customerReplies: [],
    previousSupportResponses: [],
  });
  const classification = classifyTicketFromContext(conversationContext);

  return {
    ticket,
    conversationText: conversationContext.classificationText,
    deterministicClassification: {
      category: classification.category,
      team: classification.team,
      priority: classification.priority,
    },
  };
}

describe("taxonomy inference comparison", () => {
  it("includes every reviewed taxonomy oracle and excludes abstention-boundary tickets", async () => {
    const report =
      await runTaxonomyInferenceCommand({
        cwd: resolve("."),
        mode: "offline",
      });

    const evaluatedTicketIds =
      report.deterministic.results
        .map(({ ticketId }) => ticketId)
        .sort();

    expect(evaluatedTicketIds).toEqual(reviewedTaxonomyTicketIds);

    for (const ticketId of [
      "TKT-1005",
      "TKT-1022",
      "TKT-1026",
      "TKT-1027",
    ]) {
      expect(evaluatedTicketIds).not.toContain(ticketId);
    }

    expect(report.deterministic.evaluatedCaseCount).toBe(
      reviewedTaxonomyTicketIds.length,
    );
    expect(report.abstentionBoundaries.gpt).toBeNull();
    expect(
      report.abstentionBoundaries.deterministic,
    ).toEqual(
      abstentionBoundaryTicketIds.map((ticketId) => ({
        ticketId,
        outcome: {
          status: "candidate",
          candidate: {
            primaryProductSurface: null,
            secondaryProductSurfaces: [],
            problemClasses: [],
          },
          abstained: true,
        },
      })),
    );
  });

  it("runs the deterministic lane offline without invoking fetch", async () => {
    const fetchSpy =
      vi.spyOn(globalThis, "fetch");

    const report =
      await evaluateTaxonomyInference({
        cases: [
          await comparisonCase(
            "TKT-1017",
            {
              acceptablePrimaryProductSurfaces: [
                {
                  domain: "messaging",
                  area: "sms",
                },
              ],

              acceptableProblemClasses: [
                "expected-behavior",
              ],
            },
          ),

          await comparisonCase(
            "TKT-1030",
            {
              acceptablePrimaryProductSurfaces: [
                {
                  domain: "customer-data",
                  area: "consent",
                },
              ],

              acceptableProblemClasses: [
                "data-integrity",
              ],
            },
          ),
        ],
      });

    expect(fetchSpy).not.toHaveBeenCalled();

    expect(report.gpt).toBeNull();

    expect(report.deterministic).toMatchObject({
      lane: "deterministic",
      evaluatedCaseCount: 2,
      primarySurfaceAccuracy: 1,
      problemClassAccuracy: 1,
      fullTaxonomyAccuracy: 1,
      abstentionRate: 0,
    });

    expect(
      report.deterministic.results.map(
        ({ ticketId }) => ticketId,
      ),
    ).toEqual([
      "TKT-1017",
      "TKT-1030",
    ]);

    fetchSpy.mockRestore();
  });

  it("runs the GPT lane only when a provider is explicitly supplied", async () => {
    const reason = vi.fn<
      TaxonomyReasoningProvider["reason"]
    >(async (input) => {
      expect(input.ticket.id).toBe("TKT-1017");

      return {
        candidate: {
          primaryProductSurface: {
            domain: "messaging",
            area: "sms",
          },
          secondaryProductSurfaces: [],
          problemClasses: [
            "expected-behavior",
          ],
        },

        rationale:
          "Quiet-hour behavior belongs to the SMS surface.",

        telemetry: {
          model: "test-taxonomy-model",
          latencyMs: 10,
        },
      };
    });

    const gptProvider: TaxonomyReasoningProvider = {
      reason,
    };

    const report =
      await evaluateTaxonomyInference({
        cases: [
          await comparisonCase(
            "TKT-1017",
            {
              acceptablePrimaryProductSurfaces: [
                {
                  domain: "messaging",
                  area: "sms",
                },
              ],

              acceptableProblemClasses: [
                "expected-behavior",
              ],
            },
          ),
        ],

        gptProvider,
      });

    expect(reason).toHaveBeenCalledTimes(1);

    expect(report.gpt).toMatchObject({
      lane: "gpt",
      evaluatedCaseCount: 1,
      primarySurfaceAccuracy: 1,
      problemClassAccuracy: 1,
      fullTaxonomyAccuracy: 1,
      abstentionRate: 0,
    });

    expect(report.gpt?.results).toEqual([
      {
        ticketId: "TKT-1017",
        status: "scored",
        expected: {
          acceptablePrimaryProductSurfaces: [
            {
              domain: "messaging",
              area: "sms",
            },
          ],
          acceptableProblemClasses: [
            "expected-behavior",
          ],
        },
        actual: {
          primaryProductSurface: {
            domain: "messaging",
            area: "sms",
          },
          secondaryProductSurfaces: [],
          problemClasses: [
            "expected-behavior",
          ],
        },
        primarySurfacePass: true,
        problemClassPass: true,
        taxonomyPass: true,
        abstained: false,
      },
    ]);
  });

  it("retains GPT boundary candidates separately from scored results", async () => {
    const scoredCase = await comparisonCase(
      "TKT-1017",
      {
        acceptablePrimaryProductSurfaces: [
          {
            domain: "messaging",
            area: "sms",
          },
        ],
        acceptableProblemClasses: [
          "expected-behavior",
        ],
      },
    );
    const boundaryCases = await Promise.all(
      abstentionBoundaryTicketIds.map(async (ticketId) => ({
        ticketId,
        inferenceInput: await inferenceInputForTicket(ticketId),
      })),
    );
    const boundaryCandidates = new Map([
      [
        "TKT-1005",
        TaxonomyInferenceCandidateSchema.parse({
          primaryProductSurface: {
            domain: "automation",
            area: "scheduling",
          },
          secondaryProductSurfaces: [
            {
              domain: "messaging",
              area: "campaigns",
            },
          ],
          problemClasses: [],
        }),
      ],
      [
        "TKT-1027",
        TaxonomyInferenceCandidateSchema.parse({
          primaryProductSurface: {
            domain: "developer-platform",
            area: "http-api",
          },
          secondaryProductSurfaces: [],
          problemClasses: [],
        }),
      ],
      [
        "TKT-1022",
        TaxonomyInferenceCandidateSchema.parse({
          primaryProductSurface: {
            domain: "customer-data",
            area: "segments",
          },
          secondaryProductSurfaces: [],
          problemClasses: [],
        }),
      ],
      [
        "TKT-1026",
        TaxonomyInferenceCandidateSchema.parse({
          primaryProductSurface: null,
          secondaryProductSurfaces: [],
          problemClasses: [],
        }),
      ],
    ]);
    const gptProvider: TaxonomyReasoningProvider = {
      async reason(input) {
        return {
          candidate: boundaryCandidates.get(input.ticket.id) ??
            TaxonomyInferenceCandidateSchema.parse({
              primaryProductSurface: {
                domain: "messaging",
                area: "sms",
              },
              secondaryProductSurfaces: [],
              problemClasses: ["expected-behavior"],
            }),
          rationale: "Controlled boundary observation candidate.",
          telemetry: {
            model: "test-taxonomy-model",
            latencyMs: 1,
          },
        };
      },
    };

    const report = await evaluateTaxonomyInference({
      cases: [scoredCase],
      abstentionBoundaryCases: boundaryCases,
      gptProvider,
    });

    expect(report.gpt).toMatchObject({
      evaluatedCaseCount: 1,
      primarySurfaceAccuracy: 1,
      problemClassAccuracy: 1,
      fullTaxonomyAccuracy: 1,
      abstentionRate: 0,
    });
    expect(report.abstentionBoundaries.gpt).toEqual(
      abstentionBoundaryTicketIds.map((ticketId) => ({
        ticketId,
        outcome: {
          status: "candidate",
          candidate: boundaryCandidates.get(ticketId),
          abstained: ticketId === "TKT-1026",
        },
      })),
    );
  });

  it("retains GPT provider failures as diagnostic results instead of aborting the run", async () => {
    const firstCase =
      await comparisonCase(
        "TKT-1017",
        {
          acceptablePrimaryProductSurfaces: [
            {
              domain: "messaging",
              area: "sms",
            },
          ],
          acceptableProblemClasses: [
            "expected-behavior",
          ],
        },
      );

    const secondCase =
      await comparisonCase(
        "TKT-1030",
        {
          acceptablePrimaryProductSurfaces: [
            {
              domain: "customer-data",
              area: "consent",
            },
          ],
          acceptableProblemClasses: [
            "data-integrity",
          ],
        },
      );

    const thirdCase = {
      ...firstCase,
      ticketId: "TKT-REJECTED",
    };

    let callNumber = 0;

    const reason = vi.fn<
      TaxonomyReasoningProvider["reason"]
    >(async () => {
      callNumber += 1;

      if (callNumber === 1) {
        throw new TaxonomyReasoningProviderUnavailableError(
          "timeout",
          null,
        );
      }

      if (callNumber === 2) {
        return {
          candidate: {
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
            problemClasses: [
              "data-integrity",
            ],
          },

          rationale:
            "Consent state is the primary semantic surface.",

          telemetry: {
            model: "test-taxonomy-model",
            latencyMs: 10,
          },
        };
      }

      throw new InvalidTaxonomySchemaError(
        "reasoning-fields",
        [
          "primaryProductSurface.area",
        ],
      );
    });

    const report =
      await evaluateTaxonomyInference({
        cases: [
          firstCase,
          secondCase,
          thirdCase,
        ],

        gptProvider: {
          reason,
        },
      });

    expect(report.gpt).not.toBeNull();

    expect(report.gpt).toMatchObject({
      lane: "gpt",

      evaluatedCaseCount: 1,

      primarySurfaceAccuracy: 1,
      problemClassAccuracy: 1,
      fullTaxonomyAccuracy: 1,
      abstentionRate: 0,
    });

    expect(report.gpt?.results).toEqual([
      {
        ticketId: "TKT-1017",
        status: "provider-unavailable",
        reason: "timeout",
        statusCode: null,
      },

      {
        ticketId: "TKT-1030",
        status: "scored",
        expected: {
          acceptablePrimaryProductSurfaces: [
            {
              domain: "customer-data",
              area: "consent",
            },
          ],
          acceptableProblemClasses: [
            "data-integrity",
          ],
        },
        actual: {
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
          problemClasses: [
            "data-integrity",
          ],
        },
        primarySurfacePass: true,
        problemClassPass: true,
        taxonomyPass: true,
        abstained: false,
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

  it("requires an explicit --live flag before selecting live GPT mode", () => {
    expect(
      parseTaxonomyInferenceArgs([]),
    ).toBe("offline");

    expect(
      parseTaxonomyInferenceArgs([
        "--live",
      ]),
    ).toBe("live");

    expect(
      parseTaxonomyInferenceArgs([
        "--live-boundaries",
      ]),
    ).toBe("live-boundaries");
  });

  it("keeps the command offline by default and constructs a GPT provider only in live mode", async () => {
    const reason = vi.fn<
      TaxonomyReasoningProvider["reason"]
    >(async () => {
      return {
        candidate: {
          primaryProductSurface: {
            domain: "messaging",
            area: "sms",
          },
          secondaryProductSurfaces: [],
          problemClasses: [
            "expected-behavior",
          ],
        },

        rationale:
          "Controlled valid taxonomy output for live orchestration.",

        telemetry: {
          model: "test-live-model",
          latencyMs: 1,
        },
      };
    });

    const createLiveProvider = vi.fn(
      (_env: NodeJS.ProcessEnv): TaxonomyReasoningProvider => ({
        reason,
      }),
    );

    const offline =
      await runTaxonomyInferenceCommand({
        cwd: resolve("."),
        mode: "offline",
        env: {
          OPENAI_API_KEY: "sk-test",
        },
        createLiveProvider,
      });

    expect(createLiveProvider)
      .not.toHaveBeenCalled();

    expect(reason)
      .not.toHaveBeenCalled();

    expect(offline.gpt)
      .toBeNull();

    expect(
      offline.deterministic.results.map(
        ({ ticketId }) => ticketId,
      ).sort(),
    ).toEqual(reviewedTaxonomyTicketIds);

    const live =
      await runTaxonomyInferenceCommand({
        cwd: resolve("."),
        mode: "live",
        env: {
          OPENAI_API_KEY: "sk-test",
        },
        createLiveProvider,
      });

    expect(createLiveProvider)
      .toHaveBeenCalledTimes(1);

    expect(reason)
      .toHaveBeenCalledTimes(
        reviewedTaxonomyTicketIds.length +
          abstentionBoundaryTicketIds.length,
      );

    expect(live.gpt).toMatchObject({
      lane: "gpt",
      evaluatedCaseCount:
        reviewedTaxonomyTicketIds.length,
    });
    expect(live.abstentionBoundaries.gpt).toHaveLength(
      abstentionBoundaryTicketIds.length,
    );
  });

  it("runs exactly the four GPT boundary cases in boundary-only live mode", async () => {
    const seenTicketIds: string[] = [];

    const reason = vi.fn<
      TaxonomyReasoningProvider["reason"]
    >(async (input) => {
      seenTicketIds.push(input.ticket.id);

      return {
        candidate: {
          primaryProductSurface: null,
          secondaryProductSurfaces: [],
          problemClasses: [],
        },

        rationale:
          "Controlled valid taxonomy output for boundary-only live orchestration.",

        telemetry: {
          model: "test-live-model",
          latencyMs: 1,
        },
      };
    });

    const createLiveProvider = vi.fn(
      (_env: NodeJS.ProcessEnv): TaxonomyReasoningProvider => ({
        reason,
      }),
    );

    const report =
      await runTaxonomyInferenceCommand({
        cwd: resolve("."),
        mode: "live-boundaries",
        env: {
          OPENAI_API_KEY: "sk-test",
        },
        createLiveProvider,
      });

    expect(createLiveProvider)
      .toHaveBeenCalledTimes(1);

    expect(reason)
      .toHaveBeenCalledTimes(abstentionBoundaryTicketIds.length);

    expect(seenTicketIds)
      .toEqual(abstentionBoundaryTicketIds);

    expect(report.gpt)
      .toBeNull();

    expect(report.deterministic.evaluatedCaseCount)
      .toBe(reviewedTaxonomyTicketIds.length);

    expect(report.deterministic.primarySurfaceAccuracy)
      .toBe(6 / 13);

    expect(report.deterministic.problemClassAccuracy)
      .toBe(5 / 13);

    expect(report.deterministic.fullTaxonomyAccuracy)
      .toBe(3 / 13);

    expect(report.abstentionBoundaries.gpt)
      .toHaveLength(abstentionBoundaryTicketIds.length);
  });

  it("runs the CLI offline by default and writes the comparison report", async () => {
    const output: string[] = [];

    const createLiveProvider = vi.fn(
      (_env: NodeJS.ProcessEnv): TaxonomyReasoningProvider => ({
        reason: vi.fn(),
      }),
    );

    await runTaxonomyInferenceCli({
      args: [],
      cwd: resolve("."),
      env: {
        OPENAI_API_KEY: "sk-test",
      },
      createLiveProvider,
      writeStdout: (text) => {
        output.push(text);
      },
    });

    expect(createLiveProvider)
      .not.toHaveBeenCalled();

    expect(output).toHaveLength(1);

    const report =
      JSON.parse(output[0]!);

    expect(report).toMatchObject({
      deterministic: {
        lane: "deterministic",
        evaluatedCaseCount:
          reviewedTaxonomyTicketIds.length,
      },
      gpt: null,
      abstentionBoundaries: {
        gpt: null,
      },
    });

    expect(
      report.abstentionBoundaries.deterministic.map(
        ({ ticketId }: { ticketId: string }) => ticketId,
      ),
    ).toEqual(abstentionBoundaryTicketIds);

    expect(report.deterministic.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ticketId: "TKT-1017",
          status: "scored",
          expected: {
            acceptablePrimaryProductSurfaces: [
              {
                domain: "messaging",
                area: "sms",
              },
            ],
            acceptableProblemClasses: [
              "expected-behavior",
            ],
          },
          actual: expect.objectContaining({
            primaryProductSurface: {
              domain: "messaging",
              area: "sms",
            },
            secondaryProductSurfaces: expect.any(Array),
            problemClasses: expect.any(Array),
          }),
        }),
      ]),
    );
  });
});
