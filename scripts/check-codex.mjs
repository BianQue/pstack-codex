import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
}
export function checkPackage() {
  const manifest = json(path.join(pluginDir, "plugin.json"));
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(manifest.name, "pstack-codex");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.license, "MIT");
  const compat = json(path.join(pluginDir, ".codex-plugin/plugin.json"));
  assert.equal(compat.name, manifest.name);
  assert.equal(compat.version, manifest.version);
  assert.equal(compat.skills, "./skills/");
  assert.equal(fs.readFileSync(path.join(root, "pstack/LICENSE"), "utf8"),
    fs.readFileSync(path.join(pluginDir, "LICENSE"), "utf8"));
  assert.deepEqual(fs.readdirSync(path.join(pluginDir, "skills")), ["arena"]);
  const marketplace = json(path.join(root, ".agents/plugins/marketplace.json"));
  assert.equal(marketplace.name, "bianque-pstack-codex");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, manifest.name);
  assert.equal(marketplace.plugins[0].source.source, "local");
  assert.equal(path.resolve(root, marketplace.plugins[0].source.path), pluginDir);
  const skill = fs.readFileSync(path.join(pluginDir, "skills/arena/SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: arena\ndescription: "[^\n]+"\n---\n/);
  assert(!skill.includes("disable-model-invocation:"));
  for (const filename of files(pluginDir).filter(filename => filename.endsWith(".md"))) {
    const text = fs.readFileSync(filename, "utf8");
    assert(!/[a-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/i.test(text),
      "Personal path in package");
    for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
      const target = path.resolve(path.dirname(filename), href.split(/[?#]/)[0]);
      assert(target.startsWith(pluginDir + path.sep), `Link escaped package: ${href}`);
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
