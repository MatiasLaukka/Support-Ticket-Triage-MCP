import { mkdtemp, rm } from "node:fs/promises";
import Database from "better-sqlite3";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditEventSchema, TicketSchema, type AuditEvent, type Ticket } from "../src/domain.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import { authoritativeOperationalAudits, eligibleCompletedDiagnoses } from "../src/knowledge-evolution/completed-diagnosis-source.js";
import {
  OperationalDiagnosisRecordSchema,
  OperationalEventSchema,
  OperationalWorkflowSnapshotSchema,
  type OperationalEvent,
  type OperationalResultReference,
  type OperationalWorkflowSnapshot,
} from "../src/operational/domain.js";
import { OperationalUnitOfWork } from "../src/operational/unit-of-work.js";
import { createRuntimeDependencies, type RuntimeDependencies } from "../src/runtime.js";
import { createTriageServer } from "../src/server.js";

const roots: string[] = [];
const ticketId = "TKT-1010";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("operational knowledge discovery", () => {
  it("rejects discovery when the original diagnosis receipt is missing", () => {
    const diagnosis = diagnosisRecord();
    const event = diagnosisEvent(diagnosis);
    const snapshot = operationalSnapshotWithDiagnosis(
      diagnosis,
      [diagnosis.originalAudit],
      [event],
    );

    expect(() => authoritativeOperationalAudits({ readCommandResults: () => new Map() }, snapshot))
      .toThrow(/persisted diagnosis lifecycle audit/i);
  });

  it("rejects an original diagnosis receipt whose diagnosis payload is redirected", () => {
    const diagnosis = diagnosisRecord();
    const event = diagnosisEvent(diagnosis);
    const redirected = AuditEventSchema.parse({
      ...diagnosis.originalAudit,
      after: {
        ...diagnosis.originalAudit.after,
        diagnosis: {
          ...(diagnosis.originalAudit.after.diagnosis as Record<string, unknown>),
          customerSafeSummary: "A redirected diagnosis payload.",
        },
      },
    });
    const result: OperationalResultReference = {
      operation: "record-diagnosis",
      tickets: [{ ticketId, operationalEventIds: [event.id], resultingRevision: null }],
      diagnosisId: diagnosis.diagnosis.id,
      lifecycleAuditEvents: [redirected],
    };
    const snapshot = operationalSnapshotWithDiagnosis(
      diagnosis,
      [diagnosis.originalAudit],
      [event],
    );

    expect(() => {
      const audits = authoritativeOperationalAudits({
        readCommandResults: () => new Map([[event.commandId, result]]),
      }, snapshot);
      return eligibleCompletedDiagnoses({
        ticket: snapshot.ticket,
        audits,
        diagnoses: snapshot.diagnoses,
        events: snapshot.events,
      });
    }).toThrow(/diagnosis|integrity|causal/i);
  });

  it("rejects an original diagnosis receipt with the wrong command operation", () => {
    const diagnosis = diagnosisRecord();
    const event = diagnosisEvent(diagnosis);
    const result: OperationalResultReference = {
      operation: "review-diagnosis",
      tickets: [{ ticketId, operationalEventIds: [event.id], resultingRevision: null }],
      diagnosisId: diagnosis.diagnosis.id,
      lifecycleAuditEvents: [diagnosis.originalAudit],
    };
    const snapshot = operationalSnapshotWithDiagnosis(
      diagnosis,
      [diagnosis.originalAudit],
      [event],
    );

    expect(() => authoritativeOperationalAudits({
      readCommandResults: () => new Map([[event.commandId, result]]),
    }, snapshot))
      .toThrow(/operation|command/i);
  });

  it("rejects a schema-valid diagnosis row that disagrees with its original receipt", () => {
    const diagnosis = diagnosisRecord();
    const event = diagnosisEvent(diagnosis);
    const redirectedDiagnosis = {
      ...diagnosis,
      diagnosis: {
        ...diagnosis.diagnosis,
        problem: "A different persisted diagnosis.",
      },
    };
    const snapshot = operationalSnapshotWithDiagnosis(
      redirectedDiagnosis,
      [diagnosis.originalAudit],
      [event],
    );

    expect(() => eligibleCompletedDiagnoses({
      ticket: snapshot.ticket,
      audits: authoritativeOperationalAudits({
        readCommandResults: () => new Map([[event.commandId, originReceiptResult(diagnosis, event)]]),
      }, snapshot),
      diagnoses: snapshot.diagnoses,
      events: snapshot.events,
    })).toThrow(/inconsistent|diagnosis|integrity/i);
  });

  it("rejects a review receipt whose nested actor or ticket is redirected", () => {
    const { diagnosis, review, snapshot } = operationalSnapshotWithReview("reject");
    const reviewPayload = review.after.diagnosisReview as Record<string, unknown>;
    const redirected = AuditEventSchema.parse({
      ...review,
      after: {
        ...review.after,
        diagnosisReview: {
          ...reviewPayload,
          ticketId: "TKT-9999",
          actor: "redirected-actor",
        },
      },
    });
    const result: OperationalResultReference = {
      operation: "review-diagnosis",
      tickets: [{ ticketId, operationalEventIds: [review.id], resultingRevision: null }],
      lifecycleAuditEvents: [redirected],
    };

    expect(() => eligibleCompletedDiagnoses({
      ticket: snapshot.ticket,
      audits: authoritativeOperationalAudits({
        readCommandResults: () => new Map([
          [snapshot.events[0]!.commandId, originReceiptResult(diagnosis, snapshot.events[0]!)],
          [snapshot.events[1]!.commandId, result],
        ]),
      }, snapshot),
      diagnoses: snapshot.diagnoses,
      events: snapshot.events,
    })).toThrow(/inconsistent|diagnosis|review/i);
  });

  it("rejects a diagnosis receipt that carries extra ticket or event references", () => {
    const diagnosis = diagnosisRecord();
    const event = diagnosisEvent(diagnosis);
    const result: OperationalResultReference = {
      operation: "record-diagnosis",
      tickets: [
        { ticketId, operationalEventIds: [event.id], resultingRevision: null },
        { ticketId: "TKT-9999", operationalEventIds: ["90000000-0000-4000-8000-000000000003"], resultingRevision: null },
      ],
      diagnosisId: diagnosis.diagnosis.id,
      lifecycleAuditEvents: [diagnosis.originalAudit],
    };
    const snapshot = operationalSnapshotWithDiagnosis(diagnosis, [diagnosis.originalAudit], [event]);

    expect(() => authoritativeOperationalAudits({
      readCommandResults: () => new Map([[event.commandId, result]]),
    }, snapshot)).toThrow(/causal|command|ticket/i);
  });

  it("rejects an original diagnosis event redirected to another ticket", () => {
    const diagnosis = diagnosisRecord();
    const event = diagnosisEvent(diagnosis, { ticketId: "TKT-9999" });
    const snapshot = {
      ...completedDiagnosisSnapshot(diagnosis, [diagnosis.originalAudit]),
      events: [event],
    };

    expect(() => eligibleCompletedDiagnoses(snapshot)).toThrow(/inconsistent|causal|diagnosis/i);
  });

  it("rejects discovery when an authority-bearing diagnosis review receipt is missing", () => {
    const { diagnosis, snapshot } = operationalSnapshotWithReview("reject");
    expect(() => {
      const audits = authoritativeOperationalAudits({
        readCommandResults: () => new Map([
          [snapshot.events[0]!.commandId, originReceiptResult(diagnosis, snapshot.events[0]!)],
        ]),
      }, snapshot);
      return eligibleCompletedDiagnoses({
        ticket: snapshot.ticket,
        audits,
        diagnoses: snapshot.diagnoses,
      });
    }).toThrow(/persisted diagnosis lifecycle audit/i);
    expect(diagnosis.diagnosis.id).toBe("diagnosis-60000000-0000-4000-8000-000000000001");
  });

  it("uses one bulk receipt lookup for all diagnosis lifecycle events", () => {
    const { diagnosis, review, snapshot } = operationalSnapshotWithReview("reject");
    const reviewResult: OperationalResultReference = {
      operation: "review-diagnosis",
      tickets: [{ ticketId, operationalEventIds: [review.id], resultingRevision: null }],
      lifecycleAuditEvents: [review],
    };
    const readCommandResults = vi.fn((commandIds: readonly string[]) => new Map(
      commandIds.map((commandId) => [
        commandId,
        commandId === snapshot.events[0]!.commandId
          ? originReceiptResult(diagnosis, snapshot.events[0]!)
          : reviewResult,
      ] as const),
    ));
    authoritativeOperationalAudits({ readCommandResults }, snapshot);

    expect(readCommandResults).toHaveBeenCalledTimes(1);
    expect(readCommandResults).toHaveBeenCalledWith([
      snapshot.events[0]!.commandId,
      snapshot.events[1]!.commandId,
    ]);
  });

  it("rejects discovery when an authority-bearing diagnosis audit is causally redirected", () => {
    const { snapshot, review } = operationalSnapshotWithReview("reject");
    const redirected = AuditEventSchema.parse({
      ...review,
      action: "diagnosis-invalidated",
    });
    const result: OperationalResultReference = {
      operation: "review-diagnosis",
      tickets: [{ ticketId, operationalEventIds: [review.id], resultingRevision: null }],
      lifecycleAuditEvents: [redirected],
    };

    expect(() => {
      const audits = authoritativeOperationalAudits({
        readCommandResults: () => new Map([
          [snapshot.events[0]!.commandId, originReceiptResult(snapshot.diagnoses[0]!, snapshot.events[0]!)],
          [snapshot.events[1]!.commandId, result],
        ]),
      }, snapshot);
      return eligibleCompletedDiagnoses({
        ticket: snapshot.ticket,
        audits,
        diagnoses: snapshot.diagnoses,
      });
    }).toThrow(/causal event/i);
  });

  it("rejects a receipt whose diagnosis review payload points at another diagnosis", () => {
    const { snapshot, review } = operationalSnapshotWithReview("reject");
    const reviewPayload = review.after.diagnosisReview as Record<string, unknown>;
    const redirected = AuditEventSchema.parse({
      ...review,
      before: { diagnosisId: "diagnosis-60000000-0000-4000-8000-000000000099" },
      after: {
        ...review.after,
        diagnosisReview: {
          ...reviewPayload,
          diagnosisId: "diagnosis-60000000-0000-4000-8000-000000000099",
        },
      },
    });
    const result: OperationalResultReference = {
      operation: "review-diagnosis",
      tickets: [{ ticketId, operationalEventIds: [review.id], resultingRevision: null }],
      lifecycleAuditEvents: [redirected],
    };

    expect(() => {
      const audits = authoritativeOperationalAudits({
        readCommandResults: () => new Map([
          [snapshot.events[0]!.commandId, originReceiptResult(snapshot.diagnoses[0]!, snapshot.events[0]!)],
          [snapshot.events[1]!.commandId, result],
        ]),
      }, snapshot);
      return eligibleCompletedDiagnoses({
        ticket: snapshot.ticket,
        audits,
        diagnoses: snapshot.diagnoses,
        events: snapshot.events,
      });
    }).toThrow(/inconsistent|causal|diagnosis/i);
  });

  it("keeps pending-review and absent-investigation diagnoses advisory-eligible", () => {
    const diagnosis = diagnosisRecord();
    const original = diagnosis.originalAudit;
    const snapshot = completedDiagnosisSnapshot(diagnosis, [original]);

    expect(eligibleCompletedDiagnoses(snapshot)).toEqual([diagnosis.diagnosis]);
  });

  it("preserves the production owner mapping for customer-owned diagnoses", () => {
    const diagnosis = diagnosisRecord({ owner: "customer" });
    expect(eligibleCompletedDiagnoses(completedDiagnosisSnapshot(diagnosis, [diagnosis.originalAudit])))
      .toEqual([diagnosis.diagnosis]);
  });

  it("excludes rejected, invalidated, escalated, and explicitly stale diagnoses without rewriting history", () => {
    const baseline = diagnosisRecord();
    const rejected = diagnosisRecord({ id: "60000000-0000-4000-8000-000000000002" });
    const invalidated = diagnosisRecord({ id: "60000000-0000-4000-8000-000000000003" });
    const escalated = diagnosisRecord({
      id: "60000000-0000-4000-8000-000000000004",
      diagnosticState: "escalated",
    });
    const stale = diagnosisRecord({ id: "60000000-0000-4000-8000-000000000005" });
    const rejectedAudits = [...reviewAudits(rejected.originalAudit, "reject")];
    const invalidatedAudits = [
      invalidated.originalAudit,
      ...reviewAudits(invalidated.originalAudit, "approve"),
      lifecycleAudit("60000000-0000-4000-8000-000000000103", "diagnosis-invalidated", invalidated.originalAudit.id),
    ];
    const staleAudits = reviewAudits(stale.originalAudit, "approve");
    const snapshots = [
      completedDiagnosisSnapshot(baseline, [baseline.originalAudit]),
      completedDiagnosisSnapshot(rejected, [rejected.originalAudit, ...rejectedAudits]),
      completedDiagnosisSnapshot(invalidated, invalidatedAudits),
      completedDiagnosisSnapshot(escalated, [escalated.originalAudit]),
      completedDiagnosisSnapshot(stale, [stale.originalAudit, ...staleAudits], { revision: 1 }),
    ];
    const originalBytes = JSON.stringify(snapshots);

    const eligible = snapshots.flatMap((snapshot) => eligibleCompletedDiagnoses(snapshot));
    expect(eligible.map(({ id }) => id)).toEqual([baseline.diagnosis.id]);
    expect(JSON.stringify(snapshots)).toBe(originalBytes);
  });

  it("does not treat an ineffective fix as diagnosis invalidation and accepts revalidation", () => {
    const diagnosis = diagnosisRecord({ id: "60000000-0000-4000-8000-000000000006" });
    const audits = [
      diagnosis.originalAudit,
      ...reviewAudits(diagnosis.originalAudit, "revalidate"),
      lifecycleAudit("60000000-0000-4000-8000-000000000104", "fix-ineffective", diagnosis.originalAudit.id),
    ];

    expect(eligibleCompletedDiagnoses(completedDiagnosisSnapshot(diagnosis, audits))).toEqual([diagnosis.diagnosis]);
  });

  it("rejects an invalidation receipt whose source revision disagrees with its event", () => {
    const diagnosis = diagnosisRecord();
    const event = diagnosisEvent(diagnosis, {
      id: "60000000-0000-4000-8000-000000000103",
      sequence: 2,
      commandId: "90000000-0000-4000-8000-000000000002",
      action: "diagnosis-invalidated",
      facts: {
        diagnosisId: diagnosis.originalAudit.id,
        outcome: "invalidated",
        sourceRevision: 2,
      },
    });
    const invalidation = AuditEventSchema.parse({
      id: event.id,
      timestamp: event.occurredAt,
      actor: event.actor,
      action: event.action,
      ticketId,
      before: { diagnosisId: diagnosis.originalAudit.id, sourceTicketRevision: 1 },
      after: { diagnosisInvalidated: true },
      rationale: "A persisted invalidation.",
      knowledgeArticleIds: [],
      result: "success",
    });
    const result: OperationalResultReference = {
      operation: "invalidate-diagnosis",
      tickets: [{ ticketId, operationalEventIds: [event.id], resultingRevision: null }],
      lifecycleAuditEvents: [invalidation],
    };
    const snapshot = operationalSnapshotWithDiagnosis(
      diagnosis,
      [diagnosis.originalAudit, invalidation],
      [diagnosisEvent(diagnosis), event],
    );
    expect(() => {
      const audits = authoritativeOperationalAudits({
        readCommandResults: () => new Map([
          [snapshot.events[0]!.commandId, originReceiptResult(diagnosis, snapshot.events[0]!)],
          [snapshot.events[1]!.commandId, result],
        ]),
      }, snapshot);
      return eligibleCompletedDiagnoses({
        ticket: snapshot.ticket,
        audits,
        diagnoses: snapshot.diagnoses,
        events: snapshot.events,
      });
    }).toThrow(/revision|invalidation|causal/i);
  });

  it("discovers a completed diagnosis through the runtime-created knowledge service", async () => {
    const root = await mkdtemp(join(tmpdir(), "operational-knowledge-discovery-"));
    roots.push(root);
    const operationalDatabase = join(root, "operational.sqlite");
    const env = {
      TRIAGE_DATA_ROOT: root,
      TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      TRIAGE_LEARNING_LEDGER_PATH: join(root, "knowledge-evolution", "learning.sqlite"),
      OPERATIONAL_DB_PATH: operationalDatabase,
    };
    resetOperationalDemoState({ operationalDatabase, seedFile: env.TRIAGE_SEED_FILE, dataRoot: root });

    let currentTime = Date.parse("2026-08-13T10:00:00.000Z");
    const now = () => new Date(currentTime);
    const runtime = await createRuntimeDependencies({ env, now });
    const server = createApprovalDeskHttpServer(runtime);
    const baseUrl = await listen(server);

    try {
      const initialEvaluation = await requestJson(baseUrl, `/api/tickets/${ticketId}/recommendations`, {
        method: "POST",
        headers: commandHeaders(1),
        body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }),
      }, 201);
      let recommendation = initialEvaluation.recommendation;

      currentTime += 60_000;
      await requestJson(baseUrl, `/api/recommendations/${recommendation.id}/approve`, {
        method: "POST",
        headers: commandHeaders(2),
        body: JSON.stringify({
          ticketId,
          expectedRevision: recommendation.sourceRevision,
          approvedFields: ["category", "priority", "team", "customerResponse"],
          editedCustomerResponse: recommendation.draftCustomerResponse,
          actor: "restart-reviewer",
          confirm: true,
        }),
      }, 200);

      currentTime += 60_000;
      await requestJson(baseUrl, `/api/recommendations/${recommendation.id}/mark-sent`, {
        method: "POST",
        headers: commandHeaders(3),
        body: JSON.stringify({ ticketId, actor: "restart-reviewer", automaticReplyEnabled: false }),
      }, 200);

      currentTime += 60_000;
      await requestJson(baseUrl, `/api/tickets/${ticketId}/customer-replies`, {
        method: "POST",
        headers: commandHeaders(4),
        body: JSON.stringify({
          actor: "Jamie Lee",
          source: "manual",
          body: "The campaign name is Summer Flash Sale. The failure timestamp was 2026-08-13 09:55 UTC. I use Chrome, and the page is still blank in a private window after signing out and back in. Microsoft Edge is also blank, another admin sees the same result, and the browser console shows ChunkLoadError. The affected scope appears to be 12 profiles in the latest export.",
        }),
      }, 201);

      currentTime += 60_000;
      const evidenceEvaluation = await requestJson(baseUrl, `/api/tickets/${ticketId}/recommendations`, {
        method: "POST",
        headers: commandHeaders(5),
        body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }),
      }, 201);
      recommendation = evidenceEvaluation.recommendation;

      currentTime += 60_000;
      await requestJson(baseUrl, `/api/recommendations/${recommendation.id}/approve`, {
        method: "POST",
        headers: commandHeaders(6),
        body: JSON.stringify({
          ticketId,
          expectedRevision: recommendation.sourceRevision,
          approvedFields: ["category", "priority", "team", "customerResponse"],
          editedCustomerResponse: recommendation.draftCustomerResponse,
          actor: "restart-reviewer",
          confirm: true,
        }),
      }, 200);

      currentTime += 60_000;
      await requestJson(baseUrl, `/api/recommendations/${recommendation.id}/mark-sent`, {
        method: "POST",
        headers: commandHeaders(7),
        body: JSON.stringify({ ticketId, actor: "restart-reviewer", automaticReplyEnabled: false }),
      }, 200);

      currentTime += 60_000;
      const recorded = await requestJson(baseUrl, `/api/tickets/${ticketId}/diagnosis`, {
        method: "POST",
        headers: commandHeaders(8),
        body: JSON.stringify({ actor: "product-support" }),
      }, 201);

      expect(operationalStore(runtime).readWorkflowSnapshot(ticketId).diagnoses).toHaveLength(1);
      const result = await runtime.knowledgeEvolution.service.discover({
        includeGpt: false,
        actorId: "support-lead",
      });

      expect(result.candidates).toHaveLength(1);
      const candidate = await runtime.knowledgeEvolution.service.getCandidate(
        `known-cause-diagnosis-${recorded.auditEvent.id}`,
      );
      expect(candidate.supportingDiagnosisIds).toContain(`diagnosis-${recorded.auditEvent.id}`);

      const diagnosisEvent = operationalStore(runtime).readWorkflowSnapshot(ticketId).events
        .find(({ id }) => id === recorded.auditEvent.id);
      expect(diagnosisEvent).toBeDefined();
      const bulkReceiptRead = vi.spyOn(OperationalUnitOfWork.prototype, "readCommandResults");
      try {
        await runtime.knowledgeEvolution.service.discover({
          includeGpt: false,
          actorId: "support-lead",
        });
        expect(bulkReceiptRead).toHaveBeenCalledTimes(1);
        expect(bulkReceiptRead.mock.calls[0]?.[0]).toEqual([diagnosisEvent!.commandId]);
      } finally {
        bulkReceiptRead.mockRestore();
      }
      const database = new Database(operationalDatabase);
      try {
        database.pragma("foreign_keys = OFF");
        database.prepare("UPDATE diagnoses SET operational_event_id = ? WHERE id = ?")
          .run("ffffffff-ffff-4fff-8fff-ffffffffffff", `diagnosis-${recorded.auditEvent.id}`);
      } finally {
        database.close();
      }
      await expect(runtime.knowledgeEvolution.service.discover({
        includeGpt: false,
        actorId: "support-lead",
      })).rejects.toMatchObject({ code: "PERSISTENCE_ERROR" });

      const mcpServer = createTriageServer(runtime);
      const client = new Client({ name: "operational-discovery-integrity", version: "1.0.0" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await mcpServer.connect(serverTransport);
      await client.connect(clientTransport);
      try {
        const httpCorruption = await fetch(`${baseUrl}/api/knowledge-candidates`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actor: "support-lead", includeGpt: false }),
        });
        const httpBody = await httpCorruption.json() as { error?: { code?: string } };
        expect(httpCorruption.status).toBe(500);
        expect(httpBody).toEqual({ error: expect.objectContaining({ code: "OPERATIONAL_INTEGRITY_ERROR" }) });

        const mcpCorruption = await client.callTool({
          name: "discover_knowledge_candidates",
          arguments: { actor: "support-lead", includeGpt: false },
        });
        expect(mcpCorruption.isError).toBe(true);
        expect(JSON.stringify(mcpCorruption)).toContain("OPERATIONAL_INTEGRITY_ERROR");
      } finally {
        await Promise.allSettled([client.close(), mcpServer.close()]);
      }

      const restoredDatabase = new Database(operationalDatabase);
      try {
        restoredDatabase.pragma("foreign_keys = OFF");
        restoredDatabase.prepare("UPDATE diagnoses SET operational_event_id = ? WHERE id = ?")
          .run(diagnosisEvent!.id, `diagnosis-${recorded.auditEvent.id}`);
        restoredDatabase.prepare("DELETE FROM command_idempotency WHERE command_id = ?")
          .run(diagnosisEvent!.commandId);
      } finally {
        restoredDatabase.close();
      }
      await expect(runtime.knowledgeEvolution.service.discover({
        includeGpt: false,
        actorId: "support-lead",
      })).rejects.toMatchObject({ code: "PERSISTENCE_ERROR" });
    } finally {
      await closeServer(server);
      runtime.close();
    }
  });
});

function completedDiagnosisSnapshot(
  primary: ReturnType<typeof diagnosisRecord>,
  audits: readonly AuditEvent[],
  ticketOverrides: Partial<Ticket> = {},
  diagnoses: readonly ReturnType<typeof diagnosisRecord>[] = [primary],
): {
  ticket: Ticket;
  audits: readonly AuditEvent[];
  diagnoses: readonly OperationalWorkflowSnapshot["diagnoses"][number][];
} {
  return {
    ticket: TicketSchema.parse({ ...makeTicket(), ...ticketOverrides }),
    audits,
    diagnoses,
  };
}

function operationalSnapshotWithDiagnosis(
  diagnosis: ReturnType<typeof diagnosisRecord>,
  audits: readonly AuditEvent[],
  events: readonly OperationalWorkflowSnapshot["events"][number][],
): OperationalWorkflowSnapshot {
  return OperationalWorkflowSnapshotSchema.parse({
    ticket: makeTicket(),
    ticketRevisions: [],
    recommendations: [],
    recommendationRevisions: [],
    diagnosticTaxonomyRevisions: [],
    messages: [],
    diagnoses: [diagnosis],
    events,
    traces: [],
    customerReplyWatermark: { state: "none" },
  });
}

function diagnosisEvent(
  diagnosis: ReturnType<typeof diagnosisRecord>,
  overrides: Omit<Partial<OperationalEvent>, "facts"> & { facts?: Record<string, unknown> } = {},
) {
  return OperationalEventSchema.parse({
    id: diagnosis.originalAudit.id,
    ticketId,
    sequence: 1,
    occurredAt: diagnosis.originalAudit.timestamp,
    actor: diagnosis.originalAudit.actor,
    action: diagnosis.originalAudit.action,
    commandId: "90000000-0000-4000-8000-000000000001",
    facts: {
      diagnosisOutcome: diagnosis.originalAudit.action === "diagnostic-escalated" ? "escalated" : "completed",
      sourceRevision: 0,
    },
    ...overrides,
  });
}

function originReceiptResult(
  diagnosis: ReturnType<typeof diagnosisRecord>,
  event: OperationalWorkflowSnapshot["events"][number],
): OperationalResultReference {
  return {
    operation: "record-diagnosis",
    tickets: [{ ticketId, operationalEventIds: [event.id], resultingRevision: null }],
    diagnosisId: diagnosis.diagnosis.id,
    lifecycleAuditEvents: [diagnosis.originalAudit],
  };
}

function operationalSnapshotWithReview(
  decision: "approve" | "reject" | "revalidate",
): { diagnosis: ReturnType<typeof diagnosisRecord>; review: AuditEvent; snapshot: OperationalWorkflowSnapshot } {
  const diagnosis = diagnosisRecord();
  const review = reviewAudits(diagnosis.originalAudit, decision)[0]!;
  const snapshot = OperationalWorkflowSnapshotSchema.parse({
    ticket: makeTicket(),
    ticketRevisions: [],
    recommendations: [],
    recommendationRevisions: [],
    diagnosticTaxonomyRevisions: [],
    messages: [],
    diagnoses: [diagnosis],
    events: [
      OperationalEventSchema.parse({
        id: diagnosis.originalAudit.id,
        ticketId,
        sequence: 1,
        occurredAt: diagnosis.originalAudit.timestamp,
        actor: diagnosis.originalAudit.actor,
        action: "diagnosis-completed",
        commandId: "90000000-0000-4000-8000-000000000001",
        facts: {},
      }),
      OperationalEventSchema.parse({
        id: review.id,
        ticketId,
        sequence: 2,
        occurredAt: review.timestamp,
        actor: review.actor,
        action: "diagnosis-reviewed",
        commandId: "90000000-0000-4000-8000-000000000002",
        facts: { diagnosisOutcome: decision, sourceRevision: 0 },
      }),
    ],
    traces: [],
    customerReplyWatermark: { state: "none" },
  });
  return { diagnosis, review, snapshot };
}

function diagnosisRecord(options: {
  id?: string;
  diagnosticState?: "escalated";
  owner?: "engineering" | "customer";
} = {}) {
  const auditId = options.id ?? "60000000-0000-4000-8000-000000000001";
  const originalAudit = AuditEventSchema.parse({
    id: auditId,
    timestamp: "2026-08-13T10:00:00.000Z",
    actor: "operator",
    action: "diagnosis-completed",
    ticketId,
    before: {},
    after: {
      diagnosis: {
        status: "completed",
        causeType: "configuration",
        customerSafeSummary: "A governed configuration change caused the API failure.",
        evidenceUsed: ["request-trace"],
        confidence: "confirmed",
        owner: options.owner ?? "engineering",
        recommendedNextAction: "Apply the governed configuration update.",
        doNotSay: [],
        ...(options.diagnosticState === undefined ? {} : { diagnosticState: { state: options.diagnosticState, hypotheses: [{ id: "configuration", label: "Configuration issue", status: "plausible", evidenceUsed: ["request-trace"], evidenceToConfirm: ["configuration-diff"] }], evidenceToRequest: ["configuration-diff"], diagnosticAttempts: 2, escalationReason: "diagnostic-ambiguity", specialistTeam: "api-platform" } }),
      },
      sourceTicketRevision: 0,
    },
    rationale: "A governed diagnosis was recorded.",
    knowledgeArticleIds: [],
    result: "success",
  });
  return OperationalDiagnosisRecordSchema.parse({
    diagnosis: {
      id: `diagnosis-${auditId}`,
      ticketId,
      problem: "A governed configuration change caused the API failure.",
      symptoms: ["configuration", "request-trace"],
      evidenceUsed: ["request-trace"],
      evidenceReferences: [],
      ownerTeam: options.owner === "customer" ? "support" : "api-platform",
      fixSteps: ["Apply the completed diagnosis next action through the governed support workflow."],
      verificationSteps: ["Confirm the customer-safe outcome after the governed next action."],
      completedAt: "2026-08-13T10:00:00.000Z",
    },
    originalAudit,
    operationalEventId: auditId,
  });
}

function reviewAudits(original: AuditEvent, decision: "approve" | "reject" | "revalidate"): AuditEvent[] {
  return [AuditEventSchema.parse({
    id: `70000000-0000-4000-8000-${original.id.slice(-12)}`,
    timestamp: "2026-08-13T10:01:00.000Z",
    actor: "reviewer",
    action: "diagnosis-reviewed",
    ticketId,
    before: { diagnosisId: original.id, previousReview: null },
    after: {
      diagnosisReview: {
        decision,
        diagnosisId: original.id,
        ticketId,
        sourceTicketRevision: 0,
        sourceConversationWatermark: { state: "none" },
        editedDiagnosis: original.after.diagnosis,
        actor: "reviewer",
        ...(decision === "reject" || decision === "revalidate" ? { rationale: "The operator recorded the review decision." } : {}),
        reviewedAt: "2026-08-13T10:01:00.000Z",
      },
    },
    rationale: "The operator recorded the diagnosis review.",
    knowledgeArticleIds: [],
    result: "success",
  })];
}

function lifecycleAudit(id: string, action: "diagnosis-invalidated" | "fix-ineffective", diagnosisId: string): AuditEvent {
  return AuditEventSchema.parse({
    id,
    timestamp: "2026-08-13T10:02:00.000Z",
    actor: "operator",
    action,
    ticketId,
    before: { diagnosisId },
    after: {},
    rationale: "A governed lifecycle signal was recorded.",
    knowledgeArticleIds: [],
    result: "success",
  });
}

function makeTicket(): Ticket {
  return TicketSchema.parse({
    id: ticketId,
    revision: 0,
    customer: { name: "Northstar", plan: "enterprise", region: "eu", vip: false },
    subject: "API requests fail",
    description: "Requests return a server error.",
    status: "triage",
    category: "api",
    priority: "P2",
    team: "api-platform",
    tags: ["api"],
    relatedTicketIds: [],
    sla: { responseDueAt: "2026-08-14T00:00:00.000Z", breached: false },
    createdAt: "2026-08-13T09:00:00.000Z",
    updatedAt: "2026-08-13T09:00:00.000Z",
  });
}

function operationalStore(runtime: RuntimeDependencies) {
  if (runtime.operationalStore === undefined || !("readWorkflowSnapshot" in runtime.operationalStore)) {
    throw new Error("Expected an operational runtime store.");
  }
  return runtime.operationalStore;
}

function commandHeaders(sequence: number): Record<string, string> {
  return {
    "content-type": "application/json",
    "Idempotency-Key": `a1000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
  };
}

async function listen(server: ReturnType<typeof createApprovalDeskHttpServer>): Promise<string> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createApprovalDeskHttpServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

async function requestJson(
  baseUrl: string,
  path: string,
  init: RequestInit | undefined,
  expectedStatus: number,
): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json() as any;
  expect(response.status, JSON.stringify(body)).toBe(expectedStatus);
  return body;
}
