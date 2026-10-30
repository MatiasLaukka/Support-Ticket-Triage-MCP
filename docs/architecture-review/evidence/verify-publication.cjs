// Documentation-only validation. No runtime state or source is changed.
// Usage: node verify-publication.cjs <repo-root> <pinned-source-copy> <reproduced-static-json> <rendering-json>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const [repoArg, sourceArg, staticArg, renderingArg] = process.argv.slice(2);
const repo = path.resolve(repoArg);
const docs = path.join(repo, 'docs/architecture-review');
const source = path.resolve(sourceArg);
const audited = 'fe035ee383b6f9df1869104f8a623609d025023b';
const walk = p => fs.readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)]);
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const relative = p => path.relative(repo, p).replaceAll('\\', '/');
const slug = s => s.toLowerCase().replaceAll('`', '').replace(/[^\p{L}\p{N}_\- ]/gu, '').replaceAll(' ', '-');
const errors = [];
const files = walk(docs);
const markdown = files.filter(f => f.endsWith('.md'));
let sourceLinks = 0, reportLinks = 0, diagrams = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!/\.(?:md|json|tsv|cjs|svg)$/.test(file)) errors.push('Unexpected publication type: ' + relative(file));
  if (/(?:^|[\s"'(<])(?:[A-Za-z]:[\\/]|file:\/\/|\/(?:Users|home)\/)/m.test(text)) errors.push('Nonportable absolute path: ' + relative(file));
  if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:sk-(?:proj|svcacct)-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/.test(text)) errors.push('Credential signature: ' + relative(file));
  if (file.endsWith('.json')) JSON.parse(text);
  if (file.endsWith('.svg') && (!text.includes('<svg') || /<script\b|<foreignObject\b|(?:href|src)=["'](?:https?:|file:)/i.test(text))) errors.push('Nonportable or active SVG: ' + relative(file));
  if (!file.endsWith('.tsv') && text.split('\n').some(l => /[ \t]+$/.test(l))) errors.push('Trailing whitespace: ' + relative(file));
}
for (const file of markdown) {
  const text = fs.readFileSync(file, 'utf8');
  if ((text.match(/^```/gm) ?? []).length % 2) errors.push('Unbalanced fences: ' + relative(file));
  diagrams += (text.match(/^```mermaid$/gm) ?? []).length;
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
  for (const match of prose.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (target.startsWith('https://github.com/MatiasLaukka/Support-Ticket-Triage-MCP/blob/')) {
      const suffix = target.split('/blob/')[1];
      if (!suffix.startsWith(audited + '/')) { errors.push('Unpinned report source: ' + target); continue; }
      const [name, anchor] = suffix.slice(audited.length + 1).split('#');
      const sourceFile = path.join(source, name);
      if (!fs.existsSync(sourceFile)) errors.push('Missing audited source: ' + target);
      else if (anchor && (!/^L\d+$/.test(anchor) || Number(anchor.slice(1)) > fs.readFileSync(sourceFile, 'utf8').split('\n').length)) errors.push('Invalid audited line: ' + target);
      sourceLinks++;
    } else if (!/^[a-z]+:/i.test(target)) {
      const [name, anchor] = target.split('#');
      const local = name ? path.resolve(path.dirname(file), decodeURIComponent(name)) : file;
      if (!fs.existsSync(local)) errors.push('Broken report link: ' + relative(file) + ' -> ' + target);
      else if (anchor && local.endsWith('.md')) {
        const headings = [...fs.readFileSync(local, 'utf8').matchAll(/^#{1,6} (.+)$/gm)].map(m => slug(m[1]));
        if (!headings.includes(anchor)) errors.push('Broken report anchor: ' + relative(file) + ' -> ' + target);
      }
      reportLinks++;
    }
  }
}
const raw = JSON.parse(fs.readFileSync(staticArg, 'utf8'));
const published = JSON.parse(fs.readFileSync(path.join(docs, 'evidence/static-summary.json'), 'utf8'));
const columns = row => row.map(v => String(v).replaceAll('\t', ' ').replaceAll('\n', ' ')).join('\t');
const tables = {
  'imports.tsv': ['from\tline\tkind\tto', ...raw.edges.map(e => columns([e.from, e.line, e.kind, e.to]))].join('\n') + '\n',
  'module-inventory.tsv': ['file\tlines\tsha256\timports\timporters_all_scanned\timporters_src', ...raw.modules.map(m => columns([m.file, m.lines, m.sha256, raw.edges.filter(e => e.from === m.file).length, new Set(raw.edges.filter(e => e.to === m.file).map(e => e.from)).size, new Set(raw.edges.filter(e => e.to === m.file && e.from.startsWith('src/')).map(e => e.from)).size]))].join('\n') + '\n',
  'symbols.tsv': ['file\tline\tend_line\tkind\texported\tname', ...raw.modules.flatMap(m => m.declarations.flatMap(d => [columns([m.file, d.line, d.end, d.kind, d.exported, d.name]), ...(d.methods ?? []).map(v => columns([m.file, v.line, v.end, v.private ? 'private-method' : 'method', false, d.name + '.' + v.name]))]))].join('\n') + '\n',
};
for (const [file, expected] of Object.entries(tables)) if (fs.readFileSync(path.join(docs, 'evidence', file), 'utf8') !== expected) errors.push('Static evidence reproduction mismatch: ' + file);
if (JSON.stringify(raw.sccAll) !== JSON.stringify(published.sccIncludingTypes) || JSON.stringify(raw.sccValue) !== JSON.stringify(published.sccExcludingExplicitTypes)) errors.push('Static SCC mismatch');
const rendering = JSON.parse(fs.readFileSync(renderingArg, 'utf8'));
if (rendering.total !== 9 || rendering.rendered !== 9 || rendering.browserErrors.length) errors.push('Incomplete rendering');
for (const d of rendering.diagrams) {
  const text = fs.readFileSync(path.join(docs, d.source), 'utf8');
  const blocks = [...text.matchAll(/^```mermaid\r?\n([\s\S]*?)^```/gm)];
  if (!blocks.some(m => sha(m[1].replaceAll('\r\n', '\n').trimEnd()) === d.sourceSha256)) errors.push('Rendered source mismatch: ' + d.id);
  if (sha(fs.readFileSync(path.join(docs, d.svg))) !== d.svgSha256) errors.push('SVG hash mismatch: ' + d.id);
}
const git = (...args) => cp.execFileSync('git', ['-c', `safe.directory=${repo}`, '-C', repo, ...args], { encoding: 'utf8' }).trim();
const changed = [...new Set([...git('diff', '--name-only', audited).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean))];
if (changed.some(f => f !== 'README.md' && !f.startsWith('docs/architecture-review/'))) errors.push('Change outside documentation allowlist');
const beforeReadme = git('show', audited + ':README.md');
const currentReadme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8').trim().replaceAll('\r\n', '\n');
const expectedReadme = beforeReadme.replace('**Documentation:** [Engineering reference](docs/engineering-reference.md)', '**Documentation:** [Architecture audit](docs/architecture-review/README.md) · [Engineering reference](docs/engineering-reference.md)').replaceAll('\r\n', '\n');
if (currentReadme !== expectedReadme) errors.push('Root README change exceeds one navigation link');
const result = { passed: errors.length === 0, auditedBaseline: audited, markdownFiles: markdown.length, pinnedSourceLinks: sourceLinks, reportLinks, mermaidBlocks: diagrams, svgFiles: files.filter(f => f.endsWith('.svg')).length, renderer: { version: rendering.version, rendered: rendering.rendered, total: rendering.total, browserErrors: rendering.browserErrors.length }, privacy: { workstationPaths: 0, credentialSignatures: 0, reviewedScope: 'All publication files; allowlisted document/evidence/SVG types; manual review of metadata and generated inventories' }, staticEvidenceReproduced: errors.every(e => !e.startsWith('Static')), allowedChangesOnly: errors.every(e => !e.includes('outside documentation')), rootReadmeSingleLinkOnly: currentReadme === expectedReadme, includedFiles: changed.sort(), errors };
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.passed ? 0 : 1;
