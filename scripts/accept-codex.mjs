import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { checkPackage, fingerprint, json, pluginDir, root, sha256, validateAcceptance } from "./check-codex.mjs";

const verify = process.argv.includes("--verify");
const [codexBin, evidenceDir, installedDir = pluginDir] = process.argv.slice(2).filter(arg => arg !== "--verify");
assert(codexBin && path.isAbsolute(codexBin) && fs.statSync(codexBin).isFile(),
  "Usage: node scripts/accept-codex.mjs ABSOLUTE_CODEX_BIN NEW_ABSOLUTE_EVIDENCE_DIR [INSTALLED_PLUGIN_DIR]");
assert(evidenceDir && path.isAbsolute(evidenceDir));
const manifest = checkPackage();
const digest = fingerprint();
assert.equal(fingerprint(installedDir), digest, "Installed package differs from generated package");
const taskFile = path.join(evidenceDir, "task.md");
const specFile = path.join(evidenceDir, "spec.json");
const runDir = path.join(evidenceDir, "run");
async function run(command, args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false, windowsHide: true });
    child.once("error", reject);
    child.once("close", (code, signal) =>
      code === 0 && !signal ? resolve() : reject(new Error(`${path.basename(command)} exited ${code} ${signal}`)));
  });
}
if (!verify) {
  fs.mkdirSync(evidenceDir, { recursive: false });
  fs.copyFileSync(path.join(root, "codex/acceptance-task.md"), taskFile);
  fs.writeFileSync(path.join(evidenceDir, "package.json"), JSON.stringify({ pluginSha256: digest }));
  fs.writeFileSync(specFile, JSON.stringify({
    taskFile, runDir, codexCommand: [codexBin], model: "gpt-6.1-sol",
    reasoningEffort: "xhigh", timeoutMs: 360000, candidates: ["a", "b"],
  }, null, 2));
  await run(process.execPath, [path.join(installedDir, "skills/arena/scripts/codex-arena.mjs"), specFile]);
  const smokeTask = path.join(evidenceDir, "suite-task.md");
  const smokeProject = path.join(evidenceDir, "project");
  fs.mkdirSync(path.join(smokeProject, ".agents/pstack"), { recursive: true });
  fs.writeFileSync(path.join(smokeProject, ".agents/pstack/models.json"),
    JSON.stringify({ acceptanceSentinel: "preserve-me" }, null, 2) + "\n");
  fs.writeFileSync(smokeTask, fs.readFileSync(path.join(root, "codex/suite-smoke-task.md"), "utf8") +
    `\nInstalled plugin: ${installedDir}\nTarget project: ${smokeProject}\n`);
  const smokeSpec = path.join(evidenceDir, "suite-spec.json");
  fs.writeFileSync(smokeSpec, JSON.stringify({
    taskFile: smokeTask, runDir: path.join(evidenceDir, "suite-run"),
    codexCommand: [codexBin], model: "gpt-6.1-sol", reasoningEffort: "xhigh",
    timeoutMs: 600000, candidates: ["suite"],
  }, null, 2));
  await run(process.execPath, [path.join(installedDir, "skills/arena/scripts/codex-arena.mjs"), smokeSpec]);
  console.log("Delivery complete. Read both candidates and all suite smoke artifacts, then rerun with --verify.");
  process.exit(0);
}
assert.equal(json(path.join(evidenceDir, "package.json")).pluginSha256, digest,
  "Package changed since candidate launch");
const result = json(path.join(runDir, "result.json"));
assert.equal(result.requested_model, "gpt-6.1-sol");
assert.equal(result.requested_reasoning_effort, "xhigh");
assert.equal(result.model_identity_verified, false);
const candidates = [];
for (const candidate of result.candidates) {
  assert.equal(candidate.status, "passed", candidate.error);
  assert.equal(candidate.exit_code, 0);
  const dir = path.join(runDir, candidate.candidate_id);
  for (const name of ["selection.mjs", "selection.test.mjs"]) assert(candidate.receipt.artifact_paths.includes(name));
  await run(process.execPath, [path.join(dir, "selection.test.mjs")], dir);
  await run(process.execPath, [path.join(root, "codex/verify-candidate.mjs"), path.join(dir, "selection.mjs")], dir);
  candidates.push({
    id: candidate.candidate_id, receiptVerified: true, testsPassed: true, independentBehaviorPassed: true,
    artifactSha256: Object.fromEntries(["selection.mjs", "selection.test.mjs"]
      .map(name => [name, sha256(fs.readFileSync(path.join(dir, name)))])),
  });
}
const smoke = json(path.join(evidenceDir, "suite-run/result.json"));
const smokeCandidate = smoke.candidates[0];
assert.equal(smoke.candidates.length, 1);
assert.equal(smoke.requested_model, "gpt-6.1-sol");
assert.equal(smoke.requested_reasoning_effort, "xhigh");
assert.equal(smokeCandidate.status, "passed", smokeCandidate.error);
assert.equal(smokeCandidate.exit_code, 0);
const smokeDir = path.join(evidenceDir, "suite-run/suite");
const smokeArtifacts = ["help.md", "integration.md", "models.proposed.json", "recall.md"];
assert.deepEqual(smokeCandidate.receipt.artifact_paths.slice().sort(), smokeArtifacts);
const settings = json(path.join(smokeDir, "models.proposed.json"));
assert.deepEqual(json(path.join(evidenceDir, "project/.agents/pstack/models.json")), settings,
  "Parent must review and apply the model proposal through the permission flow before verification");
assert.equal(settings.acceptanceSentinel, "preserve-me");
assert.equal(settings.budget, "large");
assert.equal(Object.keys(settings.roles).length, 17);
assert.deepEqual(settings.roles["arena cross-judge pool"], []);
for (const [role, seats] of Object.entries(settings.roles)) {
  if (role === "arena cross-judge pool") continue;
  assert.equal(seats.length, ["arena runners", "architect runners", "interrogate reviewers"].includes(role) ? 2 : 1);
  for (const seat of seats) assert.deepEqual(seat, { model: "gpt-6.1-sol", reasoningEffort: "xhigh" });
}
for (const name of ["help.md", "recall.md", "integration.md"]) {
  assert(fs.readFileSync(path.join(smokeDir, name), "utf8").trim().length > 100, `Empty smoke result: ${name}`);
}
assert.equal(fingerprint(), digest, "Package changed during acceptance");
assert.equal(fingerprint(installedDir), digest, "Installed package changed during acceptance");
await run(process.execPath, [path.join(root, "scripts/test-codex.mjs"), installedDir]);
const coverage = json(path.join(installedDir, "coverage.json"));
const evidence = {
  version: manifest.version, pluginSha256: digest, completedAt: new Date().toISOString(),
  platform: process.platform, node: process.version, requestedModel: result.requested_model,
  requestedReasoningEffort: result.requested_reasoning_effort, modelIdentityVerified: false,
  taskSha256: result.task_sha256, candidates,
  suite: {
    deterministicTestsPassed: true,
    skills: coverage.upstreamSkills.length, playbooks: coverage.playbooks.length,
    dormantAutomationSkills: coverage.dormantAutomationSkills.length,
    sourceFiles: coverage.sourceFiles.length,
    externalIntegrationsExecuted: false,
  },
  workflowSmoke: {
    taskSha256: sha256(fs.readFileSync(path.join(root, "codex/suite-smoke-task.md"))),
    receiptVerified: true, configurationVerified: true, artifactsReviewed: true,
    artifactSha256: Object.fromEntries(smokeArtifacts.map(name =>
      [name, sha256(fs.readFileSync(path.join(smokeDir, name)))])),
  },
};
validateAcceptance(evidence, manifest.version, digest);
fs.writeFileSync(path.join(root, "codex/acceptance.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(`Accepted installed package: ${digest}; private logs retained in supplied evidence directory.`);
