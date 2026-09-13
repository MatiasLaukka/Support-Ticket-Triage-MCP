import { KNOWN_CAUSES, type KnownCauseDefinition } from "../approval-desk/known-cause-catalog.js";
import { PLAYBOOK_DESCRIPTORS, type DiagnosticPlaybookDescriptor } from "../approval-desk/diagnostic-playbook-descriptors.js";
import type { KnowledgeArticle } from "../domain.js";
import { eligibleCompletedDiagnoses, type CompletedDiagnosisReadSnapshot } from "../knowledge-evolution/completed-diagnosis-source.js";
import type { ReusableKnowledgeContext, ReusableKnowledgeResult } from "../knowledge-evolution/reusable-context.js";
import { latestAuditPosition } from "../approval-desk/workflow-causal-context.js";
import { hashText, normalizeText, projectArticle, safeCaseText } from "./representations.js";
import type { ProjectedResource, ResourceKey, SourceSnapshot } from "./types.js";

const key = (type: "known-cause" | "diagnostic-playbook" | "resolved-ticket", id: string) => `${type}:${id}` as ResourceKey;

function one(resource: ProjectedResource["resource"], title: string, text: string, keywords: readonly string[]): ProjectedResource {
  const semanticText = normalizeText(`${title}\n\n${text}`);
  const contentHash = hashText(JSON.stringify({ resource: resource.key, title, text, keywords }));
  return {
    resource: { ...resource, contentHash },
    representations: [{
      id: `${resource.key}:canonical:0`,
      resourceKey: resource.key,
      kind: "canonical",
      ordinal: 0,
      title,
      keywords,
      lexicalText: normalizeText(`${title}\n${keywords.join(" ")}\n${text}`),
      semanticText,
      contentHash,
    }],
  };
}

export function projectStaticCause(cause: KnownCauseDefinition): ProjectedResource {
  const resourceKey = key("known-cause", cause.id);
  return one({ key: resourceKey, type: "known-cause", sourceId: cause.id, contentHash: "", family: "static-known-cause", linkedResourceKeys: cause.knowledgeArticleIds.map((id) => `knowledge-article:${id}` as ResourceKey) }, cause.label, [cause.problemSummary, `Evidence policy: ${cause.evidencePolicy}.`, ...cause.investigationSteps, cause.nextStep].join("\n"), cause.requiredEvidenceIds);
}

export function projectLearnedCause(context: ReusableKnowledgeContext): ProjectedResource {
  const object = context.object;
  const resourceKey = `known-cause:learned/${object.id}` as ResourceKey;
  return one({ key: resourceKey, type: "known-cause", sourceId: object.id, sourceVersion: String(context.version), contentHash: "", family: "learned-known-cause", linkedResourceKeys: [] }, object.name, [object.summary, ...object.triggerPatterns, ...object.diagnosticSteps, object.customerSafeExplanation].join("\n"), object.triggerPatterns);
}

export function projectPlaybook(descriptor: DiagnosticPlaybookDescriptor): ProjectedResource {
  const resourceKey = key("diagnostic-playbook", descriptor.id);
  return one({ key: resourceKey, type: "diagnostic-playbook", sourceId: descriptor.id, contentHash: "", family: "playbook", linkedResourceKeys: descriptor.linkedKnowledgeArticleIds.map((id) => `knowledge-article:${id}` as ResourceKey), ...(descriptor.taxonomy ? { taxonomy: descriptor.taxonomy } : {}) }, descriptor.title, [descriptor.summary, ...descriptor.symptoms, ...descriptor.evidenceGoals, ...descriptor.investigationSteps].join("\n"), descriptor.symptoms);
}

export function projectResolvedCase(snapshot: CompletedDiagnosisReadSnapshot): ProjectedResource | undefined {
  if (snapshot.ticket.status !== "resolved") return undefined;
  const eligible = new Set(eligibleCompletedDiagnoses(snapshot).map((diagnosis) => diagnosis.id));
  const latest = latestAuditPosition(snapshot.audits, (audit) => audit.action === "diagnosis-completed" && eligible.has(`diagnosis-${audit.id}`))
    ?? undefined;
  const record = latest === undefined ? undefined : snapshot.diagnoses.find(({ originalAudit }) => originalAudit.id === latest.event.id);
  const diagnosis = record?.diagnosis;
  if (diagnosis === undefined) return undefined;
  const identifiers = [snapshot.ticket.customer.name, snapshot.ticket.requester?.name].filter((value): value is string => value !== undefined);
  const problem = safeCaseText(diagnosis.problem, identifiers);
  if (!problem) return undefined;
  // Proposed fix steps are intentionally omitted. A resolved ticket is useful
  // memory only for the eligible diagnosis and evidence that caused it.
  return one({ key: key("resolved-ticket", snapshot.ticket.id), type: "resolved-ticket", sourceId: snapshot.ticket.id, sourceVersion: snapshot.ticket.updatedAt, contentHash: "", family: "resolved-ticket", linkedResourceKeys: [] }, `Resolved case ${snapshot.ticket.id}`, [problem, ...diagnosis.symptoms, ...(diagnosis.evidenceUsed ?? [])].join("\n"), diagnosis.symptoms);
}

export function loadRetrievalSources(input: { articles: readonly KnowledgeArticle[]; reusable: ReusableKnowledgeResult; completedSnapshots: readonly CompletedDiagnosisReadSnapshot[] }): SourceSnapshot {
  const resolvedResources = input.completedSnapshots.map(projectResolvedCase).filter((item): item is ProjectedResource => item !== undefined);
  const resources = [
    ...input.articles.map(projectArticle),
    ...KNOWN_CAUSES.map(projectStaticCause),
    ...PLAYBOOK_DESCRIPTORS.map(projectPlaybook),
    ...(input.reusable.status === "available" ? input.reusable.contexts.filter((context) => context.learning.eligibleForReuse).map(projectLearnedCause) : []),
    ...resolvedResources,
  ];
  const identities = new Set<string>();
  for (const item of resources) {
    if (identities.has(item.resource.key)) throw new Error(`Duplicate retrieval resource key: ${item.resource.key}`);
    identities.add(item.resource.key);
  }
  return {
    resources,
    unavailableFamilies: [
      ...(input.reusable.status === "available" ? [] : ["learned-known-cause" as const]),
      ...(resolvedResources.length === 0 ? ["resolved-ticket" as const] : []),
    ],
  };
}
