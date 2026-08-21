import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AuditEventSchema, type AuditEvent } from "../src/domain.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";
import { canonicalRequestHash } from "../src/operational/idempotency.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { customerReplyWatermarkFromSnapshot } from "../src/triage-service.js";

export const recoveryTicketId = "TKT-1001" as const;

export async function createRecoveryFixture(
  now: () => Date = () => new Date("2026-08-21T09:10:00.000Z"),
) {
  const root = await mkdtemp(join(tmpdir(), "operational-recovery-"));
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
  const runtime = await createRuntimeDependencies({ env, now });
  const ticket = await runtime.tickets.get(recoveryTicketId);
  const diagnosis = await runtime.service.recordDiagnosis({
    ticketId: recoveryTicketId,
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
    runtime.operationalStore!.readWorkflowSnapshot(recoveryTicketId),
  );
  const review = await runtime.service.reviewDiagnosis({
    decision: "approve",
    diagnosisId: diagnosis.id,
    ticketId: recoveryTicketId,
    sourceTicketRevision: ticket.revision,
    sourceConversationWatermark: watermark,
    editedDiagnosis: diagnosis.after.diagnosis as never,
    actor: "reviewer",
    reviewedAt: "2026-08-21T09:01:00.000Z",
  }, { commandId: "22222222-2222-4222-8222-222222222222" });

  return {
    root,
    runtime,
    ticket,
    diagnosis,
    review,
    watermark,
    seedFix: (input: {
      fixEventId: string;
      commandId: string;
      occurredAt: string;
      summary?: string;
    }) => seedFixAttempt(runtime, diagnosis.id, input),
  };
}

function seedFixAttempt(
  runtime: Awaited<ReturnType<typeof createRuntimeDependencies>>,
  diagnosisId: string,
  input: {
    fixEventId: string;
    commandId: string;
    occurredAt: string;
    summary?: string;
  },
): AuditEvent {
  const fixAudit = AuditEventSchema.parse({
    id: input.fixEventId,
    timestamp: input.occurredAt,
    actor: "product-support",
    action: "fix-available",
    ticketId: recoveryTicketId,
    before: { diagnosisId },
    after: {
      diagnosisId,
      fix: {
        status: "available",
        customerSafeSummary: input.summary ?? "A platform mitigation is ready.",
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
    const request = { ticketId: recoveryTicketId, diagnosisId, fixEventId: input.fixEventId };
    if (unit.beginCommand(input.commandId, operation, request) !== "new") {
      throw new Error("Recovery fixture fix command unexpectedly replayed.");
    }
    const [sequence] = unit.allocateEventSequences(recoveryTicketId, 1);
    unit.appendEvent({
      id: input.fixEventId,
      ticketId: recoveryTicketId,
      sequence: sequence!,
      occurredAt: input.occurredAt,
      actor: fixAudit.actor,
      action: "fix-available",
      commandId: input.commandId,
      facts: { diagnosisId, outcome: "available" },
    });
    unit.persistCommandResult(
      input.commandId,
      canonicalRequestHash(operation, request),
      {
        operation,
        tickets: [{
          ticketId: recoveryTicketId,
          operationalEventIds: [input.fixEventId],
          resultingRevision: null,
        }],
        lifecycleAuditEvents: [fixAudit],
      },
    );
  });
  return fixAudit;
}
