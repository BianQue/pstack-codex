# The complete pstack suite in Codex

Read this adapter once per session before following a bundled skill, agent brief,
playbook or automation document. `<pstack>` is the installed folder containing
`plugin.json`, `skills/`, `agents/`, `docs/` and `automations/`.
These mappings replace upstream Cursor and Claude Code host examples. Keep the
workflow's goals, evidence requirements, review gates and user authorization.
Installation or reading a skill is not a request to execute that workflow.

## Tools And Invocation

| Upstream name | Codex behavior |
| --- | --- |
| `Task`, Task tool, Task subagent | Use the independent CLI worker path below. Never invent a `Task` tool or send an unreadable encrypted task. |
| `AskQuestion`, `AskUserQuestion` | Use an offered user-input tool when allowed; otherwise ask one plain-language question in chat. |
| Open a todolist | Use an offered plan/list tool, or maintain a short phase checklist in chat or a local decision log. |
| `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob` | Use the exposed file/terminal tools; prefer `rg` for search and the host's patch tool for manual edits. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `<pstack>/skills/<name>/SKILL.md` fully and follow it. For a human, use `$name` or the skill picker with the `pstack-codex` plugin selected. |
| A Cursor `create-skill` call | Use Codex's `skill-creator` when offered. Otherwise author a standard `.agents/skills/<name>/SKILL.md` and validate it. |
| A built-in PR tool | Use the configured forge CLI, for example `gh pr create`; attach a created PR when the host offers that tool. |

Each generated skill has supported `name` and `description` frontmatter.
`agents/openai.yaml` translates upstream `disable-model-invocation` to
`policy.allow_implicit_invocation`. Explicit invocation still works. The
generated policy preserves the upstream default, including arena. Cursor-only
`icon`, `color` and `paths` metadata are not tool permissions or invocation rules.

## Independent Workers

For arena, architect, swarm, interrogate, how, why, teach, reflect, no-comments,
and any playbook step that needs delegates, use the bundled
[arena runner](codex-arena.md). It also accepts a one-seat candidate list for a
single worker. Put the actual task and required skill/brief paths in a UTF-8 task
file. Each worker must read the files rather than infer its task from a name.
Use an independent cwd per worker and read every returned artifact.

| Upstream field | Codex worker mapping |
| --- | --- |
| `subagent_type: generalPurpose` | A native CLI worker whose task states its role. No `subagent_type` argument is passed. |
| `poteto-agent`, `comment-sicko` | Tell the worker to read `<pstack>/agents/poteto-agent.md` or `comment-sicko.md` and this adapter. |
| `readonly: true` | Keep the reviewed repository outside the worker's writable cwd; allow reports only in its own directory. Check the source diff afterward. A textual "read only" instruction is not a sandbox. |
| `readonly: false` | Generate isolated artifacts or patches, then review and apply them in the parent. |
| `environment: "cloud"` | Use an isolated local checkout/worktree when authorized. State explicitly that it is local, with no Cursor cloud session. |
| `environment: "local"` | Use the worker's dedicated local cwd. |
| `cloud_base_branch` | Resolve the named revision and create a separate checkout before launching a repository worker. |
| `run_in_background: true` | The runner launches candidates concurrently. Poll the parent command to exit. |
| `resume` | Start a fresh worker with a bounded prior-result file and the updated task; do not reuse parent history silently. |
| `file_attachments` | Put absolute readable paths in the shared task, with the purpose of each attachment. |

The runner does not create worktrees, copy the repository or merge edits.
When a task needs source edits, first prepare isolated checkouts and use a
reviewed patch/artifact workflow appropriate to the task. Do not have workers
edit the parent's repository concurrently. Keep secrets and unrelated files out
of task files and candidate output. `workspace-write` still inherits the host's
actual sandbox rules; verify the writable boundary before using sensitive data.

CLI workers may not have the parent's MCP integrations. The parent gathers
authorized external evidence and supplies sanitized files when the worker
cannot access a source. Missing evidence is a stated limit, never a fabricated
query or citation. Launch arguments and validated receipts prove requested
settings and delivery, not the identity of the backend model.

## Models And Role Configuration

The upstream `pstack-models.mdc` rule and `~/.cursor/rules/pstack-models.mdc`
map to `<project>/.agents/pstack/models.json`. Read that JSON when selecting a
worker role. This is pstack configuration, not an automatically loaded Codex
system rule. [setup-pstack](../../skills/setup-pstack/SKILL.md) owns writing it.
An explicit current user model choice overrides saved settings.

Use a configured `model` and a separate `reasoningEffort` from the actual native
CLI's supported settings. A role can be a list of seats. The `arena cross-judge
pool` is an ordered pool; a judge must be from a permitted different family.
An `auto` or `inherit-parent` entry uses the known parent model and effort.
If the parent slug cannot be resolved, ask for that value before a paid launch.

Cursor `claude-*`, `grok-*` and combined `gpt-*-<effort>` slugs are not assumed
to exist in Codex. Do not substitute another model family, drop a speed suffix,
increase spend or claim cross-family review silently. If no permitted judge
family is available, report the skipped cross-family gate and have the parent
score candidates. Same-family independent reviews can still be useful, but
must be labeled as such.

## Paths, Sessions And Shells

| Upstream path or feature | Codex mapping |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.agents/skills/`, `~/.agents/skills/`; preserve a project's explicitly requested layout. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | Locate this installed plugin from the offered skill path; use `codex plugin list` for identity. Never hard-code another user's cache directory. |
| `.cursor/rules/*.mdc`, always-applied rule | Project `AGENTS.md` or a linked `.agents/` file, preserving unrelated instructions. Role configuration uses the JSON above. |
| `agent-transcripts`, `~/.cursor/projects/...` | Current chat history and offered thread read tools. Read only in-scope chats. Use an explicit current-session transcript path when supplied; otherwise pass a bounded digest. Never crawl all Codex sessions. |
| Upstream GitHub pstack file URL | Prefer the same local `<pstack>/<path>` for agent reading; use a verified public URL only for a human link. |
| `/loop`, a routine wake | Use an offered bounded execution or automation capability only when the user requests it. Do not simulate a scheduler with an unbounded sleeping process. |

On Windows, use PowerShell/native executables for native commands. For POSIX
scripts, use an available Git Bash or WSL shell and its path conventions.
The statechart TypeScript entry can be run directly with Node.js 24, avoiding
its POSIX launcher. Do not feed Bash syntax to PowerShell or mix the two shells
for recursive file deletion. A failed toolchain launch is not a successful check.

## Conditional Capabilities

All 58 upstream skills are installed. Some workflows need additional tools or
services. Keep those preconditions visible instead of treating inclusion as
proof that every external action has run.

| Workflow | Required capability and behavior |
| --- | --- |
| statechart and formal verification | A supported verifier/toolchain, Java/TLC where required, and any dependency downloads permitted by the host. Run the real model and report bounds, counterexamples and unchecked properties. |
| PR watching and shipping playbooks | Authenticated forge CLI; use bundled watcher scripts with their declared runtime. Read-only checks do not authorize merge, deployment or messages. |
| ketchup-video | A real renderer/encoder such as ffmpeg. Inspect rendered frames. If rendering fails, use the upstream text fallback and report it. |
| UI verification and control-ui/control-cli | An actual browser/computer-use or CLI-control adapter and the app's feature map. If another plugin supplies the named skill, resolve it explicitly. Otherwise use the matching exposed control tools and satisfy the same observable checks. |
| deslop | Resolve the external skill when installed; otherwise perform the equivalent scoped diff review for unnecessary code and convention violations, explicitly recording that substitution. |
| make-bot-ui | An existing authorized webhook service, server-side credential storage and optional Tailscale. See its Codex-specific entry; Codex's timer is not a webhook endpoint. |
| Cursor Automations, `update_state`, routine calls and `SendToUser` | Use only an actually offered equivalent with the same trigger and credential semantics. There is no automatic translation to invented Codex endpoints. |
| Bugbot | Triage existing forge review threads normally. Starting/configuring Bugbot requires that integration; report an unavailable service gate. |
| Cursor cloud agent dashboard | Local worktrees do not supply a remote machine or its dashboard; state that capability is unavailable. |

If an unavailable integration is optional, report the skipped step and continue
independent work. If it is essential, name the exact required capability and
leave that operation incomplete. Never produce a fake URL, credential, deployed
automation, recording, review or verification result.

## Benny Automation Pack

`automations/benny/` is included with all three operational SKILL.md files,
references and templates. As upstream specifies, it is dormant and is not added
to the public skills root or automatically enabled on installation.

For a Codex project, map `.cursor/automations/benny/` to
`.agents/automations/benny/` and user-owned `.cursor/benny/` configuration to
`.agents/benny/`. Keep user config outside the copied pack and merge updates
without deleting destination-only files. Project plugin discovery uses
`.agents/plugins/marketplace.json` and trusted `.codex/config.toml`; it does not
write `.cursor/settings.json`.

The setup still requires explicit Slack/thread coordinates, tracker, app control
adapter, feature map and budgets. Slack event delivery and thread-write
capabilities must actually exist. A scheduled heartbeat is not equivalent to a
new-message trigger. Keep both automations disabled until prerequisites and
explicit user authorization are present. No Slack messages, tickets or live
automations are created by installing this package.

## Evidence

`coverage.json` enumerates the complete upstream source set, each source SHA256,
all published skills, playbooks, and the dormant automation entries.
Generation and CI reject a missing skill, changed policy, omitted source file,
broken installed reference or stale real-model acceptance.

Official packaging and invocation references:

- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/codex/skills
