# Arena Desktop Hook pilot

Status: real task injection is not enabled. Independent CLI workers remain
the default. The project-local probe starts in capture-only mode.

## Pre-injection binding: go or no-go

Start two concurrent synthetic candidates from the real Windows Codex App
with `fork_turns: none`. Before returning any `additionalContext`, demonstrate
how trusted host identifiers map each child to exactly one authorized candidate
in this run. Record the source of those identifiers and when they become
available. Do not infer identity from a name, timing, spawn order, or model text.
If no such mapping exists, return no task context, record NO-GO, and keep CLI.

### Test the host contract without injecting

From this checkout, run `node codex/arena-hook-probe.mjs prepare ABSOLUTE_NEW_DIRECTORY`
with a new scratch path. Open that directory in the Windows Codex App. Review
and trust only the project-local diagnostic hooks through the App. Do not copy
the configuration into the user or system hook directory.

Spawn two candidates in the scratch directory with `fork_turns: none`. Use only
`arena-hook-binding-probe` as the spawn message. The hooks write timestamps,
ID fingerprints, and outcomes to `observations/` and return no model context.
An observed spawn whose body does not match the probe marker is recorded
separately from a missing event. Compare parent `call` and child
`spawn_call`, and compare parent `spawned_agent` and child `actor` when both
fields are present. A missing or conflicting binding remains NO-GO. A post-spawn
match alone is not proof that the binding is available before injection. Manually
piped events test the collector only, not the Desktop host.

### Test delivery with one synthetic marker

1. Use `prepare` with a fresh directory under the project's `.tmp/`. Open
   a new Windows Codex App chat in that project and review its project-local
   Hooks. Do not change global hooks.
2. Run `node codex/arena-hook-probe.mjs arm ABSOLUTE_PROBE_DIRECTORY PARENT_THREAD_UUID`
   using that chat's thread UUID. Do not arm a chat with any other delegated
   work. This authorizes the first `SubagentStart` in that session for ten
   minutes; it does not authorize an Arena candidate.
3. In that chat, start exactly one fresh subagent using
   `arena-hook-binding-probe` as the only spawn message. Do not tell the
   subagent the expected marker. Wait for its final reply.
4. `marker_prepared` means the Hook prepared output, not that the model saw it.
   Require `marker_acknowledged` from `SubagentStop` for the matching session
   and child, and verify the child's final reply in the App. Missing stop
   evidence or `marker_not_acknowledged` is not a pass.

The authorization can be claimed only once. Use a fresh probe directory for
another attempt. This test stores hashes, not the plaintext marker, task
body, final reply, or transcript path. It tests Hook-to-child delivery only.

On bundled host `0.169.0-alpha.11.1`, the [V2 spawn result] exposes a task path
and optionally a nickname, not the child ID. The [SubagentStart schema] exposes
the child ID but not the dispatch call ID. The App's `SubAgentActivity` event
can report both IDs after spawn. No supported interface was demonstrated for
passing that event to the Hook before it returns. The diagnostic does not read
transcripts to authorize delivery. [Codex issue #44095] proposes a correlation
key. It does not describe a field available on this host.

[V2 spawn result]: https://github.com/openai/codex/blob/226fa88979b1a9d76dc36f339ee9c5fbdb2c8e7f/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs
[SubagentStart schema]: https://github.com/openai/codex/blob/226fa88979b1a9d76dc36f339ee9c5fbdb2c8e7f/codex-rs/hooks/schema/generated/subagent-start.command.input.schema.json
[Codex issue #44095]: https://github.com/openai/codex/issues/44095

### Windows Codex App result (2026-11-20)

**NO-GO for task injection.** In Windows Codex App `26.1111.9664.0`
(bundled host `0.169.1`), all three project diagnostic hooks were enabled
and trusted. The parent started two native candidates with `fork_turns: none`
without waiting for either to complete. No task context was injected.

| Check | Result | Observation |
| --- | --- | --- |
| `SubagentStart` execution | PASS | Two new records for the test parent had distinct child ID fingerprints. |
| Binding before injection | FAIL | Neither record had `call`, `spawn_call`, or `spawned_agent`. The [0.169.1 schema] has no dispatch call ID. |
| Matching parent events | NOT OBSERVED | The collector wrote no matching `PreToolUse` or `PostToolUse` record. Its filters make this inconclusive about whether the events ran. |

The shared session ID locates the parent, not an individual candidate.
The same capture-only Hook ran for `teach_why_binding`. Its actor fingerprint
matches that child thread, but the script returned no context. That explains
why the Hook did not supply a task. It does not explain the native dispatch
failure or demonstrate that Codex rejected Hook output.
Do not pair candidates by start order. Keep the injection pilot disabled
and independent CLI workers as the default. Injection and receipt checks
for real tasks remain unrun.

[0.169.1 schema]: https://github.com/openai/codex/blob/rust-v0.169.1/codex-rs/hooks/schema/generated/subagent-start.command.input.schema.json

### What skipping the binding check costs

- **Skip the spawn call ID, keep the binding.** Arena does not need this
  particular field. Another trusted host identifier is enough if the Hook
  can use it before injection to identify exactly one authorized candidate
  in the current run. The Windows test did not verify such an alternative.
- **Skip the binding, inject anyway.** Both candidates can receive the same
  task text and produce plausible artifacts. A child could still receive
  the wrong nonce or output directory. Arena may reject the result or
  attribute it to the wrong candidate, which makes the comparison unreliable.
  A receipt can check the result after execution, but it cannot undo a
  misdelivery or a write that already happened.
- **Skip Hook delivery for this host, keep CLI workers.** Arena can still
  run candidates independently and validate, score, and compare their
  artifacts. What remains unresolved is task delivery to native Desktop
  subagents through Hooks. An isolated synthetic injection test can confirm
  that a child receives context; it cannot replace concurrent Arena acceptance.

## Acceptance checklist

- [ ] Reverse start or completion order. Each child independently returns its
  own fresh nonce, expected task hash, and nonempty artifact from its own
  authorized directory. Neither child receives the other's identifier.
- [ ] Both deliveries use the App's native `SubagentStart` Hook. A CLI fallback,
  fixture parent, isolated App Server, or HTTP 200 is not a Desktop pass.
- [ ] Reject missing, expired, conflicting, replayed, and cross-run bindings.
  Never elevate arbitrary user text or recovered log content into developer context.
- [ ] On failure, invalidate the original attempt. Fall back only if duplicate
  writes and side effects are excluded. Accept at most one result per candidate.
- [ ] Disable the pilot for the next run. Confirm no task injection and normal
  CLI acceptance, without changing the gateway or global App configuration.

Record PASS, FAIL, or NOT RUN for each case in the downstream PR, with the
App version, package fingerprint, transport per candidate, and sanitized
observations. Exclude task bodies, credentials, and raw requests.

## Review and release

Target `BianQue/pstack-codex:codex`. Keep upstream sync in its own downstream
PR; merge that PR with upstream ancestry intact. Never push or propose this
feature to `cursor/plugins`. Edit Codex-specific source under
`harness-overrides/pstack/codex/` and regenerate the installed tree.

Require Windows and Linux compatibility checks for implementation changes.
Keep the feature draft until real App acceptance passes. Before the separate
manual release, match the accepted fingerprint to the final package and repeat
acceptance if it changed. For a regression, disable the per-run pilot first;
if the default CLI path is affected, restore the previous accepted release.
