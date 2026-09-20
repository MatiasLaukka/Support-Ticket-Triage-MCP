import type { ApplicabilityInputMeasurement } from "./applicability-evidence.js";
import {
  ApplicabilityProviderUnavailableError,
  InvalidApplicabilitySchemaError,
  applicabilityInvalidProviderFailureMode,
  validateApplicabilityInput,
  validateApplicabilityProviderOutput,
  type ApplicabilityCaseResult,
  type ApplicabilityReasoningExecution,
  type ApplicabilityReasoningInput,
  type ApplicabilityReasoningProvider,
  type ResourceKey,
} from "./applicability-types.js";

function completedResult(
  input: ApplicabilityReasoningInput,
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

  if (input.promptInjectionDetected) {
    return {
      status: "assessment-skipped",
      reason: "prompt-injection-detected",
    };
  }

  if (input.measurement.fits === false) {
    return {
      status: "assessment-skipped",
      reason: "input-too-large",
    };
  }

  if (
    !input.input.candidates.some(
      (candidate) => candidate.evidence.status === "available",
    )
  ) {
    return {
      status: "assessment-skipped",
      reason: "no-assessable-candidates",
    };
  }

  try {
    const execution = await input.provider.assess(input.input);

    validateApplicabilityProviderOutput(
      input.input,
      execution.output,
    );

    return completedResult(input.input, execution);
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