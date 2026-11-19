# Native dispatch for Interrogate

Use Node 24 and `scripts/route.mjs` from this skill directory. Pass one JSON
argument to `route` with `state: "not-started"` and the booleans below:

- `nativeAllowed`: the user opts in to native reviewers for this run.
- `nativeAvailable`: the host exposes both dispatch and result collection.
- `exactSettings`: the chosen route can honor the requested model and effort
  without substitution. If only CLI supports them, set `nativeAvailable` false
  and check the settings for CLI.
- `isolatedScope`: the review uses a disposable fixture or isolated checkout
  and no hard read-only guarantee is required from native dispatch.
- `cliAllowed`: the existing CLI workflow is authorized and can meet the
  requested permissions and isolation. Do not infer isolation from a prompt.

For `cli`, follow the existing arena-based fan-out. For `stop`, report the
missing capability or permission. For `native`, use the tools actually
exposed by the host. Keep the same reviewer roles, scope, brief and evidence
requirements. Include the actual task, not just a role name. Generate a fresh
32-hex-digit token per seat with `node -p "require('node:crypto').randomBytes(16).toString('hex')"`.
Ask the worker to return `Task: <token>` on its first line. Do not include
secrets, and do not ask workers to edit the target under review.

Once dispatch has been attempted, retain the agent ID if returned. Wait for
that agent. Do not start a replacement on timeout, an ambiguous error, or
missing delivery evidence. Validate a returned result with the `delivered`
operation, passing JSON with `result` and `token`. A matching token validates
prompt delivery, not model identity or findings. If it fails, report the seat
as unverified rather than retrying through CLI. Rerun findings as usual.

Report the route, requested settings, delivery status, and results separately.
Native review is opt-in until end-to-end acceptance on the target host.
