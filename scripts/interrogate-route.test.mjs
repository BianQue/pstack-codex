import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { pluginDir } from "./check-codex.mjs";

const skill = path.join(process.env.PSTACK_CODEX_TEST_PLUGIN_DIR ?? pluginDir, "skills/interrogate");
const { delivered, route } = await import(pathToFileURL(path.join(skill, "scripts/route.mjs")));
const ready = { state: "not-started", nativeAllowed: true, nativeAvailable: true,
  exactSettings: true, isolatedScope: true, cliAllowed: true };

test("installed Interrogate selects native only with explicit host and scope support", () => {
  assert.match(readFileSync(path.join(skill, "../../docs/harness/codex.md"), "utf8"), /skills\/interrogate\/native\.md/);
  assert.equal(route(ready), "native");
  for (const key of ["nativeAllowed", "nativeAvailable", "isolatedScope"]) {
    assert.equal(route({ ...ready, [key]: false }), "cli");
  }
  assert.equal(route({ ...ready, nativeAvailable: false, cliAllowed: false }), "stop");
  assert.equal(route({ ...ready, exactSettings: false }), "stop");
});

test("an attempted dispatch never starts a duplicate CLI reviewer", () => {
  assert.equal(route({ ...ready, state: "pending" }), "wait");
  for (const state of ["dispatch-unknown", "invalid-result"]) {
    assert.equal(route({ ...ready, state }), "stop");
  }
  assert.throws(() => route({ ...ready, state: "unexpected" }));
});

test("collect only results that prove the assigned prompt reached the reviewer", () => {
  const token = "0123456789abcdef0123456789abcdef";
  assert.equal(delivered(`Task: ${token}\r\nFinding`, token), true);
  assert.equal(delivered("No task was provided.", token), false);
  assert.equal(delivered(`Task: ${token}0\nFinding`, token), false);
});
