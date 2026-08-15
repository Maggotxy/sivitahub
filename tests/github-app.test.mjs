import assert from "node:assert/strict";
import test from "node:test";
import { signInstallState, verifyInstallState } from "../src/github-app.mjs";

const secret = "a-secure-test-secret-that-is-long-enough";

test("GitHub installation state is signed and expires", () => {
  const state = signInstallState({ returnTo: "/", expiresAt: 2000 }, secret);
  assert.equal(verifyInstallState(state, secret, 1000)?.returnTo, "/");
  assert.equal(verifyInstallState(state, secret, 3000), null);
});

test("GitHub installation state rejects tampering", () => {
  const state = signInstallState({ returnTo: "/", expiresAt: 2000 }, secret);
  assert.equal(verifyInstallState(`${state}x`, secret, 1000), null);
});
