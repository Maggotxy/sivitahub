import assert from "node:assert/strict";
import test from "node:test";
import { parseGitHubRepository } from "../src/github-url.mjs";

test("parses GitHub web URLs and nested paths", () => {
  assert.deepEqual(parseGitHubRepository("https://github.com/Maggotxy/sivitahub/tree/main/docs"), {
    owner: "Maggotxy", repo: "sivitahub", fullName: "Maggotxy/sivitahub", url: "https://github.com/Maggotxy/sivitahub",
  });
});

test("parses owner/name and SSH forms", () => {
  assert.equal(parseGitHubRepository("owner/repo").fullName, "owner/repo");
  assert.equal(parseGitHubRepository("git@github.com:owner/repo.git").fullName, "owner/repo");
  assert.equal(parseGitHubRepository("ssh://git@github.com/owner/repo.git").fullName, "owner/repo");
});

test("rejects non-GitHub hosts and malformed names", () => {
  assert.throws(() => parseGitHubRepository("https://example.com/owner/repo"), /Only github\.com/);
  assert.throws(() => parseGitHubRepository("owner"), /Only GitHub repository URLs/);
  assert.throws(() => parseGitHubRepository("https://github.com/-bad/repo"), /valid owner\/name/);
});
