---
id: desktop-and-cli
title: Desktop app and CLI
path: /cli
category: surfaces
tags: desktop, cli, terminal, install, download, macos, windows, linux, agi install, command line
platforms: desktop, cli, macos, windows, linux
updated: 2026-11-10
description: How to check availability before installing, and how the desktop app and the CLI reach managed cloud.
scope: public
---

## Check availability first

Check [surface availability](https://agiworkforce.com/get-started) and
[Downloads](https://agiworkforce.com/download) before installing a client.

## The CLI implementation

The AGI CLI is a Rust developer agent. Its commands include saved-session resume,
sandboxed execution, model review and patch application. With an installed CLI,
use [Local mode](https://agiworkforce.com/help/local-mode) for local model setup
or [BYOK](https://agiworkforce.com/help/byok-provider-keys) for provider-key setup
and storage rules. The implemented local inference routes support Ollama and
LM Studio.

## The desktop app

Desktop chat uses Cloud and Desktop does not accept provider keys; its local
coding sessions run the CLI, which can use a local model or a provider key you set
up there. It is an Electron shell for your AGI account.
Read the [Desktop overview](https://agiworkforce.com/desktop) for its workflows
and platform requirements.

## Managed cloud from developer surfaces

For managed-cloud setup, use the guide for the client you are installing and
review the current [plan details](https://agiworkforce.com/pricing). Keep account
sign-in separate from provider-key setup.
