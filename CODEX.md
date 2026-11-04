# pstack for Codex

This is BianQue's maintenance fork of Lauren Tan's MIT-licensed pstack in
`cursor/plugins`. Version **0.2.0** includes the complete published pstack suite:
58 skills (including 24 principles), 23 internal playbooks, agent briefs, guides,
scripts, tests, assets and the dormant Benny automation pack. Other plugins in
the upstream marketplace are outside this package.

`harness/pstack/codex/coverage.json` lists every upstream source path, SHA256,
treatment and skill invocation policy. Only Cursor discovery metadata and
its package-local `.gitignore` are excluded. The three Benny SKILL.md files
remain resources, not automatically registered public skills.

## Install

Requires Node.js 24+, an authenticated native Codex CLI, and plugin commands
compatible with Codex CLI 0.164.0. Use a release tag instead of tracking `codex`
for day-to-day installation:

```powershell
codex plugin marketplace add BianQue/pstack-codex --ref codex-v0.2.0
codex plugin add pstack-codex@bianque-pstack-codex
codex plugin list
```

Restart the desktop app or use a new CLI session. Choose the requested skill
from the `pstack-codex` plugin. If another plugin offers the same name,
explicitly select this package's entry. Read `docs/harness/codex.md` for shared
host mappings and `docs/harness/codex-arena.md` for the worker runner.
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
Each Codex skill uses supported name/description metadata. Its
`agents/openai.yaml` translates upstream's `disable-model-invocation` into
`policy.allow_implicit_invocation`, preserving manual invocation and discovery.
`setup-pstack` writes project-local `.agents/pstack/models.json`. It does not
change the user's global model configuration.

```powershell
node scripts/generate-pstack-harness-trees.mjs
node scripts/generate-pstack-harness-trees.mjs --check
node scripts/check-codex.mjs
npm install --no-save --package-lock=false fast-check@4.5.3 commander@14.0.0
# Set TLA2TOOLS to upstream's pinned tla2tools.jar and JAVA to Java 11+.
# Set BUN to the Bun executable if it is not on PATH.
node scripts/test-codex.mjs
```

Package and arena tests include identity and task-byte checks, concurrency, failed receipts,
path traversal, symlink/hardlink escapes, metadata masquerading, timeout,
cancellation and owned process-tree cleanup. Linux also exercises signals.
The full gate also runs the installed PR watcher, plan checker, statechart
property tests and real Java/TLC comparisons. CI uses Node 24, Bun 1.3.11,
Java 21 and TLC 1.7.4, verified against upstream's SHA256.
Linux runs all upstream script suites. Windows excludes upstream's `cli`,
`corpus` and `tlc-out` suites that execute POSIX fixtures, plus one fake `gh`
shell-program test; it runs the portable suites plus
native statechart tests with real TLC, normal-exit cleanup and output collision
protection. Codex overrides fix Windows worker cleanup, CRLF message parsing
and the Windows npm entry used by upstream's render tests.

The generated Claude Code package must remain unchanged unless upstream
changes it. Repository attributes enforce LF checkouts on Windows and Linux.

The weekly upstream workflow opens an upgrade PR, keeping an existing review
intact. It never merges or releases. Enable Actions and the repository setting
allowing Actions to create pull requests. A merge conflict stops the run for
manual repair. Failed generation remains visible as a failing PR check.

## Accept And Release

Before each release, bump the version in the override manifest, regenerate,
and test a fresh marketplace installation in a separate Codex home.
Run the installed runner using two independent synthetic-task candidates and
one bounded suite smoke worker:

```powershell
node scripts/accept-codex.mjs C:/path/to/native/codex.exe C:/path/to/new-evidence-directory C:/path/to/installed/pstack-codex
```

Read both candidates' modules/tests and the four `suite-run/suite` smoke
artifacts in the evidence directory, then run:

```powershell
node scripts/accept-codex.mjs C:/path/to/native/codex.exe C:/path/to/evidence-directory C:/path/to/installed/pstack-codex --verify
node scripts/check-codex.mjs --release
```

The smoke worker follows the installed setup, help, recall and webhook skills
using a synthetic project. Review `models.proposed.json`, then apply it to
`project/.agents/pstack/models.json` with the host's permission flow before
verification. Protected configuration stays outside the worker's writable cwd.
Its configuration preserves an unrelated property,
sets all 17 model roles and explicitly leaves cross-family judging disabled.
No external services, real-session mining or global settings are modified.

The verify phase reruns candidate tests, independent behavior assertions and the
full deterministic gate against the installed package, then writes only a
path-free summary to `codex/acceptance.json`. Set the test-tool environment above
before verification. Keep raw task receipts, CLI
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
For 0.2.0, `codex-v0.1.0` is the previous accepted arena-only version.

## Limits

All bundled skills use the shared Codex adapter; independent delegation uses
the checked native CLI runner. Model roles are explicit, cross-family reviews
require an actually available different family, and session recall stays within
the authorized chat scope.

Inclusion and deterministic regression coverage do not mean that all 58 model
workflows or every external service have run end to end. UI control needs real
control tools, video needs an encoder, formal verification needs its actual
toolchain, and PR operations need an authenticated forge. `make-bot-ui` needs an
authorized webhook service. Benny requires real Slack events and thread tools
and remains disabled without explicit setup. No deployment, Slack messages,
live automation or global-plugin switch occurs during packaging.

The adapter does not repair provider encrypted-content handling. Workers use
the native `workspace-write` sandbox, inherit local CLI
configuration and still require review before their outputs are run or merged.
Receipt checking is a delivery and artifact-path boundary, not code containment.

Official packaging reference: https://developers.openai.com/plugins/build/plugins
