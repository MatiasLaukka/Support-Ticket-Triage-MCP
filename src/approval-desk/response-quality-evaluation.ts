import type {
  DraftCustomerResponseCheck,
  DraftCustomerResponseStyle,
} from "../domain.js";

export type ResponseQualityConcept = string | readonly string[];

export interface ResponseQualityContract {
  scenarioId: string;
  requiredConcepts: readonly ResponseQualityConcept[];
  forbiddenConcepts: readonly ResponseQualityConcept[];
  requiredEvidence: readonly ResponseQualityConcept[];
  requiredEscalation: ResponseQualityConcept | null;
  forbiddenClaims: readonly ResponseQualityConcept[];
  tone: DraftCustomerResponseStyle;
  maxWords: number;
}

export interface ResponseQualityScore {
  hardPass: boolean;
  requiredConceptRecall: number;
  relevantEvidencePrecision: number;
  forbiddenClaimCount: number;
  unnecessaryQuestionCount: number;
  tone: { expected: DraftCustomerResponseStyle; pass: boolean };
  length: { wordCount: number; maxWords: number; pass: boolean };
  failures: string[];
}

export function evaluateResponseQuality(input: {
  draft: string;
  contract: ResponseQualityContract;
  deterministicChecks: readonly DraftCustomerResponseCheck[];
}): ResponseQualityScore {
  const draft = normalize(input.draft);
  const failures: string[] = [];
  const hardFailures: string[] = [];
  const missingConcepts = input.contract.requiredConcepts.filter(
    (concept) => !matchesConcept(draft, concept),
  );
  const forbiddenClaims = [
    ...input.contract.forbiddenConcepts,
    ...input.contract.forbiddenClaims,
  ].filter((concept) => matchesConcept(draft, concept));
  const wordCount = input.draft.trim().match(/\S+/g)?.length ?? 0;
  const tonePass = matchesTone(draft, input.contract.tone);
  const evidence = scoreEvidence(draft, input.contract.requiredEvidence);

  for (const concept of missingConcepts) {
    failures.push(`missing concept: ${displayConcept(concept)}`);
  }
  for (const claim of forbiddenClaims) {
    const failure = `forbidden claim: ${displayConcept(claim)}`;
    failures.push(failure);
    hardFailures.push(failure);
  }
  if (
    input.contract.requiredEscalation !== null &&
    !matchesConcept(draft, input.contract.requiredEscalation)
  ) {
    const failure = `missing escalation: ${displayConcept(input.contract.requiredEscalation)}`;
    failures.push(failure);
    hardFailures.push(failure);
  }
  for (const check of input.deterministicChecks) {
    if (check.status !== "pass") {
      const failure = `deterministic check: ${check.id}`;
      failures.push(failure);
      hardFailures.push(failure);
    }
  }
  if (!tonePass) failures.push(`tone mismatch: ${input.contract.tone}`);
  if (wordCount > input.contract.maxWords) {
    failures.push(`length exceeds maximum: ${wordCount}/${input.contract.maxWords}`);
  }
  for (let index = 0; index < evidence.unnecessaryQuestionCount; index += 1) {
    failures.push("unnecessary question");
  }

  return {
    hardPass: hardFailures.length === 0,
    requiredConceptRecall: ratio(
      input.contract.requiredConcepts.length - missingConcepts.length,
      input.contract.requiredConcepts.length,
    ),
    relevantEvidencePrecision: evidence.precision,
    forbiddenClaimCount: forbiddenClaims.length,
    unnecessaryQuestionCount: evidence.unnecessaryQuestionCount,
    tone: { expected: input.contract.tone, pass: tonePass },
    length: { wordCount, maxWords: input.contract.maxWords, pass: wordCount <= input.contract.maxWords },
    failures,
  };
}

function scoreEvidence(draft: string, requiredEvidence: readonly ResponseQualityConcept[]) {
  const requests = draft.match(/(?:\?|\bplease\s+(?:share|send|provide|confirm|try)\b)[^?.!]*/g) ?? [];
  const relevantRequests = requests.filter((request) =>
    requiredEvidence.some((evidence) => matchesConcept(request, evidence)),
  ).length;
  const unnecessaryQuestionCount = requests.length - relevantRequests;
  return {
    precision: requests.length === 0
      ? (requiredEvidence.length === 0 ? 1 : 0)
      : relevantRequests / requests.length,
    unnecessaryQuestionCount,
  };
}

function matchesTone(draft: string, tone: DraftCustomerResponseStyle): boolean {
  switch (tone) {
    case "empathetic":
      return /\b(?:sorry|understand|appreciate|thank you)\b/.test(draft);
    case "technical":
      return /\b(?:request id|timestamp|endpoint|log|error)\b/.test(draft);
    case "executive-update":
      return /\b(?:update|impact|investigating|next)\b/.test(draft);
    case "concise":
    case "balanced":
      return true;
  }
}

function matchesConcept(draft: string, concept: ResponseQualityConcept): boolean {
  const phrases = typeof concept === "string" ? [concept] : concept;
  return phrases.some((phrase) => draft.includes(normalize(phrase)));
}

function displayConcept(concept: ResponseQualityConcept): string {
  return typeof concept === "string" ? concept : concept[0] ?? "";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
