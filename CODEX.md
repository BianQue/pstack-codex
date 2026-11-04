# pstack for Codex

This is BianQue's maintenance fork of Lauren Tan's MIT-licensed pstack in
`cursor/plugins`. Only **arena** is currently supported and accepted on Codex.
The other pstack skills and host packages retain their upstream contracts.

## Install

Requires Node.js 24+, an authenticated native Codex CLI, and plugin commands
compatible with Codex CLI 0.164.0. Use a release tag instead of tracking `codex`
for day-to-day installation:

```powershell
codex plugin marketplace add BianQue/pstack-codex --ref codex-v0.1.0
codex plugin add pstack-codex@bianque-pstack-codex
codex plugin list
```

Restart the desktop app or use a new CLI session. Choose arena from the
`pstack-codex` plugin. If another plugin also offers arena, explicitly select
this package's entry. Use its `docs/harness/codex.md` and per-run JSON spec.
The native executable path and model selection are local launch settings;
the repository contains no user config or credentials.

## Maintain

`origin` is `BianQue/pstack-codex`, `upstream` is `cursor/plugins`, and `codex`
is the maintenance/default branch. `main` remains the original upstream branch.
`codex/upstream.json` records the exact reviewed upstream SHA and pstack version.
The downstream version is independent of the upstream pstack version.

Edit `harness-overrides/pstack/codex/`, not generated files in
`harness/pstack/codex/`. The generator reuses the shared MIT license and also
generates the independent `.agents/plugins/marketplace.json`.
The root portable manifest and Codex compatibility manifest share one version.
The Codex skill uses supported name/description metadata; it intentionally
does not copy upstream's `disable-model-invocation` field.

```powershell
node scripts/generate-pstack-harness-trees.mjs
node scripts/generate-pstack-harness-trees.mjs --check
node scripts/check-codex.mjs
node --test scripts/check-codex.test.mjs harness/pstack/codex/skills/arena/scripts/codex-arena.test.mjs
```

The tests include identity and task-byte checks, concurrency, failed receipts,
path traversal, symlink/hardlink escapes, metadata masquerading, timeout,
cancellation and owned process-tree cleanup. Linux also exercises signals.
The generated Claude Code package must remain unchanged unless upstream
changes it. Use LF checkouts when running generation on Windows.

The weekly upstream workflow opens an upgrade PR, keeping an existing review
intact. It never merges or releases. Enable Actions and the repository setting
allowing Actions to create pull requests. A merge conflict stops the run for
manual repair. Failed generation remains visible as a failing PR check.

## Accept And Release

Before each release, bump the version in the override manifest, regenerate,
and test a fresh marketplace installation in a separate Codex home.
Run the installed runner using two independent synthetic-task candidates:

```powershell
node scripts/accept-codex.mjs C:/path/to/native/codex.exe C:/path/to/new-evidence-directory C:/path/to/installed/pstack-codex
```

Read both candidates' modules and tests in the evidence directory, then run:

```powershell
node scripts/accept-codex.mjs C:/path/to/native/codex.exe C:/path/to/evidence-directory C:/path/to/installed/pstack-codex --verify
node scripts/check-codex.mjs --release
```

The helper reruns candidate tests and independent behavior assertions and writes
only a path-free summary to `codex/acceptance.json`. Keep raw task receipts, CLI
logs and candidate files locally. Read candidate code before executing it.
Model settings are `gpt-6.1-sol` / `xhigh`; this is not backend identity attestation.
Cross-family judging is not part of this synthetic delivery acceptance.

Commit the summary with the tested package. The manual **Release accepted Codex
package** workflow reruns the deterministic checks on Windows and Linux, checks
the summary's package hash, then creates `codex-v<VERSION>`, a ZIP, SHA256SUMS and
the sanitized summary. A missing/stale/failed acceptance blocks publishing.
An existing release is never overwritten. CI uses no model credentials.

The package hash covers every installed file, including tests and documentation.
The acceptance summary is maintainer evidence, not cryptographic attestation of
model execution. Review and rerun it when the trust boundary matters.

## Roll Back

Use the previous accepted tag shown in the repository's Releases page:

```powershell
codex plugin remove pstack-codex@bianque-pstack-codex
codex plugin marketplace remove bianque-pstack-codex
codex plugin marketplace add BianQue/pstack-codex --ref <previous-accepted-tag>
codex plugin add pstack-codex@bianque-pstack-codex
```

Then restart the app or begin a new CLI session and confirm the listed version.
Keep the previous release ZIP and its SHA256SUMS for offline recovery.
The first release has no earlier downstream release to restore.

## Limits

The adapter fixes arena execution for the tested Codex provider path. It does
not repair encrypted collaboration content or certify other skills, providers
or models. Workers use the native `workspace-write` sandbox, inherit local CLI
configuration and still require review before their outputs are run or merged.
Receipt checking is a delivery and artifact-path boundary, not code containment.

Official packaging reference: https://developers.openai.com/plugins/build/plugins
