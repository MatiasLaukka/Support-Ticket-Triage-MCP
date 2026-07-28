import type {
  DraftCustomerResponseCheck,
  DraftCustomerResponseStyle,
} from "../domain.js";

export type ResponseQualityConcept = string | readonly string[];

const ordinaryConceptAliases: readonly (readonly string[])[] = [
  [
    "webhook signature",
    "signature validation",
    "signature validation mismatch",
    "signature failure",
    "signature failures",
  ],
  ["resolved it", "working again", "working now"],
];

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
  requiredEvidenceRecall: number;
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
    (concept) => !matchesRequiredConcept(draft, concept),
  );
  const forbiddenClaims = [
    ...input.contract.forbiddenConcepts.filter((concept) =>
      matchesConcept(draft, concept),
    ),
    ...input.contract.forbiddenClaims.filter((claim) =>
      matchesForbiddenClaim(draft, claim),
    ),
  ];
  const wordCount = input.draft.trim().match(/\S+/g)?.length ?? 0;
  const tonePass = matchesTone(draft, input.contract.tone);
  const evidence = scoreEvidence(draft, input.contract.requiredEvidence);

  for (const concept of missingConcepts) {
    failures.push(`missing concept: ${displayConcept(concept)}`);
  }
  for (const missingEvidence of evidence.missingEvidence) {
    failures.push(`missing evidence: ${displayConcept(missingEvidence)}`);
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
    requiredEvidenceRecall: evidence.recall,
    relevantEvidencePrecision: evidence.precision,
    forbiddenClaimCount: forbiddenClaims.length,
    unnecessaryQuestionCount: evidence.unnecessaryQuestionCount,
    tone: { expected: input.contract.tone, pass: tonePass },
    length: { wordCount, maxWords: input.contract.maxWords, pass: wordCount <= input.contract.maxWords },
    failures,
  };
}

function scoreEvidence(draft: string, requiredEvidence: readonly ResponseQualityConcept[]) {
  const requests = (draft.match(/[^?.!]+[?.!]?/g) ?? []).filter(
    (sentence) => {
      const explicitRequest =
        sentence.includes("?") ||
        /\b(?:please|could you|can you)(?:\s+please)?\s+(?:share|send|provide|confirm|verify)\b/.test(sentence) ||
        /\bnext step is to (?:confirm|verify)\b/.test(sentence);
      const governedNeed =
        /\b(?:we\s+(?:still\s+)?need|to\s+move\s+this\s+forward,?\s+we\s+(?:still\s+)?need)\b/.test(
          sentence,
        ) &&
        !/\bwhat\s+we\s+(?:still\s+)?need\b/.test(sentence) &&
        !/\bwe\s+(?:still\s+)?need\s+to\s+(?:check|investigate|compare|review|confirm|verify|determine)\b/.test(
          sentence,
        );
      return explicitRequest || governedNeed;
    },
  );
  const relevantRequests = requests.filter((request) =>
    requiredEvidence.some((evidence) => matchesConcept(request, evidence)),
  ).length;
  const missingEvidence = requiredEvidence.filter((evidence) =>
    !requests.some((request) => matchesConcept(request, evidence)),
  );
  const unnecessaryQuestionCount = requests.length - relevantRequests;
  return {
    recall: ratio(
      requiredEvidence.length - missingEvidence.length,
      requiredEvidence.length,
    ),
    precision: requests.length === 0
      ? (requiredEvidence.length === 0 ? 1 : 0)
      : relevantRequests / requests.length,
    missingEvidence,
    unnecessaryQuestionCount,
  };
}

function matchesTone(draft: string, tone: DraftCustomerResponseStyle): boolean {
  switch (tone) {
    case "empathetic":
      return /\b(?:sorry|understand|appreciate|thank you|thanks|glad)\b/.test(draft);
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
  return phrases.some((phrase) => phrasePattern(normalize(phrase)).test(draft));
}

function matchesRequiredConcept(draft: string, concept: ResponseQualityConcept): boolean {
  const phrases = typeof concept === "string" ? [concept] : concept;
  return phrases
    .flatMap((phrase) => aliasesForOrdinaryConcept(normalize(phrase)))
    .some((phrase) => phrasePattern(phrase).test(draft));
}

function aliasesForOrdinaryConcept(phrase: string): readonly string[] {
  return ordinaryConceptAliases.find((aliases) => aliases.includes(phrase)) ?? [phrase];
}

function matchesForbiddenClaim(
  draft: string,
  concept: ResponseQualityConcept,
): boolean {
  const phrases = typeof concept === "string" ? [concept] : concept;
  return phrases.some((phrase) => hasUnnegatedPhrase(draft, normalize(phrase)));
}

function hasUnnegatedPhrase(draft: string, phrase: string): boolean {
  const pattern = phrasePattern(phrase, true);
  for (const match of draft.matchAll(pattern)) {
    const matchedPhrase = match[1];
    if (matchedPhrase === undefined || match.index === undefined) continue;
    const index = match.index + match[0].indexOf(matchedPhrase);
    const before = draft.slice(Math.max(0, index - 48), index);
    const directConfirmation = before.match(
      /\b(?:cannot|can't)\s+confirm(?:\s+[a-z'-]+){0,8}\s*$/,
    )?.[0];
    const negation = directConfirmation !== undefined &&
        !/\b(?:but|however|although|because|while|and)\b/.test(directConfirmation)
      ? directConfirmation
      : before.match(
      /\b(?:not|never|isn't|wasn't|weren't|hasn't|haven't|hadn't|without|no)\b(?:\s+[a-z'-]+){0,4}\s*$/,
    )?.[0];
    if (
      negation === undefined ||
      /\b(?:but|however|although)\b/.test(negation)
    ) {
      return true;
    }
  }
  return false;
}

function phrasePattern(phrase: string, capture = false): RegExp {
  const body = phrase
    .split(" ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(
    `(?:^|[^a-z0-9])${capture ? `(${body})` : `(?:${body})`}(?=$|[^a-z0-9])`,
    capture ? "g" : "",
  );
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
