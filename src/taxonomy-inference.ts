import { z } from "zod";
import {
  ProblemClassSchema,
  ProductSurfaceSchema,
} from "./diagnostic-taxonomy.js";

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

export type TaxonomyInferenceCandidate = z.infer<
  typeof TaxonomyInferenceCandidateSchema
>;