# Governed diagnosis review: synthetic TKT-1001 walkthrough

This walkthrough describes the lifecycle that is exercised by
`test/approval-desk-diagnostic-workflow.test.ts`. TKT-1001 and TKT-1002 are
synthetic fixtures; no external ticket, customer account, or support system is
contacted.

## Operator path

1. The customer supplies the evidence requested for the checkout-event delay:
   the affected event and request identifiers, together with the observed
   result. The recommendation records that no required evidence remains.
2. An operator approves and sends an evidence-complete update, then records the
   confirmed platform-delay diagnosis. That original diagnosis is retained as
   immutable history.
3. A human reviewer approves the diagnosis as a separate `diagnosis-reviewed`
   audit event. The review records the source ticket revision and the precise
   customer-reply watermark that it assessed.
4. Support sends a customer-safe diagnostic update. Authorizing this outbound
   text alone does not mutate ticket fields or increase ticket revision, so it
   does not create artificial stale evidence.
5. The operator selects TKT-1001 and TKT-1002 in an impact set, gives a
   reason for each selection, and applies the diagnosis-scoped mitigation.
   The service records one `fix-available` audit event per selected ticket.
   Neither ticket is silently closed.
6. Support sends a customer-safe verification request, such as asking the
   customer to check whether the affected events now appear in profile
   timelines.
7. The customer confirms recovery. That new reply makes the earlier review
   stale. Reapplying the old review to a fix is rejected; an operator records
   a revalidation using the new reply watermark.
8. Support prepares and sends the ready-to-close response. Only after this
   explicit response and a human close action does TKT-1001 become resolved.

The resulting causal audit sequence is inspectable in the Approval Desk and
through MCP reads. It includes the evidence reply, recommendation submission
and approval, immutable diagnosis, review, per-ticket fix audits, verification
response, customer confirmation, revalidation, closing response, and final
ticket update. After closure the historical diagnosis stays queryable for
the Approval Desk and MCP diagnosis reads, while its review correctly appears
stale because resolution advanced the ticket revision. Lifecycle Replay stays
a separate read-only evaluation-report snapshot view; it is not a live audit
or chronology source.

## Authority boundaries

- The deterministic domain service is the only authority for review freshness,
  diagnosis gating, impact-set validation, fix gating, and closure.
- Approval Desk routes and MCP tools are adapters: they call the same service
  and return the same governed domain outcomes.
- A diagnosis-specific fix needs an approved current diagnosis and a sent
  diagnostic response, but it does **not** wait for customer confirmation.
  Closure remains stricter: customer confirmation, the reviewed
  ready-to-close response, and an explicit close action are all required.
- Customer text is safe and operational. It does not reveal internal policy,
  confidence calculations, similarity signals, prompts, or secrets.
- GPT may assist with a draft under existing local contracts, but it neither
  approves a diagnosis nor selects an impact set, applies a fix, or closes a
  ticket.

## Scope boundary

This walkthrough proves governed diagnosis review and diagnosis-scoped fix
application. It does not add or re-prove the existing separately governed
candidate discovery, optional GPT candidate drafting, or human promotion
workflow. It also does not add a revision-aware queue-analysis layer, an
evidence-graph similarity engine, or executable/versioned knowledge-object
workflows and migration. Those remain separate capabilities with their own
governance and audit requirements.

Run the focused proof locally:

```powershell
npx vitest run test/approval-desk-diagnostic-workflow.test.ts test/demo-skill-showcase.test.ts
```

Run the broader verification before publishing a change:

```powershell
npm test
npm run build
npm run typecheck
git diff --check
```
