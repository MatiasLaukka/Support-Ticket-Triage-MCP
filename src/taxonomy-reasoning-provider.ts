import { z } from "zod";

import {
  AiUsageSchema,
  type AiUsage,
} from "./domain.js";

import {
  PROBLEM_CLASSES,
  PRODUCT_SURFACE_AREAS,
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

const TAXONOMY_REASONING_INSTRUCTIONS = [
  "Infer semantic diagnostic taxonomy using only the provided ticket and conversation context.",
  "Do not infer a root cause.",
  "Distinguish observed evidence from a plausible explanation, a root cause, and a supported ProblemClass.",
  "A product surface identifies where the reported behavior manifests.",
  "Select a primary product surface only when the available evidence supports it.",
  "Secondary product surfaces may represent clearly involved additional surfaces.",
  "primaryProductSurface: null is valid and correct when surface evidence is inadequate or cannot support a meaningful surface.",
  "Do not select product surfaces merely to make the candidate complete.",
  "ProblemClasses require positive evidence.",
  "Include a ProblemClass only when the current evidence positively supports that classification; possible, plausible, or likely explanations are insufficient.",
  "problemClasses: [] is the correct and preferred result when no ProblemClass is established by the available evidence.",
  "Multiple ProblemClasses are allowed only when each is independently supported.",
  "An unexplained failure must not automatically become defect; it does not work, missing behavior, or a failure alone is insufficient.",
  "A possible misconfiguration or the mere possibility that configuration explains a symptom is insufficient to establish configuration.",
  "An unexplained mismatch, missing result, stale-looking result, or delayed result alone does not automatically establish data-integrity.",
  "A security-adjacent or credential-related symptom must not automatically become access.",
  "For defect, evidence must establish that observed product behavior contradicts expected product behavior.",
  "For configuration, evidence must identify a relevant configuration state, mismatch, or setting that explains or classifies the observed issue.",
  "For data-integrity, evidence must establish that data itself is incorrect, inconsistent, corrupted, or contradictory.",
  "For expected-behavior, evidence must support that the behavior is intentional product or policy behavior rather than a failure.",
  "For degraded-performance, an observed delay, latency, slowness, backlog, or degraded timing can support the class when the performance symptom itself is established.",
  "For security, the observed issue itself must concern security exposure, compromise risk, credentials or secrets, or another established security condition; proof of exploitation is not required.",
  "For access, evidence must establish an authentication, authorization, permission, or access failure, not merely a security-related situation.",
  "For feature-request, the user must be asking for new or changed capability rather than reporting an established malfunction.",
  "Preserve the existing canonical meanings of the remaining ProblemClasses; do not redesign the taxonomy.",
  "The supplied deterministic category, team, and priority are advisory context, not taxonomy ground truth or evidence that a surface or ProblemClass is true.",
  "Return only the requested semantic taxonomy fields and rationale.",
].join(" ");

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
              TAXONOMY_REASONING_INSTRUCTIONS,

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

const productSurfaceJsonSchemas =
  Object.entries(PRODUCT_SURFACE_AREAS)
    .map(([domain, areas]) => ({
      type: "object",

      additionalProperties: false,

      properties: {
        domain: {
          type: "string",
          enum: [domain],
        },

        area: {
          type: "string",
          enum: [...areas],
        },
      },

      required: [
        "domain",
        "area",
      ],
    }));

const taxonomyReasoningJsonSchema = {
  type: "object",

  additionalProperties: false,

  properties: {
    primaryProductSurface: {
      anyOf: [
        ...productSurfaceJsonSchemas,

        {
          type: "null",
        },
      ],
    },

    secondaryProductSurfaces: {
      type: "array",

      items: {
        anyOf:
          productSurfaceJsonSchemas,
      },
    },

    problemClasses: {
      type: "array",

      items: {
        type: "string",
        enum: [...PROBLEM_CLASSES],
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

