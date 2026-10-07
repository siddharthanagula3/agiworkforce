---
id: vscode-extension
title: The VS Code extension
path: /vscode-extension
category: surfaces
tags: vs code, vscode, editor, extension, ide, explain selection, refactor, generate tests, fix issue, agent mode, sign in to cloud, local runtime
platforms: vscode
updated: 2026-10-05
scope: public
---

## Check availability first

Check [surface availability](https://agiworkforce.com/get-started) before
installing the extension or CLI. Read the
[VS Code overview](https://agiworkforce.com/vscode-extension) for setup and
platform requirements.

## Editor commands

The extension implementation registers **Explain Selection**, **Fix Issue**,
**Refactor Code** and **Generate Tests**. Select code in the active editor, choose
a command, and review its output before applying a change.

## Account and provider credentials

**Set API Key** and **Clear API Key** manage the AGI Workforce account API key.
For model-provider key setup and storage, see
[BYOK](https://agiworkforce.com/help/byok-provider-keys). Keep account sign-in
separate from provider-key setup.

## Checking the local runtime

Use **Check the CLI in This Environment** to inspect the configured CLI path and
its version in the editor's environment. Use **Restart Local Runtime** to restart
the extension's CLI runtime connections.

## The CLI in the integrated terminal

With an installed CLI, open the integrated terminal and inspect the command help.
`agi review` sends a Git diff to the selected model for review. `agi apply` applies
a diff from a file or saved session. Review the proposed patch before applying it.
For provider-key login, follow the BYOK guide after checking availability.
