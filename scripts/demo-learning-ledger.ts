import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { runKnowledgeEvolutionShowcase } from "./demo-knowledge-evolution.js";

async function main(): Promise<void> {
  const root = process.cwd();
  const dataRoot = await mkdtemp(join(tmpdir(), "learning-ledger-showcase-"));
  try {
    const report = await runKnowledgeEvolutionShowcase({ root, dataRoot, mode: "controlled", verbose: true });
    process.stdout.write(`${report.output}\n`);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  void main();
}
