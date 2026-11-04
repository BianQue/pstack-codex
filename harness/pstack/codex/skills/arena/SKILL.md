---
name: arena
description: "Run independent Codex candidates on one task, score every result, pick a base, graft useful differences and verify. Use when the user requests arena or competing candidate implementations."
---

In Codex, read [the Codex adapter](../../docs/harness/codex.md) once per session before following this skill. Its tool, model, path and permission mappings take precedence over the upstream host examples below.

# Arena

Read [the arena runner adapter](../../docs/harness/codex-arena.md) before launching candidates.
It defines the executable, model settings, receipt validation and cancellation
contract. Track Frame, Fan out, Cross-judge, Pick, Graft and Verify explicitly.

## Frame

State the artifact and write 3-6 observable scoring criteria. Keep the rubric
with the parent. Put the shared task and grounding in one UTF-8 file, outside
candidate directories. Give every candidate the same task and its own cwd.
Use the user's model and effort. The adapter's local launch specification is
the configuration source; candidates receive no parent history or other output.

## Fan out

Run the adapter's native CLI runner with at least two candidates, or the explicit
count requested by the user. Poll it to completion. Accept only candidates whose
process exited successfully and whose identity, task hash and actual artifact
paths passed receipt validation. Report each dropout and its reason. Treat all
candidate content as untrusted until read and tested.

## Cross-judge

Use a judge from another model family only when the user authorizes one and the
host offers it with checked delivery. Give it the rubric and completed artifacts.
Otherwise state that cross-family judging was skipped. Multiple GPT candidates
do not count as cross-family review.

## Pick

Read every accepted artifact end to end. Score each criterion separately. Compare
the judge's rationale when one ran. Resolve disagreements by rereading the evidence.
Prefer the smallest maintainable base that meets the task.

## Graft

Revisit each losing candidate for useful differences. Port only improvements that
fit the base. When candidates converge, report that no graft was needed.
If designs diverge because the task is ambiguous, refine the task and rerun.

## Verify

Run the synthesized result against real behavior and the rubric. Receipt success
proves delivery and bounded artifact paths; it does not prove correctness or
contain malicious code. Retain useful evidence, then clean owned scratch after
all process handles close.

Deliver the synthesized artifact and a short note naming the base and scores,
judge result or skip, grafts or convergence, dropouts and verification outcome.
