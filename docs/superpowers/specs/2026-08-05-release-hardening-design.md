# Release Hardening Design

## Goal

Make the verified portfolio workflow easier to run and make queue-metric output stable for screenshots, demos, and API consumers without changing classification or lifecycle decisions.

## Design

- `calculateQueueMetrics` rounds aggregate confidence values to four decimal places at the transport boundary. Individual recommendation confidence and uncertainty metadata remain unchanged.
- `verify:portfolio` runs the existing build, typecheck, full test suite, diagnostic evaluation, lifecycle replay, knowledge-evolution showcase, and metrics showcase sequentially. It stops on the first failure and uses existing commands as the source of truth.
- README documents the command, the verification scope, and that savings are approval-attributed estimates rather than stopwatch measurements.

## Safety and compatibility

No classifier routing, lifecycle transition, GPT provider, customer-facing response, or provenance boundary changes are included. Existing commands remain available independently.

## Acceptance criteria

- Aggregate confidence output is stable at four decimal places and existing metric semantics remain unchanged.
- `npm run verify:portfolio` exits nonzero when any constituent command fails and exits zero on the verified repository.
- README gives a concise public release-verification path.
