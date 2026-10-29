# Knotty architecture audit

Audit date: 2026-10-29. Scope: architecture, dependency evidence, maintenance recommendations, and owner learning. **Documentation only; no HYBRID operational transition is authorized or recommended by this audit.**

## Executive assessment

Knotty has meaningful authority controls behind a comparatively difficult navigation surface. The operational command dispatcher, synchronous SQLite unit of work, immutable result references, revision checks, and human review gates are valuable interfaces to preserve. The strongest maintenance opportunities are removing the startup-error dependency cycle, clarifying the service's internal command responsibilities, and documenting the distinction between operational, compatibility, and evaluation paths.

Current public `main` already includes H1–H5b shadow infrastructure. That does **not** mean HYBRID decides operational diagnoses. `evaluateTicketCommand` finishes the authoritative receipt-backed command before scheduling optional retrieval and capture; the injected B5 HYBRID adapter accepts evaluation mode only. Its hypothesis ranks and evidence actions remain advisory ([src/evaluation-command.ts:198](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/evaluation-command.ts#L198), [src/reasoning/b5-hybrid-reasoning-provider.ts:31](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/reasoning/b5-hybrid-reasoning-provider.ts#L31)). No finding here establishes HYBRID's diagnostic superiority or supports replacing SIMPLE.

No new correctness defect was established in the reviewed paths. The debt register distinguishes verified structural observations, compatibility obligations, possible removal candidates, and future safety prerequisites. It is not a certification of the entire application.

## Read this report

| Document | Purpose |
|---|---|
| [Module map](module-map.md) | Responsibilities, interfaces, direct dependencies, state, effects, tests, and dependency diagrams |
| [Execution flows](execution-flows.md) | Operational evaluation/approval, optional shadow reasoning, research comparison, and state ownership |
| [Technical debt and next steps](technical-debt.md) | Prioritized evidence register, legacy candidates, cohesion/coupling assessment, and safe task sequence |
| [Learning guide](learning-guide.md) | Reading order, useful documentation conventions, and three progressive owner exercises |
| [Evidence and reproduction](evidence/README.md) | Generated import/symbol inventories, baseline manifest, checks, and analysis limitations |

Source references throughout are **permalinks to the audited public commit**, because the delivery checkout is older and lacks many referenced files. Experimental worktree references are explicitly labeled **E1a overlay** and link to portable provenance records for the observed research files, not public main.

## Original audit baseline and preservation

| Surface | Observed identity | Meaning |
|---|---|---|
| Delivery checkout | `delivery-checkout`, branch `main`, HEAD `f4df210443151f70d94f4e47efe65b18fce18e96` | Base for these documentation additions. Initially zero tracked modifications; 5,347 untracked files when enumerated individually, including skill directories, outputs, work, and runtime-smoke artifacts. None was repurposed. |
| Cached remote tracking ref at the original audit | `origin/main` = `9cbf07281d1160b4e804518e183caf6a6962b181` | At the original audit, the local checkout was 109 commits behind this cached ref; the ref itself was older than public main. |
| Public default branch | GitHub HEAD points to `main`, `fe035ee383b6f9df1869104f8a623609d025023b` | Primary architecture baseline, verified with `git ls-remote --symref origin HEAD`; commit API reports 2026-10-29 12:54:50 UTC. |
| Inspection copy | Public archive pinned to `fe035ee…`, unpacked under the OS temporary directory | Used for source inspection, static generation, compiler checks and focused tests. No checkout update or local-ref update was required. |

The checkout and public main are deliberately separate baselines. These documents can be reviewed on the old checkout, but should be reconciled with the current development baseline before any later implementation. No branch, commit, push, merge, deployment, demo reset, or live provider run was performed during the original audit. The publication pass is recorded separately below.

### Relevant worktrees

Worktrees below use portable location labels. All were inspected read-only during the original audit. Commit and branch identities, changed tracked paths, and source comparisons are in [baseline.json](evidence/baseline.json); absolute workstation paths and unrelated worktree inventory are omitted for publication.

| Worktree | HEAD / branch | Status at capture | Relationship to public main |
|---|---|---|---|
| `research/hybrid-reasoning-h2-h3` | `457fb2b60dc5e98de593edc7ee21fdb346929a58`, `codex/hybrid-reasoning-h2-h3` | Clean | GitHub compare confirms ancestor, 26 commits behind main. All 143 main source files match after CRLF/LF normalization. |
| `research/home-assistant-e0a` | `d424d2ade602e8273b47f2227655c021d74e2ea1`, `experiment/home-assistant-e0a` | Clean | Public ancestry unresolved: compare returned 404. All 143 main source files match after newline normalization; that is content evidence, not merge evidence. |
| `research/home-assistant-e1a` | `6a60fdd50bd96ac679366bac6b87f00c82d237cc`, `experiment/home-assistant-e1a-diagnostic-comparison` | 6 modified tracked files; 31 untracked files | Public ancestry unresolved (404). Six main `src` files differ; 137 match. Evaluation scripts, matrix work and knowledge artifacts remain experimental. |
| `research/e1a-matrix-review-ui-fix` | `6a60fdd50bd96ac679366bac6b87f00c82d237cc`, detached | 4 modified tracked files; 886 untracked files | Public ancestry unresolved (404); same six main source differences as E1a. Reviewer overlays are not main features. |
| `research/b5-applicability-implementation` | `b346e04a8c49cea35ff471317a216857c4291ed4`, `codex/b5-applicability-implementation` | No tracked modifications; 30 untracked report files | Confirmed ancestor, 38 commits behind public main. Preserve historical captures. |
| `research/h1-retrieval-execution` | `054bdb5c2e21b95a6777c811785a58af50472e25`, `qwen/h1-refresh-failure-test` | Clean | Public ancestry unresolved (404); historical H1 source differs from current main. |

Additional status/ancestry checks found the B3 implementation, B3 semantic evaluation, B4 ranking implementation, knowledge-readiness B4, R1g reliability and evaluation-oracle foundation worktrees clean and ancestors of cached `origin/main`. These six received metadata checks rather than the deeper source/byte audit above. `git worktree list --porcelain` also identified taxonomy, lifecycle and older comparison worktrees. The selected worktree metadata is retained in the baseline evidence; unrelated raw inventory is omitted from this public copy; it does not claim an exhaustive behavioral audit of every historical checkout. A 404 neither proves nor disproves a merge. Dirty overlays cannot be identified by HEAD alone.

### Repository navigation and existing architecture material

* Executable entry points: [src/index.ts:24](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/index.ts#L24) → MCP stdio; [src/approval-desk.ts:71](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/approval-desk.ts#L71) → HTTP Approval Desk; [src/operational/import.ts:307](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/src/operational/import.ts#L307) and its CLI code → guarded operational import/initialization. Package scripts also expose evaluation and demo/reset commands. Their existence does not make them safe audit commands.
* Main source: `src/`, especially `approval-desk/`, `operational/`, `knowledge-evolution/`, `retrieval/`, and `reasoning/`. Tests are under **`test/`**, not `tests/`. Evaluation CLIs are under `scripts/`; fixture/corpus/oracle inputs are under `data/`; generated/historical captures are under `reports/`.
* Existing narrative: [docs/case-study.md](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/case-study.md), [docs/diagnostic-engine-plan.md](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/diagnostic-engine-plan.md), [docs/diagnostic-evaluation-harness.md](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/diagnostic-evaluation-harness.md), [docs/lifecycle-replay.md](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/lifecycle-replay.md), [docs/knowledge-evolution.md](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/knowledge-evolution.md), [docs/knowledge-readiness-review.md](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/knowledge-readiness-review.md), and [docs/audits/support-domain-audit.md](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/audits/support-domain-audit.md). Their historical result claims were not re-evaluated here.
* Existing diagrams in current main: [docs/assets/knotty-recommendation-architecture.svg](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/assets/knotty-recommendation-architecture.svg), [docs/assets/knotty-persistence-reliability.svg](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/assets/knotty-persistence-reliability.svg), and [docs/assets/knotty-hybrid-research.svg](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/fe035ee383b6f9df1869104f8a623609d025023b/docs/assets/knotty-hybrid-research.svg); root README embeds them. The detailed contracts/plans under `docs/superpowers/specs/` and `docs/superpowers/plans/` provide design intent, not proof that every historical proposal is active.
* Agent Skills: `.agents/skills/triaging-support-tickets/SKILL.md` and its policy/resources are client guidance. They do not replace server validation, policy checks, command identity, or human approval. Other local untracked skills are not evidence of shipped server capabilities.

## Immediate engineering priorities

1. Keep the current authority, replay, stale-input and shadow-isolation tests as requirements for any future change. Decide HYBRID value through a separately authorized, matched comparison.
2. Remove the low-level dependency on `StartupConfigError` defined in the runtime composition module. This is a concrete value-import cycle, not merely a type relationship.
3. Document service command families and their prepare/commit/replay invariants before extracting anything. Preserve one authoritative command boundary.
4. Improve readability of compressed retrieval code and identify compatibility-only routes explicitly.
5. Review narrow unused-export candidates only after checking downstream use and compatibility history. Keep research and frozen results intact.

The detailed sequence, risks, tests and timing relative to a possible future HYBRID integration are in [technical-debt.md](technical-debt.md#safe-sequence-of-follow-up-tasks).

## Validation and limits

The TypeScript 6.0.3 AST scan covered **315 TypeScript/JavaScript files**, including **143 source files**, and found **2,128 explicit import/re-export declarations**, of which **666 link two `src/` files**. Counts include type-only edges and multiple declarations between the same pair; they are not counts of runtime calls. One six-file strongly connected component remains when explicit type-only declarations are excluded. Three components appear when type edges are included. See [the generated evidence](evidence/README.md).

On the pinned temporary main snapshot, `tsc -p tsconfig.json --noEmit`, compilation with `tsc -p tsconfig.build.json`, and **279 tests in 13 files passed**. These were focused checks, not the full suite or a fresh CI result. Dependencies were reused from the existing installation (Node 24.15.0, Vitest 4.1.8, better-sqlite3 12.11.1); there was no install or new dependency. Provider transports were injected or blocked from external fetch; loopback HTTP in replay tests was allowed. No real model capability, diagnostic accuracy, comparative performance, cost, or production deployment was evaluated.

Source bodies were manually traced for the workflows shown. Generated import inventories and syntactic call expressions cannot establish all dynamic calls, configuration-dependent behavior, browser event wiring, external consumers, race schedules or runtime side effects. The embedded browser program in `ui.ts` is a template string to the TypeScript parser and needs separate browser-level analysis. Research evaluation scripts and reviewer overlays were inspected selectively; no gold material, reviewer decisions, frozen results or databases were re-scored or mutated.

Before/after verification compared branch/HEAD, existing Git status entries, tracked diff hashes, and bytes of **2,483 existing files** under `src/`, `scripts/`, `test/`, and `data/` across the delivery checkout and six selected worktrees. All matched. New files are confined to this documentation directory. Hashes are point-in-time filesystem evidence, not a database-consistent backup or proof about ignored files outside those directories. See [validation.json](evidence/validation.json).

This report and its static-analysis helper were AI-assisted. Findings are tied to source evidence and fresh focused checks so the owner can challenge or reproduce them independently.

## Publication reconciliation

Public main was reverified on 2026-10-29 at `fe035ee383b6f9df1869104f8a623609d025023b`, identical to the audited baseline: zero intervening commits or changed files. Findings and source references therefore retain their original evidence. Publication uses a new clean worktree and the documentation branch `docs/architecture-audit-publication`.

The public copy removes workstation paths and unrelated worktree inventory, replaces nonportable E1a filesystem links with [research source provenance](evidence/research-source-index.md), and supplies [rendered diagram artifacts](diagrams/README.md). [Publication checks](evidence/publication.json) record fresh rendering, links, privacy, static-evidence reproduction and documentation-only scope. The original 279-test result remains historical audit validation; it is not presented as a newly run publication suite.
