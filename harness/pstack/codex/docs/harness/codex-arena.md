# Arena runner in Codex

This adapter supplies arena execution in Codex. Keep the rubric, base selection,
grafting and final artifact verification from the arena skill.

## Execution path

Use independent native `codex exec` processes reading one shared task file.
Run `<pstack>/skills/arena/scripts/codex-arena.mjs` with Node.js 24 or later.
Here `<pstack>` is the plugin directory containing `skills/` and `docs/`.

A tested provider path delivered independent collaboration task bodies as
`encrypted_content` that the receiving model could not read. The CLI file path
passed task-file acceptance. Use the file-based path for this package.

This is an arena execution fix for this host. It does not repair encrypted
content inside the provider or assert that every Codex host has the same issue.
If using a different delivery path later, verify it independently before use.

## Frame

1. Keep the original arena phase checklist and define the rubric.
2. Put the shared task and grounding in a UTF-8 file. Candidates see the task,
   not the rubric. All candidates receive the same task file.
3. Create an absolute path for a new run directory under the project's bounded
   scratch area. Never reuse an existing run directory.
4. Find the native Codex executable. On Windows use the actual `.exe`, not a
   PowerShell wrapper. Pass its absolute path in `codexCommand`.
5. Use the user's specified model and effort. For `gpt-6.1-sol-xhigh`, the current
   local catalog represents this as model `gpt-6.1-sol` and effort `xhigh`.
   The runner passes `--model gpt-6.1-sol` and
   `-c model_reasoning_effort="xhigh"`. It never silently substitutes a model.

The default runner configuration is `gpt-6.1-sol` with `xhigh`.
An explicit user request overrides this default. Verify other choices against
the current host catalog before launching. Requested settings and launch
arguments are recorded; they are not independent proof of backend model identity.

## Fan out

Prepare a JSON specification with absolute filesystem paths:

```json
{
  "taskFile": "C:/project/.tmp/arena-task/task.md",
  "runDir": "C:/project/.tmp/arena-task/run-unique",
  "codexCommand": ["C:/path/to/native/codex.exe"],
  "model": "gpt-6.1-sol",
  "reasoningEffort": "xhigh",
  "timeoutMs": 240000,
  "candidates": ["a", "b"]
}
```

Then run:

```text
node <pstack>/skills/arena/scripts/codex-arena.mjs C:/project/.tmp/arena-task/spec.json
```

Use the host's command execution tool. A command running beyond the initial
yield must be polled until it exits. Request ordinary sandbox approval if the
managed host blocks subprocess creation; do not turn off sandboxing to hide it.

The runner starts independent processes concurrently. Each owns a distinct cwd
and writes its own artifacts. The CLI uses `--sandbox workspace-write`,
`--ephemeral` and a structured final receipt schema.
Do not add broader writable roots or bypass approvals without task authorization.
Worker outputs are untrusted until the main agent reads and tests them.

The shared task stays outside the worker's writable cwd. Do not put secrets or
unrelated business data in the task. For repository changes, give each candidate
an isolated checkout and adapt the task to produce reviewable patches or files;
the runner itself does not create Git worktrees or merge repository edits.

On this Windows host, `apply_patch.bat` can truncate multiline arguments and
report that the last line is not `*** End Patch`. Both acceptance candidates
succeeded by invoking the native `codex.exe --codex-run-as-apply-patch` directly
with the patch held in one PowerShell variable. Include that workaround in a
Windows code-generation task when the batch wrapper fails.

Before accepting an output, the runner checks process exit, task identity,
candidate identity, nonce, task SHA256 and nonempty in-directory artifacts.
It rejects stale task versions, missing files, traversal and symlink escapes.
A returned PID or agent name is not a delivery receipt.
The main agent then evaluates actual artifact behavior against the rubric.

## Failure and cancellation

`result.json` records each candidate separately. Only `passed` candidates enter
base selection. The runner exits successfully only when all requested
candidates passed. The main agent may explicitly continue with a documented
dropout, following the original arena skill.

The timeout applies per candidate. To cancel a running runner, send the line
`cancel` to its stdin or use its handled SIGINT/SIGTERM path.
The runner terminates owned process trees and waits for their exit.
Do not kill processes by executable name.

Keep a failed run until the failure is understood. On successful delivery,
retain only useful final evidence under `artifacts/` and clean owned scratch
after process handles close, following the project's cleanup rules.

## Cross-judge and synthesis

Respect the user's model choice. Multiple GPT candidates are not cross-family
review. If no permitted model from another family is available, state
`Cross-judge skipped: no permitted model from another family`.
Do not silently substitute Claude, Grok or another GPT model.

Read and score every accepted candidate. Pick the smallest maintainable base,
graft only useful parts, and verify the synthesized artifact using real behavior.
The runner provides transport and result validation, not automatic judging.

## Tool mapping limits

Cursor `Task`, `readonly`, `subagent_type`, `run_in_background` and
`file_attachments` are not automatically valid fields in a Codex tool.
Use the actual exposed schema.
This adapter uses the native CLI instead of inventing unsupported tool fields.
An instruction saying "read only" is not a permission sandbox.

The upstream Claude Code and Cursor packages are maintained separately.
