import { DomainError } from "./errors.js";

export interface EvidenceRequirementDefinition {
  id: string;
  label: string;
  customerQuestion: string;
  aliases: string[];
  status: "active" | "deprecated";
  replacementId?: string;
}

export const EVIDENCE_CATALOG = {
  "affected-recipient-domains": { id: "affected-recipient-domains", label: "Affected recipient domains", customerQuestion: "Affected recipient domains", aliases: ["recipient domains", "affected domains"], status: "active" },
  "audience-size": { id: "audience-size", label: "Expected audience size", customerQuestion: "Expected audience size", aliases: ["audience size", "expected recipients"], status: "active" },
  "billing-account": { id: "billing-account", label: "Billing account", customerQuestion: "billing account or workspace name", aliases: ["billing account", "workspace", "account name"], status: "active" },
  "affected-scope": { id: "affected-scope", label: "Affected scope", customerQuestion: "affected scope, such as profiles, logs, accounts, or actions that may have been exposed", aliases: ["affected scope", "affected profiles", "profiles were accessed"], status: "active" },
  "api-response-status": { id: "api-response-status", label: "API response status", customerQuestion: "API response status or validation error", aliases: ["api response", "response status", "validation error", "400"], status: "active" },
  "audit-source": { id: "audit-source", label: "Audit source", customerQuestion: "audit source, source IP, or actor if available", aliases: ["audit source", "source address", "source ip", "actor"], status: "active" },
  "bounce-samples": { id: "bounce-samples", label: "Bounce samples", customerQuestion: "Bounce samples or bounce codes", aliases: ["bounce sample", "bounce code", "bounce reason"], status: "active" },
  "browser-session-details": { id: "browser-session-details", label: "Browser or session details", customerQuestion: "browser and whether the same issue happens after signing out and back in", aliases: ["browser", "session", "signed out", "signing out", "cache"], status: "active" },
  "legacy-browser-details": { id: "legacy-browser-details", label: "Legacy browser details", customerQuestion: "browser details", aliases: ["legacy browser"], status: "deprecated", replacementId: "browser-session-details" },
  "campaign-name": { id: "campaign-name", label: "Campaign or flow name", customerQuestion: "Campaign or flow name", aliases: ["campaign name", "flow name"], status: "active" },
  "catalog-sync-time": { id: "catalog-sync-time", label: "Last catalog sync time", customerQuestion: "Last catalog sync time", aliases: ["last catalog sync", "catalog sync time"], status: "active" },
  "compliance-banner": { id: "compliance-banner", label: "Compliance banner", customerQuestion: "Compliance banner shown in the dashboard", aliases: ["compliance banner", "dashboard banner"], status: "active" },
  "coupon-pool-name": { id: "coupon-pool-name", label: "Coupon pool name", customerQuestion: "Coupon pool name", aliases: ["coupon pool", "coupon set"], status: "active" },
  "delivery-id": { id: "delivery-id", label: "Delivery ID", customerQuestion: "delivery ID", aliases: ["delivery id", "webhook delivery"], status: "active" },
  "delivery-attempt-time": { id: "delivery-attempt-time", label: "Delivery attempt time", customerQuestion: "webhook delivery attempt time with time zone", aliases: ["delivery attempt", "delivery timestamp", "delivered at"], status: "active" },
  "endpoint-response-code": { id: "endpoint-response-code", label: "Endpoint response code", customerQuestion: "endpoint response code", aliases: ["response code", "http status"], status: "active" },
  "endpoint-url": { id: "endpoint-url", label: "Endpoint URL", customerQuestion: "endpoint URL", aliases: ["endpoint url", "webhook url"], status: "active" },
  "event-created-time": { id: "event-created-time", label: "Event creation time", customerQuestion: "source event creation time with time zone", aliases: ["event creation time", "event created", "source event time"], status: "active" },
  "expected-field": { id: "expected-field", label: "Expected field", customerQuestion: "expected custom field name", aliases: ["expected field", "custom field", "material field"], status: "active" },
  "exposure-location": { id: "exposure-location", label: "Exposure location", customerQuestion: "where the key or credential was shared", aliases: ["shared", "log bundle", "pasted", "exposed"], status: "active" },
  "error-banner": { id: "error-banner", label: "Error banner", customerQuestion: "Any error banner shown in the dashboard", aliases: ["error banner", "error message"], status: "active" },
  "event-id": { id: "event-id", label: "Event ID or event time", customerQuestion: "event ID or event time", aliases: ["event id", "event time", "event timestamp"], status: "active" },
  "failure-timestamp": { id: "failure-timestamp", label: "Failure timestamp", customerQuestion: "failure timestamp with time zone", aliases: ["failure timestamp", "failure time"], status: "active" },
  "feature-description": { id: "feature-description", label: "Feature description", customerQuestion: "short description of the feature or workflow you want", aliases: ["feature request", "would like", "please add", "feature"], status: "active" },
  "flow-id": { id: "flow-id", label: "Flow name or flow ID", customerQuestion: "flow name or flow ID", aliases: ["flow id", "flow name"], status: "active" },
  "invoice-number": { id: "invoice-number", label: "Invoice number", customerQuestion: "invoice number, if available", aliases: ["invoice number", "invoice id", "invoice"], status: "active" },
  "key-identifier": { id: "key-identifier", label: "Key identifier", customerQuestion: "key identifier or last four characters, not the secret value", aliases: ["api key", "private key", "key id", "key identifier"], status: "active" },
  "key-usage-status": { id: "key-usage-status", label: "Key usage status", customerQuestion: "whether the key was used after exposure", aliases: ["was used", "used", "actions taken"], status: "active" },
  "masked-recipient": { id: "masked-recipient", label: "Masked recipient", customerQuestion: "masked recipient phone number or profile identifier", aliases: ["masked recipient", "recipient", "subscriber"], status: "active" },
  "object-id": { id: "object-id", label: "Affected object ID", customerQuestion: "Affected object ID, SKU, order number, or profile ID", aliases: ["object id", "sku", "order number", "profile id"], status: "active" },
  "problem-summary": { id: "problem-summary", label: "Problem summary", customerQuestion: "what you were trying to do, what happened, and where it happened", aliases: ["not working", "does not work", "problem", "expected to happen"], status: "active" },
  "reproduction-steps": { id: "reproduction-steps", label: "Steps taken", customerQuestion: "steps you took, if you remember them", aliases: ["steps", "clicked", "opened", "selected", "tried"], status: "active" },
  "screenshot-or-error": { id: "screenshot-or-error", label: "Screenshot or error", customerQuestion: "screenshot or exact message, if you can share one", aliases: ["screenshot", "screen recording", "error message", "error"], status: "active" },
  "opt-out-timestamp": { id: "opt-out-timestamp", label: "Opt-out timestamp", customerQuestion: "STOP reply or opt-out timestamp with time zone", aliases: ["stop timestamp", "opt-out timestamp"], status: "active" },
  "platform": { id: "platform", label: "Ecommerce platform", customerQuestion: "ecommerce platform, such as Shopify, Magento, WooCommerce, or custom", aliases: ["ecommerce platform", "shopify", "magento", "woocommerce"], status: "active" },
  "plan-or-promotion": { id: "plan-or-promotion", label: "Plan or promotion", customerQuestion: "affected plan, promotion, coupon, or subscription", aliases: ["plan", "promotion", "coupon", "subscription", "charge"], status: "active" },
  "profile-email": { id: "profile-email", label: "Affected profile email or customer ID", customerQuestion: "One affected profile email or customer ID", aliases: ["profile email", "customer id", "affected customer"], status: "active" },
  "consent-timeline": { id: "consent-timeline", label: "Consent timeline", customerQuestion: "profile consent timeline or opt-out history", aliases: ["consent timeline", "consent state", "opt-out history"], status: "active" },
  "product-reference": { id: "product-reference", label: "Product or cart reference", customerQuestion: "product URL or product ID, or product or cart URL if this is a cart flow", aliases: ["product url", "product id", "cart url"], status: "active" },
  "raw-body-change-status": { id: "raw-body-change-status", label: "Raw body handling changes", customerQuestion: "whether raw body handling changed recently", aliases: ["raw body", "raw request-body handling", "body parser"], status: "active" },
  "recipient-region": { id: "recipient-region", label: "Recipient region", customerQuestion: "Recipient region", aliases: ["recipient region", "country", "region"], status: "active" },
  "request-id": { id: "request-id", label: "Request ID", customerQuestion: "request ID if available", aliases: ["request id", "api request"], status: "active" },
  "retry-history": { id: "retry-history", label: "Retry history", customerQuestion: "webhook retry history", aliases: ["retry history", "retries", "eventually succeed"], status: "active" },
  "rotation-status": { id: "rotation-status", label: "Rotation status", customerQuestion: "whether the exposed key has been rotated or revoked", aliases: ["rotated", "rotation", "revoked"], status: "active" },
  "sample-payload": { id: "sample-payload", label: "Sample payload", customerQuestion: "Sample payload with secrets removed", aliases: ["sample payload", "payload"], status: "active" },
  "scheduled-send-time": { id: "scheduled-send-time", label: "Scheduled send time", customerQuestion: "Scheduled send time with time zone", aliases: ["scheduled send time", "send time"], status: "active" },
  "segment-name": { id: "segment-name", label: "Segment name", customerQuestion: "Segment name", aliases: ["segment name", "audience name"], status: "active" },
  "sending-domain": { id: "sending-domain", label: "Sending domain", customerQuestion: "Sending domain", aliases: ["sending domain", "domain"], status: "active" },
  "signing-secret-rotation-time": { id: "signing-secret-rotation-time", label: "Signing secret rotation time", customerQuestion: "signing secret rotation time, without sharing the secret value", aliases: ["secret rotation", "signing secret rotation"], status: "active" },
  "store-url": { id: "store-url", label: "Store URL", customerQuestion: "Affected store URL", aliases: ["store url", "site url", "store domain"], status: "active" },
  "source-update-time": { id: "source-update-time", label: "Source update time", customerQuestion: "source-system update time with time zone", aliases: ["source update", "last update", "updated in shopify"], status: "active" },
  "timestamp-tolerance": { id: "timestamp-tolerance", label: "Timestamp tolerance", customerQuestion: "timestamp tolerance configured for verification", aliases: ["timestamp tolerance", "clock skew"], status: "active" },
  "timeline-visibility": { id: "timeline-visibility", label: "Timeline visibility", customerQuestion: "whether the API accepted events are still missing from profile timelines", aliases: ["activity timeline", "profile timeline", "missing from timelines"], status: "active" },
  "unused-coupon-status": { id: "unused-coupon-status", label: "Unused coupon code availability", customerQuestion: "Whether unused coupon codes remain available", aliases: ["unused coupon", "available codes"], status: "active" },
  "use-case": { id: "use-case", label: "Use case", customerQuestion: "the use case and who would use it", aliases: ["use case", "workflow", "would use", "users"], status: "active" },
} satisfies Readonly<Record<string, EvidenceRequirementDefinition>>;

export type EvidenceRequirementId = keyof typeof EVIDENCE_CATALOG;

export function isEvidenceRequirementId(value: string): value is EvidenceRequirementId {
  return Object.hasOwn(EVIDENCE_CATALOG, value);
}

export function findEvidenceRequirement(
  id: string,
): EvidenceRequirementDefinition | undefined {
  return isEvidenceRequirementId(id) ? EVIDENCE_CATALOG[id] : undefined;
}

export function requireEvidenceRequirement(id: string): EvidenceRequirementDefinition {
  const requirement = findEvidenceRequirement(id);
  if (requirement === undefined) {
    throw new DomainError(`Evidence requirement ${id} is not registered.`, "INVALID_APPROVAL_FIELDS");
  }
  return requirement;
}
