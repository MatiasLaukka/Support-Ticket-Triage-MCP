import type { ExpectedOutcome, Ticket } from "../domain.js";

export interface KnownCauseDefinition {
  id: string;
  label: string;
  knowledgeArticleIds: readonly string[];
  requiredEvidenceIds: readonly string[];
  matchAll: readonly string[];
  problemSummary: string;
  nextStep: string;
  investigationSteps: readonly string[];
}

export const KNOWN_CAUSES: readonly KnownCauseDefinition[] = [
  {
    id: "sms-quiet-hours",
    label: "SMS quiet-hour protection",
    knowledgeArticleIds: ["sms-compliance"],
    requiredEvidenceIds: [],
    matchAll: ["quiet-hour", "blocked"],
    problemSummary:
      "We reviewed the SMS campaign issue, and the dashboard message indicates quiet-hour protection blocked delivery.",
    nextStep:
      "This looks like expected compliance behavior for an SMS campaign scheduled during restricted sending hours. Please reschedule the campaign for an eligible sending window or review the account quiet-hour settings before attempting another send.",
    investigationSteps: [
      "Explain quiet-hour protection and ask the customer to reschedule for an eligible sending window.",
    ],
  },
  {
    id: "webhook-secret-rotation",
    label: "Webhook secret rotation mismatch",
    knowledgeArticleIds: ["webhook-signature-validation"],
    requiredEvidenceIds: [
      "endpoint-url",
      "delivery-id",
      "signing-secret-rotation-time",
      "raw-body-change-status",
    ],
    matchAll: ["webhook", "signature", "secret rotation"],
    problemSummary:
      "The webhook signature failures match a common post-rotation issue where the sender and receiving endpoint are not validating with the same active signing secret.",
    nextStep:
      "Please confirm the receiving endpoint is using the current signing secret, then retry one delivery after verifying raw request-body handling has not changed.",
    investigationSteps: [
      "Confirm the endpoint validates with the current signing secret.",
      "Compare one failed delivery against the signing-secret rotation time and raw body handling.",
    ],
  },
  {
    id: "track-api-local-time-timestamp",
    label: "Track API local-time timestamp",
    knowledgeArticleIds: ["event-tracking-debugging"],
    requiredEvidenceIds: [
      "event-id",
      "api-response-status",
      "sample-payload",
    ],
    matchAll: ["track api", "timestamp", "local time"],
    problemSummary:
      "The Track API timestamp error matches a common timestamp-format issue where a local time is sent instead of an accepted event timestamp format.",
    nextStep:
      "Please send the event timestamp in the accepted API format with the intended time zone, then retry with a redacted sample payload so we can compare the validation response.",
    investigationSteps: [
      "Compare the event timestamp, time zone, API response, and redacted payload.",
      "Confirm whether the timestamp is sent in an accepted API format rather than ambiguous local time.",
    ],
  },
  {
    id: "shopify-custom-field-mapping",
    label: "Shopify custom field mapping",
    knowledgeArticleIds: ["shopify-integration-sync"],
    requiredEvidenceIds: [
      "store-url",
      "object-id",
      "expected-field",
      "source-update-time",
      "catalog-sync-time",
    ],
    matchAll: ["shopify", "custom", "field"],
    problemSummary:
      "The Shopify sync completed, but the reported custom field is not appearing in the destination record.",
    nextStep:
      "We will compare the Shopify source field, affected object, sync timing, and field mapping before recommending a reconnection or mapping change.",
    investigationSteps: [
      "Confirm the affected Shopify object and expected custom field.",
      "Compare the source update time with the last integration sync and field mapping.",
    ],
  },
  {
    id: "sms-stop-sync-delay",
    label: "SMS STOP sync delay",
    knowledgeArticleIds: ["sms-compliance", "profile-sync-issues"],
    requiredEvidenceIds: [
      "masked-recipient",
      "opt-out-timestamp",
      "profile-email",
      "consent-timeline",
    ],
    matchAll: ["sms", "stop", "opt-out"],
    problemSummary:
      "The SMS opt-out report matches a consent-state sync issue where a STOP reply has not yet appeared on the profile.",
    nextStep:
      "We will compare the masked recipient, STOP timestamp, profile identity, and consent timeline before recommending any send or profile action.",
    investigationSteps: [
      "Confirm the STOP reply timestamp and masked recipient.",
      "Compare the SMS opt-out event with the profile consent timeline.",
    ],
  },
  {
    id: "webhook-delivery-latency",
    label: "Webhook delivery latency",
    knowledgeArticleIds: ["webhook-signature-validation"],
    requiredEvidenceIds: [
      "delivery-id",
      "event-created-time",
      "delivery-attempt-time",
      "endpoint-response-code",
      "retry-history",
    ],
    matchAll: ["webhook", "delayed"],
    problemSummary:
      "The webhook deliveries are succeeding but arriving noticeably after the source event time.",
    nextStep:
      "We will compare event creation time, delivery attempt time, endpoint response status, and retry history before confirming whether this is platform dispatch delay or endpoint retry behavior.",
    investigationSteps: [
      "Compare the source event creation time with the webhook delivery attempt time.",
      "Review endpoint response status and retry history before assigning cause.",
    ],
  },
];

export function detectKnownCause(input: {
  ticket: Ticket;
  outcome: ExpectedOutcome;
}): KnownCauseDefinition | undefined {
  const text = ticketText(input.ticket);
  return KNOWN_CAUSES.find((cause) =>
    cause.knowledgeArticleIds.every((articleId) =>
      input.outcome.knowledgeArticleIds.includes(articleId),
    ) &&
    cause.matchAll.every((term) => text.includes(term)),
  );
}

export function getKnownCause(id: string | null | undefined): KnownCauseDefinition | undefined {
  if (id === undefined || id === null) {
    return undefined;
  }
  return KNOWN_CAUSES.find((cause) => cause.id === id);
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
    .join(" ")
    .toLowerCase();
}
