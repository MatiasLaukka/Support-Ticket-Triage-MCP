import type { Ticket } from "../domain.js";

export interface AccountFacts {
  customerName: string;
  plan: string;
  region: string;
  requesterRole?: string;
  requesterTechnicalLevel?: string;
  ecommercePlatform?: string;
  storeUrls: string[];
}

export function extractAccountFacts(ticket: Ticket): AccountFacts {
  const text = ticketText(ticket);
  return {
    customerName: ticket.customer.name,
    plan: ticket.customer.plan,
    region: ticket.customer.region,
    requesterRole: ticket.requester?.role,
    requesterTechnicalLevel: ticket.requester?.technicalLevel,
    ecommercePlatform: detectPlatform(text),
    storeUrls: extractUrls(text),
  };
}

function detectPlatform(text: string): string | undefined {
  if (/\bshopify\b/i.test(text)) {
    return "Shopify";
  }
  if (/\bmagento\b/i.test(text)) {
    return "Magento";
  }
  if (/\bwoo\s*commerce|woocommerce\b/i.test(text)) {
    return "WooCommerce";
  }
  if (/\bcustom store|custom ecommerce|custom setup\b/i.test(text)) {
    return "Custom";
  }
  return undefined;
}

function extractUrls(text: string): string[] {
  return unique(
    Array.from(text.matchAll(/\bhttps?:\/\/[^\s)]+|\b[a-z0-9-]+\.(?:com|net|org|io|co|fi|store)\b/gi))
      .map((match) => match[0].replace(/[.,;:]+$/, "")),
  );
}

function ticketText(ticket: Ticket): string {
  return [
    ticket.subject,
    ticket.description,
    ticket.customer.name,
    ticket.customer.plan,
    ticket.customer.region,
    ticket.requester?.role,
    ticket.requester?.department,
    ticket.requester?.technicalLevel,
    ...ticket.tags,
  ]
    .filter(Boolean)
    .join(" ");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
