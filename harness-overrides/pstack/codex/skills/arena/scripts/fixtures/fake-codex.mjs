import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (process.argv[2] === '--descendant') {
  process.on('SIGTERM', () => {});
  fs.writeFileSync('descendant-ready.json', JSON.stringify({ pid: process.pid }));
  setInterval(() => {}, 1000);
} else {
  await main();
}

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert(Date.now() < deadline, 'Fake rendezvous timed out');
    await delay(20);
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert.equal(args[0], 'exec');
  for (const flag of ['--ephemeral', '--skip-git-repo-check', '--json']) assert(args.includes(flag));
  const value = flag => {
    const index = args.indexOf(flag);
    assert(index >= 0, `Missing ${flag}`);
    return args[index + 1];
  };
  const dir = value('--cd');
  assert.equal(process.cwd(), dir);
  assert.equal(value('--sandbox'), 'workspace-write');
  assert.match(value('-c'), /^model_reasoning_effort="[a-z]+"$/);
  assert(value('--model'));
  const manifestFile = path.join(dir, 'manifest.json');
  assert(args.at(-1).includes(JSON.stringify(manifestFile)));
  assert(args.at(-1).includes('Use a tool'));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const taskBytes = fs.readFileSync(manifest.task_file);
  const task = JSON.parse(taskBytes.toString('utf8'));
  const config = task[manifest.candidate_id] ?? {};
  const mode = config.mode ?? 'success';
  const schema = JSON.parse(fs.readFileSync(value('--output-schema'), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort());
  let descendant;
  if (mode === 'tree-hang') {
    descendant = spawn(process.execPath, [fileURLToPath(import.meta.url), '--descendant'], {
      cwd: dir, shell: false, windowsHide: true, stdio: 'ignore',
    });
    descendant.once('error', error => { throw error; });
    await until(() => fs.existsSync(path.join(dir, 'descendant-ready.json')));
  }
  fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({
    pid: process.pid,
    descendant_pid: descendant?.pid ?? null,
  }));
  process.stdout.write(`${JSON.stringify({ event: 'ready', candidate_id: manifest.candidate_id })}\n`);
  process.stderr.write(`fake ${manifest.candidate_id}\n`);
  if (mode === 'hang' || mode === 'tree-hang') {
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
    return;
  }
  if (config.barrier) {
    await until(() => config.barrier.every(id => fs.existsSync(path.join(path.dirname(dir), id, 'ready.json'))));
  }
  const artifact = path.join(dir, 'artifact.txt');
  fs.writeFileSync(artifact, `synthetic artifact ${manifest.candidate_id}\n`);
  const receipt = {
    task_id: manifest.task_id,
    candidate_id: manifest.candidate_id,
    nonce: manifest.nonce,
    task_sha256: createHash('sha256').update(taskBytes).digest('hex'),
    artifact_paths: ['artifact.txt'],
    rationale: 'Used a plain text artifact; rejected extra dependencies.',
  };
  const wrongFields = {
    'bad-task': 'task_id', 'bad-candidate': 'candidate_id', 'bad-nonce': 'nonce', 'bad-hash': 'task_sha256',
  };
  if (wrongFields[mode]) receipt[wrongFields[mode]] = 'wrong';
  if (mode === 'missing-artifact') fs.unlinkSync(artifact);
  if (mode === 'empty-artifact') fs.truncateSync(artifact);
  if (mode === 'absolute-artifact') receipt.artifact_paths = [artifact];
  if (mode === 'windows-absolute') receipt.artifact_paths = ['C:\\outside\\artifact.txt'];
  if (mode === 'traversal-artifact') receipt.artifact_paths = ['../a/artifact.txt'];
  if (mode === 'backslash-artifact') receipt.artifact_paths = ['..\\a\\artifact.txt'];
  if (mode === 'metadata-artifact') receipt.artifact_paths = ['manifest.json'];
  if (mode === 'log-artifact') receipt.artifact_paths = ['stdout.jsonl'];
  if (mode === 'hardlink-artifact') {
    fs.linkSync(manifestFile, path.join(dir, 'copy.json'));
    receipt.artifact_paths = ['copy.json'];
  }
  if (mode === 'symlink-artifact') {
    fs.symlinkSync(path.join(path.dirname(dir), 'a'), path.join(dir, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir');
    receipt.artifact_paths = ['linked/artifact.txt'];
  }
  if (mode === 'manifest-tamper') {
    fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, nonce: 'changed' }));
  }
  if (mode === 'task-mutation') fs.appendFileSync(manifest.task_file, '\n ');
  if (mode === 'extra-field') receipt.extra = true;
  if (mode === 'missing-field') delete receipt.rationale;
  const encoded = mode === 'malformed-receipt' ? '{invalid' : JSON.stringify(receipt);
  fs.writeFileSync(value('--output-last-message'), encoded);
  if (mode === 'failure') process.exitCode = 17;
}
