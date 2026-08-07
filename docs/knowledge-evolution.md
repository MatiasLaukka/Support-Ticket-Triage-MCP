# Governed Knowledge Evolution

Knowledge evolution turns completed support diagnoses into reviewable,
declarative knowledge candidates. It is deliberately a governed loop:

```text
observed evidence
  -> completed diagnosis
  -> deterministic similarity signals
  -> candidate draft
  -> operator review and policy choice
  -> strict promotion
  -> approved knowledge object
  -> later evidence-gated evaluation
```

The loop adds reusable operational knowledge without allowing GPT or a
similarity score to change a ticket on its own.

The learning plane is now backed by a durable **SQLite learning ledger** in the
runtime. It stores sanitized append-only learning events plus candidate,
immutable-version, and knowledge-audit projections. A duplicate event ID with
the same content is a no-op; the same ID with different content is rejected.
Promotion writes the approved version, promotion audit, and learning event in
one transaction. This makes the history queryable without making it a second
workflow engine.

The operational plane remains authoritative for ticket and conversation state,
classification, evidence readiness, diagnosis, fixes, verification, lifecycle
transitions, and customer-facing responses. The ledger records outcomes and
proposes future knowledge only. This is governed self-improvement, not
autonomous model retraining.

## Three evidence layers

### 1. Observed diagnosis evidence

When an operator records a completed diagnosis, the record retains both:

- `evidenceUsed`: readable reasoning for the diagnosis and its audit history;
- `evidenceReferences`: structured observations linked to IDs in the shared
  evidence catalog.

Each reference stores the catalog ID, the `labelAtDiagnosis` snapshot, a source
(`ticket`, `reply`, `knowledge`, or `operator`), and optional `sourceRef` such
as a ticket or reply audit ID. The label is historical: changing the catalog
later does not rewrite what the operator saw. A reference is recorded only
when the evidence was recognized as provided. Required-but-missing evidence,
free-form prose, and audit UUIDs do not become evidence references.

Older diagnosis files may not contain `evidenceReferences`; they load with an
empty list and remain readable. They do not silently gain a reusable policy.

### 2. Candidate evidence policy

Discovery compares completed diagnoses and open-ticket corroboration using
explainable signals such as diagnosis similarity, shared evidence, owner,
workflow, timing, and language. Open tickets can strengthen a pattern, but a
completed diagnosis is still required before a candidate is created.

The candidate draft is advisory and editable:

| Candidate mode | Meaning | Promotion |
| --- | --- | --- |
| `required` | The observed or operator-selected catalog IDs must be present | Allowed after strict validation |
| `none-required` | The operator explicitly says no extra evidence is needed and records a rationale | Allowed after strict validation |
| `undecided` | No reusable references were observed, or the policy is incomplete | Reviewable, but blocked |

Observed duplicate references may remain in diagnosis history when their
provenance differs. Candidate policy suggestions deduplicate IDs so a policy
does not ask for the same requirement twice. Operator-added IDs are recorded
separately from IDs derived from diagnoses.

GPT may draft candidate text and parameters, but its output is validated as an
advisory draft. It cannot assign lifecycle state, infer `none-required`, or
promote a candidate.

### 3. Approved evidence policy

Promotion is an explicit operator action. The service reloads the current
candidate revision and current catalog, then validates the edited policy again.
An approved object can contain only a valid `required` policy or a justified
`none-required` policy; `undecided` is never an approved state. Promotion is
atomic and records the approved fields, reviewer, supporting records, and
policy provenance in the knowledge audit.

Only approved objects participate in later evaluations. Candidates, rejected
candidates, and deferred reviews never route tickets, change evidence
readiness, or alter customer drafts. **Defer is resumable review state, not a
terminal decision**: it records the operator's pause, keeps the candidate out
of routing, and leaves the same candidate available for a later explicit
approve or reject action. Until that decision, the candidate remains a hard
workflow gate where the operator is required to review the pattern before
continuing support actions.

## Reuse paths

### Positive, evidence-backed reuse

1. Every completed supporting diagnosis records a real catalog reference such
   as `request-id`.
2. Deterministic discovery intersects those references across **all** completed
   supporting diagnoses. Only IDs shared by every diagnosis become an automatic
   `required` policy; divergent sets become `undecided` rather than a risky
   union or first-diagnosis choice. An optional GPT draft can fill in safe
   declarative wording, but cannot choose this policy.
3. An operator reviews the supporting diagnoses, edits the policy if needed,
   and approves a `required` policy.
4. A later matching ticket is recognized as the approved known cause, but it
   remains evidence-gated while `request-id` is missing.
5. After the customer provides the requirement, reevaluation resolves the
   approved policy through the shared catalog and can enter the known-cause
   workflow.

An approved `none-required` policy is the explicit exception for a sufficiently
strong, governed signal. It still requires an operator rationale and does not
make ordinary outages or lexical similarity evidence-free.

### Negative, insufficient-provenance path

A diagnosis can be valid for the original ticket while containing readable
evidence but no structured reusable references. Discovery then creates an
`undecided` candidate with a blocking validation issue. The candidate remains
visible for review, but promotion is rejected until an operator supplies a
registered policy and approves it. The original diagnosis, ticket, and audits
remain unchanged; the incomplete candidate never influences routing.

## Catalog migration and deprecated IDs

Evidence requirements live in one shared catalog used by readiness, diagnosis
recording, discovery, promotion, and known-cause execution. Catalog entries are
not deleted after use. A deprecated entry may name a replacement:

- existing approved objects containing the deprecated ID remain readable and
  executable for compatibility;
- new candidate promotion containing that ID is blocked;
- an operator must select the active replacement before promotion.

Unknown IDs are rejected before diagnosis or approval state is persisted.

## Where to inspect the flow

The Approval Desk exposes **Find pattern** for explicit discovery. The review
panel shows supporting diagnoses, evidence provenance, deterministic reasons,
and any GPT advisory provenance. The MCP and Approval Desk adapters call the
same knowledge-evolution service, so they share candidate validation,
promotion, and audit invariants.

The deterministic showcase is network-free and now proves both sides of
reuse: a future ticket remains gated before required evidence, becomes an
actionable known-cause workflow after the evidence arrives, and leaves a
pre-promotion recommendation snapshot byte-for-byte unchanged. The promoted
knowledge object is explicitly reported as version `v1`; this is not a claim of
general multi-version editing yet.

The showcase is network-free:

```powershell
npm run demo:knowledge-evolution
npm run demo:knowledge-evolution -- --verbose
npm run demo:learning-ledger
```

`demo:learning-ledger` runs the same controlled showcase with a temporary
SQLite ledger and adds the learning-plane proof: maturity advances from
diagnosis support through verified outcome and reuse, failed reuse is retained
as a contradiction signal, stale history decays without deletion, and the
historical pre-promotion recommendation remains byte-for-byte unchanged.

The first SQLite slice is intentionally scoped. Operational tickets,
conversations, recommendations, and operational JSONL audits remain on their
existing repository adapters. A later migration can move them behind the same
interfaces without changing authority or historical version pins.

For regression coverage of both reuse paths, run the focused integration tests:

```powershell
npm test -- --run test/knowledge-evolution-reuse.test.ts test/knowledge-evolution-service.test.ts
```

The diagnostic harness evaluates lifecycle and evidence gates without mutating
knowledge stores. Candidate discovery and promotion are tested through the
knowledge-evolution service and its repositories, keeping evaluation snapshots
separate from durable operator actions.
