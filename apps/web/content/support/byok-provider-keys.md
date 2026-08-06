---
id: byok-provider-keys
title: Add your own provider API key (BYOK)
path: /byok
category: providers
tags: byok, api key, provider key, anthropic, openai, google, bring your own key, add key, encrypted
updated: 2026-08-05
scope: public
---

## What BYOK means here

BYOK is "bring your own key". You supply a provider API key on Desktop or CLI, and
AGI sends your requests directly to that provider using it. Keys are encrypted at
rest on your machine. Usage is billed by your provider, not by AGI, and AGI adds no
markup.

## Adding a key

1. Open Settings, then Providers.
2. Choose "Add provider" and select the provider you have an account with.
3. Paste the API key and save. The key is encrypted at rest before it is stored.

## Anthropic

Create an API key in the Anthropic console, then paste it into the Anthropic entry
under Settings, Providers.

## OpenAI

Create an API key in the OpenAI platform dashboard, then paste it into the OpenAI
entry under Settings, Providers.

## Custom OpenAI-compatible endpoints

If your provider exposes an OpenAI-compatible API, add it as a custom endpoint and
supply its base URL alongside the key.

## The desktop master password

The Desktop master password protects your encrypted keys and is unrecoverable by
design. AGI never has it. If you forget it, your encrypted keys cannot be
decrypted. Back it up somewhere safe.

## BYOK keys are never used for managed cloud

Managed cloud runs on AGI-operated provider access, and BYOK credentials are
explicitly refused on that path. The two remain separate trust boundaries.
