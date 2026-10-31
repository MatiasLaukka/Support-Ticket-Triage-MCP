# Knotty documentation

[Project overview and setup](../README.md) · [Agent standards](../AGENTS.md)

## Current engineering documentation

- [Current module map](current-architecture.md): source-grounded responsibilities,
  entry points, state ownership, execution paths, and test navigation. This is the
  maintained module inventory; its baseline and pending changes are explicit.
- [Detailed module maps](modules/README.md): functions, important state, and
  internal/external connections for covered modules, with coverage limits.
- [AR-02 lifecycle contract](ar-02-lifecycle-contract.md): preserved lifecycle
  invariants, characterization evidence, and the extraction verification matrix.
- [Progress](progress.md): current objectives, PR status, acceptance criteria,
  verification, and next actions.
- [Engineering reference](engineering-reference.md): configuration, interfaces,
  operation, safeguards, and implementation detail.
- [Security policy](../SECURITY.md): trust boundaries and limitations.
- [Knowledge evolution](knowledge-evolution.md): governed discovery, review,
  promotion, and reusable knowledge.
- [Lifecycle replay](lifecycle-replay.md): the read-only replay viewer.
- [Diagnostic evaluation guide](diagnostic-evaluation-harness.md): evaluation
  contracts and interpretation.

## Demonstrations and project context

- [Case study](case-study.md)
- [Demo walkthrough](demo-script.md)
- [Demo results](demo-results.md)
- [Capture guide](capture-guide.md)
- [Roadmap](roadmap.md)

## Historical and proposed material

The [architecture audit in PR #35](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/pull/35)
and its
[pinned module map](https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/dcd865650f3b6ed34375390561bf0c65829a23d8/docs/architecture-review/module-map.md)
record the `fe035ee` baseline. They are reference evidence, not the maintained map
of today's branch. Preserve their baselines, diagrams, and results.

Plans under `superpowers/`, historical reports, and open PRs may describe proposed
or older behavior. Check source, version labels, and the current map before
treating them as implemented architecture.
