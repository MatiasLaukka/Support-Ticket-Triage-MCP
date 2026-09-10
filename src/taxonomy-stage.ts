import { z } from "zod";

import {
  AiTaxonomyTraceSchema,
  type AiPreference,
  type AiTaxonomyTrace,
} from "./domain.js";
import {
  DiagnosticTaxonomyContextSchema,
  type DiagnosticTaxonomyContext,
} from "./diagnostic-taxonomy.js";
import {
  inferTaxonomyDeterministically,
  TaxonomyInferenceCandidateSchema,
  type TaxonomyInferenceInput,
  type TaxonomyInferenceCandidate,
} from "./taxonomy-inference.js";
import {
  InvalidTaxonomySchemaError,
  TaxonomyReasoningProviderUnavailableError,
  type TaxonomyReasoningProvider,
} from "./taxonomy-reasoning-provider.js";

export interface TaxonomyStageInput extends TaxonomyInferenceInput {
  preference: AiPreference;
  promptInjectionDetected: boolean;
  provider?: TaxonomyReasoningProvider;
}

export type TaxonomyExecutionTrace = AiTaxonomyTrace;

export interface TaxonomyStageResult {
  context: DiagnosticTaxonomyContext;
  trace: TaxonomyExecutionTrace;
}

const INITIAL_BASIS = {
  source: "initial-classification" as const,
  evidenceIds: [],
  knowledgeArticleIds: [],
  playbookIds: [],
  knownCauseIds: [],
  explanation: "Derived from the ticket and current conversation during evaluation.",
};

export async function runTaxonomyStage(
  input: TaxonomyStageInput,
): Promise<TaxonomyStageResult> {
  const deterministicCandidate = inferTaxonomyDeterministically(input);
  const fallbackContext = (candidate: TaxonomyInferenceCandidate) =>
    buildContext(candidate);

  let trace: AiTaxonomyTrace;
  let canonicalCandidate = deterministicCandidate;

  if (input.promptInjectionDetected) {
    trace = makeTrace({
      preference: input.preference,
      status: "skipped",
      deterministicCandidate,
      canonicalCandidate,
      canonicalSource: "deterministic",
      suppression: {
        reason: "prompt-injection",
        message: "Prompt injection was detected; GPT taxonomy was suppressed.",
      },
    });
  } else if (input.preference === "deterministic") {
    trace = makeTrace({
      preference: input.preference,
      status: "skipped",
      deterministicCandidate,
      canonicalCandidate,
      canonicalSource: "deterministic",
      suppression: {
        reason: "deterministic-preference",
        message: "Deterministic taxonomy preference suppressed GPT taxonomy.",
      },
    });
  } else if (input.provider === undefined) {
    trace = makeTrace({
      preference: input.preference,
      status: "fallback",
      deterministicCandidate,
      canonicalCandidate,
      canonicalSource: "deterministic",
      fallback: {
        category: "not-configured",
        message: "Taxonomy GPT reasoning was not configured; deterministic taxonomy was used.",
      },
    });
  } else {
    try {
      const execution = await input.provider.reason(input);
      const parsedCandidate = TaxonomyInferenceCandidateSchema.safeParse(execution.candidate);
      if (!parsedCandidate.success) {
        throw new InvalidTaxonomySchemaError("reasoning-fields", issueFields(parsedCandidate.error));
      }
      canonicalCandidate = parsedCandidate.data;
      trace = makeTrace({
        preference: input.preference,
        status: "used",
        deterministicCandidate,
        gptCandidate: canonicalCandidate,
        canonicalCandidate,
        canonicalSource: "gpt",
        model: safeModel(execution.telemetry.model),
        latencyMs: execution.telemetry.latencyMs,
        usage: execution.telemetry.usage,
        gptRationale: safeMessage(execution.rationale),
      });
    } catch (error) {
      if (error instanceof InvalidTaxonomySchemaError) {
        trace = makeFallbackTrace(input.preference, deterministicCandidate, "invalid-schema");
      } else if (error instanceof TaxonomyReasoningProviderUnavailableError) {
        trace = makeFallbackTrace(
          input.preference,
          deterministicCandidate,
          error.reason === "timeout" ? "timeout" : "provider-error",
        );
      } else {
        throw error;
      }
    }
  }

  const context = fallbackContext(canonicalCandidate);
  return {
    context,
    trace: AiTaxonomyTraceSchema.parse(trace),
  };
}

function buildContext(candidate: TaxonomyInferenceCandidate): DiagnosticTaxonomyContext {
  const hasSurface = candidate.primaryProductSurface !== null || candidate.secondaryProductSurfaces.length > 0;
  const context = {
    ...candidate,
    support: {
      productSurface: hasSurface ? "supported" as const : "tentative" as const,
      problemClass: candidate.problemClasses.length > 0 ? "supported" as const : "tentative" as const,
    },
    basis: INITIAL_BASIS,
  };
  return DiagnosticTaxonomyContextSchema.parse(context);
}

function makeFallbackTrace(
  preference: AiPreference,
  deterministicCandidate: TaxonomyInferenceCandidate,
  category: "not-configured" | "timeout" | "provider-error" | "invalid-schema",
): AiTaxonomyTrace {
  const messages = {
    "not-configured": "Taxonomy GPT reasoning was not configured; deterministic taxonomy was used.",
    timeout: "Taxonomy GPT reasoning timed out; deterministic taxonomy was used.",
    "provider-error": "Taxonomy GPT reasoning was unavailable; deterministic taxonomy was used.",
    "invalid-schema": "Taxonomy GPT reasoning returned invalid taxonomy; deterministic taxonomy was used.",
  } as const;
  return makeTrace({
    preference,
    status: "fallback",
    deterministicCandidate,
    canonicalCandidate: deterministicCandidate,
    canonicalSource: "deterministic",
    fallback: { category, message: messages[category] },
  });
}

function makeTrace(input: Omit<AiTaxonomyTrace, "model" | "latencyMs" | "usage" | "gptRationale"> & Partial<Pick<AiTaxonomyTrace, "model" | "latencyMs" | "usage" | "gptRationale">>): AiTaxonomyTrace {
  return input as AiTaxonomyTrace;
}

function safeModel(model: string | undefined): string | undefined {
  return model !== undefined && /^[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*$/.test(model) && model.length <= 120
    ? model
    : undefined;
}

function safeMessage(message: string | undefined): string | undefined {
  if (message === undefined) return undefined;
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 240) return undefined;
  if (/^\s*[\[{]|sk-[A-Za-z0-9_-]+|\b(?:api[-_]?key|access[-_]?token|secret|token)\s*[=:]\s*\S+|authorization|bearer\s+|(?:[A-Za-z]:[\\/]|(?:^|[\s"'`(])(?:(?:~?[\\/]|[\\/]{2})(?:[A-Za-z0-9._-]+[\\/])+[A-Za-z0-9._-]+|(?:[A-Za-z0-9._-]+[\\/])+[A-Za-z0-9._-]+))|traceback|stack\s*trace|\bat\s+.+\(.+:\d+\)/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function issueFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.length === 0 ? "taxonomy" : issue.path.join(".")))].sort();
}
