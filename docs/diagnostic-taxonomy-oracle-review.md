# Diagnostic Taxonomy Oracle Review

## Evidence boundary

The reviewed taxonomy labels use only ticket subject, description, tags, and
customer conversation evidence available at classification time. Diagnoses,
outcomes, knowledge articles, known causes, playbooks, and future ticket state
are not taxonomy-labeling evidence.

Taxonomy ground truth remains evaluation-only. It does not change inference,
routing, lifecycle behavior, diagnosis authority, or operational state.

## Reviewed scored cases

| Ticket | Primary product surface | Problem class | Secondary relevance (not scored) |
| --- | --- | --- | --- |
| TKT-1002 | `developer-platform/event-ingestion` | `degraded-performance` | `customer-data/profiles` |
| TKT-1004 | `security/credentials-secrets` | `security` | `developer-platform/api-keys` |
| TKT-1007 | `integrations/webhooks` | `configuration` | `security/key-management` |
| TKT-1009 | `messaging/campaigns` | `degraded-performance` | `automation/scheduling` |
| TKT-1015 | `customer-data/profiles` | `data-integrity` | `customer-data/imports` |
| TKT-1018 | `integrations/shopify` | `data-integrity` | `catalog/field-mapping` |
| TKT-1019 | `security/key-management` | `security` | `security/audit-log`, `security/credentials-secrets` |
| TKT-1020 | `integrations/shopify` | `degraded-performance` | `catalog/products`, `messaging/campaigns` |
| TKT-1023 | `customer-data/consent` | `data-integrity` | `developer-platform/http-api`, `customer-data/profiles` |
| TKT-1025 | `customer-data/consent` | `feature-request` | None reviewed |
| TKT-1028 | `integrations/webhooks` | `degraded-performance` | None reviewed |

Secondary relevance is documented for future analysis but is deliberately not
stored as scored ground truth. The current oracle contract scores acceptable
primary product surfaces and acceptable problem classes only.

## Reviewed abstention-boundary cases

The following tickets do not receive scored taxonomy ground truth in this
slice:

- `TKT-1005`: the automation surface is evident, but configuration versus
  defect is not safely established. Prompt-injection text is not evidence.
- `TKT-1027`: the HTTP API surface is evident, but configuration versus
  expected validation behavior requires the API contract or other evidence.
- `TKT-1022`: the segment surface is evident, but a current count and a prior
  export do not safely establish data integrity, expected behavior, or delayed
  recalculation.
- `TKT-1026`: the broad email surface is tentative and no problem class is
  supported by the available details.

The current oracle contract requires at least one acceptable primary product
surface and at least one acceptable problem class. Its scorer treats a null
primary surface or empty problem-class prediction as a taxonomy failure.
Therefore it cannot represent "abstention is correct." These cases remain
reviewed boundaries outside scored taxonomy evaluation; this slice does not
extend the contract.
