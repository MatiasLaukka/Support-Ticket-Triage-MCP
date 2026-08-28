import { z } from "zod";

import {
  AiUsageSchema,
  type AiUsage,
} from "./domain.js";

import {
  ProblemClassSchema,
  ProductSurfaceSchema,
} from "./diagnostic-taxonomy.js";

import {
  TaxonomyInferenceCandidateSchema,
  type TaxonomyInferenceCandidate,
  type TaxonomyInferenceInput,
} from "./taxonomy-inference.js";

import type {
  FetchLike,
} from "./approval-desk/draft-response-provider.js";

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MS = 20_000;
const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses";

const TaxonomyProviderResponseSchema = z
  .object({
    primaryProductSurface:
      ProductSurfaceSchema.nullable(),

    secondaryProductSurfaces:
      z.array(ProductSurfaceSchema),

    problemClasses:
      z.array(ProblemClassSchema),

    rationale:
      z.string().trim().min(1).max(240),
  })
  .strict();

export interface TaxonomyReasoningExecution {
  candidate: TaxonomyInferenceCandidate;

  rationale: string;

  telemetry: {
    model: string;
    latencyMs: number;
    usage?: AiUsage;
  };
}

export interface TaxonomyReasoningProvider {
  reason(
    input: TaxonomyInferenceInput,
  ): Promise<TaxonomyReasoningExecution>;
}

export class OpenAiTaxonomyReasoningProvider
  implements TaxonomyReasoningProvider
{
  constructor(
    private readonly options: {
      apiKey: string;
      model?: string;
      timeoutMs?: number;
      fetch?: FetchLike;
      now?: () => number;
    },
  ) {}

  async reason(
    input: TaxonomyInferenceInput,
  ): Promise<TaxonomyReasoningExecution> {
    const model =
      this.options.model ?? DEFAULT_MODEL;

    const now =
      this.options.now ?? Date.now;

    const startedAt = now();

    const fetchImpl =
      this.options.fetch ?? fetch;

    const abortController =
      new AbortController();

    let timeout:
      | ReturnType<typeof setTimeout>
      | undefined;

    const response = await Promise.race([
      fetchImpl(
        OPENAI_RESPONSES_URL,
        {
          method: "POST",

          headers: {
            "content-type": "application/json",
            authorization:
              `Bearer ${this.options.apiKey}`,
          },

          signal:
            abortController.signal,

          body: JSON.stringify({
            model,

            instructions:
              "Infer semantic diagnostic taxonomy using only the provided ticket and conversation context. Do not infer a root cause. Return only the requested semantic taxonomy fields and rationale.",

            input:
              buildReasoningInput(input),

            store: false,

            text: {
              format: {
                type: "json_schema",
                name: "taxonomy_reasoning",
                strict: true,
                schema:
                  taxonomyReasoningJsonSchema,
              },
            },
          }),
        },
      ),

      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            new TaxonomyReasoningProviderUnavailableError(
              "timeout",
              null,
            ),
          );

          abortController.abort();
        }, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new TaxonomyReasoningProviderUnavailableError(
        "http",
        response.status,
      );
    }

    const envelope = z
      .object({
        output: z.array(
          z.object({
            content: z.array(
              z.object({
                type: z.string(),
                text: z.string().optional(),
              }),
            ),
          }),
        ),

        usage: z
          .object({
            input_tokens:
              z.number().int().nonnegative(),

            output_tokens:
              z.number().int().nonnegative(),

            total_tokens:
              z.number().int().nonnegative(),
          })
          .optional(),
      })
      .passthrough()
      .parse(JSON.parse(raw));

    const outputText = envelope.output
      .flatMap((item) => item.content)
      .find(
        ({ type }) =>
          type === "output_text",
      )?.text;

    if (outputText === undefined) {
      throw new Error(
        "OpenAI taxonomy response did not include output text.",
      );
    }

    let reasoningFields: unknown;

    try {
      reasoningFields =
        JSON.parse(outputText);
    } catch {
      throw new InvalidTaxonomySchemaError(
        "reasoning-json",
        [],
      );
    }

    let parsed: z.infer<
      typeof TaxonomyProviderResponseSchema
    >;

    let candidate: TaxonomyInferenceCandidate;

    try {
      parsed =
        TaxonomyProviderResponseSchema.parse(
          reasoningFields,
        );

      candidate =
        TaxonomyInferenceCandidateSchema.parse({
          primaryProductSurface:
            parsed.primaryProductSurface,

          secondaryProductSurfaces:
            parsed.secondaryProductSurfaces,

          problemClasses:
            parsed.problemClasses,
        });
    } catch (error) {
      if (error instanceof z.ZodError) {
      throw new InvalidTaxonomySchemaError(
        "reasoning-fields",
        taxonomyIssueFields(error),
      );
      }

      throw error;
    }

    let usage: AiUsage | undefined;

    if (envelope.usage !== undefined) {
      usage = AiUsageSchema.parse({
        inputTokens:
          envelope.usage.input_tokens,

        outputTokens:
          envelope.usage.output_tokens,

        totalTokens:
          envelope.usage.total_tokens,
      });
    }

    return {
      candidate,

      rationale:
        parsed.rationale,

      telemetry: {
        model,

        latencyMs:
          Math.max(
            0,
            now() - startedAt,
          ),

        ...(usage === undefined
          ? {}
          : { usage }),
      },
    };
  }
}

export class InvalidTaxonomySchemaError extends Error {
  readonly stage:
    | "reasoning-json"
    | "reasoning-fields";

  readonly fields: readonly string[];

  constructor(
    stage:
      | "reasoning-json"
      | "reasoning-fields",
    fields: readonly string[],
  ) {
    super(
      stage === "reasoning-json"
        ? "Taxonomy reasoning output could not be parsed."
        : "Taxonomy reasoning output did not satisfy the taxonomy schema.",
    );

    this.name = "InvalidTaxonomySchemaError";
    this.stage = stage;
    this.fields = [...fields];
  }
}

export type TaxonomyReasoningProviderUnavailableReason =
  | "http"
  | "timeout";

export class TaxonomyReasoningProviderUnavailableError extends Error {
  readonly stage = "provider" as const;

  constructor(
    readonly reason: TaxonomyReasoningProviderUnavailableReason,
    readonly statusCode: number | null,
  ) {
    super(
      "Taxonomy reasoning provider is unavailable.",
    );

    this.name =
      "TaxonomyReasoningProviderUnavailableError";
  }
}

function buildReasoningInput(
  input: TaxonomyInferenceInput,
): string {
  return JSON.stringify({
    ticket: {
      id: input.ticket.id,
      customer:
        input.ticket.customer,
      requester:
        input.ticket.requester,
      subject:
        input.ticket.subject,
      description:
        input.ticket.description,
      tags:
        input.ticket.tags,
    },

    conversationText:
      input.conversationText,

    deterministicClassification:
      input.deterministicClassification,
  });
}

function taxonomyIssueFields(
  error: z.ZodError,
): readonly string[] {
  return [
    ...new Set(
      error.issues.map((issue) =>
        issue.path.length > 0
          ? issue.path.join(".")
          : "taxonomy",
      ),
    ),
  ].sort();
}

const taxonomyReasoningJsonSchema = {
  type: "object",

  additionalProperties: false,

  properties: {
    primaryProductSurface: {
      anyOf: [
        {
          type: "object",

          additionalProperties: false,

          properties: {
            domain: {
              type: "string",
            },

            area: {
              type: "string",
            },
          },

          required: [
            "domain",
            "area",
          ],
        },

        {
          type: "null",
        },
      ],
    },

    secondaryProductSurfaces: {
      type: "array",

      items: {
        type: "object",

        additionalProperties: false,

        properties: {
          domain: {
            type: "string",
          },

          area: {
            type: "string",
          },
        },

        required: [
          "domain",
          "area",
        ],
      },
    },

    problemClasses: {
      type: "array",

      items: {
        type: "string",
      },
    },

    rationale: {
      type: "string",
      minLength: 1,
      maxLength: 240,
    },
  },

  required: [
    "primaryProductSurface",
    "secondaryProductSurfaces",
    "problemClasses",
    "rationale",
  ],
};

