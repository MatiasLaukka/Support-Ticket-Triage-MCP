# Knowledge Evolution Design

**Status:** Draft for review  
**Date:** 2026-07-29

## 1. Purpose

The support system should turn high-quality, completed diagnoses into reusable operational knowledge without giving GPT authority to change live ticket routing. The first slice introduces a governed loop:

```text
completed diagnoses + corroborating tickets
    -> deterministic pattern discovery
    -> optional GPT candidate draft
    -> validation and operator review
    -> approved, versioned knowledge object
    -> future evaluations use the approved workflow
```

This extends the existing governed triage and diagnostic architecture. It does not replace the canonical lifecycle engine, evidence-readiness rules, or human approval boundaries.

## 2. Goals

- Make structured diagnoses reusable and discoverable.
- Detect recurring patterns deterministically before invoking GPT.
- Let GPT draft a candidate knowledge object from sanitized supporting evidence.
- Keep candidate knowledge advisory and isolated from live ticket decisions.
- Require explicit human review before promotion.
- Store promoted objects as versioned, declarative workflows with provenance.
- Give Approval Desk and MCP/Skill callers equivalent discovery and promotion outcomes.
- Preserve a single authoritative implementation for lifecycle transitions, diagnosis/fix gates, evidence rules, and workflow invariants.

## 3. Non-goals for the first slice

- GPT may not create, edit, promote, or execute a knowledge object by itself.
- No arbitrary code, scripts, expressions, or network actions may be stored in a knowledge object.
- No vector database or external service is required; the existing bounded deterministic similarity implementation is the initial prefilter.
- Do not build playbook auto-evolution, clustering dashboards, or automatic promotion in this slice.
- Do not silently rewrite an already-issued recommendation when a new knowledge object is promoted.
- Do not expose internal prompt-injection detection, raw model reasoning, or backend implementation details to customers.

## 4. Authority and safety model

There are three distinct knowledge statuses:

1. **Candidate** — advisory, reviewable, and never used for lifecycle routing.
2. **Approved** — promoted by an operator into the local knowledge store and eligible for future evaluations.
3. **Superseded/rejected** — retained for provenance but inactive.

The deterministic domain services remain authoritative for ticket outcomes. GPT is used only when explicitly enabled for candidate drafting and returns a strict structured payload. A validator rejects malformed, unsupported, unsafe, or non-declarative content before it can reach the review panel.

The same shared knowledge-evolution service is called by the UI, MCP tools, and Skill workflow. Adapters may format responses, but they must not duplicate discovery, validation, promotion, or lifecycle policy.

## 5. Knowledge object model

The persistence envelope is future-proofed for additional object kinds, but only `known-cause` is enabled initially.

```ts
type KnowledgeObjectKind = "known-cause";

type EvidencePolicy =
  | { mode: "none-required" }
  | { mode: "required"; evidenceIds: string[] };

type KnowledgeObject = {
  id: string;
  kind: KnowledgeObjectKind;
  name: string;
  summary: string;
  triggerPatterns: string[];
  evidencePolicy: EvidencePolicy;
  timeConstraints?: { timezone?: string; windows?: string[] };
  diagnosticSteps: string[];
  fixSteps: string[];
  verificationSteps: string[];
  customerSafeExplanation: string;
  ownerTeam: string;
  supportingDiagnosisIds: string[];
  supportingTicketIds: string[];
  version: number;
  status: "candidate" | "approved" | "rejected" | "superseded";
  provenance: {
    createdBy: "operator" | "gpt" | "system";
    model?: string;
    promptVersion?: string;
    discoveredAt: string;
  };
  approval?: { actorId: string; approvedAt: string; notes?: string };
};
```

Promoted objects are declarative data interpreted by existing governed services. They cannot bypass approval or introduce executable behavior.

### Evidence policy and lifecycle exception

An approved known cause is not automatically permission to skip evidence. Its explicit `evidencePolicy` controls the exception:

- `none-required`: the cause is sufficiently identified by its governed trigger and may enter its confirmed known-cause path without additional customer evidence.
- `required`: the listed evidence remains a gate; the ticket may be associated with the known-cause workflow, but confirmation, diagnosis completion, fix execution, or platform-fix waiting cannot advance while required evidence is missing.

Candidates, ordinary tickets, and known events/outages never bypass evidence requirements.

## 6. Evidence-gated lifecycle invariant

The lifecycle engine must evaluate evidence policy before event or outage hints. The generic policy matrix is:

| Context | Missing required evidence | Allowed outcome |
| --- | --- | --- |
| Ordinary ticket | Yes | `needs-information` or `information-received` |
| Known event/outage | Yes | Still evidence-gated; do not enter platform-fix waiting |
| Ordinary ticket | No | Normal diagnosing or confirmed-event path |
| Approved known cause with `none-required` | N/A | Confirmed known-cause path may proceed |
| Approved known cause with `required` | Yes | Known-cause workflow remains gated; no confirmation/fix advance |
| Unapproved candidate | Any | No lifecycle effect |

This is a policy invariant, not a fixture-specific exception. TKT-1001 and TKT-1003 remain useful representative regression fixtures, but tests must exercise the matrix across generic tickets, events, causes, and evidence policies.

Exactly one implementation owns this rule and all diagnostic-state transitions. Approval Desk routes, MCP tools, Skill tools, replay views, and harnesses consume its result.

## 7. Discovery pipeline

### 7.1 Structured diagnosis records

Completed diagnoses become first-class records containing the normalized problem, observed symptoms, evidence collected, outcome, owner, fix/verification steps, and source ticket. They are immutable after completion; corrections create a new version or linked record.

Open tickets may corroborate a pattern, but do not establish an authoritative cause by themselves. A strong candidate should normally have at least one completed diagnosis, preferably two independent completed diagnoses, before a high-value alert is shown.

### 7.2 Deterministic prefilter

The existing similarity service performs a bounded top-K comparison using available structured and textual signals:

- normalized diagnosis/problem and symptom terms;
- owner/team and category;
- known-cause or event identifiers;
- required evidence IDs;
- knowledge articles and workflow steps;
- time constraints;
- ticket language as a lower-weight fallback.

The result records a deterministic score and the reasons for the match. It is explainable, bounded, and available without a network call.

### 7.3 GPT candidate drafting

GPT is invoked only when the operator or an explicit discovery operation enables it and the deterministic prefilter finds enough support. The model receives sanitized top-K records, not unrestricted ticket history or secrets. Its output is limited to a schema containing:

- candidate object fields;
- confidence and concise rationale;
- supporting record IDs;
- contradictions or missing evidence;
- suggested evidence policy.

The model must not assign lifecycle state, approve the object, invent unsupported evidence/article IDs, or emit executable instructions. Safe parsing and validation produce observable rejection diagnostics for malformed responses.

## 8. Persistence and audit

- Built-in canonical causes remain source-controlled definitions.
- Promoted objects are stored in a local runtime knowledge store separate from candidates.
- Candidates are stored separately and may be edited, rejected, deferred, or superseded.
- Promotion creates version 1 and an append-only audit event containing actor, source IDs, deterministic scores, GPT provenance, reviewed fields, and approval notes.
- Later versions record the superseding relationship and the exact changed fields.
- Promotion affects future evaluations only; existing recommendations and audit records remain unchanged.

## 9. Operator experience

The Approval Desk action bar may show a non-blocking “Potential knowledge pattern” indicator when deterministic thresholds, support-count requirements, and validation checks are satisfied. A newly discovered high-value candidate may receive a one-time visual emphasis; repeated evaluations must not create alert fatigue.

The review panel displays:

- the proposed object fields and evidence policy;
- deterministic similarity score and match reasons;
- GPT confidence and concise rationale, clearly labelled advisory;
- supporting completed diagnoses and corroborating open tickets;
- highlighted shared terms and structured fields;
- contradictions, missing evidence, and validation warnings;
- the resulting declarative workflow and customer-safe explanation.

The operator can edit, approve, reject, or defer. Approval is an explicit gate and records the actor. The panel must make it clear that approving a knowledge object changes future routing, not historical tickets.

## 10. MCP and Skill surface

The shared service exposes bounded operations equivalent to the UI:

- `discover_knowledge_candidates` — deterministic discovery with optional GPT drafting;
- `get_knowledge_candidate` — retrieve a candidate and its evidence bundle;
- `approve_knowledge_candidate` — validate and promote after explicit actor approval;
- `reject_knowledge_candidate` — record a governed rejection reason.

The Skill workflow presents evidence and approval fields at evaluation milestones. GPT rationale is advisory context for the operator, never an instruction to the agent. The agent follows the authoritative diagnosis engine, evidence readiness, and workflow gates.

## 11. Verification and acceptance criteria

The first implementation is complete when:

1. Structured completed diagnoses can be persisted and retrieved with provenance.
2. Deterministic top-K discovery returns explainable scores and support IDs.
3. GPT drafting is optional, schema-validated, sanitized, and auditable.
4. Candidates cannot affect classification, lifecycle state, diagnosis, fix, or customer responses.
5. Operators can review, edit, approve, reject, and defer candidates through the Approval Desk.
6. MCP and UI calls produce equivalent domain outcomes for the same actor and inputs.
7. Promotion creates a versioned declarative known cause and an audit record.
8. Future evaluations can use approved objects without changing historical recommendations.
9. A generic evidence-policy test matrix proves that ordinary tickets and known events remain evidence-gated, while only an approved `none-required` knowledge object may bypass that gate.
10. Tests cover malformed GPT output, unsupported IDs, contradictory evidence, stale approvals, duplicate promotion, and unauthorized promotion.
11. Documentation explains the discovery-to-promotion loop and its authority boundaries.

## 12. Suggested implementation slices

1. Domain models, immutable diagnosis records, evidence-policy type, and shared lifecycle invariant.
2. Local candidate/approved stores plus append-only audit events.
3. Deterministic discovery and explainable top-K matching.
4. Optional GPT drafting, strict parsing, validation, and observability.
5. Shared service adapters for Approval Desk, MCP, and Skill.
6. Review panel and action-bar indicator.
7. Harness scenarios for completed diagnoses, open-ticket corroboration, malformed drafts, approval, promotion, and future-ticket reuse.

The implementation should proceed slice-by-slice with tests written before behavior changes and with the existing lifecycle replay and AI comparison harnesses retained as consumers of the same domain services.

## 13. Open decisions for implementation planning

- Exact local storage format and locking strategy for candidates and promoted objects.
- Initial deterministic similarity weights and alert thresholds.
- Actor identity shape for UI, MCP, and Skill approvals.
- Whether the first review panel is embedded in the existing Approval Desk route or introduced as a dedicated route.
- The minimum number of completed diagnoses required for each alert severity.

