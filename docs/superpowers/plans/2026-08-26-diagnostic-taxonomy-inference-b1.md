# Diagnostic Taxonomy Inference B1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add advisory deterministic and GPT diagnostic-taxonomy inference, then compare both lanes against reviewed taxonomy oracles without changing operational ticket behavior.

**Architecture:** B1 introduces one canonical semantic candidate contract shared by deterministic and GPT inference. Deterministic inference is a small auditable weighted baseline; GPT inference is a strict structured-output provider receiving the same ticket/conversation/classification context but no knowledge grounding. A dedicated taxonomy evaluation layer scores only reviewed taxonomy oracles and produces per-lane plus per-ticket metrics. No B1 output is persisted or allowed to affect lifecycle, routing, known causes, diagnosis, or fixes.

**Tech Stack:** TypeScript 6, Node.js ESM, Zod 4, Vitest 4, OpenAI Responses API via existing `FetchLike` test seam.

**Spec:** `docs/superpowers/specs/2026-08-26-diagnostic-taxonomy-inference-b1-design.md`

## Global Constraints

- Base this work on `feature/diagnostic-taxonomy-oracle-b0`.
- B1 is advisory/evaluation-only.
- Do not write diagnostic taxonomy revisions to SQLite.
- Do not change Approval Desk lifecycle behavior or action availability.
- Do not change category, team, priority, or escalation routing.
- Do not confirm/reject known causes or create diagnosis authority from taxonomy.
- Do not use selected knowledge article content, diagnostic playbooks, or semantic retrieval as B1 inference input.
- Deterministic and GPT lanes receive the same ticket, conversation text, and available deterministic classification facts.
- GPT may predict semantic taxonomy only; it cannot author `support`, `basis`, numeric confidence, lifecycle state, or diagnosis state.
- `primaryProductSurface: null` is a valid abstention.
- Secondary product surfaces are observable in B1 but are not hard-scored.
- Only oracles with reviewed `taxonomy` ground truth enter B1 taxonomy metrics.
- Existing B0 `taxonomyAccuracy` and legacy `passedScenarioCount` compatibility must remain intact.
- Normal tests must be fully offline and must not require `OPENAI_API_KEY`.
- Use TDD for every retained production behavior.
- Do not normalize repository line endings as part of B1.

---

## File Structure

### New files

- `src/taxonomy-inference.ts`
  - Canonical `TaxonomyInferenceCandidateSchema`.
  - Shared `TaxonomyInferenceInput`.
  - Deterministic weighted taxonomy inference.
  - No network calls and no oracle access.

- `src/taxonomy-reasoning-provider.ts`
  - GPT taxonomy provider interface and OpenAI implementation.
  - Strict structured output.
  - Sanitized schema/provider failures.
  - No knowledge grounding.

- `src/taxonomy-evaluation.ts`
  - Per-ticket taxonomy scoring.
  - Per-lane aggregate metrics.
  - Deterministic-vs-GPT comparison runner over already-built scenarios.
  - No operational writes.

- `scripts/evaluate-taxonomy-inference.ts`
  - Offline-by-default CLI.
  - Loads seed tickets/oracles.
  - Builds conversation/classification context.
  - Optionally enables GPT with `--live`.
  - Prints JSON report.

- `test/taxonomy-inference.test.ts`
- `test/taxonomy-reasoning-provider.test.ts`
- `test/taxonomy-evaluation.test.ts`

### Modified files

- `src/evaluation-oracle.ts`
  - Extract reusable dimension-level taxonomy scoring while preserving B0 behavior.

- `test/evaluation-oracle.test.ts`
  - Prove B0 `taxonomyPass` behavior remains compatible after scorer extraction.

- `package.json`
  - Add `evaluate:taxonomy`.

No B1 task modifies `src/approval-desk/ai-evaluation.ts`. Operational orchestration is intentionally deferred.

---

### Task 1: Canonical Inference Candidate and Dimension-Level Oracle Scoring

**Files:**
- Create: `src/taxonomy-inference.ts`
- Create: `test/taxonomy-inference.test.ts`
- Modify: `src/evaluation-oracle.ts` in the taxonomy-scoring portion of `scoreEvaluationOracle`
- Modify: `test/evaluation-oracle.test.ts` around the existing taxonomy score tests

**Interfaces:**
- Produces:
  ```ts
  export const TaxonomyInferenceCandidateSchema: z.ZodType<...>;
  export type TaxonomyInferenceCandidate = z.infer<
    typeof TaxonomyInferenceCandidateSchema
  >;

  export interface TaxonomyOracleScore {
    primarySurfacePass: boolean;
    problemClassPass: boolean;
    taxonomyPass: boolean;
    abstained: boolean;
  }

  export function scoreTaxonomyOracle(
    expectation: NonNullable<EvaluationOracle["taxonomy"]>,
    actual:
      | Pick<
          TaxonomyInferenceCandidate,
          "primaryProductSurface" | "problemClasses"
        >
      | undefined,
  ): TaxonomyOracleScore;
  ```
- Existing `scoreEvaluationOracle()` consumes `scoreTaxonomyOracle()` and keeps its public B0 result shape unchanged.

- [ ] **Step 1: Write RED tests for the candidate contract**

Create `test/taxonomy-inference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TaxonomyInferenceCandidateSchema } from "../src/taxonomy-inference.js";

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
});
```

- [ ] **Step 2: Run the candidate tests and verify RED**

Run:

```powershell
npx vitest run test/taxonomy-inference.test.ts
```

Expected: FAIL because `../src/taxonomy-inference.js` does not exist.

- [ ] **Step 3: Implement the minimal candidate schema**

Create `src/taxonomy-inference.ts`:

```ts
import { z } from "zod";
import {
  ProblemClassSchema,
  ProductSurfaceSchema,
} from "./diagnostic-taxonomy.js";

export const TaxonomyInferenceCandidateSchema = z
  .object({
    primaryProductSurface: ProductSurfaceSchema.nullable(),
    secondaryProductSurfaces: z.array(ProductSurfaceSchema),
    problemClasses: z.array(ProblemClassSchema),
  })
  .strict()
  .superRefine((candidate, context) => {
    const secondaryKeys = new Set<string>();

    for (const surface of candidate.secondaryProductSurfaces) {
      const key = `${surface.domain}/${surface.area}`;
      if (secondaryKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["secondaryProductSurfaces"],
          message: "Secondary product surfaces must be unique.",
        });
      }
      secondaryKeys.add(key);
    }

    if (candidate.primaryProductSurface !== null) {
      const primaryKey =
        `${candidate.primaryProductSurface.domain}/${candidate.primaryProductSurface.area}`;
      if (secondaryKeys.has(primaryKey)) {
        context.addIssue({
          code: "custom",
          path: ["secondaryProductSurfaces"],
          message:
            "Primary product surface must not also appear as a secondary surface.",
        });
      }
    }

    if (
      new Set(candidate.problemClasses).size !==
      candidate.problemClasses.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["problemClasses"],
        message: "Problem classes must be unique.",
      });
    }
  });

export type TaxonomyInferenceCandidate = z.infer<
  typeof TaxonomyInferenceCandidateSchema
>;
```

Do not add `support`, `basis`, confidence, rationale, or provider metadata to this schema.

- [ ] **Step 4: Run candidate tests and verify GREEN**

```powershell
npx vitest run test/taxonomy-inference.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Write RED tests for dimension-level oracle scoring**

In `test/evaluation-oracle.test.ts`, import `scoreTaxonomyOracle` and add:

```ts
it("scores taxonomy surface and problem class independently", () => {
  const expectation = {
    acceptablePrimaryProductSurfaces: [
      { domain: "customer-data", area: "consent" },
    ],
    acceptableProblemClasses: ["data-integrity"],
  } as const;

  expect(
    scoreTaxonomyOracle(expectation, {
      primaryProductSurface: {
        domain: "customer-data",
        area: "consent",
      },
      problemClasses: ["defect"],
    }),
  ).toEqual({
    primarySurfacePass: true,
    problemClassPass: false,
    taxonomyPass: false,
    abstained: false,
  });
});

it("treats a null primary surface as an abstention and taxonomy failure", () => {
  const expectation = {
    acceptablePrimaryProductSurfaces: [
      { domain: "messaging", area: "sms" },
    ],
    acceptableProblemClasses: ["expected-behavior"],
  } as const;

  expect(
    scoreTaxonomyOracle(expectation, {
      primaryProductSurface: null,
      problemClasses: [],
    }),
  ).toEqual({
    primarySurfacePass: false,
    problemClassPass: false,
    taxonomyPass: false,
    abstained: true,
  });
});
```

- [ ] **Step 6: Run the scorer tests and verify RED**

```powershell
npx vitest run test/evaluation-oracle.test.ts -t "scores taxonomy surface|treats a null primary"
```

Expected: FAIL because `scoreTaxonomyOracle` is not exported.

- [ ] **Step 7: Implement `scoreTaxonomyOracle` and delegate existing B0 scoring to it**

In `src/evaluation-oracle.ts`, import the inference-candidate type:

```ts
import type { TaxonomyInferenceCandidate } from "./taxonomy-inference.js";
```

Add:

```ts
export interface TaxonomyOracleScore {
  primarySurfacePass: boolean;
  problemClassPass: boolean;
  taxonomyPass: boolean;
  abstained: boolean;
}

export function scoreTaxonomyOracle(
  expectation: NonNullable<EvaluationOracle["taxonomy"]>,
  actual:
    | Pick<
        TaxonomyInferenceCandidate,
        "primaryProductSurface" | "problemClasses"
      >
    | undefined,
): TaxonomyOracleScore {
  const primaryProductSurface = actual?.primaryProductSurface ?? null;

  const primarySurfacePass =
    primaryProductSurface !== null &&
    expectation.acceptablePrimaryProductSurfaces.some(
      ({ domain, area }) =>
        domain === primaryProductSurface.domain &&
        area === primaryProductSurface.area,
    );

  const problemClassPass =
    actual !== undefined &&
    actual.problemClasses.length > 0 &&
    actual.problemClasses.every((problemClass) =>
      expectation.acceptableProblemClasses.includes(problemClass),
    );

  return {
    primarySurfacePass,
    problemClassPass,
    taxonomyPass: primarySurfacePass && problemClassPass,
    abstained: primaryProductSurface === null,
  };
}
```

Replace the inline B0 taxonomy boolean in `scoreEvaluationOracle()` with:

```ts
const taxonomyPass =
  oracle.taxonomy === undefined
    ? true
    : scoreTaxonomyOracle(oracle.taxonomy, actual.taxonomy).taxonomyPass;
```

Do not change `EvaluationOracleScore.all` or B0 legacy recommendation aggregate behavior beyond delegating the same taxonomy semantics.

- [ ] **Step 8: Run focused and compatibility tests**

```powershell
npx vitest run test/taxonomy-inference.test.ts test/evaluation-oracle.test.ts test/evaluation.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit Task 1**

```powershell
git add src/taxonomy-inference.ts `
        src/evaluation-oracle.ts `
        test/taxonomy-inference.test.ts `
        test/evaluation-oracle.test.ts

git commit -m "Add taxonomy inference candidate scoring"
```

---

### Task 2: Deterministic Taxonomy Inference Baseline

**Files:**
- Modify: `src/taxonomy-inference.ts`
- Modify: `test/taxonomy-inference.test.ts`

**Interfaces:**
- Consumes:
  - canonical `Ticket`;
  - lower-cased `ConversationContext.classificationText`;
  - deterministic category/team/priority facts.
- Produces:
  ```ts
  export interface TaxonomyInferenceInput {
    ticket: Ticket;
    conversationText: string;
    deterministicClassification: Pick<
      TicketClassification,
      "category" | "team" | "priority"
    >;
  }

  export function inferTaxonomyDeterministically(
    input: TaxonomyInferenceInput,
  ): TaxonomyInferenceCandidate;
  ```

- [ ] **Step 1: Write RED tests for the two reviewed contrast cases**

Extend `test/taxonomy-inference.test.ts`:

```ts
import {
  inferTaxonomyDeterministically,
  TaxonomyInferenceCandidateSchema,
} from "../src/taxonomy-inference.js";
import { buildConversationContextForTicket } from "../src/approval-desk/conversation-context.js";
import { classifyTicketFromContext } from "../src/approval-desk/classifier.js";
import { TicketSchema } from "../src/domain.js";

function infer(ticketInput: unknown) {
  const ticket = TicketSchema.parse(ticketInput);
  const conversation = buildConversationContextForTicket({
    ticket,
    customerReplies: [],
    previousSupportResponses: [],
  });
  const deterministicClassification =
    classifyTicketFromContext(conversation);

  return inferTaxonomyDeterministically({
    ticket,
    conversationText: conversation.classificationText,
    deterministicClassification,
  });
}
```

Use compact valid tickets in the tests and assert:

```ts
it("distinguishes SMS quiet-hour behavior from consent-state integrity", () => {
  const quietHours = infer({
    id: "TKT-1017",
    createdAt: "2026-06-10T06:55:00.000Z",
    updatedAt: "2026-06-10T07:50:00.000Z",
    customer: {
      name: "Copper Cloud",
      plan: "business",
      region: "us-west",
      vip: false,
    },
    requester: {
      name: "Mia Johnson",
      role: "SMS Marketing Coordinator",
      department: "Marketing",
      technicalLevel: "non-technical",
      seniority: "individual-contributor",
    },
    subject: "SMS campaign blocked during quiet hours",
    description:
      "A scheduled SMS campaign did not send and the dashboard says quiet-hour protection blocked delivery.",
    status: "triage",
    category: "api",
    priority: "P2",
    team: "api-platform",
    tags: ["sms", "quiet-hours", "compliance"],
    sla: {
      responseDueAt: "2026-06-10T12:30:00.000Z",
      breached: false,
    },
    relatedTicketIds: [],
    revision: 1,
  });

  const optOut = infer({
    id: "TKT-1030",
    createdAt: "2026-06-10T06:15:00.000Z",
    updatedAt: "2026-06-10T07:25:00.000Z",
    customer: {
      name: "Willow Nonprofit",
      plan: "starter",
      region: "ap-southeast",
      vip: false,
    },
    requester: {
      name: "Yara Haddad",
      role: "Customer Success Manager",
      department: "Operations",
      technicalLevel: "technical",
      seniority: "manager",
    },
    subject: "SMS opt-out not reflected on profile",
    description:
      "A subscriber replied STOP, but the profile still appears eligible for the next SMS campaign.",
    status: "waiting-customer",
    category: "account-access",
    priority: "P3",
    team: "identity",
    tags: ["sms", "opt-out", "consent"],
    sla: {
      responseDueAt: "2026-06-10T13:40:00.000Z",
      breached: false,
    },
    relatedTicketIds: [],
    revision: 1,
  });

  expect(quietHours).toMatchObject({
    primaryProductSurface: { domain: "messaging", area: "sms" },
    problemClasses: ["expected-behavior"],
  });
  expect(optOut).toMatchObject({
    primaryProductSurface: { domain: "customer-data", area: "consent" },
    problemClasses: ["data-integrity"],
  });
});
```

- [ ] **Step 2: Add RED tests for an obvious webhook case and an ambiguous abstention**

```ts
it("recognizes an obvious webhook delivery problem", () => {
  const result = infer({
    id: "TKT-1028",
    createdAt: "2026-06-10T06:35:00.000Z",
    updatedAt: "2026-06-10T07:45:00.000Z",
    customer: {
      name: "Mosaic Logistics",
      plan: "enterprise",
      region: "us-west",
      vip: false,
    },
    requester: {
      name: "Lea Fischer",
      role: "Platform Engineer",
      department: "Engineering",
      technicalLevel: "developer",
      seniority: "individual-contributor",
    },
    subject: "Webhook deliveries delayed by ten minutes",
    description:
      "Order webhooks succeed but arrive between eight and twelve minutes after the event.",
    status: "in-progress",
    category: "integration",
    priority: "P2",
    team: "integrations",
    tags: ["webhook", "delivery", "latency"],
    sla: {
      responseDueAt: "2026-06-10T11:50:00.000Z",
      breached: false,
    },
    relatedTicketIds: [],
    revision: 2,
  });

  expect(result).toMatchObject({
    primaryProductSurface: {
      domain: "integrations",
      area: "webhooks",
    },
    problemClasses: ["degraded-performance"],
  });
});

it("abstains on an evidence-free ambiguous ticket", () => {
  const result = infer({
    id: "TKT-1010",
    createdAt: "2026-06-10T08:25:00.000Z",
    updatedAt: "2026-06-10T08:30:00.000Z",
    customer: {
      name: "Maple Studio",
      plan: "starter",
      region: "us-west",
      vip: false,
    },
    requester: {
      name: "Jamie Lee",
      role: "Store Operations Associate",
      department: "Operations",
      technicalLevel: "technical",
      seniority: "manager",
    },
    subject: "Problem",
    description: "It does not work.",
    status: "new",
    category: "other",
    priority: "P3",
    team: "support",
    tags: ["ambiguous", "missing-information"],
    sla: {
      responseDueAt: "2026-06-10T13:00:00.000Z",
      breached: false,
    },
    relatedTicketIds: [],
    revision: 0,
  });

  expect(result).toEqual({
    primaryProductSurface: null,
    secondaryProductSurfaces: [],
    problemClasses: [],
  });
});
```

- [ ] **Step 3: Run deterministic tests and verify RED**

```powershell
npx vitest run test/taxonomy-inference.test.ts -t "distinguishes|webhook|abstains"
```

Expected: FAIL because `inferTaxonomyDeterministically` does not exist.

- [ ] **Step 4: Implement the input contract and weighted signal engine**

In `src/taxonomy-inference.ts`, add imports:

```ts
import type { Ticket } from "./domain.js";
import type { TicketClassification } from "./approval-desk/classifier.js";
import type {
  ProblemClass,
  ProductSurface,
} from "./diagnostic-taxonomy.js";
```

Add:

```ts
export interface TaxonomyInferenceInput {
  ticket: Ticket;
  conversationText: string;
  deterministicClassification: Pick<
    TicketClassification,
    "category" | "team" | "priority"
  >;
}

type SurfaceSignal = {
  surface: ProductSurface;
  weight: number;
  patterns: readonly RegExp[];
};

type ProblemSignal = {
  problemClass: ProblemClass;
  weight: number;
  patterns: readonly RegExp[];
};

const MIN_SURFACE_SCORE = 4;
const MIN_PROBLEM_SCORE = 4;
const MIN_SECONDARY_SURFACE_SCORE = 4;

const surfaceSignals: readonly SurfaceSignal[] = [
  {
    surface: { domain: "customer-data", area: "consent" },
    weight: 6,
    patterns: [
      /\bstop\b/,
      /\bopt[- ]?out\b/,
      /\bconsent\b/,
      /\beligib(?:le|ility)\b/,
    ],
  },
  {
    surface: { domain: "messaging", area: "sms" },
    weight: 5,
    patterns: [
      /\bquiet[- ]?hours?\b/,
      /\bsms\b/,
      /\btext message\b/,
    ],
  },
  {
    surface: { domain: "integrations", area: "webhooks" },
    weight: 6,
    patterns: [
      /\bwebhooks?\b/,
      /\bhmac\b/,
      /\bsigning secret\b/,
    ],
  },
  {
    surface: { domain: "automation", area: "flows" },
    weight: 6,
    patterns: [
      /\bflows?\b/,
      /\bbrowse abandonment\b/,
      /\babandoned cart\b/,
      /\benroll(?:ment|ing)?\b/,
    ],
  },
  {
    surface: { domain: "customer-data", area: "segments" },
    weight: 6,
    patterns: [/\bsegments?\b/, /\baudience count\b/],
  },
  {
    surface: { domain: "integrations", area: "shopify" },
    weight: 6,
    patterns: [/\bshopify\b/],
  },
  {
    surface: { domain: "catalog", area: "products" },
    weight: 4,
    patterns: [/\bproduct catalog\b/, /\bproducts?\b/],
  },
  {
    surface: { domain: "developer-platform", area: "event-ingestion" },
    weight: 6,
    patterns: [
      /\bevent ingestion\b/,
      /\bactivity timeline\b/,
      /\btracking calls?\b/,
    ],
  },
  {
    surface: { domain: "security", area: "credentials-secrets" },
    weight: 6,
    patterns: [
      /\bprivate (?:api )?key\b/,
      /\bcredential\b/,
      /\bsecret\b/,
    ],
  },
];

const problemSignals: readonly ProblemSignal[] = [
  {
    problemClass: "expected-behavior",
    weight: 6,
    patterns: [
      /\bquiet[- ]?hours?\b/,
      /\bprotection blocked\b/,
      /\bblocked by (?:policy|rule|protection)\b/,
    ],
  },
  {
    problemClass: "data-integrity",
    weight: 6,
    patterns: [
      /\bnot reflected\b/,
      /\bstill appears\b/,
      /\bduplicate profiles?\b/,
      /\bcount differs\b/,
      /\bmissing (?:field|value|events?)\b/,
    ],
  },
  {
    problemClass: "degraded-performance",
    weight: 6,
    patterns: [
      /\bdelay(?:ed|s)?\b/,
      /\blatency\b/,
      /\bslow\b/,
      /\bstuck\b/,
      /\btakes? more than\b/,
    ],
  },
  {
    problemClass: "access",
    weight: 6,
    patterns: [
      /\bcannot log in\b/,
      /\bcan't log in\b/,
      /\bpermission denied\b/,
      /\baccess denied\b/,
    ],
  },
  {
    problemClass: "security",
    weight: 6,
    patterns: [
      /\bexposed\b/,
      /\bunauthorized\b/,
      /\bunrecognized (?:private )?key\b/,
      /\bcredential\b/,
    ],
  },
  {
    problemClass: "feature-request",
    weight: 6,
    patterns: [
      /\bfeature request\b/,
      /\bplease add\b/,
      /\brequest .*builder\b/,
      /\bneed reusable\b/,
    ],
  },
  {
    problemClass: "configuration",
    weight: 5,
    patterns: [
      /\bfilters? exclude\b/,
      /\bafter rotating\b/,
      /\bconfiguration\b/,
      /\bconfigured\b/,
    ],
  },
  {
    problemClass: "outage",
    weight: 6,
    patterns: [/\boutage\b/, /\bincident\b.*\bbroad\b/],
  },
  {
    problemClass: "defect",
    weight: 4,
    patterns: [/\bbug\b/, /\bdefect\b/, /\bunexpected failure\b/],
  },
];
```

Add low-weight deterministic-classification evidence only for broad problem class support:

```ts
function classificationProblemSignals(
  classification: TaxonomyInferenceInput["deterministicClassification"],
): Array<{ problemClass: ProblemClass; score: number }> {
  switch (classification.category) {
    case "feature-request":
      return [{ problemClass: "feature-request", score: 3 }];
    case "security":
      return [{ problemClass: "security", score: 3 }];
    case "incident":
      return [{ problemClass: "outage", score: 2 }];
    case "performance":
      return [{ problemClass: "degraded-performance", score: 2 }];
    default:
      return [];
  }
}
```

Do not map legacy category/team directly to product surfaces.

- [ ] **Step 5: Implement deterministic selection and abstention**

Use a stable semantic key:

```ts
function surfaceKey(surface: ProductSurface): string {
  return `${surface.domain}/${surface.area}`;
}
```

Score each rule once per matching pattern, cap each rule at its declared weight, and add scores for different rules targeting the same surface/class.

Select a primary only when there is a unique top surface with score `>= MIN_SURFACE_SCORE`. On a top-score tie, return `null`.

Select problem classes only when there is a unique top class with score `>= MIN_PROBLEM_SCORE`. In B1 the deterministic baseline emits at most one hard problem class.

Select secondary surfaces only when they independently score `>= MIN_SECONDARY_SURFACE_SCORE`, excluding the primary; order them by descending score and then `surfaceKey()` for deterministic output.

Return through `TaxonomyInferenceCandidateSchema.parse(...)`.

- [ ] **Step 6: Run deterministic tests and tune only enough to satisfy the declared cases**

```powershell
npx vitest run test/taxonomy-inference.test.ts
npm run typecheck
```

Expected: all taxonomy-inference tests pass.

If an intended contrast fails, adjust the smallest relevant signal weight/pattern. Do not add rules for untested tickets during this task.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/taxonomy-inference.ts test/taxonomy-inference.test.ts

git commit -m "Add deterministic taxonomy inference baseline"
```

---

### Task 3: Strict GPT Taxonomy Reasoning Provider

**Files:**
- Create: `src/taxonomy-reasoning-provider.ts`
- Create: `test/taxonomy-reasoning-provider.test.ts`

**Interfaces:**
- Consumes: `TaxonomyInferenceInput`
- Produces:
  ```ts
  export interface TaxonomyReasoningExecution {
    candidate: TaxonomyInferenceCandidate;
    rationale: string;
    telemetry: {
      model: string;
      latencyMs: number;
      usage?: AiUsage;
    };
  }

  export interface TaxonomyReasoningProvider {
    reason(
      input: TaxonomyInferenceInput,
    ): Promise<TaxonomyReasoningExecution>;
  }

  export class OpenAiTaxonomyReasoningProvider
    implements TaxonomyReasoningProvider;

  export class UnavailableTaxonomyReasoningProvider
    implements TaxonomyReasoningProvider;

  export function createTaxonomyReasoningProviderFromEnv(
    env: NodeJS.ProcessEnv,
    options: { preferOpenAi: boolean },
  ): TaxonomyReasoningProvider | undefined;
  ```

- [ ] **Step 1: Write RED provider-contract tests**

Create `test/taxonomy-reasoning-provider.test.ts` using the same injected-fetch pattern as `test/classification-reasoning-provider.test.ts`.

The success test must prove:
- model/latency/usage telemetry;
- strict structured-output request;
- request contains ticket, conversation text, deterministic classification;
- request does **not** contain `knowledgeArticles`, `support`, or `basis`;
- candidate is parsed through the canonical candidate schema.

Use this response payload:

```ts
text: JSON.stringify({
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
  rationale:
    "The complaint is about consent eligibility state after an SMS opt-out.",
})
```

Assert:

```ts
expect(execution.candidate).toEqual({
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
expect(execution.rationale).toContain("consent eligibility");
expect(execution.telemetry).toEqual({
  model: "gpt-5.6-luna",
  latencyMs: 125,
  usage: {
    inputTokens: 100,
    outputTokens: 30,
    totalTokens: 130,
  },
});
```

- [ ] **Step 2: Add RED invalid-output, cross-domain, unavailable, and timeout tests**

Test these exact behaviors:

1. `primaryProductSurface: { domain: "billing", area: "webhooks" }`
   - request-level JSON may contain only known enum strings;
   - local canonical candidate validation must reject the invalid domain/area pair;
   - error must expose only sanitized field paths, not raw provider payload.

2. `problemClasses: ["mystery"]`
   - fail with sanitized `problemClasses.0` path.

3. no API key + `preferOpenAi: true`
   - returns `UnavailableTaxonomyReasoningProvider`.

4. `preferOpenAi: false`
   - factory returns `undefined`.

5. stalled injected fetch + short timeout
   - throws the existing `OpenAiTimeoutError`.

- [ ] **Step 3: Run provider tests and verify RED**

```powershell
npx vitest run test/taxonomy-reasoning-provider.test.ts
```

Expected: FAIL because the provider module does not exist.

- [ ] **Step 4: Implement provider types and sanitized schema errors**

In `src/taxonomy-reasoning-provider.ts`, reuse:

```ts
import { z } from "zod";
import {
  AiUsageSchema,
  type AiUsage,
} from "./domain.js";
import {
  ProductDomainSchema,
} from "./diagnostic-taxonomy.js";
import {
  TaxonomyInferenceCandidateSchema,
  type TaxonomyInferenceCandidate,
  type TaxonomyInferenceInput,
} from "./taxonomy-inference.js";
import type { FetchLike } from "./approval-desk/draft-response-provider.js";
import {
  OpenAiTimeoutError,
  UnavailableOpenAiError,
} from "./approval-desk/draft-response-provider.js";
```

Define:

```ts
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MS = 20_000;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type TaxonomySchemaFailureStage =
  | "response-envelope"
  | "reasoning-json"
  | "reasoning-fields";

export class InvalidTaxonomySchemaError extends Error {
  readonly name = "InvalidTaxonomySchemaError";
  readonly fields: readonly string[];

  constructor(
    readonly stage: TaxonomySchemaFailureStage,
    fields: readonly string[],
  ) {
    const safeFields = [...new Set(fields)]
      .map((field) => field.trim())
      .filter((field) => /^[A-Za-z0-9_.<>-]+$/.test(field))
      .slice(0, 8);

    super(
      `OpenAI taxonomy ${stage} validation failed for ${
        safeFields.length === 0
          ? "unknown-fields"
          : safeFields.join(", ")
      }.`,
    );

    this.fields = safeFields;
  }
}
```

- [ ] **Step 5: Implement strict semantic response parsing**

Provider response schema:

```ts
const TaxonomyProviderResponseSchema = TaxonomyInferenceCandidateSchema
  .extend({
    rationale: z.string().trim().min(1).max(240),
  })
  .strict();
```

If `.extend()` is unavailable on the refined candidate schema, define an equivalent strict object using `ProductSurfaceSchema.nullable()`, arrays, and then parse the three semantic fields again through `TaxonomyInferenceCandidateSchema` before returning.

The returned canonical candidate must always be:

```ts
TaxonomyInferenceCandidateSchema.parse({
  primaryProductSurface: parsed.primaryProductSurface,
  secondaryProductSurfaces: parsed.secondaryProductSurfaces,
  problemClasses: parsed.problemClasses,
});
```

- [ ] **Step 6: Implement the OpenAI request without knowledge grounding**

`buildReasoningInput()` must serialize only:

```ts
{
  ticket: {
    id: input.ticket.id,
    customer: input.ticket.customer,
    requester: input.ticket.requester,
    subject: input.ticket.subject,
    description: input.ticket.description,
    tags: input.ticket.tags,
  },
  conversationText: input.conversationText,
  deterministicClassification: input.deterministicClassification,
}
```

The instructions must explicitly state:

```text
Infer semantic diagnostic taxonomy using only the provided ticket and
conversation context. Product surface means where in the product the
observed issue primarily lives; problem class means what kind of issue
the available evidence establishes. Do not infer a root cause. Do not
return support, basis, confidence, routing, lifecycle, known-cause, fix,
or diagnosis fields. Use null for primaryProductSurface when the
available evidence is insufficient. Secondary surfaces are optional and
should be emitted only when another subsystem is meaningfully involved.
Return only allowed enum values and exactly the requested JSON shape.
```

The structured-output schema must set `additionalProperties: false` at every object level.

Use:
- `ProductDomainSchema.options` for domain values;
- one explicit `ALL_PRODUCT_AREAS` constant containing every area string from `ProductSurfaceSchema`;
- the canonical `ProblemClassSchema.options` for problem classes;
- nullable primary surface;
- arrays for secondary surfaces/problem classes;
- rationale max length 240.

The local Zod candidate schema remains authoritative for rejecting invalid domain/area pairings.

- [ ] **Step 7: Implement telemetry, env factory, timeout, and unavailable provider**

Match the existing classification provider behavior:
- `store: false`;
- sanitize malformed response envelope;
- sanitize malformed output JSON;
- convert OpenAI usage fields through `AiUsageSchema`;
- default model `gpt-5.6-luna`;
- `OPENAI_MODEL` override;
- 20-second default timeout;
- unavailable provider throws `UnavailableOpenAiError`.

- [ ] **Step 8: Run provider tests and typecheck**

```powershell
npx vitest run test/taxonomy-reasoning-provider.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit Task 3**

```powershell
git add src/taxonomy-reasoning-provider.ts `
        test/taxonomy-reasoning-provider.test.ts

git commit -m "Add GPT taxonomy reasoning provider"
```

---

### Task 4: Lane Metrics and Per-Ticket Comparison

**Files:**
- Create: `src/taxonomy-evaluation.ts`
- Create: `test/taxonomy-evaluation.test.ts`

**Interfaces:**
- Consumes:
  - reviewed `EvaluationOracle[]`;
  - deterministic candidate records;
  - optional GPT candidate records.
- Produces:
  ```ts
  export type TaxonomyInferenceStatus =
    | "predicted"
    | "abstained"
    | "unavailable";

  export interface TaxonomyInferenceRecord {
    ticketId: string;
    status: TaxonomyInferenceStatus;
    candidate?: TaxonomyInferenceCandidate;
    rationale?: string;
  }

  export interface TaxonomyLaneMetrics {
    reviewedScenarioCount: number;
    availableScenarioCount: number;
    unavailableScenarioCount: number;
    primarySurfaceAccuracy: number | null;
    problemClassAccuracy: number | null;
    fullTaxonomyAccuracy: number | null;
    abstentionRate: number | null;
  }

  export interface TaxonomyTicketResult {
    ticketId: string;
    status: TaxonomyInferenceStatus;
    candidate?: TaxonomyInferenceCandidate;
    primarySurfacePass: boolean;
    problemClassPass: boolean;
    taxonomyPass: boolean;
    abstained: boolean;
  }

  export interface TaxonomyComparisonReport {
    reviewedScenarioCount: number;
    deterministic: {
      metrics: TaxonomyLaneMetrics;
      tickets: TaxonomyTicketResult[];
    };
    gpt: {
      metrics: TaxonomyLaneMetrics;
      tickets: TaxonomyTicketResult[];
    } | null;
  }

  export function evaluateTaxonomyLanes(input: {
    oracles: readonly EvaluationOracle[];
    deterministic: readonly TaxonomyInferenceRecord[];
    gpt?: readonly TaxonomyInferenceRecord[];
  }): TaxonomyComparisonReport;
  ```

Metric semantics:
- Filter oracle denominator to `oracle.taxonomy !== undefined`.
- `reviewedScenarioCount` is that filtered count.
- `unavailable` is not a model abstention.
- Accuracy denominators are **available** lane records only.
- `abstentionRate` denominator is available records only.
- A predicted record with `primaryProductSurface: null` has status `"abstained"`.
- An abstention still receives dimension scores (`primarySurfacePass=false`; problem class can independently pass only if non-empty).
- A missing record for a reviewed ticket is a validation error, not silently converted into unavailable.
- Records for unreviewed tickets are ignored for B1 metrics, not scored as failures.

- [ ] **Step 1: Write RED tests for dimension metrics**

Create two reviewed test oracles:
- TKT-1017 -> `messaging/sms`, `expected-behavior`
- TKT-1030 -> `customer-data/consent`, `data-integrity`

Create deterministic records:
- TKT-1017 fully correct;
- TKT-1030 correct surface, wrong class.

Assert:

```ts
expect(report.deterministic.metrics).toEqual({
  reviewedScenarioCount: 2,
  availableScenarioCount: 2,
  unavailableScenarioCount: 0,
  primarySurfaceAccuracy: 1,
  problemClassAccuracy: 0.5,
  fullTaxonomyAccuracy: 0.5,
  abstentionRate: 0,
});
```

- [ ] **Step 2: Add RED tests for abstention, provider unavailable, and unreviewed exclusion**

Cases:
- deterministic TKT-1030 candidate has `primaryProductSurface: null`, empty classes -> abstention rate 0.5;
- GPT TKT-1017 `"unavailable"` and TKT-1030 correct -> GPT availability 1/2, accuracies 1.0 over the one available record;
- include an unreviewed oracle/record and prove `reviewedScenarioCount` remains 2;
- omit a reviewed deterministic record and expect a deterministic validation error containing that ticket ID.

- [ ] **Step 3: Run and verify RED**

```powershell
npx vitest run test/taxonomy-evaluation.test.ts
```

Expected: FAIL because `src/taxonomy-evaluation.ts` does not exist.

- [ ] **Step 4: Implement deterministic validation and scoring**

Use `scoreTaxonomyOracle()` from Task 1.

Validate:
- duplicate record ticket IDs are errors;
- every reviewed taxonomy oracle has exactly one record for every lane being evaluated;
- extra records for non-reviewed tickets do not affect metrics.

For each available record:
- require a candidate;
- parse it with `TaxonomyInferenceCandidateSchema`;
- derive `status: "abstained"` when primary is null even if caller supplied `"predicted"`; prefer canonical derived status rather than trusting caller status.

For unavailable records:
- candidate must be absent.

Sort per-ticket results by `ticketId`.

- [ ] **Step 5: Implement finite nullable metrics**

Use:

```ts
function nullableRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}
```

For each lane:
- `availableScenarioCount = predicted + abstained`;
- `unavailableScenarioCount = reviewed - available`;
- accuracy denominator = available;
- abstention denominator = available.

Do not round metrics.

- [ ] **Step 6: Run evaluation tests and focused compatibility tests**

```powershell
npx vitest run `
  test/taxonomy-evaluation.test.ts `
  test/evaluation-oracle.test.ts `
  test/evaluation.test.ts

npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/taxonomy-evaluation.ts test/taxonomy-evaluation.test.ts

git commit -m "Add taxonomy inference lane metrics"
```

---

### Task 5: Offline-First Evaluation Runner and Optional Live GPT Lane

**Files:**
- Modify: `src/taxonomy-evaluation.ts`
- Modify: `test/taxonomy-evaluation.test.ts`
- Create: `scripts/evaluate-taxonomy-inference.ts`
- Modify: `package.json`

**Interfaces:**
- Adds:
  ```ts
  export interface TaxonomyInferenceScenario {
    ticket: Ticket;
    conversationText: string;
    deterministicClassification: Pick<
      TicketClassification,
      "category" | "team" | "priority"
    >;
  }

  export async function compareTaxonomyInference(input: {
    scenarios: readonly TaxonomyInferenceScenario[];
    oracles: readonly EvaluationOracle[];
    gptProvider?: TaxonomyReasoningProvider;
  }): Promise<TaxonomyComparisonReport>;
  ```

- [ ] **Step 1: Write RED end-to-end comparison tests using the real deterministic lane**

In `test/taxonomy-evaluation.test.ts`, load:
- `data/seed/tickets.json`;
- `loadEvaluationOracles()`.

Filter to reviewed taxonomy oracle ticket IDs.

For each ticket:
- build `ConversationContext` with no seeded replies/support responses;
- call `classifyTicketFromContext()`;
- produce the scenario.

Call:

```ts
const report = await compareTaxonomyInference({
  scenarios,
  oracles,
});
```

Assert:
- `reviewedScenarioCount === 2`;
- deterministic lane has `availableScenarioCount === 2`;
- `gpt === null`;
- TKT-1017 and TKT-1030 both appear in deterministic per-ticket results;
- no network/provider is invoked.

Do **not** assert an aspirational aggregate accuracy threshold beyond the two reviewed cases' explicitly tested expectations.

- [ ] **Step 2: Add RED fake-GPT comparison test**

Use an injected fake provider:

```ts
const provider: TaxonomyReasoningProvider = {
  async reason(input) {
    if (input.ticket.id === "TKT-1017") {
      return {
        candidate: {
          primaryProductSurface: {
            domain: "messaging",
            area: "sms",
          },
          secondaryProductSurfaces: [],
          problemClasses: ["expected-behavior"],
        },
        rationale: "Quiet-hour protection is SMS behavior.",
        telemetry: {
          model: "fake-taxonomy-model",
          latencyMs: 1,
        },
      };
    }

    return {
      candidate: {
        primaryProductSurface: {
          domain: "customer-data",
          area: "consent",
        },
        secondaryProductSurfaces: [],
        problemClasses: ["data-integrity"],
      },
      rationale: "STOP changed consent but profile eligibility disagrees.",
      telemetry: {
        model: "fake-taxonomy-model",
        latencyMs: 1,
      },
    };
  },
};
```

Assert GPT full taxonomy accuracy is 1 over the two reviewed cases.

- [ ] **Step 3: Add RED fake-provider failure test**

Have the fake provider throw `new UnavailableOpenAiError()` for one ticket.

Assert:
- comparison still resolves;
- deterministic lane remains present;
- GPT `unavailableScenarioCount === 1`;
- the provider failure does not mutate or remove deterministic results;
- no raw error string is stored in candidate/rationale fields.

- [ ] **Step 4: Run and verify RED**

```powershell
npx vitest run test/taxonomy-evaluation.test.ts
```

Expected: FAIL because `compareTaxonomyInference` does not exist.

- [ ] **Step 5: Implement `compareTaxonomyInference`**

For each taxonomy-reviewed oracle:
1. find the matching scenario;
2. call `inferTaxonomyDeterministically(scenario)`;
3. create deterministic record with derived predicted/abstained status;
4. if no GPT provider was supplied, omit the GPT lane entirely;
5. if GPT provider exists, call `reason(scenario)`;
6. on provider success, parse candidate and record rationale;
7. on any provider error, record `{ ticketId, status: "unavailable" }`;
8. pass records to `evaluateTaxonomyLanes()`.

Do not pass oracles into either inference function/provider.

Do not pass knowledge articles/playbooks into the GPT provider.

- [ ] **Step 6: Run end-to-end evaluation tests and typecheck**

```powershell
npx vitest run `
  test/taxonomy-inference.test.ts `
  test/taxonomy-reasoning-provider.test.ts `
  test/taxonomy-evaluation.test.ts `
  test/evaluation-oracle.test.ts `
  test/evaluation.test.ts

npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Write the offline-by-default CLI**

Create `scripts/evaluate-taxonomy-inference.ts`.

Behavior:
- parse `--live` from `process.argv.slice(2)`;
- load `data/seed/tickets.json` with `TicketSchema.array()`;
- load `loadEvaluationOracles()`;
- keep only tickets whose oracle has reviewed taxonomy;
- build a no-reply `ConversationContext` for each ticket;
- compute deterministic classification from the same context;
- create GPT provider only when `--live` is present;
- use `createTaxonomyReasoningProviderFromEnv(process.env, { preferOpenAi: live })`;
- call `compareTaxonomyInference`;
- print `JSON.stringify(report, null, 2)`;
- set `process.exitCode = 1` only for unexpected top-level runner/data errors, not for individual provider unavailability.

The CLI must not read knowledge article bodies.

- [ ] **Step 8: Add package script**

In `package.json` add:

```json
"evaluate:taxonomy": "npm run build && node dist/scripts/evaluate-taxonomy-inference.js"
```

Place it next to the other evaluation scripts.

- [ ] **Step 9: Build and run the offline evaluator**

```powershell
npm run build
npm run evaluate:taxonomy
```

Expected:
- command succeeds without `OPENAI_API_KEY`;
- JSON includes deterministic metrics;
- `"gpt": null`;
- reviewed scenario count is 2;
- output contains only reviewed taxonomy scenarios.

- [ ] **Step 10: Commit Task 5**

```powershell
git add src/taxonomy-evaluation.ts `
        test/taxonomy-evaluation.test.ts `
        scripts/evaluate-taxonomy-inference.ts `
        package.json

git commit -m "Add taxonomy inference comparison runner"
```

---

### Task 6: Final B1 Verification and Scope Audit

**Files:**
- No intended production changes.
- If a verification failure reveals a bug, use systematic debugging and a fresh RED-GREEN cycle before modifying code.

**Interfaces:**
- Final branch must expose:
  - canonical candidate;
  - deterministic inference;
  - GPT reasoning provider;
  - dimension-level oracle scoring;
  - side-by-side lane report;
  - offline evaluator CLI.

- [ ] **Step 1: Run all B1-focused tests**

```powershell
npx vitest run `
  test/taxonomy-inference.test.ts `
  test/taxonomy-reasoning-provider.test.ts `
  test/taxonomy-evaluation.test.ts `
  test/evaluation-oracle.test.ts `
  test/evaluation.test.ts
```

Expected: 0 failures.

- [ ] **Step 2: Run compiler/build checks**

```powershell
npm run typecheck
npm run build
```

Expected: both exit 0.

- [ ] **Step 3: Run the offline taxonomy evaluator**

```powershell
npm run evaluate:taxonomy
```

Expected:
- exit 0;
- deterministic lane present;
- GPT lane null;
- exactly the reviewed taxonomy scenarios are scored.

- [ ] **Step 4: Run existing oracle audit**

```powershell
npm run evaluate:oracle-audit
```

Expected:
- exit 0;
- no missing rationales;
- B1 did not silently expand reviewed oracle ground truth.

- [ ] **Step 5: Run the full suite**

```powershell
npm test
```

Expected: 0 failures.

- [ ] **Step 6: Verify no accidental operational/persistence scope creep**

Run:

```powershell
git diff feature/diagnostic-taxonomy-oracle-b0...HEAD --name-only
```

Expected B1 implementation files should be limited to:

```text
docs/superpowers/specs/2026-08-26-diagnostic-taxonomy-inference-b1-design.md
docs/superpowers/plans/2026-08-26-diagnostic-taxonomy-inference-b1.md
src/taxonomy-inference.ts
src/taxonomy-reasoning-provider.ts
src/taxonomy-evaluation.ts
src/evaluation-oracle.ts
scripts/evaluate-taxonomy-inference.ts
test/taxonomy-inference.test.ts
test/taxonomy-reasoning-provider.test.ts
test/taxonomy-evaluation.test.ts
test/evaluation-oracle.test.ts
package.json
```

Specifically confirm there are no B1 changes to:
- `src/operational/**`;
- SQLite migrations;
- lifecycle reducers/views;
- `src/triage-service.ts`;
- MCP/HTTP action handlers;
- known-cause state machines;
- knowledge article bodies/playbooks.

- [ ] **Step 7: Check whitespace without normalizing EOLs**

```powershell
git diff --check feature/diagnostic-taxonomy-oracle-b0...HEAD
```

Expected: no whitespace errors.

Do not run repository-wide line-ending normalization in this branch.

- [ ] **Step 8: Review commit history**

```powershell
git log --oneline --decorate feature/diagnostic-taxonomy-oracle-b0..HEAD
```

Expected conceptual commits:

```text
docs: design diagnostic taxonomy inference B1
docs: plan diagnostic taxonomy inference B1
Add taxonomy inference candidate scoring
Add deterministic taxonomy inference baseline
Add GPT taxonomy reasoning provider
Add taxonomy inference lane metrics
Add taxonomy inference comparison runner
```

- [ ] **Step 9: If the implementation plan itself is not yet committed, commit it before Task 1**

This step belongs at execution start if the plan was copied into the worktree after creation:

```powershell
git add docs/superpowers/plans/2026-08-26-diagnostic-taxonomy-inference-b1.md
git commit -m "docs: plan diagnostic taxonomy inference B1"
```

Do not bundle plan-document changes into the first production-code commit.

---

## Post-B1 Deferred Evaluation Expansion

Do not implement this section as part of B1.

After B1 is green, review roughly 10–15 strategically chosen tickets across distinct product surfaces/problem classes before interpreting aggregate performance. Prefer contrasts that test semantic understanding rather than obvious keyword matching.

Then establish baselines for:
- deterministic primary-surface accuracy;
- GPT primary-surface accuracy;
- deterministic problem-class accuracy;
- GPT problem-class accuracy;
- full taxonomy accuracy;
- abstention behavior.

Only after that should later slices introduce:
- extensive coherent fictional product documentation;
- semantic/BM25/vector/hybrid retrieval;
- taxonomy-aware retrieval reranking;
- retrieval-grounded GPT taxonomy;
- taxonomy-informed diagnosis or pattern discovery;
- integration with immutable Phase A taxonomy persistence.
