import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLinks, relativeLink, skillMetadata, sourceFiles } from "./codex-package.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const pluginDir = path.join(root, "harness/pstack/codex");
export const json = filename => JSON.parse(fs.readFileSync(filename, "utf8"));
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function files(dir) {
  return fs.readdirSync(dir).sort().flatMap(name => {
    const filename = path.join(dir, name);
    assert(!fs.lstatSync(filename).isSymbolicLink(), `Unexpected symlink: ${filename}`);
    return fs.statSync(filename).isDirectory() ? files(filename) : [filename];
  });
}
export function fingerprint(dir = pluginDir) {
  const hash = createHash("sha256");
  for (const filename of files(dir)) {
    hash.update(path.relative(dir, filename).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(filename));
    hash.update("\0");
  }
  return hash.digest("hex");
}
export function validateAcceptance(evidence, version, digest) {
  assert.equal(evidence.version, version);
  assert.equal(evidence.pluginSha256, digest, "Acceptance belongs to another package");
  assert.equal(evidence.requestedModel, "gpt-6.1-sol");
  assert.equal(evidence.requestedReasoningEffort, "xhigh");
  assert.equal(evidence.modelIdentityVerified, false);
  assert.equal(evidence.taskSha256, sha256(fs.readFileSync(path.join(root, "codex/acceptance-task.md"))));
  assert.deepEqual(evidence.candidates.map(candidate => candidate.id).sort(), ["a", "b"]);
  for (const candidate of evidence.candidates) {
    assert.equal(candidate.receiptVerified, true);
    assert.equal(candidate.testsPassed, true);
    assert.equal(candidate.independentBehaviorPassed, true);
    assert.deepEqual(Object.keys(candidate.artifactSha256).sort(), ["selection.mjs", "selection.test.mjs"]);
    for (const hash of Object.values(candidate.artifactSha256)) assert.match(hash, /^[a-f0-9]{64}$/);
  }
  const coverage = json(path.join(pluginDir, "coverage.json"));
  assert.deepEqual(evidence.suite, {
    deterministicTestsPassed: true,
    skills: coverage.upstreamSkills.length, playbooks: coverage.playbooks.length,
    dormantAutomationSkills: coverage.dormantAutomationSkills.length,
    sourceFiles: coverage.sourceFiles.length,
    externalIntegrationsExecuted: false,
  }, "Full-suite acceptance is missing or stale");
}
export function checkPackage(dir = pluginDir) {
  const manifest = json(path.join(dir, "plugin.json"));
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(manifest.name, "pstack-codex");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.license, "MIT");
  const compat = json(path.join(dir, ".codex-plugin/plugin.json"));
  assert.equal(compat.name, manifest.name);
  assert.equal(compat.version, manifest.version);
  assert.equal(compat.skills, "./skills/");
  assert.equal(fs.readFileSync(path.join(root, "pstack/LICENSE"), "utf8"),
    fs.readFileSync(path.join(dir, "LICENSE"), "utf8"));
  const upstream = path.join(root, "pstack");
  const source = sourceFiles(upstream);
  const publicSkills = source.filter(file => /^skills\/[^/]+\/SKILL\.md$/.test(file));
  assert.deepEqual(fs.readdirSync(path.join(dir, "skills")).sort(),
    publicSkills.map(file => file.split("/")[1]).sort(), "Public skill set differs from upstream");
  const coverage = json(path.join(dir, "coverage.json"));
  assert.deepEqual(coverage.sourceFiles.map(file => file.path), source, "Incomplete upstream inventory");
  assert.deepEqual(coverage.playbooks, source.filter(file =>
    file.startsWith("skills/poteto-mode/playbooks/") && file.endsWith(".md")));
  assert.deepEqual(coverage.dormantAutomationSkills, source.filter(file =>
    file.startsWith("automations/") && file.endsWith("SKILL.md")));
  for (const entry of coverage.sourceFiles) {
    const original = fs.readFileSync(path.join(upstream, entry.path));
    assert.equal(entry.sourceSha256, sha256(original), `Stale source hash: ${entry.path}`);
    const excluded = entry.path.startsWith(".cursor-plugin/") || entry.path === ".gitignore";
    if (excluded) {
      assert.equal(entry.treatment, "host-metadata-excluded");
      assert(!fs.existsSync(path.join(dir, entry.path)));
      continue;
    }
    const output = fs.readFileSync(path.join(dir, entry.path));
    const override = path.join(root, "harness-overrides/pstack/codex", entry.path);
    const chosen = fs.existsSync(override) ? fs.readFileSync(override) : original;
    if (entry.path.endsWith("SKILL.md")) {
      const metadata = skillMetadata(chosen.toString("utf8"));
      const installed = skillMetadata(output.toString("utf8"));
      assert.equal(installed.name, metadata.name);
      assert.equal(installed.description, metadata.description);
      assert(installed.body.endsWith(metadata.body.trimStart()), `Truncated skill: ${entry.path}`);
      assert.match(installed.body, /read \[the Codex adapter\]/);
      assert(!output.toString("utf8").split("---")[1].includes("disable-model-invocation"));
    } else if (/^agents\/.*\.md$/.test(entry.path) || entry.path.endsWith("FOR_AGENTS.md")) {
      assert.match(output.toString("utf8"), /read \[the Codex adapter\]/);
    } else {
      assert(output.equals(chosen), `Resource bytes changed: ${entry.path}`);
    }
  }
  assert.deepEqual(coverage.upstreamSkills.map(skill => skill.name),
    publicSkills.map(file => file.split("/")[1]));
  for (const file of publicSkills) {
    const { name, manual } = skillMetadata(fs.readFileSync(path.join(upstream, file), "utf8"));
    const entry = coverage.upstreamSkills.find(skill => skill.name === name);
    assert.equal(entry.allowImplicitInvocation, !manual, `Invocation changed: ${name}`);
    assert.equal(fs.readFileSync(path.join(dir, `skills/${name}/agents/openai.yaml`), "utf8"),
      `policy:\n  allow_implicit_invocation: ${!manual}\n`);
  }
  const marketplace = json(path.join(root, ".agents/plugins/marketplace.json"));
  assert.equal(marketplace.name, "bianque-pstack-codex");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, manifest.name);
  assert.equal(marketplace.plugins[0].source.source, "local");
  assert.equal(path.resolve(root, marketplace.plugins[0].source.path), pluginDir);
  for (const filename of files(dir).filter(filename => filename.endsWith(".md"))) {
    const text = fs.readFileSync(filename, "utf8");
    assert(!/[a-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/i.test(text),
      "Personal path in package");
    const relative = path.relative(dir, filename).split(path.sep).join("/");
    for (const href of markdownLinks(text)) {
      // Upstream's citation-format example deliberately uses a literal URL placeholder.
      if (relative === "skills/why/references/synthesizer-prompt.md" && href === "url" &&
          text.includes("[PR #123](url)")) continue;
      const link = relativeLink(relative, href);
      if (!link) continue;
      const target = path.resolve(dir, link);
      assert(target === dir || target.startsWith(dir + path.sep), `Link escaped package: ${href}`);
      assert(fs.existsSync(target), `Broken link in ${filename}: ${href}`);
    }
  }
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = checkPackage();
  if (process.argv.includes("--release")) {
    validateAcceptance(json(path.join(root, "codex/acceptance.json")), manifest.version, fingerprint());
  }
  console.log(`Codex package verified: ${manifest.version} ${fingerprint()}`);
}
