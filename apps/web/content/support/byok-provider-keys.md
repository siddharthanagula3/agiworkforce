---
id: byok-provider-keys
title: Add your own provider API key (BYOK)
path: /byok
category: providers
tags: byok, api key, provider key, anthropic, openai, google, bring your own key, add key, encrypted
platforms: cli, vscode
updated: 2026-09-19
scope: public
---

## What BYOK means here

BYOK is "bring your own key". The released CLI accepts provider API keys today,
and VS Code BYOK is coming soon. AGI sends requests directly to the provider you
selected. Usage is billed by that provider, not by AGI, and AGI adds no markup.
Web, Mobile, Desktop and Chrome do not accept provider keys; each runs on your AGI
account.

## Adding a key

1. Run `agi login <provider>`, such as `agi login anthropic`.
2. Paste the provider API key when the CLI prompts for it.
3. Run `agi auth-status` to confirm the saved provider. The CLI stores the secret
   in the OS credential store.

A bare `agi login` signs in to AGI managed cloud. It does not prompt for a
provider API key.

## Anthropic

Create an API key in the Anthropic console, then run `agi login anthropic`.

## OpenAI

Create an API key in the OpenAI platform dashboard, then run `agi login openai`.

## Custom OpenAI-compatible endpoints

The released CLI accepts the provider names listed by `agi login --help`. Custom
OpenAI-compatible endpoints remain subject to the CLI's current configuration and
provider support.

## VS Code release state

The VS Code extension has a private SecretStorage-backed key flow in the codebase,
but no VSIX has been published yet. The public setup instructions will apply when
that release is available.

## BYOK keys are never used for managed cloud

Managed cloud runs on AGI-operated provider access, and BYOK credentials are
explicitly refused on that path. The two remain separate trust boundaries.
