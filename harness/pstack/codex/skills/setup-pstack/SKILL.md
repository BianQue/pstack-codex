---
name: setup-pstack
description: Configure the Codex models and reasoning budgets pstack uses per role. Use for setup-pstack, pstack budget, or changing worker model choices.
---

In Codex, read [the Codex adapter](../../docs/harness/codex.md) once per session before following this skill. Its tool, model, path and permission mappings take precedence over the upstream host examples below.

# Set up pstack in Codex

Configure `<project>/.agents/pstack/models.json`. This adapter-owned JSON
replaces the upstream Cursor model rule. Do not edit global Codex configuration
or unrelated AGENTS.md instructions.

1. Identify the target project and read its current JSON if present.
2. Determine the user's authorized native Codex model slug and reasoning effort
   from the current session, CLI configuration or an actually offered model list.
   Keep model and effort separate. Never invent access to a model family.
3. Ask for budget and role changes only when the request/session does not already
   specify them. Map budgets to supported effort values, not fabricated combined
   slugs. The arena runner currently accepts up to `xhigh`; a requested unsupported
   effort must be reported before launch.
4. Prepare the role table with all upstream roles below. Default each seat to the
   confirmed current model and effort, and make review-family limits explicit.
   Preserve existing valid choices. A panel role is an ordered array of seats;
   its length specifies worker count. A cross-judge pool remains an ordered pool.
5. Show the concrete proposed table. Obtain confirmation when the user's setup
   request has not already authorized those choices.
6. Write valid JSON after preserving unrelated user-owned configuration.
   Codex may protect an existing `.agents/` file from sandbox writes. If that
   happens, write the complete merged proposal to `models.proposed.json` in the
   task's ordinary output directory. Read it back and request the host's normal
   permission flow to copy it to the exact target. An independent worker returns
   the proposal for its parent to review and apply. Never change ACLs, relaunch
   another editor or use another tool to bypass a denied write. State clearly
   when a proposal is ready but the actual configuration is not yet updated.
   The shape is:

```json
{
  "budget": "large",
  "roles": {
    "feature, refactoring": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "bug-fix": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "perf-issue": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "hillclimb": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "judgment and prose": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "hardest tasks": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "how explorer": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "how explainer": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "why investigators": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "why synthesizer": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "reflect tooling": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "reflect judgment, divergent, synthesizer": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "arena runners": [
      { "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" },
      { "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }
    ],
    "arena cross-judge pool": [],
    "swarm workers": [{ "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }],
    "architect runners": [
      { "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" },
      { "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }
    ],
    "interrogate reviewers": [
      { "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" },
      { "model": "gpt-6.1-sol", "reasoningEffort": "xhigh" }
    ]
  }
}
```

The example model is not an entitlement claim. Validate every real model against
the user's environment. An empty cross-judge pool explicitly skips cross-family
judging. For `auto` or `inherit-parent`, save that string as a seat instead; resolve
the known parent model and effort before invoking the native CLI.

7. Re-read the saved JSON, report its path and effective role choices, and explain
   that the Codex adapter reads it per run. No service is automatically restarted.
8. As upstream suggests, check for project verification/formal-verification skills
   and offer a missing one once. Do not create it without the user's request.
