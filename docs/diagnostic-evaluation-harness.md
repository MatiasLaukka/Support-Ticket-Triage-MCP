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

The harness is deterministic and local. It does not call GPT, mutate tickets, approve recommendations, send responses, record diagnoses, mark fixes, or close tickets.

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

The report includes the actual customer draft, expected-outcome agreement,
hard-safety result, quality breakdown, safe failure reasons, and stage
provenance. Stage provenance records status, provider source, model,
latency, and token usage when an adapter returns them. It deliberately never
includes API keys or raw provider request/response payloads. Overall result
and hard safety are separate: a quality disagreement can fail the former
while hard safety remains passing; a hard-safety failure always fails the
lane.

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

Prompt-injection preflight is applied before either GPT stage. For an
injection scenario, both advisory classification and GPT drafting are skipped,
the deterministic path continues, and the customer draft does not expose the
internal detection warning. GPT advisory output cannot override deterministic
security, outage, SLA, diagnostic, approval, or lifecycle policy.

See [the sanitized comparison example](ai-comparison-example.md) for the
report shape. Static response exemplars are human review anchors and response
contracts, not exact strings that every valid draft must reproduce.
