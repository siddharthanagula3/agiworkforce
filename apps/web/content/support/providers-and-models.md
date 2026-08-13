---
id: providers-and-models
title: Providers and models
path: /providers
category: providers
tags: providers, models, switch model, model picker, anthropic, openai, google, xai, deepseek, perplexity, qwen, moonshot, zhipu, ollama, lm studio, llama.cpp, vllm, routing
updated: 2026-08-13
scope: public
---

## Which providers are supported

AGI supports {{MARKETING.providers.display}} provider integrations, including
Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, and
custom OpenAI-compatible endpoints. Desktop Local mode supports four verified
runtimes: Ollama, LM Studio, llama.cpp, and vLLM. The in-product catalog is the
current source of truth.

## How many models

{{MARKETING.models.display}} models are available across those providers. The exact
catalogue changes as providers ship and retire models, so the model picker in the
product is the current source of truth.

## Switching model mid-conversation

Within the active trust boundary, you can switch supported models in the middle of
a conversation. The provider label updates before the next request. Moving between
Local, BYOK, and managed Cloud requires an explicit continuation with context
selection, a payload preview, consent, and a visible destination label.

## Automatic routing

When the model selection is left on automatic, AGI picks a model for the task from
the models your plan and trust mode make available. An explicit model selection is
never silently replaced with a different provider.
