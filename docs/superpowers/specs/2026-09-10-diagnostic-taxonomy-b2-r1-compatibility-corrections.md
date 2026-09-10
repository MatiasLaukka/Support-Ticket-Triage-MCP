# B2 R1 Compatibility Corrections

The reconciled B2 plan is implemented against `origin/main` at
`f31f64c38d6715d435307caaf1370d3b9c8411bd`.

## Preference identity correction

The plan says to normalize `taxonomyPreference` into the caller intent before
v2 hashing. R1 already committed evaluations whose identity did not contain
that field. Adding a defaulted `taxonomyPreference` to every parsed command
would make an unchanged retry conflict with those receipts.

The implementation therefore canonicalizes inherited preferences as follows:

- omitted `taxonomyPreference` inherits `aiPreference` and remains absent from
  the identity;
- explicitly supplied `taxonomyPreference` equal to `aiPreference` is also
  omitted from the identity; and
- an explicitly supplied, distinct taxonomy preference remains in the
  identity and conflicts when changed under the same command key.

Preparation resolves the effective preference separately. This preserves
pre-B2 v2 receipt replay while retaining caller intent for meaningful B2
preference changes.

## Direct-service compatibility correction

The R1 direct `TriageService.submitEvaluation()` path receives caller-supplied
evaluation content. Its existing semantic request remains intact. Generated
taxonomy and trace are prepared only by the production evaluation command and
are not removed from, or added to, the direct-service caller intent.

## Result-reference scope

`diagnosticTaxonomyRevisionId` is additive and optional. Its schema constrains
it to `evaluate-ticket` results with one affected ticket; replay validation
proves the referenced revision and causal event belong to the same committed
command.

## Initial-boundary and replay validation correction

The operational persistence layer supports the broader immutable taxonomy
history needed by later phases. B2's initial prepared context is narrower, so
`TriageService` rejects a prepared revision whose basis is not
`initial-classification` or whose support is `established`, including direct
prepared-service callers. Replay also requires one command identity across the
evaluation's events and verifies that the taxonomy event's revision fact,
command, actor, ticket, and timestamp match the referenced immutable revision
and recommendation event.
