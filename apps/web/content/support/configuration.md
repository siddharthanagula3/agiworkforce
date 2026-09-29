---
id: configuration
title: Configure the CLI
path: /cli
category: surfaces
tags: configuration, config, config.toml, settings, default model, permission mode, agi init, agiworkforce_home, multiple accounts, update check, project config, mcp.json, hooks.json
platforms: cli, vscode, macos, windows, linux
updated: 2026-09-29
scope: public
---

## Where the settings live

The CLI keeps its settings in `~/.agiworkforce/config.toml` on every operating
system. `agi init` creates the file if it is missing, together with
`instructions.md` and `mcp.json` in the same folder. To keep the folder
somewhere else, set `AGIWORKFORCE_HOME` to an absolute path; `agi` creates the
folder if it is missing.

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
- `[updates] check_on_startup = false` stops the full-screen terminal from
  asking agiworkforce.com for the newest release each time it starts. Setting
  `AGIWORKFORCE_NO_UPDATE_CHECK` to any value other than `0`, `false`, `off` or
  `no` does the same for one shell, and Local mode never makes the check.
  `agi update` still checks when you run it. This is read from your own
  `config.toml` only.

## Which setting wins

Your organization's managed policy wins first, then the environment variables
`AGIWORKFORCE_MODEL`, `AGIWORKFORCE_PROVIDER` and `AGIWORKFORCE_MAX_TOKENS`,
then the repository's `.agiworkforce/config.toml`, then your own
`config.toml`, then the defaults. A managed policy can fix the permission and
privacy modes and can turn repository settings off.

## More than one account

Each `AGIWORKFORCE_HOME` folder keeps its own sign-in, saved API keys, MCP
server sign-ins and settings, so a second folder holds a second account. On
macOS and Windows each folder's credentials sit in their own entry in the
system credential store. For example, add this alias to `~/.zshrc` or
`~/.bashrc` so that `agi-work` uses your work account while `agi` keeps your
own:

```bash
alias agi-work='AGIWORKFORCE_HOME="$HOME/.agiworkforce-work" agi'
```

The first `agi-work` run walks you through signing in and setup for the new
folder. `agi logout` signs out of the folder it runs in and resets its setup,
so the next run asks again.

## MCP servers and hooks

MCP servers are listed in JSON, not in `config.toml`: `.mcp.json` or
`mcp.json` in the repository, and `~/.agiworkforce/mcp.json` for your own.
A repository's servers start only in a trusted workspace. `agi mcp` manages your list. Hooks live in
`~/.agiworkforce/hooks.json` and `agi hooks` manages them.
