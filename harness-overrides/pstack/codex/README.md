# pstack for Codex

This downstream package supports **arena** only. It retains pstack's scoring,
base selection, grafting and verification, using independent native Codex CLI
processes with task files and checked receipts.

Invoke `$arena` from this plugin, then follow
[the adapter](docs/harness/codex.md). Node.js 24+ and an authenticated Codex CLI
are required. Model and executable settings belong to each local launch spec.

Only arena has been accepted on Codex. This package does not install the other
pstack skills or fix provider encrypted-content handling.

Derived from Lauren Tan's MIT-licensed pstack in cursor/plugins.
See [LICENSE](LICENSE) and the maintenance repository's CODEX.md for releases,
verification, installation and rollback.
