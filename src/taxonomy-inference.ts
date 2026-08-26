import { z } from "zod";
import {
  ProblemClassSchema,
  ProductSurfaceSchema,
  type ProblemClass,
  type ProductSurface,
} from "./diagnostic-taxonomy.js";
import type { Ticket } from "./domain.js";
import type { TicketClassification } from "./approval-desk/classifier.js";

export const TaxonomyInferenceCandidateSchema = z
  .object({
    primaryProductSurface: ProductSurfaceSchema.nullable(),
    secondaryProductSurfaces: z.array(ProductSurfaceSchema),
    problemClasses: z.array(ProblemClassSchema),
  })
  .strict()
  .superRefine((candidate, context) => {
    const secondaryKeys = new Set<string>();

    for (const surface of candidate.secondaryProductSurfaces) {
      const key = `${surface.domain}/${surface.area}`;

      if (secondaryKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["secondaryProductSurfaces"],
          message: "Secondary product surfaces must be unique.",
        });
      }

      secondaryKeys.add(key);
    }

    if (candidate.primaryProductSurface !== null) {
      const primaryKey =
        `${candidate.primaryProductSurface.domain}/${candidate.primaryProductSurface.area}`;

      if (secondaryKeys.has(primaryKey)) {
        context.addIssue({
          code: "custom",
          path: ["secondaryProductSurfaces"],
          message:
            "Primary product surface must not also appear as a secondary surface.",
        });
      }
    }

    if (
      new Set(candidate.problemClasses).size !==
      candidate.problemClasses.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["problemClasses"],
        message: "Problem classes must be unique.",
      });
    }
  });

export interface TaxonomyInferenceInput {
  ticket: Ticket;
  conversationText: string;
  deterministicClassification: Pick<
    TicketClassification,
    "category" | "team" | "priority"
  >;
}

type SurfaceSignal = {
  surface: ProductSurface;
  weight: number;
  patterns: readonly RegExp[];
};

type ProblemSignal = {
  problemClass: ProblemClass;
  weight: number;
  patterns: readonly RegExp[];
};

const MIN_SURFACE_SCORE = 4;
const MIN_PROBLEM_SCORE = 4;
const MIN_SECONDARY_SURFACE_SCORE = 4;

const surfaceSignals: readonly SurfaceSignal[] = [
  {
    surface: {
      domain: "customer-data",
      area: "consent",
    },
    weight: 6,
    patterns: [
      /\bstop\b/,
      /\bopt[- ]?out\b/,
      /\bconsent\b/,
      /\beligib(?:le|ility)\b/,
    ],
  },
  {
    surface: {
      domain: "messaging",
      area: "sms",
    },
    weight: 5,
    patterns: [
      /\bquiet[- ]?hours?\b/,
      /\bsms\b/,
      /\btext message\b/,
    ],
  },
  {
    surface: {
      domain: "integrations",
      area: "webhooks",
    },
    weight: 6,
    patterns: [
      /\bwebhooks?\b/,
      /\bhmac\b/,
      /\bsigning secret\b/,
    ],
  },
];

const problemSignals: readonly ProblemSignal[] = [
  {
    problemClass: "expected-behavior",
    weight: 6,
    patterns: [
      /\bquiet[- ]?hours?\b/,
      /\bprotection blocked\b/,
      /\bblocked by (?:policy|rule|protection)\b/,
    ],
  },
  {
    problemClass: "data-integrity",
    weight: 6,
    patterns: [
      /\bnot reflected\b/,
      /\bstill\b.*\beligib/,
    ],
  },
  {
    problemClass: "degraded-performance",
    weight: 6,
    patterns: [
      /\bdelay(?:ed|s)?\b/,
      /\blatency\b/,
      /\bslow\b/,
    ],
  },
];

export function inferTaxonomyDeterministically(
  input: TaxonomyInferenceInput,
): TaxonomyInferenceCandidate {
  const text = [
    input.conversationText,
    input.ticket.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  const surfaceScores = new Map<string, {
    surface: ProductSurface;
    score: number;
  }>();

  for (const signal of surfaceSignals) {
    if (!signal.patterns.some((pattern) => pattern.test(text))) {
      continue;
    }

    const key = surfaceKey(signal.surface);
    const existing = surfaceScores.get(key);

    surfaceScores.set(key, {
      surface: signal.surface,
      score: (existing?.score ?? 0) + signal.weight,
    });
  }

  const rankedSurfaces = [...surfaceScores.values()]
    .sort((left, right) =>
      right.score - left.score ||
      surfaceKey(left.surface).localeCompare(surfaceKey(right.surface)),
    );

  const topSurface = rankedSurfaces[0];
  const nextSurface = rankedSurfaces[1];

  const primaryProductSurface =
    topSurface !== undefined &&
    topSurface.score >= MIN_SURFACE_SCORE &&
    (nextSurface === undefined || topSurface.score > nextSurface.score)
      ? topSurface.surface
      : null;

  const secondaryProductSurfaces =
    primaryProductSurface === null
      ? []
      : rankedSurfaces
          .filter(
            ({ surface, score }) =>
              score >= MIN_SECONDARY_SURFACE_SCORE &&
              surfaceKey(surface) !== surfaceKey(primaryProductSurface),
          )
          .map(({ surface }) => surface);

  const problemScores = new Map<ProblemClass, number>();

  for (const signal of problemSignals) {
    if (!signal.patterns.some((pattern) => pattern.test(text))) {
      continue;
    }

    problemScores.set(
      signal.problemClass,
      (problemScores.get(signal.problemClass) ?? 0) + signal.weight,
    );
  }

  const rankedProblems = [...problemScores.entries()]
    .sort(([leftClass, leftScore], [rightClass, rightScore]) =>
      rightScore - leftScore ||
      leftClass.localeCompare(rightClass),
    );

  const topProblem = rankedProblems[0];
  const nextProblem = rankedProblems[1];

  const problemClasses =
    topProblem !== undefined &&
    topProblem[1] >= MIN_PROBLEM_SCORE &&
    (nextProblem === undefined || topProblem[1] > nextProblem[1])
      ? [topProblem[0]]
      : [];

  return TaxonomyInferenceCandidateSchema.parse({
    primaryProductSurface,
    secondaryProductSurfaces,
    problemClasses,
  });
}

function surfaceKey(surface: ProductSurface): string {
  return `${surface.domain}/${surface.area}`;
}

export type TaxonomyInferenceCandidate = z.infer<
  typeof TaxonomyInferenceCandidateSchema
>;