# Detailed module maps

[Codebase connection map](../current-architecture.md) · [Progress](../progress.md)

The connection map shows how major modules fit together. These maps zoom into
important symbols, state, calls, and data flow within a module. They complement
comments beside the code and do not replace the implementation or its tests.

## Coverage

Source baseline: `cc42b5c3d6e1f3f260005cd8966d006a7cc208c2`, checked 2026-10-31.
Coverage is intentionally partial; no exhaustive codebase-wide symbol/call audit
is claimed.

| Source | Detailed map | Coverage |
| --- | --- | --- |
| `src/errors.ts` | [Foundational errors](errors.md) | Both classes, constructors, error fields, and direct configuration callers |
| `src/utils/parse-openai-timeout.ts` | [Timeout parsing](utils/parse-openai-timeout.md) | All three exported functions and their throw/fallback behavior |
| Pending PR #38 modules | Not yet part of this main baseline | Its remediation must map the command family, shared support, input contracts, and facade boundary on that branch |

## Standard for a module map

Use a path corresponding to the source, for example
`src/utils/parse-openai-timeout.ts` → `docs/modules/utils/parse-openai-timeout.md`.
Reuse a clearer existing convention if one already exists.

Each map should state:

1. Source path, inspected version, responsibility, and coverage limits.
2. A symbol table for classes, exported functions, significant internal functions,
   module-level variables/constants, and important class fields. Explain purpose,
   inputs/results, ownership, mutation, effects, and important failure behavior.
3. A small diagram or explicit connection table for meaningful calls and data
   flow. Label imports, calls, type relationships, and conceptual ownership
   distinctly. Mark lazy/injected/dynamic relationships and incomplete analysis.
4. Critical invariants and links to callers, contracts, and relevant tests.

Keep stable architectural information here; keep local implementation explanations
in source comments. Use generated inventories where they reduce maintenance, but
do not present a symbol list as proof of runtime calls or claim every local
variable needs a separate diagram. Update the index and affected maps with code
changes. Use [progress](../progress.md) for delivery status.
