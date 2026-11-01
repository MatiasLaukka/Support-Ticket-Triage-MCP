# Knotty implementation progress

[Connection map](current-architecture.md) · [Module maps](modules/README.md) · [Documentation index](README.md)

Status checked **2026-10-31**. Runtime baseline for the branch maps: PR #38 source
head `cbcc590`; main was `cc42b5c` at the time checked.
This is a short delivery view; linked PRs and commits own detailed history.
Local completion, open review, and merged delivery are distinct states.

## Receipt-read test isolation — 2026-11-01

Branch [codex/receipt-read-test-isolation](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/compare/main...codex/receipt-read-test-isolation) is local work pending draft review and CI; it is not merged. Base: `2628f65481054dae0f79f5c569f654912ffc5de9`.

- Objective: preserve exact bulk-receipt batching and runtime discovery/integrity checks while allowing shadow refresh to run concurrently.
- Evidence: a controlled Windows/Node 24 probe reproduced a one-versus-two global spy count, with separate discovery and shadow-refresh stacks. The original CI failure has no call stacks, so its attribution remains unconfirmed.
- Change: measure the synchronous SQLite discovery read separately; a gated runtime test verifies the real refresh and discovery with shadow retrieval enabled. No production scheduling changes.
- Validation: Windows/Node 24: focused discovery tests passed (27); `npm test -- --maxWorkers=2` passed build, typecheck, and 2,500 tests in 149 files. Linux/Node 22 CI remains to be checked against the pushed revision.
- Next: review the draft and its exact-head CI results before any merge decision.
- Isolated worktree: `D:/Development/Worktrees/knotty-receipt-read-isolation`; owner: Codex task; branch and base above; created 2026-11-01 for this change. Retain for review; do not remove without owner authorization.

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
