import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.cwd();
const tmpRoot = path.join(projectRoot, '.tmp');
const runner = path.join(scriptDir, 'codex-arena.mjs');
const fake = path.join(scriptDir, 'fixtures', 'fake-codex.mjs');
const windows = process.platform === 'win32';

async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    assert(Date.now() < deadline, `Timed out waiting for ${label}`);
    await delay(20);
  }
}

async function terminate(pid, group = false) {
  if (!pid) return;
  if (windows) {
    const killed = await new Promise(resolve => {
      const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        shell: false, windowsHide: true, stdio: 'ignore',
      });
      child.once('error', () => resolve(false));
      child.once('close', code => resolve(code === 0));
    });
    if (!killed) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  } else {
    try { process.kill(group ? -pid : pid, 'SIGKILL'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      return !/^\d+ \(.+\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'));
    }
    return true;
  } catch (error) {
    if (error.code === 'ESRCH' || error.code === 'ENOENT') return false;
    throw error;
  }
}

async function workspace(callback) {
  const createdTmp = !fs.existsSync(tmpRoot);
  fs.mkdirSync(tmpRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmpRoot, 'codex-arena-'));
  const runs = [];
  try {
    await callback(root, runs);
  } finally {
    for (const run of runs) {
      if (!run.closed) {
        run.child.stdin?.end('cancel\n');
        try { await waitFor(() => run.closed, 'runner cleanup', 1000); } catch {}
      }
      for (const id of ['a', 'b']) {
        const readyFile = path.join(root, 'run', id, 'ready.json');
        if (fs.existsSync(readyFile)) {
          const ready = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
          if (ready.descendant_pid && alive(ready.descendant_pid)) await terminate(ready.descendant_pid);
          if (alive(ready.pid)) await terminate(ready.pid, !windows);
        }
      }
      if (!run.closed) {
        try { await waitFor(() => run.closed, 'runner exit', 1000); } catch {
          await terminate(run.child.pid, !windows);
        }
      }
      await run.done;
    }
    const resolved = fs.realpathSync(root);
    assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
    assert.equal(path.dirname(resolved), fs.realpathSync(tmpRoot));
    assert(path.basename(resolved).startsWith('codex-arena-'));
    fs.rmSync(resolved, { recursive: true, force: true });
    if (createdTmp) fs.rmdirSync(tmpRoot);
  }
}

function start(root, runs, task = {}, overrides = {}, interactive = false) {
  const taskFile = path.join(root, 'task.json');
  fs.writeFileSync(taskFile, `${JSON.stringify(task)}\n`);
  const spec = {
    taskFile, runDir: path.join(root, 'run'),
    codexCommand: [process.execPath, fake], timeoutMs: 4000,
    candidates: ['a', 'b'], ...overrides,
  };
  const specFile = path.join(root, 'spec.json');
  fs.writeFileSync(specFile, JSON.stringify(spec));
  const run = { spec, stdout: '', stderr: '', closed: false };
  const stdoutFile = path.join(root, 'cli-stdout.log');
  const stderrFile = path.join(root, 'cli-stderr.log');
  const handles = [fs.openSync(stdoutFile, 'wx'), fs.openSync(stderrFile, 'wx')];
  let child;
  try {
    child = spawn(process.execPath, [runner, specFile], {
      cwd: projectRoot, shell: false, detached: !windows, windowsHide: true,
      stdio: [interactive ? 'pipe' : 'ignore', ...handles],
    });
  } finally {
    for (const handle of handles) fs.closeSync(handle);
  }
  run.child = child;
  child.stdin?.on('error', error => {
    if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') run.stdinError = error;
  });
  run.done = new Promise(resolve => {
    child.once('error', error => { run.spawnError = error; });
    child.once('close', (code, signal) => {
      run.closed = true;
      run.code = code;
      run.signal = signal;
      run.stdout = fs.readFileSync(stdoutFile, 'utf8');
      run.stderr = fs.readFileSync(stderrFile, 'utf8');
      resolve(run);
    });
  });
  runs.push(run);
  return run;
}

async function finish(run) {
  await waitFor(() => run.closed, 'runner completion');
  await run.done;
  assert.equal(run.spawnError, undefined, `CLI spawn failed: ${run.spawnError?.stack}`);
  assert.equal(run.stdinError, undefined);
  return run;
}

function result(run) {
  const filename = path.join(run.spec.runDir, 'result.json');
  assert(fs.existsSync(filename), `Missing result.json; code=${run.code}; stderr=${run.stderr}`);
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

async function ready(run, id) {
  return waitFor(() => {
    const filename = path.join(run.spec.runDir, id, 'ready.json');
    if (fs.existsSync(filename)) {
      try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch {}
    }
    if (run.closed) {
      const filename = path.join(run.spec.runDir, 'result.json');
      const output = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
      assert.fail(`Runner exited before ${id} became ready: ${run.stderr}\n${output}`);
    }
    return false;
  }, `${id} readiness`);
}

test('two concurrent successes retain exact invocation, identity, logs, and artifacts', { timeout: 12000 }, async () => {
  await workspace(async (root, runs) => {
    const barrier = ['a', 'b'];
    const run = start(root, runs, { a: { barrier }, b: { barrier } });
    await finish(run);
    assert.equal(run.code, 0, run.stderr);
    const output = result(run);
    assert.equal(output.requested_model, 'gpt-6.1-sol');
    assert.equal(output.requested_reasoning_effort, 'xhigh');
    assert.equal(output.model_identity_verified, false);
    const hash = createHash('sha256').update(fs.readFileSync(run.spec.taskFile)).digest('hex');
    assert.equal(output.task_sha256, hash);
    assert.equal(output.candidates.length, 2);
    const nonces = new Set();
    for (const candidate of output.candidates) {
      assert.equal(candidate.status, 'passed', candidate.error);
      assert.equal(candidate.exit_code, 0);
      assert(candidate.pid > 0);
      assert.equal(candidate.signal, null);
      assert.equal(candidate.receipt.candidate_id, candidate.candidate_id);
      assert.equal(candidate.receipt.task_id, output.task_id);
      assert.equal(candidate.receipt.task_sha256, hash);
      nonces.add(candidate.receipt.nonce);
      assert.deepEqual(candidate.command.slice(0, 7), [
        process.execPath, fake, 'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'workspace-write',
      ]);
      const args = candidate.command;
      assert.equal(args[args.indexOf('--cd') + 1], candidate.output_dir);
      assert.equal(args[args.indexOf('--model') + 1], 'gpt-6.1-sol');
      assert.equal(args[args.indexOf('-c') + 1], 'model_reasoning_effort="xhigh"');
      const artifact = fs.readFileSync(path.join(candidate.output_dir, candidate.receipt.artifact_paths[0]), 'utf8');
      assert.equal(artifact, `synthetic artifact ${candidate.candidate_id}\n`);
      assert.match(fs.readFileSync(path.join(candidate.output_dir, 'stdout.jsonl'), 'utf8'), /"event":"ready"/);
      assert.match(fs.readFileSync(path.join(candidate.output_dir, 'stderr.log'), 'utf8'), /fake /);
    }
    assert.equal(nonces.size, 2);
  });
});

test('mixed exit failure preserves the successful candidate and rejects a valid-looking receipt', async () => {
  await workspace(async (root, runs) => {
    const run = start(root, runs, { b: { mode: 'failure' } });
    await finish(run);
    assert.equal(run.code, 1);
    const [a, b] = result(run).candidates;
    assert.equal(a.status, 'passed');
    assert.equal(b.status, 'failed');
    assert.equal(b.exit_code, 17);
    assert.match(b.error, /code 17/);
    assert.equal(b.receipt, undefined);
    assert(fs.existsSync(path.join(b.output_dir, 'receipt.json')));
  });
});

for (const [mode, error] of [
  ['bad-task', /task_id/], ['bad-candidate', /candidate_id/], ['bad-nonce', /nonce/],
  ['bad-hash', /task_sha256/], ['missing-artifact', /ENOENT/], ['empty-artifact', /nonempty/],
  ['absolute-artifact', /relative path/], ['windows-absolute', /relative path/],
  ['traversal-artifact', /traversal/], ['backslash-artifact', /relative path/],
  ['metadata-artifact', /metadata/], ['log-artifact', /metadata/],
  ['hardlink-artifact', /owned separately/], ['manifest-tamper', /Manifest identity/],
  ['extra-field', /receipt fields/], ['missing-field', /receipt fields/],
  ['malformed-receipt', /JSON|property name/],
]) {
  test(`rejects ${mode}`, async () => {
    await workspace(async (root, runs) => {
      const run = start(root, runs, { a: { mode } }, { candidates: ['a'] });
      await finish(run);
      assert.equal(run.code, 1);
      const [candidate] = result(run).candidates;
      assert.equal(candidate.exit_code, 0);
      assert.equal(candidate.status, 'failed');
      assert.match(candidate.error, error);
      assert.equal(candidate.receipt, undefined);
    });
  });
}

test('rejects a junction or symlink to another candidate', async t => {
  await workspace(async (root, runs) => {
    const probe = path.join(root, 'probe');
    const target = path.join(root, 'target');
    fs.mkdirSync(target);
    try {
      fs.symlinkSync(target, probe, windows ? 'junction' : 'dir');
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
      t.skip(`Directory symlinks unavailable: ${error.code}`);
      return;
    }
    const run = start(root, runs, { b: { mode: 'symlink-artifact' } });
    await finish(run);
    assert.equal(run.code, 1);
    const [a, b] = result(run).candidates;
    assert.equal(a.status, 'passed');
    assert.equal(b.status, 'failed');
    assert.match(b.error, /symlinks/);
  });
});

test('shared task changes invalidate every successful receipt', async () => {
  await workspace(async (root, runs) => {
    const run = start(root, runs, { b: { mode: 'task-mutation' } });
    await finish(run);
    assert.equal(run.code, 1);
    for (const candidate of result(run).candidates) {
      assert.equal(candidate.status, 'failed');
      assert.match(candidate.error, /Shared task hash changed/);
      assert.equal(candidate.receipt, undefined);
    }
  });
});

test('existing runDir is preserved without launching candidates', async () => {
  await workspace(async (root, runs) => {
    const runDir = path.join(root, 'run');
    fs.mkdirSync(runDir);
    const sentinel = path.join(runDir, 'keep.txt');
    fs.writeFileSync(sentinel, 'keep exactly');
    const run = start(root, runs);
    await finish(run);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /EEXIST/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep exactly');
    assert.deepEqual(fs.readdirSync(runDir), ['keep.txt']);
  });
});

for (const [label, overrides, error] of [
  ['relative task', { taskFile: 'task.json' }, /absolute path/],
  ['relative runDir', { runDir: 'run' }, /absolute path/],
  ['missing task', { taskFile: undefined }, /taskFile/],
  ['missing command', { codexCommand: undefined }, /codexCommand/],
  ['empty command', { codexCommand: [] }, /codexCommand/],
  ['relative command', { codexCommand: ['codex'] }, /absolute path/],
  ['NUL argument', { codexCommand: [process.execPath, '\0'] }, /codexCommand/],
  ['bad ID', { candidates: ['../outside'] }, /candidate IDs/],
  ['Windows reserved ID', { candidates: ['con'] }, /candidate IDs/],
  ['duplicate IDs', { candidates: ['a', 'a'] }, /Duplicate/],
  ['empty candidates', { candidates: [] }, /candidate IDs/],
  ['bad model', { model: 'gpt; echo bad' }, /model slug/],
  ['bad effort', { reasoningEffort: 'invalid' }, /reasoningEffort/],
  ['null effort', { reasoningEffort: null }, /reasoningEffort/],
  ['zero timeout', { timeoutMs: 0 }, /timeoutMs/],
  ['fractional timeout', { timeoutMs: 1.5 }, /timeoutMs/],
  ['timer overflow', { timeoutMs: 2147483648 }, /timeoutMs/],
]) {
  test(`boundary rejects ${label} before creating runDir`, async () => {
    await workspace(async (root, runs) => {
      const run = start(root, runs, {}, overrides);
      await finish(run);
      assert.equal(run.code, 1);
      assert.match(run.stderr, error);
      assert.equal(fs.existsSync(path.join(root, 'run')), false);
    });
  });
}

test('same task/run target and missing executable are refused', async () => {
  await workspace(async (root, runs) => {
    const run = start(root, runs, {}, { runDir: path.join(root, 'task.json') });
    await finish(run);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /must differ/);
    assert.equal(fs.readFileSync(run.spec.taskFile, 'utf8'), '{}\n');
  });
  await workspace(async (root, runs) => {
    const run = start(root, runs, {}, { codexCommand: [path.join(root, 'missing.exe')] });
    await finish(run);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /ENOENT/);
    assert.equal(fs.existsSync(run.spec.runDir), false);
  });
});

test('explicit model and effort pass through without fallback', async () => {
  await workspace(async (root, runs) => {
    const run = start(root, runs, {}, { model: 'test-model.1', reasoningEffort: 'high', candidates: ['a'] });
    await finish(run);
    assert.equal(run.code, 0, run.stderr);
    const output = result(run);
    assert.equal(output.requested_model, 'test-model.1');
    assert.equal(output.requested_reasoning_effort, 'high');
    assert(output.candidates[0].command.includes('model_reasoning_effort="high"'));
  });
});

test('timeout waits for the owned parent and descendant to exit', { timeout: 12000 }, async () => {
  await workspace(async (root, runs) => {
    const sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      shell: false, windowsHide: true, stdio: 'ignore',
    });
    const sentinelReady = new Promise((resolve, reject) => {
      sentinel.once('spawn', resolve);
      sentinel.once('error', reject);
    });
    const sentinelDone = new Promise(resolve => sentinel.once('close', resolve));
    try {
      await sentinelReady;
      const run = start(root, runs, { a: { mode: 'tree-hang' } }, { candidates: ['a'], timeoutMs: 1500 });
      const processIds = await ready(run, 'a');
      assert(alive(processIds.pid));
      assert(alive(processIds.descendant_pid));
      await finish(run);
      assert.equal(run.code, 1);
      const [candidate] = result(run).candidates;
      assert.equal(candidate.status, 'timeout', candidate.error);
      assert.match(candidate.error, /Exceeded 1500ms/);
      assert.equal(candidate.receipt, undefined);
      await waitFor(() => !alive(processIds.pid) && !alive(processIds.descendant_pid), 'owned tree exit');
      assert(alive(sentinel.pid), 'Unrelated process must survive');
    } finally {
      await terminate(sentinel.pid);
      await sentinelDone;
    }
  });
});

test('stdin cancel waits for every owned tree and records cancellation', { timeout: 12000 }, async () => {
  await workspace(async (root, runs) => {
    const run = start(root, runs, { a: { mode: 'tree-hang' }, b: { mode: 'hang' } },
      { timeoutMs: 20000 }, true);
    const [a, b] = await Promise.all([ready(run, 'a'), ready(run, 'b')]);
    run.child.stdin.write('cancel\n');
    await finish(run);
    assert.equal(run.code, 1);
    for (const candidate of result(run).candidates) {
      assert.equal(candidate.status, 'cancelled', candidate.error);
      assert.equal(candidate.receipt, undefined);
    }
    await waitFor(() => [a.pid, a.descendant_pid, b.pid].every(pid => !alive(pid)), 'cancelled tree exit');
  });
});

if (!windows) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    test(`${signal} cancels gracefully and writes results`, { timeout: 12000 }, async () => {
      await workspace(async (root, runs) => {
        const run = start(root, runs, { a: { mode: 'hang' } }, { candidates: ['a'], timeoutMs: 20000 });
        const owned = await ready(run, 'a');
        run.child.kill(signal);
        await finish(run);
        assert.equal(run.code, 1);
        assert.equal(run.signal, null);
        assert.equal(result(run).candidates[0].status, 'cancelled');
        await waitFor(() => !alive(owned.pid), 'signalled child exit');
      });
    });
  }
}
