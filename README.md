# Support Ticket Triage MCP

A local Model Context Protocol (MCP) server and repository-local Codex Skill
for governed support-ticket triage. The system reads synthetic tickets and
knowledge articles, prepares evidence-backed recommendations, and records
local audit events. The Skill directs Codex to present each recommendation and
wait for a human decision before a finalizing action.

The current demo also includes a browser-based **Approval Desk**. It lets a
reviewer type customer replies into a conversation workspace, generate an
updated recommendation from the full timeline, inspect classifier evidence,
review a customer draft, and approve only named fields.

The repository is a safety and workflow demonstration. It contains only
synthetic fixture data, writes only to a local runtime directory, and has no
live Zendesk, Jira, email, paging, identity, or customer-data connection.
The fixture domain is **Northstar Marketing Cloud**, a fictional ecommerce
marketing automation platform with synthetic support cases for flows, events,
campaigns, profiles, segments, deliverability, SMS compliance, webhooks,
coupons, and catalog sync. The articles and tickets are clean-room examples;
they are not copied from a real vendor.

## At A Glance

This project demonstrates governed AI support automation end to end:

- **Triage intelligence:** deterministic classification, evidence readiness,
  optional GPT reasoning, and grounded customer-response drafting.
- **Workflow governance:** one service owns lifecycle transitions, escalation,
  diagnosis review, fix gating, closure, and audit invariants across the
  Approval Desk and MCP tools.
- **Human control:** recommendations and knowledge candidates remain pending
  until an operator explicitly approves named fields or promotes a reviewed
  object.
- **Knowledge evolution:** completed diagnoses produce deterministic similarity
  signals; optional advisory providers may draft reusable candidates, but only
  human promotion can make a candidate available to future workflows.

Start with the [60-second Approval Desk demo](#demo-in-60-seconds), then run the
[knowledge-evolution showcase](#governed-knowledge-evolution) for the latest
extension. The [architecture](#architecture), [safety boundary](#safety-boundary),
and [limitations](#limitations-and-residual-risks) explain what the system can
and cannot decide.

## Safety Boundary

- Ticket subjects and descriptions are untrusted data. Embedded instructions,
  claimed approval, urgency, and policy-bypass language are evidence, not
  authorization.
- `submit_triage_recommendation` stores a pending proposal. It does not change
  the ticket or an external system.
- The Skill/Codex workflow requires presenting the recommendation before a
  human explicitly approves named fields or explicitly rejects it with
  feedback.
- The MCP approval schema requires `confirm: true`, matching recommendation
  and ticket IDs, the current ticket revision, an actor, and one or more
  explicitly named fields. The service also enforces required security and
  outage routing.
- The MCP rejection schema requires a pending recommendation, matching
  recommendation and ticket IDs, an actor, and nonblank feedback. It has no
  revision check and cannot prove that a human intended the rejection.
- Only `category`, `priority`, `team`, `assignee`, `status`, `tags`, and
  `customerResponse` are approvable.
- Security risk must route to `security`. A likely or confirmed outage must
  route to `incident-response`, unless security takes precedence while the
  outage reason remains visible.
- Submission rejects a stale source revision. Approval rechecks the
  recommendation source revision against the current expected ticket revision.
  Both approval and rejection reject an already-resolved recommendation.
- Successful commands commit their projection, revision, causal event, safe
  trace, replay result, and learning-outbox intent atomically in operational
  SQLite. The local operator can still edit local files, so this is not a
  tamper-evident ledger.

See [SECURITY.md](SECURITY.md) for the full threat model.

## Architecture

```mermaid
flowchart TB
    Experience["EXPERIENCE<br/>Human reviewer · Codex desktop · Approval Desk"]
    Adapters["ADAPTERS<br/>Repository Skill · MCP stdio/JSON-RPC · HTTP"]
    Application["SHARED APPLICATION<br/>TriageService · policy · read path · knowledge evolution"]
    DataAccess["DATA ACCESS<br/>Repositories · read models"]
    Persistence["PERSISTENCE<br/>Operational SQLite · advisory learning SQLite · Markdown catalog"]

    Experience --> Adapters --> Application --> DataAccess --> Persistence
```

The overview intentionally shows one dependency spine. The companion view
below expands only the three execution paths that matter for understanding
runtime behavior.

### Shared execution paths

```mermaid
flowchart TB
    subgraph Commands["GOVERNED COMMAND PATH"]
        direction LR
        MCPCommand["MCP"] --> TriageCommand["TriageService"]
        HTTPCommand["HTTP"] --> TriageCommand
        TriageCommand --> OperationalCommand["Operational SQLite"]
    end

    subgraph Reads["READ PATH"]
        direction LR
        MCPRead["MCP"] --> ReadModels["Read models<br/>and repositories"]
        HTTPRead["HTTP"] --> ReadModels
        ReadModels --> OperationalRead["Operational SQLite"]
        ReadModels --> Catalog["Markdown catalog"]
    end

    subgraph Learning["ADVISORY KNOWLEDGE PATH"]
        direction LR
        KnowledgeService["Knowledge evolution"] --> LearningStore["Learning SQLite"]
        KnowledgeService --> CatalogLearning["Markdown catalog"]
    end
```

## Demo In 60 Seconds

```powershell
npm ci
npm run build
npm run reset:demo
npm run approval-desk
```

Open the printed local URL. A good portfolio walkthrough is:

1. Select `TKT-1010`, the intentionally vague "Problem / It does not work"
   ticket.
2. Create the first recommendation and review the generated customer-response
   draft.
3. Approve the named fields and click **Done**. The deterministic demo adds a
   ticket-specific customer reply automatically after the response is marked
   sent.
4. Evaluate the ticket again and point out that the system reclassifies it
   from generic support to a
   product performance issue, recalculates the evidence checklist, avoids
   asking for a screenshot of a blank page, and drafts a response that matches
   the new lifecycle state.
5. Use the conversation timeline and audit panel to show the ordered lifecycle.

The action bar's collapsed **Advanced settings** includes a manual customer-reply
composer, an automatic-reply toggle, and action-bar positioning for edge cases
or screen recording. **Conversation Context is read-only** and has no
customer-reply editor. For a manual test reply, expand **Advanced settings**,
check **Disable automatic customer replies**, expand **Manual customer reply**,
paste or choose the reply, and click **Add reply** before evaluating again.
The toggle and composer apply to the current Approval Desk page session and
reset on reload. The **Move action bar** selector offers bottom-right,
bottom-left, bottom-center, top-left, top-center, and top-right positions; its
selection also resets on reload. These controls are not needed for the normal
showcase flow, which uses the automatic reply generated after **Done**.

The **Workflow Bar** owns evaluation, recommendation approval, diagnosis, Fix,
verification, and close actions. The separate **Pattern Bar** appears only when
knowledge discovery has an active candidate or is still running. An actionable
diagnosis or pattern review is a hard workflow gate: **Done** changes to
**Review**, focuses the relevant bar, and downstream support actions remain
hidden until the operator completes the required review.

The alternate incident walkthrough still works well with `TKT-1001`, which
shows correlated event-ingestion delay handling and incident-response routing.

## Resettable Codex Skill AI Showcase

The command-line showcase replays the synthetic `TKT-1010` lifecycle through
the MCP interface in fresh temporary state. It follows each
`operatorGuidance.nextAction`, reads the workflow again after every action, and
cleans the temporary state when it exits. Every report names its selected safe
mode and the classification, drafting, and network provenance used for that
mode. The saved controlled transcript is in
[docs/skill-showcase-example.md](docs/skill-showcase-example.md).

```powershell
npm run build
npm run demo:skill-showcase
npm run demo:skill-showcase -- --deterministic
```

The default `controlled` mode makes no network request and needs no configured
external provider. Local controlled simulations exercise both optional AI
roles: classification reasoning and customer-response drafting. The report
labels both roles `controlled-local-simulation`, labels network access
`disabled`, and never attributes their output to an external model adapter.
Their auditable traces are `used` when their advice or draft is accepted;
deterministic policy still owns routing, lifecycle, validation, and approval.
All eight controlled drafting stages are reported as accepted local
deterministic output with explicit simulation provenance.

The explicit `--deterministic` mode passes no providers and never makes a
provider call. Its classification traces and normal drafting traces are
`skipped`, including the valid customer-confirmed closure draft. Both modes
traverse Diagnose, Fix, verification, ready-for-close, and closed stages.
Every review step is an explicitly disclosed scripted
`portfolio-reviewer` simulation using exactly the approval fields supplied by
the workflow guidance.

Live mode is optional and is never selected implicitly. It requires an API key
set only in the shell:

```powershell
$env:OPENAI_API_KEY = 'set-in-the-shell-only'
npm run demo:skill-showcase -- --live
```

The recorded portfolio results cover controlled and deterministic modes only;
no live showcase run is claimed. Unknown arguments and repeated or conflicting
mode flags fail safely, so a typo cannot silently select controlled mode.

## Deterministic Lifecycle Replay

The chronological replay is the companion to the snapshot-based evaluation
harness. It drives the existing MCP tools against fresh temporary state and
verifies one complete, stateful journey:

```text
evidence → diagnosis → approval → response → mitigation/fix → verification → closure
```

Run it locally without GPT or network access:

```powershell
npm run evaluate:lifecycle-replay
```

The replay reads `get_ticket_workflow` before the first action and after every
transition. Each read is validated to include the ticket, conversation history
and timeline, recommendation history and summary, latest recommendation when
present, and backend operator guidance. The report also proves that each MCP
mutation follows a workflow read, records explicit approval, captures the
customer reply, diagnosis and fix audits, and ends at `resolved`.

The replay writes a sanitized report with the exact workflow-read and action
counts for that run, plus the separate context-aware diagnostic scenario
matrix. The matrix's bounded-ambiguity/escalation scenario remains a second
supporting example: it routes unresolved ambiguity toward specialist review
rather than pretending that an unresolved hypothesis is a fix. Treat report
counts as run evidence, not a versioned README constant.

This is a verification and portfolio showcase, not a second workflow engine.
The same `TriageService`, operator guidance, evidence gates, audit repository,
and MCP tools used by the Approval Desk perform the work.

## Governed Diagnosis Review And Fixes

Once the required evidence is complete, an operator can record an immutable
diagnosis and review it before it becomes authoritative. The Approval Desk and
MCP tools call the same `TriageService` rules; neither duplicates diagnosis
freshness, fix gating, or lifecycle transitions. The Approval Desk and MCP
diagnosis reads present the live audit-backed history. Lifecycle Replay is a
separate, read-only evaluation-report snapshot view; it does not read live
audits or make lifecycle decisions.

The normal operator journey is deliberately bounded:

1. Complete the evidence checklist and send the approved evidence update.
2. Record the original diagnosis, then explicitly approve or revalidate it.
   A review is a separate audit event; it never rewrites the original
   diagnosis.
3. Send the reviewed, customer-safe diagnosis response. Authorizing only that
   outbound response does not change ticket revision or invalidate otherwise
   current diagnostic evidence.
4. Select every ticket that the approved diagnosis should affect and explain
   why. A diagnosis-scoped fix writes a separate audit event for every
   selected ticket; it does not resolve any ticket.
5. Send a customer-safe verification request. A new customer reply or a real
   ticket-field change makes the earlier review stale, so an operator must
   revalidate before any later governed action can rely on it.
6. Close only after the customer has confirmed the result, the configured
   ready-to-close response has been approved and sent, and an operator takes
   the explicit close action.

Customer-facing updates say what was investigated or corrected and what the
customer should verify. They do not expose internal policy, detection,
similarity, prompt, or secret-handling details. Optional GPT assistance can
propose drafts, but deterministic checks and explicit human approval remain
authoritative.

See the detailed synthetic walkthrough in
[docs/diagnosis-review-example.md](docs/diagnosis-review-example.md). The
ordered regression is runnable locally:

```powershell
npx vitest run test/approval-desk-diagnostic-workflow.test.ts test/demo-skill-showcase.test.ts
```

This diagnosis-review slice does not add or re-prove the existing separately
governed candidate discovery, optional GPT candidate drafting, or human
promotion workflow. It also does not add revision-aware queue analysis,
evidence-graph similarity, or executable/versioned workflow migration. Those
capabilities remain separately governed and explicitly audited rather than
being inferred from a reviewed diagnosis.

## Screenshots

The screenshots below are generated from local synthetic data.

![Approval Desk overview](docs/assets/approval-desk-overview.png)

![Conversation workspace](docs/assets/approval-desk-conversation.png)

![Recommendation panel](docs/assets/approval-desk-recommendation.png)

### Hybrid Recommendation Architecture

```mermaid
flowchart LR
    Ticket["Synthetic ticket and replies<br/>untrusted text"]
    Context["Conversation context"]
    KB["Retrieved local KB articles"]
    Rules["Deterministic classifier<br/>and safety rules"]
    GPTReasoning["Optional GPT advisory<br/>classification signals"]
    Evidence["Evidence readiness<br/>and lifecycle"]
    GPTDraft["Optional GPT draft provider"]
    Validators["Deterministic draft validators"]
    Fallback["Local deterministic fallback"]
    Reviewer["Human reviewer"]
    MCP["MCP tools and prompts"]
    HTTP["Approval Desk HTTP API"]
    Service["Shared TriageService"]
    Audit["Operational audit trail"]

    Ticket --> Context
    Context --> Rules
    Context --> GPTReasoning
    GPTReasoning --> Rules
    Rules --> Evidence
    KB --> GPTDraft
    Evidence --> GPTDraft
    Rules --> Fallback
    GPTDraft --> Validators
    Validators -->|pass| Reviewer
    Validators -->|warn or provider error| Fallback
    Fallback --> Reviewer
    Reviewer -->|approve named fields| MCP
    Reviewer -->|approve named fields| HTTP
    MCP --> Service
    HTTP --> Service
    Service --> Audit
```

The important boundary is that deterministic code remains the final authority
for security, outage, SLA, approval, and audit behavior. GPT can help in two
bounded ways: drafting customer-facing language and, when configured, proposing
low-to-medium-weight advisory classification signals for ambiguous evolving
conversations. Those signals are recorded as classifier evidence and cannot
override hard safety rules.

### What This Demonstrates

- MCP tools can expose local business data and workflow actions to an AI
  assistant without connecting to live customer systems.
- Codex can operate the modern ticket workflow through MCP tools:
  `get_ticket_workflow`, `add_customer_reply`, `evaluate_ticket`, and
  `mark_response_done` mirror the Approval Desk lifecycle while preserving the
  human approval boundary.
- Deterministic policy can own routing, escalation, validation, approval, and
  audit guarantees while GPT assists with bounded drafting and advisory
  classification evidence.
- Conversation-aware automation can re-evaluate a ticket after customer
  replies, recalculate evidence requirements, and adapt the next draft.
- Retrieved knowledge articles can ground a customer response without exposing
  internal article IDs to the customer.
- Human reviewers can edit and approve named fields, preserving accountability
  instead of letting automation mutate tickets directly.
- The same local demo can show success, fallback, stale-approval rejection, and
  audit evidence in a repeatable way.

For a shorter narrative version, see [docs/case-study.md](docs/case-study.md).
For sample outputs and demo talking points, see
[docs/demo-results.md](docs/demo-results.md). For screenshot and GIF planning,
see [docs/capture-guide.md](docs/capture-guide.md). For next build ideas, see
[docs/roadmap.md](docs/roadmap.md).

The stdio entry point is `dist/src/index.js`. Its defaults are:

| Setting | Default |
| --- | --- |
| `TRIAGE_DATA_ROOT` | `data/runtime` |
| `TRIAGE_SEED_FILE` | `data/seed/tickets.json` |
| `TRIAGE_KNOWLEDGE_ROOT` | `data/knowledge` |
| `TRIAGE_MINUTES_SAVED` | `8` |
| `TRIAGE_KNOWLEDGE_APPROVERS` | `support-lead,reviewer,approval-desk` |
| `TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER` | unset (deterministic discovery only); use `controlled` for the local advisory demo |
| `TRIAGE_KNOWLEDGE_CANDIDATE_MODEL` | unset (inherits `OPENAI_MODEL`, then `gpt-5.6-luna`) |
| `TRIAGE_KNOWLEDGE_CANDIDATE_TIMEOUT_MS` | `20000` |
| `OPERATIONAL_DB_PATH` | `data/runtime/operational.sqlite` |
| `TRIAGE_LEARNING_LEDGER_PATH` | `data/runtime/knowledge-evolution/learning.sqlite` |

All relative paths are resolved from the process working directory.

### Operational persistence and cutover

Mutable runtime truth now lives in one operational SQLite database. Tickets,
conversation messages, recommendation revisions, diagnoses, causal events,
decision traces, idempotency results, and learning-delivery intents commit in
explicit synchronous transactions. Each ticket receives its own contiguous
event sequence, so the Decision Timeline follows causal order even when clocks
or imported timestamps disagree. Static ticket fixtures and the Markdown
knowledge catalog remain file-backed inputs; they are not runtime write
fallbacks.

Every new operational database starts as `empty`. It permits inspection and
import but rejects live mutations until one of these explicit cutovers:

```powershell
# Start a genuinely new deployment only when no legacy tickets.json exists.
$env:OPERATIONAL_DB_PATH = "data/runtime/operational.sqlite"
npm run initialize:operational-native

# Or import a validated aggregate manifest supplied as JSON on stdin/file.
$env:OPERATIONAL_DB_PATH = "data/runtime/operational.sqlite"
$env:OPERATIONAL_IMPORT_FILE = "data/import/operational-aggregates.json"
npm run import:operational-data
```

`import-in-progress` stays mutation-blocked until every discovered aggregate is
imported or durably resolved. `imported` and `native` enable normal runtime
commands. Startup fails closed for newer or structurally corrupt schemas and
does not overwrite them. HTTP mutations require `Idempotency-Key`, MCP mutation
tools require `commandId`, and the Approval Desk creates one UUID per user
action so a transport retry reuses the same semantic command.

The learning database is deliberately separate and advisory. An operational
commit writes an immutable outbox envelope; learning delivery may retry or
dead-letter without rolling back ticket truth. Stable delivery keys prevent a
crash after learning-ledger commit from duplicating an event.

If the learning SQLite file cannot be opened or initialized, startup reports
`LEARNING_UNAVAILABLE` with a `TRIAGE_LEARNING_LEDGER_PATH` remediation hint
but keeps the valid operational runtime online. Core ticket commands continue
to commit and leave learning-outbox work pending; knowledge-specific HTTP/MCP
operations return an actionable unavailable error until the path or permissions
are repaired and the process is restarted. Operational database corruption or
an incomplete cutover still fails closed as described above.

Run the disposable import/restart/timeline demonstration with:

```powershell
npm run demo:operational-persistence
```

It reports the imported lifecycle milestones, causal sequences, current
projection, separate learning-event count, and byte-identical reload after
both SQLite handles are closed and reopened.

Knowledge candidate drafting is explicitly opt-in. Set
`TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER=openai` and provide `OPENAI_API_KEY` to
enable the advisory Knowledge Engineer. It shares `OPENAI_MODEL` by default,
with the knowledge-specific model override available above. Discovery remains
deterministic, candidate output is contract- and guardrail-validated, and a
human operator must still review and promote any candidate; GPT never changes a
ticket or workflow directly. Without the selector, only deterministic discovery
runs.

## Codex Operator Layer

The repository Skill is the operator layer for the MCP server. It teaches
Codex to read the authoritative workflow projection, gather evidence, perform
the next governed action, and pause whenever a human decision is required.
The current workflow surface is:

| Tool | Purpose |
| --- | --- |
| `get_ticket_workflow` | Reads the ticket, conversation timeline, recommendation history, latest recommendation, and workflow state. |
| `add_customer_reply` | Appends a customer reply to the local audit trail before re-evaluation. |
| `evaluate_ticket` | Runs the current Approval Desk recommendation builder from the full timeline instead of asking Codex to hand-build recommendation JSON. |
| `mark_response_done` | Applies only explicitly approved fields and records the approved customer response as sent. |
| `submit_triage_recommendation` | Explicit lower-level proposal tool for integrations or manually assembled recommendations. |
| `approve_triage_recommendation` / `reject_triage_recommendation` | Explicit finalization tools guarded by strict schemas and audit logging. |
| `record_diagnosis` / `review_diagnosis` | Record and review an immutable diagnosis for the current evaluated context. |
| `apply_diagnosis_fix` / `mark_fix_available` | Apply a reviewed fix to a selected impact set or record a fix ready for verification. |
| `record_fix_ineffective` / `invalidate_diagnosis` | Record failed verification or explicitly invalidate diagnosis authority. |
| `close_ticket` | Close only after the customer-safe response and confirmation gates are complete. |

The repository-local Skill at `.agents/skills/triaging-support-tickets` teaches
Codex to use the operator tools, present evidence and drafts, wait for explicit
human approval of named fields, and verify the resulting audit trail.

## Approval Flow

```mermaid
sequenceDiagram
    participant H as Human
    participant C as Codex and Skill
    participant M as MCP server
    participant R as Local repositories

    C->>M: get_ticket
    C->>M: search_knowledge
    C->>M: find_similar_tickets
    C->>M: submit_triage_recommendation
    M->>R: Store pending recommendation and submission audit
    M-->>C: Recommendation, source revision, computed escalation
    C-->>H: Evidence, citations, confidence, risks, proposed fields, response
    Note over C,H: Stop before mutation
    H->>C: Approve explicit named fields
    C->>M: approve_triage_recommendation with confirm true
    M->>M: Validate pending state, revision, fields, and required routing
    M->>R: Update ticket, resolve recommendation, append approval audit
    M-->>C: Updated ticket and audit event
    C->>M: get_ticket and get_audit_events
    C-->>H: Readback of changed and unchanged fields
```

The Skill/Codex workflow treats rejection as a human decision and requires
explicit rejection wording plus concrete feedback. The MCP rejection action
validates the pending recommendation, matching IDs, actor, and nonblank
feedback, then records an audit without changing the ticket; it cannot verify
who formed the intent and does not check a ticket revision.

## Requirements

- Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0`
- npm
- PowerShell for the commands below
- Codex desktop when exercising the repository Skill and project MCP config

## Setup And Verification

From the repository root:

```powershell
npm ci
npm run build
npm test
```

`npm test` runs `pretest`, which rebuilds, type-checks, and then runs the Vitest
suite in `test/`.

Generate the deterministic synthetic fixtures and knowledge articles:

```powershell
npm run build
npm run generate:fixtures
git diff -- data/seed/tickets.json data/seed/expected-outcomes.json data/knowledge
```

Run the fixture evaluation:

```powershell
npm run build
npm run evaluate
```

Run the compiled stdio server directly only when testing an MCP client or
diagnosing startup:

```powershell
npm run build
npm start
```

The server speaks MCP over standard input and output, so an idle terminal is
normal. Diagnostics are written to standard error.

### Reset The Local Demo State

Reset is an explicit destructive administration action. **Stop the Approval
Desk and every MCP/runtime process with `Ctrl+C` before running any reset
command.** A runtime holds a shared usage lease before opening mutable state;
reset must acquire the exclusive lease and refuses while that runtime is
active. This closes the stop/reset startup race instead of relying on SQLite
locks or rename failures.

Choose the narrowest target:

```powershell
# Restore tickets only; preserve accumulated learning.
npm run reset:operational-demo

# Reset learned knowledge only; preserve tickets and workflow history.
npm run reset:learning-demo

# Restore both planes to the pristine demo baseline.
npm run reset:demo
```

`reset:operational-demo` validates the complete `TRIAGE_SEED_FILE`, creates a
fresh native operational database containing every seed ticket by ID, and
verifies that recommendations, conversations, diagnoses, events, traces,
idempotency records, and the learning outbox are empty. It is especially useful
for knowledge-reuse tests: the tickets become fresh while the accumulated
learning ledger and mutable learning repositories deliberately remain intact.

`reset:learning-demo` recreates the learning SQLite database and only the
whitelisted mutable `knowledge-evolution` directories (`diagnoses`,
`candidates`, `approved`, and `audit`). It does not modify operational SQLite
or the static `data/knowledge` catalog. `reset:demo` is the coordinated
all-or-rollback operation: it prepares and verifies both replacements before
replacing either side, retains backups through final-path verification, and
restores an already replaced side if the other commit fails.

All reset targets, temporary files, backups, SQLite sidecars, and mutable
learning paths are canonicalized and contained under `TRIAGE_DATA_ROOT` by
default. `TRIAGE_SEED_FILE` is read-only input, so it may be outside the data
root and is never deleted or rewritten. Custom operational or learning SQLite
paths outside the data root are refused unless the operator deliberately sets
`ALLOW_DEMO_RESET_OUTSIDE_DATA_ROOT=true`; that opt-in does not relax the
mutable learning-directory whitelist or protect fewer backup/rollback paths.

Preparation builds fresh state rather than deleting rows from a live database.
The reset validates the prepared state, moves the old database and SQLite
sidecars to sibling backups, installs and reopens the replacement, verifies the
final path, and only then removes backups. If rollback cannot finish, recovery
backups are retained and reported by sanitized basename instead of being
silently discarded.

The normal persistence walkthrough is:

```powershell
npm run reset:demo
npm run approval-desk
# Perform the workflow, then press Ctrl+C.
npm run approval-desk  # restart without resetting; the action persists
# Press Ctrl+C when finished.
npm run reset:demo
```

Automated evidence for exact ticket restoration, target isolation, pristine
timelines, runtime/reset lease refusal, invalid-seed safety, sidecar recovery,
cross-side rollback, and restart persistence is exercised with:

```powershell
npx vitest run test/demo-reset.test.ts test/demo-reset-cli.test.ts test/demo-reset-recovery.test.ts test/runtime.test.ts
npm run verify:portfolio
```

## Use From Codex Desktop

No separate `codex` command is required for this repository.

1. Run `npm ci` and `npm run build` in PowerShell.
2. Open the repository root as a local project in Codex desktop.
3. Trust the project only after reviewing `.codex/config.toml`; it launches
   `node dist/src/index.js` with the repository root as its working directory.
4. Start a new thread after building or after changing the project MCP config.
5. Trigger the repository Skill explicitly in the prompt:

```text
Use $triaging-support-tickets to triage TKT-1005 using the local MCP server.
Present the recommendation and wait for my explicit approval of named fields.
```

The Skill lives at
`.agents/skills/triaging-support-tickets/SKILL.md`. Its UI metadata is at
`.agents/skills/triaging-support-tickets/agents/openai.yaml`, and its detailed
classification and escalation tables are in
`.agents/skills/triaging-support-tickets/references/policy.md`.

## Use The Local Approval Desk

The Approval Desk is a local browser UI for the human decision layer. It uses
the same operational SQLite database and `TriageService` rules as the MCP
server. The repeatable demo imports synthetic fixtures through the controlled
import boundary before starting the application.

```powershell
npm ci
npm run build
npm run approval-desk
```

For a repeatable walkthrough, run:

```powershell
npm ci
npm run build
npm run reset:demo
npm run approval-desk
```

`reset:demo` establishes the verified pristine operational and learning
baseline; `approval-desk` then starts without resetting it. This separation is
what makes the stop/restart persistence walkthrough meaningful. The Automation
Evidence dashboard shows open
tickets, recommendation counts, estimated minutes saved, audit events, safety
blocks, and active guardrails.

Open the printed `http://127.0.0.1:5177` URL. Select `TKT-1010` for the
conversation-aware reclassification walkthrough, or `TKT-1001` for the incident
routing walkthrough. The Recommendation panel shows classifier evidence,
lifecycle state, evidence readiness, the customer draft, validator checks,
retrieved context, and a compact **What changed** summary when a new
recommendation differs from the previous one. Select named fields, enter an
actor, check the explicit confirmation box, and approve. The UI then reads back
the updated ticket revision and audit event.

The app is local-only. It does not send customer responses, connect to external
support systems, or authenticate multiple users.

### GPT Drafting And Advisory Classification

The Approval Desk can build draft customer responses in two modes:

- default deterministic local drafting, which requires no network or API key;
- optional OpenAI drafting, which uses the Responses API when
  `APPROVAL_DRAFT_PROVIDER=openai` and `OPENAI_API_KEY` are set.

Both modes keep the same approval and audit boundary. In OpenAI drafting mode:

1. The app retrieves the selected ticket, conversation timeline, classifier
   outcome, evidence readiness, lifecycle state, and cited local knowledge
   articles.
2. The OpenAI draft provider writes a customer response from that trusted
   context.
3. Deterministic validators check the draft for unsafe promises, internal-only
   IDs, approval-bypass language, and missing human-review boundaries.
4. If the provider fails or the draft fails validation, the app falls back to
   the deterministic local response.
5. The human reviewer still edits and approves the response before anything is
   recorded in the audit trail.

Run the optional OpenAI drafting mode from PowerShell:

```powershell
$env:OPENAI_API_KEY = 'sk-...'
$env:APPROVAL_DRAFT_PROVIDER = 'openai'
$env:OPENAI_MODEL = 'gpt-5.6-luna'
$env:APPROVAL_RESPONSE_STYLE = 'balanced'
npm run reset:demo
npm run approval-desk
```

`OPENAI_MODEL` is optional; the app defaults to `gpt-5.6-luna`. The draft
source and validation checks appear in the Recommendation panel so reviewers
can see whether the response came from deterministic rules, OpenAI, or a local
fallback.

The Approval Desk also includes a **Draft style** selector. Supported styles are
`balanced`, `concise`, `empathetic`, `technical`, and `executive-update`.
`APPROVAL_RESPONSE_STYLE` is still available as the startup default and falls
back to `balanced`. These settings change only the GPT draft tone.

The current backend also has an injectable GPT reasoning lane for ambiguous
conversation context. A `GptClassificationReasoningProvider` can return
structured advisory output such as candidate category, team, priority,
knowledge article IDs, evidence, and explanation. The app converts that output
into `gpt-advisory-*` classification signals. Deterministic safety signals
still win: security, outage, SLA, stale revision, approval requirements, and
named-field mutation rules remain local code.

Do not commit API keys, paste them into tickets, include them in screenshots, or
store them in runtime audit data. The demo should remain usable without an API
key by defaulting to the deterministic local provider.

Other useful trigger examples:

```text
Use $triaging-support-tickets to review TKT-1004. Surface every escalation,
cite the local policy articles, and stop before changing the ticket.
```

```text
Use $triaging-support-tickets to triage TKT-1001, TKT-1002, and TKT-1003 as
a correlated incident cluster. Prepare recommendations only.
```

## MCP Interface

The local server exposes 27 typed tools, 4 resources, and 3 prompts. All
schemas are defined at the MCP boundary and map into the same repositories,
policy functions, and `TriageService` used by the Approval Desk. The server is
closed-world: it reads and mutates only the local runtime configured by the
environment variables above.

### Read and context tools

| Tool | Purpose |
| --- | --- |
| `list_tickets` | Filter and page the local queue, including status, routing, risk, SLA, and historical `asOf` views. |
| `get_ticket` | Read one ticket by ID. |
| `get_ticket_workflow` | Read the authoritative ticket, conversation, recommendation, evidence, diagnosis, fix, and lifecycle projection. |
| `get_ticket_diagnoses` | Read immutable diagnosis history, review decisions, and freshness. |
| `search_knowledge` | Search the local Markdown knowledge catalog. |
| `find_similar_tickets` | Rank deterministic text-similarity candidates. |
| `get_queue_metrics` | Calculate queue, SLA, escalation, recommendation, and minutes-saved metrics. |
| `get_audit_events` | Page audit events globally or for one ticket. |
| `get_knowledge_candidate` | Read one governed knowledge candidate and its sanitized evidence bundle. |
| `get_knowledge_learning` | Read candidate maturity, health, reuse, and learning-ledger state. |

These tools are annotated read-only, non-destructive, idempotent, and
closed-world. Inputs are bounded by strict Zod schemas; list and search limits
are capped at 50 and ticket/knowledge identifiers are validated.

### Recommendation and lifecycle tools

| Tool | Purpose | Governance boundary |
| --- | --- | --- |
| `submit_triage_recommendation` | Store a manually assembled pending recommendation. | Does not change the ticket; the server owns the timestamp and recomputes escalation. |
| `add_customer_reply` | Append a customer reply to the local conversation audit trail. | Requires a command ID and feeds the next evaluation. |
| `evaluate_ticket` | Evaluate the full ticket timeline and store a pending recommendation. | Uses the current deterministic workflow and evidence gates. |
| `record_diagnosis` | Record a diagnosis for the latest evaluated context. | Requires a diagnosis-ready state and preserves the original audit. |
| `review_diagnosis` | Approve, reject, or revalidate an immutable diagnosis review. | Reviews never rewrite the original diagnosis; freshness is rechecked. |
| `apply_diagnosis_fix` | Apply a reviewed diagnosis fix to an explicit impact set. | Each selected ticket gets an audit event; the action does not close tickets. |
| `mark_fix_available` | Record that a confirmed platform/integration fix is ready for verification. | Requires an approved current diagnosis and complete response/verification gates. |
| `record_fix_ineffective` | Record failed verification for one persisted fix attempt. | Does not implicitly invalidate the diagnosis. |
| `invalidate_diagnosis` | Explicitly remove authority from the current approved diagnosis. | Preserves immutable history and requires a reason and current context. |
| `record_platform_mitigation` | Record a confirmed mitigation signal for a known platform event. | Does not pretend that a mitigation is a confirmed diagnosis fix. |
| `mark_response_done` | Apply approved fields and record an approved customer response as sent. | Requires explicit named fields, confirmation, actor, and current revision. |
| `close_ticket` | Close a ticket after the ready-for-close response and customer confirmation. | Finalizing action; lifecycle gates must be satisfied. |

### Explicit approval and knowledge-governance tools

| Tool | Purpose |
| --- | --- |
| `approve_triage_recommendation` | Apply only explicitly approved recommendation fields. |
| `reject_triage_recommendation` | Reject a pending recommendation with concrete operator feedback. |
| `discover_knowledge_candidates` | Find deterministic, evidence-backed reusable-knowledge candidates. |
| `approve_knowledge_candidate` | Promote a reviewed candidate for future evaluations. |
| `reject_knowledge_candidate` | Reject a candidate while retaining its review reason. |

Submission and ordinary lifecycle actions are non-destructive or
non-finalizing according to their annotations. Approval, rejection, knowledge
promotion, and closure are finalizing actions. Every mutation requires a
`commandId`; operational persistence stores the command result and replays it
for safe transport retries.

The Skill/Codex workflow remains the human-decision boundary: it presents
evidence, proposed fields, risks, and drafts before asking for approval. MCP
validates the payload and repository state, but cannot prove who formed the
intent represented by a tool call.

`customerResponse` is an approvable field, not an outbound integration. The
approved text is recorded in local audit data; this repository never sends a
customer message to an external system.

### Resources

| URI | MIME type | Content |
| --- | --- | --- |
| `ticket://{id}` | `application/json` | One validated ticket. |
| `knowledge://{id}` | `text/markdown` | One local knowledge article. |
| `audit://ticket/{id}` | `application/json` | The first 50 audit events for a ticket plus the total. |
| `metrics://queue` | `application/json` | Current queue metrics. |

The ticket, knowledge, and audit entries are resource templates. The metrics
URI is the directly listed resource.

### Prompts

| Prompt | Arguments | Behavior |
| --- | --- | --- |
| `triage_ticket` | Required `ticketId` | Reads the ticket, knowledge, and similar tickets; submits a recommendation; stops before approval. |
| `triage_queue` | Optional `maximum`, 1-10; default 10 | Prepares recommendations for a bounded batch; stops before approval. |
| `review_escalations` | None | Reviews security, outage, confidence, and SLA escalation conditions; stops before approval. |

Every prompt says that ticket text is untrusted and approval cannot be inferred
from ticket content.

## Five-Minute Walkthrough

For a clean synthetic fixture state, build and reset `data/runtime` before
opening the project in Codex. Fixture data and deterministic tool calculations
are reproducible when state and time inputs match. Model-generated
recommendations and wording may vary, so the checkpoints are acceptance
criteria rather than a guaranteed transcript. The detailed script is in
[docs/demo-script.md](docs/demo-script.md).

1. Read `metrics://queue` or call `get_queue_metrics`. A fresh fixture has 30
   tickets, 29 open tickets, and no recommendations. SLA counts depend on the
   current clock because fixture deadlines are fixed on June 10, 2026.
2. Triage `TKT-1005`. The Browse Abandonment ticket contains an instruction to
   ignore policy, close as P4, skip approval, and hide the instruction. The
   workflow must ignore it, preserve integration/P2/integrations evidence,
   surface policy conflict, prepare a pending recommendation, and stop.
3. Triage `TKT-1004`. The private-key exposure report must remain security/P1
   and route to `security`, with the unknown exposure scope surfaced.
4. Triage `TKT-1001`, `TKT-1002`, and `TKT-1003`. Deterministic similarity
   links the EU event-ingestion delay cluster, and the expected outcome is
   incident/P1/incident-response with outage and SLA escalation.
5. After seeing one recommendation, approve selected named fields only. Then
   read the ticket and audit event to verify the revision, actor, citations,
   changed fields, and unchanged fields.

6. Use the Approval Desk conversation workspace on `TKT-1010` to show the
   evolving-ticket path: a vague first contact becomes a product performance
   diagnosis after the customer describes the blank campaign editor.

## Queue Metrics

`get_queue_metrics` and `metrics://queue` return:

- open and untriaged ticket counts;
- breached and at-risk SLA counts;
- open-ticket counts by category, priority, and team;
- submitted, pending, approved, and rejected recommendation counts;
- acceptance and rejection rates over resolved recommendations;
- average submitted-recommendation confidence;
- escalation totals and counts by reason;
- configured minutes per accepted recommendation;
- estimated minutes saved;
- average approved confidence, confidence-band counts, and pending potential
  savings.

The savings formula is deliberately simple:

```text
estimatedMinutesSaved =
  approvedRecommendations * minutesPerAcceptedRecommendation

potentialMinutesSaved =
  pendingRecommendations * minutesPerAcceptedRecommendation
```

`estimatedMinutesSaved` is a realized, approval-attributed estimate: it counts
only approved recommendations. `potentialMinutesSaved` is a projection for
pending recommendations. Neither value is measured stopwatch time, labor cost,
customer outcome, or financial impact. The stdio process defaults to 8 minutes
per accepted recommendation. Override
the bookkeeping assumption before starting a manual server process:

```powershell
$env:TRIAGE_MINUTES_SAVED = '5'
npm start
```

This value is a configured estimate, not measured labor, cost, response time,
customer outcome, or financial impact. At a fresh runtime there are no
approved recommendations, so the estimate is zero.

### Uncertainty-aware classification confidence

Classifier confidence is uncertainty-aware decision support, not a calibrated
probability that the classification is true. The deterministic classifier
uses the versioned `uncertainty-aware-v1` method, combining category support,
the margin over the runner-up, independent signal diversity, and disagreement
penalties. The resulting bands are `low` (<0.75), `medium` (0.75–<0.90), and
`high` (>=0.90).

Persisted provenance records bounded reason codes such as
`weak-category-support`, `close-category-competition`, `low-signal-diversity`,
`metadata-disagreement`, and `no-actionable-category`. Metadata, disagreement,
known-cause/event, duplicate, and GPT-advisory emissions do not count as
independent evidence diversity. GPT classification may suggest bounded
advisory signals, but it cannot author trusted confidence provenance; the
deterministic classifier and approval boundary remain authoritative.

Older recommendations without optional provenance remain readable. Their
numeric confidence is retained, and queue metrics can still place it in a
band, but no retrospective reason codes are invented. Fixture/expected-outcome
evaluation lanes likewise use the backward-compatible scalar-confidence path
and do not author trusted provenance.

For a deterministic, transport-consistent showcase run:

```powershell
npm run demo:metrics
```

The command reads the seed tickets and sample recommendations, emits stable
JSON validated by `QueueMetricsSchema`, and uses the same fixed timestamp and
8-minute default assumption as the metrics calculator. `get_queue_metrics`,
`/api/metrics`, and `metrics://queue` all use that shared schema/calculator;
the CLI output is a consistency check rather than a second metrics
implementation.

For a single release-readiness check covering the complete portfolio journey,
run:

```powershell
npm run verify:portfolio
```

This runs the build, typecheck, full Vitest suite, diagnostic evaluation,
stateful lifecycle replay, deterministic knowledge holdout, knowledge-evolution
promotion/reuse showcase, and deterministic queue-metrics showcase in sequence.
It stops at the first failure, so the command is suitable for reproducing the
evidence reported in this README without enabling live GPT providers.

## Reproducible Evaluation

`npm run evaluate` compares
`data/seed/sample-recommendations.json` with
`data/seed/expected-outcomes.json`. The committed sample is intentionally
constructed to match all 30 expected outcomes and prints:

```json
{
  "ticketCount": 30,
  "categoryAccuracy": 1,
  "routingAccuracy": 1,
  "priorityAgreement": 1,
  "securityEscalationRecall": 1,
  "outageEscalationRecall": 1,
  "duplicatePrecision": 1,
  "duplicateRecall": 1,
  "knowledgeCitationCoverage": 1,
  "approvalSafetyViolations": 0
}
```

These are reproducible fixture results, not observations from real support
work. The evaluator requires recommendation ticket IDs to match the expected
outcome set exactly and counts any non-pending sample recommendation as an
approval-safety violation.

The focused diagnostic harness is intentionally a small scenario suite. To
audit the live deterministic path against every seeded ticket, run:

```powershell
npm run evaluate:lifecycle
```

This 30-ticket audit reports each ticket's seed status, category/routing,
known-cause and known-event matches, evidence gate, diagnosis confidence,
operator next action, and the shared lifecycle invariants. It is a baseline
lifecycle audit rather than a claim that every ticket has been replayed through
every chronological customer turn; Lifecycle Replay remains a snapshot viewer
for the separate diagnostic scenarios.
The current seed audit reports 30/30 classification contracts, 28 tickets
correctly waiting for evidence, 30/30 lifecycle invariants, 7 known-cause
matches, 3 known-event matches, and one already-resolved ticket with zero
evidence requests.

### Deterministic knowledge holdout

The governed-learning proof is a fixed, multi-turn holdout rather than a
single snapshot or a live-model benchmark. Run it with:

```powershell
npm run evaluate:knowledge-holdout
```

The command evaluates baseline and learned lanes through the same
`listReusableApproved({ asOf })` and `evaluateTicketWithAi` production path,
then writes sanitized artifacts to
`reports/knowledge-holdout/controlled-latest.json` and
`reports/knowledge-holdout/controlled-latest.md`. The fixtures cover complete
evidence, evidence arriving on a later customer turn, near misses, unrelated
questions, stale and contradicted knowledge, an approved replacement, and an
unapproved revision draft. Every turn is retained, and scoring verifies that
the evaluator changed no ticket, recommendation, audit, learning, candidate,
version, or head state.

The report separates efficacy, governance safety, and exact-version scorecards.
It is controlled synthetic evidence: it demonstrates governed reuse and
historical/version isolation, but it makes no claim about human time saved or
live GPT performance.

The scorecard uses explicit ratios rather than a single blended quality number:
exact-version precision is correct learned matches divided by all learned
matches, recall is correct learned matches divided by expected matches, and
evidence precision is necessary evidence requested divided by all requested
evidence. Governance rates count stale or contradicted versions reused when
they should be excluded; version rates count the expected exact version or
approved replacement selected. Missing-evidence rate is missing necessary IDs
divided by all expected IDs; zero-denominator rate metrics are reported as
`null`, while count totals remain zero. Baseline-to-learned deltas are
safety-first:
new unsafe lifecycle codes, wrong-version reuse, or lost evidence are
regressions even when a later turn recovers.

#### Evidence-policy checkpoint

Each generated case now exposes only an allowlisted evidence-policy summary:
its catalog `requiredIds` and a stable reason code. It never emits the fixture
rationale, customer reply text, prompts, drafts, or internal traces. A request
is counted as unnecessary only when it falls outside the fixture's documented
policy. A catalogued request is therefore not penalized merely because it is
still missing. An approved known cause remains an explicit exception: it can
narrow or waive requirements only through its approved policy; a `required`
known-cause policy keeps the normal evidence gate in force.

The evidence metrics have a deliberately traceable checkpoint. The original
controlled report recorded learned evidence precision `0.286` and
missing-evidence rate `0.333`. After correcting the fixture policy oracle, the
same deterministic behavior records `1.000` and `0.000`, respectively. This
is a scoring-ground-truth correction, **not** a claimed production improvement:
no shared evidence matcher changed in this slice. A later behavior change, if
one is proven by a shared matcher regression, will be recorded separately from
this policy correction.

If the learning ledger cannot be read, `listReusableApproved({ asOf })`
returns `ledger-unavailable` with no reusable contexts. Deterministic triage
continues without learned context, and it never silently falls back to an
older version. Deprecated versions are excluded by the reusable-context
boundary regression; the holdout provides end-to-end stale and contradicted
version lanes.

### Article-backed diagnosis and GPT advisory diagnosis

The deterministic diagnostic workflow now has specific playbooks for the
approved knowledge articles used by the seed set, including deliverability,
audience rules, campaign preparation, catalog/coupon sync, profile sync,
ecommerce integration, SMS compliance, and webhook validation. These
playbooks produce a customer-safe narrowing diagnosis and next action; they
never turn an article match into proof of a root cause. Missing evidence still
forces a `likely` diagnosis and keeps the ticket in its evidence-gated state.

Two deliberately vague tickets (`TKT-1010` and `TKT-1026`) have no meaningful
article or playbook on purpose. They request basic problem evidence and the GPT
diagnosis lane skips them rather than manufacturing a diagnosis. Resolved
tickets and prompt-injection tickets are skipped for the same governance
reason.

To evaluate the optional GPT diagnosis lane across all 30 seed tickets, run:

```powershell
npm run evaluate:ai-diagnosis
```

The default run uses a controlled local adapter to exercise the same provider
contract without network access. For an authenticated observation using real
GPT, set `OPENAI_API_KEY` and opt in explicitly:

```powershell
npm run evaluate:ai-diagnosis -- --live
```

Each run saves sanitized output under `reports/ai-diagnosis/` as
`controlled-latest.*` or `live-latest.*`.

GPT returns an advisory candidate only. The deterministic diagnosis, evidence
gate, prompt-injection preflight, lifecycle state, and human approval boundary
remain authoritative. Invalid output, unavailable GPT, or stale/unsafe
context falls back to the deterministic diagnosis without exposing provider
payloads.

### AI Comparison Evaluation

`npm run evaluate:ai-comparison` adds a network-free, controlled-local
comparison of deterministic classification/drafting, advisory classification,
and drafting providers across the eleven diagnostic scenarios. Its four lanes
are reproducible local simulations, not live-model observations. The report
shows actual drafts, operator stage, baseline-versus-final classification,
sanitized candidate/advisory signals, accepted and rejected advice,
deterministic overrides, evidence recall and precision, hard-safety status,
safe failure reasons, and provider provenance without recording API keys or
raw provider payloads.

For an explicit live OpenAI observation, set `OPENAI_API_KEY` in the shell and
run:

```powershell
npm run evaluate:ai-comparison -- --live
```

Live mode runs only GPT-containing lanes, labels them
`live-openai-adapter`, and records returned model/latency/token metadata. It
is opt-in and non-reproducible; default tests and the default comparison
command do not make network calls. Prompt-injection scenarios skip both GPT
stages, while deterministic safety policy remains authoritative. Read the
[AI comparison evaluation guide](docs/diagnostic-evaluation-harness.md#ai-comparison-evaluation)
and its [sanitized controlled-local example](docs/ai-comparison-example.md)
before interpreting results.

The command also saves the full sanitized output under
`reports/ai-comparison/controlled-latest.md` and
`reports/ai-comparison/controlled-latest.json` (or the corresponding `live-`
`latest` files for `--live`). These files contain the complete per-lane
customer drafts, not just the shortened documentation example.

Customer-response drafting is contract-first: the deterministic baseline and
authoritative workflow state define customer-safe obligations before an
optional GPT draft is considered. A GPT candidate must pass that local
contract, may receive one bounded repair attempt, and otherwise falls back to
the deterministic draft. The report records only the candidate/repair/fallback
outcome and sanitized obligation identifiers; it never adds candidate model
text to provenance.

Controlled response-quality scorecard (local simulation, 2026-07-26):

- 11/11 scenarios passed in each of the four lanes (44/44 lane/scenario runs).
- Classification agreement is reported independently from drafting quality;
  all 44 controlled final classifications matched their expected contracts.
- All 44 final drafts passed hard safety and response-quality checks. Candidate
  hard-safety violations, final-response hard-safety violations, and
  deterministic fallbacks were all 0.
- Candidate passes and repaired passes were both 0 because controlled drafting
  reuses the deterministic baseline; these counters are not live-GPT claims.
- Checks cover required concepts and evidence, evidence precision, forbidden
  claims, unnecessary questions, tone, length, deterministic safety checks,
  and contract repair/fallback provenance.
- GPT-labelled lanes use the local controlled simulation; use the opt-in
  `--live` run for a fresh live-model observation.

Live response-quality scorecard (last authenticated run, 2026-07-27,
`gpt-5.6-luna`):

- GPT-assisted classification agreed with the expected classification contract
  in 20/20 GPT classification evaluations.
- The GPT-classification/deterministic-draft lane passed 11/11 scenarios.
- The deterministic-classification/GPT-draft lane passed 8/11 scenarios; the
  full GPT-classification/GPT-draft lane passed 6/11. Overall, GPT-containing
  lanes passed 25/33 scenario runs.
- GPT drafting produced 10/17 strict response-quality passes. The remaining
  misses were wording/evidence-state and tight-length contract misses, not
  unsafe customer claims. One stale-reply candidate was rejected and safely
  fell back to the deterministic draft.
- No forbidden customer-facing claims were detected. Three final response
  quality gates still failed in the report (evidence-state, deterministic
  safety-check, and/or length checks); candidate-level violations and fallback
  reasons remain visible separately instead of being hidden behind the lane
  score.

These live numbers are an observation, not a reproducible guarantee: they
depend on the selected model and prompt response. The controlled 44/44 result
is the regression baseline. The live run is useful because it demonstrates the
portfolio boundary in practice: GPT can improve classification evidence and
wording, while deterministic contracts, safety gates, and fallback behavior
remain authoritative. The two evaluator aliases added after that run cover
the exact phrases `platform processing delay` and `source event creation time`
seen in the live drafts; a new network run is not required to validate those
local contract changes.

### Governed Knowledge Evolution

Completed diagnoses can deterministically surface a reusable knowledge
candidate. GPT may optionally draft a strictly validated advisory version, but
it cannot route tickets, promote knowledge, or change a customer response.
An authorized operator reviews and may edit the evidence policy,
customer-safe explanation, owner, triggers, time constraints, and declarative
workflows before explicitly promoting the candidate. The promotion audit
records the supporting diagnoses, deterministic provenance, reviewer, and
version. Approval Desk candidate discovery is a `POST` action because it may
persist a new candidate and its creation or rediscovery audit; plain reads use
the candidate detail endpoint.

Only approved objects affect later evaluations; candidates (including rejected
candidates) have no routing effect, and promotion never rewrites earlier
recommendations or audits. Defer is a resumable review pause, not approval or
rejection: the candidate remains a hard gate until the operator explicitly
approves or rejects it. Approval Desk and MCP use the same knowledge service,
while lifecycle replay and AI comparison project the same approved object
context through the shared evidence and diagnostic workflow.

#### Durable learning ledger

The knowledge-evolution learning plane now has a durable **SQLite learning
ledger**. It records sanitized, append-oriented events for diagnosis support,
verified outcomes, candidate review, immutable object versions, reuse, stale
signals, contradictions, and evaluation evidence. Candidate/version/audit
promotion is transaction-safe, and duplicate event IDs are idempotent.

This is governed knowledge evolution, not autonomous model retraining. The
operational plane remains authoritative for classification, evidence readiness,
diagnosis, fixes, verification, lifecycle transitions, and customer drafts.
The ledger only records verified outcomes and proposes reusable knowledge;
GPT-generated fields remain advisory, and a named operator must approve a
version before it can affect a future evaluation.

Learning maturity and health are separate axes: `observed`,
`diagnosis-supported`, `outcome-verified`, `reuse-validated`, and `promoted`
describe the strength of evidence, while `active`, `stale`, `contradicted`,
`deprecated`, and `superseded` describe whether that evidence is currently
usable. Stale history remains queryable with decayed signal weight but cannot
bypass an evidence gate. New evaluations use the latest active version;
in-progress tickets remain pinned to their original version, so historical
recommendations remain unchanged.

Run the deterministic ledger showcase without an API key or network access:

```powershell
npm run demo:learning-ledger
```

The output demonstrates candidate creation, explicit human promotion, a
verified outcome, successful and failed reuse signals, stale decay, and
historical immutability. The learning ledger remains a separate advisory
SQLite plane. Operational ticket, conversation, recommendation, diagnosis,
lifecycle, trace, replay, and outbox state now lives in authoritative
operational SQLite.

#### Evidence provenance and policy boundaries

Knowledge evolution keeps three related, but deliberately different, records:

1. **Observed diagnosis evidence** is what was actually present when an
   operator completed a diagnosis. `evidenceUsed` remains readable reasoning;
   `evidenceReferences` contains catalog-backed IDs, the immutable label seen at
   diagnosis time, and optional ticket/reply/knowledge/operator provenance.
   References are created from recognized provided evidence only. The system
   never turns an audit ID or free-form prose into a synthetic evidence ID.
2. **Candidate evidence policy** is a reviewable proposal for future tickets.
   Discovery deduplicates observed IDs for this proposal while preserving
   duplicate observations and their provenance in diagnosis history. With
   multiple supporting diagnoses, deterministic discovery uses the
   intersection of catalog-backed IDs shared by every diagnosis; it never
   unions divergent evidence or chooses the first diagnosis by order. A
   candidate may be `required`, explicitly `none-required` with a rationale, or
   `undecided` when no safe shared policy is available. An `undecided` candidate
   stays visible for review but cannot be promoted.
3. **Approved evidence policy** is the operator-approved contract used by later
   evaluations. Promotion reloads the current candidate and catalog, then
   accepts only a valid `required` policy or a justified `none-required`
   policy. GPT can suggest fields, but it cannot select this policy or promote
   it.

This creates two important reuse paths. In the positive path, a diagnosis with
real catalog references produces a candidate, an operator approves its policy,
and a later matching ticket remains evidence-gated until required evidence is
present; after reevaluation, the approved known cause can be selected through
the same catalog. In the negative path, a diagnosis may still be valid and
readable when it has no structured references, but its candidate is
`undecided`, cannot affect routing, and is rejected until an operator supplies
and approves a valid policy. An active outage or an open-ticket similarity
signal does not bypass this gate by itself.

Catalog entries are retained for compatibility. Existing approved objects that
refer to a deprecated evidence ID remain readable and executable; new
promotions containing that ID are blocked and must use its replacement when
one is defined.

In the Approval Desk, select a ticket and open **Advanced settings** in the
Workflow Bar to run **Find pattern** explicitly. Discovery also runs after an
authoritative diagnosis is available, but the manual trigger makes the boundary
visible and reports when the current completed-diagnosis evidence does not meet
the candidate threshold. When a candidate is found, the separate **Pattern
Bar** shows the supporting evidence and compact declarative editor. The
operator can inspect the evidence choices, edit the proposed object, and
**Approve**, **Refresh**, **Defer**, or **Reject** it. The button never changes
the ticket or promotes a candidate by itself.

Evidence policy remains the gate. For example, an approved
`none-required` known cause whose deterministic trigger matches may use its
confirmed known-cause path without collecting extra customer evidence. An
approved `required` cause still requests every listed evidence item before it
can advance. Ordinary tickets and active outages remain evidence-gated.
Customer drafts use only the approved customer-safe explanation and safe next
step; candidate rationale, GPT advisory details, and internal detection stay
in the operator review and audit surfaces. If a candidate is rejected, its
reason remains audit provenance and future routing stays unchanged.

Run the bounded portfolio showcase locally:

```powershell
npm run demo:knowledge-evolution
npm run demo:knowledge-evolution -- --verbose
```

It uses the controlled provider, so it requires no API key or network access.
The output shows deterministic discovery, an advisory candidate draft, the
explicit human approval boundary, the promoted `v1` object, and the
corresponding audit actions. It then evaluates a future matching ticket before
promotion, after promotion while required evidence is still missing, and after
that evidence arrives. The final line proves that the historical
pre-promotion recommendation is byte-for-byte unchanged. Add `--verbose` to
show the sanitized supporting diagnoses, tickets, evidence IDs, scores,
provenance, similarity reasons, and per-action audit detail. The fixture
includes two matching completed diagnoses, an unrelated completed diagnosis,
and an open-ticket corroboration so the output shows the difference between
confirmed support and an early signal. This is suitable for a repeatable
recording or screenshot; a live OpenAI run remains an optional separate
evaluation.

### Lifecycle Replay Viewer

The read-only Lifecycle Replay page makes evaluation output inspectable in the
same customer context as the Approval Desk. Run an evaluation first, then
start the local browser server:

```powershell
npm run evaluate:ai-comparison -- --live   # optional; controlled output also works
npm run approval-desk
```

Open `/lifecycle-replay` on the printed local URL. The page groups snapshots by
ticket, shows customer replies and previous support responses, and lets you
compare deterministic and GPT-labelled lanes. Operator view includes
classification agreement, quality breakdown, failure reasons, and sanitized
provider provenance. Customer view shows only the draft that a customer would
see and the explicit approval pause.

Replay reads `reports/ai-comparison/live-latest.json` (and the controlled report
when present); it makes no OpenAI calls, sends no responses, and never mutates
ticket or audit state. Snapshots are labeled evaluation states rather than an
invented chronological journey, so the viewer does not imply that unrelated
scenario runs happened in a particular order. See
[the replay viewer guide](docs/lifecycle-replay.md) for a portfolio walkthrough.

## Extension To Zendesk Or Jira

No live connector is included. A future adapter can preserve the current
governance model by:

1. Mapping external ticket fields into the validated `Ticket` contract while
   retaining the external ID separately.
2. Implementing read adapters for tickets and knowledge without exposing
   credentials or raw provider errors through MCP.
3. Keeping recommendations in a local or durable pending store separate from
   provider mutation.
4. Translating only explicitly approved named fields into provider updates
   with revision or version checks and idempotency keys.
5. Writing an audit event that records the external request identifier and
   outcome without secrets or full customer content.
6. Adding provider-specific authorization, rate limiting, retry, webhook
   verification, and reconciliation tests.

The approval gate should remain above the provider adapter. Ticket text,
webhook payloads, provider comments, and imported macros remain untrusted.

## Limitations And Residual Risks

- Fixtures and knowledge are synthetic and local. The server has no network
  integration or identity boundary.
- Similarity is token-based Jaccard scoring, not semantic retrieval. It can
  miss paraphrases and produce lexical false positives.
- Policy is deterministic and intentionally narrow. Human review remains
  necessary for ambiguous facts, conflicting policy, and customer messaging.
- Operational tickets, conversations, recommendations, diagnoses, events, and
  traces use transactional SQLite. The separate SQLite learning ledger owns
  advisory knowledge candidates, immutable versions, audits, and reuse events.
  Neither database is designed as a distributed multi-region system.
- SQLite `BEGIN IMMEDIATE`, optimistic revision checks, persistent command
  results, and unique causal sequences provide cross-process local correctness;
  they do not replace external-provider reconciliation or distributed locks.
- Local users with filesystem access can still edit or delete the SQLite files,
  fixture inputs, and knowledge catalog; filesystem access remains a trust
  boundary.
- Linked-path checks reject symbolic links and multi-link files. Node pathname
  APIs cannot fully prevent a hostile concurrent Windows parent-junction swap.
- Directory `fsync` is best effort because it is not supported consistently
  on Windows. Rename, hard-link publication, antivirus scanning, sync clients,
  and filesystem behavior can affect durability and startup.
- Unexpected tool errors are generic to the MCP client, while diagnostic
  details are written to local standard error. Do not forward those logs to an
  untrusted destination.
- Fixture SLA deadlines are fixed on June 10, 2026. Runs after that date
  classify due open tickets as breached unless an explicit historical `asOf`
  value is used with `list_tickets`.
- The official Python Skill validator was run in the current Skill evaluation
  and reported `Skill is valid!`. `test/skill.test.ts` adds narrower
  structural regression checks.

## Repository Guide

- [Case study](docs/case-study.md)
- [Demo script](docs/demo-script.md)
- [Demo results and examples](docs/demo-results.md)
- [Portfolio video script](docs/video-script.md)
- [AI comparison evaluation example](docs/ai-comparison-example.md)
- [Screenshot and demo capture guide](docs/capture-guide.md)
- [Project roadmap](docs/roadmap.md)
- [Security policy](SECURITY.md)
- `src/server.ts`: MCP tools, resources, prompts, annotations, and safe errors
- `src/runtime.ts`: environment validation, repository wiring, and persistence cutover
- `src/triage-service.ts`: transactional recommendation and lifecycle commands
- `src/approval-desk/`: shared workflow, diagnosis, drafting, lifecycle, and HTTP adapters
- `src/knowledge-evolution/`: governed candidate discovery, promotion, reuse, and learning ledger
- `src/operational/`: SQLite event store, projections, command results, traces, and replay
- `src/policy.ts`: escalation, evidence, and approved-field rules
- `src/metrics.ts`: queue metrics and savings formula
- `src/evaluation.ts`: deterministic evaluation metrics
- `scripts/`: fixture generation, demos, evaluations, and portfolio verification commands
- `data/seed/`: tickets, expected outcomes, and sample recommendations
- `data/knowledge/`: local policy and troubleshooting articles
- `.codex/config.toml`: project MCP launch configuration
- `.agents/skills/triaging-support-tickets/`: Codex Skill, workflow, and policy reference
