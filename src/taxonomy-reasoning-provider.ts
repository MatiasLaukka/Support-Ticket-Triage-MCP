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

import { makeOpenAiResponsesUrl } from "./utils/normalize-url.js";
import { parseOpenAiTimeoutMs } from "./utils/parse-openai-timeout.js";
import { StartupConfigError } from "./runtime.js";

import type {
  FetchLike,
} from "./approval-desk/draft-response-provider.js";

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MS = 20_000;

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
      baseUrl?: string;
      fetch?: FetchLike;
      now?: () => number;
    },
  ) {}

  async reason(
    input: TaxonomyInferenceInput,
  ): Promise<TaxonomyReasoningExecution> {
    const model =
      this.options.model ?? DEFAULT_MODEL;

    const now = this.options.now ?? Date.now;

    const startedAt = now();

    const envelope = await requestTaxonomyResponse({
      apiKey: this.options.apiKey,
      model,
      timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      url: makeOpenAiResponsesUrl(this.options.baseUrl),
      fetch: this.options.fetch ?? fetch,
      input,
    });

    const outputText = envelope.outputText;

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

        ...(envelope.usage === undefined
          ? {}
          : { usage: envelope.usage }),
      },
    };
  }
}

export class InvalidTaxonomySchemaError extends Error {
  readonly stage:
    | "reasoning-json"
    | "reasoning-fields"
    | "response-envelope";

  readonly fields: readonly string[];

  constructor(
    stage:
      | "reasoning-json"
      | "reasoning-fields"
      | "response-envelope",
    fields: readonly string[],
  ) {
    super(
      stage === "reasoning-json"
        ? "Taxonomy reasoning output could not be parsed."
        : stage === "response-envelope"
          ? "Taxonomy reasoning provider response did not satisfy the response schema."
          : "Taxonomy reasoning output did not satisfy the taxonomy schema.",
    );

    this.name = "InvalidTaxonomySchemaError";
    this.stage = stage;
    this.fields = [...fields];
  }
}

export type TaxonomyReasoningProviderUnavailableReason =
  | "transport"
  | "http"
  | "response-body"
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

export function createTaxonomyReasoningProviderFromEnv(
  env: NodeJS.ProcessEnv,
  options: { preferOpenAi: boolean },
): TaxonomyReasoningProvider | undefined {
  if (!options.preferOpenAi) {
    return undefined;
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  const baseUrl = env.TRIAGE_OPENAI_BASE_URL?.trim();
  if (baseUrl !== undefined && baseUrl !== "") {
    try {
      new URL(baseUrl);
    } catch {
      throw new StartupConfigError(
        "TRIAGE_OPENAI_BASE_URL must be a valid absolute URL.",
      );
    }
  }

  return new OpenAiTaxonomyReasoningProvider({
    apiKey,
    model:
      env.TRIAGE_TAXONOMY_MODEL?.trim() ||
      env.OPENAI_MODEL?.trim() ||
      DEFAULT_MODEL,
    timeoutMs: parseOpenAiTimeoutMs(
      env.TRIAGE_TAXONOMY_TIMEOUT_MS ??
      env.TRIAGE_OPENAI_TIMEOUT_MS,
    ),
    baseUrl,
  });
}

async function requestTaxonomyResponse(input: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  url: string;
  fetch: FetchLike;
  input: TaxonomyInferenceInput;
}): Promise<{ outputText: string; usage?: AiUsage }> {
  const abortController = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const operation = (async () => {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await input.fetch(input.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
        },
        signal: abortController.signal,
        body: JSON.stringify({
          model: input.model,
          instructions: TAXONOMY_REASONING_INSTRUCTIONS,
          input: buildReasoningInput(input.input),
          store: false,
          text: {
            format: {
              type: "json_schema",
              name: "taxonomy_reasoning",
              strict: true,
              schema: taxonomyReasoningJsonSchema,
            },
          },
        }),
      });
    } catch {
      throw new TaxonomyReasoningProviderUnavailableError("transport", null);
    }

    if (!response.ok) {
      throw new TaxonomyReasoningProviderUnavailableError("http", response.status);
    }

    let raw: string;
    try {
      raw = await response.text();
    } catch {
      throw new TaxonomyReasoningProviderUnavailableError("response-body", null);
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(raw);
    } catch {
      throw new InvalidTaxonomySchemaError("response-envelope", []);
    }

    const envelopeSchema = z.object({
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
      usage: z.object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
        total_tokens: z.number().int().nonnegative(),
      }).optional(),
    }).passthrough();

    const envelopeResult = envelopeSchema.safeParse(rawPayload);
    if (!envelopeResult.success) {
      throw new InvalidTaxonomySchemaError("response-envelope", []);
    }

    const envelope = envelopeResult.data;
    const outputText = envelope.output
      .flatMap((item) => item.content)
      .find(({ type }) => type === "output_text")?.text;
    if (outputText === undefined) {
      throw new InvalidTaxonomySchemaError("response-envelope", ["output_text"]);
    }

    let usage: AiUsage | undefined;
    if (envelope.usage !== undefined) {
      const parsedUsage = AiUsageSchema.safeParse({
        inputTokens: envelope.usage.input_tokens,
        outputTokens: envelope.usage.output_tokens,
        totalTokens: envelope.usage.total_tokens,
      });
      if (!parsedUsage.success) {
        throw new InvalidTaxonomySchemaError("response-envelope", ["usage"]);
      }
      usage = parsedUsage.data;
    }

    return {
      outputText,
      ...(usage === undefined ? {} : { usage }),
    };
  })();

  return await new Promise<{ outputText: string; usage?: AiUsage }>((resolve, reject) => {
    timeout = setTimeout(() => {
      abortController.abort();
      reject(new TaxonomyReasoningProviderUnavailableError("timeout", null));
    }, input.timeoutMs);
    operation.then(resolve, reject).finally(() => {
      if (timeout !== undefined) clearTimeout(timeout);
    });
  });
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

