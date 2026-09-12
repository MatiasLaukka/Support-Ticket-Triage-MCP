import { approvalDeskHtml } from "../src/approval-desk/ui.js";
import { expect } from "vitest";

export async function startLiveApprovalDeskApp(
  baseUrl: string,
  options: { throwAfterResponseOnce?: RegExp } = {},
) {
  const elements = createElements();
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const responses: Array<{ path: string; status: number; body: any }> = [];
  let pendingRequests = 0;
  let threwAfterResponse = false;
  const document = {
    createElement: () => new FakeElement(),
    getElementById: (id: string) => elements[id],
  };
  const fetchOverride = async (path: string, init?: RequestInit) => {
    requests.push({ path, init });
    pendingRequests += 1;
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      const body = await response.json();
      responses.push({ path, status: response.status, body });
      if (!threwAfterResponse && options.throwAfterResponseOnce?.test(path) === true) {
        threwAfterResponse = true;
        throw new Error("The response was lost after the backend committed the command.");
      }
      return jsonResponse(body, response.status);
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
    el: (id: string) => elements[id]!,
    requests,
    responses,
    wait: async (milliseconds = 0) => {
      await new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
      await waitForIdle();
    },
    setQueueFilter: (value: string) => {
      elements.queueFilters.children.find((field) => field.value === value)!.dispatch("click");
    },
    selectTicket: async (id: string) => {
      elements.ticketList.children.find((item) => item.innerHTML.includes(id))!.dispatch("click");
      await waitForIdle();
    },
    refreshSelectedTicket: async (id: string) => {
      elements.ticketList.children.find((item) => item.innerHTML.includes(id))!.dispatch("click");
      await waitForIdle();
    },
    refreshQueue: async () => {
      elements.refreshQueue.dispatch("click");
      await waitForIdle();
    },
    createRecommendation: async () => {
      elements.createRecommendation.dispatch("click");
      await waitForIdle();
    },
    createUpdatedRecommendation: async () => {
      elements.createUpdatedRecommendation.dispatch("click");
      await waitForIdle();
    },
    approve: async () => {
      elements.approveButton.dispatch("click");
      await waitForIdle();
    },
    markSent: async () => {
      elements.recommendationPanel.dispatch("click", {
        target: { dataset: { action: "mark-sent" } },
      });
      await waitForIdle();
    },
    click: async (id: string) => {
      elements[id]!.dispatch("click");
      await waitForIdle();
    },
    openDiagnosisInspection: async (decision?: "approve" | "revalidate") => {
      elements.diagnosisPanel.dispatch("click", {
        target: {
          dataset: {
            action: "open-diagnosis-inspection",
            ...(decision === undefined ? {} : { reviewDecision: decision }),
          },
        },
      });
      await waitForIdle();
    },
    reviewDiagnosis: async (decision: "approve" | "reject" | "revalidate") => {
      const target = new FakeElement();
      target.dataset = { action: "review-diagnosis", decision };
      elements.diagnosisPanel.dispatch("click", {
        target,
      });
      await waitForIdle();
    },
    reopenDiagnosisEvaluation: async () => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "reopen-diagnosis-evaluation" } },
      });
      await waitForIdle();
    },
    backToNormalActionBarAndRefresh: async () => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "back-to-normal-action-bar" } },
      });
      await waitForIdle();
    },
    openScopedFix: async () => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "open-scoped-fix" } },
      });
      await waitForIdle();
    },
    selectDiagnosis: (diagnosisId: string) => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "select-diagnosis", diagnosisId } },
      });
    },
    applyDiagnosisFix: async () => {
      elements.diagnosisPanel.dispatch("click", {
        target: { dataset: { action: "apply-diagnosis-fix" } },
      });
      await waitForIdle();
    },
    setDiagnosisReviewRationale: (value: string) => {
      elements.diagnosisPanel.dispatch("input", {
        target: { dataset: { diagnosisReviewRationale: "true" }, value },
      });
    },
  };
}

function createElements(): Record<string, FakeElement> {
  const ids = [
    "actor", "actionBarPosition", "actionBarHint", "actionBarTitle", "approvalStage", "approveButton",
    "approveEditedButton", "backToRecommendation", "addCustomerReply", "simulateConfirmationButton",
    "cancelRejectButton", "closeTicketButton", "confirmApproval", "continueApproval",
    "conversationContextPanel", "decisionTimelinePanel", "createRecommendation",
    "createUpdatedRecommendation", "discoverKnowledgeButton", "customerReplyBody",
    "customerReplyFocus", "decisionChips", "decisionControls", "decisionSummary",
    "diagnosisPanel", "diagnosisSummaryPanel", "diagnosisActionPanel", "diagnoseButton",
    "draftStyle", "editApprovalControls", "editedCustomerResponse", "categoryOverride",
    "evidencePanel", "feedback", "fieldChoices", "fixButton", "guardrailsPanel",
    "activityPanel", "markSentButton", "manualRepliesButton", "priorityOverride",
    "predictedReply", "queueFilters", "queueStatus", "recommendationPanel", "patternActionBar",
    "patternReviewPanel", "refreshEvidence", "refreshQueue", "rejectButton", "rejectControls",
    "replyComposer", "replyControls", "advancedSettings", "disableAutomaticReplies", "resultPanel",
    "reviewDraftButton", "setupControls", "startRejectButton", "statusOverride", "assigneeOverride",
    "tagsOverride", "teamOverride", "ticketList", "ticketDetailsPanel", "ticketPanel",
    "workflowActionStack", "knowledgeName", "knowledgeSummary", "knowledgeTriggerPatterns",
    "knowledgeEvidenceMode", "knowledgeEvidenceIds", "knowledgeEvidenceRationale",
    "knowledgeTimeConstraints", "knowledgeDiagnosticSteps", "knowledgeFixSteps",
    "knowledgeVerificationSteps", "knowledgeCustomerSafeExplanation",
    "knowledgeOperatorRationale", "knowledgeOwner", "knowledgeRejectReason",
    "knowledgeDiscoveryStatus", "knowledgeJourneyBar", "knowledgeJourneyStatus",
    "knowledgeJourneySteps", "reviewKnowledgePatternButton",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  elements.actor.value = "approval-desk";
  elements.actionBarPosition.value = "bottom-right";
  elements.workflowActionStack.dataset.dock = "bottom-right";
  elements.draftStyle.value = "auto";
  elements.approveButton.disabled = true;
  elements.approveEditedButton.disabled = true;
  elements.rejectButton.disabled = true;
  elements.replyComposer.open = false;
  elements.advancedSettings.open = false;
  elements.disableAutomaticReplies.checked = false;
  elements.knowledgeJourneyBar.hidden = true;
  elements.patternActionBar.hidden = true;
  elements.diagnosisActionPanel.hidden = true;
  elements.reviewKnowledgePatternButton.hidden = true;
  elements.fieldChoices.children = [
    "category", "priority", "team", "assignee", "status", "tags", "customerResponse",
  ].map((value) => {
    const field = new FakeElement();
    field.value = value;
    field.textContent = "Approve";
    field.className = "field-approve-button";
    return field;
  });
  elements.queueFilters.children = [
    ["active", "Active"],
    ["draft-ready", "Draft ready"],
    ["waiting", "Waiting"],
    ["customer-replied", "Customer replied"],
    ["resolved", "Closed"],
    ["all", "All"],
  ].map(([value, label]) => {
    const filter = new FakeElement();
    filter.value = value;
    filter.textContent = label;
    filter.className = "chip queue-filter";
    return filter;
  });
  elements.rejectControls.children = [
    ["Wrong classification.", "Wrong"],
    ["Needs better evidence.", "Evidence"],
    ["Rewrite the customer response.", "Rewrite"],
  ].map(([value, label]) => {
    const button = new FakeElement();
    button.value = value;
    button.textContent = label;
    button.className = "quick-reason secondary";
    return button;
  });
  return elements;
}

export class FakeElement {
  checked = false;
  children: FakeElement[] = [];
  className = "";
  dataset: Record<string, string> = {};
  disabled = false;
  hidden = false;
  open = false;
  textContent = "";
  title = "";
  type = "";
  value = "";
  private parent: FakeElement | undefined;
  private innerHtmlValue = "";
  private readonly listeners = new Map<string, Array<(event?: unknown) => void>>();

  get innerHTML(): string {
    return this.innerHtmlValue;
  }

  set innerHTML(value: string) {
    this.innerHtmlValue = value;
    this.children = [];
    for (const match of value.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) {
      const attrs = match[1] ?? "";
      const button = new FakeElement();
      button.className = /class="([^"]*)"/.exec(attrs)?.[1] ?? "";
      button.value = /value="([^"]*)"/.exec(attrs)?.[1] ?? "";
      button.textContent = stripHtml(match[2] ?? "").trim();
      button.hidden = /\shidden(?:\s|>|$)/.test(attrs);
      button.disabled = /\sdisabled(?:\s|>|$)/.test(attrs);
      const action = /data-action="([^"]*)"/.exec(attrs)?.[1];
      const decision = /data-decision="([^"]*)"/.exec(attrs)?.[1];
      const diagnosisId = /data-diagnosis-id="([^"]*)"/.exec(attrs)?.[1];
      const reviewDecision = /data-review-decision="([^"]*)"/.exec(attrs)?.[1];
      if (action !== undefined) button.dataset.action = action;
      if (decision !== undefined) button.dataset.decision = decision;
      if (diagnosisId !== undefined) button.dataset.diagnosisId = diagnosisId;
      if (reviewDecision !== undefined) button.dataset.reviewDecision = reviewDecision;
      button.parent = this;
      this.children.push(button);
    }
  }

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  append(child: FakeElement): void {
    child.parent = this;
    this.children.push(child);
  }

  closest(selector: string): FakeElement | null {
    if (selector === "[data-action]" && this.dataset.action !== undefined) {
      return this;
    }
    return this.parent?.closest(selector) ?? null;
  }

  parentElement(): FakeElement | undefined {
    return this.parent;
  }

  dispatch(type: string, event?: unknown): void {
    const dispatchedEvent = event ?? { target: this };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(dispatchedEvent);
    }
    if (this.parent !== undefined) {
      this.parent.dispatch(type, dispatchedEvent);
    }
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === 'input[type="checkbox"]:checked') {
      return this.children.filter((child) => child.checked);
    }
    if (selector === ".field-approve-button") {
      return this.children.filter((child) => child.className.includes("field-approve-button"));
    }
    if (selector === ".queue-filter") {
      return this.children.filter((child) => child.className.includes("queue-filter"));
    }
    if (selector === ".quick-reason") {
      return this.children.filter((child) => child.className.includes("quick-reason"));
    }
    return [];
  }
}

function extractScript(html: string): string {
  const match = /<script>([\s\S]+)<\/script>/.exec(html);
  if (match === null) {
    throw new Error("Approval Desk HTML did not include browser script.");
  }
  return match[1]!;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

async function settle(ticks = 10): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) {
    await Promise.resolve();
  }
}
