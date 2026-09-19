import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export const DEFAULT_B5_ARTIFACT_ROOT = resolve("reports/retrieval/b5-applicability");

function isWithin(directory: string, candidate: string): boolean {
  const child = relative(directory, candidate);
  return child === "" || (child !== ".." && !child.startsWith("../") && !child.startsWith("..\\") && !isAbsolute(child));
}

function canonicalProspectivePath(path: string): string {
  const resolved = resolve(path);
  const missing: string[] = [];
  let existing = resolved;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error("B5 artifact path cannot be resolved.");
    missing.unshift(basename(existing));
    existing = parent;
  }
  return missing.reduce((current, component) => join(current, component), realpathSync(existing));
}

export function canonicalNewB5ArtifactPath(requestedPath: string): string {
  const lexicalRoot = resolve(DEFAULT_B5_ARTIFACT_ROOT);
  const lexicalDestination = resolve(requestedPath);
  if (!isWithin(lexicalRoot, lexicalDestination)) {
    throw new Error("B5 artifact paths must remain inside the fixed B5 artifact root.");
  }

  const canonicalRoot = canonicalProspectivePath(lexicalRoot);
  const canonicalDestination = canonicalProspectivePath(lexicalDestination);
  if (!isWithin(canonicalRoot, canonicalDestination)) {
    throw new Error("B5 artifact paths must remain inside the fixed B5 artifact root.");
  }
  return canonicalDestination;
}
