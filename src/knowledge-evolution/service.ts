import { randomUUID } from "node:crypto";
import { DomainError } from "../errors.js";
import type { KnowledgeRepository } from "../knowledge-repository.js";
import type { Ticket, TicketId } from "../domain.js";
import type { TicketRepository } from "../ticket-repository.js";
import { draftKnowledgeCandidate, type CandidateDraftProvider } from "./candidate-draft-provider.js";
import type { CandidateDraftPayload } from "./candidate-draft-contract.js";
import type { CompletedDiagnosis, KnowledgeCandidate, KnowledgeObject } from "./domain.js";
import { KnowledgeCandidateSchema } from "./domain.js";
import { discoverCandidates, type KnowledgeDiscoveryResult } from "./discovery.js";
import type { DiagnosisRepository } from "./diagnosis-repository.js";
import type { KnowledgeAuditEvent, KnowledgeAuditRepository } from "./knowledge-audit-repository.js";
import type { KnowledgeObjectRepository } from "./knowledge-object-repository.js";

const editableFields = [
  "name", "summary", "triggerPatterns", "evidencePolicy", "timeConstraints",
  "diagnosticSteps", "fixSteps", "verificationSteps", "customerSafeExplanation",
  "operatorRationale", "owner",
] as const;

export type CandidateEdits = Partial<Pick<KnowledgeCandidate, (typeof editableFields)[number]>>;

export interface KnowledgeEvolutionServiceDependencies {
  tickets: Pick<TicketRepository, "snapshot" | "get">;
  knowledge: Pick<KnowledgeRepository, "list">;
  diagnoses: Pick<DiagnosisRepository, "list">;
  objects: Pick<KnowledgeObjectRepository, "listCandidates" | "getCandidate" | "saveCandidate" | "listApproved" | "promote" | "removeApproved">;
  audits: Pick<KnowledgeAuditRepository, "append" | "appendIfNoPriorAction">;
  draftProvider?: CandidateDraftProvider;
  now?: () => Date;
  nextAuditId?: () => string;
}

export interface KnowledgeDiscoveryServiceResult extends KnowledgeDiscoveryResult {
  gptAdvisory: {
    requested: boolean;
    status: "not-used" | "used";
    candidateId?: string;
  };
}

export class KnowledgeEvolutionService {
  private readonly now: () => Date;
  private readonly nextAuditId: () => string;

  constructor(private readonly dependencies: KnowledgeEvolutionServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.nextAuditId = dependencies.nextAuditId ?? randomUUID;
  }

  async discover(input: { ticketId?: TicketId; includeGpt: boolean; actorId: string }): Promise<KnowledgeDiscoveryServiceResult> {
    assertActor(input.actorId);
    const [tickets, diagnoses, approved, articles, existing] = await Promise.all([
      this.dependencies.tickets.snapshot(),
      this.dependencies.diagnoses.list(),
      this.dependencies.objects.listApproved(),
      this.dependencies.knowledge.list(),
      this.dependencies.objects.listCandidates(),
    ]);
    const selectedTicket = input.ticketId === undefined
      ? undefined
      : await this.dependencies.tickets.get(input.ticketId);
    const discovery = discoverCandidates({ ticket: selectedTicket, tickets, diagnoses, approved });
    const gptAdvisory: KnowledgeDiscoveryServiceResult["gptAdvisory"] = {
      requested: input.includeGpt,
      status: "not-used",
    };
    const existingIds = new Set(existing.map((candidate) => candidate.id));
    const candidates = discovery.candidates
      .map((candidate) => deterministicCandidate(candidate.id, candidate.score, candidate.reasons, candidate.contradictions, candidate.supportCount, candidate.support, candidate.meetsAlertThreshold, diagnoses, this.now().toISOString()))
      .filter((candidate): candidate is KnowledgeCandidate => candidate !== undefined);

    if (input.includeGpt && this.dependencies.draftProvider !== undefined) {
      const draft = await draftKnowledgeCandidate({
        discovery,
        allowedEvidenceIds: unique(diagnoses.flatMap((diagnosis) => diagnosis.evidenceIds)),
        allowedKnowledgeArticleIds: articles.map((article) => article.id),
        actorId: input.actorId,
      }, this.dependencies.draftProvider);
      if (draft.used && draft.candidate !== undefined) {
        const sourceId = discovery.candidates[0]?.id;
        if (sourceId !== undefined) {
          const source = discovery.candidates[0];
          const candidate = candidateFromDraft(sourceId, draft.candidate, draft.provenance, source, diagnoses, this.now().toISOString());
          if (candidate !== undefined) {
            candidates.push(candidate);
            gptAdvisory.status = "used";
            gptAdvisory.candidateId = candidate.id;
          }
        }
      }
    }

    for (const candidate of candidates) {
      if (existingIds.has(candidate.id)) continue;
      await this.dependencies.objects.saveCandidate(candidate);
      existingIds.add(candidate.id);
      await this.appendAudit({
        candidateId: candidate.id,
        action: "candidate-created",
        actor: input.actorId,
        supportIds: supportIds(candidate),
        scores: candidate.deterministicScores,
        provenanceSummary: candidate.provenance.source,
        reviewedFields: [],
        result: "candidate-created",
        notes: candidate.operatorRationale,
      });
    }
    return { ...discovery, gptAdvisory };
  }

  async getCandidate(candidateId: string): Promise<KnowledgeCandidate> {
    return this.dependencies.objects.getCandidate(candidateId);
  }

  async approve(input: { candidateId: string; actorId: string; edits?: CandidateEdits; expectedVersion: number }): Promise<KnowledgeObject> {
    assertActor(input.actorId);
    const candidate = await this.dependencies.objects.getCandidate(input.candidateId);
    assertCurrentVersion(candidate, input.expectedVersion);
    const [approved, diagnoses, tickets] = await Promise.all([
      this.dependencies.objects.listApproved(),
      this.dependencies.diagnoses.list(),
      this.dependencies.tickets.snapshot(),
    ]);
    if (approved.some((object) => object.id === candidate.id)) {
      throw new DomainError("Knowledge candidate has already been promoted.", "REPOSITORY_ERROR");
    }
    const reviewed = applyEdits(candidate, input.edits);
    assertReferences(reviewed, diagnoses, tickets);
    const {
      deterministicScores: _deterministicScores,
      deterministicReasons: _deterministicReasons,
      contradictions: _contradictions,
      validationStatus: _validationStatus,
      gptProvenance: _gptProvenance,
      discovery: _discovery,
      ...approvedFields
    } = reviewed;
    const object: KnowledgeObject = {
      ...approvedFields,
      status: "approved",
      version: 1,
      approval: { approvedBy: input.actorId.trim(), approvedAt: this.now().toISOString() },
    };
    let promoted: KnowledgeObject | undefined;
    try {
      promoted = await this.dependencies.objects.promote(candidate.id, object);
      await this.appendAudit({
        objectId: promoted.id,
        candidateId: candidate.id,
        action: "approved",
        actor: input.actorId,
        supportIds: supportIds(candidate),
        scores: candidate.deterministicScores,
        provenanceSummary: candidate.provenance.source,
        reviewedFields: input.edits === undefined ? [] : Object.keys(input.edits).sort(),
        result: "approved",
        notes: reviewed.operatorRationale,
      });
      return promoted;
    } catch (error) {
      if (promoted !== undefined) {
        try { await this.dependencies.objects.removeApproved(candidate.id); }
        catch { throw new DomainError("Approved knowledge object could not be rolled back after audit failure.", "REPOSITORY_ERROR"); }
      }
      throw error;
    }
  }

  async reject(input: { candidateId: string; actorId: string; reason: string; expectedVersion: number }): Promise<void> {
    assertActor(input.actorId);
    const candidate = await this.dependencies.objects.getCandidate(input.candidateId);
    assertCurrentVersion(candidate, input.expectedVersion);
    const reason = nonBlank(input.reason, "A rejection reason is required.");
    await this.appendTerminalAudit({
      candidateId: candidate.id,
      action: "rejected",
      actor: input.actorId,
      supportIds: supportIds(candidate),
      scores: candidate.deterministicScores,
      provenanceSummary: candidate.provenance.source,
      reviewedFields: [],
      result: "rejected",
      rejectionReason: reason,
      notes: reason,
    });
  }

  async defer(input: { candidateId: string; actorId: string; expectedVersion: number }): Promise<void> {
    assertActor(input.actorId);
    const candidate = await this.dependencies.objects.getCandidate(input.candidateId);
    assertCurrentVersion(candidate, input.expectedVersion);
    await this.appendTerminalAudit({
      candidateId: candidate.id,
      action: "deferred",
      actor: input.actorId,
      supportIds: supportIds(candidate),
      scores: candidate.deterministicScores,
      provenanceSummary: candidate.provenance.source,
      reviewedFields: [],
      result: "deferred",
      notes: "Review deferred without changing the candidate.",
    });
  }

  private async appendAudit(event: Omit<KnowledgeAuditEvent, "id" | "timestamp">): Promise<void> {
    await this.dependencies.audits.append({ ...event, id: this.nextAuditId(), timestamp: this.now().toISOString() });
  }

  private async appendTerminalAudit(event: Omit<KnowledgeAuditEvent, "id" | "timestamp">): Promise<void> {
    const appended = await this.dependencies.audits.appendIfNoPriorAction({ ...event, id: this.nextAuditId(), timestamp: this.now().toISOString() });
    if (!appended) throw new DomainError("Knowledge candidate has already received this review action.", "STALE_APPROVAL");
  }
}

function deterministicCandidate(
  sourceId: string,
  confidence: number,
  reasons: readonly string[],
  contradictions: readonly string[],
  support: number,
  records: ReadonlyArray<{ source: "completed-diagnosis" | "open-ticket"; diagnosisId?: string; ticketId: string; score: number; reasons: readonly string[] }>,
  meetsAlertThreshold: boolean,
  diagnoses: readonly CompletedDiagnosis[],
  recordedAt: string,
): KnowledgeCandidate | undefined {
  const diagnosisIds = unique(records.flatMap((record) => record.source === "completed-diagnosis" && record.diagnosisId !== undefined ? [record.diagnosisId] : []));
  const ticketIds = unique(records.map((record) => record.ticketId));
  const diagnosis = diagnoses.find((item) => item.id === diagnosisIds[0]);
  if (diagnosis === undefined || diagnosisIds.length === 0 || ticketIds.length === 0) return undefined;
  const value = {
    id: `known-cause-${sourceId}`,
    kind: "known-cause" as const,
    name: `Recurring ${diagnosis.ownerTeam} known cause`,
    summary: diagnosis.problem,
    triggerPatterns: diagnosis.symptoms,
    evidencePolicy: { mode: "required" as const, evidenceIds: diagnosis.evidenceIds },
    timeConstraints: ["Apply only when the cited evidence is present."],
    diagnosticSteps: ["Review the cited evidence and compare it with the completed incident."],
    fixSteps: diagnosis.fixSteps,
    verificationSteps: diagnosis.verificationSteps,
    customerSafeExplanation: "We identified a recurring issue and are reviewing the appropriate correction.",
    operatorRationale: "Deterministic candidate derived from completed diagnosis support.",
    owner: diagnosis.ownerTeam,
    version: 1,
    status: "candidate" as const,
    supportingDiagnosisIds: diagnosisIds,
    supportingTicketIds: ticketIds,
    provenance: { source: "completed-diagnoses", recordedAt },
    deterministicScores: { confidence, support },
    deterministicReasons: reasons.length > 0 ? [...reasons] : ["Completed diagnosis support is available."],
    discovery: discoverySummary({ score: confidence, reasons, support: records, supportCount: support, contradictions, meetsAlertThreshold }),
    contradictions: [...contradictions],
    validationStatus: "valid" as const,
  };
  const parsed = KnowledgeCandidateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function candidateFromDraft(
  sourceId: string,
  draft: CandidateDraftPayload,
  provenance: Awaited<ReturnType<typeof draftKnowledgeCandidate>>["provenance"],
  discovery: KnowledgeDiscoveryResult["candidates"][number] | undefined,
  diagnoses: readonly CompletedDiagnosis[],
  recordedAt: string,
): KnowledgeCandidate | undefined {
  const { knowledgeArticleIds: _knowledgeArticleIds, confidence, rationale, ...fields } = draft;
  const owner = diagnoses.find((diagnosis) => diagnosis.id === draft.supportingDiagnosisIds[0])?.ownerTeam;
  if (owner === undefined) return undefined;
  const value = {
    ...fields,
    id: `known-cause-gpt-${sourceId}`,
    owner,
    version: 1,
    status: "candidate" as const,
    provenance: { source: "gpt-advisory", recordedAt, ...(provenance?.rationale === undefined ? {} : { reference: provenance.rationale }) },
    deterministicScores: { confidence: discovery?.score ?? confidence, support: discovery?.supportCount ?? draft.supportingDiagnosisIds.length },
    deterministicReasons: discovery?.reasons ?? [rationale],
    discovery: discovery === undefined ? undefined : discoverySummary(discovery),
    gptProvenance: provenance === undefined ? undefined : { provider: "openai" as const, model: provenance.model ?? "unspecified", generatedAt: recordedAt, summary: provenance.rationale ?? "Validated advisory candidate draft.", confidence },
    validationStatus: "valid" as const,
  };
  const parsed = KnowledgeCandidateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function discoverySummary(discovery: {
  score: number;
  reasons: readonly string[];
  support: ReadonlyArray<{ source: "completed-diagnosis" | "open-ticket"; diagnosisId?: string; ticketId: string; score: number; reasons: readonly string[] }>;
  supportCount: number;
  contradictions: readonly string[];
  meetsAlertThreshold: boolean;
}) {
  return {
    score: discovery.score,
    reasons: [...discovery.reasons],
    support: discovery.support.map((support) => ({ ...support, reasons: [...support.reasons] })),
    supportCount: discovery.supportCount,
    contradictions: [...discovery.contradictions],
    meetsAlertThreshold: discovery.meetsAlertThreshold,
  };
}

function applyEdits(candidate: KnowledgeCandidate, edits: CandidateEdits | undefined): KnowledgeCandidate {
  if (edits === undefined) return candidate;
  if (typeof edits !== "object" || edits === null || Array.isArray(edits) || Object.keys(edits).some((field) => !editableFields.includes(field as (typeof editableFields)[number]))) {
    throw new DomainError("Knowledge candidate edits are invalid.", "INVALID_APPROVAL_FIELDS");
  }
  const parsed = KnowledgeCandidateSchema.safeParse({ ...candidate, ...edits });
  if (!parsed.success) throw new DomainError("Knowledge candidate edits are invalid.", "INVALID_APPROVAL_FIELDS");
  return parsed.data;
}

function assertReferences(candidate: KnowledgeCandidate, diagnoses: readonly CompletedDiagnosis[], tickets: readonly Ticket[]): void {
  const diagnosisById = new Map(diagnoses.map((diagnosis) => [diagnosis.id, diagnosis]));
  if (candidate.supportingDiagnosisIds.some((id) => !diagnosisById.has(id)) || candidate.supportingTicketIds.some((id) => !tickets.some((ticket) => ticket.id === id))) {
    throw new DomainError("Knowledge candidate references are invalid.", "INVALID_APPROVAL_FIELDS");
  }
  if (candidate.supportingDiagnosisIds.some((id) => !candidate.supportingTicketIds.includes(diagnosisById.get(id)!.ticketId))) {
    throw new DomainError("Knowledge candidate references are invalid.", "INVALID_APPROVAL_FIELDS");
  }
  const allowedEvidence = new Set(candidate.supportingDiagnosisIds.flatMap((id) => diagnosisById.get(id)?.evidenceIds ?? []));
  if (candidate.evidencePolicy.mode === "required" && candidate.evidencePolicy.evidenceIds.some((id) => !allowedEvidence.has(id))) {
    throw new DomainError("Knowledge candidate references are invalid.", "INVALID_APPROVAL_FIELDS");
  }
}

function assertActor(actor: string): void { nonBlank(actor, "An actor is required."); }

function nonBlank(value: string, message: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new DomainError(message, "INVALID_APPROVAL_FIELDS");
  return value.trim();
}

function assertCurrentVersion(candidate: KnowledgeCandidate, expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== candidate.version) throw new DomainError("Knowledge candidate version is stale.", "STALE_APPROVAL");
}

function supportIds(candidate: KnowledgeCandidate): string[] { return unique([...candidate.supportingDiagnosisIds, ...candidate.supportingTicketIds]); }
function unique(values: readonly string[]): string[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
