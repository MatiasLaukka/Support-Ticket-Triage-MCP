import type { Ticket } from "../domain.js";
import { jaccardSimilarity, normalizeTokens } from "../similarity.js";
import type { CompletedDiagnosis, KnowledgeObject } from "./domain.js";

const MAX_CANDIDATES = 5;
const DIAGNOSIS_MATCH_THRESHOLD = 0.55;
const TICKET_CORROBORATION_THRESHOLD = 0.25;
const APPROVED_DUPLICATE_THRESHOLD = 0.4;

export interface KnowledgeDiscoverySupport {
  source: "completed-diagnosis" | "open-ticket";
  diagnosisId?: CompletedDiagnosis["id"];
  ticketId: Ticket["id"];
  score: number;
  reasons: string[];
}

export interface KnowledgeDiscoveryCandidate {
  id: string;
  score: number;
  reasons: string[];
  support: KnowledgeDiscoverySupport[];
  supportCount: number;
  contradictions: string[];
  highValue: boolean;
  meetsAlertThreshold: boolean;
}

export interface KnowledgeDiscoveryResult {
  candidates: KnowledgeDiscoveryCandidate[];
  suppressed: Array<{ candidateId: string; approvedObjectId: KnowledgeObject["id"] }>;
}

export function discoverCandidates(input: {
  ticket?: Ticket;
  diagnoses: CompletedDiagnosis[];
  tickets: Ticket[];
  approved: KnowledgeObject[];
}): KnowledgeDiscoveryResult {
  const components = diagnosisComponents(input.diagnoses);
  const discovered = components
    .map((diagnoses) => candidateFor(diagnoses, input.tickets, input.ticket))
    .filter((candidate): candidate is KnowledgeDiscoveryCandidate => candidate !== undefined)
    .sort(orderCandidates)
    .slice(0, MAX_CANDIDATES);

  const candidates: KnowledgeDiscoveryCandidate[] = [];
  const suppressed: KnowledgeDiscoveryResult["suppressed"] = [];
  for (const candidate of discovered) {
    const duplicate = input.approved
      .filter((object) => approvedSimilarity(candidate, object) >= APPROVED_DUPLICATE_THRESHOLD)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (duplicate) {
      suppressed.push({ candidateId: candidate.id, approvedObjectId: duplicate.id });
    } else {
      candidates.push(candidate);
    }
  }
  return { candidates, suppressed };
}

function diagnosisComponents(diagnoses: readonly CompletedDiagnosis[]): CompletedDiagnosis[][] {
  const remaining = [...diagnoses].sort((left, right) => left.id.localeCompare(right.id));
  const components: CompletedDiagnosis[][] = [];
  while (remaining.length > 0) {
    const component = [remaining.shift()!];
    for (let index = 0; index < component.length; index += 1) {
      for (let candidate = remaining.length - 1; candidate >= 0; candidate -= 1) {
        if (diagnosisMatch(component[index]!, remaining[candidate]!)) {
          component.push(remaining[candidate]!);
          remaining.splice(candidate, 1);
        }
      }
    }
    components.push(component.sort((left, right) => left.id.localeCompare(right.id)));
  }
  return components;
}

function candidateFor(diagnoses: CompletedDiagnosis[], tickets: readonly Ticket[], inputTicket?: Ticket): KnowledgeDiscoveryCandidate | undefined {
  if (diagnoses.length === 0) return undefined;
  const pairScores = allPairs(diagnoses).map(([left, right]) => diagnosisScore(left, right));
  const score = pairScores.length === 0 ? 0.4 : average(pairScores.map((pair) => pair.score));
  const reasons = uniqueSorted(pairScores.flatMap((pair) => pair.reasons));
  const support: KnowledgeDiscoverySupport[] = diagnoses.map((diagnosis) => ({
    source: "completed-diagnosis",
    diagnosisId: diagnosis.id,
    ticketId: diagnosis.ticketId,
    score,
    reasons: diagnosisReasons(diagnosis),
  }));
  const candidateTokens = normalizeTokens(diagnoses.map(diagnosisText).join(" "));
  const corroboratingTickets = [...tickets, ...(inputTicket ? [inputTicket] : [])]
    .filter((ticket, index, list) => ticket.status !== "resolved" && list.findIndex(({ id }) => id === ticket.id) === index)
    .filter((ticket) => !diagnoses.some((diagnosis) => diagnosis.ticketId === ticket.id))
    .map((ticket) => ({ ticket, score: jaccardSimilarity(candidateTokens, ticketTokens(ticket)) }))
    .filter(({ score: ticketScore }) => ticketScore >= TICKET_CORROBORATION_THRESHOLD)
    .sort((left, right) => right.score - left.score || left.ticket.id.localeCompare(right.ticket.id))
    .slice(0, MAX_CANDIDATES);
  for (const { ticket, score: ticketScore } of corroboratingTickets) {
    support.push({ source: "open-ticket", ticketId: ticket.id, score: ticketScore, reasons: [`ticket-similarity: ${ticketScore.toFixed(3)}`] });
  }
  const contradictions = contradictionsFor(diagnoses);
  const highValue = new Set(diagnoses.map((diagnosis) => diagnosis.ticketId)).size >= 2;
  return {
    id: diagnoses[0]!.id,
    score: Number(score.toFixed(3)),
    reasons: uniqueSorted(reasons),
    support,
    supportCount: diagnoses.length,
    contradictions,
    highValue,
    meetsAlertThreshold: highValue && contradictions.length === 0 && score >= DIAGNOSIS_MATCH_THRESHOLD,
  };
}

function diagnosisMatch(left: CompletedDiagnosis, right: CompletedDiagnosis): boolean {
  const similarity = jaccardSimilarity(normalizeTokens(diagnosisText(left)), normalizeTokens(diagnosisText(right)));
  return similarity >= DIAGNOSIS_MATCH_THRESHOLD || shared(left.evidenceIds, right.evidenceIds).length > 0;
}

function diagnosisScore(left: CompletedDiagnosis, right: CompletedDiagnosis): { score: number; reasons: string[] } {
  const similarity = jaccardSimilarity(normalizeTokens(diagnosisText(left)), normalizeTokens(diagnosisText(right)));
  const sharedEvidence = shared(left.evidenceIds, right.evidenceIds);
  const workflowSimilarity = jaccardSimilarity(normalizeTokens([...left.fixSteps, ...left.verificationSteps].join(" ")), normalizeTokens([...right.fixSteps, ...right.verificationSteps].join(" ")));
  const ownerMatch = left.ownerTeam === right.ownerTeam;
  const score = Math.min(1, similarity * 0.6 + (sharedEvidence.length > 0 ? 0.2 : 0) + workflowSimilarity * 0.15 + (ownerMatch ? 0.05 : 0));
  return {
    score,
    reasons: uniqueSorted([
      `diagnosis-similarity: ${similarity.toFixed(3)}`,
      ...sharedEvidence.map((id) => `shared-evidence: ${id}`),
      ...(ownerMatch ? [`shared-owner: ${left.ownerTeam}`] : []),
      ...(workflowSimilarity > 0 ? [`workflow-similarity: ${workflowSimilarity.toFixed(3)}`] : []),
    ]),
  };
}

function contradictionsFor(diagnoses: readonly CompletedDiagnosis[]): string[] {
  return uniqueSorted(allPairs(diagnoses).flatMap(([left, right]) => [
    ...left.evidenceIds.filter((id) => !right.evidenceIds.includes(id)),
    ...right.evidenceIds.filter((id) => !left.evidenceIds.includes(id)),
  ].map((id) => `conflicting-evidence: ${id}`)));
}

function approvedSimilarity(candidate: KnowledgeDiscoveryCandidate, approved: KnowledgeObject): number {
  const candidateText = candidate.support.filter((support) => support.source === "completed-diagnosis").flatMap((support) => support.reasons).join(" ");
  const approvedText = [approved.name, approved.summary, ...approved.triggerPatterns, ...approved.diagnosticSteps, ...approved.fixSteps, ...approved.verificationSteps].join(" ");
  const textScore = jaccardSimilarity(normalizeTokens(candidateText), normalizeTokens(approvedText));
  const approvedEvidence = approved.evidencePolicy.mode === "required" ? approved.evidencePolicy.evidenceIds : [];
  const candidateEvidence = candidate.reasons.filter((reason) => reason.startsWith("shared-evidence: ")).map((reason) => reason.slice("shared-evidence: ".length));
  return Math.max(textScore, shared(candidateEvidence, approvedEvidence).length > 0 ? 1 : 0);
}

function diagnosisText(diagnosis: CompletedDiagnosis): string { return [diagnosis.problem, ...diagnosis.symptoms].join(" "); }
function ticketTokens(ticket: Ticket): Set<string> { return normalizeTokens([ticket.subject, ticket.description, ...ticket.tags].join(" ")); }
function diagnosisReasons(diagnosis: CompletedDiagnosis): string[] { return [...diagnosis.evidenceIds.map((id) => `evidence: ${id}`), `owner: ${diagnosis.ownerTeam}`]; }
function shared(left: readonly string[], right: readonly string[]): string[] { return left.filter((value) => right.includes(value)).sort((a, b) => a.localeCompare(b)); }
function uniqueSorted(values: readonly string[]): string[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function average(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }
function allPairs<T>(values: readonly T[]): Array<[T, T]> { const pairs: Array<[T, T]> = []; for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) pairs.push([values[left]!, values[right]!]); return pairs; }
function orderCandidates(left: KnowledgeDiscoveryCandidate, right: KnowledgeDiscoveryCandidate): number { return right.score - left.score || left.id.localeCompare(right.id); }
