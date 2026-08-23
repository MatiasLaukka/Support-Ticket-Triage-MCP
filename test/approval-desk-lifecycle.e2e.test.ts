import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { approvalDeskHtml } from "../src/approval-desk/ui.js";
import { createApprovalDeskHttpServer } from "../src/approval-desk/http.js";
import { createRuntimeDependencies } from "../src/runtime.js";
import { resetOperationalDemoState } from "../src/demo-reset.js";

describe("Approval Desk lifecycle contract", () => {
  it("drives TKT-1010 through the real HTTP lifecycle and keeps the action bar authoritative", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "approval-desk-ui-lifecycle-"));
    const seedPath = join(dataRoot, "tickets.json");
    const seed = JSON.parse(readFileSync(resolve("data/seed/tickets.json"), "utf8")) as Array<Record<string, any>>;
    const seedTicket = seed.find((ticket) => ticket.id === "TKT-1010")!;
    Object.assign(seedTicket, {
      category: "performance",
      priority: "P3",
      team: "product",
      tags: [...(seedTicket.tags as string[]), "performance"],
    });
    await writeFile(seedPath, JSON.stringify(seed), "utf8");
    resetOperationalDemoState({
      operationalDatabase: join(dataRoot, "operational.sqlite"),
      seedFile: seedPath,
      dataRoot,
    });
    const deps = await createRuntimeDependencies({
      env: {
        TRIAGE_DATA_ROOT: dataRoot,
        TRIAGE_SEED_FILE: seedPath,
        TRIAGE_KNOWLEDGE_ROOT: resolve("data/knowledge"),
      },
      now: () => new Date("2026-06-10T09:00:00.000Z"),
    });
    const server = createApprovalDeskHttpServer(deps, { enableDemoInjectors: true });
    try {
      await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
      const address = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const live = async (path: string, init?: RequestInit): Promise<{ status: number; body: any }> => {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: {
            "content-type": "application/json",
            ...(init?.method === "POST" ? { "idempotency-key": randomUUID() } : {}),
            ...init?.headers,
          },
          ...init,
        });
        return { status: response.status, body: await response.json() };
      };
      const liveQueue = await live("/api/tickets?limit=50");
      expect(liveQueue.status, JSON.stringify(liveQueue.body)).toBe(200);
      expect(liveQueue.body.items, JSON.stringify(liveQueue.body)).toHaveLength(30);
      const app = await startLiveApprovalDeskApp(baseUrl);
      await app.wait(200);
      app.setQueueFilter("all");
      await app.wait(200);
      expect(app.el("queueStatus").textContent, JSON.stringify(app.requests.map((request) => request.path))).toContain("30");
      await app.selectTicket("TKT-1010");

      const assertRenderedLifecycle = async (lifecycle: any): Promise<void> => {
        expect(lifecycle.actions).toEqual(expect.arrayContaining([
          expect.objectContaining({ kind: lifecycle.primaryAction.kind }),
        ]));
        switch (lifecycle.primaryAction.kind) {
          case "evaluate-ticket":
            expect(app.el("createRecommendation").hidden && app.el("createUpdatedRecommendation").hidden).toBe(false);
            break;
          case "record-diagnosis":
            expect(app.el("diagnoseButton").hidden, app.el("diagnosisPanel").innerHTML).toBe(false);
            break;
          case "review-diagnosis":
            expect(app.el("diagnosisPanel").innerHTML, JSON.stringify(lifecycle)).toContain("data-action=\"review-diagnosis\"");
            break;
          case "revalidate-diagnosis":
            expect(app.el("diagnosisPanel").innerHTML, JSON.stringify(lifecycle)).toContain("data-review-decision=\"revalidate\"");
            break;
          case "record-fix-available":
            expect(app.el("fixButton").hidden).toBe(false);
            break;
          case "apply-scoped-fix":
            expect(app.el("diagnosisPanel").innerHTML).toContain("data-action=\"open-scoped-fix\"");
            break;
          case "resolve-ticket":
            expect(app.el("closeTicketButton").hidden, JSON.stringify(lifecycle)).toBe(false);
            expect(approvalDeskHtml).toContain('title="Resolve ticket" hidden>Resolve</button>');
            break;
          case "none":
          case "specialist-review":
            expect(app.el("actionBarHint").textContent).toContain("No governed operator action");
            break;
          default:
            break;
        }
      };
      const lifecycle = async (): Promise<any> => (await live("/api/tickets/TKT-1010")).body.lifecycle;
      const ticketRevision = async (): Promise<number> => (await live("/api/tickets/TKT-1010")).body.ticket.revision;
      const approveAndSend = async (recommendation: any, automaticReplyEnabled = true): Promise<void> => {
        await live(`/api/recommendations/${recommendation.id}/approve`, {
          method: "POST",
          body: JSON.stringify({
            ticketId: "TKT-1010",
            expectedRevision: await ticketRevision(),
            approvedFields: ["customerResponse"],
            editedCustomerResponse: recommendation.draftCustomerResponse,
            actor: "matias-reviewer",
            confirm: true,
          }),
        });
        await live(`/api/recommendations/${recommendation.id}/mark-sent`, {
          method: "POST",
          body: JSON.stringify({ ticketId: "TKT-1010", actor: "matias-reviewer", automaticReplyEnabled }),
        });
      };
      const completeEvidence = "The campaign name is Summer Flash Sale. The failure timestamp was 2026-06-10 09:15 UTC. I use Chrome, and the page is still blank after signing out and back in. The affected scope appears to be 12 profiles in the latest export.";
      const confirmedEvidence = `${completeEvidence} The editor is also blank in a private window and another browser, another admin sees the same failure, and the browser console reports ChunkLoadError at the retry time.`;

      let currentLifecycle = await lifecycle();
      await assertRenderedLifecycle(currentLifecycle);
      const initialEvaluation = await live("/api/tickets/TKT-1010/recommendations", {
        method: "POST",
        body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }),
      });
      expect(initialEvaluation.status, JSON.stringify(initialEvaluation.body)).toBe(201);
      await approveAndSend(initialEvaluation.body.recommendation, true);
      await app.refreshSelectedTicket("TKT-1010");
      currentLifecycle = await lifecycle();
      await assertRenderedLifecycle(currentLifecycle);

      await live("/api/tickets/TKT-1010/customer-replies", {
        method: "POST",
        body: JSON.stringify({ actor: "Mia Johnson", source: "manual", body: completeEvidence }),
      });
      const evidenceEvaluation = await live("/api/tickets/TKT-1010/recommendations", {
        method: "POST",
        body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }),
      });
      expect(evidenceEvaluation.status).toBe(201);
      await approveAndSend(evidenceEvaluation.body.recommendation, false);
      await app.refreshSelectedTicket("TKT-1010");
      currentLifecycle = await lifecycle();
      await assertRenderedLifecycle(currentLifecycle);
      expect(currentLifecycle.primaryAction.kind).toBe("record-diagnosis");

      const diagnosisResponse = await live("/api/tickets/TKT-1010/diagnosis", {
        method: "POST",
        body: JSON.stringify({ actor: "product-support" }),
      });
      expect(diagnosisResponse.status).toBe(201);
      const diagnosisId = diagnosisResponse.body.auditEvent.id;
      await app.refreshSelectedTicket("TKT-1010");
      currentLifecycle = await lifecycle();
      await assertRenderedLifecycle(currentLifecycle);

      const diagnosisViews = (await live("/api/tickets/TKT-1010/diagnoses")).body.diagnoses;
      const diagnosisContext = diagnosisViews.at(-1).originalDiagnosis.after.diagnosis;
      if (currentLifecycle.primaryAction.kind === "review-diagnosis") {
        const rejected = await live(`/api/tickets/TKT-1010/diagnoses/${diagnosisId}/review`, {
          method: "POST",
          body: JSON.stringify({
            decision: "reject",
            sourceTicketRevision: await ticketRevision(),
            sourceConversationWatermark: currentLifecycle.current.conversationWatermark,
            editedDiagnosis: diagnosisContext,
            actor: "matias-reviewer",
            rationale: "The first theory needs a different direction.",
          }),
        });
        expect(rejected.status).toBe(201);
        await app.refreshSelectedTicket("TKT-1010");
        currentLifecycle = await lifecycle();
        expect(currentLifecycle).toMatchObject({ phase: "evaluation-needed", primaryAction: { kind: "evaluate-ticket" } });
        await assertRenderedLifecycle(currentLifecycle);
        const beforeRecovery = app.requests.filter((request) => request.path === "/api/tickets/TKT-1010/recommendations").length;
        await app.createUpdatedRecommendation();
        const afterRecovery = app.requests.filter((request) => request.path === "/api/tickets/TKT-1010/recommendations").length;
        expect(afterRecovery - beforeRecovery).toBe(1);
        currentLifecycle = await lifecycle();
        expect(currentLifecycle.primaryAction.kind).toBe("review-recommendation");
        await approveAndSend((await live("/api/tickets/TKT-1010")).body.recommendation, false);
        await app.refreshSelectedTicket("TKT-1010");
        currentLifecycle = await lifecycle();
        await assertRenderedLifecycle(currentLifecycle);
      }

      let confirmedDiagnosisId = diagnosisId;
      for (let attempt = 0; attempt < 4 && currentLifecycle.primaryAction.kind !== "review-diagnosis"; attempt += 1) {
        if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
          await live("/api/tickets/TKT-1010/customer-replies", {
            method: "POST",
            body: JSON.stringify({ actor: "Mia Johnson", source: "manual", body: confirmedEvidence }),
          });
          const evaluation = await live("/api/tickets/TKT-1010/recommendations", {
            method: "POST",
            body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }),
          });
          expect(evaluation.status).toBe(201);
          await approveAndSend(evaluation.body.recommendation, false);
        } else if (currentLifecycle.primaryAction.kind === "recommendation-review") {
          await approveAndSend((await live("/api/tickets/TKT-1010")).body.recommendation);
        } else if (currentLifecycle.primaryAction.kind === "record-diagnosis") {
          const recorded = await live("/api/tickets/TKT-1010/diagnosis", {
            method: "POST",
            body: JSON.stringify({ actor: "product-support" }),
          });
          confirmedDiagnosisId = recorded.body.auditEvent.id;
          const recordedContext = recorded.body.auditEvent.after.diagnosis;
          if (recordedContext.confidence === "confirmed") {
            const diagnosisResponse = await live("/api/tickets/TKT-1010/recommendations", {
              method: "POST",
              body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }),
            });
            expect(diagnosisResponse.status).toBe(201);
            await approveAndSend(diagnosisResponse.body.recommendation, false);
            const confirmation = await live("/api/demo/tickets/TKT-1010/inject", {
              method: "POST",
              body: JSON.stringify({ action: "internal-confirmation", actor: "product-support", rationale: "The internal platform check confirms the diagnosis." }),
            });
            expect(confirmation.status, JSON.stringify(confirmation.body)).toBe(201);
          } else {
            const diagnosisRecommendation = await live("/api/tickets/TKT-1010/recommendations", {
              method: "POST",
              body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }),
            });
            expect(diagnosisRecommendation.status).toBe(201);
            await approveAndSend(diagnosisRecommendation.body.recommendation, true);
          }
        }
        await app.refreshSelectedTicket("TKT-1010");
        currentLifecycle = await lifecycle();
        await assertRenderedLifecycle(currentLifecycle);
      }
      if (currentLifecycle.primaryAction.kind === "specialist-review") {
        const confirmation = await live("/api/demo/tickets/TKT-1010/inject", {
          method: "POST",
          body: JSON.stringify({ action: "internal-confirmation", actor: "product-support", rationale: "The internal platform check confirms the diagnosis." }),
        });
        expect(confirmation.status, JSON.stringify(confirmation.body)).toBe(201);
        await app.refreshSelectedTicket("TKT-1010");
        currentLifecycle = await lifecycle();
        await assertRenderedLifecycle(currentLifecycle);
      }
      expect(["awaiting-fix", "fix-ready", "diagnosis-review"], JSON.stringify(currentLifecycle)).toContain(currentLifecycle.phase);
      const latestViews = (await live("/api/tickets/TKT-1010/diagnoses")).body.diagnoses;
      const latestDiagnosis = latestViews.at(-1).originalDiagnosis.after.diagnosis;
      if (currentLifecycle.primaryAction.kind === "review-diagnosis") {
        const approved = await live(`/api/tickets/TKT-1010/diagnoses/${confirmedDiagnosisId}/review`, {
          method: "POST",
          body: JSON.stringify({
            decision: "approve",
            sourceTicketRevision: await ticketRevision(),
            sourceConversationWatermark: currentLifecycle.current.conversationWatermark,
            editedDiagnosis: { ...latestDiagnosis, confidence: "confirmed" },
            actor: "matias-reviewer",
            rationale: "The evidence supports the confirmed diagnosis.",
          }),
        });
        expect(approved.status).toBe(201);
        await app.refreshSelectedTicket("TKT-1010");
        currentLifecycle = await lifecycle();
        await assertRenderedLifecycle(currentLifecycle);
      }
      expect(["awaiting-fix", "fix-ready"]).toContain(currentLifecycle.phase);
      if (currentLifecycle.primaryAction.kind === "apply-scoped-fix") {
        const applied = await live(`/api/tickets/TKT-1010/diagnoses/${confirmedDiagnosisId}/fix`, {
          method: "POST",
          body: JSON.stringify({ actor: "product-support", impactSet: { actor: "product-support", rationale: "The confirmed diagnosis applies to the source ticket.", tickets: [{ ticketId: "TKT-1010", reason: "The source ticket reproduced the reviewed diagnosis." }] } }),
        });
        expect(applied.status).toBe(201);
      } else {
        expect(currentLifecycle.primaryAction.kind).toBe("record-fix-available");
        await app.click("fixButton");
      }
      await app.refreshSelectedTicket("TKT-1010");
      currentLifecycle = await lifecycle();
      await assertRenderedLifecycle(currentLifecycle);
      expect(["evaluate-ticket", "review-recommendation"], JSON.stringify(currentLifecycle)).toContain(currentLifecycle.primaryAction.kind);
      if (currentLifecycle.primaryAction.kind === "evaluate-ticket") {
        const fixResponse = await live("/api/tickets/TKT-1010/recommendations", { method: "POST", body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }) });
        expect(fixResponse.status).toBe(201);
        await approveAndSend(fixResponse.body.recommendation, true);
      } else {
        await approveAndSend((await live("/api/tickets/TKT-1010")).body.recommendation, true);
      }
      await app.refreshSelectedTicket("TKT-1010");
      currentLifecycle = await lifecycle();
      await assertRenderedLifecycle(currentLifecycle);
      if (currentLifecycle.primaryAction.kind === "revalidate-diagnosis") {
        const currentView = (await live("/api/tickets/TKT-1010/diagnoses")).body.diagnoses.at(-1);
        const revalidated = await live(`/api/tickets/TKT-1010/diagnoses/${currentView.originalDiagnosis.id}/review`, {
          method: "POST",
          body: JSON.stringify({ decision: "revalidate", sourceTicketRevision: await ticketRevision(), sourceConversationWatermark: currentLifecycle.current.conversationWatermark, editedDiagnosis: currentView.latestReview?.editedDiagnosis ?? currentView.originalDiagnosis.after.diagnosis, actor: "matias-reviewer", rationale: "The post-fix customer response is being evaluated against the same diagnosis." }),
        });
        expect(revalidated.status, JSON.stringify(revalidated.body)).toBe(201);
        await app.refreshSelectedTicket("TKT-1010");
        currentLifecycle = await lifecycle();
        await assertRenderedLifecycle(currentLifecycle);
      }
      expect(currentLifecycle.primaryAction.kind).toBe("evaluate-ticket");
      const verificationEvaluation = await live("/api/tickets/TKT-1010/recommendations", { method: "POST", body: JSON.stringify({ actor: "approval-desk", aiPreference: "deterministic" }) });
      expect(verificationEvaluation.status).toBe(201);
      await approveAndSend(verificationEvaluation.body.recommendation, false);
      await app.refreshSelectedTicket("TKT-1010");
      currentLifecycle = await lifecycle();
      await app.backToNormalActionBarAndRefresh();
      expect(currentLifecycle.primaryAction.kind).toBe("resolve-ticket");
      await app.click("closeTicketButton");
      currentLifecycle = await lifecycle();
      await app.refreshSelectedTicket("TKT-1010");
      await assertRenderedLifecycle(currentLifecycle);
      expect(currentLifecycle.phase).toBe("resolved");
      expect(app.el("actionBarTitle").textContent).toBe("Resolved");
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      deps.close();
      await rm(dataRoot, { recursive: true, force: true });
    }
  }, 30000);
});

async function startLiveApprovalDeskApp(baseUrl: string) {
  const elements = createElements();
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  let pendingRequests = 0;
  const document = { createElement: () => new FakeElement(), getElementById: (id: string) => elements[id] };
  const fetchOverride = async (path: string, init?: RequestInit) => {
    requests.push({ path, init });
    pendingRequests += 1;
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      return jsonResponse(await response.json(), response.status);
    } finally {
      pendingRequests -= 1;
    }
  };
  const waitForIdle = async () => {
    for (let attempt = 0; attempt < 500 && pendingRequests > 0; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    await settle(10);
    expect(pendingRequests).toBe(0);
  };
  Function("document", "fetch", "encodeURIComponent", "confirm", extractScript(approvalDeskHtml))(
    document,
    fetchOverride,
    encodeURIComponent,
    () => true,
  );
  await settle();
  return {
    el: (id: string) => elements[id],
    requests,
    wait: async (milliseconds = 0) => {
      await new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
      await waitForIdle();
    },
    setQueueFilter: (value: string) => elements.queueFilters.children.find((field) => field.value === value)!.dispatch("click"),
    selectTicket: async (id: string) => {
      elements.ticketList.children.find((item) => item.innerHTML.includes(id))!.dispatch("click");
      await waitForIdle();
    },
    refreshSelectedTicket: async (id: string) => {
      elements.ticketList.children.find((item) => item.innerHTML.includes(id))!.dispatch("click");
      await waitForIdle();
    },
    createUpdatedRecommendation: async () => {
      elements.createUpdatedRecommendation.dispatch("click");
      await waitForIdle();
    },
    click: async (id: string) => {
      elements[id].dispatch("click");
      await waitForIdle();
    },
    backToNormalActionBarAndRefresh: async () => {
      elements.diagnosisPanel.dispatch("click", { target: { dataset: { action: "back-to-normal-action-bar" } } });
      await waitForIdle();
    },
  };
}

function createElements(): Record<string, FakeElement> {
  const ids = [
    "actor", "actionBarPosition", "actionBarHint", "actionBarTitle", "approvalStage", "approveButton", "approveEditedButton", "backToRecommendation", "addCustomerReply", "simulateConfirmationButton", "cancelRejectButton", "closeTicketButton", "confirmApproval", "continueApproval", "conversationContextPanel", "decisionTimelinePanel", "createRecommendation", "createUpdatedRecommendation", "discoverKnowledgeButton", "customerReplyBody", "customerReplyFocus", "decisionChips", "decisionControls", "decisionSummary", "diagnosisPanel", "diagnosisSummaryPanel", "diagnosisActionPanel", "diagnoseButton", "draftStyle", "editApprovalControls", "editedCustomerResponse", "categoryOverride", "evidencePanel", "feedback", "fieldChoices", "fixButton", "guardrailsPanel", "activityPanel", "markSentButton", "manualRepliesButton", "priorityOverride", "predictedReply", "queueFilters", "queueStatus", "recommendationPanel", "patternActionBar", "patternReviewPanel", "refreshEvidence", "refreshQueue", "rejectButton", "rejectControls", "replyComposer", "replyControls", "advancedSettings", "disableAutomaticReplies", "resultPanel", "reviewDraftButton", "setupControls", "startRejectButton", "statusOverride", "assigneeOverride", "tagsOverride", "teamOverride", "ticketList", "ticketDetailsPanel", "ticketPanel", "workflowActionStack", "knowledgeName", "knowledgeSummary", "knowledgeTriggerPatterns", "knowledgeEvidenceMode", "knowledgeEvidenceIds", "knowledgeEvidenceRationale", "knowledgeTimeConstraints", "knowledgeDiagnosticSteps", "knowledgeFixSteps", "knowledgeVerificationSteps", "knowledgeCustomerSafeExplanation", "knowledgeOperatorRationale", "knowledgeOwner", "knowledgeRejectReason", "knowledgeDiscoveryStatus", "knowledgeJourneyBar", "knowledgeJourneyStatus", "knowledgeJourneySteps", "reviewKnowledgePatternButton",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  elements.actor.value = "approval-desk";
  elements.actionBarPosition.value = "bottom-right";
  elements.workflowActionStack.dataset.dock = "bottom-right";
  elements.draftStyle.value = "auto";
  elements.approveButton.disabled = true;
  elements.approveEditedButton.disabled = true;
  elements.rejectButton.disabled = true;
  elements.knowledgeJourneyBar.hidden = true;
  elements.patternActionBar.hidden = true;
  elements.diagnosisActionPanel.hidden = true;
  elements.reviewKnowledgePatternButton.hidden = true;
  elements.fieldChoices.children = ["category", "priority", "team", "assignee", "status", "tags", "customerResponse"].map((value) => {
    const field = new FakeElement(); field.value = value; field.textContent = "Approve"; field.className = "field-approve-button"; return field;
  });
  elements.queueFilters.children = [["active", "Active"], ["draft-ready", "Draft ready"], ["waiting", "Waiting"], ["customer-replied", "Customer replied"], ["resolved", "Closed"], ["all", "All"]].map(([value, label]) => {
    const filter = new FakeElement(); filter.value = value; filter.textContent = label; filter.className = "chip queue-filter"; return filter;
  });
  elements.rejectControls.children = [["Wrong classification.", "Wrong"], ["Needs better evidence.", "Evidence"], ["Rewrite the customer response.", "Rewrite"]].map(([value, label]) => {
    const button = new FakeElement(); button.value = value; button.textContent = label; button.className = "quick-reason secondary"; return button;
  });
  return elements;
}

class FakeElement {
  checked = false; children: FakeElement[] = []; className = ""; dataset: Record<string, string> = {}; disabled = false; hidden = false; open = false; textContent = ""; title = ""; type = ""; value = "";
  private parent: FakeElement | undefined;
  private innerHtmlValue = "";
  private readonly listeners = new Map<string, Array<(event?: unknown) => void>>();
  get innerHTML() { return this.innerHtmlValue; }
  set innerHTML(value: string) {
    this.innerHtmlValue = value;
    this.children = [];
    for (const match of value.matchAll(/<button[^>]*class="([^"]*)"[^>]*value="([^"]*)"[^>]*>/g)) {
      const button = new FakeElement(); button.className = match[1]!; button.value = match[2]!; button.parent = this; this.children.push(button);
    }
  }
  addEventListener(type: string, listener: (event?: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  append(child: FakeElement) { child.parent = this; this.children.push(child); }
  dispatch(type: string, event?: unknown) {
    const dispatchedEvent = event ?? { target: this };
    for (const listener of this.listeners.get(type) ?? []) listener(dispatchedEvent);
    if (this.parent !== undefined) this.parent.dispatch(type, dispatchedEvent);
  }
  querySelectorAll(selector: string): FakeElement[] {
    if (selector === 'input[type="checkbox"]:checked') return this.children.filter((child) => child.checked);
    if (selector === ".field-approve-button") return this.children.filter((child) => child.className.includes("field-approve-button"));
    if (selector === ".queue-filter") return this.children.filter((child) => child.className.includes("queue-filter"));
    if (selector === ".quick-reason") return this.children.filter((child) => child.className.includes("quick-reason"));
    return [];
  }
}

function extractScript(html: string): string {
  const match = /<script>([\s\S]+)<\/script>/.exec(html);
  if (match === null) throw new Error("Approval Desk HTML did not include browser script.");
  return match[1]!;
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function settle(ticks = 10): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve();
}
