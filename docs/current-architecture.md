# Current Knotty module map

[Documentation index](README.md) · [Detailed module maps](modules/README.md) · [Progress](progress.md) · [Engineering reference](engineering-reference.md)

Last reconciled: **2026-10-31**. Runtime source inspected at the starting PR #38
head [`cbcc590`](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/tree/cbcc590f843621b78918fc878a4594bf25caede3).
The documentation baseline commit is based on `cc42b5c`; this map follows the
implementation on PR #38, not GitHub `main`. The current documentation commits
do not change runtime source. This is a maintained map of major boundaries and
execution paths, not every function or a fresh behavioral audit. Relative source
links refer to this checkout.

This is the codebase-wide connection map. Detailed function, important-state, and
call/data-flow maps live in `docs/modules/`. Detailed coverage includes the
extracted recommendation lifecycle family and the affected TriageService
boundary, plus the foundational error/timeout boundary. Other modules remain
partially mapped as listed in the module-map index.

This is the current successor to the source inventory in the engineering
reference and the
[historical architecture audit](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/dcd865650f3b6ed34375390561bf0c65829a23d8/docs/architecture-review/module-map.md).
The audit remains pinned to `fe035ee`; its evidence and diagrams are not rewritten.

## Start here

| Question | Reading route |
| --- | --- |
| How is the application assembled? | [runtime](../src/runtime.ts), then the [MCP entry point](../src/index.ts) or [Approval Desk entry point](../src/approval-desk.ts) |
| How does an evaluation become a pending recommendation? | [evaluation command](../src/evaluation-command.ts), [AI evaluation](../src/approval-desk/ai-evaluation.ts), then [TriageService](../src/triage-service.ts) |
| Who permits and records a lifecycle change? | [policy](../src/policy.ts), [TriageService facade](../src/triage-service.ts), [recommendation command family](../src/recommendation-lifecycle.ts), [dispatcher](../src/operational-command-dispatch.ts), [unit of work](../src/operational/unit-of-work.ts), [lifecycle contract](ar-02-lifecycle-contract.md) |
| What does the operator see? | [workflow read model](../src/approval-desk/workflow-read-model.ts), [workflow guidance](../src/approval-desk/workflow-guidance.ts), [HTTP adapter](../src/approval-desk/http.ts) |
| How are retrieval and Hybrid reasoning isolated? | [retrieval observer](../src/retrieval/stage.ts), [capture boundary](../src/reasoning/hybrid-shadow-capture.ts), [shadow runner](../src/reasoning/hybrid-shadow-runner.ts) |

## Main module responsibilities

| Module or area | Responsibility and boundary |
| --- | --- |
| [index.ts](../src/index.ts), [approval-desk.ts](../src/approval-desk.ts) | Start MCP or HTTP transport; manage startup, shutdown, and safe startup errors. |
| [runtime.ts](../src/runtime.ts) | Validate environment, select persistence/providers, compose services, start learning delivery and optional retrieval, and close owned resources. |
| [errors.ts](../src/errors.ts), [timeout parsers](../src/utils/parse-openai-timeout.ts) | Foundational domain/startup error constructors and provider configuration parsing. `runtime.ts` re-exports the same `StartupConfigError` constructor for compatibility after PR #36. |
| [server.ts](../src/server.ts), [http.ts](../src/approval-desk/http.ts) | Validate transport input, call shared application commands, translate errors, and assemble responses. They do not independently authorize state changes. |
| [ui.ts](../src/approval-desk/ui.ts), [lifecycle-replay-ui.ts](../src/approval-desk/lifecycle-replay-ui.ts) | Embedded browser programs for the operator and replay views. Browser fetch/event relationships are not TypeScript import edges. |
| [evaluation-command.ts](../src/evaluation-command.ts) | Define evaluation request identity, prepare provider-assisted work outside the transaction, delegate authoritative commit/replay, and schedule optional post-commit observation. |
| [triage-service.ts](../src/triage-service.ts) | Facade owns public input validation, command-context requirements, legacy file-backed lifecycle behavior, and post-commit automatic-reply execution. Diagnosis/fix/close and evaluation families remain here. For the extracted recommendation boundary, see the [scoped map](modules/triage-service-lifecycle-boundary.md). |
| [recommendation-lifecycle.ts](../src/recommendation-lifecycle.ts), [lifecycle input contracts](../src/recommendation-lifecycle-contracts.ts) | Operational approval, reject, cancel, supersede, response-send, and combined approval/send definitions. Each command parses semantic intent, prepares inputs, validates transaction-local state in its commit callback, and projects immutable stored results on replay. The facade still validates public inputs and selects operational versus compatibility routes. |
| [operational-lifecycle-support.ts](../src/operational-lifecycle-support.ts) | Shared lifecycle policy projections, audit reconstruction, stale guards, and replay-integrity helpers used by recommendation commands and other operational lifecycle code. It owns no store or transaction. |
| [operational-command-dispatch.ts](../src/operational-command-dispatch.ts), [idempotency.ts](../src/operational/idempotency.ts) | Parse/hash semantic requests, join in-flight duplicates within a dispatcher instance, reject identity conflicts, prepare work, and transact or recover committed results. |
| [operational/sqlite-store.ts](../src/operational/sqlite-store.ts), [unit-of-work.ts](../src/operational/unit-of-work.ts), [domain.ts](../src/operational/domain.ts) | Own operational SQLite, transaction-local writes, causal events, revisions, canonical messages, traces, command receipts, and result-reference integrity. |
| [runtime-repositories.ts](../src/operational/runtime-repositories.ts), [diagnosis-audit.ts](../src/operational/diagnosis-audit.ts), [timeline.ts](../src/operational/timeline.ts) | Adapt operational reads and reconstruct audit/timeline views. Operational read adapters reject direct legacy mutation methods. |
| [domain.ts](../src/domain.ts), [policy.ts](../src/policy.ts), [evidence-catalog.ts](../src/evidence-catalog.ts) | Shared schemas/vocabulary, deterministic approval/escalation rules, and evidence requirements. Models do not override these decisions. |
| [classifier.ts](../src/approval-desk/classifier.ts), [conversation-context.ts](../src/approval-desk/conversation-context.ts), [evidence-readiness.ts](../src/approval-desk/evidence-readiness.ts) | Classify accumulated context and compute evidence readiness; do not mutate operational state. |
| [ai-evaluation.ts](../src/approval-desk/ai-evaluation.ts), [recommendation-builder.ts](../src/approval-desk/recommendation-builder.ts) | Combine deterministic classification, optional accepted model signals, workflow context, knowledge, and bounded draft construction. |
| [classification provider](../src/approval-desk/classification-reasoning-provider.ts), [draft provider](../src/approval-desk/draft-response-provider.ts), [draft contract](../src/approval-desk/draft-contract.ts), [draft guardrails](../src/approval-desk/draft-quality-guardrails.ts) | Provider boundaries and validation/fallback for advisory classification and customer drafts. Optional network calls depend on configuration. |
| [taxonomy-inference.ts](../src/taxonomy-inference.ts), [taxonomy-stage.ts](../src/taxonomy-stage.ts), [taxonomy provider](../src/taxonomy-reasoning-provider.ts), [diagnostic-taxonomy.ts](../src/diagnostic-taxonomy.ts) | Deterministic/advisory diagnostic taxonomy and its contracts. Taxonomy does not replace operational routing authority. |
| [diagnostic-state.ts](../src/approval-desk/diagnostic-state.ts), [diagnostic-workflow.ts](../src/approval-desk/diagnostic-workflow.ts), [diagnosis-review.ts](../src/approval-desk/diagnosis-review.ts) | Select and validate diagnosis/review context and stale-state conditions. Authoritative transitions remain in the service. |
| [workflow-read-model.ts](../src/approval-desk/workflow-read-model.ts), [workflow-causal-context.ts](../src/approval-desk/workflow-causal-context.ts), [lifecycle.ts](../src/approval-desk/lifecycle.ts) | Project current allowed actions and causal history. Read models do not confer approval or mutation authority. |
| [knowledge-evolution/service.ts](../src/knowledge-evolution/service.ts), [discovery.ts](../src/knowledge-evolution/discovery.ts), [reusable-context.ts](../src/knowledge-evolution/reusable-context.ts) | Discover/draft candidates, govern review/promotion/versioning, and select approved reusable knowledge under evidence and time rules. |
| [sqlite-learning-ledger.ts](../src/knowledge-evolution/sqlite-learning-ledger.ts), [sqlite-knowledge-evolution-store.ts](../src/knowledge-evolution/sqlite-knowledge-evolution-store.ts), [learning-capture.ts](../src/knowledge-evolution/learning-capture.ts) | Own learning persistence, governed object storage, and capture. Learning availability is separate from operational availability. |
| [learning-outbox.ts](../src/operational/learning-outbox.ts), [learning-delivery-runner.ts](../src/operational/learning-delivery-runner.ts) | Deliver committed operational learning events to the learning subsystem with retry/recovery. This is not a cross-database transaction. |
| [retrieval/stage.ts](../src/retrieval/stage.ts), [execution.ts](../src/retrieval/execution.ts) | Build bounded queries, refresh/search the derived index, optionally rank results, and retain bounded observation traces. |
| [retrieval/sources.ts](../src/retrieval/sources.ts), [representations.ts](../src/retrieval/representations.ts), [index-manager.ts](../src/retrieval/index-manager.ts), [sqlite-store.ts](../src/retrieval/sqlite-store.ts) | Project eligible source material, version/hash representations, maintain derived lexical/vector state, and resolve source provenance. |
| [retrieval/search.ts](../src/retrieval/search.ts), [ranking.ts](../src/retrieval/ranking.ts), [applicability.ts](../src/retrieval/applicability.ts), [applicability provider](../src/applicability-reasoning-provider.ts) | Candidate discovery, optional policy-specific ranking, and separate experimental applicability assessment. Search results and relevance are not diagnoses or approvals. |
| [hybrid-shadow-capture.ts](../src/reasoning/hybrid-shadow-capture.ts), [input-assembler.ts](../src/reasoning/input-assembler.ts) | Freeze the committed opportunity and eligible retrieval/source material across the advisory capture boundary. |
| [hybrid-shadow-runner.ts](../src/reasoning/hybrid-shadow-runner.ts), [B5 adapter](../src/reasoning/b5-hybrid-reasoning-provider.ts), [shadow repository](../src/reasoning/sqlite-shadow-run-repository.ts) | Run/recover provider-identified advisory attempts and persist immutable results in separate shadow storage. The B5 adapter rejects diagnosis mode. |
| [ticket-repository.ts](../src/ticket-repository.ts), [recommendation-repository.ts](../src/recommendation-repository.ts), [audit-repository.ts](../src/audit-repository.ts), [knowledge-repository.ts](../src/knowledge-repository.ts) | File-backed compatibility/fixture adapters and knowledge article reads. Explicit legacy paths remain supported; absence from the default startup path is not permission to remove them. |
| [demo reset](../src/demo-reset.ts), [state lease](../src/demo-state-lease.ts), [metrics](../src/metrics.ts), [scripts](../scripts/) | Scoped reset/lease safeguards, metrics, demos, import/index utilities, and evaluation entry points. Their existence does not authorize resetting live state or running paid providers. |
| [seed data](../data/seed/), [knowledge articles](../data/knowledge/), [project launch configuration](../.codex/config.toml), [triage skill](../.agents/skills/triaging-support-tickets/) | Synthetic inputs, reference content, MCP launch wiring, and the repository's human-approval workflow instructions. |

## Execution and state ownership

The following is a simplified call/data-flow diagram, not an exhaustive import
graph. Solid arrows show principal calls, dotted arrows show imports or injected
dependencies, and dashed arrows show conceptual state/data flow. Dynamic imports
and browser behavior are not fully represented.

```mermaid
flowchart TD
  MCP["MCP adapter"] --> Eval["Evaluation command"]
  HTTP["HTTP adapter"] --> Eval
  MCP --> Service["TriageService facade"]
  HTTP --> Service
  Eval --> Prepare["Deterministic evaluation and optional advisory providers"]
  Eval --> Dispatch["Dispatcher protocol"]
  Dispatch --> Unit["Operational transaction and receipts"]
  Eval --> Service
  Service --> Family["RecommendationLifecycleCommands"]
  Service --> Legacy["Legacy compatibility path"]
  Family --> Dispatch
  Family -. "imports shared projections" .-> Projections["operational-lifecycle-support"]
  Family -. "type imports" .-> Contracts["recommendation-lifecycle-contracts"]
  Service -. "type imports" .-> Contracts
  Dispatch --> Prepare["Parse semantic intent and prepare command"]
  Prepare --> Commit["Transaction: unit of work"]
  Commit --> Receipt["Persist receipt and immutable result references"]
  Receipt -. "replay reads" .-> Family
  Unit --> Op["Operational SQLite"]
  Op --> Outbox["Learning outbox and delivery"]
  Outbox --> Learning["Separate learning storage"]
  Eval -. "new successful commit" .-> Retrieval["Derived retrieval and optional ranking"]
  Retrieval -. "injected capture sink" .-> Shadow["Frozen Hybrid opportunity and shadow runs"]
```

- **Startup:** entry points call `createRuntimeDependencies`; runtime selects
  adapters and manages leases/resources. Default operational storage is SQLite;
  `legacyFixtureRepositories` explicitly retains the file-backed route.
- **Evaluation:** providers prepare advice outside the write transaction. Commit
  rechecks the captured basis and stores a pending recommendation plus its
  receipt. A completed-command replay returns persisted results without another
  provider preparation.
- **Approval and lifecycle:** service validation and transaction-local checks
  enforce approved fields, revision/reply freshness, and workflow gates. Combined
  approval/send writes ordered events and a canonical support message atomically.
  Sending is a recorded local workflow action, not an external email integration.
- **Extracted family on PR #38:** `TriageService` retains public schemas and
  command-context checks, then delegates operational approval/reject/cancel/
  supersede/send operations to `RecommendationLifecycleCommands`. Each prepared
  definition carries its operation identity, parser, prepare callback, transaction
  commit, and replay projection. Shared ticket/recommendation/audit projections
  live in `operational-lifecycle-support.ts`; typed lifecycle inputs live in
  `recommendation-lifecycle-contracts.ts`. The dispatcher owns request hashing,
  in-flight duplicate joining for its instance, receipt checks, and transaction
  entry. The unit of work owns atomic operational writes and immutable receipts.
- **Facade follow-up:** combined approval/send is one operational command. The
  facade executes any persisted automatic-reply child intent after the parent
  command returns and remains the recovery/orchestration boundary. The family
  dynamically imports automatic-reply policy code; the family map labels this
  lazy dependency. Legacy repository-backed routes remain in the facade.
- **Dispatcher scope:** runtime supplies an evaluation dispatcher, and
  `TriageService` retains its own lifecycle dispatcher. They use the operational
  store; an in-memory in-flight map is per instance, not a process-wide or
  cross-process lock. Durable command identity/result recovery lives in SQLite.
- **Readback:** immutable command-result references differ from HTTP/MCP response
  envelopes that may include freshly assembled workflow state. Event sequences,
  revisions, and canonical message references preserve causal context.
- **Automatic replies:** demonstration child intent is persisted with the parent;
  the facade executes it after the parent commit and can resume it during recovery.
- **Learning:** completed-diagnosis capture and candidate review/promotion use
  separate learning storage. The operational outbox bridges delivery; it does not
  combine the two databases into one atomic transaction.
- **Retrieval/shadow:** observation starts after a new successful evaluation
  commit and does not delay or authorize that command. Capture requires an
  injected sink. Optional provider/capture failures remain outside operational
  authority. Frozen-input reasoning and versioned shadow runs do not constitute
  an operational Hybrid diagnosis implementation.

## Verification and reading routes

These are existing test entry points, not new claims that they were executed by
this documentation change:

| Area | Tests |
| --- | --- |
| Composition and startup errors | [runtime](../test/runtime.test.ts), [entry point](../test/entrypoint.test.ts), [error identity](../test/errors.test.ts) |
| Evaluation, lifecycle and compatibility | [operational evaluation](../test/triage-operational-evaluation.test.ts), [recommendation lifecycle](../test/triage-operational-recommendation-lifecycle.test.ts), [diagnosis lifecycle](../test/triage-operational-diagnosis-lifecycle.test.ts), [runtime parity](../test/operational-runtime-parity.test.ts) |
| Recovery and replay | [dispatcher](../test/operational-command-dispatch.test.ts), [command replay](../test/reliability-command-replay.test.ts), [lifecycle replay](../test/reliability-lifecycle-replay.test.ts), [recovery](../test/operational-recovery.test.ts) |
| Policy and transports | [policy](../test/policy.test.ts), [HTTP](../test/approval-desk-http.test.ts), [MCP actions](../test/server-actions.test.ts) |
| Retrieval and isolated reasoning | [search](../test/retrieval-search.test.ts), [ranking](../test/retrieval-ranking.test.ts), [capture](../test/hybrid-shadow-capture.test.ts), [runner](../test/hybrid-shadow-runner.test.ts), [B5 adapter](../test/b5-hybrid-reasoning-provider.test.ts) |

Setup, commands, environment defaults, and operational safeguards remain in the
[root README](../README.md), [engineering reference](engineering-reference.md),
[knowledge guide](knowledge-evolution.md), and [security policy](../SECURITY.md).
Use synthetic fixtures and disposable state for verification; do not infer
permission to reset existing stores or run live model evaluations.

## Pending work, not merged architecture

Status checked on 2026-10-31. Verify GitHub and the working branch before editing
this section; it is not a permanent claim about these PRs.

| Change | Map consequence if incorporated |
| --- | --- |
| [PR #35: historical audit](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/35), open at `dcd8656` | Adds the detailed pinned audit and reproduction evidence. Keep its historical baseline separate from this maintained map. |
| [PR #37: retrieval readability](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/37), open at `931e7b8` | Clarifies `retrieval/search.ts` without intended ownership or behavior changes. Reconcile the status after review/merge. |
| [PR #38: lifecycle extraction](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/38), open draft at source head `cbcc590` when checked | The extracted modules and facade boundary described above are implemented on this branch and mapped in `docs/modules/`. PR #38 remains unmerged; this branch map does not claim they are in `main`. See the [lifecycle contract and verification matrix](ar-02-lifecycle-contract.md). |

## Maintenance convention

`AGENTS.md` defines documentation acceptance criteria. Maintain this file in the
same change as module/contract/ownership changes. Keep links from README and the
engineering-reference Repository Guide pointing here; do not reintroduce a
competing full module inventory. Keep diagrams conceptual and label omissions;
static graphs omit browser behavior, injected objects, and dynamic imports unless
explicitly analyzed. This document adds no implementation or research result.
