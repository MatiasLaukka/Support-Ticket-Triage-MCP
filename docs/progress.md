# Knotty implementation progress

[Connection map](current-architecture.md) · [Module maps](modules/README.md) · [Documentation index](README.md)

Status checked **2026-10-31**. Runtime baseline for the branch maps: PR #38 source
head `cbcc590`; main was `cc42b5c` at the time checked.
This is a short delivery view; linked PRs and commits own detailed history.
Local completion, open review, and merged delivery are distinct states.

## Current objective

Make the existing architecture easier to navigate while preserving approval,
transaction, replay, compatibility, and research-isolation guarantees.

| Work | Status at check | Acceptance/evidence | Next action |
| --- | --- | --- | --- |
| [PR #36: foundational startup error](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/36) | Merged into main | Preserve runtime re-export and constructor identity; main contains the moved error. See the error/module maps and identity tests. | Retain compatibility in later changes. |
| [PR #37: retrieval readability](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/37) | Open draft | Preserve search ordering, scoring, channel state, references, and complete representative outputs. Prior local/CI reports belong to that PR's exact revision. | Complete owner review and recheck current CI before merging. |
| [PR #38: recommendation command family](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/38) | Open draft; source head verified as `cbcc590` before this documentation remediation | Preserve facade, dispatcher/transactions, and replay. Requested source comments and branch-current connection/module maps are now on this branch; no runtime source changed. | Review this documentation remediation and recheck PR status/CI before any merge decision. |
| [PR #35: pinned architecture audit](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/35) | Open | Retain its `fe035ee` baseline and evidence; do not convert it into a live map. | Review/publish separately from runtime refactors. |
| Documentation baseline `2ef9d32` | Incorporated into PR #38 branch by a merge commit; PR remains open draft and unmerged | Repository standards, connection map, initial module maps, and navigation links are present. | Maintain these canonical docs with later changes. |

## Boundaries and remaining work

- Executable TypeScript is unchanged by this documentation remediation. The
  lifecycle command, support, contracts, and scoped facade maps are partial
  behavior maps, not exhaustive call graphs.
- The PR #38 remediation is documentation-only. Its extracted implementation is
  present on the branch and remains unmerged; the maintained map labels both
  facts separately.
- Existing historical captures, reviewer ratings, research results, and dirty
  worktrees remain separate. This tracker authorizes no research promotion,
  live provider run, database reset, or merge.
- Use a decision note for a new non-obvious architectural choice. The distinction
  between maintained maps and pinned evidence is recorded in this documentation;
  a separate ADR file is unnecessary for this small relocation.
