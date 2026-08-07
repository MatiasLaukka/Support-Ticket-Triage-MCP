import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteLearningLedger } from "../src/knowledge-evolution/sqlite-learning-ledger.js";
import type { LearningEvent } from "../src/knowledge-evolution/learning-ledger.js";

const event = (id: string, actor = "support-lead"): LearningEvent => ({
  id,
  occurredAt: "2026-08-07T10:00:00.000Z",
  actor,
  correlationId: "22222222-2222-4222-8222-222222222222",
  ticketId: "TKT-1001",
  diagnosisId: "diagnosis-001",
  eventType: "diagnosis-approved",
  payload: {
    evidenceIds: ["request-id"],
    knowledgeArticleIds: ["event-tracking-debugging"],
    provenance: "operator-reviewed diagnosis record",
  },
});

describe("SqliteLearningLedger", () => {
  it("persists events after close and reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "triage-ledger-"));
    const file = join(directory, "learning.sqlite");
    try {
      const first = new SqliteLearningLedger(file);
      await first.initialize();
      await first.append(event("11111111-1111-4111-8111-111111111111"));
      first.close();

      const reopened = new SqliteLearningLedger(file);
      await reopened.initialize();
      await expect(reopened.list()).resolves.toHaveLength(1);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("serializes concurrent writes without losing events", async () => {
    const ledger = new SqliteLearningLedger(":memory:");
    await ledger.initialize();
    await Promise.all(Array.from({ length: 20 }, (_, index) => ledger.append(event(
      `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
    ))));
    await expect(ledger.list()).resolves.toHaveLength(20);
    ledger.close();
  });
});
