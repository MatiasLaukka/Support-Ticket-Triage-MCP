import { describe, expect, it } from "vitest";
import {
  DiagnosticStateSnapshotSchema,
  advanceDiagnosticState,
} from "../src/approval-desk/diagnostic-state.js";

const ambiguousState = DiagnosticStateSnapshotSchema.parse({
  state: "ambiguous",
  hypotheses: [
    {
      id: "browser-session",
      label: "Browser/session issue",
      status: "plausible",
      evidenceUsed: ["blank editor"],
      evidenceToConfirm: ["Private window works"],
    },
    {
      id: "frontend-loading",
      label: "Frontend loading issue",
      status: "plausible",
      evidenceUsed: ["blank editor"],
      evidenceToConfirm: ["Console error persists"],
    },
  ],
  evidenceToRequest: ["Try a private window."],
});

describe("advanceDiagnosticState", () => {
  it("increments attempts for a non-discriminating reply", () => {
    expect(
      advanceDiagnosticState({
        current: ambiguousState,
        customerReplyText: "The editor is still blank, with no new checks.",
        contradicted: false,
      }),
    ).toMatchObject({
      state: "ambiguous",
      diagnosticAttempts: 1,
    });
  });

  it("escalates after the bounded number of non-discriminating cycles", () => {
    expect(
      advanceDiagnosticState({
        current: { ...ambiguousState, diagnosticAttempts: 1 },
        customerReplyText: "The editor is still blank, with no new checks.",
        contradicted: false,
      }),
    ).toMatchObject({
      state: "escalated",
      escalationReason: "diagnostic-ambiguity",
      specialistTeam: "product",
    });
  });

  it("keeps useful ambiguity open for the configured number of rounds", () => {
    expect(
      advanceDiagnosticState({
        current: { ...ambiguousState, diagnosticAttempts: 2 },
        customerReplyText: "The private window result narrows the issue, but both causes remain plausible.",
        contradicted: false,
        policy: { maxAttempts: 4 },
      }),
    ).toMatchObject({
      state: "ambiguous",
      diagnosticAttempts: 3,
    });
  });

  it("escalates when the configured ambiguity policy is exhausted", () => {
    expect(
      advanceDiagnosticState({
        current: { ...ambiguousState, diagnosticAttempts: 3 },
        customerReplyText: "The new evidence still leaves both causes plausible.",
        contradicted: false,
        policy: { maxAttempts: 4 },
      }),
    ).toMatchObject({
      state: "escalated",
      diagnosticAttempts: 4,
      escalationReason: "diagnostic-ambiguity",
    });
  });

  it("escalates contradictory evidence immediately regardless of the configured limit", () => {
    expect(
      advanceDiagnosticState({
        current: ambiguousState,
        customerReplyText: "The editor works privately but is still blank in the same private session.",
        contradicted: true,
        policy: { maxAttempts: 10 },
      }),
    ).toMatchObject({
      state: "escalated",
      diagnosticAttempts: 1,
      escalationReason: "contradictory-evidence",
    });
  });

  it("confirms a hypothesis when a discriminating reply identifies it", () => {
    expect(
      advanceDiagnosticState({
        current: ambiguousState,
        customerReplyText: "It works in a private window.",
        confirmedHypothesisId: "browser-session",
        contradicted: false,
      }),
    ).toMatchObject({
      state: "confirmed",
      hypotheses: expect.arrayContaining([
        expect.objectContaining({ id: "browser-session", status: "confirmed" }),
        expect.objectContaining({ id: "frontend-loading", status: "ruled-out" }),
      ]),
    });
  });
});
