import assert from "node:assert/strict";
import test from "node:test";
import { buildWheelManifest, wheelManifestYaml } from "../src/manifest.mjs";

const snapshot = {
  repository: { fullName: "owner/repo", url: "https://github.com/owner/repo", description: "A useful component registry", defaultBranch: "main", visibility: "public", license: "MIT" },
  capabilities: ["Component Registry"],
  stack: ["TypeScript", "React"],
  extensionPoints: ["components", "packages"],
  manifestFiles: [{ path: "package.json" }],
  rootEntries: [{ name: "packages", type: "dir" }],
  readme: { excerpt: "" },
};

test("builds a deterministic wheel manifest", () => {
  const manifest = buildWheelManifest(snapshot, new Date("2026-08-15T00:00:00.000Z"));
  assert.equal(manifest.id, "github:owner/repo");
  assert.equal(manifest.kind, "registry");
  assert.equal(manifest.license.status, "detected");
  assert.deepEqual(manifest.ai.editablePaths, ["components/**", "packages/**"]);
});

test("renders human-readable YAML", () => {
  const yaml = wheelManifestYaml(buildWheelManifest(snapshot, new Date("2026-08-15T00:00:00.000Z")));
  assert.match(yaml, /^schema:/);
  assert.match(yaml, /repository: owner\/repo/);
  assert.match(yaml, /- TypeScript/);
});
