import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { KnowledgeEvolutionService } from "../src/knowledge-evolution/service.js";
import { KnowledgeCandidateWriteSchema, KnowledgeObjectWriteSchema, type KnowledgeCandidate, type KnowledgeObject } from "../src/knowledge-evolution/domain.js";
import { SqliteKnowledgeEvolutionStore } from "../src/knowledge-evolution/sqlite-knowledge-evolution-store.js";
import { SqliteLearningLedger } from "../src/knowledge-evolution/sqlite-learning-ledger.js";
import { knowledgeHoldoutFixtures, type KnowledgeHoldoutFixture } from "../src/knowledge-evolution/holdout-fixtures.js";
import { evaluateKnowledgeHoldoutFixture, scoreKnowledgeHoldoutResults, type HoldoutStateSnapshot, type IsolatedHoldoutLane } from "../src/knowledge-evolution/holdout-evaluation.js";
import { renderControlledKnowledgeHoldoutMarkdown, toControlledKnowledgeHoldoutReport, type ControlledKnowledgeHoldoutReport } from "../src/knowledge-evolution/holdout-report.js";
import type { KnowledgeAuditEvent } from "../src/knowledge-evolution/knowledge-audit-repository.js";
import type { LearningEvent } from "../src/knowledge-evolution/learning-ledger.js";

const frozenTime = "2026-08-08T12:00:00.000Z";

export async function runControlledKnowledgeHoldout(input: {
  reportDirectory?: string;
} = {}): Promise<ControlledKnowledgeHoldoutReport> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "controlled-knowledge-holdout-"));
  const reportDirectory = input.reportDirectory ?? resolve(process.cwd(), "reports", "knowledge-holdout");
  try {
    const entries = [];
    for (const fixture of knowledgeHoldoutFixtures()) {
      const lane = await createIsolatedLane(fixture, temporaryRoot);
      try {
        const reusableKnowledge = await lane.knowledgeEvolution.listReusableApproved({ asOf: frozenTime });
        const evaluation = await evaluateKnowledgeHoldoutFixture({
          fixture,
          knowledgeEvolution: lane.knowledgeEvolution,
          allKnowledgeArticles: [],
          asOf: frozenTime,
          actor: "controlled-holdout-evaluator",
          snapshot: lane.snapshot,
          createIsolatedLane: async () => lane,
        });
        entries.push({ fixture, reusableKnowledge, evaluation });
      } finally {
        lane.close();
      }
    }
    const scored = scoreKnowledgeHoldoutResults(entries.map(({ fixture, evaluation }) => ({ fixture, ...evaluation })));
    const cases = entries.map((entry) => {
      const score = scored.cases.find(({ fixtureId }) => fixtureId === entry.fixture.id);
      if (score === undefined) throw new Error(`Missing score for ${entry.fixture.id}.`);
      return { ...entry, delta: score.delta, comparison: score.comparison };
    });
    const report = toControlledKnowledgeHoldoutReport({ asOf: frozenTime, clock: frozenTime, cases, scorecard: {
      efficacy: scored.efficacy, governance: scored.governance, version: scored.version,
    } });
    assertSafeReadOnly(report);
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(join(reportDirectory, "controlled-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(join(reportDirectory, "controlled-latest.md"), `${renderControlledKnowledgeHoldoutMarkdown(report)}\n`, "utf8");
    return report;
  } finally {
    await removeTemporaryRoot(temporaryRoot);
  }
}

async function createIsolatedLane(fixture: KnowledgeHoldoutFixture, temporaryRoot: string): Promise<IsolatedHoldoutLane & { close(): void }> {
  // Each lane owns an isolated, disposable SQLite database; the outer temporary
  // root keeps the CLI's filesystem lifecycle explicit without retaining data.
  void temporaryRoot;
  const ledger = new SqliteLearningLedger(":memory:");
  await ledger.initialize();
  const objects = new SqliteKnowledgeEvolutionStore(ledger.getDatabase());
  await objects.initialize();
  const v1 = object(fixture, 1);
  if (fixture.lifecycle !== "none") {
    const candidate = initialCandidate(v1);
    await objects.saveCandidate(candidate);
    await objects.promote(candidate.id, v1, candidate.version);
    await ledger.append(promoted(1));
  }
  if (fixture.lifecycle === "stale") await ledger.append(stale());
  if (fixture.lifecycle === "contradicted") await ledger.append(contradicted(fixture.initialTicket.id));
  if (fixture.lifecycle === "draft-only") await objects.saveCandidate(draftCandidate(fixture, 2, 1));
  if (fixture.lifecycle === "replacement-draft") {
    const v2 = object(fixture, 2);
    const candidate = draftCandidate(fixture, 2, 1);
    await objects.saveCandidate(candidate);
    await objects.promoteReplacement({
      candidateId: candidate.id,
      approved: withoutVersion(v2),
      expectedCandidateVersion: candidate.version,
      expectedHeadVersion: 1,
      promotionAudit: audit(candidate.id, v2),
      supersededEvent: superseded(),
      promotionEvent: promoted(2, candidate.id),
    });
    await objects.saveCandidate(draftCandidate(fixture, 3, 2));
  }
  const service = new KnowledgeEvolutionService({ objects } as never);
  return {
    knowledgeEvolution: service,
    snapshot: async () => snapshot(fixture, objects),
    close: () => ledger.close(),
  };
}

async function snapshot(fixture: KnowledgeHoldoutFixture, objects: SqliteKnowledgeEvolutionStore): Promise<HoldoutStateSnapshot> {
  const [events, candidates, versions, heads, audits] = await Promise.all([
    objects.snapshotForReuse(frozenTime), objects.listCandidates(), objects.listVersions("credential-rotation"), objects.listHeadMappings(), objects.list(),
  ]);
  return {
    ticketRevisions: [{ ticketId: fixture.initialTicket.id, revision: fixture.initialTicket.revision }],
    recommendationCount: 0,
    operationalAuditCount: audits.length,
    learningEventIds: events.events.map(({ id }) => id),
    candidateIds: candidates.map(({ id }) => id),
    versionIds: versions.map(({ id, version }) => `${id}:${version}`),
    heads: [...heads].map(([objectId, headVersion]) => ({ objectId, headVersion })),
  };
}

function object(fixture: KnowledgeHoldoutFixture, version: number): KnowledgeObject {
  return KnowledgeObjectWriteSchema.parse({
    id: "credential-rotation", version, learningGovernance: "ledger", kind: "known-cause",
    name: "Credential rotation request failure", summary: `Approved credential rotation guidance version ${version}.`,
    triggerPatterns: ["Credential rotation request fails"], evidencePolicy: { mode: "required", evidenceIds: ["request-id"] },
    timeConstraints: ["Apply when the request failure matches the known condition."], diagnosticSteps: ["Review the request identifier."],
    fixSteps: ["Refresh the credential."], verificationSteps: ["Verify the next request."],
    customerSafeExplanation: "We found a recurring credential condition and will review the safe correction.",
    operatorRationale: "The approved version requires a request identifier.", owner: "api-platform", supportingDiagnosisIds: ["diagnosis-credential-rotation"],
    supportingTicketIds: [fixture.initialTicket.id], provenance: { source: "fixed-holdout", recordedAt: "2026-08-08T08:00:00.000Z" },
    status: "approved", approval: { approvedBy: "support-lead", approvedAt: version === 1 ? "2026-08-08T08:00:00.000Z" : frozenTime },
  });
}

function initialCandidate(source: KnowledgeObject): KnowledgeCandidate {
  const { learningGovernance: _governance, status: _status, approval: _approval, ...fields } = source;
  return KnowledgeCandidateWriteSchema.parse({
    ...fields, status: "candidate", objectId: source.id, sourceVersion: 1,
    deterministicScores: { confidence: 0.9, support: 1 }, deterministicReasons: ["Fixed holdout initial candidate."], contradictions: [],
    validationStatus: "valid", evidencePolicyMetadata: { derivedEvidenceIds: ["request-id"], operatorAddedEvidenceIds: [] },
  });
}

function draftCandidate(fixture: KnowledgeHoldoutFixture, revisionVersion: number, sourceVersion: number): KnowledgeCandidate {
  const source = object(fixture, sourceVersion);
  const { learningGovernance: _governance, status: _status, approval: _approval, version: _version, id: _id, ...fields } = source;
  return KnowledgeCandidateWriteSchema.parse({
    ...fields, id: `revision-credential-rotation-v${revisionVersion}`, objectId: "credential-rotation", sourceVersion, version: 1,
    status: "candidate", provenance: { source: "knowledge-version-revision", recordedAt: "2026-08-08T09:00:00.000Z" },
    deterministicScores: { confidence: 0.9, support: 1 }, deterministicReasons: ["Fixed holdout revision candidate."], contradictions: [],
    validationStatus: "valid", evidencePolicyMetadata: { derivedEvidenceIds: ["request-id"], operatorAddedEvidenceIds: [] },
  });
}

function withoutVersion(object: KnowledgeObject): Omit<KnowledgeObject, "version"> { const { version: _version, ...rest } = object; return rest; }
function audit(candidateId: string, object: KnowledgeObject): KnowledgeAuditEvent {
  return { id: "00000000-0000-4000-8005-000000000002", timestamp: frozenTime, objectId: object.id, candidateId, action: "approved", actor: "support-lead", supportIds: ["diagnosis-credential-rotation", object.supportingTicketIds[0]!], scores: { confidence: 0.9 }, provenanceSummary: "fixed-holdout", reviewedFields: [], result: "approved", notes: "Fixed replacement approval." };
}
function eventBase(sourceVersion: number, occurredAt = "2026-08-08T08:00:00.000Z") { return { id: `00000000-0000-4000-8000-${String(sourceVersion).padStart(12, "0")}`, occurredAt, actor: "support-lead", correlationId: "10000000-0000-4000-8000-000000000002", objectId: "credential-rotation", sourceVersion }; }
function promoted(version: number, candidateId = `candidate-credential-rotation-v${version}`): LearningEvent { return { ...eventBase(version, version === 1 ? "2026-08-08T08:00:00.000Z" : frozenTime), id: `00000000-0000-4000-8001-${String(version).padStart(12, "0")}`, candidateId, eventType: "candidate-promoted", payload: { maturity: "promoted", health: "active", provenance: "fixed holdout promotion" } }; }
function stale(): LearningEvent { return { ...eventBase(1), id: "00000000-0000-4000-8002-000000000001", eventType: "knowledge-marked-stale", payload: { health: "stale", staleReasons: ["Fixed holdout stale signal."], provenance: "fixed holdout stale" } }; }
function contradicted(ticketId: string): LearningEvent { return { ...eventBase(1), id: "00000000-0000-4000-8003-000000000001", ticketId, eventType: "knowledge-reuse-failed", payload: { matchReasons: ["same symptom"], failureReason: "Fixed holdout correction rejected reuse.", provenance: "fixed holdout correction" } }; }
function superseded(): LearningEvent { return { ...eventBase(1, frozenTime), id: "00000000-0000-4000-8004-000000000001", eventType: "knowledge-version-superseded", payload: { health: "superseded", replacementVersion: 2, provenance: "fixed holdout replacement" } }; }

function assertSafeReadOnly(report: ControlledKnowledgeHoldoutReport): void {
  const unsafe = report.cases.some((entry) => !entry.readOnly.baseline || !entry.readOnly.learned || entry.learned.turns.some((turn) => turn.unsafeLifecycleViolations.length > 0));
  if (unsafe) {
    const details = report.cases
      .filter((entry) => !entry.readOnly.baseline || !entry.readOnly.learned || entry.learned.turns.some((turn) => turn.unsafeLifecycleViolations.length > 0))
      .map((entry) => ({ fixtureId: entry.fixtureId, readOnly: entry.readOnly, learnedTurns: entry.learned.turns.map((turn) => ({ supportState: turn.supportState, knownCauseRef: turn.knownCauseRef, missingEvidenceIds: turn.missingEvidenceIds })), learnedViolations: entry.learned.turns.flatMap((turn) => turn.unsafeLifecycleViolations) }));
    throw new Error(`Controlled holdout safety or read-only contract failed: ${JSON.stringify(details)}`);
  }
}

async function removeTemporaryRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

async function main(): Promise<void> {
  const report = await runControlledKnowledgeHoldout();
  process.stdout.write(`Controlled knowledge holdout report: ${report.cases.length} fixed cases; safety/read-only contracts passed.\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) void main();
