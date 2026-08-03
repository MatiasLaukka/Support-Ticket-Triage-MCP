import type { Ticket, TriageRecommendation } from "../domain.js";
import type { DiagnosisContext } from "../triage-service.js";

export function diagnoseFromPlaybook(input: {
  ticket: Ticket;
  recommendation: TriageRecommendation;
  customerReplyText: string;
}): DiagnosisContext | undefined {
  if (input.recommendation.supportState === "waiting-on-platform-fix") {
    const eventProcessingDiagnosis = diagnoseEventProcessingDelay(
      input.customerReplyText,
    );
    if (eventProcessingDiagnosis !== undefined) {
      return eventProcessingDiagnosis;
    }
  }
  if (
    input.recommendation.category === "integration" &&
    input.recommendation.knowledgeArticleIds.includes("flow-trigger-troubleshooting")
  ) {
    return diagnoseFlowTriggerIssue(input);
  }
  if (input.recommendation.knowledgeArticleIds.includes("performance-troubleshooting")) {
    return diagnoseCampaignEditorLoading(input.customerReplyText);
  }
  const articleDiagnosis = diagnoseArticleBackedIssue(input);
  if (articleDiagnosis !== undefined) {
    return articleDiagnosis;
  }
  return undefined;
}

/**
 * Article-backed playbooks keep diagnosis specific without pretending that an
 * article is proof of a root cause. They deliberately return a likely
 * diagnosis until the evidence gate has been satisfied.
 */
function diagnoseArticleBackedIssue(input: {
  ticket: Ticket;
  recommendation: TriageRecommendation;
  customerReplyText: string;
}): DiagnosisContext | undefined {
  if (input.recommendation.category === "feature-request" || input.ticket.status === "resolved") {
    return undefined;
  }
  // Canonical known causes and known events have their own authoritative
  // workflow below; article playbooks must not shadow those transitions.
  if (
    input.recommendation.knownCause !== undefined &&
    input.recommendation.knownCause !== null
  ) {
    return undefined;
  }
  if (
    input.recommendation.knownEventId !== undefined &&
    input.recommendation.knownEventId !== null
  ) {
    return undefined;
  }
  if (input.recommendation.supportState === "waiting-on-platform-fix") {
    return undefined;
  }
  const text = `${input.ticket.subject} ${input.ticket.description} ${input.customerReplyText}`.toLowerCase();
  const evidenceComplete = (input.recommendation.missingEvidence?.length ?? 0) === 0;
  const articleIds = input.recommendation.knowledgeArticleIds;

  if (articleIds.includes("security-incident-response") &&
    /key|credential|secret|expos|security|token/.test(text)) {
    return articleDiagnosis({
      causeType: "security",
      owner: "engineering",
      evidenceComplete,
      summary: "The evidence supports treating this as a potential credential-exposure incident requiring security containment and audit review.",
      evidenceUsed: ["credential exposure symptoms", "rotation and usage context"],
      nextAction: evidenceComplete
        ? "Confirm rotation, review the relevant audit scope, and keep the security response owner responsible for containment."
        : "Collect the key identifier, rotation status, usage status, and affected scope before narrowing the security response.",
    });
  }

  if (articleIds.includes("email-deliverability") &&
    /deliverability|bounce|spam complaint|sending domain/.test(text)) {
    return articleDiagnosis({
      causeType: "performance",
      owner: "engineering",
      evidenceComplete,
      summary: "The evidence points to a sending-domain deliverability degradation that should be compared with bounce and suppression patterns.",
      evidenceUsed: ["sending-domain change", "bounce or suppression symptoms"],
      nextAction: evidenceComplete
        ? "Compare bounce samples, suppression growth, and sender-domain alignment with the previous baseline before recommending a correction."
        : "Collect the campaign, sender-domain, and bounce details before confirming the deliverability diagnosis.",
    });
  }

  if (articleIds.includes("segmentation-audience-rules") &&
    /segment|audience|flow filter|snapshot/.test(text) &&
    !/campaign audience snapshot|campaign.*(?:stuck|preparing)/.test(text)) {
    return articleDiagnosis({
      causeType: "configuration",
      owner: "support",
      evidenceComplete,
      summary: "The evidence points to a segment rule or recalculation mismatch affecting the observed audience count.",
      evidenceUsed: ["audience or segment symptoms", "rule or recalculation timing"],
      nextAction: evidenceComplete
        ? "Compare the rule definition, sample profile properties, and recalculation timing before recommending a correction."
        : "Collect the segment, expected count, sample profile, and recalculation details before confirming the audience diagnosis.",
    });
  }

  if (articleIds.includes("campaign-send-failures") &&
    /campaign|send|preparing|audience snapshot/.test(text) &&
    !/coupon|coupon codes|preview emails/.test(text)) {
    return articleDiagnosis({
      causeType: "configuration",
      owner: "support",
      evidenceComplete,
      summary: "The evidence points to a campaign preparation or send-status problem that needs the campaign and audience state compared.",
      evidenceUsed: ["campaign send symptoms", "audience or send-status details"],
      nextAction: evidenceComplete
        ? "Compare the campaign status, audience snapshot, template validation, and sender checks before recommending a correction."
        : "Collect the campaign identifier, scheduled time, audience size, and visible error before confirming the send diagnosis.",
    });
  }

  if (articleIds.includes("coupon-catalog-sync") &&
    /coupon|catalog|product|sku/.test(text) &&
    !/shopify|catalog sync|new products/.test(text)) {
    return articleDiagnosis({
      causeType: "configuration",
      owner: "support",
      evidenceComplete,
      summary: "The evidence points to coupon or catalog data being out of sync with the campaign or product configuration.",
      evidenceUsed: ["coupon or catalog symptoms", "store and sync timing"],
      nextAction: evidenceComplete
        ? "Compare the product or coupon identifiers with catalog import history before recommending a correction."
        : "Collect the store, product or coupon reference, and last sync details before confirming the catalog diagnosis.",
    });
  }

  if (articleIds.includes("profile-sync-issues") &&
    /profile|duplicate|consent|import/.test(text) &&
    !/sms|opt.?out|quiet.hour/.test(text)) {
    return articleDiagnosis({
      causeType: "customer-data",
      owner: "support",
      evidenceComplete,
      summary: "The evidence points to a profile identity or synchronization mismatch affecting the reported record.",
      evidenceUsed: ["profile or consent symptoms", "identity and update timing"],
      nextAction: evidenceComplete
        ? "Compare the affected identifiers, source update, and profile history before recommending a merge or synchronization correction."
        : "Collect one affected profile, its source identifier, and update timing before confirming the profile diagnosis.",
    });
  }

  if (articleIds.includes("shopify-integration-sync") &&
    /shopify|catalog|product|connector|sync/.test(text)) {
    return articleDiagnosis({
      causeType: "integration",
      owner: "integration-partner",
      evidenceComplete,
      summary: "The evidence points to an ecommerce integration synchronization mismatch affecting the reported object.",
      evidenceUsed: ["ecommerce integration symptoms", "source object and sync timing"],
      nextAction: evidenceComplete
        ? "Compare the source object, connection state, and platform import history before recommending a synchronization correction."
        : "Collect the store, affected object, and source update time before confirming the integration diagnosis.",
    });
  }

  if (articleIds.includes("sms-compliance") &&
    /sms|text message|opt.?out|quiet.hour|consent/.test(text)) {
    return articleDiagnosis({
      causeType: "configuration",
      owner: "support",
      evidenceComplete,
      summary: "The evidence points to an SMS eligibility or compliance rule affecting the reported recipient.",
      evidenceUsed: ["SMS delivery or opt-out symptoms", "recipient region and consent timing"],
      nextAction: evidenceComplete
        ? "Compare consent state, recipient region, quiet-hour timing, and the compliance message before recommending a send action."
        : "Collect the recipient region, consent timeline, scheduled time, and compliance message before confirming the SMS diagnosis.",
    });
  }

  if (articleIds.includes("webhook-signature-validation") &&
    /webhook|signature|delivery|retry/.test(text)) {
    return articleDiagnosis({
      causeType: "integration",
      owner: "integration-partner",
      evidenceComplete,
      summary: "The evidence points to a webhook delivery or signature-validation mismatch that needs the signed payload compared.",
      evidenceUsed: ["webhook delivery symptoms", "endpoint and signature timing"],
      nextAction: evidenceComplete
        ? "Compare the delivery headers, endpoint response, raw-body handling, and rotation timing before recommending a code change."
        : "Collect the delivery ID, endpoint response, and signing configuration details before confirming the webhook diagnosis.",
    });
  }

  return undefined;
}

function articleDiagnosis(input: {
  causeType: DiagnosisContext["causeType"];
  owner: DiagnosisContext["owner"];
  evidenceComplete: boolean;
  summary: string;
  evidenceUsed: string[];
  nextAction: string;
}): DiagnosisContext {
  return {
    status: "completed",
    causeType: input.causeType,
    customerSafeSummary: input.evidenceComplete
      ? input.summary
      : `${input.summary.replace(/\.$/, "")}, but the remaining evidence is needed before we can confirm it.`,
    evidenceUsed: input.evidenceUsed,
    confidence: "likely",
    owner: input.owner,
    recommendedNextAction: input.nextAction,
    doNotSay: [
      "Do not present the article-backed diagnosis as a confirmed root cause while required evidence is missing.",
      "Do not claim a fix until a governed fix event is recorded.",
    ],
  };
}

function diagnoseFlowTriggerIssue(input: {
  ticket: Ticket;
  recommendation: TriageRecommendation;
  customerReplyText: string;
}): DiagnosisContext {
  const text = `${input.ticket.subject} ${input.ticket.description} ${input.customerReplyText}`.toLowerCase();
  const flowLabel = /browse abandonment/.test(text)
    ? "Browse Abandonment"
    : /abandoned cart/.test(text)
      ? "Abandoned Cart"
      : "the affected";
  const eventLabel = /viewed product/.test(text)
    ? "Viewed Product"
    : /added to cart/.test(text)
      ? "Added to Cart"
      : "the storefront event";
  const evidenceComplete = (input.recommendation.missingEvidence?.length ?? 0) === 0;

  return {
    status: "completed",
    causeType: "integration",
    customerSafeSummary: evidenceComplete
      ? `The provided details point to a mismatch between the ${eventLabel} event and ${flowLabel} flow eligibility.`
      : `The current details point to a possible mismatch between the ${eventLabel} event and ${flowLabel} flow eligibility, but the remaining flow and event details are needed before we can confirm it.`,
    evidenceUsed: ["flow trigger symptoms", "storefront event details"],
    confidence: "likely",
    owner: "integration-partner",
    recommendedNextAction: evidenceComplete
      ? "Compare the storefront event with the flow trigger filters and profile eligibility, then recommend the safest correction."
      : "Collect the remaining flow and event details before confirming the trigger diagnosis.",
    doNotSay: [
      "Do not claim the flow trigger or event mapping is fixed until a governed correction is recorded.",
      "Do not expose internal policy or detection details from the ticket.",
    ],
  };
}

function diagnoseEventProcessingDelay(
  customerReplyText: string,
): DiagnosisContext | undefined {
  const text = customerReplyText.toLowerCase();
  if (!confirmsPlatformEventProcessingDelay(text)) {
    return undefined;
  }
  return {
    status: "completed",
    causeType: "platform-delay",
    customerSafeSummary:
      "The evidence confirms a platform-side processing delay affecting accepted checkout events and profile timeline updates.",
    evidenceUsed: [
      "multiple affected store examples",
      "accepted event or API evidence",
      "missing profile timeline updates",
    ],
    confidence: "confirmed",
    owner: "engineering",
    recommendedNextAction:
      "Prepare the event-processing mitigation and ask the customer to verify the affected profile timelines after it is available.",
    doNotSay: ["Do not ask the customer to resend the same examples."],
  };
}

function diagnoseCampaignEditorLoading(customerReplyText: string): DiagnosisContext {
  const text = customerReplyText.toLowerCase();
  if (confirmsFrontendLoadingIssue(text)) {
    return {
      status: "completed",
      causeType: "performance",
      customerSafeSummary:
        "The browser-session checks point to a frontend loading issue in the campaign editor for the affected campaign.",
      evidenceUsed: [
        "private or incognito window check",
        "different browser check",
        "another admin check",
        "browser console error",
      ],
      confidence: "confirmed",
      owner: "engineering",
      recommendedNextAction:
        "Prepare the frontend loading mitigation and ask the customer to verify the campaign editor after it is available.",
      doNotSay: [
        "Do not ask for another screenshot of the blank page.",
        "Do not call this a browser-session issue after the customer confirmed cross-browser and another-admin impact.",
      ],
      diagnosticState: campaignEditorDiagnosticState("confirmed", "frontend-loading"),
    };
  }

  if (confirmsBrowserSessionIssue(text)) {
    return {
      status: "completed",
      causeType: "performance",
      customerSafeSummary:
        "The editor works after browser-session isolation, so this points to local browser session state rather than a platform-side frontend loading issue.",
      evidenceUsed: ["private or incognito window check", "browser/session isolation"],
      confidence: "confirmed",
      owner: "customer",
      recommendedNextAction:
        "Ask the customer to clear site data or continue in the working browser session; no platform fix is needed.",
      doNotSay: [
        "Do not claim engineering has applied a platform mitigation.",
        "Do not ask for frontend console evidence after the browser-session issue is confirmed.",
      ],
      diagnosticState: campaignEditorDiagnosticState("confirmed", "browser-session"),
    };
  }

  return {
    status: "completed",
    causeType: "performance",
    customerSafeSummary:
      "The details narrow the issue to campaign editor loading, but browser/session checks are needed before treating this as a frontend loading issue.",
    evidenceUsed: [
      "campaign name",
      "failure timestamp",
      "browser/session details",
      "affected scope",
    ],
    confidence: "likely",
    owner: "engineering",
    recommendedNextAction:
      "We will use the result of those checks to decide whether this can be resolved as a browser/session issue or needs frontend engineering investigation.",
    doNotSay: [
      "Do not claim the issue is fixed until a fix event is recorded.",
      "Do not ask for another screenshot of the blank page.",
      "Do not claim this is a confirmed frontend issue until browser/session checks fail.",
    ],
    diagnosticState: {
      state: "ambiguous",
      diagnosticAttempts: 0,
      hypotheses: [
        {
          id: "browser-session",
          label: "Browser/session issue",
          status: "plausible",
          evidenceUsed: ["campaign editor loading symptoms"],
          evidenceToConfirm: [
            "The editor works in a private window, another browser, or after clearing site data.",
          ],
        },
        {
          id: "frontend-loading",
          label: "Frontend loading issue",
          status: "plausible",
          evidenceUsed: ["campaign editor loading symptoms"],
          evidenceToConfirm: [
            "The editor fails across browser sessions and admins with a browser console loading error.",
          ],
        },
      ],
      evidenceToRequest: [
        "Try the editor in a private or incognito window.",
        "Try another browser and ask another admin to open the same campaign.",
        "Share any browser console loading error and retry time if it remains blank.",
      ],
    },
  };
}

function campaignEditorDiagnosticState(
  state: "confirmed",
  confirmedHypothesisId: "browser-session" | "frontend-loading",
) {
  return {
    state,
    diagnosticAttempts: 0,
    hypotheses: [
      {
        id: "browser-session",
        label: "Browser/session issue",
        status: confirmedHypothesisId === "browser-session"
          ? "confirmed" as const
          : "ruled-out" as const,
        evidenceUsed: ["browser/session isolation evidence"],
        evidenceToConfirm: [
          "The editor works in a private window, another browser, or after clearing site data.",
        ],
      },
      {
        id: "frontend-loading",
        label: "Frontend loading issue",
        status: confirmedHypothesisId === "frontend-loading"
          ? "confirmed" as const
          : "ruled-out" as const,
        evidenceUsed: ["cross-browser or cross-admin loading evidence"],
        evidenceToConfirm: [
          "The editor fails across browser sessions and admins with a browser console loading error.",
        ],
      },
    ],
    evidenceToRequest: [],
  };
}

function confirmsPlatformEventProcessingDelay(text: string): boolean {
  const broadImpact = /\b(?:all|multiple|several|both)\b.{0,48}\b(?:eu\s+)?stores?\b|\b(?:eu\s+)?stores?\b.{0,48}\b(?:all|multiple|several|both)\b/.test(text);
  const acceptedEvent = /\b(?:api|event|events|tracking call|tracking calls)\b.{0,48}\b(?:accepted|successful|success|200|202)\b|\b(?:accepted|successful|success|200|202)\b.{0,48}\b(?:api|event|events|tracking call|tracking calls)\b/.test(text);
  const missingTimeline = /\b(?:profile timeline|profile timelines|timeline|timelines)\b.{0,48}\b(?:missing|not showing|not appearing|absent|still missing)\b|\b(?:missing|not showing|not appearing|absent|still missing)\b.{0,48}\b(?:profile timeline|profile timelines|timeline|timelines)\b/.test(text);
  return broadImpact && acceptedEvent && missingTimeline;
}

function confirmsFrontendLoadingIssue(text: string): boolean {
  const triedPrivate = /\b(?:incognito|private)\b/.test(text);
  const triedDifferentBrowser = /\b(?:different browser|another browser|edge|firefox|safari)\b/.test(text);
  const triedAnotherAdmin = /\b(?:another admin|other admin|teammate|team member|coworker)\b/.test(text);
  const stillBlank = /\b(?:still|also|same)\b.{0,32}\b(?:blank|not loading|won't load|does not load|doesn't load)\b/.test(text);
  const consoleError = /\b(?:console|chunkloaderror|chunk load|javascript error|loading error)\b/.test(text);
  return triedPrivate && triedDifferentBrowser && triedAnotherAdmin && stillBlank && consoleError;
}

function confirmsBrowserSessionIssue(text: string): boolean {
  const positiveBrowserIsolation =
    /\b(?:works|loads|opens|is working)\b.{0,40}\b(?:incognito|private|different browser|another browser|after clearing|cleared site data|cleared cache)\b/.test(text) ||
    /\b(?:incognito|private|different browser|another browser|after clearing|cleared site data|cleared cache)\b.{0,40}\b(?:works|loads|opens|is working)\b/.test(text);
  const contradictedByIsolationFailure =
    /\b(?:incognito|private|different browser|another browser)\b.{0,60}\b(?:still|also|same)\b.{0,32}\b(?:blank|not loading|won't load|does not load|doesn't load)\b|\b(?:still|also|same)\b.{0,32}\b(?:blank|not loading|won't load|does not load|doesn't load)\b.{0,60}\b(?:incognito|private|different browser|another browser)\b/.test(text);
  return positiveBrowserIsolation && !contradictedByIsolationFailure;
}
