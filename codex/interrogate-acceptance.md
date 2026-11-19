# Interrogate acceptance on Windows

Use `interrogate-fixture.mjs` in a disposable project. The intent is to sum
arrays of numbers, returning 0 for an empty array. Independently verify each
reported finding against the fixture. Record host and package versions, actual
route, requested settings, result, and working-tree state before and after.

Run the packaged skill in a fresh Desktop session with native reviewers
explicitly allowed. Run again with CLI reviewers. Native passes only when the
host returns the matching receipt and a finding that can be reproduced. CLI
passes only when the real worker returns the same finding with a valid receipt.
Neither receipt attests to backend model identity. The automated suite covers
the routing rules, not installed skill discovery or live transport.

## November 18, 2026

Source baseline: `6d33056`, package version `0.2.0`, Node `v24.18.0`.
Native dispatch probe used the same off-by-one bug inline, model request
`gpt-6.2-sol`, effort `medium`, and the sentinel `PSTACK-NATIVE-17`.
The host allocated `pstack_smoke`, but its final response said no smoke-test
command or scope was provided. The sentinel was absent. This is a failed
prompt-delivery probe, not an end-to-end run of the generated skill.
The native route stays opt-in.

The read-only `codex exec` probe on CLI `0.164.0` received the fixture task
with requested settings `gpt-6.1-sol` and `xhigh`. Its file-read command failed:
`registered Core process has no package identity`. The probe was stopped
without a verified result. No sandbox mode was relaxed. The parent ran the
fixture directly and observed `NaN NaN` instead of `5 0`.

The three offline route/receipt tests, generated-tree check, and package
check passed. The pre-change arena runner suite under the managed sandbox
passed 41 of 43 tests; timeout cleanup and stdin cancellation did not pass.
Hosted CI and fresh Desktop plugin discovery were not verified.

## Upstream upgrade rehearsal

`git diff --name-status ab1f702 c742dd6 -- pstack` shows the Orchestrate
playbook rewrite, removal of the three `scripts/orch/` files, and updates to
guide, manifests, and script dependencies. Keep the upstream deletions and
manifest changes. Review the changed playbook against the Codex adapter
before accepting it. Do not claim Cursor-specific integrations work unless
the target host provides and verifies an equivalent. The existing generator
and compatibility CI stay the package checks.
