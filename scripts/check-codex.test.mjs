import assert from "node:assert/strict";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkPackage, fingerprint, root, sha256, validateAcceptance } from "./check-codex.mjs";
import { adaptSkill, markdownLinks, renderCodex, skillMetadata } from "./codex-package.mjs";

test("generated package has valid manifests, skill metadata and local links", () => {
  assert.equal(checkPackage().name, "pstack-codex");
  assert.equal(fingerprint(), fingerprint());
});
test("folded descriptions and manual invocation survive host adaptation", () => {
  const input = "---\nname: example\ndescription: >-\n  First line.\n  Second line.\ndisable-model-invocation: true\nicon: tool\n---\n\n# Example\n\nKeep this body.\n";
  const output = adaptSkill(input, "skills/example/SKILL.md");
  assert.equal(skillMetadata(output).description, "description: >-\n  First line.\n  Second line.");
  assert.match(output, /\.\.\/\.\.\/docs\/harness\/codex\.md/);
  assert(output.endsWith("# Example\n\nKeep this body.\n"));
  assert(!output.includes("disable-model-invocation:"));
  assert(!output.includes("icon:"));
  assert.throws(() => skillMetadata("---\nname: example\n---\nBody"));
});
test("renderer retains resources and dormant automation without exposing it as a public skill", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pstack-render-"));
  try {
    const source = path.join(temp, "source");
    const overrides = path.join(temp, "overrides");
    fs.mkdirSync(overrides);
    const entries = {
      "skills/manual/SKILL.md": "---\nname: manual\ndescription: Manual task\ndisable-model-invocation: true\n---\n# Manual\n",
      "skills/automatic/SKILL.md": "---\nname: automatic\ndescription: Automatic task\n---\n# Automatic\n",
      "automations/worker/SKILL.md": "---\nname: worker\ndescription: Dormant worker\n---\n# Worker\n",
      "assets/data.bin": Buffer.from([0, 255, 64, 10]),
      ".cursor-plugin/plugin.json": "{}",
      "plugin.json": '{"name":"pstack-codex","version":"0.2.0"}',
    };
    for (const [file, bytes] of Object.entries(entries)) {
      fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
      fs.writeFileSync(path.join(source, file), bytes);
    }
    const output = renderCodex(source, overrides);
    assert(output.get("assets/data.bin").bytes.equals(entries["assets/data.bin"]));
    assert(!output.has(".cursor-plugin/plugin.json"));
    assert.equal(output.get("skills/manual/agents/openai.yaml").bytes.toString(),
      "policy:\n  allow_implicit_invocation: false\n");
    assert.equal(output.get("skills/automatic/agents/openai.yaml").bytes.toString(),
      "policy:\n  allow_implicit_invocation: true\n");
    const inventory = JSON.parse(output.get("coverage.json").bytes);
    assert.equal(inventory.sourceFiles.length, Object.keys(entries).length);
    assert.deepEqual(inventory.dormantAutomationSkills, ["automations/worker/SKILL.md"]);
    assert.deepEqual(inventory.upstreamSkills.map(skill => skill.name), ["automatic", "manual"]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test("installed-package validation catches omissions, resource corruption and widened invocation", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pstack-check-"));
  const dir = path.join(temp, "plugin");
  fs.cpSync(path.join(root, "harness/pstack/codex"), dir, { recursive: true });
  try {
    for (const [relative, replacement] of [
      ["assets/logo.png", Buffer.from("corrupt")],
      ["skills/arena/agents/openai.yaml", Buffer.from("policy:\n  allow_implicit_invocation: true\n")],
      ["skills/statechart/scripts/statechart.ts", undefined],
      ["skills/teach/SKILL.md", Buffer.from("---\nname: teach\ndescription: Truncated\n---\n")],
      ["docs/harness/codex.md", Buffer.from("[missing](missing-file.md)\n")],
    ]) {
      const file = path.join(dir, relative);
      const original = fs.readFileSync(file);
      if (replacement) fs.writeFileSync(file, replacement);
      else fs.unlinkSync(file);
      assert.throws(() => checkPackage(dir), relative);
      fs.writeFileSync(file, original);
    }
    checkPackage(dir);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test("Markdown examples in fences are not installed dependencies", () => {
  assert.deepEqual(markdownLinks("```\n[example](fake.md)\n```\n[real](real.md)"), ["real.md"]);
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
    suite: { deterministicTestsPassed: true, skills: 58, playbooks: 23,
      dormantAutomationSkills: 3, sourceFiles: 573, externalIntegrationsExecuted: false },
    workflowSmoke: {
      taskSha256: sha256(fs.readFileSync(path.join(root, "codex/suite-smoke-task.md"))),
      receiptVerified: true, configurationVerified: true, artifactsReviewed: true,
      artifactSha256: Object.fromEntries(["help.md", "integration.md", "models.proposed.json", "recall.md"]
        .map(name => [name, "a".repeat(64)])),
    },
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
    e => { delete e.suite; },
    e => { e.suite.skills = 1; },
    e => { e.suite.deterministicTestsPassed = false; },
    e => { e.workflowSmoke.configurationVerified = false; },
    e => { e.workflowSmoke.artifactSha256["help.md"] = ""; },
  ]) {
    const invalid = structuredClone(evidence);
    change(invalid);
    assert.throws(() => validateAcceptance(invalid, "0.1.0", "c".repeat(64)));
  }
});
