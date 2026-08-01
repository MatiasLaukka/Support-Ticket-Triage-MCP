# Portfolio Video Script

Target length: 2–3 minutes.

This script is written for the deterministic local recording. It must not imply
that GPT was called during the recording. The project supports optional GPT
assistance, but the recorded workflow below uses local deterministic rules.

## Before Recording

From PowerShell, start with a clean environment:

```powershell
cd "D:\Documents\Support Ticket Triage MCP"
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:APPROVAL_DRAFT_PROVIDER -ErrorAction SilentlyContinue
Remove-Item Env:TRIAGE_KNOWLEDGE_CANDIDATE_PROVIDER -ErrorAction SilentlyContinue
npm run build
npm run demo:approval-desk
```

The server prints a local URL. Use synthetic tickets only and keep the browser
at that local Approval Desk page.

## 0:00–0:20 — Opening

**Screen:** README title or Approval Desk overview.

**Narration:**

> This is Support Ticket Triage MCP, a governed AI support-automation system.
> It helps classify tickets, collect evidence, draft customer responses, and
> guide diagnosis. In this recording, the recommendation and draft are produced
> by deterministic local rules. Optional GPT assistance uses the same workflow
> and approval boundary, but it is not enabled here.

## 0:20–0:55 — Core workflow

**Screen:** Select `TKT-1010` and create a recommendation.

**Narration:**

> The system reads synthetic tickets and knowledge articles, then builds an
> evidence-backed recommendation. The operator can inspect classification
> evidence, missing information, escalation requirements, and the generated
> customer response draft. The draft appears immediately when evaluation
> finishes; it is not a pre-existing reply selected from a list, and it has not
> been sent.

> Because this recording is deterministic, these results are reproducible and
> require no API key or network connection.

## 0:55–1:25 — Conversation and approval

**Screen:** Review the generated customer-response draft, approve the named
fields, and click **Done**. Show the automatic customer reply that appears in
the conversation timeline, then click **Evaluate** again.

**Narration:**

> The customer response draft is generated immediately from the current ticket
> and conversation context. I do not type or select a customer reply here.
> Conversation Context is a read-only timeline; simulated incoming replies are
> available only from the action bar's Testing mode.
> After the approved response is marked sent, the local demo adds a
> ticket-specific customer reply automatically so the next evaluation has a
> realistic lifecycle event to read.

> The next evaluation consumes that reply, recalculates evidence readiness, and
> produces the next governed recommendation instead of treating each evaluation
> as an isolated snapshot.

**Screen:** Show approval fields and the audit panel.

**Narration:**

> The important boundary is that no recommendation changes the ticket or sends
> a response without explicit human approval. The operator approves named fields,
> and the resulting transition is recorded in the local audit trail.

## 1:25–2:05 — Knowledge evolution

**Screen:** Open a second terminal and run:

```powershell
cd "D:\Documents\Support Ticket Triage MCP"
npm run demo:knowledge-evolution -- --verbose
```

**Narration:**

> The latest extension is governed knowledge evolution. Completed diagnoses are
> compared deterministically to identify reusable patterns. Open tickets can
> provide corroborating signals, but they are not treated as confirmed
> diagnoses.

**Screen:** Point to the verbose output.

**Narration:**

> Here, two completed diagnoses support the pattern, while one open ticket
> provides an early corroborating signal. Candidate-selected evidence is shown
> separately from the broader discovery support.

> The showcase uses a controlled local provider, so “GPT advisory status: used”
> means the local simulation produced a validated candidate. It does not mean a
> live OpenAI request was made.

> A human operator then explicitly promotes the candidate. The audit records
> both candidate creation and approval.

## 2:05–2:35 — Architecture and boundaries

**Screen:** README architecture diagram or source tree.

**Narration:**

> When GPT assistance is enabled, it can propose classification signals,
> customer-response wording, or a candidate knowledge object. It still cannot
> silently change a ticket, bypass evidence requirements, send a response, or
> promote knowledge.

> Deterministic contracts, lifecycle rules, evidence gates, audit trails, and
> human approval remain authoritative.

## 2:35–2:55 — Closing

**Screen:** README verification section or test output.

**Narration:**

> The project is intentionally local and synthetic, with no live Zendesk, Jira,
> email, or customer-data connector. Its focus is governed AI automation:
> clear authority boundaries, evidence-gated workflows, auditability, and
> human-approved knowledge reuse.

> The current roadmap extends this toward a richer evidence graph for emerging
> pattern detection.

## Recording Notes

- Record in short sections; do not attempt one perfect take.
- Use a large terminal font and hide unrelated windows.
- Keep the deterministic mode visible in the narrative.
- Manual customer replies are available under the action bar's Testing mode
  for edge-case testing, but do not use that control in the primary recording.
- Do not display environment variables containing secrets.
- A face camera is optional; clear narration and readable screens are enough.
- Keep the final edit under three minutes.
