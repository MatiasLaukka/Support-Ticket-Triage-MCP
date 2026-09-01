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
  const ticket =
    await loadSeedTicket(ticketId);

  const conversationContext =
    buildConversationContextForTicket({
      ticket,
      customerReplies: [],
      previousSupportResponses: [],
    });

  const classification =
    classifyTicketFromContext(
      conversationContext,
    );

  return {
    ticketId,

    expectation,

    inferenceInput: {
      ticket,

      conversationText:
        conversationContext.classificationText,

      deterministicClassification: {
        category: classification.category,
        team: classification.team,
        priority: classification.priority,
      },
    },
  };
}

describe("taxonomy inference comparison", () => {
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
        primarySurfacePass: true,
        problemClassPass: true,
        taxonomyPass: true,
        abstained: false,
      },
    ]);
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
  });

  it("keeps the command offline by default and constructs a GPT provider only in live mode", async () => {
    const reason = vi.fn<
      TaxonomyReasoningProvider["reason"]
    >(async (input) => {
      if (input.ticket.id === "TKT-1017") {
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
            "Quiet-hour behavior belongs to SMS.",

          telemetry: {
            model: "test-live-model",
            latencyMs: 1,
          },
        };
      }

      if (input.ticket.id === "TKT-1030") {
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
            "The failure concerns persisted consent state.",

          telemetry: {
            model: "test-live-model",
            latencyMs: 1,
          },
        };
      }

      throw new Error(
        `Unexpected taxonomy ticket ${input.ticket.id}.`,
      );
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
      ),
    ).toEqual([
      "TKT-1017",
      "TKT-1030",
    ]);

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
      .toHaveBeenCalledTimes(2);

    expect(live.gpt).toMatchObject({
      lane: "gpt",
      evaluatedCaseCount: 2,
      primarySurfaceAccuracy: 1,
      problemClassAccuracy: 1,
      fullTaxonomyAccuracy: 1,
      abstentionRate: 0,
    });
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
        evaluatedCaseCount: 2,
      },
      gpt: null,
    });
  });
});