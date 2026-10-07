---
id: byok-provider-keys
title: Add your own provider API key (BYOK)
path: /byok
category: providers
tags: byok, api key, provider key, anthropic, openai, google, bring your own key, add key, encrypted
platforms: cli, vscode
updated: 2026-10-05
scope: public
---

## What BYOK means here

BYOK means "bring your own key". Check [surface availability](https://agiworkforce.com/get-started)
before installing the CLI or VS Code extension. Review your provider's billing
and data-use terms before using a key.

## Adding a key

1. Run `agi login <provider>` with a supported provider name. Use
   `agi login --help` to inspect the command usage.
2. Paste the provider API key when the CLI prompts for it.
3. Run `agi auth-status` to inspect the saved credentials.

A bare `agi login` starts AGI managed-cloud sign-in and does not prompt for a
provider API key. `agi auth-status` reports stored credentials and does not
validate the key with the provider.

## Key storage

Keys saved with `agi login <provider>` are stored in the OS credential store
except on Linux or when `AGIWORKFORCE_NO_KEYRING` disables the keyring. In those
cases, these saved keys are stored in files in the CLI configuration directory.

## Custom OpenAI-compatible endpoints

Provider API-key login accepts only the built-in provider list. Custom
OpenAI-compatible providers require a CLI configuration entry with `base_url`;
`api_key_env` is optional. Custom-provider URLs must pass the CLI endpoint
validation.

## VS Code provider keys

VS Code provider-key management requires a connected local CLI runtime and
delegates key storage to that runtime. The CLI storage rules above apply to those
keys.

## Managed Cloud sign-in

CLI Managed Cloud requests require an AGI account token rather than a saved
provider API key.
