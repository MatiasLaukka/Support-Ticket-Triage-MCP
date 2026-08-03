import type {
  EvidenceRequirement,
  ExpectedOutcome,
  SupportState,
  Ticket,
} from "../domain.js";
import type { KnowledgeObject } from "../knowledge-evolution/domain.js";
import { requireEvidenceRequirement } from "../evidence-catalog.js";
import { extractAccountFacts, type AccountFacts } from "./account-facts.js";
import { detectKnownCause, getKnownCause } from "./known-cause-catalog.js";
import {
  detectKnownEvent,
  type KnownEventStatus,
} from "./known-event-catalog.js";

type EvidenceSource = EvidenceRequirement["source"];

export interface EvidenceReadiness {
  supportState: SupportState;
  knownCause?: string | null;
  approvedKnownCause?: ApprovedKnownCause;
  knownEventId?: string | null;
  knownEventMatchReasons?: string[];
  requiredEvidence: EvidenceRequirement[];
  providedEvidence: EvidenceRequirement[];
  missingEvidence: EvidenceRequirement[];
  nextInvestigationSteps: string[];
}

export interface ApprovedKnownCause {
  id: string;
  evidencePolicy: "none-required" | "required";
  customerSafeExplanation: string;
}

const KNOWLEDGE_EVIDENCE: Readonly<Record<string, readonly string[]>> = {
  "account-access": [
    "profile-email",
    "object-id",
    "error-banner",
    "failure-timestamp",
    "browser-session-details",
  ],
  "api-reference": [
    "endpoint-url",
    "request-id",
    "api-response-status",
    "sample-payload",
    "failure-timestamp",
  ],
  authentication: [
    "profile-email",
    "error-banner",
    "failure-timestamp",
    "browser-session-details",
  ],
  "billing-and-invoices": [
    "invoice-number",
    "billing-account",
    "plan-or-promotion",
    "failure-timestamp",
    "error-banner",
  ],
  "campaign-send-failures": [
    "campaign-name",
    "scheduled-send-time",
    "audience-size",
    "error-banner",
  ],
  "coupon-catalog-sync": [
    "store-url",
    "product-reference",
    "coupon-pool-name",
    "catalog-sync-time",
    "unused-coupon-status",
  ],
  "email-deliverability": [
    "campaign-name",
    "scheduled-send-time",
    "sending-domain",
    "affected-recipient-domains",
    "bounce-samples",
  ],
  "event-tracking-debugging": [
    "platform",
    "profile-email",
    "event-id",
    "request-id",
    "sample-payload",
  ],
  "flow-trigger-troubleshooting": [
    "platform",
    "flow-id",
    "profile-email",
    "event-id",
    "product-reference",
  ],
  "product-feedback": [
    "feature-description",
    "use-case",
    "affected-scope",
  ],
  "profile-sync-issues": [
    "profile-email",
    "object-id",
    "request-id",
    "catalog-sync-time",
  ],
  "performance-troubleshooting": [
    "problem-summary",
    "failure-timestamp",
    "browser-session-details",
    "affected-scope",
  ],
  "security-incident-response": [
    "key-identifier",
    "exposure-location",
    "key-usage-status",
    "rotation-status",
    "audit-source",
    "affected-scope",
  ],
  "segmentation-audience-rules": [
    "segment-name",
    "audience-size",
    "profile-email",
  ],
  "shopify-integration-sync": [
    "store-url",
    "platform",
    "object-id",
    "catalog-sync-time",
  ],
  "sms-compliance": [
    "campaign-name",
    "scheduled-send-time",
    "recipient-region",
    "compliance-banner",
  ],
  "webhook-signature-validation": [
    "delivery-id",
    "endpoint-url",
    "failure-timestamp",
    "signing-secret-rotation-time",
    "timestamp-tolerance",
    "endpoint-response-code",
    "raw-body-change-status",
  ],
};

export function analyzeEvidenceReadiness(input: {
  ticket: Ticket;
  outcome: ExpectedOutcome;
  approvedObjects?: readonly KnowledgeObject[];
  candidate?: {
    status: "candidate";
    evidencePolicy: "none-required" | "required";
  };
}): EvidenceReadiness {
  const legacyKnownCauseDefinition = detectKnownCause(input);
  const legacyKnownCause = legacyKnownCauseDefinition?.id ?? null;
  const knownEvent = detectKnownEvent({
    ticket: input.ticket,
    knownCause: legacyKnownCause,
  });
  const approvedKnownCause = findApprovedKnownCause(input.ticket, input.approvedObjects);
  const approvedCauseCanApply = approvedKnownCause !== undefined &&
    knownEvent?.status !== "active" &&
    !input.outcome.requiredEscalations.includes("outage");
  const knownCause = approvedCauseCanApply
    ? approvedKnownCause.id
    : legacyKnownCause;
  const accountFacts = extractAccountFacts(input.ticket);
  const requiredEvidence =
    approvedCauseCanApply
      ? evidenceForApprovedKnownCause(input.approvedObjects!, approvedKnownCause.id)
      : legacyKnownCauseDefinition !== undefined
      ? evidenceForKnownCause(legacyKnownCauseDefinition.requiredEvidenceIds)
      : evidenceForIssuePattern(input) ??
        evidenceForKnowledge(
          relevantKnowledgeArticleIds(input.ticket, input.outcome),
          "knowledge",
        );
  const providedEvidence = requiredEvidence.filter((requirement) =>
    isEvidenceProvided(requirement, input.ticket, accountFacts),
  );
  const providedIds = new Set(providedEvidence.map((requirement) => requirement.id));
  const missingEvidence = requiredEvidence.filter(
    (requirement) => !providedIds.has(requirement.id),
  );

  return {
    supportState: chooseSupportState({
      knownCause,
      bypassMissingEvidence:
        (approvedCauseCanApply &&
          approvedKnownCause?.evidencePolicy === "none-required") ||
        (knownEvent?.status !== "active" &&
          legacyKnownCauseDefinition?.evidencePolicy === "none-required"),
      knownEventStatus: knownEvent?.status ?? null,
      missingEvidence,
      outcome: input.outcome,
    }),
    knownCause,
    ...(approvedCauseCanApply ? { approvedKnownCause } : {}),
    knownEventId: knownEvent?.eventId ?? null,
    knownEventMatchReasons: knownEvent?.matchReasons ?? [],
    requiredEvidence,
    providedEvidence,
    missingEvidence,
    nextInvestigationSteps: buildNextInvestigationSteps({
      knownCause,
      approvedKnownCause: approvedCauseCanApply ? approvedKnownCause : undefined,
      knownEventStatus: knownEvent?.status ?? null,
      missingEvidence,
      outcome: input.outcome,
    }),
  };
}

function findApprovedKnownCause(
  ticket: Ticket,
  approvedObjects: readonly KnowledgeObject[] | undefined,
): ApprovedKnownCause | undefined {
  if (approvedObjects === undefined) return undefined;
  const text = normalizedTicketText(ticket);
  const matched = approvedObjects
    .filter((object) => object.status === "approved" && object.kind === "known-cause")
    .filter((object) => matchesApprovedKnownCause(object, ticket, text))
    .sort((left, right) => approvedMatchSpecificity(right) - approvedMatchSpecificity(left) ||
      left.id.localeCompare(right.id))[0];
  return matched === undefined ? undefined : approvedKnownCauseFromObject(matched);
}

function matchesApprovedKnownCause(
  object: KnowledgeObject,
  ticket: Ticket,
  text: string,
): boolean {
  return object.triggerPatterns.every((pattern) => {
    const normalized = normalizeTrigger(pattern);
    return hasMeaningfulTokens(normalized) && text.includes(normalized);
  }) && timeConstraintsMatch(object.timeConstraints, ticket.createdAt);
}

function hasMeaningfulTokens(value: string): boolean {
  return value.split(" ").some((token) => token.length >= 2);
}

function approvedMatchSpecificity(object: KnowledgeObject): number {
  return object.triggerPatterns.reduce(
    (total, pattern) => total + normalizeTrigger(pattern).split(" ").filter(Boolean).length,
    0,
  );
}

function timeConstraintsMatch(constraints: readonly string[], createdAt: string): boolean {
  const timestamp = new Date(createdAt).getTime();
  return constraints.every((constraint) => {
    const timestamps = constraint.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g) ?? [];
    if (timestamps.length < 2) return true;
    const startsAt = new Date(timestamps[0]!).getTime();
    const endsAt = new Date(timestamps[1]!).getTime();
    return Number.isFinite(timestamp) && Number.isFinite(startsAt) &&
      Number.isFinite(endsAt) && timestamp >= startsAt && timestamp <= endsAt;
  });
}

function approvedKnownCauseFromObject(object: KnowledgeObject): ApprovedKnownCause {
  return {
    id: object.id,
    evidencePolicy: object.evidencePolicy.mode,
    customerSafeExplanation: object.customerSafeExplanation,
  };
}

function evidenceForApprovedKnownCause(
  approvedObjects: readonly KnowledgeObject[],
  id: string,
): EvidenceRequirement[] {
  const object = approvedObjects.find((candidate) => candidate.id === id);
  if (object?.evidencePolicy.mode !== "required") return [];
  return evidenceForIds(object.evidencePolicy.evidenceIds, "known-cause");
}

function normalizedTicketText(ticket: Ticket): string {
  return normalizeTrigger(ticketText(ticket));
}

function normalizeTrigger(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function evidenceForIssuePattern(input: {
  ticket: Ticket;
  outcome: ExpectedOutcome;
}): EvidenceRequirement[] | undefined {
  if (input.outcome.knowledgeArticleIds.includes("security-incident-response")) {
    return evidenceForKnowledge(["security-incident-response"], "policy");
  }
  if (
    input.outcome.category === "other" &&
    input.outcome.knowledgeArticleIds.length === 0
  ) {
    return evidenceForIds(
      ["problem-summary", "reproduction-steps", "screenshot-or-error"],
      "policy",
    );
  }
  if (
    input.outcome.category === "performance" &&
    input.outcome.team === "product" &&
    /\bcampaign editor\b.{0,80}\b(?:blank|not loading|stayed blank|empty page)|\b(?:blank|stayed blank|empty page)\b.{0,80}\bcampaign editor\b/i.test(
      ticketText(input.ticket),
    )
  ) {
    return evidenceForIds(
      [
        "campaign-name",
        "failure-timestamp",
        "browser-session-details",
        "affected-scope",
        "problem-summary",
        "reproduction-steps",
      ],
      "policy",
    );
  }
  if (
    input.outcome.requiredEscalations.includes("outage") &&
    input.outcome.knowledgeArticleIds.includes("event-tracking-debugging")
  ) {
    return evidenceForIds(
      [
      "store-url",
      "profile-email",
      "event-id",
      "request-id",
      "api-response-status",
      "timeline-visibility",
      ],
      "policy",
    );
  }
  if (
    input.outcome.knowledgeArticleIds.includes("shopify-integration-sync") &&
    input.outcome.knowledgeArticleIds.includes("coupon-catalog-sync") &&
    /\b(?:product|catalog|sku)\b/i.test(ticketText(input.ticket)) &&
    !/\b(?:coupon|promo(?:tion)? code|discount code)\b/i.test(ticketText(input.ticket))
  ) {
    return evidenceForIds(
      ["store-url", "object-id", "catalog-sync-time", "product-reference"],
      "policy",
    );
  }
  return undefined;
}

function relevantKnowledgeArticleIds(
  ticket: Ticket,
  outcome: ExpectedOutcome,
): readonly string[] {
  if (
    outcome.knowledgeArticleIds.includes("flow-trigger-troubleshooting") &&
    outcome.knowledgeArticleIds.includes("event-tracking-debugging") &&
    classifyTicketAudience(ticket) === "merchant-admin"
  ) {
    return outcome.knowledgeArticleIds.filter(
      (articleId) => articleId !== "event-tracking-debugging",
    );
  }
  return outcome.knowledgeArticleIds;
}

function evidenceForKnowledge(
  knowledgeArticleIds: readonly string[],
  source: EvidenceSource,
): EvidenceRequirement[] {
  const ids = unique(
    knowledgeArticleIds.flatMap((articleId) => KNOWLEDGE_EVIDENCE[articleId] ?? []),
  );
  return ids.map((id) => evidenceRequirement(id, source));
}

function evidenceForKnownCause(ids: readonly string[]): EvidenceRequirement[] {
  return evidenceForIds(ids, "known-cause");
}

function evidenceForIds(
  ids: readonly string[],
  source: EvidenceSource,
): EvidenceRequirement[] {
  return unique(ids).map((id) => evidenceRequirement(id, source));
}

function evidenceRequirement(id: string, source: EvidenceSource): EvidenceRequirement {
  const base = requireEvidenceRequirement(id);
  return {
    id: base.id,
    label: base.label,
    customerQuestion: base.customerQuestion,
    aliases: base.aliases,
    source,
  };
}

function chooseSupportState(input: {
  knownCause: string | null;
  bypassMissingEvidence: boolean;
  knownEventStatus: KnownEventStatus | null;
  missingEvidence: readonly EvidenceRequirement[];
  outcome: ExpectedOutcome;
}): SupportState {
  if (input.missingEvidence.length > 0 && !input.bypassMissingEvidence) {
    return "needs-information";
  }
  if (input.knownCause !== null) {
    return "known-cause";
  }
  if (
    input.knownEventStatus === "active" ||
    input.outcome.requiredEscalations.includes("outage")
  ) {
    return "waiting-on-platform-fix";
  }
  if (input.knownEventStatus === "investigating") {
    return "diagnosing";
  }
  return "diagnosing";
}

function buildNextInvestigationSteps(input: {
  knownCause: string | null;
  approvedKnownCause?: ApprovedKnownCause;
  knownEventStatus: KnownEventStatus | null;
  missingEvidence: readonly EvidenceRequirement[];
  outcome: ExpectedOutcome;
}): string[] {
  if (input.missingEvidence.length > 0) {
    if (input.approvedKnownCause !== undefined) {
      return ["Collect the approved evidence before confirming the documented support path."];
    }
    const knownCause = getKnownCause(input.knownCause);
    if (knownCause !== undefined) {
      return [...knownCause.investigationSteps];
    }
    if (input.outcome.knowledgeArticleIds.includes("flow-trigger-troubleshooting")) {
      return [
        "Collect the missing evidence before recommending a configuration change.",
        "Compare the customer example against the flow setup and profile timeline.",
      ];
    }
    return [
      "Collect the missing evidence before recommending a configuration change.",
      "Compare the customer example against the relevant platform setup and activity timeline.",
    ];
  }
  if (input.knownEventStatus === "active") {
    return [
      "Continue platform-impact review and share the next customer update after mitigation status changes.",
      "Compare the affected delivery timestamps against the known event window before requesting unrelated diagnostics.",
    ];
  }
  if (input.knownEventStatus === "investigating") {
    return [
      "Keep the ticket in diagnostic review until the possible event is confirmed or ruled out.",
      "Collect only evidence that distinguishes the event window from a customer-specific configuration issue.",
    ];
  }
  const knownCause = getKnownCause(input.knownCause);
  if (knownCause !== undefined) {
    return [...knownCause.investigationSteps];
  }
  if (input.approvedKnownCause !== undefined) {
    return ["Use the approved customer-safe guidance for the documented support path."];
  }
  if (input.outcome.requiredEscalations.includes("outage")) {
    return [
      "Correlate affected region, event timing, ingestion delay, and profile timeline updates.",
      "Confirm whether platform processing delay explains the customer impact.",
    ];
  }
  return [
    "Review the provided evidence against retrieved knowledge before recommending the next update.",
  ];
}

function isEvidenceProvided(
  requirement: EvidenceRequirement,
  ticket: Ticket,
  accountFacts: AccountFacts,
): boolean {
  const text = ticketText(ticket);
  switch (requirement.id) {
    case "api-response-status":
    case "endpoint-response-code":
      return /\b(api response|response status|response code|http status|200|202|400|401|403|404|429|500|validation error|accepted by the api|api accepted|accepted)\b/i.test(
        text,
      );
    case "platform":
      if (accountFacts.ecommercePlatform !== undefined) {
        return true;
      }
      return /\b(shopify|magento|woocommerce|custom store|custom setup)\b/i.test(
        text,
      );
    case "store-url":
    case "endpoint-url":
    case "product-reference":
      if (requirement.id === "store-url" && accountFacts.storeUrls.length > 0) {
        return true;
      }
      return /\bhttps?:\/\/\S+|\b[a-z0-9-]+\.(com|net|org|io|co|fi|store)\b/i.test(
        text,
      );
    case "profile-email":
      return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:customer id|profile id|customer_id|profile_id)\b.{0,24}\b[a-z]{2,}[_-][a-z0-9]+\b/i.test(text);
    case "event-id":
      return /\bevent (id|time|timestamp)\b|\bevt[-_a-z0-9]+\b/i.test(text);
    case "request-id":
      return /\b(request id|req[-_][a-z0-9]+)\b/i.test(text);
    case "delivery-id":
      return /\b(delivery id|deliv[-_][a-z0-9]+)\b/i.test(text);
    case "problem-summary":
      return hasSpecificProblemSummary(
        [ticket.subject, ticket.description].join(" "),
      );
    case "reproduction-steps":
      return /\b(?:steps?|clicked|opened|selected|submitted|tried|attempted|when i|when we|after i|after we)\b/i.test(
        text,
      );
    case "screenshot-or-error":
      return /\b(?:screenshot|screen recording|recording|error message|error code|banner says|message says)\b/i.test(
        text,
      );
    case "browser-session-details":
      return /\b(?:chrome|firefox|safari|edge|browser|incognito|cache|signed out|signing out|session)\b/i.test(
        text,
      );
    case "key-identifier":
      return hasConcreteKeyIdentifier(text);
    case "exposure-location":
      return hasExposureLocation(text);
    case "key-usage-status":
      return hasKnownKeyUsageStatus(text);
    case "rotation-status":
      return hasKnownRotationStatus(text);
    case "audit-source":
      return hasConcreteAuditSource(text);
    case "affected-scope":
      return hasKnownAffectedScope(text);
    case "failure-timestamp":
      return /\b(failure timestamp|failure time|failed at|fails at)\b/i.test(
        text,
      );
    case "signing-secret-rotation-time":
      return hasKnownSigningSecretRotationTime(text);
    case "scheduled-send-time":
    case "catalog-sync-time":
    case "source-update-time":
    case "event-created-time":
    case "delivery-attempt-time":
      return /\b\d{1,2}:\d{2}\b|\b\d{4}-\d{2}-\d{2}\b|\b(am|pm|utc|gmt|eet|est|pst)\b/i.test(
        text,
      );
    case "opt-out-timestamp":
      return /\b(stop|opt-out).*(\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}|am|pm|utc|gmt|eet|est|pst)\b/i.test(
        text,
      );
    default:
      return requirement.aliases.some((alias) =>
        hasAffirmativeAliasMention(text, alias),
      );
  }
}

function hasConcreteKeyIdentifier(text: string): boolean {
  return /\b(?:key (?:id|identifier)|last (?:four|4)(?: characters)?|ending in)\s*(?:is|was|:)?\s*[a-z0-9][a-z0-9_-]{2,}\b/i.test(
    text,
  );
}

function hasExposureLocation(text: string): boolean {
  if (
    /\b(?:do not know|don't know|not known|unknown|unclear)\b.{0,60}\b(?:where|location)\b|\b(?:where|location)\b.{0,40}\b(?:not known|unknown|unclear)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return /\b(?:shared|pasted|posted|published|included|exposed|leaked)\b.{0,80}\b(?:logs?|log bundle|ticket|chat|email|repository|repo|document|file)\b|\b(?:logs?|log bundle|ticket|chat|email|repository|repo|document|file)\b.{0,80}\b(?:contained|included|exposed|leaked|showed)\b/i.test(
    text,
  );
}

function hasKnownKeyUsageStatus(text: string): boolean {
  const subject = "(?:used|usage|actions taken)";
  const hasConcreteUsageStatus =
    /\b(?:key|credential|token|secret|password)\b.{0,50}\b(?:was|has been|had been|was not|has not been|never) used\b|\bno (?:post-exposure )?usage\b|\bactions taken (?:were|include|included|:)\b/i.test(
    text,
    ) ||
    /\b(?:cannot|can't|could not|couldn't)\s+see\s+any\b.{0,40}\b(?:post-exposure\s+)?(?:key\s+)?usage\b/i.test(
      text,
    );
  if (hasConcreteUsageStatus) return true;
  if (hasUnknownQualification(text, subject)) return false;
  return false;
}

function hasKnownRotationStatus(text: string): boolean {
  const subject = "(?:rotated|rotation|revoked|revocation)";
  if (hasUnknownQualification(text, subject)) return false;
  return /\b(?:key|credential|token|secret|password)\b.{0,50}\b(?:(?:was|has been|had been|is) (?:not )?(?:rotated|revoked)|remains active)\b|\b(?:rotated|revoked)\b.{0,50}\b(?:key|credential|token|secret|password)\b/i.test(
    text,
  );
}

function hasKnownSigningSecretRotationTime(text: string): boolean {
  const subject =
    "(?:signing[ -]secret|secret).{0,40}(?:rotat(?:ed|ion)|changed)|(?:rotat(?:ed|ion)|changed).{0,40}(?:signing[ -]secret|secret)";
  if (hasUnknownQualification(text, `(?:${subject})`)) return false;
  return new RegExp(
    `(?:${subject}).{0,80}(?:\\b\\d{1,2}:\\d{2}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\byesterday\\b|\\btoday\\b|\\b(?:am|pm|utc|gmt|eet|est|pst)\\b)|(?:\\b\\d{1,2}:\\d{2}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\byesterday\\b|\\btoday\\b|\\b(?:am|pm|utc|gmt|eet|est|pst)\\b).{0,80}(?:${subject})`,
    "i",
  ).test(text);
}

function hasConcreteAuditSource(text: string): boolean {
  const subject = "(?:audit source|source address|source ip|actor)";
  if (hasUnknownQualification(text, subject)) return false;
  return /\bsource (?:ip|address)\s*(?:is|was|:)?\s*(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:audit source|actor)\s*(?:is|was|:)\s*[a-z0-9][a-z0-9@._-]{2,}\b/i.test(
    text,
  );
}

function hasKnownAffectedScope(text: string): boolean {
  const subject = "(?:affected scope|affected profiles|profiles? (?:were )?accessed|accounts? (?:were )?accessed)";
  if (hasUnknownQualification(text, subject)) return false;
  return /\b\d+\s+(?:profiles?|accounts?|logs?|actions?)\b|\b(?:affected|accessed|exposed|impacted)\s+(?:profiles?|accounts?|logs?|actions?)\b|\b(?:profiles?|accounts?) were (?:accessed|exposed|affected)\b/i.test(
    text,
  );
}

function hasSpecificProblemSummary(text: string): boolean {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const vagueOnly =
    /^(?:(?:problem|issue|bug)[.!?\s]*)?(?:it (?:does not|doesn'?t|isn'?t|won'?t) work|not working|broken|problem|issue|bug)[.!?\s]*$/i;
  if (vagueOnly.test(trimmed)) {
    return false;
  }
  return (
    /\b(?:cannot|can'?t|failed|fails|missing|delayed|blocked|stuck|invalid|not showing|not sending|not syncing|not loading|error|broken)\b/i.test(
      text,
    ) ||
    /\b(?:blank page|page (?:stayed|is|was)(?: still)? blank|screen (?:stayed|is|was)(?: still)? blank|nothing (?:loaded|loads|happened)|stayed blank)\b/i.test(
      text,
    )
  );
}

function hasAffirmativeAliasMention(text: string, alias: string): boolean {
  const normalizedAlias = alias.toLowerCase();
  let offset = text.indexOf(normalizedAlias);
  while (offset !== -1) {
    const start = Math.max(0, offset - 80);
    const end = Math.min(text.length, offset + normalizedAlias.length + 50);
    const window = text.slice(start, end);
    if (!hasUnknownQualification(window, escapeRegExp(normalizedAlias))) {
      return true;
    }
    offset = text.indexOf(normalizedAlias, offset + normalizedAlias.length);
  }
  return false;
}

function hasUnknownQualification(text: string, subjectPattern: string): boolean {
  const unknown =
    "(?:do not know|don't know|not known|not yet known|unknown|unclear|not sure|cannot confirm|can't confirm|unable to confirm)";
  return new RegExp(
    `(?:${unknown}.{0,100}${subjectPattern}|${subjectPattern}.{0,60}${unknown})`,
    "i",
  ).test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classifyTicketAudience(ticket: Ticket): "merchant-admin" | "developer" {
  return /\b(api|payload|webhook|endpoint|request id|logs|hmac|signature)\b/i.test(
    ticketText(ticket),
  )
    ? "developer"
    : "merchant-admin";
}

function ticketText(ticket: Ticket): string {
  return [
    ticket.subject,
    ticket.description,
    ticket.category,
    ticket.priority,
    ticket.team,
    ...ticket.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
