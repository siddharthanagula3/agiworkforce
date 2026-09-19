---
id: desktop-and-cli
title: Desktop app and CLI
path: /cli
category: surfaces
tags: desktop, cli, terminal, install, download, macos, windows, linux, agi install, command line
platforms: desktop, cli, macos, windows, linux
updated: 2026-09-19
scope: public
---

## The CLI

The AGI CLI is a Rust-native developer agent with resumable sessions, sandboxed
execution, and offline-capable operation through Local mode. The CLI page carries
the current install guide for the `agi` command.

## The desktop app

The current Desktop application is an Electron shell for managed-cloud account
work. It does not accept provider keys or run a local model. No Desktop installer
has been published yet; the download page reports release availability instead of
offering an unverified asset.

## What the desktop app adds

- A dedicated managed-cloud window for your AGI account.
- Approved-folder workflows and one-step computer-use approvals on supported
  macOS builds.
- The optional Chrome native bridge.

Local and BYOK are available in the released CLI. The CLI's documented local
integrations are Ollama and LM Studio, and `agi login <provider>` stores provider
keys in the OS credential store.

## Managed cloud from developer surfaces

Desktop itself is managed-cloud-only. Managed cloud access from the CLI, Chrome,
and VS Code depends on release availability and the current plan details shown on
the pricing page.
