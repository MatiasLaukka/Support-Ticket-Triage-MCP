import type { Ticket } from "../domain.js";
import { jaccardSimilarity, normalizeTokens } from "../similarity.js";
import type { CompletedDiagnosis, KnowledgeObject } from "./domain.js";

const MAX_CANDIDATES = 5;
const DIAGNOSIS_MATCH_THRESHOLD = 0.55;
const TICKET_CORROBORATION_THRESHOLD = 0.25;
const APPROVED_DUPLICATE_THRESHOLD = 0.4;

export interface KnowledgeDiscoverySupport { source: "completed-diagnosis" | "open-ticket"; diagnosisId?: CompletedDiagnosis["id"]; ticketId: Ticket["id"]; score: number; reasons: string[]; }
export interface KnowledgeDiscoveryCandidate { id: string; score: number; reasons: string[]; support: KnowledgeDiscoverySupport[]; supportCount: number; contradictions: string[]; highValue: boolean; meetsAlertThreshold: boolean; }
export interface KnowledgeDiscoveryResult { candidates: KnowledgeDiscoveryCandidate[]; suppressed: Array<{ candidateId: string; approvedObjectId: KnowledgeObject["id"] }>; }

interface Signals { problem: Set<string>; symptoms: Set<string>; evidence: string[]; owner: string; workflow: Set<string>; events: string[]; knowledge: string[]; time: string[]; ticketLanguage: Set<string>; }
interface Discovered { candidate: KnowledgeDiscoveryCandidate; diagnoses: CompletedDiagnosis[]; signals: Signals; }

export function discoverCandidates(input: { ticket?: Ticket; diagnoses: CompletedDiagnosis[]; tickets: Ticket[]; approved: KnowledgeObject[] }): KnowledgeDiscoveryResult {
  const tickets = uniqueTickets([...input.tickets, ...(input.ticket ? [input.ticket] : [])]);
  const byTicketId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const discovered = diagnosisComponents(input.diagnoses, byTicketId)
    .map((diagnoses) => candidateFor(diagnoses, tickets, byTicketId))
    .filter(({ candidate }) => input.ticket === undefined ||
      candidate.support.some(({ ticketId }) => ticketId === input.ticket!.id))
    .sort((left, right) => orderCandidates(left.candidate, right.candidate))
    .slice(0, MAX_CANDIDATES);
  const candidates: KnowledgeDiscoveryCandidate[] = [];
  const suppressed: KnowledgeDiscoveryResult["suppressed"] = [];
  for (const discoveredCandidate of discovered) {
    const duplicate = input.approved.filter((object) => approvedSimilarity(discoveredCandidate, object) >= APPROVED_DUPLICATE_THRESHOLD).sort((left, right) => left.id.localeCompare(right.id))[0];
    if (duplicate) suppressed.push({ candidateId: discoveredCandidate.candidate.id, approvedObjectId: duplicate.id });
    else candidates.push(discoveredCandidate.candidate);
  }
  return { candidates, suppressed };
}

function diagnosisComponents(diagnoses: readonly CompletedDiagnosis[], tickets: ReadonlyMap<string, Ticket>): CompletedDiagnosis[][] {
  const remaining = [...diagnoses].sort((left, right) => left.id.localeCompare(right.id));
  const components: CompletedDiagnosis[][] = [];
  while (remaining.length > 0) {
    const component = [remaining.shift()!];
    for (let index = 0; index < component.length; index += 1) for (let candidate = remaining.length - 1; candidate >= 0; candidate -= 1) if (diagnosisMatch(component[index]!, remaining[candidate]!, tickets)) component.push(remaining.splice(candidate, 1)[0]!);
    components.push(component.sort((left, right) => left.id.localeCompare(right.id)));
  }
  return components;
}

function candidateFor(diagnoses: CompletedDiagnosis[], tickets: readonly Ticket[], byTicketId: ReadonlyMap<string, Ticket>): Discovered {
  const signals = combinedSignals(diagnoses, byTicketId);
  const pairScores = allPairs(diagnoses).map(([left, right]) => diagnosisScore(left, right, byTicketId));
  const score = pairScores.length === 0 ? 0.4 : average(pairScores.map((pair) => pair.score));
  const candidate: KnowledgeDiscoveryCandidate = {
    id: diagnoses[0]!.id, score: Number(score.toFixed(3)), reasons: uniqueSorted(pairScores.flatMap((pair) => pair.reasons)), support: [], supportCount: diagnoses.length,
    contradictions: contradictionsFor(diagnoses, byTicketId), highValue: new Set(diagnoses.map(({ ticketId }) => ticketId)).size >= 2, meetsAlertThreshold: false,
  };
  const diagnosisSupport = diagnoses.map((diagnosis) => ({ source: "completed-diagnosis" as const, diagnosisId: diagnosis.id, ticketId: diagnosis.ticketId, score, reasons: diagnosisReasons(diagnosis, byTicketId.get(diagnosis.ticketId)) }));
  const corroborating = tickets.filter((ticket) => ticket.status !== "resolved" && !diagnoses.some((diagnosis) => diagnosis.ticketId === ticket.id)).map((ticket) => ({ ticket, score: jaccardSimilarity(signals.ticketLanguage, ticketTokens(ticket)) })).filter(({ score: ticketScore }) => ticketScore >= TICKET_CORROBORATION_THRESHOLD).map(({ ticket, score: ticketScore }) => ({ source: "open-ticket" as const, ticketId: ticket.id, score: ticketScore, reasons: [`ticket-similarity: ${ticketScore.toFixed(3)}`] }));
  candidate.support = [...diagnosisSupport, ...corroborating].sort(orderSupport).slice(0, MAX_CANDIDATES);
  candidate.meetsAlertThreshold = candidate.highValue && candidate.contradictions.length === 0 && score >= DIAGNOSIS_MATCH_THRESHOLD;
  return { candidate, diagnoses, signals };
}

function diagnosisMatch(left: CompletedDiagnosis, right: CompletedDiagnosis, tickets: ReadonlyMap<string, Ticket>): boolean {
  const score = diagnosisScore(left, right, tickets);
  return score.problemSimilarity >= DIAGNOSIS_MATCH_THRESHOLD || score.sharedEvidence.length > 0 || score.sharedEvents.length > 0 || score.sharedKnowledge.length > 0;
}

function diagnosisScore(left: CompletedDiagnosis, right: CompletedDiagnosis, tickets: ReadonlyMap<string, Ticket>) {
  const leftSignals = signalsFor(left, tickets.get(left.ticketId)); const rightSignals = signalsFor(right, tickets.get(right.ticketId));
  const problemSimilarity = jaccardSimilarity(leftSignals.problem, rightSignals.problem);
  const symptomSimilarity = jaccardSimilarity(leftSignals.symptoms, rightSignals.symptoms);
  const diagnosisSimilarity = (problemSimilarity * 0.7) + (symptomSimilarity * 0.3);
  const sharedEvidence = shared(leftSignals.evidence, rightSignals.evidence);
  const workflowSimilarity = jaccardSimilarity(leftSignals.workflow, rightSignals.workflow);
  const sharedEvents = shared(leftSignals.events, rightSignals.events); const sharedKnowledge = shared(leftSignals.knowledge, rightSignals.knowledge); const sharedTime = shared(leftSignals.time, rightSignals.time);
  const ticketSimilarity = jaccardSimilarity(leftSignals.ticketLanguage, rightSignals.ticketLanguage);
  const ownerMatch = leftSignals.owner === rightSignals.owner;
  const score = Math.min(1, diagnosisSimilarity * 0.5 + (sharedEvidence.length ? 0.15 : 0) + (ownerMatch ? 0.05 : 0) + (sharedEvents.length ? 0.1 : 0) + (sharedKnowledge.length ? 0.05 : 0) + workflowSimilarity * 0.1 + (sharedTime.length ? 0.03 : 0) + ticketSimilarity * 0.02);
  return { score, problemSimilarity, sharedEvidence, sharedEvents, sharedKnowledge, reasons: uniqueSorted([
    `diagnosis-similarity: ${diagnosisSimilarity.toFixed(3)}`, ...sharedEvidence.map((id) => `shared-evidence: ${id}`), ...(ownerMatch ? [`shared-owner: ${leftSignals.owner}`] : []), ...sharedEvents.map((id) => `shared-event: ${id}`), ...sharedKnowledge.map((id) => `shared-knowledge: ${id}`), ...sharedTime.map((id) => `shared-time-constraint: ${id}`), ...(workflowSimilarity ? [`workflow-similarity: ${workflowSimilarity.toFixed(3)}`] : []), ...(ticketSimilarity ? [`ticket-language-similarity: ${ticketSimilarity.toFixed(3)}`] : []),
  ]) };
}

function contradictionsFor(diagnoses: readonly CompletedDiagnosis[], tickets: ReadonlyMap<string, Ticket>): string[] {
  const signals = diagnoses.map((diagnosis) => signalsFor(diagnosis, tickets.get(diagnosis.ticketId)));
  const evidence = signals.flatMap(({ evidence: ids }) => ids); const positives = new Set(evidence.filter((id) => !negativeBase(id))); const negative = evidence.map(negativeBase).filter((id): id is string => id !== undefined);
  const evidenceContradictions = negative.filter((id) => positives.has(id)).map((id) => `conflicting-evidence: ${id}`);
  const eventContradictions = allPairs(signals).flatMap(([left, right]) => left.events.length > 0 && right.events.length > 0 && shared(left.events, right.events).length === 0 ? [`conflicting-event: ${left.events[0]} vs ${right.events[0]}`] : []);
  return uniqueSorted([...evidenceContradictions, ...eventContradictions]);
}

function approvedSimilarity(discovered: Discovered, approved: KnowledgeObject): number {
  const approvedEvidence = approved.evidencePolicy.mode === "required" ? approved.evidencePolicy.evidenceIds : [];
  const approvedProblem = normalizeTokens([approved.name, approved.summary, ...approved.triggerPatterns].join(" "));
  const approvedWorkflow = normalizeTokens([...approved.diagnosticSteps, ...approved.fixSteps, ...approved.verificationSteps].join(" "));
  const approvedKnowledge = normalizeTokens([approved.id, ...approved.triggerPatterns, ...approved.diagnosticSteps].join(" "));
  const approvedTime = normalizeTokens(approved.timeConstraints.join(" "));
  const text = Math.max(jaccardSimilarity(discovered.signals.problem, approvedProblem), jaccardSimilarity(discovered.signals.symptoms, approvedProblem));
  const evidence = shared(discovered.signals.evidence, approvedEvidence).length > 0 ? 1 : 0;
  const owner = discovered.signals.owner === approved.owner ? 1 : 0;
  const workflow = jaccardSimilarity(discovered.signals.workflow, approvedWorkflow);
  const identifiers = jaccardSimilarity(normalizeTokens(discovered.signals.events.join(" ")), normalizeTokens(approved.id));
  const knowledge = jaccardSimilarity(normalizeTokens(discovered.signals.knowledge.join(" ")), approvedKnowledge);
  const time = jaccardSimilarity(normalizeTokens(discovered.signals.time.join(" ")), approvedTime);
  return Math.max(evidence, text * 0.45 + owner * 0.1 + workflow * 0.25 + identifiers * 0.08 + knowledge * 0.07 + time * 0.05);
}

function signalsFor(diagnosis: CompletedDiagnosis, ticket?: Ticket): Signals { const tags = ticket?.tags ?? []; return { problem: normalizeTokens(diagnosis.problem), symptoms: normalizeTokens(diagnosis.symptoms.join(" ")), evidence: diagnosis.evidenceIds, owner: diagnosis.ownerTeam, workflow: normalizeTokens([...diagnosis.fixSteps, ...diagnosis.verificationSteps].join(" ")), events: tags.filter((tag) => /^(?:event|known-cause)-/.test(tag)), knowledge: tags.filter((tag) => /^knowledge-/.test(tag)), time: tags.filter((tag) => /^time-/.test(tag)), ticketLanguage: ticket ? ticketTokens(ticket) : normalizeTokens(`${diagnosis.problem} ${diagnosis.symptoms.join(" ")}`) }; }
function combinedSignals(diagnoses: readonly CompletedDiagnosis[], tickets: ReadonlyMap<string, Ticket>): Signals { const all = diagnoses.map((diagnosis) => signalsFor(diagnosis, tickets.get(diagnosis.ticketId))); return { problem: union(all.map(({ problem }) => problem)), symptoms: union(all.map(({ symptoms }) => symptoms)), evidence: uniqueSorted(all.flatMap(({ evidence }) => evidence)), owner: all[0]!.owner, workflow: union(all.map(({ workflow }) => workflow)), events: uniqueSorted(all.flatMap(({ events }) => events)), knowledge: uniqueSorted(all.flatMap(({ knowledge }) => knowledge)), time: uniqueSorted(all.flatMap(({ time }) => time)), ticketLanguage: union(all.map(({ ticketLanguage }) => ticketLanguage)) }; }
function diagnosisReasons(diagnosis: CompletedDiagnosis, ticket?: Ticket): string[] { const signals = signalsFor(diagnosis, ticket); return uniqueSorted([...signals.evidence.map((id) => `evidence: ${id}`), `owner: ${signals.owner}`, ...signals.events.map((id) => `event: ${id}`), ...signals.knowledge.map((id) => `knowledge: ${id}`), ...signals.time.map((id) => `time-constraint: ${id}`)]); }
function negativeBase(value: string): string | undefined { const match = value.match(/^(?:not|no|without|ruled-out)-(.+)$/); return match?.[1]; }
function ticketTokens(ticket: Ticket): Set<string> { return normalizeTokens([ticket.subject, ticket.description, ...ticket.tags].join(" ")); }
function uniqueTickets(tickets: readonly Ticket[]): Ticket[] { return tickets.filter((ticket, index) => tickets.findIndex(({ id }) => id === ticket.id) === index); }
function shared(left: readonly string[], right: readonly string[]): string[] { return left.filter((value) => right.includes(value)).sort((a, b) => a.localeCompare(b)); }
function uniqueSorted(values: readonly string[]): string[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function union(values: readonly ReadonlySet<string>[]): Set<string> { return new Set(values.flatMap((value) => [...value])); }
function average(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }
function allPairs<T>(values: readonly T[]): Array<[T, T]> { const pairs: Array<[T, T]> = []; for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) pairs.push([values[left]!, values[right]!]); return pairs; }
function orderCandidates(left: KnowledgeDiscoveryCandidate, right: KnowledgeDiscoveryCandidate): number { return right.score - left.score || left.id.localeCompare(right.id); }
function orderSupport(left: KnowledgeDiscoverySupport, right: KnowledgeDiscoverySupport): number { return right.score - left.score || left.source.localeCompare(right.source) || (left.diagnosisId ?? left.ticketId).localeCompare(right.diagnosisId ?? right.ticketId); }
