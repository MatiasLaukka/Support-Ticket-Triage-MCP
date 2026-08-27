# Task 5 report: Approval Desk queue lifecycle summaries

## Delivered

- `GET /api/tickets` now adds an additive `lifecycleSummary` per queue item with the stable shape `{ phase, primaryAction, reasonCodes }`.
- The queue summary is built from the same authoritative lifecycle/read-model path used by ticket detail reads, including operational diagnosis normalization when persisted operational diagnoses exist.
- `src/approval-desk/http.ts` now centralizes that normalized workflow projection in one helper, and both the detail route and lifecycle envelope use the same helper to stay aligned with the queue projection.
- Existing `recommendationSummary` behavior is preserved; no existing list fields were removed or reinterpreted.
- No `src/approval-desk/ui.ts` change was needed. Queue lifecycle truth now ships from the HTTP projection, while mutation governance remains on the selected ticket's full lifecycle descriptor.

## RED to GREEN

- RED added a mixed queue-page HTTP test that prepares real `evaluation-needed`, `diagnosis-review`, `fix-ready`, `ready-for-close`, and `resolved` tickets, then asserts every queue item exposes `lifecycleSummary` and that its `{ phase, primaryAction, reasonCodes }` exactly matches the detail route's authoritative lifecycle primary action for the same ticket.
- The RED test also pins the three states that must not collapse into local response-ready copy:
  - `fix-ready` -> `apply-scoped-fix`
  - `ready-for-close` -> `resolve-ticket`
  - `resolved` -> `none`
- Green required only the queue projection change plus a small test-helper extension so two seeded ready-for-close fixtures can coexist without ID collisions.

## Verification

- RED observed on `npx vitest run test/approval-desk-http.test.ts --exclude ".worktrees/**"` when queue items had no `lifecycleSummary`.
- GREEN focused suite: `npx vitest run test/approval-desk-http.test.ts --exclude ".worktrees/**"` -> `91 passed`.
- Paired regression suite: `npx vitest run test/approval-desk-ui.test.ts --exclude ".worktrees/**"` -> `182 passed`.
- `npm run typecheck` passed.
