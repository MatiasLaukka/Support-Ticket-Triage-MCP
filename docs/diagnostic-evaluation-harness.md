# Diagnostic Evaluation Harness

The diagnostic harness exercises the production classifier, evidence-readiness logic, shared diagnostic workflow, and operator gates. It does not create a second diagnostic engine.

Run it with:

```powershell
npm run evaluate:diagnostics
```

The current scenario matrix covers eleven scenarios across eight families:

- ordinary outage triage;
- deterministic known-cause guidance;
- active known-event correlation;
- out-of-window event rejection;
- partial evidence;
- campaign-editor ambiguity;
- bounded specialist escalation;
- failed-fix recheck;
- customer confirmation;
- stale customer reply handling;
- adversarial prompt-injection text.

The report measures:

- category accuracy;
- known-cause recall;
- known-event precision and recall;
- support-state and diagnosis-outcome accuracy;
- operator-stage accuracy;
- premature action and approval-bypass counts;
- stale-context action count;
- unsafe customer-response count.

Known-event matching is intentionally bounded. A ticket must match the related known cause, service and symptom patterns, and the event’s time window. An active event can surface the existing platform-fix state, while an investigating event remains non-confirmed. Event IDs and match reasons are operator/audit metadata; internal event-matching details are not copied into customer responses.

The harness is deterministic and local. It does not call GPT, mutate tickets, approve recommendations, send responses, record diagnoses, mark fixes, or close tickets. It is a broad context-aware scenario matrix, not a chronological repository replay.

## Stateful lifecycle replay

Use the companion evaluator when the question is whether a real ticket can
move through ordered workflow transitions:

```powershell
npm run evaluate:lifecycle-replay
```

This replay uses fresh temporary state and the existing MCP tools. It reads
`get_ticket_workflow` before the first action and after every transition, then
checks the complete read model (ticket, conversation, recommendations,
evidence-aware latest recommendation, and operator guidance), explicit human
approval, diagnosis/fix audits, verification, and closure. It currently
reports 23 workflow reads, 20 governed actions, and a final `resolved` state.
The bounded-escalation scenario is printed as a supporting non-closure path.

## Article-backed and GPT diagnosis evaluation

The all-ticket diagnosis lane audits the production diagnostic workflow across
all thirty seed tickets rather than only the eleven chronological scenarios:

```powershell
npm run evaluate:ai-diagnosis
```

The deterministic side uses the shared article-backed playbooks. They provide
specific, customer-safe narrowing summaries for meaningful support patterns
while respecting the evidence gate. `TKT-1010` and `TKT-1026` are intentionally
vague no-article fixtures; the lane leaves them evidence-gated instead of
creating a diagnosis. Resolved tickets and prompt-injection tickets are also
skipped for GPT diagnosis.

The default command uses a controlled local adapter. An authenticated,
non-reproducible GPT observation is explicitly opt-in:

```powershell
$env:OPENAI_API_KEY = 'sk-...'
npm run evaluate:ai-diagnosis -- --live
```

Each run saves sanitized output under `reports/ai-diagnosis/` as
`controlled-latest.*` or `live-latest.*`.

GPT output is an advisory candidate only. The deterministic diagnosis,
evidence readiness, prompt-injection preflight, lifecycle transitions, and
human approval remain authoritative. Invalid or unavailable provider output
falls back to the deterministic diagnosis, and the report records only
sanitized candidate fields and fallback categories.

## Knowledge-evolution evidence checks

The harness and knowledge-evolution service use the same evidence catalog and
diagnostic workflow. This keeps three concerns separate when a diagnosis is
reused:

- **Observed evidence** is what was actually provided and recorded on a
  completed diagnosis. Structured `evidenceReferences` carry catalog IDs and
  provenance; readable `evidenceUsed` text is not converted into policy.
- **Candidate policy** is a reviewable proposal. It may be `required`, an
  explicitly justified `none-required`, or `undecided` when no reusable
  references were observed. `undecided` is intentionally visible but cannot be
  promoted.
- **Approved policy** is the result of strict operator promotion. New
  promotions require an active catalog-backed `required` policy or a justified
  `none-required` policy. Existing approved objects that reference a
  deprecated ID remain readable and executable for compatibility; new
  promotion with that ID is blocked.

The eleven-scenario diagnostic harness remains a non-mutating lifecycle check:
it does not create candidates or promote knowledge objects. The positive and
negative reuse paths are covered by the knowledge-evolution integration tests:

1. A diagnosis with a real catalog reference can become a candidate, be
   approved, keep a later matching ticket evidence-gated while the requirement
   is missing, and enter the approved known-cause workflow after reevaluation
   with that evidence.
2. A diagnosis with readable reasoning but no structured references remains
   valid for its original ticket, yet produces an `undecided` candidate that is
   blocked from promotion and has no routing effect.

Known-event or outage correlation and open-ticket similarity are signals, not
permission to skip required evidence. Existing approved objects that use a
deprecated catalog ID remain readable for compatibility; new promotion with a
deprecated ID is rejected and must use the active replacement. These contracts
are exercised directly with:

```powershell
npm test -- --run test/knowledge-evolution-reuse.test.ts test/knowledge-evolution-service.test.ts
```

## AI Comparison Evaluation

The AI comparison harness reuses this eleven-scenario catalog to make the
optional classification-advisory and customer-draft stages comparable without
changing the production classifier or deterministic diagnostic workflow.

Run the controlled, reproducible evaluation with:

```powershell
npm run evaluate:ai-comparison
```

The default report is network-free. It runs all four lanes with explicitly
labeled `controlled-local-simulation` adapters:

| Lane | Classification | Drafting |
| --- | --- | --- |
| `deterministic-deterministic` | deterministic | deterministic |
| `gpt-deterministic` | controlled advisory simulation | deterministic |
| `deterministic-gpt` | deterministic | controlled draft simulation |
| `gpt-gpt` | controlled advisory simulation | controlled draft simulation |

The report includes the actual customer draft, operator stage,
expected-outcome agreement, hard-safety result, quality breakdown, safe
failure reasons, and stage provenance. Its classification delta records the
sanitized advisory candidate, accepted signals, rejected advice,
deterministic overrides, and baseline-versus-final governed fields. Response
quality reports both required-evidence recall and evidence precision. Stage
provenance records status, provider source, model, latency, and token usage
when an adapter returns them. It deliberately never includes API keys or raw
provider request/response payloads. Overall result and hard safety are
separate: a quality disagreement can fail the former while hard safety
remains passing; a hard-safety failure always fails the lane.

Live OpenAI evaluation is an explicit, non-reproducible opt-in. It runs only
the three GPT-containing lanes and labels their providers
`live-openai-adapter`:

```powershell
$env:OPENAI_API_KEY = 'sk-...'
npm run evaluate:ai-comparison -- --live
```

`--live` requires `OPENAI_API_KEY`; without the flag no live-provider factory
is selected and no network request is made. The live command uses the
repository's existing environment-backed OpenAI adapters. Provider errors are
recorded as safe deterministic fallbacks, not as passing GPT-quality results.
The controlled run remains available even when no live provider is configured.

Each run also writes the complete sanitized report to `reports/ai-comparison/`:

- `controlled-latest.md` or `live-latest.md` for human review, including every
  scenario/lane draft;
- the matching `.json` file for structured inspection and automation.

The terminal report is still printed unchanged. Live reports should be treated
as observations rather than committed benchmark fixtures.

Prompt-injection preflight is applied before either GPT stage. For an
injection scenario, both advisory classification and GPT drafting are skipped,
the deterministic path continues, and the customer draft does not expose the
internal detection warning. GPT advisory output cannot override deterministic
security, outage, SLA, diagnostic, approval, or lifecycle policy.

See [the sanitized comparison example](ai-comparison-example.md) for the
report shape. Static response exemplars are human review anchors and response
contracts, not exact strings that every valid draft must reproduce.
