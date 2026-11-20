import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const session = '0189abcd-0123-4567-89ab-0123456789ab';
const start = { hook_event_name: 'SubagentStart', session_id: session, agent_id: 'child-thread' };
const script = fileURLToPath(new URL('./arena-hook-probe.mjs', import.meta.url));

function setupProbe(t) {
  const parent = path.resolve('.tmp');
  mkdirSync(parent, { recursive: true });
  const scratch = mkdtempSync(path.join(parent, 'arena-hook-probe-'));
  t.after(() => {
    const resolved = realpathSync(scratch);
    assert.equal(path.dirname(resolved), realpathSync(parent));
    assert.equal(path.basename(resolved), path.basename(scratch));
    rmSync(resolved, { recursive: true, force: true });
  });
  const dir = path.join(scratch, 'probe');
  const setup = spawnSync(process.execPath, [script, 'prepare', dir], { encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr);
  const invoke = (input, cwd = dir) => {
    const result = spawnSync(process.execPath, [path.join(dir, path.basename(script)), 'capture'],
      { cwd, input: JSON.stringify(input), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const outputs = path.join(dir, 'observations');
  const records = () => readdirSync(outputs).map(name =>
    JSON.parse(readFileSync(path.join(outputs, name), 'utf8')));
  return { dir, scratch, invoke, records };
}

test('default probe records metadata only, including when the spawn body is opaque', t => {
  const { dir, scratch, invoke, records } = setupProbe(t);
  const config = JSON.parse(readFileSync(path.join(dir, '.codex', 'hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.hooks), ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop']);

  const dispatch = {
    hook_event_name: 'PostToolUse',
    session_id: session,
    tool_name: 'spawn_agent',
    tool_use_id: 'spawn-call',
    tool_input: { message: 'arena-hook-binding-probe', fork_turns: 'none' },
    tool_response: '{"agent_id":"child-thread","extra":"untrusted response"}',
    transcript_path: 'transcript-must-not-be-read',
  };
  assert.equal(invoke(dispatch, scratch), '');
  assert.equal(invoke({ ...dispatch, tool_name: 'another_tool' }), '');
  assert.equal(invoke({ ...dispatch, hook_event_name: 'PreToolUse',
    tool_input: { message: 'opaque task', fork_turns: 'none' } }), '');
  assert.equal(invoke(dispatch), '');
  assert.equal(invoke(start), '');
  const rows = records();
  assert.equal(rows.length, 3);
  const pre = rows.find(row => row.event === 'PreToolUse');
  const post = rows.find(row => row.event === 'PostToolUse');
  const child = rows.find(row => row.event === 'SubagentStart');
  assert.equal(pre.probe_message_matched, false);
  assert.match(post.call, /^[a-f0-9]{64}$/);
  assert.equal(post.probe_message_matched, true);
  assert.equal(post.spawned_agent, child.actor);
  assert.equal(post.session, child.session);
  assert.equal(child.outcome, 'capture_only');
  assert.equal(child.spawn_call, null);
  assert.doesNotMatch(JSON.stringify(rows), /untrusted response|child-thread|0123456789ab|transcript|opaque task/);
});

test('armed smoke probe injects once and verifies the exact marker from the same child', t => {
  const { dir, invoke, records } = setupProbe(t);
  const arm = () => spawnSync(process.execPath, [script, 'arm', dir, session], { encoding: 'utf8' });
  assert.equal(arm().status, 0);
  assert.notEqual(arm().status, 0);
  const authFile = path.join(dir, 'delivery.json');
  const auth = JSON.parse(readFileSync(authFile, 'utf8'));
  writeFileSync(authFile, JSON.stringify({ ...auth, expires: 0 }));
  assert.equal(invoke(start), '');
  writeFileSync(authFile, JSON.stringify(auth));
  assert.equal(invoke({ ...start, session_id: 'another-parent' }), '');
  assert.equal(invoke({ ...start, agent_id: null }), '');
  const output = JSON.parse(invoke(start));
  const hookOutput = output.hookSpecificOutput;
  assert.equal(hookOutput.hookEventName, 'SubagentStart');
  const token = hookOutput.additionalContext.match(/ARENA_HOOK_SMOKE_[a-f0-9-]+$/)[0];
  const sibling = { ...start, agent_id: 'other-child' };
  assert.equal(invoke(start), '');
  assert.equal(invoke(sibling), '');
  const stop = { ...start, hook_event_name: 'SubagentStop' };
  assert.equal(invoke({ ...stop, agent_id: sibling.agent_id, last_assistant_message: token }), '');
  assert.equal(invoke({ ...stop, last_assistant_message: 'wrong marker' }), '');
  assert.equal(invoke({ ...stop, last_assistant_message: token }), '');
  const rows = records();
  assert.deepEqual(rows.map(row => row.outcome).sort(), [
    'already_claimed', 'already_claimed', 'authorization_expired', 'marker_acknowledged',
    'marker_not_acknowledged', 'marker_prepared', 'missing_child_id', 'no_delivery_for_child',
    'session_mismatch',
  ]);
  assert(!JSON.stringify(rows).includes(token));
});
