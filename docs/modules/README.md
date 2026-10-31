# Detailed module maps

[Codebase connection map](../current-architecture.md) · [Progress](../progress.md)

The connection map shows how major modules fit together. These maps zoom into
important symbols, state, calls, and data flow within a module. They complement
comments beside the code and do not replace the implementation or its tests.

## Coverage

The baseline maps were added against `cc42b5c3d6e1f3f260005cd8966d006a7cc208c2`.
The extracted lifecycle maps were reconciled to PR #38 source head
`cbcc590f843621b78918fc878a4594bf25caede3`, checked 2026-10-31. PR #38 remains
an open draft, so its implementation is branch-current and not represented as
merged `main` behavior. Coverage is intentionally partial; no exhaustive
codebase-wide symbol/call audit is claimed.

| Source | Detailed map | Coverage |
| --- | --- | --- |
| `src/errors.ts` | [Foundational errors](errors.md) | Both classes, constructors, error fields, and direct configuration callers |
| `src/utils/parse-openai-timeout.ts` | [Timeout parsing](utils/parse-openai-timeout.md) | All three exported functions and their throw/fallback behavior |
| `src/recommendation-lifecycle.ts` | [Recommendation lifecycle commands](recommendation-lifecycle.md) | Command preparation/commit/replay methods, key dependencies, and failures; dynamic automatic-reply import is called out |
| `src/operational-lifecycle-support.ts` | [Operational lifecycle support](operational-lifecycle-support.md) | Exported projections/guards and significant private audit helpers; consumers beyond the scoped family are partial |
| `src/recommendation-lifecycle-contracts.ts` | [Lifecycle input contracts](recommendation-lifecycle-contracts.md) | All four input interfaces and their facade/runtime-validation boundary |
| `src/triage-service.ts` | [Affected TriageService boundary](triage-service-lifecycle-boundary.md) | Scoped to lifecycle construction, validation, dispatch, compatibility paths, and post-commit automatic replies; the rest of this large service is not mapped |

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
