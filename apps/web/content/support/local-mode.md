---
id: local-mode
title: Run AGI offline with Local mode
path: /local
category: local
tags: local mode, offline, ollama, lm studio, llama.cpp, vllm, on device, no internet, privacy, free
updated: 2026-08-13
scope: public
---

## Running models on your own hardware

Desktop Local mode runs models through Ollama, LM Studio, llama.cpp, or vLLM on
your own machine. The CLI supports its documented local integrations, currently
Ollama and LM Studio. There are no AGI API keys or managed quotas, and inference
can run offline after the runtime and model are installed. Local mode is free.

## Setting it up

1. Install a supported runtime and at least one compatible model. On Desktop,
   choose Ollama, LM Studio, llama.cpp, or vLLM; for the CLI, follow its current
   Ollama or LM Studio setup guide.
2. Install the AGI surface whose release is available for your platform.
3. Select the local runtime in the model picker. AGI lists models exposed by the
   running server.

## What stays on your device

In Local mode, conversation content never leaves your device. There is no cloud
sync of local conversations unless you explicitly fork the conversation to another
trust mode, which requires context selection, a payload preview, and your consent.

## Mobile

AGI Mobile has no published release, so Mobile Local mode is not publicly offered
yet.
