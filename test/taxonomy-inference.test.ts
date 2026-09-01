import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  inferTaxonomyDeterministically,
  TaxonomyInferenceCandidateSchema,
} from "../src/taxonomy-inference.js";

import { TicketSchema, type Ticket } from "../src/domain.js";
import { classifyTicketFromContext } from "../src/approval-desk/classifier.js";
import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";

async function loadSeedTicket(ticketId: string): Promise<Ticket> {
  const tickets = TicketSchema.array().parse(
    JSON.parse(
      await readFile(
        resolve("data/seed/tickets.json"),
        "utf8",
      ),
    ),
  );

  const ticket = tickets.find(({ id }) => id === ticketId);

  if (ticket === undefined) {
    throw new Error(`Missing seed ticket ${ticketId}.`);
  }

  return ticket;
}

function infer(ticket: Ticket) {
  const conversationContext = buildConversationContextForTicket({
    ticket,
    customerReplies: [],
    previousSupportResponses: [],
  });

  const deterministicClassification =
    classifyTicketFromContext(conversationContext);

  return inferTaxonomyDeterministically({
    ticket,
    conversationText: conversationContext.classificationText,
    deterministicClassification: {
      category: deterministicClassification.category,
      team: deterministicClassification.team,
      priority: deterministicClassification.priority,
    },
  });
}

describe("TaxonomyInferenceCandidate", () => {
  it("accepts a semantic candidate without support or basis", () => {
    expect(
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: {
          domain: "customer-data",
          area: "consent",
        },
        secondaryProductSurfaces: [
          {
            domain: "messaging",
            area: "sms",
          },
        ],
        problemClasses: ["data-integrity"],
      }),
    ).toEqual({
      primaryProductSurface: {
        domain: "customer-data",
        area: "consent",
      },
      secondaryProductSurfaces: [
        {
          domain: "messaging",
          area: "sms",
        },
      ],
      problemClasses: ["data-integrity"],
    });
  });

  it("allows primary product-surface abstention", () => {
    expect(
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: null,
        secondaryProductSurfaces: [],
        problemClasses: [],
      }),
    ).toEqual({
      primaryProductSurface: null,
      secondaryProductSurfaces: [],
      problemClasses: [],
    });
  });

  it("rejects duplicate secondary surfaces", () => {
    expect(() =>
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: null,
        secondaryProductSurfaces: [
          { domain: "messaging", area: "sms" },
          { domain: "messaging", area: "sms" },
        ],
        problemClasses: [],
      }),
    ).toThrow(/Secondary product surfaces must be unique/i);
  });

  it("rejects the primary surface repeated as a secondary", () => {
    expect(() =>
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: { domain: "messaging", area: "sms" },
        secondaryProductSurfaces: [
          { domain: "messaging", area: "sms" },
        ],
        problemClasses: ["expected-behavior"],
      }),
    ).toThrow(/Primary product surface must not also appear/i);
  });

  it("rejects duplicate problem classes", () => {
    expect(() =>
      TaxonomyInferenceCandidateSchema.parse({
        primaryProductSurface: { domain: "messaging", area: "sms" },
        secondaryProductSurfaces: [],
        problemClasses: ["expected-behavior", "expected-behavior"],
      }),
    ).toThrow(/Problem classes must be unique/i);
  });

  it("distinguishes SMS quiet-hour behavior from consent-state integrity", async () => {
    const quietHours = infer(
      await loadSeedTicket("TKT-1017"),
    );

    const optOut = infer(
      await loadSeedTicket("TKT-1030"),
    );

    expect(quietHours).toMatchObject({
      primaryProductSurface: {
        domain: "messaging",
        area: "sms",
      },
      problemClasses: ["expected-behavior"],
    });

    expect(optOut).toMatchObject({
      primaryProductSurface: {
        domain: "customer-data",
        area: "consent",
      },
      problemClasses: ["data-integrity"],
    });
  });

  it("recognizes an obvious webhook delivery problem", async () => {
    const result = infer(
      await loadSeedTicket("TKT-1028"),
    );

    expect(result).toMatchObject({
      primaryProductSurface: {
        domain: "integrations",
        area: "webhooks",
      },
      problemClasses: ["degraded-performance"],
    });
  });

  it("abstains on an evidence-free ambiguous ticket", async () => {
    const result = infer(
      await loadSeedTicket("TKT-1010"),
    );

    expect(result).toEqual({
      primaryProductSurface: null,
      secondaryProductSurfaces: [],
      problemClasses: [],
    });
  });

});