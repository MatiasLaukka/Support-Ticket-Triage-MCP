# Project Roadmap

This roadmap keeps the project focused on credible automation evidence rather
than feature sprawl.

## Near-Term Polish

1. Capture screenshots and a short GIF using `docs/capture-guide.md`.
2. Add those assets under `docs/assets/` and link them from the README.
3. Add a short "Demo in 60 seconds" section near the top of the README.
4. Keep `npm run demo:showcase` as the main public entry point.

## More Realistic Support Scenarios

Add 5-8 messy synthetic merchant tickets that stress the workflow:

| Scenario | What it should test |
| --- | --- |
| Vague angry merchant report | Empathetic draft tone and focused evidence requests. |
| Wrong merchant assumption | GPT should avoid blaming the customer and ask for proof. |
| Partial outage report | Incident wording without overclaiming confirmed impact. |
| Duplicate event names | Technical draft mode and event disambiguation. |
| Conflicting ticket metadata | Deterministic policy should override stale labels. |
| Prompt-injection plus real issue | Safety handling without losing the valid support problem. |

Each new ticket should have:

- a seed ticket;
- an expected outcome;
- relevant local knowledge coverage;
- at least one test or evaluator assertion;
- a customer response expectation that is understandable to non-technical
  users.

## Response Quality Improvements

The current GPT drafting path is intentionally bounded. Next improvements
should target quality without weakening governance:

- add style-specific acceptance tests for `concise`, `empathetic`,
  `technical`, and `executive-update`;
- add a max-length validator for customer responses;
- add a validator warning when the draft asks for irrelevant information;
- add a "known cause vs needs diagnosis" label to the safety panel;
- add examples of good and bad customer replies in `docs/demo-results.md`.

## Production-Like Extensions

These are useful later, but should stay behind the same approval boundary:

- Zendesk or Jira read adapter for imported tickets;
- provider-specific field mapping and revision checks;
- durable recommendation store outside local JSON files;
- real identity and reviewer attribution;
- webhook verification and idempotency for external updates;
- separate evaluation set for customer-response quality.

## Keep Out Of Scope For The Demo

- automatic outbound customer messaging;
- autonomous ticket closure;
- real customer data;
- hidden approval shortcuts;
- vendor documentation copied from third-party platforms.

