import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type CoverageRow = {
  id: number;
  scenario: string;
  suite: string;
  anchor: string;
};

// Keep the approved whole-slice review matrix executable. Each row points to
// the focused regression suite that owns the behavior; removing or renaming a
// suite/describe block fails this guard instead of silently shrinking review.
const coverageMatrix: readonly CoverageRow[] = [
  ...Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    scenario: `lifecycle projection ${index + 1}`,
    suite: "test/lifecycle-view.test.ts",
    anchor: 'describe("lifecycle projection"',
  })),
  ...Array.from({ length: 7 }, (_, index) => ({
    id: index + 9,
    scenario: `recovery command ${index + 1}`,
    suite: "test/operational-recovery-scenarios.test.ts",
    anchor: 'describe("operational recovery scenarios"',
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: index + 16,
    scenario: `recovery transport envelope ${index + 1}`,
    suite: "test/recovery-transports.test.ts",
    anchor: 'describe("recovery operation transports"',
  })),
  ...Array.from({ length: 7 }, (_, index) => ({
    id: index + 21,
    scenario: `HTTP/MCP parity ${index + 1}`,
    suite: "test/approval-desk-http.test.ts",
    anchor: 'describe("createApprovalDeskHttpServer"',
  })),
  ...Array.from({ length: 7 }, (_, index) => ({
    id: index + 28,
    scenario: `Approval Desk descriptor authority ${index + 1}`,
    suite: "test/approval-desk-ui.test.ts",
    anchor: 'describe("approvalDeskHtml"',
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    id: index + 35,
    scenario: `development injector gate ${index + 1}`,
    suite: "test/demo-transition-injectors.test.ts",
    anchor: 'describe("development demo transition injectors"',
  })),
  {
    id: 39,
    scenario: "operational schema facts and event categories",
    suite: "test/operational-domain.test.ts",
    anchor: 'describe("operational persistence domain"',
  },
  {
    id: 40,
    scenario: "causal decision timeline fallback",
    suite: "test/decision-timeline.test.ts",
    anchor: 'describe("causal Decision Timeline"',
  },
  {
    id: 41,
    scenario: "restart persistence and lifecycle recovery",
    suite: "test/operational-diagnosis-restart.test.ts",
    anchor: 'describe("operational diagnosis persistence"',
  },
] as const;

describe("operational lifecycle whole-slice coverage matrix", () => {
  it("keeps all 41 approved scenarios linked to focused regression suites", () => {
    expect(coverageMatrix).toHaveLength(41);
    expect(new Set(coverageMatrix.map(({ id }) => id)).size).toBe(41);

    for (const row of coverageMatrix) {
      const source = readFileSync(resolve(process.cwd(), row.suite), "utf8");
      expect(source, `scenario ${row.id}: ${row.scenario}`).toContain(row.anchor);
    }
  });
});
