# BYOK Open Model Provider Strategy

Status: Current
Owner: Founder + provider/platform lead
Last updated: 2026-08-05

This document defines how AGI should think about BYOK providers, open-weight models, hosted open-model APIs, and local model runtimes before implementation agents add or rank models.

Use this with `docs/product/definition.md`, `docs/work/implementation-status.md`, and `packages/contracts/types/src/models.json`.

## Core Decision

BYOK Desktop is not only for OpenAI, Anthropic, and Google keys.

AGI Desktop must support three BYOK/open-model classes:

1. Direct frontier/provider keys: OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Qwen/Alibaba Model Studio, Z.ai/GLM, and Bedrock.
2. Hosted open-model providers: OpenRouter, NVIDIA NIM, Groq, Hugging Face Inference Providers, Replicate, and selected specialist providers that pass a founder-approved implementation review.
3. Local runtimes: Ollama, LM Studio, llama.cpp, vLLM, Text Generation Inference, MLX/Apple Silicon local runtimes, and AGI-managed local runtime adapters.

The user experience should feel like ChatGPT/Claude, but the execution source can be any capable model/provider combination the user connects.

## Non-Negotiable BYOK Rule

Model name is not enough.

AGI must treat each route as:

```text
provider + endpoint class + model id + capability metadata + pricing metadata + privacy/retention claim + runtime health
```

The same model served by two providers can differ in:

- context window,
- max output tokens,
- tool/function calling behavior,
- structured output support,
- reasoning/thinking parameter format,
- vision/audio/image support,
- file support,
- latency and throughput,
- uptime and fallback behavior,
- price,
- moderation/filtering,
- data retention and training policy.

A recent hosted-open-model measurement paper makes this explicit: production users consume a provider-specific service object, not just a model artifact. It found routing can materially change cost and throughput for the same model family.

## Current AGI Catalog Position

`packages/contracts/types/src/models.json` is the single live source for the
current provider and model counts and the exact per-provider entries, read it
directly; do not restate its numbers here (restated counts drift; a prior
version of this section carried stale totals).

Founder-excluded providers are not catalogue gaps or future targets. They must not appear in provider enums, setup screens, request adapters, fallback labels, or model-sync output. Bedrock remains a separately reviewed enterprise route and cannot be claimed until model entries, capability metadata, request adapters, tests, and current official documentation prove it.

## Provider Priority

### P0: Add/Complete First

| Provider                         | Why AGI needs it                                                                                                                                                                  | Implementation rule                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenRouter                       | One key for 300+ models/providers, useful for breadth, discovery, fallback, rankings, and users who already route many models through it.                                         | Treat as aggregator. Persist actual selected upstream/provider when returned. Do not assume native tools/files behave like direct provider APIs. |
| NVIDIA NIM                       | Important for enterprise/open-model hosted and self-hosted routes; official docs list Nemotron, Llama, Mistral, Kimi, Qwen, OpenAI gpt-oss, MiniMax, DeepSeek, and safety models. | Add NIM as both hosted API and self-hostable enterprise route. Track downloadable NIM vs hosted API differences.                                 |
| Groq                             | Very fast inference for production open models; official docs list Llama, GPT-OSS, Qwen, Whisper, and Groq Compound/tool systems with token speed/pricing/context metadata.       | Treat as speed/low-latency provider. Verify supported tools, files, and compound tool semantics separately.                                      |
| Hugging Face Inference Providers | Aggregated Hub inference with provider-suffix semantics. Founder-excluded upstream routes must be filtered rather than inherited through the aggregator.                          | Treat as aggregator/proxy like OpenRouter and enforce the canonical provider exclusion policy before presenting or dispatching a route.          |
| Replicate                        | Useful for official always-on image/video/audio/model APIs and stable official model endpoints; less ideal as primary chat-provider abstraction.                                  | Prioritize multimodal generation, not first-choice chat.                                                                                         |

### P1: Add After P0 Is Solid

| Provider         | Reason                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Baseten          | Dedicated model deployment and inference for custom/fine-tuned models.                                    |
| Nebius AI Studio | Hosted open model APIs and GPU cloud path.                                                                |
| Novita           | Useful image/video/open-model provider, also present in Hugging Face provider ecosystem.                  |
| Hyperbolic       | Hosted open models/GPU inference; useful for cost-sensitive routes.                                       |
| Fal              | Strong image/video/media model provider; useful for artifact/media parity.                                |
| Lambda           | GPU/cloud route for dedicated/self-hosted open models.                                                    |
| Chutes           | Popular in open-model communities and OpenRouter routes; verify official docs before first-class support. |

## Model Family Priority

### P0 Model Families

| Family          | Why it matters for AGI                                                                                                                                                                                                                                                       | Routes to support                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| OpenAI gpt-oss  | OpenAI's open-weight reasoning models, `gpt-oss-120b` and `gpt-oss-20b`, are Apache 2.0 open-weight models for local or hosted infrastructure; OpenAI says they are not served through OpenAI API or ChatGPT.                                                                | Local runtime, NVIDIA NIM, Groq, OpenRouter, Hugging Face providers.                                      |
| Qwen            | Broad model family for chat, coding, reasoning, vision, and agentic workflows. Qwen3 includes dense and MoE models from 0.6B to 235B; Qwen3-Coder-Next targets coding agents.                                                                                                | Alibaba Model Studio direct, OpenRouter, NVIDIA NIM, Groq, and local runtime where weights are available. |
| DeepSeek        | Strong cost/performance and reasoning models. The official DeepSeek API currently lists fast and reasoning tiers with 1M context, tool calls, JSON output, thinking/non-thinking modes, and OpenAI/Anthropic-format base URLs. Exact model identifiers remain catalog-owned. | DeepSeek direct, OpenRouter, NVIDIA NIM, and local runtime where weights are available.                   |
| Z.ai / GLM      | GLM-family models are important open-model/code/function-calling options when verified against current official documentation and live probes.                                                                                                                               | Z.ai direct, OpenRouter, NVIDIA NIM, and approved Hugging Face routes.                                    |
| Mistral         | Mistral has open-weight and premier models across Large, Medium, Small, Devstral, Magistral, Codestral, Voxtral, and embeddings, with cloud/self-host routes.                                                                                                                | Mistral direct, Bedrock/Google Cloud/Snowflake where verified, NVIDIA NIM, OpenRouter, and local runtime. |
| Meta Llama      | Still essential for open-model compatibility, local runtimes, enterprise self-hosting, and many hosted APIs.                                                                                                                                                                 | Local runtime, NVIDIA NIM, Groq, OpenRouter, Bedrock/Vertex where verified.                               |
| Google Gemma    | Google's open model family remains important across multiple size classes and deployment targets.                                                                                                                                                                            | Local runtime, approved Hugging Face routes, OpenRouter, and Google AI Studio/Vertex where available.     |
| NVIDIA Nemotron | Key NVIDIA open/reasoning/safety model family, especially for NIM and enterprise/local deployment.                                                                                                                                                                           | NVIDIA NIM, OpenRouter, local/self-host NIM where available.                                              |
| MiniMax         | Important hosted open-model family when exact active IDs and capabilities are verified.                                                                                                                                                                                      | NVIDIA NIM, OpenRouter, or direct provider only after API/docs verification.                              |

### P1 Model Families

| Family                            | Reason                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Microsoft Phi                     | Useful small/local/edge models; not first choice for Claude/OpenAI parity but valuable for low-resource local mode.         |
| IBM Granite                       | Enterprise/open models useful for regulated customers and local/enterprise routes.                                          |
| Liquid AI LFM                     | Efficient open models showing up in hosted catalogs.                                                                        |
| Falcon                            | Regional/open models; add if user demand or provider coverage justifies it.                                                 |
| Image and video generation routes | Not LLM chat, but needed for artifact/media parity through media providers. Keep separate from the LLM chat model selector. |

## Desktop BYOK UX Requirements

Desktop BYOK should have four clear groups in the model/provider setup:

1. Direct provider keys
   - OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Qwen, and Z.ai.
2. Open model cloud keys
   - OpenRouter, NVIDIA NIM, Groq, approved Hugging Face routes, and Replicate.
3. Local runtimes
   - Ollama, LM Studio, llama.cpp, vLLM, TGI, MLX.
4. AGI Managed Cloud
   - public alpha, open by default (founder decision 2026-06-27); subscription/entitlement-gated, no waitlist/invite. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response kill-switch only.

The model selector must show:

- provider,
- route type: direct BYOK, hosted open model, local runtime, managed beta,
- model family,
- model id,
- context window,
- max output tokens,
- modalities,
- tool/function calling support,
- structured output support,
- reasoning/thinking support and format,
- file/image/audio/video support,
- pricing if known,
- rate-limit/health state if known,
- privacy/retention claim source,
- "same model via different provider" warning when applicable.

## Adapter Requirements

AGI should implement provider adapters in this order:

1. OpenAI-compatible chat completions adapter with provider quirks table.
2. Native direct adapters for OpenAI, Anthropic, Google, DeepSeek, Mistral, Qwen, Kimi, Z.ai where native APIs matter.
3. Aggregator adapters for OpenRouter and Hugging Face Inference Providers.
4. Hosted open-model adapters for NVIDIA NIM, Groq, approved Hugging Face routes, and Replicate.
5. Local runtime adapters for Ollama, LM Studio, llama.cpp/vLLM/TGI/MLX.

Do not assume every OpenAI-compatible endpoint supports the same parameters.

Per provider, AGI needs a capability normalizer for:

- tools,
- parallel tools,
- JSON/schema output,
- reasoning effort/thinking format,
- vision input,
- image generation,
- audio input/output,
- file upload,
- prompt caching,
- server-side state,
- streaming/event format,
- token usage reporting,
- pricing and billing units,
- retention/ZDR claims.

## Provider SDK Policy

Agents must check the provider's current developer docs before wiring tools,
files, reasoning/thinking controls, audio, image, code execution, computer use,
MCP, or server-side state.

Default policy:

| Provider route                             | SDK decision                                                                                                                                                                                                                                             | Current repo position                                                                                                                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI native API                          | Use the official `openai` TypeScript SDK for native OpenAI Responses/Chat transport, especially provider-native tools such as web search, file search, remote MCP, shell/code/computer-use, and generated files.                                         | `packages/ai/providers/openai` already depends on `openai` and uses `client.responses.create` / `client.chat.completions.create`. Keep OpenAI `max` disabled; use `xhigh` only where supported.                                          |
| Anthropic native API                       | Use the official `@anthropic-ai/sdk` for Claude Messages streaming, tool use, beta helpers, extended thinking, and replay signatures.                                                                                                                    | `packages/ai/providers/anthropic` already depends on `@anthropic-ai/sdk`. Web legacy fetch paths should migrate toward the package adapter instead of inventing a second Anthropic contract.                                             |
| Google Gemini native API                   | REST is acceptable for basic Gemini `streamGenerateContent` chat/function-calling/thinking. Use/install official `@google/genai` when implementing Gemini-native built-in tools, Files API, Interactions, Live API, Vertex routing, or SDK-only helpers. | `packages/ai/providers/google` currently uses direct REST for API-key Gemini chat, function declarations, function responses, and thinking signatures. Do not install `@google/genai` until a native Google tool/file/live path uses it. |
| OpenAI-compatible hosted/open-model routes | Do not assume the OpenAI SDK means full OpenAI capability parity. Use the OpenAI-compatible transport only for the subset the provider docs confirm.                                                                                                     | OpenRouter, Groq, Mistral, DeepSeek, xAI, LM Studio, and similar routes need per-provider capability gates for tools, reasoning, files, streaming usage, and retention.                                                                  |
| Vercel AI SDK                              | Useful for common streaming/UI provider abstraction and provider options. Not a substitute for native provider SDKs when a provider-specific tool or sandbox/file lifecycle has semantics the AI SDK does not expose yet.                                | `apps/web` already has `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, and `@ai-sdk/google`. Use provider options only after checking the matching provider docs and package docs.                                                          |

Do not add SDK dependencies just to "be ready." Add an SDK only when an
implemented code path uses it, and include provider-doc references in the
change or tests.

## Popularity Signals To Track

AGI should not choose models from one leaderboard alone.

Track all of these:

- OpenRouter rankings: benchmark plus real usage data from OpenRouter users.
- Artificial Analysis open-source comparison: intelligence, speed, price, context, size, and licensing.
- Current provider-recommended-model pages for approved routes.
- Hugging Face downloads/trending/likes and model-card activity.
- Local runtime support: Ollama, LM Studio, llama.cpp, vLLM, TGI, MLX support.
- Developer workflow adoption: coding-agent performance, tool-calling reliability, structured outputs, context length.
- License and commercial usability.
- Availability across at least two strong providers.

Current popularity/quality signals from this research:

- Third-party benchmarks are discovery inputs only; exact model admission still requires current official documentation and an implemented harness.
- OpenRouter's rankings page is explicitly based on benchmarks and real usage data from millions of users.
- Provider recommendations never override the founder exclusion list or the multimodal-input preference.
- Google reports broad adoption for its current open-model family; exact generations remain catalog-owned.

## AGI Product Implication

For a user, BYOK Desktop should mean:

> "Bring any serious model route you already pay for, including open-model clouds and local runtimes, and AGI gives you the Claude/ChatGPT-style application layer on top."

But AGI must be honest:

- If a BYOK model cannot call tools, AGI should not show tool parity for that model.
- If a BYOK provider does not support vision, AGI should not accept images for that route.
- If a provider cannot guarantee no training/retention, AGI must show "provider policy unknown" or the exact provider claim.
- If a hosted open model is quantized, compressed, moderated, or routed through an aggregator, AGI must label that route.
- If a local runtime is offline or too small for the requested task, AGI must show install/run/upgrade guidance instead of silently using cloud.

## Required Research Sources

Official provider/model docs:

- OpenAI Responses API overview: https://developers.openai.com/api/reference/responses/overview
- OpenAI tools guide: https://developers.openai.com/api/docs/guides/tools
- OpenAI TypeScript SDK: https://github.com/openai/openai-node
- Anthropic TypeScript SDK: https://github.com/anthropics/anthropic-sdk-typescript
- Anthropic tool use docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Google Gen AI JavaScript SDK: https://github.com/googleapis/js-genai
- Google Gemini API docs: https://ai.google.dev/gemini-api/docs
- OpenRouter model API and 300+ model/provider catalog: https://openrouter.ai/docs/api/api-reference/models/get-models
- OpenRouter rankings: https://openrouter.ai/rankings
- NVIDIA NIM LLM APIs: https://docs.api.nvidia.com/nim/reference/llm-apis
- NVIDIA NIM supported models: https://docs.nvidia.com/nim/large-language-models/latest/supported-models.html
- Groq supported models: https://console.groq.com/docs/models
- Hugging Face Inference Providers: https://huggingface.co/docs/inference-providers/en/index
- Replicate official models: https://replicate.com/docs/topics/models/official-models
- DeepSeek list models: https://api-docs.deepseek.com/api/list-models
- DeepSeek models/pricing: https://api-docs.deepseek.com/quick_start/pricing
- Alibaba Cloud Model Studio model list: https://www.alibabacloud.com/help/en/model-studio/models
- Kimi API model list: https://platform.kimi.ai/docs/models
- Z.ai developer overview: https://docs.z.ai/guides/overview/overview
- Mistral model docs: https://docs.mistral.ai/models/overview
- Mistral model families: https://mistral.ai/models
- OpenAI open-weight gpt-oss help: https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss
- OpenAI open models: https://openai.com/open-models
- Google Gemma documentation: https://ai.google.dev/gemma
- Qwen3 technical report: https://arxiv.org/abs/2505.09388
- Qwen3-Coder-Next technical report: https://arxiv.org/abs/2603.00729
- Hosted open-weight service measurement: https://arxiv.org/abs/2605.02821
- Artificial Analysis open-source model comparison: https://artificialanalysis.ai/models/open-source

## Next Implementation Step

Before adding more models to `packages/contracts/types/src/models.json`, create a model-provider sync task that records:

- official source URL,
- source checked date,
- API model id,
- display name,
- provider,
- endpoint class,
- capabilities,
- context/output limits,
- pricing units,
- retention/privacy claim,
- deprecation date if any,
- local-runtime compatibility if any.

Then update the Desktop BYOK model selector to group providers by direct keys, open-model clouds, local runtimes, and managed beta.
