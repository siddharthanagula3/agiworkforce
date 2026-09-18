---
id: install-the-cli
title: Install and set up the CLI
path: /cli
category: surfaces
tags: cli, install cli, agi command, terminal, agi login, auth-status, list-models, exec, resume, fork, sandbox, homebrew, npm, cargo, checksum
updated: 2026-09-17
scope: public
---

## Getting the binary

The download page carries the current release assets for the `agi` command, one
per architecture, with checksums that carry a Sigstore signature. The CLI page
carries the current install route for your platform.

An npm wrapper is published as `@agiworkforce/cli`. It runs only the matching
`@agiworkforce/cli-<platform>` package, a bundled binary, or the path you set in
`AGI_CLI_BINARY_PATH`; it never falls back to some other `agi` that happens to
be on your PATH. A shell installer and a Homebrew tap are planned and not
published yet, so no command is listed for them.

`agi` is the primary command. `agiworkforce` remains available as a
backward-compatible alias.

## First run

```
agi login          # OAuth, or paste a provider API key
agi auth-status    # every configured provider, and how it authenticates
agi --list-models  # what you can actually route to right now
agi exec "what files are in this directory?"
agi                # the interactive terminal UI
```

`agi init` creates `~/.agiworkforce/`, and `agi onboarding` walks the first-time
setup.

## Sessions

Sessions are resumable. `agi resume` continues a previous session, `agi fork`
branches one, `agi session` inspects them, and `agi history` browses past
sessions. Local sessions never silently leave your device.

## Running work

`agi exec` runs a one-shot prompt and is the form to use in CI. `agi review`
reviews changes, `agi apply` applies the latest diff as a git patch, and
`agi sandbox` runs work under the platform sandbox (Seatbelt, bubblewrap,
Landlock or a Windows restricted token, depending on the OS).

A fallback chain is a comma-separated model list, tried in order, so a cloud
model can fall back to a local one.

## Trust boundaries in the terminal

In the terminal UI, `/privacy-mode` shows the active trust boundary, and moving
to BYOK is an explicit `/continue-with-byok` step, never automatic. There is no
`agi cloud` command: managed runs use the normal model path and fail closed
without an explicit route.

## Managed cloud from the CLI

Managed cloud access from the CLI is part of the higher paid tiers. Local mode
and BYOK work on any account, including one with no subscription at all. The
pricing page carries the current details.

## When something is wrong

`agi auth-status` is the first check: it lists every configured provider, so a
missing or expired credential shows up there rather than as a failed run.
`agi features` and `agi execpolicy` report what this build allows.
