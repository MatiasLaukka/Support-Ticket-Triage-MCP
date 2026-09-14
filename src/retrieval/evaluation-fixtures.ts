import { TicketSchema } from "../domain.js";
import { EvaluationOracleSchema } from "../evaluation-oracle.js";

/**
 * Evaluation-only synthetic scenarios. They are deliberately separate from
 * operational customer data and exist only to cover executable contrast paths
 * absent from the reviewed seed tickets.
 */
export const SYNTHETIC_RETRIEVAL_EVALUATION_SCENARIOS = [{
  fixtureId: "synthetic-editor-browser-session",
  rationale: "Grounded in diagnoseCampaignEditorLoading's browser-session branch: a private window working rules out the platform-loading hypothesis.",
  ticket: TicketSchema.parse({
    id: "TKT-1031",
    createdAt: "2026-09-12T12:00:00.000Z",
    updatedAt: "2026-09-12T12:05:00.000Z",
    customer: { name: "Synthetic evaluation fixture", plan: "sandbox", region: "test", vip: false },
    requester: { name: "Synthetic evaluator", role: "Test operator", department: "Evaluation", technicalLevel: "technical", seniority: "individual-contributor" },
    subject: "Campaign editor is blank only in one browser session",
    description: "The campaign editor works in a private window and another browser, so the observed failure is limited to the original browser session.",
    status: "triage",
    category: "performance",
    priority: "P3",
    team: "product",
    tags: ["campaign", "editor", "browser-session", "synthetic-evaluation"],
    sla: { responseDueAt: "2026-09-13T12:00:00.000Z", breached: false },
    relatedTicketIds: [],
    revision: 0,
  }),
  oracle: EvaluationOracleSchema.parse({
    ticketId: "TKT-1031",
    classification: { acceptableCategories: ["performance"], acceptableTeams: ["product"], acceptablePriorities: ["P3"], requiredEscalations: [] },
    knowledge: { requiredArticleIds: [], relevantArticleIds: ["performance-troubleshooting"] },
    retrieval: {
      requiredResourceKeys: [],
      relevantResourceKeys: ["knowledge-article:performance-troubleshooting", "diagnostic-playbook:campaign-editor"],
      hardNegativeResourceKeys: [],
      labelsComplete: false,
      resourceCoverage: { "knowledge-article": "adequate", "known-cause": "not-expected", "diagnostic-playbook": "adequate", "resolved-ticket": "not-expected" },
    },
    knownCause: { expectation: "insufficient-evidence" },
    family: "synthetic-browser-session",
    contrastGroup: "editor session/platform loading",
    labelRationale: "Synthetic retrieval-only contrast grounded in the executable campaign-editor diagnostic branch; it is not operational customer data or empirical corpus evidence.",
  }),
}] as const;
