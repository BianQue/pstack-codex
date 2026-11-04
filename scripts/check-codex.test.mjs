import assert from "node:assert/strict";
import * as fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkPackage, fingerprint, root, sha256, validateAcceptance } from "./check-codex.mjs";

test("generated package has valid manifests, skill metadata and local links", () => {
  assert.equal(checkPackage().name, "pstack-codex");
  assert.equal(fingerprint(), fingerprint());
});
test("release acceptance rejects missing checks, stale bytes and wrong model settings", () => {
  const candidate = id => ({
    id, receiptVerified: true, testsPassed: true, independentBehaviorPassed: true,
    artifactSha256: { "selection.mjs": "a".repeat(64), "selection.test.mjs": "b".repeat(64) },
  });
  const evidence = {
    version: "0.1.0", pluginSha256: "c".repeat(64), requestedModel: "gpt-6.1-sol",
    requestedReasoningEffort: "xhigh", modelIdentityVerified: false,
    taskSha256: sha256(fs.readFileSync(path.join(root, "codex/acceptance-task.md"))),
    candidates: [candidate("a"), candidate("b")],
  };
  validateAcceptance(evidence, "0.1.0", "c".repeat(64));
  for (const change of [
    e => { e.pluginSha256 = "d".repeat(64); },
    e => { e.version = "0.2.0"; },
    e => { e.requestedModel = "another-model"; },
    e => { e.requestedReasoningEffort = "low"; },
    e => { e.taskSha256 = "0".repeat(64); },
    e => { e.modelIdentityVerified = true; },
    e => { e.candidates.pop(); },
    e => { e.candidates[0].testsPassed = false; },
    e => { e.candidates[0].receiptVerified = false; },
    e => { e.candidates[0].independentBehaviorPassed = false; },
    e => { e.candidates[0].artifactSha256["selection.mjs"] = ""; },
  ]) {
    const invalid = structuredClone(evidence);
    change(invalid);
    assert.throws(() => validateAcceptance(invalid, "0.1.0", "c".repeat(64)));
  }
});
