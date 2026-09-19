---
id: install-desktop-and-mobile
title: Installing the desktop and mobile apps
path: /download
category: surfaces
tags: install, download, desktop app, macos, windows, linux, dmg, installer, mobile app, ios, android, release notes, signature, notarized, get notified
platforms: desktop, mobile, macos, windows, linux, ios, android
updated: 2026-09-19
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

Desktop adds a dedicated managed-cloud account window, approved-folder workflows,
one-step computer-use approvals on supported macOS builds, and the optional Chrome
native bridge. It does not accept provider keys or run local models. Local and BYOK
are available through the released CLI.

## Mobile

There is no published mobile release, so Mobile Local mode is not publicly
offered yet. Use the web app on a phone browser in the meantime; the chat
surface, Library, projects and settings all work at phone width.

## In the meantime

Use the web app while waiting for another client. Check each guide for its
platform and setup requirements: access can depend on your plan, workspace
permissions and browser capabilities. The [download page](https://agiworkforce.com/download) is the
place to check current client release availability.
