import { createHash } from "node:crypto";
import { IsoTimestampSchema } from "../domain.js";
import { canonicalJsonStringify } from "./canonical-json.js";
import type { HybridShadowCaptureContext } from "./hybrid-shadow-capture.js";
import {
  HybridShadowExecutionKeySchema,
  HybridShadowOpportunityIdSchema,
  HybridShadowRunIdSchema,
  HybridShadowRunFailureSchema,
  ReasoningProviderIdentitySchema,
  parseHybridShadowRunV2,
  type HybridShadowRunFailure,
  type HybridShadowRunV2,
  type ReasoningProviderIdentity,
} from "./shadow-run-types.js";
import {
  HybridShadowRunStoreError,
  type HybridShadowRunRecordResult,
  type HybridShadowRunRepository,
} from "./sqlite-shadow-run-repository.js";
import type { HybridReasoningInput, HybridReasoningResult } from "./types.js";

/** Increment when adapter, prompt/reasoning-contract, or output-contract behavior changes materially. */
export const HYBRID_REASONING_PROVIDER_CONTRACT_VERSION = 1 as const;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export interface HybridReasoningProvider {
  readonly identity: ReasoningProviderIdentity;
  reason(input: DeepReadonly<HybridReasoningInput>): Promise<HybridReasoningResult>;
}

export type HybridReasoningProviderFailureCode = "TIMEOUT" | "UNAVAILABLE";

/** Safe provider-neutral classification; the supplied message is never persisted. */
export class HybridReasoningProviderError extends Error {
  constructor(
    readonly code: HybridReasoningProviderFailureCode,
    message?: string,
  ) {
    super(message ?? (code === "TIMEOUT" ? "The provider timed out." : "The provider is unavailable."));
    this.name = "HybridReasoningProviderError";
  }
}

export interface HybridShadowRunMetadataSource {
  clock(): string;
  createRunId(): string;
}

/**
 * Execute one H4b opportunity as advisory shadow work. This function is not wired
 * to operational command success paths; provider and storage failures reach only
 * its shadow caller.
 */
export async function runHybridShadowOpportunity(
  capture: HybridShadowCaptureContext,
  provider: HybridReasoningProvider,
  repository: HybridShadowRunRepository,
  metadata: HybridShadowRunMetadataSource,
): Promise<HybridShadowRunRecordResult> {
  const opportunityId = parseOpportunityId(capture.opportunityId);
  const providerIdentity = parseProviderIdentity(provider.identity);
  const executionKey = HybridShadowExecutionKeySchema.parse(createHybridReasoningExecutionKey(
    opportunityId,
    providerIdentity,
  ));

  const existing = repository.getShadowRunByExecutionKey(executionKey);
  if (existing !== undefined) {
    if (
      existing.opportunityId !== opportunityId
      || existing.provider.providerKind !== providerIdentity.providerKind
      || existing.provider.model !== providerIdentity.model
    ) {
      throw new HybridShadowRunStoreError(
        "A different hybrid shadow run already uses this execution identity.",
        "EXECUTION_KEY_CONFLICT",
      );
    }
    return { outcome: "replayed", run: existing };
  }

  const inputSnapshot = cloneReasoningInput(capture.input);
  const frozenProviderInput = deepFreeze(structuredClone(inputSnapshot));
  const runId = parseRunId(metadata.createRunId());
  const recordedAt = parseRecordedAt(metadata.clock());
  const base = {
    runId,
    ticketId: capture.ticketId,
    mode: capture.mode,
    provider: providerIdentity,
    recordedAt,
    basis: structuredClone(capture.basis),
    input: inputSnapshot,
    opportunityId,
    executionKey,
  };

  const baseline = {
    ...base,
    status: "failed" as const,
    failure: providerFailure("PROVIDER_ERROR"),
  };
  try {
    parseHybridShadowRunV2(baseline);
  } catch {
    throw new HybridShadowRunStoreError(
      "Hybrid shadow capture context cannot form a valid run.",
      "INVALID_RUN",
    );
  }

  let result: HybridReasoningResult;
  try {
    result = await provider.reason(frozenProviderInput);
  } catch (error) {
    const failedRun = parseHybridShadowRunV2({
      ...base,
      status: "failed",
      failure: classifyProviderFailure(error),
    });
    return repository.recordOrReplayShadowRun(failedRun);
  }

  let completedRun: HybridShadowRunV2;
  try {
    completedRun = parseHybridShadowRunV2({ ...base, status: "completed", result });
  } catch {
    const failedRun = parseHybridShadowRunV2({
      ...base,
      status: "failed",
      failure: providerFailure("INVALID_OUTPUT"),
    });
    return repository.recordOrReplayShadowRun(failedRun);
  }
  return repository.recordOrReplayShadowRun(completedRun);
}

function createHybridReasoningExecutionKey(
  opportunityId: HybridShadowCaptureContext["opportunityId"],
  provider: ReasoningProviderIdentity,
): string {
  const identity = {
    providerContractVersion: HYBRID_REASONING_PROVIDER_CONTRACT_VERSION,
    opportunityId,
    providerKind: provider.providerKind,
    model: provider.model,
  };
  return createHash("sha256").update(canonicalJsonStringify(identity)).digest("hex");
}

function parseOpportunityId(value: unknown): HybridShadowCaptureContext["opportunityId"] {
  const parsed = HybridShadowOpportunityIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new HybridShadowRunStoreError("Hybrid shadow opportunity ID is invalid.", "INVALID_ID", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function parseProviderIdentity(value: unknown): ReasoningProviderIdentity {
  const parsed = ReasoningProviderIdentitySchema.safeParse(value);
  if (!parsed.success) {
    throw new HybridShadowRunStoreError("Hybrid reasoning provider identity is invalid.", "INVALID_RUN", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function cloneReasoningInput(input: HybridReasoningInput): HybridReasoningInput {
  try {
    return structuredClone(input);
  } catch {
    throw new HybridShadowRunStoreError("Hybrid reasoning input cannot be safely cloned.", "INVALID_RUN");
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
  if (typeof value !== "object" || value === null) return value as DeepReadonly<T>;
  if (seen.has(value)) return value as DeepReadonly<T>;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value) as DeepReadonly<T>;
}

function parseRunId(value: unknown): HybridShadowRunV2["runId"] {
  const parsed = HybridShadowRunIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new HybridShadowRunStoreError("Hybrid shadow run ID source returned an invalid ID.", "INVALID_ID", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function parseRecordedAt(value: unknown): HybridShadowRunV2["recordedAt"] {
  const parsed = IsoTimestampSchema.safeParse(value);
  if (!parsed.success) {
    throw new HybridShadowRunStoreError("Hybrid shadow clock returned an invalid timestamp.", "INVALID_RUN", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function classifyProviderFailure(error: unknown): HybridShadowRunFailure {
  if (error instanceof HybridReasoningProviderError) {
    return providerFailure(error.code);
  }
  return providerFailure("PROVIDER_ERROR");
}

function providerFailure(code: "TIMEOUT" | "UNAVAILABLE" | "INVALID_OUTPUT" | "PROVIDER_ERROR"):
HybridShadowRunFailure {
  const messages = {
    TIMEOUT: "The reasoning provider timed out.",
    UNAVAILABLE: "The reasoning provider is unavailable.",
    INVALID_OUTPUT: "The reasoning provider returned output that did not satisfy the reasoning contract.",
    PROVIDER_ERROR: "The reasoning provider failed.",
  } as const;
  return HybridShadowRunFailureSchema.parse({ code, message: messages[code] });
}
