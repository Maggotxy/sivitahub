import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set([".git", "node_modules"]);
const files = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (ignored.has(name)) continue;
    const path = join(directory, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path);
    else if (path.endsWith(".js") || path.endsWith(".mjs")) files.push(path);
  }
}

walk(rootPath);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(`syntax ok: ${relative(rootPath, file)}`);
}
const tests = spawnSync(process.execPath, ["--test", "--test-reporter=spec"], { cwd: rootPath, stdio: "inherit" });
process.exit(tests.status || 0);
