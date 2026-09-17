import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

function isWithin(directory: string, candidate: string): boolean {
  const child = relative(directory, candidate);
  return child === "" || (child !== ".." && !child.startsWith("../") && !child.startsWith("..\\") && !isAbsolute(child));
}

function canonicalDestinationPath(path: string): string {
  const resolved = resolve(path);
  const missing: string[] = [];
  let existing = resolved;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error("B4 artifact path cannot be resolved.");
    missing.unshift(basename(existing));
    existing = parent;
  }
  return missing.reduce((current, component) => join(current, component), realpathSync(existing));
}

export function canonicalNewB4ArtifactPath(approvedRoot: string, requestedPath: string): string {
  const root = realpathSync(resolve(approvedRoot));
  const destination = canonicalDestinationPath(requestedPath);
  if (!isWithin(root, destination)) throw new Error("B4 artifact paths must remain inside the approved B4 artifact root.");
  return destination;
}
