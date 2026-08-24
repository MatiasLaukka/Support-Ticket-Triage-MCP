import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  CategorySchema,
  ExpectedOutcomeSchema,
  PrioritySchema,
  RequiredEscalationSchema,
  TeamSchema,
  TicketIdSchema,
  type Category,
  type ExpectedOutcome,
  type Priority,
  type RequiredEscalation,
  type Team,
} from "./domain.js";
import {
  ProductSurfaceSchema,
  ProblemClassSchema,
  type ProductSurface,
  type ProblemClass,
} from "./diagnostic-taxonomy.js";

const UniqueSlugArraySchema = z
  .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique.",
  });

const UniqueProductSurfaceArraySchema = z
  .array(ProductSurfaceSchema)
  .min(1)
  .refine(
    (values) =>
      new Set(
        values.map(({ domain, area }) => `${domain}/${area}`),
      ).size === values.length,
    {
      message: "Product surfaces must be unique.",
    },
  );

const UniqueProblemClassArraySchema = z
  .array(ProblemClassSchema)
  .min(1)
  .refine(
    (values) => new Set(values).size === values.length,
    {
      message: "Problem classes must be unique.",
    },
  );

const UniqueCategoryArraySchema = z
  .array(CategorySchema)
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique.",
  });
const UniqueTeamArraySchema = z
  .array(TeamSchema)
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique.",
  });
const UniquePriorityArraySchema = z
  .array(PrioritySchema)
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique.",
  });
const UniqueEscalationArraySchema = z
  .array(RequiredEscalationSchema)
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique.",
  });

export const KnownCauseExpectationSchema = z.enum([
  "confirmed",
  "plausible",
  "must-not-match",
  "insufficient-evidence",
  "not-applicable",
]);

export const EvaluationOracleSchema = z
  .object({
    ticketId: TicketIdSchema,
    classification: z
      .object({
        acceptableCategories: UniqueCategoryArraySchema,
        acceptableTeams: UniqueTeamArraySchema,
        acceptablePriorities: UniquePriorityArraySchema,
        requiredEscalations: UniqueEscalationArraySchema,
      })
      .strict(),
    knowledge: z
      .object({
        requiredArticleIds: UniqueSlugArraySchema,
        relevantArticleIds: UniqueSlugArraySchema,
      })
      .strict(),
    taxonomy: z
      .object({
        acceptablePrimaryProductSurfaces:
          UniqueProductSurfaceArraySchema,
        acceptableProblemClasses:
          UniqueProblemClassArraySchema,
      })
      .strict()
      .optional(),
    knownCause: z
      .object({
        expectation: KnownCauseExpectationSchema,
        acceptableKnownCauseIds: UniqueSlugArraySchema.optional(),
      })
      .strict()
      .optional(),
    family: z.string().trim().min(1).optional(),
    contrastGroup: z.string().trim().min(1).optional(),
    labelRationale: z.string().trim().min(1),
  })
  .strict();

export type EvaluationOracle = z.infer<typeof EvaluationOracleSchema>;

export interface EvaluationOracleInput {
  category: Category;
  team: Team;
  priority: Priority;
  requiredEscalations: readonly RequiredEscalation[];
  knowledgeArticleIds: readonly string[];
  knownCause?: string | null;

  taxonomy?: {
    primaryProductSurface: ProductSurface | null;
    problemClasses: readonly ProblemClass[];
  };
}

export interface EvaluationOracleScore {
  classificationPass: boolean;
  knowledgePass: boolean;
  knownCausePass: boolean;
  taxonomyPass: boolean;
  all: boolean;
  failures: string[];
}

export interface EvaluationOracleAudit {
  scenarioCount: number;
  familyCoverage: Record<string, number>;
  contrastGroupCoverage: Record<string, number>;
  duplicateHeavyGroups: Array<{
    contrastGroup: string;
    count: number;
    ticketIds: string[];
  }>;
  missingRationales: string[];
  ambiguousClassificationCount: number;
}

export function evaluationOracleFromExpectedOutcome(
  outcome: ExpectedOutcome,
): EvaluationOracle {
  return EvaluationOracleSchema.parse({
    ticketId: outcome.ticketId,
    classification: {
      acceptableCategories: [outcome.category],
      acceptableTeams: [outcome.team],
      acceptablePriorities: [...outcome.acceptablePriorities],
      requiredEscalations: [...outcome.requiredEscalations],
    },
    knowledge: {
      requiredArticleIds: [...outcome.knowledgeArticleIds],
      relevantArticleIds: [...outcome.knowledgeArticleIds],
    },
    ...(outcome.duplicateGroup === undefined
      ? {}
      : { contrastGroup: outcome.duplicateGroup }),
    labelRationale: "Legacy ExpectedOutcome compatibility mapping.",
  });
}

export async function loadEvaluationOracles(
  path = resolve("data/seed/evaluation-oracles.json"),
): Promise<readonly EvaluationOracle[]> {
  const parsed = EvaluationOracleSchema.array().parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  const duplicateTicketIds = duplicateIds(parsed.map(({ ticketId }) => ticketId));
  if (duplicateTicketIds.length > 0) {
    throw new Error(`Evaluation oracles contain duplicate ticket IDs: ${duplicateTicketIds.join(", ")}.`);
  }
  return parsed;
}

export function scoreEvaluationOracle(
  oracle: EvaluationOracle,
  actual: EvaluationOracleInput,
  options: { legacyKnowledgeArticleIdsExact?: boolean } = {},
): EvaluationOracleScore {
  const failures: string[] = [];
  const category = oracle.classification.acceptableCategories.includes(actual.category);
  const team = oracle.classification.acceptableTeams.includes(actual.team);
  const priority = oracle.classification.acceptablePriorities.includes(actual.priority);
  const missingEscalations = oracle.classification.requiredEscalations.filter(
    (escalation) => !actual.requiredEscalations.includes(escalation),
  );
  const classificationPass = category && team && priority && missingEscalations.length === 0;
  if (!category) failures.push(`category expected one of ${oracle.classification.acceptableCategories.join(" or ")}, got ${actual.category}`);
  if (!team) failures.push(`team expected one of ${oracle.classification.acceptableTeams.join(" or ")}, got ${actual.team}`);
  if (!priority) failures.push(`priority expected one of ${oracle.classification.acceptablePriorities.join(" or ")}, got ${actual.priority}`);
  for (const escalation of missingEscalations) failures.push(`missing escalation ${escalation}`);

  const requiredArticles = oracle.knowledge.requiredArticleIds;
  const knowledgePass = options.legacyKnowledgeArticleIdsExact === true
    ? sameMembers(actual.knowledgeArticleIds, requiredArticles)
    : requiredArticles.every((articleId) => actual.knowledgeArticleIds.includes(articleId));
  if (!knowledgePass) {
    failures.push(options.legacyKnowledgeArticleIdsExact === true
      ? `knowledge articles must exactly match ${requiredArticles.join(", ") || "none"}`
      : `missing required knowledge article ${requiredArticles.find((articleId) => !actual.knowledgeArticleIds.includes(articleId)) ?? ""}`);
  }

  const knownCausePass = knownCauseMatchesOracle(actual.knownCause ?? null, oracle.knownCause);
  if (!knownCausePass) failures.push(`known cause does not satisfy ${oracle.knownCause?.expectation ?? "not-applicable"}`);

  const taxonomyPass =
  oracle.taxonomy === undefined
    ? true
    : actual.taxonomy !== undefined &&
      actual.taxonomy.primaryProductSurface !== null &&
      oracle.taxonomy.acceptablePrimaryProductSurfaces.some(
        (expectedSurface) =>
          expectedSurface.domain === actual.taxonomy!.primaryProductSurface!.domain &&
          expectedSurface.area === actual.taxonomy!.primaryProductSurface!.area,
      ) &&
      actual.taxonomy.problemClasses.length > 0 &&
      actual.taxonomy.problemClasses.every((problemClass) =>
        oracle.taxonomy!.acceptableProblemClasses.includes(problemClass),
      );

  if (!taxonomyPass) {
    failures.push("diagnostic taxonomy does not satisfy oracle");
  }

return {
  classificationPass,
  knowledgePass,
  knownCausePass,
  taxonomyPass,
  all:
    classificationPass &&
    knowledgePass &&
    knownCausePass &&
    taxonomyPass,
  failures,
};
}

/**
 * Compatibility boundary for consumers that still receive ExpectedOutcome.
 * The old article contract is an exact set, so extras remain a failure here.
 */
export function scoreExpectedOutcomeCompatibility(
  outcome: ExpectedOutcome,
  actual: EvaluationOracleInput,
): EvaluationOracleScore {
  return scoreEvaluationOracle(
    evaluationOracleFromExpectedOutcome(outcome),
    actual,
    { legacyKnowledgeArticleIdsExact: true },
  );
}

export function knownCauseMatchesOracle(
  actual: string | null,
  expectation: EvaluationOracle["knownCause"],
): boolean {
  if (expectation === undefined || expectation.expectation === "not-applicable") return true;
  const accepted = expectation.acceptableKnownCauseIds;
  switch (expectation.expectation) {
    case "confirmed":
      return actual !== null && (accepted === undefined || accepted.includes(actual));
    case "plausible":
      return actual !== null && (accepted === undefined || accepted.includes(actual));
    case "must-not-match":
      return actual === null || (accepted !== undefined && !accepted.includes(actual));
    case "insufficient-evidence":
      return actual === null;
  }
}

export function auditEvaluationOracles(
  oracles: readonly EvaluationOracle[],
): EvaluationOracleAudit {
  const familyCoverage = countValues(oracles.flatMap(({ family }) => family === undefined ? [] : [family]));
  const contrastGroupCoverage = countValues(oracles.flatMap(({ contrastGroup }) => contrastGroup === undefined ? [] : [contrastGroup]));
  const groups = new Map<string, string[]>();
  for (const oracle of oracles) {
    if (oracle.contrastGroup === undefined) continue;
    groups.set(oracle.contrastGroup, [...(groups.get(oracle.contrastGroup) ?? []), oracle.ticketId]);
  }
  const duplicateHeavyGroups = [...groups.entries()]
    .filter(([, ticketIds]) => ticketIds.length >= 2)
    .map(([contrastGroup, ticketIds]) => ({ contrastGroup, count: ticketIds.length, ticketIds: [...ticketIds].sort() }))
    .sort((left, right) => left.contrastGroup.localeCompare(right.contrastGroup));
  return {
    scenarioCount: oracles.length,
    familyCoverage,
    contrastGroupCoverage,
    duplicateHeavyGroups,
    missingRationales: oracles.filter(({ labelRationale }) => labelRationale.trim() === "").map(({ ticketId }) => ticketId).sort(),
    ambiguousClassificationCount: oracles.filter(({ classification }) =>
      classification.acceptableCategories.length > 1 ||
      classification.acceptableTeams.length > 1 ||
      classification.acceptablePriorities.length > 1,
    ).length,
  };
}

function countValues(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
}
