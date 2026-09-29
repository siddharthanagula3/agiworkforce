---
id: configuration
title: Configure the CLI and the VS Code extension
path: /cli
category: surfaces
tags: configuration, config.toml, cli config, agiworkforce_home, managed policy, managed-settings.json, environment variables, vscode settings
platforms: cli, vscode, macos, windows, linux
updated: 2026-09-28
scope: public
---

## Where the settings live

The CLI reads your settings from `~/.agiworkforce/config.toml`. Set
`AGIWORKFORCE_HOME` to an absolute path to keep that folder somewhere else. A
repository can add its own `.agiworkforce/config.toml`, which applies when you
run the CLI in that folder.

The VS Code extension runs the same CLI for its local sessions, so it uses the
same file. The extension's Settings panel shows the path, with buttons to open
`config.toml` and to restart the local runtime; a session that is already
running keeps its settings until you restart it.

## Which setting wins

Your own file is read first, then the repository's, then environment variables,
then any policy your organization manages. A repository's file is only applied
once you trust that folder, and an organization can switch repository files off
altogether. A repository file that points a provider at its own server asks you
first.

## Common settings

- `[default]` holds `model`, `provider`, `max_tokens` (8192 unless you set it),
  `temperature`, `reasoning_effort` (low, medium, high or max) and
  `sandbox_mode` (off, read-only, workspace or full-auto).
- `permission_mode` takes `default`, `plan`, `acceptEdits` or `dontAsk`.
  Bypassing permissions cannot be saved in the file; pass it for one run
  instead.
- `ui.privacy_mode` sets where new sessions run: local, byok or managed.

`AGIWORKFORCE_MODEL`, `AGIWORKFORCE_PROVIDER` and `AGIWORKFORCE_MAX_TOKENS`
override the file for one run, and an empty value is ignored.

## Organization policy

An administrator can install `managed-settings.json` in
`/Library/Application Support/AGIWorkforce` on macOS, `/etc/agiworkforce` on
Linux or `ProgramData\AGIWorkforce` on Windows. It can pin the permission mode,
the privacy mode and whether repository files apply, and add tool rules that
allow, ask about or deny a tool. A policy file that exists but cannot be read
stops the CLI rather than being skipped. When a tool is denied, the message
names the policy that denied it.

## VS Code settings

The extension's own settings are under `agiWorkforce` in VS Code's Settings,
for example `agiWorkforce.model` (Auto by default), `agiWorkforce.cliPath` (the
`agi` command by default) and `agiWorkforce.memory.enabled`.
