# Knowledge Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve three knowledge families, correct paragraph chunking and index upgrade handling, and establish reviewed development evidence without consuming the B4 holdout.

**Architecture:** Retain B3's local derived index and provider-neutral retrieval. Enrich existing articles/descriptors, validate their actual downstream projections, and extend the existing evaluator with reviewed case selection and section-evidence diagnostics. Keep operational authority and diagnostic execution unchanged.

**Tech Stack:** TypeScript, Node.js, SQLite/better-sqlite3, Vitest, Markdown/JSON, optional existing local Ollama.

**Spec:** [Knowledge readiness design](../specs/2026-09-14-knowledge-readiness-design.md). Read the entire spec before implementation.

## Global Constraints

- Scope: campaign editor, webhooks, flow/event processing only.
- Retain the existing 4,000-character section-body ceiling and diagnosis `article.body.slice(0, 1800)` projection.
- Representation version changes from 2 to 3; database schema remains 2 unless an independently demonstrated schema need is approved.
- No B4 fusion/ranking, B5 applicability, new executable diagnostic branches, provider-limit increases, dependency upgrades, or unrelated rewrites.
- Do not change operational routing, recommendation construction, drafting orchestration, diagnosis logic, approval, receipts, replay, or lifecycle behavior. Narrow retrieval startup diagnostics are allowed by Task 2.
- Article edits can affect provider guidance; preserve qualifications in source, chunks, and serialized provider requests.
- Preserve historical reports. Use isolated indexes and new output directories.
- Synthetic cases are evaluation-only; no operational ingestion, model downloads, or external provider calls.
- Local embeddings require execution-time authorization. Offline tests use fake providers; do not consume configured credentials implicitly.
- User review of content/development labels is a mandatory checkpoint, not routine approval after every task. Holdout label review is separate.
- No holdout retrieval execution in this slice; structural validation only. No tuning against holdout wording.
- Full implementation gate: `npm test -- --maxWorkers=2` with an explicit exit code. Never mask a hang or failure.
- Commit task-specific files only. No push, merge, or PR unless separately authorized.

## Baseline and working method

The design was based on merged PR #24 at `aa53992d84ffd37a61a570ce387c5592b8ed8b1b`. The documentation branch is `codex/knowledge-readiness-design`; use its final docs commit, which includes both documents, as the execution baseline unless a later merged baseline is explicitly selected and compared. Do not start at the program baseline alone and omit the documents.

- [ ] Verify `git status --short --branch`, `git log -1 --oneline`, `git merge-base --is-ancestor aa53992d84ffd37a61a570ce387c5592b8ed8b1b HEAD`, and origin URL. Preserve unrelated work and use an isolated implementation worktree according to repository instructions and the worktree skill.
- [ ] Inspect repository instructions and existing test helpers. Ensure the implementation worktree has its own usable dependencies; do not rely unknowingly on an ancestor's `node_modules`. Use the lockfile and approved setup; never alter dependency versions to repair the environment.
- [ ] Run baseline typecheck and the two-worker suite. If environment setup is blocked, report it before making verification claims. Baseline source must be retained for the legacy-index fixture in Task 2.
- [ ] Execute Tasks 1–8 in order. Each code task follows focused RED, minimal change, GREEN, and scoped commit. Do not import helpers from `.test.ts` files; use non-test fixtures.

## File responsibility map

| Files | Responsibility |
| --- | --- |
| `src/retrieval/representations.ts`; `test/retrieval-representations.test.ts` | Paragraph packing, bounded fallback, versioned hashes. |
| `src/retrieval/sqlite-store.ts`, `index-manager.ts`, `stage.ts`, `types.ts`; `src/runtime.ts`; `scripts/retrieval-index.ts` | Explicit valid-v2 upgrade, atomic publication, typed upgrade diagnostic; no operational schema changes. |
| `test/retrieval-store.test.ts`, `retrieval-index-manager.test.ts`, `retrieval-runtime.test.ts`, `retrieval-cli.test.ts`; new `test/fixtures/retrieval-v2-index.json` | Old-format upgrade, rollback, reopen, and CLI/runtime regression evidence. |
| Four scoped `data/knowledge/*.md` files; `src/approval-desk/diagnostic-playbook-descriptors.ts` | Grounded content and existing descriptor fidelity. |
| New `test/knowledge-readiness-content.test.ts`; existing provider tests | Article structure, chunk exposure, and actual provider inputs. |
| New `src/retrieval/readiness-cases.ts`, `test/retrieval-readiness-cases.test.ts` | File validation, grouped splits, review gates, frozen source-section bindings. |
| New `data/evaluation/knowledge-readiness/{development,holdout,manifest}.json` | Separately reviewed synthetic cases and frozen identities; no operational seed changes. |
| New `docs/knowledge-readiness-review.md` | Coverage/gap matrix, source/projection audit, user review records, deferred work. |
| New `src/retrieval/section-evidence.ts`, `test/retrieval-section-evidence.test.ts` | Pure per-channel section diagnostic; not ranking. |
| `scripts/evaluate-retrieval.ts`, `test/retrieval-cli.test.ts` | Optional readiness inputs, development-only selection, report integration, preserved legacy mode. |
| New `reports/retrieval/knowledge-readiness-v1/` | Frozen development reports, projection sizes, manifest identity, reproduction instructions. |

Paths in each task are relative to the implementation worktree. Do not create duplicate loaders or a second retrieval engine.

## Task 1: Paragraph-preserving article chunks

**Files:** Modify `src/retrieval/representations.ts`; test `test/retrieval-representations.test.ts`.

**Interfaces:** Keep `projectArticle(article: KnowledgeArticle): ProjectedResource`, `ARTICLE_SECTION_BODY_LIMIT`, and existing representation fields unchanged. Task 2 advances `REPRESENTATION_VERSION` with the upgrade path in one commit; do not ship new semantics independently of that version change. Task 1's intermediate commit is not a release candidate.

- [ ] Add a focused paragraph regression through the public projector:

```ts
it("packs complete paragraphs instead of cutting into the next one", () => {
  const a = "a ".repeat(1200).trim();
  const b = "b ".repeat(1000).trim();
  const projected = projectArticle({
    id: "paragraphs", title: "Paragraphs", tags: [],
    body: `# Checks\n\n${a}\n\n${b}`,
  });
  expect(projected.representations.map(r => r.semanticText)).toEqual([
    `Paragraphs\n\nChecks\n\n${a}`,
    `Paragraphs\n\nChecks\n\n${b}`,
  ]);
});
```

- [ ] Run `npx vitest run test/retrieval-representations.test.ts --maxWorkers=2`; confirm the paragraph assertion fails on the old splitter.
- [ ] Implement paragraph grouping inside `splitBody`/`splitLongText`, retaining the existing heading parser and no overlap. Core packing rule:

```ts
const combined = pending ? `${pending}\n\n${paragraph}` : paragraph;
if (combined.length <= ARTICLE_SECTION_BODY_LIMIT) pending = combined;
else {
  if (pending) chunks.push(pending);
  pending = "";
  // A paragraph that fits starts the next chunk; an oversized paragraph
  // is emitted through the existing bounded splitter, then packing resumes.
  if (paragraph.length <= ARTICLE_SECTION_BODY_LIMIT) pending = paragraph;
  else chunks.push(...splitLongText(paragraph));
}
```

Treat whitespace-only blank lines as paragraph separators; retain single newlines inside a paragraph. At a hard fallback boundary, avoid splitting a UTF-16 surrogate pair. The body limit excludes the added title and heading; document this in tests.
- [ ] Add table-driven cases for empty input, exact 4,000 length, 4,001 unbroken characters, an oversized paragraph, CRLF/NFC normalization, emoji at the boundary, two heading levels, lists/tables/examples below the limit, and repeated projection equality. Assert non-whitespace content is neither lost nor duplicated; never infer preservation merely from chunk counts.
- [ ] Run representation and source suites; record GREEN. Stage only these two files and commit `fix: preserve paragraph boundaries in retrieval chunks`.

## Task 2: Valid version-2 index upgrade and safe publication

**Files:** Modify `src/retrieval/representations.ts`, `sqlite-store.ts`, `index-manager.ts`, `stage.ts`, `types.ts`, `src/runtime.ts`, `scripts/retrieval-index.ts`; tests listed in the file map. Create `test/fixtures/retrieval-v2-index.json`.

**Interfaces:** Keep public `refresh(signal)` and `rebuild(signal)` signatures. Add `RetrievalRepresentationVersionError` with readonly `storedVersion` and `requiredVersion`, and `RetrievalUpgradeSourceUnavailableError`. Add `RetrievalStore.validateForRebuild(): 2 | 3`, which validates physical/logical integrity using the supported stored version but does not serve a snapshot. Normal `validate()` must still refuse serving version 2 under version 3. Future/malformed versions remain integrity errors.

- [ ] Capture a small genuine baseline-v2 logical fixture using baseline `projectArticle` and store code: metadata, resource, representation, FTS, and a compatible nonzero 2-dimensional vector. Include exact SQL table-column mappings in the JSON loader test; create the schema using `initialize()`, insert the fixture in a transaction, then close and reopen. Store fixture provenance and original hash values. Do not simulate v2 solely by changing a metadata number on v3 rows.
- [ ] Write regressions expecting typed old-version detection, successful explicit rebuild, version-3 metadata, no old vectors, and valid reopening. Add corruption variants by changing an original content hash and impossible generations. Add a publication fault injection inside the transaction and assert original metadata/rows survive byte-for-byte or logical-row equality.
- [ ] Run store/manager/CLI/runtime suites and confirm the missing upgrade contract fails before implementation.
- [ ] Set version 3. Factor the existing canonical hash calculation to permit internal validation of versions 2 and 3, while all normal projections use 3. Preserve the exact v2 canonical hash algorithm; do not hash legacy rows with current semantics or disable hash validation.
- [ ] Implement the validation/rebuild order:

```ts
// Normal read/startup path:
const storedVersion = this.validateForRebuild();
if (storedVersion !== REPRESENTATION_VERSION) {
  throw new RetrievalRepresentationVersionError(storedVersion, REPRESENTATION_VERSION);
}
// Explicit rebuild path:
// 1. Validate old/current stored data fully.
// 2. Load authoritative sources; reject unsafe unavailable-cache loss.
// 3. Prepare current representations and optional embeddings outside SQL transaction.
// 4. In the existing replaceAll transaction, publish rows and representationVersion=3.
// 5. Validate the new index before committing the transaction.
```

For an upgrade with cached learned/resolved families that cannot be reloaded, block before publication using `RetrievalUpgradeSourceUnavailableError`. The maintenance CLI currently loads static sources only: document that limitation, retain cached rows on refusal, and do not advertise a successful all-source upgrade. No provider means a valid lexical-only rebuilt index with semantic generation zero. Provider failure before publication preserves the old index; an explicit lexical-only retry is allowed, not silent failure masking.
- [ ] Extend existing retrieval trace/diagnostic unions with `INDEX_UPGRADE_REQUIRED` and channel reason `index-upgrade-required`; map the typed version error in runtime startup to unavailable retrieval, not corruption. Close opened stores. Never alter the committed command path. Report an explicit maintenance rebuild instruction; no automatic database deletion or global error swallowing.
- [ ] Test current-version no-op refresh, supported-v2 rebuild/reopen, future version refusal, corrupt-v2 refusal, provider failure rollback, lexical-only upgrade, unavailable-cache refusal, and off/shadow command authority parity. Assert no-op generation relationships remain `lexicalGeneration === generation` and `semanticGeneration <= generation`.
- [ ] Update tests that hard-code current representation version 2 to import the current constant, except legacy fixture assertions. Do not alter historical reports. Run focused retrieval suites and typecheck; stage only named task files and commit `fix: rebuild supported retrieval representation versions safely`.

## Task 3: Grounded content and actual provider projections

**Files:** Modify `data/knowledge/performance-troubleshooting.md`, `webhook-signature-validation.md`, `flow-trigger-troubleshooting.md`, `event-tracking-debugging.md`; `src/approval-desk/diagnostic-playbook-descriptors.ts`; tests `diagnosis-reasoning-provider.test.ts`, `classification-reasoning-provider.test.ts`, `openai-draft-provider.test.ts`, `retrieval-sources.test.ts`; create `test/knowledge-readiness-content.test.ts` and `docs/knowledge-readiness-review.md`.

**Interfaces:** Preserve article IDs/title/tags frontmatter schema, descriptor IDs/executable paths, and all provider input schemas. Review record sections: source matrix, content gaps, descriptor alignment, actual projection excerpts, before/after character counts, deferred gaps, approval history. Do not introduce article-review metadata in strict frontmatter.

- [ ] Add failing content assertions against repository-loaded articles. Require a concise first-section qualification such as `A symptom alone does not confirm a cause.` and `Do not claim a fix without verification.` within the first 1,800 characters of each edited article. These are explicit content requirements, not proof of safety by themselves; the review packet must show the entire truncated view.

```ts
const articles = await new KnowledgeRepository(resolve("data/knowledge")).list();
for (const id of ["performance-troubleshooting", "webhook-signature-validation",
  "flow-trigger-troubleshooting", "event-tracking-debugging"]) {
  const article = articles.find(a => a.id === id)!;
  expect(article.body.slice(0, 1800)).toContain("A symptom alone does not confirm a cause.");
  expect(article.body.slice(0, 1800)).toContain("Do not claim a fix without verification.");
  expect(projectArticle(article).representations.every(r => r.heading?.trim())).toBe(true);
}
```

- [ ] Run `npx vitest run test/knowledge-readiness-content.test.ts --maxWorkers=2`; verify RED.
- [ ] Author self-contained scope/evidence/branches/actions/verification sections using the following grounded units, retaining unrelated performance/event guidance:

| Article | Units and authority limits |
| --- | --- |
| Performance | Session isolation success, cross-session failure and console evidence, missing/contradictory checks, verification/handoff. `ChunkLoadError` is a clue, not proof by itself. Do not promise an unspecified frontend mitigation. |
| Webhooks | Rotation timing/current-secret confirmation without collecting the secret; exact raw-body comparison; dispatch versus retry timing; missing/contradictory evidence; safe verification. No invented HMAC scheme, retry schedule, or secret value. |
| Flow | Event/identity/timestamp checks; trigger/profile filters; consent/smart sending/re-entry qualification; insufficient evidence; correction verification. Distinguish observed exclusion from claimed eligibility. |
| Event | Accepted response versus timeline appearance; identity/timing comparisons; isolated versus broad impact; flow-qualification cross-reference; verification and escalation. No invented ingestion SLA or accepted timestamp syntax. |

Place related qualifications beside each action; use unique descriptive headings and relative article links. Keep summaries concise enough for the actual diagnosis projection. A cutoff that exposes an action but excludes its prerequisite is a review failure even when the two generic sentences pass.
- [ ] Enrich existing descriptors: campaign-editor distinguishes its two branches; flow-trigger and event-processing distinguish event presence/eligibility and broad-impact evidence; article-backed describes the scoped webhook path without erasing other branches. Add valid scoped article links. No new executable branch, descriptor identity, or generated source-code embedding.
- [ ] In each existing mocked provider test, capture the serialized request using its current fetch harness and call with actual edited articles. For diagnosis assert `approvedKnowledge[i].body === article.body.slice(0, 1800)`; for classification/drafting assert full `knowledgeArticles[i].body === article.body`. Reuse valid response fixtures within each test module; do not import another `.test.ts`.

```ts
// Apply to the parsed user-input JSON captured by each provider's fetch mock.
expect(diagnosisInput.approvedKnowledge.map(a => a.body))
  .toEqual(editedArticles.map(a => a.body.slice(0, 1800)));
expect(classificationInput.knowledgeArticles.map(a => a.body))
  .toEqual(editedArticles.map(a => a.body));
expect(draftInput.knowledgeArticles.map(a => a.body))
  .toEqual(editedArticles.map(a => a.body));
```

The names in this assertion block are local variables for the captured JSON, not new production APIs. Parse the existing Responses request's user message; do not export private prompt builders for testing. Record `body.length` and `Buffer.byteLength(body, "utf8")` before/after from Git baseline versus current files; do not call character counts tokens. No production provider edits are planned. If safety cannot fit, pause with the actual truncated text.
- [ ] Inspect generated chunks and scope links, then run content/source/provider tests and `test/diagnostic-playbooks.test.ts`, `test/diagnostic-evaluation.test.ts`, `test/draft-contract.test.ts`, `test/draft-quality-guardrails.test.ts`. Mark the review packet pending user approval. Commit `docs: enrich scoped diagnostic knowledge and projections` with named files only.

## Task 4: Case contracts and fail-closed split selection

**Files:** Create `src/retrieval/readiness-cases.ts`, `test/retrieval-readiness-cases.test.ts`. Reuse `TicketSchema`, `RetrievalExpectationSchema`, `hashText`, and existing source/projector types; do not extend operational ticket data.

**Interfaces:** Define/export these evaluation-only types and functions, validated at the JSON boundary with strict Zod schemas:

```ts
type ReadinessTopic = "campaign-editor" | "webhook" | "flow-event";
type ReadinessFamily = "exact" | "paraphrase" | "contrast" |
  "disagreement-probe" | "insufficient" | "near-match";
type Review = { status: "pending" } |
  { status: "approved"; reviewedBy: string; reviewedAt: string; decisionRef: string };
type SectionBinding = {
  resourceKey: ResourceKey; sourceHash: string;
  heading: string; representationIds: string[]; rationale: string;
};
type ReadinessCase = {
  id: string; topic: ReadinessTopic; families: ReadinessFamily[];
  scenarioGroup: string; split: "development" | "holdout";
  provenance: { kind: "synthetic"; basis: string[]; derivedFrom: string[] };
  ticket: Ticket; expectation: RetrievalExpectation;
  supportingSections: SectionBinding[];
  evidenceNotes: string; labelRationale: string; review: Review;
};
type ReadinessManifest = {
  version: 1; sourceRevision: string; corpusHash: string;
  representationVersion: 3; cutoff: string;
  development: { path: string; sha256: string };
  holdout: { path: string; sha256: string };
};
function validateReadinessCases(cases: readonly ReadinessCase[],
  corpus: readonly ProjectedResource[]): void;
function selectReadinessDevelopment(cases: readonly ReadinessCase[]): ReadinessCase[];
function validateReadinessSplits(development: readonly ReadinessCase[],
  holdout: readonly ReadinessCase[]): void;
```

`sourceHash` is the projected resource content hash. Headings plus current matching representation IDs bind section evidence; a changed hash requires re-review. Review identity is recorded from an actual user decision, never fabricated by the executor. Non-article bindings may use the canonical representation title if there is no heading.

- [ ] Write pure tests for pending case refusal, duplicate IDs, missing resource/heading, stale hash, inconsistent representation binding, required-not-relevant, relevant-and-hard-negative overlap, and derived variants crossing splits. Use local synthetic fixtures; no live calls.
- [ ] Write an explicit pending-review test using a complete local case fixture and `expect(() => selectReadinessDevelopment([pendingCase])).toThrow(/review/i)`. Write cross-split tests using the same `scenarioGroup` and separate case IDs, expecting refusal.
- [ ] Run the new suite; confirm RED. Implement by composing existing oracle validation and strict readiness schemas. `selectReadinessDevelopment` must refuse any holdout row passed to it rather than silently scoring mixed input; the CLI loads development separately. Reject empty scored development sets. Group validation also follows `derivedFrom` links, not just declared group strings.
- [ ] Validate timestamps, SHA-256 fields, nonempty rationales and case-family lists; prove no arbitrary ID rewrite can bypass source binding. Do not require every topic to have a real error code; actual code coverage is required for the overall matrix, while other exact cases can use grounded event/technical names.
- [ ] Run GREEN, typecheck, commit `feat: validate reviewed retrieval case sets and split boundaries`.

## Task 5: Author development cases and obtain review

**Files:** Create `data/evaluation/knowledge-readiness/development.json`; update `docs/knowledge-readiness-review.md`. Later in this task create `holdout.json` and `manifest.json` after content review. Test through Task 4 functions.

**Interfaces:** JSON arrays of `ReadinessCase`, then `ReadinessManifest`. Reuse the synthetic ticket shape in `src/retrieval/evaluation-fixtures.ts`, using new unique IDs. Do not modify legacy seed tickets/oracles or claim these new cases were historically reviewed.

- [ ] Author at least one grounded development case for every topic/family cell; a multi-tagged case can satisfy multiple cells with separate rationales. Use independent scenario groups where possible, not 18 paraphrases of three seed tickets. Start all reviews as `{ "status": "pending" }`.
- [ ] Use this seed matrix; labels must follow actual finalized sections, not these expected channel tendencies:

| Family | Editor evidence | Webhook evidence | Flow/event evidence |
| --- | --- | --- | --- |
| Exact | `ChunkLoadError` with isolation context; a similar loading report lacking that error | Signature/rotation terminology; opaque delivery-ID distractor control | `Viewed Product` versus `Added to Cart` and actual flow trigger context |
| Paraphrase | Editing screen never opens | Notifications arrive late after an action | Customer acts but never enters automation |
| Contrast | Private session succeeds versus cross-browser/admin failure | Rotation supported versus explicitly ruled out/raw-body change | Event missing versus present with filter exclusion |
| Disagreement probe | Generic loading and specific console clue | Mixed latency/signature terminology | Mixed ingestion and qualification wording |
| Insufficient | Blank page, no isolation results | Failed signature, no rotation/body details | Missing flow entry, no event/timeline evidence |
| Near-match | Platform fix requested despite working private session | Rotation steps despite no rotation | Ingestion explanation despite existing event/exclusion |

Include inconsistent browser results, simultaneous webhook symptoms, and conflicting timeline/qualification observations. Do not infer confirmed applicability from keywords. Label the broad article relevant if its rule-out section is useful; use section bindings to distinguish the useful part. Unjudged articles stay unjudged.
- [ ] Populate current source hashes/representation bindings mechanically from `projectArticle`/source projections, then inspect each binding and rationale manually. Include explicit deferred gaps: Track API format, unrelated topics, real resolved cases, and any unsupported matrix cell.
- [ ] Run structural validation on pending cases without scoring; produce the coverage/projection review packet. **STOP and ask the user to approve content and development labels.** Do not proceed by self-signing review fields. Implement corrections requested by the user before freezing.
- [ ] After approval, record actual review provenance. Finalize independent holdout cases against frozen content, grouping related variants and published-seed derivatives away from holdout. Request a separate holdout label review; the reviewer can inspect static labels, but no retrieval rankings run. Do not revise corpus text to accommodate holdout wording. If independence cannot be established, mark the proposed set development and report holdout readiness blocked.
- [ ] Freeze case file hashes, source identity, representation version, cutoff and split assignments in the manifest. Case files do not embed their own hashes; manifest does not include its own future Git commit. Content/case source commit precedes the manifest/report commit if needed. Run structural split/reference validation, commit `test: add reviewed knowledge readiness cases and frozen splits`.

## Task 6: Section-evidence diagnostic without new ranking

**Files:** Create `src/retrieval/section-evidence.ts`, `test/retrieval-section-evidence.test.ts`.

**Interfaces:** Consume B3 `Candidate`, Task 4 `SectionBinding`. Produce:

```ts
type SectionEvidenceResult = {
  status: "supporting-best-match" | "right-article-wrong-best-section" |
    "unjudged-section" | "resource-missing" | "channel-unavailable";
  bestRepresentationId?: string;
  supportingMatchPresent: boolean | null;
};
function evaluateSectionEvidence(input: {
  candidate?: Candidate;
  channel: "lexical" | "semantic";
  channelAvailable: boolean;
  bindings: readonly SectionBinding[];
}): SectionEvidenceResult;
```

- [ ] Write a regression with two representations on the same article: wrong section score better than a supporting section. Resource-level recall must remain a hit while the section diagnostic reports the wrong best section.

```ts
const key = "knowledge-article:performance-troubleshooting" as const;
const candidate: Candidate = {
  resourceKey: key, resourceType: "knowledge-article",
  deterministicReferences: [], knownCauseReferences: [],
  semantic: { bestRank: 1, bestCosineSimilarity: 0.9, matches: [
    { resourceKey: key, representationId: "wrong", rank: 1, score: 0.9 },
    { resourceKey: key, representationId: "support", rank: 2, score: 0.4 },
  ] },
};
expect(evaluateSectionEvidence({ candidate, channel: "semantic", channelAvailable: true,
  bindings: [{ resourceKey: key, sourceHash: "a".repeat(64), heading: "Session checks",
    representationIds: ["support"], rationale: "Supports isolation investigation." }],
})).toEqual({ status: "right-article-wrong-best-section",
  bestRepresentationId: "wrong", supportingMatchPresent: true });
```

- [ ] Run RED, then implement the pure function: choose the best existing channel match by BM25 ascending or cosine descending with representation-ID tie-break, matching B3 aggregation. Union supporting representation IDs from all bindings for this article; multiple useful sections are allowed. Unavailable channel takes precedence; a candidate with no match in this channel counts as resource-missing for that channel. No bindings for this article yields unjudged, not a negative. Empty representation-ID lists or malformed individual bindings are rejected by Task 4 before scoring.
- [ ] Test supporting-best, wrong-best with/without lower supporting match, equal-score tie, missing resource, reference-only resource, unavailable semantic channel, and unjudged section. Do not mutate input matches or rescore the resource.
- [ ] Run GREEN and retrieval evaluation/search suites; commit `feat: report supporting section exposure separately from article recall`.

## Task 7: Development-only evaluator integration and artifacts

**Files:** Modify `scripts/evaluate-retrieval.ts`, `test/retrieval-cli.test.ts`; use Tasks 4/6 helpers; create `reports/retrieval/knowledge-readiness-v1/README.md` and new run output directories.

**Interfaces:** Extend `evaluationOptionsFor` and `evaluateRetrieval` with optional readiness manifest path and validation-only mode. CLI options: `--case-set <manifest.json>`, `--split development`, `--validate-cases-only`. Existing no-case-set legacy evaluation remains unchanged. Reject `--split holdout`, duplicate/conflicting options, missing paths, and readiness runs lacking an explicit nonhistorical `--output-dir`.

- [ ] Write CLI regressions for rejected holdout selection before provider construction, pending development reviews, hash mismatch, wrong representation version, corpus mismatch, and stale section binding. Spy on a fake provider and assert zero calls for validation-only and rejected invocations.

```ts
expect(() => evaluationOptionsFor([
  "--case-set", "data/evaluation/knowledge-readiness/manifest.json",
  "--split", "holdout",
], {})).toThrow(/holdout/i);
```

- [ ] Run RED. Implement readiness loading as an alternative input source inside the existing evaluator; keep retrieval, reference construction, Qwen formatting, index creation, resource metrics, and cleanup paths shared. Do not mix legacy case metrics with readiness metrics. Default readiness split is development; validation-only checks both files structurally without running retrieval or printing holdout query/label content.
- [ ] Validate manifest case hashes before loading scored inputs, and corpus/representation bindings after projection but before embedding. Use existing per-type K=5 and unchanged Qwen query-only format; record both in reports. Support R@1 and R@5 using existing scoring semantics; do not add fusion. Record unavailable/unjudged exclusions and label completeness.
- [ ] Record the manifest's content/case source revision separately from the running evaluator's source revision. Later evaluator code commits need not equal the frozen content commit, but actual corpus/case hashes must still match; never bypass those checks simply because the Git revisions differ. Resolve manifest file paths relative to the manifest directory and reject traversal outside that case-set directory.
- [ ] Add per-case/channel section diagnostics, aggregate counts, actual development disagreements, and metadata `evaluatedSplit: "development"`, `holdoutExecuted: false`. Report same-best versus lower-supporting-match separately; any-supporting-match alone is not evidence of useful ordering. Exclude missing/unavailable/unjudged states from judged-section denominators, with counts visible.
- [ ] Verify JSON/Markdown identity, safe case IDs rather than raw query payloads, no held-out rankings, and unchanged historical report files. Live semantic errors must remain visible; do not call a degraded offline run a successful semantic experiment.
- [ ] Run offline readiness validation/evaluation and fake-provider CLI tests. After explicit authorization, use the already-installed local provider only:

```powershell
$env:TRIAGE_EMBEDDING_ENDPOINT = 'http://localhost:11434/v1/embeddings'
$env:TRIAGE_EMBEDDING_MODEL = 'qwen3-embedding:0.6b'
$env:TRIAGE_EMBEDDING_DIMENSIONS = '1024'
$env:TRIAGE_EMBEDDING_TIMEOUT_MS = '60000'
# Set TRIAGE_EMBEDDING_REVISION to the freshly verified full local manifest digest.
if ([string]::IsNullOrWhiteSpace($env:TRIAGE_EMBEDDING_REVISION)) { throw 'Verify and set the local model digest first.' }
npm run evaluate:retrieval -- --case-set data/evaluation/knowledge-readiness/manifest.json --validate-cases-only --output-dir reports/retrieval/knowledge-readiness-v1/validation
npm run evaluate:retrieval -- --case-set data/evaluation/knowledge-readiness/manifest.json --split development --live-embeddings --qwen3-retrieval-instruction --output-dir reports/retrieval/knowledge-readiness-v1/development-qwen
```

Read the digest from local Ollama metadata (`GET http://localhost:11434/api/tags`) and match the exact model tag before assigning it; the historical digest is not proof of current identity. Do not download a missing model. Never reuse an existing output directory without preserving its prior evidence; use a new run suffix for reruns.
- [ ] Record per-article source and prompt character sizes, new snapshot identities, reproduction commands, per-topic/family results, section gaps, and corpus limitations. Do not compare the new case set against historical metrics as though only ranking changed. Commit code/tests separately from measured artifacts: `feat: evaluate reviewed readiness development cases` and `docs: record knowledge readiness development evidence`.

## Task 8: Whole-program verification and handoff

**Files:** Only fixes justified by Tasks 1–7; update `docs/knowledge-readiness-review.md` and the new report README with verification evidence. Do not broaden implementation under a cleanup label.

- [ ] Review the entire branch diff against its verified baseline. Confirm only allowed files changed, no diagnostic executable branch edits, no provider-limit changes, and no historical report overwrites. Validate all local Markdown links and case source references.
- [ ] Run the affected content, provider, retrieval, runtime, diagnostic, and drafting suites. Confirm index upgrade tests actually reopen a v2 database and inject publication failure; fresh-database tests are not substitutes.
- [ ] Run sequentially, recording every exit code:

```powershell
npm run typecheck
npm run build
npm run evaluate:oracle-audit
npm run evaluate:taxonomy-inference
npm test -- --maxWorkers=2
git diff --check
```

Do not continue past a failing command and report only the last exit code. Use bounded diagnostic follow-up for hangs; do not raise timeouts, add retries, or force successful process exits. All stores/managers close in `finally`; no test-helper imports from `.test.ts`.
- [ ] Run readiness structural validation again without scoring holdout. Confirm reviewed statuses and actual user approval references, development-only report identity, version 3, frozen section bindings, and source hashes. Explain any unavailable provider evidence or unresolved domain review instead of claiming completion.
- [ ] Commit only final review/evidence corrections. Report branch/worktree, baseline, final commits, clean/dirty status, personally performed checks, remaining gaps, and which future corpus expansion is justified. No push/merge/PR.

## Spec coverage and execution gates

| Spec requirement | Tasks |
| --- | --- |
| Three-family content, authority boundaries, deferred scope | 3, 5, 8 |
| Diagnosis prefix and full-body consumers | 3, 8 |
| Descriptor fidelity and stable resource identities | 3 |
| Paragraph correction and compatible old-index publication | 1, 2 |
| Six case families plus contradictions and exact-code controls | 4, 5 |
| Actual user review and grouped holdout isolation | 4, 5, 7 |
| Supporting sections versus article-only success | 4, 6, 7 |
| Frozen artifacts, provider authorization, no historical overwrite | 5, 7, 8 |
| Whole-program gates and honest completion | 8 |

The required pause is Task 5's content/development-label review, followed by separate holdout label review. A provider authorization gap is another legitimate stop for semantic evidence, not permission to use another service. No execution is authorized merely by writing this plan.
