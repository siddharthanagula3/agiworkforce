---
id: local-mode
title: Run a local model
path: /local
category: local
tags: local mode, offline, ollama, lm studio, on device, privacy, free
platforms: cli
updated: 2026-10-05
scope: public
---

## Running a local model

Check [surface availability](https://agiworkforce.com/get-started) before
installing the CLI. The CLI implementation supports local inference through
Ollama and LM Studio. The current Desktop application is managed-cloud-only and
does not accept provider keys or run local models.

Local describes the inference route. Signed-in CLI startup may refresh the
managed model catalog when it is not cached. Review network use by tools and
connectors separately.

## Setting it up

1. Install a local runtime and load a compatible model.
2. When the CLI is available for your platform, follow its installation guide.
3. Run `agi models scan` to inspect the running local servers and their models.
4. Start `agi --provider <runtime> --model <model>`, using the runtime and model
   reported by the scan.

The CLI requires the selected local model to be reported by its server before
starting inference.

## Model routes and tool permissions

The CLI refuses a model request when the session's trust mode and provider route
differ. A reviewed Local continuation requires a matching payload preview and
creates a new destination session. Review the selected context and destination
before confirming a continuation.

Review the permissions and destination of each tool or connector before using it.
For account data and retention, see [Privacy](https://agiworkforce.com/privacy).

## Other clients

Consult surface availability and the guide for each client before trying its
local workflows. For provider-key setup in the CLI, see
[BYOK](https://agiworkforce.com/help/byok-provider-keys).
