---
id: local-mode
title: Run AGI offline with Local mode
path: /local
category: local
tags: local mode, offline, ollama, lm studio, on device, no internet, privacy, free
platforms: cli
updated: 2026-09-19
scope: public
---

## Running models on your own hardware

The released CLI runs models through Ollama or LM Studio on your own machine.
There are no AGI API keys or managed quotas, and inference can run offline after
the runtime and model are installed. Local mode is free. The current Desktop
application is managed-cloud-only and does not run local models.

## Setting it up

1. Install Ollama or LM Studio and at least one compatible model.
2. Install the AGI CLI for your platform.
3. Select the local runtime in the CLI. AGI lists models exposed by the running
   server.

## What stays on your device

In Local mode, conversation content never leaves your device. There is no cloud
sync of local conversations unless you explicitly fork the conversation to another
trust mode, which requires context selection, a payload preview, and your consent.

## Mobile

AGI Mobile has no published release, so Mobile Local mode is not publicly offered
yet.
