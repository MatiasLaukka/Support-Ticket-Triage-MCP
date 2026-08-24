import { z } from "zod";

export const ProductDomainSchema = z.enum([
  "customer-data",
  "messaging",
  "automation",
  "integrations",
  "developer-platform",
  "catalog",
  "identity-access",
  "billing",
  "security",
]);

const CustomerDataAreaSchema = z.enum([
  "profiles",
  "segments",
  "consent",
  "imports",
  "exports",
]);

const MessagingAreaSchema = z.enum([
  "campaigns",
  "email",
  "sms",
  "push",
  "templates",
]);

const AutomationAreaSchema = z.enum([
  "flows",
  "triggers",
  "filters",
  "scheduling",
  "actions",
]);

const IntegrationsAreaSchema = z.enum([
  "shopify",
  "magento",
  "woocommerce",
  "salesforce",
  "webhooks",
  "custom-connectors",
]);

const DeveloperPlatformAreaSchema = z.enum([
  "http-api",
  "mcp",
  "api-keys",
  "sdk",
  "event-ingestion",
]);

const CatalogAreaSchema = z.enum([
  "products",
  "product-feeds",
  "coupons",
  "inventory",
  "field-mapping",
]);

const IdentityAccessAreaSchema = z.enum([
  "login",
  "sso",
  "users",
  "roles-permissions",
  "sessions",
  "account-recovery",
]);

const BillingAreaSchema = z.enum([
  "subscription",
  "plans-entitlements",
  "invoices",
  "payments",
  "refunds",
  "credits",
  "payment-methods",
]);

const SecurityAreaSchema = z.enum([
  "credentials-secrets",
  "key-management",
  "audit-log",
  "access-policies",
  "security-settings",
]);

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

export const ProblemClassSchema = z.enum([
  "defect",
  "outage",
  "degraded-performance",
  "configuration",
  "data-integrity",
  "access",
  "expected-behavior",
  "security",
  "feature-request",
]);

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