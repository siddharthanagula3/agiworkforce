---
id: getting-started
title: Getting started with AGI
path: /help
category: getting-started
tags: getting started, first steps, setup, sign in, new account, onboarding, install
updated: 2026-08-05
scope: public
---

## Create an account and start a chat

Sign up at agiworkforce.com, then open the chat surface and send your first message.
A new account can use AGI managed cloud straight away — managed cloud is in public
alpha and open by default, so there is no waitlist and no invite code to redeem.

## The three trust modes

AGI runs in three separate trust modes and never silently moves work between them.

- **Local** runs models on your own hardware through Ollama or LM Studio. No API
  keys, no quotas, and no internet connection required. Local is free.
- **BYOK** means you bring your own provider API key on Desktop and CLI. Keys are
  encrypted at rest on your machine and traffic goes directly to your provider.
  Usage is billed by the provider, not by AGI, with no markup. BYOK is free.
- **Managed cloud** runs on AGI-operated provider access. It is metered, and
  current plan details live on the pricing page.

Moving a conversation from Local to BYOK is always an explicit fork with context
selection, a payload preview, and a visible provider label. It never happens
automatically.

## What to set up first

1. Pick a trust mode. If you want to stay offline, install the desktop app and run
   Local mode.
2. If you want to use your own provider account, add a provider key.
3. If you want AGI to handle provider access for you, use managed cloud on the web.

## Where to go next

The help index links the six things people ask about most. The FAQ covers the
reasoning behind the trust boundaries.
