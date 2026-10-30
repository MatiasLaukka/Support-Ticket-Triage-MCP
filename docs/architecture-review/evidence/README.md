# Evidence, verification and reproduction

[Report index](../README.md)

## Evidence classes

| Artifact | Origin | What it establishes |
|---|---|---|
| [baseline.json](baseline.json) | Git status/refs/worktree inventory, read-only GitHub default-HEAD and compare APIs, source content comparison | Distinct local/cached/public identities; observed worktree overlays; explicit resolved and unresolved ancestry |
| [module-inventory.tsv](module-inventory.tsv) | Generated TypeScript AST file scan | File paths, physical line counts, SHA-256 of UTF-8 source, declaration import counts and distinct importers |
| [imports.tsv](imports.tsv) | Generated explicit import/re-export declarations | Importer → imported file/specifier with line and type/value/re-export classification; includes test/script importers |
| [symbols.tsv](symbols.tsv) | Generated AST declaration walk | Named functions/classes/types/interfaces/enums, top-level variables and class methods, line extents and explicit export modifiers. It is a navigation index, not an external API promise |
| [static-summary.json](static-summary.json) | Generated AST + SCC traversal | Scan counts; type-inclusive and explicit-type-excluding SCCs; literal dynamic expressions recorded separately |
| [validation.json](validation.json) | Fresh compiler/focused test output and before/after fingerprints | Exact check scope, 13 test-file outcomes, preservation checks and documentation validation results |
| Report Mermaid diagrams | Manual source review supported by generated inventories | Selected call/data paths and grouped dependency relationships; not runtime trace captures |

No private ticket text, credentials, provider output, reviewer decisions or evaluation gold is included. Test output is summarized by file/count. Public source content is not copied into the report beyond the small static-analysis helper.

## Static analysis method

[static-analysis.cjs](static-analysis.cjs) uses the repository's existing TypeScript compiler API (`createSourceFile`, AST predicates, source positions). It recursively scans `src/`, `scripts/`, and `test/` for `.ts`, `.js`, `.mts`, `.cts`, `.mjs`, and `.cjs` files. There were 315 matching files at the pinned public snapshot, 143 under `src/`.

The helper resolves explicit relative specifiers by checking their existing path, `.js` → `.ts`, or an index file. This fits the observed NodeNext source conventions; it is not full compiler module resolution, package export resolution, tree shaking or whole-program liveness analysis. Non-relative specifiers remain package/builtin specifiers. A module may have several declarations to the same target. Importer counts distinguish all scanned files from `src` only.

Explicit `import type`, all-type inline named imports, `export type`, and all-type named re-exports are classified as `type`. Mixed imports count as value declarations. Type use inferred from ordinary imports is not resolved, so the value graph is conservative relative to emitted JavaScript. Side-effect imports and value re-exports remain value relationships. No import cycle is automatically a runtime defect.

SCC calculation includes `src` nodes and direct declarations only. Dynamic `import()`/`require()` expressions are listed separately and excluded from SCC edges. The source's 28 literal dynamic imports all occur in `triage-service.ts`; browser JavaScript inside `approvalDeskHtml` is a string and is not parsed as a browser program. Injected provider/store dispatch, callbacks, reflection, script execution and external consumers require separate review.

The raw helper output also records syntactic call expressions for navigation. Those are not resolved calls: `provider.reason` could dispatch to a supplied implementation, and event callbacks may run later or never. Raw call expressions were not published as a purported complete execution graph. The selected workflows were traced manually through definitions, caller bodies, interfaces and tests.

### Reproduce the static scan without changing the checkout

Use a read-only source copy of commit `fe035ee383b6f9df1869104f8a623609d025023b`, not the old delivery checkout. Supply an existing dependency installation containing TypeScript; do not install a diagram toolchain.

```powershell
$auditSnapshot = '<temporary source copy of the pinned commit>'
$auditDependencies = '<existing repository dependency installation>'
$auditOutput = Join-Path $env:TEMP 'knotty-static-evidence.json'
node docs/architecture-review/evidence/static-analysis.cjs $auditSnapshot $auditOutput $auditDependencies
```

The raw output's `modules`, `edges`, `sccAll`, `sccValue`, `dynamic` and `calls` fields allow independent inspection. The checked-in TSVs are simple projections: one row per module, edge, declaration or class method; columns are listed in each header. Baseline/worktree metadata is a separate observation and cannot be reproduced merely by analyzing source. Newline normalization was used **only** for source parity comparisons between archive LF and checkout CRLF, not for preservation fingerprints.

## Compiler and focused behavior checks

Checks used Node 24.15.0, TypeScript 6.0.3, Vitest 4.1.8 and better-sqlite3 12.11.1 already installed. The temporary snapshot linked to the existing dependency directory. Compiler output and Vitest caches were directed to the temporary snapshot, not any protected checkout. No `npm install`, `npm test` pretest chain, demo/reset command or production process was run.

The equivalent compiler commands were:

```powershell
node "$auditDependencies/node_modules/typescript/bin/tsc" -p "$auditSnapshot/tsconfig.json" --noEmit
node "$auditDependencies/node_modules/typescript/bin/tsc" -p "$auditSnapshot/tsconfig.build.json"
```

The focused Vitest run used a temporary configuration:

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  cacheDir: './.audit-vite-cache',
  test: { cache: false, maxWorkers: 2, setupFiles: ['./audit-no-provider.ts'] },
});
```

Temporary setup blocked external default fetch, while allowing replay tests' local HTTP server and injected/mock provider transports:

```typescript
const auditFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('External fetch disabled for architecture audit verification');
  }
  return auditFetch(input, init);
};
```

Invocation used the existing `node_modules/vitest/vitest.mjs run`, `--root $auditSnapshot`, `--config "$auditSnapshot/audit-vitest.config.ts"`, JSON reporter and an output file under the audit temporary directory. The 13 positional test-file arguments and individual results are recorded in [validation.json](validation.json). Exit status was zero; 279 tests passed, zero failed. The configuration/setup were audit harness files in the temporary copy, not production source edits. They were not added to package scripts or dependencies.

The focused selection verifies key seams discussed in this report. It does not mean every mapped test was executed. In particular, full UI/browser e2e, all learning/knowledge suites, full CI, provider interoperability and diagnostic evaluation were not run. Existing CI configuration runs `npm ci` and the test suite on Node 22/Ubuntu; the local focused result is not that CI result.

## Preservation and documentation checks

Before/after fingerprints covered 2,483 existing files under `src`, `scripts`, `test` and `data` across seven roots. HEAD, branch and tracked diff fingerprints also matched. Original status entries remained present; all added status entries were under `docs/architecture-review/`. Research worktree status entries were unchanged. This is point-in-time byte evidence for that scope, not a consistent SQLite snapshot or a hash audit of every ignored artifact on disk.

Source links were checked against the pinned source copy for file existence and valid line bounds. Relative report links, fragment targets, fenced diagram structure, generated inventory counts and whitespace were checked locally. Diagrams received manual review for direction, authority and structure. No Mermaid parser or renderer was available during the original audit; [validation.json](validation.json) preserves that historical limitation. The subsequent publication pass renders and visually checks all nine diagrams, with results in [publication.json](publication.json) and portable [SVG artifacts](../diagrams/README.md).

Read-only GitHub operations established current public main and two ancestor relations. Three worktree commit comparisons returned 404 and remain unresolved. No fetch updated cached refs; no checkout was switched, cleaned, reset, stashed or committed. The public source archive was used instead.

## Publication records

[publication.json](publication.json) records reconciliation and fresh publication checks separately from the original compiler/test results. [Research source provenance](research-source-index.md) replaces workstation-only E1a links without publishing research inputs or outputs. Baseline and original validation metadata retain commit/branch identities and observed counts but use portable location labels; unrelated raw worktree inventory is omitted.

### Reproduce diagram rendering

Use a temporary copy of the published documentation, an extracted `mermaid@11.12.2` package, an existing Playwright installation, and a local Chromium-compatible browser. No repository dependency or package-script change is required. The publication pass also checked the same repaired Mermaid blocks with `mermaid@12.2.0`; the committed SVGs use 11.12.2. Neither check claims to identify GitHub's current renderer version.

```powershell
$diagramRepo = '<temporary checkout containing this documentation>'
$mermaidDist = '<temporary extracted mermaid-11.12.2 package>/dist'
$renderDependencies = '<existing dependency installation containing playwright>'
$renderBrowser = '<local Chromium-compatible browser executable>'
$renderOutput = Join-Path $env:TEMP 'knotty-diagram-check'
node docs/architecture-review/evidence/render-diagrams.cjs $diagramRepo $mermaidDist $renderDependencies $renderBrowser $renderOutput
```

The helper parses and renders each block using strict security, SVG text labels, a neutral theme and explicit layout settings. It records source/SVG hashes and dimensions in `rendering.json` and saves screenshots for visual review outside the repository. Source/SVG metadata is published in [publication.json](publication.json). Results depend on renderer/browser/font versions; successful local rendering is not an exact GitHub-renderer equivalence claim.

### Reproduce publication checks

Prepare the pinned source with LF bytes, matching the GitHub archive used for the original hashes. On Windows, explicitly disable archive line-ending conversion: `git -c core.autocrlf=false archive --format=tar -o <temporary-archive> fe035ee383b6f9df1869104f8a623609d025023b`, then extract it into a disposable directory. Do not change repository Git configuration or regenerate the original evidence from CRLF bytes.

Run the static helper and rendering helper above, then pass their JSON outputs and the pinned source directory to the publication validator:

```powershell
node docs/architecture-review/evidence/verify-publication.cjs $diagramRepo $auditSnapshot $auditOutput (Join-Path $renderOutput "rendering.json")
```

The validator checks all report links and source line bounds, the audited-commit pin, exact reproduction of all three generated TSVs and dependency SCCs, source/SVG hashes, nine rendered diagrams, portable file types, obvious credential/path signatures, the documentation-only diff allowlist, and the single root README navigation change. Automated signature checks supplement manual metadata review; they are not a general secret-detection guarantee. The source provenance index contains no research input/output bodies.
