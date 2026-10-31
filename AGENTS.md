# Knotty agent instructions

These instructions apply across projects to implementation agents, reviewers, and
delegated agents. Include these expectations in delegated task context; delegation
does not waive them. Apply documentation requirements to software implementation
work, not to unrelated tasks or read-only questions.

## Understandability is part of done

### Code comments

- Add or update a concise documentation comment for every new or materially
  changed named function or method. Use the language's standard documentation
  convention, such as JSDoc for TypeScript. Explain purpose and observable result;
  document important input constraints, side effects, failure behavior, and
  invariants when relevant. Do not repeat names and types as boilerplate.
- Give new modules and important classes a short responsibility summary describing
  what they own and the boundary with callers and dependencies.
- Explain non-obvious decisions, ordering, transaction/recovery assumptions, and
  compatibility constraints beside the relevant code. Keep comments accurate when
  behavior changes.
- Small inline callbacks need no separate comment when their enclosing operation
  is documented. Trivial accessors and direct delegation methods may explicitly
  refer to a documented contract. Command handlers, persistence operations, and
  policy decisions still need their own meaningful explanation.

### Create and maintain the documentation foundation

- Before implementing, locate the project's instructions, README, documentation
  index, module map, and relevant design/operation notes. Reuse existing conventions
  and avoid duplicate sources of truth.
- At the first substantive implementation in a new or undocumented project,
  establish the minimum useful documentation: a README explaining purpose and
  setup/run/verification; a codebase connection map; and discoverable links between
  them. Add repository-level `AGENTS.md` with this documentation standard when
  absent so the expectations travel with the project. Preserve existing rules.
- Maintain two useful levels of maps. Default the codebase-wide connection map to
  `docs/current-architecture.md` and detailed module maps to `docs/modules/` when
  there is no established equivalent. A genuinely small project can use clearly
  named README sections. Create a documentation index when multiple documents need
  navigation, rather than empty scaffolding.
- The codebase connection map must identify its scope and inspected source version, entry points,
  important modules and their responsibilities, dependencies, state/effect owners,
  and principal execution paths. Link to the actual source and relevant tests.
  Distinguish implemented, optional, planned, and experimental behavior. Label
  partial coverage and verification limits honestly.
- Detailed module maps should cover important or materially changed modules. List
  their classes, exported functions, significant internal functions, module-level
  variables/constants, and important class fields. Explain calls, data flow, state
  ownership/mutation, dependencies, effects, errors, and related tests. Distinguish
  function calls, imports, and conceptual data flow in diagrams. Focus on symbols
  that explain behavior; incidental local variables do not need separate maps.
- Keep detailed maps separate from concise source comments. Use source links and
  generate symbol inventories when useful; label static-analysis limits. Do not
  hand-maintain an exhaustive call graph or create speculative maps of untouched
  modules. Label partial coverage and add maps as relevant modules change.
- Update the map with changes to modules, responsibility boundaries, dependencies,
  entry points, state ownership, or public contracts. Update usage/configuration
  instructions with behavior changes. Routine internal edits need no diagram churn.
- Add or update decision notes when a non-obvious choice needs lasting rationale.
  Add operation, recovery, or migration instructions when the implemented feature
  introduces those needs. Create useful documentation, not mandatory empty files.
- For ongoing projects with multiple milestones, keep one concise progress view
  (default `docs/progress.md`, or the existing tracker). Record current objective,
  task/milestone status, linked issue/PR, acceptance criteria, validation evidence,
  blockers, and next action. Distinguish local completion, open review, and merged
  delivery. Update it when the state changes; use commit/PR history for detail
  rather than copying agent transcripts or maintaining a duplicate task database.
- Preserve historical audits, pinned diagrams, research data, and result records.
  Maintain current explanations separately; never silently rewrite a historical
  baseline or present pending work as merged behavior.
- Keep this work proportional to the authorized task. Document affected areas;
  do not turn a small change into a repository-wide commenting or cleanup sweep.

## Code Review Rules

- Check documentation alongside correctness, compatibility, and tests: required
  function comments, module summaries, connection/module-map accuracy, progress status, usage changes,
  and valid links/diagrams. Missing or inaccurate documentation in changed code is
  unfinished implementation. Report concrete gaps with locations and consequences.
- For read-only reviews, report gaps without modifying files. For implementation,
  complete the relevant documentation in the same change; routine documentation
  maintenance is part of that authorized implementation.
- Before declaring completion, verify explanations against the final code and
  check documentation links and diagrams as appropriate. Documentation does not
  replace behavioral tests, and passing tests do not establish documentation quality.
- In the handoff or PR description, identify documentation updated, checks actually
  performed, and remaining limits. If a module-map update was unnecessary, say why.
- Claim the standard is satisfied only after checking it. Do not claim existing
  agents, tools, or checkouts have loaded instructions without evidence.

## Knotty documentation locations

- Codebase connection map: `docs/current-architecture.md`. Detailed module maps:
  `docs/modules/`, indexed by `docs/modules/README.md`. Progress: `docs/progress.md`.
  The documentation index is `docs/README.md`. Update these canonical locations.
- `docs/engineering-reference.md` retains setup, configuration, interfaces, and
  operation detail; its Repository Guide links to the connection map.
- Historical architecture-review reports remain pinned evidence. Preserve source
  versions, original diagrams, captures, and research results.
- Inspect the code revision in the working branch. Label open PRs and research
  overlays; document a refactor as present when it actually exists on that branch.
- Preserve human approval, deterministic policy, immutable replay, and the
  separation of operational state, governed learning, and advisory research.
