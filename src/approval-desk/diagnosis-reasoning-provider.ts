import { z } from "zod";
import type { KnowledgeArticle, TriageRecommendation, Ticket } from "../domain.js";
import type { DiagnosisContext } from "../triage-service.js";
import type { ConversationContext } from "./conversation-context.js";
import { AiUsageSchema } from "../domain.js";
import type { FetchLike } from "./draft-response-provider.js";
import {
  OpenAiTimeoutError,
  UnavailableOpenAiError,
} from "./draft-response-provider.js";
import { makeOpenAiResponsesUrl } from "../utils/normalize-url.js";
import { parseOpenAiTimeoutMs } from "../utils/parse-openai-timeout.js";

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MS = 20_000;

const CauseTypeSchema = z.enum([
  "configuration",
  "platform-delay",
  "customer-data",
  "integration",
  "security",
  "performance",
]);
const ConfidenceSchema = z.enum(["likely", "confirmed"]);
const OwnerSchema = z.enum(["support", "engineering", "customer", "integration-partner"]);

const ReasoningSchema = z.object({
  causeType: CauseTypeSchema.nullable(),
  customerSafeSummary: z.string().trim().min(1).max(220),
  confidence: ConfidenceSchema,
  owner: OwnerSchema,
  recommendedNextAction: z.string().trim().min(1).max(180),
  evidenceUsed: z.array(z.string().trim().min(1)).max(12),
  missingEvidenceThatWouldChangeDiagnosis: z.array(z.string().trim().min(1)).max(12),
  knowledgeArticleIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(12),
  explanation: z.string().trim().min(1).max(160),
}).strict();

export type GptDiagnosisReasoning = z.infer<typeof ReasoningSchema>;

export interface GptDiagnosisReasoningInput {
  ticket: Ticket;
  conversationContext: ConversationContext;
  recommendation: TriageRecommendation;
  deterministicDiagnosis: DiagnosisContext;
  knowledgeArticles: readonly KnowledgeArticle[];
}

export interface DiagnosisReasoningExecution {
  reasoning: GptDiagnosisReasoning;
  telemetry: {
    model: string;
    latencyMs: number;
    usage?: z.infer<typeof AiUsageSchema>;
  };
}

export type DiagnosisSchemaFailureStage =
  | "response-envelope"
  | "reasoning-json"
  | "reasoning-fields";

export class InvalidDiagnosisSchemaError extends Error {
  readonly name = "InvalidDiagnosisSchemaError";
  readonly fields: readonly string[];

  constructor(readonly stage: DiagnosisSchemaFailureStage, fields: readonly string[]) {
    const safeFields = [...new Set(fields)]
      .map((field) => field.trim())
      .filter((field) => /^[A-Za-z0-9_.<>-]+$/.test(field))
      .slice(0, 8);
    super(`OpenAI diagnosis ${stage} validation failed for ${safeFields.length === 0 ? "unknown-fields" : safeFields.join(", ")}.`);
    this.fields = safeFields;
  }
}

export interface DiagnosisReasoningProvider {
  reason(input: GptDiagnosisReasoningInput): Promise<DiagnosisReasoningExecution>;
}

export class UnavailableDiagnosisReasoningProvider implements DiagnosisReasoningProvider {
  readonly unavailableReason = "OpenAI is not configured.";

  async reason(): Promise<never> {
    throw new UnavailableOpenAiError();
  }
}

export class OpenAiDiagnosisReasoningProvider implements DiagnosisReasoningProvider {
  constructor(private readonly options: {
    apiKey: string;
    model?: string;
    timeoutMs?: number;
    baseUrl?: string;
    fetch?: FetchLike;
    now?: () => number;
  }) {}

  async reason(input: GptDiagnosisReasoningInput): Promise<DiagnosisReasoningExecution> {
    const model = this.options.model ?? DEFAULT_MODEL;
    const now = this.options.now ?? Date.now;
    const startedAt = now();
    const effectiveBaseUrl = makeOpenAiResponsesUrl(this.options.baseUrl);
    const envelope = await requestDiagnosis({
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
      throw new InvalidDiagnosisSchemaError("reasoning-json", ["outputText"]);
    }
    const reasoning = ReasoningSchema.safeParse(parsedReasoning);
    if (!reasoning.success) {
      throw new InvalidDiagnosisSchemaError("reasoning-fields", schemaIssuePaths(reasoning.error));
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

export function createDiagnosisReasoningProviderFromEnv(
  env: NodeJS.ProcessEnv,
  options: { preferOpenAi: boolean },
): DiagnosisReasoningProvider | undefined {
  if (!options.preferOpenAi) return undefined;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return new UnavailableDiagnosisReasoningProvider();
  const timeoutMs = parseOpenAiTimeoutMs(env.TRIAGE_OPENAI_TIMEOUT_MS);
  return new OpenAiDiagnosisReasoningProvider({
    apiKey,
    model: env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    baseUrl: env.TRIAGE_OPENAI_BASE_URL?.trim(),
    timeoutMs,
  });
}

async function requestDiagnosis(input: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl: string;
  fetch: FetchLike;
  input: GptDiagnosisReasoningInput;
}): Promise<{ outputText: string; usage?: z.infer<typeof AiUsageSchema> }> {
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
        instructions: "Provide one concise advisory support diagnosis from the trusted ticket, customer replies, evidence state, and approved knowledge excerpts. The deterministic cause family and lifecycle/evidence state are authoritative: echo the supplied cause family and do not infer a different one. Keep customerSafeSummary under 220 characters, recommendedNextAction under 180 characters, and explanation under 160 characters. Use one complete plain-language sentence per field, finish each thought before moving on, and omit detail rather than risk truncation. If evidence is insufficient, use likely confidence and list what would change the diagnosis without repeating the same uncertainty in every field. Do not change lifecycle state, invent evidence, expose internal operations, or claim a fix. Return only the requested structured JSON.",
        input: buildDiagnosisInput(input.input),
        max_output_tokens: 1400,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "diagnosis_reasoning",
            strict: true,
            schema: diagnosisJsonSchema,
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
  if (!response.ok) throw new Error("OpenAI diagnosis request failed.");
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(raw);
  } catch {
    throw new InvalidDiagnosisSchemaError("response-envelope", ["response"]);
  }
  const parsedResult = z.object({
    output: z.array(z.object({
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
    })),
    usage: z.object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    }).optional(),
  }).passthrough().safeParse(rawPayload);
  if (!parsedResult.success) {
    throw new InvalidDiagnosisSchemaError("response-envelope", schemaIssuePaths(parsedResult.error));
  }
  const outputText = parsedResult.data.output
    .flatMap((item) => item.content)
    .find((content) => content.type === "output_text")?.text;
  if (outputText === undefined) throw new Error("OpenAI diagnosis response did not include output text.");
  let usage: z.infer<typeof AiUsageSchema> | undefined;
  if (parsedResult.data.usage !== undefined) {
    const usageResult = AiUsageSchema.safeParse({
      inputTokens: parsedResult.data.usage.input_tokens,
      outputTokens: parsedResult.data.usage.output_tokens,
      totalTokens: parsedResult.data.usage.total_tokens,
    });
    if (!usageResult.success) {
      throw new InvalidDiagnosisSchemaError("response-envelope", schemaIssuePaths(usageResult.error).map((path) => `usage.${path}`));
    }
    usage = usageResult.data;
  }
  return { outputText, ...(usage === undefined ? {} : { usage }) };
}

function buildDiagnosisInput(input: GptDiagnosisReasoningInput): string {
  return JSON.stringify({
    ticket: {
      id: input.ticket.id,
      customer: input.ticket.customer,
      subject: input.ticket.subject,
      description: input.ticket.description,
      tags: input.ticket.tags,
    },
    customerConversation: input.conversationContext.classificationText,
    deterministicClassification: {
      category: input.recommendation.category,
      priority: input.recommendation.priority,
      team: input.recommendation.team,
      authoritativeCauseType: input.deterministicDiagnosis.causeType,
      knowledgeArticleIds: input.recommendation.knowledgeArticleIds,
    },
    evidence: {
      supportState: input.recommendation.supportState,
      required: input.recommendation.requiredEvidence?.map((item) => item.label) ?? [],
      provided: input.recommendation.providedEvidence?.map((item) => item.label) ?? [],
      missing: input.recommendation.missingEvidence?.map((item) => item.label) ?? [],
    },
    deterministicDiagnosis: input.deterministicDiagnosis,
    approvedKnowledge: input.knowledgeArticles.map((article) => ({
      id: article.id,
      title: article.title,
      tags: article.tags,
      body: article.body.slice(0, 1800),
    })),
  });
}

function schemaIssuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.length === 0 ? "<root>" : issue.path.join("."));
}

const diagnosisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    causeType: { type: ["string", "null"], enum: [...CauseTypeSchema.options, null] },
    customerSafeSummary: { type: "string", minLength: 1, maxLength: 220 },
    confidence: { type: "string", enum: [...ConfidenceSchema.options] },
    owner: { type: "string", enum: [...OwnerSchema.options] },
    recommendedNextAction: { type: "string", minLength: 1, maxLength: 180 },
    evidenceUsed: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 12 },
    missingEvidenceThatWouldChangeDiagnosis: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 12 },
    knowledgeArticleIds: { type: "array", items: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }, maxItems: 12 },
    explanation: { type: "string", minLength: 1, maxLength: 160 },
  },
  required: [
    "causeType",
    "customerSafeSummary",
    "confidence",
    "owner",
    "recommendedNextAction",
    "evidenceUsed",
    "missingEvidenceThatWouldChangeDiagnosis",
    "knowledgeArticleIds",
    "explanation",
  ],
};
