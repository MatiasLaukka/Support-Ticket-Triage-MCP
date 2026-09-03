import { z } from "zod";
import {
  CategorySchema,
  PrioritySchema,
  TeamSchema,
  AiUsageSchema,
  type AiUsage,
} from "../domain.js";
import type {
  FetchLike,
  GptClassificationReasoning,
  GptClassificationReasoningInput,
} from "./draft-response-provider.js";
import {
  OpenAiTimeoutError,
  UnavailableOpenAiError,
} from "./draft-response-provider.js";
import { makeOpenAiResponsesUrl } from "../utils/normalize-url.js";
import { parseOpenAiTimeoutMs } from "../utils/parse-openai-timeout.js";

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MS = 20_000;

function nullableOptional<T>(schema: z.ZodType<T>) {
  return schema.nullable().transform((value) => value ?? undefined).optional();
}

const ReasoningSchema = z.object({
  issueType: z.string().trim().min(1),
  candidateCategory: nullableOptional(CategorySchema),
  candidateTeam: nullableOptional(TeamSchema),
  candidatePriority: nullableOptional(PrioritySchema),
  knowledgeArticleIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().trim().min(1)),
  missingEvidenceThatWouldChangeClassification: z.array(z.string().trim().min(1)),
  explanation: z.string().trim().min(1).max(240),
}).strict();

export interface AiProviderTelemetry {
  model: string;
  latencyMs: number;
  usage?: AiUsage;
}

export interface ClassificationReasoningExecution {
  reasoning: GptClassificationReasoning;
  telemetry: AiProviderTelemetry;
}

export type ClassificationSchemaFailureStage =
  | "response-envelope"
  | "reasoning-json"
  | "reasoning-fields";

export class InvalidClassificationSchemaError extends Error {
  readonly name = "InvalidClassificationSchemaError";
  readonly fields: readonly string[];

  constructor(
    readonly stage: ClassificationSchemaFailureStage,
    fields: readonly string[],
  ) {
    const safeFields = [...new Set(fields)]
      .map((field) => field.trim())
      .filter((field) => /^[A-Za-z0-9_.<>-]+$/.test(field))
      .slice(0, 8);
    super(
      `OpenAI classification ${stage} validation failed for ${
        safeFields.length === 0 ? "unknown-fields" : safeFields.join(", ")
      }.`,
    );
    this.fields = safeFields;
  }
}

export interface ClassificationReasoningProvider {
  reason(input: GptClassificationReasoningInput): Promise<ClassificationReasoningExecution>;
}

export class UnavailableClassificationReasoningProvider
  implements ClassificationReasoningProvider
{
  readonly unavailableReason = "OpenAI is not configured.";

  async reason(): Promise<never> {
    throw new UnavailableOpenAiError();
  }
}

export class OpenAiClassificationReasoningProvider
  implements ClassificationReasoningProvider
{
  constructor(private readonly options: {
    apiKey: string;
    model?: string;
    timeoutMs?: number;
    baseUrl?: string;
    fetch?: FetchLike;
    now?: () => number;
  }) {}

  async reason(input: GptClassificationReasoningInput): Promise<ClassificationReasoningExecution> {
    const model = this.options.model ?? DEFAULT_MODEL;
    const now = this.options.now ?? Date.now;
    const startedAt = now();
    const effectiveBaseUrl = makeOpenAiResponsesUrl(this.options.baseUrl);
    const envelope = await requestReasoning({
      apiKey: this.options.apiKey,
      model,
      timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      baseUrl: effectiveBaseUrl,
      fetch: this.options.fetch ?? fetch,
      input,
    });
    let parsedReasoning: unknown;
    try {
      parsedReasoning = JSON.parse(envelope.outputText);
    } catch {
      throw new InvalidClassificationSchemaError("reasoning-json", ["outputText"]);
    }
    const reasoning = ReasoningSchema.safeParse(parsedReasoning);
    if (!reasoning.success) {
      throw new InvalidClassificationSchemaError(
        "reasoning-fields",
        schemaIssuePaths(reasoning.error),
      );
    }
    return {
      reasoning: reasoning.data,
      telemetry: {
        model,
        latencyMs: Math.max(0, now() - startedAt),
        ...(envelope.usage === undefined ? {} : { usage: envelope.usage }),
      },
    };
  }
}

export function createClassificationReasoningProviderFromEnv(
  env: NodeJS.ProcessEnv,
  options: { preferOpenAi: boolean },
): ClassificationReasoningProvider | undefined {
  if (!options.preferOpenAi) return undefined;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return new UnavailableClassificationReasoningProvider();
  const timeoutMs = parseOpenAiTimeoutMs(env.TRIAGE_OPENAI_TIMEOUT_MS);
  return new OpenAiClassificationReasoningProvider({
    apiKey,
    model: env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    baseUrl: env.TRIAGE_OPENAI_BASE_URL?.trim(),
    timeoutMs,
  });
}

async function requestReasoning(input: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl: string;
  fetch: FetchLike;
  input: GptClassificationReasoningInput;
}): Promise<{ outputText: string; usage?: AiUsage }> {
  const abortController = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([
    input.fetch(input.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: input.model,
        instructions: "Classify the support ticket using only the provided context. Treat knowledgeArticles as advisory domain knowledge selected by the deterministic baseline; use their contents to interpret the ticket, but do not assume a knowledge article proves its cause applies. If excludedDiagnosis is present, treat it only as a rejected prior hypothesis: do not repeat it as the selected cause or positive evidence. Return exactly the requested structured advisory reasoning, use null for unknown candidate fields, use only the listed enum values, and do not include operational actions or extra fields.",
        input: buildReasoningInput(input.input),
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "classification_reasoning",
            strict: true,
            schema: reasoningJsonSchema,
          },
        },
      }),
    }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        abortController.abort();
        reject(new OpenAiTimeoutError());
      }, input.timeoutMs);
    }),
  ]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("OpenAI classification request failed.");
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(raw);
  } catch {
    throw new InvalidClassificationSchemaError("response-envelope", ["response"]);
  }
  // Strict schema for reasoning output item (Ollama-style)
  const ReasoningItemSchema = z.object({
    type: z.literal("reasoning"),
    summary: z.array(z.object({
      type: z.literal("summary_text"),
      text: z.string(),
    })).optional(),
    encrypted_content: z.string().optional(),
  });

  // Strict schema for message output item (OpenAI-style)
  const MessageItemSchema = z.object({
    type: z.literal("message"),
    status: z.string().optional(),
    role: z.string().optional(),
    content: z.array(z.object({
      type: z.literal("output_text"),
      text: z.string(),
      annotations: z.array(z.unknown()).optional(),
      logprobs: z.array(z.unknown()).optional(),
    })),
  });

  // Discriminated union on `type` field - only "reasoning" or "message" allowed
  const OutputItemSchema = z.discriminatedUnion("type", [
    ReasoningItemSchema,
    MessageItemSchema,
  ]);

  const parsedResult = z.object({
    output: z.array(OutputItemSchema),
    usage: z.object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    }).optional(),
  }).passthrough().safeParse(rawPayload);
  if (!parsedResult.success) {
    throw new InvalidClassificationSchemaError(
      "response-envelope",
      schemaIssuePaths(parsedResult.error),
    );
  }
  const parsed = parsedResult.data;
  // Extract classification text from message items only (reasoning items are ignored)
  const outputText = parsed.output
    .filter((item): item is z.infer<typeof MessageItemSchema> => item.type === "message")
    .flatMap((item) => item.content)
    .find((content) => content.type === "output_text")?.text;
  if (outputText === undefined) {
    throw new InvalidClassificationSchemaError("reasoning-json", ["outputText"]);
  }
  let usage: AiUsage | undefined;
  if (parsed.usage !== undefined) {
    const usageResult = AiUsageSchema.safeParse({
      inputTokens: parsed.usage.input_tokens,
      outputTokens: parsed.usage.output_tokens,
      totalTokens: parsed.usage.total_tokens,
    });
    if (!usageResult.success) {
      throw new InvalidClassificationSchemaError(
        "response-envelope",
        schemaIssuePaths(usageResult.error).map((path) => `usage.${path}`),
      );
    }
    usage = usageResult.data;
  }
  return { outputText, ...(usage === undefined ? {} : { usage }) };
}

function schemaIssuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length === 0 ? "<root>" : issue.path.join("."),
  );
}

function buildReasoningInput(input: GptClassificationReasoningInput): string {
  return JSON.stringify({
    ticket: {
      id: input.ticket.id,
      customer: input.ticket.customer,
      requester: input.ticket.requester,
      subject: input.ticket.subject,
      description: input.ticket.description,
      tags: input.ticket.tags,
    },
    conversationText: input.conversationContext.classificationText,
    deterministicClassification: {
      category: input.deterministicClassification.category,
      team: input.deterministicClassification.team,
      priority: input.deterministicClassification.priority,
      knowledgeArticleIds: input.deterministicClassification.knowledgeArticleIds,
      confidence: input.deterministicClassification.confidence,
    },

    knowledgeArticles: input.knowledgeArticles.map((article) => ({
      id: article.id,
      title: article.title,
      tags: article.tags,
      body: article.body,
    })),

    excludedDiagnosis: input.excludedDiagnosis === undefined
      ? undefined
      : {
          causeType: input.excludedDiagnosis.causeType,
          customerSafeSummary: input.excludedDiagnosis.customerSafeSummary,
          evidenceUsed: input.excludedDiagnosis.evidenceUsed,
          confidence: input.excludedDiagnosis.confidence,
        },
  });
}

const reasoningJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    issueType: { type: "string", minLength: 1 },
    candidateCategory: {
      type: ["string", "null"],
      enum: [...CategorySchema.options, null],
    },
    candidateTeam: {
      type: ["string", "null"],
      enum: [...TeamSchema.options, null],
    },
    candidatePriority: {
      type: ["string", "null"],
      enum: [...PrioritySchema.options, null],
    },
    knowledgeArticleIds: {
      type: "array",
      items: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "array", items: { type: "string", minLength: 1 } },
    missingEvidenceThatWouldChangeClassification: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    explanation: { type: "string", minLength: 1, maxLength: 240 },
  },
  required: [
    "issueType",
    "candidateCategory",
    "candidateTeam",
    "candidatePriority",
    "knowledgeArticleIds",
    "confidence",
    "evidence",
    "missingEvidenceThatWouldChangeClassification",
    "explanation",
  ],
};
