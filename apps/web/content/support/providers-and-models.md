---
id: providers-and-models
title: Providers and models
path: /providers
category: providers
tags: providers, models, switch model, model picker, anthropic, openai, google, xai, deepseek, perplexity, qwen, moonshot, zhipu, ollama, lm studio, routing
updated: 2026-10-05
scope: public
---

## Choose a product surface first

Check [surface availability](https://agiworkforce.com/get-started) before
installing the CLI or another client. Use the
[provider directory](https://agiworkforce.com/providers) and the product's model
picker when choosing a provider or model.

The current Desktop application is managed-cloud-only and does not accept
provider keys or run local models. For CLI local inference, see
[Local mode](https://agiworkforce.com/help/local-mode). For provider-key login and
custom endpoint configuration, see
[BYOK](https://agiworkforce.com/help/byok-provider-keys).

## Understand the catalog counts

The provider-key catalog contains {{MARKETING.models.display}} model entries
under {{MARKETING.providers.display}} provider integrations. These are catalog
counts rather than a list of models offered to every account. Consult your
surface's model picker and [plan](https://agiworkforce.com/pricing) for your
selection.

## Changing the model route

The CLI refuses a model request when the session's trust mode and provider route
differ. A reviewed Local continuation requires a matching payload preview and
creates a new destination session. Review the selected context and destination
before confirming a continuation.

## Choosing automatic routing

Choose an automatic option offered by your model picker, or select a specific
model. Review the provider and route shown for the request before sending
sensitive content.
