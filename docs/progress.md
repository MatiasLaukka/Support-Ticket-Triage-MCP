# Knotty implementation progress

[Connection map](current-architecture.md) · [Module maps](modules/README.md) · [Documentation index](README.md)

Status checked **2026-10-31**. Runtime baseline: GitHub main `cc42b5c`.
This is a short delivery view; linked PRs and commits own detailed history.
Local completion, open review, and merged delivery are distinct states.

## Current objective

Make the existing architecture easier to navigate while preserving approval,
transaction, replay, compatibility, and research-isolation guarantees.

| Work | Status at check | Acceptance/evidence | Next action |
| --- | --- | --- | --- |
| [PR #36: foundational startup error](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/36) | Merged into main | Preserve runtime re-export and constructor identity; main contains the moved error. See the error/module maps and identity tests. | Retain compatibility in later changes. |
| [PR #37: retrieval readability](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/37) | Open draft | Preserve search ordering, scoring, channel state, references, and complete representative outputs. Prior local/CI reports belong to that PR's exact revision. | Complete owner review and recheck current CI before merging. |
| [PR #38: recommendation command family](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/38) | Open draft at `cbcc590` | Preserve facade, dispatcher/transactions, and replay. Latest supplied independent review found no runtime regression and two documentation gaps. | Add module/handler contracts and branch-current connection/internal maps, then re-review. |
| [PR #35: pinned architecture audit](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/35) | Open | Retain its `fe035ee` baseline and evidence; do not convert it into a live map. | Review/publish separately from runtime refactors. |
| Documentation standard and maintained maps | Implemented locally on `docs/current-architecture-standards`; not pushed or merged | Global instructions installed; repository rules, connection map, initial internal maps, and navigation links created. Documentation verification is recorded in the handoff. | Review the documentation commit and incorporate it into the intended branch. |

## Boundaries and remaining work

- Runtime code is unchanged by the documentation work. The two initial internal
  maps cover errors/timeouts; other modules are not claimed to have complete
  symbol/call maps.
- The PR #38 remediation is documentation-only. Its working branch must describe
  the extracted implementation as present on that branch, while labeling its
  merge status accurately.
- Existing historical captures, reviewer ratings, research results, and dirty
  worktrees remain separate. This tracker authorizes no research promotion,
  live provider run, database reset, or merge.
- Use a decision note for a new non-obvious architectural choice. The distinction
  between maintained maps and pinned evidence is recorded in this documentation;
  a separate ADR file is unnecessary for this small relocation.
