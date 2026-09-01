import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  OpenAiTaxonomyReasoningProvider,
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

async function loadSeedTicket(ticketId: string): Promise<Ticket> {
  const tickets = TicketSchema.array().parse(
    JSON.parse(
      await readFile(
        resolve("data/seed/tickets.json"),
        "utf8",
      ),
    ),
  );

  const ticket = tickets.find(({ id }) => id === ticketId);

  if (ticket === undefined) {
    throw new Error(`Missing seed ticket ${ticketId}.`);
  }

  return ticket;
}

async function providerInput() {
  const ticket = await loadSeedTicket("TKT-1030");

  const conversationContext =
    buildConversationContextForTicket({
      ticket,
      customerReplies: [],
      previousSupportResponses: [],
    });

  const deterministicClassification =
    classifyTicketFromContext(conversationContext);

  return {
    ticket,
    conversationText: conversationContext.classificationText,
    deterministicClassification: {
      category: deterministicClassification.category,
      team: deterministicClassification.team,
      priority: deterministicClassification.priority,
    },
  };
}

describe("OpenAiTaxonomyReasoningProvider", () => {
  it("returns a strict semantic taxonomy candidate with telemetry", async () => {
    const fetch = vi.fn(
      async (_url: string, _init: unknown) => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
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
                      rationale:
                        "The complaint is about consent eligibility state after an SMS opt-out.",
                    }),
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 100,
              output_tokens: 30,
              total_tokens: 130,
            },
          }),
      }),
    );

    const provider =
      new OpenAiTaxonomyReasoningProvider({
        apiKey: "sk-test",
        model: "gpt-5.6-luna",
        now: (() => {
          const values = [1000, 1125];
          return () => values.shift()!;
        })(),
        fetch,
      });

    const execution = await provider.reason(
      await providerInput(),
    );

    expect(execution.candidate).toEqual({
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
    });

    expect(execution.rationale).toBe(
      "The complaint is about consent eligibility state after an SMS opt-out.",
    );

    expect(execution.telemetry).toEqual({
      model: "gpt-5.6-luna",
      latencyMs: 125,
      usage: {
        inputTokens: 100,
        outputTokens: 30,
        totalTokens: 130,
      },
    });

    const firstRequest =
      fetch.mock.calls[0]![1] as {
        body: string;
      };

    const request = JSON.parse(firstRequest.body);
    const reasoningInput =
      JSON.parse(request.input);

    expect(request.store).toBe(false);

    expect(reasoningInput).toMatchObject({
      ticket: {
        id: "TKT-1030",
      },
      deterministicClassification: {
        category: expect.any(String),
        team: expect.any(String),
        priority: expect.any(String),
      },
    });

    expect(reasoningInput.conversationText)
      .toEqual(expect.any(String));

    expect(reasoningInput)
      .not.toHaveProperty("knowledgeArticles");

    expect(reasoningInput)
      .not.toHaveProperty("support");

    expect(reasoningInput)
      .not.toHaveProperty("basis");
  });

  it("distinguishes provider unavailability from rejected taxonomy output", async () => {
    const provider =
      new OpenAiTaxonomyReasoningProvider({
        apiKey: "sk-test",

        fetch: async () => ({
          ok: false,
          status: 503,

          text: async () =>
            JSON.stringify({
              error: {
                message:
                  "sensitive-provider-detail-that-must-not-escape",
              },
            }),
        }),
      });

    const error = await provider
      .reason(await providerInput())
      .catch((caught) => caught);

    expect(error).toMatchObject({
      name: "TaxonomyReasoningProviderUnavailableError",
      stage: "provider",
      statusCode: 503,
    });

    expect((error as Error).message).toBe(
      "Taxonomy reasoning provider is unavailable.",
    );

    expect((error as Error).message)
      .not.toContain(
        "sensitive-provider-detail-that-must-not-escape",
      );

    expect((error as Error).message)
      .not.toContain("sk-test");
  });

  it("rejects an invalid product domain and area combination without exposing provider data", async () => {
    const provider =
      new OpenAiTaxonomyReasoningProvider({
        apiKey: "sk-test",

        fetch: async () => ({
          ok: true,
          status: 200,

          text: async () =>
            JSON.stringify({
              output: [
                {
                  content: [
                    {
                      type: "output_text",

                      text: JSON.stringify({
                        primaryProductSurface: {
                          domain: "billing",
                          area: "webhooks",
                        },

                        secondaryProductSurfaces: [],

                        problemClasses: [
                          "configuration",
                        ],

                        rationale:
                          "This deliberately contains an invalid product surface.",
                      }),
                    },
                  ],
                },
              ],
            }),
        }),
      });

    const error = await provider
      .reason(await providerInput())
      .catch((caught) => caught);

    expect(error).toMatchObject({
      name: "InvalidTaxonomySchemaError",
      stage: "reasoning-fields",
      fields: expect.arrayContaining([
        "primaryProductSurface.area",
      ]),
    });

    expect((error as Error).message)
      .not.toContain("webhooks");

    expect((error as Error).message)
      .not.toContain("sk-test");
  });

  it("rejects malformed reasoning output without leaking raw model content", async () => {
    const provider =
      new OpenAiTaxonomyReasoningProvider({
        apiKey: "sk-test",

        fetch: async () => ({
          ok: true,
          status: 200,

          text: async () =>
            JSON.stringify({
              output: [
                {
                  content: [
                    {
                      type: "output_text",
                      text:
                        '{"primaryProductSurface":{"domain":"customer-data"',
                    },
                  ],
                },
              ],
            }),
        }),
      });

    const error = await provider
      .reason(await providerInput())
      .catch((caught) => caught);

    expect(error).toMatchObject({
      name: "InvalidTaxonomySchemaError",
      stage: "reasoning-json",
      fields: [],
    });

    expect((error as Error).message).toBe(
      "Taxonomy reasoning output could not be parsed.",
    );

    expect((error as Error).message)
      .not.toContain("customer-data");

    expect((error as Error).message)
      .not.toContain("sk-test");
  });

  it("treats a timed-out taxonomy request as provider unavailability", async () => {
    const fetch = vi.fn(
      async (
        _url: string,
        init: {
          signal?: AbortSignal;
        },
      ) => {
    const signal = init.signal;

  if (signal === undefined) {
    throw new Error(
      "Expected taxonomy provider to supply an abort signal.",
    );
  }

  return await new Promise<never>((_resolve, reject) => {
    const rejectAsAborted = () => {
      reject(
        new DOMException(
          "The operation was aborted.",
          "AbortError",
        ),
      );
    };

    if (signal.aborted) {
      rejectAsAborted();
      return;
    }

    signal.addEventListener(
      "abort",
      rejectAsAborted,
      { once: true },
        );
      });
    },
  );

    const provider =
      new OpenAiTaxonomyReasoningProvider({
        apiKey: "sk-test",
        timeoutMs: 5,
        fetch,
      });

    const error = await provider
      .reason(await providerInput())
      .catch((caught) => caught);

    expect(error).toMatchObject({
      name: "TaxonomyReasoningProviderUnavailableError",
      stage: "provider",
      reason: "timeout",
      statusCode: null,
    });

    expect((error as Error).message).toBe(
      "Taxonomy reasoning provider is unavailable.",
    );
  });
});