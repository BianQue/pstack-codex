import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const hookPath = `.codex/hooks/${path.basename(script)}`;
const marker = 'arena-hook-binding-probe';
const events = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop'];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const lifetime = 10 * 60 * 1000;

function fingerprint(value) {
  return typeof value === 'string' && value.length > 0
    ? createHash('sha256').update(value).digest('hex')
    : null;
}

function observation(event) {
  if (!event || !events.includes(event.hook_event_name)) return;
  const tool = event.hook_event_name.endsWith('ToolUse');
  if (tool && !/(?:^|__)spawn_agent$/.test(event.tool_name)) return;

  let response = event.tool_response;
  if (typeof response === 'string') {
    try { response = JSON.parse(response); } catch { response = null; }
  }
  return {
    at: new Date().toISOString(),
    event: event.hook_event_name,
    session: fingerprint(event.session_id),
    actor: fingerprint(event.agent_id),
    turn: fingerprint(event.turn_id),
    call: fingerprint(event.tool_use_id),
    spawn_call: fingerprint(event.spawn_tool_use_id),
    spawned_agent: fingerprint(event.spawned_agent_id ?? response?.agent_id),
    ...(tool && {
      probe_message_matched: event.tool_input?.message === marker,
      independent_fork: event.tool_input?.fork_turns === 'none',
    }),
  };
}

function readJson(filename) {
  if (!lstatSync(filename).isFile()) throw new Error('Expected a regular probe file.');
  return JSON.parse(readFileSync(filename, 'utf8'));
}

function readOptional(filename) {
  try { return readJson(filename); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function writeJson(filename, value) {
  writeFileSync(filename, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
}

function prepare(dir) {
  if (!dir || !path.isAbsolute(dir)) throw new Error('Specify a new absolute scratch directory.');
  mkdirSync(dir, { mode: 0o700 });
  mkdirSync(path.dirname(path.join(dir, hookPath)), { recursive: true });
  mkdirSync(path.join(dir, 'observations'));
  copyFileSync(script, path.join(dir, hookPath));
  const command = `node ${hookPath} capture`;
  const hooks = Object.fromEntries(events.map(event => [
    event,
    [{
      ...(event.endsWith('ToolUse') ? { matcher: '(^|__)spawn_agent$' } : {}),
      hooks: [{ type: 'command', command, timeout: 5 }],
    }],
  ]));
  writeFileSync(path.join(dir, '.codex', 'hooks.json'), JSON.stringify({ hooks }, null, 2) + '\n');
}

function arm(dir, session) {
  if (!dir || !path.isAbsolute(dir) || !uuid.test(session)) {
    throw new Error('Specify the absolute probe directory and its parent Codex thread UUID.');
  }
  const target = realpathSync(dir);
  const probe = lstatSync(path.join(target, hookPath), { throwIfNoEntry: false })
    ?? lstatSync(path.join(target, path.basename(script)), { throwIfNoEntry: false });
  if (!probe?.isFile()
    || !lstatSync(path.join(target, 'observations')).isDirectory()) {
    throw new Error('Prepare the probe directory before arming it.');
  }
  writeJson(path.join(target, 'delivery.json'), { session: fingerprint(session), expires: Date.now() + lifetime });
}

function delivery(dir, event, row) {
  if (row.event.endsWith('ToolUse')) return 'spawn_observed';
  const authorization = readOptional(path.join(dir, 'delivery.json'));
  if (!authorization) return 'capture_only';
  if (!digest.test(authorization.session) || !Number.isSafeInteger(authorization.expires)) {
    return 'invalid_authorization';
  }
  if (authorization.session !== row.session) return 'session_mismatch';
  if (!row.actor) return 'missing_child_id';

  const claimFile = path.join(dir, 'delivery-claim.json');
  if (row.event === 'SubagentStop') {
    const claim = readOptional(claimFile);
    if (!claim || claim.actor !== row.actor || claim.session !== row.session) return 'no_delivery_for_child';
    return fingerprint(event.last_assistant_message?.trim()) === claim.marker_hash
      ? 'marker_acknowledged' : 'marker_not_acknowledged';
  }
  if (Date.now() >= authorization.expires) return 'authorization_expired';

  // This claims one synthetic smoke test, not an Arena candidate or a task.
  const token = `ARENA_HOOK_SMOKE_${randomUUID()}`;
  const markerHash = fingerprint(token);
  try {
    writeJson(claimFile, { session: row.session, actor: row.actor, marker_hash: markerHash });
  } catch (error) {
    if (error.code === 'EEXIST') return 'already_claimed';
    throw error;
  }
  row.marker_hash = markerHash;
  return { hookSpecificOutput: {
    hookEventName: 'SubagentStart',
    additionalContext: `This is a synthetic Hook delivery test. Do not use tools or modify files. Return exactly: ${token}`,
  } };
}

function capture() {
  const dir = path.resolve(path.dirname(realpathSync(script)), '..', '..');
  if (realpathSync(process.cwd()) !== dir) return;
  try {
    const event = JSON.parse(readFileSync(0, 'utf8'));
    const row = observation(event);
    if (!row) return;
    let output;
    try {
      output = delivery(dir, event, row);
      row.outcome = typeof output === 'string' ? output : 'marker_prepared';
    } catch {
      row.outcome = 'delivery_error';
    }
    writeJson(path.join(dir, 'observations', `${randomUUID()}.json`), row);
    if (row.outcome === 'marker_prepared') process.stdout.write(JSON.stringify(output) + '\n');
  } catch {
    process.stderr.write('Arena Hook probe could not read the event or write the observation.\n');
    process.exitCode = 1;
  }
}

if (process.argv[2] === 'prepare' && process.argv.length === 4) prepare(process.argv[3]);
else if (process.argv[2] === 'arm' && process.argv.length === 5) arm(process.argv[3], process.argv[4]);
else if (process.argv[2] === 'capture' && process.argv.length === 3) capture();
else throw new Error('Usage: arena-hook-probe.mjs prepare ABSOLUTE_NEW_DIRECTORY | arm ABSOLUTE_DIRECTORY SESSION_UUID');
