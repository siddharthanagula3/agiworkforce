---
id: install-desktop-and-mobile
title: Installing the desktop and mobile apps
path: /download
category: surfaces
tags: install, download, desktop app, macos, windows, linux, dmg, installer, mobile app, ios, android, release notes, signature, notarized, get notified
updated: 2026-09-17
scope: public
---

## What is published today

The web app and the CLI are available now. The desktop app, the mobile app, the
VS Code extension and the Chrome extension are not published yet. The download
page lists each platform with its status and a notify list: "You're on the list.
We'll email you when a platform has a verified installer to download."

This page will not give you an install command for something that does not have
a release. Anything else would be a broken link dressed as a guide.

## When a desktop installer is published

Desktop installers are published as release assets: notarized and stapled `.dmg`
files for macOS, one per architecture for Apple silicon and Intel, signed with a
Developer ID and assessed the way your Mac would assess them. Release assets are
served from the AGI download hosts and GitHub releases, and the download API
refuses anything else.

Stable, beta and nightly are separate release tags. The download page reads
stable.

## Verifying what you downloaded

Each release carries a checksum, and the CLI checksums carry a Sigstore
signature. Check the file you downloaded against the published checksum before
running it; the download page shows a verification session end to end.

## What desktop adds once it ships

Desktop is the surface for Local mode through Ollama, LM Studio, llama.cpp and
vLLM, for BYOK provider keys encrypted at rest behind a master password, and for
offline operation with no managed-cloud dependency.

## Mobile

There is no published mobile release, so Mobile Local mode is not publicly
offered yet. Use the web app on a phone browser in the meantime; the chat
surface, Library, projects and settings all work at phone width.

## In the meantime

Everything in this help centre that is not marked desktop-only or CLI-only works
in the web app today, on any modern browser, signed in with the same account.
