import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

type ReadinessManifest = {
  development: { path: string };
  holdout: { path: string };
};

describe("Knowledge Readiness frozen file attributes", () => {
  it("resolves LF working-tree bytes for every JSON file referenced by the manifest", () => {
    const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const manifestRelativePath = "data/evaluation/knowledge-readiness/manifest.json";
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, manifestRelativePath), "utf8")) as ReadinessManifest;
    const manifestDirectory = dirname(manifestRelativePath).replaceAll("\\", "/");
    const frozenRelativePaths = [manifest.development.path, manifest.holdout.path].map((path) => join(manifestDirectory, path).replaceAll("\\", "/"));
    const resolutions = execFileSync("git", ["check-attr", "eol", "--", ...frozenRelativePaths], { cwd: repositoryRoot, encoding: "utf8" }).trim().split(/\r?\n/);

    expect(resolutions).toEqual(frozenRelativePaths.map((path) => `${path}: eol: lf`));
  });
});
