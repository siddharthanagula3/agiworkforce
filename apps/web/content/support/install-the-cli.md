---
id: install-the-cli
title: Install and set up the CLI
path: /cli
category: surfaces
tags: cli, install cli, install.sh, agi command, terminal, agi login, auth-status, list-models, exec, resume, fork, sandbox, update, checksum, signature
platforms: cli, macos, windows, linux
updated: 2026-10-03
scope: public
---

## Getting the binary

```
curl -fsSL https://agiworkforce.com/install.sh | bash
```

The installer downloads the release archive for your platform, checks the
release's signed checksum manifest with `openssl`, checks the archive's SHA-256
against it, and installs `agi` to `~/.agi/bin`. It refuses anything it cannot
verify, and says so when no signed release is published yet. On Windows, run
it in Git Bash or WSL. There is no npm package or Homebrew tap.

`agi update` compares your build with the newest release, and
`agi update --install` installs that release after verifying its signature with
the key built into your `agi`. AGI Cloud for desktop ships its own copy of `agi`
for local coding sessions, and the VS Code extension offers **Install AGI CLI**
when it cannot find one.

`agi` is the primary command. `agiworkforce` remains available as a
backward-compatible alias.

## First run

```
agi login                # sign in to your AGI account (device code in the browser)
agi login anthropic      # or use your own provider key (BYOK), pasted when prompted
agi auth-status    # every configured provider, and how it authenticates
agi --list-models  # what you can actually route to right now
agi exec "what files are in this directory?"
agi                # the interactive terminal UI
```

`agi init` creates `~/.agiworkforce/`, and `agi onboarding` walks the first-time
setup.

A bare `agi login` never asks for a provider key; [Bring your own provider keys](https://agiworkforce.com/help/byok-provider-keys) covers `agi login <provider>`.

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
