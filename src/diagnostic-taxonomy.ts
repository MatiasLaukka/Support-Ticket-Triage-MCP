import { z } from "zod";

export const PRODUCT_SURFACE_AREAS = {
  "customer-data": [
    "profiles",
    "segments",
    "consent",
    "imports",
    "exports",
  ],
  messaging: [
    "campaigns",
    "email",
    "sms",
    "push",
    "templates",
  ],
  automation: [
    "flows",
    "triggers",
    "filters",
    "scheduling",
    "actions",
  ],
  integrations: [
    "shopify",
    "magento",
    "woocommerce",
    "salesforce",
    "webhooks",
    "custom-connectors",
  ],
  "developer-platform": [
    "http-api",
    "mcp",
    "api-keys",
    "sdk",
    "event-ingestion",
  ],
  catalog: [
    "products",
    "product-feeds",
    "coupons",
    "inventory",
    "field-mapping",
  ],
  "identity-access": [
    "login",
    "sso",
    "users",
    "roles-permissions",
    "sessions",
    "account-recovery",
  ],
  billing: [
    "subscription",
    "plans-entitlements",
    "invoices",
    "payments",
    "refunds",
    "credits",
    "payment-methods",
  ],
  security: [
    "credentials-secrets",
    "key-management",
    "audit-log",
    "access-policies",
    "security-settings",
  ],
} as const;

type CanonicalProductDomain =
  keyof typeof PRODUCT_SURFACE_AREAS;

const PRODUCT_DOMAINS = Object.keys(
  PRODUCT_SURFACE_AREAS,
) as [
  CanonicalProductDomain,
  ...CanonicalProductDomain[],
];

export const ProductDomainSchema =
  z.enum(PRODUCT_DOMAINS);

const CustomerDataAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS["customer-data"],
);

const MessagingAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS.messaging,
);

const AutomationAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS.automation,
);

const IntegrationsAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS.integrations,
);

const DeveloperPlatformAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS["developer-platform"],
);

const CatalogAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS.catalog,
);

const IdentityAccessAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS["identity-access"],
);

const BillingAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS.billing,
);

const SecurityAreaSchema = z.enum(
  PRODUCT_SURFACE_AREAS.security,
);

export const ProductSurfaceSchema = z.discriminatedUnion("domain", [
  z
    .object({
      domain: z.literal("customer-data"),
      area: CustomerDataAreaSchema,
    })
    .strict(),

  z
    .object({
      domain: z.literal("messaging"),
      area: MessagingAreaSchema,
    })
    .strict(),

  z
    .object({
      domain: z.literal("automation"),
      area: AutomationAreaSchema,
    })
    .strict(),

  z
    .object({
      domain: z.literal("integrations"),
      area: IntegrationsAreaSchema,
    })
    .strict(),

  z
    .object({
      domain: z.literal("developer-platform"),
      area: DeveloperPlatformAreaSchema,
    })
    .strict(),

  z
    .object({
      domain: z.literal("catalog"),
      area: CatalogAreaSchema,
    })
    .strict(),

  z
    .object({
      domain: z.literal("identity-access"),
      area: IdentityAccessAreaSchema,
    })
    .strict(),

  z
    .object({
      domain: z.literal("billing"),
      area: BillingAreaSchema,
    })
    .strict(),

  z
    .object({
      domain: z.literal("security"),
      area: SecurityAreaSchema,
    })
    .strict(),
]);

export const PROBLEM_CLASSES = [
  "defect",
  "outage",
  "degraded-performance",
  "configuration",
  "data-integrity",
  "access",
  "expected-behavior",
  "security",
  "feature-request",
] as const;

export const ProblemClassSchema =
  z.enum(PROBLEM_CLASSES);

export const DiagnosticTaxonomyBasisSchema = z
  .object({
    source: z.enum([
      "initial-classification",
      "customer-evidence",
      "diagnostic-evidence",
      "known-cause-assessment",
      "diagnosis",
    ]),
    evidenceIds: z.array(z.string()),
    knowledgeArticleIds: z.array(z.string()),
    playbookIds: z.array(z.string()),
    knownCauseIds: z.array(z.string()),
    explanation: z.string().trim().min(1),
  })
  .strict();

export const EvidenceSupportSchema = z.enum([
  "tentative",
  "supported",
  "established",
]);

export const DiagnosticTaxonomyContextSchema = z
  .object({
    primaryProductSurface: ProductSurfaceSchema.nullable(),
    secondaryProductSurfaces: z.array(ProductSurfaceSchema),
    problemClasses: z.array(ProblemClassSchema),
    support: z
    .object({
        productSurface: EvidenceSupportSchema,
        problemClass: EvidenceSupportSchema,
    })
    .strict(),
    basis: DiagnosticTaxonomyBasisSchema,
  })
  .strict()
  .superRefine((context, refinementContext) => {
    const secondaryKeys = new Set<string>();

    for (const surface of context.secondaryProductSurfaces) {
      const key = `${surface.domain}/${surface.area}`;

      if (secondaryKeys.has(key)) {
        refinementContext.addIssue({
          code: "custom",
          path: ["secondaryProductSurfaces"],
          message: "Secondary product surfaces must be unique.",
        });
      }

      secondaryKeys.add(key);
    }

    if (context.primaryProductSurface !== null) {
      const primaryKey =
        `${context.primaryProductSurface.domain}/${context.primaryProductSurface.area}`;

      if (secondaryKeys.has(primaryKey)) {
        refinementContext.addIssue({
          code: "custom",
          path: ["secondaryProductSurfaces"],
          message:
            "Primary product surface must not also appear as a secondary surface.",
        });
      }
    }

    if (
      new Set(context.problemClasses).size !== context.problemClasses.length
    ) {
      refinementContext.addIssue({
        code: "custom",
        path: ["problemClasses"],
        message: "Problem classes must be unique.",
      });
    }
  });

export type EvidenceSupport = z.infer<typeof EvidenceSupportSchema>;
export type ProductDomain = z.infer<typeof ProductDomainSchema>;
export type ProductSurface = z.infer<typeof ProductSurfaceSchema>;
export type ProblemClass = z.infer<typeof ProblemClassSchema>;
export type DiagnosticTaxonomyBasis = z.infer<
  typeof DiagnosticTaxonomyBasisSchema
>;
export type DiagnosticTaxonomyContext = z.infer<
  typeof DiagnosticTaxonomyContextSchema
>;
