---
id: providers-and-models
title: Providers and models
path: /providers
category: providers
tags: providers, models, switch model, model picker, anthropic, openai, google, xai, deepseek, perplexity, qwen, moonshot, zhipu, ollama, lm studio, routing
updated: 2026-08-05
scope: public
---

## Which providers are supported

AGI supports {{MARKETING.providers.display}} providers: nine first-party cloud APIs
(Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, and Zhipu),
custom OpenAI-compatible endpoints, and two local runtimes (Ollama and LM Studio).

## How many models

{{MARKETING.models.display}} models are available across those providers. The exact
catalogue changes as providers ship and retire models, so the model picker in the
product is the current source of truth.

## Switching model mid-conversation

You can switch models in the middle of a conversation. Pick a different model and
the thread continues with the new one. The provider label updates with the switch,
so you always know where the next request goes before it leaves your machine.

## Automatic routing

When the model selection is left on automatic, AGI picks a model for the task from
the models your plan and trust mode make available. An explicit model selection is
never silently replaced with a different provider.
