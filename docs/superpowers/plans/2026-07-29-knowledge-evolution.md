# Knowledge Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a governed, auditable knowledge-evolution loop that discovers recurring diagnoses, optionally drafts candidate known causes with GPT, and promotes only operator-approved declarative objects while preserving the shared evidence-gated lifecycle authority.

**Architecture:** Add a focused `src/knowledge-evolution/` domain/service boundary with separate candidate and approved stores, deterministic discovery, optional validated GPT drafting, and promotion audit records. Connect Approval Desk and MCP through that shared service. Extend the existing evidence-readiness decision point so ordinary tickets/events remain gated and only approved `none-required` knowledge objects can explicitly bypass missing evidence.

**Tech Stack:** TypeScript, Zod schemas, existing Node filesystem repositories, Vitest, current MCP SDK/server, existing OpenAI provider abstractions, existing Approval Desk HTTP/UI.

## Global Constraints

- GPT is advisory only; it may not assign lifecycle state, approve knowledge, or execute code.
- Candidates never affect classification, lifecycle, diagnosis, fix, or customer responses.
- Only approved declarative knowledge objects may influence future evaluations.
- `evidencePolicy: none-required` is the only knowledge-object exception to missing-evidence gating.
- Known events/outages never bypass missing required evidence by themselves.
- Approval Desk, MCP, Skill, replay, and harness paths must call the same domain services.
- Do not add an external database, vector service, or runtime dependency for the first slice.
- Preserve existing generated evaluation report changes; do not stage them as part of feature commits.
- Keep tests contract-focused; do not rewrite the existing deterministic classifier or AI-comparison harness suites.

---

### Task 1: Centralize evidence-policy lifecycle gating

**Files:**
- Modify: `src/domain.ts` (knowledge-object evidence policy types if shared at domain level)
- Modify: `src/approval-desk/evidence-readiness.ts:476-700` (`analyzeEvidenceReadiness`, `chooseSupportState`)
- Modify: `src/approval-desk/diagnostic-workflow.ts` (known-cause/platform diagnosis precedence)
- Modify: `src/approval-desk/known-cause-catalog.ts` (adapt built-in causes to explicit evidence policy)
- Test: `test/evidence-readiness.test.ts`
- Test: `test/approval-desk-diagnostic-workflow.test.ts`

**Interfaces:**
- Consume the existing `analyzeEvidenceReadiness({ ticket, outcome })` contract.
- Produce the same `EvidenceReadiness` shape, with a single authoritative state decision.
- Add an internal policy input equivalent to:

```ts
type EvidenceGate = {
  missingEvidence: readonly EvidenceRequirement[];
  bypassMissingEvidence: boolean;
};
```

- `bypassMissingEvidence` may be true only for an approved knowledge object whose evidence policy is `{ mode: "none-required" }`.

- [ ] **Step 1: Write the failing policy-matrix tests**

Add table-driven cases to `test/evidence-readiness.test.ts` covering:

```ts
[
  ["ordinary ticket with missing evidence", "needs-information"],
  ["known active event with missing evidence", "needs-information"],
  ["ordinary ticket with complete evidence", "diagnosing"],
  ["approved none-required cause", "known-cause"],
  ["approved required-evidence cause with missing evidence", "known-cause"],
  ["unapproved candidate", "needs-information"],
]
```

Assert separately that `waiting-on-platform-fix` is impossible when required evidence is missing, regardless of outage escalation or event status.

- [ ] **Step 2: Run the focused tests and verify the current precedence fails**

Run:

```powershell
npm test -- --run test/evidence-readiness.test.ts test/approval-desk-diagnostic-workflow.test.ts
```

Expected: the active-event and incomplete-evidence cases fail because the current implementation checks event status before missing evidence.

- [ ] **Step 3: Implement the minimal centralized gate**

Change `chooseSupportState` so it first computes whether missing evidence exists and whether an approved `none-required` knowledge policy authorizes bypass. Use this order:

```ts
if (missingEvidence.length > 0 && !bypassMissingEvidence) {
  return knownCause !== null ? "known-cause" : "needs-information";
}
if (approvedKnownCause !== null) return "known-cause";
if (knownEventStatus === "active" || outageEscalation) return "waiting-on-platform-fix";
if (knownEventStatus === "investigating") return "diagnosing";
return "diagnosing";
```

Keep next-step text aligned with the resulting state and ensure `diagnosisContextForTicket` does not describe an outage as confirmed while the recommendation remains evidence-gated.

- [ ] **Step 4: Run focused tests and existing lifecycle tests**

Run:

```powershell
npm test -- --run test/evidence-readiness.test.ts test/approval-desk-diagnostic-workflow.test.ts test/automatic-customer-replies.test.ts
```

Expected: PASS, including automatic evidence-request replies for any ticket whose resulting state is `needs-information` or `information-received`.

- [ ] **Step 5: Commit the invariant change**

```powershell
git add src/domain.ts src/approval-desk/evidence-readiness.ts src/approval-desk/diagnostic-workflow.ts src/approval-desk/known-cause-catalog.ts test/evidence-readiness.test.ts test/approval-desk-diagnostic-workflow.test.ts
git commit -m "fix: make lifecycle progression evidence gated"
```

### Task 2: Add first-class diagnosis and knowledge-object schemas

**Files:**
- Create: `src/knowledge-evolution/domain.ts`
- Modify: `src/domain.ts` only if shared IDs must be exported
- Test: `test/knowledge-evolution-domain.test.ts`

**Interfaces:**
- Export `KnowledgeObjectKind`, `EvidencePolicy`, `KnowledgeObject`, `KnowledgeObjectStatus`.
- Export immutable `CompletedDiagnosis` with `id`, `ticketId`, normalized problem/symptoms, evidence IDs, owner team, fix/verification steps, and `completedAt`.
- Export `KnowledgeCandidate` containing a draft object, support IDs, deterministic scores/reasons, optional GPT provenance, contradictions, and validation status.

- [ ] **Step 1: Write schema rejection tests**

Test that schemas reject blank fields, duplicate evidence IDs, unsupported article IDs, executable-looking steps, unapproved statuses in promotion input, and GPT provenance that includes raw prompt/payload text.

- [ ] **Step 2: Run the new schema tests and confirm failure**

Run:

```powershell
npm test -- --run test/knowledge-evolution-domain.test.ts
```

Expected: FAIL because the new schemas do not exist.

- [ ] **Step 3: Implement strict Zod schemas**

Implement the types from the approved spec, including:

```ts
export const EvidencePolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none-required") }).strict(),
  z.object({
    mode: z.literal("required"),
    evidenceIds: UniqueNonBlankStringsSchema.min(1),
  }).strict(),
]);
```

Validate that candidate support IDs are non-empty and that all persisted strings are bounded. Keep customer-safe text separate from operator rationale.

- [ ] **Step 4: Run schema tests and commit**

```powershell
npm test -- --run test/knowledge-evolution-domain.test.ts
git add src/knowledge-evolution/domain.ts test/knowledge-evolution-domain.test.ts
git commit -m "feat: add knowledge evolution domain contracts"
```

### Task 3: Persist diagnoses, candidates, approved objects, and knowledge audits

**Files:**
- Create: `src/knowledge-evolution/diagnosis-repository.ts`
- Create: `src/knowledge-evolution/knowledge-object-repository.ts`
- Create: `src/knowledge-evolution/knowledge-audit-repository.ts`
- Modify: `src/runtime.ts` (paths, dependencies, initialization)
- Test: `test/knowledge-evolution-repositories.test.ts`
- Test: `test/runtime.test.ts`

**Interfaces:**
- `DiagnosisRepository.save(record): Promise<void>`
- `DiagnosisRepository.list(): Promise<CompletedDiagnosis[]>`
- `KnowledgeObjectRepository.listCandidates(): Promise<KnowledgeCandidate[]>`
- `KnowledgeObjectRepository.getCandidate(id): Promise<KnowledgeCandidate>`
- `KnowledgeObjectRepository.saveCandidate(candidate): Promise<void>`
- `KnowledgeObjectRepository.promote(candidateId, approved): Promise<KnowledgeObject>`
- `KnowledgeObjectRepository.listApproved(): Promise<KnowledgeObject[]>`
- `KnowledgeAuditRepository.append(event): Promise<void>`
- `KnowledgeAuditRepository.list(filters?): Promise<KnowledgeAuditEvent[]>`

- [ ] **Step 1: Write filesystem contract tests**

Cover round-trip persistence, duplicate IDs, malformed JSON, missing roots, concurrent append serialization, and rejection of linked paths. Include a test proving candidate and approved stores are separate and that promotion preserves the candidate record.

- [ ] **Step 2: Run repository tests to verify failure**

```powershell
npm test -- --run test/knowledge-evolution-repositories.test.ts test/runtime.test.ts
```

Expected: FAIL because the repositories and runtime dependencies are absent.

- [ ] **Step 3: Implement repositories using existing safe repository patterns**

Use the same path validation and atomic-write style as `src/knowledge-repository.ts`, `src/recommendation-repository.ts`, and `src/audit-repository.ts`. Store runtime knowledge under `data/runtime/knowledge-evolution/` with distinct `diagnoses`, `candidates`, `approved`, and `audit/events.jsonl` locations.

- [ ] **Step 4: Wire runtime dependencies without changing existing callers**

Extend `RuntimeDependencies` with `knowledgeEvolution` containing the repositories and service dependencies. Keep current `knowledge` as the Markdown article repository.

- [ ] **Step 5: Run repository/runtime tests and commit**

```powershell
npm test -- --run test/knowledge-evolution-repositories.test.ts test/runtime.test.ts
git add src/knowledge-evolution src/runtime.ts test/knowledge-evolution-repositories.test.ts test/runtime.test.ts
git commit -m "feat: persist knowledge evolution records"
```

### Task 4: Build deterministic candidate discovery

**Files:**
- Create: `src/knowledge-evolution/discovery.ts`
- Modify: `src/similarity.ts` only for reusable token/score helpers if needed
- Test: `test/knowledge-evolution-discovery.test.ts`

**Interfaces:**
- `discoverCandidates(input: { ticket?: Ticket; diagnoses: CompletedDiagnosis[]; tickets: Ticket[]; approved: KnowledgeObject[] }): KnowledgeDiscoveryResult`
- `KnowledgeDiscoveryResult` includes top-K support records, a deterministic score, match reasons, support count, contradictions, and whether the candidate meets the alert threshold.

- [ ] **Step 1: Write focused discovery tests**

Cover one completed diagnosis with a strong match, two independent diagnoses producing a high-value candidate, open-ticket corroboration without promotion eligibility, contradictory evidence suppressing the alert, deterministic tie ordering, and approved objects being excluded from duplicate candidate suggestions.

- [ ] **Step 2: Run discovery tests and verify failure**

```powershell
npm test -- --run test/knowledge-evolution-discovery.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement bounded explainable scoring**

Use structured diagnosis/problem similarity first, then evidence IDs, owner/workflow, and text as lower-weight signals. Limit support to a deterministic top-K and include human-readable reasons such as `shared-evidence: request-id` and `diagnosis-similarity: 0.82`. Require at least one completed diagnosis for a candidate and two independent completed diagnoses for a high-value indicator.

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- --run test/knowledge-evolution-discovery.test.ts
git add src/knowledge-evolution/discovery.ts test/knowledge-evolution-discovery.test.ts src/similarity.ts
git commit -m "feat: discover recurring diagnosis patterns"
```

### Task 5: Add optional GPT candidate drafting and safe observability

**Files:**
- Create: `src/knowledge-evolution/candidate-draft-provider.ts`
- Create: `src/knowledge-evolution/candidate-draft-contract.ts`
- Create: `src/knowledge-evolution/candidate-draft-validation.ts`
- Modify: `src/approval-desk/controlled-evaluation-providers.ts` for deterministic controlled drafts
- Modify: existing provider wiring only where the shared runtime provider is injected
- Test: `test/knowledge-evolution-candidate-draft.test.ts`

**Interfaces:**
- `draftKnowledgeCandidate(input, provider): Promise<CandidateDraftResult>`
- `CandidateDraftResult` reports `used`, `status`, `fallbackReason`, sanitized provenance, and either a validated candidate payload or safe diagnostics.
- The provider input contains only sanitized top-K records and allowed article/evidence IDs.

- [ ] **Step 1: Write contract and provider tests**

Test valid controlled output, malformed JSON, unknown evidence/article IDs, executable-looking workflow steps, provider timeout/error, prompt-injection text in a supporting ticket, and deterministic fallback when GPT is unavailable. Assert that raw model payload and reasoning are never persisted or returned.

- [ ] **Step 2: Run tests to verify failure**

```powershell
npm test -- --run test/knowledge-evolution-candidate-draft.test.ts
```

Expected: FAIL because the candidate draft contract/provider does not exist.

- [ ] **Step 3: Implement strict parsing and validation**

Parse only the candidate schema, cross-check every evidence/article ID against the current catalogs, cap lengths, reject unsafe instructions and prompt-like metadata, and retain only a concise sanitized rationale. GPT remains optional and explicitly selected by the caller.

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- --run test/knowledge-evolution-candidate-draft.test.ts
git add src/knowledge-evolution src/approval-desk/controlled-evaluation-providers.ts test/knowledge-evolution-candidate-draft.test.ts
git commit -m "feat: add validated advisory knowledge drafting"
```

### Task 6: Implement the shared discovery, review, and promotion service

**Files:**
- Create: `src/knowledge-evolution/service.ts`
- Modify: `src/runtime.ts` (service construction)
- Modify: `src/domain.ts` only if shared audit action/type exports are needed
- Test: `test/knowledge-evolution-service.test.ts`

**Interfaces:**
- `discover(input: { ticketId?: TicketId; includeGpt: boolean; actorId: string }): Promise<KnowledgeDiscoveryResult>`
- `getCandidate(candidateId: string): Promise<KnowledgeCandidate>`
- `approve(input: { candidateId: string; actorId: string; edits?: CandidateEdits; expectedVersion: number }): Promise<KnowledgeObject>`
- `reject(input: { candidateId: string; actorId: string; reason: string; expectedVersion: number }): Promise<void>`
- `defer(input: { candidateId: string; actorId: string; expectedVersion: number }): Promise<void>`

- [ ] **Step 1: Write service contract tests**

Cover deterministic-only discovery, optional GPT invocation, candidate validation before persistence, edit validation, explicit approval, stale version rejection, duplicate promotion rejection, rejection/defer audit records, future retrieval of approved version 1, and proof that candidate status never changes lifecycle output.

- [ ] **Step 2: Run tests to verify failure**

```powershell
npm test -- --run test/knowledge-evolution-service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement orchestration and audit**

The service must load tickets, audits, diagnoses, approved objects, and articles; call deterministic discovery; optionally call GPT; persist only validated candidates; and require the caller’s actor/version for approval. Promotion creates a declarative version-1 object and an append-only audit event containing support IDs, scores, reviewed fields, provenance, and approval notes.

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- --run test/knowledge-evolution-service.test.ts
git add src/knowledge-evolution src/runtime.ts src/domain.ts test/knowledge-evolution-service.test.ts
git commit -m "feat: govern knowledge candidate promotion"
```

### Task 7: Expose equivalent MCP and Approval Desk review surfaces

**Files:**
- Modify: `src/server.ts` (four MCP tools and output schemas)
- Modify: `src/approval-desk/http.ts` (candidate list/detail/review actions)
- Modify: `src/approval-desk/ui.ts` (action-bar indicator and review panel)
- Modify: `src/approval-desk/approval-desk.ts` if route dependency adapters live there
- Test: `test/server-read.test.ts`
- Test: `test/server-actions.test.ts`
- Test: `test/approval-desk-http.test.ts`
- Test: `test/approval-desk-ui.test.ts`

**Interfaces:**
- MCP tools: `discover_knowledge_candidates`, `get_knowledge_candidate`, `approve_knowledge_candidate`, `reject_knowledge_candidate`.
- UI actions call the same service methods and pass actor ID plus expected candidate version.

- [ ] **Step 1: Write adapter parity tests**

Use the same fixture and actor input through the MCP and HTTP paths. Assert equivalent candidate IDs, scores, validation status, promotion result, and rejection behavior. Add a UI rendering test for the advisory label, support evidence, contradictions, and explicit approval gate.

- [ ] **Step 2: Run focused adapter tests to verify failure**

```powershell
npm test -- --run test/server-read.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/approval-desk-ui.test.ts
```

Expected: FAIL because the new tools/routes/panel do not exist.

- [ ] **Step 3: Implement thin adapters**

Register strict Zod input/output schemas in `server.ts`; make HTTP handlers serialize service results without applying their own policy; render deterministic reasons and sanitized GPT rationale in the panel; and require a fresh version plus explicit actor for approval.

- [ ] **Step 4: Run adapter tests and commit**

```powershell
npm test -- --run test/server-read.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/approval-desk-ui.test.ts
git add src/server.ts src/approval-desk/http.ts src/approval-desk/ui.ts src/approval-desk/approval-desk.ts test/server-read.test.ts test/server-actions.test.ts test/approval-desk-http.test.ts test/approval-desk-ui.test.ts
git commit -m "feat: expose governed knowledge review surfaces"
```

### Task 8: Add future-ticket reuse, harness coverage, and documentation

**Files:**
- Modify: `src/approval-desk/evidence-readiness.ts` (approved object lookup in evidence policy)
- Modify: `src/approval-desk/recommendation-builder.ts` (customer-safe known-cause wording only where appropriate)
- Modify: `src/approval-desk/diagnostic-evaluation-scenarios.ts` (small focused knowledge-evolution fixtures)
- Modify: `src/approval-desk/ai-comparison-evaluation.ts` only to project approved-object context, without duplicating lifecycle logic
- Create: `test/knowledge-evolution-harness.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-29-knowledge-evolution-design.md` if implementation deviations are discovered

**Interfaces:**
- Approved objects are supplied to the existing recommendation/evidence services as domain input; no direct state assignment is added to the harness.

- [ ] **Step 1: Write end-to-end contract tests**

Cover this compact journey: complete two diagnoses, discover one candidate, approve it, evaluate a new matching ticket, and verify that the new ticket uses the approved object; also verify a required-evidence approved cause remains gated and an ordinary active-outage ticket remains gated. Include one malformed GPT draft and one rejected candidate. Do not duplicate the full existing AI comparison matrix.

- [ ] **Step 2: Run the focused harness tests to verify failure**

```powershell
npm test -- --run test/knowledge-evolution-harness.test.ts
```

Expected: FAIL until approved-object lookup and harness fixtures are wired.

- [ ] **Step 3: Wire approved-object lookup into the existing evidence/diagnosis inputs**

Resolve an approved object by deterministic trigger match, pass its explicit evidence policy into the shared gate, and preserve the existing known-cause catalog behavior for built-in causes. Ensure candidate records and GPT rationale are not copied into customer drafts.

- [ ] **Step 4: Run the focused harness and the complete suite**

```powershell
npm test
npm run build
npm run typecheck
```

Expected: all existing tests plus the focused knowledge-evolution tests pass; build and typecheck complete successfully.

- [ ] **Step 5: Document the portfolio story and operator workflow**

Add a concise README section describing deterministic discovery, optional GPT advisory drafting, human promotion, evidence-policy gating, audit provenance, and the MCP/UI parity boundary. Include an example of a candidate being rejected and an approved `none-required` versus `required` cause.

- [ ] **Step 6: Commit the integrated slice**

```powershell
git add src/approval-desk/evidence-readiness.ts src/approval-desk/recommendation-builder.ts src/approval-desk/diagnostic-evaluation-scenarios.ts src/approval-desk/ai-comparison-evaluation.ts test/knowledge-evolution-harness.test.ts README.md docs/superpowers/specs/2026-07-29-knowledge-evolution-design.md
git commit -m "feat: integrate governed knowledge evolution"
```

## Verification checklist

- [ ] Focused test for each task passed before its commit.
- [ ] Generic evidence-policy matrix passes for ordinary tickets, active events, required-evidence causes, none-required causes, and candidates.
- [ ] No MCP or UI handler contains an independent lifecycle or promotion decision.
- [ ] No GPT raw payload, secret, prompt-injection text, or hidden reasoning is persisted or customer-visible.
- [ ] Candidate approval is actor-bound, version-bound, auditable, and idempotency-safe.
- [ ] Existing lifecycle replay and AI-comparison tests still pass without scenario-specific bypasses.
- [ ] `npm test`, `npm run build`, and `npm run typecheck` pass before completion.

