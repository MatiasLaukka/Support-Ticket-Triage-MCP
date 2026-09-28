import { measureApplicabilityInput, type ApplicabilityInputMeasurement } from "./applicability-evidence.js";
import { assessPromptInjection } from "../approval-desk/prompt-injection-safety.js";
import {
  ApplicabilityProviderUnavailableError,
  InvalidApplicabilitySchemaError,
  applicabilityInvalidProviderFailureMode,
  validateApplicabilityInput,
  validateApplicabilitySemanticInput,
  validateApplicabilityProviderOutput,
  type ApplicabilityCaseResult,
  type ApplicabilityProviderInput,
  type ApplicabilityReasoningExecution,
  type ApplicabilityReasoningInput,
  type ApplicabilityReasoningProvider,
  type ApplicabilitySemanticReasoningInput,
  type ApplicabilitySemanticReasoningProvider,
  type ResourceKey,
} from "./applicability-types.js";

function completedResult(
  input: ApplicabilityProviderInput,
  execution: ApplicabilityReasoningExecution,
): ApplicabilityCaseResult {
  const unavailableCandidates = input.candidates
    .filter((candidate) => candidate.evidence.status === "unavailable")
    .map((candidate) => ({
      resourceKey: candidate.resourceKey as ResourceKey,
      reasons:
        candidate.evidence.status === "unavailable"
          ? [...candidate.evidence.reasons]
          : [],
    }));

  if (unavailableCandidates.length > 0) {
    return {
      status: "partial-assessment",
      assessments: execution.output.candidateAssessments,
      synthesis: execution.output.synthesis,
      unavailableCandidates,
      telemetry: execution.telemetry,
    };
  }

  return {
    status: "complete",
    assessments: execution.output.candidateAssessments,
    synthesis: execution.output.synthesis,
    telemetry: execution.telemetry,
  };
}

export async function assessApplicabilityCase(input: {
  input: ApplicabilityReasoningInput;
  provider: ApplicabilityReasoningProvider;
  measurement: ApplicabilityInputMeasurement;
  promptInjectionDetected: boolean;
}): Promise<ApplicabilityCaseResult> {
  validateApplicabilityInput(input.input);
  return assessValidatedApplicabilityInput(
    input.input,
    () => input.provider.assess(input.input),
    input.measurement,
    input.promptInjectionDetected,
  );
}

/**
 * Apply the same B5 safety, size, and evidence-coverage gates to provider-neutral
 * runtime semantics without requiring the offline evaluation identity envelope.
 */
export async function assessApplicabilitySemanticCase(input: {
  input: ApplicabilitySemanticReasoningInput;
  provider: ApplicabilitySemanticReasoningProvider;
  budget?: { contextLimitTokens: number; outputReserveTokens: number };
}): Promise<ApplicabilityCaseResult> {
  validateApplicabilitySemanticInput(input.input);
  const injection = assessPromptInjection([
    input.input.case.problemStatement,
    ...input.input.case.observedFacts.map(({ statement }) => statement),
    ...input.input.case.conversationState.map(({ statement }) => statement),
    ...input.input.evidenceRegistry.map(({ text }) => text),
  ].join("\n"));
  return assessValidatedApplicabilityInput(
    input.input,
    () => input.provider.assessSemantic(input.input),
    measureApplicabilityInput(input.input, input.budget),
    injection.detected,
  );
}

async function assessValidatedApplicabilityInput(
  reasoningInput: ApplicabilityProviderInput,
  assess: () => Promise<ApplicabilityReasoningExecution>,
  measurement: ApplicabilityInputMeasurement,
  promptInjectionDetected: boolean,
): Promise<ApplicabilityCaseResult> {
  if (promptInjectionDetected) {
    return {
      status: "assessment-skipped",
      reason: "prompt-injection-detected",
    };
  }

  if (measurement.fits === false) {
    return {
      status: "assessment-skipped",
      reason: "input-too-large",
    };
  }

  if (
    !reasoningInput.candidates.some(
      (candidate) => candidate.evidence.status === "available",
    )
  ) {
    return {
      status: "assessment-skipped",
      reason: "no-assessable-candidates",
    };
  }

  try {
    const execution = await assess();

    validateApplicabilityProviderOutput(
      reasoningInput,
      execution.output,
    );

    return completedResult(reasoningInput, execution);
  } catch (error) {
    if (error instanceof ApplicabilityProviderUnavailableError) {
      return {
        status: "assessment-failed",
        reason: error.reason,
      };
    }

    if (error instanceof InvalidApplicabilitySchemaError) {
      return {
        status: "assessment-failed",
        reason: "invalid-provider-output",
        failureMode: applicabilityInvalidProviderFailureMode(error),
      };
    }

    throw error;
  }
}
