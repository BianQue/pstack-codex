import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';

const windows = process.platform === 'win32';
const reservedNames = ['manifest.json', 'receipt.schema.json', 'receipt.json', 'stdout.jsonl', 'stderr.log'];
const receiptKeys = ['task_id', 'candidate_id', 'nonce', 'task_sha256', 'artifact_paths', 'rationale'];
const schema = {
  type: 'object',
  additionalProperties: false,
  required: receiptKeys,
  properties: {
    task_id: { type: 'string', minLength: 1 },
    candidate_id: { type: 'string', minLength: 1 },
    nonce: { type: 'string', minLength: 1 },
    task_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    artifact_paths: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    rationale: { type: 'string', minLength: 1 },
  },
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function absolutePath(value, label) {
  check(typeof value === 'string' && value.trim() && !/[\x00-\x1f]/.test(value)
    && path.isAbsolute(value), `${label} must be an absolute path`);
  if (windows) {
    const tail = value.slice(path.parse(value).root.length);
    check(!/[<>:"|?*]/.test(tail), `${label} contains invalid path characters`);
    check(!tail.split(/[\\/]/).some(part => /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
    `${label} contains an unsupported Windows path component`);
  }
  return path.resolve(value);
}

function regularFile(filename) {
  const stat = fs.lstatSync(filename);
  check(stat.isFile() && !stat.isSymbolicLink(), `Expected a regular file: ${filename}`);
  return stat;
}

function hashTask(filename) {
  regularFile(filename);
  const contents = fs.readFileSync(filename);
  new TextDecoder('utf-8', { fatal: true }).decode(contents);
  return createHash('sha256').update(contents).digest('hex');
}

function readJson(filename) {
  regularFile(filename);
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

function loadSpec(filename) {
  const spec = readJson(absolutePath(filename, 'SPEC'));
  check(spec && typeof spec === 'object' && !Array.isArray(spec), 'SPEC must be an object');
  spec.taskFile = absolutePath(spec.taskFile, 'taskFile');
  spec.runDir = absolutePath(spec.runDir, 'runDir');
  check(spec.runDir !== path.parse(spec.runDir).root, 'runDir cannot be a filesystem root');
  check(spec.taskFile !== spec.runDir, 'taskFile and runDir must differ');
  check(Array.isArray(spec.codexCommand) && spec.codexCommand.length > 0
    && spec.codexCommand.every(arg => typeof arg === 'string' && arg.length && !arg.includes('\0')),
  'codexCommand must be a nonempty argv vector');
  spec.codexCommand[0] = absolutePath(spec.codexCommand[0], 'codexCommand[0]');
  check(fs.statSync(spec.codexCommand[0]).isFile(), 'codexCommand executable must be a file');
  if (windows) {
    check(/\.(exe|com)$/i.test(spec.codexCommand[0]), 'codexCommand must use a native executable');
  } else {
    fs.accessSync(spec.codexCommand[0], fs.constants.X_OK);
  }
  spec.model = spec.model === undefined ? 'gpt-6.1-sol' : spec.model;
  spec.reasoningEffort = spec.reasoningEffort === undefined ? 'xhigh' : spec.reasoningEffort;
  spec.timeoutMs = spec.timeoutMs === undefined ? 120000 : spec.timeoutMs;
  check(typeof spec.model === 'string' && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(spec.model)
    && spec.model.length <= 128, 'Invalid model slug');
  check(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(spec.reasoningEffort),
    'Invalid reasoningEffort');
  check(Number.isSafeInteger(spec.timeoutMs) && spec.timeoutMs > 0 && spec.timeoutMs <= 2147483647,
    'timeoutMs must be an integer between 1 and 2147483647');
  check(Array.isArray(spec.candidates) && spec.candidates.length > 0
    && spec.candidates.every(id => typeof id === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(id)
      && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id)),
  'Unsupported candidate IDs');
  check(new Set(spec.candidates).size === spec.candidates.length, 'Duplicate candidate IDs');
  const taskHash = hashTask(spec.taskFile);
  spec.taskFile = fs.realpathSync(spec.taskFile);
  spec.runDir = path.join(fs.realpathSync(path.dirname(spec.runDir)), path.basename(spec.runDir));
  check(spec.taskFile !== spec.runDir, 'taskFile and runDir must differ');
  return { spec, taskHash };
}

function prepareCandidate(spec, taskId, taskHash, id) {
  const outputDir = path.join(spec.runDir, id);
  fs.mkdirSync(outputDir, { mode: 0o700 });
  const manifest = {
    task_id: taskId,
    candidate_id: id,
    nonce: randomUUID(),
    task_file: spec.taskFile,
    task_sha256: taskHash,
    output_dir: outputDir,
  };
  const manifestFile = path.join(outputDir, 'manifest.json');
  writeJson(manifestFile, manifest);
  writeJson(path.join(outputDir, 'receipt.schema.json'), schema);
  const prompt = [
    `Use a tool to read your private manifest at ${JSON.stringify(manifestFile)}.`,
    'Use a tool to read the shared UTF-8 task file named by task_file in that manifest.',
    'Compute the SHA-256 of the exact task file bytes yourself and verify task_sha256.',
    'Do the task only in your candidate cwd, output_dir. Do not change the shared task or any other directory.',
    'Create at least one nonempty regular artifact in your cwd. Do not count the manifest, schema, receipt, or logs.',
    'Return only the JSON receipt required by the output schema.',
    'Copy task_id, candidate_id, and nonce from your manifest and return the computed task_sha256.',
    'artifact_paths must contain relative paths within your cwd. rationale must briefly name alternatives and rejections.',
  ].join('\n');
  const args = [
    ...spec.codexCommand.slice(1), 'exec', '--ephemeral', '--skip-git-repo-check',
    '--sandbox', 'workspace-write', '--cd', outputDir, '--model', spec.model,
    '-c', `model_reasoning_effort="${spec.reasoningEffort}"`,
    '--output-schema', path.join(outputDir, 'receipt.schema.json'),
    '--output-last-message', path.join(outputDir, 'receipt.json'), '--json', prompt,
  ];
  return {
    manifest,
    result: {
      candidate_id: id,
      output_dir: outputDir,
      command: [spec.codexCommand[0], ...args],
      pid: null,
      exit_code: null,
      signal: null,
    },
  };
}

function validateReceipt(candidate) {
  const { manifest } = candidate;
  const dir = manifest.output_dir;
  check(fs.realpathSync(dir) === dir, 'Candidate output directory was replaced');
  const savedManifest = readJson(path.join(dir, 'manifest.json'));
  check(JSON.stringify(savedManifest) === JSON.stringify(manifest), 'Manifest identity changed');
  check(hashTask(manifest.task_file) === manifest.task_sha256, 'Shared task hash changed');
  const receipt = readJson(path.join(dir, 'receipt.json'));
  check(receipt && typeof receipt === 'object' && !Array.isArray(receipt)
    && Object.keys(receipt).length === receiptKeys.length
    && receiptKeys.every(key => Object.hasOwn(receipt, key)), 'Invalid receipt fields');
  for (const key of ['task_id', 'candidate_id', 'nonce', 'task_sha256']) {
    check(receipt[key] === manifest[key], `Receipt ${key} mismatch`);
  }
  check(typeof receipt.rationale === 'string' && receipt.rationale.trim(), 'Missing receipt rationale');
  check(Array.isArray(receipt.artifact_paths) && receipt.artifact_paths.length > 0,
    'Receipt must name at least one artifact');
  const reservedStats = reservedNames.map(name => regularFile(path.join(dir, name)));
  for (const relative of receipt.artifact_paths) {
    check(typeof relative === 'string' && relative.length > 0 && !path.isAbsolute(relative)
      && !path.win32.isAbsolute(relative) && !/[\\\x00-\x1f<>:"|?*]/.test(relative),
    'Artifact must be a portable relative path');
    const parts = relative.split('/');
    check(parts.every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part)),
      'Artifact path traversal is forbidden');
    check(!reservedNames.includes(parts[0]), 'Runner metadata and logs are not artifacts');
    let target = dir;
    for (const part of parts) {
      target = path.join(target, part);
      check(!fs.lstatSync(target).isSymbolicLink(), 'Artifact symlinks are forbidden');
    }
    const stat = regularFile(target);
    const resolved = fs.realpathSync(target);
    const within = path.relative(dir, resolved);
    check(within && within !== '..' && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within),
      'Artifact escaped candidate cwd');
    check(stat.size > 0, 'Artifact must be nonempty');
    check(stat.nlink === 1 && !reservedStats.some(other => other.dev === stat.dev && other.ino === stat.ino),
      'Artifact must be owned separately from other files');
  }
  return receipt;
}

async function killTree(pid) {
  if (windows) {
    await new Promise((resolve, reject) => {
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        shell: false, windowsHide: true, stdio: 'ignore',
      });
      killer.once('error', reject);
      killer.once('close', code => code === 0 ? resolve() : reject(new Error(`taskkill exited ${code}`)));
    });
  } else {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      try {
        process.kill(-pid, signal);
      } catch (error) {
        if (error.code === 'ESRCH') return;
        throw error;
      }
      if (signal === 'SIGTERM') await delay(200);
    }
  }
}

async function runCandidate(candidate, timeoutMs, active) {
  const { result, manifest } = candidate;
  let child;
  let timer;
  let retryTimer;
  let closed = false;
  let stopReason;
  let spawnError;
  let stopping;
  let cleanupError;
  const stop = reason => {
    if (closed || stopReason) return;
    stopReason = reason;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const terminate = async () => {
      try {
        await killTree(child.pid);
      } catch (error) {
        cleanupError = error.message;
        if (!closed) {
          retryTimer = setTimeout(() => { stopping = terminate(); }, 200);
          retryTimer.unref();
        }
      }
    };
    stopping = terminate();
  };
  active.add(stop);
  const handles = [];
  try {
    handles.push(fs.openSync(path.join(manifest.output_dir, 'stdout.jsonl'), 'wx', 0o600));
    handles.push(fs.openSync(path.join(manifest.output_dir, 'stderr.log'), 'wx', 0o600));
    child = spawn(result.command[0], result.command.slice(1), {
      cwd: manifest.output_dir, shell: false, detached: !windows, windowsHide: true,
      stdio: ['ignore', handles[0], handles[1]],
    });
    result.pid = child.pid ?? null;
    const completion = new Promise(resolve => {
      child.once('error', error => { spawnError = error; });
      child.once('close', (code, signal) => {
        closed = true;
        result.exit_code = code;
        result.signal = signal;
        clearTimeout(timer);
        clearTimeout(retryTimer);
        resolve();
      });
    });
    timer = setTimeout(() => stop('timeout'), timeoutMs);
    timer.unref();
    await completion;
    await stopping;
    if (stopReason) {
      result.status = stopReason;
      result.error = `${stopReason === 'timeout' ? `Exceeded ${timeoutMs}ms` : 'Parent requested cancellation'}${cleanupError ? `; cleanup: ${cleanupError}` : ''}`;
    } else {
      if (spawnError) throw spawnError;
      check(result.exit_code === 0 && !result.signal,
        `Process exited with code ${result.exit_code}, signal ${result.signal}`);
      result.receipt = validateReceipt(candidate);
      result.status = 'passed';
    }
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
  } finally {
    active.delete(stop);
    clearTimeout(timer);
    clearTimeout(retryTimer);
    for (const handle of handles) fs.closeSync(handle);
  }
  return result;
}

async function main() {
  check(process.argv.length === 3, 'Usage: node codex-arena.mjs ABSOLUTE_SPEC.json');
  const { spec, taskHash } = loadSpec(process.argv[2]);
  fs.mkdirSync(spec.runDir, { mode: 0o700 });
  const taskId = randomUUID();
  const active = new Set();
  const cancel = () => { for (const stop of active) stop('cancelled'); };
  const input = createInterface({ input: process.stdin, terminal: false });
  input.on('line', line => { if (line.trim() === 'cancel') cancel(); });
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const candidates = spec.candidates.map(id => prepareCandidate(spec, taskId, taskHash, id));
    const results = await Promise.all(candidates.map(candidate => runCandidate(candidate, spec.timeoutMs, active)));
    let taskError;
    try {
      check(hashTask(spec.taskFile) === taskHash, 'Shared task hash changed');
    } catch (error) {
      taskError = error.message;
    }
    if (taskError) {
      for (const result of results) {
        if (result.status === 'passed') {
          result.status = 'failed';
          result.error = taskError;
          delete result.receipt;
        }
      }
    }
    writeJson(path.join(spec.runDir, 'result.json'), {
      task_id: taskId,
      task_file: spec.taskFile,
      task_sha256: taskHash,
      requested_model: spec.model,
      requested_reasoning_effort: spec.reasoningEffort,
      model_identity_verified: false,
      candidates: results,
    });
    process.exitCode = results.every(result => result.status === 'passed') ? 0 : 1;
  } finally {
    input.close();
    process.stdin.pause();
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
