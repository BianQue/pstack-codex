# Arena Desktop Hook pilot

Status: not enabled. Independent CLI workers remain the default. This change
documents acceptance and does not install a Hook or authorize a release.

## Pre-injection binding: go or no-go

Start two concurrent synthetic candidates from the real Windows Codex App
with `fork_turns: none`. Before returning any `additionalContext`, demonstrate
how trusted host identifiers map each child to exactly one authorized candidate
in this run. Record the source of those identifiers and when they become
available. Do not infer identity from a name, timing, spawn order, or model text.
If no such mapping exists, return no task context, record NO-GO, and keep CLI.

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
