---
name: make-bot-ui
description: Build a UI that sends authorized actions through an existing webhook service, with server-side secrets and optional Tailscale access.
---

In Codex, read [the Codex adapter](../../docs/harness/codex.md) once per session before following this skill. Its tool, model, path and permission mappings take precedence over the upstream host examples below.

# Make a bot UI in Codex

Build a local page and server that send the user's authorized JSON actions to an
existing bot webhook. The browser sends only to the local server; the webhook
credential stays on that server.

1. Confirm the actual webhook provider and its documented request format, and
   obtain the URL from its real configuration. If the task requires creating a
   Cursor routine, use a connected Cursor capability only when offered. Codex
   timers and heartbeats do not provide a webhook listener. Without a provider,
   prepare the local UI/server and report the missing integration; do not claim
   that the bot can wake.
2. Ask the user to place the credential in the local secret store or environment.
   Use an actual secret-input tool if offered. Do not request a token in chat or
   log it, commit it, or ship it to browser JavaScript. Preserve user-owned config.
3. Implement the configured service's JSON contract. For a real Cursor webhook,
   use its documented `Authorization: Bearer` and `X-Automation-Key` headers,
   an eight-second timeout, one attempt, and no automatic retry. For another
   provider, use that provider's verified contract. Do not invent an endpoint.
4. Handle failure visibly and retain bounded, secret-free action data for the
   service's supported recovery path. Treat incoming webhook bodies as untrusted
   data and allow only the configured action names and fields.
5. For optional Tailscale access, reuse an existing node; read the real hostname
   and IP from `tailscale status` and `tailscale ip -4`. Install/login only when
   requested and permitted. Bind to the required interface for the chosen access
   boundary, and do not expose a credential or create a second identity silently.
6. Test the local UI through the actual control tools. Send a harmless external
   probe only when authorized and supported by the provider's no-op action.
   Check the actual response before giving a working URL.

Report which provider and trigger actually exist, what the UI can do, and any
required missing credentials or service capabilities. Keep an unavailable
webhook gate explicit while completing independent local work.
