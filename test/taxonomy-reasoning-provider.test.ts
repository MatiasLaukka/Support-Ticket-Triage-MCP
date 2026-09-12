import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createTaxonomyReasoningProviderFromEnv,
  InvalidTaxonomySchemaError,
  TaxonomyReasoningProviderUnavailableError,
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

import {
  PROBLEM_CLASSES,
  PRODUCT_SURFACE_AREAS,
  ProductSurfaceSchema,
} from "../src/diagnostic-taxonomy.js";

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
  const validResponse = () => ({
    output: [
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              primaryProductSurface: null,
              secondaryProductSurfaces: [],
              problemClasses: [],
              rationale: "No taxonomy label is supported by the evidence.",
            }),
          },
        ],
      },
    ],
  });

  it("uses the hosted Responses endpoint by default", async () => {
    const fetch = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(validResponse()),
    }));

    await new OpenAiTaxonomyReasoningProvider({ apiKey: "sk-test", fetch })
      .reason(await providerInput());

    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
  });

  it("normalizes an OpenAI-compatible base URL to its Responses endpoint", async () => {
    const fetch = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(validResponse()),
    }));

    await new OpenAiTaxonomyReasoningProvider({
      apiKey: "local-key",
      baseUrl: "http://localhost:11434/v1/",
      fetch,
    }).reason(await providerInput());

    expect(fetch.mock.calls[0]?.[0]).toBe("http://localhost:11434/v1/responses");
  });

  it("constructs no provider when taxonomy GPT is not configured", () => {
    expect(createTaxonomyReasoningProviderFromEnv({}, { preferOpenAi: true }))
      .toBeUndefined();
    expect(createTaxonomyReasoningProviderFromEnv({ OPENAI_API_KEY: "sk-test" }, { preferOpenAi: false }))
      .toBeUndefined();
  });

  it("uses a taxonomy model override before OPENAI_MODEL", async () => {
    const provider = createTaxonomyReasoningProviderFromEnv({
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "general-model",
      TRIAGE_TAXONOMY_MODEL: "taxonomy-model",
    }, { preferOpenAi: true });
    const fetch = vi.fn(async (_url: string, init: { body: string }) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(validResponse()),
    }));

    const configured = new OpenAiTaxonomyReasoningProvider({
      apiKey: "sk-test",
      model: "taxonomy-model",
      fetch,
    });
    await configured.reason(await providerInput());
    expect(JSON.parse(fetch.mock.calls[0]![1].body).model).toBe("taxonomy-model");
    expect(provider).toBeDefined();
  });

  it("maps fetch rejection to transport unavailability", async () => {
    const error = await new OpenAiTaxonomyReasoningProvider({
      apiKey: "sk-test",
      fetch: async () => { throw new Error("provider body secret"); },
    }).reason(await providerInput()).catch((caught) => caught);

    expect(error).toMatchObject({
      name: "TaxonomyReasoningProviderUnavailableError",
      reason: "transport",
      statusCode: null,
    });
    expect((error as Error).message).not.toContain("provider body secret");
  });

  it("maps response.text rejection to response-body unavailability", async () => {
    const error = await new OpenAiTaxonomyReasoningProvider({
      apiKey: "sk-test",
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => { throw new Error("sensitive body"); },
      }),
    }).reason(await providerInput()).catch((caught) => caught);

    expect(error).toMatchObject({
      name: "TaxonomyReasoningProviderUnavailableError",
      reason: "response-body",
      statusCode: null,
    });
  });

  it("keeps the timeout active through body consumption", async () => {
    const error = await new OpenAiTaxonomyReasoningProvider({
      apiKey: "sk-test",
      timeoutMs: 5,
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => await new Promise<string>((resolve) => setTimeout(() => resolve(JSON.stringify(validResponse())), 40)),
      }),
    }).reason(await providerInput()).catch((caught) => caught);

    expect(error).toMatchObject({
      name: "TaxonomyReasoningProviderUnavailableError",
      reason: "timeout",
    });
  });

  it("maps malformed envelopes, missing output text, and invalid usage to invalid schema", async () => {
    const malformedUsage = {
      ...validResponse(),
      usage: { input_tokens: -1, output_tokens: 1, total_tokens: 0 },
    };
    for (const body of ["{", JSON.stringify({ output: [] }), JSON.stringify(malformedUsage)]) {
      const error = await new OpenAiTaxonomyReasoningProvider({
        apiKey: "sk-test",
        fetch: async () => ({ ok: true, status: 200, text: async () => body }),
      }).reason(await providerInput()).catch((caught) => caught);
      expect(error).toBeInstanceOf(InvalidTaxonomySchemaError);
      expect(error).toMatchObject({ name: "InvalidTaxonomySchemaError", stage: "response-envelope" });
      expect((error as Error).message).not.toContain("sk-test");
    }
  });

  it("keeps expected unavailable errors typed and sanitized", async () => {
    const error = await new OpenAiTaxonomyReasoningProvider({
      apiKey: "sk-test",
      fetch: async () => ({
        ok: false,
        status: 502,
        text: async () => "raw-provider-payload",
      }),
    }).reason(await providerInput()).catch((caught) => caught);

    expect(error).toBeInstanceOf(TaxonomyReasoningProviderUnavailableError);
    expect((error as Error).message).not.toContain("raw-provider-payload");
    expect((error as Error).message).not.toContain("sk-test");
  });

  it("sends the exact canonical taxonomy in the strict structured-output schema", async () => {
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
                      primaryProductSurface: null,
                      secondaryProductSurfaces: [],
                      problemClasses: [],
                      rationale:
                        "The available ticket evidence does not support a taxonomy label.",
                    }),
                  },
                ],
              },
            ],
          }),
      }),
    );

    const provider =
      new OpenAiTaxonomyReasoningProvider({
        apiKey: "sk-test",
        fetch,
      });

    await provider.reason(
      await providerInput(),
    );

    const firstRequest =
      fetch.mock.calls[0]![1] as {
        body: string;
      };

    const request = JSON.parse(firstRequest.body) as {
      text: {
        format: {
          strict: boolean;
          schema: {
            type: string;
            properties: {
              primaryProductSurface: {
                anyOf: Array<Record<string, unknown>>;
              };
              secondaryProductSurfaces: {
                type: string;
                items: {
                  anyOf: Array<Record<string, unknown>>;
                };
              };
              problemClasses: {
                type: string;
                items: {
                  type: string;
                  enum: string[];
                };
              };
            };
          };
        };
      };
    };

    const schema = request.text.format.schema;

    const areasByDomain = (
      branches: Array<Record<string, unknown>>,
    ) => Object.fromEntries(
      branches
        .filter(({ type }) => type === "object")
        .map((branch) => {
          const properties = branch.properties as
            | {
                domain?: { enum?: string[] };
                area?: { enum?: string[] };
              }
            | undefined;

          return [
            properties?.domain?.enum?.[0] ??
              "unconstrained-domain",
            properties?.area?.enum ?? [],
          ];
        }),
    );

    expect(request.text.format.strict).toBe(true);
    expect(schema.type).toBe("object");

    expect(
      areasByDomain(
        schema.properties.primaryProductSurface.anyOf,
      ),
    ).toEqual(PRODUCT_SURFACE_AREAS);

    expect(
      schema.properties.primaryProductSurface.anyOf,
    ).toContainEqual({ type: "null" });

    expect(
      schema.properties.secondaryProductSurfaces.type,
    ).toBe("array");

    expect(
      areasByDomain(
        schema.properties.secondaryProductSurfaces.items.anyOf,
      ),
    ).toEqual(PRODUCT_SURFACE_AREAS);

    expect(
      schema.properties.problemClasses,
    ).toEqual({
      type: "array",
      items: {
        type: "string",
        enum: PROBLEM_CLASSES,
      },
    });

    for (const [domain, areas] of
      Object.entries(PRODUCT_SURFACE_AREAS)) {
      for (const area of areas) {
        expect(
          ProductSurfaceSchema.safeParse({
            domain,
            area,
          }).success,
        ).toBe(true);
      }
    }

    const primarySurfaceBranches =
      schema.properties.primaryProductSurface.anyOf;

    const permitsSurface = (
      domain: string,
      area: string,
    ) => primarySurfaceBranches.some((branch) => {
      if (branch.type !== "object") {
        return false;
      }

      const properties = branch.properties as {
        domain: { enum: string[] };
        area: { enum: string[] };
      };

      return properties.domain.enum.includes(domain) &&
        properties.area.enum.includes(area);
    });

    expect(
      permitsSurface("integrations", "webhooks"),
    ).toBe(true);

    expect(
      permitsSurface("billing", "webhooks"),
    ).toBe(false);

    expect(JSON.stringify(schema))
      .not.toContain('"oneOf"');
  });

  it("communicates an evidence-disciplined taxonomy policy in the provider request", async () => {
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
                      primaryProductSurface: null,
                      secondaryProductSurfaces: [],
                      problemClasses: [],
                      rationale:
                        "The available ticket evidence does not support a stronger taxonomy conclusion.",
                    }),
                  },
                ],
              },
            ],
          }),
      }),
    );

    const provider =
      new OpenAiTaxonomyReasoningProvider({
        apiKey: "sk-test",
        fetch,
      });

    await provider.reason(await providerInput());

    const request = JSON.parse(
      (fetch.mock.calls[0]![1] as { body: string }).body,
    ) as {
      instructions: string;
    };

    const instructions = request.instructions
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(instructions).toMatch(
      /do not infer a root cause|root cause.*must not be inferred/,
    );
    expect(instructions).toMatch(
      /problemclass(?:es)?.*(positive evidence|positively supports)|positive evidence.*problemclass/,
    );
    expect(instructions).toMatch(
      /problemclasses?.*(empty|\[\]).*(correct|preferred)|(?:correct|preferred).*problemclasses?.*(empty|\[\])/,
    );
    expect(instructions).toMatch(
      /defect.*(failure|fails|does not work).*(insufficient|not automatically|alone)|(?:failure|fails|does not work).*defect.*(insufficient|not automatically|alone)/,
    );
    expect(instructions).toMatch(
      /configuration.*(possible|possibility|merely|automatically).*(misconfiguration|explain|configuration)|(?:misconfiguration|configuration).*not automatically/,
    );
    expect(instructions).toMatch(
      /data-integrity.*(mismatch|missing|delayed|unexplained).*(not necessarily|not automatically|insufficient|alone)|(?:mismatch|missing|delayed|unexplained).*data-integrity.*(not necessarily|not automatically|insufficient|alone)/,
    );
    expect(instructions).toMatch(
      /multiple problemclasses?.*(independently supported|each.*supported)|independently supported.*problemclasses?/,
    );
    expect(instructions).toMatch(
      /primaryproductsurface.*null.*(valid|correct).*(inadequate|cannot support|unsupported)|(?:inadequate|cannot support|unsupported).*surface.*primaryproductsurface.*null/,
    );
    expect(instructions).toMatch(
      /(category.*team.*priority|deterministic classification).*(advisory|not.*taxonomy.*ground truth|not.*ground truth)/,
    );
  });

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
