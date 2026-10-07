---
id: getting-started
title: Getting started with AGI
path: /help
category: getting-started
tags: getting started, first steps, setup, sign in, new account, onboarding, install
updated: 2026-10-05
scope: public
---

## Create an account and start a chat

Open [Sign up](https://agiworkforce.com/signup), create an account, then open the
web chat and send a message. Consult [Plans](https://agiworkforce.com/pricing) and
[Billing and plans](https://agiworkforce.com/help/billing-and-plans) before
choosing an upgrade.

## Choose a model route

Check [surface availability](https://agiworkforce.com/get-started) before
installing the CLI or another client.

- **Local** uses a model served by a local runtime. With an installed CLI and
  local model server, select Ollama or LM Studio. See
  [Local mode](https://agiworkforce.com/help/local-mode) for setup.
- **BYOK** means bringing your own provider API key. See
  [BYOK](https://agiworkforce.com/help/byok-provider-keys) for supported login
  commands, key storage and custom endpoints. Review your provider's billing and
  data-use terms before using a key.
- **Managed cloud** uses your AGI account. Review the current plan details on the
  pricing page.

The current Desktop application is managed-cloud-only and does not accept
provider keys or run local models.

## Keep model routes separate

The CLI refuses a model request when the session's trust mode and provider route
differ. A reviewed Local continuation requires a matching payload preview and
creates a new destination session. Review the selected context and destination
before confirming a continuation.

## What to set up first

1. For local inference, follow the Local mode guide after checking CLI
   availability.
2. For a supported provider API key, run `agi login <provider>` and inspect saved
   credentials with `agi auth-status`.
3. To use your AGI account in the browser, open
   [AGI Web](https://agiworkforce.com/chat).

## Where to go next

Browse [Help](https://agiworkforce.com/help) for setup and troubleshooting, or
[FAQ](https://agiworkforce.com/faq) for product questions.
