---
id: configuration
title: Configure the CLI
path: /cli
category: surfaces
tags: configuration, config, config.toml, settings, default model, permission mode, agi init, agiworkforce_home, project config, mcp.json, hooks.json
platforms: cli, vscode, macos, windows, linux
updated: 2026-09-28
scope: public
---

## Where the settings live

The CLI keeps its settings in `~/.agiworkforce/config.toml` on every operating
system. `agi init` creates the file if it is missing, together with
`instructions.md` and `mcp.json` in the same folder. To keep the folder
somewhere else, set `AGIWORKFORCE_HOME` to an existing absolute path.

A repository can add its own `.agiworkforce/config.toml`. It is read from the
folder you start `agi` in and only applies once you trust that workspace.

## Viewing and changing settings

- `agi --config` prints the settings in effect and where each one came from.
- In a session, `/config` shows them, `/config get <key>` reads one and
  `/config set <key> <value>` saves one to your own `config.toml`.
- `/config set` accepts `model`, `provider`, `max-tokens`, `temperature`,
  `stream`, `fallback-model`, `fallback-chain`, `fast-model`, `history`,
  `output-style`, `privacy-mode`, `edit-mode`, `theme`, `reduced-motion`,
  `bell`, `crash-reports` and `product-analytics`. Other settings are edited in
  the file itself.
- The VS Code extension runs the same CLI, so it reads the same file.

## Useful settings

- `[default] model` and `provider` choose the default route; both start from
  the model catalog.
- `[default] permission_mode` is `default`, `plan`, `acceptEdits` or
  `dontAsk`. Skipping every approval cannot be saved as a default; it is only
  available for one run with a command-line flag.
- `[default] reasoning_effort` is `low`, `medium`, `high` or `max`.
- `max_tokens` is between 1 and 200000 (8192 by default) and `temperature`
  between 0 and 1.
- `[providers.<name>]` takes `api_key_env`, the name of the environment
  variable that holds that provider's key, and an optional `base_url`.
- `[telemetry] product_analytics = false` stops the CLI from sending product
  usage events, such as a stopped response, even when your account allows
  product analytics. Setting `DISABLE_TELEMETRY` or `DO_NOT_TRACK` to any value
  other than `0`, `false`, `off` or `no` does the same for one shell. Events are sent only in
  Managed mode and only when your account's product analytics choice, in
  Settings, Privacy on the web, allows them. Like `crash_reports`, this is read
  from your own `config.toml` only.

## Which setting wins

Your organization's managed policy wins first, then the environment variables
`AGIWORKFORCE_MODEL`, `AGIWORKFORCE_PROVIDER` and `AGIWORKFORCE_MAX_TOKENS`,
then the repository's `.agiworkforce/config.toml`, then your own
`config.toml`, then the defaults. A managed policy can fix the permission and
privacy modes and can turn repository settings off.

## MCP servers and hooks

MCP servers are listed in JSON, not in `config.toml`: `.mcp.json` or
`mcp.json` in the repository, and `~/.agiworkforce/mcp.json` for your own.
A repository's servers start only in a trusted workspace. `agi mcp` manages your list. Hooks live in
`~/.agiworkforce/hooks.json` and `agi hooks` manages them.
