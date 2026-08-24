import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditEvaluationOracles, loadEvaluationOracles } from "../src/evaluation-oracle.js";

const projectRoot = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const oracles = await loadEvaluationOracles(
    resolve(projectRoot, "data/seed/evaluation-oracles.json"),
  );
  console.log(JSON.stringify(auditEvaluationOracles(oracles), null, 2));
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
