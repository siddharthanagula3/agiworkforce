---
id: glossary
title: Glossary of AGI terms
path: /docs
category: getting-started
tags: glossary, terminology, definitions, what does mean, jargon, terms, vocabulary, acronym
platforms: web, desktop, cli, mobile, vscode, chrome, macos, windows, linux, ios, android
updated: 2026-09-18
scope: public
---

## How to read this glossary

Each entry gives the term as the product uses it. Where a term has a fuller
article, that article is the authority on the detail; this page exists so a
question phrased with the word alone still finds the right place.

## Trust modes

**Trust mode** is which machine and which provider account runs your request.
AGI runs three and never silently moves work between them.

**Local** runs models on your own hardware through a runtime you install. It is
free, and inference can run offline once the runtime and model are installed.

**BYOK**, "bring your own key", means you supply a provider API key and AGI
sends your requests directly to that provider with it. Keys are encrypted at
rest on your machine. Your provider bills the usage, and AGI adds no markup.
BYOK is free.

**Managed cloud** runs on AGI-operated provider access. It is metered, and it
refuses BYOK credentials by design so the two trust boundaries stay separate.

## Usage and billing terms

**Allowance** is the metered capacity a plan carries for managed cloud. When it
runs out, managed requests stop until it resets; Local and BYOK are unaffected.

**Credits** are a prepaid balance, separate from the allowance, that managed
usage can draw on once the allowance is exhausted.

**Top-up** is a credit purchase for a custom amount in whole dollars.

**Concurrency** is how many responses may be generating at once. Reaching that
ceiling is not the same as exhausting an allowance: it clears as soon as an
in-flight response finishes.

**Auto** is the routing choice that picks a model for you. The free lane is
offered as Auto (free), whose capacity is not guaranteed.

## Chat terms

**Conversation** is a single thread of messages.

**Project** groups conversations around shared context: written instructions,
uploaded knowledge files, and its own memory scope.

**Artifact** is a document, a piece of code or a rendered page that an answer
produces, opened in a panel beside the conversation and versioned as you edit.

**Library** is where past conversations and artifacts are listed.

**Temporary chat** is a conversation that neither reads memory nor writes to
it, and that ignores saved approval verdicts.

**Memory** is what AGI carries between conversations. Persistent memory stores
facts; search past chats instead reads your history at answer time.

## Tools and connectors

**Connector** lets AGI call an external system on your behalf. Every connector
is scoped to your own account.

**MCP**, the Model Context Protocol, is the open protocol a connector can use to
expose tools. Custom MCP endpoints can be added with their own URL.

**Tool approval** is the verdict that decides whether a tool may run without
asking. The default is to ask before every action, including reads.

**AGI Work** is the mode for a multi-step task rather than a question: the
session plans, works, and produces files.

## Platform and surface names

**Surface** is one of the six places AGI runs: Web, Desktop, CLI, Mobile, VS
Code, and Chrome. A feature can be available on one surface and not another, so
articles name the surface rather than assuming it.

**Web** is agiworkforce.com in a browser.

**Desktop** is the installable desktop app, published for macOS, Windows and
Linux as those releases become available.

**CLI** is the `agi` command, a Rust-native developer agent that runs in a
terminal on macOS, Windows and Linux.

**Mobile** is the phone app, for iOS and Android.

**VS Code** and **Chrome** are the editor extension and the browser extension.

**macOS**, **Windows** and **Linux** are the desktop operating systems;
**iOS** and **Android** are the mobile ones. Support articles tag the platforms
they apply to, so a question about one platform does not answer with another.
