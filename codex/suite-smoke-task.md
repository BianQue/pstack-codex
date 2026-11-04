# Installed pstack suite smoke acceptance

This is an authorized synthetic acceptance task in your current writable project.
The parent supplies the installed plugin path after this task. Read its shared
Codex adapter first. Do not modify the installed package or a source repository.

Read the installed setup-pstack, poteto-help, recall and make-bot-ui SKILL.md files
fully, plus the guide pages required for the questions below. Follow their Codex
host mappings. Do not launch more agents, access unrelated sessions, create live
services, send messages, deploy, make remote writes or change global settings.

Perform these four bounded synthetic tasks:

1. Create this project's `.agents/pstack/models.json` with an unrelated
   `"acceptanceSentinel": "preserve-me"` property. Then run setup-pstack here.
   I authorize the large budget and all 17 documented roles using gpt-6.1-sol
   with xhigh reasoning effort. For arena runners, architect runners and
   interrogate reviewers use two seats. Use one seat for each other role.
   Leave the arena cross-judge pool empty. Preserve the sentinel property.
   This model and effort have completed real CLI requests in the parent session.
   Write and re-read the actual project `.agents/pstack/models.json`.
2. Answer this help-only question in help.md: "Which pstack skill should I use to
   understand how an unfamiliar codebase works, and how do I start it in Codex?"
   Include installed file references. Do not start the investigation.
3. Use recall with this full synthetic state capsule and no history mining:
   project=sample, branch=feature-alpha, user goal=add an export button,
   completed=button renders and unit tests pass, remaining=browser smoke test,
   current status=verified but uncommitted. Write recall.md with a short capsule
   and the concrete next action. Do not inspect any real session history.
4. Evaluate make-bot-ui with no webhook provider or Slack integration configured
   and no credentials supplied. Write integration.md stating the real missing
   capabilities and useful local preparation. Do not fabricate an endpoint,
   timer equivalence, deployment or successful Slack action.

Return all four nonempty paths as receipt artifacts:
.agents/pstack/models.json, help.md, recall.md, integration.md.
