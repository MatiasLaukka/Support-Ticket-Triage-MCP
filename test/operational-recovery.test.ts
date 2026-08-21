import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditEventSchema } from "../src/domain.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import { latestAuthoritativeDiagnosis } from "../src/approval-desk/workflow-guidance.js";
import { customerReplyWatermarkFromSnapshot } from "../src/triage-service.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { canonicalRequestHash } from "../src/operational/idempotency.js";
import type { OperationalSqliteStore } from "../src/operational/sqlite-store.js";

const roots: string[] = [];
const ticketId = "TKT-1001" as const;
const diagnosisId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fixEventId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const seedFixCommandId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ineffectiveCommandId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const invalidationCommandId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("operational recovery commands", () => {
  it("records ineffective fixes without removing diagnosis authority, then invalidates explicitly", async () => {
    const root = await mkdtemp(join(tmpdir(), "operational-recovery-"));
    roots.push(root);
    const env = {
      TRIAGE_DATA_ROOT: root,
      TRIAGE_SEED_FILE: resolve("data", "seed", "tickets.json"),
      TRIAGE_KNOWLEDGE_ROOT: resolve("data", "knowledge"),
      TRIAGE_LEARNING_LEDGER_PATH: join(root, "knowledge-evolution", "learning.sqlite"),
      OPERATIONAL_DB_PATH: join(root, "operational.sqlite"),
    };
    resetOperationalDemoState({
      operationalDatabase: env.OPERATIONAL_DB_PATH,
      seedFile: env.TRIAGE_SEED_FILE,
      dataRoot: root,
    });
    const runtime = await createRuntimeDependencies({ env });
    try {
      const ticket = await runtime.tickets.get(ticketId);
      const diagnosis = await runtime.service.recordDiagnosis({
        ticketId,
        actor: "product-support",
        diagnosedAt: "2026-08-21T09:00:00.000Z",
        diagnosis: {
          status: "completed",
          causeType: "platform-delay",
          customerSafeSummary: "Checkout events are delayed by platform processing.",
          evidenceUsed: ["event ID", "request ID"],
          confidence: "confirmed",
          owner: "engineering",
          recommendedNextAction: "Apply the platform mitigation and verify the timeline.",
          doNotSay: ["Do not expose internal details."],
        },
        knowledgeArticleIds: [],
      }, { commandId: "11111111-1111-4111-8111-111111111111" });
      const watermark = customerReplyWatermarkFromSnapshot(
        runtime.operationalStore!.readWorkflowSnapshot(ticketId),
      );
      const review = await runtime.service.reviewDiagnosis({
        decision: "approve",
        diagnosisId: diagnosis.id,
        ticketId,
        sourceTicketRevision: ticket.revision,
        sourceConversationWatermark: watermark,
        editedDiagnosis: diagnosis.after.diagnosis as never,
        actor: "reviewer",
        reviewedAt: "2026-08-21T09:01:00.000Z",
      }, { commandId: "22222222-2222-4222-8222-222222222222" });

      const fixAudit = AuditEventSchema.parse({
        id: fixEventId,
        timestamp: "2026-08-21T09:02:00.000Z",
        actor: "product-support",
        action: "fix-available",
        ticketId,
        before: { diagnosisId: diagnosis.id },
        after: {
          diagnosisId: diagnosis.id,
          fix: {
            status: "available",
            customerSafeSummary: "A platform mitigation is ready.",
            customerAction: "Retry the affected checkout.",
            verificationRequest: "Confirm whether the event appears in the timeline.",
          },
        },
        rationale: "A reviewed mitigation is available.",
        knowledgeArticleIds: [],
        result: "success",
      });
      runtime.operationalStore!.transaction((unit) => {
        const operation = "seed-fix-for-recovery-test";
        const request = { ticketId, diagnosisId: diagnosis.id };
        expect(unit.beginCommand(seedFixCommandId, operation, request)).toBe("new");
        const [sequence] = unit.allocateEventSequences(ticketId, 1);
        unit.appendEvent({
          id: fixEventId,
          ticketId,
          sequence: sequence!,
          occurredAt: fixAudit.timestamp,
          actor: fixAudit.actor,
          action: "fix-available",
          commandId: seedFixCommandId,
          facts: { diagnosisId: diagnosis.id, outcome: "available" },
        });
        unit.persistCommandResult(seedFixCommandId, canonicalRequestHash(operation, request), {
          operation,
          tickets: [{ ticketId, operationalEventIds: [fixEventId], resultingRevision: null }],
          lifecycleAuditEvents: [fixAudit],
        });
      });

      const recoveryInput = {
        ticketId,
        diagnosisId: diagnosis.id,
        fixEventId,
        sourceTicketRevision: ticket.revision,
        sourceConversationWatermark: watermark,
        actor: "reviewer",
        rationale: "The mitigation did not change the affected timeline.",
        verificationEvidence: ["customer-confirmed-not-fixed"],
        ineffectiveAt: "2026-08-21T09:03:00.000Z",
      };
      const ineffective = await runtime.service.recordFixIneffective(
        recoveryInput,
        { commandId: ineffectiveCommandId },
      );
      const replay = await runtime.service.recordFixIneffective(
        recoveryInput,
        { commandId: ineffectiveCommandId },
      );
      expect(replay).toEqual(ineffective);
      expect(ineffective.action).toBe("fix-ineffective");
      const operationalStore = runtime.operationalStore as OperationalSqliteStore;
      expect(latestAuthoritativeDiagnosis(ticketId, [diagnosis, review, fixAudit, ineffective]))
        .toMatchObject({ diagnosisId: diagnosis.id });
      await expect(runtime.service.recordFixIneffective({
        ...recoveryInput,
        sourceTicketRevision: ticket.revision + 1,
      }, { commandId: "abababab-abab-4bab-8bab-abababababab" })).rejects.toMatchObject({
        code: "STALE_APPROVAL",
      });

      const invalidationInput = {
        ticketId,
        diagnosisId: diagnosis.id,
        sourceTicketRevision: ticket.revision,
        sourceConversationWatermark: watermark,
        actor: "reviewer",
        reasonCode: "contradictory-evidence" as const,
        rationale: "The verified outcome contradicts the diagnosis.",
        invalidatedAt: "2026-08-21T09:04:00.000Z",
      };
      const invalidated = await runtime.service.invalidateDiagnosis(
        invalidationInput,
        { commandId: invalidationCommandId },
      );
      const invalidationReplay = await runtime.service.invalidateDiagnosis(
        invalidationInput,
        { commandId: invalidationCommandId },
      );
      expect(invalidationReplay).toEqual(invalidated);
      expect(invalidated.action).toBe("diagnosis-invalidated");
      expect(await runtime.operationalDiagnoses!.list(ticketId)).toHaveLength(1);
      const snapshot = operationalStore.readWorkflowSnapshot(ticketId);
      const audits = [diagnosis, review, fixAudit, ineffective, invalidated];
      expect(latestAuthoritativeDiagnosis(ticketId, audits)).toBeUndefined();
      expect(audits.map((event) => event.action)).toEqual(expect.arrayContaining([
        "diagnosis-completed",
        "diagnosis-reviewed",
        "fix-available",
        "fix-ineffective",
        "diagnosis-invalidated",
      ]));
      expect(snapshot.events.map((event) => event.action)).toEqual([
        "diagnosis-completed",
        "diagnosis-reviewed",
        "fix-available",
        "fix-ineffective",
        "diagnosis-invalidated",
      ]);
      expect(snapshot.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
      await expect(runtime.service.invalidateDiagnosis({
        ...invalidationInput,
        sourceTicketRevision: ticket.revision + 1,
      }, { commandId: "ffffffff-ffff-4fff-8fff-ffffffffffff" })).rejects.toMatchObject({
        code: "STALE_APPROVAL",
      });
    } finally {
      runtime.close();
    }
  });
});
