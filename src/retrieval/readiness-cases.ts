import { z } from "zod";
import { IsoTimestampSchema, TicketSchema } from "../domain.js";
import { RetrievalExpectationSchema } from "./evaluation.js";
import { hashText } from "./representations.js";
import type { ProjectedResource, ResourceKey } from "./types.js";

const NonBlankStringSchema = z.string().trim().min(1);
const ResourceKeySchema = z
  .string()
  .regex(/^(?:knowledge-article|known-cause|diagnostic-playbook|resolved-ticket):[A-Za-z0-9._/-]+$/)
  .transform((value) => value as ResourceKey);
const Sha256Schema = z.string().regex(
  new RegExp(`^[0-9a-f]{${hashText("").length}}$`),
  "Expected a lowercase SHA-256 value.",
);
const UniqueNonBlankStringsSchema = z
  .array(NonBlankStringSchema)
  .refine((values) => new Set(values).size === values.length, "Values must be unique.");

export const ReadinessTopicSchema = z.enum(["campaign-editor", "webhook", "flow-event"]);
export const ReadinessFamilySchema = z.enum([
  "exact",
  "paraphrase",
  "contrast",
  "disagreement-probe",
  "insufficient",
  "near-match",
]);

export const ReviewSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }).strict(),
  z.object({
    status: z.literal("approved"),
    reviewedBy: NonBlankStringSchema,
    reviewedAt: IsoTimestampSchema,
    decisionRef: NonBlankStringSchema,
  }).strict(),
]);

export const SectionBindingSchema = z.object({
  resourceKey: ResourceKeySchema,
  sourceHash: Sha256Schema,
  heading: NonBlankStringSchema,
  representationIds: UniqueNonBlankStringsSchema.min(1),
  rationale: NonBlankStringSchema,
}).strict();

export const ReadinessCaseSchema = z.object({
  id: NonBlankStringSchema,
  topic: ReadinessTopicSchema,
  families: z.array(ReadinessFamilySchema).min(1)
    .refine((families) => new Set(families).size === families.length, "Case families must be unique."),
  scenarioGroup: NonBlankStringSchema,
  split: z.enum(["development", "holdout"]),
  provenance: z.object({
    kind: z.literal("synthetic"),
    basis: UniqueNonBlankStringsSchema.min(1),
    derivedFrom: UniqueNonBlankStringsSchema,
  }).strict(),
  ticket: TicketSchema,
  expectation: RetrievalExpectationSchema,
  supportingSections: z.array(SectionBindingSchema),
  evidenceNotes: NonBlankStringSchema,
  labelRationale: NonBlankStringSchema,
  review: ReviewSchema,
}).strict();

const ManifestFileSchema = z.object({
  path: NonBlankStringSchema,
  sha256: Sha256Schema,
}).strict();

export const ReadinessManifestSchema = z.object({
  version: z.literal(1),
  sourceRevision: NonBlankStringSchema,
  corpusHash: Sha256Schema,
  representationVersion: z.literal(3),
  cutoff: IsoTimestampSchema,
  development: ManifestFileSchema,
  holdout: ManifestFileSchema,
}).strict();

export type ReadinessTopic = z.infer<typeof ReadinessTopicSchema>;
export type ReadinessFamily = z.infer<typeof ReadinessFamilySchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type SectionBinding = z.infer<typeof SectionBindingSchema>;
export type ReadinessCase = z.infer<typeof ReadinessCaseSchema>;
export type ReadinessManifest = z.infer<typeof ReadinessManifestSchema>;

function parseCases(cases: readonly ReadinessCase[]): ReadinessCase[] {
  return z.array(ReadinessCaseSchema).parse(cases);
}

function rejectDuplicateCaseIds(cases: readonly ReadinessCase[]): void {
  const ids = new Set<string>();
  for (const readinessCase of cases) {
    if (ids.has(readinessCase.id)) {
      throw new Error(`Duplicate readiness case ID: ${readinessCase.id}`);
    }
    ids.add(readinessCase.id);
  }
}

export function validateReadinessCases(
  cases: readonly ReadinessCase[],
  corpus: readonly ProjectedResource[],
): void {
  const parsed = parseCases(cases);
  rejectDuplicateCaseIds(parsed);

  const resources = new Map<ResourceKey, ProjectedResource>();
  const representationIds = new Set<string>();
  for (const projected of corpus) {
    if (resources.has(projected.resource.key)) {
      throw new Error(`Duplicate corpus resource: ${projected.resource.key}`);
    }
    resources.set(projected.resource.key, projected);
    for (const representation of projected.representations) {
      if (representation.resourceKey !== projected.resource.key) {
        throw new Error(`Representation ${representation.id} belongs to an inconsistent resource.`);
      }
      if (representationIds.has(representation.id)) {
        throw new Error(`Duplicate corpus representation ID: ${representation.id}`);
      }
      representationIds.add(representation.id);
    }
  }

  for (const readinessCase of parsed) {
    const judgedKeys = [
      ...readinessCase.expectation.requiredResourceKeys,
      ...readinessCase.expectation.relevantResourceKeys,
      ...readinessCase.expectation.hardNegativeResourceKeys,
    ] as ResourceKey[];
    for (const resourceKey of judgedKeys) {
      if (!resources.has(resourceKey)) {
        throw new Error(`Readiness case ${readinessCase.id} labels missing corpus resource ${resourceKey}.`);
      }
    }

    const relevant = new Set<ResourceKey>(readinessCase.expectation.relevantResourceKeys as ResourceKey[]);
    const boundRelevant = new Set<ResourceKey>();
    const bindingIdentities = new Set<string>();
    for (const binding of readinessCase.supportingSections) {
      const projected = resources.get(binding.resourceKey);
      if (!projected) {
        throw new Error(`Readiness case ${readinessCase.id} binds missing resource ${binding.resourceKey}.`);
      }
      if (!relevant.has(binding.resourceKey)) {
        throw new Error(`Supporting section ${binding.resourceKey} must label a relevant resource.`);
      }
      if (binding.sourceHash !== projected.resource.contentHash) {
        throw new Error(`Source hash changed for ${binding.resourceKey}; the case requires review.`);
      }

      const matches = projected.representations.filter((representation) =>
        representation.heading === binding.heading
        || (projected.resource.type !== "knowledge-article"
          && representation.heading === undefined
          && representation.title === binding.heading)
      );
      if (matches.length === 0) {
        throw new Error(`Bound heading is missing from ${binding.resourceKey}: ${binding.heading}`);
      }

      const expectedIds = matches.map((representation) => representation.id).sort();
      const boundIds = [...binding.representationIds].sort();
      if (expectedIds.length !== boundIds.length
        || expectedIds.some((id, index) => id !== boundIds[index])) {
        throw new Error(`Representation binding is inconsistent for ${binding.resourceKey}: ${binding.heading}`);
      }

      const identity = `${binding.resourceKey}\u0000${binding.heading}`;
      if (bindingIdentities.has(identity)) {
        throw new Error(`Duplicate supporting-section binding for ${binding.resourceKey}: ${binding.heading}`);
      }
      bindingIdentities.add(identity);
      boundRelevant.add(binding.resourceKey);
    }

    for (const resourceKey of relevant) {
      if (!boundRelevant.has(resourceKey)) {
        throw new Error(`Relevant resource ${resourceKey} requires a supporting-section binding.`);
      }
    }
  }
}

export function selectReadinessDevelopment(cases: readonly ReadinessCase[]): ReadinessCase[] {
  const parsed = parseCases(cases);
  if (parsed.length === 0) {
    throw new Error("The scored development case set must not be empty.");
  }
  rejectDuplicateCaseIds(parsed);
  if (parsed.some((readinessCase) => readinessCase.split !== "development")) {
    throw new Error("Holdout cases must not be included in development scoring.");
  }
  if (parsed.some((readinessCase) => readinessCase.review.status !== "approved")) {
    throw new Error("Every development case requires an approved review before scoring.");
  }
  return parsed;
}

class DisjointSet {
  readonly #parents = new Map<string, string>();

  #root(value: string): string {
    const parent = this.#parents.get(value);
    if (parent === undefined) {
      this.#parents.set(value, value);
      return value;
    }
    if (parent === value) return value;
    const root = this.#root(parent);
    this.#parents.set(value, root);
    return root;
  }

  connect(left: string, right: string): void {
    const leftRoot = this.#root(left);
    const rightRoot = this.#root(right);
    if (leftRoot !== rightRoot) this.#parents.set(rightRoot, leftRoot);
  }

  root(value: string): string {
    return this.#root(value);
  }
}

export function validateReadinessSplits(
  development: readonly ReadinessCase[],
  holdout: readonly ReadinessCase[],
): void {
  const parsedDevelopment = parseCases(development);
  const parsedHoldout = parseCases(holdout);
  const combined = [...parsedDevelopment, ...parsedHoldout];
  rejectDuplicateCaseIds(combined);

  if (parsedDevelopment.some((readinessCase) => readinessCase.split !== "development")) {
    throw new Error("The development case file contains a non-development split.");
  }
  if (parsedHoldout.some((readinessCase) => readinessCase.split !== "holdout")) {
    throw new Error("The holdout case file contains a non-holdout split.");
  }

  const groups = new DisjointSet();
  for (const readinessCase of combined) {
    const caseNode = `case:${readinessCase.id}`;
    groups.connect(caseNode, `lineage:${readinessCase.id}`);
    groups.connect(caseNode, `scenario:${readinessCase.scenarioGroup}`);
    for (const sourceId of readinessCase.provenance.derivedFrom) {
      groups.connect(caseNode, `lineage:${sourceId}`);
    }
  }

  const splitsByGroup = new Map<string, Set<ReadinessCase["split"]>>();
  for (const readinessCase of combined) {
    const root = groups.root(`case:${readinessCase.id}`);
    const splits = splitsByGroup.get(root) ?? new Set<ReadinessCase["split"]>();
    splits.add(readinessCase.split);
    splitsByGroup.set(root, splits);
  }
  if ([...splitsByGroup.values()].some((splits) => splits.size > 1)) {
    throw new Error("Scenario groups and derived case links must not cross development and holdout splits.");
  }
}
